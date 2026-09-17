const express = require("express");
const { getDoctorDashboard } = require("../Controllers/DashboardController");
const {
  requireDoctorOrStaffAuth,
  attachOrgContext,
} = require("../Middlewares/Auth");

const router = express.Router();

router.get("/", requireDoctorOrStaffAuth, attachOrgContext, getDoctorDashboard);

module.exports = router;
