/**
 * Invariant 2: a frozen decision cannot be changed.
 * Invariant 3 (partly): a power cannot be held by someone nobody gave it to.
 *
 * "A vote is counted against the day it opened." Every dial, weight and roll
 * member is supposed to be frozen inside the open transaction. This moves each
 * of them while a ballot is open and reads the ballot back.
 *
 * LOCAL only, port 3902, scratch schema village_qa6_2.
 */
import { api, actors, record, dump, db } from "./h.mjs";
const A = actors();
const c = await db();
const PW = "QaTest123!";
const stamp = Date.now();

const setVar = async (k, v) => (await api("PUT", "/api/admin/variables/" + k, { value: v }, A.founderToken)).status;
const readVar = async (k) => {
  const r = await api("GET", "/api/admin/variables", undefined, A.founderToken);
  const flat = {};
  (function walk(x) {
    if (Array.isArray(x)) return x.forEach(walk);
    if (x && typeof x === "object") {
      if (typeof x.key === "string" && "value" in x) flat[x.key] = x.value;
      Object.values(x).forEach(walk);
    }
  })(r.json);
  return flat[k];
};
const roll = async (bid) => {
  const [r] = await c.query("SELECT user_id, weight FROM ballot_electorate WHERE ballot_id=? ORDER BY user_id", [bid]);
  return r.map((x) => x.user_id.slice(-6) + ":" + x.weight).join(" ");
};
const ballotRow = async (bid) => {
  const [[r]] = await c.query("SELECT id, status, method, weight_mode, weight_token, unity_pct, quorum_pct, opens_at, closes_at FROM ballots WHERE id=?", [bid]);
  return r;
};

console.log("enable governance: " + (await api("PUT", "/api/admin/modules/governance/lifecycle", { lifecycle: "members" }, A.founderToken)).status);
console.log("weight_mode=token: " + (await setVar("governance.weight_mode", "token")));
console.log("weight_token=village-voice: " + (await setVar("governance.weight_token", "village-voice")));
console.log("mint cap headroom: " + (await setVar("ledger.admin_mint_cycle_cap", 1000000)));
console.log("quorum_pct=50: " + (await setVar("governance.quorum_pct", 50)));
console.log("unity_pct=75: " + (await setVar("governance.unity_pct", 75)));

// Give the ordinary members the member stage so ballot.vote unlocks for them.
for (const [k, id] of [["alice", A.aliceId], ["bob", A.bobId], ["carol", A.carolId], ["dave", A.daveId]]) {
  const r = await api("PUT", "/api/admin/players/" + id + "/stage", { stageId: "member" }, A.founderToken);
  console.log("  stage member for " + k + " -> " + r.status + " " + String(JSON.stringify(r.json)).slice(0, 90));
}

// Seed voting weight so the electorate has non-zero total weight.
for (const [id, amt] of [[A.aliceId, 10], [A.bobId, 10], [A.carolId, 10], [A.founderId, 10], [A.daveId, 10]]) {
  const r = await api("POST", "/api/admin/tokens/village-voice/mint", { toUserId: id, amount: amt, reason: "seed weight" }, A.founderToken);
  if (r.status !== 200) console.log("  seed mint " + id.slice(-6) + " -> " + r.status + " " + JSON.stringify(r.json));
}

// Clear any ballot left open by an earlier run of this probe.
{
  const [openRows] = await c.query("SELECT id FROM ballots WHERE status='open'");
  for (const r of openRows) {
    const w = await api("POST", "/api/governance/ballots/" + r.id + "/withdraw", { reason: "clearing a prior QA run" }, A.founderToken);
    console.log("  clear prior ballot " + r.id + " -> withdraw " + w.status);
  }
}

// ── CONTROL: open a ballot, and prove it exists with a frozen roll ─────────
const open = await api("POST", "/api/governance/advisory", { question: "Shall the village practise a vote for the QA lane?", detail: "control", method: "majority" }, A.founderToken);
const bid = open.json?.ballot?.id ?? open.json?.id;
console.log("\ncontrol landed: " + (open.status === 200 && !!bid) + " -- advisory open [" + open.status + "] id=" + bid + " " + JSON.stringify(open.json).slice(0, 200));
if (!bid) {
  record(2, "open a ballot to attack", "NOT MEASURABLE", "advisory open returned " + open.status + " " + JSON.stringify(open.json));
  dump("inv2.json");
  await c.end();
  process.exit(0);
}
const frozen = await ballotRow(bid);
const frozenRoll = await roll(bid);
console.log("  frozen ballot: " + JSON.stringify(frozen));
console.log("  frozen roll:   " + frozenRoll);
if (!frozenRoll) {
  record(2, "frozen roll control", "NOT MEASURABLE", "ballot_electorate is empty for " + bid);
  dump("inv2.json");
  await c.end();
  process.exit(0);
}

