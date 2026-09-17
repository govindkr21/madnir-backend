const {
  S3Client,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const SIGNED_URL_EXPIRES = Number(process.env.S3_SIGNED_URL_EXPIRES || 3600);
const BUCKET = process.env.AWS_S3_BUCKET;

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const signRead = (key, expiresIn = SIGNED_URL_EXPIRES) => {
  if (!key) return Promise.resolve("");
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });
};

// Recover the S3 key from a previously-stored presigned URL. Doctors whose
// signature was uploaded before `signatureKey` existed still have that URL in
// the DB; parsing the path lets us keep serving fresh URLs for them without a
// data migration.
const extractKeyFromSignedUrl = (url) => {
  if (!url || typeof url !== "string") return "";
  if (!/^https?:\/\//i.test(url)) return "";
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const path = decodeURIComponent(u.pathname.replace(/^\/+/, ""));
    // Virtual-hosted style: <bucket>.s3(.<region>)?.amazonaws.com/<key>
    if (BUCKET && host.startsWith(`${BUCKET.toLowerCase()}.s3`)) return path;
    // Path style: s3(.<region>)?.amazonaws.com/<bucket>/<key>
    if (BUCKET && /^s3[.-]/i.test(host) && path.startsWith(`${BUCKET}/`)) {
      return path.slice(BUCKET.length + 1);
    }
    return "";
  } catch {
    return "";
  }
};

// Doctor signatures are stored in S3 as objects keyed by `signatureKey`. The
// presigned URL that unlocks the object expires quickly (S3 max ~7 days), so
// we regenerate it on every read instead of storing a URL that would 403 once
// the token in it lapses. Pass a plain object or a Mongoose doc — the result
// is always a plain object with a fresh `signatureUrl`.
const refreshDoctorSignature = async (doctor) => {
  if (!doctor) return doctor;
  const src = typeof doctor.toObject === "function" ? doctor.toObject() : doctor;
  const key = src.signatureKey || extractKeyFromSignedUrl(src.signatureUrl);
  if (key) {
    try {
      src.signatureUrl = await signRead(key);
      if (!src.signatureKey) src.signatureKey = key;
    } catch {
      src.signatureUrl = "";
    }
  }
  return src;
};

const refreshDoctorSignatures = async (doctors) => {
  if (!Array.isArray(doctors)) return doctors;
  return Promise.all(doctors.map(refreshDoctorSignature));
};

module.exports = { s3, signRead, refreshDoctorSignature, refreshDoctorSignatures, SIGNED_URL_EXPIRES, BUCKET };
