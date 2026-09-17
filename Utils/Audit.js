const AuditLog = require("../Models/AuditLogModel");

const logAudit = async ({ organization, actorType, actorId, actorEmail, action, target, targetId, metadata, ip }) => {
  try {
    await AuditLog.create({
      organization: organization || null,
      actorType: actorType || "system",
      actorId: actorId || null,
      actorEmail: actorEmail || "",
      action,
      target: target || "",
      targetId: targetId ? String(targetId) : "",
      metadata: metadata || {},
      ip: ip || "",
    });
  } catch (err) {
    console.warn("Audit log failed:", err.message);
  }
};

module.exports = { logAudit };
