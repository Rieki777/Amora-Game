/**
 * Invariant 6: a deny cannot be evaded, and a deny cannot be over-reach.
 *
 * Deny-beats-role is the ordering. PR 75 grew the blast radius so a warning
 * badge's deny can now stop an ADMIN on a village-held key. Two questions:
 *   a) can a denied member act anyway
 *   b) can a warning deny something it should not (ballot.vote is the sharp
 *      one, because that is disenfranchisement)
 *
 * LOCAL only, port 3902, scratch schema village_qa6_2.
 */
import { api, actors, record, dump, db } from "./h.mjs";
const A = actors();
const c = await db();
const CAP = "feed.announce";
const ANNOUNCE = "/api/forum/threads";
const body = (t) => ({ category: "village-life", kind: "announcement", title: t, body: "A line the QA lane posted to test a deny." });

for (const [k, email] of [["carol", "carol@qa62.test"], ["alice", "alice@qa62.test"], ["bob", "bob@qa62.test"], ["dave", "dave@qa62.test"], ["founder", "founder@qa62.test"]]) {
  const r = await api("POST", "/api/auth/login", { email, password: "QaTest123!" });
  if (r.json?.token) A[k + "Token"] = r.json.token;
}
await api("PUT", "/api/admin/modules/badges/lifecycle", { lifecycle: "members" }, A.founderToken);
// Reseat carol so she legitimately holds the village-held key.
await api("POST", "/api/admin/roles/steward-circle/holders", { userId: A.carolId, action: "add" }, A.founderToken);

const holdings = async () => (await c.query("SELECT capability, holder_role_id FROM capability_holding"))[0];
console.log("capability_holding: " + JSON.stringify(await holdings()));

// ── CONTROL: carol, seated and un-denied, can announce ────────────────────
const ctl = await api("POST", ANNOUNCE, body("QA deny control, before any badge"), A.carolToken);
console.log("control landed: " + (ctl.status === 200) + " -- seated holder announces -> " + ctl.status + " " + String(JSON.stringify(ctl.json)).slice(0, 140));
if (ctl.status !== 200) {
  record(6, "deny control", "NOT MEASURABLE", "the un-denied holder could not act (" + ctl.status + "), so a later refusal proves nothing");
  dump("inv6.json"); await c.end(); process.exit(0);
}

// ── 6a. A WARNING BADGE THAT DENIES THE KEY ───────────────────────────────
const mk = await api("POST", "/api/admin/badges", {
  name: "QA Announce Hold " + Date.now().toString(36),
  description: "A warning badge the QA lane uses to test deny-beats-role.",
  kind: "warning", capabilities: [], denies: [CAP],
}, A.founderToken);
const badgeId = mk.json?.badge?.id;
console.log("\n6a: warning badge with denies=[" + CAP + "] -> [" + mk.status + "] id=" + badgeId + " " + String(JSON.stringify(mk.json)).slice(0, 200));
if (!badgeId) {
  record(6, "create a warning badge that denies " + CAP, "NOT MEASURABLE", "badge create returned " + mk.status + " " + JSON.stringify(mk.json));
} else {
  const award = await api("POST", "/api/admin/badges/" + badgeId + "/award", { userId: A.carolId, note: "QA deny test" }, A.founderToken);
  const denied = await api("POST", ANNOUNCE, body("QA announcement while denied"), A.carolToken);
  console.log("    award -> " + award.status + "; her next announce -> " + denied.status + " " + String(JSON.stringify(denied.json)).slice(0, 200));
  if (award.status !== 200) record(6, "a warning badge's deny stops the role grant", "NOT MEASURABLE", "the award did not land: " + award.status + " " + JSON.stringify(award.json));
  else if (denied.status < 400) record(6, "a warning badge's deny stops the role grant", "BROKE", "carol holds the deny and still announced: " + denied.status);
  else record(6, "a warning badge's deny stops the role grant (deny beats role)", "HELD", "award " + award.status + ", her announce " + denied.status + " " + String(JSON.stringify(denied.json)).slice(0, 160));

  // 6a2. Evade the deny: the admin path, the stage path, a second role.
  const evades = [];
  const asAdminOverride = await api("POST", ANNOUNCE, { ...body("QA denied member using the override word"), override: true }, A.carolToken);
  evades.push(["send override as the denied member", asAdminOverride]);
  const withHeader = await api("POST", ANNOUNCE, body("QA denied member with the override header"), A.carolToken, { "x-capability-override": "1" });
  evades.push(["send x-capability-override as the denied member", withHeader]);
  const secondRole = await api("POST", "/api/admin/roles/founders-circle/holders", { userId: A.carolId, action: "add" }, A.founderToken);
  const afterSecondRole = await api("POST", ANNOUNCE, body("QA denied member seated in a second role"), A.carolToken);
  evades.push(["be seated in a SECOND role after the deny (seat " + secondRole.status + ")", afterSecondRole]);
  const stageBump = await api("PUT", "/api/admin/players/" + A.carolId + "/stage", { stageId: "co-creator" }, A.founderToken);
  const afterStage = await api("POST", ANNOUNCE, body("QA denied member after a stage bump"), A.carolToken);
  evades.push(["be granted the top stage after the deny (stage " + stageBump.status + ")", afterStage]);
  const got = evades.filter(([, r]) => r.status < 400);
  for (const [what, r] of evades) console.log("    evade: " + what + " -> " + r.status + " " + String(JSON.stringify(r.json)).slice(0, 120));
  if (got.length) record(6, "evade the deny by " + evades.length + " routes (override word, override header, a second role, a stage grant)", "BROKE", got.map(([w, r]) => w + " -> " + r.status).join(" | "));
  else record(6, "evade the deny by " + evades.length + " routes (override word, override header, a second role, a stage grant)", "HELD", evades.map(([w, r]) => w + " -> " + r.status).join(" | "));

  // 6a3. Does the deny stop an ADMIN on the village-held key (PR 75 blast radius)?
  const awardAdmin = await api("POST", "/api/admin/badges/" + badgeId + "/award", { userId: A.founderId, note: "QA deny on the admin" }, A.founderToken);
  const adminDenied = await api("POST", ANNOUNCE, { ...body("QA admin announcement while denied"), override: true }, A.founderToken);
  console.log("    deny on the ADMIN -> award " + awardAdmin.status + ", their override announce -> " + adminDenied.status + " " + String(JSON.stringify(adminDenied.json)).slice(0, 200));
  if (awardAdmin.status !== 200) record(6, "a warning deny stops an admin breaking the glass on a village-held key", "NOT MEASURABLE", "the award to the admin did not land: " + awardAdmin.status);
  else if (adminDenied.status < 400) record(6, "a warning deny stops an admin breaking the glass on a village-held key", "BROKE", "the denied admin still acted: " + adminDenied.status);
  else record(6, "a warning deny stops an admin breaking the glass on a village-held key", "HELD", "the denied admin was refused " + adminDenied.status + " " + String(JSON.stringify(adminDenied.json)).slice(0, 160));
  // put the admin back
  await c.query("DELETE FROM badge_awards WHERE user_id=? AND badge_id=?", [A.founderId, badgeId]);
}

