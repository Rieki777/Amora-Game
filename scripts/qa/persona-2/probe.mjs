// Persona 2 probe (round 4, lane L8): a new member on a phone, finding their footing.
//
// REPORT ONLY. Strictly GET/render against the deployed site: a context-wide route
// guard fulfils every non-GET request locally with an empty 200 and logs it, so no
// interaction in this script can write to the site under test, even by accident.
//
// Journey (a member's first week): home signed in, profile (the agent section),
// characters, the calendar (week view, who-is-here band, layers, RSVP surface,
// the weekly brief panel at ?brief=, meet-me windows), messages, the power map
// (/map/circles: seat, search, zoom, breadcrumb, legend, decides-by, currency),
// the module shelf, the land map, gratitude, quests, badges, wallet, tokens,
// the bottom-bar circles page, roles, introductions, notifications bell.
//
// Harm metrics measured per route per viewport, every band asserted finite, and
// everything a detector cannot resolve is COUNTED AND PRINTED as NOT MEASURABLE,
// never passed (see ../README.md for why that line exists).
//
// Usage:
//   QA_BASE_URL=... QA_TOKEN=... QA_OUT=<report dir> [QA_PW_DIR=<dir with node_modules/playwright>] \
//     node scripts/qa/persona-2/probe.mjs --profile wk-390x844
//   node scripts/qa/persona-2/probe.mjs --validate     # detector fixtures, no site traffic
//   QA_OUT=... node scripts/qa/persona-2/probe.mjs --assemble   # merge raw/ into the three JSON files
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { baseUrl, authToken, tokenKey, reportUnmeasured } from "../lib.mjs";

// ── plumbing ────────────────────────────────────────────────────────────────

const OUT = (process.env.QA_OUT ?? "").trim();
const ARGS = process.argv.slice(2);
const MODE = ARGS.includes("--validate") ? "validate" : ARGS.includes("--assemble") ? "assemble" : "run";
const PROFILE_ARG = (ARGS[ARGS.indexOf("--profile") + 1] ?? "").trim();

if (!OUT && MODE !== "validate") {
  console.error("QA_OUT is not set (the report directory). Refusing to scatter output.");
  process.exit(2);
}

/** Every numeric band goes through this. NaN passes every comparison silently,
 *  so a non-finite number is converted into a loud NOT MEASURABLE, never a pass. */
function finite(n, label, unmeasured) {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  unmeasured.push({ what: label, note: `non-finite value (${String(n)})` });
  console.log(`  !! ${label} came back non-finite: NOT MEASURABLE, counted`);
  return null;
}

async function loadPlaywright() {
  try { return await import("playwright"); } catch { /* not a repo dep, by design */ }
  const dir = (process.env.QA_PW_DIR ?? "").trim();
  if (dir) {
    const p = path.join(dir, "node_modules", "playwright", "index.mjs");
    try { return await import(pathToFileURL(p).href); } catch (e) {
      console.error(`QA_PW_DIR set but import failed: ${e.message}`);
    }
  }
  console.error(
    "playwright is unavailable. Set QA_PW_DIR to a directory that has node_modules/playwright,\n" +
    "or run from a directory that has it installed.");
  process.exit(2);
}

/** Mobile first, WebKit as the Safari engine, iPhone 14 descriptor, DPR 3.
 *  390x664 is the URL-bar-showing height. Desktop last, Chromium. */
const PROFILES = [
  { name: "wk-390x844", engine: "webkit", width: 390, height: 844, dpr: 3, mobile: true },
  { name: "wk-390x664", engine: "webkit", width: 390, height: 664, dpr: 3, mobile: true },
  { name: "wk-375x812", engine: "webkit", width: 375, height: 812, dpr: 3, mobile: true },
  { name: "wk-360x800", engine: "webkit", width: 360, height: 800, dpr: 3, mobile: true },
  { name: "cr-1280x800", engine: "chromium", width: 1280, height: 800, dpr: 1, mobile: false },
];

// ── page-side detectors ─────────────────────────────────────────────────────
// One function string per phase, evaluated in the page. Everything returns plain
// JSON. Selection lists are shared by injection to keep the phases consistent.

const INTERACTIVE_SEL = `a[href], button, [role="button"], [role="tab"], input:not([type="hidden"]), select, textarea, [onclick]`;

/** Phase 1, at first paint (no scrolling yet): document overflow, the R26 class
 *  (top edge above the fixed bottom bar, centre under it, centre hit-tests to the
 *  bar), small text, link counts for dead-end detection, soft-404 text. */
