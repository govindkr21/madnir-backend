const mongoose = require("mongoose");
const Organization = require("../Models/OrganizationModel");
const Doctor = require("../Models/DoctorModel");
const Staff = require("../Models/StaffModel");
const AuditLog = require("../Models/AuditLogModel");
const Patient = require("../Models/PatientModel");
const Consultation = require("../Models/ConsultationModel");
const Prescription = require("../Models/PrescriptionModel");
const QueueEntry = require("../Models/QueueEntryModel");
const Template = require("../Models/TemplateModel");
const Invite = require("../Models/InviteModel");
const { logAudit } = require("../Utils/Audit");
const { signDoctorToken } = require("../Utils/Tokens");

const listOrganizations = async (req, res, next) => {
  try {
    const filter = {};
    const now = new Date();

    // "active" / "suspended" map to the stored status. The derived states
    // ("expired" / "expiring") layer expiryDate constraints on top so that
    // a suspended org is never counted as expiring/expired and vice versa.
    switch (req.query.status) {
      case "active":
        filter.status = "active";
        filter.$or = [{ expiryDate: null }, { expiryDate: { $gt: now } }];
        break;
      case "suspended":
        filter.status = "suspended";
        break;
      case "expired":
        filter.status = "active";
        filter.expiryDate = { $lt: now };
        break;
      case "expiring": {
        const horizon = new Date(now.getTime() + 7 * 86400000);
        filter.status = "active";
        filter.expiryDate = { $gte: now, $lte: horizon };
        break;
      }
      default:
        // no status filter
        break;
    }

    if (req.query.type) filter.type = req.query.type;
    if (req.query.search) {
      const re = new RegExp(req.query.search, "i");
      const searchOr = [{ name: re }, { slug: re }, { contactEmail: re }];
      if (filter.$or) {
        // combine date OR with search OR via $and
        const dateOr = filter.$or;
        delete filter.$or;
        filter.$and = [{ $or: dateOr }, { $or: searchOr }];
      } else {
        filter.$or = searchOr;
      }
    }

    const result = await Organization.paginate(filter, {
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 20),
      sort: { createdAt: -1 },
    });
    return res.status(200).json(result);
  } catch (e) {
    return next(e);
  }
};

const getOrganizationDetail = async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const org = await Organization.findById(orgId);
    if (!org) return res.status(404).json({ message: "Organization not found." });
    const doctorFilter = org.ownerDoctor
      ? { $or: [{ organization: orgId }, { _id: org.ownerDoctor }] }
      : { organization: orgId };
    const [doctors, staff] = await Promise.all([
      Doctor.find(doctorFilter).select("-password"),
      Staff.find({ organization: orgId }).select("-password"),
    ]);
    return res.status(200).json({
      organization: org,
      expired: org.isExpired(),
      doctors,
      staff,
    });
  } catch (e) {
    return next(e);
  }
};

const updateOrgStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const allowed = ["active", "suspended"];
    if (!allowed.includes(status))
      return res.status(400).json({ message: "Invalid status." });
    const org = await Organization.findByIdAndUpdate(req.params.orgId, { status }, { new: true });
    if (!org) return res.status(404).json({ message: "Organization not found." });
    await logAudit({
      organization: org._id,
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      action: "org.status.changed",
      target: "Organization",
      targetId: org._id,
      metadata: { status },
      ip: req.ip,
    });
    return res.status(200).json({ message: "Status updated.", organization: org });
  } catch (e) {
    return next(e);
  }
};

