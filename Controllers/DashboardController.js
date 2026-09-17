const mongoose = require("mongoose");
const Patient = require("../Models/PatientModel");
const Consultation = require("../Models/ConsultationModel");
const Prescription = require("../Models/PrescriptionModel");
const Doctor = require("../Models/DoctorModel");
const Staff = require("../Models/StaffModel");
const { asyncHandler } = require("../Utils/AsyncHandler");

const startOfDay = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const getDoctorDashboard = asyncHandler(async (req, res) => {
  const orgId = req.orgId;
  const orgObjectId = new mongoose.Types.ObjectId(String(orgId));
  const today = startOfDay();
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const doctorFilter = req.query.scope === "self" && req.doctor ? { doctor: req.doctor.id } : {};

  const [
    totalPatients,
    activePatients,
    newPatients7d,
    consultationsToday,
    consultationsWeek,
    prescriptionsWeek,
    doctorsInOrg,
    staffInOrg,
    upcomingFollowups,
    recentConsultations,
    topDiagnoses,
    visitsByDay,
  ] = await Promise.all([
    Patient.countDocuments({ organization: orgId }),
    Patient.countDocuments({ organization: orgId, active: true }),
    Patient.countDocuments({ organization: orgId, createdAt: { $gte: sevenDaysAgo } }),
    Consultation.countDocuments({ organization: orgId, ...doctorFilter, visitDate: { $gte: today } }),
    Consultation.countDocuments({ organization: orgId, ...doctorFilter, visitDate: { $gte: sevenDaysAgo } }),
    Prescription.countDocuments({ organization: orgId, ...doctorFilter, createdAt: { $gte: sevenDaysAgo } }),
    Doctor.countDocuments({ organization: orgId, active: true }),
    Staff.countDocuments({ organization: orgId, active: true }),
    Consultation.countDocuments({
      organization: orgId,
      ...doctorFilter,
      followUpDate: { $gte: today, $lte: new Date(Date.now() + 7 * 86400000) },
    }),
    Consultation.find({ organization: orgId, ...doctorFilter })
      .sort({ visitDate: -1 })
      .limit(10)
      .populate("patient", "name rxId phone age sex")
      .populate("doctor", "name")
      .lean(),
    Consultation.aggregate([
      {
        $match: {
          organization: orgObjectId,
          diagnosis: { $nin: ["", null] },
          createdAt: { $gte: thirtyDaysAgo },
        },
      },
      { $group: { _id: "$diagnosis", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]).catch(() => []),
    Consultation.aggregate([
      { $match: { organization: orgObjectId, visitDate: { $gte: thirtyDaysAgo } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$visitDate" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]).catch(() => []),
  ]);

  res.status(200).json({
    summary: {
      totalPatients,
      activePatients,
      newPatients7d,
      consultationsToday,
      consultationsWeek,
      prescriptionsWeek,
      doctors: doctorsInOrg,
      staff: staffInOrg,
      upcomingFollowups,
    },
    recentConsultations,
    topDiagnoses,
    visitsByDay,
  });
});

module.exports = { getDoctorDashboard };
