/* D1 samples for Rye: the whole land at the new zoom floor, the sea rim past
   the boundary, an edge building centred, and the labels at their new height. */
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = process.env.GROUNDS_FILE;
const EXE = process.env.PW_EXE;
const OUT = process.env.SHOT_DIR || 'shots-d1';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1180 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(FILE);
  await page.waitForTimeout(1200);
  await page.click('#enterBtn');
  await page.waitForTimeout(2800);
  const shot = async (n) => { await page.screenshot({ path: `${OUT}/${n}.png` }); console.log('shot', n); };

  // 1. pinched all the way out — the whole land with a breath of sea around it
  await page.evaluate(() => { cam.z = 0.001; cam.x = W / 2; cam.y = H / 2; clampCam(); });
  await page.waitForTimeout(900);
  await shot('1-whole-land-at-the-floor');

  // 2. an edge building at screen centre (the thing that could not be done)
  await page.evaluate(() => {
    const e = SCENE.structures.reduce((a, b) => (b.x > a.x ? b : a));
    window.__edge = e.name; cam.z = 1.2; cam.x = e.x; cam.y = e.y; clampCam();
  });
  await page.waitForTimeout(900);
  console.log('edge building', await page.evaluate(() => window.__edge));
  await shot('2-edge-building-centred');

  // 3. labels at the new height, painted sprites, z=1
  await page.evaluate(() => { cam.z = 1.25; cam.x = 1240; cam.y = 700; clampCam(); });
  await page.waitForTimeout(900);
  await shot('3-labels-hug-their-buildings');

  // 4. a tapped building centred in the strip beside an open panel
  await page.evaluate(() => openPanel('kitchen'));
  await page.waitForTimeout(1600);
  await shot('4-panel-aware-centring');

  // 5. the phone: two fingers open the whole land, which they never could before
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3 } /* no isMobile: this Chromium reports innerWidth 4x the CSS viewport with it on */);
  const pp = await pctx.newPage();
  await pp.goto(FILE + '#hud=pocket'); await pp.waitForTimeout(1600);
  if (await pp.evaluate(() => document.body.classList.contains('intro'))) await pp.click('#enterBtn');
  await pp.waitForTimeout(2800);
  await pp.evaluate(() => {
    const el = document.getElementById('scene');
    const T = (t, pts) => el.dispatchEvent(new TouchEvent(t, {
      bubbles: true, cancelable: true,
      touches: pts.map((p, i) => new Touch({ identifier: i, target: el, clientX: p[0], clientY: p[1] }))
    }));
    cam.z = 1.4; cam.x = W / 2; cam.y = H / 2; clampCam();
    T('touchstart', [[100, 400], [300, 400]]); T('touchmove', [[197, 400], [203, 400]]);  // 200 apart squeezed to 6: a pinch that asks for far more than the floor allows T('touchend', []);
  });
  await pp.waitForTimeout(900);
  await pp.screenshot({ path: `${OUT}/5-pocket-pinched-all-the-way-out.png` });
  console.log('shot 5-pocket-pinched-all-the-way-out');

  await browser.close();
})();
