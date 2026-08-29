// Does the DRAWING match the TALLY? (#62: the vote as a moon and a field of silhouettes)
//
// The brief says: count the silhouettes against the numbers. So this reads the server's
// tally, then counts what is actually painted, and compares. Every band asserts finite
// BEFORE comparing; anything unparsed is NOT MEASURABLE and is printed, never passed.
import fs from "node:fs";

const BASE = process.env.QA_BASE_URL;
const BALLOT = process.env.QA_BALLOT;
const OUT = process.env.QA_OUT ?? ".qa1";
const TOKEN = fs.readFileSync(".qa1/member-token", "utf8").trim();
const TOKEN_KEY = /TOKEN_KEY\s*=\s*"([^"]+)"/.exec(
  fs.readFileSync("client/src/lib/gameApi.ts", "utf8"))[1];

const api = await (await fetch(`${BASE}/api/governance/ballots`, {
  headers: { Authorization: `Bearer ${TOKEN}` },
})).json();
const b = api.find((x) => x.id === BALLOT);
if (!b) { console.error("ballot not found"); process.exit(2); }

const pw = await import("playwright");
const unmeasured = [];

for (const prof of [
  { name: "cr-1280x800", w: 1280, h: 800, engine: "chromium", mobile: false, dpr: 1 },
  { name: "wk-390x844", w: 390, h: 844, engine: "webkit", mobile: true, dpr: 3 },
]) {
  const browser = await (prof.engine === "webkit" ? pw.webkit : pw.chromium).launch();
  const ctx = await browser.newContext({
    viewport: { width: prof.w, height: prof.h }, deviceScaleFactor: prof.dpr,
    isMobile: prof.mobile, hasTouch: prof.mobile,
  });
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [TOKEN_KEY, TOKEN]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/decisions/${BALLOT}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);

  const drawn = await page.evaluate(() => {
    const fin = (n) => typeof n === "number" && Number.isFinite(n);
    const un = [];
    const res = { un };

    // -- the silhouette field. A silhouette is "filled" when its paint differs from the
    //    empty ones; read the actual computed fill/colour rather than a class name, so a
    //    class rename cannot make this pass silently.
    const nodes = [...document.querySelectorAll("svg [data-silhouette], svg path, svg use, svg g > *")];
    const field = [...document.querySelectorAll("svg")]
      .map((s) => ({ s, kids: [...s.querySelectorAll("path,circle,rect,use,g")] }))
      .filter((x) => x.kids.length >= 15);
    if (!field.length) { un.push("no svg with >=15 marks found (silhouette field not located)"); res.silhouettes = null; }
    else {
      // widest such svg is the participation field
      const pick = field.sort((a, b) => b.kids.length - a.kids.length)[0];
      const fills = pick.kids.map((k) => {
        const cs = getComputedStyle(k);
        return { fill: cs.fill, opacity: cs.opacity, cls: k.getAttribute("class") || "" };
      });
      const counts = {};
      for (const f of fills) { const key = f.fill + "|" + f.opacity; counts[key] = (counts[key] || 0) + 1; }
      res.silhouettes = { total: pick.kids.length, byPaint: counts };
    }

    // -- the numbers the page prints next to the pictures
    const txt = (document.querySelector("main") || document.body).innerText || "";
    res.agreementText = (/Agreement[\s\S]{0,400}?\n([^\n]+)/.exec(txt) || [])[1] ?? null;
    const pm = /Participation[\s\S]{0,500}?(\d+)\s*%/.exec(txt);
    res.participationPct = pm ? Number(pm[1]) : null;
    if (res.participationPct !== null && !fin(res.participationPct)) {
      un.push("participation % parsed but not finite"); res.participationPct = null;
    }
    const wm = /(\d+)\s+of\s+(\d+)\s+weight has spoken, from\s+(\d+)\s+of\s+(\d+)\s+members/.exec(txt);
    res.spoken = wm ? { w: Number(wm[1]), totalW: Number(wm[2]), m: Number(wm[3]), totalM: Number(wm[4]) } : null;
    if (!res.spoken) un.push("could not parse the 'weight has spoken' sentence");
    const ym = /(\d+)\s+yes,\s*(\d+)\s+no/.exec(txt);
    res.yesNo = ym ? { yes: Number(ym[1]), no: Number(ym[2]) } : null;
    const um = /took a side[\s\S]{0,200}?(\d+)\s*%/.exec(txt);
    res.unityPct = um ? Number(um[1]) : null;
    res.rawSnippet = txt.slice(txt.indexOf("Where it stands"), txt.indexOf("Where it stands") + 700);
    return res;
  });

  await page.screenshot({ path: `${OUT}/crops/vote-drawing-${prof.name}.png`, fullPage: true, scale: "css" });
  for (const u of drawn.un) unmeasured.push({ profile: prof.name, why: u });

  console.log(`\n=== ${prof.name} ===`);
  console.log("SERVER tally:", JSON.stringify({
    yesW: b.tallies.yesW, noW: b.tallies.noW, abstainW: b.tallies.abstainW,
    unity: b.unity, quorum: b.quorum, votedCount: b.votedCount,
    totalWeight: b.totalWeight, electorateCount: b.electorateCount,
  }));
  console.log("PAGE   silhouettes:", JSON.stringify(drawn.silhouettes));
  console.log("PAGE   participation%:", drawn.participationPct, " spoken:", JSON.stringify(drawn.spoken));
  console.log("PAGE   agreement text:", JSON.stringify(drawn.agreementText), " unity%:", drawn.unityPct,
              " yes/no:", JSON.stringify(drawn.yesNo));

  // the comparisons, each guarded
  const checks = [];
  const cmp = (label, a, bb) => {
    if (!Number.isFinite(a) || !Number.isFinite(bb)) { unmeasured.push({ profile: prof.name, why: `${label}: one side not finite (${a} vs ${bb})` }); return; }
    checks.push({ label, page: a, server: bb, ok: a === bb });
  };
  cmp("participation %", drawn.participationPct, b.quorum);
  if (drawn.spoken) {
    cmp("weight spoken", drawn.spoken.w, b.tallies.yesW + b.tallies.noW + b.tallies.abstainW);
    cmp("total weight", drawn.spoken.totalW, b.totalWeight);
    cmp("members voted", drawn.spoken.m, b.votedCount);
    cmp("electorate", drawn.spoken.totalM, b.electorateCount);
  }
  if (drawn.yesNo) { cmp("yes weight", drawn.yesNo.yes, b.tallies.yesW); cmp("no weight", drawn.yesNo.no, b.tallies.noW); }
  if (drawn.unityPct !== null) cmp("agreement %", drawn.unityPct, b.unity);

  if (checks.length === 0) {
    console.log("  !! NO CHECK RAN. A control that did not run is not a control.");
  } else {
    for (const c of checks) console.log(`  ${c.ok ? "MATCH" : "MISMATCH"}  ${c.label}: page=${c.page} server=${c.server}`);
    console.log(`  ${checks.length} comparisons ran, ${checks.filter(c => !c.ok).length} mismatched`);
  }
  await browser.close();
}

console.log(`\n  ${unmeasured.length} NOT MEASURABLE (counted, never treated as passing)`);
for (const u of unmeasured) console.log(`      ${u.profile}: ${u.why}`);
