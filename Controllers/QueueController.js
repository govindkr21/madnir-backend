const QueueEntry = require("../Models/QueueEntryModel");
const Patient = require("../Models/PatientModel");
const Doctor = require("../Models/DoctorModel");
const { asyncHandler } = require("../Utils/AsyncHandler");
const { logAudit } = require("../Utils/Audit");
const { createNotification } = require("./NotificationController");

const actorInfo = (req) => ({
  actorType: req.doctor ? "doctor" : "staff",
  actorId: req.doctor?.id || req.staff?.id,
  actorEmail: req.doctor?.email || req.staff?.email,
});

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const sanitizeVitals = (v) => {
  if (!v || typeof v !== "object") return {};
  const out = {};
  if (typeof v.bp === "string") out.bp = v.bp.trim();
  if (v.hr !== undefined && v.hr !== null && v.hr !== "") out.hr = Number(v.hr) || null;
  if (v.spo2 !== undefined && v.spo2 !== null && v.spo2 !== "") out.spo2 = Number(v.spo2) || null;
  if (typeof v.temp === "string") out.temp = v.temp.trim();
  if (v.rr !== undefined && v.rr !== null && v.rr !== "") out.rr = Number(v.rr) || null;
  if (typeof v.weight === "string") out.weight = v.weight.trim();
  return out;
};

const sanitizeAttachments = (arr) => {
  if (!Array.isArray(arr)) return [];
  return arr
    .map((a) => (a && typeof a === "object" ? a : null))
    .filter((a) => {
      if (!a || typeof a.url !== "string") return false;
      return a.url.startsWith("https://res.cloudinary.com/") || a.url.startsWith("/uploads/");
    })
    .map((a) => ({
      url: a.url,
      name: typeof a.name === "string" ? a.name.slice(0, 200) : "",
      mime: typeof a.mime === "string" ? a.mime.slice(0, 80) : "",
      size: Number.isFinite(Number(a.size)) ? Number(a.size) : 0,
      uploadedAt: a.uploadedAt ? new Date(a.uploadedAt) : new Date(),
    }));
};

const addToQueueInternal = async ({ orgId, patientId, doctorId, notes, source, intakeVitals, visitDate: requestedDate, req }) => {
  const effectiveSource = source || "walk_in";
  const visitDate = effectiveSource === "scheduled" && requestedDate
    ? startOfDay(new Date(requestedDate))
    : startOfDay();
  const vitals = sanitizeVitals(intakeVitals);
  const existing = await QueueEntry.findOne({
    organization: orgId,
    patient: patientId,
    visitDate,
    status: { $in: ["waiting", "in_progress"] },
  });
  if (existing) {
    if (Object.keys(vitals).length > 0) {
      existing.intakeVitals = { ...(existing.intakeVitals?.toObject?.() || existing.intakeVitals || {}), ...vitals };
      await existing.save();
    }
    return existing;
  }

  const entry = await QueueEntry.create({
    organization: orgId,
    patient: patientId,
    doctor: doctorId || req?.doctor?.id || null,
    source: effectiveSource,
    notes: notes || "",
    intakeVitals: vitals,
    status: "waiting",
    visitDate,
    createdByDoctor: req?.doctor?.id || null,
    createdByStaff: req?.staff?.id || null,
  });

  await logAudit({
    organization: orgId,
    actorType: req?.doctor ? "doctor" : "staff",
    actorId: req?.doctor?.id || req?.staff?.id,
    actorEmail: req?.doctor?.email || req?.staff?.email,
    action: "queue.added",
    target: "QueueEntry",
    targetId: entry._id,
    metadata: { patient: patientId },
    ip: req?.ip,
  });

  return entry;
};

const listQueue = asyncHandler(async (req, res) => {
  const status = req.query.status || "waiting";
  const filter = { organization: req.orgId };
  if (req.query.from || req.query.to) {
    const from = req.query.from ? startOfDay(new Date(req.query.from)) : startOfDay();
    const to = req.query.to ? endOfDay(new Date(req.query.to)) : endOfDay();
    filter.visitDate = { $gte: from, $lte: to };
  } else {
    const date = req.query.date ? new Date(req.query.date) : new Date();
    filter.visitDate = { $gte: startOfDay(date), $lte: endOfDay(date) };
  }
  if (status !== "all") filter.status = { $in: status.split(",") };

  const entries = await QueueEntry.find(filter)
    .sort({ visitDate: 1, queuedAt: 1 })
    .populate("patient", "name rxId phone age sex dob lastVitals")
    .populate("doctor", "name specialization")
    .lean();

  res.status(200).json({ entries });
});

