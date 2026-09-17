const crypto = require("crypto");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { asyncHandler } = require("../Utils/AsyncHandler");

const ALLOWED_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

const MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024);
const SIGNED_URL_EXPIRES = Number(process.env.S3_SIGNED_URL_EXPIRES || 3600);

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET;

const parseDataUri = (uri) => {
  const m = /^data:([\w./+-]+);base64,(.+)$/i.exec(String(uri || ""));
  if (!m) return null;
  return { mime: m[1].toLowerCase(), buffer: Buffer.from(m[2], "base64") };
};

const signRead = (key, expiresIn = SIGNED_URL_EXPIRES) =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), { expiresIn });

const uploadFile = asyncHandler(async (req, res) => {
  const { dataURI, purpose } = req.body || {};
  if (!dataURI) return res.status(400).json({ message: "dataURI is required." });

  const parsed = parseDataUri(dataURI);
  if (!parsed) return res.status(400).json({ message: "Invalid dataURI format." });

  const ext = ALLOWED_MIME[parsed.mime];
  if (!ext) return res.status(415).json({ message: `Unsupported file type: ${parsed.mime}` });

  if (parsed.buffer.length > MAX_BYTES)
    return res.status(413).json({
      message: `File too large. Max ${(MAX_BYTES / 1024 / 1024).toFixed(1)} MB.`,
      max: MAX_BYTES,
    });

  const folder = req.orgId ? String(req.orgId) : "public";
  const safePurpose = String(purpose || "misc").replace(/[^a-z0-9_-]/gi, "").slice(0, 32) || "misc";
  const id = crypto.randomBytes(8).toString("hex");
  const filename = `${Date.now()}-${id}.${ext}`;
  const key = `${folder}/${safePurpose}/${filename}`;

  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: parsed.buffer,
    ContentType: parsed.mime,
  }));

  const url = await signRead(key);

  res.status(201).json({
    message: "Uploaded.",
    key,
    url,
    size: parsed.buffer.length,
    mime: parsed.mime,
    purpose: safePurpose,
    expiresIn: SIGNED_URL_EXPIRES,
  });
});

const getReadUrl = asyncHandler(async (req, res) => {
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ message: "key is required." });
  const url = await signRead(key);
  res.json({ url, expiresIn: SIGNED_URL_EXPIRES });
});

const deleteFile = asyncHandler(async (req, res) => {
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ message: "key is required." });
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  res.json({ message: "Deleted." });
});

module.exports = { uploadFile, getReadUrl, deleteFile };
