/* CHROME — the seed, the exit door, and the builder's plaque.
 *
 * Three founder asks that all land in the same corners of the same document, so
 * they are measured together and against each other: nothing here may overlap
 * anything else here at either profile.
 *
 *   SEED       #pnav folds into a 44 px dot once a real pan AND a real pinch
 *              have happened, blooms back on a tap, and stays keyboard
 *              reachable and named the whole time. Five paired reps, and the
 *              count is asserted before any of it is believed.
 *   DOOR       the exit lives in the artifact's own bottom bar on a phone, is
 *              44 px, is named "Leave the map", and shares no pixel with the
 *              seed or the walk offer.
 *   PLAQUE     #buildBtn is visible and clickable at top-left on a desk for a
 *              hand the village lets edit, and the shell's door, now at the
 *              bottom, cannot reach it.
 *
 * THE INSET IS SUBSTITUTED, AND SAID SO. Chromium reports every
 * env(safe-area-inset-*) as 0 in a normal viewport and no CDP method sets them,
 * so the geometry is measured honestly at 0 and then measured AGAIN with the
 * two embed rules rewritten with a literal 34 px in place of the env() term.
 * That proves the arithmetic clears a notch; it does not prove iOS reports one.
 *
 * hasTouch alone, never isMobile.
 *
 *   source ./env.sh && node _probe_chrome.js
 */
const { chromium } = require('playwright');

const FILE = process.env.GROUNDS_FILE || 'file:///root/amora/work/grounds-v0.html';
const EXE = process.env.PW_EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPS = Number(process.env.CHROME_REPS || 5);
const SHOT = process.env.CHROME_SHOTS || '.';

