const crypto = require("crypto");
const Organization = require("../Models/OrganizationModel");
const Doctor = require("../Models/DoctorModel");
const Staff = require("../Models/StaffModel");
const Invite = require("../Models/InviteModel");
const { logAudit } = require("../Utils/Audit");
const { sendMail } = require("../Utils/Emails/Mailer");
const { inviteEmail } = require("../Utils/Emails/Templates/Invite");
const { verifyNmc } = require("../Utils/VerifyNmc");
const { refreshDoctorSignatures } = require("../Utils/S3");
const logger = require("../Utils/Logger");

const getOrgOverview = async (req, res, next) => {
  try {
    const org = req.organization;

    const [doctorCount, staffCount, pendingInvites] = await Promise.all([
      Doctor.countDocuments({ organization: org._id, active: true }),
      Staff.countDocuments({ organization: org._id, active: true }),
      Invite.countDocuments({ organization: org._id, accepted: false }),
    ]);

    return res.status(200).json({
      organization: org,
      expired: org.isExpired(),
      usage: {
        doctors: doctorCount,
        staff: staffCount,
        pendingInvites,
      },
      limits: {
        maxDoctors: org.maxDoctors,
        maxStaff: org.maxStaff,
      },
    });
  } catch (e) {
    return next(e);
  }
};

const updateOrgSettings = async (req, res, next) => {
  try {
    const { name, contactEmail, billingEmail, contactNumber, address, logo, branding, prescriptionTemplate } = req.body;
    const update = {
      ...(name && { name }),
      ...(contactEmail && { contactEmail }),
      ...(billingEmail != null && { billingEmail: String(billingEmail).toLowerCase().trim() }),
      ...(contactNumber && { contactNumber }),
      ...(logo != null && { logo }),
      ...(branding && { branding }),
    };
    if (address && typeof address === "object") {
      const allowed = ["line1", "line2", "city", "state", "postalCode", "country"];
      for (const k of allowed) {
        if (address[k] !== undefined) update[`address.${k}`] = String(address[k] || "").trim();
      }
    }
    if (prescriptionTemplate && typeof prescriptionTemplate === "object") {
      const t = prescriptionTemplate;
      const allowed = [
        // Header
        "headerDoctorMode", "tagline", "showLogo", "logoSize", "headerDivider",
        "uppercaseClinicName", "uppercaseDoctorNames", "uppercaseMedicines", "showRxSymbol",
        // Typography
        "fontFamily", "baseFontSize", "density", "accentColor",
        // Section visibility
        "showVitals", "showComplaints", "showSymptoms", "showDiagnosis", "showAdvice", "showSignature",
        // Footer
        "footerText",
        // Legacy footer fields (kept for back-compat)
        "footerNote", "validForDays", "validityLabel", "validityColor",
        "footerLines", "signatureNote", "showAddress", "showAppointments",
      ];
      for (const k of allowed) {
        if (t[k] !== undefined) update[`prescriptionTemplate.${k}`] = t[k];
      }
    }
    const org = await Organization.findByIdAndUpdate(
      req.doctor.organization,
      update,
      { new: true }
    );
    await logAudit({
      organization: org._id,
      actorType: "doctor",
      actorId: req.doctor.id,
      actorEmail: req.doctor.email,
      action: "org.updated",
      target: "Organization",
      targetId: org._id,
      ip: req.ip,
    });
    return res.status(200).json({ message: "Organization updated.", organization: org });
  } catch (e) {
    return next(e);
  }
};

const listDoctorsInOrg = async (req, res, next) => {
  try {
    const filter = { organization: req.doctor.organization };
    if (req.query.includeInactive !== "true") filter.active = { $ne: false };
    const result = await Doctor.paginate(filter, {
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 20),
      sort: { createdAt: -1 },
      select: "-password",
    });
    result.docs = await refreshDoctorSignatures(result.docs);
    return res.status(200).json(result);
  } catch (e) {
    return next(e);
  }
};

