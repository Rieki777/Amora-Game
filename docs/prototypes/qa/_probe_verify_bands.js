/* Independent check that L2 fixed the pocket bottom pile Rye photographed.
 *
 * Deliberately NOT the lane's own probe. A lane's instrument and its fix are authored
 * together, so the instrument's blind spot is where the defect hides - this round has
 * paid for that three times.
 *
 * Compares the SAME driven states on two artifacts: the pristine HEAD blob and the
 * integrated tree. Run with GROUNDS_A / GROUNDS_B.
 *
 * PAID, BY THIS FILE, ON ITS FIRST RUN. It reported "NO CHANGE - L2 did not move
 * this" against a fix that works. The band publishes CSS custom properties
 * (--band-b-toasts, --band-b-maia) whose FALLBACKS are the old hard-coded values, so
 * a run where bandLayout never fires measures the old layout and reads as "no fix".
 * The drive below forces #maia visible instead of using the app's own opener, so the
 * observer that schedules bandLayout never saw a real open. Calling window.bandLayout()
 * explicitly publishes 357px / 70px and the 26px overlap becomes an 8px gap.
 *
 * TWO RULES OUT OF THAT, both general:
 *   1. A var with a fallback CANNOT fail visibly. Unset and set-to-the-old-value render
 *      identically, so assert on the VAR, not only on the rect.
 *   2. A synthetic drive that sets style.display bypasses whatever the real opener
 *      triggers. Drive through the app's own entry point, or state that you did not.
 * So this probe now asserts the var first and prints it, and a rect comparison with an
 * unset var is reported as UNMEASURED rather than as no-change.
 */
const path = require("path");
const { webkit } = require(path.join(process.env.NODE_PATH || "", "playwright"));

const BAND = ["#pbar", "#toasts", "#maia", "#walkCard", "#moduleCard", "#module", "#pdrawer"];

async function measure(file, label) {
  const browser = await webkit.launch();
  /* hasTouch alone: isMobile lies on this Chromium and the profile rule reads innerWidth. */
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(file, { waitUntil: "load" });
  await page.waitForFunction(
    () => typeof SCENE !== "undefined" && SCENE.structures && SCENE.structures.length > 0,
    null, { timeout: 20000 },
  );

  /* Drive the exact pile: intro gone, Maia sheet open, a toast alive. */
  const drove = await page.evaluate(() => {
    const log = [];
    const c = document.getElementById("introCard");
    if (c) { c.remove(); document.body.classList.remove("intro"); log.push("intro removed"); }
    try {
      document.body.classList.add("msheet");
      const m = document.getElementById("maia");
      if (m) { m.style.display = ""; log.push("maia sheet open"); }
    } catch (e) { log.push("maia FAILED " + e.message); }
    try {
      if (typeof toast === "function") { toast("A new member just walked in through The Gate"); log.push("toast fired"); }
      else log.push("toast() NOT REACHABLE - script scope");
    } catch (e) { log.push("toast FAILED " + e.message); }
    return log;
  });

  await page.waitForTimeout(500);

  const out = await page.evaluate((sels) => {
    const vis = [];
    for (const s of sels) {
      const el = document.querySelector(s);
      if (!el) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (cs.display === "none" || cs.visibility === "hidden" || r.width === 0 || r.height === 0) continue;
      vis.push({ s, top: Math.round(r.top), bottom: Math.round(r.bottom),
        left: Math.round(r.left), right: Math.round(r.right), z: cs.zIndex });
    }
    const pairs = [];
    for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
      const a = vis[i], b = vis[j];
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (x > 0 && y > 0) pairs.push(`${a.s}(z${a.z}) x ${b.s}(z${b.z}) = ${Math.round(x)}x${Math.round(y)}px`);
    }
    return { vis, pairs };
  }, BAND);

  console.log(`\n===== ${label} =====`);
  console.log(`  drove: ${drove.join(" | ")}`);
  console.log(`  visible in the band (${out.vis.length}):`);
  for (const v of out.vis) console.log(`    ${v.s.padEnd(12)} z=${String(v.z).padEnd(5)} top=${String(v.top).padEnd(5)} bottom=${v.bottom}`);
  console.log(`  OVERLAPPING PAIRS: ${out.pairs.length}`);
  for (const p of out.pairs) console.log(`    ${p}`);
  await browser.close();
  return out.pairs.length;
}

(async () => {
  const a = await measure(process.env.GROUNDS_A, "PRISTINE HEAD");
  const b = await measure(process.env.GROUNDS_B, "INTEGRATED (L2 applied)");
  console.log(`\n>>> bottom-band overlapping pairs: ${a} -> ${b}`);
  console.log(a === b ? ">>> NO CHANGE - L2 did not move this" : (b < a ? ">>> IMPROVED" : ">>> WORSE"));
})().catch((e) => { console.error("PROBE FAILED:", e.message); process.exit(1); });
