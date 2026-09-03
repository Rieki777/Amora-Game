/**
 * R9, the allowance a village left unused, read back off the snapshot rows.
 *
 * Rye ruled on 2026-09-03 that a village should be shown how much of its
 * gratitude went unused, "which would encourage more participation in
 * gratitude". Before this lane nothing computed it: `gratitude_senders_distinct`
 * and `gratitude_recipients_distinct` count PEOPLE, and an allowance is
 * computed on demand and stored nowhere, so a screen printing an unspent
 * figure would have been printing a number the code could not produce.
 *
 * EVERY TEST HERE READS AN OUTCOME. Not "snapshotAllowance returned 28": the
 * rows in `health_snapshots` after a close, which is the only thing any
 * surface will ever read. Each one was also run with the reader deleted, and
 * each one went red; a test that passes with the feature removed is measuring
 * the test.
 *
 * Skips loudly without TEST_DATABASE_URL, like every DB-backed suite here.
 */
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { provisionTestDb, testDbConfigured, type TestDb } from "../db/testDb";
import { HEALTH_METRICS_BY_KEY, SNAPSHOT_METRICS } from "../../shared/healthMetrics";
import { allowanceFor } from "./economy";
import { loadVariables } from "./variables";
import { snapshotCycle, type SnapshotCycle } from "./health";

const configured = testDbConfigured();
if (!configured) {
  // eslint-disable-next-line no-console
  console.warn("[health.test] TEST_DATABASE_URL not set. DB-backed tests SKIPPED.");
}

const KEYS = ["gratitude_allowance_total", "gratitude_allowance_given", "gratitude_allowance_unspent"] as const;

/**
 * The registry half needs no database, so it runs everywhere. A metric key
 * written by the close and absent from the registry is collected forever and
 * displayed never: `VillageHealth.tsx` builds its tile labels from
 * SNAPSHOT_METRICS, so the registry entry IS the display.
 */
describe("the R9 allowance metrics in the registry", () => {
  it("declares all three as snapshots, in the recognition token, frozen at close", () => {
    for (const key of KEYS) {
      const def = HEALTH_METRICS_BY_KEY[key];
      expect(def, `${key} must exist in the registry`).toBeTruthy();
      expect(def.kind).toBe("snapshot");
      expect(def.unit).toBe("tokens");
      expect(def.label.length, `${key} needs a label the dashboard can print`).toBeGreaterThan(0);
      // The description has to say which token and that the figure is frozen,
      // because both are invisible from the number itself.
      expect(def.description).toMatch(/recognition token|Same token/);
      expect(def.description).toMatch(/never recomputed/);
      expect(SNAPSHOT_METRICS.some((m) => m.key === key)).toBe(true);
    }
    // Minor units, said once and inherited by the other two through
    // "Same token and units as the total".
    expect(HEALTH_METRICS_BY_KEY.gratitude_allowance_total.description).toMatch(/minor units/);
    // No doughnut placement: `shareOf` accepts "members_total" or "percent",
    // and given-over-total is neither. A wedge dividing tokens by people
    // would be a shape with no meaning.
    for (const key of KEYS) expect(HEALTH_METRICS_BY_KEY[key].doughnut).toBeUndefined();
  });
});

let db: TestDb;
let pool: mysql.Pool;

/** A cycle per test, on its own day, so no two tests share a window. */
function cycleOf(day: number): SnapshotCycle {
  return {
    id: `lunar-${String(day).padStart(6, "0")}`,
    cycleNumber: day,
    startsAt: new Date(Date.UTC(2026, 0, day, 0, 0, 0)).toISOString(),
    endsAt: new Date(Date.UTC(2026, 0, day + 1, 0, 0, 0)).toISOString(),
  };
}
const inside = (day: number) => new Date(Date.UTC(2026, 0, day, 12, 0, 0));

async function member(id: string): Promise<void> {
  await pool.query(
    "INSERT INTO `users` (`id`, `name`, `email`, `password_hash`) VALUES (?,?,?,'x')",
    [id, id, `${id}@village.test`],
  );
}

async function gift(id: string, from: string, to: string, amount: number, cycle: SnapshotCycle): Promise<void> {
  await pool.query(
    "INSERT INTO `gratitude_log` (`id`,`kind`,`from_id`,`to_id`,`amount`,`message`,`cycle_id`,`cycle_number`,`at`) " +
      "VALUES (?,'gratitude',?,?,?,'thank you',?,?,?)",
    [id, from, to, amount, cycle.id, cycle.cycleNumber, inside(cycle.cycleNumber)],
  );
}

