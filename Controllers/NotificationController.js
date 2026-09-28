const Notification = require("../Models/NotificationModel");
const logger = require("../Utils/Logger");

/* ── Internal helper — called by other controllers ─────────────────────────
   Usage:
     const { createNotification } = require("./NotificationController");
     await createNotification({ organizationId, type, title, body, meta });
──────────────────────────────────────────────────────────────────────────── */
const createNotification = async ({
  organizationId,
  recipientDoctorId = null,
  type = "general",
  title,
  body = "",
  meta = {},
}) => {
  try {
    if (!organizationId || !title) return null;
    const doc = await Notification.create({
      organizationId,
      recipientDoctorId: recipientDoctorId || null,
      type,
      title,
      body,
      meta: {
        patientId:      meta.patientId      || null,
        consultationId: meta.consultationId || null,
        queueEntryId:   meta.queueEntryId   || null,
        patientName:    meta.patientName    || "",
      },
    });
    return doc;
  } catch (err) {
    logger.error("createNotification failed:", err.message);
    return null;
  }
};

/* ── GET /api/notifications ─────────────────────────────────────────────── */
const listNotifications = async (req, res) => {
  try {
    const orgId   = req.org?._id;
    const actorId = req.user?._id;
    if (!orgId) return res.status(400).json({ message: "Organization context missing." });

    const page  = Math.max(1, parseInt(req.query.page  || "1",  10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "20", 10)));
    const unreadOnly = req.query.unread === "true";
    const skip = (page - 1) * limit;

    // Match notifications for this org that are either org-wide (null) or for this doctor
    const match = {
      organizationId: orgId,
      $or: [
        { recipientDoctorId: null },
        { recipientDoctorId: actorId },
      ],
    };
    if (unreadOnly) match.isRead = false;

    const [docs, total] = await Promise.all([
      Notification.find(match)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(match),
    ]);

    const unreadCount = await Notification.countDocuments({
      ...match,
      isRead: false,
    });

    return res.json({
      docs,
      total,
      unreadCount,
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    logger.error("listNotifications:", err.message);
    return res.status(500).json({ message: "Could not load notifications." });
  }
};

/* ── GET /api/notifications/count ──────────────────────────────────────── */
const getUnreadCount = async (req, res) => {
  try {
    const orgId   = req.org?._id;
    const actorId = req.user?._id;
    if (!orgId) return res.status(400).json({ message: "Organization context missing." });

    const count = await Notification.countDocuments({
      organizationId: orgId,
      $or: [{ recipientDoctorId: null }, { recipientDoctorId: actorId }],
      isRead: false,
    });

    return res.json({ unreadCount: count });
  } catch (err) {
    logger.error("getUnreadCount:", err.message);
    return res.status(500).json({ message: "Could not fetch count." });
  }
};

/* ── PATCH /api/notifications/:id/read ─────────────────────────────────── */
const markRead = async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.org?._id;
    const n = await Notification.findOneAndUpdate(
      { _id: id, organizationId: orgId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );
    if (!n) return res.status(404).json({ message: "Notification not found." });
    return res.json({ notification: n });
  } catch (err) {
    logger.error("markRead:", err.message);
    return res.status(500).json({ message: "Could not mark as read." });
  }
};

/* ── PATCH /api/notifications/read-all ─────────────────────────────────── */
const markAllRead = async (req, res) => {
  try {
    const orgId   = req.org?._id;
    const actorId = req.user?._id;
    if (!orgId) return res.status(400).json({ message: "Organization context missing." });

    await Notification.updateMany(
      {
        organizationId: orgId,
        $or: [{ recipientDoctorId: null }, { recipientDoctorId: actorId }],
        isRead: false,
      },
      { isRead: true, readAt: new Date() }
    );

    return res.json({ message: "All notifications marked as read." });
  } catch (err) {
    logger.error("markAllRead:", err.message);
    return res.status(500).json({ message: "Could not mark all as read." });
  }
};

/* ── DELETE /api/notifications/:id ─────────────────────────────────────── */
const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const orgId = req.org?._id;
    const n = await Notification.findOneAndDelete({ _id: id, organizationId: orgId });
    if (!n) return res.status(404).json({ message: "Notification not found." });
    return res.json({ message: "Deleted." });
  } catch (err) {
    logger.error("deleteNotification:", err.message);
    return res.status(500).json({ message: "Could not delete notification." });
  }
};

module.exports = {
  createNotification,
  listNotifications,
  getUnreadCount,
  markRead,
  markAllRead,
  deleteNotification,
};
