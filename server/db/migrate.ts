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
 *
 * TWO GUARDS ADDED ON TOP OF THAT (0121), both because the convention above
 * turned out to be an honor system with nothing checking it:
 *
 *  - A CHECKSUM. Every row `applyPending` writes now carries a sha256 of the
 *    exact bytes it ran. On every boot, before running anything pending, it
 *    reads each already-applied file back off disk and refuses if the hash
 *    has moved. Nullable, and a NULL is never read as a mismatch: every row
 *    written before 0121 has nothing true to compare against, so it is
 *    backfilled with the current on-disk bytes instead (see
 *    `verifyAndBackfillChecksums`), which protects going forward without
 *    pretending it protected the past.
 *  - A NAMED LOCK. `applyPending` reads the ledger, then writes to it, with
 *    no transaction wrapping the whole run (DDL is not transactional in
 *    MySQL regardless). Two containers booting at the same moment would
 *    otherwise both see the same file as pending and both start running its
 *    statements, and `_migrations_partial`'s offset only has room for one
 *    truth: connection A records "3 of 12 done" while connection B is mid
 *    statement 4, and the next boot resumes at 3 on a table that is actually
 *    further along, replaying DDL that already ran. `GET_LOCK`/`RELEASE_LOCK`
 *    around the whole function serializes that instead of leaving it to luck.
 */
import fs from "fs";
import path from "path";
import crypto from "node:crypto";
import mysql from "mysql2/promise";

export const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle");

/**
 * How long `applyPending` waits to take the migration lock before giving up.
 * Matches the template-build lock's own timeout in server/db/testDb.ts
 * (600s): both are real DDL against a database that may already be busy, not
 * a quick operation that should time out fast.
 */
export const MIGRATION_LOCK_TIMEOUT_SECONDS = 600;

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

