const express = require("express");
const ctrl = require("../Controllers/PrescriptionController");
const {
  requireDoctorOrStaffAuth,
  requireDoctorAuth,
  attachOrgContext,
  blockIfExpired,
} = require("../Middlewares/Auth");

const router = express.Router();

router.get("/", requireDoctorOrStaffAuth, attachOrgContext, ctrl.listPrescriptions);
router.get("/:prescriptionId", requireDoctorOrStaffAuth, attachOrgContext, ctrl.getPrescription);

router.post("/", requireDoctorAuth, attachOrgContext, blockIfExpired, ctrl.createPrescription);
router.patch("/:prescriptionId", requireDoctorAuth, attachOrgContext, blockIfExpired, ctrl.updatePrescription);
router.post("/:prescriptionId/printed", requireDoctorOrStaffAuth, attachOrgContext, ctrl.markPrinted);
router.delete("/:prescriptionId", requireDoctorAuth, attachOrgContext, blockIfExpired, ctrl.deletePrescription);

module.exports = router;
