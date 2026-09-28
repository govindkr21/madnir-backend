const express = require("express");
const ctrl = require("../Controllers/NotificationController");
const {
  requireDoctorOrStaffAuth,
  attachOrgContext,
} = require("../Middlewares/Auth");

const router = express.Router();

// All notification routes require auth + org context
// (no blockIfExpired — doctors should still see notifications even if org expired)
router.use(requireDoctorOrStaffAuth, attachOrgContext);

router.get("/",              ctrl.listNotifications);
router.get("/count",         ctrl.getUnreadCount);
router.patch("/read-all",    ctrl.markAllRead);
router.patch("/:id/read",    ctrl.markRead);
router.delete("/:id",        ctrl.deleteNotification);

module.exports = router;
