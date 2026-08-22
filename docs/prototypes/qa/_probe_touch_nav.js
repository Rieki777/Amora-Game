/* TOUCH NAVIGATION — the paired BEFORE/AFTER measurement for the pocket map.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT verify_features.js. The shipped pinch check
 * dispatched `new TouchEvent()` from inside the page. An untrusted event runs
 * the page's own listeners and nothing else: the browser's gesture arbitration
 * never engages, `touch-action` is never consulted, and — the part that hid the
 * real defect for weeks — NO POINTER EVENTS ARE GENERATED. The map had two drag
 * implementations bound to the same canvas and a synthetic TouchEvent could only
 * ever exercise one of them.
 *
 * This probe drives CDP `Input.dispatchTouchEvent`, which is trusted input: the
 * browser generates the compatibility pointer stream, arbitrates the gesture,
 * and honours `touch-action`. It is the only harness in this directory that can
 * see the double-handling at all.
 *
 * WHAT IT MEASURES, three numbers, each with a correct answer known in advance:
 *
 *   1. GAIN — a one-finger drag of N CSS px must move the camera N/cam.z world
 *      px. Not 2.4 x that. Measured with the finger STILL DOWN, so the number is
 *      the gain of the pan and carries no inertia tail.
 *   2. CENTRED PINCH TRANSLATION — a two-finger pinch whose midpoint sits exactly
 *      on the screen centre and never moves must not translate the camera at all.
 *      The correct answer is zero and any other number is drift.
 *   3. ANCHOR DRIFT — a pinch about an OFF-centre midpoint must keep the world
 *      point under that midpoint under it. Reported in screen px, because screen
 *      px is what a thumb feels; world px flatters a zoomed-out map.
 *
 * THE COUNT IS ASSERTED FIRST. A probe that measures nothing prints exactly what
 * a passing probe prints, so `reps` is checked against the requested count before
 * any number is read. n=5 by default, and the three tests ALTERNATE inside each
 * rep rather than running in three blocks, so a slow first paint or a settling
 * camera cannot land on one measurement and leave the others clean.
 *
 * Run:
 *   source ./env.sh && node _probe_touch_nav.js
 *   GROUNDS_FILE="file:///.../pristine.html" node _probe_touch_nav.js   # BEFORE
 *   TOUCH_REPS=9 node _probe_touch_nav.js
 *
 * hasTouch alone, never isMobile: MAP_LANE_HANDOFF_2026-08-10.md:245-247 —
 * isMobile makes this Chromium report innerWidth 1560 for a 390 CSS px viewport,
 * and every screen coordinate below would be measured against a lie.
 */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE || 'file:///root/amora/work/grounds-v0.html';
const EXE = process.env.PW_EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const REPS = Number(process.env.TOUCH_REPS || 5);
const LABEL = process.env.TOUCH_LABEL || 'run';

