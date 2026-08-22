/* CONSENT — the camera moves only when a person asked it to.
 *
 * THE FOUNDER'S COMPLAINT, AS A NUMBER. He fixed touch navigation yesterday and
 * the next thing spoiling the map is that it moves under his thumb on its own.
 * So the first measurement here is the plainest one in the directory: load the
 * map on a phone as a first-time visitor, touch NOTHING, and watch the camera.
 * A map that waited would report zero on all three axes. The pocket boot opens
 * the Welcome Walk 700 ms after load and the walk flies the camera to a new
 * place every 6.5 seconds, so the BEFORE number is not small.
 *
 * WHAT IT MEASURES, and every one has a correct answer known in advance:
 *
 *   1. DRIFT      cam.x, cam.y, cam.z at the first PAINTED frame against the
 *                 same three numbers 20 seconds later, with no input at all.
 *                 Correct answer: 0, 0, 0. The first painted frame is used
 *                 rather than the declared initial value because clampCam runs
 *                 once on that frame and a boot clamp is not movement anybody
 *                 sees; measuring from the declared value would flatter nothing
 *                 and confuse the reading.
 *   2. CONSENTED   the walk, started deliberately, MUST move the camera. A
 *                 consent gate that stops everything is not a fix.
 *   3. CANCEL      mid-walk, one interaction of each of four kinds: a drag, a
 *                 pinch, a tap on the land, a tap on a building. After each the
 *                 camera must stop and stay stopped for 9 seconds, which is
 *                 longer than the walk's own 6.5 second dwell, so a queued step
 *                 landing late is caught rather than missed.
 *   4. RESUME      after a cancel, a visible way back in.
 *
 * THE COUNT IS ASSERTED BEFORE ANY NUMBER IS READ. A probe that measured
 * nothing prints what a passing probe prints. `reps` is checked first, and the
 * four cancel kinds ALTERNATE inside each rep rather than running in four
 * blocks, so one slow load cannot land on one kind and leave the others clean.
 *
 * TRUSTED INPUT ONLY. CDP Input.dispatchTouchEvent, never a synthetic
 * TouchEvent: an untrusted event never engages the browser's gesture
 * arbitration and never generates the compatibility pointer stream, which is
 * the exact blindness that hid the double-drag defect for weeks.
 *
 * hasTouch ALONE, never isMobile: isMobile makes this Chromium report
 * innerWidth 1560 for a 390 CSS px viewport and every screen coordinate below
 * would be measured against a lie.
 *
 * Run:
 *   source ./env.sh && node _probe_consent.js
 *   GROUNDS_FILE="file:///.../pristine.html" CONSENT_LABEL=before node _probe_consent.js
 *   CONSENT_REPS=7 node _probe_consent.js
 */
const { chromium } = require('playwright');

const FILE = process.env.GROUNDS_FILE || 'file:///root/amora/work/grounds-v0.html';
const EXE = process.env.PW_EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPS = Number(process.env.CONSENT_REPS || 5);
const LABEL = process.env.CONSENT_LABEL || 'run';
const DRIFT_MS = Number(process.env.CONSENT_DRIFT_MS || 20000);

const f2 = n => (Math.round(n * 100) / 100).toFixed(2);
const med = a => { const s = a.slice().sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };
const mx = a => a.reduce((p, c) => Math.max(p, c), 0);

let FAILS = 0, CHECKS = 0;
const ok = (cond, line) => { CHECKS++; console.log((cond ? 'PASS  ' : 'FAIL  ') + line); if (!cond) FAILS++; };

/* A newcomer, deliberately: no walk-done key, no gestures-seen key, no stored
   control state. The drift measurement is ABOUT the first-time visitor, so a
   probe that pre-set amora-walk-done would measure a map that had already been
   told to be quiet and would report a clean zero on the broken artifact. */
