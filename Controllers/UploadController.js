const crypto = require("crypto");
const { asyncHandler } = require("../Utils/AsyncHandler");
const { uploadBuffer, makeAssetKey, signRead, deleteAsset } = require("../Utils/Cloudinary");

const ALLOWED_MIME = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};

const MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 5 * 1024 * 1024);

const assertOrgAssetKey = (key, orgId) => {
  const publicId = String(key || "").split("|")[1] || "";
  if (!orgId || !publicId.startsWith(`${orgId}/`)) {
    const error = new Error("Asset does not belong to your organization.");
    error.status = 403;
    throw error;
  }
};

const parseDataUri = (uri) => {
  const m = /^data:([\w./+-]+);base64,(.+)$/i.exec(String(uri || ""));
  if (!m) return null;
  return { mime: m[1].toLowerCase(), buffer: Buffer.from(m[2], "base64") };
};

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
  const filename = `${Date.now()}-${id}`;
  const key = `${folder}/${safePurpose}/${filename}`;

  const result = await uploadBuffer(parsed.buffer, {
    public_id: key,
    resource_type: "auto",
    format: ext,
  });
  const assetKey = makeAssetKey(result);
  const url = await signRead(assetKey);

  res.status(201).json({
    message: "Uploaded.",
    key: assetKey,
    url,
    size: parsed.buffer.length,
    mime: parsed.mime,
    purpose: safePurpose,
    expiresIn: 0,
  });
});

const getReadUrl = asyncHandler(async (req, res) => {
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ message: "key is required." });
  assertOrgAssetKey(key, req.orgId);
  const url = await signRead(key);
  res.json({ url, expiresIn: 0 });
});

const deleteFile = asyncHandler(async (req, res) => {
  const { key } = req.body || {};
  if (!key) return res.status(400).json({ message: "key is required." });
  assertOrgAssetKey(key, req.orgId);
  await deleteAsset(key);
  res.json({ message: "Deleted." });
});

module.exports = { uploadFile, getReadUrl, deleteFile };