const inviteDoctor = async (req, res, next) => {
  try {
    const { email, role } = req.body;
    if (!email) return res.status(400).json({ message: "email is required." });

    const maxDoctors = req.organization.maxDoctors;
    const current = await Doctor.countDocuments({ organization: req.doctor.organization, active: true });
    if (maxDoctors && current >= maxDoctors)
      return res.status(409).json({
        message: `Doctor limit reached (${current}/${maxDoctors}). Ask the platform admin to raise this organization's doctor limit.`,
        code: "doctor_limit_reached",
        current,
        max: maxDoctors,
      });

    const token = crypto.randomBytes(24).toString("hex");
    const invite = await Invite.create({
      organization: req.doctor.organization,
      email: email.toLowerCase(),
      role: role === "staff" ? "staff" : "doctor",
      token,
      invitedBy: req.doctor.id,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    });

    await logAudit({
      organization: req.doctor.organization,
      actorType: "doctor",
      actorId: req.doctor.id,
      actorEmail: req.doctor.email,
      action: "doctor.invited",
      target: "Invite",
      targetId: invite._id,
      metadata: { email, role: invite.role },
      ip: req.ip,
    });

    const inviteUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/accept-invite?token=${token}`;

    const mail = inviteEmail({
      inviteeEmail: invite.email,
      inviteUrl,
      inviterName: req.doctor.name || req.doctor.email,
      organizationName: req.organization?.name || "your organization",
      role: invite.role,
      expiresAt: invite.expiresAt,
    });
    sendMail({ to: invite.email, ...mail }).catch((err) =>
      logger.warn(`Invite email failed for ${invite.email}: ${err.message}`)
    );

    return res.status(201).json({ message: "Invite created.", invite, inviteUrl });
  } catch (e) {
    return next(e);
  }
};

const listInvites = async (req, res, next) => {
  try {
    const invites = await Invite.find({ organization: req.doctor.organization }).sort({ createdAt: -1 }).limit(100);
    return res.status(200).json({ invites });
  } catch (e) {
    return next(e);
  }
};

const revokeInvite = async (req, res, next) => {
  try {
    const { inviteId } = req.params;
    await Invite.findOneAndDelete({ _id: inviteId, organization: req.doctor.organization });
    return res.status(200).json({ message: "Invite revoked." });
  } catch (e) {
    return next(e);
  }
};

const resendInvite = async (req, res, next) => {
  try {
    const { inviteId } = req.params;
    const invite = await Invite.findOne({ _id: inviteId, organization: req.doctor.organization });
    if (!invite) return res.status(404).json({ message: "Invite not found." });
    if (invite.accepted) return res.status(400).json({ message: "Invite already accepted." });

    invite.token = crypto.randomBytes(24).toString("hex");
    invite.expiresAt = new Date(Date.now() + 7 * 86400000);
    await invite.save();

    const inviteUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/accept-invite?token=${invite.token}`;
    await logAudit({
      organization: req.doctor.organization,
      actorType: "doctor",
      actorId: req.doctor.id,
      actorEmail: req.doctor.email,
      action: "invite.resent",
      target: "Invite",
      targetId: invite._id,
      ip: req.ip,
    });

    const mail = inviteEmail({
      inviteeEmail: invite.email,
      inviteUrl,
      inviterName: req.doctor.name || req.doctor.email,
      organizationName: req.organization?.name || "your organization",
      role: invite.role,
      expiresAt: invite.expiresAt,
    });
    sendMail({ to: invite.email, ...mail }).catch((err) =>
      logger.warn(`Resend invite email failed for ${invite.email}: ${err.message}`)
    );

    return res.status(200).json({ message: "Invite refreshed.", invite, inviteUrl });
  } catch (e) {
    return next(e);
  }
};

