// What does the product SAY to a member when the server refuses the thing they just did?
//
// The harm being hunted is #2 on the brief: a control that does not do what it says, and
// specifically a success reported out of a failure path. So each case does the same thing
// twice: once with the server answering normally (the CONTROL, so a negative is proved
// against a known-present positive in the same run), and once with that one route forced
// to refuse. Then it asks what the page says, and whether a fresh load agrees.
//
// LOCAL only. This writes.
import fs from "node:fs";

const BASE = process.env.QA_BASE_URL;
const OUT = process.env.QA_OUT ?? ".qa1";
const BALLOT = process.env.QA_BALLOT;
const TOKEN = fs.readFileSync(".qa1/member-token", "utf8").trim();
const TOKEN_KEY = /TOKEN_KEY\s*=\s*"([^"]+)"/.exec(
  fs.readFileSync("client/src/lib/gameApi.ts", "utf8"))[1];

const pw = await import("playwright");
const unmeasured = [];

async function run({ label, route, control, failPattern, failStatus, readback }) {
  const out = {};
  for (const mode of ["control", "forced-refusal"]) {
    const browser = await pw.chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [TOKEN_KEY, TOKEN]);
    const page = await ctx.newPage();

    let intercepted = 0;
    if (mode === "forced-refusal") {
      await page.route((u) => u.pathname.includes(failPattern), async (r) => {
        const req = r.request();
        if (req.method() === "GET") return r.continue();
        intercepted++;
        await r.fulfill({ status: failStatus, contentType: "application/json",
                          body: JSON.stringify({ error: "QA-1 forced refusal" }) });
      });
    }

    const seen = [];
    page.on("response", (r) => {
      if (r.request().method() !== "GET" && r.url().includes("/api/"))
        seen.push(`${r.request().method()} ${r.url().replace(BASE, "")} -> ${r.status()}`);
    });

    await page.goto(BASE + route, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(3500);

    const btn = page.locator(`button:has-text("${control}")`).first();
    const n = await page.locator(`button:has-text("${control}")`).count();
    if (n === 0) { unmeasured.push({ label, mode, why: `control "${control}" not on page` }); await browser.close(); continue; }

    let clickErr = null;
    try { await btn.click({ timeout: 8000 }); } catch (e) { clickErr = String(e).slice(0, 160); }
    await page.waitForTimeout(2500);

    const said = await page.evaluate(() => {
      const t = document.body.innerText || "";
      const hits = t.match(/[^\n]*\b(you voted|your vote|saved|failed|could ?n[o']t|error|try again|refus|not recorded|went wrong)\b[^\n]*/gi);
      return hits ? [...new Set(hits.map((s) => s.trim()))].slice(0, 8) : [];
    });

    await page.screenshot({ path: `${OUT}/crops/refusal-${label}-${mode}.png`, fullPage: true, scale: "css" });

    // fresh load, no interception: what does the SERVER actually hold?
    const p2 = await ctx.newPage();
    await p2.goto(BASE + route, { waitUntil: "domcontentloaded" });
    await p2.waitForTimeout(3500);
    const server = readback ? await p2.evaluate(readback) : null;

    out[mode] = { intercepted, requests: seen.filter((s) => s.includes(failPattern)), said, server, clickErr };
    console.log(`\n--- ${label} / ${mode} ---`);
    console.log("  intercepted:", intercepted, " matching requests:", JSON.stringify(out[mode].requests));
    console.log("  page said:", JSON.stringify(said));
    console.log("  server holds, on a fresh load:", JSON.stringify(server));
    await browser.close();
  }

  // the control must have RUN, or the comparison means nothing
  if (!out["control"]) { unmeasured.push({ label, why: "control run did not complete; comparison not made" }); return; }
  if (!out["forced-refusal"]) { unmeasured.push({ label, why: "refusal run did not complete" }); return; }
  const c = out["control"], f = out["forced-refusal"];
  if (f.intercepted === 0) { unmeasured.push({ label, why: "no request was intercepted; the refusal never happened, so nothing was tested" }); return; }
  console.log(`\n  VERDICT ${label}:`);
  console.log(`    control said        : ${JSON.stringify(c.said)}`);
  console.log(`    forced-refusal said : ${JSON.stringify(f.said)}`);
  console.log(`    server after refusal: ${JSON.stringify(f.server)}`);
  const claimsSuccess = f.said.some((s) => /you voted|your vote is (yes|no)|saved/i.test(s));
  const admitsFailure = f.said.some((s) => /failed|could ?n[o']t|error|try again|went wrong|not recorded|refus/i.test(s));
  console.log(`    claims success after a refusal: ${claimsSuccess}`);
  console.log(`    admits the failure            : ${admitsFailure}`);
}

await run({
  label: "ballot-vote",
  route: `/decisions/${BALLOT}`,
  control: "Yes",
  failPattern: "/vote",
  failStatus: 500,
  readback: () => {
    const t = document.body.innerText || "";
    const m = t.match(/(Nobody has voted yet[^\n]*|\d+ of \d+ weight has spoken[^\n]*)/);
    return m ? m[1] : null;
  },
});

console.log(`\n  ${unmeasured.length} NOT MEASURABLE (counted, never treated as passing)`);
for (const u of unmeasured) console.log(`      ${u.label}${u.mode ? "/" + u.mode : ""}: ${u.why}`);
