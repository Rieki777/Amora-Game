/* _probe_l8_adv.js — the adversarial sweep the L8 gate does not do.
 *
 * Five questions the gate cannot answer, asked against the REAL page:
 *   A. globals: what this lane added to window, ENUMERATED against the pristine
 *      base, never grepped — a function at column 0 becomes a window global by
 *      declaration and no grep for `window.x=` will find it.
 *   B. convergence: publishing a cap that shrinks a tenant could make the band
 *      lay out forever. Counted, not reasoned about.
 *   C. a landscape phone SHORTER than anything in the sweep (568x320, an
 *      iPhone SE held sideways): does the published room collapse the sheet to
 *      nothing?
 *   D. a village with no conversations at all.
 *   E. a hostile PLACE NAME — the one string in the row the gate's payload
 *      never reaches, because PLANT only poisons forum_threads.
 *
 *   cd docs/prototypes/qa && source ./env.sh && \
 *     BASE_FILE="file:///C:/.../L8BASE/grounds-v0.html" node _probe_l8_adv.js
 */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE, BASE = process.env.BASE_FILE, EXE = process.env.PW_EXE;

const boot = async (browser, w, h, touch) => {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { if (typeof leaveIntro === 'function') leaveIntro() });
  await page.waitForTimeout(900);
  return { ctx, page, errs };
};
const tap = async (page, id) => {
  const b = await page.evaluate(i => {
    const e = document.getElementById(i); if (!e) return null;
    const r = e.getBoundingClientRect(); return r.width < 2 ? null : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, id);
  if (!b) return false;
  await page.touchscreen.tap(b.x, b.y); await page.waitForTimeout(800); return true;
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--allow-file-access-from-files', '--force-device-scale-factor=1'] });

  /* ---- A. globals, ENUMERATED ------------------------------------------- */
  const names = async url => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const p = await ctx.newPage(); await p.goto(url, { waitUntil: 'load' }); await p.waitForTimeout(2400);
    const n = await p.evaluate(() => Object.getOwnPropertyNames(window).slice().sort());
    await ctx.close(); return n;
  };
  const nb = await names(BASE), nl = await names(FILE);
  const added = nl.filter(x => !nb.includes(x)), gone = nb.filter(x => !nl.includes(x));
  console.log('A  globals  base=' + nb.length + '  lane=' + nl.length
    + '\n   added:   ' + (added.join(' ') || '(none)')
    + '\n   removed: ' + (gone.join(' ') || '(none)'));

  /* ---- B. convergence, COUNTED ------------------------------------------ */
  {
    const { ctx, page, errs } = await boot(browser, 844, 390, true);
    await page.evaluate(() => {
      window.__BL = 0; const f = window.bandLayout || bandLayout;
      window.bandLayout = function () { window.__BL++; return f.apply(this, arguments) };
      try { bandLayout = window.bandLayout } catch (e) { }
    });
    await page.waitForTimeout(1500);
    const before = await page.evaluate(() => window.__BL);
    await tap(page, 'pbAttn');
    const t1 = await page.evaluate(() => window.__BL);
    await page.waitForTimeout(3000);
    const t2 = await page.evaluate(() => window.__BL);
    const st = await page.evaluate(() => ({
      cap: getComputedStyle(document.documentElement).getPropertyValue('--band-b-help-max').trim(),
      h: Math.round(document.getElementById('help').getBoundingClientRect().height),
      hooked: typeof window.bandLayout === 'function'
    }));
    console.log('B  844x390 bandLayout calls: idle=' + before + '  at-open=' + t1 + '  +3s=' + t2
      + '   open cost=' + (t1 - before) + '  settled delta=' + (t2 - t1)
      + '  cap=' + st.cap + ' help.h=' + st.h + ' hooked=' + st.hooked
      + '  errs=' + (errs.join(';') || 'none'));
    await ctx.close();
  }

  /* ---- C. shorter than the sweep ---------------------------------------- */
  for (const [w, h] of [[568, 320], [640, 360], [800, 360]]) {
    const { ctx, page, errs } = await boot(browser, w, h, true);
    const tapped = await tap(page, 'pbAttn');
    const r = await page.evaluate(() => {
      const el = document.getElementById('help'); if (!el) return null;
      const rc = e => { const q = e.getBoundingClientRect(); return { t: Math.round(q.top), b: Math.round(q.bottom), h: Math.round(q.height) } };
      const list = el.querySelector('.help-list');
      const hit = sel => {
        const t = el.querySelector(sel); if (!t) return 'missing';
        const q = t.getBoundingClientRect();
        const top = document.elementFromPoint(Math.round(q.left + q.width / 2), Math.round(q.top + q.height / 2));
        return top && top.closest && top.closest('#help') ? 'help' : ('#' + (top ? (top.id || top.className) : 'nothing'));
      };
      const wk = document.getElementById('walkCard');
      return {
        vh: innerHeight, show: el.classList.contains('show'), box: rc(el),
        listH: list ? list.clientHeight : null,
        cap: getComputedStyle(document.documentElement).getPropertyValue('--band-b-help-max').trim() || null,
        over: document.body.dataset.bandOverflow || null,
        rows: el.querySelectorAll('.help-row').length,
        walk: wk && getComputedStyle(wk).display !== 'none' ? rc(wk) : null,
        title: hit('.help-head h4'), close: hit('.help-close'), work: hit('.help-work .help-wall')
      };
    });
    console.log('C  ' + w + 'x' + h + '  tapped=' + tapped + '  ' + JSON.stringify(r) + '  errs=' + (errs.join(';') || 'none'));
    await ctx.close();
  }

  /* ---- D. a village with nothing said in it ------------------------------ */
  {
    const { ctx, page, errs } = await boot(browser, 390, 844, true);
    await page.evaluate(() => { const J = buildExportJSON(); J.forum_threads = []; restoreScene(J) });
    const tapped = await tap(page, 'pbAttn');
    const r = await page.evaluate(() => {
      const el = document.getElementById('help'), b = document.getElementById('pbBadge');
      return {
        threads: SCENE.threads.length, rows: el.querySelectorAll('.help-row').length,
        text: (el.textContent || '').slice(0, 130),
        badge: b ? b.textContent : null, badgeDisp: b ? getComputedStyle(b).display : null
      };
    });
    console.log('D  empty village  tapped=' + tapped + '  ' + JSON.stringify(r) + '  errs=' + (errs.join(';') || 'none'));
    await ctx.close();
  }

  /* ---- E. a hostile PLACE NAME ------------------------------------------ */
  {
    const { ctx, page, errs } = await boot(browser, 390, 844, true);
    const P = '<img src="x" data-xss="placename" onerror="window.__XSS=1">';
    const landed = await page.evaluate(p => {
      const J = buildExportJSON();
      const s = J.map_structures.find(x => x.key === 'council') || J.map_structures[0];
      s.name = p;
      J.forum_threads = [{ id: 'n1', title: 'ordinary', structure_keys: [s.key], author: 'Sol', audience: 'member', replies: 2, last_activity: '1h', excerpt: 'x' }];
      restoreScene(J);
      return { key: s.key, nameInBY: (typeof BY !== 'undefined' && BY[s.key]) ? BY[s.key].name : null };
    }, P);
    await tap(page, 'pbAttn');
    const r = await page.evaluate(() => {
      const el = document.getElementById('help');
      const row = el.querySelector('.help-row'); if (row) row.click();
      return {
        injectedInHelp: el.querySelectorAll('[data-xss]').length,
        injectedInDoc: document.querySelectorAll('[data-xss]').length,
        fired: typeof window.__XSS === 'undefined' ? null : window.__XSS,
        text: (el.textContent || '').slice(0, 300)
      };
    });
    console.log('E  hostile place name  landed=' + JSON.stringify(landed) + '\n   ' + JSON.stringify(r) + '  errs=' + (errs.join(';') || 'none'));
    await ctx.close();
  }

  await browser.close();
})().catch(e => { console.log('PROBE THREW: ' + e.message + '\n' + e.stack); process.exit(2) });
