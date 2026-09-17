const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const CreatedBySchema = new mongoose.Schema(
  {
    userType: { type: String, enum: ["doctor", "staff", "admin"], required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
  },
  { _id: false }
);

const RxItemSchema = new mongoose.Schema(
  {
    drug: { type: String, required: true, trim: true },
    dose: { type: String, default: "" },
    freq: { type: String, default: "" },
    days: { type: String, default: "" },
    when: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { _id: false }
);

const PrescriptionSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", required: true, index: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    consultation: { type: mongoose.Schema.Types.ObjectId, ref: "Consultation", default: null, index: true },

    rxNumber: { type: String, required: true, trim: true, index: true },
    diagnosis: { type: String, default: "" },
    symptoms: { type: [String], default: [] },
    medicines: { type: [RxItemSchema], default: [] },
    advice: { type: String, default: "" },
    followUpDays: { type: Number, default: null, min: 0 },
    followUpDate: { type: Date, default: null },

    pdfUrl: { type: String, default: "" },
    printedAt: { type: Date, default: null },
    createdBy: { type: CreatedBySchema, required: true },
  },
  { timestamps: true }
);

PrescriptionSchema.index({ organization: 1, rxNumber: 1 }, { unique: true });

PrescriptionSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Prescription", PrescriptionSchema);
