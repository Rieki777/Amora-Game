/* L8 probe: the help sheet across portrait AND landscape pockets.
   Scratch. Drives the REAL button and measures the REAL element rects. */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE;
const EXE = process.env.PW_EXE;

const VIEWS = [
  ['iPhone12 portrait', 390, 844],
  ['iPhone12 LANDSCAPE', 844, 390],
  ['iPhoneSE portrait', 375, 667],
  ['iPhoneSE LANDSCAPE', 667, 375],
  ['Pixel5 portrait', 393, 851],
  ['Pixel5 LANDSCAPE', 851, 393],
  ['GalaxyS8 LANDSCAPE', 740, 360],
  ['iPhone14PM LANDSCAPE', 932, 430],
  ['iPadMini LANDSCAPE', 1024, 768],
];

const M = () => ({
  vw: innerWidth, vh: innerHeight,
  pocket: document.body.classList.contains('pocket'),
  over: document.body.dataset.bandOverflow || '0',
  bhelp: getComputedStyle(document.documentElement).getPropertyValue('--band-b-help').trim() || 'UNSET',
  box: (() => {
    const o = {};
    for (const id of ['help', 'pbar', 'vitals', 'maia', 'walkCard', 'toasts', 'pdrawer', 'panel']) {
      const el = document.getElementById(id); if (!el) { o[id] = null; continue }
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      o[id] = { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), rt: Math.round(r.right), h: Math.round(r.height), disp: cs.display, vis: cs.visibility, op: cs.opacity };
    }
    return o;
  })(),
  rows: document.querySelectorAll('#help .help-row').length,
  list: (() => { const l = document.querySelector('#help .help-list'); if (!l) return null; const r = l.getBoundingClientRect(); return { h: Math.round(r.height), sh: l.scrollHeight, ch: l.clientHeight, scrollable: l.scrollHeight > l.clientHeight + 1 } })(),
  head: (() => { const h = document.querySelector('#help .help-head'); if (!h) return null; const r = h.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom) } })(),
  work: (() => { const w = document.querySelector('#help .help-work'); if (!w) return null; const r = w.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom) } })(),
});

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--allow-file-access-from-files', '--force-device-scale-factor=1'] });
  for (const [name, w, h] of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(FILE, { waitUntil: 'load' });
    await page.waitForTimeout(2200);
    await page.evaluate(() => { if (typeof leaveIntro === 'function') leaveIntro() });
    await page.waitForTimeout(900);
    const closed = await page.evaluate(M);
    // real tap on the real button
    const btn = await page.evaluate(() => { const b = document.getElementById('pbAttn'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, disp: getComputedStyle(b).display } });
    let open = null, tapped = false;
    if (btn && btn.disp !== 'none') { await page.touchscreen.tap(btn.x, btn.y); await page.waitForTimeout(700); tapped = true; open = await page.evaluate(M) }
    console.log('\n===== ' + name + ' ' + w + 'x' + h + ' =====');
    console.log(' pbAttn:', JSON.stringify(btn), 'tapped=' + tapped);
    console.log(' CLOSED pocket=' + closed.pocket + ' over=' + closed.over + ' b-help=' + closed.bhelp);
    if (open) {
      console.log(' OPEN   pocket=' + open.pocket + ' over=' + open.over + ' b-help=' + open.bhelp + ' rows=' + open.rows);
      console.log('  help  ', JSON.stringify(open.box.help));
      console.log('  pbar  ', JSON.stringify(open.box.pbar));
      console.log('  vitals', JSON.stringify(open.box.vitals));
      console.log('  list  ', JSON.stringify(open.list), ' head', JSON.stringify(open.head), ' work', JSON.stringify(open.work));
      const H = open.box.help;
      const flags = [];
      if (H) {
        if (H.t < 0) flags.push('HELP TOP OFF SCREEN t=' + H.t);
        if (H.b > open.vh) flags.push('HELP BOTTOM OFF SCREEN b=' + H.b + ' vh=' + open.vh);
        if (open.box.vitals && open.box.vitals.disp !== 'none' && H.t < open.box.vitals.b) flags.push('HELP UNDER VITALS BAR (' + H.t + ' < ' + open.box.vitals.b + ')');
        if (open.box.pbar && open.box.pbar.disp !== 'none' && H.b > open.box.pbar.t) flags.push('HELP OVER TAB BAR (' + H.b + ' > ' + open.box.pbar.t + ')');
        if (open.head && open.work && open.work.t < open.head.b) flags.push('HEAD/WORK COLLAPSED');
        if (open.list && open.list.ch <= 0) flags.push('LIST ZERO HEIGHT');
        if (open.rows === 0) flags.push('ZERO ROWS');
      } else flags.push('NO #help');
      console.log(flags.length ? '  >>> ' + flags.join(' | ') : '  ok');
    }
    if (errs.length) console.log(' PAGEERRORS: ' + errs.join(' ; '));
    await ctx.close();
  }
  await browser.close();
})();