const addToQueue = asyncHandler(async (req, res) => {
  const { patientId, doctorId, notes, source, intakeVitals, visitDate } = req.body || {};
  if (!patientId) return res.status(400).json({ message: "patientId is required." });

  const patient = await Patient.findOne({ _id: patientId, organization: req.orgId });
  if (!patient) return res.status(404).json({ message: "Patient not found in your organization." });

  if (doctorId) {
    const doctor = await Doctor.findOne({ _id: doctorId, organization: req.orgId, active: { $ne: false } }).select("_id");
    if (!doctor) return res.status(404).json({ message: "Doctor not found in your organization." });
  }

  const entry = await addToQueueInternal({
    orgId: req.orgId,
    patientId: patient._id,
    doctorId,
    notes,
    source,
    intakeVitals,
    visitDate,
    req,
  });

  const populated = await QueueEntry.findById(entry._id)
    .populate("patient", "name rxId phone age sex dob lastVitals")
    .populate("doctor", "name specialization")
    .lean();

  // Fire-and-forget notification — never blocks the response
  setImmediate(() => {
    createNotification({
      organizationId: req.orgId,
      type: "queue_new",
      title: `New patient in queue: ${patient.name}`,
      body: `${patient.name} has been added to today's queue.`,
      meta: {
        patientId: patient._id,
        queueEntryId: entry._id,
        patientName: patient.name,
      },
    }).catch(() => {});
  });

  res.status(201).json({ message: "Added to queue.", entry: populated });
});

const updateEntry = asyncHandler(async (req, res) => {
  const entry = await QueueEntry.findOne({ _id: req.params.entryId, organization: req.orgId });
  if (!entry) return res.status(404).json({ message: "Queue entry not found." });

  if (req.body.doctor !== undefined && req.body.doctor !== null) {
    const doctor = await Doctor.findOne({ _id: req.body.doctor, organization: req.orgId, active: { $ne: false } }).select("_id");
    if (!doctor) return res.status(404).json({ message: "Doctor not found in your organization." });
  }

  const fields = ["doctor", "notes", "status"];
  for (const f of fields) if (req.body[f] !== undefined) entry[f] = req.body[f];
  if (req.body.intakeVitals !== undefined) {
    const v = sanitizeVitals(req.body.intakeVitals);
    entry.intakeVitals = { ...(entry.intakeVitals?.toObject?.() || entry.intakeVitals || {}), ...v };
  }
  if (req.body.attachments !== undefined) {
    entry.attachments = sanitizeAttachments(req.body.attachments);
  }
  const wasStarted = req.body.status === "in_progress" && entry.status === "in_progress";
  await entry.save();

  // Fire notification when a consultation is started (status → in_progress)
  if (wasStarted) {
    const pop = await QueueEntry.findById(entry._id).populate("patient", "name").lean();
    const pName = pop?.patient?.name || "Patient";
    setImmediate(() => {
      createNotification({
        organizationId: req.orgId,
        type: "queue_started",
        title: `Consultation started: ${pName}`,
        body: `The consultation with ${pName} is now in progress.`,
        meta: { queueEntryId: entry._id, patientName: pName },
      }).catch(() => {});
    });
  }

  res.status(200).json({ message: "Queue entry updated.", entry });
});

const removeEntry = asyncHandler(async (req, res) => {
  const entry = await QueueEntry.findOne({ _id: req.params.entryId, organization: req.orgId });
  if (!entry) return res.status(404).json({ message: "Queue entry not found." });
  entry.status = "cancelled";
  await entry.save();

  await logAudit({
    organization: req.orgId,
    ...actorInfo(req),
    action: "queue.cancelled",
    target: "QueueEntry",
    targetId: entry._id,
    ip: req.ip,
  });

  res.status(200).json({ message: "Removed from queue." });
});

const completeEntryInternal = async ({ orgId, entryId, consultationId }) => {
  const entry = await QueueEntry.findOne({ _id: entryId, organization: orgId });
  if (!entry) return null;
  entry.status = "done";
  if (consultationId) entry.consultation = consultationId;
  await entry.save();
  return entry;
};

const completeEntry = asyncHandler(async (req, res) => {
  const entry = await completeEntryInternal({
    orgId: req.orgId,
    entryId: req.params.entryId,
    consultationId: req.body?.consultationId,
  });
  if (!entry) return res.status(404).json({ message: "Queue entry not found." });
  res.status(200).json({ message: "Queue entry completed.", entry });
});

module.exports = {
  listQueue,
  addToQueue,
  updateEntry,
  removeEntry,
  completeEntry,
  addToQueueInternal,
  completeEntryInternal,
  sanitizeAttachments,
};
