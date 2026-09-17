const AppointmentLead = require("../Models/AppointmentLeadModel");
const Patient = require("../Models/PatientModel");
const { asyncHandler } = require("../Utils/AsyncHandler");
const { logAudit } = require("../Utils/Audit");
const { generateUniqueCode, nextSequence } = require("../Utils/Sequence");
const { addToQueueInternal } = require("./QueueController");

// Pull only the demographic/contact fields we want to accept from the convert
// dialog. Anything else on the body is ignored so callers can't smuggle
// unexpected keys onto the patient document.
const pickPatientDetails = (body = {}) => {
  const out = {};
  const strFields = ["name", "phone", "email", "sex", "bloodGroup", "address", "notes"];
  for (const k of strFields) {
    if (typeof body[k] === "string" && body[k].trim()) out[k] = body[k].trim();
  }
  if (body.dob) {
    const d = new Date(body.dob);
    if (!Number.isNaN(d.getTime())) out.dob = d;
  }
  if (body.age !== undefined && body.age !== null && body.age !== "") {
    const n = Number(body.age);
    if (Number.isFinite(n) && n >= 0 && n <= 150) out.age = n;
  }
  return out;
};

const actorInfo = (req) => ({
  actorType: req.doctor ? "doctor" : "staff",
  actorId: req.doctor?.id || req.staff?.id,
  actorEmail: req.doctor?.email || req.staff?.email,
});

const actorMeta = (req) => ({
  byType: req.doctor ? "doctor" : "staff",
  byId: req.doctor?.id || req.staff?.id,
  byName: req.doctor?.name || req.staff?.name || "",
});

const listLeads = asyncHandler(async (req, res) => {
  const orgId = req.orgId;
  const filter = { organization: orgId };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.doctor) filter.preferredDoctor = req.query.doctor;
  if (req.query.search) {
    const re = new RegExp(req.query.search, "i");
    filter.$or = [{ name: re }, { phone: re }, { email: re }, { reason: re }];
  }
  if (req.query.from || req.query.to) {
    filter.preferredDate = {};
    if (req.query.from) filter.preferredDate.$gte = new Date(req.query.from);
    if (req.query.to) filter.preferredDate.$lte = new Date(req.query.to);
  }
  const result = await AppointmentLead.paginate(filter, {
    page: Number(req.query.page || 1),
    limit: Number(req.query.limit || 50),
    sort: { preferredDate: 1, createdAt: -1 },
    populate: [
      { path: "preferredDoctor", select: "name email specialization" },
      { path: "convertedPatientId", select: "name rxId" },
      { path: "existingPatient", select: "name rxId" },
    ],
  });
  res.json(result);
});

const createLead = asyncHandler(async (req, res) => {
  const {
    name, phone, email, preferredDate, preferredSlot,
    preferredDoctor, reason, source, notes, existingPatient,
  } = req.body || {};
  if (!name) return res.status(400).json({ message: "name is required." });
  if (!preferredDate) return res.status(400).json({ message: "preferredDate is required." });

  const meta = actorMeta(req);
  const lead = await AppointmentLead.create({
    organization: req.orgId,
    name, phone: phone || "", email: email || "",
    preferredDate: new Date(preferredDate),
    preferredSlot: preferredSlot || "",
    preferredDoctor: preferredDoctor || null,
    reason: reason || "",
    source: source || "phone",
    notes: notes || "",
    existingPatient: existingPatient || null,
    createdByType: meta.byType,
    createdById: meta.byId,
    createdByName: meta.byName,
  });

  await logAudit({
    organization: req.orgId,
    ...actorInfo(req),
    action: "followup.created",
    target: "AppointmentLead",
    targetId: lead._id,
    metadata: { name, phone },
    ip: req.ip,
  });

  res.status(201).json({ message: "Followup created.", lead });
});

const updateLead = asyncHandler(async (req, res) => {
  const lead = await AppointmentLead.findOne({ _id: req.params.id, organization: req.orgId });
  if (!lead) return res.status(404).json({ message: "Followup not found." });
  const editable = ["name", "phone", "email", "preferredDate", "preferredSlot", "preferredDoctor", "reason", "source", "notes", "existingPatient"];
  editable.forEach((k) => {
    if (k in (req.body || {})) {
      lead[k] = k === "preferredDate" && req.body[k] ? new Date(req.body[k]) : req.body[k];
    }
  });
  await lead.save();
  res.json({ message: "Updated.", lead });
});

const setStatus = (newStatus) => asyncHandler(async (req, res) => {
  const lead = await AppointmentLead.findOne({ _id: req.params.id, organization: req.orgId });
  if (!lead) return res.status(404).json({ message: "Followup not found." });
  if (lead.status === "converted")
    return res.status(409).json({ message: "Lead already converted to a patient." });
  lead.status = newStatus;
  lead.attempts.push({ ...actorMeta(req), outcome: newStatus, note: req.body?.note || "" });
  await lead.save();
  await logAudit({
    organization: req.orgId,
    ...actorInfo(req),
    action: `followup.${newStatus}`,
    target: "AppointmentLead",
    targetId: lead._id,
    ip: req.ip,
  });
  res.json({ message: `Marked ${newStatus}.`, lead });
});

