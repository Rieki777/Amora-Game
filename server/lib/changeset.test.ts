/**
 * The change-set executor: two phases, one ledger row per write, and a refusal
 * that names the element.
 *
 * The rules pinned here:
 *
 *  - item four of seven failing validation applies NOTHING and names item four;
 *  - the legacy apply THROWS before its first write on an element it cannot
 *    type, instead of skipping it and stamping the proposal applied;
 *  - a change set can never switch the governance module off;
 *  - every write leaves a `governance_element_ledger` row carrying the old and
 *    the new value;
 *  - the caches are reloaded from the database after a set applies;
 *  - the dry run writes nothing, and previews what would actually run.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { provisionTestDb, testDbConfigured, type TestDb } from "../db/testDb";
import {
  applyChangeSet,
  applyMechanicsProposal,
  changeSetWaitsForCycleClose,
  elementsFor,
  NEVER_BY_CHANGESET,
  UntypedElementError,
  validateElements,
  type ChangesetDeps,
} from "./changeset";
import { dryRunProposal } from "./proposalDryRun";
import { loadVariables, numberVar } from "./variables";

const configured = testDbConfigured();
let db: TestDb;
let pool: mysql.Pool;
let reloads = 0;
let ledgerRows: string[] = [];

const deps = (): ChangesetDeps => ({
  pool,
  recordMechanicsChange: async (key) => {
    ledgerRows.push(key);
  },
  reloadCaches: async () => {
    reloads += 1;
    await loadVariables(pool);
  },
  sharedPasswordPosture: () => false,
});

/** Seven items, of which the fourth is a dial the registry does not have. */
const sevenWithABadFourth = () => [
  { kind: "dial", key: "governance.vote_days", to: "9" },
  { kind: "dial", key: "governance.unity_pct", to: "70" },
  { kind: "dial", key: "governance.quorum_pct", to: "25" },
  { kind: "dial", key: "governance.a_dial_that_never_existed", to: "1" },
  { kind: "dial", key: "governance.sensing_days", to: "5" },
  { kind: "dial", key: "governance.consent_window_days", to: "4" },
  { kind: "dial", key: "governance.change_cooldown_days", to: "2" },
];

beforeAll(async () => {
  if (!configured) return;
  db = await provisionTestDb();
  pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 8 }); // module-review-ok: the S5 scratch-schema harness pool, the ballots.test.ts shape
  await loadVariables(pool);
}, 300000);

afterAll(async () => {
  if (pool) await pool.end();
  if (db) await db.drop();
});

beforeEach(async () => {
  if (!configured) return;
  reloads = 0;
  ledgerRows = [];
  await pool.query("DELETE FROM governance_element_ledger"); // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
});

describe.skipIf(!configured)("phase one refuses before anything is written", () => {
  it("names item four of seven and applies nothing", async () => {
    const before = numberVar("governance.vote_days");
    const result = await applyChangeSet(deps(), {
      ballotId: "bal-refusal",
      proposalRef: "gm:refusal",
      actor: "u-a",
      changes: sevenWithABadFourth(),
    });
    expect(result.ok).toBe(false);
    expect(result.refusal?.index).toBe(3);
    expect(result.refusal?.sentence).toContain("Item 4 of 7");
    expect(result.refusal?.sentence).toContain("no longer exists in the registry");
    expect(result.applied).toEqual([]);
    // Not one write, including the three elements that came BEFORE the bad one.
    await loadVariables(pool);
    expect(numberVar("governance.vote_days")).toBe(before);
    expect(await elementsFor(pool, "bal-refusal")).toEqual([]);
    expect(ledgerRows).toEqual([]);
  });

  it("refuses a dial the village does not govern", async () => {
    const out = await validateElements(deps(), [{ kind: "dial", key: "governance.weight_mode", to: "token" }]);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.problem).toContain("community-governable");
  });

  it("refuses to switch the part of the Game that holds the vote", async () => {
    expect(NEVER_BY_CHANGESET.has("governance")).toBe(true);
    const out = await validateElements(deps(), [{ kind: "module_lifecycle", moduleId: "governance", to: "off" }]);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.problem).toContain("cannot be switched by a vote");
  });

  it("refuses to switch into token mode on a token that cannot weigh a vote", async () => {
    const out = await validateElements(deps(), [
      { kind: "mode_switch", to: "token", weightToken: "a-token-this-village-never-made" },
    ]);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.problem).toContain("no token called");
  });

  it("refuses a weight allocation with no reason", async () => {
    const out = await validateElements(deps(), [
      { kind: "weight_allocation", userId: "u-a", to: "5", note: "" },
    ]);
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.problem).toContain("reason");
  });

  it("calls a whole set a Game change the moment one element is one", async () => {
    const out = await validateElements(deps(), [{ kind: "dial", key: "governance.vote_days", to: "8" }]);
    expect(out.ok).toBe(true);
    expect(out.ok === true && out.kind).toBe("game_change");
  });
});

