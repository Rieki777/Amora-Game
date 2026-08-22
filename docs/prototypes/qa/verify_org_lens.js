/* L5: the org lens on the land, as the ARTIFACT models it.
 *
 * The halo set is read back out of roleHomes(), the drawn satellite set out of
 * ROLE_LAST_SATS, and the three inks are proven by driving roleSat onto a
 * scratch canvas and reading the pixels it laid down.
 *
 * WHAT THIS SUITE IS NOT. It does not, anywhere, look at the screen. It reported
 * 38 of 38 green while two of the three governing satellites were painted
 * underneath a building sprite and invisible, because a scratch canvas has no
 * sprite on it and no plane above it. Anything about POSITION, OCCLUSION or
 * LEGIBILITY belongs in qa/verify_org_ground.js, which measures the composited
 * page and the live DOM and nothing else, and this header exists so the next
 * reader does not mistake a green here for a map that works.
 *
 * L3 was that mistake in miniature: it summed roleSeatsBy() and claimed "every
 * role draws a satellite", while roleLens filters that grouping again for
 * blueprints in `now` mode. It reads the lens's own record now.
 *
 * SCENE/CIRCLE_COL/CIRCLE_HOMES are script-scope const and NOT window
 * properties, so every predicate here uses bare identifiers behind a typeof
 * guard and never `window.SCENE`.
 */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE;
