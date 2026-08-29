/**
 * QA-3 round 6, half two: walk a fresh fork signed out and as a brand-new
 * founder, and record what the page SAYS.
 *
 * Run from the worktree root:
 *   node scripts/qa/r6-operator/fork-walk.mjs <outDir> [viewport]
 *
 * Playwright is installed in .qa3/ so the product's package.json stays
 * untouched (this lane is read-only on the product).
 *
 * FAILURE PATHS ARE FAILURES. Every extracted number is asserted finite
 * before it is compared, and an unreachable route is recorded as
 * NOT_MEASURABLE, never as a pass.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(path.join(process.cwd(), ".qa3", "x.cjs"));
const { chromium } = require("playwright");

const BASE = process.env.QA3_BASE || "http://localhost:3003";
const outDir = process.argv[2] || ".qa3/shots";
const vpName = process.argv[3] || "desktop";
const VP = vpName === "mobile" ? { width: 390, height: 844 } : { width: 1280, height: 900 };

const ROUTES = [
  "/", "/team", "/circles", "/roles", "/exit-policy", "/master-plan",
  "/powers", "/decisions", "/modules", "/quests", "/places", "/library",
  "/village-health", "/investor", "/steward", "/resident", "/prosperity",
  "/visit", "/work-with-us", "/project-history", "/game-mechanics",
  "/how-we-create", "/good-neighbor", "/network", "/governance",
  "/introductions", "/campaigns", "/events", "/forum", "/map", "/tools",
  "/housing", "/training", "/badges", "/gratitude", "/opportunities",
  "/tokens", "/journey-to-launch", "/seasonal-festivals", "/co-creators-guide",
  "/resident-rights", "/steward-rights", "/love-letter", "/feed",
  "/contribute", "/stay", "/reserve", "/wallet", "/propose", "/first-walk",
  "/register", "/login", "/admin", "/admin/mint", "/profile",
];

fs.mkdirSync(outDir, { recursive: true });

const results = [];
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: VP,
  reducedMotion: "reduce",
});
await ctx.addInitScript(() => {
  const s = document.createElement("style");
  s.textContent = "*{scroll-behavior:auto !important;animation:none !important;transition:none !important}";
  document.documentElement.appendChild(s);
});
const token = process.env.QA3_TOKEN || "";
if (token) {
  await ctx.addInitScript((t) => {
    try { localStorage.setItem("amora-auth-token", t); } catch { /* private mode; brand-ok: the product's own token key, read by a QA probe */ }
  }, token);
}

const page = await ctx.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });

for (const route of ROUTES) {
  const rec = { route, viewport: vpName, status: "NOT_MEASURABLE", title: null, text: null, shot: null };
  try {
    const resp = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(3500);
    rec.http = resp ? resp.status() : null;
    rec.title = await page.title();
    const body = await page.evaluate(() => document.body?.innerText ?? "");
    if (typeof body !== "string") throw new Error("innerText not a string");
    rec.text = body;
    rec.status = "OK";
    const slug = route === "/" ? "home" : route.replace(/^\//, "").replace(/\//g, "-");
    const shot = path.join(outDir, `${slug}.${vpName}.png`);
    await page.screenshot({ path: shot, fullPage: true });
    rec.shot = shot;
  } catch (e) {
    rec.error = String(e.message || e);
  }
  results.push(rec);
  console.log(`${rec.status.padEnd(15)} ${route}  http=${rec.http ?? "-"}  chars=${rec.text ? rec.text.length : "-"}`);
}

// A control that did not run is not a control: assert we actually visited.
const ok = results.filter((r) => r.status === "OK").length;
if (ok === 0) { console.error("ZERO routes rendered — this run proves nothing"); process.exit(2); }
console.log(`\nrendered ${ok}/${ROUTES.length}; console errors ${consoleErrors.length}`);
fs.writeFileSync(path.join(outDir, `walk.${vpName}.json`), JSON.stringify({ base: BASE, viewport: VP, results, consoleErrors }, null, 1));
await browser.close();