async function openPhone(browser, { newcomer = true } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3,
  });
  await ctx.addInitScript(({ fresh }) => {
    try { if (fresh) localStorage.clear(); } catch (_) { /* file: origins may refuse storage */ }
    /* THE FIRST PAINTED FRAME. tPrev is written by frame() and by nothing else,
       so tPrev>0 is the exact moment one frame has been drawn and clampCam has
       run once. typeof on a script-level `const` still in its temporal dead
       zone throws, which is what the try is for. */
    const t = setInterval(() => {
      try {
        if (typeof tPrev !== 'undefined' && tPrev > 0 && typeof cam !== 'undefined') {
          window.__first = { x: cam.x, y: cam.y, z: cam.z, t: performance.now() };
          clearInterval(t);
        }
      } catch (_) { /* not booted yet */ }
    }, 4);
  }, { fresh: newcomer });
  const page = await ctx.newPage();
  const perr = [], cerr = [];
  page.on('pageerror', e => perr.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') cerr.push(m.text()); });
  await page.goto(FILE + '#hud=pocket');
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })),
  });
  return { ctx, page, cdp, touch, perr, cerr };
}

const readCam = page => page.evaluate(() => ({ x: cam.x, y: cam.y, z: cam.z }));
const settle = page => page.evaluate(() => new Promise(r =>
  requestAnimationFrame(() => requestAnimationFrame(() => r(1)))));

/* Is a way back into the walk actually on the screen, and would a finger reach
   it? Visible means painted, inside the viewport, and ON TOP.
   THE OCCLUSION TEST IS HERE BECAUSE ITS ABSENCE PASSED A COVERED BUTTON. The
   first version of this checked display, opacity and the rectangle, and reported
   a clean PASS on a resume control that Maia's own sheet was sitting on:
   elementFromPoint at its centre returned #maiaText, and a real tap did nothing
   at all. A control that is painted and unreachable is the exact shape of a
   green that means nothing, so the button is now asked whether the browser would
   deliver it the tap. */
const resumeSeen = page => page.evaluate(() => {
  const el = document.getElementById('gresume');
  if (!el) return { present: false, seen: false, why: 'no #gresume in the document' };
  const go = document.getElementById('gresumeGo') || el;
  const cs = getComputedStyle(el), r = el.getBoundingClientRect(), g = go.getBoundingClientRect();
  const painted = cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.05 &&
    r.width >= 44 && r.height >= 24 && r.top >= 0 && r.bottom <= innerHeight &&
    r.left >= 0 && r.right <= innerWidth;
  const at = painted ? document.elementFromPoint(g.x + g.width / 2, g.y + g.height / 2) : null;
  const onTop = !!(at && (at === go || go.contains(at) || at.closest('#gresume')));
  return {
    present: true, seen: painted && onTop, painted, onTop,
    covered: (painted && !onTop) ? (at ? (at.id || at.tagName) : 'nothing') : null,
    label: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
    box: { w: Math.round(r.width), h: Math.round(r.height), t: Math.round(r.top) },
  };
});

/* A structure that is on the screen right now, and a patch of land that is not
   any structure. Both are computed from the page's own geometry at the moment
   of the tap, because the camera has been moving. */
const pickTargets = page => page.evaluate(() => {
  const out = { build: null, land: null };
  let best = null, bd = 1e12;
  for (const s of SCENE.structures) {
    if (mode === 'now' && s.state === 'blueprint') continue;
    const p = worldToScreen(s.x, s.y);
    const px = p[0] / DPR, py = p[1] / DPR;
    if (px < 60 || px > innerWidth - 60 || py < 120 || py > innerHeight - 160) continue;
    const d = (px - innerWidth / 2) ** 2 + (py - innerHeight / 2) ** 2;
    if (d < bd) { bd = d; best = [px, py, s.key] }
  }
  if (best) out.build = best;
  for (let gx = 40; gx < innerWidth - 40 && !out.land; gx += 37) {
    for (let gy = 200; gy < innerHeight - 200; gy += 41) {
      if (!hitStruct(gx, gy)) { out.land = [gx, gy]; break }
    }
  }
  return out;
});