/** A reversal of one gift, keyed the way the engine keys it. */
async function reverse(id: string, noteId: string, amount: number, at: Date): Promise<void> {
  await pool.query(
    "INSERT INTO `token_ledger` (`id`,`from_account`,`to_account`,`token_type`,`amount`,`source`,`source_ref`,`idempotency_key`,`at`) " +
      "VALUES (?,?,?,'gratitude',?,'reversal',?,?,?)",
    [id, "mem:reversed", "sys:gratitude-pool", amount, `gratitude.given:local:${noteId}`, `rev-${id}`, at],
  );
}

/** What a surface would read: the frozen rows for one cycle. */
async function snapshotOf(cycleNumber: number): Promise<Record<string, { value: number; raw: unknown; meta: any }>> {
  const [rows] = await pool.query<any[]>(
    "SELECT metric_key, value, meta FROM health_snapshots WHERE cycle_number = ?",
    [cycleNumber],
  );
  const out: Record<string, { value: number; raw: unknown; meta: any }> = {};
  for (const r of rows) {
    out[String(r.metric_key)] = {
      value: Number(r.value),
      raw: r.value,
      meta: typeof r.meta === "string" ? JSON.parse(r.meta) : r.meta,
    };
  }
  return out;
}

/** The seam the close fills: what each member's stage multiplied their allowance by. */
const stagesFrom = (byId: Record<string, number>) => ({
  stageMultiplierFor: async (userId: string) => byId[userId] ?? 0,
});

