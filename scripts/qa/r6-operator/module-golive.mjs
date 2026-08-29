/**
 * QA-3 round 6: the module go-live flow, read from three seats.
 *
 * Turn a module off / to members / public, and after each state ask the
 * public surface as a SIGNED-OUT visitor, as a plain MEMBER, and as the
 * FOUNDER. The question is whether each state means what the admin UI says.
 *
 * Every state is asserted reachable before its readings are believed: a
 * lifecycle write that did not land makes the readings meaningless, so it is
 * recorded NOT_MEASURABLE rather than passed.
 */
import fs from "node:fs";

const API = process.env.QA3_API || "http://localhost:3103";
const FOUNDER = fs.readFileSync(".qa3/token.txt", "utf8").trim();
const MEMBER = fs.readFileSync(".qa3/member-token.txt", "utf8").trim();
if (!FOUNDER || !MEMBER) { console.error("missing tokens"); process.exit(2); }

const get = async (path, token) => {
  const res = await fetch(API + path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const t = await res.text();
  return { status: res.status, body: t.slice(0, 300) };
};
const put = async (path, body, token) => {
  const res = await fetch(API + path, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const t = await res.text();
  return { status: res.status, ok: res.ok, body: t.slice(0, 400) };
};

const MODULE = process.argv[2] || "tools";
const SURFACE = process.argv[3] || "/api/tools";
const STATES = ["off", "preview", "members", "public"];
const out = [];
let landed = 0;

for (const state of STATES) {
  const w = await put(`/api/admin/modules/${MODULE}/lifecycle`, { lifecycle: state, examples: false }, FOUNDER);
  const rec = { state, write: w.status, writeBody: w.body };
  if (!w.ok) { rec.verdict = "NOT_MEASURABLE"; rec.reason = "lifecycle write refused"; out.push(rec); continue; }
  landed++;
  rec.anon = await get(SURFACE, "");
  rec.member = await get(SURFACE, MEMBER);
  rec.founder = await get(SURFACE, FOUNDER);
  rec.manifestAnon = await get("/api/modules", "");
  rec.manifestMember = await get("/api/modules", MEMBER);
  out.push(rec);
  console.log(`${state.padEnd(8)} write=${w.status}  anon=${rec.anon.status}  member=${rec.member.status}  founder=${rec.founder.status}`);
}

if (!landed) { console.error("no lifecycle write landed — this run proves nothing"); process.exit(2); }
fs.writeFileSync(`.qa3/module-golive-${MODULE}.json`, JSON.stringify(out, null, 1));
console.log(`\nstates landed ${landed}/${STATES.length}`);
