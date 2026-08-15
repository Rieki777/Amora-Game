/**
 * Collation alignment.
 *
 * Seven migrations (0046, 0059, 0061, 0069-0072) end their CREATE TABLE with a
 * bare `DEFAULT CHARSET=utf8mb4`. On MySQL 8 that takes the CHARACTER SET's
 * default collation — utf8mb4_0900_ai_ci — and NOT the database's. The other 35
 * table-creating migrations name no charset at all, so they inherit the database
 * default. Where those two disagree, any join across the boundary dies with
 * ER_CANT_AGGREGATE_2COLLATIONS: `mint_rules`→`tokens` (the Mint),
 * `player_characters`→`users` (the character sheet), `voice_claims`→`users` and
 * →`tokens` (the claim path).
 *
 * Railway's default IS utf8mb4_0900_ai_ci, so production is fine and always was.
 * `provisionTestDb` creates scratch schemas with `CHARACTER SET utf8mb4` and no
 * COLLATE, which lands on that same 0900_ai_ci — so the whole suite agreed with
 * production and none of it could see this. VILLAGE_OVERVIEW promises fork, set
 * DATABASE_URL, deploy; on the far more common utf8mb4_general_ci that fork gets
 * a 500 on the Mint, and because Mint.tsx leaves `view` null on a non-ok
 * response, it reads as "Looking." forever rather than as an error.
 *
 * This lives in its own module rather than inside index.ts so a test can import
 * it without booting a server. A regression test that re-implements the fix
 * proves only that the test is self-consistent.
 */
import type mysql from "mysql2/promise";

/** Anything that can run a query — a pool or a bare connection. */
export interface Queryable {
  query(sql: string, values?: unknown[]): Promise<any>;
}

export interface CollationAlignment {
  /** The schema default everything was aligned TO. */
  collation: string;
  /** Table names converted, in the order they were converted. */
  aligned: string[];
}

/**
 * Aligns every base table's collation with THIS schema's own default.
 *
 * Converts TOWARDS the schema default rather than towards a pinned literal, for
 * two reasons. A literal would leave the other 35 tables on the deployer's
 * default and merely move the mismatch. And on an already-correct database this
 * finds nothing to do, so production takes no table rewrite it does not need.
 */
export async function alignTableCollations(
  conn: Queryable,
  log: (msg: string) => void = () => {},
): Promise<CollationAlignment> {
  const [schemaRows] = await conn.query(
    "SELECT DEFAULT_CHARACTER_SET_NAME AS cs, DEFAULT_COLLATION_NAME AS coll " +
      "FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE()",
  );
  const cs = String(schemaRows?.[0]?.cs ?? "");
  const coll = String(schemaRows?.[0]?.coll ?? "");
  // These come from information_schema rather than from anyone's input, but they
  // are interpolated into DDL, which cannot take a placeholder. Refuse anything
  // that is not a plain identifier rather than trusting provenance.
  if (!/^[a-z0-9_]+$/.test(cs) || !/^[a-z0-9_]+$/.test(coll)) {
    throw new Error(`[collation] refusing to build DDL from cs=${cs} coll=${coll}`);
  }

  const [rows] = await conn.query(
    "SELECT TABLE_NAME AS t, TABLE_COLLATION AS c FROM information_schema.TABLES " +
      "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' " +
      "AND TABLE_COLLATION IS NOT NULL AND TABLE_COLLATION <> ?",
    [coll],
  );
  if (!rows.length) {
    log(`[collation] all tables already ${coll}; nothing to align`);
    return { collation: coll, aligned: [] };
  }

  log(`[collation] ${rows.length} table(s) differ from the schema default ${coll}; aligning`);
  const aligned: string[] = [];
  for (const r of rows as Array<{ t: string; c: string }>) {
    const name = String(r.t);
    if (!/^[A-Za-z0-9_]+$/.test(name)) {
      throw new Error(`[collation] refusing to alter a table with an unexpected name: ${name}`);
    }
    await conn.query(`ALTER TABLE \`${name}\` CONVERT TO CHARACTER SET ${cs} COLLATE ${coll}`);
    log(`[collation]   ${name}: ${r.c} -> ${coll}`);
    aligned.push(name);
  }
  return { collation: coll, aligned };
}
