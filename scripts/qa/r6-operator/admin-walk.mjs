/**
 * QA-3 round 6: walk every Admin tab as the founder and record what is there.
 *
 * `?tab=<key>` addresses each tab (Admin.tsx keeps the tab in the URL), so the
 * walk needs no clicking through the rail.
 *
 * For each tab it records: whether the panel rendered at all, its visible text,
 * the count of form controls, and a screenshot. A tab that does not render is
 * NOT_MEASURABLE, never a pass.
 *
 * It also asks the elementFromPoint question on every enabled button: a probe
 * can pass on a control nobody can press.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), ".qa3", "x.cjs"));
const { chromium } = require("playwright");

const BASE = process.env.QA3_BASE || "http://localhost:3003";
const TOKEN = fs.readFileSync(".qa3/token.txt", "utf8").trim();
const outDir = process.argv[2] || ".qa3/shots-admin";
const only = process.argv[3] ? process.argv[3].split(",") : null;

const TABS = [
  "setup", "submissions", "feedback", "forum-moderation", "message-reports", "products",
  "team", "email-settings", "integrations", "brain", "drafts",
  "investor-vault", "uploaded-files", "training-modules",
  "modules", "quests-admin", "quest-claims", "players", "game-roles", "handover",
  "org-chart", "governance-weights", "seasons-patterns", "circles-map", "housing",
  "events-admin", "tools-admin", "crowdpool-admin", "stays-admin", "exchange-admin",
  "badges-admin", "library-admin", "health-admin", "resources-admin", "exits-admin",
  "calls-admin", "intents-admin", "tokens", "ledger", "cycles", "variables", "season",
  "settings", "work-with-us", "faqs", "milestones", "visit-config", "investor-summary",
];

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
await ctx.addInitScript((t) => {
  try { localStorage.setItem("amora-auth-token", t); } catch { /* private mode */ }
  const s = document.createElement("style");
  s.textContent = "*{scroll-behavior:auto !important;animation:none !important;transition:none !important}";
  document.documentElement.appendChild(s);
}, TOKEN);
const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push({ text: m.text().slice(0, 200) }); });

const results = [];
for (const tab of (only ?? TABS)) {
  const rec = { tab, status: "NOT_MEASURABLE" };
  try {
    await page.goto(`${BASE}/admin?tab=${tab}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3500);
    const probe = await page.evaluate(() => {
      const main = document.querySelector("main") ?? document.body;
      const text = main.innerText ?? "";
      const controls = Array.from(main.querySelectorAll("button, input, textarea, select"));
      // A probe can pass on a button nobody can press: ask whether the browser
      // would deliver the tap at the control's own centre.
      const covered = [];
      const unmeasurable = [];
      for (const el of controls) {
        if (el.disabled) continue;
        // A closed <details> keeps its children's layout boxes in this engine,
        // so a rect-and-elementFromPoint check alone reports fourteen hidden
        // quest-story fields as "covered". checkVisibility settles it; where
        // the engine does not offer it the element is skipped and counted
        // NOT MEASURABLE rather than passed.
        if (typeof el.checkVisibility !== "function") { unmeasurable.push(el.tagName); continue; }
        if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
        const r = el.getBoundingClientRect();
        if (!Number.isFinite(r.width) || !Number.isFinite(r.height)) continue;
        if (r.width < 1 || r.height < 1) continue;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue;
        const hit = document.elementFromPoint(cx, cy);
        if (!hit) continue;
        if (hit !== el && !el.contains(hit) && !hit.contains(el)) {
          covered.push({ tag: el.tagName, label: (el.innerText || el.getAttribute("aria-label") || el.name || "").slice(0, 60), by: hit.tagName + "." + String(hit.className).slice(0, 40) });
        }
      }
      return {
        text,
        controls: controls.length,
        buttons: controls.filter((e) => e.tagName === "BUTTON").length,
        inputs: controls.filter((e) => e.tagName !== "BUTTON").length,
        covered,
        unmeasurable: unmeasurable.length,
      };
    });
    if (typeof probe.controls !== "number") throw new Error("control count not a number");
    rec.status = "OK";
    Object.assign(rec, probe);
    rec.shot = path.join(outDir, `${tab}.png`);
    await page.screenshot({ path: rec.shot, fullPage: true });
  } catch (e) {
    rec.error = String(e.message || e);
  }
  results.push(rec);
  console.log(`${rec.status.padEnd(15)} ${tab.padEnd(20)} controls=${rec.controls ?? "-"} covered=${rec.covered ? rec.covered.length : "-"} chars=${rec.text ? rec.text.length : "-"}`);
}
const ok = results.filter((r) => r.status === "OK").length;
if (!ok) { console.error("no admin tab rendered — this run proves nothing"); process.exit(2); }
fs.writeFileSync(path.join(outDir, "admin-walk.json"), JSON.stringify({ results, consoleErrors }, null, 1));
console.log(`\nrendered ${ok}/${(only ?? TABS).length}; console errors ${consoleErrors.length}`);
await browser.close();
