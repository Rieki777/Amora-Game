/* D2 A1 samples: the marks on the land, no two touching, all reachable. */
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = process.env.GROUNDS_FILE, EXE = process.env.PW_EXE, OUT = process.env.SHOT_DIR || 'shots-d2';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 }, deviceScaleFactor: 2 })).newPage();
  await p.goto(FILE); await p.waitForTimeout(1200);
  await p.click('#enterBtn'); await p.waitForTimeout(2800);
  await p.evaluate(() => { document.getElementById('maia').classList.add('min'); });
  for (const [n, z, x, y] of [['1-village-heart', 1.7, 1240, 700], ['2-at-the-gate', 1.35, 1240, 700], ['3-mid-size-seals', 1.1, 1300, 760], ['4-far-activity-seals', 0.82, 1240, 700], ['5-far-wide', 0.62, 1180, 720]]) {
    await p.evaluate(([z, x, y]) => { cam.z = z; cam.x = x; cam.y = y; clampCam(); refreshBadges(); syncBanners(); }, [z, x, y]);
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n);
  }
  await b.close();
})();
