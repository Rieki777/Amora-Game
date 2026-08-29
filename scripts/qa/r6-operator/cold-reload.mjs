/**
 * QA-3 round 6: the cold reload.
 *
 * Every operator save in this pass left a distinctive needle on a
 * MEMBER-FACING route. This re-reads all of them after the server process has
 * been restarted, so a value that lived only in an in-memory document cache
 * shows up as gone rather than as a pass.
 *
 * Signed out where the surface is public; as a plain member where it is not.
 * A route that cannot be reached at all is NOT_MEASURABLE, never a pass, and
 * a run that checked nothing exits 2.
 */
import fs from "node:fs";

const API = process.env.QA3_API || "http://localhost:3103";
const MEMBER = fs.existsSync(".qa3/member-token.txt") ? fs.readFileSync(".qa3/member-token.txt", "utf8").trim() : "";

const CHECKS = [
  { id: "settings.villageDues", route: "/api/settings", needle: "QA3NEEDLE-dues", as: "anon" },
  { id: "visitConfig", route: "/api/visit-config", needle: "QA3NEEDLE-visit", as: "anon" },
  { id: "investorSummary", route: "/api/investor-summary", needle: "QA3NEEDLE-investor", as: "anon" },
  { id: "milestones", route: "/api/milestones", needle: "QA3NEEDLE-milestone", as: "anon" },
  { id: "content.team", route: "/api/content/team", needle: "QA3NEEDLE-team", as: "anon" },
  { id: "workWithUs", route: "/api/work-with-us-config", needle: "QA3NEEDLE-wwu", as: "anon" },
  { id: "faqs.investor", route: "/api/faqs/investor", needle: "QA3NEEDLE-faq", as: "anon" },
  { id: "quests", route: "/api/quests", needle: "QA3NEEDLE-quest", as: "anon" },
  { id: "circles", route: "/api/org", needle: "QA3NEEDLE-circle", as: "anon" },
  { id: "orgSeat", route: "/api/org", needle: "QA3NEEDLE-seat", as: "anon" },
  { id: "exitPolicy", route: "/api/exit-policy", needle: "QA3NEEDLE-valuation", as: "anon" },
  { id: "season", route: "/api/season", needle: "QA3NEEDLE-season", as: "anon" },
  { id: "trainingModules", route: "/api/training-modules", needle: "QA3NEEDLE-training", as: "anon" },
  { id: "brand.project", route: "/api/game/config", needle: "QA3NEEDLE-village", as: "anon" },
  { id: "brain.member", route: "/api/village/brain", needle: "QA3NEEDLE-brain-vision", as: "member" },
  { id: "brain.adminOnlyStaysHidden", route: "/api/village/brain", needle: "QA3NEEDLE-brain-legal", as: "member", expect: false },
  { id: "events", route: "/api/events", needle: "QA3NEEDLE-gathering2", as: "member" },
  { id: "library.category", route: "/api/library", needle: "QA3NEEDLE-libcat", as: "member" },
  { id: "stays.room", route: "/api/stays", needle: "QA3NEEDLE-room", as: "member" },
  { id: "tools", route: "/api/tools", needle: "QA3NEEDLE-tool", as: "anon", optional: true },
  { id: "variables.publicPeople", route: "/api/org", needle: '"visible":false', as: "anon" },
  { id: "notification.weight", route: "/api/notifications", needle: "QA3NEEDLE-weight-reason", as: "member" },
];

let checked = 0, gone = 0, unmeasurable = 0;
const out = [];
for (const c of CHECKS) {
  const rec = { ...c, verdict: "NOT_MEASURABLE" };
  try {
    const res = await fetch(API + c.route, { headers: c.as === "member" && MEMBER ? { Authorization: `Bearer ${MEMBER}` } : {} });
    const text = await res.text();
    rec.status = res.status;
    if (!res.ok) { rec.reason = `HTTP ${res.status}`; unmeasurable++; out.push(rec); continue; }
    const has = text.includes(c.needle);
    rec.has = has;
    checked++;
    const want = c.expect === false ? false : true;
    rec.verdict = has === want ? "SURVIVED" : (want ? "GONE AFTER RESTART" : "LEAKED AFTER RESTART");
    if (rec.verdict !== "SURVIVED") gone++;
  } catch (e) {
    rec.reason = String(e.message || e);
    unmeasurable++;
  }
  out.push(rec);
  console.log(`${rec.verdict.padEnd(22)} ${c.id.padEnd(30)} ${c.route}`);
}
if (!checked) { console.error("nothing was checked — this run proves nothing"); process.exit(2); }
fs.writeFileSync(".qa3/cold-reload.json", JSON.stringify(out, null, 1));
console.log(`\nchecked ${checked}, did not survive ${gone}, NOT MEASURABLE ${unmeasurable}`);
