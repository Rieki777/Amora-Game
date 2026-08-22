/* WHEN DOES THE FLIGHT ACTUALLY LAND, and how far is that from the two fixed
 * budgets that were waiting for it?
 *
 * This is _probe_f7dist.js pointed at the other end of the same event. F7
 * budgeted 2500ms for the spoken line and was already fixed. C7b then budgeted
 * 3500ms and section J budgeted 2600ms for the SAME arrival, and both shipped.
 * The camera flight is frame-counted: `travel.t += dt*1.6` with `dt` capped at
 * .05, driven by requestAnimationFrame, so its duration is about 12.5 frames
 * whatever the clock says. A budget for it is a bet on the frame rate.
 *
 * TWO MOMENTS ARE MEASURED, because the two checks needed different ones:
 *   travel -> null   the arrival callback runs on this frame. C7b's window.
 *   .jrow appears    the stop row reaches the dock. Section J's spy needs it.
 *
 * Run it on an idle box and on a busy one. The gap between those two runs is
 * the whole reason a fixed budget reads as a real defect on one machine and as
 * a clean pass on another.
 *
 *   cd docs/prototypes/qa && source ./env.sh && node _probe_arrival_dist.js
 *   REPS=8 node _probe_arrival_dist.js
 */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE, EXE = process.env.PW_EXE;
const REPS = Number(process.env.REPS || 6);
const LABEL = process.env.LABEL || 'run';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const rows = [];
  for (let i = 0; i < REPS; i++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    const page = await ctx.newPage();
    await page.goto(FILE);
    await page.waitForFunction(() => typeof playJourney === 'function', null, { timeout: 15000 });
    await page.click('#enterBtn').catch(() => {});
    await page.waitForTimeout(1400);

    const r = await page.evaluate(async () => {
      window.__raf = 0;
      const beat = () => { window.__raf++; requestAnimationFrame(beat); };
      requestAnimationFrame(beat);
      document.getElementById('maiaLog').innerHTML = '';
      const t0 = performance.now();
      playJourney('j1');
      let flightMs = null, rowMs = null;
      /* Poll fast enough that the number is the event and not the poll. */
      for (let n = 0; n < 1200; n++) {
        if (flightMs === null && !(typeof travel !== 'undefined' && !!travel)) flightMs = performance.now() - t0;
        if (rowMs === null && document.querySelectorAll('#maiaLog .jrow').length > 0) rowMs = performance.now() - t0;
        if (flightMs !== null && rowMs !== null) break;
        await new Promise(res => setTimeout(res, 15));
      }
      return { flight: flightMs === null ? null : Math.round(flightMs),
               row: rowMs === null ? null : Math.round(rowMs),
               fps: Math.round(window.__raf / ((performance.now() - t0) / 1000)) };
    });
    rows.push(r);
    const over26 = r.row === null || r.row > 2600;
    const over35 = r.flight === null || r.flight > 3500;
    console.log(`${LABEL} rep ${i + 1}: flight landed ${r.flight === null ? 'NEVER' : r.flight + 'ms'}, `
      + `stop row at ${r.row === null ? 'NEVER' : r.row + 'ms'}  (~${r.fps}fps)  -> `
      + `J@2600ms ${over26 ? 'MISSES the row' : 'catches it'}, C7b@3500ms ${over35 ? 'returns EARLY' : 'covers it'}`);
    await ctx.close();
  }
  const f = rows.map(x => x.flight).filter(v => v !== null);
  const w = rows.map(x => x.row).filter(v => v !== null);
  const overJ = rows.filter(x => x.row === null || x.row > 2600).length;
  const overC = rows.filter(x => x.flight === null || x.flight > 3500).length;
  console.log(`\n${LABEL}: flight ${Math.min(...f)}-${Math.max(...f)}ms, stop row ${Math.min(...w)}-${Math.max(...w)}ms`);
  console.log(`${LABEL}: the old J budget would have missed the row in ${overJ}/${rows.length}; `
    + `the old C7b budget would have returned before the landing in ${overC}/${rows.length}`);
  await browser.close();
})();
