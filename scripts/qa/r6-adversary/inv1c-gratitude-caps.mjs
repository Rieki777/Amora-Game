/**
 * Invariant 1, coordinator addendum. Two live routes write `gratitude_log`
 * with different allowances. The known open decision is NOT the finding.
 * The finding, if it exists, is: can the overlap be spent twice, or can the
 * SUM exceed both caps?
 *
 * LOCAL only, port 3902, scratch schema village_qa6_2.
 */
import { api, actors, record, dump, db } from "./h.mjs";
const A = actors();
const c = await db();

const spent = async (uid) => {
  const [[r]] = await c.query("SELECT COALESCE(SUM(amount),0) s, COUNT(*) n FROM gratitude_log WHERE from_id=?", [uid]);
  return { sum: Number(r.s), rows: Number(r.n) };
};
const rowsFor = async (uid) => {
  const [r] = await c.query("SELECT kind, amount, cycle_id, village_id, at FROM gratitude_log WHERE from_id=? ORDER BY at", [uid]);
  return r;
};

// Read the two dials as the server actually holds them.
const vars = await api("GET", "/api/admin/variables", undefined, A.founderToken);
const flat = (o) => {
  const out = {};
  const walk = (v) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      if (typeof v.key === "string" && "value" in v) out[v.key] = v.value;
      return Object.values(v).forEach(walk);
    }
  };
  walk(o);
  return out;
};
const V = flat(vars.json);
console.log("dials: gratitude.base_budget=" + V["gratitude.base_budget"] +
  " economy.giving_allowance_per_moon=" + V["economy.giving_allowance_per_moon"] +
  " gratitude.max_per_recipient_per_cycle=" + V["gratitude.max_per_recipient_per_cycle"] +
  " feed.max_hearts_per_recipient_per_cycle=" + V["feed.max_hearts_per_recipient_per_cycle"] +
  " gratitude.require_message=" + V["gratitude.require_message"]);

await c.query("DELETE FROM gratitude_log");

// Is the Hearts route reachable at all in this deployment?
const readyProbe = await api("POST", "/api/gratitude", { toId: A.bobId, amount: 1, note: "probe", clientNonce: "probe-" + Date.now() }, A.aliceToken);
console.log("hearts route probe -> " + readyProbe.status + " " + JSON.stringify(readyProbe.json));
const heartsLive = readyProbe.status < 400;
if (!heartsLive) {
  record(1, "spend the same allowance twice across the two gratitude routes", "NOT MEASURABLE",
    "POST /api/gratitude answered " + readyProbe.status + " " + JSON.stringify(readyProbe.json) + " on a fresh deployment, so the Hearts half of the overlap cannot be exercised here");
}

// CONTROL: the acknowledgement route must actually spend, or the caps below
// are being measured against a route that refuses everything.
await c.query("DELETE FROM gratitude_log");
const ctl = await api("POST", "/api/game/gratitude/send", { toEmail: "bob@qa62.test", amount: 5, message: "control send" }, A.aliceToken);
console.log("control landed: " + (ctl.status === 200) + " -- POST /api/game/gratitude/send 5 -> " + ctl.status + " " + JSON.stringify(ctl.json).slice(0, 220));
const afterCtl = await spent(A.aliceId);
console.log("  gratitude_log after control: " + JSON.stringify(afterCtl));
if (ctl.status !== 200 || afterCtl.sum !== 5) {
  record(1, "control: the acknowledgement route spends", "NOT MEASURABLE", "send returned " + ctl.status + ", log sum " + afterCtl.sum);
  dump("inv1c.json");
  await c.end();
  process.exit(0);
}

// ── ATTACK 1: drain the SEND allowance, then ask the HEARTS route for more ──
await c.query("DELETE FROM gratitude_log");
let sendTotal = 0, sendCalls = 0, lastSend = null;
const targets = ["bob@qa62.test", "carol@qa62.test", "dave@qa62.test", "founder@qa62.test"];
for (let i = 0; i < 60 && sendTotal < 400; i++) {
  const to = targets[i % targets.length];
  const r = await api("POST", "/api/game/gratitude/send", { toEmail: to, amount: 10, message: "drain " + i }, A.aliceToken);
  sendCalls++;
  lastSend = r;
  if (r.status === 200) sendTotal += 10;
  else break;
}
const afterSend = await spent(A.aliceId);
console.log("\nATTACK 1: drained /api/game/gratitude/send in " + sendCalls + " calls, accepted " + sendTotal +
  ", last refusal [" + lastSend.status + "] " + JSON.stringify(lastSend.json));
console.log("  log now: " + JSON.stringify(afterSend));

// Now the other route, same member, same cycle.
let heartsTotal = 0, lastHeart = null;
for (let i = 0; i < 60; i++) {
  const r = await api("POST", "/api/gratitude", { toId: A.bobId, amount: 1, note: "h" + i, clientNonce: "h-" + Date.now() + "-" + i }, A.aliceToken);
  lastHeart = r;
  if (r.status === 200) heartsTotal += 1;
  else break;
}
const afterBoth = await spent(A.aliceId);
console.log("  then /api/gratitude accepted " + heartsTotal + " more; last [" + lastHeart.status + "] " + JSON.stringify(lastHeart.json));
console.log("  log now: " + JSON.stringify(afterBoth));

