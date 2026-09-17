const Medicine = require("../../Models/MedicineModel");
const SEED_MEDICINES = require("./SeedData");
const logger = require("../Logger");

// Populate the global drug catalog if it's empty. Idempotent and safe to call
// on every boot and concurrently — duplicate-key races are ignored. Running
// this at startup means the first user search is instant (no lazy-seed delay).
let seedPromise = null;
const seedMedicinesIfEmpty = async () => {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const count = await Medicine.estimatedDocumentCount();
    if (count > 0) return;
    const docs = SEED_MEDICINES.map(([name, generic, form]) => ({
      name,
      nameLower: name.toLowerCase(),
      generic: generic || "",
      form: form || "",
    }));
    try {
      await Medicine.insertMany(docs, { ordered: false });
      logger.info(`Seeded ${docs.length} medicines into the drug catalog.`);
    } catch (e) {
      // Duplicate-key races between concurrent callers are expected/benign.
      logger.warn(`Medicine seed partial/failed: ${e.message}`);
    }
  })();
  return seedPromise;
};

module.exports = { seedMedicinesIfEmpty };
