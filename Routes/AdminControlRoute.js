const express = require("express");
const orgs = require("../Controllers/AdminOrgController");
const { requireAdminAuth } = require("../Middlewares/Auth");

const router = express.Router();

router.use(requireAdminAuth);

router.get("/overview", orgs.getPlatformOverview);

router.get("/organizations", orgs.listOrganizations);
router.get("/organizations/:orgId", orgs.getOrganizationDetail);
router.patch("/organizations/:orgId/status", orgs.updateOrgStatus);
router.patch("/organizations/:orgId/limits", orgs.updateOrgLimits);
router.delete("/organizations/:orgId", orgs.deleteOrganization);
router.post("/organizations/:orgId/impersonate", orgs.impersonateOwner);
router.post("/organizations/:orgId/doctors/:doctorId", orgs.assignExistingDoctorToOrg);

router.get("/audit-logs", orgs.listAuditLogs);
router.get("/doctors", orgs.listAllDoctors);
router.get("/doctors/orphans", orgs.listOrphanDoctors);
router.post("/doctors/:doctorId/impersonate", orgs.impersonateDoctor);

module.exports = router;
