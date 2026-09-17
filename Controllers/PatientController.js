const Patient = require("../Models/PatientModel");
const Consultation = require("../Models/ConsultationModel");
const Prescription = require("../Models/PrescriptionModel");
const QueueEntry = require("../Models/QueueEntryModel");
const { asyncHandler } = require("../Utils/AsyncHandler");
const { logAudit } = require("../Utils/Audit");
const { generateUniqueCode, nextSequence } = require("../Utils/Sequence");
const { addToQueueInternal } = require("./QueueController");

const actorInfo = (req) => ({
  actorType: req.doctor ? "doctor" : "staff",
  actorId: req.doctor?.id || req.staff?.id,
  actorEmail: req.doctor?.email || req.staff?.email,
});

const computeAge = (dob) => {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 31557600000);
};

const listPatients = asyncHandler(async (req, res) => {
  const orgId = req.orgId;
  const filter = { organization: orgId, active: req.query.active === "false" ? false : true };
  if (req.query.assignedDoctor) filter.assignedDoctor = req.query.assignedDoctor;

  if (req.query.search) {
    const re = new RegExp(String(req.query.search).trim(), "i");
    filter.$or = [{ name: re }, { phone: re }, { rxId: re }, { email: re }];
  }

  const result = await Patient.paginate(filter, {
    page: Number(req.query.page || 1),
    limit: Math.min(100, Number(req.query.limit || 20)),
    sort: { lastVisitAt: -1, createdAt: -1 },
    populate: { path: "assignedDoctor", select: "name specialization" },
  });

  res.status(200).json(result);
});

const getPatient = asyncHandler(async (req, res) => {
  const { patientId } = req.params;
  const lookup = patientId.match(/^[0-9a-fA-F]{24}$/)
    ? { _id: patientId }
    : { rxId: String(patientId).toUpperCase() };
  const patient = await Patient.findOne({ ...lookup, organization: req.orgId })
    .populate("assignedDoctor", "name specialization email")
    .populate("createdBy", "name email");
  if (!patient) return res.status(404).json({ message: "Patient not found." });

  const [consultations, prescriptions] = await Promise.all([
    Consultation.find({ patient: patient._id, organization: req.orgId })
      .sort({ visitDate: -1 })
      .limit(50)
      .populate("doctor", "name specialization")
      .populate("prescription"),
    Prescription.find({ patient: patient._id, organization: req.orgId })
      .sort({ createdAt: -1 })
      .limit(50)
      .populate("doctor", "name specialization"),
  ]);

  res.status(200).json({ patient, consultations, prescriptions });
});

const createPatient = asyncHandler(async (req, res) => {
  const {
    name, phone, email, dob, age, sex,
    bloodGroup, allergies, conditions, notes,
    address, emergencyContact, assignedDoctor,
    lastVitals, rxId, addToQueue, queueNotes, intakeVitals,
  } = req.body || {};

  if (!name) return res.status(400).json({ message: "name is required." });

  const orgId = req.orgId;
  const code = rxId
    ? String(rxId).toUpperCase()
    : `RX-${await nextSequence(orgId, "rxId", 3)}`;

  const duplicate = await Patient.findOne({ organization: orgId, rxId: code }).lean();
  if (duplicate) return res.status(409).json({ message: "Patient with this RX ID already exists." });

  const patient = await Patient.create({
    organization: orgId,
    createdBy: req.doctor?.id || null,
    assignedDoctor: assignedDoctor || req.doctor?.id || null,
    rxId: code,
    name,
    phone,
    email,
    dob: dob || null,
    age: age != null ? Number(age) : computeAge(dob),
    sex: sex || "",
    bloodGroup: bloodGroup || "",
    allergies: Array.isArray(allergies) ? allergies : [],
    conditions: Array.isArray(conditions) ? conditions : [],
    notes: notes || "",
    address: address || "",
    emergencyContact: emergencyContact || {},
    lastVitals: lastVitals || {},
  });

  await logAudit({
    organization: orgId,
    ...actorInfo(req),
    action: "patient.created",
    target: "Patient",
    targetId: patient._id,
    metadata: { rxId: patient.rxId, name: patient.name },
    ip: req.ip,
  });

  let queueEntry = null;
  if (addToQueue) {
    queueEntry = await addToQueueInternal({
      orgId,
      patientId: patient._id,
      doctorId: assignedDoctor || req.doctor?.id || null,
      notes: queueNotes || "",
      source: "walk_in",
      intakeVitals: intakeVitals || lastVitals || null,
      req,
    });
  }

  res.status(201).json({ message: "Patient created.", patient, queueEntry });
});

const updatePatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findOne({ _id: req.params.patientId, organization: req.orgId });
  if (!patient) return res.status(404).json({ message: "Patient not found." });

  const allowed = [
    "name", "phone", "email", "dob", "age", "sex",
    "bloodGroup", "allergies", "conditions", "notes",
    "address", "emergencyContact", "assignedDoctor", "lastVitals", "active",
  ];
  for (const key of allowed) {
    if (req.body[key] !== undefined) patient[key] = req.body[key];
  }
  if (req.body.dob && req.body.age == null) patient.age = computeAge(req.body.dob);

  await patient.save();

  await logAudit({
    organization: req.orgId,
    ...actorInfo(req),
    action: "patient.updated",
    target: "Patient",
    targetId: patient._id,
    ip: req.ip,
  });

  res.status(200).json({ message: "Patient updated.", patient });
});

const deletePatient = asyncHandler(async (req, res) => {
  const patient = await Patient.findOneAndDelete({ _id: req.params.patientId, organization: req.orgId });
  if (!patient) return res.status(404).json({ message: "Patient not found." });

  await logAudit({
    organization: req.orgId,
    ...actorInfo(req),
    action: "patient.deleted",
    target: "Patient",
    targetId: patient._id,
    ip: req.ip,
  });

  res.status(200).json({ message: "Patient deleted." });
});

module.exports = {
  listPatients,
  getPatient,
  createPatient,
  updatePatient,
  deletePatient,
};