const convertToPatient = asyncHandler(async (req, res) => {
  const lead = await AppointmentLead.findOne({ _id: req.params.id, organization: req.orgId });
  if (!lead) return res.status(404).json({ message: "Followup not found." });
  if (lead.status === "converted")
    return res.status(409).json({ message: "Already converted.", patientId: lead.convertedPatientId });

  // Details filled in the "Convert to patient" dialog — age, sex, dob, etc.
  // Empty/missing keys fall back to what's already on the lead.
  const details = pickPatientDetails(req.body || {});
  const addToQueue = req.body?.addToQueue === true;
  const queueDoctorId = req.body?.queueDoctorId || lead.preferredDoctor || req.doctor?.id || null;

  let patient = null;
  let patientId = lead.existingPatient || null;
  if (patientId) {
    // Existing patient — patch in only the fields that were blank so we don't
    // clobber good data with a half-filled convert dialog. `notes` is appended
    // rather than overwritten.
    patient = await Patient.findOne({ _id: patientId, organization: req.orgId });
    if (patient) {
      const patchable = ["name", "phone", "email", "sex", "bloodGroup", "address"];
      for (const k of patchable) {
        if (details[k] && !patient[k]) patient[k] = details[k];
      }
      if (details.dob && !patient.dob) patient.dob = details.dob;
      if (details.age != null && patient.age == null) patient.age = details.age;
      if (details.notes) {
        patient.notes = patient.notes ? `${patient.notes}\n${details.notes}` : details.notes;
      }
      await patient.save();
    }
  } else {
    const code = `RX-${await nextSequence(req.orgId, "rxId", 3)}`;
    patient = await Patient.create({
      organization: req.orgId,
      createdBy: req.doctor?.id || null,
      assignedDoctor: lead.preferredDoctor || req.doctor?.id || null,
      rxId: code,
      name: details.name || lead.name,
      phone: details.phone || lead.phone,
      email: details.email || lead.email,
      dob: details.dob || null,
      age: details.age != null ? details.age : null,
      sex: details.sex || "",
      bloodGroup: details.bloodGroup || "",
      address: details.address || "",
      notes: details.notes
        || (lead.reason ? `Converted from followup: ${lead.reason}` : "Converted from followup."),
    });
    patientId = patient._id;
  }

  lead.status = "converted";
  lead.convertedPatientId = patientId;
  lead.attempts.push({ ...actorMeta(req), outcome: "converted", note: "" });
  await lead.save();

  let queueEntry = null;
  if (addToQueue && patientId) {
    queueEntry = await addToQueueInternal({
      orgId: req.orgId,
      patientId,
      doctorId: queueDoctorId,
      notes: lead.reason || "",
      source: "walk_in",
      intakeVitals: {},
      req,
    });
  }

  await logAudit({
    organization: req.orgId,
    ...actorInfo(req),
    action: "followup.converted",
    target: "Patient",
    targetId: patientId,
    metadata: { leadId: lead._id, name: lead.name, addedToQueue: !!queueEntry },
    ip: req.ip,
  });

  res.status(200).json({
    message: "Converted to patient.",
    patientId,
    patient,
    lead,
    queueEntry: queueEntry ? { _id: queueEntry._id } : null,
  });
});

const deleteLead = asyncHandler(async (req, res) => {
  const lead = await AppointmentLead.findOneAndDelete({ _id: req.params.id, organization: req.orgId });
  if (!lead) return res.status(404).json({ message: "Followup not found." });
  await logAudit({
    organization: req.orgId,
    ...actorInfo(req),
    action: "followup.deleted",
    target: "AppointmentLead",
    targetId: lead._id,
    ip: req.ip,
  });
  res.json({ message: "Deleted." });
});

const stats = asyncHandler(async (req, res) => {
  const orgId = req.orgId;
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(); end.setHours(23, 59, 59, 999);
  const [today, upcoming, overdue, noShow] = await Promise.all([
    AppointmentLead.countDocuments({ organization: orgId, preferredDate: { $gte: start, $lte: end }, status: { $in: ["scheduled", "confirmed"] } }),
    AppointmentLead.countDocuments({ organization: orgId, preferredDate: { $gt: end }, status: { $in: ["scheduled", "confirmed"] } }),
    AppointmentLead.countDocuments({ organization: orgId, preferredDate: { $lt: start }, status: { $in: ["scheduled", "confirmed"] } }),
    AppointmentLead.countDocuments({ organization: orgId, status: "no_show" }),
  ]);
  res.json({ today, upcoming, overdue, noShow });
});

module.exports = {
  listLeads,
  createLead,
  updateLead,
  deleteLead,
  convertToPatient,
  markArrived: setStatus("arrived"),
  markNoShow: setStatus("no_show"),
  markCancelled: setStatus("cancelled"),
  markConfirmed: setStatus("confirmed"),
  markScheduled: setStatus("scheduled"),
  stats,
};