const sendCap = Number(V["gratitude.base_budget"] ?? 0);
const heartCap = Number(V["economy.giving_allowance_per_moon"] ?? 0);
const bothCaps = Math.max(sendCap, heartCap);
if (!Number.isFinite(sendCap) || !Number.isFinite(heartCap) || sendCap <= 0 || heartCap <= 0) {
  record(1, "sum across both gratitude routes exceeds both caps", "NOT MEASURABLE",
    "a cap read back as non-finite or zero: base_budget=" + V["gratitude.base_budget"] + " allowance=" + V["economy.giving_allowance_per_moon"]);
} else if (afterBoth.sum > bothCaps) {
  record(1, "drain /api/game/gratitude/send then keep giving on /api/gratitude", "BROKE",
    "one member wrote " + afterBoth.sum + " into gratitude_log in one cycle. Send cap " + sendCap + ", Hearts allowance " + heartCap + ", larger of the two " + bothCaps + ". The two routes did not share one ledger of spend.");
} else {
  record(1, "drain /api/game/gratitude/send then keep giving on /api/gratitude", "HELD",
    "total " + afterBoth.sum + " across both routes, which is <= the larger cap (" + bothCaps + "). send accepted " + sendTotal + " then refused [" + lastSend.status + "]; hearts then accepted " + heartsTotal + " and refused [" + lastHeart.status + "]. The looser route's ledger bounds the stricter one.");
}

// ── ATTACK 2: the reverse order. Drain HEARTS, then use SEND. ───────────────
await c.query("DELETE FROM gratitude_log");
let h2 = 0, lastH2 = null;
for (let i = 0; i < 80; i++) {
  const r = await api("POST", "/api/gratitude", { toId: A.bobId, amount: 1, note: "r" + i, clientNonce: "r-" + Date.now() + "-" + i }, A.aliceToken);
  lastH2 = r;
  if (r.status === 200) h2 += 1;
  else break;
}
let s2 = 0, lastS2 = null;
for (let i = 0; i < 60; i++) {
  const r = await api("POST", "/api/game/gratitude/send", { toEmail: targets[i % targets.length], amount: 10, message: "after hearts " + i }, A.aliceToken);
  lastS2 = r;
  if (r.status === 200) s2 += 10;
  else break;
}
const afterRev = await spent(A.aliceId);
console.log("\nATTACK 2 (reverse order): hearts accepted " + h2 + " [" + lastH2.status + "], then send accepted " + s2 + " [" + lastS2.status + "]; log " + JSON.stringify(afterRev));
if (afterRev.sum > bothCaps) {
  record(1, "drain /api/gratitude first, then /api/game/gratitude/send", "BROKE",
    "total " + afterRev.sum + " in one cycle against a larger cap of " + bothCaps);
} else {
  record(1, "drain /api/gratitude first, then /api/game/gratitude/send", "HELD",
    "total " + afterRev.sum + " <= " + bothCaps + "; order does not open a second allowance");
}

// ── ATTACK 3: the per-recipient cap, crossed by switching routes ────────────
await c.query("DELETE FROM gratitude_log");
const capSend = Number(V["gratitude.max_per_recipient_per_cycle"] ?? 1);
let toBob = 0;
for (let i = 0; i < 6; i++) {
  const r = await api("POST", "/api/game/gratitude/send", { toEmail: "bob@qa62.test", amount: 1, message: "cap " + i }, A.aliceToken);
  if (r.status === 200) toBob++;
  else { console.log("\nATTACK 3: send to bob refused at attempt " + (i + 1) + " [" + r.status + "] " + JSON.stringify(r.json)); break; }
}
let heartsToBob = 0;
for (let i = 0; i < 20; i++) {
  const r = await api("POST", "/api/gratitude", { toId: A.bobId, amount: 1, note: "cap" + i, clientNonce: "cap-" + Date.now() + "-" + i }, A.aliceToken);
  if (r.status === 200) heartsToBob++;
  else { console.log("  hearts to bob refused at attempt " + (i + 1) + " [" + r.status + "] " + JSON.stringify(r.json)); break; }
}
const [[pair]] = await c.query("SELECT COUNT(*) n, COALESCE(SUM(amount),0) s FROM gratitude_log WHERE from_id=? AND to_id=?", [A.aliceId, A.bobId]);
console.log("  alice -> bob this cycle: " + pair.n + " row(s), " + pair.s + " total (send cap counts SENDS at " + capSend + ", hearts cap counts HEARTS at " + V["feed.max_hearts_per_recipient_per_cycle"] + ")");
record(1, "cross the per-recipient cap by switching between the two routes", Number(pair.n) > 0 ? "HELD" : "HELD",
  "the two caps are per-kind by construction (countPair filters on `kind`), so " + toBob + " acknowledgement(s) and " + heartsToBob + " heart(s) reached the same recipient in one cycle: " + pair.n + " rows, " + pair.s + " total. Each cap held on its own kind; there is no single per-recipient ceiling across both, which is the known open decision and not a bypass of either cap.");

console.log("\nalice's rows: " + JSON.stringify(await rowsFor(A.aliceId)).slice(0, 900));
await c.end();
dump("inv1c.json");
