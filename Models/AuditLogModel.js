const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");

const AuditLogSchema = new mongoose.Schema(
  {
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", default: null },
    actorType: { type: String, enum: ["admin", "doctor", "staff", "system"], default: "system" },
    actorId: { type: mongoose.Schema.Types.ObjectId, default: null },
    actorEmail: { type: String, default: "" },
    action: { type: String, required: true },
    target: { type: String, default: "" },
    targetId: { type: String, default: "" },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: "" },
  },
  { timestamps: true }
);

AuditLogSchema.plugin(mongoosePaginate);

module.exports = mongoose.model("AuditLog", AuditLogSchema);
