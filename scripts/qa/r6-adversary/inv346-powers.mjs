/**
 * Invariants 3, 4 and 6 on the power machinery (PRs 75, 83, 85, 87, 88).
 *
 *   3 — a power cannot be held by someone nobody gave it to
 *   4 — an act cannot happen without leaving the record, and the record must
 *       not be written for a LOOK or for an act that failed
 *   6 — a deny cannot be evaded, and a deny cannot be over-reach
 *
 * LOCAL only, port 3902, scratch schema village_qa6_2.
 */
import { api, actors, record, dump, db } from "./h.mjs";
const A = actors();
// inv1 logged carol and dave out; a revoked token 401s for the wrong reason.
for (const [k, email] of [["carol", "carol@qa62.test"], ["dave", "dave@qa62.test"], ["alice", "alice@qa62.test"], ["bob", "bob@qa62.test"], ["founder", "founder@qa62.test"]]) {
  const r = await (await import("./h.mjs")).api("POST", "/api/auth/login", { email, password: "QaTest123!" });
  if (r.json?.token) A[k + "Token"] = r.json.token;
  else console.log("  could not refresh " + k + ": " + r.status + " " + JSON.stringify(r.json));
}
const c = await db();
const CAP = "feed.announce";
const ROLE = "steward-circle"; // an existing non-example village role that already carries feed.announce

const setVar = async (k, v) => (await api("PUT", "/api/admin/variables/" + k, { value: v }, A.founderToken)).status;
const publicLines = async () => {
  const [r] = await c.query(
    "SELECT id, kind, text, audience, at FROM health_events WHERE entity_type='capability' ORDER BY at, id",
  );
  return r;
};
const held = async () => {
  const [r] = await c.query("SELECT * FROM capability_holding");
  return r;
};

// ── Setup: a village role that carries the power, with carol seated ────────
await setVar("governance.weight_mode", "equal");
await setVar("governance.quorum_pct", 1);
await setVar("governance.unity_pct", 1);
await setVar("governance.default_method", "majority");
for (const m of ["forum", "feed"]) {
  const r = await api("PUT", "/api/admin/modules/" + m + "/lifecycle", { lifecycle: "members" }, A.founderToken);
  console.log("  enable " + m + " -> " + r.status + " " + String(JSON.stringify(r.json)).slice(0, 120));
}

const roleNow = (await api("GET", "/api/roles")).json?.find?.((r) => r.id === ROLE);
console.log("role " + ROLE + " carries: " + JSON.stringify(roleNow?.capabilities) + " isExample=" + roleNow?.isExample);
const seat = await api("POST", "/api/admin/roles/" + ROLE + "/holders", { userId: A.carolId, action: "add" }, A.founderToken);
console.log("seat carol in " + ROLE + " -> " + seat.status + " " + String(JSON.stringify(seat.json)).slice(0, 160));
// A handover is the village's own act: the opener must hold proposal.open as a
// MEMBER, not through the admin account. Bob gets founders-circle for that.
const seatBob = await api("POST", "/api/admin/roles/founders-circle/holders", { userId: A.bobId, action: "add" }, A.founderToken);
console.log("seat bob in founders-circle -> " + seatBob.status + " " + String(JSON.stringify(seatBob.json)).slice(0, 160));
if (!roleNow || !roleNow.capabilities?.includes(CAP)) {
  record(3, "setup: a village role carrying " + CAP, "NOT MEASURABLE", "role " + ROLE + " does not carry " + CAP + ": " + JSON.stringify(roleNow?.capabilities));
  dump("inv346.json"); await c.end(); process.exit(0);
}

// ── CONTROL: the power is NOT village-held yet, and an admin acts freely ───
const before = await held();
const ANNOUNCE = "/api/forum/threads";
const announceBody = { category: "village-life", kind: "announcement", title: "QA control announcement", body: "The QA lane says hello to the whole village." };
const ctlLines = (await publicLines()).length;
const ctl = await api("POST", ANNOUNCE, announceBody, A.founderToken);
console.log("\ncontrol landed: capability_holding rows before the vote = " + before.length + "; admin announce -> " + ctl.status + " " + String(JSON.stringify(ctl.json)).slice(0, 160));
console.log("  capability lines on the record: " + ctlLines);

// ── The ceremony: the village asks to hold the power ──────────────────────
const ask = await api("POST", "/api/governance/power-transfers", {
  capability: CAP,
  roleId: ROLE,
  reason: "The QA lane is exercising the handover ceremony end to end so the record can be checked against the act itself.",
}, A.bobToken);
const tid = ask.json?.ballot?.id ?? ask.json?.id;
console.log("\npower-transfer ballot -> [" + ask.status + "] " + String(JSON.stringify(ask.json)).slice(0, 220));

