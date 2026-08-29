// QA-1 round 6 — the member's eyes.
// Walks routes as a person, captures what the page SAYS, what it PAINTS, and whether its
// controls can actually be pressed. Read-only: it never submits a form and never clicks
// anything unless QA_CLICK is set (local only).
//
// Every numeric band asserts finite BEFORE comparing. NaN / undefined / unparsed is
// NOT MEASURABLE, counted and printed, and never counted as a pass.
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.QA_BASE_URL ?? "").trim().replace(/\/$/, "");
if (!BASE) { console.error("QA_BASE_URL not set"); process.exit(2); }
const OUT = (process.env.QA_OUT ?? "").trim();
if (!OUT) { console.error("QA_OUT not set"); process.exit(2); }
const ROUTES = (process.env.QA_ROUTES ?? "ROOT").split(",").map(s => s.trim()).filter(Boolean)
  .map(s => (s === "ROOT" ? "/" : s));
const TOKEN = (process.env.QA_TOKEN ?? "").trim() || null;
const SURFACE = (process.env.QA_SURFACE ?? "live").trim();

// iPhone 14 shaped, mobile first, plus a desk view. WebKit is the phone engine per brief.
const ALL_PROFILES = [
  { name: "wk-390x844", width: 390, height: 844, dpr: 3, mobile: true, engine: "webkit" },
  { name: "wk-390x664", width: 390, height: 664, dpr: 3, mobile: true, engine: "webkit" },
  { name: "wk-375x812", width: 375, height: 812, dpr: 3, mobile: true, engine: "webkit" },
  { name: "wk-360x780", width: 360, height: 780, dpr: 3, mobile: true, engine: "webkit" },
  { name: "cr-1280x800", width: 1280, height: 800, dpr: 1, mobile: false, engine: "chromium" },
];
const WANT = (process.env.QA_PROFILES ?? "wk-390x844,cr-1280x800").split(",").map(s => s.trim());
const PROFILES = ALL_PROFILES.filter(p => WANT.includes(p.name));

const IOS_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";

const TOKEN_KEY = (() => {
  const src = fs.readFileSync(new URL("../../../client/src/lib/gameApi.ts", import.meta.url), "utf8");
  const m = /TOKEN_KEY\s*=\s*"([^"]+)"/.exec(src);
  if (!m) throw new Error("TOKEN_KEY not found in client/src/lib/gameApi.ts");
  return m[1];
})();

const pw = await import("playwright");
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.join(OUT, "shots"), { recursive: true });

const results = [];
const unmeasured = [];