const FIRST_PAINT_PROBE = `(() => {
  const SEL = ${JSON.stringify(INTERACTIVE_SEL)};
  const de = document.documentElement;
  const vw = de.clientWidth, vh = window.innerHeight;
  const out = { vw, vh, over: de.scrollWidth - de.clientWidth, textLen: (document.body.innerText || "").length };

  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const chain = (el) => {
    const parts = [];
    let e = el;
    for (let i = 0; i < 3 && e && e !== document.body; i++) {
      parts.push(e.tagName.toLowerCase() + (typeof e.className === "string" && e.className
        ? "." + e.className.trim().split(/\\s+/).slice(0, 2).join(".") : ""));
      e = e.parentElement;
    }
    return parts.join(" < ");
  };

  // The fixed bottom bar, found by geometry (fixed, hugging the bottom, wide, high z),
  // so the detector needs no class names and survives a restyle.
  let bar = null;
  for (const el of document.querySelectorAll("body *")) {
    const cs = getComputedStyle(el);
    if (cs.position !== "fixed") continue;
    const r = el.getBoundingClientRect();
    if (r.bottom >= vh - 2 && r.height >= 40 && r.height <= 130 && r.width >= vw * 0.9 && (+cs.zIndex || 0) >= 30) {
      if (!bar || r.top < bar.top) bar = { el, top: r.top, height: r.height };
    }
  }
  out.bar = bar ? { top: Math.round(bar.top), height: Math.round(bar.height) } : null;

  // R26 first kind: partially visible and dead at first paint.
  out.r26 = [];
  if (bar) {
    for (const el of document.querySelectorAll(SEL)) {
      if (bar.el.contains(el) || !visible(el)) continue;
      const r = el.getBoundingClientRect();
      const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
      if (!(r.top < bar.top - 1 && r.top >= 0 && cy > bar.top)) continue;
      const hit = document.elementFromPoint(Math.min(Math.max(cx, 1), vw - 1), Math.min(cy, vh - 1));
      if (hit && (hit === bar.el || bar.el.contains(hit)) && !el.contains(hit)) {
        out.r26.push({ chain: chain(el), text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 40), top: Math.round(r.top), cy: Math.round(cy) });
      }
    }
  }

  // Horizontal overflow culprits (containment-checked, in-flow first).
  out.overCulprits = [];
  if (out.over > 1) {
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
      if (!r.width || !r.height || r.x + r.width <= vw + 1 || contained(el)) continue;
      const cs = getComputedStyle(el);
      const entry = { chain: chain(el), right: Math.round(r.x + r.width), text: (el.textContent || "").trim().slice(0, 24) };
      (cs.position === "fixed" || cs.position === "absolute" ? fixed : inFlow).push(entry);
    }
    inFlow.sort((a, b) => b.right - a.right);
    fixed.sort((a, b) => b.right - a.right);
    out.overCulprits = inFlow.slice(0, 3).length ? inFlow.slice(0, 3) : fixed.slice(0, 2).map((f) => ({ ...f, note: "fixed, likely a symptom" }));
  }

  // Text under 14px, grouped by size + sample.
  const groups = new Map();
  let smallNodes = 0;
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (tw.nextNode()) {
    const n = tw.currentNode;
    const t = (n.nodeValue || "").trim();
    if (t.length < 2) continue;
    const p = n.parentElement;
    if (!p || p.closest("script,style,[aria-hidden='true']") || !visible(p)) continue;
    const size = parseFloat(getComputedStyle(p).fontSize);
    if (!Number.isFinite(size)) continue;
    if (size < 14) {
      smallNodes++;
      const key = size.toFixed(1) + "|" + chain(p);
      if (!groups.has(key)) groups.set(key, { size: +size.toFixed(1), sample: t.slice(0, 34), chain: chain(p), n: 0 });
      groups.get(key).n++;
    }
  }
  out.smallText = { nodes: smallNodes, groups: [...groups.values()].sort((a, b) => a.size - b.size).slice(0, 60) };

  // Onward routes for dead-end detection.
  const here = location.pathname;
  const hrefs = new Set();
  for (const a of document.querySelectorAll("a[href]")) {
    const h = a.getAttribute("href") || "";
    if (h.startsWith("/") && h !== here && visible(a)) hrefs.add(h.split("#")[0]);
  }
  out.onwardLinks = hrefs.size;
  out.hasBottomBar = !!bar;

  // Soft 404 text on a rendered page.
  const h1 = [...document.querySelectorAll("h1,h2")].map((h) => h.innerText).join(" ");
  out.soft404 = /not found|doesn't exist|does not exist|\\b404\\b/i.test(h1 + " " + document.title);

  return out;
})()`;

/** Phase 2: tap targets. Effective size honours ::after expanders by probing the
 *  44px box edges with elementFromPoint; ownership is strict (the hit must be the
 *  control or a descendant, never an ancestor that merely contains it). */
const TAP_PROBE = `(() => {
  const SEL = ${JSON.stringify(INTERACTIVE_SEL)};
  const vw = innerWidth, vh = innerHeight;
  const out = { checked: 0, small: [], unmeasurable: 0, coveredCentre: [] };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || +cs.opacity < 0.05) return false;
    const r = el.getBoundingClientRect();
    return r.width > 1 && r.height > 1;
  };
  const chain = (el) => {
    const parts = [];
    let e = el;
    for (let i = 0; i < 3 && e && e !== document.body; i++) {
      parts.push(e.tagName.toLowerCase() + (typeof e.className === "string" && e.className
        ? "." + e.className.trim().split(/\\s+/).slice(0, 2).join(".") : ""));
      e = e.parentElement;
    }
    return parts.join(" < ");
  };
  const els = [...document.querySelectorAll(SEL)].filter((el) => visible(el) && !el.disabled);
  for (const el of els) {
    out.checked++;
    let r = el.getBoundingClientRect();
    if (r.width >= 44 && r.height >= 44) continue;
    el.scrollIntoView({ block: "center", inline: "nearest" });
    r = el.getBoundingClientRect();
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    if (cx < 1 || cy < 1 || cx > vw - 1 || cy > vh - 1) { out.unmeasurable++; continue; }
    const owns = (x, y) => {
      const h = document.elementFromPoint(Math.min(Math.max(x, 1), vw - 1), Math.min(Math.max(y, 1), vh - 1));
      return h && (h === el || el.contains(h));
    };
    if (!owns(cx, cy)) {
      out.coveredCentre.push({ chain: chain(el), text: (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 30) });
      continue;
    }
    const effW = r.width >= 44 ? r.width : (owns(cx - 22, cy) && owns(cx + 22, cy) ? 44 : r.width);
    const effH = r.height >= 44 ? r.height : (owns(cx, cy - 22) && owns(cx, cy + 22) ? 44 : r.height);
    if (effW < 44 || effH < 44) {
      const cs = getComputedStyle(el);
      const inline = cs.display === "inline" && !!el.closest("p, li");
      out.small.push({
        w: Math.round(effW), h: Math.round(effH), inline,
        chain: chain(el),
        text: (el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || "").trim().slice(0, 30),
      });
    }
  }
  // Collapse repeats (calendar day cells, chip rows) so one component is one row.
  const byKey = new Map();
  for (const s of out.small) {
    const key = s.chain + "|" + s.w + "x" + s.h;
    if (!byKey.has(key)) byKey.set(key, { ...s, count: 0 });
    byKey.get(key).count++;
  }
  out.small = [...byKey.values()].sort((a, b) => (a.w * a.h) - (b.w * b.h));
  return out;
})()`;