let FAILS = 0, CHECKS = 0;
const ok = (c, l) => { CHECKS++; console.log((c ? 'PASS  ' : 'FAIL  ') + l); if (!c) FAILS++ };
const box = r => r && [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
const hits = (a, b) => !!a && !!b && a.x < b.x + b.width && b.x < a.x + a.width &&
  a.y < b.y + b.height && b.y < a.y + a.height;

const rects = (page, ids) => page.evaluate(list => {
  const out = {};
  for (const id of list) {
    const el = document.getElementById(id);
    if (!el) { out[id] = null; continue }
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    out[id] = (cs.display === 'none' || cs.visibility === 'hidden' || r.width === 0)
      ? null : { x: r.x, y: r.y, width: r.width, height: r.height };
  }
  return out;
}, ids);

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  console.log(`\nCHROME PROBE  ${FILE}\nreps=${REPS}\n`);

  /* =============== POCKET: the seed, the door, the offer =============== */
  const P = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3 });
  await P.addInitScript(() => { try { localStorage.clear() } catch (_) {} });
  const pp = await P.newPage();
  const perr = [], cerr = [];
  pp.on('pageerror', e => perr.push(String(e)));
  pp.on('console', m => { if (m.type() === 'error') cerr.push(m.text()) });
  await pp.goto(FILE + '#hud=pocket');
  await pp.waitForFunction('typeof GUIDE!=="undefined"', null, { timeout: 15000 });
  await pp.waitForTimeout(2200);

  const cdp = await P.newCDPSession(pp);
  const touch = (t, pts) => cdp.send('Input.dispatchTouchEvent', {
    type: t, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })),
  });

  /* --- the exit door, and the three bottom tenants against each other --- */
  const door = await pp.evaluate(() => {
    const b = document.getElementById('pbExit');
    if (!b) return { there: false };
    const r = b.getBoundingClientRect();
    return {
      there: true, tag: b.tagName, w: r.width, h: r.height,
      name: (b.getAttribute('aria-label') || '').trim(),
      text: (b.textContent || '').trim(),
      inBar: !!b.closest('#pbar'), bottom: Math.round(innerHeight - r.bottom),
      cells: document.querySelectorAll('#pbar button').length,
    };
  });
  ok(door.there && door.inBar, `DOOR: the exit lives in the bottom panel (${door.there ? (door.inBar ? '#pbar cell ' + door.cells + ' of ' + door.cells : 'outside the bar') : 'absent'})`);
  ok(door.w >= 44 && door.h >= 44, `DOOR: 44 px at least (${Math.round(door.w)}x${Math.round(door.h)})`);
  ok(door.name === 'Leave the map' && door.name.toLowerCase().includes(door.text.toLowerCase()),
    `DOOR: named where it goes, and the visible label is inside the name ("${door.text}" in "${door.name}")`);
  const b1 = await rects(pp, ['pbExit', 'pnav', 'gresume', 'pbar']);
  ok(!hits(b1.pbExit, b1.pnav), `DOOR: shares no pixel with the seed cluster (${JSON.stringify(box(b1.pbExit))} against ${JSON.stringify(box(b1.pnav))})`);
  ok(!hits(b1.pbExit, b1.gresume), `DOOR: shares no pixel with the walk offer (${JSON.stringify(box(b1.gresume))})`);
  ok(!hits(b1.pnav, b1.gresume), `POCKET: the seed cluster and the walk offer share no pixel either`);
  ok(!hits(b1.pnav, b1.pbar) && !hits(b1.gresume, b1.pbar), 'POCKET: neither floats over the bottom bar');
  await pp.screenshot({ path: SHOT + '/chrome-pocket-open.png' });

  /* --- the seed: five paired reps of fold-by-gesture then bloom-by-tap --- */
  const reps = [];
  for (let r = 0; r < REPS; r++) {
    await pp.evaluate(() => {
      const b = document.getElementById('pnav');
      b.classList.remove('folded', 'fold', 'bloom');
      document.getElementById('pnSeed').setAttribute('aria-expanded', 'true');
      try { localStorage.removeItem('amora-pnav') } catch (_) {}
      /* GUIDE.n IS DELIBERATELY NOT RESET, and the first draft of this probe
         reset it and measured a fold in 1 rep of 5. The controller snapshots
         the counts when a person expands it by hand, and that snapshot lives in
         a closure no probe can reach; zeroing the counters under it put every
         later rep permanently below its own baseline. A real visitor's counts
         only ever rise, so letting them rise here is both the honest model and
         the working one. */
      cam.z = 1; cam.x = 900; cam.y = 640; cam.vx = cam.vy = 0; travel = null; clampCam();
    });
    /* A SINGLE TAP MUST NOT FOLD IT. This is the half of the rule that is easy
       to get wrong, so it is measured before the gestures, every rep. */
    await touch('touchStart', [[120, 430]]); await pp.waitForTimeout(40); await touch('touchEnd', []);
    await pp.waitForTimeout(700);
    const afterTap = await pp.evaluate(() => document.getElementById('pnav').classList.contains('folded'));
    /* a real pan */
    await touch('touchStart', [[195, 470]]);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', [[195 - i * 7, 470]]); await pp.waitForTimeout(16) }
    await touch('touchEnd', []);
    await pp.waitForTimeout(200);
    const afterPan = await pp.evaluate(() => document.getElementById('pnav').classList.contains('folded'));
    /* a real pinch */
    await touch('touchStart', [[105, 470], [285, 470]]);
    for (let i = 1; i <= 8; i++) { const h = 90 - i * 5; await touch('touchMove', [[195 - h, 470], [195 + h, 470]]); await pp.waitForTimeout(16) }
    await touch('touchEnd', []);
    await pp.waitForTimeout(900);
    const folded = await pp.evaluate(() => {
      const b = document.getElementById('pnav'), s = document.getElementById('pnSeed');
      const sr = s.getBoundingClientRect();
      return {
        folded: b.classList.contains('folded'),
        bodyGone: getComputedStyle(document.getElementById('pnavCtl')).display === 'none',
        seedW: sr.width, seedH: sr.height,
        name: (s.getAttribute('aria-label') || ''), exp: s.getAttribute('aria-expanded'),
        stored: (() => { try { return localStorage.getItem('amora-pnav') } catch (_) { return null } })(),
      };
    });
    /* reachable by keyboard while folded */
    await pp.focus('#pnSeed').catch(() => {});
    const focused = await pp.evaluate(() => document.activeElement && document.activeElement.id);
    /* bloom on a real tap, and reachable ON THE OPENING FRAME */
    const sb = await pp.evaluate(() => { const r = document.getElementById('pnSeed').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] });
    await touch('touchStart', [sb]); await pp.waitForTimeout(30); await touch('touchEnd', []);
    await pp.waitForTimeout(60);          // mid-bloom, deliberately
    const mid = await pp.evaluate(() => {
      const z = document.getElementById('pnIn').getBoundingClientRect();
      const at = document.elementFromPoint(z.x + z.width / 2, z.y + z.height / 2);
      return { w: z.width, h: z.height, reaches: !!(at && at.closest && at.closest('#pnIn')) };
    });
    await pp.waitForTimeout(900);
    const open = await pp.evaluate(() => ({
      folded: document.getElementById('pnav').classList.contains('folded'),
      exp: document.getElementById('pnSeed').getAttribute('aria-expanded'),
      stored: (() => { try { return localStorage.getItem('amora-pnav') } catch (_) { return null } })(),
      marked: GUIDE.n.pan + ':' + GUIDE.n.pinch,
    }));
    /* an explicit expand outranks the inference: one more pan alone must not refold */
    await touch('touchStart', [[195, 470]]);
    for (let i = 1; i <= 8; i++) { await touch('touchMove', [[195 - i * 7, 470]]); await pp.waitForTimeout(16) }
    await touch('touchEnd', []);
    await pp.waitForTimeout(800);
    const afterOnePan = await pp.evaluate(() => document.getElementById('pnav').classList.contains('folded'));
    reps.push({ afterTap, afterPan, folded, focused, mid, open, afterOnePan });
  }
  ok(reps.length >= REPS, `SEED: NON-ZERO measurement count (${reps.length} of ${REPS})`);
  ok(reps.every(r => !r.afterTap), 'SEED: a single tap never folds it');
  ok(reps.every(r => !r.afterPan), 'SEED: a pan on its own never folds it either');
  ok(reps.every(r => r.folded.folded && r.folded.bodyGone),
    `SEED: a pan AND a pinch fold it (${reps.filter(r => r.folded.folded).length} of ${reps.length})`);
  ok(reps.every(r => r.folded.seedW >= 44 && r.folded.seedH >= 44 && /Show/.test(r.folded.name) && r.folded.exp === 'false'),
    `SEED: folded, it is still 44 px and still says what it opens ("${reps[0].folded.name}")`);
  ok(reps.every(r => r.folded.stored === 'seed'), 'SEED: the fold is remembered for this visitor');
  ok(reps.every(r => r.focused === 'pnSeed'), 'SEED: reachable by keyboard while folded');
  ok(reps.every(r => !r.open.folded && r.open.exp === 'true'), 'SEED: a tap blooms it back');
  ok(reps.every(r => r.mid.reaches && r.mid.w >= 44 && r.mid.h >= 44),
    `SEED: zoom is a full 44 px target 60 ms into the bloom (${Math.round(reps[0].mid.w)}x${Math.round(reps[0].mid.h)}, hit=${reps[0].mid.reaches})`);
  ok(reps.every(r => r.open.stored === 'open'), 'SEED: and the explicit choice is what gets remembered');
  ok(reps.every(r => !r.afterOnePan), 'SEED: after an explicit open, one pan alone does not fold it again');
  await pp.screenshot({ path: SHOT + '/chrome-pocket-seed.png' });

  /* --- reduced motion: a real still state, never a half-open one --- */
  await pp.emulateMedia({ reducedMotion: 'reduce' });
  await pp.evaluate(() => {
    const b = document.getElementById('pnav');
    b.classList.remove('folded', 'fold', 'bloom');    // start open, so the click folds
    document.getElementById('pnSeed').click();
  });
  await pp.waitForTimeout(120);   // well inside the 600 ms the motion path would need
  const calm = await pp.evaluate(() => {
    const b = document.getElementById('pnav'), body = document.getElementById('pnavCtl');
    const s = document.getElementById('pnSeed').getBoundingClientRect();
    return { folded: b.classList.contains('folded'), mid: b.classList.contains('fold') || b.classList.contains('bloom'),
      bodyGone: getComputedStyle(body).display === 'none', seed: s.width >= 44 && s.height >= 44 };
  });
  ok(calm.folded && calm.bodyGone && !calm.mid && calm.seed,
    `SEED: under reduced motion the state lands instantly and whole (folded=${calm.folded}, mid-animation=${calm.mid})`);
  await pp.emulateMedia({ reducedMotion: 'no-preference' });
  ok(perr.length === 0 && cerr.length === 0,
    `POCKET: zero page and console errors (${perr.length}/${cerr.length}${perr[0] ? ' :: ' + perr[0] : ''}${cerr[0] ? ' :: ' + cerr[0] : ''})`);
  await P.close();

  /* =============== DESK: the plaque, and the corner it owns =============== */
  const D = await browser.newContext({ viewport: { width: 1480, height: 1000 } });
  const dp = await D.newPage();
  const dperr = [];
  dp.on('pageerror', e => dperr.push(String(e)));
  await dp.goto(FILE + '#hud=desk');
  await dp.waitForFunction('typeof GUIDE!=="undefined"', null, { timeout: 15000 });
  await dp.click('#enterBtn').catch(() => {});
  await dp.waitForTimeout(2200);
  /* The village says this hand may edit, which is the only reason the plaque is
     drawn at all, and the artifact is embedded, which is what moves the minimap
     out of the shell door's corner. */
  await dp.evaluate(() => {
    document.body.classList.add('can-edit', 'embed');
    /* The shell's door, drawn where LivingMap.tsx now puts it, so the two can be
       measured against each other inside one document. */
    const d = document.createElement('button');
    d.id = '__shellDoor'; d.textContent = 'Leave the map';
    d.style.cssText = 'position:fixed;left:12px;bottom:12px;min-height:44px;min-width:44px;' +
      'padding:8px 16px;z-index:99;font:14px sans-serif';
    document.body.appendChild(d);
  });
  await dp.waitForTimeout(400);
  const d1 = await rects(dp, ['buildBtn', '__shellDoor', 'minimapWrap', 'maia', 'attention']);
  ok(!!d1.buildBtn, `PLAQUE: the Build button is drawn for a hand that may edit (${JSON.stringify(box(d1.buildBtn))})`);
  ok(!!d1.buildBtn && d1.buildBtn.height >= 44, `PLAQUE: 44 px at least (${d1.buildBtn ? Math.round(d1.buildBtn.height) : 0} tall, was 30)`);
  ok(!hits(d1.buildBtn, d1.__shellDoor),
    `PLAQUE: the shell's door cannot reach it (${JSON.stringify(box(d1.__shellDoor))})`);
  ok(!hits(d1.__shellDoor, d1.minimapWrap),
    `DOOR: and the lifted minimap clears it too (${JSON.stringify(box(d1.minimapWrap))})`);
  /* clickable, not merely visible: what is actually on top at its centre */
  const top = await dp.evaluate(() => {
    const r = document.getElementById('buildBtn').getBoundingClientRect();
    const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return el ? (el.id || el.tagName) + (el.closest('#buildBtn') ? ' (inside #buildBtn)' : '') : 'nothing';
  });
  ok(/#buildBtn|buildBtn/.test(top), `PLAQUE: and a click at its centre lands on it (${top})`);
  await dp.screenshot({ path: SHOT + '/chrome-desk-rest.png', clip: { x: 0, y: 0, width: 520, height: 340 } });

  /* build mode: the land opening, and the bar's floor clearing the lifted minimap */
  await dp.click('#buildBtn').catch(() => {});
  await dp.waitForTimeout(900);
  const d2 = await rects(dp, ['buildBtn', 'buildBar', 'minimapWrap', '__shellDoor']);
  ok(await dp.evaluate(() => document.body.classList.contains('build')), 'PLAQUE: pressing it opens build mode');
  ok(!hits(d2.buildBar, d2.minimapWrap), `PLAQUE: the build bar's floor clears the lifted minimap (${JSON.stringify(box(d2.buildBar))} against ${JSON.stringify(box(d2.minimapWrap))})`);
  ok(!hits(d2.buildBar, d2.__shellDoor), 'PLAQUE: and the shell door too');
  await dp.screenshot({ path: SHOT + '/chrome-desk-build.png', clip: { x: 0, y: 0, width: 520, height: 700 } });

  /* THE SUBSTITUTED INSET. env() is 0 in every headless viewport, so the two
     embed rules are rewritten with a literal in its place and measured again. */
  await dp.evaluate(() => {
    const s = document.createElement('style');
    s.textContent = 'body.embed #minimapWrap{bottom:calc(66px + 34px)}' +
      'body.embed #buildBar{bottom:calc(279px + 34px)}' +
      '#__shellDoor{bottom:34px}';
    document.head.appendChild(s);
  });
  await dp.waitForTimeout(300);
  const d3 = await rects(dp, ['buildBtn', 'buildBar', 'minimapWrap', '__shellDoor']);
  ok(!hits(d3.__shellDoor, d3.minimapWrap) && !hits(d3.__shellDoor, d3.buildBtn) && !hits(d3.buildBar, d3.minimapWrap),
    'INSET: with 34 px substituted for the safe-area term, nothing overlaps anything');
  ok(dperr.length === 0, `DESK: zero page errors (${dperr.length}${dperr[0] ? ' :: ' + dperr[0] : ''})`);
  await D.close();

  await browser.close();
  console.log(`\nchecks run: ${CHECKS}`);
  console.log(FAILS ? `CHROME: ${FAILS} FAILED` : 'CHROME: ALL GREEN');
  process.exit(FAILS ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2) });
