/**
 * QA harness: drop and recreate a scratch schema for a full-app sweep.
 *
 * Separate from the S5 test harness on purpose — that one belongs to the
 * suite and is torn down per run. This one persists while a human (or a
 * browser agent) walks the app, and it NEVER touches the app schema: it
 * derives from TEST_DATABASE_URL and forces its own database name.
 */
import fs from "fs";
import mysql from "mysql2/promise";

const SCHEMA = "village_qa";
const env = fs.readFileSync(".env", "utf8");
const m = env.match(/^TEST_DATABASE_URL=(.+)$/m);
if (!m) {
  console.error("TEST_DATABASE_URL is not set in .env — refusing to guess at a database");
  process.exit(1);
}
const url = new URL(m[1].trim());

const admin = await mysql.createConnection({
  host: url.hostname,
  port: Number(url.port || 3306),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  multipleStatements: true,
});
await admin.query(`DROP DATABASE IF EXISTS \`${SCHEMA}\`; CREATE DATABASE \`${SCHEMA}\``);
await admin.end();

url.pathname = `/${SCHEMA}`;
fs.writeFileSync(".qa-db-url", url.toString());
console.log(`scratch schema "${SCHEMA}" ready; connection string written to .qa-db-url`);
