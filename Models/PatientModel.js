const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const EmergencyContactSchema = new mongoose.Schema(
  {
    name: { type: String, default: "" },
    phone: { type: String, default: "" },
    relation: { type: String, default: "" },
  },
  { _id: false }
);

const VitalsSchema = new mongoose.Schema(
  {
    bp: { type: String, default: "" },
    hr: { type: Number, default: null },
    spo2: { type: Number, default: null },
    temp: { type: String, default: "" },
    height: { type: String, default: "" },
    weight: { type: String, default: "" },
  },
  { _id: false }
);

const PatientSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", default: null },
    assignedDoctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", default: null, index: true },

    rxId: { type: String, required: true, trim: true, uppercase: true, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: "", trim: true, index: true },
    email: { type: String, default: "", lowercase: true, trim: true },
    dob: { type: Date, default: null },
    age: { type: Number, default: null, min: 0, max: 150 },
    sex: { type: String, enum: ["Male", "Female", "Other", ""], default: "" },

    bloodGroup: { type: String, default: "", trim: true },
    allergies: { type: [String], default: [] },
    conditions: { type: [String], default: [] },
    notes: { type: String, default: "" },

    address: { type: String, default: "" },
    emergencyContact: { type: EmergencyContactSchema, default: () => ({}) },
    lastVitals: { type: VitalsSchema, default: () => ({}) },

    lastVisitAt: { type: Date, default: null },
    visitCount: { type: Number, default: 0, min: 0 },

    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true }
);

PatientSchema.index({ organization: 1, rxId: 1 }, { unique: true });
PatientSchema.index({ organization: 1, name: "text", phone: "text" });

PatientSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Patient", PatientSchema);
