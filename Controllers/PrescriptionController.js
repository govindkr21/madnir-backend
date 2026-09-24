const Prescription = require("../Models/PrescriptionModel");
const Patient = require("../Models/PatientModel");
const Doctor = require("../Models/DoctorModel");
const { asyncHandler } = require("../Utils/AsyncHandler");
const { logAudit } = require("../Utils/Audit");
const { generateUniqueCode, nextSequence } = require("../Utils/Sequence");
const { refreshDoctorSignature, signRead } = require("../Utils/Cloudinary");

const actorInfo = (req) => ({
  actorType: req.doctor ? "doctor" : "staff",
  actorId: req.doctor?.id || req.staff?.id,
  actorEmail: req.doctor?.email || req.staff?.email,
});

const buildCreatedBy = async (req) => {
  if (req.doctor) {
    const doc = await Doctor.findById(req.doctor.id).select("name email").lean();
    return {
      userType: "doctor",
      userId: req.doctor.id,
      name: doc?.name || "",
      email: doc?.email || req.doctor.email || "",
    };
  }
  return null;
};

const listPrescriptions = asyncHandler(async (req, res) => {
  const filter = { organization: req.orgId };
  if (req.query.patientId) filter.patient = req.query.patientId;
  if (req.query.doctorId) filter.doctor = req.query.doctorId;
  if (req.query.search) {
    const re = new RegExp(String(req.query.search).trim(), "i");
    filter.$or = [{ rxNumber: re }, { diagnosis: re }];
  }

  const result = await Prescription.paginate(filter, {
    page: Number(req.query.page || 1),
    limit: Math.min(100, Number(req.query.limit || 20)),
    sort: { createdAt: -1 },
    populate: [
      { path: "patient", select: "name rxId phone age sex" },
      { path: "doctor", select: "name specialization" },
    ],
  });

  res.status(200).json(result);
});

const getPrescription = asyncHandler(async (req, res) => {
  const rx = await Prescription.findOne({ _id: req.params.prescriptionId, organization: req.orgId })
    .populate("patient")
    .populate("doctor", "name specialization email nmc qualifications fellowships designation signatureUrl signatureKey")
    .populate("consultation")
    .populate("organization");
  if (!rx) return res.status(404).json({ message: "Prescription not found." });
  const rxObj = rx.toObject();
  rxObj.doctor = await refreshDoctorSignature(rxObj.doctor);
  if (rxObj.consultation?.handwrittenBodyImageKey) {
    try {
      rxObj.consultation.handwrittenBodyImageUrl = await signRead(rxObj.consultation.handwrittenBodyImageKey);
    } catch {
      rxObj.consultation.handwrittenBodyImageUrl = "";
    }
  }
  res.status(200).json({ prescription: rxObj });
});

const createPrescription = asyncHandler(async (req, res) => {
  const { patientId, doctorId, consultationId, diagnosis, symptoms, medicines, advice, followUpDays, followUpDate } = req.body || {};
  if (!patientId) return res.status(400).json({ message: "patientId is required." });
  if (!Array.isArray(medicines) || medicines.length === 0)
    return res.status(400).json({ message: "At least one medicine is required." });

  const patient = await Patient.findOne({ _id: patientId, organization: req.orgId });
  if (!patient) return res.status(404).json({ message: "Patient not found." });

  const targetDoctorId = doctorId || req.doctor?.id;
  const targetDoctor = await Doctor.findOne({
    _id: targetDoctorId,
    organization: req.orgId,
    active: true,
  });
  if (!targetDoctor)
    return res.status(404).json({ message: "Doctor not found in your organization." });

  const rxNumber = await nextSequence(req.orgId, "rxNumber", 3);
  const createdBy = await buildCreatedBy(req);

  const rx = await Prescription.create({
    organization: req.orgId,
    patient: patient._id,
    doctor: targetDoctor._id,
    consultation: consultationId || null,
    rxNumber,
    diagnosis: diagnosis || "",
    symptoms: Array.isArray(symptoms) ? symptoms : [],
    medicines,
    advice: advice || "",
    followUpDays: followUpDays != null ? Number(followUpDays) : null,
    followUpDate: followUpDate ? new Date(followUpDate) : null,
    createdBy,
  });

  await logAudit({
    organization: req.orgId,
    ...actorInfo(req),
    action: "prescription.created",
    target: "Prescription",
    targetId: rx._id,
    metadata: { rxNumber, patient: patient._id, items: medicines.length },
    ip: req.ip,
  });

  res.status(201).json({ message: "Prescription created.", prescription: rx });
});

const updatePrescription = asyncHandler(async (req, res) => {
  const rx = await Prescription.findOne({ _id: req.params.prescriptionId, organization: req.orgId });
  if (!rx) return res.status(404).json({ message: "Prescription not found." });

  const fields = ["diagnosis", "symptoms", "medicines", "advice", "followUpDays", "followUpDate", "pdfUrl"];
  for (const f of fields) if (req.body[f] !== undefined) rx[f] = req.body[f];
  await rx.save();

  res.status(200).json({ message: "Prescription updated.", prescription: rx });
});

const markPrinted = asyncHandler(async (req, res) => {
  const rx = await Prescription.findOne({ _id: req.params.prescriptionId, organization: req.orgId });
  if (!rx) return res.status(404).json({ message: "Prescription not found." });
  rx.printedAt = new Date();
  await rx.save();
  res.status(200).json({ message: "Marked printed.", prescription: rx });
});

const deletePrescription = asyncHandler(async (req, res) => {
  const rx = await Prescription.findOneAndDelete({ _id: req.params.prescriptionId, organization: req.orgId });
  if (!rx) return res.status(404).json({ message: "Prescription not found." });
  res.status(200).json({ message: "Prescription deleted." });
});

module.exports = {
  listPrescriptions,
  getPrescription,
  createPrescription,
  updatePrescription,
  markPrinted,
  deletePrescription,
};