const acceptInvite = async (req, res, next) => {
  try {
    const {
      token, name, password, number,
      nmc, medicalCouncil, specialization, qualifications, fellowships, designation, signatureUrl, signatureKey,
    } = req.body;
    if (!token || !name || !password)
      return res.status(400).json({ message: "token, name and password are required." });

    const invite = await Invite.findOne({ token, accepted: false });
    if (!invite) return res.status(404).json({ message: "Invalid or used invite." });
    if (invite.expiresAt < new Date())
      return res.status(410).json({ message: "Invite expired." });

    const phoneNum = Number(String(number ?? "").replace(/\D/g, "")) || 0;
    const existing = await Doctor.findOne({ email: invite.email });
    if (existing) return res.status(409).json({ message: "Email already registered." });

    if (!nmc || !String(nmc).trim() || !medicalCouncil || !String(medicalCouncil).trim()) {
      return res.status(400).json({
        message: "NMC / Registration number and State Medical Council are required for verification.",
      });
    }

    const verification = await verifyNmc({ nmc, medicalCouncil });
    if (!verification.verified && verification.reachable && (verification.badInput || verification.found === false)) {
      return res.status(400).json({
        message: verification.message,
        verification: { verified: false, reachable: true },
      });
    }

    const doctor = await Doctor.create({
      name,
      email: invite.email,
      number: phoneNum,
      password,
      nmc: nmc || "",
      medicalCouncil: medicalCouncil || "",
      specialization: specialization || "",
      qualifications: qualifications || "",
      fellowships: fellowships || "",
      designation: designation || "",
      signatureUrl: signatureUrl || "",
      signatureKey: signatureKey || "",
      authorized: verification.verified,
      nmcVerified: verification.verified,
      nmcVerifiedAt: verification.verified ? new Date() : null,
      nmcVerifiedName: verification.verified ? verification.data.doctorName || "" : "",
      nmcVerificationMessage: verification.verified ? "" : verification.message || "",
      organization: invite.organization,
      orgRole: "doctor",
    });

    invite.accepted = true;
    await invite.save();

    await logAudit({
      organization: invite.organization,
      actorType: "doctor",
      actorId: doctor._id,
      actorEmail: doctor.email,
      action: "invite.accepted",
      target: "Doctor",
      targetId: doctor._id,
      ip: req.ip,
    });

    return res.status(201).json({
      message: verification.verified
        ? "Invite accepted. You can now log in."
        : "Invite accepted. NMC verification could not be completed; an admin will need to authorize your account.",
      doctor: {
        id: doctor._id,
        email: doctor.email,
        name: doctor.name,
        nmcVerified: doctor.nmcVerified,
      },
      verification: {
        verified: verification.verified,
        reachable: verification.reachable,
        message: verification.message || null,
      },
    });
  } catch (e) {
    return next(e);
  }
};

const removeDoctor = async (req, res, next) => {
  try {
    const { doctorId } = req.params;
    if (String(doctorId) === String(req.doctor.id))
      return res.status(400).json({ message: "You cannot remove yourself." });
    const doctor = await Doctor.findOne({ _id: doctorId, organization: req.doctor.organization });
    if (!doctor) return res.status(404).json({ message: "Doctor not found in your organization." });
    if (doctor.orgRole === "owner")
      return res.status(400).json({ message: "Cannot remove the organization owner." });
    doctor.active = false;
    await doctor.save();
    await logAudit({
      organization: req.doctor.organization,
      actorType: "doctor",
      actorId: req.doctor.id,
      actorEmail: req.doctor.email,
      action: "doctor.removed",
      target: "Doctor",
      targetId: doctor._id,
      ip: req.ip,
    });
    return res.status(200).json({ message: "Doctor removed.", doctor });
  } catch (e) {
    return next(e);
  }
};

const reactivateDoctor = async (req, res, next) => {
  try {
    const { doctorId } = req.params;
    const doctor = await Doctor.findOne({ _id: doctorId, organization: req.doctor.organization });
    if (!doctor) return res.status(404).json({ message: "Doctor not found in your organization." });
    if (doctor.active) return res.status(200).json({ message: "Doctor is already active.", doctor });

    const maxDoctors = req.organization.maxDoctors;
    const current = await Doctor.countDocuments({
      organization: req.doctor.organization,
      active: true,
    });
    if (maxDoctors && current >= maxDoctors)
      return res.status(409).json({
        message: `Doctor limit reached (${current}/${maxDoctors}). Ask the platform admin to raise this organization's doctor limit before reactivating.`,
        code: "doctor_limit_reached",
        current,
        max: maxDoctors,
      });

    doctor.active = true;
    await doctor.save();

    await logAudit({
      organization: req.doctor.organization,
      actorType: "doctor",
      actorId: req.doctor.id,
      actorEmail: req.doctor.email,
      action: "doctor.reactivated",
      target: "Doctor",
      targetId: doctor._id,
      ip: req.ip,
    });

    return res.status(200).json({ message: "Doctor reactivated.", doctor });
  } catch (e) {
    return next(e);
  }
};

const listStaff = async (req, res, next) => {
  try {
    const filter = { organization: req.doctor.organization };
    if (req.query.doctorId) filter.doctor = req.query.doctorId;
    const result = await Staff.paginate(filter, {
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 20),
      sort: { createdAt: -1 },
      select: "-password",
      populate: { path: "doctor", select: "name email" },
    });
    return res.status(200).json(result);
  } catch (e) {
    return next(e);
  }
};