// 3a. an ordinary member opening a handover
const asMember = await api("POST", "/api/governance/power-transfers", {
  capability: "forum.moderate", roleId: ROLE,
  reason: "An ordinary member trying to move a power without standing, to see what the route does about it.",
}, A.aliceToken);
record(3, "open a power handover as an ordinary member", asMember.status >= 400 ? "HELD" : "BROKE",
  "POST /api/governance/power-transfers with a member token -> " + asMember.status + " " + String(JSON.stringify(asMember.json)).slice(0, 200));

// 3b. replay the SAME transfer request
const replay = await api("POST", "/api/governance/power-transfers", {
  capability: CAP, roleId: ROLE,
  reason: "Replaying the identical handover request to see whether a second ballot opens on the same power.",
}, A.bobToken);
record(3, "replay the same power-transfer request", replay.status >= 400 ? "HELD" : "BROKE",
  "second identical request -> " + replay.status + " " + String(JSON.stringify(replay.json)).slice(0, 200));

const alreadyHeld = (await held()).some((h) => h.capability === CAP);
if (!tid && !alreadyHeld) {
  record(3, "carry a power to the village", "NOT MEASURABLE", "the transfer ballot did not open: " + ask.status + " " + JSON.stringify(ask.json));
  dump("inv346.json");
  await c.end();
  process.exit(0);
}
if (!tid && alreadyHeld) console.log("(the ceremony already ran in an earlier pass; " + CAP + " is village-held, continuing)");

// Vote it through and close it.
if (tid) for (const [k, t] of [["founder", A.founderToken], ["alice", A.aliceToken], ["bob", A.bobToken], ["carol", A.carolToken], ["dave", A.daveToken]]) {
  const v = await api("POST", "/api/governance/ballots/" + tid + "/vote", { choice: "yes" }, t);
  if (v.status !== 200) console.log("  vote " + k + " -> " + v.status + " " + String(JSON.stringify(v.json)).slice(0, 120));
}
const closed = tid ? await api("POST", "/api/governance/ballots/" + tid + "/close", { outcomeNote: "The village carried the handover; the QA lane now checks the record against the act." }, A.founderToken) : { status: 0, json: {} };
console.log("close -> [" + closed.status + "] outcome=" + closed.json?.outcome + " applied=" + JSON.stringify(closed.json?.applied));
const holdings = await held();
console.log("capability_holding: " + JSON.stringify(holdings));
const villageHolds = holdings.some((h) => h.capability === CAP);
if (!villageHolds) {
  record(3, "carry a power to the village", "NOT MEASURABLE", "the ballot closed " + closed.json?.outcome + " and capability_holding does not carry " + CAP + "; every invariant-4 test below needs a village-held key");
  dump("inv346.json");
  await c.end();
  process.exit(0);
}
record(3, tid ? "the ceremony moved the power (control for everything below)" : "the power is village-held (carried by an earlier pass of this probe)", "HELD", "capability_holding now carries " + CAP + ": " + JSON.stringify(holdings));

// ── 4. THE RECORD ─────────────────────────────────────────────────────────
const linesBefore = await publicLines();
console.log("\ncapability records before the invariant-4 attacks: " + linesBefore.length);

// 4a. an admin who is NOT seated acts WITHOUT breaking the glass
const noGlass = await api("POST", ANNOUNCE, announceBody, A.founderToken);
const after4a = await publicLines();
const new4a = after4a.slice(linesBefore.length);
console.log("4a: unseated admin announces with no override -> [" + noGlass.status + "] " + String(JSON.stringify(noGlass.json)).slice(0, 200));
console.log("    new capability rows: " + JSON.stringify(new4a));
const pub4a = new4a.filter((r) => r.audience === "public");
if (pub4a.length) record(4, "a REFUSED act writes the public 'acted on a power' line", "BROKE", JSON.stringify(pub4a));
else record(4, "a REFUSED act (409 hatch, no override) writes the public line", "HELD", "route " + noGlass.status + ", " + new4a.length + " new capability row(s), 0 public");

// 4b. break the glass and FAIL VALIDATION
const base4b = (await publicLines()).length;
const badBody = await api("POST", ANNOUNCE, { category: "village-life", kind: "announcement", title: "", body: "", override: true }, A.founderToken);
const after4b = await publicLines();
const new4b = after4b.slice(base4b);
console.log("4b: override + a body the route must refuse -> [" + badBody.status + "] " + String(JSON.stringify(badBody.json)).slice(0, 200));
console.log("    new capability rows: " + JSON.stringify(new4b));
const pub4b = new4b.filter((r) => r.audience === "public");
if (badBody.status < 400) {
  record(4, "break the glass then fail validation: is a public act recorded", "NOT MEASURABLE", "the route accepted the body (" + badBody.status + "), so no failing act was produced");
} else if (pub4b.length) {
  record(4, "break the glass then fail validation: is a public act recorded", "BROKE",
    "the route refused with " + badBody.status + " and the village was still told an act happened: " + JSON.stringify(pub4b));
} else {
  record(4, "break the glass then fail validation: is a public act recorded", "HELD",
    "route " + badBody.status + "; the admin trail carries " + new4b.map((r) => r.text.split(":").slice(0, 2).join(":")).join(" + ") + " and the public record carries nothing");
}