const EXE = process.env.PW_EXE;
let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1000 } });
  const page = await ctx.newPage();
  const perr = [];
  page.on('pageerror', e => perr.push(String(e)));
  await page.goto(FILE); await page.waitForTimeout(1100);
  // #introCard is z 5000 and covers the viewport at rest.
  await page.click('#enterBtn'); await page.waitForTimeout(2600);

  /* ---------- L1: halos only where circles live ---------- */
  const l1 = await page.evaluate(() => {
    const homes = roleHomes('now');
    const curated = [...new Set(Object.keys(CIRCLE_HOMES).map(c => CIRCLE_HOMES[c]).filter(k => BY[k]))];
    return {
      n: homes.length,
      structures: SCENE.structures.length,
      keys: homes.map(h => h.k).sort(),
      curated: curated.sort(),
      shared: homes.filter(h => h.circles.length > 1).map(h => ({ k: h.k, c: h.circles })),
    };
  });
  ok(l1.n === 10 && l1.keys.join() === l1.curated.join(),
    `L1: ${l1.n} halos at the curated circle homes, not ${l1.structures} at every building`);
  ok(l1.shared.length === 1 && l1.shared[0].k === 'community' && l1.shared[0].c.length === 2,
    `L1b: a home two circles share draws once and names both (${JSON.stringify(l1.shared)})`);

  /* ---------- L2: the radii cannot overlap ---------- */
  const l2 = await page.evaluate(() => {
    const homes = roleHomes('now');
    const bad = [];
    let flat46 = 0;
    for (let i = 0; i < homes.length; i++) for (let j = i + 1; j < homes.length; j++) {
      const a = homes[i], b = homes[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d < 92) flat46++;                       // what a flat radius 46 would have overlapped
      if (a.r + b.r > d + 1e-6) bad.push({ a: a.k, b: b.k, d: +d.toFixed(1), sum: +(a.r + b.r).toFixed(1) });
    }
    return { bad, flat46, radii: homes.map(h => ({ k: h.k, r: +h.r.toFixed(1) })).sort((x, y) => x.r - y.r) };
  });
  ok(l2.bad.length === 0 && l2.flat46 === 8,
    `L2: 0 overlapping halo pairs where a flat 46 gave ${l2.flat46}` +
    (l2.bad.length ? ' -> ' + JSON.stringify(l2.bad) : ''));
  ok(l2.radii[0].r >= 18 && l2.radii[l2.radii.length - 1].r <= 46,
    `L2b: every radius inside [18,46] (${l2.radii[0].r} .. ${l2.radii[l2.radii.length - 1].r})`);

  /* ---------- L3: one satellite per role, at the building it answers to ----------
     READ OFF WHAT THE LENS ACTUALLY DREW, not off roleSeatsBy().
     This check used to sum roleSeatsBy() and say "every role draws a
     satellite". roleSeatsBy() groups seats; roleLens then walks that grouping
     and skips any building that is a blueprint in `now` mode, which
     roleSeatsBy knows nothing about. Forced - one seat moved onto a blueprint -
     the old check grouped 16 and reported 16 while the lens drew 15. So it read
     one side of a filter and made a claim about the other.
     ROLE_LAST_SATS is the lens's own record, written only from a canvas that is
     in the document, so this is the drawn set and not a projection of it. */
  await page.evaluate(() => { if (!orgOn) document.getElementById('lyOrg').click() });
  await page.waitForTimeout(600);
  const l3 = await page.evaluate(() => {
    const per = {};
    for (const r of ROLE_LAST_SATS) per[r.home] = (per[r.home] || 0) + 1;
    return { drawn: ROLE_LAST_SATS.length, grouped: Object.keys(roleSeatsBy()).reduce((n, k) => n + roleSeatsBy()[k].length, 0), seats: SCENE.seats.length, per };
  });
  ok(l3.drawn === l3.seats && l3.drawn > 0,
    `L3: the lens drew a satellite for every one of the ${l3.seats} roles (${l3.drawn}) at ${Object.keys(l3.per).length} buildings`);

  /* L3b: AND THE FILTER THE OLD CHECK COULD NOT SEE. A blueprint building in
     `now` mode carries no sprite and takes no satellites; in `vision` it does.
     Forced, because on the shipped land no blueprint holds a seat and a check
     that never exercises its own subject is a check about nothing. */
  const l3b = await page.evaluate(async () => {
    const step = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const bp = SCENE.structures.find(s => s.state === 'blueprint');
    const x = SCENE.seats.find(s => s.at && roleHome(s) === s.at);
    const keepAt = x.at, keepMode = mode;
    x.at = bp.key;
    setMode('now'); await step();
    const now = { n: ROLE_LAST_SATS.length, atBp: ROLE_LAST_SATS.filter(r => r.home === bp.key).length, grouped: (roleSeatsBy()[bp.key] || []).length };
    setMode('vision'); await step();
    const vision = { n: ROLE_LAST_SATS.length, atBp: ROLE_LAST_SATS.filter(r => r.home === bp.key).length };
    x.at = keepAt; setMode(keepMode); await step();
    return { bp: bp.key, seat: x.s, now, vision, back: ROLE_LAST_SATS.length, seats: SCENE.seats.length };
  });
  ok(l3b.now.n === l3b.seats - 1 && l3b.now.atBp === 0 && l3b.now.grouped === 1 &&
    l3b.vision.atBp === 1 && l3b.back === l3b.seats,
    `L3b: a role on a blueprint is GROUPED (${l3b.now.grouped}) and not DRAWN in now (${l3b.now.n} of ${l3b.seats}), ` +
    `and drawn in vision (${l3b.vision.atBp} at ${l3b.bp}) - the filter roleSeatsBy() cannot see`);

  /* PUT THE LENS BACK. L3 is the first check here that needs it ON, because it
     reads what the lens drew rather than what a projection says it would draw,
     and L7 below is written from the page's resting state and toggles from
     there. Leaving it on made L7's click turn the lens OFF and took two checks
     red about a key that was working. */
  await page.evaluate(() => { if (orgOn) document.getElementById('lyOrg').click() });
  await page.waitForTimeout(300);

  /* ---------- L4: a governing role gathers at ITS OWN circle's home ----------
     THIS CHECK USED TO ASSERT THE BUG. It read "3 governing roles gather at the
     Community Center" and passed, and those three were Wisdom roles ADDRESSED
     AT THE COUNCIL FIRE being dragged off it - against CIRCLE_HOMES, which says
     Wisdom lives at the council fire. The old ROLE_GOV_HOME contradicted that
     table for three of the four circles it claimed. The rule reads the table
     now, so on this land nothing defaults at all, and the interesting half of
     the check is the half that has to be forced. */
  const l4 = await page.evaluate(() => {
    const before = SCENE.seats.map(x => x.at + '@' + x.c);
    const moved = SCENE.seats.filter(x => roleDefaulted(x)).map(x => ({ s: x.s, c: x.c, at: x.at, draws: roleHome(x) }));

    /* FORCED, three ways, because "nothing moved" passes on an artifact with
       the whole rule deleted. A governing role whose address is a guess is
       moved to its circle's home; the same role with a founder's word on it is
       never moved; and a governing circle with no home on the land falls back
       to the village centre and nowhere else. */
    const g = SCENE.seats.find(x => x.c === 'Wisdom' && classify(x) !== 'creator');
    const keepAt = g.at, keepC = g.c, keepAddr = g.addr;
    g.at = 'gate';                              // a guessed address somewhere else entirely
    const gathered = roleHome(g);               // -> CIRCLE_HOMES.Wisdom
    g.addr = 'creator';
    const founder = roleHome(g);                // -> the address the founder wrote
    g.addr = keepAddr;
    g.c = 'Finance';
    const otherCircle = roleHome(g);            // -> CIRCLE_HOMES.Finance, not the centre
    g.c = '__no-such-circle__'; ROLE_GOV[g.c] = 1;
    const fallback = roleHome(g);               // -> ROLE_GOV_HOME, the last resort
    delete ROLE_GOV[g.c];
    g.at = keepAt; g.c = keepC;

    const after = SCENE.seats.map(x => x.at + '@' + x.c);
    return {
      moved, wrote: before.join('|') !== after.join('|'),
      seat: g.s, gathered, founder, otherCircle, fallback,
      wisdomHome: CIRCLE_HOMES.Wisdom, financeHome: CIRCLE_HOMES.Finance, centre: ROLE_GOV_HOME,
    };
  });
  ok(l4.moved.length === 0,
    `L4: no role on this land draws away from the address it carries` +
    (l4.moved.length ? ' -> ' + l4.moved.map(m => `${m.s} ${m.at}->${m.draws}`).join(', ') : ''));
  ok(l4.gathered === l4.wisdomHome && l4.otherCircle === l4.financeHome,
    `L4b: forced, a governing role with a guessed address gathers at ITS CIRCLE'S home ` +
    `(Wisdom -> ${l4.gathered}, expected ${l4.wisdomHome}; as Finance -> ${l4.otherCircle}, expected ${l4.financeHome})`);
  ok(l4.founder === 'gate',
    `L4c: and the same role carrying a founder's word is never moved at all (stayed at ${l4.founder})`);
  ok(l4.fallback === l4.centre,
    `L4d: a governing circle with no home on the land falls back to the village centre, which is all ROLE_GOV_HOME is now (${l4.fallback})`);
  ok(l4.wrote === false, 'L4e: and none of it WROTE anything; every seat keeps the address and circle it had');

  /* ---------- L5: three states, three inks ----------
     Sampled INSIDE the disc, at radius 2, so the stroked rim contributes
     nothing. The rim is the same circle colour in all three states, so counting
     it measured the one thing that never varies; and at radius 3 the rim's own
     antialiasing bled far enough in to read as a fill. The rim spans 3.4 to 5.0
     (r 4.2, width 1.6), which leaves radius 2 clear of it. */
  const l5 = await page.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 40;
    const c2 = cv.getContext('2d');
    const read = st => {
      c2.clearRect(0, 0, 40, 40);
      roleSat(c2, 20, 20, '#6fae52', st, false, 0);
      const d = c2.getImageData(0, 0, 40, 40).data;
      const at = (x, y) => { const i = (y * 40 + x) * 4; return d[i + 1] > d[i] + 20 && d[i + 1] > d[i + 2] + 20 };
      /* Count the CIRCLE COLOUR, not the total ink. Every state lays down the
         same black keyline and the same coloured rim, so total ink is identical
         by construction and measuring it measures the one thing that cannot
         vary. What varies is how much of the disc the circle's colour fills. */
      let col = 0;
      for (let y = 0; y < 40; y++) for (let x = 0; x < 40; x++) if (at(x, y)) col++;
      return { left: at(18, 20), right: at(22, 20), ink: col };
    };
    return { open: read('open'), partial: read('partial'), full: read('full') };
  });
  const { open, partial, full } = l5;
  ok(full.left && full.right, `L5: full is filled on both sides of its centre (${full.left}/${full.right})`);
  ok(!partial.left && partial.right, `L5b: partial is filled on ONE side only (left ${partial.left}, right ${partial.right})`);
  ok(!open.left && !open.right && open.ink > 20,
    `L5c: open is hollow and still drawn (left ${open.left}, right ${open.right}, ${open.ink} px of colour)`);
  ok(full.ink > partial.ink && partial.ink > open.ink,
    `L5d: the three read as three at a glance, by area of circle colour (open ${open.ink} < partial ${partial.ink} < full ${full.ink})`);

  /* ---------- L6: relevance answers TRUE until a party is pushed ---------- */
  const l6 = await page.evaluate(() => {
    const none = [roleRelevant(null), roleRelevant([]), roleRelevant(['building'])];
    ROLE_PARTY = ['building'];
    const set = { untagged: roleRelevant(null), empty: roleRelevant([]), mine: roleRelevant(['building']), theirs: roleRelevant(['storytelling']) };
    ROLE_PARTY = null;
    return { none, set };
  });
  ok(l6.none.every(Boolean), 'L6: with no party pushed every role is relevant');
  ok(l6.set.untagged && l6.set.empty && l6.set.mine && !l6.set.theirs,
    'L6b: with a party, untagged and empty both belong to everyone and only a foreign tag is narrowed');

  /* ---------- L7: the lens bar hides under the chart ---------- */
  const l7 = await page.evaluate(() => {
    const vis = el => { const s = getComputedStyle(el); return s.display !== 'none' && s.visibility !== 'hidden' };
    const layers = document.getElementById('layers'), key = document.getElementById('roleKey');
    const before = vis(layers);
    document.getElementById('lyOrg').click();
    const keyOn = vis(key), lensOn = document.body.classList.contains('org-lens');
    setMapType('circles', true);
    const r = { before, keyOn, lensOn, layersUnderChart: vis(layers), keyUnderChart: vis(key) };
    setMapType('living', true);
    r.backAgain = vis(layers) && vis(key);
    document.getElementById('lyOrg').click();
    r.keyOff = !vis(key);
    return r;
  });
  ok(l7.before && l7.lensOn && l7.keyOn && l7.keyOff,
    'L7: the key appears with the lens and leaves with it');
  ok(!l7.layersUnderChart && !l7.keyUnderChart && l7.backAgain,
    'L7b: the lens bar and key hide under the org chart and come back with the land');

  /* The top-right corner holds three things and the key has to clear two. Both
     of the first two placements read fine in the CSS and landed on something on
     the screen: at right 12 the key sat on #dock, and at top 12 it sat on the
     #layers bar carrying the Org button. Rectangles, not judgement. */
  const l7c = await page.evaluate(() => {
    document.getElementById('lyOrg').click();
    const r = id => document.getElementById(id).getBoundingClientRect();
    const key = r('roleKey'), layers = r('layers'), dock = r('dock');
    const hits = (a, b) => !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
    const out = {
      onLayers: hits(key, layers), onDock: hits(key, dock),
      key: [Math.round(key.left), Math.round(key.top), Math.round(key.right), Math.round(key.bottom)],
      layers: [Math.round(layers.left), Math.round(layers.top), Math.round(layers.right), Math.round(layers.bottom)],
      dock: [Math.round(dock.left), Math.round(dock.top), Math.round(dock.right), Math.round(dock.bottom)],
      inView: key.left >= 0 && key.top >= 0 && key.right <= innerWidth && key.bottom <= innerHeight,
    };
    document.getElementById('lyOrg').click();
    return out;
  });
  ok(!l7c.onLayers && !l7c.onDock && l7c.inView,
    `L7c: the key clears the layer bar and the dock and stays on screen (key ${l7c.key}, layers ${l7c.layers}, dock ${l7c.dock})`);

  /* ---------- R1: state and class tags survive the publish/restore round trip ----------
     restoreScene is a field-by-field whitelist reached on EVERY shell scene
     push, so this is the check that the lens's whole input is not silently
     dropped the first time a village publishes. */
  const r1 = await page.evaluate(() => {
    const i = SCENE.seats.findIndex(x => x.at);
    SCENE.seats[i].state = 'partial';
    SCENE.seats[i].archetypes = ['building', 'catalyzing'];
    const name = SCENE.seats[i].s;
    const J = JSON.parse(JSON.stringify(buildExportJSON()));
    const row = J.org_roles.find(r => r.role === name);
    const wrote = { state: row && row.state, tags: row && row.archetypes };
    restoreScene(J);
    const back = SCENE.seats.find(x => x.s === name);
    return { wrote, backState: back && back.state, backTags: back && back.archetypes, drew: back && roleState(back) };
  });
  ok(r1.wrote.state === 'partial' && String(r1.wrote.tags) === 'building,catalyzing',
    `R1: the export row carries state and class tags (${JSON.stringify(r1.wrote)})`);
  ok(r1.backState === 'partial' && String(r1.backTags) === 'building,catalyzing' && r1.drew === 'partial',
    `R1b: and restoreScene keeps them, so the seat still draws ${r1.drew}`);

  const r1c = await page.evaluate(() => {
    const x = SCENE.seats.find(s => s.at);
    x.state = 'nonsense-from-a-stranger'; x.archetypes = [{ evil: 1 }, 'building'];
    const J = JSON.parse(JSON.stringify(buildExportJSON()));
    restoreScene(J);
    const back = SCENE.seats.find(s => s.s === x.s);
    return { state: back.state, tags: back.archetypes, drew: roleState(back) };
  });
  ok(r1c.state === undefined && String(r1c.tags) === 'building' && r1c.drew === 'open',
    `R1c: a value outside the closed set is refused at the boundary (state ${r1c.state}, tags ${JSON.stringify(r1c.tags)})`);

  /* The whitelist is a copy of `SeatState` in server/lib/orgChart.ts, and a
     copy drifts. Getting it wrong is silent BOTH ways: a value here and not in
     the type can never arrive, and a value in the type and not here is refused
     at the door and quietly drawn as open. This shipped once with a `frozen`
     that does not exist and no `forming`, which is both mistakes at once. */
  const SEAT_STATES = ['open', 'filled', 'partial', 'forming', 'expired'];
  const r1d = await page.evaluate(want => ({
    have: ROLE_STATES.slice().sort(),
    want: want.slice().sort(),
    drawn: want.map(v => { const x = { state: v }; return v + '->' + roleState(x) }),
  }), SEAT_STATES);
  ok(r1d.have.join() === r1d.want.join(),
    `R1d: the state whitelist still matches SeatState exactly (${r1d.have.join('|')})`);
  ok(r1d.drawn.join(' ') === 'open->open filled->full partial->partial forming->open expired->open',
    `R1e: and each one draws the ink Rye asked for (${r1d.drawn.join(' ')})`);

  /* ---------- R2: the live answer is read first and is NEVER exported ---------- */
  const r2 = await page.evaluate(() => {
    const x = SCENE.seats.find(s => s.at);
    delete x.state; delete x.archetypes;
    const n = roleApplyLive([{ name: '  ' + x.s.toUpperCase() + ' ', state: 'filled', archetypes: ['facilitating'] }]);
    const drew = roleState(x);
    const J = JSON.parse(JSON.stringify(buildExportJSON()));
    const row = J.org_roles.find(r => r.role === x.s);
    const leaked = JSON.stringify(J.org_roles).indexOf('_state') >= 0 || JSON.stringify(J.org_roles).indexOf('_tags') >= 0;
    const cleared = roleApplyLive([]);
    return { n, drew, rowState: row.state, rowTags: row.archetypes, leaked, cleared, after: roleState(x), live: x._state };
  });
  ok(r2.n === 1 && r2.drew === 'full', `R2: the village's live answer matched by name across case and padding (${r2.n} seat, drew ${r2.drew})`);
  ok(r2.rowState === null && r2.rowTags === null && !r2.leaked,
    `R2b: and the export carries NONE of it (state ${r2.rowState}, tags ${r2.rowTags}, leaked ${r2.leaked})`);
  ok(r2.cleared === 0 && r2.after === 'open' && r2.live === undefined,
    'R2c: a push that no longer names the seat clears the live answer instead of stranding it');

  /* ---------- R2e: the name index cannot be reached through a prototype ----------
     The merge keys an object on names it did not choose - the village types the
     seat names and /api/map types the rows - and it used to key a PLAIN object.
     `by['constructor']` is truthy on one of those before a single row arrives,
     so a seat called "constructor" matched a phantom, took roleStateIn(undefined)
     and drew open, AND INCREMENTED THE COUNT that R2 above asserts === 1 on and
     that the shell reports back to the village. `by['__proto__'] = row` is
     worse still: it stores nothing and re-parents the map onto the row, after
     which every seat whose name is a field of that row matches it.
     Both are exercised here rather than reasoned about. */
  const r2e = await page.evaluate(() => {
    const x = SCENE.seats.find(s => s.at);
    const keep = x.s;
    const out = {};
    for (const evil of ['constructor', 'toString', 'valueOf', '__proto__']) {
      x.s = evil; delete x._state; delete x._tags;
      out[evil] = { n: roleApplyLive([]), state: x._state, drew: roleState(x) };
    }
    // and a real row under a hostile name still lands, so this is not a ban
    x.s = '__proto__';
    const real = { n: roleApplyLive([{ name: '__proto__', state: 'filled' }]), drew: roleState(x) };
    x.s = keep; roleApplyLive([]);
    return { out, real, polluted: ({}).state !== undefined || Object.prototype.state !== undefined };
  });
  ok(Object.keys(r2e.out).every(k => r2e.out[k].n === 0 && r2e.out[k].state === undefined && r2e.out[k].drew === 'open'),
    `R2e: a seat named constructor/toString/valueOf/__proto__ matches NOTHING in an empty push ` +
    `(${Object.keys(r2e.out).map(k => k + ':' + r2e.out[k].n).join(' ')})`);
  ok(r2e.real.n === 1 && r2e.real.drew === 'full' && !r2e.polluted,
    `R2f: and a real row under the same name still lands, without reaching Object.prototype ` +
    `(matched ${r2e.real.n}, drew ${r2e.real.drew}, prototype touched ${r2e.polluted})`);

  /* ---------- R2g: nor can a CIRCLE name ----------
     Three more tables are keyed on a name a scene file chose - `x.c` is
     `org_roles.circle` as restoreScene read it - and all three were plain
     objects. On one of those `ROLE_GOV['constructor']` is truthy before a
     single entry exists, so a circle with that name is governing; the home it
     then looks up is a Function, which passes the `h &&` guard and lands the
     role at the village centre; and the colour is a Function too, which canvas
     refuses and answers by KEEPING THE PREVIOUS strokeStyle - a satellite drawn
     in another circle's ink, which is the one failure mode the lens has no way
     to show. The `||'#9aa08f'` fallbacks read like they cover it and cannot,
     because an inherited value is truthy. */
  const r2g = await page.evaluate(() => {
    /* TYPEOF, NOT THE VALUE. The first cut of this returned CIRCLE_COL[k]
       straight out of page.evaluate and asserted it was undefined - and it
       always was, because the inherited value is a FUNCTION and a function does
       not serialise over CDP. The check passed on the artifact it was written
       to fail. `typeof` and `in` are computed IN the page and come back as a
       string and a boolean, which do. */
    const probe = k => ({
      col: typeof CIRCLE_COL[k], home: typeof CIRCLE_HOMES[k], gov: typeof ROLE_GOV[k],
      inCol: k in CIRCLE_COL, inHome: k in CIRCLE_HOMES, inGov: k in ROLE_GOV,
    });
    const out = {};
    for (const k of ['constructor', 'toString', 'valueOf', 'hasOwnProperty', '__proto__'])
      out[k] = probe(k);
    // and the real entries still answer
    const real = { col: CIRCLE_COL.Wisdom, home: CIRCLE_HOMES.Wisdom, gov: ROLE_GOV.Wisdom };
    // ...and a seat carrying such a circle draws where its address says, in the
    // fallback grey, rather than being gathered and mis-inked
    const x = SCENE.seats.find(s => s.at && classify(s) !== 'creator');
    const keep = x.c; x.c = 'constructor';
    const drew = { home: roleHome(x), at: x.at, moved: roleDefaulted(x), col: typeof CIRCLE_COL[x.c] };
    x.c = keep;
    return { out, real, drew, keys: Object.keys(CIRCLE_COL).length };
  });
  const r2gBad = Object.keys(r2g.out).filter(k => {
    const p = r2g.out[k];
    return p.col !== 'undefined' || p.home !== 'undefined' || p.gov !== 'undefined' || p.inCol || p.inHome || p.inGov;
  });
  ok(r2gBad.length === 0,
    `R2g: a circle named constructor/toString/valueOf/hasOwnProperty/__proto__ is absent from all three tables` +
    (r2gBad.length ? ' -> ' + r2gBad.map(k => `${k} answers ${JSON.stringify(r2g.out[k])}`).join(', ') : ''));
  ok(r2g.real.col === '#a98ad0' && r2g.real.home === 'council' && r2g.real.gov === 1 && r2g.keys === 11,
    `R2h: and the ${r2g.keys} real circles still answer (Wisdom -> ${r2g.real.col} at ${r2g.real.home}, governing ${r2g.real.gov})`);
  ok(r2g.drew.home === r2g.drew.at && r2g.drew.moved === false && r2g.drew.col === 'undefined',
    `R2i: so a seat carrying that circle stays at the address it has and takes the fallback ink ` +
    `(drew at ${r2g.drew.home}, addressed ${r2g.drew.at}, colour typeof ${r2g.drew.col})`);

  /* ---------- R2d: a scene push does not silently lose the live states ----------
     `restoreScene` rebuilds SCENE.seats from scratch, so the merged fields go
     with the objects they were on. The shell fires pushConfig and pushHand as
     two independent promises and re-fires pushConfig ALONE on a skin save, so
     "the hand landed second" is neither guaranteed nor even usual there. */
  const r2d = await page.evaluate(() => {
    const x = SCENE.seats.find(s => s.at);
    const name = x.s;
    roleApplyLive([{ name, state: 'filled', archetypes: ['facilitating'] }]);
    const before = roleState(SCENE.seats.find(s => s.s === name));
    restoreScene(JSON.parse(JSON.stringify(buildExportJSON())));    // what a scene push does
    const after = roleState(SCENE.seats.find(s => s.s === name));
    // Read BEFORE the cleanup. `roleApplyLive([])` deletes `_state` from every
    // seat it does not name, so reading it in the return statement read the
    // cleanup rather than the replay.
    const replayed = SCENE.seats.find(s => s.s === name)._state;
    roleApplyLive([]);
    return { before, after, replayed };
  });
  ok(r2d.before === 'full' && r2d.after === 'full' && r2d.replayed === 'filled',
    `R2d: a scene push replays the village's last word instead of dropping it ${JSON.stringify(r2d)}`);

  /* ---------- R3: the marks answer to the party at mid range ---------- */
  const r3 = await page.evaluate(async () => {
    /* The badge classes are settled by layoutBadges, which runs once per frame,
       so every read here WAITS FOR THE CONDITION rather than for a fixed number
       of milliseconds. A fixed 400ms passed three runs in four and failed the
       fourth, which is a test measuring the frame scheduler. */
    const until = (fn, ms) => new Promise(res => {
      const end = performance.now() + (ms || 2000);
      const tick = () => { if (fn() || performance.now() > end) return res(fn()); requestAnimationFrame(tick) };
      tick();
    });
    restoreScene(JSON.parse(JSON.stringify(buildExportJSON())));   // clean slate
    const seat = SCENE.seats.find(s => s.at && seatsAt(s.at).length);
    const k = seat.at;
    roleApplyLive(SCENE.seats.map(s => ({ name: s.s, state: 'open', archetypes: ['storytelling'] })));
    // mid range is the EXISTING gate: cam.z below 1.45
    cam.z = 1.2; cam.x = BY[k].x; cam.y = BY[k].y; clampCam(); refreshBadges();
    const g = bgEls[k];
    const seal = () => g.querySelector('.bseal.b-seat');
    const shown = () => { const s = seal(); return !!s && getComputedStyle(s).display !== 'none' };
    await until(() => g.classList.contains('bmid') && shown());
    const before = { mid: g.classList.contains('bmid'), shown: shown(), party: document.body.classList.contains('role-party') };
    roleSetParty(['building']);
    await until(() => !shown());
    const narrowed = { shown: shown(), inDom: !!seal(), rel: seal() && seal().dataset.brel, party: document.body.classList.contains('role-party') };
    fanGroup(k);
    await until(() => g.classList.contains('fanned'));
    const fanned = {
      shown: shown(), cls: g.classList.contains('fanned'), cluster: g.classList.contains('clustered'),
      on: g.classList.contains('on'), far: g.classList.contains('far'), mid: g.classList.contains('bmid'),
      left: Math.round(g._fan - performance.now()), disp: seal() && getComputedStyle(seal()).display,
    };
    roleSetParty(['building', 'storytelling']);
    await until(() => !g.classList.contains('fanned'), 3000);   // let the fan lapse first
    await until(() => shown());
    const union = { shown: shown(), rel: seal() && seal().dataset.brel, fanned: g.classList.contains('fanned') };
    roleSetParty(null);
    await until(() => shown());
    const off = { shown: shown(), party: document.body.classList.contains('role-party') };
    return { before, narrowed, fanned, union, off, k };
  });
  ok(r3.before.mid && r3.before.shown && !r3.before.party,
    `R3: at mid range with no party the seat mark shows (${r3.k})`);
  ok(!r3.narrowed.shown && r3.narrowed.inDom && r3.narrowed.rel === '0' && r3.narrowed.party,
    `R3b: a party that does not do this work hides the mark and LEAVES IT IN THE DOM (${JSON.stringify(r3.narrowed)})`);
  ok(r3.fanned.shown && r3.fanned.cls,
    `R3c: opening the building brings every mark back, through the _fan that already existed ${JSON.stringify(r3.fanned)}`);
  ok(r3.union.shown && r3.union.rel === '1' && !r3.union.fanned,
    'R3d: the union across the party is what counts, so adding the class shows it again with the ring closed');
  ok(r3.off.shown && !r3.off.party,
    'R3e: and clearing the party restores the map every visitor gets');

  /* ---------- R4: the mid mark got weight, not width ----------
     Width is capped by verify_features D2 A1, which counts a door unreliable
     when the nearest door on another building is closer than the seal is WIDE.
     Swept: 22 -> 4 bad, 23 -> 6, 24 -> 6, 25 -> 8, 26 -> 8, against a ratchet of
     4. So the size is pinned and the legibility comes from stroke weight, which
     that budget does not measure because it is not a distance. */
  const r4 = await page.evaluate(() => {
    /* THE BRAID IS BUILT, NOT ASSUMED. This used to make a bare `.bseal` with a
       plain `.rim` and never put `r-braid` on it, so it measured the one rim
       whose weight nobody had made a decision about and reported "the mid mark
       reads heavier" while the braided rim - the only one whose weight carries
       meaning - was going the other way. `.bmid .bseal .rim` and
       `.bseal.r-braid .rim` are both three classes, so the tie went to source
       order, the braid rule is later, and the braid took 2.4 at mid range
       against 2.6 for everything else: the heaviest mark at near range was the
       lightest at mid. Both are read here, from the markup refreshBadges
       actually emits (`bseal b-quest r-amber r-braid`). */
    const mk = (cls) => {
      const d = document.createElement('div'); d.className = cls;
      d.innerHTML = '<svg viewBox="0 0 24 24"><circle class="rim" cx="12" cy="12" r="11"/></svg><span class="bhit"></span>';
      return d;
    };
    const d = mk('bseal'), b = mk('bseal b-quest r-amber r-braid');
    const bg = document.createElement('div'); bg.className = 'bgroup bmid on';
    bg.appendChild(d); bg.appendChild(b); document.getElementById('badges').appendChild(bg);
    const w = el => parseFloat(getComputedStyle(el.querySelector('.rim')).strokeWidth);
    const mid = parseFloat(getComputedStyle(d).width);
    const midRim = w(d), midBraid = w(b);
    const hit = parseFloat(getComputedStyle(d.querySelector('.bhit')).width);
    bg.className = 'bgroup on';
    const near = parseFloat(getComputedStyle(d).width);
    const nearRim = w(d), nearBraid = w(b);
    bg.remove();
    return { mid, near, midRim, nearRim, midBraid, nearBraid, hit, floor: MARK_FLOOR };
  });
  ok(r4.midRim > r4.nearRim && r4.hit === 44,
    `R4c: the mid mark reads heavier at the same 44 px target (rim ${r4.nearRim} near, ${r4.midRim} mid)`);
  ok(r4.nearBraid > r4.nearRim && r4.midBraid > r4.midRim,
    `R4d: and the BRAIDED rim is the heaviest at BOTH ranges, which is the whole reason it is braided ` +
    `(near ${r4.nearBraid} over ${r4.nearRim}, mid ${r4.midBraid} over ${r4.midRim})`);
  ok(r4.mid === 22 && r4.near === 28,
    `R4: the mid-range seal is still ${r4.mid}, the largest the thumb budget affords, and the near one is ${r4.near}`);
  ok(r4.near === r4.floor && r4.mid <= r4.floor,
    `R4b: MARK_FLOOR (${r4.floor}) still equals the seal width it is defined from, so the solver is untouched`);

  /* ---------- R5: the lens leaves the canvas as it found it ----------
     Every pass drawing later in the same frame inherits the 2D context, and
     the lens touches five parts of it. Auditing the passes that follow works
     once and rots when another lane adds one. */
  const r5 = await page.evaluate(() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 60;
    const c2 = cv.getContext('2d');
    const read = () => ({
      lineWidth: c2.lineWidth, strokeStyle: c2.strokeStyle, fillStyle: c2.fillStyle,
      globalAlpha: c2.globalAlpha, dash: c2.getLineDash().join(','), cap: c2.lineCap,
    });
    const before = read();
    roleLens(c2, 'now', 1.7);
    return { before, after: read() };
  });
  ok(JSON.stringify(r5.before) === JSON.stringify(r5.after),
    `R5: the lens restores every part of the context it touched (before ${JSON.stringify(r5.before)}, after ${JSON.stringify(r5.after)})`);

  /* ---------- R6: the bridge branch is actually wired ----------
     Every check above calls roleSetParty and roleApplyLive directly, which
     proves the functions and proves nothing about whether a message ever
     reaches them. The party and the seats ride their OWN message rather than
     `hand`, because `hand` decides whether the Build button works and must not
     wait on /api/map, which is four queries and a full users scan. */
  const r6 = await page.evaluate(async () => {
    const seat = SCENE.seats.find(s => s.at);
    const wait = () => new Promise(r => setTimeout(r, 250));
    roleSetParty(null); roleApplyLive([]);
    postMessage({ type: 'lens', party: ['catalyzing'], roles: [{ name: seat.s, state: 'partial', archetypes: ['catalyzing'] }] }, '*');
    await wait();
    const got = { party: (ROLE_PARTY || []).join(), drew: roleState(SCENE.seats.find(s => s.s === seat.s)), cls: document.body.classList.contains('role-party') };
    // and a `hand` with no lens fields leaves both alone
    postMessage({ type: 'hand', canEdit: false, canPublish: false, liveVersion: 0 }, '*');
    await wait();
    const after = { party: (ROLE_PARTY || []).join(), drew: roleState(SCENE.seats.find(s => s.s === seat.s)) };
    roleSetParty(null); roleApplyLive([]);
    return { got, after };
  });
  ok(r6.got.party === 'catalyzing' && r6.got.drew === 'partial' && r6.got.cls,
    `R6: a lens message reaches the party and the seats (${JSON.stringify(r6.got)})`);
  ok(r6.after.party === 'catalyzing' && r6.after.drew === 'partial',
    `R6b: and a hand message does not clear them, because it no longer carries them (${JSON.stringify(r6.after)})`);

  /* ---------- L9: a BUILDING key from a scene file cannot reach Object.prototype ----------
     The same shape as R2's role names and patch 18's circle names, one table
     over. `BY` is a plain object keyed on `s.key`, so `BY['constructor']` is a
     Function before a single structure is read, and a seat carrying
     `at:'constructor'` walks straight through it: roleHome answers
     'constructor', roleSeatsBy runs `(m[k]||(m[k]=[])).push(x)` against Object,
     and the TypeError lands INSIDE THE DRAW LOOP. The lens does not draw wrong,
     it stops - and it does not restart when the seat goes away.
     ASSERTED ON ALL THREE: the address is refused, the count is untouched while
     the seat is there, and the lens is still drawing once it is taken back out.
     Any one alone passes for the wrong reason - a lens drawing nothing has an
     untouched count of zero, which is why `before > 0` is in the conjunction. */
  const l9 = await page.evaluate(async () => {
    const step = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (!orgOn) document.getElementById('lyOrg').click();
    await step();
    const before = ROLE_LAST_SATS.length;
    const x = { s: 'Phantom Steward', c: 'Land', at: 'constructor' };
    SCENE.seats.push(x);
    let home = 'unread', grouped = null, threw = null;
    try { home = roleHome(x); } catch (e) { threw = String(e).slice(0, 140); }
    try { grouped = Object.keys(roleSeatsBy()).length; } catch (e) { threw = String(e).slice(0, 140); }
    await step(); await step();
    const during = ROLE_LAST_SATS.length;
    /* PUT THE LAND BACK BEFORE ANYTHING IS ASSERTED, so a red here cannot leave
       a phantom seat behind for every check that runs after it. */
    const i = SCENE.seats.indexOf(x); if (i >= 0) SCENE.seats.splice(i, 1);
    await step(); await step();
    return { before, during, after: ROLE_LAST_SATS.length, home, grouped, threw };
  });
  ok(l9.threw === null && l9.home === null && l9.before > 0 &&
    l9.during === l9.before && l9.after === l9.before,
    `L9: a seat addressed at a prototype key is refused and the lens keeps drawing ` +
    `(roleHome -> ${JSON.stringify(l9.home)}, ${l9.before} satellites before, ` +
    `${l9.during} with it, ${l9.after} after${l9.threw ? '; THREW ' + l9.threw : ''})`);

  ok(perr.length === 0, `L8: zero page errors (${perr.length}${perr.length ? ': ' + perr[0] : ''})`);

  await browser.close();
  console.log(fails ? `\n${fails} FAILED` : '\nall checks passed');
  process.exit(fails ? 1 : 0);
})();
