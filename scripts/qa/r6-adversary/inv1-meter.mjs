/**
 * Invariant 1: value cannot be made to appear. THE METER (PR #86).
 * Every claim in server/lib/moduleUsage.ts's header is tested as a claim.
 * LOCAL only, port 3902, scratch schema village_qa6_2.
 */
import { api, actors, record, dump, db } from "./h.mjs";
const A = actors();
const c = await db();

const marks = async (where = "1=1") => {
  const [r] = await c.query(
    "SELECT cycle_id, module_id, user_id FROM module_usage_marks WHERE " + where + " ORDER BY module_id, user_id",
  );
  return r;
};
const countFor = async (mod, uid) => {
  const [[r]] = await c.query(
    "SELECT COUNT(*) n FROM module_usage_marks WHERE module_id=? AND user_id=?",
    [mod, uid],
  );
  return Number(r.n);
};
const settle = () => new Promise((r) => setTimeout(r, 800)); // the mark is fire-and-forget

for (const m of ["library", "tools", "resources", "badges"]) {
  const r = await api("PUT", "/api/admin/modules/" + m + "/lifecycle", { lifecycle: "members" }, A.founderToken);
  console.log("  enable " + m + ": " + r.status + " " + String(JSON.stringify(r.json)).slice(0, 100));
}
await c.query("DELETE FROM module_usage_marks");

// CONTROL: one honest open must produce exactly one mark.
const ctl = await api("GET", "/api/library", undefined, A.aliceToken);
await settle();
const ctlN = await countFor("library", A.aliceId);
console.log("\ncontrol landed: " + (ctlN === 1) + " -- one GET /api/library/items by alice [" + ctl.status + "] -> " + ctlN + " mark(s)");
if (ctlN !== 1) {
  record(1, "control: an honest open marks once", "NOT MEASURABLE", "expected 1 mark, got " + ctlN + "; every count below would be meaningless");
  dump("inv1.json");
  await c.end();
  process.exit(0);
}

// 1a. SATURATION: open the same module 40 more times.
for (let i = 0; i < 40; i++) await api("GET", "/api/library", undefined, A.aliceToken);
await settle();
let n = await countFor("library", A.aliceId);
if (n > 1) record(1, "open the same module 41 times", "BROKE", n + " marks for one member");
else record(1, "open the same module 41 times (the saturation claim)", "HELD", "still " + n + " mark");

// 1a2. different paths under the same prefix.
for (const p of ["/api/library", "/api/badges", "/api/tools", "/api/library?q=x"]) {
  await api("GET", p, undefined, A.aliceToken);
}
await settle();
n = await countFor("library", A.aliceId);
if (n > 1) record(1, "open 4 different paths under one module prefix", "BROKE", n + " marks");
else record(1, "open 4 different paths under one module prefix", "HELD", "still " + n + " mark");

// 1a3. the in-memory `seen` set versus a row that vanished.
await c.query("DELETE FROM module_usage_marks WHERE module_id='library' AND user_id=?", [A.aliceId]);
await api("GET", "/api/library", undefined, A.aliceToken);
await settle();
n = await countFor("library", A.aliceId);
record(
  1,
  "delete the mark, reopen: does this process re-mark",
  "HELD",
  n > 0
    ? "re-marked (" + n + ")"
    : "NOT re-marked: the per-process `seen` set suppressed the write, so a row lost after the process cached it does not come back until the cycle turns. The error direction is DOWN (a count too low), never up.",
);

// 1b. THE 404 ATTACK.
await c.query("DELETE FROM module_usage_marks");
const bogus = await api("GET", "/api/library/there-is-no-such-route-here", undefined, A.aliceToken);
await settle();
n = await countFor("library", A.aliceId);
if (n > 0) record(1, "404 under a module prefix counts as a use", "BROKE", "[" + bogus.status + "] marked " + n);
else record(1, "404 under a module prefix counts as a use", "HELD", "[" + bogus.status + "] 0 marks");

// 1b2. sweep every prefix with one bogus path each.
await c.query("DELETE FROM module_usage_marks");
const prefixes = ["library", "tools", "resources", "badges", "map", "forum", "feed", "events", "stays", "products", "health", "messages", "intents", "network", "crowdpool", "exchange", "recordings"];
for (const p of prefixes) await api("GET", "/api/" + p + "/zzz-not-a-route-" + Date.now(), undefined, A.bobToken);
await settle();
let all = await marks("user_id=" + c.escape(A.bobId));
if (all.length) record(1, "sweep " + prefixes.length + " module prefixes with a bogus path each", "BROKE", "claimed " + all.length + ": " + all.map((r) => r.module_id).join(","));
else record(1, "sweep " + prefixes.length + " module prefixes with a bogus path each", "HELD", "0 of " + prefixes.length + " modules claimed by a bogus path");

