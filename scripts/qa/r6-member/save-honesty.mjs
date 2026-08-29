// #89 / #90: "every surface that says 'saved' asks the server first".
//
// Press a save control as an ordinary member, then ask three separate questions:
//   1. what did the UI SAY?
//   2. did a request actually go to the server, and what did it answer?
//   3. does the server still hold the value on a FRESH load?
//
// A surface passes only when all three agree. A "Saved" with no request, or with a
// failing request, or that a reload does not confirm, is a lie. LOCAL only: this
// writes, and the house rules forbid any write to live.
import fs from "node:fs";

const BASE = process.env.QA_BASE_URL;
const OUT = process.env.QA_OUT ?? ".qa1";
const TOKEN = fs.readFileSync(".qa1/member-token", "utf8").trim();
const TOKEN_KEY = /TOKEN_KEY\s*=\s*"([^"]+)"/.exec(
  fs.readFileSync("client/src/lib/gameApi.ts", "utf8"))[1];

const CASES = JSON.parse(fs.readFileSync(process.env.QA_CASES, "utf8"));

const pw = await import("playwright");
const unmeasured = [];
const results = [];

for (const c of CASES) {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(([k, v]) => { try { localStorage.setItem(k, v); } catch {} }, [TOKEN_KEY, TOKEN]);
  const page = await ctx.newPage();

  const writes = [];
  page.on("response", async (r) => {
    const m = r.request().method();
    if (m === "GET" || m === "HEAD" || m === "OPTIONS") return;
    if (!r.url().includes("/api/")) return;
    let body = "";
    try { body = (await r.text()).slice(0, 300); } catch { body = "(unreadable)"; }
    writes.push({ method: m, url: r.url().replace(BASE, ""), status: r.status(), body });
  });

  await page.goto(BASE + c.route, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);

  // find the control by its visible words, and prove we found ONE
  const found = await page.evaluate((label) => {
    const all = [...document.querySelectorAll("button,[role=button],input[type=submit]")];
    const hits = all.filter((b) => (b.innerText || b.value || "").trim().toLowerCase() === label.toLowerCase());
    return { total: all.length, hits: hits.length,
             labels: all.map((b) => (b.innerText || b.value || "").trim()).filter(Boolean).slice(0, 25) };
  }, c.control);
  if (found.hits === 0) {
    unmeasured.push({ route: c.route, control: c.control, why: `control not found (${found.total} buttons on page): ${JSON.stringify(found.labels)}` });
    await browser.close();
    continue;
  }

  // change something first, so a save has something to carry
  let mutated = null;
  if (c.mutate) {
    mutated = await page.evaluate(c.mutate);
  }

  const before = writes.length;
  const btn = page.locator(`button:text-is("${c.control}")`).first();
  let clickErr = null;
  try { await btn.click({ timeout: 8000 }); } catch (e) { clickErr = String(e).slice(0, 200); }
  await page.waitForTimeout(3000);

  const said = await page.evaluate(() => {
    const t = (document.body.innerText || "");
    const m = t.match(/\b(saved|save failed|couldn't save|could not save|not saved|sent|failed|error|try again)\b[^\n]{0,90}/gi);
    return m ? [...new Set(m)].slice(0, 6) : [];
  });

  const newWrites = writes.slice(before);

  // fresh load: does the server still hold it?
  const page2 = await ctx.newPage();
  await page2.goto(BASE + c.route, { waitUntil: "domcontentloaded" });
  await page2.waitForTimeout(3500);
  const after = c.read ? await page2.evaluate(c.read) : null;

  results.push({ route: c.route, control: c.control, clickErr, mutated,
                 uiSaid: said, writes: newWrites, valueAfterReload: after, expect: c.expect ?? null });

  console.log(`\n=== ${c.route} :: "${c.control}" ===`);
  if (clickErr) console.log("  CLICK ERROR:", clickErr);
  console.log("  mutated to:", JSON.stringify(mutated));
  console.log("  UI said:", JSON.stringify(said));
  console.log("  requests fired:", newWrites.length);
  for (const w of newWrites) console.log(`     ${w.method} ${w.url} -> ${w.status}  ${w.body.slice(0, 120)}`);
  console.log("  value after a fresh load:", JSON.stringify(after));
  if (newWrites.length === 0 && said.some((s) => /^saved/i.test(s))) {
    console.log("  >> SAYS SAVED WITH NO REQUEST");
  }
  await browser.close();
}

fs.writeFileSync(`${OUT}/save-honesty.json`, JSON.stringify(results, null, 1));
console.log(`\n  ${unmeasured.length} NOT MEASURABLE (counted, never treated as passing)`);
for (const u of unmeasured) console.log(`      ${u.route} "${u.control}": ${u.why}`);
console.log(`  ${results.length} save surfaces examined`);
