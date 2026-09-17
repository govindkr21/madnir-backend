const express = require("express");
const {
  registerDoctor,
  loginDoctor,
  forgotPassword,
  resetPassword,
  getPendingProfile,
  updatePendingProfile,
} = require("../Controllers/DoctorAuthController");
const { requireDoctorAuthAllowPending } = require("../Middlewares/Auth");

const router = express.Router();

router.post("/register", registerDoctor);
router.post("/login", loginDoctor);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/pending-profile", requireDoctorAuthAllowPending, getPendingProfile);
router.patch("/pending-profile", requireDoctorAuthAllowPending, updatePendingProfile);

module.exports = router;