// Admin can set / extend the access window and adjust per-org doctor & staff caps.
// Body: { expiryDate?, extendDays?, maxDoctors?, maxStaff?, supportContact? }
const updateOrgLimits = async (req, res, next) => {
  try {
    const { expiryDate, extendDays, maxDoctors, maxStaff, supportContact } = req.body || {};
    const raw = await Organization.collection.findOne({ _id: new mongoose.Types.ObjectId(req.params.orgId) });
    if (!raw) return res.status(404).json({ message: "Organization not found." });

    const repair = {};
    if (raw.address == null || typeof raw.address !== "object") repair.address = {};
    if (raw.supportContact == null || typeof raw.supportContact !== "object") repair.supportContact = {};
    if (Object.keys(repair).length) {
      await Organization.collection.updateOne({ _id: raw._id }, { $set: repair });
    }

    const org = await Organization.findById(req.params.orgId);
    if (!org) return res.status(404).json({ message: "Organization not found." });

    if (extendDays != null) {
      const days = Number(extendDays);
      if (!Number.isFinite(days) || days <= 0)
        return res.status(400).json({ message: "extendDays must be a positive number." });
      const base =
        org.expiryDate && new Date(org.expiryDate).getTime() > Date.now()
          ? new Date(org.expiryDate)
          : new Date();
      org.expiryDate = new Date(base.getTime() + days * 86400000);
    } else if (expiryDate != null) {
      const d = new Date(expiryDate);
      if (Number.isNaN(d.getTime()))
        return res.status(400).json({ message: "expiryDate is invalid." });
      org.expiryDate = d;
    }

    if (maxDoctors != null) {
      const v = Number(maxDoctors);
      if (!Number.isFinite(v) || v < 1)
        return res.status(400).json({ message: "maxDoctors must be >= 1." });
      org.maxDoctors = v;
    }
    if (maxStaff != null) {
      const v = Number(maxStaff);
      if (!Number.isFinite(v) || v < 0)
        return res.status(400).json({ message: "maxStaff must be >= 0." });
      org.maxStaff = v;
    }
    if (supportContact && typeof supportContact === "object") {
      org.supportContact = {
        name: supportContact.name ?? org.supportContact?.name ?? "",
        email: supportContact.email ?? org.supportContact?.email ?? "",
        phone: supportContact.phone ?? org.supportContact?.phone ?? "",
      };
    }

    await org.save();

    await logAudit({
      organization: org._id,
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      action: "org.limits.updated",
      target: "Organization",
      targetId: org._id,
      metadata: {
        expiryDate: org.expiryDate,
        maxDoctors: org.maxDoctors,
        maxStaff: org.maxStaff,
      },
      ip: req.ip,
    });

    return res.status(200).json({ message: "Organization limits updated.", organization: org });
  } catch (e) {
    return next(e);
  }
};

const impersonateDoctor = async (req, res, next) => {
  try {
    const doctor = await Doctor.findById(req.params.doctorId);
    if (!doctor) return res.status(404).json({ message: "Doctor not found." });
    if (doctor.active === false)
      return res.status(409).json({ message: "Doctor is suspended; cannot impersonate." });
    const org = doctor.organization ? await Organization.findById(doctor.organization) : null;
    const token = signDoctorToken(doctor, { impersonated: true });
    await logAudit({
      organization: org?._id,
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      action: "admin.impersonate.doctor",
      target: "Doctor",
      targetId: doctor._id,
      metadata: { doctorEmail: doctor.email },
      ip: req.ip,
    });
    return res.status(200).json({
      message: "Impersonation token issued.",
      token,
      doctor: { id: doctor._id, name: doctor.name, email: doctor.email, orgRole: doctor.orgRole },
      organization: org ? { id: org._id, name: org.name } : null,
    });
  } catch (e) { return next(e); }
};

const impersonateOwner = async (req, res, next) => {
  try {
    const org = await Organization.findById(req.params.orgId);
    if (!org?.ownerDoctor) return res.status(404).json({ message: "No owner doctor found." });
    const doctor = await Doctor.findById(org.ownerDoctor);
    if (!doctor) return res.status(404).json({ message: "Owner doctor not found." });
    const token = signDoctorToken(doctor, { impersonated: true });
    await logAudit({
      organization: org._id,
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      action: "admin.impersonate",
      target: "Doctor",
      targetId: doctor._id,
      ip: req.ip,
    });
    return res.status(200).json({
      message: "Impersonation token issued.",
      token,
      doctor: { id: doctor._id, name: doctor.name, email: doctor.email, orgRole: doctor.orgRole },
      organization: { id: org._id, name: org.name },
    });
  } catch (e) {
    return next(e);
  }
};