// ── 6b. OVER-REACH: can a warning deny ballot.vote (disenfranchisement)? ───
const over = [];
for (const cap of ["ballot.vote", "forum.post", "member.vouch", "quest.claim", "profile.edit"]) {
  const r = await api("POST", "/api/admin/badges", {
    name: "QA Overreach " + cap.replace(/\W/g, "") + Date.now().toString(36),
    description: "Testing whether a warning badge may deny " + cap + ".",
    kind: "warning", capabilities: [], denies: [cap],
  }, A.founderToken);
  over.push([cap, r.status, String(JSON.stringify(r.json)).slice(0, 130)]);
  console.log("6b: warning badge denying " + cap + " -> " + r.status + " " + String(JSON.stringify(r.json)).slice(0, 130));
}
const votingDeny = over.find(([cap]) => cap === "ballot.vote");
if (votingDeny[1] === 200) {
  // It was accepted. Does it actually take a member off the roll?
  const bad = await api("GET", "/api/admin/badges", undefined, A.founderToken);
  const b = (bad.json?.badges ?? bad.json ?? []).find?.((x) => Array.isArray(x.denies) && x.denies.includes("ballot.vote"));
  const aw = b ? await api("POST", "/api/admin/badges/" + b.id + "/award", { userId: A.aliceId, note: "QA disenfranchisement test" }, A.founderToken) : { status: 0 };
  const openR = await api("POST", "/api/governance/advisory", { question: "Does a warning badge take a member off the voting roll?", detail: "QA", method: "majority" }, A.bobToken);
  const bid = openR.json?.ballot?.id;
  const [rollRows] = bid ? await c.query("SELECT user_id FROM ballot_electorate WHERE ballot_id=?", [bid]) : [[]];
  const aliceOnRoll = rollRows.some((r) => r.user_id === A.aliceId);
  const aliceVote = bid ? await api("POST", "/api/governance/ballots/" + bid + "/vote", { choice: "yes" }, A.aliceToken) : { status: 0, json: {} };
  console.log("    award " + aw.status + "; ballot " + openR.status + " " + bid + "; alice on the roll: " + aliceOnRoll + "; her vote -> " + aliceVote.status + " " + JSON.stringify(aliceVote.json));
  record(6, "a warning badge that denies ballot.vote takes a member off the roll (disenfranchisement)",
    aliceOnRoll ? "HELD" : "BROKE",
    aliceOnRoll
      ? "the badge was accepted (" + votingDeny[1] + ") and awarded (" + aw.status + ") and alice is STILL on the frozen roll and her vote answered " + aliceVote.status
      : "the badge was accepted (" + votingDeny[1] + "), awarded (" + aw.status + "), and alice is absent from the electorate of a ballot opened afterwards; her vote answered " + aliceVote.status + " " + JSON.stringify(aliceVote.json));
} else {
  record(6, "create a warning badge that denies ballot.vote", "HELD", "the badge route refused it: " + votingDeny[1] + " " + votingDeny[2]);
}
record(6, "create warning badges denying " + over.length + " personal or plumbing keys", "HELD",
  over.map(([cap, st]) => cap + ":" + st).join(" | ") + " (a 200 here is not yet a defect; what matters is whether the deny then bites, tested above for ballot.vote)");

await c.end();
dump("inv6.json");