/** Phase 3: WCAG contrast from rendered values. Adapted from ../contrast.mjs
 *  (the sixth version of that checker; its five prior failure modes are listed
 *  there). Unmeasurable nodes are counted, never passed. */
const CONTRAST_PROBE = `(() => {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const g = cv.getContext("2d", { willReadFrequently: true });
  const rgba = (css) => {
    try {
      g.clearRect(0, 0, 1, 1);
      g.globalCompositeOperation = "copy";
      g.fillStyle = "#000";
      const probe = g.fillStyle;
      g.fillStyle = css;
      if (g.fillStyle === probe && !/^#000|black|rgb\\(0, ?0, ?0\\)/i.test(css)) return null;
      g.fillRect(0, 0, 1, 1);
      const d = g.getImageData(0, 0, 1, 1).data;
      return [d[0], d[1], d[2], d[3] / 255];
    } catch { return null; }
  };
  const over = (top, bottom) => {
    const a = top[3];
    return [0, 1, 2].map((k) => Math.round(top[k] * a + bottom[k] * (1 - a))).concat(1);
  };
  const lum = (c) => {
    const [r, gg, b] = c.slice(0, 3).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * gg + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const L1 = lum(a), L2 = lum(b);
    return (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
  };
  const backdrop = (el) => {
    const layers = [];
    let e = el, gradient = false;
    while (e && e !== document.documentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== "none") { gradient = true; break; }
      const v = rgba(cs.backgroundColor);
      if (v && v[3] > 0) layers.push(v);
      if (v && v[3] >= 0.999) { e = null; break; }
      e = e.parentElement;
    }
    if (e) {
      const root = rgba(getComputedStyle(document.documentElement).backgroundColor);
      if (root && root[3] > 0) layers.push(root);
    }
    let outc = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) outc = over(layers[i], outc);
    return { rgb: outc, gradient };
  };
  const ownText = (el) => {
    let t = "";
    for (const n of el.childNodes) if (n.nodeType === 3) t += n.nodeValue;
    return t.trim();
  };
  const fails = [];
  let measured = 0, unmeasurable = 0;
  for (const el of document.querySelectorAll("*")) {
    const t = ownText(el);
    if (t.length < 2) continue;
    const b = el.getBoundingClientRect();
    if (b.width < 4 || b.height < 4) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || +cs.opacity < 0.1) continue;
    const fgRaw = rgba(cs.color);
    if (!fgRaw) { unmeasurable++; continue; }
    const bg = backdrop(el);
    if (bg.gradient) { unmeasurable++; continue; }
    measured++;
    const fg = over(fgRaw, bg.rgb);
    const cr = ratio(fg, bg.rgb);
    const size = parseFloat(cs.fontSize), bold = parseInt(cs.fontWeight) >= 700;
    const floor = (size >= 24 || (size >= 18.66 && bold)) ? 3 : 4.5;
    if (cr < floor) {
      fails.push({ text: t.slice(0, 36), ratio: +cr.toFixed(2), floor, size: Math.round(size), fg: "rgb(" + fg.slice(0, 3) + ")", bg: "rgb(" + bg.rgb.slice(0, 3) + ")" });
    }
  }
  fails.sort((a, b) => a.ratio - b.ratio);
  return { measured, unmeasurable, fails: fails.slice(0, 40) };
})()`;

// ── run mode ────────────────────────────────────────────────────────────────

function slug(route) {
  return route.replace(/[/?=&]+/g, "-").replace(/^-|-$/g, "") || "home";
}

async function settle(page, ms = 3500) {
  // networkidle never fires on this stack; domcontentloaded plus a beat is the rule.
  await page.waitForTimeout(ms);
  try { await page.addStyleTag({ content: "* { scroll-behavior: auto !important; }" }); } catch { /* frame gone */ }
}

async function shot(page, dir, name, quality = 72) {
  const p = path.join(dir, `${name}.jpg`);
  try { await page.screenshot({ path: p, type: "jpeg", quality }); return path.basename(p); }
  catch { return null; }
}