/** sha256 of a file's exact on-disk bytes, hex encoded (64 chars: the width of the `checksum` column 0121 adds). */
export function sha256Hex(bytes: Buffer): string {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

/**
 * Whether THIS database has run 0121 (the migration that adds `checksum`)
 * yet. Checked fresh every time it is asked, never cached: a village that is
 * many migrations behind can apply 0121 itself partway through one boot, and
 * every file after it in that same run needs the answer to flip from false
 * to true without waiting for a second boot.
 */
async function hasChecksumColumn(conn: mysql.Connection): Promise<boolean> {
  const [rows] = await conn.query<any[]>(
    "SELECT 1 AS x FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() " +
      "AND TABLE_NAME = '_migrations_applied' AND COLUMN_NAME = 'checksum'",
  );
  return (rows as any[]).length > 0;
}

async function currentDatabaseName(conn: mysql.Connection): Promise<string> {
  const [[row]] = await conn.query<any[]>("SELECT DATABASE() AS db");
  return row?.db ? String(row.db) : "unknown";
}

/**
 * MySQL's `GET_LOCK`/`RELEASE_LOCK` namespace is server wide, not per
 * database, so the lock name is built from the current database and given a
 * prefix distinct from server/db/testDb.ts's own use of the same primitive.
 * That file's `buildTemplate` holds `GET_LOCK(schema, 600)` on an admin
 * connection and then calls `applyPending` on a SECOND connection to that
 * same schema; a bare-schema-name lock here would make this function wait on
 * a lock its own caller already holds, from a different connection, on
 * purpose, which is a self deadlock rather than the contention this exists
 * to serialize.
 */
async function acquireMigrationLock(conn: mysql.Connection, name: string, timeoutSeconds: number): Promise<boolean> {
  const [[row]] = await conn.query<any[]>("SELECT GET_LOCK(?, ?) AS ok", [name, timeoutSeconds]);
  return Number(row?.ok) === 1;
}

async function releaseMigrationLock(conn: mysql.Connection, name: string): Promise<void> {
  try {
    await conn.query("SELECT RELEASE_LOCK(?)", [name]);
  } catch {
    // Cleanup, not a result. A connection that is about to be closed anyway
    // (the normal case: callers `conn.end()` right after) drops its locks on
    // disconnect regardless, and a failed release is never the interesting
    // error to fail a boot over.
  }
}

export type ApplyFailureDetail =
  | {
      kind: "migration-failed";
      file: string;
      statementIndex: number;
      statementsTotal: number;
      message: string;
    }
  | {
      kind: "tamper-detected";
      file: string;
      message: string;
    }
  | {
      kind: "lock-timeout";
      lockName: string;
      timeoutSeconds: number;
      message: string;
    };

export interface ApplyResult {
  applied: string[];
  skipped: string[];
  failed: string | null;
  /**
   * Structured detail behind `failed`, for a caller that wants to show a
   * human something better than a concatenated string (server/db's
   * maintenance-mode page is the first one; see maintenanceMode.ts). `failed`
   * stays the field every existing caller already checks; this is always set
   * alongside it, never instead of it.
   */
  failedDetail?: ApplyFailureDetail;
}

/**
 * Read every already-applied file back off disk and compare its hash to what
 * was recorded at apply time. A NULL recorded checksum (every row written
 * before 0121, on every already-running instance, the moment this code first
 * reaches it) is never treated as a mismatch, since there is nothing true to
 * compare it to; it is backfilled with the CURRENT on-disk bytes instead.
 * That establishes a baseline as of the upgrade. It cannot catch an edit that
 * happened before this column existed, only one after.
 *
 * A file the ledger says ran but that is no longer present in `dir` is
 * skipped, not flagged: this function only has a directory listing and
 * cannot tell "removed on purpose by a fork" from "moved somewhere else",
 * so it says nothing rather than guessing. `scripts/check-migration-compat.mjs`
 * is where a deleted shipped file is caught, with git history to say so.
 */
async function verifyAndBackfillChecksums(
  conn: mysql.Connection,
  dir: string,
  rows: Array<{ filename: string; checksum: string | null }>,
  log: (line: string) => void,
): Promise<Extract<ApplyFailureDetail, { kind: "tamper-detected" }> | null> {
  let backfilled = 0;
  for (const row of rows) {
    const filename = String(row.filename);
    const filePath = path.join(dir, filename);
    if (!fs.existsSync(filePath)) continue;
    const bytes = fs.readFileSync(filePath);
    const actual = sha256Hex(bytes);
    const recorded = row.checksum ? String(row.checksum) : null;
    if (!recorded) {
      await conn.query("UPDATE `_migrations_applied` SET checksum = ? WHERE filename = ?", [actual, filename]);
      backfilled += 1;
      continue;
    }
    if (recorded !== actual) {
      return {
        kind: "tamper-detected",
        file: filename,
        message:
          `${filename} was applied here with checksum ${recorded.slice(0, 12)}... but the file on disk now ` +
          `hashes to ${actual.slice(0, 12)}.... A shipped migration must never be edited after it has run: this ` +
          `instance already ran the OLD body, the new body will never run here, and every migration after this ` +
          `one may now assume a schema this database does not actually have. Restore this file to the bytes that ` +
          `actually ran here, and make the intended change in a new numbered migration instead.`,
      };
    }
  }
  if (backfilled > 0) log(`  [db] backfilled checksum for ${backfilled} previously-applied migration(s)`);
  return null;
}

/**
 * Apply every pending migration, in filename order, recording each.
 *
 * `lockTimeoutSeconds` defaults to the production value and exists as a
 * parameter (rather than only the module constant) so a test can prove the
 * give-up path without waiting ten minutes for it: pass a small number and
 * hold the same lock name from a second connection first.
 */
export async function applyPending(
  conn: mysql.Connection,
  dir: string = MIGRATIONS_DIR,
  log: (line: string) => void = () => {},
  lockTimeoutSeconds: number = MIGRATION_LOCK_TIMEOUT_SECONDS,
): Promise<ApplyResult> {
  const dbName = await currentDatabaseName(conn);
  const lockName = `village-migrate:${dbName}`.slice(0, 64);
  const gotLock = await acquireMigrationLock(conn, lockName, lockTimeoutSeconds);
  if (!gotLock) {
    const message =
      `could not take the migration lock (waited ${lockTimeoutSeconds}s for "${lockName}"). ` +
      `Another process is very likely applying migrations against this same database right now (two ` +
      `containers booting at the same moment is the usual cause), or a previous run's connection died ` +
      `without releasing it. Refusing to run migrations concurrently, so two connections cannot ` +
      `interleave statements from the same file.`;
    log(`  LOCK: ${message}`);
    return {
      applied: [],
      skipped: [],
      failed: message,
      failedDetail: { kind: "lock-timeout", lockName, timeoutSeconds: lockTimeoutSeconds, message },
    };
  }
  try {
    await conn.query(
      "CREATE TABLE IF NOT EXISTS `_migrations_applied` (" +
        "`filename` varchar(255) NOT NULL, " +
        "`applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
        "PRIMARY KEY (`filename`))",
    );
    await ensurePartialLedger(conn);

    const checksumColumn = await hasChecksumColumn(conn);
    const [rows] = await conn.query<any[]>(
      checksumColumn
        ? "SELECT filename, checksum FROM `_migrations_applied`"
        : "SELECT filename FROM `_migrations_applied`",
    );
    const done = new Set(rows.map((r) => r.filename));

    if (checksumColumn) {
      const tamper = await verifyAndBackfillChecksums(conn, dir, rows as any, log);
      if (tamper) {
        log(`  TAMPER: ${tamper.message}`);
        return { applied: [], skipped: [], failed: tamper.message, failedDetail: tamper };
      }
    }

    const [partials] = await conn.query<any[]>("SELECT filename, statements_done FROM `_migrations_partial`");
    const progress = new Map<string, number>(partials.map((r) => [String(r.filename), Number(r.statements_done ?? 0)]));
    const all = discoverMigrations(dir);
    const result: ApplyResult = { applied: [], skipped: [], failed: null };
    for (const file of all) {
      if (done.has(file)) {
        result.skipped.push(file);
        continue;
      }
      const bytes = fs.readFileSync(path.join(dir, file));
      const sql = bytes.toString("utf-8");
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
        if (await hasChecksumColumn(conn)) {
          await conn.query("INSERT INTO `_migrations_applied` (filename, checksum) VALUES (?, ?)", [
            file,
            sha256Hex(bytes),
          ]);
        } else {
          await conn.query("INSERT INTO `_migrations_applied` (filename) VALUES (?)", [file]);
        }
        // Completion is recorded in the ledger; the partial row has done its
        // job and would otherwise mislead a later reader.
        await conn.query("DELETE FROM `_migrations_partial` WHERE filename = ?", [file]);
        result.applied.push(file);
        log(`  DONE: ${file}`);
      } catch (err: any) {
        // Stop on first failure: later migrations were written against a schema
        // this one was supposed to produce.
        result.failed = `${file}: ${err.message}`;
        result.failedDetail = {
          kind: "migration-failed",
          file,
          statementIndex: i + 1,
          statementsTotal: parts.length,
          message: err.message,
        };
        log(`  FAIL: ${file} -> ${err.message} (statement ${i + 1} of ${parts.length})`);
        break;
      }
    }
    return result;
  } finally {
    await releaseMigrationLock(conn, lockName);
  }
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