// ---- in-page probe. Runs in the page, returns plain JSON. -------------------------------
function PROBE() {
  const fin = (n) => typeof n === "number" && Number.isFinite(n);
  const desc = (el) => {
    if (!el || el.nodeType !== 1) return String(el);
    const id = el.id ? "#" + el.id : "";
    const cls = (el.className && typeof el.className === "string")
      ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    return el.tagName.toLowerCase() + id + cls;
  };
  const chain = (el) => {
    const parts = [];
    let n = el;
    for (let i = 0; i < 5 && n && n.nodeType === 1; i++) { parts.unshift(desc(n)); n = n.parentElement; }
    return parts.join(" > ");
  };

  const un = [];            // NOT MEASURABLE entries
  const out = { url: location.href, title: document.title, un };

  // -- 1. what the page says ------------------------------------------------------------
  const main = document.querySelector("main") || document.body;
  out.text = (main.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, 24000);
  out.h1 = [...document.querySelectorAll("h1")].map(h => h.innerText.trim());
  out.headings = [...document.querySelectorAll("h1,h2,h3")].map(h => h.tagName + ": " + h.innerText.trim().slice(0, 120));

  // -- 2. nonsense tokens in RENDERED text ----------------------------------------------
  const NONSENSE = [
    ["undefined", /\bundefined\b/i],
    ["NaN", /\bNaN\b/],
    ["object Object", /\[object Object\]/],
    ["Infinity", /\bInfinity\b/],
    ["null-literal", /(^|[\s>(:,])null([\s<).,]|$)/],
    ["double-space-comma", /,\s*,/],
    ["empty-braces", /\{\{|\}\}/],
    ["raw-id", /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i],
    ["percent-complete", /\b\d{1,3}\s?%\s*(complete|done|of the way|progress)/i],
    ["n-of-m", /\b\d+\s+of\s+\d+\s+(powers|steps|milestones|handover)/i],
  ];
  out.nonsense = [];
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  let tn;
  while ((tn = walker.nextNode())) {
    const p = tn.parentElement;
    if (!p) continue;
    const tag = p.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") continue;
    const cs = getComputedStyle(p);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const t = tn.nodeValue || "";
    if (!t.trim()) continue;
    for (const [label, re] of NONSENSE) {
      if (re.test(t)) out.nonsense.push({ label, text: t.trim().slice(0, 200), chain: chain(p) });
    }
  }

  // -- 3. horizontal overflow -----------------------------------------------------------
  const de = document.scrollingElement || document.documentElement;
  const sw = de.scrollWidth, iw = window.innerWidth;
  if (fin(sw) && fin(iw)) {
    out.overflowPx = sw - iw;
    out.overflows = [];
    if (sw - iw > 1) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (!fin(r.right) || !fin(r.width)) continue;
        if (r.width > 0 && r.right > iw + 1) out.overflows.push({ chain: chain(el), right: Math.round(r.right) });
        if (out.overflows.length >= 12) break;
      }
    }
  } else { un.push("overflow width unresolved"); out.overflowPx = null; }

  // -- 4. images ------------------------------------------------------------------------
  out.images = { total: 0, broken: [], pending: 0 };
  for (const img of document.querySelectorAll("img")) {
    out.images.total++;
    if (!img.complete) { out.images.pending++; un.push("img not complete: " + (img.currentSrc || img.src || "(no src)")); continue; }
    const nw = img.naturalWidth;
    if (!fin(nw)) { un.push("img naturalWidth unresolved: " + (img.src || "")); continue; }
    if (nw === 0) out.images.broken.push({ src: (img.currentSrc || img.src || "(no src)").slice(0, 200), alt: img.alt || "", chain: chain(img) });
  }

  // -- 5. controls: can the browser actually deliver the tap? ---------------------------
  // Display/opacity/rect ALL pass on a covered control. Ask elementFromPoint.
  const SEL = "a[href], button, [role=button], input:not([type=hidden]), select, textarea, [onclick]";
  const ctrls = [...document.querySelectorAll(SEL)];
  out.controls = { examined: 0, covered: [], tiny: [], offscreenX: [], hidden: 0, unmeasurable: 0 };
  for (const el of ctrls) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") { out.controls.hidden++; continue; }
    const r = el.getBoundingClientRect();
    if (!fin(r.width) || !fin(r.height) || !fin(r.left) || !fin(r.top)) {
      out.controls.unmeasurable++; un.push("control rect unresolved: " + chain(el)); continue;
    }
    if (r.width === 0 || r.height === 0) { out.controls.hidden++; continue; }
    out.controls.examined++;

    const label = (el.innerText || el.getAttribute("aria-label") || el.value || el.title || "").trim().slice(0, 60);

    // horizontally off the viewport is a real defect on a phone
    if (r.left < -1 || r.right > window.innerWidth + 1) {
      out.controls.offscreenX.push({ chain: chain(el), label, left: Math.round(r.left), right: Math.round(r.right) });
    }
    // under the accessibility floor
    const minSide = Math.min(r.width, r.height);
    if (fin(minSide) && minSide < 40) out.controls.tiny.push({ chain: chain(el), label, w: Math.round(r.width), h: Math.round(r.height) });

    // covered? only meaningful when the centre is inside the viewport
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue; // measured after scroll pass
    const hit = document.elementFromPoint(cx, cy);
    if (!hit) { out.controls.unmeasurable++; un.push("elementFromPoint null at control centre: " + chain(el)); continue; }
    const ok = hit === el || el.contains(hit);
    if (!ok) {
      out.controls.covered.push({ chain: chain(el), label, coveredBy: chain(hit), at: [Math.round(cx), Math.round(cy)] });
    }
  }

  // -- 6. text painting over its neighbour ----------------------------------------------
  // Round 5 shipped rows crushed below their content while 34 assertions stayed green.
  out.collisions = [];
  const textEls = [...main.querySelectorAll("p,span,h1,h2,h3,h4,li,td,th,div,a,button,label")]
    .filter(el => {
      if (el.children.length > 0) return false;                 // leaves only, so parents do not double count
      const t = (el.textContent || "").trim();
      if (!t) return false;
      const cs = getComputedStyle(el);
      return cs.display !== "none" && cs.visibility !== "hidden" && cs.opacity !== "0";
    });
  const rects = textEls.map(el => ({ el, r: el.getBoundingClientRect() }))
    .filter(x => Number.isFinite(x.r.top) && x.r.width > 0 && x.r.height > 0);
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < Math.min(rects.length, i + 14); j++) {
      const a = rects[i], b = rects[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const csA = getComputedStyle(a.el), csB = getComputedStyle(b.el);
      if (csA.position === "absolute" || csA.position === "fixed") continue;
      if (csB.position === "absolute" || csB.position === "fixed") continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox > 6 && oy > 6) {
        out.collisions.push({
          a: chain(a.el), aText: (a.el.textContent || "").trim().slice(0, 60),
          b: chain(b.el), bText: (b.el.textContent || "").trim().slice(0, 60),
          overlap: [Math.round(ox), Math.round(oy)],
        });
      }
      if (out.collisions.length >= 10) break;
    }
    if (out.collisions.length >= 10) break;
  }

  // -- 7. clipped content: a fixed box shorter than the words in it ---------------------
  out.clipped = [];
  for (const el of main.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.overflow === "visible" || cs.overflowY === "visible") continue;
    if (cs.overflowY === "auto" || cs.overflowY === "scroll") continue;
    const sh = el.scrollHeight, ch = el.clientHeight;
    if (!fin(sh) || !fin(ch) || ch === 0) continue;
    if (sh - ch > 8 && (el.textContent || "").trim().length > 0 && cs.webkitLineClamp === "none" && cs.textOverflow !== "ellipsis") {
      out.clipped.push({ chain: chain(el), text: (el.textContent || "").trim().slice(0, 80), sh, ch });
    }
    if (out.clipped.length >= 8) break;
  }

  // -- 8. dead end: is there anywhere to go? --------------------------------------------
  const links = [...document.querySelectorAll("a[href]")]
    .map(a => a.getAttribute("href")).filter(h => h && !h.startsWith("#"));
  out.linkCount = links.length;
  out.internalLinks = [...new Set(links.filter(h => h.startsWith("/")))];
  out.externalLinks = [...new Set(links.filter(h => /^https?:/i.test(h)))].slice(0, 40);

  return out;
}


