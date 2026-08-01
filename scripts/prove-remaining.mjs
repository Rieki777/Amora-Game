/**
 * Dev-only: prove the two guards the main prover could not reach on this
 * instance — quest claim (the demo has a real quest board, so no example
 * quests exist) and forum reply (thread-list shape differs).
 */
import mysql from "mysql2/promise";
import fs from "node:fs";

const BASE = "http://localhost:3911";
const url = fs.readFileSync(".demo-db-url", "utf8").trim();
const conn = await mysql.createConnection({ uri: url, timezone: "Z" });

const login = await fetch(`${BASE}/api/auth/login`, {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ email: "demo-founder@examples.invalid", password: "DemoExample!2026" }),
}).then((r) => r.json());
const auth = { "content-type": "application/json", authorization: `Bearer ${login.token}` };

let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "PASS" : "FAIL"}  ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };

// A temporary example quest, so the claim guard is exercised for real.
await conn.query(
  "INSERT IGNORE INTO quests (id, title, description, gratitude, gratitude_min, gratitude_max, status, is_example) " +
    "VALUES ('ex-quest-probe','Probe quest','temp','10–20',10,20,'open',1)",
);
{
  const r = await fetch(`${BASE}/api/game/quests/ex-quest-probe/claim`, { method: "POST", headers: auth });
  const b = await r.json().catch(() => ({}));
  ok("claim an example quest", r.status === 409 && b.code === "example_immutable", `${r.status} ${b.error ?? ""}`);
}
await conn.query("DELETE FROM quests WHERE id = 'ex-quest-probe'");

// Forum reply, against a seeded example thread read straight from the table.
const [[thread]] = await conn.query(
  "SELECT id FROM forum_threads WHERE is_example = 1 AND id LIKE 'ex-thread-%' LIMIT 1",
);
if (thread) {
  for (const [label, path, body] of [
    ["reply to", `/api/forum/threads/${thread.id}/replies`, { body: "should be refused" }],
    ["subscribe to", `/api/forum/threads/${thread.id}/subscribe`, {}],
    ["report", `/api/forum/threads/${thread.id}/report`, { reason: "should be refused" }],
  ]) {
    const r = await fetch(`${BASE}${path}`, { method: "POST", headers: auth, body: JSON.stringify(body) });
    const d = await r.json().catch(() => ({}));
    ok(`${label} an example thread`, r.status === 409 && d.code === "example_immutable", `${r.status} ${d.error ?? ""}`);
  }
} else {
  ok("an example forum thread exists to test against", false, "none found");
}

await conn.end();
console.log(bad === 0 ? "\nALL REMAINING GUARDS PROVEN\n" : `\n${bad} FAILED\n`);
process.exit(bad === 0 ? 0 : 1);
