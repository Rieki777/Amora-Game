/* _probe_vdrop_desk.js — why does --band-t-vdrop sometimes not get published
 * on a desk, when the same tap publishes it every time on a pocket?
 *
 * Reads the var at four moments after the click and reports what the band could
 * have seen at each, over N repetitions, so the answer is a RATE and a
 * mechanism rather than one lucky or unlucky run.
 */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE, EXE = process.env.PW_EXE;
const REPS = +(process.env.REPS || 6);

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--allow-file-access-from-files', '--force-device-scale-factor=1'] });
  for (const [w, h, touch] of [[1280, 800, false], [1920, 1080, false], [390, 844, true]]) {
    let published = 0;
    for (let i = 0; i < REPS; i++) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, deviceScaleFactor: 1 });
      const page = await ctx.newPage();
      await page.goto(FILE, { waitUntil: 'load' });
      await page.waitForTimeout(2200);
      await page.evaluate(() => { if (typeof leaveIntro === 'function') leaveIntro() });
      await page.waitForTimeout(900);

      const tgt = await page.evaluate(() => {
        const v = document.querySelector('.vital'); if (!v) return null;
        const r = v.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      });
      if (touch) await page.touchscreen.tap(tgt.x, tgt.y); else await page.mouse.click(tgt.x, tgt.y);

      const snap = () => page.evaluate(() => {
        const vd = document.getElementById('vdrop');
        const cs = vd ? getComputedStyle(vd) : null;
        const r = vd ? vd.getBoundingClientRect() : null;
        return {
          v: getComputedStyle(document.documentElement).getPropertyValue('--band-t-vdrop').trim() || null,
          show: !!(vd && vd.classList.contains('show')),
          disp: cs ? cs.display : null, op: cs ? cs.opacity : null,
          wh: r ? [Math.round(r.width), Math.round(r.height)] : null,
          top: r ? Math.round(r.top) : null,
        };
      });
      const a = await snap();
      await page.waitForTimeout(300); const b = await snap();
      await page.waitForTimeout(400); const c = await snap();
      /* Force one more layout pass the way any real interaction would. */
      await page.evaluate(() => { if (typeof bandLayout === 'function') bandLayout() });
      const d = await snap();
      if (c.v) published++;
      console.log(w + 'x' + h + ' rep' + (i + 1)
        + '  t+0 ' + JSON.stringify(a) + '\n              t+300 ' + JSON.stringify(b)
        + '\n              t+700 ' + JSON.stringify(c) + '\n              forced ' + JSON.stringify(d));
      await ctx.close();
    }
    console.log('>>> ' + w + 'x' + h + ': published at t+700 in ' + published + '/' + REPS + '\n');
  }
  await browser.close();
})().catch(e => { console.log('PROBE THREW: ' + e.message + '\n' + e.stack); process.exit(2) });
