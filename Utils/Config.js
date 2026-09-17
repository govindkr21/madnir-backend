const mongoose = require("mongoose");

// Older organizations (created before access-expiry was introduced) have no
// `expiryDate` field. Without a backfill they'd be rendered as "—" everywhere,
// and any save in the admin would still need an explicit date. This sets a
// 30-day window measured from each org's `createdAt`, but only for documents
// that don't already have a value — so it's idempotent across restarts and
// never overwrites an admin's choice.
const backfillOrgExpiry = async () => {
  try {
    const Organization = require("../Models/OrganizationModel");
    const docs = await Organization.find({
      $or: [{ expiryDate: { $exists: false } }, { expiryDate: null }],
    }).select("_id createdAt");
    if (docs.length === 0) return;
    const ops = docs.map((d) => {
      const created = d.createdAt ? new Date(d.createdAt) : new Date();
      const expiry = new Date(created.getTime() + 30 * 86400000);
      return {
        updateOne: {
          filter: { _id: d._id },
          update: { $set: { expiryDate: expiry } },
        },
      };
    });
    await Organization.bulkWrite(ops);
    console.info(`Backfilled expiryDate on ${docs.length} organization(s).`);
  } catch (err) {
    console.warn("Org expiry backfill failed:", err.message);
  }
};

const initMongoDB = async () => {
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.warn("MONGO_URI is missing. Skipping MongoDB connection.");
    return;
  }

  try {
    await mongoose.connect(mongoUri);
    console.info("🟢 Mongo connected successfully.");
    await backfillOrgExpiry();
    const { seedMedicinesIfEmpty } = require("./Medicines/Seeder");
    await seedMedicinesIfEmpty();
    console.info("--------------------------------------------");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);
    console.warn("Continuing without database connection.");
  }
};

module.exports = {
  initMongoDB,
};
