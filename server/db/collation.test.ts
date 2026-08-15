/**
 * The test that was missing, and whose absence let the collation split ship.
 *
 * Every other DB-backed suite provisions with `CHARACTER SET utf8mb4` and no
 * COLLATE, which on MySQL 8 lands on utf8mb4_0900_ai_ci — exactly Railway's
 * default. So the whole suite agreed with production, and a bug that only
 * appears when the database default is something ELSE was invisible to 941
 * passing tests and ten green gates.
 *
 * This suite provisions a schema whose default is deliberately different, the
 * way a fork's database is, and asserts two things: that the break is real
 * without the fix, and that the fix closes it. The first half matters as much
 * as the second — a regression test that cannot fail when the bug returns is
 * decoration.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { alignTableCollations } from "./collation";
import { provisionTestDb, testDbConfigured, type TestDb } from "./testDb";

const configured = testDbConfigured();
if (!configured) {
  // eslint-disable-next-line no-console
  console.warn(
    "[collation.test] TEST_DATABASE_URL not set — DB-backed tests SKIPPED. " +
      "CI runs them; locally, point TEST_DATABASE_URL at a scratch-capable MySQL.",
  );
}

/**
 * The joins that cross the boundary: each pairs a table from one of the seven
 * charset-pinning migrations with a table from the 35 that inherit.
 */
const CROSS_ERA_JOINS: Array<{ what: string; sql: string }> = [
  {
    what: "the Mint: mint_rules -> tokens",
    sql: "SELECT r.id FROM mint_rules r JOIN tokens t ON t.`slug` = r.`token_slug` LIMIT 1",
  },
  {
    what: "the character sheet: player_characters -> users",
    sql: "SELECT p.id FROM player_characters p JOIN users u ON u.`id` = p.`user_id` LIMIT 1",
  },
  {
    what: "the claim path: voice_claims -> users",
    sql: "SELECT v.id FROM voice_claims v JOIN users u ON u.`id` = v.`user_id` LIMIT 1",
  },
  {
    what: "the claim path: voice_claims -> tokens",
    sql: "SELECT v.id FROM voice_claims v JOIN tokens t ON t.`slug` = v.`token_slug` LIMIT 1",
  },
];

describe.skipIf(!configured)("collation alignment", () => {
  describe("on a database whose default is NOT the character set's default", () => {
    let db: TestDb;

    beforeAll(async () => {
      // utf8mb4_general_ci: not Railway's default, and the one most managed
      // MySQL hands a forker who does not name one.
      db = await provisionTestDb({ collation: "utf8mb4_general_ci" });
    }, 180_000);

    afterAll(async () => {
      await db?.drop();
    });

    it("provisions with the collation it was asked for", async () => {
      const [rows] = await db.conn.query<any[]>(
        "SELECT DEFAULT_COLLATION_NAME AS c FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()",
      );
      expect(rows[0].c).toBe("utf8mb4_general_ci");
    });

    it("splits the schema across more than one collation, which is the bug", async () => {
      const [rows] = await db.conn.query<any[]>(
        "SELECT DISTINCT TABLE_COLLATION AS c FROM information_schema.TABLES " +
          "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND TABLE_COLLATION IS NOT NULL",
      );
      const collations = rows.map((r) => r.c).sort();
      // Deliberately NOT asserting what the second collation is called. CI runs
      // MySQL and this machine runs MariaDB 12, and a bare `CHARSET=utf8mb4`
      // resolves to a different name on each (utf8mb4_0900_ai_ci vs MariaDB's
      // own default — which also *has* a utf8mb4_0900_ai_ci, as an alias, so
      // even naming it would not be portable). What matters, and what is true
      // on both, is that the seven pinning migrations do not land on the
      // database's default while the other 35 do.
      expect(collations.length).toBeGreaterThan(1);
      expect(collations).toContain("utf8mb4_general_ci");

      // The pinned tables specifically are the ones off the schema default.
      const [pinned] = await db.conn.query<any[]>(
        "SELECT TABLE_NAME AS t FROM information_schema.TABLES " +
          "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' " +
          "AND TABLE_COLLATION <> 'utf8mb4_general_ci'",
      );
      expect(pinned.map((r) => r.t)).toEqual(
        expect.arrayContaining(["mint_rules", "player_characters", "voice_claims", "archetypes"]),
      );
    });

    it.each(CROSS_ERA_JOINS)("BEFORE the fix, $what throws", async ({ sql }) => {
      // If this ever stops throwing, the migrations were fixed at the source
      // and this whole suite can go — but until then, a passing join here would
      // mean the test is no longer reproducing the condition it claims to.
      await expect(db.conn.query(sql)).rejects.toMatchObject({
        code: "ER_CANT_AGGREGATE_2COLLATIONS",
      });
    });

    it("aligns every differing table onto the schema default", async () => {
      const result = await alignTableCollations(db.conn);
      expect(result.collation).toBe("utf8mb4_general_ci");
      expect(result.aligned.length).toBeGreaterThan(0);
      // The tables the seven migrations create. Named explicitly rather than
      // counted, so adding an eighth pinning migration fails this loudly
      // instead of quietly changing a number.
      expect(result.aligned).toEqual(
        expect.arrayContaining(["mint_rules", "player_characters", "voice_claims", "archetypes"]),
      );

      const [rows] = await db.conn.query<any[]>(
        "SELECT DISTINCT TABLE_COLLATION AS c FROM information_schema.TABLES " +
          "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' AND TABLE_COLLATION IS NOT NULL",
      );
      expect(rows.map((r) => r.c)).toEqual(["utf8mb4_general_ci"]);
    }, 180_000);

    it.each(CROSS_ERA_JOINS)("AFTER the fix, $what runs", async ({ sql }) => {
      await expect(db.conn.query(sql)).resolves.toBeDefined();
    });

    it("is idempotent — a second run finds nothing to do", async () => {
      const again = await alignTableCollations(db.conn);
      expect(again.aligned).toEqual([]);
    });
  });

  describe("on a database that already agrees with itself", () => {
    let db: TestDb;

    beforeAll(async () => {
      // No collation named: the default every other suite gets, and what
      // Railway is. Production must take NO table rewrite.
      db = await provisionTestDb();
    }, 180_000);

    afterAll(async () => {
      await db?.drop();
    });

    it("is a no-op, so production rewrites nothing", async () => {
      const result = await alignTableCollations(db.conn);
      expect(result.aligned).toEqual([]);
    });

    it.each(CROSS_ERA_JOINS)("$what already runs", async ({ sql }) => {
      await expect(db.conn.query(sql)).resolves.toBeDefined();
    });
  });
});
