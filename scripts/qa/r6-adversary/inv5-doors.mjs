/**
 * Invariant 5, second half: enumerate EVERY door into the room, not just mine.
 * Sweeps every GET route declared in server/index.ts, signed out, with the
 * people lock CLOSED (org.public_people=false), hunting for the exact strings
 * the lock is supposed to be holding back.
 */
import fs from "fs";
import { api, actors, record, dump } from "./h.mjs";
const A = actors();

await api("PUT", "/api/admin/variables/org.public_people", { value: false }, A.founderToken);
const check = await api("GET", "/api/org");
if (check.json?.people?.membersOnly !== true) {
  console.log("CONTROL FAILED: lock did not close. people =", JSON.stringify(check.json?.people));
  process.exit(1);
}
console.log("control landed: true — org.public_people is closed, /api/org people =", JSON.stringify(check.json.people));

// The exact secrets the lock is meant to hold. Each one is present in the DB.
const SECRETS = [
  ["holder note", "Also covers Finance while the accountant seat is open."],
  ["holder note 2", "Holding finance and accounting until the accountant is hired."],
  ["holder_key", "doc:ky"],
  ["documented holder name", "Jessica"],
  ["documented holder name", "Eric"],
  ["member email", "alice@qa62.test"],
  ["member email", "founder@qa62.test"],
  ["member full name", "Alice Ordinary"],
  ["password hash prefix", "$2b$"],
  ["assignment id", "orgasg-mteqgubi-"],
];

// CONTROL: the admin tier must contain these, or "absent from anon" proves nothing.
const adminOrg = await api("GET", "/api/org", undefined, A.founderToken);
const adminBlob = JSON.stringify(adminOrg.json);
const controlHits = SECRETS.filter(([, s]) => adminBlob.includes(s));
console.log(`control: admin /api/org carries ${controlHits.length}/${SECRETS.length} of the probe strings: ${controlHits.map(c=>c[1].slice(0,28)).join(" | ")}`);
if (controlHits.length === 0) { console.log("CONTROL FAILED: probe strings match nothing anywhere"); process.exit(1); }

const routes = fs.readFileSync(".qa2/r6/routes-index.txt", "utf8").trim().split(/\r?\n/)
  .filter(l => l.startsWith("get "))
  .map(l => l.slice(4))
  .filter(r => !r.includes(":") || true);

let served = 0, refused = 0, leaked = 0, errored = 0;
const leaks = [];
for (const raw of routes) {
  // Fill path params with something plausible so parameterised routes still answer.
  const route = raw.replace(/:([a-zA-Z]+)\??/g, (m, name) => {
    if (/id$/i.test(name)) return "1";
    if (/file|name/i.test(name)) return "x";
    return "x";
  }).replace(/\*/g, "x");
  let r;
  try { r = await api("GET", route); } catch (e) { errored++; continue; }
  const blob = (r.text ?? "") + JSON.stringify(r.headers);
  if (r.status >= 400) { refused++; continue; }
  served++;
  const hits = SECRETS.filter(([, s]) => blob.includes(s));
  if (hits.length) {
    leaked++;
    leaks.push({ route, status: r.status, bytes: blob.length, hits: hits.map(h => `${h[0]}:${h[1].slice(0,40)}`) });
    console.log(`  LEAK [${r.status}] ${route} :: ${hits.map(h=>h[0]).join(", ")}`);
  }
}
console.log(`\nswept ${routes.length} GET routes signed out: ${served} answered, ${refused} refused, ${errored} errored, ${leaked} leaked a locked string`);
if (leaks.length) record(5, `anon sweep of ${routes.length} GET routes with people lock CLOSED`, "BROKE", JSON.stringify(leaks));
else record(5, `anon sweep of ${routes.length} GET routes with people lock CLOSED`, "HELD", `${served} routes answered anonymously, none carried any of the ${SECRETS.length} locked strings (control: admin /api/org carries ${controlHits.length} of them)`);
fs.writeFileSync(".qa2/r6/inv5-doors.json", JSON.stringify({ routes: routes.length, served, refused, errored, leaks }, null, 2));
dump("inv5-doors-results.json");
