const express = require("express");
const { getDoctorMe, updateDoctorMe, getStaffMe, getAdminMe } = require("../Controllers/MeController");
const {
  requireDoctorAuth,
  requireStaffAuth,
  requireAdminAuth,
} = require("../Middlewares/Auth");

const router = express.Router();

router.get("/doctor", requireDoctorAuth, getDoctorMe);
router.patch("/doctor", requireDoctorAuth, updateDoctorMe);
router.get("/staff", requireStaffAuth, getStaffMe);
router.get("/admin", requireAdminAuth, getAdminMe);

module.exports = router;
