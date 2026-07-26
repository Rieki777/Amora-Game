/**
 * S5: proof that the test-database harness works — provision a scratch
 * schema, run EVERY migration through the production engine, and assert the
 * schema that comes out is the one the code believes in.
 *
 * Skips loudly without TEST_DATABASE_URL (a contributor with no database
 * still runs the JSON-era suite); CI always provides one, so main is always
 * gated on this passing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionTestDb, testDbConfigured, type TestDb } from "./testDb";

const configured = testDbConfigured();
if (!configured) {
  // eslint-disable-next-line no-console
  console.warn(
    "[harness.test] TEST_DATABASE_URL not set — DB-backed tests SKIPPED. " +
      "CI runs them; locally, point TEST_DATABASE_URL at a scratch-capable MySQL.",
  );
}

describe.skipIf(!configured)("the test-database harness", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await provisionTestDb();
  }, 120_000);

  afterAll(async () => {
    await db?.drop();
  });

  it("applies every migration from a cold start", async () => {
    const [rows] = await db.conn.query<any[]>("SELECT filename FROM `_migrations_applied` ORDER BY filename");
    const names = rows.map((r) => r.filename);
    expect(names.length).toBeGreaterThanOrEqual(7);
    expect(names[0]).toContain("0001");
    // The registry correction and its seed are present on any fresh fork.
    expect(names.some((n: string) => n.includes("0006_token_registry"))).toBe(true);
    expect(names.some((n: string) => n.includes("0007_village_credits"))).toBe(true);
  });

  it("seeds the token registry the ledger code mirrors", async () => {
    const [rows] = await db.conn.query<any[]>("SELECT slug, kind, governance FROM tokens ORDER BY sort_order");
    const slugs = rows.map((r) => r.slug);
    expect(slugs).toEqual(["gratitude", "amora", "voice", "credits"]);
    const byslug: Record<string, any> = Object.fromEntries(rows.map((r) => [r.slug, r]));
    expect(byslug.gratitude.governance).toBe("platform");
    expect(byslug.amora.governance).toBe("hypha");
    expect(byslug.credits.kind).toBe("credit");
  });

  it("shipped the registry column shape, not the enum", async () => {
    const [cols] = await db.conn.query<any[]>("SHOW COLUMNS FROM token_ledger LIKE 'token_type'");
    expect(String(cols[0].Type)).toContain("varchar");
    expect(String(cols[0].Type)).not.toContain("enum");
  });

  it("round-trips a timestamp without timezone drift", async () => {
    // The rule 2.3 assertion: a Z-disciplined write reads back identical.
    // On a UTC-6 machine with mysql2's default 'local' timezone this fails
    // by six hours, which is exactly the lunar-boundary bug the rule kills.
    const stamp = "2026-07-26 12:34:56";
    await db.conn.query("CREATE TABLE tz_probe (id int PRIMARY KEY, at timestamp)");
    await db.conn.query("INSERT INTO tz_probe VALUES (1, ?)", [stamp]);
    const [rows] = await db.conn.query<any[]>("SELECT at FROM tz_probe WHERE id = 1");
    const read = rows[0].at instanceof Date ? rows[0].at.toISOString() : String(rows[0].at);
    expect(read).toContain("2026-07-26T12:34:56");
  });
});
