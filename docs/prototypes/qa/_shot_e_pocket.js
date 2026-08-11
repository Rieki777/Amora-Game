/* Round E proof shots, on a real pocket viewport.
   `isMobile` lies on this Chromium (a 390x844 context reports innerWidth 1560),
   so a pocket context is hasTouch ALONE, which is what the map reads.
   Usage: source qa/env.sh && node qa/_shot_e_pocket.js <file-url> <out-prefix> */
const { chromium } = require('playwright');
const FILE = process.argv[2] || process.env.GROUNDS_FILE;
const OUT = process.argv[3] || 'shot';

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(FILE);
  await page.waitForTimeout(3200);
  if (await page.evaluate(() => document.body.classList.contains('intro'))) {
    await page.evaluate(() => { if (typeof leaveIntro === 'function') leaveIntro(); });
    await page.waitForTimeout(600);
  }

  const shots = [
    { name: 'near', z: 1.35, x: 1240, y: 700 },   // building names + the ring
    { name: 'far', z: 0.62, x: 1200, y: 780 },    // district names + far seals
  ];
  for (const s of shots) {
    const stat = await page.evaluate(({ z, x, y }) => {
      cam.z = z; cam.x = x; cam.y = y; clampCam();
      refreshBadges(); syncBanners(); syncBanners(); syncBanners();
      const plates = [...document.querySelectorAll('#banners .banner')]
        .filter(e => e.style.display !== 'none');
      // how far each visible building name sits from the roof it names
      let worst = 0;
      for (const el of plates) {
        const k = Object.keys(bEls).find(kk => bEls[kk] === el);
        const st = k && BY && BY[k]; if (!st) continue;
        const [sx, sy] = worldToScreen(st.x, st.y);
        const d = Math.hypot(parseFloat(el.style.left) - sx / DPR, parseFloat(el.style.top) - sy / DPR);
        if (d > worst) worst = d;
      }
      return {
        pocket: document.body.classList.contains('pocket'),
        plates: plates.length,
        clustered: document.querySelectorAll('.bgroup.clustered').length,
        worstPlateDrift: Math.round(worst),
      };
    }, s);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}-${s.name}.png` });
    console.log(s.name, JSON.stringify(stat));
  }
  await b.close();
})();