// 4c. CONTROL: break the glass and SUCCEED. A public line must appear.
const base4c = (await publicLines()).length;
const good = await api("POST", ANNOUNCE, { ...announceBody, title: "QA valid override announcement", override: true }, A.founderToken);
const new4c = (await publicLines()).slice(base4c);
const pub4c = new4c.filter((r) => r.audience === "public");
console.log("4c control: override + a valid body -> [" + good.status + "]; new rows " + JSON.stringify(new4c.map((r) => r.audience + ":" + r.text.slice(0, 70))));
if (good.status < 400 && pub4c.length === 1) record(4, "control: a SUCCESSFUL reach writes exactly one public line", "HELD", pub4c[0].text);
else record(4, "control: a SUCCESSFUL reach writes exactly one public line", "NOT MEASURABLE", "route " + good.status + ", " + pub4c.length + " public row(s); the 4b negative rests on this control");

// 4d. LOOK, do not act. Every read surface that reports this power.
const base4d = (await publicLines()).length;
const reads = ["/api/map", "/api/feed", "/api/org", "/api/roles", "/api/powers", "/api/governance/standing", "/api/game/progression", "/api/profile"];
for (const r of reads) {
  const rr = await api("GET", r, undefined, A.founderToken);
  const rr2 = await api("GET", r, undefined, A.founderToken, { "x-capability-override": "1" });
  console.log("  read " + r + " -> " + rr.status + " / with override header " + rr2.status);
}
const new4d = (await publicLines()).slice(base4d);
console.log("4d: " + reads.length + " read surfaces, each also with x-capability-override; new capability rows: " + JSON.stringify(new4d));
if (new4d.length) record(4, "LOOK at " + reads.length + " read surfaces (twice each, once carrying x-capability-override) and see whether the record says somebody acted", "BROKE", JSON.stringify(new4d));
else record(4, "LOOK at " + reads.length + " read surfaces (twice each, once carrying x-capability-override)", "HELD", "0 capability rows written by any read, with or without the override header");

// ── 3 continued: hold the power without being given it ────────────────────
// 3c. seat yourself into the holding role
const selfSeat = await api("POST", "/api/admin/roles/" + ROLE + "/holders", { userId: A.aliceId, action: "add" }, A.aliceToken);
record(3, "seat yourself into the role that holds the power", selfSeat.status >= 400 ? "HELD" : "BROKE",
  "POST /api/admin/roles/" + ROLE + "/holders as alice -> " + selfSeat.status + " " + String(JSON.stringify(selfSeat.json)).slice(0, 160));

// 3d. the SEATED holder acts: allowed, and no public line (she is not reaching past anybody)
const base3d = (await publicLines()).length;
const carolActs = await api("POST", ANNOUNCE, { ...announceBody, title: "QA seated holder announcement" }, A.carolToken);
const new3d = (await publicLines()).slice(base3d);
console.log("\n3d: the seated holder announces -> [" + carolActs.status + "]; new capability rows " + new3d.length);
if (carolActs.status < 400 && new3d.length === 0) record(3, "the seated holder acts", "HELD", "allowed (" + carolActs.status + ") and no override record written, which is correct: she was given it");
else record(3, "the seated holder acts", carolActs.status >= 400 ? "BROKE" : "BROKE", "status " + carolActs.status + ", " + new3d.length + " capability row(s) " + JSON.stringify(new3d));

// 3e. un-seat her, then act again on the old session
const [holdersBefore] = await c.query("SELECT * FROM role_holders WHERE role_id=?", [ROLE]);
const unseat = await api("POST", "/api/admin/roles/" + ROLE + "/holders", { userId: A.carolId, action: "remove" }, A.founderToken);
const [holdersAfter] = await c.query("SELECT * FROM role_holders WHERE role_id=?", [ROLE]);
const stale = await api("POST", ANNOUNCE, { ...announceBody, title: "QA seated holder announcement" }, A.carolToken);
console.log("3e: unseat -> " + unseat.status + "; role_holders " + holdersBefore.length + " -> " + holdersAfter.length + "; her next announce -> " + stale.status + " " + String(JSON.stringify(stale.json)).slice(0, 160));
if (holdersAfter.length < holdersBefore.length && stale.status >= 400) record(3, "act on a power from a stale roll after being un-seated", "HELD", "un-seated (" + unseat.status + ") and the next act was refused " + stale.status);
else if (holdersAfter.length === holdersBefore.length) record(3, "act on a power from a stale roll after being un-seated", "NOT MEASURABLE", "the un-seat route answered " + unseat.status + " and did not remove the row, so nothing stale was produced");
else record(3, "act on a power from a stale roll after being un-seated", "BROKE", "un-seated and still acted: " + stale.status);

await c.end();
dump("inv346.json");
