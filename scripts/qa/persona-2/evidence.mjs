// Persona 2 evidence shots: scrolls to each finding and photographs it.
// GET/render only; the same non-GET guard as probe.mjs. One viewport per run.
//
//   QA_BASE_URL=... QA_TOKEN=... QA_OUT=... QA_PW_DIR=... \
//     node scripts/qa/persona-2/evidence.mjs --profile wk-390x844
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { baseUrl, authToken, tokenKey } from "../lib.mjs";

const OUT = (process.env.QA_OUT ?? "").trim();
if (!OUT) { console.error("QA_OUT not set"); process.exit(2); }
const shotsDir = path.join(OUT, "shots");
fs.mkdirSync(shotsDir, { recursive: true });

async function loadPlaywright() {
  try { return await import("playwright"); } catch { /* fall through */ }
  const dir = (process.env.QA_PW_DIR ?? "").trim();
  if (dir) return await import(pathToFileURL(path.join(dir, "node_modules", "playwright", "index.mjs")).href);
  console.error("playwright unavailable"); process.exit(2);
}

const PROFILES = {
  "wk-390x844": { engine: "webkit", width: 390, height: 844, dpr: 3, mobile: true },
  "wk-360x800": { engine: "webkit", width: 360, height: 800, dpr: 3, mobile: true },
  "cr-1280x800": { engine: "chromium", width: 1280, height: 800, dpr: 1, mobile: false },
};
const name = (process.argv[process.argv.indexOf("--profile") + 1] ?? "wk-390x844").trim();
const profile = PROFILES[name];
if (!profile) { console.error("unknown profile"); process.exit(2); }

const BASE = baseUrl();
const TOKEN = authToken();
if (!TOKEN) { console.error("QA_TOKEN required"); process.exit(2); }

const pw = await loadPlaywright();
const browser = await pw[profile.engine].launch();
const dev = profile.mobile ? pw.devices["iPhone 14"] : null;
const ctx = await browser.newContext({
  viewport: { width: profile.width, height: profile.height },
  deviceScaleFactor: profile.dpr, isMobile: profile.mobile, hasTouch: profile.mobile,
  ...(dev ? { userAgent: dev.userAgent } : {}),
});
await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [tokenKey(), TOKEN]);
await ctx.route("**/*", (route) => {
  const req = route.request();
  const m = req.method();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") {
    return req.url().startsWith(BASE)
      ? route.continue({ headers: { ...req.headers(), authorization: `Bearer ${TOKEN}` } })
      : route.continue();
  }
  console.log(`  intercepted ${m} (never reached the site)`);
  return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
});

const page = await ctx.newPage();
const go = async (route, extraMs = 0) => {
  await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 50000 });
  await page.waitForTimeout(3500 + extraMs);
  await page.addStyleTag({ content: "* { scroll-behavior: auto !important; }" }).catch(() => {});
};
const snap = async (what) => {
  const p = path.join(shotsDir, `evidence-${what}--${name}.jpg`);
  await page.screenshot({ path: p, type: "jpeg", quality: 78 });
  console.log(`  ${path.basename(p)}`);
};
const scrollToText = async (re, settle = 1200) => {
  const loc = page.locator(`text=${re}`).first();
  if (!(await loc.count())) return false;
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(settle);
  await loc.scrollIntoViewIfNeeded().catch(() => {}); // a re-render can reset the scroll
  await page.waitForTimeout(400);
  return true;
};

// 1. The quest grid (contrast triage: card titles over art).
await go("/quests", 800);
await scrollToText(/Welcome Ambassador/);
await page.evaluate(() => window.scrollBy(0, 420));
await page.waitForTimeout(500);
await snap("quest-grid");

// 2. Profile: the citizenship-path chips and the small checkboxes.
await go("/profile", 800);
if (await scrollToText(/Immersant/)) await snap("profile-path-chips");
const agentHeading = page.locator("h2", { hasText: "Your agent" }).first();
if (await agentHeading.count()) {
  await agentHeading.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(1400);
  await agentHeading.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(400);
  await snap("profile-your-agent");
  await page.evaluate(() => window.scrollBy(0, 500));
  await page.waitForTimeout(400);
  await snap("profile-your-agent-scopes");
}

// 3. Badges: the "That's me" control.
await go("/badges", 400);
if (await scrollToText(/That's me/)) await snap("badges-thats-me");

// 4. Events: the view tabs and steppers row, then the community card opened
//    (client-only toggle) to reach the meet-me windows.
await go("/events", 800);
await snap("events-controls");
const community = page.locator("button", { hasText: "Your calendar: post, meet, bring" }).first();
if (await community.count()) {
  await community.scrollIntoViewIfNeeded().catch(() => {});
  await community.click({ timeout: 3000 }).catch(() => console.log("  community toggle failed"));
  await page.waitForTimeout(900);
  const meet = await page.locator("text=Meet me").count();
  console.log(`  community card open; Meet me sections: ${meet}`);
  await scrollToText(/Meet me/, 500);
  await snap("events-community-meet-me");
} else console.log("  community card not found");

// 4b. Modules: badge wording and shelf headings.
await go("/modules", 800);
const onBadges = await page.locator("text=On in this village").count();
const alwaysOn = await page.locator("text=Always on").count();
const founders = await page.locator("text=/ask your founders/i").count();
console.log(`  modules: "On in this village" x${onBadges}, "Always on" x${alwaysOn}, ask-your-founders x${founders}`);
await snap("modules-shelf");
await page.evaluate(() => window.scrollBy(0, 700));
await page.waitForTimeout(400);
await snap("modules-shelf-2");

// 5. Gratitude: the pale hero line.
await go("/gratitude", 400);
await snap("gratitude-hero");

// 6. Roles: the Forming chip.
await go("/roles", 400);
if (await scrollToText(/Forming/)) await snap("roles-forming-chip");

// 7. Tokens: the whitespace gap and the exchange row near the bar.
await go("/tokens", 400);
await snap("tokens-top");
await scrollToText(/The exchange/);
await snap("tokens-exchange");

// 8. The 404 page a member reaches from a bad link.
await go("/x-missing-page-probe", 0);
await snap("not-found-page");

await browser.close();
console.log("evidence pass complete");
