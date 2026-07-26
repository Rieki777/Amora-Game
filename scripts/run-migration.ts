/**
 * SQL migration runner. Same convention as regen-civics, deliberately:
 * numbered files in drizzle/, a `_migrations_applied` table as the ledger,
 * discovery from disk rather than a generated journal.
 *
 *   npx tsx scripts/run-migration.ts --status   list applied and pending
 *   npx tsx scripts/run-migration.ts --all      apply everything pending
 *
 * Why not `drizzle-kit push`: push diffs the schema and mutates to match, which
 * is fine on an empty database and dangerous on a live one. Explicit, ordered,
 * reviewable SQL files are the thing regen-civics learned to want (see its
 * SHIPPED_LOG entry on 36 broken historical migrations).
 *
 * Note this is NOT data/migrations.json, which tracks one-off JSON data fixups.
 * Different concern, different ledger.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import mysql from "mysql2/promise";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "drizzle");

function discover(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{4}.*\.sql$/.test(f))
    .sort();
}

/**
 * Split on semicolons at end of line. Adequate for DDL, and deliberately simple:
 * if a migration ever needs a stored procedure or a trigger, it gets its own
 * runner path rather than a cleverer splitter that silently mangles the easy case.
 *
 * Leading comment lines are STRIPPED from each chunk, not used to discard it.
 * The first version dropped any chunk beginning with "--", which silently threw
 * away every statement that happened to be preceded by a comment: `users` and
 * `app_config` vanished from 0001 while the runner reported success. A migration
 * runner that quietly skips statements is worse than one that crashes.
 */
function statements(sql: string): string[] {
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

async function main() {
  const arg = process.argv[2] ?? "--status";
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. On Railway it is a reference to the MySQL service.");
    process.exit(1);
  }

  const conn = await mysql.createConnection({ uri: url, multipleStatements: false });
  await conn.query(
    "CREATE TABLE IF NOT EXISTS `_migrations_applied` (" +
      "`filename` varchar(255) NOT NULL, " +
      "`applied_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, " +
      "PRIMARY KEY (`filename`))",
  );

  const [rows] = await conn.query<any[]>("SELECT filename FROM `_migrations_applied`");
  const done = new Set(rows.map((r) => r.filename));
  const all = discover();
  const pending = all.filter((f) => !done.has(f));

  if (arg === "--status") {
    for (const f of all) console.log(`${done.has(f) ? "  [APPLIED]" : "* [PENDING]"} ${f}`);
    console.log("=".repeat(60));
    console.log(`Total: ${all.length} | Applied: ${done.size} | Pending: ${pending.length}`);
    await conn.end();
    return;
  }

  if (arg !== "--all") {
    console.error(`Unknown argument ${arg}. Use --status or --all.`);
    await conn.end();
    process.exit(1);
  }

  if (pending.length === 0) {
    console.log("Nothing pending.");
    await conn.end();
    return;
  }

  console.log(`Found ${pending.length} unapplied migration(s):\n`);
  let applied = 0;
  let failed = 0;
  for (const file of pending) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf-8");
    const parts = statements(sql);
    console.log(`  RUN:  ${file} (${parts.length} statements)`);
    try {
      for (const s of parts) await conn.query(s);
      await conn.query("INSERT INTO `_migrations_applied` (filename) VALUES (?)", [file]);
      console.log(`  DONE: ${file} (${parts.length} statements executed)`);
      applied++;
    } catch (err: any) {
      // Stop on the first failure. Continuing would apply later migrations onto
      // a schema that is not what they were written against.
      console.error(`  FAIL: ${file} -> ${err.message}`);
      failed++;
      break;
    }
  }
  console.log(`\nResults: ${applied} applied, ${pending.length - applied - failed} skipped, ${failed} failed`);
  await conn.end();
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
