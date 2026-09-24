const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const mongoosePaginate = require("mongoose-paginate-v2");

const DoctorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    number: {
      type: Number,
      required: true,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    nmc: {
      type: String,
      trim: true,
    },
    medicalCouncil: {
      type: String,
      trim: true,
      default: "",
    },
    specialization: {
      type: String,
      trim: true,
    },
    qualifications: {
      type: String,
      trim: true,
      default: "",
    },
    fellowships: {
      type: String,
      trim: true,
      default: "",
    },
    designation: {
      type: String,
      trim: true,
      default: "",
    },
    signatureUrl: {
      type: String,
      trim: true,
      default: "",
    },
    // Cloudinary asset key used to regenerate the signature URL when a doctor is read.
    signatureKey: {
      type: String,
      trim: true,
      default: "",
    },
    licenseFile: {
      type: String,
      trim: true,
    },
    authorized: {
      type: Boolean,
      default: false,
    },
    nmcVerified: {
      type: Boolean,
      default: false,
    },
    nmcVerifiedAt: {
      type: Date,
      default: null,
    },
    nmcVerifiedName: {
      type: String,
      trim: true,
      default: "",
    },
    nmcVerificationMessage: {
      type: String,
      trim: true,
      default: "",
    },
    parentAdmin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    organization: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Organization",
      default: null,
    },
    orgRole: {
      type: String,
      enum: ["owner", "doctor"],
      default: "owner",
    },
    active: {
      type: Boolean,
      default: true,
    },
    activeSessionId: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

DoctorSchema.pre("save", async function preSave(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  return next();
});

DoctorSchema.methods.comparePassword = function comparePassword(candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

DoctorSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Doctor", DoctorSchema);