const createStaff = async (req, res, next) => {
  try {
    const { name, email, password, number, role, doctorId } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ message: "name, email, password required." });

    const targetDoctorId = doctorId || req.doctor.id;
    const targetDoctor = await Doctor.findOne({ _id: targetDoctorId, organization: req.doctor.organization });
    if (!targetDoctor) return res.status(404).json({ message: "Doctor not in your organization." });

    if (req.doctor.orgRole !== "owner" && String(targetDoctorId) !== String(req.doctor.id))
      return res.status(403).json({ message: "You can only add staff to yourself." });

    const maxStaff = req.organization.maxStaff;
    if (maxStaff) {
      const currentStaff = await Staff.countDocuments({ organization: req.doctor.organization, active: true });
      if (currentStaff >= maxStaff)
        return res.status(409).json({
          message: `Staff limit reached (${currentStaff}/${maxStaff}). Ask the platform admin to raise this organization's staff limit.`,
          code: "staff_limit_reached",
          current: currentStaff,
          max: maxStaff,
        });
    }

    const exists = await Staff.findOne({ organization: req.doctor.organization, email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: "Staff with this email already exists in your org." });

    const staff = await Staff.create({
      organization: req.doctor.organization,
      doctor: targetDoctor._id,
      name,
      email,
      number,
      password,
      role: role || "receptionist",
    });

    await logAudit({
      organization: req.doctor.organization,
      actorType: "doctor",
      actorId: req.doctor.id,
      actorEmail: req.doctor.email,
      action: "staff.created",
      target: "Staff",
      targetId: staff._id,
      metadata: { staffEmail: staff.email, doctor: targetDoctor._id },
      ip: req.ip,
    });

    return res.status(201).json({
      message: "Staff created.",
      staff: { id: staff._id, name: staff.name, email: staff.email, role: staff.role, doctor: staff.doctor },
    });
  } catch (e) {
    return next(e);
  }
};

const updateStaff = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const { name, role, active, number } = req.body;
    const staff = await Staff.findOne({ _id: staffId, organization: req.doctor.organization });
    if (!staff) return res.status(404).json({ message: "Staff not found." });
    if (req.doctor.orgRole !== "owner" && String(staff.doctor) !== String(req.doctor.id))
      return res.status(403).json({ message: "Forbidden." });
    if (name != null) staff.name = name;
    if (role != null) staff.role = role;
    if (active != null) staff.active = !!active;
    if (number != null) staff.number = number;
    await staff.save();
    return res.status(200).json({ message: "Staff updated.", staff });
  } catch (e) {
    return next(e);
  }
};

const deleteStaff = async (req, res, next) => {
  try {
    const { staffId } = req.params;
    const staff = await Staff.findOne({ _id: staffId, organization: req.doctor.organization });
    if (!staff) return res.status(404).json({ message: "Staff not found." });
    if (req.doctor.orgRole !== "owner" && String(staff.doctor) !== String(req.doctor.id))
      return res.status(403).json({ message: "Forbidden." });
    await staff.deleteOne();
    await logAudit({
      organization: req.doctor.organization,
      actorType: "doctor",
      actorId: req.doctor.id,
      actorEmail: req.doctor.email,
      action: "staff.deleted",
      target: "Staff",
      targetId: staffId,
      ip: req.ip,
    });
    return res.status(200).json({ message: "Staff removed." });
  } catch (e) {
    return next(e);
  }
};

const FIELD_MAP = {
  symptom: "customSymptoms",
  diagnosis: "customDiagnoses",
  dose: "customDoses",
  frequency: "customFrequencies",
  days: "customDays",
  when: "customWhens",
};

const DEFAULT_LISTS = {
  customSymptoms: [
    "Fever", "Cough", "Cold", "Sore Throat", "Headache", "Body Ache",
    "Fatigue", "Nausea", "Vomiting", "Diarrhea", "Abdominal Pain",
    "Shortness of Breath", "Chest Pain", "Dizziness", "Rash", "Joint Pain",
  ],
  customDiagnoses: [],
  customDoses: ["250mg", "500mg", "650mg", "10mg", "5mg"],
  // Indian dosing shorthand — denser/faster than "Once daily" etc.
  // Positional (morning-noon-night) plus the common Latin abbreviations.
  customFrequencies: ["1-1-1", "1-0-1", "1-0-0", "0-0-1", "BD", "TDS", "OD", "SOS"],
  customDays: ["3 days", "5 days", "7 days", "10 days", "14 days", "30 days"],
  customWhens: ["Before food", "After food", "Empty stomach", "With food"],
};

