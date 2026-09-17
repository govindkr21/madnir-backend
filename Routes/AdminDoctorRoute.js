const express = require("express");
const {
  getPendingDoctors,
  setDoctorAuthorization,
  setDoctorActive,
} = require("../Controllers/AdminDoctorController");
const { requireAdminAuth } = require("../Middlewares/Auth");

const router = express.Router();

router.use(requireAdminAuth);

router.get("/pending", getPendingDoctors);
router.patch("/:doctorId/authorize", setDoctorAuthorization);
router.patch("/:doctorId/active", setDoctorActive);

module.exports = router;