async function run() {
  const BASE = baseUrl();
  const TOKEN = authToken();
  if (!TOKEN) {
    console.error("QA_TOKEN is required for the member journey (this persona is the signed-in one).");
    process.exit(2);
  }
  console.log(`token present, length ${TOKEN.length}`); // presence and length only, never the value
  const profile = PROFILES.find((p) => p.name === PROFILE_ARG);
  if (!profile) {
    console.error(`--profile must be one of: ${PROFILES.map((p) => p.name).join(", ")}`);
    process.exit(2);
  }

  const shotsDir = path.join(OUT, "shots");
  const rawDir = path.join(OUT, "raw");
  fs.mkdirSync(shotsDir, { recursive: true });
  fs.mkdirSync(rawDir, { recursive: true });

  const health = async () => {
    try { const r = await fetch(BASE + "/health"); const j = await r.json(); return j.build ?? "unknown"; }
    catch { return "unreachable"; }
  };
  const buildStart = await health();
  console.log(`build at run start: ${buildStart}`);

  const pw = await loadPlaywright();
  const engine = pw[profile.engine];
  const browser = await engine.launch();
  const dev = profile.mobile ? pw.devices["iPhone 14"] : null;
  const ctx = await browser.newContext({
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.dpr,
    isMobile: profile.mobile,
    hasTouch: profile.mobile,
    ...(dev ? { userAgent: dev.userAgent } : {}),
  });
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } }, [tokenKey(), TOKEN]);

  // The write guard and the bearer, one router: the bearer goes ONLY to the site
  // under test (never to a third-party host), and any non-GET is fulfilled locally
  // so nothing this script does can write to the deployment.
  const blockedWrites = [];
  await ctx.route("**/*", (route) => {
    const req = route.request();
    const m = req.method();
    const sameSite = req.url().startsWith(BASE);
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") {
      if (sameSite) {
        return route.continue({ headers: { ...req.headers(), authorization: `Bearer ${TOKEN}` } });
      }
      return route.continue();
    }
    blockedWrites.push({ method: m, path: req.url().startsWith(BASE) ? new URL(req.url()).pathname : req.url().slice(0, 60) });
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });

  const results = { profile: profile.name, buildStart, routes: [], blockedWrites, unmeasured: [] };
  const monday = (() => {
    const d = new Date();
    const dow = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - dow);
    return d.toISOString().slice(0, 10);
  })();

  /** Route-specific member-journey interactions. Each returns { notes, extraShots }. */
  const journeys = {
    "/": async (page, rec) => {
      const bell = page.locator('button[aria-label="Notifications"]').first();
      if (await bell.count()) {
        const box = await bell.boundingBox();
        rec.notes.push(`bell present${box ? ` (${Math.round(box.width)}x${Math.round(box.height)})` : ""}`);
        await bell.click({ timeout: 3000 }).catch(() => rec.notes.push("bell click failed"));
        await page.waitForTimeout(900);
        rec.extraShots.push(await shot(page, shotsDir, `home-bell-open--${profile.name}`));
        rec.notes.push("bell opened; the mark-read POST is intercepted by the guard (write path not exercised on live)");
      } else rec.notes.push("notifications bell NOT found in header");
    },
    "/profile": async (page, rec) => {
      const h = page.locator("h2", { hasText: "Your agent" }).first();
      if (await h.count()) {
        await h.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(700);
        rec.extraShots.push(await shot(page, shotsDir, `profile-your-agent--${profile.name}`));
        const text = await page.evaluate(() => {
          const el = [...document.querySelectorAll("h2")].find((x) => x.textContent?.trim() === "Your agent");
          const panel = el?.closest("section,div");
          return panel ? (panel.innerText || "").slice(0, 1400) : "";
        });
        rec.notes.push(`your-agent text: ${JSON.stringify(text.slice(0, 1200))}`);
      } else rec.notes.push("Your agent section NOT found on /profile (absence is a finding)");
      // What else the profile page offers a newcomer, top to bottom.
      await page.evaluate(() => window.scrollTo(0, 0));
    },
    "/events": async (page, rec) => {
      // who-is-here band + week view + layers + RSVP + meet-me, all render-only.
      const week = page.locator('button, [role="tab"]', { hasText: /^Week$/ }).first();
      if (await week.count()) {
        await week.click({ timeout: 3000 }).catch(() => rec.notes.push("week tab click failed"));
        await page.waitForTimeout(1100);
        rec.extraShots.push(await shot(page, shotsDir, `events-week--${profile.name}`));
        rec.notes.push("week view opened");
      } else rec.notes.push("Week tab NOT found");
      const bandText = await page.evaluate(() => {
        const t = document.body.innerText || "";
        const m = t.match(/(arriv|depart|here (this|all) week|nobody has said|who is here)[^\n]*/i);
        return m ? m[0].slice(0, 90) : null;
      });
      rec.notes.push(bandText ? `who-is-here band text: "${bandText}"` : "who-is-here band text NOT found on week view");
      const layers = await page.locator("button", { hasText: /gathering|work|meal|ceremony|festival|meet/i }).count();
      rec.notes.push(`layer-ish chips visible: ${layers}`);
      const rsvp = await page.locator("button", { hasText: /going|maybe|can't|cannot/i }).count();
      rec.notes.push(`rsvp controls visible (never pressed): ${rsvp}`);
      const meet = page.locator("text=Meet me").first();
      if (await meet.count()) {
        await meet.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(500);
        rec.extraShots.push(await shot(page, shotsDir, `events-meet-me--${profile.name}`));
        rec.notes.push("meet-me window surface present (form render only, write path not exercised on live)");
      } else rec.notes.push("meet-me surface NOT visible on /events");
    },
    [`/events?brief=${"WEEK"}`]: null, // replaced below with the real date key
    "/messages": async (page, rec) => {
      const threads = await page.evaluate(() => {
        const t = document.body.innerText || "";
        return { hasEmpty: /no messages|no conversations|nothing here|start a conversation/i.test(t), len: t.length };
      });
      rec.notes.push(`threads surface: emptyState=${threads.hasEmpty} textLen=${threads.len}`);
      const intents = await page.locator("text=/intent|introduc/i").count();
      rec.notes.push(`intent/introduction affordances on messages: ${intents}`);
    },
    "/map/circles": async (page, rec) => {
      await page.waitForTimeout(1500); // the map settles late
      rec.extraShots.push(await shot(page, shotsDir, `map-circles-settled--${profile.name}`));
      for (const [what, sel] of [
        ["breadcrumb", 'nav[aria-label="Where you are on the map"]'],
        ["search", 'input[placeholder*="Who does"]'],
      ]) {
        rec.notes.push(`${what}: ${(await page.locator(sel).count()) ? "present" : "NOT found"}`);
      }
      for (const [what, re] of [
        ["legend", /legend/i], ["decides-by", /decides/i], ["currency", /currency|tokens|hearts/i], ["your seat", /your seat|my seat|you are/i],
      ]) {
        rec.notes.push(`${what} text: ${(await page.locator(`text=${re}`).count()) ? "present" : "NOT found"}`);
      }
      const search = page.locator('input[placeholder*="Who does"]').first();
      if (await search.count()) {
        await search.click({ timeout: 3000 }).catch(() => {});
        await search.fill("water").catch(() => rec.notes.push("search fill failed"));
        await page.waitForTimeout(1200);
        rec.extraShots.push(await shot(page, shotsDir, `map-circles-search--${profile.name}`));
        rec.notes.push("search typed 'water' (client-side/GET only; the Ask button is never pressed)");
        await search.fill("").catch(() => {});
        await page.keyboard.press("Escape").catch(() => {});
      }
      // Zoom: tap the map centre; a hit pushes ?focus= (pushState), Back must return.
      const svg = page.locator("svg").first();
      if (await svg.count()) {
        const box = await svg.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.45);
          await page.waitForTimeout(1400);
          const url1 = page.url();
          if (url1.includes("focus=")) {
            rec.extraShots.push(await shot(page, shotsDir, `map-circles-focused--${profile.name}`));
            await page.goBack({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => rec.notes.push("goBack from focus FAILED"));
            await page.waitForTimeout(1500);
            const url2 = page.url();
            const alive = await page.evaluate(() => (document.body.innerText || "").length > 60).catch(() => false);
            rec.backTests.push({ what: "map ?focus= then Back", ok: !url2.includes("focus=") && alive, from: url1.slice(-40), to: url2.slice(-40) });
          } else {
            rec.notes.push("centre tap did not focus a circle (no ?focus=), zoom-back not exercised");
          }
        }
      }
    },
    "/modules": async (page, rec) => {
      const on = await page.locator("text=/^On$/").count();
      const founders = await page.locator("text=/ask your founders/i").count();
      rec.notes.push(`module cards with an On badge: ${on}; ask-your-founders affordances: ${founders} (this account is an admin, so founder-only chrome may show)`);
    },
    "/map": async (page, rec) => {
      await page.waitForTimeout(2500);
      const frames = page.frames().filter((f) => f !== page.mainFrame());
      for (const f of frames) {
        try {
          const o = await f.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
          rec.notes.push(`map iframe overflow: ${o}px`);
          if (typeof o === "number" && o > 1) rec.iframeOverflow = o;
        } catch { rec.notes.push("map iframe not readable (cross-origin or gone): NOT MEASURABLE"); results.unmeasured.push({ what: "map iframe overflow", note: "frame not readable" }); }
      }
      if (!frames.length) rec.notes.push("no iframe found on /map");
      rec.extraShots.push(await shot(page, shotsDir, `map-settled--${profile.name}`));
    },
  };

  // The real brief key replaces the placeholder.
  delete journeys["/events?brief=WEEK"];
  const briefRoute = `/events?brief=${monday}`;
  journeys[briefRoute] = async (page, rec) => {
    const panel = await page.locator("text=/weekly brief|this week/i").count();
    rec.notes.push(`brief panel text hits: ${panel}`);
    const optOut = await page.locator('input[type="checkbox"], [role="switch"]').count();
    rec.notes.push(`opt-out style controls in view: ${optOut} (rendered only; write path not exercised on live)`);
    rec.extraShots.push(await shot(page, shotsDir, `events-brief--${profile.name}`));
    // Back out of the brief: /events was loaded first, so history has a real entry.
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => rec.notes.push("goBack from brief FAILED"));
    await page.waitForTimeout(1600);
    const url = page.url();
    const alive = await page.evaluate(() => (document.body.innerText || "").length > 60).catch(() => false);
    rec.backTests.push({ what: "?brief= then Back", ok: !url.includes("brief=") && alive, to: url.slice(-40) });
  };

  const ROUTES = [
    "/", "/profile", "/profile/characters",
    "/events", briefRoute,
    "/messages", "/introductions",
    "/map/circles", "/modules", "/map",
    "/gratitude", "/quests", "/badges", "/wallet", "/tokens",
    "/circles", "/roles",
    "/x-missing-page-probe",
  ];

  const page = await ctx.newPage();
  const consoleErrs = [];
  const badResponses = [];
  page.on("pageerror", (e) => consoleErrs.push({ route: page.url(), msg: String(e).slice(0, 140) }));
  page.on("console", (m) => { if (m.type() === "error") consoleErrs.push({ route: page.url(), msg: m.text().slice(0, 140) }); });
  page.on("response", (r) => {
    if (r.status() >= 400) {
      try { badResponses.push({ route: page.url().slice(0, 60), status: r.status(), path: new URL(r.url()).pathname.slice(0, 60) }); } catch { /* opaque */ }
    }
  });

  for (const route of ROUTES) {
    const rec = { route, notes: [], extraShots: [], backTests: [], findingsSeed: [] };
    const t0 = Date.now();
    let status = 0;
    try {
      const resp = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 50000 });
      status = resp?.status() ?? 0;
    } catch (e) {
      rec.navFailed = String(e).slice(0, 120);
      results.routes.push(rec);
      console.log(`  ${route.padEnd(30)} NAV FAILED`);
      continue;
    }
    await settle(page);
    rec.status = status;
    rec.first = await page.evaluate(FIRST_PAINT_PROBE);
    finite(rec.first?.over, `${route} overflow`, results.unmeasured);
    finite(rec.first?.textLen, `${route} textLen`, results.unmeasured);
    rec.shot = await shot(page, shotsDir, `${String(ROUTES.indexOf(route)).padStart(2, "0")}-${slug(route)}--${profile.name}`);

    const journey = journeys[route];
    if (journey) { try { await journey(page, rec); } catch (e) { rec.notes.push(`journey step threw: ${String(e).slice(0, 100)}`); } }

    rec.tap = await page.evaluate(TAP_PROBE).catch(() => null);
    if (!rec.tap) { results.unmeasured.push({ what: `${route} tap targets`, note: "probe threw" }); }
    rec.contrast = await page.evaluate(CONTRAST_PROBE).catch(() => null);
    if (!rec.contrast) { results.unmeasured.push({ what: `${route} contrast`, note: "probe threw" }); }

    rec.ms = Date.now() - t0;
    results.routes.push(rec);
    console.log(
      `  ${route.padEnd(30)} ${String(status).padEnd(4)} over=${rec.first?.over ?? "?"} r26=${rec.first?.r26?.length ?? "?"} ` +
      `small=${rec.tap?.small?.length ?? "?"} contrastFails=${rec.contrast?.fails?.length ?? "?"} (${rec.ms}ms)`);
  }

  results.consoleErrs = consoleErrs;
  results.badResponses = badResponses;
  results.buildEnd = await health();
  console.log(`build at run end: ${results.buildEnd}; blocked writes: ${blockedWrites.length}`);
  for (const b of blockedWrites) console.log(`    intercepted ${b.method} ${b.path} (never reached the site)`);
  reportUnmeasured("bands in this run", results.unmeasured.length, results.unmeasured.map((u) => `${u.what}: ${u.note}`));

  fs.writeFileSync(path.join(rawDir, `results-${profile.name}.json`), JSON.stringify(results, null, 2));
  console.log(`wrote raw/results-${profile.name}.json`);
  await browser.close();
}

