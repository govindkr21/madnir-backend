const Staff = require("../Models/StaffModel");
const Organization = require("../Models/OrganizationModel");
const { signStaffToken } = require("../Utils/Tokens");
const { asyncHandler } = require("../Utils/AsyncHandler");
const { logAudit } = require("../Utils/Audit");

const loginStaff = asyncHandler(async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password)
    return res.status(400).json({ message: "email and password are required." });

  const staff = await Staff.findOne({ email: email.toLowerCase(), active: true })
    .populate("doctor", "name email specialization");
  if (!staff) return res.status(401).json({ message: "Invalid credentials." });

  const ok = await staff.comparePassword(password);
  if (!ok) return res.status(401).json({ message: "Invalid credentials." });

  const organization = await Organization.findById(staff.organization);
  const token = signStaffToken(staff);

  await logAudit({
    organization: staff.organization,
    actorType: "staff",
    actorId: staff._id,
    actorEmail: staff.email,
    action: "staff.login",
    target: "Staff",
    targetId: staff._id,
    ip: req.ip,
  });

  res.status(200).json({
    message: "Staff login successful.",
    token,
    staff: {
      id: staff._id,
      name: staff.name,
      email: staff.email,
      role: staff.role,
      doctor: staff.doctor,
    },
    organization: organization
      ? { id: organization._id, name: organization.name, slug: organization.slug, type: organization.type, status: organization.status }
      : null,
  });
});

module.exports = { loginStaff };
