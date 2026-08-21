/* L5: THE SATELLITES, ON THE SURFACE A PERSON IS LOOKING AT.
 *
 * verify_org_lens.js proves the lens against the artifact's own projections
 * and drives roleSat onto canvases made with createElement. That is the right
 * shape for the three inks and the wrong shape for everything geometric: it
 * reported 38 of 38 green while two of the three governing satellites were
 * painted underneath a building sprite and could not be seen at all. A check
 * that cannot run reports what a check that passed reports, and a check that
 * measures a scratch canvas reports what a check of the screen would report.
 *
 * So this suite reads only two things, and never the same one twice:
 *
 *   THE PAGE'S OWN PIXELS       page.screenshot(), composited, lens on vs off
 *   THE LIVE DOM's rects        getBoundingClientRect on the .poi sprite and
 *                               on every .bseal, which are the elements that
 *                               actually stand between the reader and the ink
 *
 * The satellite POINTS come out of ROLE_LAST_SATS, which the lens fills only
 * from a canvas that isConnected. Nothing here recomputes a position from the
 * same constants the lens used, because that measures the constant twice.
 *
 * EVERY COUNT IS ASSERTED BEFORE IT IS USED. An empty satellite set would
 * otherwise walk every loop below zero times and print all green.
 *
 *   node qa/verify_org_ground.js
 *   BREAK=floor node qa/verify_org_ground.js    <- the negative control
 */
const { chromium } = require('playwright');
const sharp = require('sharp');
const FILE = process.env.GROUNDS_FILE;
const EXE = process.env.PW_EXE;
const BREAK = process.env.BREAK || '';
const BOX = 7;                       // half-width of the box scored per satellite
let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

