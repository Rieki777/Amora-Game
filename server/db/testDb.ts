/**
 * The test-database harness (S5). Block 2's conversions are gated by tests
 * that need a REAL MySQL: provision a scratch schema, run every migration
 * through the same engine production uses, hand back a URL, drop it after.
 *
 * Where the server comes from:
 *  - CI: a mysql:8 service container (see .github/workflows/ci.yml).
 *  - This machine (no Docker): the Railway MySQL's public TCP proxy, via
 *    TEST_DATABASE_URL in the local .env — always with a scratch schema,
 *    NEVER the app's own database.
 *  - No TEST_DATABASE_URL at all: DB-backed suites skip loudly. The JSON-era
 *    tests still run everywhere, so a contributor without a database still
 *    has a meaningful (if smaller) suite.
 *
 * The scratch schema name is fixed (amora_test): vitest runs files in one
 * process here and the suite is serial per file, so a fresh DROP/CREATE per
 * provision is both isolation and cleanup-of-last-time.
 */
import mysql from "mysql2/promise";
import { applyPending } from "./migrate";

export const TEST_SCHEMA = "amora_test";

export interface TestDb {
  /** Connection URL pointing at the scratch schema (timezone-Z discipline is the caller's job via connect()). */
  url: string;
  conn: mysql.Connection;
  drop(): Promise<void>;
}

export function testDbConfigured(): boolean {
  return !!process.env.TEST_DATABASE_URL;
}

/** Fresh scratch schema with every migration applied. */
export async function provisionTestDb(): Promise<TestDb> {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error("TEST_DATABASE_URL is not set");
  const u = new URL(base);
  // Connect without a database first so we can drop/create the scratch one.
  const admin = await mysql.createConnection({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    timezone: "Z",
  });
  await admin.query(`DROP DATABASE IF EXISTS \`${TEST_SCHEMA}\``);
  await admin.query(`CREATE DATABASE \`${TEST_SCHEMA}\` CHARACTER SET utf8mb4`);
  await admin.end();

  u.pathname = `/${TEST_SCHEMA}`;
  const url = u.toString();
  const conn = await mysql.createConnection({ uri: url, timezone: "Z" });
  const result = await applyPending(conn);
  if (result.failed) {
    await conn.end();
    throw new Error(`test schema migration failed: ${result.failed}`);
  }
  return {
    url,
    conn,
    async drop() {
      try {
        await conn.query(`DROP DATABASE IF EXISTS \`${TEST_SCHEMA}\``);
      } finally {
        await conn.end();
      }
    },
  };
}
