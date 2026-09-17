const express = require("express");
const ctrl = require("../Controllers/AppointmentLeadController");
const { requireDoctorOrStaffAuth, attachOrgContext, blockIfExpired } = require("../Middlewares/Auth");

const router = express.Router();

router.use(requireDoctorOrStaffAuth, attachOrgContext, blockIfExpired);

router.get("/stats", ctrl.stats);
router.get("/", ctrl.listLeads);
router.post("/", ctrl.createLead);
router.patch("/:id", ctrl.updateLead);
router.delete("/:id", ctrl.deleteLead);

router.post("/:id/confirm", ctrl.markConfirmed);
router.post("/:id/reopen", ctrl.markScheduled);
router.post("/:id/arrived", ctrl.markArrived);
router.post("/:id/no-show", ctrl.markNoShow);
router.post("/:id/cancel", ctrl.markCancelled);
router.post("/:id/convert", ctrl.convertToPatient);

module.exports = router;
