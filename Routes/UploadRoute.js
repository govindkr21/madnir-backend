const express = require("express");
const { uploadFile, getReadUrl, deleteFile } = require("../Controllers/UploadController");
const {
  requireDoctorOrStaffAuth,
  attachOrgContext,
} = require("../Middlewares/Auth");

const router = express.Router();

router.post("/", requireDoctorOrStaffAuth, attachOrgContext, uploadFile);
router.post("/read-url", requireDoctorOrStaffAuth, attachOrgContext, getReadUrl);
router.delete("/", requireDoctorOrStaffAuth, attachOrgContext, deleteFile);

module.exports = router;