describe.skipIf(!configured)("R9: the allowance a village left unused", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 5 });
    // A base of 10 rather than the shipped 100, so every figure below can be
    // stated as a whole number a reader can check by hand.
    await pool.query(
      "INSERT INTO `game_variables` (`config_key`,`value`,`value_type`) VALUES ('gratitude.base_budget','10','integer') " +
        "ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)",
    );
    await loadVariables(pool);
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  beforeEach(async () => {
    for (const t of ["health_snapshots", "gratitude_log", "token_ledger", "users"]) {
      await pool.query("DELETE FROM `" + t + "`");
    }
  });

  it("totals what three members at two stages could have given, and what they did", async () => {
    const cycle = cycleOf(2);
    await member("gives-two");
    await member("gives-all");
    await member("gives-none");
    // Two stages: a multiplier of 1 (an allowance of 10) and one of 2 (20).
    const stages = stagesFrom({ "gives-two": 1, "gives-all": 1, "gives-none": 2 });

    await gift("g-two", "gives-two", "gives-none", 2, cycle);
    await gift("g-all", "gives-all", "gives-none", 10, cycle);

    await snapshotCycle(pool, cycle, new Set(), stages);
    const snap = await snapshotOf(cycle.cycleNumber);

    // 10 + 10 + 20 = 40 could have been given. 2 + 10 = 12 was. 28 was not.
    expect(snap.gratitude_allowance_total.value).toBe(40);
    expect(snap.gratitude_allowance_given.value).toBe(12);
    expect(snap.gratitude_allowance_unspent.value).toBe(28);
    expect(snap.gratitude_allowance_total.meta.membersCounted).toBe(3);
    expect(snap.gratitude_allowance_total.meta.baseBudget).toBe(10);

    /*
     * THE CROSS-CHECK, and the reason this test is worth more than its
     * arithmetic. `Math.round(base * multiplier)` is copied out of
     * `allowanceFor`, so a divergence between the engine's answer and this
     * snapshot is exactly the defect a copied line invites. Asked of the
     * engine itself, per member, and summed.
     */
    const engine = [
      await allowanceFor(pool, "gives-two", 1, inside(2)),
      await allowanceFor(pool, "gives-all", 1, inside(2)),
      await allowanceFor(pool, "gives-none", 2, inside(2)),
    ];
    expect(engine.map((a) => a.total)).toEqual([10, 10, 20]);
    expect(engine.map((a) => a.spent)).toEqual([2, 10, 0]);
    expect(engine.reduce((n, a) => n + a.total, 0)).toBe(snap.gratitude_allowance_total.value);
    expect(engine.reduce((n, a) => n + a.spent, 0)).toBe(snap.gratitude_allowance_given.value);
  });

  it("hands the allowance back when a gift is reversed inside the window", async () => {
    const cycle = cycleOf(4);
    await member("gives-two");
    await member("gives-all");
    await member("gives-none");
    const stages = stagesFrom({ "gives-two": 1, "gives-all": 1, "gives-none": 2 });
    await gift("g-two", "gives-two", "gives-none", 2, cycle);
    await gift("g-all", "gives-all", "gives-none", 10, cycle);

    // Two of the twelve given come back, inside the window.
    await reverse("rv-in", "g-two", 2, inside(cycle.cycleNumber));
    // And two more come back a day later, outside it. A reversal that lands
    // in the next moon belongs to the next moon: counting it here would
    // rewrite a lunation that is already over.
    await reverse("rv-out", "g-all", 2, inside(cycle.cycleNumber + 1));

    await snapshotCycle(pool, cycle, new Set(), stages);
    const snap = await snapshotOf(cycle.cycleNumber);

    expect(snap.gratitude_allowance_total.value).toBe(40);
    expect(snap.gratitude_allowance_given.value).toBe(10);
    expect(snap.gratitude_allowance_unspent.value).toBe(30);
    expect(snap.gratitude_allowance_given.meta).toEqual({ rawGiven: 12, reversed: 2 });
  });

  it("writes nothing new when the same cycle is closed twice", async () => {
    const cycle = cycleOf(6);
    await member("gives-two");
    const stages = stagesFrom({ "gives-two": 1 });
    await gift("g-two", "gives-two", "gives-two", 2, cycle);

    await snapshotCycle(pool, cycle, new Set(), stages);
    const first = await snapshotOf(cycle.cycleNumber);
    const [[before]] = await pool.query<any[]>(
      "SELECT COUNT(*) AS n FROM health_snapshots WHERE cycle_number = ?",
      [cycle.cycleNumber],
    );

    // The world moves between the two closes: a new member, more giving. A
    // recomputing close would show all of it. This one is frozen.
    await member("late-arrival");
    await gift("g-late", "late-arrival", "gives-two", 7, cycle);
    await snapshotCycle(pool, cycle, new Set(), stagesFrom({ "gives-two": 1, "late-arrival": 3 }));

    const second = await snapshotOf(cycle.cycleNumber);
    const [[after]] = await pool.query<any[]>(
      "SELECT COUNT(*) AS n FROM health_snapshots WHERE cycle_number = ?",
      [cycle.cycleNumber],
    );
    expect(Number(after.n)).toBe(Number(before.n));
    for (const key of KEYS) expect(second[key].value).toBe(first[key].value);
    expect(second.gratitude_allowance_total.value).toBe(10);
    expect(second.gratitude_allowance_given.value).toBe(2);
    expect(second.gratitude_allowance_unspent.value).toBe(8);
  });

  it("records real zeros for a village with no members", async () => {
    const cycle = cycleOf(8);
    await snapshotCycle(pool, cycle, new Set(), stagesFrom({}));
    const snap = await snapshotOf(cycle.cycleNumber);
    for (const key of KEYS) {
      // Present, and zero. An empty state and a measured zero are different
      // facts: absent means the close could not say, and 0 means it did say.
      expect(snap[key], `${key} must be written for an empty village`).toBeTruthy();
      expect(snap[key].raw).not.toBeNull();
      expect(snap[key].value).toBe(0);
    }
    expect(snap.gratitude_allowance_total.meta.membersCounted).toBe(0);
  });

  it("writes no allowance figures at all when the close names no stage source", async () => {
    const cycle = cycleOf(10);
    await member("gives-two");
    await gift("g-two", "gives-two", "gives-two", 2, cycle);

    await snapshotCycle(pool, cycle, new Set());
    const snap = await snapshotOf(cycle.cycleNumber);

    // The close ran: the roster metric is there.
    expect(snap.members_total.value).toBe(1);
    // And the three are absent, not zero. A zero here would read as "this
    // village gave its whole allowance away" on the one screen that exists
    // to say otherwise.
    for (const key of KEYS) expect(snap[key]).toBeUndefined();
  });

  it("puts no member into health_snapshots", async () => {
    const cycle = cycleOf(12);
    await member("gives-two");
    await member("gives-all");
    await gift("g-two", "gives-two", "gives-all", 2, cycle);
    await snapshotCycle(pool, cycle, new Set(), stagesFrom({ "gives-two": 1, "gives-all": 1 }));

    const [rows] = await pool.query<any[]>(
      "SELECT metric_key, meta FROM health_snapshots WHERE cycle_number = ?",
      [cycle.cycleNumber],
    );
    expect(rows.length).toBeGreaterThan(0);
    // The three must be THERE, or this test passes on a village that recorded
    // nothing and proves only that nothing contains a member id.
    const written = new Set(rows.map((r) => String(r.metric_key)));
    for (const key of KEYS) expect(written.has(key), `${key} must be among the frozen rows`).toBe(true);
    for (const r of rows) {
      const blob = `${String(r.metric_key)} ${typeof r.meta === "string" ? r.meta : JSON.stringify(r.meta ?? null)}`;
      expect(blob, "no member id may ride in a key or in meta").not.toContain("gives-two");
      expect(blob).not.toContain("gives-all");
    }
  });
});
