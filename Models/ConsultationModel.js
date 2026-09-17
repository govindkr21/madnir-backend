const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const VitalsSchema = new mongoose.Schema(
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

const ConsultationSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    createdByStaff: { type: mongoose.Schema.Types.ObjectId, ref: "Staff", default: null },

    visitDate: { type: Date, default: () => new Date(), index: true },
    chiefComplaint: { type: String, default: "" },
    complaints: { type: [String], default: [] },
    symptoms: { type: [String], default: [] },
    diagnosis: { type: String, default: "" },
    examination: { type: String, default: "" },
    vitals: { type: VitalsSchema, default: () => ({}) },
    advice: { type: String, default: "" },
    notes: { type: String, default: "" },
    followUpDays: { type: Number, default: null, min: 0 },
    followUpDate: { type: Date, default: null },

    status: {
      type: String,
      enum: ["scheduled", "in_progress", "completed", "cancelled"],
      default: "completed",
      index: true,
    },
    prescription: { type: mongoose.Schema.Types.ObjectId, ref: "Prescription", default: null },
    attachments: { type: [AttachmentSchema], default: [] },

    // Notepad / Writing Pad consultations save the raw body content so it can
    // be re-rendered inside the letterhead when the consultation is opened
    // later from the patient timeline. Otherwise the sheet has nothing to
    // display since complaints/symptoms/medicines are all empty in these
    // modes.
    //   - notepad → `handwrittenBodyHtml` (sanitised HTML, kept in the DB)
    //   - writing pad → PNG uploaded to S3, referenced by `handwrittenBodyImageKey`;
    //     the URL is regenerated on read (same pattern as the doctor signature)
    handwrittenBodyHtml: { type: String, default: "" },
    handwrittenBodyImageKey: { type: String, default: "" },
  },
  { timestamps: true }
);

ConsultationSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Consultation", ConsultationSchema);
