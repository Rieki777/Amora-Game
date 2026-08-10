const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1200);
  await p.click('#enterBtn'); await p.waitForTimeout(2600);
  console.log(JSON.stringify(await p.evaluate(() => {
    const xs = SCENE.structures.map(s => s.x), ys = SCENE.structures.map(s => s.y);
    const out = { minX: Math.round(Math.min(...xs)), maxX: Math.round(Math.max(...xs)),
      minY: Math.round(Math.min(...ys)), maxY: Math.round(Math.max(...ys)), W, H, rows: [] };
    for (const z of [0.6, 0.9, 1.2, 1.8]) {
      cam.z = z; clampCam(); const b = camBounds();
      const hw = innerWidth / 2 / z, hh = innerHeight / 2 / z;
      out.rows.push({ z, hw: Math.round(hw),
        westVoidPx: Math.round(Math.max(0, hw - b[0]) * z), oldWestPx: Math.round(hw * z),
        eastVoidPx: Math.round(Math.max(0, b[1] - (W - hw)) * z),
        northVoidPx: Math.round(Math.max(0, hh - b[2]) * z), southVoidPx: Math.round(Math.max(0, b[3] - (H - hh)) * z),
        bound: b.map(v => Math.round(v)) });
    }
    return out;
  }), null, 1));
  await b.close();
})();
