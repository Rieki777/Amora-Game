/* _probe_band_floor.js — the 6px dropdown, made deterministic.
 *
 * FOUND BY A 5-REP RUN OF verify_help_l8.js, 2 reds in 5, always the same line:
 *
 *     FAIL 1920x1080: the dropdown clears the vitals bar [vdrop.t=6 vitals.b=46]
 *
 * The band published --band-t-vdrop: 6px and the dropdown sat ON TOP of the bar
 * it hangs from, while the same run at the same viewport published 52px three
 * times out of five. A 40% coin flip is not a harness fault to be slept through,
 * so this reproduces the mechanism on demand instead of waiting for the coin.
 *
 * THE MECHANISM. bandPlace measures its floor with bandShown, and its comment
 * says so plainly: "A hidden floor is a zero floor." With the floor unmeasurable
 * the top band starts at base=0 and the first tenant lands at base+pad = 6.
 * That rule is right for a floor that is GONE on this profile and wrong for one
 * that is merely not measurable yet — and nothing schedules a corrective pass,
 * so 6px is not a frame of flicker, it is where the dropdown stays.
 *
 * WHY IT IS THIS LANE'S. Before R15 #vdrop carried a hardcoded top:46px and
 * could not do this. R15 made it a tenant and it inherited the rule.
 *
 * Run before and after the fix. Before: publishes 6px and keeps it.
 * After: publishes nothing, the CSS fallback holds, and the next honest pass
 * publishes the real number.
 */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE, EXE = process.env.PW_EXE;

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--allow-file-access-from-files', '--force-device-scale-factor=1'] });
  for (const [w, h, touch] of [[1920, 1080, false], [1280, 800, false], [390, 844, true]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(FILE, { waitUntil: 'load' });
    await page.waitForTimeout(2200);
    await page.evaluate(() => { if (typeof leaveIntro === 'function') leaveIntro() });
    await page.waitForTimeout(900);

    /* Open the dropdown through its own opener, then let the band settle. */
    const tgt = await page.evaluate(() => {
      const v = document.querySelector('.vital'); if (!v) return null;
      const r = v.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    if (touch) await page.touchscreen.tap(tgt.x, tgt.y); else await page.mouse.click(tgt.x, tgt.y);
    await page.waitForTimeout(900);

    const read = () => page.evaluate(() => {
      const vd = document.getElementById('vdrop'), vt = document.getElementById('vitals');
      const box = e => { const q = e.getBoundingClientRect(); return { t: Math.round(q.top), b: Math.round(q.bottom) } };
      return {
        v: getComputedStyle(document.documentElement).getPropertyValue('--band-t-vdrop').trim() || null,
        vdrop: box(vd), vitals: box(vt),
        vitalsShown: (() => { const cs = getComputedStyle(vt); const q = vt.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity || '1') >= 0.05 && q.width > 0 && q.height > 0 })(),
      };
    });

    const settled = await read();

    /* THE FORCED CASE. Make the floor unmeasurable, run the band's own layout,
       put the floor back, and read. Nothing here reaches into #vdrop: the only
       thing changed is whether the FLOOR could be measured during one pass,
       which is the state a slow frame produces on its own. */
    const forced = await page.evaluate(() => {
      const vt = document.getElementById('vitals');
      const prev = vt.style.display;
      vt.style.display = 'none';
      bandLayout();                       // one pass with an unmeasurable floor
      vt.style.display = prev;            // the bar is back, and visible
      const vd = document.getElementById('vdrop');
      return {
        v: getComputedStyle(document.documentElement).getPropertyValue('--band-t-vdrop').trim() || null,
        vdropTop: Math.round(vd.getBoundingClientRect().top),
        vitalsBottom: Math.round(vt.getBoundingClientRect().bottom),
      };
    });

    /* And does anything correct it? Give the page a full second of real time. */
    await page.waitForTimeout(1000);
    const after = await read();

    const bad = forced.v === '6px' || (after.v && parseInt(after.v, 10) < after.vitals.b);
    console.log(w + 'x' + h
      + '\n   settled      ' + JSON.stringify(settled)
      + '\n   floor hidden ' + JSON.stringify(forced)
      + '\n   +1s later    ' + JSON.stringify(after)
      + '\n   VERDICT      ' + (bad ? 'DROPDOWN UNDER THE BAR' : 'clears the bar')
      + '   errs=' + (errs.join(';') || 'none'));
    await ctx.close();
  }
  await browser.close();
})().catch(e => { console.log('PROBE THREW: ' + e.message + '\n' + e.stack); process.exit(2) });
