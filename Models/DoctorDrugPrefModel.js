const mongoose = require("mongoose");

// Per-doctor remembered regimen for a drug. Every time a doctor prescribes a
// medicine, we record the dose/freq/days/when they chose, so the next time
// they add that drug the row can auto-fill with their own last choice.
const DoctorDrugPrefSchema = new mongoose.Schema(
  {
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true, index: true },
    drugLower: { type: String, required: true },
    drug: { type: String, required: true, trim: true },
    dose: { type: String, default: "" },
    freq: { type: String, default: "" },
    days: { type: String, default: "" },
    when: { type: String, default: "" },
    count: { type: Number, default: 1 },
  },
  { timestamps: true }
);

// One remembered regimen per (doctor, drug).
DoctorDrugPrefSchema.index({ doctor: 1, drugLower: 1 }, { unique: true });

module.exports = mongoose.model("DoctorDrugPref", DoctorDrugPrefSchema);
