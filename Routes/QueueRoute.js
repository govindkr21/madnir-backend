const express = require("express");
const ctrl = require("../Controllers/QueueController");
const {
  requireDoctorOrStaffAuth,
  attachOrgContext,
  blockIfExpired,
} = require("../Middlewares/Auth");

const router = express.Router();

router.use(requireDoctorOrStaffAuth, attachOrgContext, blockIfExpired);

router.get("/", ctrl.listQueue);
router.post("/", ctrl.addToQueue);
router.patch("/:entryId", ctrl.updateEntry);
router.delete("/:entryId", ctrl.removeEntry);
router.post("/:entryId/complete", ctrl.completeEntry);

module.exports = router;