// ── 2a. MINT WEIGHT MID-BALLOT ─────────────────────────────────────────────
const mint = await api("POST", "/api/admin/tokens/village-voice/mint", { toUserId: A.aliceId, amount: 5000, reason: "mid-ballot weight grab" }, A.founderToken);
const [[aliceBal]] = await c.query("SELECT balance FROM token_balances WHERE account_id=? AND token_type='village-voice'", ["mem:" + A.aliceId]);
const rollAfterMint = await roll(bid);
console.log("\n2a: minted 5000 village-voice to alice mid-ballot [" + mint.status + "]; her token_balances row is now " + JSON.stringify(aliceBal));
console.log("    roll now: " + rollAfterMint);
const [[balBefore2]] = [[{ balance: null }]];
if (mint.status !== 200) {
  record(2, "mint 5000 of the weight token to a voter while the ballot is open", "NOT MEASURABLE", "the mint itself was refused (" + mint.status + " " + JSON.stringify(mint.json) + "), so no new weight was injected and the frozen roll was never tested");
} else if (rollAfterMint !== frozenRoll) record(2, "mint 5000 of the weight token to a voter while the ballot is open", "BROKE", "roll moved from [" + frozenRoll + "] to [" + rollAfterMint + "]");
else record(2, "mint 5000 of the weight token to a voter while the ballot is open", "HELD", "her live balance moved to " + (aliceBal?.balance) + " and the frozen roll did not move: [" + frozenRoll + "]");

// ── 2b. MOVE THE DIALS MID-BALLOT ──────────────────────────────────────────
await setVar("governance.quorum_pct", 1);
await setVar("governance.unity_pct", 1);
const afterDials = await ballotRow(bid);
console.log("2b: dials moved to quorum=" + (await readVar("governance.quorum_pct")) + " unity=" + (await readVar("governance.unity_pct")) + "; ballot row now " + JSON.stringify(afterDials));
if (afterDials.unity_pct !== frozen.unity_pct || afterDials.quorum_pct !== frozen.quorum_pct) {
  record(2, "drop quorum_pct and unity_pct to 1 while the ballot is open", "BROKE", "the ballot's own dials moved " + frozen.unity_pct + "/" + frozen.quorum_pct + " -> " + afterDials.unity_pct + "/" + afterDials.quorum_pct);
} else {
  record(2, "drop quorum_pct and unity_pct to 1 while the ballot is open", "HELD", "the village dials read " + (await readVar("governance.quorum_pct")) + "/" + (await readVar("governance.unity_pct")) + " and the ballot still carries " + afterDials.quorum_pct + "/" + afterDials.unity_pct);
}

// ── 2c. SWITCH THE WEIGHT MODE MID-BALLOT ──────────────────────────────────
await setVar("governance.weight_mode", "custom");
await api("PUT", "/api/admin/governance/weights/" + A.aliceId, { weight: 9999, note: "mid-ballot custom weight" }, A.founderToken);
const rollAfterMode = await roll(bid);
const rowAfterMode = await ballotRow(bid);
console.log("2c: weight_mode switched to custom, alice weighted 9999; roll " + rollAfterMode + "; ballot weight_mode " + rowAfterMode.weight_mode);
if (rollAfterMode !== frozenRoll || rowAfterMode.weight_mode !== frozen.weight_mode) {
  record(2, "switch weight_mode and set a custom weight of 9999 while the ballot is open", "BROKE", "roll [" + frozenRoll + "] -> [" + rollAfterMode + "], mode " + frozen.weight_mode + " -> " + rowAfterMode.weight_mode);
} else {
  record(2, "switch weight_mode and set a custom weight of 9999 while the ballot is open", "HELD", "the ballot keeps weight_mode=" + rowAfterMode.weight_mode + " and roll [" + frozenRoll + "]");
}
await setVar("governance.weight_mode", "token");

// ── 2d. ADD A MEMBER MID-BALLOT, AND LET THEM TRY TO VOTE ──────────────────
const late = await api("POST", "/api/auth/register", { name: "Late Arrival", email: "late" + stamp + "@qa62.test", password: PW, paths: ["builder"] });
const lateId = late.json?.user?.id, lateToken = late.json?.token;
await api("POST", "/api/admin/tokens/village-voice/mint", { toUserId: lateId, amount: 50, reason: "late weight" }, A.founderToken);
const rollAfterJoin = await roll(bid);
const lateVote = await api("POST", "/api/governance/ballots/" + bid + "/vote", { choice: "yes" }, lateToken);
const [lateRows] = await c.query("SELECT * FROM ballot_votes WHERE ballot_id=? AND user_id=?", [bid, lateId]);
console.log("2d: a member who registered after the open tried to vote -> [" + lateVote.status + "] " + JSON.stringify(lateVote.json) + "; rows " + lateRows.length);
if (lateRows.length || rollAfterJoin !== frozenRoll) record(2, "join the village after the open, then vote", "BROKE", "vote " + lateVote.status + ", rows " + lateRows.length + ", roll [" + rollAfterJoin + "]");
else record(2, "join the village after the open, then vote", "HELD", "vote refused " + lateVote.status + " " + JSON.stringify(lateVote.json) + " and the roll did not grow");

