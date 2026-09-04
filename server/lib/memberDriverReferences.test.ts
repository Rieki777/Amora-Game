/**
 * The deletion and export bridge, and the two properties nothing was checking.
 *
 * This file had no test of its own. That mattered more than a coverage gap
 * usually does, because the code it covers is the one that makes
 * "Leaving well is guaranteed" true, and because the first driver ever
 * registered will belong to an outside company.
 *
 * The two behaviours worth pinning:
 *
 *   A DRIVER IS GIVEN AN OPAQUE REFERENCE AND NEVER OUR MEMBER ID. The contract
 *   has promised that since revision one and the code did the opposite.
 *
 *   THE MAPPING OUTLIVES A FAILED ERASURE. An unconfirmed store is one the
 *   village still owes the member a confirmation from, and chasing it later
 *   means asking about this member again, which needs the reference to still
 *   resolve. A complete erasure retires it; an incomplete one keeps it.
 *
 * WHY THIS IS A SECOND FILE. server/memberDrivers.test.ts is the unit-level
 * home and covers what the village SAYS when a store answers or does not,
 * against a stand-in pool. These cases need a real database because they are
 * about the mapping table itself, so they live apart rather than making that
 * fast file slow.
 *
 * No TEST_DATABASE_URL and the suite skips loudly (harness rule).
 */
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import mysql from "mysql2/promise";
import { provisionTestDb, testDbConfigured, type TestDb } from "../db/testDb";
import {
  clearMemberDrivers,
  exportMemberEverywhere,
  forgetMemberEverywhere,
  registerMemberDriver,
} from "./memberDrivers";
import { looksLikeSubjectRef, subjectRefFor, userIdForSubjectRef } from "./subjectRefs";

const configured = testDbConfigured();

let db: TestDb;
let pool: mysql.Pool;

/** Remembers what it was handed, which is the whole point of these cases. */
function spyDriver(opts: { confirm: boolean }) {
  const seen: string[] = [];
  return {
    seen,
    driver: {
      async forgetMember(subjectRef: string) {
        seen.push(subjectRef);
        return opts.confirm ? { confirmed: true } : { confirmed: false, detail: "the store did not answer" };
      },
      async exportMember(subjectRef: string) {
        seen.push(subjectRef);
        return { rows: 0 };
      },
    },
  };
}

async function refExists(userId: string): Promise<boolean> {
  const [rows] = await pool.query<any[]>("SELECT COUNT(*) AS n FROM subject_refs WHERE user_id = ?", [userId]); // module-review-ok: asserting on the scratch schema this suite provisioned
  return Number(rows[0].n) > 0;
}

describe.skipIf(!configured)("the deletion and export bridge", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 4 }); // module-review-ok: the suite's own pool onto the scratch schema it provisioned
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
    clearMemberDrivers();
  });

  beforeEach(async () => {
    clearMemberDrivers();
    await pool.query("DELETE FROM subject_refs"); // module-review-ok: resetting the scratch schema this suite provisioned, between cases
  });

  it("hands a driver an opaque reference and never the member id", async () => {
    const spy = spyDriver({ confirm: true });
    registerMemberDriver("saberra", spy.driver);

    await forgetMemberEverywhere(pool, "u1");

    expect(spy.seen).toHaveLength(1);
    expect(spy.seen[0]).not.toBe("u1");
    expect(looksLikeSubjectRef(spy.seen[0])).toBe(true);
  });

  it("hands the export the same reference the erasure would use", async () => {
    const spy = spyDriver({ confirm: true });
    registerMemberDriver("saberra", spy.driver);
    const issued = await subjectRefFor(pool, "u1");

    await exportMemberEverywhere(pool, "u1");

    expect(spy.seen[0]).toBe(issued);
  });

  it("retires the mapping when every store confirmed", async () => {
    registerMemberDriver("saberra", spyDriver({ confirm: true }).driver);
    const ref = await subjectRefFor(pool, "u1");

    const out = await forgetMemberEverywhere(pool, "u1");

    expect(out.confirmed).toEqual(["saberra"]);
    expect(out.unconfirmed).toHaveLength(0);
    expect(await userIdForSubjectRef(pool, ref)).toBeNull();
  });

  it("KEEPS the mapping when a store did not confirm, so the village can ask again", async () => {
    registerMemberDriver("saberra", spyDriver({ confirm: false }).driver);
    const ref = await subjectRefFor(pool, "u1");

    const out = await forgetMemberEverywhere(pool, "u1");

    expect(out.unconfirmed).toHaveLength(1);
    // The obligation survives, and so must the only name the village can chase
    // it under. Dropping the reference here would leave an obligation nobody
    // can be identified in.
    expect(await userIdForSubjectRef(pool, ref)).toBe("u1");
  });

  it("keeps the mapping when one store confirms and another does not", async () => {
    registerMemberDriver("good", spyDriver({ confirm: true }).driver);
    registerMemberDriver("bad", spyDriver({ confirm: false }).driver);
    const ref = await subjectRefFor(pool, "u1");

    const out = await forgetMemberEverywhere(pool, "u1");

    expect(out.confirmed).toEqual(["good"]);
    expect(out.unconfirmed.map((u) => u.module)).toEqual(["bad"]);
    expect(await userIdForSubjectRef(pool, ref)).toBe("u1");
  });

  it("asks nobody and issues nothing when no module is connected", async () => {
    const out = await forgetMemberEverywhere(pool, "u1");

    expect(out.asked).toEqual([]);
    expect(await refExists("u1")).toBe(false);
  });

  it("issues no reference for an export when no module is connected", async () => {
    const out = await exportMemberEverywhere(pool, "u1");

    expect(out.stores).toEqual({});
    expect(out.unavailable).toEqual([]);
    expect(await refExists("u1")).toBe(false);
  });

  it("asks every registered driver even for a member never referenced before", async () => {
    const spy = spyDriver({ confirm: true });
    registerMemberDriver("saberra", spy.driver);

    expect(await refExists("fresh")).toBe(false);
    await forgetMemberEverywhere(pool, "fresh");

    // The ask is unconditional. Skipping it because we believe no vendor could
    // know this member would make the deletion guarantee depend on an invariant
    // holding perfectly somewhere else.
    expect(spy.seen).toHaveLength(1);
  });
});