// ---- second stage: can each control ACTUALLY be tapped, at the scroll position a real
// person would be at when they reach for it? A control under the fixed bottom tab bar at
// scroll 0 is usually fine (scroll and it moves). One that is STILL covered after being
// scrolled to the middle of the viewport is one nobody can press.
function REACH() {
  const fin = (n) => typeof n === "number" && Number.isFinite(n);
  const desc = (el) => {
    if (!el || el.nodeType !== 1) return String(el);
    const id = el.id ? "#" + el.id : "";
    const cls = (el.className && typeof el.className === "string")
      ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
    return el.tagName.toLowerCase() + id + cls;
  };
  const chain = (el) => {
    const parts = []; let n = el;
    for (let i = 0; i < 5 && n && n.nodeType === 1; i++) { parts.unshift(desc(n)); n = n.parentElement; }
    return parts.join(" > ");
  };
  const un = [];
  const SEL = "a[href], button, [role=button], input:not([type=hidden]), select, textarea";
  const out = { examined: 0, unreachable: [], skippedHidden: 0, unmeasurable: 0, un,
                docHeight: null, viewportHeight: window.innerHeight, scrollable: null };
  const de = document.scrollingElement || document.documentElement;
  out.docHeight = fin(de.scrollHeight) ? de.scrollHeight : null;
  out.scrollable = (fin(de.scrollHeight) && fin(window.innerHeight)) ? de.scrollHeight > window.innerHeight + 1 : null;

  const start = window.scrollY;
  for (const el of document.querySelectorAll(SEL)) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") { out.skippedHidden++; continue; }
    if (cs.pointerEvents === "none") {
      out.unreachable.push({ chain: chain(el), label: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 60),
                             why: "pointer-events:none", coveredBy: null });
      continue;
    }
    const b = el.getBoundingClientRect();
    if (!fin(b.width) || !fin(b.height)) { out.unmeasurable++; un.push("rect unresolved " + chain(el)); continue; }
    if (b.width === 0 || b.height === 0) { out.skippedHidden++; continue; }
    out.examined++;

    try { el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" }); } catch { el.scrollIntoView(true); }

    // an inline link wrapping two lines has a bounding box whose centre lands between the
    // lines. Test each CLIENT rect: reachable if ANY of them delivers the tap.
    const rects = [...el.getClientRects()].filter(r => fin(r.width) && fin(r.height) && r.width > 0 && r.height > 0);
    if (rects.length === 0) { out.unmeasurable++; un.push("no client rects " + chain(el)); continue; }
    let reached = false, lastHit = null, lastPt = null, anyInView = false;
    for (const r of rects) {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (!fin(cx) || !fin(cy)) { continue; }
      if (cx < 0 || cy < 0 || cx > window.innerWidth || cy > window.innerHeight) continue;
      anyInView = true;
      const hit = document.elementFromPoint(cx, cy);
      lastHit = hit; lastPt = [Math.round(cx), Math.round(cy)];
      if (hit && (hit === el || el.contains(hit) || (hit.closest && hit.closest(SEL) === el))) { reached = true; break; }
    }
    if (!anyInView) { out.unmeasurable++; un.push("never in viewport after scroll " + chain(el)); continue; }
    if (!reached) {
      out.unreachable.push({
        chain: chain(el),
        label: (el.innerText || el.getAttribute("aria-label") || el.value || "").trim().slice(0, 60),
        href: el.getAttribute("href") || null,
        why: "covered",
        coveredBy: lastHit ? chain(lastHit) : "(elementFromPoint returned null)",
        at: lastPt,
      });
    }
  }
  window.scrollTo(0, start);
  return out;
}