// 1c. HEAD and OPTIONS: a sub-400 response that served nothing.
await c.query("DELETE FROM module_usage_marks");
const h = await api("HEAD", "/api/library", undefined, A.bobToken);
const o = await api("OPTIONS", "/api/library", undefined, A.bobToken);
await settle();
all = await marks("user_id=" + c.escape(A.bobId));
console.log("  HEAD -> " + h.status + ", OPTIONS -> " + o.status + ", marks: " + all.length);
if (all.length) record(1, "HEAD/OPTIONS a module route (no body served)", "BROKE", "HEAD " + h.status + " OPTIONS " + o.status + " produced " + all.length + " mark(s)");
else record(1, "HEAD/OPTIONS a module route (no body served)", "HELD", "HEAD " + h.status + " OPTIONS " + o.status + ", 0 marks");

// 1d. the admin-prefix exclusion, and four alias paths around it.
await c.query("DELETE FROM module_usage_marks");
const aliases = ["/api/admin/library", "/API/Admin/library", "/api//admin/library", "/api/./admin/library", "/api/%61dmin/library"];
for (const p of aliases) {
  const r = await api("GET", p, undefined, A.founderToken);
  console.log("  " + p + " -> " + r.status);
}
await settle();
all = await marks("user_id=" + c.escape(A.founderId));
if (all.length) record(1, "reach a module's admin prefix by an alias path so configuration counts as use", "BROKE", all.length + " mark(s): " + JSON.stringify(all));
else record(1, "reach a module's admin prefix by " + aliases.length + " alias paths (case, double slash, dot segment, percent-encoding)", "HELD", "0 marks; admin traffic never counted");

// 1e. a dead session still meters? meterUserId does not check tokenVersion.
await c.query("DELETE FROM module_usage_marks");
const beforeLogout = await api("GET", "/api/library", undefined, A.carolToken);
const lo = await api("POST", "/api/auth/logout", {}, A.carolToken);
const afterLogout = await api("GET", "/api/library", undefined, A.carolToken);
await settle();
const carolN = await countFor("library", A.carolId);
console.log("  carol before " + beforeLogout.status + ", logout " + lo.status + ", after " + afterLogout.status + ", marks " + carolN);
record(
  1,
  "a signed-out (tokenVersion-bumped) session still meters",
  afterLogout.status >= 400 && carolN <= 1 ? "HELD" : "BROKE",
  "after logout the module route answered " + afterLogout.status + "; marks for carol = " + carolN,
);

// 1e2. the same dead token against a PUBLIC-tier module, where the route does
// not need auth to answer 200 but meterUserId still reads the signature.
await api("PUT", "/api/admin/modules/library/lifecycle", { lifecycle: "public" }, A.founderToken);
await c.query("DELETE FROM module_usage_marks");
const pub = await api("GET", "/api/library", undefined, A.carolToken);
await settle();
const carolPub = await countFor("library", A.carolId);
console.log("  public-tier library with carol's dead token -> " + pub.status + ", marks " + carolPub);
if (pub.status < 400 && carolPub > 0) record(1, "meter a public-tier module with a REVOKED session token", "BROKE", "route " + pub.status + " and the revoked session still wrote " + carolPub + " mark(s); meterUserId reads the signature and never checks tokenVersion");
else record(1, "meter a public-tier module with a REVOKED session token", "HELD", "route " + pub.status + ", marks " + carolPub);
await api("PUT", "/api/admin/modules/library/lifecycle", { lifecycle: "members" }, A.founderToken);

// 1f. attribute a use to somebody else.
await c.query("DELETE FROM module_usage_marks");
await api("GET", "/api/library", undefined, A.bobToken, { "X-User-Id": A.aliceId, "X-Forwarded-User": A.aliceId });
await api("GET", "/api/library/items?userId=" + A.aliceId, undefined, A.bobToken);
await settle();
all = await marks();
const wrongOwner = all.filter((r) => r.user_id !== A.bobId);
if (wrongOwner.length) record(1, "attribute a use to another member via header or query", "BROKE", JSON.stringify(all));
else record(1, "attribute a use to another member via header or query", "HELD", "all " + all.length + " mark(s) belong to the caller");

// 1g. a forged token, to prove meterUserId cannot be handed an id we did not mint.
await c.query("DELETE FROM module_usage_marks");
const forged = Buffer.from(JSON.stringify({ userId: "ghost-member", email: "g@x", timestamp: Date.now(), v: 0 })).toString("base64url") + ".AAAA";
const fr = await api("GET", "/api/library", undefined, forged);
await settle();
all = await marks();
if (all.some((r) => r.user_id === "ghost-member")) record(1, "invent a member id in an unsigned token and mark with it", "BROKE", JSON.stringify(all));
else record(1, "invent a member id in an unsigned token and mark with it", "HELD", "route " + fr.status + ", 0 marks for the invented id");

console.log("\nfinal marks table: " + JSON.stringify(await marks()));
await c.end();
dump("inv1.json");
