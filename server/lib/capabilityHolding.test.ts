/**
 * What the village holds, at the column level (0098).
 *
 * This table is the one place in the product where a row can close a door on
 * the person who would have to open it again, so the interesting assertions
 * here are about what it REFUSES: a key that may never move, a role that does
 * not exist, and a role that carries no such power and therefore could not
 * act if it were handed one.
 *
 * Runs against the S5 harness: a scratch schema with every real migration
 * applied. No TEST_DATABASE_URL and the suite skips loudly (harness rule).
 */
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import mysql from "mysql2/promise";
import {
  assertCapabilityHoldingInvariants,
  capabilityHoldings,
  moveCapabilityToVillage,
  returnCapabilityToScaffolding,
  villageHeldCapabilities,
} from "./capabilityHolding";
import { provisionTestDb, testDbConfigured, type TestDb } from "../db/testDb";

const configured = testDbConfigured();

let db: TestDb;
let pool: mysql.Pool;

describe.skipIf(!configured)("capability holding", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 4 }); // module-review-ok: the suite's own pool onto the scratch schema it provisioned
    await pool.query( // module-review-ok: a fixture on the scratch schema this suite provisioned
      "INSERT INTO roles (id, name, capabilities) VALUES " +
        "('keepers','The Library Keepers',?), ('greeters','The Greeters',?)",
      [JSON.stringify(["library.keep"]), JSON.stringify([])],
    );
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM capability_holding"); // module-review-ok: resetting the scratch schema this suite provisioned, between cases
  });

  it("is empty on a fresh village, which is what makes the gate change safe to ship", async () => {
    expect(await villageHeldCapabilities(pool)).toEqual([]);
  });

  it("moves a power onto a role that already carries it", async () => {
    const r = await moveCapabilityToVillage(pool, {
      capability: "library.keep", holderRoleId: "keepers", movedByUserId: "u-founder",
    });
    expect(r).toEqual({ ok: true });
    expect(await villageHeldCapabilities(pool)).toEqual(["library.keep"]);
    const rows = await capabilityHoldings(pool);
    expect(rows).toHaveLength(1);
    expect(rows[0].holderRoleName).toBe("The Library Keepers");
    // An admin handed it over; a ballot did not. Both are real and they read
    // differently a year later, which is why the ballot id is a column.
    expect(rows[0].movedByBallotId).toBeNull();
  });

  it("refuses a role that could not act, because that state belongs to nobody at all", async () => {
    // The worst state this table can reach: the admin stops passing the gate,
    // the named holder never passed it either, and the village reads a
    // sentence naming a holder whose members all get a 403.
    const r = await moveCapabilityToVillage(pool, {
      capability: "library.keep", holderRoleId: "greeters",
    });
    expect(r.ok).toBe(false);
    expect((r as any).error).toContain("does not carry library.keep");
    expect(await villageHeldCapabilities(pool)).toEqual([]);
  });

  it("refuses a capability that may never move", async () => {
    const r = await moveCapabilityToVillage(pool, {
      capability: "message.send", holderRoleId: "keepers",
    });
    expect(r.ok).toBe(false);
    expect((r as any).error).toContain("not a power that can move");
  });

  it("refuses a key the platform does not know about", async () => {
    const r = await moveCapabilityToVillage(pool, { capability: "nope.invented", holderRoleId: "keepers" });
    expect(r.ok).toBe(false);
  });

  it("refuses a role that does not exist", async () => {
    const r = await moveCapabilityToVillage(pool, { capability: "library.keep", holderRoleId: "ghosts" });
    expect(r.ok).toBe(false);
  });

  it("is idempotent on the capability, which is what a double-closed ballot needs", async () => {
    await moveCapabilityToVillage(pool, { capability: "library.keep", holderRoleId: "keepers" });
    await moveCapabilityToVillage(pool, {
      capability: "library.keep", holderRoleId: "keepers", movedByBallotId: "b-1",
    });
    const rows = await capabilityHoldings(pool);
    expect(rows).toHaveLength(1);
    expect(rows[0].movedByBallotId).toBe("b-1");
  });

  it("hands a power back, and says whether there was one to hand back", async () => {
    await moveCapabilityToVillage(pool, { capability: "library.keep", holderRoleId: "keepers" });
    expect(await returnCapabilityToScaffolding(pool, "library.keep")).toBe(true);
    expect(await villageHeldCapabilities(pool)).toEqual([]);
    expect(await returnCapabilityToScaffolding(pool, "library.keep")).toBe(false);
  });

  describe("a hand-written row, which is the case the boot assertion exists for", () => {
    it("naming a non-transferable key is filtered out of the gate's answer", async () => {
      await pool.query( // module-review-ok: the hand-written row this test exists to catch, on the scratch schema this suite provisioned
        "INSERT INTO capability_holding (capability, holder_role_id) VALUES ('message.send','keepers')",
      );
      // Two locks on the same door: the read filters it, and the boot refuses.
      expect(await villageHeldCapabilities(pool)).toEqual([]);
      await expect(assertCapabilityHoldingInvariants(pool)).rejects.toThrow(/refusing to serve/);
    });

    it("naming a role that no longer exists is a warning and never a refusal", async () => {
      // Reachable by an ordinary admin act (retire a role), locks nobody out
      // permanently because the break-glass is right there, and refusing the
      // boot over it would turn a tidy-up into an outage.
      await pool.query( // module-review-ok: the hand-written row this test exists to catch, on the scratch schema this suite provisioned
        "INSERT INTO capability_holding (capability, holder_role_id) VALUES ('library.keep','gone')",
      );
      await expect(assertCapabilityHoldingInvariants(pool)).resolves.toBeUndefined();
      expect((await capabilityHoldings(pool))[0].holderRoleName).toBeNull();
    });

    it("a clean table boots", async () => {
      await moveCapabilityToVillage(pool, { capability: "library.keep", holderRoleId: "keepers" });
      await expect(assertCapabilityHoldingInvariants(pool)).resolves.toBeUndefined();
    });
  });
});