const raw = async (buf) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  return { d: data, w: info.width, h: info.height, ch: info.channels };
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1000 } });
  const page = await ctx.newPage();
  const perr = [];
  page.on('pageerror', e => perr.push(String(e)));
  await page.goto(FILE);
  await page.waitForTimeout(1100);
  await page.click('#enterBtn');                 // #introCard is z 5000 and covers everything
  await page.waitForTimeout(2600);

  /* THE NEGATIVE CONTROLS. Neither of these is decoration: the thresholds
     below are set from what they measure, and a check nobody has watched fail
     reports what a check that passed reports.
       BREAK=floor  puts the sprite's published foot back to zero, which is the
                    artifact before patch 12 exactly - the satellite lands on
                    the ring wherever the ring is, including inside the sprite.
                    G2 must go red.
       BREAK=plane  puts the lens plane back under the seals and the name
                    plates AND un-dims the seals, which is the artifact before
                    patch 13. G0e must go red.
       BREAK=ink    lets the lens record every satellite and paints none of
                    them, by taking the whole plane's opacity to zero. G5c
                    must go red at every satellite. It is a reachability
                    test for G5c and NOT a defect anybody shipped, which is
                    why `orig` below exists as well.
       BREAK=orig   THE DEFECT THIS SUITE WAS WRITTEN FOR, whole. The review
                    measured two governing satellites at 0% and 4% on the
                    composited page, and reproducing that needs BOTH halves
                    at once: the ring inside the sprite (no floor, patch 12)
                    AND the ink under the sprite (#icons is z 10 and the lens
                    was on #scene, patch 11). Either half alone is visible -
                    a satellite on the roof is ugly and G2 catches it, and a
                    plane under the SEALS is still over the SPRITES.
                    Note what this means about `plane` above: it sets z 11,
                    which is ABOVE #icons, so it models patch 13 and has
                    never once put ink under a building. Run together as
                    written the two controls still leave G5c green at 71%.
                    G0c, G0e, G2 AND G5c must go red here, and G5c at 0%.
                    Without this control the one check in the suite that
                    reads the composited page was carried by a z-index read
                    and a geometric clearance, and had never been seen to
                    fail on anything a person could have looked at. */
  if (/^(floor|orig)$/.test(BREAK)) await page.evaluate(() => {
    const tick = () => { for (const s of SCENE.structures) s._footU = 0; requestAnimationFrame(tick) };
    tick();
  });
  /* BOTH HALVES, because patch 13 was two changes and either one alone rescues
     G5c. Dropping the plane back to 11 while leaving the seals dimmed to a
     third lets the satellite read straight through them and only G0e notices.
     The control has to be the artifact as it stood, not half of it. */
  /* Z THROUGH THE ARGUMENT, NOT THE CLOSURE. `BREAK` is a Node const; read
     bare inside an injected function it throws ReferenceError, the suite
     dies before check 1, and the run prints no FAIL lines - which greps
     exactly like a clean pass. 11 is above #icons (10) and models patch 13;
     9 is below it and is the plane the satellites were actually lost on. */
  if (/^(plane|orig)$/.test(BREAK)) await page.evaluate((Z) => {
    document.getElementById('lens').style.zIndex = Z;
    document.getElementById('badges').style.opacity = '1';
  }, BREAK === 'orig' ? '9' : '11');
  /* The record keeps filling and the plane never reaches the compositor, which
     is a lens that says it drew sixteen satellites over a screen with none. */
  if (BREAK === 'ink') await page.evaluate(() => { document.getElementById('lens').style.opacity = '0' });

  await page.evaluate(() => { if (!orgOn) document.getElementById('lyOrg').click(); });
  /* WAIT FOR THE RECORD, NOT FOR A DURATION. ROLE_LAST_SATS is filled by a
     FRAME, and this artifact renders at 3-10 fps here, so the 700ms sleep
     that used to stand here was two to seven frames and sometimes none -
     which handed G0, G0b, G0c and G0e an empty array to agree about, and
     G7b a lens-on plate layout with no satellites in it. Bounded, so a lens
     that never draws fails G0 exactly as before instead of hanging here. */
  for (let i = 0; i < 60; i++) {
    const ready = await page.evaluate(() =>
      window.ROLE_LAST_SATS && window.ROLE_LAST_SATS.length >= SCENE.seats.length);
    if (ready) break;
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(true))));
  }

  /* ---------- G0: the record is real, non-empty, and on the plane that wins ----------
     Everything below indexes into ROLE_LAST_SATS. If it is empty, or if it was
     filled from a scratch canvas, or if the plane it names sits under the
     sprites, then every loop after this is a green about nothing. */
  const g0 = await page.evaluate(() => {
    const surfaces = [...new Set(ROLE_LAST_SATS.map(r => r.surface))];
    const z = id => { const el = document.getElementById(id); return el ? +getComputedStyle(el).zIndex : null };
    const el = surfaces.length === 1 ? document.getElementById(surfaces[0]) : null;
    return {
      n: ROLE_LAST_SATS.length, seats: SCENE.seats.length, surfaces,
      connected: !!(el && el.isConnected), tag: el && el.tagName,
      satZ: surfaces.length === 1 ? z(surfaces[0]) : null,
      iconsZ: z('icons'), badgesZ: z('badges'), bannersZ: z('banners'),
      /* Every FULL-VIEWPORT plane painted over the land above the satellites.
         Enumerated off the document, not listed from memory, because the whole
         defect was a plane nobody remembered. The HUD is excluded by the
         full-viewport test and not by name: #dock, #panel and the rest are
         boxes in a corner, and a satellite behind the hovercard is a satellite
         behind a thing the reader opened. */
      higher: [...document.querySelectorAll('body > *')].filter(el => {
        const s = getComputedStyle(el);
        if (s.position === 'static' || s.zIndex === 'auto' || s.display === 'none' ||
          s.visibility === 'hidden' || el.id === 'lens') return false;
        const r = el.getBoundingClientRect();
        return r.width >= innerWidth - 1 && r.height >= innerHeight - 1;
      }).map(el => ({ id: el.id || el.className, z: +getComputedStyle(el).zIndex }))
        .filter(e => e.z > 12).map(e => e.id + ':' + e.z),
      /* #scene takes no z-index at all, so getComputedStyle returns the string
         'auto' and +'auto' is NaN - and `11 > NaN` is false, which failed this
         check about a plane that was never in question. Ask the browser which
         way round the two actually paint instead. */
      sceneZ: getComputedStyle(document.getElementById('scene')).zIndex,
      aboveScene: surfaces.length === 1 && !!(document.getElementById('scene')
        .compareDocumentPosition(document.getElementById(surfaces[0])) & Node.DOCUMENT_POSITION_FOLLOWING),
      sized: !!(el && el.width > 0 && el.height > 0),
      homes: [...new Set(ROLE_LAST_SATS.map(r => r.home))].length,
    };
  });
  ok(g0.n === g0.seats && g0.n > 0,
    `G0: the lens recorded all ${g0.seats} seats as drawn satellites (${g0.n}) at ${g0.homes} buildings`);
  ok(g0.surfaces.length === 1 && g0.connected && g0.tag === 'CANVAS' && g0.sized,
    `G0b: on ONE canvas that is in the document and has a size (${JSON.stringify(g0.surfaces)}, ${g0.tag}, sized ${g0.sized})`);
  ok(g0.satZ !== null && g0.satZ > g0.iconsZ && (g0.sceneZ === 'auto' || +g0.sceneZ < g0.satZ) && g0.aboveScene,
    `G0c: whose plane is above the sprites (satellites z ${g0.satZ}, #icons z ${g0.iconsZ}, #scene z ${g0.sceneZ} and earlier in the document: ${g0.aboveScene})`);
  /* THE ONE THAT WAS MISSING. The first fix moved the satellites out from
     under the sprites and straight under the seals, which are a DIFFERENT
     plane, and nothing said so. This asks the document rather than a list.
     #vignette is the one plane allowed above, and it is named rather than
     filtered: it carries no background, only `box-shadow: inset 0 0 180px`,
     so it darkens the viewport's edges over the land and the mark by the same
     amount and cannot hide either. Anything ELSE that appears here is a new
     full-viewport plane over the org lens and wants a decision, not a pass. */
  ok(g0.satZ > g0.badgesZ && g0.satZ > g0.bannersZ && g0.higher.join() === 'vignette:20',
    `G0e: and above every other plane painted over the land - the seals at ${g0.badgesZ}, the name plates at ${g0.bannersZ}, ` +
    `with only the edge wash above it (${g0.higher.join(', ') || 'nothing'})`);

  /* ---------- how big a satellite actually is ----------
     MEASURED, not read out of the artifact's constant. A clearance budget that
     takes its own margin from the code it is auditing relaxes itself the moment
     that code shrinks the margin. roleSat is rendered once at a known centre
     and the furthest ink from it is the answer; ROLE_SAT_RIM is then checked
     AGAINST that, so editing the constant without editing the mark goes red. */
  const rim = await page.evaluate(() => {
    const S = 80, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const c2 = cv.getContext('2d');
    let far = 0;
    for (const st of ['open', 'partial', 'full']) {
      c2.clearRect(0, 0, S, S);
      roleSat(c2, S / 2, S / 2, '#6fae52', st, false, 0);
      const d = c2.getImageData(0, 0, S, S).data;
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++)
        if (d[(y * S + x) * 4 + 3] > 24) { const r = Math.hypot(x - S / 2, y - S / 2); if (r > far) far = r }
    }
    return { measured: +far.toFixed(2), named: typeof ROLE_SAT_RIM === 'number' ? ROLE_SAT_RIM : null };
  });
  /* Sub-pixel either way. The constant is the ink's real reach (~8.1: a 5.8
     arc under a 2.6 keyline is 7.1 of geometry, and a stroked arc antialiases
     outward from there), so a roleSat that changes its arc or its keyline
     without changing the constant parts company with it here. */
  ok(rim.named !== null && Math.abs(rim.measured - rim.named) <= 0.6,
    `G0d: the satellite's ink reaches ${rim.measured} units and ROLE_SAT_RIM says ${rim.named}`);
  const RIM = Math.max(rim.measured, rim.named || 0);

  /* ---------- G1..G4 swept over the zoom range ----------
     The sprite's size in SCENE units is not constant: syncBanners scales it by
     k = clamp(0.28+cam.z*0.5, .5, 1.4) and the lens draws in scene units, so
     k/cam.z runs 1.06 at cam.z .5 down to 0.47 at 3. One zoom proves one zoom. */
  /* n REAL FRAMES, not n milliseconds. Measured on this artifact in this
     browser: 3 to 10 frames a second. Every wall-clock sleep in a suite
     that screenshots or reads geometry was sized for sixty. */
  const frames = n => page.evaluate(k => new Promise(res => {
    let c = 0;
    const step = () => (++c >= k ? res(true) : requestAnimationFrame(step));
    requestAnimationFrame(step);
  }), n);

  /* SET THE CAMERA AND PROVE IT TOOK. The intro fly-through owns cam.z for
     seconds after #enterBtn and overwrites anything assigned under it -
     measured: cam.z=0.9 sticks at 0.8893 until it finishes. `travel=null`
     and zeroed velocity are the suite's own idiom from restPlates(); the
     read-back is what makes it a fact rather than a hope. Returns the zoom
     actually held, so the caller can assert on it. */
  const setZoom = async (Z, k) => {
    let got = null;
    for (let i = 0; i < 25; i++) {
      await page.evaluate(([zz, kk]) => {
        travel = null; cam.vx = cam.vy = 0;
        cam.z = zz;
        if (kk) { cam.x = BY[kk].x; cam.y = BY[kk].y }
        clampCam();
      }, [Z, k || null]);
      await frames(3);
      got = await page.evaluate(() => cam.z);
      if (Math.abs(got - Z) < 1e-6) return got;
    }
    return got;
  };

  const ZOOMS = [0.9, 1.2, 1.6, 2.0, 2.4];
  const zoomsGot = [];
  const worstSprite = { clr: Infinity }, worstSeal = { clr: Infinity }, worstPair = { gap: Infinity };
  const sealZooms = [];
  let scored = 0, homesSeen = 0;

  for (const Z of ZOOMS) {
    zoomsGot.push(await setZoom(Z));
    const step = await page.evaluate((RIM) => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => {
      const out = { z: cam.z, sprite: [], seal: [], pair: [], n: ROLE_LAST_SATS.length };
      /* THE SPRITE BOX, off the live DOM, in scene units. This is the element
         that stood between the reader and the ink, so it is measured and not
         modelled: getBoundingClientRect on the visible child, converted through
         the same worldToScreen the lens's own transform mirrors. */
      const box = {};
      for (const s of SCENE.structures) {
        const p = document.querySelector('.poi[data-k="' + s.key + '"]');
        if (!p || p.style.display === 'none') continue;
        const img = p.querySelector('.sprite');
        const vis = img && getComputedStyle(img).display !== 'none' ? img : null;
        const r = (vis || p).getBoundingClientRect();
        const [ax, ay] = worldToScreen(s.x, s.y);
        box[s.key] = {
          l: s.x + (r.left - ax / DPR) / cam.z, r: s.x + (r.right - ax / DPR) / cam.z,
          t: s.y + (r.top - ay / DPR) / cam.z, b: s.y + (r.bottom - ay / DPR) / cam.z,
        };
      }
      /* THE SEALS, off the live DOM too. They ride #badges at z 12, above the
         satellite plane, so a satellite under one is a satellite behind one. */
      const seals = [];
      for (const el of document.querySelectorAll('#badges .bseal, #badges .b-more, #badges .hchip, #badges .aseal')) {
        const g = el.closest('.bgroup');
        if (!g || !g.classList.contains('on') || getComputedStyle(el).display === 'none') continue;
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        const cx0 = (r.left + r.right) / 2, cy0 = (r.top + r.bottom) / 2;
        seals.push({ x: cx0, y: cy0, rad: Math.min(r.width, r.height) / 2 });
      }
      const byHome = {};
      for (const rec of ROLE_LAST_SATS) (byHome[rec.home] || (byHome[rec.home] = [])).push(rec);
      for (const k of Object.keys(byHome)) {
        const b = box[k];
        for (const rec of byHome[k]) {
          if (b) {
            /* Clearance from the building's own box: how far OUTSIDE it the
               satellite's outer edge sits, on its best axis. Negative means the
               ink is on the sprite. */
            const c = Math.max(b.l - (rec.x + RIM), (rec.x - RIM) - b.r,
              b.t - (rec.y + RIM), (rec.y - RIM) - b.b);
            out.sprite.push({ k, seat: rec.seat, clr: +c.toFixed(2) });
          }
          const [sx, sy] = worldToScreen(rec.x, rec.y);
          const px0 = sx / DPR, py0 = sy / DPR, myRad = RIM * cam.z;
          for (const sl of seals) {
            const d = Math.hypot(sl.x - px0, sl.y - py0) - sl.rad - myRad;
            if (d < 60) out.seal.push({ k, seat: rec.seat, clr: +d.toFixed(2) });
          }
        }
        const l = byHome[k];
        for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++)
          out.pair.push({ k, gap: +(Math.hypot(l[i].x - l[j].x, l[i].y - l[j].y) - 2 * RIM).toFixed(2) });
      }
      out.homes = Object.keys(byHome).length;
      out.seals = seals.length;
      return res(out);
    }))), RIM);
    scored += step.sprite.length;
    sealZooms.push({ z: +step.z.toFixed(2), seals: step.seals, pairs: step.seal.length });
    homesSeen = Math.max(homesSeen, step.homes);
    for (const r of step.sprite) if (r.clr < worstSprite.clr) Object.assign(worstSprite, r, { z: step.z });
    for (const r of step.seal) if (r.clr < worstSeal.clr) Object.assign(worstSeal, r, { z: step.z });
    for (const r of step.pair) if (r.gap < worstPair.gap) Object.assign(worstPair, r, { z: step.z });
  }

  /* THE SWEEP MEASURED WHERE IT SAID IT DID. Without this, an intro
     animation holding the camera turns five zooms into 0.84, 0.84, 1.6,
     2.0, 2.4 - and every count below still comes out right, because there
     are still five entries. The duplicate is invisible downstream: G3b
     compared 0.84 against itself and called it two zooms. */
  ok(zoomsGot.length === ZOOMS.length &&
    zoomsGot.every((z, i) => z !== null && Math.abs(z - ZOOMS[i]) < 1e-6),
    `G1z: every zoom the sweep asked for is the zoom it measured at ` +
    `(asked ${ZOOMS.join(', ')}; got ${zoomsGot.map(z => z === null ? 'null' : z.toFixed(4)).join(', ')})`);
  ok(scored === g0.seats * ZOOMS.length,
    `G1: ${scored} satellite/sprite clearances scored, one per seat per zoom, over ${ZOOMS.length} zooms and ${homesSeen} buildings`);
  ok(worstSprite.clr >= 0,
    `G2: no satellite's ink lands on its building's sprite (worst ${worstSprite.clr} units at ${worstSprite.k}/${worstSprite.seat}, cam.z ${worstSprite.z})`);
  ok(worstPair.gap >= 0,
    `G3: no two satellites at one building overlap (worst gap ${worstPair.gap} units at ${worstPair.k}, cam.z ${worstPair.z})`);
  /* G4 IS A RATCHET, AND IT IS DELIBERATELY NOT ">= 0".
     Edge-to-edge clearance from every seal is not achievable on this land and
     saying so is the finding, not an excuse. Measured at cam.z 2.4 with the
     camera on the Community Center: 50 seals on screen, on rings of ~39 scene
     units around five buildings 58 to 87 apart, spaced against themselves at
     BADGE_GAP 44 px and explicitly NOT against each other. The nearest seal to
     the worst satellite is 18.1 px centre to centre and its own radius is 15.7,
     so no radius, arc or rotation within reach of that building is free.
     What IS asserted, and is what the reader actually experiences, is (a) the
     satellites own the plane above the seals - G0e - and (b) their ink reaches
     the composited page anyway - G5c. This number then holds the line: it may
     not get worse, so a change that piles more marks into that ground has to
     answer for it here instead of passing quietly.
     THE NUMBER IS INTERMITTENT AND THE RATCHET LEAVES ROOM FOR IT. The seals
     take their angles from solveRotations, which rotates a ring by a few
     degrees depending on which neighbour it settles against first, so the same
     artifact measured 15.17 and 16.40 on two runs that differed in nothing
     else. A ratchet at the last number seen would fail on the next run and
     teach the lane to re-baseline it; 20 is clear of the observed spread and
     still a long way from a satellite sitting on a seal's centre, which is 30
     and up. */
  const SEAL_RATCHET = -20.0;
  /* AND THE SEALS WERE THERE TO BE MEASURED. syncBanners hides every badge
     group below cam.z 1.0, so the lowest zoom in the sweep contributes NOTHING
     to the seal comparison - and a version of this that stopped drawing seals
     entirely would take G4 from "worst -15" to "no comparisons at all" and
     print PASS. The counts are asserted before the worst of them is trusted. */
  const withSeals = sealZooms.filter(z => z.seals > 0);
  ok(withSeals.length >= 4 && withSeals.every(z => z.pairs > 0),
    `G3b: seals were on screen and compared at ${withSeals.length} of the ${ZOOMS.length} zooms ` +
    `(${sealZooms.map(z => `z${z.z}:${z.seals} seals/${z.pairs} pairs`).join(', ')})`);
  ok(worstSeal.clr >= SEAL_RATCHET,
    `G4: satellites share ground with the seals and no more of it than before (worst overlap ${(-worstSeal.clr).toFixed(2)} px of ${-SEAL_RATCHET} allowed, at ${worstSeal.k}/${worstSeal.seat}, cam.z ${worstSeal.z}); they are legible because they own the plane above, not because the ground is clear`);

  /* ---------- G5: the composited page, one camera per building ----------
     The only check here that a person could have run by looking. Each
     satellite's 15x15 box is diffed between the page with the lens on and the
     same page with it off; a satellite something covers changes nothing. The
     camera is centred on the building first so nothing is scored while it is
     off the viewport or under the HUD, and that is asserted, not assumed. */
  await setZoom(2.0);
  await page.waitForTimeout(400);
  const zNow = await page.evaluate(() => cam.z);
  /* WHERE THE MARK'S OWN INK IS DENSEST, MEASURED. The first cut of this
     sampled a single radius picked by a heuristic and landed at 4 - inside the
     hollow, on the dark fill of an `open` satellite, over the dark forest
     under the Community Center. It scored three perfectly visible satellites
     at 69-78% and had nothing to do with whether they were covered.
     The band is the OUTER HALF of the mark, which is where the black keyline
     and the coloured rim both live in all three states, taken as a fraction of
     the measured reach so a redrawn satellite moves the band with it. */
  const RING = [0.62, 0.78, 0.93].map(f => +(f * rim.measured).toFixed(2));
  const homes = await page.evaluate(() => [...new Set(ROLE_LAST_SATS.map(r => r.home))]);
  ok(RING[0] >= 3 && RING[2] <= rim.measured,
    `G5a: scored on the mark's outer half, radii ${RING.join('/')} of the ${rim.measured} its ink reaches`);
  ok(homes.length > 0, `G5: ${homes.length} buildings to walk with the camera`);
  const shots = [];
  for (const k of homes) {
    await page.evaluate(kk => { cam.x = BY[kk].x; cam.y = BY[kk].y; clampCam(); }, k);
    await page.waitForTimeout(430);
    const pts = await page.evaluate(kk => ROLE_LAST_SATS.filter(r => r.home === kk).map(r => {
      const [x, y] = worldToScreen(r.x, r.y);
      return { seat: r.seat, x: x / DPR, y: y / DPR };
    }), k);
    /* THE LENS'S OWN INK IS THE ONLY THING THAT MOVES BETWEEN THESE TWO SHOTS.
       This used to click the Org button, which also drops `body.org-lens` and
       so un-dims fifty badge seals: a satellite that reached the screen not at
       all still scored 50% of its keyline, because half those sample points sat
       on a seal that got brighter. Measured with the ink suppressed and the
       button still on, the floor from the mode alone was 0-51%. Hiding the
       PLANE leaves the mode, the seals and the land exactly where they are. */
    const on = await raw(await page.screenshot());
    await page.evaluate(() => { document.getElementById('lens').style.visibility = 'hidden' });
    await page.waitForTimeout(300);
    const off = await raw(await page.screenshot());
    await page.evaluate(() => { document.getElementById('lens').style.visibility = '' });
    await page.waitForTimeout(300);
    /* SCORED ON THE MARK'S OWN RIM, NOT OVER A BOX. A box around an `open`
       satellite is mostly its dark hollow fill, and dark fill on the dark
       forest under the Community Center changes almost nothing however visible
       the mark is - so a box score measures the ground as much as the mark.
       36 angles by three radii across the outer half, where the black keyline
       and the coloured rim both are in every one of the three states. */
    for (const p of pts) {
      let diff = 0, tot = 0, clipped = false;
      for (let i = 0; i < 36; i++) {
        const a = i * Math.PI / 18;
        for (const rr of RING.map(v => v * zNow)) {
          const x = Math.round(p.x + rr * Math.cos(a)), y = Math.round(p.y + rr * Math.sin(a));
          if (x < 0 || y < 0 || x >= on.w || y >= on.h) { clipped = true; continue }
          const j = (y * on.w + x) * on.ch; tot++;
          if (Math.abs(on.d[j] - off.d[j]) > 8 || Math.abs(on.d[j + 1] - off.d[j + 1]) > 8 ||
            Math.abs(on.d[j + 2] - off.d[j + 2]) > 8) diff++;
        }
      }
      shots.push({ home: k, seat: p.seat, whole: !clipped && tot === 108, p: tot ? diff / tot : 0 });
    }
  }
  console.log('  --- composited, per satellite: ' +
    shots.slice().sort((a, b) => a.p - b.p).map(s => `${s.home}/${(100 * s.p).toFixed(0)}%`).join(' '));
  ok(shots.length === g0.seats && shots.every(s => s.whole),
    `G5b: all ${g0.seats} satellites scored on the full 108-point keyline, on screen (${shots.length} scored, ${shots.filter(s => !s.whole).length} clipped)`);
  /* 58%, AND IT SITS IN A MEASURED GAP. Three populations off the same 16
     satellites on the same land:
        not on the screen at all    0, sixteen times   (BREAK=ink)
        covered by the seals        19, 27, 45         (before patches 12-15)
        clear                       70 .. 80           (as shipped)
     The middle row is the state the review found and it is kept here as the
     reason for the number even though the land no longer reproduces it: patch
     15 sent the three Wisdom roles back to the council fire, so the Community
     Center - the crowded building whose fifty seals were doing the covering -
     has no satellites left to cover. BREAK=ink is the control that still
     reaches this check, and it produces a clean zero.
     The line is not at 90 because the spread inside the clear population is
     GROUND CONTRAST - a dark keyline over dark forest against the same keyline
     over a path - and not partial covering. */
  const dim = shots.filter(s => s.p < 0.58).sort((a, b) => a.p - b.p);
  ok(dim.length === 0,
    `G5c: every satellite's keyline reaches the COMPOSITED page (worst ${(100 * shots.slice().sort((a, b) => a.p - b.p)[0].p).toFixed(0)}%` +
    (dim.length ? ', covered: ' + dim.map(d => `${d.home}/${d.seat} ${(100 * d.p).toFixed(0)}%`).join(', ') : '') + ')');

  /* ---------- S: THE MAP MAY NOT CONTRADICT ITSELF ABOUT ITS OWN SEATS ----------
     `seatsAt()` answers "which seats are ADDRESSED here" and feeds the
     hovercard and the seat seal; `roleSeatsBy()` answers "which seats DRAW
     here" and feeds the lens. Both were computed every frame and compared by
     nothing, and they disagreed at the two buildings the governing rule
     touched: the Community Center's card said "0 seats open" with no seal
     while the lens drew three satellites on it, and the Council Fire's said
     "4 seats open" with a seal while the lens drew one.
     Read off the RENDERED HOVERCARD, as text, and off the seal in the badge
     plane - the two surfaces a person actually reads - and never off either
     function, so a change to one of them cannot move the check with it. */
  await setZoom(2.0);
  await page.evaluate(() => { if (!orgOn) document.getElementById('lyOrg').click() });
  await page.waitForTimeout(600);
  const seatRow = () => page.evaluate(() => {
    const drew = {};
    for (const r of ROLE_LAST_SATS) drew[r.home] = (drew[r.home] || 0) + 1;
    const rows = [];
    for (const s of SCENE.structures) {
      if (!seatsAt(s.key).length && !drew[s.key]) continue;
      showHover(s, { getBoundingClientRect: () => ({ left: 40, top: 300 }) });
      const m = document.getElementById('hovercard').textContent.match(/(\d+)\s+seats?\s+open/);
      rows.push({
        k: s.key, card: m ? +m[1] : null, lens: drew[s.key] || 0,
        seal: !!(bgEls[s.key] && bgEls[s.key].querySelector('.bseal.b-seat')),
      });
    }
    hideHover();
    return { rows, moved: SCENE.seats.filter(roleDefaulted).map(x => x.s + ' (' + x.at + '->' + roleHome(x) + ')') };
  });
  const s1 = await seatRow();
  ok(s1.rows.length >= 8 && s1.rows.every(r => r.card !== null),
    `S1: ${s1.rows.length} buildings carry seats and every one of them rendered a number on its hovercard`);
  const bad = s1.rows.filter(r => r.card !== r.lens);
  ok(bad.length === 0,
    `S2: the hovercard's count and the lens's satellites are the same number at every building` +
    (bad.length ? ' -> ' + bad.map(b => `${b.k} card ${b.card} vs lens ${b.lens}`).join(', ') : ''));
  const sealBad = s1.rows.filter(r => r.seal !== (r.lens > 0));
  ok(sealBad.length === 0,
    `S2b: and the seat seal stands exactly where the lens draws` +
    (sealBad.length ? ' -> ' + sealBad.map(b => `${b.k} seal ${b.seal} lens ${b.lens}`).join(', ') : ''));
  ok(s1.moved.length === 0,
    `S3: no role draws away from the address it carries${s1.moved.length ? ' -> ' + s1.moved.join(', ') : ''}`);

  /* S4: AND NONE OF THAT IS BECAUSE THE MACHINERY IS DEAD.
     Three checks that all read zero are three checks that pass on an artifact
     with the rule ripped out. So the rule is made to fire: a seat at the
     council fire is given the Finance circle, whose home is the market, and
     everything above has to move by exactly one in each direction. */
  const s4 = await page.evaluate(async () => {
    /* NOT ANY council seat. `roleHome` returns a founder's own word before it
       ever reaches the governing branch, so picking Storyweaver - which
       classify() calls 'creator' - moved nothing and made this check look
       broken when it was the fixture that was wrong. */
    const x = SCENE.seats.find(s => s.at === 'council' && classify(s) !== 'creator');
    const keep = x.c; x.c = 'Finance';
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const drew = {};
    for (const r of ROLE_LAST_SATS) drew[r.home] = (drew[r.home] || 0) + 1;
    const out = {
      seat: x.s, drawsAt: roleHome(x), defaulted: roleDefaulted(x),
      council: drew.council || 0, market: drew.market || 0,
      cardCouncil: (() => { showHover(BY.council, { getBoundingClientRect: () => ({ left: 40, top: 300 }) }); const m = document.getElementById('hovercard').textContent.match(/(\d+)\s+seats?\s+open/); hideHover(); return m ? +m[1] : null })(),
    };
    x.c = keep;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    out.restored = (ROLE_LAST_SATS.filter(r => r.home === 'council').length);
    return out;
  });
  ok(s4.drawsAt === 'market' && s4.defaulted === true && s4.council === 3 && s4.market === 1 &&
    s4.cardCouncil === 4 && s4.restored === 4,
    `S4: forced apart, the two counts DO separate and roleDefaulted names the seat that did it ` +
    `(${s4.seat} drew at ${s4.drawsAt}; council card ${s4.cardCouncil} vs lens ${s4.council}, market lens ${s4.market}; back to ${s4.restored} on release)`);

  /* ---------- G7: what the lens COSTS the map it is drawn over ----------
     The satellites join window.BADGE_PTS so the name plates dodge them, and a
     plate that cannot find a spot hides - which is the plate solver working as
     designed, and is also a building name disappearing when the reader presses
     Org. Measured off the DOM at four zooms and three cameras: identical at
     1.2, 1.6 and 2.4, and exactly one plate of 12 to 15 steps aside at 2.0.
     Bounded here rather than left as a thing somebody notices later. */
  /* THE COUNT IS TAKEN WHEN THE MAP HAS STOPPED MOVING, NOT AFTER 430ms.
     `cam` is not a variable you can set: frame() re-drives it from cam.vx/vy
     every frame and, while a flight is in the air, from `travel` - a cubic
     ease running about 625ms that overwrites cam.x/cam.y outright. Measured
     over ten runs of this loop, the camera moved up to 197.74 world units
     between the `off` count and the `on` count, so the pair being subtracted
     was two different views of the land. Sampled with the map at rest,
     council at z2.0 holds 12 plates with the lens on and 12 with it off; the
     unsettled `off` reads 15, and 15-12 is the intermittent 'worst 3' this
     check used to print about a cost that is not there.
     restPlates(): cancel the flight, zero the inertia, clamp, then poll until
     the visible plate set is the SAME three polls running. Returns null if it
     never settles, and G7c is the check that says so - a silent timeout would
     hand the old number to the old check and print the old green. */
  const restPlates = async (z, k) => {
    if (z !== null) await page.evaluate(([zz, kk]) => {
      travel = null; cam.vx = cam.vy = 0;
      cam.z = zz; cam.x = BY[kk].x; cam.y = BY[kk].y; clampCam();
    }, [z, k]);
    try {
      const h = await page.waitForFunction(() => {
        const n = [...document.querySelectorAll('#banners .banner')]
          .filter(e => e.style.display !== 'none').length;
        const s = (window.__plateRun && window.__plateRun.n === n)
          ? { n: n, k: window.__plateRun.k + 1 } : { n: n, k: 1 };
        window.__plateRun = s;
        return (!travel && s.k >= 3) ? s.n : false;
      }, null, { timeout: 6000, polling: 130 });
      return await h.jsonValue();
    } catch (e) { return null }
  };
  const plates = [];
  for (const Z of [1.2, 1.6, 2.0, 2.4]) for (const k of ['community', 'council', 'kitchen']) {
    await page.evaluate(() => { if (orgOn) document.getElementById('lyOrg').click(); window.__plateRun = null });
    const off = await restPlates(Z, k);
    await page.evaluate(() => { document.getElementById('lyOrg').click(); window.__plateRun = null });
    const on = await restPlates(null, null);
    plates.push({ Z, k, off, on, lost: (off === null || on === null) ? null : off - on });
  }
  ok(plates.length === 12 && plates.every(p => p.off !== null && p.on !== null),
    `G7c: every plate count was taken with the map at rest - the camera landed and ` +
    `the plate set held over three polls (${plates.filter(p => p.off === null || p.on === null).length} never settled)`);
  ok(plates.length === 12 && plates.every(p => p.off > 0),
    `G7: ${plates.length} plate counts taken with names actually on screen (${plates.map(p => p.off).join(',')})`);
  const worstLost = Math.max(...plates.map(p => p.lost));
  ok(worstLost <= 1,
    `G7b: turning the lens on costs at most one building name of the dozen on screen (worst ${worstLost}, at ` +
    `${(plates.find(p => p.lost === worstLost) || {}).k} cam.z ${(plates.find(p => p.lost === worstLost) || {}).Z})`);

  ok(perr.length === 0, `G6: zero page errors (${perr.length}${perr.length ? ': ' + perr[0] : ''})`);

  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})();
