const { verifyToken } = require("../Utils/Tokens");
const Organization = require("../Models/OrganizationModel");
const Doctor = require("../Models/DoctorModel");

const extractToken = (req) => {
  const authHeader = req.headers.authorization || "";
  return authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
};

const requireAdminAuth = (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ message: "Admin authentication token is required." });
    const payload = verifyToken(token);
    if (payload.role !== "admin")
      return res.status(403).json({ message: "Only admin can perform this action." });
    req.admin = payload;
    return next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

const requireDoctorAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token)
      return res.status(401).json({
        message: "Doctor authentication token is required.",
        reason: "no_token",
      });
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({
        message: "Session expired. Please sign in again.",
        reason: "token_invalid",
      });
    }
    if (payload.role !== "doctor")
      return res.status(403).json({
        message: "Only doctors can perform this action.",
        reason: "wrong_role",
      });
    const doctor = await Doctor.findById(payload.id).select(
      "authorized active organization orgRole email activeSessionId"
    );
    if (!doctor)
      return res.status(401).json({
        message: "Account no longer exists.",
        reason: "doctor_missing",
      });
    if (!doctor.authorized)
      return res.status(401).json({
        message: "Your account is awaiting admin approval.",
        reason: "unauthorized",
      });
    if (doctor.active === false)
      return res.status(401).json({
        message: "Account has been suspended.",
        reason: "suspended",
      });
    if (!payload.imp) {
      if (!payload.sid || !doctor.activeSessionId || payload.sid !== doctor.activeSessionId) {
        return res.status(401).json({
          message: "Signed in from another device. Please log in again.",
          reason: "session_superseded",
        });
      }
    }
    req.doctor = {
      ...payload,
      orgRole: doctor.orgRole || payload.orgRole,
      organization: doctor.organization || payload.organization,
      email: doctor.email || payload.email,
    };
    return next();
  } catch (error) {
    return next(error);
  }
};

const requireDoctorAuthAllowPending = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ message: "Doctor authentication token is required.", reason: "no_token" });
    let payload;
    try { payload = verifyToken(token); }
    catch { return res.status(401).json({ message: "Session expired. Please sign in again.", reason: "token_invalid" }); }
    if (payload.role !== "doctor")
      return res.status(403).json({ message: "Only doctors can perform this action.", reason: "wrong_role" });
    const doctor = await Doctor.findById(payload.id).select("authorized active organization orgRole email activeSessionId");
    if (!doctor) return res.status(401).json({ message: "Account no longer exists.", reason: "doctor_missing" });
    if (doctor.active === false)
      return res.status(401).json({ message: "Account has been suspended.", reason: "suspended" });
    if (!payload.imp) {
      if (!payload.sid || !doctor.activeSessionId || payload.sid !== doctor.activeSessionId) {
        return res.status(401).json({ message: "Signed in from another device. Please log in again.", reason: "session_superseded" });
      }
    }
    req.doctor = {
      ...payload,
      orgRole: doctor.orgRole || payload.orgRole,
      organization: doctor.organization || payload.organization,
      email: doctor.email || payload.email,
      authorized: doctor.authorized,
    };
    return next();
  } catch (error) { return next(error); }
};

const requireStaffAuth = (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ message: "Staff authentication token is required." });
    const payload = verifyToken(token);
    if (payload.role !== "staff")
      return res.status(403).json({ message: "Only staff can perform this action." });
    req.staff = payload;
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
};

const requireDoctorOrStaffAuth = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token)
      return res.status(401).json({
        message: "Authentication token is required.",
        reason: "no_token",
      });
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).json({
        message: "Session expired. Please sign in again.",
        reason: "token_invalid",
      });
    }

    if (payload.role === "doctor") {
      const doctor = await Doctor.findById(payload.id).select(
        "authorized active organization orgRole email activeSessionId"
      );
      if (!doctor)
        return res.status(401).json({ message: "Account no longer exists.", reason: "doctor_missing" });
      if (!doctor.authorized)
        return res.status(401).json({ message: "Your account is awaiting admin approval.", reason: "unauthorized" });
      if (doctor.active === false)
        return res.status(401).json({ message: "Account has been suspended.", reason: "suspended" });
      if (!payload.imp) {
        if (!payload.sid || !doctor.activeSessionId || payload.sid !== doctor.activeSessionId) {
          return res.status(401).json({
            message: "Signed in from another device. Please log in again.",
            reason: "session_superseded",
          });
        }
      }
      req.doctor = {
        ...payload,
        orgRole: doctor.orgRole || payload.orgRole,
        organization: doctor.organization || payload.organization,
        email: doctor.email || payload.email,
      };
      return next();
    }

    if (payload.role === "staff") {
      req.staff = payload;
      return next();
    }

    return res.status(403).json({ message: "Doctor or staff authentication required." });
  } catch (error) {
    return next(error);
  }
};

const requireOrgOwner = (req, res, next) => {
  if (!req.doctor) return res.status(401).json({ message: "Authentication required." });
  if (req.doctor.orgRole !== "owner")
    return res.status(403).json({ message: "Only organization owners can perform this action." });
  return next();
};

const attachOrgContext = async (req, res, next) => {
  try {
    const orgId = req.doctor?.organization || req.staff?.organization;
    if (!orgId) return res.status(400).json({ message: "Organization context missing." });
    const organization = await Organization.findById(orgId);
    if (!organization) return res.status(404).json({ message: "Organization not found." });
    req.organization = organization;
    req.orgId = orgId;
    req.orgExpired = organization.isExpired();
    return next();
  } catch (error) {
    return next(error);
  }
};

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Falls back to platform-wide PLATFORM_SUPPORT_* env vars when the org hasn't
// configured its own contact. Keeps the renewal popup useful out-of-the-box.
const resolveSupportContact = (org) => {
  const sc = org?.supportContact || {};
  return {
    name: sc.name || process.env.PLATFORM_SUPPORT_NAME || "RxMind Support",
    email: sc.email || process.env.PLATFORM_SUPPORT_EMAIL || "",
    phone: sc.phone || process.env.PLATFORM_SUPPORT_PHONE || "",
  };
};

// Allow doctors/staff to still log in and read everything after expiry,
// but block writes behind the "Renew with admin" popup on the frontend.
const blockIfExpired = (req, res, next) => {
  if (READ_METHODS.has(req.method)) return next();
  if (!req.orgExpired) return next();
  return res.status(402).json({
    message: "Organization access expired. Contact your admin to renew.",
    code: "org_expired",
    reason: "org_expired",
    expiryDate: req.organization?.expiryDate || null,
    supportContact: resolveSupportContact(req.organization),
  });
};

module.exports = {
  requireAdminAuth,
  requireDoctorAuth,
  requireDoctorAuthAllowPending,
  requireStaffAuth,
  requireDoctorOrStaffAuth,
  requireOrgOwner,
  attachOrgContext,
  blockIfExpired,
  resolveSupportContact,
};
