/**
 * Standing examples: the two promises, and the trap that broke them once.
 *
 * The promises are that examples cannot become economic state, and that
 * publishing something real clears that module for good. The trap is that
 * three of these tables are served by memory-cached collections, so a raw
 * DELETE empties the database and the page keeps rendering — found by running
 * the flow end-to-end, not by reading the code.
 *
 * Skips loudly without TEST_DATABASE_URL, like every DB-backed suite here.
 */
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { provisionTestDb, testDbConfigured, type TestDb } from "../db/testDb";
import { dbCollection } from "../repos/store-db";
import {
  EXAMPLE_TABLES,
  hasRealContent,
  isRetired,
  isSeeded,
  loadExampleSeed,
  loadExampleState,
  modulesWithExamples,
  retireExamples,
  seedExamples,
  wireExampleCaches,
} from "./examples";

const configured = testDbConfigured();
if (!configured) {
  // eslint-disable-next-line no-console
  console.warn("[examples.test] TEST_DATABASE_URL not set — DB-backed tests SKIPPED.");
}

describe.skipIf(!configured)("standing examples", () => {
  let db: TestDb;
  let pool: mysql.Pool;
  let seed: any;

  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 4 });
    seed = loadExampleSeed(new URL("../seeds", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
    expect(seed, "examples-seed.json must be readable").toBeTruthy();
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  // Full isolation: the bookkeeping AND the rows. Clearing only example_state
  // leaves rows behind, and the next INSERT IGNORE writes nothing — which
  // reads as a seeding bug rather than the leftover state it actually is.
  beforeEach(async () => {
    await pool.query("DELETE FROM example_state");
    for (const tables of Object.values(EXAMPLE_TABLES)) {
      for (const table of tables) {
        try { await pool.query(`DELETE FROM \`${table}\` WHERE is_example = 1`); } catch { /* no such column */ }
      }
    }
    await pool.query("DELETE FROM users WHERE is_example = 1");
    await pool.query("DELETE FROM tools WHERE id = 'real-1'");
    await loadExampleState(pool);
  });

  it("seeds a module and marks it as showing examples", async () => {
    const n = await seedExamples(pool, "library", seed, { force: true });
    expect(n).toBeGreaterThan(0);
    expect(isSeeded("library")).toBe(true);
    expect(modulesWithExamples()).toContain("library");

    const [[row]] = await pool.query<any[]>(
      "SELECT COUNT(*) n FROM library_items WHERE is_example = 1",
    );
    expect(Number(row.n)).toBe(3);
  });

  it("creates no economic state — the whole premise", async () => {
    for (const id of Object.keys(EXAMPLE_TABLES)) {
      await seedExamples(pool, id, seed, { force: true });
    }
    // If any of these is non-zero, an example has become real value.
    // (badge_awards is asserted separately: example awards exist by design,
    // and their invariant is WHO holds them, never whether they exist.)
    for (const table of [
      "token_ledger", "library_loans", "stays", "stay_purchases",
      "exchange_orders", "product_purchases", "fiat_charges",
    ]) {
      const [[r]] = await pool.query<any[]>(`SELECT COUNT(*) n FROM \`${table}\``);
      expect(Number(r.n), `${table} must stay empty`).toBe(0);
    }
  });

  it("gives example awards only to example identities, and none on warnings", async () => {
    // Capabilities on example badges are the demonstration (Rye, 2026-08-02).
    // What keeps them harmless: badgeGrantsFor() reads awards per
    // authenticated user, example identities never authenticate, and every
    // route that could hand an award to a real member refuses examples. So
    // the load-bearing assertions are about the AWARDS.
    await seedExamples(pool, "badges", seed, { force: true });
    const [awards] = await pool.query<any[]>(
      "SELECT COUNT(*) n FROM badge_awards WHERE is_example = 1",
    );
    expect(Number(awards[0].n), "the seed demonstrates held badges").toBeGreaterThan(0);
    const [leaked] = await pool.query<any[]>(
      "SELECT COUNT(*) n FROM badge_awards a JOIN users u ON u.id = a.user_id " +
        "WHERE a.is_example = 1 AND u.is_example = 0",
    );
    expect(Number(leaked[0].n), "no example award may touch a real user").toBe(0);
    const [onWarning] = await pool.query<any[]>(
      "SELECT COUNT(*) n FROM badge_awards a JOIN badges b ON b.id = a.badge_id " +
        "WHERE a.is_example = 1 AND b.kind = 'warning'",
    );
    expect(Number(onWarning[0].n), "a warning award is open state").toBe(0);
    // And every capability key on an example badge is a real registry key —
    // the gate silently ignores unknowns, which would demo nothing.
    const [defs] = await pool.query<any[]>(
      "SELECT capabilities FROM badges WHERE is_example = 1",
    );
    const { ALL_CAPABILITIES } = await import("../../shared/capabilities");
    const valid = new Set<string>(ALL_CAPABILITIES);
    for (const r of defs) {
      const caps = typeof r.capabilities === "string" ? JSON.parse(r.capabilities) : r.capabilities;
      for (const key of caps ?? []) {
        expect(valid.has(key), `"${key}" must be a registered capability`).toBe(true);
      }
    }
  });

  it("retires a module's examples and leaves every other module alone", async () => {
    await seedExamples(pool, "library", seed, { force: true });
    await seedExamples(pool, "tools", seed, { force: true });

    await retireExamples(pool, "tools", "first_real_item");

    expect(isRetired("tools")).toBe(true);
    expect(isRetired("library")).toBe(false);
    expect(modulesWithExamples()).toContain("library");
    expect(modulesWithExamples()).not.toContain("tools");

    const [[tools]] = await pool.query<any[]>("SELECT COUNT(*) n FROM tools WHERE is_example = 1");
    expect(Number(tools.n)).toBe(0);
    const [[lib]] = await pool.query<any[]>("SELECT COUNT(*) n FROM library_items WHERE is_example = 1");
    expect(Number(lib.n)).toBe(3);
  });

  it("reloads the caches that a raw DELETE cannot reach", async () => {
    // The bug this exists for: tools/circles/roles are memory-cached, so
    // retirement emptied MySQL and the API served the deleted rows anyway.
    const reloaded: string[][] = [];
    wireExampleCaches(async (tables) => { reloaded.push(tables); });
    await seedExamples(pool, "tools", seed, { force: true });
    await retireExamples(pool, "tools", "admin_cleared");
    wireExampleCaches(async () => {});

    expect(reloaded.length).toBeGreaterThanOrEqual(2); // once seeding, once retiring
    expect(reloaded.every((t) => t.includes("tools"))).toBe(true);
  });

  it("refuses to come back once retired", async () => {
    await seedExamples(pool, "tools", seed, { force: true });
    await retireExamples(pool, "tools", "first_real_item");

    // Not with a plain call, and not with force either: retired is permanent.
    expect(await seedExamples(pool, "tools", seed)).toBe(0);
    expect(await seedExamples(pool, "tools", seed, { force: true })).toBe(0);
    const [[r]] = await pool.query<any[]>("SELECT COUNT(*) n FROM tools WHERE is_example = 1");
    expect(Number(r.n)).toBe(0);
  });

  it("never layers examples over content the village made itself", async () => {
    await pool.query(
      "INSERT INTO tools (id, name, purpose, url, cta_label, category, visibility) " +
        "VALUES ('real-1','A real tool','Made by the village','https://example.net','Open','communication','public')",
    );
    expect(await hasRealContent(pool, "tools")).toBe(true);

    const n = await seedExamples(pool, "tools", seed);
    expect(n).toBe(0);
    const [[r]] = await pool.query<any[]>("SELECT COUNT(*) n FROM tools WHERE is_example = 1");
    expect(Number(r.n)).toBe(0);
  });

  it("is idempotent — a second seed writes nothing", async () => {
    const first = await seedExamples(pool, "library", seed, { force: true });
    expect(first).toBeGreaterThan(0);
    // force skips the bookkeeping guards, so this proves the INSERT IGNOREs
    // hold on their own rather than the state map hiding a double-write.
    await seedExamples(pool, "library", seed, { force: true });
    const [[r]] = await pool.query<any[]>("SELECT COUNT(*) n FROM library_items WHERE is_example = 1");
    expect(Number(r.n)).toBe(3);
  });

  it("survives replaceAll — the laundering trap", async () => {
    // dbCollection.replaceAll is DELETE-all + re-INSERT of the SPEC'd columns
    // only. With is_example missing from the spec it came back as DEFAULT 0,
    // so the daily tools-link-check job quietly turned every example tool into
    // permanent "real" content that retirement could never find again.
    const tools = dbCollection(pool, {
      table: "tools",
      orderBy: "`sort_order`, `name`",
      columns: [
        { js: "id", db: "id" }, { js: "name", db: "name" },
        { js: "purpose", db: "purpose" }, { js: "url", db: "url" },
        { js: "ctaLabel", db: "cta_label" }, { js: "category", db: "category" },
        { js: "visibility", db: "visibility" },
        { js: "order", db: "sort_order", kind: "int" },
        { js: "enabled", db: "enabled", kind: "bool" },
        { js: "isExample", db: "is_example", kind: "bool" },
      ],
    });
    await seedExamples(pool, "tools", seed, { force: true });
    await tools.load();
    await tools.replaceAll(tools.all());

    const [[r]] = await pool.query<any[]>("SELECT COUNT(*) n FROM tools WHERE is_example = 1");
    expect(Number(r.n), "replaceAll must not strip the flag").toBe(3);
    // And retirement can still find them afterwards.
    await retireExamples(pool, "tools", "admin_cleared");
    const [[after]] = await pool.query<any[]>("SELECT COUNT(*) n FROM tools WHERE is_example = 1");
    expect(Number(after.n)).toBe(0);
  });

  it("retires forum and feed separately though they share one table", async () => {
    await seedExamples(pool, "forum", seed, { force: true });
    await seedExamples(pool, "feed", seed, { force: true });

    await retireExamples(pool, "forum", "first_real_item");

    // Feed's posts are untouched and it is still honestly labelled…
    const [[feedRows]] = await pool.query<any[]>(
      "SELECT COUNT(*) n FROM forum_threads WHERE is_example = 1 AND id LIKE 'ex-feed-%'",
    );
    expect(Number(feedRows.n), "the first real forum thread must not delete feed examples").toBe(3);
    expect(modulesWithExamples()).toContain("feed");

    // …while forum's threads AND its replies are gone, leaving no orphans.
    const [[forumRows]] = await pool.query<any[]>(
      "SELECT COUNT(*) n FROM forum_threads WHERE is_example = 1 AND id LIKE 'ex-thread-%'",
    );
    expect(Number(forumRows.n)).toBe(0);
    const [[replies]] = await pool.query<any[]>("SELECT COUNT(*) n FROM forum_replies WHERE is_example = 1");
    expect(Number(replies.n), "orphan replies would keep forum falsely labelled").toBe(0);
    expect(modulesWithExamples()).not.toContain("forum");
  });

  it("reads health's real content from the land's ledger, not the snapshot spine", async () => {
    // snapshotCycle writes health_snapshots on every cycle close whether or
    // not the module is on, so counting those rows meant a village that had
    // settled one lunation could never see the health examples.
    await pool.query(
      "INSERT INTO health_snapshots (id, cycle_number, metric_key, value) VALUES ('snap-1-members_total', 1, 'members_total', 7)",
    );
    expect(await hasRealContent(pool, "health")).toBe(false);

    const n = await seedExamples(pool, "health", seed);
    expect(n, "an infrastructure-written snapshot must not suppress seeding").toBeGreaterThan(0);
  });

  it("gives the example identities no way to sign in", async () => {
    await seedExamples(pool, "forum", seed, { force: true });
    const [rows] = await pool.query<any[]>(
      "SELECT id, password_hash, email FROM users WHERE is_example = 1",
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.password_hash ?? "").toBe("");
      expect(String(r.email)).toContain("@examples.invalid");
    }
  });
});
