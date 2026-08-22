/* R5 / MASK - the driven probe for the merged panel, the pocket sheet, the
 * personal size dial, the paint gate, the ways out, and the tap that opens a
 * building's door.
 *
 * WHY IT DRIVES INSTEAD OF READING. Three findings in a row on this artifact
 * only appeared under real touch at a real phone viewport, and a probe that
 * asks a page about itself would have missed every one. So: CDP
 * `Input.dispatchTouchEvent`, which is trusted input (the browser arbitrates
 * the gesture, honours `touch-action` and generates the pointer stream), at
 * 390x844 with hasTouch, and THE VIEWPORT IS PROVED FROM THE PAYLOAD before a
 * single assertion runs. `resize_window` has silently stayed desktop in this
 * program, and a screenshot that is secretly 1280 wide is worse than none.
 *
 * hasTouch alone, never isMobile: isMobile makes this Chromium report
 * innerWidth 1560 for a 390 CSS px viewport and every coordinate below would
 * then be measured against a lie.
 *
 * A CONTROL THAT LOOKS VISIBLE IS NOT A CONTROL YOU CAN PRESS. A sibling lane
 * reported a clean pass on a button whose centre `elementFromPoint` resolved
 * to somebody else's sheet, because display, opacity and the rectangle all
 * pass for a covered button. Every tappable assertion here asks the browser
 * WHO WOULD RECEIVE THE TAP, and the pocket section taps for real on top of
 * that.
 *
 * BEFORE / AFTER on the same harness:
 *   source ./env.sh && node _probe_r5_mask.js
 *   GROUNDS_FILE="file:///.../pristine.html" node _probe_r5_mask.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FILE = process.env.GROUNDS_FILE || 'file:///root/amora/work/grounds-v0.html';
const EXE = process.env.PW_EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
/* docs/prototypes/.qa-out is the directory .gitignore already covers, and it
 * is the one env.sh points EXPORT_OUT at. Writing beside the suites instead
 * would leave screenshots staged for whoever runs `git add .` next. */
const SHOTS = process.env.MASK_SHOTS || path.join(__dirname, '..', '.qa-out', 'mask');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS ' + m); } else { fail++; console.log('FAIL ' + m); } };
const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[(s.length - 1) >> 1] : 0; };

async function boot(browser, { pocket, w = 390, h = 844, touch = true, keep = null }) {
  const ctx = await browser.newContext({
    viewport: { width: w, height: h }, hasTouch: touch, deviceScaleFactor: touch ? 3 : 1,
  });
  await ctx.addInitScript((seed) => {
    try {
      localStorage.setItem('amora-walk-done', '1');
      localStorage.setItem('amora-gestures-seen', '1');
      if (seed) localStorage.setItem('amora-map-mask', seed);
    } catch (_) { /* some hosts refuse storage on a file: origin */ }
  }, keep);
  const page = await ctx.newPage();
  const perr = [];
  page.on('pageerror', e => perr.push(String(e)));
  await page.goto(FILE + (pocket ? '#hud=pocket' : '#hud=desk'));
  await page.waitForTimeout(2400);
  if (await page.evaluate(() => document.body.classList.contains('intro'))) {
    await page.click('#enterBtn').catch(() => {});
    await page.waitForTimeout(1400);
  }
  return { ctx, page, perr };
}