// ── validate mode: every detector proves itself on a fixture before a zero is trusted ──

async function validate() {
  const pw = await loadPlaywright();
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  let pass = 0, total = 0;
  const check = (name, ok) => { total++; if (ok) { pass++; console.log(`  ok  ${name}`); } else console.log(`  FAIL ${name}`); };

  // Two fixture pages, because one poisoned the other: an element wider than the
  // layout viewport makes the mobile browser zoom the whole page out, which moves
  // the fixed bar's geometry and every hit-test coordinate. Overflow is validated
  // on its own page; everything geometric runs on a page that does not overflow.
  const FIXTURE = `<!doctype html><meta name="viewport" content="width=device-width">
  <style>body{margin:0;font-family:sans-serif} .bar{position:fixed;bottom:0;left:0;right:0;height:64px;background:#123;z-index:50}
  .under{position:absolute;top:590px;left:20px;width:200px;height:40px}
  .tiny{width:24px;height:24px;padding:0;display:block;margin:8px}
  .exp{position:relative;width:20px;height:20px;padding:0;display:block;margin:40px}
  .exp::after{content:"";position:absolute;inset:-20px}
  .big{width:48px;height:48px;display:block;margin:8px}
  .small-text{font-size:11px} .fine-text{font-size:16px}
  .low{color:#aaa;background:#fff;font-size:12px} .grad{background:linear-gradient(#fff,#eee)}</style>
  <h1>fixture</h1>
  <span class="small-text">eleven px text</span> <span class="fine-text">sixteen px text</span>
  <p class="low">low contrast line</p><p style="color:#000;background:#fff">clean line</p>
  <div class="grad"><span>gradient text</span></div>
  <button class="tiny">a</button><a href="#exp" role="button" class="exp">b</a><button class="big">c</button>
  <button class="under">half under the bar</button>
  <div class="bar"></div>`;

  await page.setContent(FIXTURE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  const first = await page.evaluate(FIRST_PAINT_PROBE);
  check("R26 positive: half-under button flagged", first.r26.length === 1 && /half under/.test(first.r26[0].text));
  check("R26 negative: only that one flagged", first.r26.length === 1);
  check("overflow negative: this fixture does not overflow", first.over <= 1);
  check("small-text positive: 11px counted", first.smallText.groups.some((g) => g.size === 11));
  check("small-text negative: 16px not counted", !first.smallText.groups.some((g) => g.size === 16));
  check("dead-end positive: zero onward links (self-anchor only)", first.onwardLinks === 0);
  check("soft-404 negative: fixture is not a 404", first.soft404 === false);

  const tap = await page.evaluate(TAP_PROBE);
  const smallTexts = tap.small.map((s) => s.text).join("|");
  check("tap positive: 24px isolated button flagged", /(^|\|)a(\||$)/.test(smallTexts));
  check("tap negative: ::after-expanded 20px button NOT flagged", !/(^|\|)b(\||$)/.test(smallTexts));
  check("tap negative: 48px button NOT flagged", !/(^|\|)c(\||$)/.test(smallTexts));

  const con = await page.evaluate(CONTRAST_PROBE);
  check("contrast positive: #aaa on #fff fails", con.fails.some((f) => /low contrast/.test(f.text)));
  check("contrast negative: #000 on #fff passes", !con.fails.some((f) => /clean line/.test(f.text)));
  check("contrast unmeasurable: gradient text counted, not passed", con.unmeasurable >= 1);

  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width"><style>body{margin:0}.wide{width:500px;height:10px;background:#ccc}</style><div class="wide">w</div>`, { waitUntil: "domcontentloaded" });
  const overf = await page.evaluate(FIRST_PAINT_PROBE);
  check("overflow positive: 500px div widens a 390px doc", overf.over > 80 && overf.overCulprits.length > 0);

  await page.setContent(`<a href="/somewhere">go</a>`, { waitUntil: "domcontentloaded" });
  const linked = await page.evaluate(FIRST_PAINT_PROBE);
  check("dead-end negative: a page with a link is not a dead end", linked.onwardLinks === 1);

  await page.setContent(`<h1>404 page not found</h1>`, { waitUntil: "domcontentloaded" });
  const soft = await page.evaluate(FIRST_PAINT_PROBE);
  check("soft-404 positive: 'not found' heading flagged", soft.soft404 === true);

  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e)));
  await page.setContent(`<script>throw new Error("fixture-boom")<\/script>`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
  check("console-error positive: thrown error captured", errs.some((e) => /fixture-boom/.test(e)));

  await page.goto("data:text/html,<title>A</title>A", { waitUntil: "domcontentloaded" });
  await page.goto("data:text/html,<title>B</title>B", { waitUntil: "domcontentloaded" });
  await page.goBack({ waitUntil: "domcontentloaded" });
  check("back mechanism: goBack lands on the prior document", (await page.title()) === "A");

  const nan = finite(NaN, "validation NaN band", []);
  check("finiteness guard: NaN becomes NOT MEASURABLE, never a number", nan === null);

  console.log(`\n  detector validation: ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
}

// ── assemble mode: merge raw runs into findings/verdicts/unmeasured JSON ────

function assemble() {
  const rawDir = path.join(OUT, "raw");
  const files = fs.readdirSync(rawDir).filter((f) => f.startsWith("results-") && f.endsWith(".json"));
  if (!files.length) { console.error("no raw results to assemble"); process.exit(2); }
  const runs = files.map((f) => JSON.parse(fs.readFileSync(path.join(rawDir, f), "utf8")));

  const findings = [];
  const unmeasured = [];
  let idn = 0;
  const fid = () => `P2-${String(++idn).padStart(3, "0")}`;

  const verdictRows = {
    r26: { metric: "R26 partially visible and dead at first paint", count: 0, worst: null, nm: 0 },
    tap: { metric: "tap targets under 44px effective", count: 0, worst: null, nm: 0 },
    overflow: { metric: "horizontal overflow (document and map iframe)", count: 0, worst: null, nm: 0 },
    smalltext: { metric: "text under 14px", count: 0, worst: null, nm: 0 },
    contrast: { metric: "contrast below WCAG AA (rendered)", count: 0, worst: null, nm: 0 },
    deadend: { metric: "dead ends (no route onward)", count: 0, worst: null, nm: 0 },
    back: { metric: "broken back (?brief=, ?focus=)", count: 0, worst: null, nm: 0 },
    e404: { metric: "404s (network and soft)", count: 0, worst: null, nm: 0 },
    cerr: { metric: "console errors", count: 0, worst: null, nm: 0 },
  };

  const tapSeen = new Set(), contrastSeen = new Set(), smallSeen = new Set(), e404Seen = new Set(), cerrSeen = new Set();

  for (const run of runs) {
    for (const u of run.unmeasured ?? []) unmeasured.push({ profile: run.profile, ...u });
    for (const r of run.routes ?? []) {
      const vp = run.profile;
      if (r.navFailed) {
        findings.push({ id: fid(), severity: "HIGH", category: "routing", route: r.route, viewport: vp, buildMarker: run.buildStart, elementChain: "(navigation)", repro: `open ${r.route}`, screenshot: null, personaLine: "The page never arrived.", detail: r.navFailed });
        continue;
      }
      const f = r.first ?? {};
      if ((f.r26 ?? []).length) {
        verdictRows.r26.count += f.r26.length;
        if (!verdictRows.r26.worst) verdictRows.r26.worst = `${r.route} ${vp}: ${f.r26[0].chain} "${f.r26[0].text}"`;
        for (const x of f.r26) findings.push({ id: fid(), severity: "HIGH", category: "overlapping controls", route: r.route, viewport: vp, buildMarker: run.buildStart, elementChain: x.chain, repro: `open ${r.route} at ${vp}, do not scroll, tap "${x.text}"`, screenshot: r.shot, personaLine: "I could see the button but my tap went to the bottom bar." });
      }
      if (typeof f.over === "number" && f.over > 1) {
        verdictRows.overflow.count += 1;
        const c = (f.overCulprits ?? [])[0];
        if (!verdictRows.overflow.worst || f.over > (verdictRows.overflow.worstPx ?? 0)) { verdictRows.overflow.worst = `${r.route} ${vp}: +${f.over}px ${c ? c.chain : ""}`; verdictRows.overflow.worstPx = f.over; }
        findings.push({ id: fid(), severity: f.over > 24 ? "HIGH" : "MED", category: "design", route: r.route, viewport: vp, buildMarker: run.buildStart, elementChain: c?.chain ?? "(contained everywhere; fixed symptom)", repro: `open ${r.route} at ${vp}, drag sideways`, screenshot: r.shot, personaLine: "The page slides sideways under my thumb." });
      }
      if (f.smallText) {
        for (const g of f.smallText.groups ?? []) {
          const key = `${r.route}|${g.size}|${g.chain}`;
          if (!smallSeen.has(key)) { smallSeen.add(key); verdictRows.smalltext.count += 1; if (!verdictRows.smalltext.worst || g.size < (verdictRows.smalltext.worstPx ?? 99)) { verdictRows.smalltext.worst = `${r.route}: ${g.size}px "${g.sample}"`; verdictRows.smalltext.worstPx = g.size; } }
        }
      }
      if (r.tap) {
        verdictRows.tap.nm += r.tap.unmeasurable ?? 0;
        for (const s of r.tap.small ?? []) {
          const key = `${r.route}|${s.chain}|${s.w}x${s.h}`;
          if (tapSeen.has(key)) continue;
          tapSeen.add(key);
          verdictRows.tap.count += 1;
          if (!verdictRows.tap.worst || s.w * s.h < (verdictRows.tap.worstArea ?? 1e9)) { verdictRows.tap.worst = `${r.route}: ${s.w}x${s.h} "${s.text}" x${s.count}`; verdictRows.tap.worstArea = s.w * s.h; }
        }
      } else verdictRows.tap.nm += 1;
      if (r.contrast) {
        verdictRows.contrast.nm += r.contrast.unmeasurable ?? 0;
        for (const c of r.contrast.fails ?? []) {
          const key = `${r.route}|${c.text}|${c.ratio}`;
          if (contrastSeen.has(key)) continue;
          contrastSeen.add(key);
          verdictRows.contrast.count += 1;
          if (!verdictRows.contrast.worst || c.ratio < (verdictRows.contrast.worstRatio ?? 99)) { verdictRows.contrast.worst = `${r.route}: ${c.ratio}:1 ${c.size}px "${c.text}" ${c.fg} on ${c.bg}`; verdictRows.contrast.worstRatio = c.ratio; }
        }
      } else verdictRows.contrast.nm += 1;
      if (f.onwardLinks === 0 && !f.hasBottomBar && r.route !== "/x-missing-page-probe") {
        verdictRows.deadend.count += 1;
        if (!verdictRows.deadend.worst) verdictRows.deadend.worst = `${r.route} ${vp}`;
        findings.push({ id: fid(), severity: "MED", category: "navigation", route: r.route, viewport: vp, buildMarker: run.buildStart, elementChain: "(page)", repro: `open ${r.route} at ${vp}; look for any way onward`, screenshot: r.shot, personaLine: "I had nowhere to go except the phone's back button." });
      }
      for (const b of r.backTests ?? []) {
        if (!b.ok) {
          verdictRows.back.count += 1;
          verdictRows.back.worst = verdictRows.back.worst ?? `${r.route} ${vp}: ${b.what}`;
          findings.push({ id: fid(), severity: "MED", category: "navigation", route: r.route, viewport: vp, buildMarker: run.buildStart, elementChain: "(history)", repro: `${b.what} at ${vp}`, screenshot: r.shot, personaLine: "Back did not take me back." , detail: b });
        }
      }
      if (f.soft404 && (r.status ?? 200) < 400 && r.route !== "/x-missing-page-probe") {
        verdictRows.e404.count += 1;
        findings.push({ id: fid(), severity: "HIGH", category: "routing", route: r.route, viewport: vp, buildMarker: run.buildStart, elementChain: "(page)", repro: `open ${r.route}`, screenshot: r.shot, personaLine: "It told me the page does not exist." });
      }
    }
    for (const b of run.badResponses ?? []) {
      const key = `${b.status}|${b.path}`;
      if (e404Seen.has(key)) continue;
      e404Seen.add(key);
      if (!b.path.includes("x-missing-page-probe")) {
        verdictRows.e404.count += 1;
        if (!verdictRows.e404.worst) verdictRows.e404.worst = `${b.status} ${b.path} (on ${b.route})`;
      }
    }
    for (const c of run.consoleErrs ?? []) {
      const key = c.msg;
      if (cerrSeen.has(key)) continue;
      cerrSeen.add(key);
      verdictRows.cerr.count += 1;
      if (!verdictRows.cerr.worst) verdictRows.cerr.worst = c.msg.slice(0, 100);
    }
  }

  const verdicts = Object.values(verdictRows).map((v) => ({
    metric: v.metric,
    verdict: v.count === 0 ? "PASS" : "FAIL",
    count: v.count,
    worst: v.worst,
    notMeasurable: v.nm ?? 0,
  }));

  fs.writeFileSync(path.join(OUT, "findings.json"), JSON.stringify(findings, null, 2));
  fs.writeFileSync(path.join(OUT, "verdicts.json"), JSON.stringify(verdicts, null, 2));
  fs.writeFileSync(path.join(OUT, "unmeasured.json"), JSON.stringify(unmeasured, null, 2));
  console.log(`assembled: ${findings.length} findings, ${verdicts.length} verdict rows, ${unmeasured.length} unmeasured entries`);
  for (const v of verdicts) console.log(`  ${v.verdict.padEnd(4)} ${String(v.count).padStart(4)}  nm=${String(v.notMeasurable).padStart(3)}  ${v.metric}`);
}

if (MODE === "validate") await validate();
else if (MODE === "assemble") assemble();
else await run();
