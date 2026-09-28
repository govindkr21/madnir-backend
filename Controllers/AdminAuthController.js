const Admin = require("../Models/AdminModel");
const { signAdminToken } = require("../Utils/Tokens");
const { hashToken, getOtp } = require("../Utils/Sequence");
const { logAudit } = require("../Utils/Audit");
const { sendMail } = require("../Utils/Emails/Mailer");
const { otpEmail } = require("../Utils/Emails/Templates/Otp");
const logger = require("../Utils/Logger");

const otpStore = new Map();
const OTP_TTL_MS = 10 * 60 * 1000;

const ALLOW_OPEN_REGISTER = () =>
  String(process.env.ADMIN_OPEN_REGISTER || "auto").toLowerCase();

const registerAdmin = async (req, res, next) => {
  try {
    const { name, email, number, password, bootstrapKey } = req.body;
    if (!name || !email || !number || !password) {
      return res.status(400).json({ message: "name, email, number and password are required." });
    }

    const mode = ALLOW_OPEN_REGISTER();
    const adminCount = await Admin.countDocuments();

    if (mode === "off") {
      return res.status(403).json({ message: "Admin registration is disabled. Contact a super admin." });
    }
    if (mode === "key") {
      const requiredKey = process.env.ADMIN_BOOTSTRAP_KEY || "";
      if (!requiredKey || bootstrapKey !== requiredKey)
        return res.status(403).json({ message: "Valid bootstrap key required." });
    }
    if (mode === "auto" && adminCount > 0) {
      return res.status(403).json({
        message: "Admin already exists. Open registration is disabled. Contact existing admin or use bootstrap key.",
      });
    }

    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(409).json({ message: "Admin with this email already exists." });
    }

    const admin = await Admin.create({ name, email, number, password });
    const token = signAdminToken(admin);

    await logAudit({
      actorType: "admin",
      actorId: admin._id,
      actorEmail: admin.email,
      action: "admin.registered",
      target: "Admin",
      targetId: admin._id,
      metadata: { bootstrap: adminCount === 0 },
      ip: req.ip,
    });

    return res.status(201).json({
      message: "Admin registered successfully.",
      token,
      admin: { id: admin._id, name: admin.name, email: admin.email, number: admin.number },
    });
  } catch (error) {
    return next(error);
  }
};

const createAdminByAdmin = async (req, res, next) => {
  try {
    const { name, email, number, password } = req.body;
    if (!name || !email || !number || !password)
      return res.status(400).json({ message: "name, email, number and password are required." });

    const exists = await Admin.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: "Admin with this email already exists." });

    const admin = await Admin.create({ name, email, number, password });

    await logAudit({
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      action: "admin.created",
      target: "Admin",
      targetId: admin._id,
      ip: req.ip,
    });

    return res.status(201).json({
      message: "Admin created.",
      admin: { id: admin._id, name: admin.name, email: admin.email, number: admin.number },
    });
  } catch (error) {
    return next(error);
  }
};

const loginAdmin = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "email and password are required." });

    const admin = await Admin.findOne({ email: email.toLowerCase() });
    if (!admin) return res.status(401).json({ message: "Invalid credentials." });

    const passwordMatch = await admin.comparePassword(password);
    if (!passwordMatch) return res.status(401).json({ message: "Invalid credentials." });

    const token = signAdminToken(admin);
    return res.status(200).json({
      message: "Login successful.",
      token,
      admin: { id: admin._id, name: admin.name, email: admin.email, number: admin.number },
    });
  } catch (error) {
    return next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ message: "email is required." });

    const normalized = String(email).toLowerCase();
    const admin = await Admin.findOne({ email: normalized });
    if (admin) {
      const otp = getOtp(6);
      otpStore.set(normalized, { hash: hashToken(otp), expiresAt: Date.now() + OTP_TTL_MS });
      logger.info(`Password reset OTP issued for admin ${admin.email}`);

      const mail = otpEmail({
        recipientName: admin.name || "Admin",
        otp,
        purpose: "password reset",
        actorRole: "admin",
        ttlMinutes: Math.round(OTP_TTL_MS / 60000),
      });
      const result = await sendMail({ to: admin.email, ...mail });
      if (!result.ok) {
        logger.warn(`Forgot-password email failed for admin ${admin.email}: ${result.error}`);
      }
    }
    return res.status(200).json({
      message: "If the email is registered, an OTP has been sent.",
    });
  } catch (error) {
    return next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const { email, otp, newPassword } = req.body || {};
    if (!email || !otp || !newPassword)
      return res.status(400).json({ message: "email, otp and newPassword are required." });
    if (String(newPassword).length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters." });

    const normalized = String(email).toLowerCase();
    const entry = otpStore.get(normalized);
    if (!entry) return res.status(400).json({ message: "No OTP requested for this email." });
    if (entry.expiresAt < Date.now()) {
      otpStore.delete(normalized);
      return res.status(410).json({ message: "OTP expired. Request a new one." });
    }
    if (entry.hash !== hashToken(String(otp).trim()))
      return res.status(400).json({ message: "Invalid OTP." });

    const admin = await Admin.findOne({ email: normalized });
    if (!admin) {
      otpStore.delete(normalized);
      return res.status(404).json({ message: "Admin not found." });
    }

    admin.password = newPassword;
    await admin.save();
    otpStore.delete(normalized);

    await logAudit({
      actorType: "admin",
      actorId: admin._id,
      actorEmail: admin.email,
      action: "admin.password.reset",
      target: "Admin",
      targetId: admin._id,
      ip: req.ip,
    });

    return res.status(200).json({ message: "Password reset successful." });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  registerAdmin,
  createAdminByAdmin,
  loginAdmin,
  forgotPassword,
  resetPassword,
};