/* Who would actually receive a tap at the centre of this element. */
const reachable = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return { found: false };
  const r = el.getBoundingClientRect();
  if (!r.width || !r.height) return { found: true, sized: false };
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const onScreen = cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight;
  const hit = document.elementFromPoint(cx, cy);
  return {
    found: true, sized: true, onScreen, w: Math.round(r.width), h: Math.round(r.height),
    top: Math.round(r.top), bottom: Math.round(r.bottom),
    mine: !!(hit && (hit === el || el.contains(hit) || (hit.closest && hit.closest(s)))),
    blocker: hit ? hit.tagName + '.' + (hit.getAttribute('class') || '') : 'null',
  };
}, sel);

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  console.log('artifact: ' + FILE + '\n');

  /* ============================================================ A. POCKET */
  {
    const { ctx, page, perr } = await boot(browser, { pocket: true });

    const vp = await page.evaluate(() => ({
      iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio,
      pts: navigator.maxTouchPoints, touch: 'ontouchstart' in window,
      pocket: document.body.classList.contains('pocket'),
    }));
    console.log('PROVEN VIEWPORT ' + JSON.stringify(vp));
    ok(vp.iw === 390 && vp.ih === 844 && vp.pts >= 1 && vp.touch && vp.pocket,
      `viewport is a phone and the map knows it (${vp.iw}x${vp.ih}, touch ${vp.pts}, pocket ${vp.pocket})`);

    const cdp = await ctx.newCDPSession(page);
    const tap = async (x, y) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      await page.waitForTimeout(70);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(650);
    };

    /* ---- A1. the artwork is the door -------------------------------------
     * The roof of a building is what a person aims at and it used to sit
     * outside every box that took a tap. Up to two taps at the SAME point,
     * because a building carrying two or more marks fans them on the first
     * tap by design (#icons capture, and that behaviour is deliberate). */
    await page.evaluate(() => {
      window.__opened = null;
      const op = window.openPanel;
      window.openPanel = function (...a) { window.__opened = a[0]; return op.apply(this, a); };
    });
    const keys = await page.evaluate(() =>
      SCENE.structures.filter(s => s.state !== 'blueprint').slice(0, 6).map(s => s.key));
    const roofs = [];
    for (const k of keys) {
      await page.evaluate((kk) => {
        const s = BY[kk]; travel = null; cam.vx = cam.vy = 0;
        cam.x = s.x; cam.y = s.y; cam.z = 1.2; clampCam();
        document.getElementById('panel').classList.remove('open');
        /* A home opens its own module sheet (homeSheet), which then covers the
         * land for the NEXT building. Clear every overlay, not only #panel. */
        for (const o of ['module', 'attnCard', 'skin', 'wall', 'help'])
          if (document.getElementById(o)) document.getElementById(o).classList.remove('show');
        document.getElementById('pdrawer').classList.remove('open');
        if (typeof panelKey !== 'undefined') panelKey = null;
        window.__opened = null;
      }, k);
      await page.waitForTimeout(900);
      /* The upper quarter of the visible artwork: the roof, and the part that
       * measured 17 px clear of the old hit box. */
      const pt = await page.evaluate((kk) => {
        const el = pEls[kk];
        const a = [...el.querySelectorAll('.sprite,.sprite-wip')]
          .find(x => getComputedStyle(x).display !== 'none');
        if (!a) return null;
        const r = a.getBoundingClientRect(), b = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * 0.22, clear: Math.round(b.top - r.top) };
      }, k);
      if (!pt) continue;
      /* WHO IS ON TOP OF THAT PIXEL, read on a clean map BEFORE any tap. Read
       * afterwards it reports whatever the taps opened, which is how the first
       * run of this probe blamed a module sheet for a badge. */
      const top = await page.evaluate(([x, y, kk]) => {
        const e = document.elementFromPoint(x, y); if (!e) return { what: 'nothing' };
        const seal = e.closest && (e.closest('.bseal') || e.closest('.bk'));
        const poi = e.closest && e.closest('.poi');
        if (seal) return { what: 'a badge', mine: false, badge: true };
        if (poi) return { what: 'the hit box of ' + poi.dataset.k, mine: poi.dataset.k === kk };
        return { what: e.tagName + '.' + (e.getAttribute('class') || ''), canvas: e.tagName === 'CANVAS' };
      }, [pt.x, pt.y, k]);
      let taps = 0, got = null;
      for (let i = 0; i < 3 && got !== k; i++) { await tap(pt.x, pt.y); taps++; got = await page.evaluate(() => window.__opened); }
      /* On a miss, say WHO took the tap. A silent 5-of-6 is a number nobody can
       * act on; "a neighbour's badge was on top of it" is a finding. */
      roofs.push({ k, got, taps, clear: pt.clear, top });
    }
    const rightDoor = roofs.filter(r => r.got === r.k);
    /* A roof whose pixel belongs to somebody ELSE'S badge is not a dead roof.
     * #badges is z-index 12 over #icons at 10 and a badge hit target is 44 px
     * by the accessibility floor, so a mark genuinely under the thumb winning
     * the tap is the mark doing its job. What must never happen again is a
     * roof over BARE CANVAS opening nothing. */
    const badged = roofs.filter(r => r.got !== r.k && r.top.badge);
    const dead = roofs.filter(r => r.got !== r.k && !r.top.badge);
    console.log('  roof taps: ' + roofs.map(r =>
      `${r.k}=${r.got || 'nothing'}(${r.taps} tap${r.taps > 1 ? 's' : ''}, on top: ${r.top.what})`).join('\n             '));
    ok(roofs.length >= 4 && dead.length === 0,
      `A1: no building's roof is dead any more (${rightDoor.length}/${roofs.length} open their own door, ${badged.length} covered by a neighbour's badge, ${dead.length} opening nothing; the art stands ${med(roofs.map(r => r.clear))} px clear of the old hit box)`);
    ok(rightDoor.length >= roofs.length - 1,
      `A1: and the roof that a person aims at is that building's own door (${rightDoor.length}/${roofs.length})`);

    /* ---- A2. the mask is reachable from the drawer ---------------------- */
    const bar = await reachable(page, '#pbMore');
    ok(bar.mine, `A2: the drawer button takes a tap (${bar.blocker})`);
    /* Its MEASURED centre. A hardcoded x on a five-cell bar lands on a
     * neighbour, and this probe did exactly that on its first run. */
    const morePt = await page.evaluate(() => {
      const r = document.getElementById('pbMore').getBoundingClientRect();
      return [r.left + r.width / 2, r.top + r.height / 2];
    });
    await tap(morePt[0], morePt[1]);
    await page.waitForTimeout(500);
    const cell = await reachable(page, '#pdrawer [data-pa="mask"]');
    ok(cell.found && cell.sized && cell.onScreen && cell.mine && cell.h >= 44,
      `A2: the drawer carries a door to your view, ${cell.h} px tall, and it takes a tap (${cell.blocker})`);
    if (cell.found && cell.sized) {
      const cellPt = await page.evaluate(() => {
        const e = document.querySelector('#pdrawer [data-pa="mask"]'); const r = e.getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      });
      await tap(cellPt[0], cellPt[1]);
    }
    await page.waitForTimeout(700);

    const sheet = await page.evaluate(() => {
      const el = document.getElementById('skin'); const r = el.getBoundingClientRect();
      return {
        show: el.classList.contains('show'),
        onScreen: r.top < innerHeight - 100 && r.bottom > 0,
        top: Math.round(r.top), bottom: Math.round(r.bottom), w: Math.round(r.width),
        drawerShut: !document.getElementById('pdrawer').classList.contains('open'),
        scrolls: getComputedStyle(el).overflowY === 'auto',
      };
    });
    ok(sheet.show && sheet.onScreen && sheet.w >= 380,
      `A2: the merged panel opens as a full-width sheet on a phone (top ${sheet.top}, ${sheet.w} px wide)`);
    ok(sheet.drawerShut, 'A2: opening it puts the drawer away, so one sheet is up at a time');
    await page.screenshot({ path: path.join(SHOTS, 'pocket-mask-sheet.png') });

    /* ---- A3. every control in the sheet would receive a tap ------------- */
    const ctrls = await page.evaluate(() => {
      const out = [];
      const sk = document.getElementById('skin');
      const sr = sk.getBoundingClientRect();
      for (const el of sk.querySelectorAll('input,select,button,.swb,.chip')) {
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        /* Only judge what is inside the SHEET's own visible box right now.
         * Anything scrolled past its edge is reachable by scrolling and is a
         * different question from being covered. */
        if (cy < Math.max(0, sr.top) || cy > Math.min(innerHeight, sr.bottom)) continue;
        const hit = document.elementFromPoint(cx, cy);
        out.push({
          id: el.id || el.className, w: Math.round(r.width), h: Math.round(r.height),
          small: Math.min(r.width, r.height) < 40,
          mine: !!(hit && (hit === el || el.contains(hit) || hit.closest('#skin') === sk)),
          blocker: hit ? (hit.id || hit.tagName) : 'null',
        });
      }
      return out;
    });
    const stolen = ctrls.filter(c => !c.mine);
    ok(ctrls.length > 6 && stolen.length === 0,
      `A3: every visible control in the sheet would receive its own tap (${ctrls.length} checked, ${stolen.length} covered${stolen.length ? ': ' + stolen.map(s => s.id + '<-' + s.blocker).join(',') : ''})`);
    const tiny = ctrls.filter(c => c.small);
    ok(tiny.length === 0,
      `A3: no control in the sheet is under 40 px on its short side (${tiny.length}${tiny.length ? ': ' + tiny.map(t => `${t.id} ${t.w}x${t.h}`).join(', ') : ''})`);

    /* ---- A4. the size dial moves buildings and it keeps ----------------- */
    const before = await page.evaluate(() => {
      const a = [...pEls[SCENE.structures[0].key].querySelectorAll('.sprite,.sprite-wip')]
        .find(x => getComputedStyle(x).display !== 'none');
      return { gs: window.GSCALE, h: a ? Math.round(a.getBoundingClientRect().height) : 0 };
    });
    await page.evaluate(() => {
      const s = document.getElementById('skGS');
      s.value = 210;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await page.waitForTimeout(700);
    const after = await page.evaluate(() => {
      const a = [...pEls[SCENE.structures[0].key].querySelectorAll('.sprite,.sprite-wip')]
        .find(x => getComputedStyle(x).display !== 'none');
      return {
        gs: window.GSCALE, h: a ? Math.round(a.getBoundingClientRect().height) : 0,
        stored: (() => { try { return JSON.parse(localStorage.getItem('amora-map-mask') || '{}'); } catch (_) { return {}; } })(),
        edits: EDITS.filter(e => e.diff && e.diff.global_scale != null).length,
      };
    });
    ok(after.gs === 2.1 && after.h > before.h * 1.5,
      `A4: the size dial makes the buildings bigger on screen (${before.h} px to ${after.h} px)`);
    ok(after.stored.scale === 210, `A4: it is written into this browser's own mask (${JSON.stringify(after.stored)})`);
    ok(after.edits === 0, `A4: and it writes NOTHING into the village's shared edit log (${after.edits} entries)`);
    await page.screenshot({ path: path.join(SHOTS, 'pocket-scale-210.png') });
    await ctx.close();

    /* ---- A5. and it is still there after a reload ----------------------- */
    const b2 = await boot(browser, { pocket: true, keep: JSON.stringify({ scale: 210 }) });
    const kept = await b2.page.evaluate(() => ({
      gs: window.GSCALE, dial: +document.getElementById('skGS').value,
      css: getComputedStyle(document.documentElement).getPropertyValue('--gScale').trim(),
    }));
    ok(kept.gs === 2.1 && kept.dial === 210 && kept.css === '2.1',
      `A5: the mask survives a reload (GSCALE ${kept.gs}, dial ${kept.dial}, --gScale ${kept.css})`);
    ok(b2.perr.length === 0, `A5: zero page errors on the pocket profile (${b2.perr.length})`);
    await b2.ctx.close();
    ok(perr.length === 0, `A: zero page errors while driving the phone (${perr.length})`);
  }

  /* ============================================================ B. DESKTOP */
  {
    const { ctx, page, perr } = await boot(browser, { pocket: false, w: 1280, h: 800, touch: false });
    const vp = await page.evaluate(() => ({ iw: innerWidth, ih: innerHeight, pocket: document.body.classList.contains('pocket') }));
    console.log('\nPROVEN VIEWPORT ' + JSON.stringify(vp));
    ok(vp.iw === 1280 && !vp.pocket, `B: desk profile at ${vp.iw}x${vp.ih}`);

    /* ---- B1. one button opens one room ---------------------------------- */
    await page.click('#themeBtn'); await page.waitForTimeout(500);
    const one = await page.evaluate(() => {
      const sk = document.getElementById('skin'), tp = document.getElementById('themePanel');
      return {
        open: sk.classList.contains('show'),
        nested: !!(tp && sk.contains(tp)),
        themeInside: !!sk.querySelector('#themeList, .swatchbtn'),
        skinInside: !!sk.querySelector('#skMedia'),
        panelsOnScreen: [...document.querySelectorAll('#skin,#themePanel')]
          .filter(e => e.getBoundingClientRect().width > 0).length,
        label: document.getElementById('themeBtn').textContent.trim(),
      };
    });
    ok(one.open && one.nested, `B1: one button opens one room, with the theme panel inside it (${one.label})`);
    ok(one.themeInside && one.skinInside, 'B1: both former panels\' controls are in that one room');

    /* ---- B2. nothing is offered twice ----------------------------------- */
    const dupes = await page.evaluate(() => {
      const vis = s => [...document.querySelectorAll(s)].filter(e => e.getBoundingClientRect().width > 0).length;
      return {
        scale: vis('#skGS') + vis('#gScale'),
        terrain: vis('#skTerr') + (vis('[data-tm]') ? 1 : 0),
        icon: vis('#skIcon') + (vis('[data-im]') ? 1 : 0),
        brush: vis('#skBrush') + vis('#pBrush'),
        words: vis('#skWords') + vis('#aiWords'),
        pickers: vis('#skTheme .swb') > 0 ? 1 : 0,
        swatchHosts: new Set([...document.querySelectorAll('.swatchbtn')].map(b => b.parentElement.id)).size,
      };
    });
    ok(dupes.scale === 1 && dupes.terrain === 1 && dupes.icon === 1 && dupes.words === 1,
      `B2: one control per setting (scale ${dupes.scale}, terrain ${dupes.terrain}, icon ${dupes.icon}, words ${dupes.words})`);
    ok(dupes.swatchHosts === 1, `B2: one theme picker, in one host (${dupes.swatchHosts})`);

    /* ---- B3. the paint dials appear only when there is paint ------------ */
    const dry = await page.evaluate(() => ({
      ctl: document.getElementById('paintCtl').getBoundingClientRect().height,
      brush: document.getElementById('skBrush').getBoundingClientRect().height,
      pal: document.getElementById('skPal').getBoundingClientRect().height,
      terrain: window.terrainMode,
    }));
    ok(dry.ctl === 0 && dry.brush === 0 && dry.pal === 0,
      `B3: with the terrain on ${dry.terrain}, no brush and no palette are offered (${dry.ctl}/${dry.brush}/${dry.pal} px)`);
    const wet = await page.evaluate(async () => {
      window.paintReady = true;            // stand in for a finished bake
      const b = document.querySelector('[data-tm="paint"]'); if (b) b.click();
      await new Promise(z => setTimeout(z, 400));
      return { ctl: document.getElementById('paintCtl').getBoundingClientRect().height, terrain: window.terrainMode };
    });
    ok(wet.ctl > 0, `B3: painting the terrain brings the brush and palette out (${wet.ctl} px)`);
    await page.evaluate(() => { const b = document.querySelector('[data-tm="sat"]'); if (b) b.click(); });
    await page.waitForTimeout(300);
    const dry2 = await page.evaluate(() => document.getElementById('paintCtl').getBoundingClientRect().height);
    ok(dry2 === 0, 'B3: and they go away again with the paint');
    await page.screenshot({ path: path.join(SHOTS, 'desk-merged-panel.png') });

    /* ---- B4. the tail is reachable on a short window -------------------- */
    await page.setViewportSize({ width: 1280, height: 620 });
    await page.waitForTimeout(600);
    const tail = await page.evaluate(() => {
      const sk = document.getElementById('skin');
      sk.scrollTop = sk.scrollHeight;
      const rows = [...sk.children];
      const last = rows[rows.length - 1];
      const r = sk.getBoundingClientRect(), lr = last.getBoundingClientRect();
      const cx = lr.left + lr.width / 2, cy = lr.top + lr.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      return {
        fits: Math.round(r.bottom) <= innerHeight,
        scrolls: getComputedStyle(sk).overflowY === 'auto',
        lastOnScreen: lr.bottom <= innerHeight && lr.top >= 0,
        lastReceives: !!(hit && sk.contains(hit)),
        bottom: Math.round(r.bottom), vh: innerHeight,
      };
    });
    ok(tail.fits && tail.scrolls,
      `B4: on a 620 px window the panel ends inside the glass and scrolls its own tail (bottom ${tail.bottom} of ${tail.vh})`);
    ok(tail.lastOnScreen && tail.lastReceives,
      'B4: the last row can be scrolled to AND would receive a click');
    await page.screenshot({ path: path.join(SHOTS, 'desk-short-window-tail.png') });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(400);

    /* ---- B5. every pane closes by its own control and by Escape --------- */
    const panes = [
      { pane: '#skin', open: () => document.getElementById('themeBtn').click(), x: '#skX' },
      { pane: '#wall', open: () => document.getElementById('wallBtn').click(), x: '#wallX' },
    ];
    for (const p of panes) {
      /* Start from shut, so a toggle is an open and never a close. */
      await page.evaluate(s => document.querySelector(s).classList.remove('show'), p.pane);
      await page.evaluate(o => eval('(' + o + ')()'), p.open.toString());
      await page.waitForTimeout(400);
      const btn = await reachable(page, p.x);
      ok(btn.found && btn.mine && Math.min(btn.w, btn.h) >= 44,
        `B5: ${p.pane} carries a close of its own, ${btn.w}x${btn.h}, and it would receive the click (mine ${btn.mine}, ${btn.blocker})`);
      await page.click(p.x); await page.waitForTimeout(300);
      const shut = await page.evaluate(s => !document.querySelector(s).classList.contains('show'), p.pane);
      ok(shut, `B5: ${p.pane} closes by its own control`);
      await page.evaluate(o => eval('(' + o + ')()'), p.open.toString());
      await page.waitForTimeout(400);
      await page.evaluate(() => document.body.focus());
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      const esc = await page.evaluate(s => !document.querySelector(s).classList.contains('show'), p.pane);
      ok(esc, `B5: ${p.pane} closes with Escape from anywhere`);
    }

    /* ---- B6. the mask never writes the village's record ----------------- */
    const law = await page.evaluate(() => {
      document.getElementById('themeBtn').click();
      const sk = document.getElementById('skin');
      const village = [...sk.querySelectorAll('[data-village]')];
      document.body.classList.remove('can-edit');
      const hiddenForMember = village.every(e => e.getBoundingClientRect().height === 0)
        && document.getElementById('skSave').getBoundingClientRect().height === 0;
      document.body.classList.add('can-edit');
      const shownForBuilder = village.every(e => e.getBoundingClientRect().height > 0)
        && document.getElementById('skSave').getBoundingClientRect().height > 0;
      return { n: village.length, hiddenForMember, shownForBuilder, open: sk.classList.contains('show'),
        heights: village.map(e => Math.round(e.getBoundingClientRect().height)),
        save: Math.round(document.getElementById('skSave').getBoundingClientRect().height) };
    });
    ok(law.n >= 4 && law.hiddenForMember && law.shownForBuilder,
      `B6: the village's own words and Save are a builder's, and a member never sees them (${law.n} rows, open ${law.open}, member-hidden ${law.hiddenForMember}, builder-shown ${law.shownForBuilder}, heights ${JSON.stringify(law.heights)}, save ${law.save})`);

    /* ---- B7. a priced gathering has words of its own -------------------- */
    const paid = await page.evaluate(() => {
      const W = (typeof PROMISE_WHY !== 'undefined') ? PROMISE_WHY : null;
      return { copy: W ? W.paid : null, distinct: !!W && W.paid !== W.closed };
    });
    ok(!!paid.copy && paid.distinct && !/closed/i.test(paid.copy),
      `B7: a gathering with a price has its own words, and they do not say closed ("${paid.copy}")`);

    ok(perr.length === 0, `B: zero page errors on the desk profile (${perr.length})`);
    await ctx.close();
  }

  await browser.close();
  console.log(`\nR5 MASK: ${pass} passed, ${fail} failed`);
  console.log('shots in ' + SHOTS);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('CRASH', e); process.exit(2); });
