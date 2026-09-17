const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const DEFAULT_TRIAL_DAYS = 30;
const defaultExpiry = () => new Date(Date.now() + DEFAULT_TRIAL_DAYS * 86400000);

const OrganizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    type: { type: String, enum: ["solo", "clinic", "enterprise"], default: "solo", index: true },
    ownerDoctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", default: null },
    contactEmail: { type: String, lowercase: true, trim: true },
    billingEmail: { type: String, default: "", lowercase: true, trim: true },
    contactNumber: { type: String, trim: true },
    address: {
      line1: { type: String, default: "", trim: true },
      line2: { type: String, default: "", trim: true },
      city: { type: String, default: "", trim: true },
      state: { type: String, default: "", trim: true },
      postalCode: { type: String, default: "", trim: true },
      country: { type: String, default: "India", trim: true },
    },
    logo: { type: String, default: "" },
    branding: {
      primaryColor: { type: String, default: "#006a61" },
      customDomain: { type: String, default: "" },
    },
    status: {
      type: String,
      enum: ["active", "suspended"],
      default: "active",
      index: true,
    },
    // Admin-controlled access window. When `expiryDate` is in the past, the org is treated as expired:
    // doctors/staff can still sign in and read, but mutating actions are blocked behind an "Renew with admin" popup.
    expiryDate: { type: Date, default: defaultExpiry, index: true },
    maxDoctors: { type: Number, default: 1, min: 1 },
    maxStaff: { type: Number, default: 2, min: 0 },
    // Shown in the renewal popup. Falls back to platform defaults if blank.
    supportContact: {
      name: { type: String, default: "" },
      email: { type: String, default: "", lowercase: true, trim: true },
      phone: { type: String, default: "" },
    },
    customSymptoms: { type: [String], default: [] },
    customDiagnoses: { type: [String], default: [] },
    customMedicines: { type: [String], default: [] },
    customDoses: { type: [String], default: [] },
    customFrequencies: { type: [String], default: [] },
    customDays: { type: [String], default: [] },
    customWhens: { type: [String], default: [] },
    customListsSeededVersion: { type: Number, default: 0 },
    prescriptionTemplate: {
      // Header
      headerDoctorMode: {
        type: String,
        enum: ["owner", "attending", "both"],
        default: "attending",
      },
      tagline: { type: String, default: "" },
      showLogo: { type: Boolean, default: true },
      logoSize: { type: String, enum: ["sm", "md", "lg"], default: "md" },
      headerDivider: { type: String, enum: ["none", "thin", "thick", "double"], default: "thick" },
      uppercaseClinicName: { type: Boolean, default: true },
      uppercaseDoctorNames: { type: Boolean, default: true },
      uppercaseMedicines: { type: Boolean, default: true },
      showRxSymbol: { type: Boolean, default: true },

      // Typography
      fontFamily: { type: String, enum: ["system", "serif", "mono"], default: "system" },
      baseFontSize: { type: Number, default: 12, min: 10, max: 16 },
      density: { type: String, enum: ["compact", "normal", "spacious"], default: "normal" },
      accentColor: { type: String, default: "#0F172A" },

      // Section visibility
      showVitals: { type: Boolean, default: true },
      showComplaints: { type: Boolean, default: true },
      showSymptoms: { type: Boolean, default: true },
      showDiagnosis: { type: Boolean, default: true },
      showAdvice: { type: Boolean, default: true },
      showSignature: { type: Boolean, default: true },

      // Footer
      footerText: { type: String, default: "" },
      // Legacy footer fields (kept for backward compatibility; new UI uses footerText only)
      footerNote: { type: String, default: "" },
      validForDays: { type: Number, default: 0 },
      validityLabel: { type: String, default: "Prescription valid for" },
      validityColor: { type: String, enum: ["red", "black"], default: "red" },
      footerLines: { type: [String], default: [] },
      signatureNote: { type: String, default: "" },
      showAddress: { type: Boolean, default: true },
      showAppointments: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

OrganizationSchema.methods.isExpired = function isExpired() {
  if (this.status === "suspended") return true;
  if (!this.expiryDate) return false;
  return new Date(this.expiryDate).getTime() <= Date.now();
};

OrganizationSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Organization", OrganizationSchema);