const listAuditLogs = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.orgId) filter.organization = req.query.orgId;
    if (req.query.action) filter.action = new RegExp(req.query.action, "i");
    if (req.query.actorType) filter.actorType = req.query.actorType;
    const result = await AuditLog.paginate(filter, {
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 50),
      sort: { createdAt: -1 },
    });
    return res.status(200).json(result);
  } catch (e) {
    return next(e);
  }
};

const listAllDoctors = async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.search) {
      const re = new RegExp(req.query.search, "i");
      filter.$or = [{ name: re }, { email: re }];
    }
    if (req.query.authorized === "true") filter.authorized = true;
    if (req.query.authorized === "false") filter.authorized = false;
    const result = await Doctor.paginate(filter, {
      page: Number(req.query.page || 1),
      limit: Number(req.query.limit || 30),
      sort: { createdAt: -1 },
      select: "-password",
      populate: { path: "organization", select: "name slug type contactEmail contactNumber billingEmail address logo status expiryDate maxDoctors maxStaff supportContact createdAt" },
    });
    return res.status(200).json(result);
  } catch (e) {
    return next(e);
  }
};

const getPlatformOverview = async (req, res, next) => {
  try {
    const [totalOrgs, activeOrgs, suspendedOrgs, totalDoctors, totalStaff, expiringSoon] = await Promise.all([
      Organization.countDocuments({}),
      Organization.countDocuments({ status: "active" }),
      Organization.countDocuments({ status: "suspended" }),
      Doctor.countDocuments({ active: true }),
      Staff.countDocuments({ active: true }),
      Organization.countDocuments({
        status: "active",
        expiryDate: { $gte: new Date(), $lte: new Date(Date.now() + 7 * 86400000) },
      }),
    ]);
    const expired = await Organization.countDocuments({
      status: "active",
      expiryDate: { $lt: new Date() },
    });
    return res.status(200).json({
      totalOrgs,
      activeOrgs,
      suspendedOrgs,
      expired,
      expiringSoon,
      totalDoctors,
      totalStaff,
    });
  } catch (e) {
    return next(e);
  }
};

// Hard-delete an organization and cascade-clean its operational data.
// Doctors are NOT deleted — they're orphaned (organization=null, active=false)
// so the admin can reassign them to another org via assignExistingDoctorToOrg.
const deleteOrganization = async (req, res, next) => {
  try {
    const { orgId } = req.params;
    const org = await Organization.findById(orgId);
    if (!org) return res.status(404).json({ message: "Organization not found." });

    const confirm = String(req.body?.confirmSlug || req.query?.confirmSlug || "").trim();
    if (!confirm || confirm !== org.slug)
      return res.status(400).json({
        message: `To confirm, send confirmSlug = "${org.slug}".`,
        code: "confirm_required",
        expected: org.slug,
      });

    const [
      patientsRes,
      consultationsRes,
      prescriptionsRes,
      queueRes,
      templatesRes,
      staffRes,
      invitesRes,
      doctorOrphanRes,
    ] = await Promise.all([
      Patient.deleteMany({ organization: orgId }),
      Consultation.deleteMany({ organization: orgId }),
      Prescription.deleteMany({ organization: orgId }),
      QueueEntry.deleteMany({ organization: orgId }),
      Template.deleteMany({ organization: orgId }),
      Staff.deleteMany({ organization: orgId }),
      Invite.deleteMany({ organization: orgId }),
      Doctor.updateMany(
        { organization: orgId },
        { $set: { organization: null, active: false, activeSessionId: null } }
      ),
    ]);

    await org.deleteOne();

    await logAudit({
      organization: orgId,
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      action: "org.deleted",
      target: "Organization",
      targetId: orgId,
      metadata: {
        cascadedPatients: patientsRes.deletedCount || 0,
        cascadedConsultations: consultationsRes.deletedCount || 0,
        cascadedPrescriptions: prescriptionsRes.deletedCount || 0,
        cascadedQueue: queueRes.deletedCount || 0,
        cascadedTemplates: templatesRes.deletedCount || 0,
        cascadedStaff: staffRes.deletedCount || 0,
        cascadedInvites: invitesRes.deletedCount || 0,
        orphanedDoctors: doctorOrphanRes.modifiedCount || 0,
      },
      ip: req.ip,
    });

    return res.status(200).json({
      message: "Organization deleted.",
      cascade: {
        patients: patientsRes.deletedCount || 0,
        consultations: consultationsRes.deletedCount || 0,
        prescriptions: prescriptionsRes.deletedCount || 0,
        queue: queueRes.deletedCount || 0,
        templates: templatesRes.deletedCount || 0,
        staff: staffRes.deletedCount || 0,
        invites: invitesRes.deletedCount || 0,
        orphanedDoctors: doctorOrphanRes.modifiedCount || 0,
      },
    });
  } catch (e) {
    return next(e);
  }
};

