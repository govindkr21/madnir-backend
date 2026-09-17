const crypto = require("crypto");
const Counter = require("../Models/CounterModel");

// Atomically increment and return the next value in a named sequence
// (e.g. `rxNumber` per organization). Zero-padded to `minWidth` digits;
// grows naturally past that width as the sequence advances.
const nextSequence = async (scope, name, minWidth = 3) => {
  const doc = await Counter.findOneAndUpdate(
    { scope: String(scope), name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return String(doc.seq).padStart(minWidth, "0");
};

const randomCode = (prefix, length = 4) => {
  const n = crypto.randomInt(0, 10 ** length).toString().padStart(length, "0");
  return `${prefix}-${n}`;
};

const generateUniqueCode = async (Model, field, orgId, prefix, length = 4, maxAttempts = 10) => {
  for (let i = 0; i < maxAttempts; i += 1) {
    const candidate = randomCode(prefix, length);
    const exists = await Model.findOne({ organization: orgId, [field]: candidate }).select("_id").lean();
    if (!exists) return candidate;
  }
  return `${prefix}-${Date.now().toString().slice(-8)}`;
};

const generateResetToken = () => {
  const raw = crypto.randomBytes(24).toString("hex");
  const hash = crypto.createHash("sha256").update(raw).digest("hex");
  return { raw, hash };
};

const hashToken = (raw) => crypto.createHash("sha256").update(raw).digest("hex");

const getOtp = (length = 6) => {
  const num = "0123456789";
  let otp = "";
  for (let i = 0; i < length; i += 1) otp += num[Math.floor(Math.random() * 10)];
  return otp;
};

module.exports = { randomCode, generateUniqueCode, nextSequence, generateResetToken, hashToken, getOtp };
