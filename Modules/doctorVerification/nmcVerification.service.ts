import axios, { AxiosInstance, AxiosError } from "axios";
import https from "https";
import { execute, query } from "./db";
import {
  NmcSearchRequest,
  NmcDoctorRecord,
  VerificationResponse,
} from "./types";
import type { RowDataPacket } from "mysql2";

const NMC_ENDPOINT = "https://www.nmc.org.in/MCIRest/api/imr/search";
const REQUEST_TIMEOUT_MS = 15_000;
const DESKTOP_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) " +
  "Chrome/124.0.0.0 Safari/537.36";

const INSECURE_TLS = process.env.NMC_INSECURE_TLS === "1";

const httpsAgent = new https.Agent({
  keepAlive: true,
  rejectUnauthorized: !INSECURE_TLS,
});

let httpClient: AxiosInstance | null = null;

function getClient(): AxiosInstance {
  if (httpClient) return httpClient;
  httpClient = axios.create({
    baseURL: NMC_ENDPOINT,
    timeout: REQUEST_TIMEOUT_MS,
    httpsAgent,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/plain, */*",
      "User-Agent": DESKTOP_UA,
      Origin: "https://www.nmc.org.in",
      Referer: "https://www.nmc.org.in/information-desk/indian-medical-register/",
    },
    validateStatus: (s) => s >= 200 && s < 500,
  });
  return httpClient;
}

function pickString(src: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = src[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

function pickYear(src: Record<string, unknown>, ...keys: string[]): number | null {
  for (const k of keys) {
    const v = src[k];
    if (typeof v === "number" && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === "string") {
      const match = v.match(/(19|20)\d{2}/);
      if (match) return Number(match[0]);
    }
  }
  return null;
}

function extractRecords(payload: unknown): Array<Record<string, unknown>> {
  if (!payload || typeof payload !== "object") return [];

  const obj = payload as Record<string, unknown>;
  const candidates: Array<unknown> = [
    obj.data,
    obj.result,
    obj.results,
    obj.records,
    obj.content,
    (obj.data as Record<string, unknown> | undefined)?.records,
    (obj.data as Record<string, unknown> | undefined)?.content,
  ];

  for (const c of candidates) {
    if (Array.isArray(c)) return c.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
  }
  if (Array.isArray(payload)) return payload as Array<Record<string, unknown>>;
  return [];
}

function normalizeRecord(
  raw: Record<string, unknown>,
  fallback: NmcSearchRequest
): NmcDoctorRecord | null {
  const doctorName = pickString(raw, "doctorName", "fullName", "name", "firstName");
  const registrationNumber = pickString(raw, "registrationNo", "registrationNumber", "regNo");
  const stateMedicalCouncil = pickString(raw, "smcName", "stateMedicalCouncil", "councilName");
  const smcIdRaw = pickString(raw, "smcId", "councilId");
  const qualification = pickString(raw, "qualification", "qualificationName", "qualifications");
  const university = pickString(raw, "university", "universityName", "institute");
  const yearOfRegistration = pickYear(raw, "yearOfRegistration", "yearOfInfo", "registrationYear", "year");

  if (!doctorName || !registrationNumber) return null;

  return {
    doctorName,
    registrationNumber,
    stateMedicalCouncil: stateMedicalCouncil ?? "",
    smcId: smcIdRaw ?? String(fallback.smcId),
    qualification,
    university,
    yearOfRegistration,
    raw,
  };
}

async function upsertVerification(record: NmcDoctorRecord): Promise<void> {
  const sql = `
    INSERT INTO doctor_verifications
      (doctor_name, registration_number, state_medical_council, smc_id,
       qualification, university, year_of_registration, raw_payload, last_verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, CAST(? AS JSON), CURRENT_TIMESTAMP)
    ON DUPLICATE KEY UPDATE
      doctor_name           = VALUES(doctor_name),
      state_medical_council = VALUES(state_medical_council),
      qualification         = VALUES(qualification),
      university            = VALUES(university),
      year_of_registration  = VALUES(year_of_registration),
      raw_payload           = VALUES(raw_payload),
      last_verified_at      = CURRENT_TIMESTAMP
  `;
  await execute(sql, [
    record.doctorName,
    record.registrationNumber,
    record.stateMedicalCouncil,
    record.smcId,
    record.qualification,
    record.university,
    record.yearOfRegistration,
    JSON.stringify(record.raw),
  ]);
}

interface DoctorVerificationRow extends RowDataPacket {
  id: number;
  doctor_name: string;
  registration_number: string;
  state_medical_council: string;
  smc_id: string;
  qualification: string | null;
  university: string | null;
  year_of_registration: number | null;
  raw_payload: unknown;
  last_verified_at: Date;
}

export async function getCachedVerification(
  registrationNumber: string,
  smcId: string,
  maxAgeMs: number
): Promise<NmcDoctorRecord | null> {
  const rows = await query<DoctorVerificationRow[]>(
    `SELECT * FROM doctor_verifications
     WHERE registration_number = ? AND smc_id = ?
     LIMIT 1`,
    [registrationNumber, smcId]
  );
  const row = rows[0];
  if (!row) return null;

  const ageMs = Date.now() - new Date(row.last_verified_at).getTime();
  if (ageMs > maxAgeMs) return null;

  const raw =
    typeof row.raw_payload === "string"
      ? (JSON.parse(row.raw_payload) as Record<string, unknown>)
      : ((row.raw_payload as Record<string, unknown>) ?? {});

  return {
    doctorName: row.doctor_name,
    registrationNumber: row.registration_number,
    stateMedicalCouncil: row.state_medical_council,
    smcId: row.smc_id,
    qualification: row.qualification,
    university: row.university,
    yearOfRegistration: row.year_of_registration,
    raw,
  };
}

export interface VerifyOptions {
  /** If a cached row exists newer than this, return it without hitting NMC. */
  cacheTtlMs?: number;
  /** Force a refresh even if cache is fresh. */
  forceRefresh?: boolean;
}

export async function verifyDoctor(
  req: NmcSearchRequest,
  opts: VerifyOptions = {}
): Promise<VerificationResponse> {
  const registrationNo = (req.registrationNo ?? "").trim();
  const smcId = (req.smcId ?? "").trim();
  const pageNo = req.pageNo ?? 0;
  const pageSize = req.pageSize ?? 10;

  if (!registrationNo || !smcId) {
    return { success: false, data: null, message: "registrationNo and smcId are required" };
  }

  const cacheTtl = opts.cacheTtlMs ?? 1000 * 60 * 60 * 24 * 30;
  if (!opts.forceRefresh) {
    const cached = await getCachedVerification(registrationNo, smcId, cacheTtl).catch(() => null);
    if (cached) {
      return { success: true, data: cached, message: "Doctor verified", cached: true };
    }
  }

  const payload = { registrationNo, smcId, pageNo, pageSize };

  try {
    const res = await getClient().post("", payload);

    if (res.status >= 400) {
      return {
        success: false,
        data: null,
        message: `NMC responded with HTTP ${res.status}`,
      };
    }

    const records = extractRecords(res.data);
    if (records.length === 0) {
      return { success: false, data: null, message: "Doctor not found" };
    }

    const normalized = normalizeRecord(records[0], { registrationNo, smcId, pageNo, pageSize });
    if (!normalized) {
      return { success: false, data: null, message: "Doctor not found" };
    }

    await upsertVerification(normalized);

    return { success: true, data: normalized, message: "Doctor verified", cached: false };
  } catch (err) {
    const axiosErr = err as AxiosError;
    const reason =
      axiosErr.code === "ECONNABORTED"
        ? "NMC request timed out"
        : axiosErr.code === "ECONNREFUSED" || axiosErr.code === "ENOTFOUND"
        ? "NMC endpoint unreachable"
        : axiosErr.message || "Upstream NMC call failed";
    return { success: false, data: null, message: reason };
  }
}

export const __testables = {
  extractRecords,
  normalizeRecord,
  upsertVerification,
};
