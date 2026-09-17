const express = require("express");
const ctrl = require("../Controllers/TemplateController");
const {
  requireDoctorAuth,
  requireDoctorOrStaffAuth,
  attachOrgContext,
  blockIfExpired,
} = require("../Middlewares/Auth");

const router = express.Router();

router.use(requireDoctorOrStaffAuth, attachOrgContext);

router.get("/", ctrl.listTemplates);
router.get("/:templateId", ctrl.getTemplate);
router.post("/:templateId/use", blockIfExpired, ctrl.useTemplate);

router.post("/", requireDoctorAuth, blockIfExpired, ctrl.createTemplate);
router.patch("/:templateId", requireDoctorAuth, blockIfExpired, ctrl.updateTemplate);
router.delete("/:templateId", requireDoctorAuth, blockIfExpired, ctrl.deleteTemplate);

module.exports = router;
