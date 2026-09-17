const mongoose = require("mongoose");

// Global drug catalog used to power medication-name autocomplete.
// Names are stored as doctors expect to see them (Indian conventions, e.g.
// "Paracetamol" rather than the US "Acetaminophen"). `nameLower` backs a fast
// case-insensitive prefix search ("para" -> "Paracetamol").
const MedicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    nameLower: { type: String, required: true },
    generic: { type: String, default: "", trim: true },
    form: { type: String, default: "" }, // tablet, syrup, capsule, injection...
  },
  { timestamps: true }
);

MedicineSchema.index({ nameLower: 1 }, { unique: true });

module.exports = mongoose.model("Medicine", MedicineSchema);
