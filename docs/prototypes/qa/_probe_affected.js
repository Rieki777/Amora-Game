/* HOW MANY doors are unreliable, not just the worst pair.
   The zoom sweep proved no rotation budget clears the floor below z 1.7. That
   says the worst pair is bad; it does not say whether the problem is two marks
   or thirty, and the answer decides whether the fix is a zoom gate (hide the
   ring until there is room) or a recorded limitation.

   A door is UNRELIABLE when its nearest cross-building neighbour is closer than
   the rendered ink width, so its catchment does not cover its own face.

   THE WHOLE-LAND SCOPE IS DELIBERATE. The filter below takes every rendered
   mark whose group is live, NOT the marks intersecting the viewport, so
   `doors` reads the same at every camera position. That is why the map lane's
   pan of 25 centres at four zooms reproduced the single-centre numbers exactly
   (4/4/3/0): position is not an axis, by construction. "Tighten" this to count
   only what is on screen and the metric silently becomes position-dependent
   while the budget goes on claiming it measures the map.
   `verify_features.js` carries a tripwire for it: same zoom, two centres, same
   count.
   Usage: source qa/env.sh && node qa/_probe_affected.js */
const { chromium } = require('playwright');
const ZOOMS = [1.0, 1.1, 1.2, 1.35, 1.45, 1.6, 1.7, 2.0];

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1200);
  try { await p.click('#enterBtn'); } catch (_) {}
  await p.waitForTimeout(2600);

  const rows = await p.evaluate(ZOOMS => ZOOMS.map(z => {
    cam.z = z; cam.x = 1240; cam.y = 700; clampCam();
    refreshBadges(); syncBanners(); syncBanners();
    const seal = document.querySelector('.bseal');
    const ink = seal ? parseFloat(getComputedStyle(seal).width) : 28;
    const doors = [...document.querySelectorAll('.bseal,.hchip')].filter(s => {
      const r = s.getBoundingClientRect();
      return r.width > 0 && getComputedStyle(s).display !== 'none'
        && s.closest('.bgroup').classList.contains('on');
    }).map(s => { const r = s.getBoundingClientRect();
      return { k: s.dataset.bk, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; });
    let bad = 0, worst = Infinity;
    for (const d of doors) {
      let near = Infinity;
      for (const o of doors) {
        if (o === d || o.k === d.k) continue;
        const dist = Math.hypot(d.cx - o.cx, d.cy - o.cy);
        if (dist < near) near = dist;
      }
      if (near < ink) bad++;
      if (near < worst) worst = near;
    }
    return { z, ink, doors: doors.length, unreliable: bad,
      pct: doors.length ? Math.round(100 * bad / doors.length) : 0,
      worst: +worst.toFixed(1) };
  }), ZOOMS);

  console.log('  z     ink  doors  unreliable        worst');
  for (const r of rows)
    console.log(`  ${r.z.toFixed(2)}  ${String(r.ink).padStart(3)}  ${String(r.doors).padStart(5)}  ${String(r.unreliable).padStart(4)} (${String(r.pct).padStart(3)}%)   ${r.worst}`);
  await b.close();
})();
