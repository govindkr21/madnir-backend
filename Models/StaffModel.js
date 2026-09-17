const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const mongoosePaginate = require("mongoose-paginate-v2");

const StaffSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    number: { type: String, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ["receptionist", "nurse", "assistant"], default: "receptionist" },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

StaffSchema.index({ organization: 1, email: 1 }, { unique: true });

StaffSchema.pre("save", async function preSave(next) {
  if (!this.isModified("password")) return next();
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
  return next();
});

StaffSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

StaffSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("Staff", StaffSchema);
