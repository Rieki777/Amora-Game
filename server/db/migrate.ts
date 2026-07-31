/**
 * The migration engine, extracted from scripts/run-migration.ts (S5) so the
 * CLI, the test harness, and CI all run EXACTLY the same code path. Numbered
 * .sql files in drizzle/, a `_migrations_applied` table as the ledger,
 * discovery from disk.
 *
 * Every connection here sets `timezone: 'Z'` (plan rule 2.3): this machine is
 * UTC-6, mysql2's default is 'local', and a timestamp written through a local
 * connection then read through a Z one shifts every lunar boundary six hours.
 * It also pins the MySQL SESSION zone, because `timezone: 'Z'` governs only
 * how the driver renders Dates — NOW() answers to the session.
 *
 * A SHIPPED MIGRATION FILE IS NEVER EDITED. That was always convention; it is
 * now structural. A file that fails half-way records how many statements
 * succeeded and RESUMES there on the next boot instead of replaying DDL that
 * already ran. Reordering, inserting or removing statements in a file that
 * has been partially applied anywhere therefore resumes at the wrong offset
 * and skips the wrong statements. Fix a shipped migration with a NEW numbered
 * file, always.
 */
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

export const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle");

export function discoverMigrations(dir: string = MIGRATIONS_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}.*\.sql$/.test(f))
    .sort();
}

/**
 * Split on semicolons at end of line, stripping leading comment lines from
 * each chunk (NOT discarding chunks that start with a comment — the bug the
 * first version of the runner had, which silently skipped statements).
 */
export function splitStatements(sql: string): string[] {
  // Strip comment lines BEFORE splitting on statement-final semicolons: a
  // comment that happens to end in ';' must never cut a statement in half
  // (0015 learned this the hard way — "…live in game_variables;\n").
  const withoutComments = sql
    .split("\n")
    .filter((line) => !/^\s*--/.test(line))
    .join("\n");
  return withoutComments
    .split(/;\s*$/m)
    .map((chunk) => chunk.trim())
    .filter((s) => s.length > 0);
}

export async function connect(url: string): Promise<mysql.Connection> {
  const conn = await mysql.createConnection({ uri: url, multipleStatements: false, timezone: "Z" });
  // The driver's `timezone: 'Z'` only governs how Dates are rendered and
  // parsed; NOW()/CURRENT_TIMESTAMP evaluate in the MySQL SESSION zone. Pin
  // it here too, or a migration's DEFAULT CURRENT_TIMESTAMP writes in one
  // frame and the app reads in another. Numeric offset, never 'UTC' — that
  // name throws on servers without the timezone tables loaded.
  await conn.query("SET time_zone = '+00:00'");
  return conn;
}

export interface ApplyResult {
  applied: string[];
  skipped: string[];
  failed: string | null;
}

/** Apply every pending migration, in filename order, recording each. */
export async function applyPending(
  conn: mysql.Connection,
  dir: string = MIGRATIONS_DIR,
  log: (line: string) => void = () => {},
): Promise<ApplyResult> {
  await conn.query(
    "CREATE TABLE IF NOT EXISTS `_migrations_applied` (" +
      "`filename` varchar(255) NOT NULL, " +
      "`applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
      "PRIMARY KEY (`filename`))",
  );
  await ensurePartialLedger(conn);
  const [rows] = await conn.query<any[]>("SELECT filename FROM `_migrations_applied`");
  const done = new Set(rows.map((r) => r.filename));
  const [partials] = await conn.query<any[]>("SELECT filename, statements_done FROM `_migrations_partial`");
  const progress = new Map<string, number>(partials.map((r) => [String(r.filename), Number(r.statements_done ?? 0)]));
  const all = discoverMigrations(dir);
  const result: ApplyResult = { applied: [], skipped: [], failed: null };
  for (const file of all) {
    if (done.has(file)) {
      result.skipped.push(file);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf-8");
    const parts = splitStatements(sql);
    const startAt = Math.min(progress.get(file) ?? 0, parts.length);
    log(
      startAt > 0
        ? `  RUN:  ${file} (resuming at statement ${startAt + 1} of ${parts.length})`
        : `  RUN:  ${file} (${parts.length} statements)`,
    );
    let i = startAt;
    try {
      for (; i < parts.length; i += 1) {
        await conn.query(parts[i]);
        // Record progress after EACH statement, so a failure half-way through
        // is resumable. Without this, a file that failed on statement 7 of 12
        // replayed statements 1-6 on every subsequent boot — and since those
        // are usually non-idempotent DDL, the deployment bricked permanently
        // on an error about a column that already exists.
        await recordProgress(conn, file, i + 1);
      }
      await conn.query("INSERT INTO `_migrations_applied` (filename) VALUES (?)", [file]);
      // Completion is recorded in the ledger; the partial row has done its
      // job and would otherwise mislead a later reader.
      await conn.query("DELETE FROM `_migrations_partial` WHERE filename = ?", [file]);
      result.applied.push(file);
      log(`  DONE: ${file}`);
    } catch (err: any) {
      // Stop on first failure: later migrations were written against a schema
      // this one was supposed to produce.
      result.failed = `${file}: ${err.message}`;
      log(`  FAIL: ${file} -> ${err.message} (statement ${i + 1} of ${parts.length})`);
      break;
    }
  }
  return result;
}

/**
 * The partial-progress ledger — a SEPARATE table, deliberately.
 *
 * The obvious design is a `statements_done` column on `_migrations_applied`,
 * but that table's rows already mean "this file completed", and adding a
 * column to it gives every historical row the default 0. A resume rule of
 * "complete only at parts.length" would then read every already-applied
 * migration as zero-of-N done and replay the entire schema history against a
 * populated database on the next boot. Backfilling to dodge that is one
 * more thing to get wrong at exactly the moment (a failed migration) when
 * nothing else is working.
 *
 * A separate table leaves the completion ledger's meaning untouched: a row
 * in `_migrations_applied` still means complete, full stop, and this table
 * only carries files that are mid-flight.
 */
async function ensurePartialLedger(conn: mysql.Connection): Promise<void> {
  await conn.query(
    "CREATE TABLE IF NOT EXISTS `_migrations_partial` (" +
      "`filename` varchar(255) NOT NULL, " +
      "`statements_done` int NOT NULL DEFAULT 0, " +
      "`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, " +
      "PRIMARY KEY (`filename`))",
  );
}

/** How far into a still-unfinished file the last attempt got. */
async function recordProgress(conn: mysql.Connection, file: string, n: number): Promise<void> {
  await conn.query(
    "INSERT INTO `_migrations_partial` (filename, statements_done) VALUES (?, ?) " +
      "ON DUPLICATE KEY UPDATE statements_done = VALUES(statements_done)",
    [file, n],
  );
}

export async function migrationStatus(
  conn: mysql.Connection,
  dir: string = MIGRATIONS_DIR,
): Promise<{ applied: string[]; pending: string[] }> {
  await conn.query(
    "CREATE TABLE IF NOT EXISTS `_migrations_applied` (" +
      "`filename` varchar(255) NOT NULL, " +
      "`applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
      "PRIMARY KEY (`filename`))",
  );
  const [rows] = await conn.query<any[]>("SELECT filename FROM `_migrations_applied`");
  const done = new Set(rows.map((r) => r.filename));
  const all = discoverMigrations(dir);
  return { applied: all.filter((f) => done.has(f)), pending: all.filter((f) => !done.has(f)) };
}