(async () => {
  console.log(`\nCONSENT PROBE [${LABEL}]  ${FILE}`);
  console.log(`reps=${REPS}  drift window=${DRIFT_MS}ms\n`);
  const browser = await chromium.launch({ executablePath: EXE });

  /* ================= 1. DRIFT — the founder's complaint ================= */
  const drift = [];
  for (let r = 0; r < REPS; r++) {
    const P = await openPhone(browser);
    await P.page.waitForFunction('window.__first && window.__first.z', null, { timeout: 15000 })
      .catch(() => {});
    const first = await P.page.evaluate(() => window.__first || null);
    /* Sampled all the way through rather than only at the ends: a walk that flew
       out and happened to fly back would report a small end-to-end delta and a
       large maximum, and the maximum is what a person sees. */
    const samples = [];
    const t0 = Date.now();
    while (Date.now() - t0 < DRIFT_MS) {
      samples.push(await readCam(P.page));
      await P.page.waitForTimeout(250);
    }
    const last = samples[samples.length - 1];
    drift.push({
      first, last, n: samples.length,
      maxdx: first ? mx(samples.map(s => Math.abs(s.x - first.x))) : NaN,
      maxdy: first ? mx(samples.map(s => Math.abs(s.y - first.y))) : NaN,
      maxdz: first ? mx(samples.map(s => Math.abs(s.z - first.z))) : NaN,
      perr: P.perr.length, cerr: P.cerr.length,
    });
    console.log(`  drift rep ${r + 1}: first=(${f2(first ? first.x : NaN)}, ${f2(first ? first.y : NaN)}, ${f2(first ? first.z : NaN)})` +
      `  last=(${f2(last.x)}, ${f2(last.y)}, ${f2(last.z)})  samples=${samples.length}`);
    await P.ctx.close();
  }

  ok(drift.every(d => d.n > 0), `DRIFT COUNT: every rep produced samples (min ${Math.min(...drift.map(d => d.n))})`);
  ok(drift.every(d => d.first), 'DRIFT ANCHOR: the first painted frame was captured in every rep');
  const DX = med(drift.map(d => d.maxdx)), DY = med(drift.map(d => d.maxdy)), DZ = med(drift.map(d => d.maxdz));
  console.log(`\n  UNTOUCHED LOAD, median of ${REPS}:  max |dx|=${f2(DX)}  max |dy|=${f2(DY)}  max |dz|=${f2(DZ)}  world px / zoom`);
  ok(DX < 1 && DY < 1 && DZ < 0.01,
    `DRIFT: nobody touched the map and the camera did not move (dx=${f2(DX)}, dy=${f2(DY)}, dz=${f2(DZ)})`);

  /* ================= 2. CONSENTED — the walk still walks ================= */
  {
    const P = await openPhone(browser);
    await P.page.waitForFunction('typeof playJourney==="function"', null, { timeout: 15000 });
    await P.page.waitForTimeout(2500);
    const r0 = await resumeSeen(P.page);
    console.log(`\n  way in: ${r0.present ? (r0.seen ? 'visible' : 'present but not visible') : 'absent'}` +
      `${r0.label ? ' :: "' + r0.label + '"' : ''}`);
    const before = await readCam(P.page);
    /* A REAL TAP when the affordance is there, because a person taps. The
       function call is the fallback, so this same probe reads both artifacts. */
    let how = 'startWalk(true)';
    if (r0.seen) {
      const b = await P.page.evaluate(() => {
        const r = document.getElementById('gresume').getBoundingClientRect();
        return [r.left + r.width / 2, r.top + r.height / 2];
      });
      await P.touch('touchStart', [b]); await P.touch('touchEnd', []);
      how = 'a real tap on the visible affordance';
    } else {
      await P.page.evaluate(() => startWalk(true));
    }
    await P.page.waitForTimeout(3200);
    const after = await readCam(P.page);
    const moved = Math.hypot(after.x - before.x, after.y - before.y) + Math.abs(after.z - before.z) * 800;
    console.log(`  consented start via ${how}: camera moved ${f2(moved)}`);
    ok(moved > 20, `CONSENTED: a deliberately started walk DOES move the camera (${f2(moved)})`);
    ok(await P.page.evaluate(() => (typeof JWALK!=='undefined'&&!!JWALK)), 'CONSENTED: and the walk is actually running');
    await P.ctx.close();
  }

  /* ================= 3+4. CANCEL, four kinds, alternating ================= */
  const KINDS = ['drag', 'pinch', 'tap-land', 'tap-building'];
  const res = {}; KINDS.forEach(k => res[k] = []);

  for (let r = 0; r < REPS; r++) {
    for (const kind of KINDS) {
      const P = await openPhone(browser);
      await P.page.waitForFunction('typeof playJourney==="function"', null, { timeout: 15000 });
      await P.page.waitForTimeout(2200);
      await P.page.evaluate(() => startWalk(true));
      await P.page.waitForTimeout(2600);           // let the first flight land
      const walking = await P.page.evaluate(() => (typeof JWALK!=='undefined'&&!!JWALK));

      const CX = 195, CY = 470;
      if (kind === 'drag') {
        await P.touch('touchStart', [[CX, CY]]);
        for (let i = 1; i <= 8; i++) { await P.touch('touchMove', [[CX - i * 6, CY]]); await P.page.waitForTimeout(16) }
        await P.touch('touchEnd', []);
      } else if (kind === 'pinch') {
        await P.touch('touchStart', [[CX - 90, CY], [CX + 90, CY]]);
        for (let i = 1; i <= 8; i++) { const h = 90 - i * 5; await P.touch('touchMove', [[CX - h, CY], [CX + h, CY]]); await P.page.waitForTimeout(16) }
        await P.touch('touchEnd', []);
      } else {
        const t = await pickTargets(P.page);
        const pt = kind === 'tap-land' ? t.land : (t.build ? [t.build[0], t.build[1]] : null);
        if (!pt) { await P.ctx.close(); continue }
        await P.touch('touchStart', [pt]); await P.page.waitForTimeout(40); await P.touch('touchEnd', []);
      }

      /* 1.2 s so a fling has landed. Momentum is the person's own throw and
         folding it in would call a correct map broken. */
      await P.page.waitForTimeout(1200);
      await settle(P.page);
      const stopped = await readCam(P.page);
      const rs = await resumeSeen(P.page);
      /* 9 s, which is longer than the walk's 6500 ms dwell. This is the whole
         point: a queued step that lands late moves the map after the person
         has taken it back, and a 2 second wait would never see it. */
      await P.page.waitForTimeout(9000);
      const later = await readCam(P.page);
      res[kind].push({
        walking,
        dx: later.x - stopped.x, dy: later.y - stopped.y, dz: later.z - stopped.z,
        resume: !!rs.seen, present: !!rs.present, label: rs.label || '', covered: rs.covered || null,
        live: await P.page.evaluate(() => (typeof JWALK!=='undefined'&&!!JWALK)),
      });
      await P.ctx.close();
    }
    console.log(`  cancel rep ${r + 1} done`);
  }

  console.log('');
  for (const kind of KINDS) {
    const a = res[kind];
    ok(a.length >= REPS, `${kind}: NON-ZERO measurement count (${a.length} of ${REPS})`);
    if (!a.length) continue;
    ok(a.every(x => x.walking), `${kind}: the walk really was running when the interaction landed`);
    const DDX = med(a.map(x => Math.abs(x.dx))), DDY = med(a.map(x => Math.abs(x.dy))), DDZ = med(a.map(x => Math.abs(x.dz)));
    console.log(`      ${kind}: after the interaction, 9 s of stillness -> |dx|=${f2(DDX)} |dy|=${f2(DDY)} |dz|=${f2(DDZ)}`);
    ok(DDX < 1 && DDY < 1 && DDZ < 0.01,
      `${kind}: the camera stopped where it was and nothing moved it later (${f2(DDX)}, ${f2(DDY)}, ${f2(DDZ)})`);
    ok(a.every(x => !x.live), `${kind}: and the walk is not still running underneath`);
    ok(a.every(x => x.resume),
      `${kind}: a visible way back in after the cancel, and a finger would reach it (${a[0].label || 'absent'}${a.find(x => x.covered) ? ', covered by ' + a.find(x => x.covered).covered : ''})`);
  }

  await browser.close();
  console.log(`\nchecks run: ${CHECKS}`);
  console.log(FAILS ? `CONSENT [${LABEL}]: ${FAILS} FAILED` : `CONSENT [${LABEL}]: ALL GREEN`);
  process.exit(FAILS ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2) });
