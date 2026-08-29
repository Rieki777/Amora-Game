/**
 * Invariant 1, addendum follow-up. The raw rows from inv1c showed the two
 * gratitude routes writing DIFFERENT VALUES into the same `cycle_id` column
 * ("lunar-000329" from the acknowledgement path, "moon-329" from the Hearts
 * path). This file tests what that does to the two allowance checks, using a
 * fresh member and one large send so the per-recipient cap is not what stops
 * the run.
 *
 * LOCAL only, port 3902, scratch schema village_qa6_2.
 */
import { api, actors, record, dump, db } from "./h.mjs";
const A = actors();
const c = await db();
const PW = "QaTest123!";

// A member who has spent nothing, and four fresh recipients.
const mk = async (name, email) => {
  const r = await api("POST", "/api/auth/register", { name, email, password: PW, paths: ["builder"] });
  return { token: r.json?.token, id: r.json?.user?.id, email, status: r.status };
};
const stamp = Date.now();
const eve = await mk("Eve Spender", "eve" + stamp + "@qa62.test");
const rec = [];
for (let i = 0; i < 4; i++) rec.push(await mk("Recip " + i, "rec" + i + "-" + stamp + "@qa62.test"));
console.log("actors: eve=" + eve.status + " recipients=" + rec.map((r) => r.status).join(","));

const sums = async (uid) => {
  const [r] = await c.query(
    "SELECT cycle_id, COUNT(*) n, COALESCE(SUM(amount),0) s FROM gratitude_log WHERE from_id=? GROUP BY cycle_id",
    [uid],
  );
  const [[t]] = await c.query("SELECT COALESCE(SUM(amount),0) s FROM gratitude_log WHERE from_id=?", [uid]);
  return { byCycle: r, total: Number(t.s) };
};

// ── CONTROL: eve's send budget starts full, and the Hearts allowance too ────
const b0 = await api("GET", "/api/game/gratitude/me", undefined, eve.token);
console.log("control landed: " + (b0.status === 200) + " -- eve's starting budget " + JSON.stringify(b0.json?.budget) + " (route " + b0.status + ")");
if (b0.status !== 200 || !b0.json?.budget || !Number.isFinite(Number(b0.json.budget.total))) {
  record(1, "cycle_id split control", "NOT MEASURABLE", "could not read a finite starting budget: " + JSON.stringify(b0.json));
  dump("inv1d.json");
  await c.end();
  process.exit(0);
}
const sendCap = Number(b0.json.budget.total);

// ── STEP 1: drain the Hearts allowance (30) ────────────────────────────────
let hearts = 0, lastH = null;
for (let i = 0; i < 60; i++) {
  const to = rec[i % rec.length];
  const r = await api("POST", "/api/gratitude", { toId: to.id, amount: 1, note: "h" + i, clientNonce: "cs-" + stamp + "-" + i }, eve.token);
  lastH = r;
  if (r.status === 200) hearts += 1;
  else break;
}
const allowanceNow = await api("POST", "/api/gratitude", { toId: rec[0].id, amount: 1, note: "x", clientNonce: "cs2-" + stamp }, eve.token);
console.log("\nSTEP 1: Hearts accepted " + hearts + "; next Hearts call [" + allowanceNow.status + "] " + JSON.stringify(allowanceNow.json));

// ── STEP 2: ask the ACKNOWLEDGEMENT route what it thinks was spent ──────────
const b1 = await api("GET", "/api/game/gratitude/me", undefined, eve.token);
console.log("STEP 2: after spending " + hearts + " on Hearts, the send budget reads " + JSON.stringify(b1.json?.budget));

// ── STEP 3: spend the whole send budget in one call per recipient ──────────
let sent = 0, lastS = null;
const per = Math.floor(sendCap / rec.length) || 1;
for (const to of rec) {
  const r = await api("POST", "/api/game/gratitude/send", { toEmail: to.email, amount: per, message: "one big send" }, eve.token);
  lastS = r;
  if (r.status === 200) sent += per;
  else break;
}
const after = await sums(eve.id);
console.log("STEP 3: send accepted " + sent + " (" + per + " x " + rec.length + "), last [" + lastS.status + "] " + JSON.stringify(lastS.json));
console.log("  eve's rows by cycle_id: " + JSON.stringify(after.byCycle) + "  TOTAL " + after.total);

const heartCap = Number(allowanceNow.json?.allowance?.total ?? 30);
const larger = Math.max(sendCap, heartCap);
const distinctCycleIds = after.byCycle.map((r) => r.cycle_id);
if (after.total > larger) {
  record(1, "spend the Hearts allowance and the acknowledgement budget in the same cycle", "BROKE",
    "one member moved " + after.total + " into gratitude_log in a single lunar cycle. Acknowledgement budget " + sendCap +
    ", Hearts allowance " + heartCap + ", larger of the two " + larger + ". The two halves landed under DIFFERENT cycle_id values in the same column (" +
    distinctCycleIds.join(" and ") + "), and the acknowledgement route's budget check (spentInCycle, which filters cycle_id = ?) never saw the Hearts rows: after " +
    hearts + " Hearts it still reported spent=" + (b1.json?.budget?.spent) + ".");
} else {
  record(1, "spend the Hearts allowance and the acknowledgement budget in the same cycle", "HELD",
    "total " + after.total + " <= " + larger + "; cycle ids seen: " + distinctCycleIds.join(","));
}

// The mirror question: does either half of the split go missing from the
// cycle a settlement would read?
const [cyc] = await c.query("SELECT id, cycle_number, status FROM gratitude_cycles ORDER BY id DESC LIMIT 5");
console.log("\ngratitude_cycles rows: " + JSON.stringify(cyc));
const [orphans] = await c.query(
  "SELECT g.cycle_id, COUNT(*) n, COALESCE(SUM(g.amount),0) s FROM gratitude_log g " +
    "LEFT JOIN gratitude_cycles gc ON gc.id = g.cycle_id WHERE gc.id IS NULL GROUP BY g.cycle_id",
);
console.log("gratitude_log rows whose cycle_id matches no gratitude_cycles row: " + JSON.stringify(orphans));
if (orphans.length) {
  record(1, "a gift written under a cycle_id no cycle row carries", "BROKE",
    JSON.stringify(orphans) + " -- these rows sit under a cycle id that gratitude_cycles does not hold");
} else {
  record(1, "a gift written under a cycle_id no cycle row carries", "HELD", "every gratitude_log cycle_id matches a gratitude_cycles row");
}

await c.end();
dump("inv1d.json");