describe.skipIf(!configured)("phase two writes, and records what it wrote", () => {
  it("applies every element and leaves one ledger row per write", async () => {
    const result = await applyChangeSet(deps(), {
      ballotId: "bal-good",
      proposalRef: "gm:good",
      actor: "u-a",
      changes: [
        { kind: "dial", key: "governance.vote_days", to: "9" },
        { kind: "dial", key: "governance.sensing_days", to: "5" },
      ],
    });
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual(["governance.vote_days", "governance.sensing_days"]);
    const rows = await elementsFor(pool, "bal-good");
    expect(rows.length).toBe(2);
    expect(rows[0].newValue).toBe("9");
    expect(rows[0].oldValue).not.toBeNull();
    expect(rows[0].sentence).toContain("governance.vote_days moves from");
    // The caches come back from the database, not from what the routine believes.
    expect(reloads).toBeGreaterThanOrEqual(1);
    await loadVariables(pool);
    expect(numberVar("governance.vote_days")).toBe(9);
  });

  it("orders the harder-to-undo writes after the easier ones", async () => {
    await applyChangeSet(deps(), {
      ballotId: "bal-order",
      proposalRef: "gm:order",
      actor: "u-a",
      changes: [
        { kind: "weight_allocation", userId: "u-order", to: "3", note: "the founding table" },
        { kind: "dial", key: "governance.quorum_pct", to: "24" },
      ],
    });
    const rows = await elementsFor(pool, "bal-order");
    expect(rows.map((r) => r.kind)).toEqual(["dial", "weight_allocation"]);
  });
});

describe.skipIf(!configured)("the legacy apply throws rather than half-applying", () => {
  it("throws before the first write on an element it cannot carry out", async () => {
    const before = numberVar("governance.consent_window_days");
    await expect(
      applyMechanicsProposal(
        deps(),
        {
          id: "gmp-untyped",
          title: "A brand change this build cannot make",
          changeSet: [
            { kind: "dial", key: "governance.consent_window_days", to: "6" },
            { kind: "brand_field", field: "project.name", to: "Something" },
          ],
          proposerUserId: "u-a",
          hyphaRef: null,
          status: "passed_onsite",
          ballotId: "bal-untyped",
        },
        "u-a",
        { onApplied: async () => {} },
      ),
    ).rejects.toBeInstanceOf(UntypedElementError);
    await loadVariables(pool);
    expect(numberVar("governance.consent_window_days")).toBe(before);
    expect(await elementsFor(pool, "bal-untyped")).toEqual([]);
  });

  it("names the element in the throw, by its place in the set", async () => {
    try {
      await applyMechanicsProposal(
        deps(),
        {
          id: "gmp-untyped-2",
          title: "Two changes, one impossible",
          changeSet: [
            { kind: "dial", key: "governance.vote_days", to: "8" },
            { kind: "role", act: "seat", role: "steward", userId: "u-a" },
          ],
          proposerUserId: "u-a",
          hyphaRef: null,
          status: "passed_onsite",
          ballotId: "bal-untyped-2",
        },
        "u-a",
        { onApplied: async () => {} },
      );
      throw new Error("it should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(UntypedElementError);
      expect((e as UntypedElementError).index).toBe(1);
      expect((e as UntypedElementError).kind).toBe("role");
      expect((e as Error).message).toContain("Item 2 of 2");
    }
  });

  it("returns cleanly on a proposal that already applied", async () => {
    const out = await applyMechanicsProposal(
      deps(),
      { id: "gmp-done", title: "Already", changeSet: [], proposerUserId: "u-a", hyphaRef: null, status: "applied" },
      "u-a",
      { onApplied: async () => { throw new Error("must not be called"); } },
    );
    expect(out.ok).toBe(true);
    expect(out.applied).toEqual([]);
  });
});

describe.skipIf(!configured)("the dry run writes nothing", () => {
  const preview = (changes: unknown[]) =>
    dryRunProposal(deps(), {
      changes: changes as never,
      timing: "next_moon",
      closesAt: new Date("2026-09-10T12:00:00.000Z"),
      vetoHours: 72,
      nextNewMoonAfter: (after: Date) => new Date(after.getTime() + 20 * 24 * 60 * 60 * 1000),
    });

  it("previews a good set and changes nothing on disk", async () => {
    const before = numberVar("governance.change_cooldown_days");
    const out = await preview([{ kind: "dial", key: "governance.change_cooldown_days", to: "7" }]);
    expect(out.wouldApply).toBe(true);
    expect(out.elements[0].newValue).toBe("7");
    expect(out.landsAt).toBe("2026-09-30T12:00:00.000Z");
    await loadVariables(pool);
    expect(numberVar("governance.change_cooldown_days")).toBe(before);
    const [rows] = await pool.query<any[]>("SELECT COUNT(*) AS n FROM governance_element_ledger");
    expect(Number(rows[0].n)).toBe(0);
  });

  it("previews the same blocker the executor would raise, on the same element", async () => {
    const out = await preview(sevenWithABadFourth());
    expect(out.wouldApply).toBe(false);
    expect(out.blocker?.index).toBe(3);
    const real = await applyChangeSet(deps(), {
      ballotId: "bal-same",
      proposalRef: "gm:same",
      actor: "u-a",
      changes: sevenWithABadFourth(),
    });
    expect(real.refusal?.index).toBe(out.blocker?.index);
    expect(real.refusal?.sentence).toBe(out.blocker?.sentence);
  });
});

describe("the cycle-timed predicate, with no database", () => {
  it("says a set holding a cycle-timed dial waits as a whole", () => {
    expect(changeSetWaitsForCycleClose([{ key: "governance.vote_days" }])).toBe(false);
    expect(changeSetWaitsForCycleClose([{ key: "a.key.that.does.not.exist" }])).toBe(false);
  });
});
