const mongoose = require("mongoose");

const TYPES = [
  "queue_new",           // new patient added to queue
  "queue_started",       // consultation started (in_progress)
  "queue_completed",     // queue entry completed
  "consultation_saved",  // consultation record created
  "prescription_ready",  // prescription generated
  "appointment_new",     // new appointment scheduled
  "followup_due",        // follow-up is today
  "staff_joined",        // new staff member added
  "general",             // catch-all
];

const notificationSchema = new mongoose.Schema(
  {
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    // Who should see this — if null the whole org sees it
    recipientDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: "Doctor", default: null, index: true },

    type:    { type: String, enum: TYPES, default: "general" },
    title:   { type: String, required: true, maxlength: 120 },
    body:    { type: String, default: "" },
    // Optional deep-link metadata
    meta: {
      patientId:      { type: mongoose.Schema.Types.ObjectId, ref: "Patient",      default: null },
      consultationId: { type: mongoose.Schema.Types.ObjectId, ref: "Consultation", default: null },
      queueEntryId:   { type: mongoose.Schema.Types.ObjectId, default: null },
      patientName:    { type: String, default: "" },
    },
    isRead:  { type: Boolean, default: false, index: true },
    readAt:  { type: Date, default: null },
  },
  { timestamps: true }
);

// Compound index for fast "unread count" query
notificationSchema.index({ organizationId: 1, recipientDoctorId: 1, isRead: 1, createdAt: -1 });

// Auto-expire notifications older than 90 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 3600 });

module.exports = mongoose.model("Notification", notificationSchema);
