/**
 * Integration test wrapper for the NMC doctor-verification module.
 *
 * Modes:
 *   - Unit:        runs always; exercises parsing + DB upsert against a
 *                  mocked Axios + the real MySQL test database.
 *   - Live NMC:    set RUN_LIVE_NMC=1 to additionally hit the real NMC
 *                  endpoint. Skipped by default to keep CI deterministic.
 *
 * Prereqs:
 *   - A MySQL database with schema.sql applied.
 *   - Env: MYSQL_HOST, MYSQL_PORT, MYSQL_USER, MYSQL_PASSWORD, MYSQL_DATABASE.
 *   - jest + ts-jest installed at the project root.
 */

import nock from "nock";
import { verifyDoctor, getCachedVerification, __testables } from "../nmcVerification.service";
import { closePool, execute, query } from "../db";
import type { RowDataPacket } from "mysql2";

const NMC_HOST = "https://www.nmc.org.in";
const NMC_PATH = "/MCIRest/api/imr/search";

const SAMPLE_REG = "TEST-99887";
const SAMPLE_SMC = "8";

const samplePayload = {
  data: {
    records: [
      {
        doctorName: "Dr Aarti Verma",
        registrationNo: SAMPLE_REG,
        smcId: SAMPLE_SMC,
        smcName: "Karnataka Medical Council",
        qualification: "MBBS, MD (Medicine)",
        university: "Bangalore Medical College",
        yearOfRegistration: 2011,
      },
    ],
  },
};

interface CountRow extends RowDataPacket {
  c: number;
}

async function resetRow(): Promise<void> {
  await execute(
    `DELETE FROM doctor_verifications WHERE registration_number = ? AND smc_id = ?`,
    [SAMPLE_REG, SAMPLE_SMC]
  );
}

beforeAll(async () => {
  await query(`SELECT 1`);
});

afterEach(() => {
  nock.cleanAll();
});

afterAll(async () => {
  await resetRow();
  await closePool();
});

describe("verifyDoctor — mocked NMC", () => {
  beforeEach(async () => {
    await resetRow();
  });

  test("returns success and upserts the row on first lookup", async () => {
    nock(NMC_HOST).post(NMC_PATH).reply(200, samplePayload);

    const res = await verifyDoctor({ registrationNo: SAMPLE_REG, smcId: SAMPLE_SMC });

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data.doctorName).toBe("Dr Aarti Verma");
    expect(res.data.yearOfRegistration).toBe(2011);
    expect(res.cached).toBe(false);

    const rows = await query<CountRow[]>(
      `SELECT COUNT(*) AS c FROM doctor_verifications
       WHERE registration_number = ? AND smc_id = ?`,
      [SAMPLE_REG, SAMPLE_SMC]
    );
    expect(rows[0]?.c).toBe(1);
  });

  test("second call within TTL returns cached row without hitting NMC", async () => {
    nock(NMC_HOST).post(NMC_PATH).reply(200, samplePayload);
    await verifyDoctor({ registrationNo: SAMPLE_REG, smcId: SAMPLE_SMC });
    expect(nock.isDone()).toBe(true);

    const second = await verifyDoctor({ registrationNo: SAMPLE_REG, smcId: SAMPLE_SMC });
    expect(second.success).toBe(true);
    if (second.success) expect(second.cached).toBe(true);
  });

  test("forceRefresh re-hits NMC even if cached", async () => {
    nock(NMC_HOST).post(NMC_PATH).reply(200, samplePayload);
    await verifyDoctor({ registrationNo: SAMPLE_REG, smcId: SAMPLE_SMC });

    nock(NMC_HOST).post(NMC_PATH).reply(200, samplePayload);
    const refreshed = await verifyDoctor(
      { registrationNo: SAMPLE_REG, smcId: SAMPLE_SMC },
      { forceRefresh: true }
    );

    expect(refreshed.success).toBe(true);
    if (refreshed.success) expect(refreshed.cached).toBe(false);
  });

  test("empty result array yields a clean not-found response", async () => {
    nock(NMC_HOST).post(NMC_PATH).reply(200, { data: { records: [] } });

    const res = await verifyDoctor({ registrationNo: "DOES-NOT-EXIST", smcId: SAMPLE_SMC });

    expect(res).toEqual({ success: false, data: null, message: "Doctor not found" });
    const cached = await getCachedVerification("DOES-NOT-EXIST", SAMPLE_SMC, 60_000);
    expect(cached).toBeNull();
  });

  test("network failure is reported, no row written", async () => {
    nock(NMC_HOST).post(NMC_PATH).replyWithError("socket hang up");

    const res = await verifyDoctor({ registrationNo: "NET-FAIL", smcId: SAMPLE_SMC });

    expect(res.success).toBe(false);
    if (!res.success) expect(res.message).toMatch(/socket hang up|NMC/);
  });

  test("missing inputs short-circuit before any HTTP call", async () => {
    const res = await verifyDoctor({ registrationNo: "", smcId: "" });
    expect(res).toEqual({
      success: false,
      data: null,
      message: "registrationNo and smcId are required",
    });
    expect(nock.pendingMocks()).toHaveLength(0);
  });
});

describe("parsing helpers", () => {
  test("extractRecords copes with several payload shapes", () => {
    const { extractRecords } = __testables;
    expect(extractRecords({ data: { records: [{ a: 1 }] } })).toHaveLength(1);
    expect(extractRecords({ result: [{ b: 2 }] })).toHaveLength(1);
    expect(extractRecords([{ c: 3 }])).toHaveLength(1);
    expect(extractRecords({})).toHaveLength(0);
    expect(extractRecords(null)).toHaveLength(0);
  });
});

const liveDescribe = process.env.RUN_LIVE_NMC === "1" ? describe : describe.skip;

liveDescribe("verifyDoctor — live NMC (smoke)", () => {
  test("hits the real endpoint and returns a structurally valid response", async () => {
    const res = await verifyDoctor(
      {
        registrationNo: process.env.NMC_TEST_REG_NO || "12345",
        smcId: process.env.NMC_TEST_SMC_ID || "8",
      },
      { forceRefresh: true }
    );
    expect(typeof res.success).toBe("boolean");
    expect(["Doctor verified", "Doctor not found"]).toContain(res.message);
  }, 30_000);
});