// Doctors with no organization (orphaned, e.g. their previous org was deleted)
// can be reassigned to a new org by the platform admin. They show up in the
// "Add existing doctor" picker.
const listOrphanDoctors = async (req, res, next) => {
  try {
    const filter = { $or: [{ organization: null }, { organization: { $exists: false } }] };
    if (req.query.search) {
      const re = new RegExp(req.query.search, "i");
      filter.$and = [{ $or: filter.$or }, { $or: [{ name: re }, { email: re }] }];
      delete filter.$or;
    }
    const docs = await Doctor.find(filter)
      .select("-password")
      .sort({ createdAt: -1 })
      .limit(Number(req.query.limit || 50));
    return res.status(200).json({ docs });
  } catch (e) {
    return next(e);
  }
};

// Assigns an existing (orphan) doctor to an organization. Respects maxDoctors
// and reactivates the doctor so they immediately count as a seat.
const assignExistingDoctorToOrg = async (req, res, next) => {
  try {
    const { orgId, doctorId } = req.params;
    const role = req.body?.role === "owner" ? "owner" : "doctor";

    const org = await Organization.findById(orgId);
    if (!org) return res.status(404).json({ message: "Organization not found." });

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ message: "Doctor not found." });

    if (doctor.organization && String(doctor.organization) !== String(orgId))
      return res.status(409).json({
        message: "Doctor already belongs to another organization. Remove them first.",
        code: "doctor_has_org",
      });

    const currentActive = await Doctor.countDocuments({ organization: orgId, active: true });
    if (org.maxDoctors && currentActive >= org.maxDoctors)
      return res.status(409).json({
        message: `Doctor limit reached (${currentActive}/${org.maxDoctors}). Raise the org's max doctors first.`,
        code: "doctor_limit_reached",
        current: currentActive,
        max: org.maxDoctors,
      });

    doctor.organization = orgId;
    doctor.orgRole = role;
    doctor.active = true;
    if (!doctor.authorized) doctor.authorized = true;
    await doctor.save();

    // If the org has no owner doctor, the first one we assign as "owner" becomes it.
    if (role === "owner" && !org.ownerDoctor) {
      org.ownerDoctor = doctor._id;
      await org.save();
    }

    await logAudit({
      organization: orgId,
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      action: "doctor.assigned",
      target: "Doctor",
      targetId: doctor._id,
      metadata: { role },
      ip: req.ip,
    });

    return res.status(200).json({
      message: "Doctor assigned to organization.",
      doctor: {
        id: doctor._id,
        name: doctor.name,
        email: doctor.email,
        organization: doctor.organization,
        orgRole: doctor.orgRole,
        active: doctor.active,
      },
    });
  } catch (e) {
    return next(e);
  }
};

module.exports = {
  listOrganizations,
  getOrganizationDetail,
  updateOrgStatus,
  updateOrgLimits,
  impersonateOwner,
  impersonateDoctor,
  listAuditLogs,
  listAllDoctors,
  getPlatformOverview,
  deleteOrganization,
  listOrphanDoctors,
  assignExistingDoctorToOrg,
};
