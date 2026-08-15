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
 * The scratch schema name is UNIQUE PER PROVISION: village_test_<epoch>_<pid>_<n>.
 *
 * It used to be a fixed `village_test`, with a TEST_SCHEMA env override "for
 * parallel working sessions". That override required every session to
 * remember to set it, and on 2026-08-01 two sessions gated their commits at
 * the same time without it — each run's DROP/CREATE yanked the schema out
 * from under the other, twice in an hour, presenting as "Unknown database
 * 'village_test'" halfway through a migration and cascades of 500s in loop
 * sections that pass on any quiet run. A safety mechanism that depends on
 * everyone remembering it is a postmortem waiting for a date, so uniqueness
 * is now the default and TEST_SCHEMA remains only as a pin for CI's named
 * service container.
 *
 * The old fixed name was also the cleanup: DROP-and-recreate each run erased
 * last time's leftovers. Unique names lose that, so provisioning SWEEPS
 * stale siblings instead — any village_test_* schema whose embedded epoch is
 * over two hours old is dropped (a crashed run's orphan), while a live
 * parallel run's schema, minutes old, is never touched.
 */
import mysql from "mysql2/promise";
import { applyPending } from "./migrate";

const RUN_STAMP = `${Math.floor(Date.now() / 1000)}_${process.pid}`;
let provisionSeq = 0;
function nextSchemaName(): string {
  return process.env.TEST_SCHEMA || `village_test_${RUN_STAMP}_${++provisionSeq}`;
}

/** Two hours: longer than any real suite run, shorter than a working day. */
const STALE_SCHEMA_MS = 2 * 60 * 60 * 1000;

async function sweepStaleSchemas(admin: mysql.Connection): Promise<void> {
  try {
    const [rows] = await admin.query(
      "SELECT schema_name AS s FROM information_schema.schemata WHERE schema_name LIKE 'village\\_test\\_%'",
    );
    for (const row of rows as Array<{ s: string }>) {
      const epoch = Number(row.s.split("_")[2]); // village_test_<epoch>_<pid>_<n>
      if (Number.isFinite(epoch) && Date.now() - epoch * 1000 > STALE_SCHEMA_MS) {
        await admin.query(`DROP DATABASE IF EXISTS \`${row.s}\``);
      }
    }
  } catch {
    // Sweeping is hygiene, not a gate — a permissions quirk on
    // information_schema must not fail the suite.
  }
}

export interface TestDb {
  /** Connection URL pointing at the scratch schema (timezone-Z discipline is the caller's job via connect()). */
  url: string;
  conn: mysql.Connection;
  drop(): Promise<void>;
}

export function testDbConfigured(): boolean {
  return !!process.env.TEST_DATABASE_URL;
}

export interface ProvisionOptions {
  /**
   * Schema default collation. Omitted means `CHARACTER SET utf8mb4` with no
   * COLLATE, which on MySQL 8 lands on utf8mb4_0900_ai_ci — the same default
   * Railway uses, which is why the suite matched production so exactly that the
   * collation split in `db/collation.ts` was invisible to all of it.
   *
   * Pass a DIFFERENT collation to reproduce a fork's database.
   */
  collation?: string;
}

/** Fresh scratch schema with every migration applied. */
export async function provisionTestDb(opts: ProvisionOptions = {}): Promise<TestDb> {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error("TEST_DATABASE_URL is not set");
  // Interpolated into DDL, which cannot take a placeholder.
  if (opts.collation && !/^[a-z0-9_]+$/.test(opts.collation)) {
    throw new Error(`refusing to build DDL from collation=${opts.collation}`);
  }
  const schema = nextSchemaName();
  const u = new URL(base);
  // Connect without a database first so we can drop/create the scratch one.
  const admin = await mysql.createConnection({
    host: u.hostname,
    port: Number(u.port || 3306),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    timezone: "Z",
  });
  await sweepStaleSchemas(admin);
  await admin.query(`DROP DATABASE IF EXISTS \`${schema}\``);
  await admin.query(
    `CREATE DATABASE \`${schema}\` CHARACTER SET utf8mb4` +
      (opts.collation ? ` COLLATE ${opts.collation}` : ""),
  );
  await admin.end();

  u.pathname = `/${schema}`;
  const url = u.toString();
  const conn = await mysql.createConnection({ uri: url, timezone: "Z" });
  // Same session pin as the pool and the migration engine: the scratch schema
  // must not be the one place NOW() means something else.
  await conn.query("SET time_zone = '+00:00'");
  const result = await applyPending(conn);
  if (result.failed) {
    // Drop before throwing. This is the ONLY path that creates a schema and
    // then abandons it, and it used to leave the half-migrated schema behind
    // for the two-hour sweeper to find on some later run — which only happens
    // if something provisions against that same server again. When
    // TEST_DATABASE_URL moved from the Railway proxy to a local MySQL, every
    // orphan already on Railway became unreachable by the sweeper, because
    // nothing will ever provision there to trigger it.
    try {
      await conn.query(`DROP DATABASE IF EXISTS \`${schema}\``);
    } catch {
      // A failed migration is the interesting error; a failed cleanup is not.
    }
    await conn.end();
    throw new Error(`test schema migration failed: ${result.failed}`);
  }
  return {
    url,
    conn,
    async drop() {
      try {
        await conn.query(`DROP DATABASE IF EXISTS \`${schema}\``);
      } finally {
        await conn.end();
      }
    },
  };
}

/**
 * How long an e2e suite waits for the built server to answer `/health`.
 *
 * ONE number, because it was five hand-copied ones and they had already
 * drifted: three files said 180s and two said 120s, and the two short ones
 * were below the floor `vitest.config.ts` documents as the rule
 * (`hookTimeout > provisioning + this`). `messaging.routes.e2e` failed on it
 * against the hosted MySQL while CI stayed green, because CI runs MySQL as a
 * local service container where boot is fast.
 *
 * The number is not arbitrary. A first boot against a fresh scratch schema
 * runs every SQL migration, then every data migration, and ends with the 0049
 * org-chart backfill, which walks circles, seats and holders as separate
 * statements. That cost grows with every migration anyone adds.
 *
 * Raise this rather than lower it, and raise `hookTimeout` with it. When a
 * server genuinely will not start, THIS deadline prints the server's own log
 * and says what it was doing; the hook timeout says "Hook timed out" and
 * throws that log away. The informative error has to be the one that fires.
 */
export const E2E_BOOT_DEADLINE_MS = 180_000;
