const Consultation = require("../Models/ConsultationModel");
const Patient = require("../Models/PatientModel");
const Prescription = require("../Models/PrescriptionModel");
const Doctor = require("../Models/DoctorModel");
const { asyncHandler } = require("../Utils/AsyncHandler");
const { logAudit } = require("../Utils/Audit");
const { generateUniqueCode, nextSequence } = require("../Utils/Sequence");
const { completeEntryInternal, sanitizeAttachments } = require("./QueueController");
const QueueEntry = require("../Models/QueueEntryModel");
const DoctorDrugPref = require("../Models/DoctorDrugPrefModel");
const { refreshDoctorSignature, signRead } = require("../Utils/S3");
const logger = require("../Utils/Logger");

// Remember each drug's regimen for this doctor so future prescriptions can
// auto-fill it. Best-effort — never blocks or fails the consultation save.
const learnDoctorRegimens = async (doctorId, medicines) => {
  if (!doctorId || !Array.isArray(medicines)) return;
  const ops = [];
  for (const m of medicines) {
    const drug = String(m?.drug || "").trim();
    if (!drug) continue;
    const dose = String(m?.dose || "").trim();
    const freq = String(m?.freq || "").trim();
    const days = String(m?.days || "").trim();
    const when = String(m?.when || "").trim();
    // Skip bare names with no regimen — nothing useful to remember.
    if (!dose && !freq && !days && !when) continue;
    ops.push({
      updateOne: {
        filter: { doctor: doctorId, drugLower: drug.toLowerCase() },
        update: { $set: { drug, dose, freq, days, when }, $inc: { count: 1 } },
        upsert: true,
      },
    });
  }
  if (ops.length === 0) return;
  try {
    await DoctorDrugPref.bulkWrite(ops, { ordered: false });
  } catch (e) {
    logger.warn(`learnDoctorRegimens failed: ${e.message}`);
  }
};

const actorInfo = (req) => ({
  actorType: req.doctor ? "doctor" : "staff",
  actorId: req.doctor?.id || req.staff?.id,
  actorEmail: req.doctor?.email || req.staff?.email,
});

const listConsultations = asyncHandler(async (req, res) => {
  const filter = { organization: req.orgId };
  if (req.query.patientId) filter.patient = req.query.patientId;
  if (req.query.doctorId) filter.doctor = req.query.doctorId;
  if (req.query.status) filter.status = req.query.status;
  if (req.query.from || req.query.to) {
    filter.visitDate = {};
    if (req.query.from) filter.visitDate.$gte = new Date(req.query.from);
    if (req.query.to) filter.visitDate.$lte = new Date(req.query.to);
  }

  const result = await Consultation.paginate(filter, {
    page: Number(req.query.page || 1),
    limit: Math.min(100, Number(req.query.limit || 20)),
    sort: { visitDate: -1 },
    populate: [
      { path: "patient", select: "name rxId phone age sex" },
      { path: "doctor", select: "name specialization" },
      { path: "prescription" },
    ],
  });

  res.status(200).json(result);
});

const getConsultation = asyncHandler(async (req, res) => {
  const consultation = await Consultation.findOne({ _id: req.params.consultationId, organization: req.orgId })
    .populate("patient")
    .populate("doctor", "name specialization email nmc qualifications fellowships designation signatureUrl signatureKey")
    .populate("prescription")
    .populate("organization");
  if (!consultation) return res.status(404).json({ message: "Consultation not found." });
  const consultationObj = consultation.toObject();
  consultationObj.doctor = await refreshDoctorSignature(consultationObj.doctor);
  // Regenerate the handwritten-body image URL from its stored S3 key so
  // reopening the consultation weeks later still shows the drawing.
  if (consultationObj.handwrittenBodyImageKey) {
    try {
      consultationObj.handwrittenBodyImageUrl = await signRead(consultationObj.handwrittenBodyImageKey);
    } catch {
      consultationObj.handwrittenBodyImageUrl = "";
    }
  }
  res.status(200).json({ consultation: consultationObj });
});

