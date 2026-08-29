/**
 * QA-3 round 6, half one: does an operator control SAVE, and does anything READ it?
 *
 * Each probe is a triple: an admin WRITE, a distinctive needle, and the
 * MEMBER-FACING read that ought to carry it. The classes are
 *
 *   WIRED                   the write landed and the member surface carries it
 *   SAVES-BUT-NOTHING-READS the write returned 2xx and no member surface changed
 *   DOES-NOT-SAVE           the write returned 2xx and the admin read is unchanged
 *   REFUSES-HONESTLY        the write was refused with an explanation (not a defect)
 *   NEVER-BUILT             no admin route exists for the capability at all
 *
 * NOTHING HERE PASSES BY DEFAULT. Every probe that cannot complete is recorded
 * NOT_MEASURABLE with its reason. A run that exercised zero probes exits 2.
 *
 * Usage: QA3_TOKEN=<founder jwt> node scripts/qa/r6-operator/save-read.mjs [--phase=write|read]
 */
import fs from "node:fs";

const API = process.env.QA3_API || "http://localhost:3103";
const TOKEN = process.env.QA3_TOKEN || fs.readFileSync(".qa3/token.txt", "utf8").trim();
if (!TOKEN) { console.error("no founder token"); process.exit(2); }
const STAMP = process.env.QA3_STAMP || "QA3NEEDLE";

const H = { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` };

async function call(method, path, body, auth = true) {
  const res = await fetch(API + path, {
    method,
    headers: auth ? H : { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: res.status, ok: res.ok, text, json };
}

export { call, STAMP, API, H };

if (process.argv[1] && process.argv[1].endsWith("save-read.mjs")) {
  const probes = JSON.parse(fs.readFileSync(process.argv[2] || ".qa3/probes.json", "utf8"));
  const out = [];
  for (const p of probes) {
    const rec = { id: p.id, label: p.label, verdict: "NOT_MEASURABLE", detail: null };
    try {
      const w = await call(p.write.method, p.write.path, p.write.body);
      rec.writeStatus = w.status;
      rec.writeBody = (w.text || "").slice(0, 400);
      if (w.status === 401 || w.status === 403) { rec.verdict = "NOT_MEASURABLE"; rec.detail = "auth refused"; out.push(rec); continue; }
      if (!w.ok) { rec.verdict = "REFUSES-HONESTLY"; rec.detail = rec.writeBody; out.push(rec); continue; }
      // admin read-back
      if (p.adminRead) {
        const a = await call("GET", p.adminRead);
        rec.adminStatus = a.status;
        rec.adminHasNeedle = (a.text || "").includes(p.needle);
      }
      // member read: SIGNED OUT unless the probe says otherwise
      const m = await call("GET", p.memberRead, undefined, p.memberAuth === true);
      rec.memberStatus = m.status;
      rec.memberHasNeedle = (m.text || "").includes(p.needle);
      rec.memberSample = (m.text || "").slice(0, 200);
      if (rec.memberHasNeedle) rec.verdict = "WIRED";
      else if (p.adminRead && rec.adminHasNeedle === false) rec.verdict = "DOES-NOT-SAVE";
      else rec.verdict = "SAVES-BUT-NOTHING-READS";
    } catch (e) {
      rec.detail = String(e.message || e);
    }
    out.push(rec);
    console.log(`${rec.verdict.padEnd(24)} ${rec.id}  w=${rec.writeStatus ?? "-"} a=${rec.adminHasNeedle ?? "-"} m=${rec.memberHasNeedle ?? "-"}`);
  }
  if (!out.length) { console.error("zero probes ran"); process.exit(2); }
  fs.writeFileSync(process.argv[3] || ".qa3/save-read.json", JSON.stringify(out, null, 1));
  const bad = out.filter((r) => r.verdict === "SAVES-BUT-NOTHING-READS" || r.verdict === "DOES-NOT-SAVE").length;
  console.log(`\nexercised ${out.length}; dishonest ${bad}`);
}
