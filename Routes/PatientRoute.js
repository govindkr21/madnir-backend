const express = require("express");
const ctrl = require("../Controllers/PatientController");
const {
  requireDoctorOrStaffAuth,
  attachOrgContext,
  blockIfExpired,
} = require("../Middlewares/Auth");

const router = express.Router();

const doctorOnly = (req, res, next) => {
  if (!req.doctor) {
    return res.status(403).json({
      message: "Only doctors can delete patients.",
      reason: "doctor_only",
    });
  }
  return next();
};

router.use(requireDoctorOrStaffAuth, attachOrgContext, blockIfExpired);

router.get("/", ctrl.listPatients);
router.post("/", ctrl.createPatient);
router.get("/:patientId", ctrl.getPatient);
router.patch("/:patientId", ctrl.updatePatient);
router.delete("/:patientId", doctorOnly, ctrl.deletePatient);

module.exports = router;
