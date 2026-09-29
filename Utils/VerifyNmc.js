const https = require("https");
const logger = require("./Logger");

const NMC_HOST = "nmc.org.in";
const NMC_PATH = "/indian-medical-register/search";
const REQUEST_TIMEOUT_MS = 15000;
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

// Maps the canonical council names used in frontend/src/constants/medicalCouncils.js
// to the state codes accepted by the NMC IMR search endpoint (see
// https://nmc.org.in/indian-medical-register/states). Councils without a code
// (Bombay, Meghalaya, NMC) are searched by registration number alone.
// Codes can be overridden via NMC_SMC_ID_OVERRIDES env var (JSON: { "Council Name": "DEL" }).
const DEFAULT_STATE_CODE_MAP = {
  "Andhra Pradesh Medical Council": "AND",
  "Arunachal Pradesh Medical Council": "ARU",
  "Assam Medical Council": "ASS",
  "Bihar Medical Council": "BIH",
  "Chhattisgarh Medical Council": "CHA",
  "Delhi Medical Council": "DEL",
  "Goa Medical Council": "GOA",
  "Gujarat Medical Council": "GUJ",
  "Haryana Medical Council": "HAR",
  "Himachal Pradesh Medical Council": "HIM",
  "Jammu & Kashmir Medical Council": "JAM",
  "Jharkhand Medical Council": "JHA",
  "Karnataka Medical Council": "KAR",
  "Madhya Pradesh Medical Council": "MAD",
  "Maharashtra Medical Council": "MAH",
  "Manipur Medical Council": "MAN",
  "Mizoram Medical Council": "MIZ",
  "Nagaland Medical Council": "NAG",
  "Odisha Council of Medical Registration": "ORI",
  "Punjab Medical Council": "PUN",
  "Rajasthan Medical Council": "RAJ",
  "Sikkim Medical Council": "SIK",
  "Tamil Nadu Medical Council": "TAM",
  "Telangana State Medical Council": "TEL",
  "Travancore-Cochin Medical Council (Kerala)": "TC",
  "Tripura State Medical Council": "TRI",
  "Uttar Pradesh Medical Council": "UP",
  "Uttarakhand Medical Council": "UTT",
  "West Bengal Medical Council": "WES",
};

let stateCodeMap = null;
const getStateCodeMap = () => {
  if (stateCodeMap) return stateCodeMap;
  stateCodeMap = { ...DEFAULT_STATE_CODE_MAP };
  if (process.env.NMC_SMC_ID_OVERRIDES) {
    try {
      Object.assign(stateCodeMap, JSON.parse(process.env.NMC_SMC_ID_OVERRIDES));
    } catch (e) {
      logger.warn(`NMC_SMC_ID_OVERRIDES parse failed: ${e.message}`);
    }
  }
  return stateCodeMap;
};

const resolveStateCode = (councilName) => {
  const map = getStateCodeMap();
  const exact = map[councilName];
  if (exact) return exact;
  const norm = String(councilName || "").trim().toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (k.toLowerCase() === norm) return v;
  }
  return null;
};

const normReg = (s) => String(s || "").replace(/\s+/g, "").toUpperCase();

const getJson = (query) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: NMC_HOST,
        path: `${NMC_PATH}?${new URLSearchParams(query).toString()}`,
        method: "GET",
        timeout: REQUEST_TIMEOUT_MS,
        headers: {
          Accept: "application/json, text/plain, */*",
          "User-Agent": DESKTOP_UA,
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
    req.end();
  });

/**
 * Verifies an Indian doctor against the NMC IMR.
 * Returns:
 *   { verified: true,  data, reachable: true }
 *   { verified: false, found: false, reachable: true,  message }   -> registration not found
 *   { verified: false, reachable: false, message }                  -> NMC unreachable / soft failure
 *   { verified: false, reachable: true,  message, badInput: true } -> missing inputs
 */
async function verifyNmc({ nmc, medicalCouncil }) {
  const registrationNo = String(nmc || "").trim();
  if (!registrationNo) {
    return { verified: false, reachable: true, badInput: true, message: "NMC / Registration number is required." };
  }
  const stateCode = resolveStateCode(medicalCouncil);

  try {
    const query = { search_type: "reg_no", reg_no: registrationNo, page: 1, per_page: 100 };
    const { status, body } = await getJson(query);
    if (status >= 500 || status === 0) {
      return { verified: false, reachable: false, message: `NMC responded with HTTP ${status}` };
    }
    if (status >= 300) {
      // 3xx/4xx (e.g. a moved endpoint): can't judge the doctor, so treat NMC as unreachable
      // and leave the account for manual admin review instead of wrongly rejecting it.
      logger.warn(`NMC verification: unexpected HTTP ${status}`);
      return { verified: false, reachable: false, message: `NMC responded with HTTP ${status}` };
    }
    if (!body || typeof body !== "object" || !Array.isArray(body.data)) {
      logger.warn("NMC verification: unexpected response shape");
      return { verified: false, reachable: false, message: "Unexpected response from NMC" };
    }

    const wanted = normReg(registrationNo);
    const rec = body.data.find(
      (r) => normReg(r.registration_no) === wanted && (!stateCode || r.state_code === stateCode)
    );
    if (!rec) {
      return {
        verified: false,
        found: false,
        reachable: true,
        message: "No matching doctor found in the Indian Medical Register.",
      };
    }

    const extra = Array.isArray(rec.additional_qualifications) ? rec.additional_qualifications : [];
    const qualification = [rec.qualification, ...extra.map((q) => q.qualification)].filter(Boolean).join(", ") || null;
    return {
      verified: true,
      reachable: true,
      data: {
        doctorName: rec.name || null,
        registrationNumber: rec.registration_no || registrationNo,
        stateMedicalCouncil: rec.state_medical_council || medicalCouncil,
        qualification,
        university: rec.university || null,
        yearOfRegistration: rec.year_of_info || null,
        raw: rec,
      },
    };
  } catch (err) {
    logger.warn(`NMC verification failed: ${err.message}`);
    return { verified: false, reachable: false, message: err.message || "NMC unreachable" };
  }
}

module.exports = { verifyNmc, resolveStateCode };
