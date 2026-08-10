/* D3 samples for Rye: the glyph sheet at line size, and the flows wearing it. */
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = process.env.GROUNDS_FILE, EXE = process.env.PW_EXE, OUT = process.env.SHOT_DIR || 'shots-d3';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const b = await chromium.launch({ executablePath: EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 }, deviceScaleFactor: 3 })).newPage();
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(FILE); await p.waitForTimeout(1200);
  await p.click('#enterBtn'); await p.waitForTimeout(2600);

  /* the sheet: every mark at the size it ships at, on the land's own greens */
  await p.evaluate(() => {
    const wrap = document.createElement('div');
    wrap.id = 'glyphsheet';
    wrap.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#1d3320;padding:26px;font:13px Georgia,serif;color:#f3e6c8;overflow:auto';
    const grounds = ['#2c4a2b', '#7d8c5a', '#101d13'];
    wrap.innerHTML = `<div style="font-variant:small-caps;letter-spacing:.15em;color:#c9a25e;margin-bottom:14px">the flow marks &middot; 12 px, the size they ship at, on three grounds</div>`;
    for (const g of grounds) {
      const row = document.createElement('div');
      row.style.cssText = `display:flex;gap:22px;flex-wrap:wrap;background:${g};padding:12px;border-radius:8px;margin-bottom:10px;align-items:flex-end`;
      for (const m of SCENE.vocabulary.media) {
        const c = document.createElement('canvas'); c.width = c.height = 12;
        c.style.cssText = 'width:12px;height:12px;image-rendering:auto';
        c.getContext('2d').drawImage(flowSprite(m.key), 0, 0, 12, 12);
        const cell = document.createElement('div');
        cell.style.cssText = 'text-align:center;width:104px';
        cell.appendChild(c);
        cell.insertAdjacentHTML('beforeend', `<div style="font-size:10px;color:#cfc7a8;margin-top:6px">${m.name}</div>`);
        row.appendChild(cell);
      }
      wrap.appendChild(row);
    }
    const big = document.createElement('div');
    big.style.cssText = 'display:flex;gap:22px;flex-wrap:wrap;margin-top:14px;align-items:flex-end';
    for (const m of SCENE.vocabulary.media) {
      const c = document.createElement('canvas'); c.width = c.height = 72;
      c.style.cssText = 'width:72px;height:72px';
      c.getContext('2d').drawImage(flowSprite(m.key), 0, 0, 72, 72);
      const cell = document.createElement('div'); cell.style.cssText = 'text-align:center;width:104px';
      cell.appendChild(c);
      cell.insertAdjacentHTML('beforeend', `<div style="font-size:10px;color:#cfc7a8;margin-top:4px">${m.key}</div>`);
      big.appendChild(cell);
    }
    wrap.insertAdjacentHTML('beforeend', `<div style="font-variant:small-caps;letter-spacing:.15em;color:#c9a25e;margin:18px 0 8px">the same paths, magnified</div>`);
    wrap.appendChild(big);
    document.body.appendChild(wrap);
  });
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${OUT}/1-flow-glyph-sheet.png` }); console.log('shot 1-flow-glyph-sheet');
  await p.evaluate(() => document.getElementById('glyphsheet').remove());

  /* the flows themselves, in each of the three dresses */
  for (const style of ['glyph', 'gold', 'medium']) {
    await p.evaluate(s => {
      SKIN.flow_style = s;
      document.getElementById('lyFlows').click();
      cam.z = 1.15; cam.x = 1250; cam.y = 690; clampCam();
    }, style);
    await p.waitForTimeout(1400);
    await p.screenshot({ path: `${OUT}/2-flows-${style}.png` }); console.log('shot 2-flows-' + style);
  }

  /* D3.2 the scaffold, D3.4 ribbon vs tablet */
  await p.evaluate(() => { document.getElementById('lyFlows').click(); document.getElementById('lyVision').click(); });
  await p.waitForTimeout(900);
  await p.evaluate(() => { const s = SCENE.structures.find(x => x.phase === 2); cam.z = 1.9; cam.x = s.x; cam.y = s.y; clampCam(); window.__ph2 = s.name; });
  await p.waitForTimeout(1100);
  await p.screenshot({ path: `${OUT}/3-scaffold-building.png` }); console.log('shot 3-scaffold-building', await p.evaluate(() => window.__ph2));
  await p.evaluate(() => { document.getElementById('lyNow').click(); cam.z = 1.3; cam.x = 1240; cam.y = 700; clampCam(); });
  for (const st of ['ribbon', 'tablet']) {
    await p.evaluate(s => { SKIN.label_style = s; applyDress(); }, st);
    await p.waitForTimeout(800);
    await p.screenshot({ path: `${OUT}/4-labels-${st}.png` }); console.log('shot 4-labels-' + st);
  }
  await p.evaluate(() => { SKIN.label_style = 'ribbon'; applyDress(); });
  console.log('pageerrors', perr.length, perr.slice(0, 2));
  await b.close();
})();
