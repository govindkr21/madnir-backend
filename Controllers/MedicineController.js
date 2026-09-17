const Medicine = require("../Models/MedicineModel");
const DoctorDrugPref = require("../Models/DoctorDrugPrefModel");
const { seedMedicinesIfEmpty } = require("../Utils/Medicines/Seeder");
const { DEFAULT_REGIMENS } = require("../Utils/Medicines/DefaultRegimens");

// Escape user input before using it inside a RegExp so a query like "a.b("
// can't break or slow the search.
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// GET /api/medicines/search?q=para&limit=10
// Returns ranked name suggestions. The org's own saved medicines
// (customMedicines) are surfaced first, then prefix matches from the global
// catalog, then looser "contains" matches.
const searchMedicines = async (req, res, next) => {
  try {
    const q = String(req.query.q || "").trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 25);

    if (q.length < 1) return res.status(200).json({ q, results: [] });

    await seedMedicinesIfEmpty();

    const qLower = q.toLowerCase();
    const prefix = new RegExp("^" + escapeRegex(qLower));
    const contains = new RegExp(escapeRegex(qLower));

    const seen = new Set();
    const results = [];
    const push = (name, source) => {
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return;
      seen.add(key);
      results.push({ name, source });
    };

    // 1) Org's own previously-saved medicines (highest priority).
    const orgMeds = Array.isArray(req.organization?.customMedicines)
      ? req.organization.customMedicines
      : [];
    for (const m of orgMeds) {
      if (results.length >= limit) break;
      if (prefix.test(String(m).toLowerCase())) push(m, "org");
    }
    for (const m of orgMeds) {
      if (results.length >= limit) break;
      if (contains.test(String(m).toLowerCase())) push(m, "org");
    }

    // 2) Catalog prefix matches, then 3) catalog contains matches.
    if (results.length < limit) {
      const prefixHits = await Medicine.find({ nameLower: prefix })
        .sort({ nameLower: 1 })
        .limit(limit)
        .select("name generic form")
        .lean();
      for (const m of prefixHits) {
        if (results.length >= limit) break;
        push(m.name, "catalog");
      }
    }
    if (results.length < limit) {
      const containHits = await Medicine.find({ nameLower: contains })
        .sort({ nameLower: 1 })
        .limit(limit)
        .select("name generic form")
        .lean();
      for (const m of containHits) {
        if (results.length >= limit) break;
        push(m.name, "catalog");
      }
    }

    return res.status(200).json({ q, results: results.slice(0, limit) });
  } catch (e) {
    return next(e);
  }
};

// GET /api/medicines
// Returns the full catalog (names) plus this org's saved medicines, so the
// client can filter locally for instant, zero-latency typeahead. Also returns
// a `regimens` map (keyed by lowercased drug name) holding the regimen to
// auto-fill when a drug is added — the doctor's own remembered choice when we
// have one, otherwise a curated cold-start default.
const listMedicines = async (req, res, next) => {
  try {
    await seedMedicinesIfEmpty();
    const docs = await Medicine.find({}).sort({ nameLower: 1 }).select("name").lean();
    const catalog = docs.map((d) => d.name);
    const org = Array.isArray(req.organization?.customMedicines)
      ? req.organization.customMedicines
      : [];

    // Start from curated defaults, then overlay this doctor's remembered
    // regimens so their own choices always win.
    const regimens = {};
    for (const [key, r] of Object.entries(DEFAULT_REGIMENS)) {
      regimens[key] = { dose: r.dose || "", freq: r.freq || "", days: r.days || "", when: r.when || "" };
    }
    if (req.doctor?.id) {
      const prefs = await DoctorDrugPref.find({ doctor: req.doctor.id })
        .select("drugLower dose freq days when")
        .lean();
      for (const p of prefs) {
        regimens[p.drugLower] = { dose: p.dose || "", freq: p.freq || "", days: p.days || "", when: p.when || "" };
      }
    }

    return res.status(200).json({ catalog, org, regimens });
  } catch (e) {
    return next(e);
  }
};

module.exports = { searchMedicines, listMedicines };
