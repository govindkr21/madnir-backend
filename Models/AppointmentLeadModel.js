const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const AppointmentLeadSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: "" },
    email: { type: String, lowercase: true, trim: true, default: "" },
    preferredDate: { type: Date, required: true, index: true },
    preferredSlot: { type: String, trim: true, default: "" }, // morning/afternoon/evening or HH:mm
    preferredDoctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", default: null, index: true },
    reason: { type: String, trim: true, default: "" },
    source: { type: String, enum: ["phone", "walk-in", "whatsapp", "referral", "other"], default: "phone" },
    status: {
      type: String,
      enum: ["scheduled", "confirmed", "arrived", "no_show", "cancelled", "converted"],
      default: "scheduled",
      index: true,
    },
    notes: { type: String, default: "" },
    existingPatient: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", default: null },
    convertedPatientId: { type: mongoose.Schema.Types.ObjectId, ref: "Patient", default: null },
    createdByType: { type: String, enum: ["doctor", "staff"], required: true },
    createdById: { type: mongoose.Schema.Types.ObjectId, required: true },
    createdByName: { type: String, default: "" },
    attempts: [{
      at: { type: Date, default: Date.now },
      byType: String,
      byId: mongoose.Schema.Types.ObjectId,
      byName: String,
      outcome: String,
      note: String,
    }],
  },
  { timestamps: true }
);

AppointmentLeadSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("AppointmentLead", AppointmentLeadSchema);