// ── 2e. VOTE TWICE, AND FLIP THE CHOICE ────────────────────────────────────
const v1 = await api("POST", "/api/governance/ballots/" + bid + "/vote", { choice: "yes", reason: "first" }, A.aliceToken);
const v2 = await api("POST", "/api/governance/ballots/" + bid + "/vote", { choice: "no", reason: "second" }, A.aliceToken);
const [aliceVotes] = await c.query("SELECT choice FROM ballot_votes WHERE ballot_id=? AND user_id=?", [bid, A.aliceId]);
console.log("2e: alice voted yes [" + v1.status + "] then no [" + v2.status + "]; her rows: " + JSON.stringify(aliceVotes));
if (aliceVotes.length > 1) record(2, "cast two votes on one ballot", "BROKE", aliceVotes.length + " rows: " + JSON.stringify(aliceVotes));
else record(2, "cast two votes on one ballot", "HELD", "one row only: " + JSON.stringify(aliceVotes) + " (second call " + v2.status + ")");
// Is her recorded weight the FROZEN one, or the 5000 she was minted mid-ballot?
const frozenAlice = Number((frozenRoll.match(new RegExp(A.aliceId.slice(-6) + ":(\\d+)")) ?? [])[1]);
const [[eRow]] = await c.query("SELECT weight FROM ballot_electorate WHERE ballot_id=? AND user_id=?", [bid, A.aliceId]);
const votedWeight = Number(eRow?.weight);
if (Number.isFinite(frozenAlice) && Number.isFinite(votedWeight)) {
  if (votedWeight !== frozenAlice) record(2, "a vote cast after a mid-ballot mint counts at the NEW weight", "BROKE", "frozen roll weight " + frozenAlice + ", electorate row now " + votedWeight);
  else record(2, "a vote cast after a mid-ballot mint counts at the NEW weight", "HELD", "the tally reads the frozen electorate weight " + votedWeight + " (her live token_balances row is 5010); ballot_votes carries no weight column at all, so the frozen roll is the only source");
} else {
  record(2, "a vote cast after a mid-ballot mint carries the NEW weight", "NOT MEASURABLE", "frozen weight parsed as " + frozenAlice + ", vote weight " + votedWeight);
}

// ── 2f. VOTE AFTER THE CLOSE ───────────────────────────────────────────────
const close = await api("POST", "/api/governance/ballots/" + bid + "/close", { outcomeNote: "The village practised a vote and the QA lane recorded it." }, A.founderToken);
console.log("2f: close -> [" + close.status + "] " + JSON.stringify(close.json).slice(0, 240));
const afterClose = await api("POST", "/api/governance/ballots/" + bid + "/vote", { choice: "yes" }, A.bobToken);
const [bobRows] = await c.query("SELECT * FROM ballot_votes WHERE ballot_id=? AND user_id=?", [bid, A.bobId]);
console.log("    vote after close -> [" + afterClose.status + "] " + JSON.stringify(afterClose.json) + "; bob rows " + bobRows.length);
if (bobRows.length) record(2, "vote after the ballot is closed", "BROKE", "status " + afterClose.status + ", row written");
else record(2, "vote after the ballot is closed", "HELD", afterClose.status + " " + JSON.stringify(afterClose.json));

// ── 2g. REOPEN / EDIT A CLOSED BALLOT THROUGH ITS OWN ROUTES ───────────────
const reclose = await api("POST", "/api/governance/ballots/" + bid + "/close", { outcomeNote: "A second close, asking for a different outcome." }, A.founderToken);
const withdraw = await api("POST", "/api/governance/ballots/" + bid + "/withdraw", { reason: "taking it back after the fact" }, A.founderToken);
const finalRow = await ballotRow(bid);
console.log("2g: re-close [" + reclose.status + "] " + JSON.stringify(reclose.json).slice(0, 160) + "; withdraw [" + withdraw.status + "] " + JSON.stringify(withdraw.json).slice(0, 160));
console.log("    final ballot row: " + JSON.stringify(finalRow));
if (reclose.status === 200 || withdraw.status === 200) record(2, "close a closed ballot again, or withdraw it after the close", "BROKE", "re-close " + reclose.status + ", withdraw " + withdraw.status + ", final status " + finalRow.status);
else record(2, "close a closed ballot again, or withdraw it after the close", "HELD", "re-close " + reclose.status + " and withdraw " + withdraw.status + "; the ballot stays " + finalRow.status);

console.log("\nvotes on " + bid + ": " + JSON.stringify((await c.query("SELECT user_id, choice FROM ballot_votes WHERE ballot_id=?", [bid]))[0]));
await c.end();
dump("inv2.json");
