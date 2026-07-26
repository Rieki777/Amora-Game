/**
 * The migration engine, extracted from scripts/run-migration.ts (S5) so the
 * CLI, the test harness, and CI all run EXACTLY the same code path. Numbered
 * .sql files in drizzle/, a `_migrations_applied` table as the ledger,
 * discovery from disk.
 *
 * Every connection here sets `timezone: 'Z'` (plan rule 2.3): this machine is
 * UTC-6, mysql2's default is 'local', and a timestamp written through a local
 * connection then read through a Z one shifts every lunar boundary six hours.
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
  return sql
    .split(/;\s*$/m)
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !/^\s*--/.test(line))
        .join("\n")
        .trim(),
    )
    .filter((s) => s.length > 0);
}

export async function connect(url: string): Promise<mysql.Connection> {
  return mysql.createConnection({ uri: url, multipleStatements: false, timezone: "Z" });
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
  const [rows] = await conn.query<any[]>("SELECT filename FROM `_migrations_applied`");
  const done = new Set(rows.map((r) => r.filename));
  const all = discoverMigrations(dir);
  const result: ApplyResult = { applied: [], skipped: [], failed: null };
  for (const file of all) {
    if (done.has(file)) {
      result.skipped.push(file);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, file), "utf-8");
    const parts = splitStatements(sql);
    log(`  RUN:  ${file} (${parts.length} statements)`);
    try {
      for (const s of parts) await conn.query(s);
      await conn.query("INSERT INTO `_migrations_applied` (filename) VALUES (?)", [file]);
      result.applied.push(file);
      log(`  DONE: ${file}`);
    } catch (err: any) {
      // Stop on first failure: later migrations were written against a schema
      // this one was supposed to produce.
      result.failed = `${file}: ${err.message}`;
      log(`  FAIL: ${file} -> ${err.message}`);
      break;
    }
  }
  return result;
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