const med = a => { const s = a.slice().sort((x, y) => x - y); return s[(s.length - 1) >> 1]; };
const f2 = n => (Math.round(n * 100) / 100).toFixed(2);

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3,
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('amora-walk-done', '1');
      localStorage.setItem('amora-gestures-seen', '1');
    } catch (_) { /* file: origins refuse storage on some hosts; the walk simply runs */ }
  });
  const page = await ctx.newPage();
  const perr = [];
  page.on('pageerror', e => perr.push(String(e)));
  await page.goto(FILE + '#hud=pocket');
  await page.waitForTimeout(2000);
  if (await page.evaluate(() => document.body.classList.contains('intro'))) {
    await page.click('#enterBtn').catch(() => {});
  }
  await page.waitForTimeout(2400);

  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })),
  });
  /* Two frames: one for the handler's rAF flush to be scheduled, one for it to
     run. A single rAF can return before a flush scheduled from inside the same
     touchmove has executed. */
  const settle = () => page.evaluate(() => new Promise(r =>
    requestAnimationFrame(() => requestAnimationFrame(() => r(1)))));

  /* The geometry the page actually has, never the geometry we assumed. cx is the
     screen centre screenToWorld() is written around: cv.width/2 backing-store px
     is cv.width/(2*DPR) CSS px. If this disagrees with innerWidth/2 the whole
     "a centred pinch translates nothing" claim is being tested at the wrong x. */
  const geo = await page.evaluate(() => {
    const sc = document.getElementById('scene');
    const el = document.elementFromPoint(195, 420);
    return {
      innerWidth: innerWidth, innerHeight: innerHeight, DPR: DPR,
      cx: sc.width / (2 * DPR), cy: sc.height / (2 * DPR),
      touchAction: getComputedStyle(sc).touchAction,
      pocket: document.body.classList.contains('pocket'),
      hitScene: el === sc, hitId: el && (el.id || el.tagName),
    };
  });

  const reset = () => page.evaluate(() => {
    cam.z = 1.0; cam.x = 900; cam.y = 640; cam.vx = cam.vy = 0; travel = null; clampCam();
    window.__EV = [];
    if (!window.__evOn) {
      window.__evOn = 1;
      const sc = document.getElementById('scene');
      ['touchstart', 'touchmove', 'touchend', 'touchcancel',
        'pointerdown', 'pointermove', 'pointerup', 'pointercancel'].forEach(t =>
          sc.addEventListener(t, e => window.__EV.push(
            e.type + (e.cancelable === false ? ' [NOT-cancelable]' : '')),
            { capture: true, passive: true }));
    }
    return { x: cam.x, y: cam.y, z: cam.z };
  });
  const readCam = () => page.evaluate(() => ({ x: cam.x, y: cam.y, z: cam.z }));
  const readWorldAt = (px, py) => page.evaluate(([a, b]) => {
    const w = screenToWorld(a, b); return { wx: w[0], wy: w[1], z: cam.z };
  }, [px, py]);
  const tally = () => page.evaluate(() => {
    const t = {}; for (const k of window.__EV) t[k] = (t[k] || 0) + 1; return t;
  });

  const DRAG_PX = 100, STEPS = 10;
  /* THE CENTRE COMES FROM THE PAGE, IN BOTH AXES. Two pixels off is enough to
     turn a correct anchor into a failing drift number, because a pinch about a
     point 2 px off centre MUST translate the camera by 2 world px. */
  const MX = geo.cx, MY = geo.cy;
  const OX = geo.cx - 90, OY = 500;         // off-centre pinch: anchor under the fingers

  /* Each measurement lifts the fingers at the end, but reads the camera BEFORE
     the lift. Momentum after release is a separate, deliberate feature; folding
     it into the gain number is how the shipped 2.4x hid as "a bit fast". */
  async function mDrag() {
    const a = await reset();
    await touch('touchStart', [[MX, MY]]);
    for (let i = 1; i <= STEPS; i++) {
      await touch('touchMove', [[MX - i * (DRAG_PX / STEPS), MY]]);
      await page.waitForTimeout(16);
    }
    await settle();
    const b = await readCam();
    const ev = await tally();
    await touch('touchEnd', []);
    await page.waitForTimeout(420);          // let any inertia land
    const c = await readCam();
    return {
      moved: b.x - a.x, want: DRAG_PX / a.z, dy: b.y - a.y,
      settled: c.x - a.x, ev,
    };
  }

  async function mPinchCentred() {
    const a = await reset();
    await touch('touchStart', [[MX - 100, MY], [MX + 100, MY]]);
    for (let i = 1; i <= STEPS; i++) {
      const h = 100 - i * 5;                 // 200 px apart -> 100 px apart, z 1.0 -> 0.5
      await touch('touchMove', [[MX - h, MY], [MX + h, MY]]);
      await page.waitForTimeout(16);
    }
    await settle();
    const b = await readCam();
    await touch('touchEnd', []);
    await page.waitForTimeout(420);          // the fling a two-finger gesture must not have
    const c = await readCam();
    return { dx: b.x - a.x, settled: c.x - a.x, dy: b.y - a.y, z: b.z, wantZ: 0.5 };
  }

  async function mPinchAnchored() {
    await reset();
    const before = await readWorldAt(OX, OY);
    await touch('touchStart', [[OX - 100, OY], [OX + 100, OY]]);
    for (let i = 1; i <= STEPS; i++) {
      const h = 100 - i * 4;                 // 200 -> 120 apart, z 1.0 -> 0.6
      await touch('touchMove', [[OX - h, OY], [OX + h, OY]]);
      await page.waitForTimeout(16);
    }
    await settle();
    const after = await readWorldAt(OX, OY);
    await touch('touchEnd', []);
    await page.waitForTimeout(120);
    const worldErr = Math.hypot(after.wx - before.wx, after.wy - before.wy);
    return { worldErr, screenErr: worldErr * after.z, z: after.z };
  }

  /* 4. FLING — released WHILE STILL MOVING, which is the only way to see whether
     momentum survived moving out of the pointer path. The direct part of the
     travel is known in advance (6 steps x 14 px at z=1.0 = 84 world px), so
     anything past that is the tail.
     NO WAIT AFTER THE LAST MOVE, deliberately. Momentum is refused when the last
     sample is more than 110 ms old, because a hand that stopped before it lifted
     did not throw the map. That rule is right and it makes this measurement
     sensitive to the harness's own round-trip time: with a 16 ms wait left in
     after the final move, three reps in five came back with a tail of exactly
     zero. So the tail is reported as a COUNT of reps that produced one plus the
     largest, and not as a median, because a median over a mixture of "threw it"
     and "put it down" is a number about neither. */
  const FLING_STEPS = 6, FLING_PX = 14, FLING_DIRECT = FLING_STEPS * FLING_PX;
  async function mFling() {
    const a = await reset();
    await touch('touchStart', [[MX, MY]]);
    for (let i = 1; i <= FLING_STEPS; i++) {
      await touch('touchMove', [[MX - i * FLING_PX, MY]]);
      if (i < FLING_STEPS) await page.waitForTimeout(16);
    }
    await touch('touchEnd', []);            // no settle, no read: the hand is still moving
    await page.waitForTimeout(700);
    const b = await readCam();
    return b.x - a.x;
  }

  const R = { drag: [], dragSettle: [], pinchDx: [], pinchDy: [], pinchSettle: [], pinchZ: [], anchor: [], fling: [] };
  let evAll = {};
  for (let i = 0; i < REPS; i++) {
    const d = await mDrag();
    R.drag.push(d.moved); R.dragSettle.push(d.settled);
    for (const k of Object.keys(d.ev)) evAll[k] = (evAll[k] || 0) + d.ev[k];
    const p = await mPinchCentred();
    R.pinchDx.push(p.dx); R.pinchDy.push(p.dy); R.pinchSettle.push(p.settled); R.pinchZ.push(p.z);
    const q = await mPinchAnchored();
    R.anchor.push(q.screenErr);
    R.fling.push(await mFling());
  }

  /* THE COUNT, FIRST. Everything under this line is a number about a gesture that
     was actually dispatched, or it is nothing at all. */
  const n = R.drag.length;
  console.log(`\n== TOUCH NAV [${LABEL}] ==`);
  console.log(`file        ${FILE}`);
  console.log(`viewport    ${geo.innerWidth}x${geo.innerHeight} DPR=${geo.DPR} pocket=${geo.pocket}`);
  console.log(`centre      cx=${f2(geo.cx)} (innerWidth/2=${f2(geo.innerWidth / 2)})`);
  console.log(`hit @195,420 ${geo.hitId} isScene=${geo.hitScene}`);
  console.log(`#scene touch-action  ${geo.touchAction}`);
  console.log(`reps        ${n} of ${REPS} requested`);
  if (n !== REPS || R.pinchDx.length !== REPS || R.pinchDy.length !== REPS || R.anchor.length !== REPS || R.fling.length !== REPS) {
    console.log(`FAIL: measurement count ${n}/${R.pinchDx.length}/${R.pinchDy.length}/${R.anchor.length}/${R.fling.length} != ${REPS}`);
    await browser.close(); process.exit(2);
  }

  const wantDrag = DRAG_PX;                 // reset pins cam.z to 1.0, so N/z == N
  const gain = med(R.drag) / wantDrag;
  console.log(`\n1. GAIN — one-finger drag ${DRAG_PX} CSS px at z=1.0, finger still down`);
  console.log(`   want ${f2(wantDrag)} world px    got ${R.drag.map(f2).join(' ')}`);
  console.log(`   median ${f2(med(R.drag))}   GAIN x${f2(gain)}   (1.00 is correct)`);
  console.log(`   after release, inertia included: ${R.dragSettle.map(f2).join(' ')}`);

  console.log(`\n2. CENTRED PINCH — midpoint on (cx,cy), never moves; correct translation is 0`);
  console.log(`   cam.x drift ${R.pinchDx.map(f2).join(' ')}`);
  console.log(`   cam.y drift ${R.pinchDy.map(f2).join(' ')}`);
  console.log(`   median ${f2(med(R.pinchDx))} world px   z ${R.pinchZ.map(f2).join(' ')} (want 0.50)`);
  console.log(`   after release, inertia included: ${R.pinchSettle.map(f2).join(' ')}   median ${f2(med(R.pinchSettle))}`);

  console.log(`\n3. ANCHOR — pinch about (${f2(OX)},${OY}); the world point under the`);
  console.log(`   midpoint must stay under it. Error in SCREEN px:`);
  console.log(`   ${R.anchor.map(f2).join(' ')}   median ${f2(med(R.anchor))}`);

  console.log(`\n4. FLING — released while still moving; ${FLING_DIRECT} world px of that`);
  console.log(`   is the drag itself, the rest is momentum:`);
  const tails = R.fling.map(v => v - FLING_DIRECT);
  console.log(`   ${R.fling.map(f2).join(' ')}`);
  console.log(`   tails ${tails.map(f2).join(' ')}   reps with momentum ${tails.filter(t => t > 1).length} of ${REPS}   largest ${f2(Math.max.apply(null, tails))}`);

  console.log(`\nevents on #scene across the ${REPS} drags:`);
  console.log('   ' + Object.keys(evAll).sort().map(k => `${k}x${evAll[k]}`).join('  '));
  /* THE CANARY. A touchmove arriving NOT-cancelable is the browser announcing it
     has taken the gesture and the page can no longer refuse it. Any count above
     zero is a touch-action regression, whatever the camera numbers say. */
  const nc = Object.keys(evAll).filter(k => /NOT-cancelable/.test(k))
    .reduce((a, k) => a + evAll[k], 0);
  console.log(`   touchmove the browser had already claimed (NOT-cancelable): ${nc}  (want 0)`);
  console.log(`page errors ${perr.length}${perr.length ? ' — ' + perr[0] : ''}`);

  /* WHAT THIS PROBE CANNOT COVER, said plainly rather than left to be assumed. */
  console.log(`
CANNOT COVER: this is Chromium. It does not implement iOS pinch-to-zoom-the-page,
so nothing here proves the browser stops claiming the gesture on an iPhone. It
also loads the artifact directly, so the <iframe> seam in LivingMap.tsx is out of
reach. Those two need a device.`);
  await browser.close();
  process.exit(0);
})();
