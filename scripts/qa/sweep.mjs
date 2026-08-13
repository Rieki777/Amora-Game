// Whole-site sweep: horizontal overflow, broken images, page errors, failing API calls.
//
// Cheap to run and it catches the class of defect no unit test can: a page that is only
// wrong at one viewport, in one auth state, in a browser.
//
// TWO RULES THAT KEEP THIS HONEST, both learned by getting them wrong first:
//
//   OVERFLOW NEEDS A CONTAINMENT CHECK. An element crossing the right edge only widens the
//   DOCUMENT if nothing between it and <html> clips or scrolls. Without this, a horizontal
//   tab strip with `overflow-x: auto` reports as a defect on every page that has one.
//
//   A FIXED ELEMENT IS USUALLY A SYMPTOM. A `position: fixed` bar sized to `left-0 right-0`
//   takes the width of the document, so when something else overflows the bar overflows too
//   and looks like the cause. Report in-flow offenders first; a fixed one is worth chasing
//   only when nothing in flow is out of bounds.
//
// Usage:
//   QA_BASE_URL=https://your-deployment.example node scripts/qa/sweep.mjs [routes...]
//   QA_TOKEN=<token> ...                  to sweep signed-in surfaces too
import { baseUrl, authToken, playwright, contextFor, PROFILES } from "./lib.mjs";
import { routes } from "./routes.mjs";

const PROBE = () => {
  const de = document.documentElement;
  const vw = de.clientWidth;

  const contained = (el) => {
    let e = el.parentElement;
    while (e && e !== de) {
      const ox = getComputedStyle(e).overflowX;
      if (["auto", "scroll", "hidden", "clip"].includes(ox)) return true;
      e = e.parentElement;
    }
    return false;
  };

  const inFlow = [], fixed = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.x + r.width <= vw + 1) continue;
    if (contained(el)) continue;
    const cs = getComputedStyle(el);
    const entry = {
      tag: el.tagName,
      cls: String(el.className || "").slice(0, 42),
      right: Math.round(r.x + r.width),
      text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 26),
    };
    (cs.position === "fixed" || cs.position === "absolute" ? fixed : inFlow).push(entry);
  }
  inFlow.sort((a, b) => b.right - a.right);
  fixed.sort((a, b) => b.right - a.right);

  const imgs = [...document.querySelectorAll("img")];
  return {
    vw,
    over: de.scrollWidth - vw,
    inFlow: inFlow.slice(0, 3),
    fixed: fixed.slice(0, 2),
    broken: imgs.filter((i) => i.complete && i.naturalWidth === 0)
      .map((i) => (i.currentSrc || i.src || "").split("/").pop()).slice(0, 3),
    imgCount: imgs.length,
    textLen: (document.body.innerText || "").length,
  };
};

const BASE = baseUrl();
const TOKEN = authToken();
const targets = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const ROUTES = targets.length ? targets : routes().concrete;

const pw = await playwright();
const findings = [];
for (const profile of PROFILES) {
  console.log(`\n=== ${profile.name} (${profile.width}px${TOKEN ? ", signed in" : ", signed out"}) ===`);
  const { browser, ctx } = await contextFor(pw, profile, TOKEN);
  for (const route of ROUTES) {
    const page = await ctx.newPage();
    const errs = [], bad = [];
    page.on("pageerror", (e) => errs.push(String(e).slice(0, 88)));
    page.on("console", (m) => m.type() === "error" && errs.push(m.text().slice(0, 88)));
    page.on("response", (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${new URL(r.url()).pathname.slice(0, 44)}`); });

    let status = 0;
    try {
      status = (await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 50000 }))?.status() ?? 0;
    } catch {
      findings.push({ sev: "HIGH", profile: profile.name, route, what: "navigation failed" });
      console.log(`  ${route.padEnd(24)} NAV FAILED`);
      await page.close();
      continue;
    }
    await page.waitForTimeout(2600);
    const r = await page.evaluate(PROBE);

    const flags = [];
    if (status >= 400) { flags.push(`HTTP ${status}`); findings.push({ sev: "HIGH", profile: profile.name, route, what: `HTTP ${status}` }); }
    if (r.over > 1) {
      const o = r.inFlow[0] ?? r.fixed[0];
      flags.push(`OVERFLOW +${r.over}`);
      findings.push({
        sev: "HIGH", profile: profile.name, route,
        what: `horizontal overflow +${r.over}px`,
        culprit: o ? `${o.tag}.${o.cls} "${o.text}"${r.inFlow.length === 0 ? "  (FIXED element, likely a symptom)" : ""}` : "(all contained)",
      });
    }
    if (r.broken.length) { flags.push(`${r.broken.length} broken img`); findings.push({ sev: "MED", profile: profile.name, route, what: `broken image(s): ${r.broken.join(", ")}` }); }
    const uerr = [...new Set(errs)];
    if (uerr.length) { flags.push(`${uerr.length} err`); findings.push({ sev: "MED", profile: profile.name, route, what: `page error: ${uerr[0]}` }); }
    const ubad = [...new Set(bad)];
    if (ubad.length) { flags.push(`${ubad.length} 4xx/5xx`); findings.push({ sev: "MED", profile: profile.name, route, what: `failing request: ${ubad.slice(0, 2).join(" | ")}` }); }

    console.log(`  ${route.padEnd(24)} ${String(status).padEnd(4)} imgs=${String(r.imgCount).padEnd(3)} text=${String(r.textLen).padEnd(6)} ${flags.join(" · ") || "ok"}`);
    await page.close();
  }
  await browser.close();
}

console.log(`\n  ${findings.length} finding(s)`);
for (const f of findings.filter((x) => x.sev === "HIGH")) console.log(`    [HIGH] ${f.profile} ${f.route}: ${f.what}${f.culprit ? "  <- " + f.culprit : ""}`);
for (const f of findings.filter((x) => x.sev === "MED")) console.log(`    [MED]  ${f.profile} ${f.route}: ${f.what}`);
console.log(`\n  A route that rendered little text is not automatically a defect: a canvas or an\n  iframe legitimately returns none. Look before reporting it.`);
process.exit(findings.some((f) => f.sev === "HIGH") ? 1 : 0);