// ---- driver ----------------------------------------------------------------------------
for (const profile of PROFILES) {
  const browser = await (profile.engine === "webkit" ? pw.webkit : pw.chromium).launch();
  const ctx = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.dpr,
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
    ...(profile.mobile ? { userAgent: IOS_UA } : {}),
  });
  await ctx.addInitScript(() => {
    const put = () => {
      try {
        const root = document.head || document.documentElement;
        if (!root) return false;
        const s = document.createElement("style");
        s.textContent = "*{scroll-behavior:auto !important;}";
        root.appendChild(s);
        return true;
      } catch { return false; }
    };
    if (!put()) document.addEventListener("DOMContentLoaded", put, { once: true });
  });
  if (TOKEN) {
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [TOKEN_KEY, TOKEN]);
  }

  for (const route of ROUTES) {
    const page = await ctx.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    const failedReqs = [];
    page.on("console", m => { if (m.type() === "error") consoleErrors.push(m.text().slice(0, 300)); });
    page.on("pageerror", e => pageErrors.push(String(e).slice(0, 300)));
    page.on("response", r => {
      if (r.status() >= 400) failedReqs.push({ status: r.status(), url: r.url().slice(0, 220) });
    });

    let httpStatus = null, navError = null;
    try {
      const resp = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 45000 });
      httpStatus = resp ? resp.status() : null;
      await page.waitForTimeout(3500);
    } catch (e) {
      navError = String(e).slice(0, 300);
    }

    let probe = null, probeError = null, reach = null;
    if (!navError) {
      try { probe = await page.evaluate(PROBE); }
      catch (e) { probeError = String(e).slice(0, 400); }
      try { reach = await page.evaluate(REACH); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(200); }
      catch (e) { unmeasured.push({ route, profile: profile.name, what: "reach", why: String(e).slice(0, 200) }); }
    }

    const shotName = `${SURFACE}__${route.replace(/[/]/g, "_") || "_root"}__${profile.name}.png`;
    let shot = null;
    try {
      await page.screenshot({ path: path.join(OUT, "shots", shotName), fullPage: true, scale: "css" });
      shot = path.join(OUT, "shots", shotName);
    } catch (e) { unmeasured.push({ route, profile: profile.name, what: "screenshot", why: String(e).slice(0, 160) }); }

    if (navError) unmeasured.push({ route, profile: profile.name, what: "navigation", why: navError });
    if (probeError) unmeasured.push({ route, profile: profile.name, what: "probe", why: probeError });
    if (probe) for (const u of probe.un) unmeasured.push({ route, profile: profile.name, what: "in-page", why: u });
    if (reach) for (const u of reach.un) unmeasured.push({ route, profile: profile.name, what: "reach", why: u });

    results.push({ route, profile: profile.name, surface: SURFACE, httpStatus, navError, probeError, consoleErrors, pageErrors, failedReqs, shot, probe, reach });
    process.stdout.write(`${SURFACE} ${profile.name} ${route} status=${httpStatus} ` +
      `ovf=${probe ? probe.overflowPx : "?"} nonsense=${probe ? probe.nonsense.length : "?"} ` +
      `covered=${probe ? probe.controls.covered.length : "?"} collide=${probe ? probe.collisions.length : "?"} ` +
      `brokenImg=${probe ? probe.images.broken.length : "?"} err=${pageErrors.length + consoleErrors.length}\n`);
    await page.close();
  }
  await ctx.close();
  await browser.close();
}

fs.writeFileSync(path.join(OUT, `walk-${SURFACE}.json`), JSON.stringify(results, null, 1));
fs.writeFileSync(path.join(OUT, `unmeasured-${SURFACE}.json`), JSON.stringify(unmeasured, null, 1));
console.log(`\n  ${unmeasured.length} things NOT MEASURABLE (counted, never treated as passing)`);
for (const u of unmeasured.slice(0, 10)) console.log(`      ${u.route} ${u.profile} ${u.what}: ${u.why}`);
console.log(`  wrote ${results.length} page results to ${OUT}`);