const createConsultation = asyncHandler(async (req, res) => {
  const {
    patientId, doctorId, visitDate,
    chiefComplaint, complaints, symptoms, diagnosis, examination,
    vitals, advice, notes, followUpDays, followUpDate,
    medicines, status, queueEntryId, attachments,
    handwrittenBodyHtml, handwrittenBodyImageKey,
  } = req.body || {};

  if (!patientId) return res.status(400).json({ message: "patientId is required." });

  const patient = await Patient.findOne({ _id: patientId, organization: req.orgId });
  if (!patient) return res.status(404).json({ message: "Patient not found in your organization." });

  const targetDoctorId = doctorId || req.doctor?.id || patient.assignedDoctor;
  if (!targetDoctorId) return res.status(400).json({ message: "doctorId is required." });

  const targetDoctor = await Doctor.findOne({
    _id: targetDoctorId,
    organization: req.orgId,
    active: true,
  }).select("name email");
  if (!targetDoctor)
    return res.status(404).json({ message: "Doctor not found in your organization." });

  const isStaff = !!req.staff;
  const wantsRx = Array.isArray(medicines) && medicines.length > 0;
  if (isStaff && wantsRx)
    return res.status(403).json({ message: "Staff cannot create prescriptions." });

  let finalAttachments = sanitizeAttachments(attachments);
  if (finalAttachments.length === 0 && queueEntryId) {
    const qe = await QueueEntry.findOne({ _id: queueEntryId, organization: req.orgId }).lean();
    if (qe?.attachments?.length) finalAttachments = sanitizeAttachments(qe.attachments);
  }

  const consultation = await Consultation.create({
    organization: req.orgId,
    patient: patient._id,
    doctor: targetDoctor._id,
    createdByStaff: req.staff?.id || null,
    visitDate: visitDate ? new Date(visitDate) : new Date(),
    chiefComplaint: chiefComplaint || "",
    complaints: Array.isArray(complaints) ? complaints : [],
    symptoms: Array.isArray(symptoms) ? symptoms : [],
    diagnosis: isStaff ? "" : diagnosis || "",
    examination: isStaff ? "" : examination || "",
    vitals: vitals || {},
    advice: isStaff ? "" : advice || "",
    notes: notes || "",
    followUpDays: followUpDays != null ? Number(followUpDays) : null,
    followUpDate: followUpDate ? new Date(followUpDate) : null,
    status: isStaff ? "scheduled" : status || "completed",
    attachments: finalAttachments,
    handwrittenBodyHtml: handwrittenBodyHtml || "",
    handwrittenBodyImageKey: handwrittenBodyImageKey || "",
  });

  let prescription = null;
  if (wantsRx) {
    const rxNumber = await nextSequence(req.orgId, "rxNumber", 3);
    prescription = await Prescription.create({
      organization: req.orgId,
      patient: patient._id,
      doctor: targetDoctor._id,
      consultation: consultation._id,
      rxNumber,
      diagnosis: diagnosis || "",
      symptoms: consultation.symptoms,
      medicines,
      advice: advice || "",
      followUpDays: consultation.followUpDays,
      followUpDate: consultation.followUpDate,
      createdBy: {
        userType: "doctor",
        userId: req.doctor.id,
        name: targetDoctor.name,
        email: targetDoctor.email,
      },
    });
    consultation.prescription = prescription._id;
    await consultation.save();
    await learnDoctorRegimens(targetDoctor._id, medicines);
  }

  patient.lastVisitAt = consultation.visitDate;
  patient.visitCount = (patient.visitCount || 0) + 1;
  if (vitals) patient.lastVitals = { ...patient.lastVitals?.toObject?.() || patient.lastVitals || {}, ...vitals };
  await patient.save();

  await logAudit({
    organization: req.orgId,
    ...actorInfo(req),
    action: "consultation.created",
    target: "Consultation",
    targetId: consultation._id,
    metadata: { patient: patient._id, diagnosis, hasPrescription: !!prescription },
    ip: req.ip,
  });

  if (queueEntryId) {
    await completeEntryInternal({
      orgId: req.orgId,
      entryId: queueEntryId,
      consultationId: consultation._id,
    });
  }

  res.status(201).json({ message: "Consultation saved.", consultation, prescription });
});

const updateConsultation = asyncHandler(async (req, res) => {
  const consultation = await Consultation.findOne({ _id: req.params.consultationId, organization: req.orgId });
  if (!consultation) return res.status(404).json({ message: "Consultation not found." });

  const fields = [
    "chiefComplaint", "complaints", "symptoms", "diagnosis", "examination", "vitals",
    "advice", "notes", "followUpDays", "followUpDate", "status", "visitDate",
    "handwrittenBodyHtml", "handwrittenBodyImageKey",
  ];
  for (const f of fields) if (req.body[f] !== undefined) consultation[f] = req.body[f];
  if (req.body.attachments !== undefined) {
    consultation.attachments = sanitizeAttachments(req.body.attachments);
  }
  await consultation.save();

  res.status(200).json({ message: "Consultation updated.", consultation });
});

const deleteConsultation = asyncHandler(async (req, res) => {
  const consultation = await Consultation.findOne({ _id: req.params.consultationId, organization: req.orgId });
  if (!consultation) return res.status(404).json({ message: "Consultation not found." });
  consultation.status = "cancelled";
  await consultation.save();
  res.status(200).json({ message: "Consultation cancelled." });
});

module.exports = {
  listConsultations,
  getConsultation,
  createConsultation,
  updateConsultation,
  deleteConsultation,
};
