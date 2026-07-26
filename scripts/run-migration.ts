/**
 * SQL migration runner CLI. The engine lives in server/db/migrate.ts (S5) so
 * the CLI, the test harness, and CI run exactly the same code path — with
 * `timezone: 'Z'` on every connection (plan rule 2.3: this machine is UTC-6
 * and mysql2's 'local' default would shift every lunar boundary six hours).
 *
 *   npx tsx scripts/run-migration.ts --status   list applied and pending
 *   npx tsx scripts/run-migration.ts --all      apply everything pending
 *
 * Why not `drizzle-kit push`: push diffs the schema and mutates to match,
 * which is fine on an empty database and dangerous on a live one. Explicit,
 * ordered, reviewable SQL files are the thing regen-civics learned to want.
 *
 * Note this is NOT data/migrations.json, which tracks one-off JSON data
 * fixups. Different concern, different ledger.
 */
import "dotenv/config";
import { applyPending, connect, migrationStatus } from "../server/db/migrate";

async function main() {
  const arg = process.argv[2] ?? "--status";
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set. On Railway it is a reference to the MySQL service.");
    process.exit(1);
  }

  const conn = await connect(url);

  if (arg === "--status") {
    const { applied, pending } = await migrationStatus(conn);
    for (const f of applied) console.log(`  [APPLIED] ${f}`);
    for (const f of pending) console.log(`* [PENDING] ${f}`);
    console.log("=".repeat(60));
    console.log(`Total: ${applied.length + pending.length} | Applied: ${applied.length} | Pending: ${pending.length}`);
    await conn.end();
    return;
  }

  if (arg !== "--all") {
    console.error(`Unknown argument ${arg}. Use --status or --all.`);
    await conn.end();
    process.exit(1);
  }

  const result = await applyPending(conn, undefined, (line) => console.log(line));
  if (result.applied.length === 0 && !result.failed) console.log("Nothing pending.");
  console.log(
    `\nResults: ${result.applied.length} applied, ${result.skipped.length} previously applied, ${result.failed ? 1 : 0} failed`,
  );
  await conn.end();
  if (result.failed) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
