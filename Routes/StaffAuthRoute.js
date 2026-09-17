const express = require("express");
const { loginStaff } = require("../Controllers/StaffAuthController");

const router = express.Router();

router.post("/login", loginStaff);

module.exports = router;
