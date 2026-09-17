const Doctor = require("../Models/DoctorModel");
const Organization = require("../Models/OrganizationModel");
const { logAudit } = require("../Utils/Audit");

const getPendingDoctors = async (req, res, next) => {
  try {
    const pendingDoctors = await Doctor.paginate(
      { authorized: false },
      {
        page: Number(req.query.page || 1),
        limit: Number(req.query.limit || 10),
        sort: { createdAt: -1 },
        select: "-password",
        populate: {
          path: "organization",
          select: "name slug type contactEmail contactNumber billingEmail address logo status expiryDate maxDoctors maxStaff supportContact ownerDoctor createdAt",
        },
      }
    );
    return res.status(200).json(pendingDoctors);
  } catch (error) {
    return next(error);
  }
};

const setDoctorAuthorization = async (req, res, next) => {
  try {
    const { doctorId } = req.params;
    const { authorized } = req.body;

    if (typeof authorized !== "boolean") {
      return res.status(400).json({ message: "authorized must be true or false." });
    }

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) {
      return res.status(404).json({ message: "Doctor not found." });
    }

    doctor.authorized = authorized;
    doctor.parentAdmin = authorized ? req.admin.id : null;
    await doctor.save();

    await logAudit({
      organization: doctor.organization,
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      action: authorized ? "doctor.authorized" : "doctor.unauthorized",
      target: "Doctor",
      targetId: doctor._id,
      metadata: { doctorEmail: doctor.email },
      ip: req.ip,
    });

    return res.status(200).json({
      message: `Doctor ${authorized ? "authorized" : "unauthorized"} successfully.`,
      doctor: {
        id: doctor._id, name: doctor.name, email: doctor.email,
        authorized: doctor.authorized, parentAdmin: doctor.parentAdmin,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const setDoctorActive = async (req, res, next) => {
  try {
    const { doctorId } = req.params;
    const { active } = req.body;
    if (typeof active !== "boolean")
      return res.status(400).json({ message: "active must be true or false." });

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) return res.status(404).json({ message: "Doctor not found." });

    // When reactivating, make sure the doctor's organization still has a seat.
    if (active && !doctor.active && doctor.organization) {
      const org = await Organization.findById(doctor.organization).select("maxDoctors");
      if (org?.maxDoctors) {
        const currentActive = await Doctor.countDocuments({
          organization: doctor.organization,
          active: true,
        });
        if (currentActive >= org.maxDoctors)
          return res.status(409).json({
            message: `Doctor limit reached (${currentActive}/${org.maxDoctors}). Raise the organization's max doctors before reactivating.`,
            code: "doctor_limit_reached",
            current: currentActive,
            max: org.maxDoctors,
          });
      }
    }

    doctor.active = active;
    await doctor.save();

    await logAudit({
      organization: doctor.organization,
      actorType: "admin",
      actorId: req.admin.id,
      actorEmail: req.admin.email,
      action: active ? "doctor.reactivated" : "doctor.suspended",
      target: "Doctor",
      targetId: doctor._id,
      metadata: { doctorEmail: doctor.email },
      ip: req.ip,
    });

    return res.status(200).json({
      message: `Doctor ${active ? "reactivated" : "suspended"}.`,
      doctor: {
        id: doctor._id, name: doctor.name, email: doctor.email,
        active: doctor.active, authorized: doctor.authorized,
      },
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getPendingDoctors,
  setDoctorAuthorization,
  setDoctorActive,
};
