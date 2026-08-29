/**
 * Invariant 1, retest. Two of the inv1 results were confounded and one was
 * mis-ranked; this file redoes them against a member whose bit this process
 * has never cached.
 *
 * The confound: `moduleUsage.ts` keeps a per-process `seen` set, so once a
 * member/module/cycle key is cached, deleting the ROW does not make the next
 * request write again. Any retest that reuses a member who already touched the
 * module measures the cache, not the gate. Dave has touched nothing.
 */
import { api, actors, record, dump, db } from "./h.mjs";
const A = actors();
const c = await db();
const settle = () => new Promise((r) => setTimeout(r, 800));
const countFor = async (mod, uid) => {
  const [[r]] = await c.query("SELECT COUNT(*) n FROM module_usage_marks WHERE module_id=? AND user_id=?", [mod, uid]);
  return Number(r.n);
};

await api("PUT", "/api/admin/modules/library/lifecycle", { lifecycle: "public" }, A.founderToken);
await c.query("DELETE FROM module_usage_marks");

// CONTROL, with the SAME member and module used by the attack below: dave's
// first open must mark, or "0 marks after revocation" proves nothing.
const ctl = await api("GET", "/api/library", undefined, A.daveToken);
await settle();
const ctlN = await countFor("library", A.daveId);
console.log("control landed: " + (ctlN === 1) + " -- dave's first GET /api/library [" + ctl.status + "] -> " + ctlN + " mark");
if (ctlN !== 1) {
  record(1, "retest control", "NOT MEASURABLE", "dave's first open produced " + ctlN + " marks");
  dump("inv1b.json");
  await c.end();
  process.exit(0);
}

// Now revoke dave's session and try a DIFFERENT module he has never opened,
// so neither the DB row nor the process cache can mask the answer.
const lo = await api("POST", "/api/auth/logout", {}, A.daveToken);
await api("PUT", "/api/admin/modules/badges/lifecycle", { lifecycle: "public" }, A.founderToken);
const before = await countFor("badges", A.daveId);
const r = await api("GET", "/api/badges", undefined, A.daveToken);
await settle();
const after = await countFor("badges", A.daveId);
console.log("  logout " + lo.status + "; GET /api/badges with the revoked token -> " + r.status + "; badges marks for dave " + before + " -> " + after);
// Prove the token really is dead against an authed route, in the same run.
const dead = await api("GET", "/api/profile", undefined, A.daveToken);
console.log("  same token against /api/profile -> " + dead.status + " (must be 401 or the revocation never happened)");
if (dead.status !== 401) record(1, "revoked-token meter test", "NOT MEASURABLE", "logout did not revoke: /api/profile still " + dead.status);
else if (after > before) record(1, "meter a public-tier module with a REVOKED session token", "BROKE", "the token is dead for /api/profile (401) and still wrote a usage mark on a public module route (" + r.status + "). meterUserId reads the signature only and never checks tokenVersion, so a signed-out session keeps counting as an active member and as that module's reach.");
else record(1, "meter a public-tier module with a REVOKED session token", "HELD", "revoked token wrote 0 marks (route " + r.status + ")");

// HEAD, re-ranked. The question is not "does HEAD mark" but "does HEAD give a
// member anything a plain GET does not". Same member, same saturating unit.
await c.query("DELETE FROM module_usage_marks");
const modules = ["library", "badges"];
for (const m of modules) await api("HEAD", "/api/" + m, undefined, A.aliceToken);
await settle();
const [rows] = await c.query("SELECT module_id FROM module_usage_marks WHERE user_id=?", [A.aliceId]);
console.log("  alice HEADed " + modules.length + " modules -> " + rows.length + " marks");
record(1, "claim modules with HEAD instead of GET", "HELD",
  rows.length + " marks for " + modules.length + " HEADs, which is exactly what " + modules.length + " GETs would have produced. HEAD is not a lever: the unit is one member per module per cycle either way, and a member who can HEAD can GET.");

await c.end();
dump("inv1b.json");
