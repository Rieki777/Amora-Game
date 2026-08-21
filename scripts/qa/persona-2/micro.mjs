// Persona 2 micro-pass: the two things the main runs could not settle.
//  1. Desktop: tap a real circle (role=button in the map svg) -> ?focus= -> Back.
//  2. Phone: photograph the quest grid cards (contrast triage needs eyes on them).
// Same guard, GET/render only.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { baseUrl, authToken, tokenKey } from "../lib.mjs";

const OUT = (process.env.QA_OUT ?? "").trim();
if (!OUT) { console.error("QA_OUT not set"); process.exit(2); }
const shotsDir = path.join(OUT, "shots");
fs.mkdirSync(shotsDir, { recursive: true });

async function loadPlaywright() {
  try { return await import("playwright"); } catch { /* not a dep */ }
  const dir = (process.env.QA_PW_DIR ?? "").trim();
  if (dir) return await import(pathToFileURL(path.join(dir, "node_modules", "playwright", "index.mjs")).href);
  process.exit(2);
}
const BASE = baseUrl();
const TOKEN = authToken();
if (!TOKEN) { console.error("QA_TOKEN required"); process.exit(2); }
const pw = await loadPlaywright();

async function makeCtx(engine, opts) {
  const browser = await pw[engine].launch();
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [tokenKey(), TOKEN]);
  await ctx.route("**/*", (route) => {
    const req = route.request();
    if (["GET", "HEAD", "OPTIONS"].includes(req.method())) return route.continue();
    console.log(`  intercepted ${req.method()} (never reached the site)`);
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  return { browser, ctx };
}

// 1. Desktop focus and Back.
{
  const { browser, ctx } = await makeCtx("chromium", { viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto(BASE + "/map/circles", { waitUntil: "domcontentloaded", timeout: 50000 });
  await page.waitForTimeout(4500);
  const circle = page.locator('[data-power-map-box] svg [role="button"]').first();
  if (await circle.count()) {
    await circle.click({ timeout: 5000 }).catch(() => console.log("  circle click failed"));
    await page.waitForTimeout(1500);
    const url1 = page.url();
    console.log(`  after circle tap, focus in url: ${url1.includes("focus=")}`);
    if (url1.includes("focus=")) {
      await page.screenshot({ path: path.join(shotsDir, "map-circles-focused--cr-1280x800.jpg"), type: "jpeg", quality: 78 });
      await page.goBack({ waitUntil: "domcontentloaded", timeout: 20000 });
      let len = 0;
      const t0 = Date.now();
      while (Date.now() - t0 < 9000) {
        len = await page.evaluate("(document.body.innerText || '').length").catch(() => 0);
        if (len > 60) break;
        await page.waitForTimeout(400);
      }
      const url2 = page.url();
      console.log(`  back: focus cleared=${!url2.includes("focus=")} contentLen=${len} in ${Date.now() - t0}ms`);
    }
  } else console.log("  no circle role=button found on desktop map");
  await browser.close();
}

// 2. Phone quest grid.
{
  const dev = pw.devices["iPhone 14"];
  const { browser, ctx } = await makeCtx("webkit", {
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: dev.userAgent,
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/quests", { waitUntil: "domcontentloaded", timeout: 50000 });
  await page.waitForTimeout(4000);
  await page.addStyleTag({ content: "* { scroll-behavior: auto !important; }" }).catch(() => {});
  // Two screens below the filter row is the card grid.
  await page.evaluate(() => window.scrollTo(0, 2400));
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(shotsDir, "evidence-quest-cards--wk-390x844.jpg"), type: "jpeg", quality: 78 });
  await page.evaluate(() => window.scrollTo(0, 3600));
  await page.waitForTimeout(900);
  await page.screenshot({ path: path.join(shotsDir, "evidence-quest-cards-2--wk-390x844.jpg"), type: "jpeg", quality: 78 });
  console.log("  quest card shots written");
  await browser.close();
}
console.log("micro pass complete");
