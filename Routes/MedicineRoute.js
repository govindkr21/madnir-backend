const express = require("express");
const ctrl = require("../Controllers/MedicineController");
const { requireDoctorOrStaffAuth, attachOrgContext } = require("../Middlewares/Auth");

const router = express.Router();

// Full catalog + org medicines, for instant client-side filtering.
router.get("/", requireDoctorOrStaffAuth, attachOrgContext, ctrl.listMedicines);
// Server-side search (fallback / large catalogs).
router.get("/search", requireDoctorOrStaffAuth, attachOrgContext, ctrl.searchMedicines);

module.exports = router;
