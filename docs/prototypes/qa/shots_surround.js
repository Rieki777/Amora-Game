const { chromium } = require('playwright');
const fs = require('fs');
const FILE = process.env.GROUNDS_FILE, EXE = process.env.PW_EXE, OUT = process.env.SHOT_DIR || 'shots-sur';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 }, deviceScaleFactor: 2 })).newPage();
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(FILE); await p.waitForTimeout(1600);
  await p.click('#enterBtn'); await p.waitForTimeout(3200);
  await p.evaluate(() => document.getElementById('maia').classList.add('min'));
  // the corner Rye was looking at, and the whole land at the floor
  for (const [n, fn] of [
    ['1-southwest-corner', () => { cam.z = 1.0; cam.x = -1e6; cam.y = 1e6; clampCam(); }],
    ['2-whole-land-at-the-floor', () => { cam.z = 0.001; cam.x = W / 2; cam.y = H / 2; clampCam(); }],
    ['3-northwest-corner', () => { cam.z = 0.8; cam.x = -1e6; cam.y = -1e6; clampCam(); }],
  ]) {
    await p.evaluate(fn); await p.waitForTimeout(1000);
    await p.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n);
  }
  console.log('surround loaded:', await p.evaluate(() => !!surPlate), 'pageerrors', perr.length);
  await b.close();
})();
