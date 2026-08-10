const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1200);
  await p.click('#enterBtn'); await p.waitForTimeout(2600);
  console.log(JSON.stringify(await p.evaluate(() => {
    const out = [];
    for (const z of [0.62, 0.72, 0.82, 0.9]) {
      cam.z = z; cam.x = 1240; cam.y = 700; clampCam(); refreshBadges(); syncBanners(); syncBanners(); syncBanners();
      const plates = SCENE.districts.map(d => bEls['d_' + d.id]).filter(e => e.style.display !== 'none')
        .map(e => ({ n: e.textContent, r: e.getBoundingClientRect() }));
      const marks = [...document.querySelectorAll('.aseal,.hchip')].filter(e => getComputedStyle(e).display !== 'none' && /far|on/.test(e.closest('.bgroup').className)).map(e => e.getBoundingClientRect());
      let pp = 0, pm = 0;
      for (let i = 0; i < plates.length; i++) {
        for (let j = i + 1; j < plates.length; j++) { const a = plates[i].r, c = plates[j].r; if (a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom) pp++; }
        for (const m of marks) { const a = plates[i].r; if (a.left < m.right && m.left < a.right && a.top < m.bottom && m.top < a.bottom) pm++; }
      }
      out.push({ z, plates: plates.length, marks: marks.length, plateOnPlate: pp, plateOnMark: pm });
    }
    return out;
  }), null, 1));
  await b.close();
})();
