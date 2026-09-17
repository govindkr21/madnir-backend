const express = require("express");
const {
  registerAdmin,
  createAdminByAdmin,
  loginAdmin,
  forgotPassword,
  resetPassword,
} = require("../Controllers/AdminAuthController");
const { requireAdminAuth } = require("../Middlewares/Auth");

const router = express.Router();

router.post("/register", registerAdmin);
router.post("/login", loginAdmin);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/create", requireAdminAuth, createAdminByAdmin);

module.exports = router;
