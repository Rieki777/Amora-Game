/**
 * Invariant 5: a public surface cannot be made to give more than it means to.
 * LOCAL, port 3902, scratch schema village_qa6_2.
 */
import { api, show, actors, record, dump, db } from "./h.mjs";
const A = actors();
const HELD_BACK = ["userId", "note", "focus", "kind", "lapsed", "lapsedReason", "assignmentId", "displayName", "email", "handle"];

function scan(node, path, hits, allowRoot) {
  if (node === null || node === undefined) return;
  if (Array.isArray(node)) { node.forEach((v, i) => scan(v, `${path}[${i}]`, hits, allowRoot)); return; }
  if (typeof node !== "object") return;
  for (const [k, v] of Object.entries(node)) {
    if (HELD_BACK.includes(k) && v !== null && v !== undefined && v !== "") hits.push(`${path}.${k} = ${JSON.stringify(v)}`);
    scan(v, `${path}.${k}`, hits, allowRoot);
  }
}

// CONTROL: prove the org payload actually has holders to leak. If it is empty
// every "absent" below is meaningless.
const adminOrg = await api("GET", "/api/org", undefined, A.founderToken);
const adminHolders = (adminOrg.json?.roles ?? []).flatMap(r => r.holders ?? []);
console.log(`CONTROL: admin /api/org -> ${adminOrg.status}, roles=${adminOrg.json?.roles?.length}, holder rows=${adminHolders.length}`);
const adminHits = []; scan(adminOrg.json, "admin", adminHits);
console.log(`CONTROL: admin tier carries ${adminHits.length} of the held-back keys (must be > 0 or the probe proves nothing)`);
console.log("  sample:", adminHits.slice(0, 6).join(" | "));
if (adminHolders.length === 0 || adminHits.length === 0) {
  record(5, "control", "NOT MEASURABLE", "admin tier carried no holder rows / no held-back keys; every absence below is vacuous");
  dump("inv5.json"); process.exit(0);
}

for (const lock of ["true", "false"]) {
  const set = await api("PUT", "/api/admin/variables/org.public_people", { value: lock === "true" }, A.founderToken);
  const read = await api("GET", "/api/admin/variables", undefined, A.founderToken);
  const actual = (read.json?.variables ?? read.json ?? []).find?.(v => v.key === "org.public_people")?.value
    ?? read.json?.["org.public_people"];
  console.log(`\n--- lock org.public_people set to ${lock} (PUT ${set.status}); server reports ${JSON.stringify(actual)} ---`);
  const anon = await api("GET", "/api/org");
  console.log(`  anon /api/org -> ${anon.status}; people=${JSON.stringify(anon.json?.people)}`);
  const anonHolders = (anon.json?.roles ?? []).flatMap(r => r.holders ?? []);
  const hits = []; scan(anon.json, "anon", hits);
  console.log(`  anon holder rows: ${anonHolders.length}; sample: ${JSON.stringify(anonHolders.slice(0,3))}`);
  if (hits.length) record(5, `signed-out /api/org, public_people=${lock}`, "BROKE", `held-back keys present: ${hits.slice(0,8).join(" | ")}`);
  else record(5, `signed-out /api/org, public_people=${lock}`, "HELD", `0 held-back keys in ${JSON.stringify(anon.json).length} bytes; ${anonHolders.length} public holder rows, name-only`);

  // full-name leak: public tier must be firstName() only
  const full = anonHolders.filter(h => typeof h.name === "string" && h.name.trim().includes(" "));
  if (full.length) record(5, `public holder name is firstName only, public_people=${lock}`, "BROKE", `${full.length} multi-word names: ${JSON.stringify(full.slice(0,4))}`);
  else record(5, `public holder name is firstName only, public_people=${lock}`, "HELD", `${anonHolders.length} rows, none multi-word`);

  if (lock === "false" && anonHolders.length > 0) record(5, "lock OFF still hides names", "BROKE", `${anonHolders.length} holder rows returned to anon with lock off`);
  else if (lock === "false") record(5, "lock OFF hides names", "HELD", "anon got 0 holder rows with public_people=false");
}

// Other doors into the same room.
const doors = ["/api/roles", "/api/circles", "/api/members", "/api/modules", "/api/content/roles",
  "/api/org/export", "/api/map/scene", "/api/village/brief", "/.well-known/village.json",
  "/org/people.md", "/org/circles.md", "/api/team", "/api/people", "/api/village/public"];
console.log("\n--- other public doors (lock left at false = most restrictive) ---");
for (const d of doors) {
  const r = await api("GET", d);
  const hits = []; scan(r.json, "d", hits);
  const names = JSON.stringify(r.json ?? r.text ?? "").match(/Fiona|Alice|Ordinary|Founder|Roled|qa62\.test/g) ?? [];
  console.log(`  [${r.status}] ${d} :: ${String(r.text ?? "").length}b, heldBackKeys=${hits.length}, actorNameHits=${[...new Set(names)].join(",") || "none"}`);
  if (r.status < 400 && (hits.length || names.length)) {
    record(5, `anon ${d}`, "BROKE", `heldBack=${hits.slice(0,5).join("|")} actorNames=${[...new Set(names)].join(",")}`);
  } else if (r.status < 400) {
    record(5, `anon ${d}`, "HELD", `${r.status}, no held-back key, no actor name`);
  } else {
    record(5, `anon ${d}`, "HELD", `${r.status} (route refuses anon)`);
  }
}
dump("inv5.json");
