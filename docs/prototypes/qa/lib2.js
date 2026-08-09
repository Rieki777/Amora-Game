const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SHOTS = '/root/qa/shots';
const ERRLOG = '/root/qa/errors.jsonl';
const FILE = process.env.GROUNDS_FILE || 'file:///root/qa/grounds-v0.html';
const ERRORS = [];

async function boot() {
  const browser = await chromium.launch({
    executablePath: process.env.PW_EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--allow-file-access-from-files', '--force-device-scale-factor=1', '--font-render-hinting=none'],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  const page = await ctx.newPage();
  // ---- listeners attached BEFORE navigation, kept for the whole session ----
  page.on('pageerror', e => {
    const rec = { kind: 'pageerror', text: e.message, stack: (e.stack || '').split('\n').slice(1, 3).join(' | '), t: Date.now() };
    ERRORS.push(rec); fs.appendFileSync(ERRLOG, JSON.stringify(rec) + '\n');
    console.log('\n!!!! PAGEERROR: ' + e.message + '\n     ' + rec.stack + '\n');
  });
  page.on('console', m => {
    if (m.type() === 'error') {
      const rec = { kind: 'console.error', text: m.text(), loc: JSON.stringify(m.location()), t: Date.now() };
      ERRORS.push(rec); fs.appendFileSync(ERRLOG, JSON.stringify(rec) + '\n');
      console.log('\n!!!! CONSOLE.ERROR: ' + m.text() + '\n');
    }
  });
  page.on('requestfailed', r => {
    const rec = { kind: 'requestfailed', text: r.url().slice(0, 100) + ' :: ' + ((r.failure() || {}).errorText) };
    ERRORS.push(rec); fs.appendFileSync(ERRLOG, JSON.stringify(rec) + '\n');
  });
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForFunction(() => window.satPlate !== undefined || true);
  await page.waitForTimeout(2500); // decode satellite + painted plates + 28 sprites
  return { browser, ctx, page };
}

const mk = (page) => {
  const H = {
    errors: ERRORS,
    shot: async (name) => { await page.screenshot({ path: path.join(SHOTS, name + '.png') }); return name + '.png'; },
    ev: (fn, arg) => page.evaluate(fn, arg),
    cam: () => page.evaluate(() => ({ x: +cam.x.toFixed(1), y: +cam.y.toFixed(1), z: +cam.z.toFixed(3), travel: !!travel, mode, iconMode, terrainMode, dayPhase: +dayPhase.toFixed(2), build: buildMode, n: SCENE.structures.length })),
    poiBox: (k) => page.evaluate(k => { const el = pEls[k]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, disp: getComputedStyle(el).display }; }, k),
    // park the camera on a structure so its icon is reachable (same effect as the user panning there)
    center: async (k, z) => { await page.evaluate(([k, z]) => { const s = BY[k]; if (!s) return; travel = null; cam.x = s.x; cam.y = s.y; if (z) cam.z = z; else if (cam.z < 1.2) cam.z = 1.2; cam.vx = cam.vy = 0; clampCam(); }, [k, z]); await page.waitForTimeout(350); },
    // is the icon's centre actually the topmost hit target right now?
    poiHit: (k) => page.evaluate(k => {
      const el = pEls[k]; if (!el) return null;
      const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const inv = x > 4 && y > 4 && x < innerWidth - 4 && y < innerHeight - 4;
      const top = inv ? document.elementFromPoint(x, y) : null;
      return { x, y, inv, ok: !!(top && (top === el || el.contains(top))), top: top ? ('#' + (top.id || '') + '.' + (typeof top.className === 'string' ? top.className : '')) : null, disp: getComputedStyle(el).display };
    }, k),
    reachPoi: async (k) => {
      let h = await H.poiHit(k); if (!h) throw new Error('no poi ' + k);
      if (!h.ok) { await H.center(k); h = await H.poiHit(k); }
      if (!h.ok) { await H.center(k, 1.6); h = await H.poiHit(k); }
      return h;
    },
    clickPoi: async (k) => {
      const h = await H.reachPoi(k);
      if (!h.ok) throw new Error('poi ' + k + ' unreachable: ' + JSON.stringify(h));
      await page.mouse.click(h.x, h.y); await page.waitForTimeout(500); return h;
    },
    hoverPoi: async (k) => {
      const h = await H.reachPoi(k);
      await page.mouse.move(h.x, h.y); await page.waitForTimeout(320); return h;
    },
    maia: (n = 1) => page.evaluate(n => [...document.querySelectorAll('#maiaLog .mline')].slice(-n).map(d => d.textContent.replace(/\s+/g, ' ').trim()), n),
    maiaCount: () => page.evaluate(() => document.querySelectorAll('#maiaLog .mline').length),
    toasts: () => page.evaluate(() => [...document.querySelectorAll('#toasts .toast')].map(t => t.textContent.trim())),
    clearToasts: () => page.evaluate(() => document.querySelectorAll('#toasts .toast').forEach(t => t.remove())),
    blackEdge: () => page.evaluate(() => {
      const pts = [[2, 2], [innerWidth - 2, 2], [2, innerHeight - 2], [innerWidth - 2, innerHeight - 2], [innerWidth / 2, 2], [innerWidth / 2, innerHeight - 2], [2, innerHeight / 2], [innerWidth - 2, innerHeight / 2]];
      const out = []; for (const [px, py] of pts) { const [wx, wy] = screenToWorld(px, py); if (wx < -0.5 || wy < -0.5 || wx > W + 0.5 || wy > H + 0.5) out.push([px, py, Math.round(wx), Math.round(wy)]); } return out;
    }),
    // scan every *visible* text node for undefined/null/NaN/[object Object]
    badText: () => page.evaluate(() => {
      const hits = []; const it = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n; while ((n = it.nextNode())) {
        const v = n.nodeValue; if (!/\b(undefined|null|NaN)\b|\[object Object\]/.test(v)) continue;
        const el = n.parentElement; if (!el) continue;
        const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
        if (r.width === 0 && r.height === 0) continue; if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        hits.push({ txt: v.replace(/\s+/g, ' ').trim().slice(0, 110), where: '#' + (el.id || '') + '.' + (el.className || el.tagName) });
      }
      // attribute-level too (style="background:undefined")
      document.querySelectorAll('[style]').forEach(e => { if (/undefined|NaN/.test(e.getAttribute('style'))) hits.push({ txt: e.getAttribute('style').slice(0, 90), where: 'style@' + (e.id || e.className) }); });
      const cs = getComputedStyle(document.documentElement);
      ['--t-surface', '--t-ring', '--t-icon', '--t-accent', '--gold', '--gold-b', '--parch'].forEach(k => { const v = cs.getPropertyValue(k).trim(); if (!v || /undefined|NaN/.test(v)) hits.push({ txt: k + '=' + v, where: ':root' }); });
      return hits;
    }),
    rect: (sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), w: Math.round(r.width), h: Math.round(r.height), disp: getComputedStyle(e).display, op: getComputedStyle(e).opacity }; }, sel),
    topAt: (x, y) => page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? ('#' + (e.id || '') + '.' + (typeof e.className === 'string' ? e.className : '') + '<' + e.tagName + '>' + (e.textContent || '').slice(0, 30)) : null; }, [x, y]),
    canvasPx: (x, y) => page.evaluate(([x, y]) => { const c = document.getElementById('scene'); const g = c.getContext('2d'); const d = g.getImageData(Math.round(x * DPR), Math.round(y * DPR), 1, 1).data; return [d[0], d[1], d[2]]; }, [x, y]),
    mmHash: () => page.evaluate(() => { const c = document.getElementById('minimap'); const g = c.getContext('2d'); const d = g.getImageData(0, 0, 240, 160).data; let h = 0; for (let i = 0; i < d.length; i += 401) h = (h * 31 + d[i]) >>> 0; return h; }),
    // screen points that are bare canvas (not HUD, not an icon) — inside/outside the property line
    landPt: (inside, i) => page.evaluate(([inside, i]) => {
      const pts = [];
      for (let x = 20; x < innerWidth - 20; x += 11) for (let y = 20; y < innerHeight - 20; y += 9) {
        const e = document.elementFromPoint(x, y); if (!e || e.id !== 'scene') continue;
        const [wx, wy] = screenToWorld(x, y); if (inBound(wx, wy) !== !!inside) continue;
        pts.push([x, y]);
      }
      return pts.length ? pts[(i * 5779) % pts.length] : null;
    }, [inside, i || 0]),
    closeInspect: async () => { if (await page.evaluate(() => document.getElementById('inspect').classList.contains('open'))) { await page.click('#inspClose'); await page.waitForTimeout(320); } },
    closePanel: async () => { if (await page.evaluate(() => document.getElementById('panel').classList.contains('open'))) { await page.click('#panelClose'); await page.waitForTimeout(420); } },
    wait: (ms) => page.waitForTimeout(ms),
    log: (...a) => console.log(...a),
  };
  return H;
};

module.exports = { boot, mk, ERRORS, SHOTS };
