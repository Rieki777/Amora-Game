/**
 * Invariant 1, second half of the cycle_id split: what the moon settlement
 * sees. Runs the product's OWN exported settlement functions over the rows the
 * product's own routes wrote in the previous probe. No reimplementation.
 *
 * LOCAL only, scratch schema village_qa6_2.
 */
import { settleCycle, dueCycles, cycleIdFor, parseCycleId } from "../../../server/lib/gratitude-cycles.ts";
import mysql from "mysql2/promise";

const c = await mysql.createConnection({
  host: "127.0.0.1", port: 3307, user: "root", password: "amoratest",
  database: "village_qa6_2", timezone: "Z",
});
const [rows] = await c.query(
  "SELECT id, kind, from_id fromId, to_id toId, amount, cycle_id cycleId FROM gratitude_log ORDER BY at",
);
const entries = rows.map((r) => ({ ...r, amount: Number(r.amount) }));
const byCycle = {};
for (const e of entries) byCycle[e.cycleId] = (byCycle[e.cycleId] ?? 0) + e.amount;
console.log("rows in gratitude_log by cycle_id: " + JSON.stringify(byCycle));
console.log("cycleIdFor(now) = " + cycleIdFor());
console.log("parseCycleId('lunar-000329') = " + parseCycleId("lunar-000329") + "   parseCycleId('moon-329') = " + parseCycleId("moon-329"));

// CONTROL: settleCycle over the id the platform is actually in must return
// something, or "the other half is missing" proves nothing.
const settled = settleCycle(entries, cycleIdFor());
const settledTotal = settled.reduce((a, r) => a + r.received, 0);
const grandTotal = entries.reduce((a, e) => a + e.amount, 0);
console.log("\ncontrol landed: " + (settled.length > 0) + " -- settleCycle(entries, '" + cycleIdFor() + "') returned " + settled.length + " recipient row(s), " + settledTotal + " received");
console.log("  total actually in the table: " + grandTotal);
console.log("  settlement rows: " + JSON.stringify(settled));

const missing = grandTotal - settledTotal;
const heartsRows = entries.filter((e) => !/^lunar-/.test(e.cycleId));
console.log("\nrows the settlement did not see: " + heartsRows.length + " worth " + heartsRows.reduce((a, e) => a + e.amount, 0));

// And whether such a cycle is even a candidate for closing.
const due = dueCycles([], entries, new Date(Date.now() + 40 * 24 * 3600 * 1000));
console.log("dueCycles(40 days from now) = " + JSON.stringify(due.map((d) => d.id)));

const verdict = {
  grandTotal, settledTotal, missing,
  unseenRows: heartsRows.length,
  unseenCycleIds: [...new Set(heartsRows.map((e) => e.cycleId))],
  dueCycleIds: due.map((d) => d.id),
};
console.log("\n" + JSON.stringify(verdict, null, 1));
if (settled.length === 0) console.log("RESULT: NOT MEASURABLE — the control returned nothing");
else if (missing > 0) console.log("RESULT: BROKE — " + missing + " of " + grandTotal + " units in gratitude_log are invisible to settleCycle at cycle " + cycleIdFor());
else console.log("RESULT: HELD — the settlement saw every unit");
await c.end();
