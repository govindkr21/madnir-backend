const Doctor = require("../Models/DoctorModel");
const Organization = require("../Models/OrganizationModel");
const { signDoctorToken, newSessionId } = require("../Utils/Tokens");
const { logAudit } = require("../Utils/Audit");
const { hashToken, getOtp } = require("../Utils/Sequence");
const { sendMail } = require("../Utils/Emails/Mailer");
const { otpEmail } = require("../Utils/Emails/Templates/Otp");
const { resolveSupportContact } = require("../Middlewares/Auth");
const { verifyNmc } = require("../Utils/VerifyNmc");
const { refreshDoctorSignature } = require("../Utils/Cloudinary");
const logger = require("../Utils/Logger");

const otpStore = new Map();
const OTP_TTL_MS = 10 * 60 * 1000;

const slugify = (s) =>
  String(s || "org")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "org";

const uniqueSlug = async (base) => {
  let slug = slugify(base);
  let n = 0;
  while (await Organization.findOne({ slug })) {
    n += 1;
    slug = `${slugify(base)}-${n}`;
  }
  return slug;
};

const registerDoctor = async (req, res, next) => {
  try {
    const {
      name, email, number, password,
      nmc, medicalCouncil, specialization, licenseFile,
      qualifications, fellowships, designation, signatureUrl, signatureKey,
      organizationName, address,
    } = req.body;

    const phoneNum =
      typeof number === "number" && Number.isFinite(number)
        ? number
        : Number(String(number ?? "").replace(/\D/g, ""));

    if (!name || !email || !password)
      return res.status(400).json({ message: "name, email, number and password are required." });
    if (!Number.isFinite(phoneNum) || phoneNum <= 0)
      return res.status(400).json({ message: "Valid phone number is required." });
    if (!medicalCouncil || !String(medicalCouncil).trim())
      return res.status(400).json({ message: "State Medical Council is required." });
    if (!nmc || !String(nmc).trim())
      return res.status(400).json({ message: "NMC / Registration number is required." });
    const addr = address || {};
    if (!addr.line1 || !addr.city || !addr.state || !addr.postalCode)
      return res.status(400).json({ message: "Full clinic address (line, city, state, postal code) is required." });

    const existingDoctor = await Doctor.findOne({ email: email.toLowerCase() });
    if (existingDoctor)
      return res.status(409).json({ message: "Doctor with this email already exists." });

    const verification = await verifyNmc({ nmc, medicalCouncil });
    if (!verification.verified && verification.reachable && (verification.badInput || verification.found === false)) {
      return res.status(400).json({
        message: verification.message,
        verification: { verified: false, reachable: true },
      });
    }

    const orgName = organizationName || `${name}'s Practice`;
    const slug = await uniqueSlug(orgName);
    const organization = await Organization.create({
      name: orgName,
      slug,
      type: "solo",
      contactEmail: email.toLowerCase(),
      contactNumber: String(phoneNum),
      status: "active",
      address: {
        line1: addr.line1 || "",
        line2: addr.line2 || "",
        city: addr.city || "",
        state: addr.state || "",
        postalCode: addr.postalCode || "",
        country: addr.country || "India",
      },
    });

    const doctor = await Doctor.create({
      name, email, number: phoneNum, password,
      nmc, medicalCouncil: medicalCouncil || "", specialization, licenseFile,
      qualifications: qualifications || "",
      fellowships: fellowships || "",
      designation: designation || "",
      signatureUrl: signatureUrl || "",
      signatureKey: signatureKey || "",
      authorized: false,
      nmcVerified: verification.verified,
      nmcVerifiedAt: verification.verified ? new Date() : null,
      nmcVerifiedName: verification.verified ? verification.data.doctorName || "" : "",
      nmcVerificationMessage: verification.verified ? "" : verification.message || "",
      organization: organization._id,
      orgRole: "owner",
    });

    organization.ownerDoctor = doctor._id;
    await organization.save();

    await logAudit({
      organization: organization._id,
      actorType: "doctor",
      actorId: doctor._id,
      actorEmail: doctor.email,
      action: "org.created",
      target: "Organization",
      targetId: organization._id,
      ip: req.ip,
    });

    return res.status(201).json({
      message: verification.verified
        ? "Doctor and organization registered. Waiting for admin authorization."
        : "Doctor and organization registered, but NMC verification could not be completed. Waiting for admin authorization.",
      doctor: {
        id: doctor._id, name: doctor.name, email: doctor.email,
        number: doctor.number, authorized: doctor.authorized, orgRole: doctor.orgRole,
        nmcVerified: doctor.nmcVerified,
      },
      organization: {
        id: organization._id, name: organization.name, slug: organization.slug, type: organization.type,
        expiryDate: organization.expiryDate, maxDoctors: organization.maxDoctors, maxStaff: organization.maxStaff,
      },
      verification: {
        verified: verification.verified,
        reachable: verification.reachable,
        message: verification.message || null,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const loginDoctor = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ message: "email and password are required." });

    const doctor = await Doctor.findOne({ email: email.toLowerCase() }).populate(
      "parentAdmin", "name email"
    );
    if (!doctor) return res.status(401).json({ message: "Invalid credentials." });

    const passwordMatch = await doctor.comparePassword(password);
    if (!passwordMatch) return res.status(401).json({ message: "Invalid credentials." });

    if (!doctor.authorized) {
      const sid = newSessionId();
      doctor.activeSessionId = sid;
      await doctor.save();
      const pendingToken = signDoctorToken(doctor, { sid });
      return res.status(200).json({
        message: "Account is awaiting admin approval. You can review or update your details below.",
        authorized: false,
        pending: true,
        token: pendingToken,
        doctor: {
          id: doctor._id, name: doctor.name, email: doctor.email,
          number: doctor.number, authorized: doctor.authorized, orgRole: doctor.orgRole,
        },
      });
    }
    if (!doctor.active)
      return res.status(403).json({ message: "Account is deactivated. Contact your organization owner." });

    const organization = doctor.organization ? await Organization.findById(doctor.organization) : null;
    if (organization?.status === "suspended") {
      return res.status(403).json({
        message: "This organization is suspended. Contact the platform administrator.",
        reason: "organization_suspended",
      });
    }

    const sid = newSessionId();
    doctor.activeSessionId = sid;
    await doctor.save();
    const token = signDoctorToken(doctor, { sid });

    return res.status(200).json({
      message: "Doctor login successful.",
      token,
      doctor: {
        id: doctor._id, name: doctor.name, email: doctor.email,
        number: doctor.number, authorized: doctor.authorized, orgRole: doctor.orgRole,
      },
      organization: organization
        ? {
            id: organization._id,
            name: organization.name,
            slug: organization.slug,
            type: organization.type,
            status: organization.status,
            expiryDate: organization.expiryDate,
            expired: organization.isExpired(),
            maxDoctors: organization.maxDoctors,
            maxStaff: organization.maxStaff,
            supportContact: resolveSupportContact(organization),
          }
        : null,
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
    const doctor = await Doctor.findOne({ email: normalized });
    if (doctor) {
      const otp = getOtp(6);
      otpStore.set(normalized, { hash: hashToken(otp), expiresAt: Date.now() + OTP_TTL_MS });
      logger.info(`Password reset OTP issued for doctor ${doctor.email}`);

      const mail = otpEmail({
        recipientName: doctor.name || "Doctor",
        otp,
        purpose: "password reset",
        actorRole: "doctor",
        ttlMinutes: Math.round(OTP_TTL_MS / 60000),
      });
      const result = await sendMail({ to: doctor.email, ...mail });
      if (!result.ok) {
        logger.warn(`Forgot-password email failed for doctor ${doctor.email}: ${result.error}`);
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

    const doctor = await Doctor.findOne({ email: normalized });
    if (!doctor) {
      otpStore.delete(normalized);
      return res.status(404).json({ message: "Doctor not found." });
    }

    doctor.password = newPassword;
    doctor.activeSessionId = newSessionId();
    await doctor.save();
    otpStore.delete(normalized);

    await logAudit({
      organization: doctor.organization,
      actorType: "doctor",
      actorId: doctor._id,
      actorEmail: doctor.email,
      action: "doctor.password.reset",
      target: "Doctor",
      targetId: doctor._id,
      ip: req.ip,
    });

    return res.status(200).json({ message: "Password reset successful. You can now log in." });
  } catch (error) {
    return next(error);
  }
};

const PENDING_FIELDS = ["name", "number", "nmc", "medicalCouncil", "specialization", "qualifications", "fellowships", "designation", "signatureUrl", "signatureKey"];

const getPendingProfile = async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.doctor.id).select("-password -activeSessionId");
    if (!doctor) return res.status(404).json({ message: "Doctor not found." });
    const organization = doctor.organization
      ? await Organization.findById(doctor.organization).select("name slug type contactEmail")
      : null;
    return res.status(200).json({ doctor: await refreshDoctorSignature(doctor), organization });
  } catch (e) { return next(e); }
};

const updatePendingProfile = async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.doctor.id);
    if (!doctor) return res.status(404).json({ message: "Doctor not found." });
    if (doctor.authorized) {
      return res.status(409).json({ message: "Account already approved. Use the regular profile editor." });
    }
    PENDING_FIELDS.forEach((key) => {
      if (key in req.body) {
        const value = req.body[key];
        doctor[key] = key === "number" ? Number(String(value ?? "").replace(/\D/g, "")) || doctor.number : value;
      }
    });
    await doctor.save();
    const safe = await refreshDoctorSignature(doctor);
    delete safe.password;
    delete safe.activeSessionId;
    return res.status(200).json({ message: "Details updated. They'll be visible to the admin reviewer.", doctor: safe });
  } catch (e) { return next(e); }
};

module.exports = { registerDoctor, loginDoctor, forgotPassword, resetPassword, getPendingProfile, updatePendingProfile };
