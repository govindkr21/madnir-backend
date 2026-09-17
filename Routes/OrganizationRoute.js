const express = require("express");
const ctrl = require("../Controllers/OrganizationController");
const {
  requireDoctorAuth,
  requireOrgOwner,
  attachOrgContext,
  blockIfExpired,
} = require("../Middlewares/Auth");

const router = express.Router();

router.post("/accept-invite", ctrl.acceptInvite);

router.use(requireDoctorAuth, attachOrgContext);

router.get("/overview", ctrl.getOrgOverview);
router.patch("/settings", requireOrgOwner, blockIfExpired, ctrl.updateOrgSettings);

router.get("/doctors", ctrl.listDoctorsInOrg);
router.post("/doctors/invite", requireOrgOwner, blockIfExpired, ctrl.inviteDoctor);
router.get("/doctors/invites", requireOrgOwner, ctrl.listInvites);
router.post("/doctors/invites/:inviteId/resend", requireOrgOwner, blockIfExpired, ctrl.resendInvite);
router.delete("/doctors/invites/:inviteId", requireOrgOwner, blockIfExpired, ctrl.revokeInvite);
router.delete("/doctors/:doctorId", requireOrgOwner, blockIfExpired, ctrl.removeDoctor);
router.patch("/doctors/:doctorId/reactivate", requireOrgOwner, blockIfExpired, ctrl.reactivateDoctor);

router.get("/custom-lists", ctrl.getCustomLists);
router.post("/custom-lists", blockIfExpired, ctrl.addCustomListItem);
router.delete("/custom-lists/:type", blockIfExpired, ctrl.removeCustomListItem);

router.get("/staff", ctrl.listStaff);
router.post("/staff", blockIfExpired, ctrl.createStaff);
router.patch("/staff/:staffId", blockIfExpired, ctrl.updateStaff);
router.delete("/staff/:staffId", blockIfExpired, ctrl.deleteStaff);

module.exports = router;