// Previous defaults that should be cleared from existing orgs on upgrade, so
// the switch to shorthand doesn't leave the old verbose chips lingering.
const RETIRED_DEFAULTS = {
  customFrequencies: ["Once daily", "Twice daily", "Thrice daily", "As needed"],
};

const LATEST_SEED_VERSION = 3;

const SELECT_FIELDS =
  "customSymptoms customDiagnoses customDoses customFrequencies customDays customWhens customListsSeededVersion";

const buildListsResponse = (org) => ({
  customSymptoms: org?.customSymptoms || [],
  customDiagnoses: org?.customDiagnoses || [],
  customDoses: org?.customDoses || [],
  customFrequencies: org?.customFrequencies || [],
  customDays: org?.customDays || [],
  customWhens: org?.customWhens || [],
});

const seedDefaultsIfNeeded = async (orgId) => {
  const org = await Organization.findById(orgId).select(SELECT_FIELDS);
  if (!org) return null;
  if ((org.customListsSeededVersion || 0) >= LATEST_SEED_VERSION) return org;
  for (const [field, defaults] of Object.entries(DEFAULT_LISTS)) {
    const retired = RETIRED_DEFAULTS[field] || [];
    const existing = (Array.isArray(org[field]) ? org[field] : [])
      .filter((item) => !retired.includes(item));
    const merged = [...defaults];
    for (const item of existing) {
      if (!merged.includes(item)) merged.push(item);
    }
    org[field] = merged;
  }
  org.customListsSeededVersion = LATEST_SEED_VERSION;
  await org.save();
  return org;
};

const resolveActorOrgId = (req) =>
  req.doctor?.organization || req.staff?.organization || req.organization?._id;

const getCustomLists = async (req, res, next) => {
  try {
    const orgId = resolveActorOrgId(req);
    const org = await seedDefaultsIfNeeded(orgId);
    return res.status(200).json(buildListsResponse(org));
  } catch (e) {
    return next(e);
  }
};

const addCustomListItem = async (req, res, next) => {
  try {
    const { type, value } = req.body || {};
    const field = FIELD_MAP[String(type || "").toLowerCase()];
    if (!field) return res.status(400).json({ message: "Unsupported list type." });
    const cleaned = String(value || "").trim();
    if (!cleaned) return res.status(400).json({ message: "value is required." });
    if (cleaned.length > 80) return res.status(400).json({ message: "value is too long." });

    const org = await Organization.findByIdAndUpdate(
      req.doctor.organization,
      { $addToSet: { [field]: cleaned } },
      { new: true, select: SELECT_FIELDS }
    );

    await logAudit({
      organization: org._id,
      actorType: "doctor",
      actorId: req.doctor.id,
      actorEmail: req.doctor.email,
      action: `org.custom.${type}.added`,
      target: "Organization",
      targetId: org._id,
      metadata: { value: cleaned },
      ip: req.ip,
    });

    return res.status(200).json({ message: "Added.", ...buildListsResponse(org) });
  } catch (e) {
    return next(e);
  }
};

const removeCustomListItem = async (req, res, next) => {
  try {
    const { type } = req.params;
    const value = req.body?.value ?? req.query?.value ?? "";
    const field = FIELD_MAP[String(type || "").toLowerCase()];
    if (!field) return res.status(400).json({ message: "Unsupported list type." });
    const cleaned = String(value).trim();
    if (!cleaned) return res.status(400).json({ message: "value is required." });

    const org = await Organization.findByIdAndUpdate(
      req.doctor.organization,
      { $pull: { [field]: cleaned } },
      { new: true, select: SELECT_FIELDS }
    );

    await logAudit({
      organization: org._id,
      actorType: "doctor",
      actorId: req.doctor.id,
      actorEmail: req.doctor.email,
      action: `org.custom.${type}.removed`,
      target: "Organization",
      targetId: org._id,
      metadata: { value: cleaned },
      ip: req.ip,
    });

    return res.status(200).json({ message: "Removed.", ...buildListsResponse(org) });
  } catch (e) {
    return next(e);
  }
};

module.exports = {
  getOrgOverview,
  updateOrgSettings,
  listDoctorsInOrg,
  inviteDoctor,
  listInvites,
  revokeInvite,
  resendInvite,
  acceptInvite,
  removeDoctor,
  reactivateDoctor,
  listStaff,
  createStaff,
  updateStaff,
  deleteStaff,
  getCustomLists,
  addCustomListItem,
  removeCustomListItem,
};
