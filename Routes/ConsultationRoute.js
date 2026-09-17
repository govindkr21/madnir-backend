const express = require("express");
const ctrl = require("../Controllers/ConsultationController");
const {
  requireDoctorOrStaffAuth,
  attachOrgContext,
  blockIfExpired,
} = require("../Middlewares/Auth");

const router = express.Router();

router.use(requireDoctorOrStaffAuth, attachOrgContext, blockIfExpired);

router.get("/", ctrl.listConsultations);
router.post("/", ctrl.createConsultation);
router.get("/:consultationId", ctrl.getConsultation);
router.patch("/:consultationId", ctrl.updateConsultation);
router.delete("/:consultationId", ctrl.deleteConsultation);

module.exports = router;
