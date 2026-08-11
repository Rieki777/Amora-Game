/* How much room a THUMB has, not whether a synthetic click at an exact centre
   resolves. Nearest-centre resolution gives two centres d apart a catchment of
   d/2, and a fingertip is 30 to 45 CSS px, so the number that matters is the
   SMALLEST centre-to-centre distance across DIFFERENT buildings.
   The map lane's measurement, rebuilt here so the suite can carry it.
   Usage: source qa/env.sh && node qa/_probe_catchment.js [file-url] */
const { chromium } = require('playwright');
const FILE = process.argv[2] || process.env.GROUNDS_FILE;

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  await p.goto(FILE); await p.waitForTimeout(1200);
  try { await p.click('#enterBtn'); } catch (_) {}
  await p.waitForTimeout(2600);
  console.log(JSON.stringify(await p.evaluate(() => {
    cam.z = 1.7; cam.x = 1240; cam.y = 700; clampCam(); syncBanners(); refreshBadges(); syncBanners();
    const seals = [...document.querySelectorAll('.bseal,.hchip')].filter(s => {
      const r = s.getBoundingClientRect();
      return r.width > 0 && getComputedStyle(s).display !== 'none'
        && s.closest('.bgroup').classList.contains('on');
    }).map(s => {
      const r = s.getBoundingClientRect();
      return { k: s.dataset.bk, kind: s.dataset.bkind || 'home', cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
    });
    const pairs = [];
    let sameRing = 0;
    for (let i = 0; i < seals.length; i++) for (let j = i + 1; j < seals.length; j++) {
      const d = Math.hypot(seals[i].cx - seals[j].cx, seals[i].cy - seals[j].cy);
      if (seals[i].k === seals[j].k) { if (d < 43.5) sameRing++; continue; }
      if (d < 44) pairs.push({ a: `${seals[i].k}:${seals[i].kind}`, b: `${seals[j].k}:${seals[j].kind}`, d: +d.toFixed(1), catchment: +(d / 2).toFixed(1) });
    }
    pairs.sort((x, y) => x.d - y.d);
    return {
      marks: seals.length, sameRing,
      minCrossBuilding: pairs.length ? pairs[0].d : null,
      belowFloor22: pairs.filter(x => x.d < 22).length,
      tightest: pairs.slice(0, 6),
    };
  }), null, 1));
  await b.close();
})();
