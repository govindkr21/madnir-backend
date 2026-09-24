const Doctor = require("../Models/DoctorModel");
const Staff = require("../Models/StaffModel");
const Admin = require("../Models/AdminModel");
const Organization = require("../Models/OrganizationModel");
const { asyncHandler } = require("../Utils/AsyncHandler");
const { resolveSupportContact } = require("../Middlewares/Auth");
const { refreshDoctorSignature } = require("../Utils/Cloudinary");

const getDoctorMe = asyncHandler(async (req, res) => {
  const doctor = await Doctor.findById(req.doctor.id).select("-password");
  if (!doctor) return res.status(404).json({ message: "Doctor not found." });

  const organization = doctor.organization
    ? await Organization.findById(doctor.organization)
    : null;

  const expired = organization ? organization.isExpired() : false;

  res.status(200).json({
    user: await refreshDoctorSignature(doctor),
    role: "doctor",
    organization,
    expired,
    supportContact: organization ? resolveSupportContact(organization) : null,
    limits: organization
      ? {
          maxDoctors: organization.maxDoctors,
          maxStaff: organization.maxStaff,
          expiryDate: organization.expiryDate,
        }
      : null,
  });
});

const updateDoctorMe = asyncHandler(async (req, res) => {
  const allowed = ["name", "number", "nmc", "medicalCouncil", "specialization", "qualifications", "fellowships", "designation", "signatureUrl", "signatureKey"];
  const update = {};
  for (const k of allowed) if (req.body[k] !== undefined) update[k] = req.body[k];
  const doctor = await Doctor.findByIdAndUpdate(req.doctor.id, update, { new: true }).select("-password");
  if (!doctor) return res.status(404).json({ message: "Doctor not found." });
  res.status(200).json({ user: await refreshDoctorSignature(doctor) });
});

const getStaffMe = asyncHandler(async (req, res) => {
  const staff = await Staff.findById(req.staff.id)
    .select("-password")
    .populate("doctor", "name specialization email");
  if (!staff) return res.status(404).json({ message: "Staff not found." });

  const organization = staff.organization
    ? await Organization.findById(staff.organization)
    : null;
  const expired = organization ? organization.isExpired() : false;

  res.status(200).json({
    user: staff,
    role: "staff",
    organization,
    expired,
    supportContact: organization ? resolveSupportContact(organization) : null,
    limits: organization
      ? {
          maxDoctors: organization.maxDoctors,
          maxStaff: organization.maxStaff,
          expiryDate: organization.expiryDate,
        }
      : null,
  });
});

const getAdminMe = asyncHandler(async (req, res) => {
  const admin = await Admin.findById(req.admin.id).select("-password");
  if (!admin) return res.status(404).json({ message: "Admin not found." });
  res.status(200).json({ user: admin, role: "admin" });
});

module.exports = { getDoctorMe, updateDoctorMe, getStaffMe, getAdminMe };
