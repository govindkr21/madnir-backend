const mongoose = require("mongoose");

const QueueVitalsSchema = new mongoose.Schema(
  {
    bp: { type: String, default: "" },
    hr: { type: Number, default: null },
    spo2: { type: Number, default: null },
    temp: { type: String, default: "" },
    rr: { type: Number, default: null },
    weight: { type: String, default: "" },
  },
  { _id: false }
);

const AttachmentSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    name: { type: String, default: "" },
    mime: { type: String, default: "" },
    size: { type: Number, default: 0 },
    uploadedAt: { type: Date, default: () => new Date() },
  },
  { _id: false }
);

const QueueEntrySchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", default: null, index: true },
    source: { type: String, enum: ["walk_in", "scheduled"], default: "walk_in" },
    notes: { type: String, default: "" },
    intakeVitals: { type: QueueVitalsSchema, default: () => ({}) },
    attachments: { type: [AttachmentSchema], default: [] },
    status: {
      type: String,
      enum: ["waiting", "in_progress", "done", "cancelled"],
      default: "waiting",
      index: true,
    },
    visitDate: { type: Date, required: true, index: true },
    queuedAt: { type: Date, default: () => new Date() },
    consultation: { type: mongoose.Schema.Types.ObjectId, ref: "Consultation", default: null },
    createdByDoctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", default: null },
    createdByStaff: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", default: null },
  },
  { timestamps: true }
);

QueueEntrySchema.index({ organization: 1, visitDate: 1, status: 1 });

module.exports = mongoose.model("QueueEntry", QueueEntrySchema);
