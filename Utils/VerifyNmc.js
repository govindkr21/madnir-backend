const https = require("https");
const logger = require("./Logger");

const NMC_HOST = "www.nmc.org.in";
const NMC_PATH = "/MCIRest/api/imr/search";
const REQUEST_TIMEOUT_MS = 15000;
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

// Maps the canonical council names used in frontend/src/constants/medicalCouncils.js
// to the smcId values accepted by the NMC IMR search endpoint.
// IDs can be overridden via NMC_SMC_ID_OVERRIDES env var (JSON: { "Council Name": 7 }).
const DEFAULT_SMC_ID_MAP = {
  "Andhra Pradesh Medical Council": 1,
  "Arunachal Pradesh Medical Council": 2,
  "Assam Medical Council": 3,
  "Bihar Medical Council": 4,
  "Bombay Medical Council": 5,
  "Chhattisgarh Medical Council": 6,
  "Delhi Medical Council": 7,
  "Goa Medical Council": 8,
  "Gujarat Medical Council": 9,
  "Haryana Medical Council": 10,
  "Himachal Pradesh Medical Council": 11,
  "Jammu & Kashmir Medical Council": 12,
  "Jharkhand Medical Council": 13,
  "Karnataka Medical Council": 14,
  "Madhya Pradesh Medical Council": 15,
  "Maharashtra Medical Council": 16,
  "Manipur Medical Council": 17,
  "Mizoram Medical Council": 19,
  "Nagaland Medical Council": 20,
  "Odisha Council of Medical Registration": 21,
  "Punjab Medical Council": 22,
  "Rajasthan Medical Council": 23,
  "Sikkim Medical Council": 24,
  "Tamil Nadu Medical Council": 25,
  "Telangana State Medical Council": 26,
  "Travancore-Cochin Medical Council (Kerala)": 27,
  "Tripura State Medical Council": 28,
  "Uttar Pradesh Medical Council": 29,
  "Uttarakhand Medical Council": 30,
  "West Bengal Medical Council": 31,
  "Meghalaya Medical Council": 32,
  "National Medical Commission (NMC)": 33,
};

let smcIdMap = null;
const getSmcIdMap = () => {
  if (smcIdMap) return smcIdMap;
  smcIdMap = { ...DEFAULT_SMC_ID_MAP };
  if (process.env.NMC_SMC_ID_OVERRIDES) {
    try {
      Object.assign(smcIdMap, JSON.parse(process.env.NMC_SMC_ID_OVERRIDES));
    } catch (e) {
      logger.warn(`NMC_SMC_ID_OVERRIDES parse failed: ${e.message}`);
    }
  }
  return smcIdMap;
};

const resolveSmcId = (councilName) => {
  const map = getSmcIdMap();
  const exact = map[councilName];
  if (exact) return exact;
  const norm = String(councilName || "").trim().toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (k.toLowerCase() === norm) return v;
  }
  return null;
};

const extractFirstRecord = (payload) => {
  if (!payload || typeof payload !== "object") return null;
  const candidates = [
    payload.data,
    payload.result,
    payload.results,
    payload.records,
    payload.content,
    payload.data && payload.data.records,
    payload.data && payload.data.content,
  ];
  for (const c of candidates) {
    if (Array.isArray(c) && c.length > 0) return c[0];
  }
  if (Array.isArray(payload) && payload.length > 0) return payload[0];
  return null;
};

const postJson = (body) =>
  new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(
      {
        host: NMC_HOST,
        path: NMC_PATH,
        method: "POST",
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/plain, */*",
          "Content-Length": Buffer.byteLength(data),
          "User-Agent": DESKTOP_UA,
          Origin: `https://${NMC_HOST}`,
          Referer: `https://${NMC_HOST}/information-desk/indian-medical-register/`,
        },
        rejectUnauthorized: process.env.NMC_INSECURE_TLS !== "1",
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed = null;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch (_) {}
          resolve({ status: res.statusCode || 0, body: parsed });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("NMC request timed out"));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });

/**
 * Verifies an Indian doctor against the NMC IMR.
 * Returns:
 *   { verified: true,  data, reachable: true }
 *   { verified: false, found: false, reachable: true,  message }   -> registration not found
 *   { verified: false, reachable: false, message }                  -> NMC unreachable / soft failure
 *   { verified: false, reachable: true,  message, badInput: true } -> council unmapped or missing inputs
 */
async function verifyNmc({ nmc, medicalCouncil }) {
  const registrationNo = String(nmc || "").trim();
  if (!registrationNo) {
    return { verified: false, reachable: true, badInput: true, message: "NMC / Registration number is required." };
  }
  const smcId = resolveSmcId(medicalCouncil);
  if (!smcId) {
    return {
      verified: false,
      reachable: true,
      badInput: true,
      message: `State Medical Council "${medicalCouncil}" is not mapped to an NMC smcId.`,
    };
  }

  try {
    const { status, body } = await postJson({
      registrationNo,
      smcId: String(smcId),
      pageNo: 0,
      pageSize: 10,
    });
    if (status >= 500 || status === 0) {
      return { verified: false, reachable: false, message: `NMC responded with HTTP ${status}` };
    }
    if (status >= 400) {
      return { verified: false, reachable: true, message: `NMC responded with HTTP ${status}` };
    }
    const rec = extractFirstRecord(body);
    if (!rec) {
      return {
        verified: false,
        found: false,
        reachable: true,
        message: "No matching doctor found in the Indian Medical Register.",
      };
    }
    const doctorName =
      rec.doctorName || rec.fullName || rec.name || rec.firstName || null;
    const registrationNumber =
      rec.registrationNo || rec.registrationNumber || rec.regNo || registrationNo;
    return {
      verified: true,
      reachable: true,
      data: {
        doctorName,
        registrationNumber,
        stateMedicalCouncil: rec.smcName || rec.stateMedicalCouncil || rec.councilName || medicalCouncil,
        qualification: rec.qualification || rec.qualificationName || rec.qualifications || null,
        university: rec.university || rec.universityName || rec.institute || null,
        yearOfRegistration: rec.yearOfRegistration || rec.year || rec.registrationYear || null,
        raw: rec,
      },
    };
  } catch (err) {
    logger.warn(`NMC verification failed: ${err.message}`);
    return { verified: false, reachable: false, message: err.message || "NMC unreachable" };
  }
}

module.exports = { verifyNmc, resolveSmcId };
