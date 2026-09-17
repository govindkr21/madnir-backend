const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const SECRET = () => process.env.JWT_SECRET || "dev-secret";

const newSessionId = () => crypto.randomBytes(16).toString("hex");

const signAdminToken = (admin) =>
  jwt.sign(
    { id: admin._id, email: admin.email, role: "admin" },
    SECRET(),
    { expiresIn: "7d" }
  );

const signDoctorToken = (doctor, { sid = null, impersonated = false } = {}) =>
  jwt.sign(
    {
      id: doctor._id,
      email: doctor.email,
      role: "doctor",
      orgRole: doctor.orgRole || "owner",
      organization: doctor.organization || null,
      sid: sid || undefined,
      imp: impersonated || undefined,
    },
    SECRET(),
    { expiresIn: impersonated ? "2h" : "7d" }
  );

const signStaffToken = (staff) =>
  jwt.sign(
    {
      id: staff._id,
      email: staff.email,
      role: "staff",
      organization: staff.organization,
      doctor: staff.doctor,
    },
    SECRET(),
    { expiresIn: "7d" }
  );

const verifyToken = (token) => jwt.verify(token, SECRET());

module.exports = { signAdminToken, signDoctorToken, signStaffToken, verifyToken, newSessionId };
