const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const uploadBuffer = (buffer, options = {}) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { resource_type: "auto", ...options },
      (error, result) => (error ? reject(error) : resolve(result))
    );
    stream.end(buffer);
  });

const makeAssetKey = (result) =>
  [result.resource_type, result.public_id, result.format || ""].join("|");

const parseAssetKey = (key) => {
  const parts = String(key || "").split("|");
  if (parts.length >= 2 && ["image", "raw", "video"].includes(parts[0])) {
    return { resourceType: parts[0], publicId: parts[1], format: parts[2] || undefined };
  }
  return { resourceType: "auto", publicId: String(key || ""), format: undefined };
};

const signRead = (key) => {
  if (!key) return Promise.resolve("");
  const { resourceType, publicId, format } = parseAssetKey(key);
  return Promise.resolve(
    cloudinary.url(publicId, {
      secure: true,
      resource_type: resourceType,
      format,
      type: "upload",
    })
  );
};

const deleteAsset = async (key) => {
  if (!key) return;
  const { resourceType, publicId } = parseAssetKey(key);
  await cloudinary.uploader.destroy(publicId, {
    resource_type: resourceType === "auto" ? "image" : resourceType,
    type: "upload",
    invalidate: true,
  });
};

const refreshDoctorSignature = async (doctor) => {
  if (!doctor) return doctor;
  const src = typeof doctor.toObject === "function" ? doctor.toObject() : doctor;
  if (!src.signatureKey) return src;
  try {
    src.signatureUrl = await signRead(src.signatureKey);
  } catch {
    src.signatureUrl = "";
  }
  return src;
};

const refreshDoctorSignatures = async (doctors) => {
  if (!Array.isArray(doctors)) return doctors;
  return Promise.all(doctors.map(refreshDoctorSignature));
};

module.exports = {
  cloudinary,
  uploadBuffer,
  makeAssetKey,
  signRead,
  deleteAsset,
  refreshDoctorSignature,
  refreshDoctorSignatures,
};