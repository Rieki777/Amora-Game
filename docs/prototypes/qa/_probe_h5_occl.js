/* RECON: is a satellite the lens draws actually ON SCREEN for a person.
 *
 * Measures the COMPOSITED page (page.screenshot flattens the canvas under
 * #icons the way a person sees it), never a scratch canvas. The camera is
 * centred on each home in turn, so nothing is scored while it is off the
 * viewport, and each satellite's box is diffed lens-on against lens-off. A
 * satellite the sprite covers changes nothing.
 *
 *   Z=2.0 node qa/_probe_h5_occl.js
 */
const { chromium } = require('playwright');
const sharp = require('sharp');
const FILE = process.env.GROUNDS_FILE;
const EXE = process.env.PW_EXE;
const Z = +(process.env.Z || 2.0);
const BOX = +(process.env.BOX || 7);   // half-width, so 15x15 at 7

const raw = async (buf) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return { d: data, w: info.width, h: info.height, ch: info.channels };
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1000 } });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERROR ' + e));
  await page.goto(FILE);
  await page.waitForTimeout(1100);
  await page.click('#enterBtn');
  await page.waitForTimeout(2600);

  await page.evaluate((z) => { cam.z = z; }, Z);
  await page.waitForTimeout(600);
  console.log('cam', JSON.stringify(await page.evaluate(() => ({ z: cam.z, DPR, iconMode }))));

  /* Sprite geometry off the LIVE DOM: the element that occludes, measured. */
  const geom = await page.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
    const out = [];
    for (const s of SCENE.structures) {
      const p = document.querySelector('.poi[data-k="' + s.key + '"]');
      if (!p || p.style.display === 'none') continue;
      const img = p.querySelector('.sprite');
      const vis = img && getComputedStyle(img).display !== 'none' ? img : null;
      const r = (vis || p).getBoundingClientRect();
      const [ax, ay] = worldToScreen(s.x, s.y);
      const cx = ax / DPR, cy = ay / DPR;
      out.push({
        k: s.key, painted: !!vis,
        w: (r.right - r.left) / 2 / cam.z, up: (cy - r.top) / cam.z, down: (r.bottom - cy) / cam.z,
      });
    }
    return res(out);
  }))));
  const homes = await page.evaluate(() => roleHomes('now').map(h => ({ k: h.k, r: +h.r.toFixed(2) })));
  const hr = {}; homes.forEach(h => hr[h.k] = h.r);
  console.log('\n  key           painted   halfW   up   down   halo r');
  for (const g of geom.filter(g => hr[g.k] !== undefined).sort((a, b) => a.k < b.k ? -1 : 1))
    console.log('  ' + g.k.padEnd(14) + String(g.painted).padEnd(8) +
      [g.w, g.up, g.down].map(v => v.toFixed(1).padStart(6) + ' ').join('') + hr[g.k]);

  /* Instrumentation from OUTSIDE the artifact: roleSat is a column-0 function
     declaration, so it is a property of the global object and the bare
     identifier inside roleLens resolves through it. */
  await page.evaluate(() => {
    if (window.__satlog) return;
    const inner = window.roleSat; window.__satlog = [];
    window.roleSat = function (cx, px, py) {
      if (cx && cx.canvas && (cx.canvas.id === 'scene' || cx.canvas.id === 'lens')) {
        const [sx, sy] = worldToScreen(px, py);
        window.__satlog.push({ sx: sx / DPR, sy: sy / DPR });
      }
      return inner.apply(this, arguments);
    };
    if (!orgOn) document.getElementById('lyOrg').click();
  });
  await page.waitForTimeout(600);

  // one camera per home, so nothing is scored while it is off the viewport
  const perHome = await page.evaluate(() => {
    const by = roleSeatsBy(), out = [];
    for (const k of Object.keys(by)) out.push({ k, seats: by[k].map(x => x.s) });
    return out;
  });

  console.log('\n  chg%   home          seat');
  const rows = [];
  for (const h of perHome) {
    await page.evaluate((k) => { cam.x = BY[k].x; cam.y = BY[k].y; window.__satlog.length = 0; }, h.k);
    await page.waitForTimeout(450);
    const pts = await page.evaluate((k) => {
      const seen = window.__satlog.slice(-999);
      // keep only the ones this building drew, by matching against its own ring
      const s = BY[k], out = [];
      for (const p of seen) { const key = p.sx.toFixed(1) + ',' + p.sy.toFixed(1); if (out.indexOf(key) < 0) out.push(key); }
      const uniq = out.map(t => ({ sx: +t.split(',')[0], sy: +t.split(',')[1] }));
      const [ax, ay] = worldToScreen(s.x, s.y);
      const cx = ax / DPR, cy = ay / DPR;
      return uniq.filter(p => Math.hypot(p.sx - cx, p.sy - cy) < 300 * cam.z)
        .sort((a, b) => (a.sx - b.sx) || (a.sy - b.sy));
    }, h.k);
    const on = await raw(await page.screenshot());
    await page.evaluate(() => { document.getElementById('lyOrg').click(); });
    await page.waitForTimeout(420);
    const off = await raw(await page.screenshot());
    await page.evaluate(() => { document.getElementById('lyOrg').click(); });
    await page.waitForTimeout(300);
    pts.forEach((p, i) => {
      let diff = 0, tot = 0;
      for (let dy = -BOX; dy <= BOX; dy++) for (let dx = -BOX; dx <= BOX; dx++) {
        const x = Math.round(p.sx + dx), y = Math.round(p.sy + dy);
        if (x < 0 || y < 0 || x >= on.w || y >= on.h) continue;
        const j = (y * on.w + x) * on.ch; tot++;
        if (Math.abs(on.d[j] - off.d[j]) > 8 || Math.abs(on.d[j + 1] - off.d[j + 1]) > 8 ||
          Math.abs(on.d[j + 2] - off.d[j + 2]) > 8) diff++;
      }
      rows.push({ p: tot ? diff / tot : 0, home: h.k, seat: h.seats[i] || ('#' + i) });
    });
  }
  rows.sort((a, b) => a.p - b.p);
  for (const r of rows) console.log('  ' + (100 * r.p).toFixed(0).padStart(4) + '%  ' + String(r.home).padEnd(14) + r.seat);
  console.log('\n  invisible (<20%) =', rows.filter(r => r.p < 0.2).length, 'of', rows.length);
  await browser.close();
})();
