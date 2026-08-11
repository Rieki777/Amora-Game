/* The vocabulary contract, checked on the inbound edge of the bridge.
 *
 * WHY THIS EXISTS. `SCENE.vocabulary` has five keys — road, water, zone, media,
 * phases — and the map used to absorb them in two places that had to agree
 * forever: the scene-file importer and the `{type:'config'}` handler the shell
 * pushes on `grounds-ready`. When `media` and `phases` joined the vocabulary,
 * only the file one grew. The bridge kept taking three of five.
 *
 * That is the round-D bug for the fifth time: a value crossed a boundary and
 * lost the parts the far side had no slot for, silently. It hid particularly
 * well here because a partial absorber is indistinguishable from a working one
 * from outside — the three keys that DO land look like proof the wiring works.
 *
 * So this drives the real handler. It posts an actual `message` rather than
 * calling `applyVocabulary()`, because calling the absorber directly would pass
 * on the broken artifact too and prove nothing about the door.
 *
 * Section E is the part that matters after today: it fails when the export
 * grows a vocabulary key the absorber does not take, which is the specific
 * mistake, rather than the specific keys it happened to be made with.
 *
 *   cd docs/prototypes/qa && source ./env.sh && node verify_vocab_bridge.js
 */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE || 'file:///root/amora/work/grounds-v0.html';
const EXE = process.env.PW_EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

/* Wait for a state, not a clock: a fixed post-boot sleep is what makes
 * verify_doors.js fail about once in ten on a cold page. Returns whether the
 * condition arrived, so a real failure reads as a FAIL and not as a stack.
 *
 * Terms are named expression STRINGS, and that is the point. A predicate that
 * can never be true reads exactly like a slow boot, because both arrive as the
 * same timeout: `window.SCENE` is undefined forever, since SCENE is a top-level
 * `const` and lives in script scope rather than on window. On timeout this
 * names the terms that never went true, from the same strings it waited on. */
async function untilReady(page, terms, ms = 15000) {
  const truth = (src) => {
    const out = {};
    for (const k of Object.keys(src)) {
      try { out[k] = !!eval(src[k]); } catch (_) { out[k] = false; }
    }
    return out;
  };
  try {
    await page.waitForFunction(
      (src) => Object.keys(src).every(k => { try { return !!eval(src[k]); } catch (_) { return false; } }),
      terms, { timeout: ms, polling: 100 });
    return true;
  } catch (_) {
    const t = await page.evaluate(truth, terms);
    const dead = Object.keys(t).filter(k => !t[k]);
    console.log('  waited ' + ms + 'ms. never true: '
      + (dead.join(', ') || '(every term reads true, so the wait itself is wrong)'));
    return false;
  }
}

/*
 * A village that has renamed everything it is allowed to rename, written as a
 * literal for the same reason the skin bridge does it: this pins the WIRE
 * shape. `phases` names only 2, to prove the merge keeps 1 and 3. `media`
 * carries a type this map has never heard of, which is the real case — a
 * village whose metabolism includes something Amora's nine do not.
 */
const PUSHED = {
  road: ['track', 'lane', 'desire path'],
  water: ['creek', 'swale'],
  zone: ['orchard', 'commons', 'quiet'],
  phases: { 2: 'Rising' },
  media: [
    { key: 'water', name: 'clean water', color: '#5fb6d4', glyph: 'droplet' },
    { key: 'seaweed', name: 'seaweed', color: '#4f7a52', glyph: 'leafcurl' },
  ],
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1180 } });
  const page = await ctx.newPage();
  const perr = [], cerr = [];
  page.on('pageerror', e => perr.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') cerr.push(m.text()); });

  await page.goto(FILE);
  /* Bare identifiers: SUBTYPES and SCENE are top-level `const` in an inline
     script, so they are SCRIPT scope and never properties of `window`. Only
     what is explicitly assigned (window.MEDIA, window.phaseName) is there. */
  const booted = await untilReady(page, {
    SUBTYPES: "typeof SUBTYPES !== 'undefined'",
    SCENE: "typeof SCENE !== 'undefined'",
    'SCENE.vocabulary.media': "typeof SCENE !== 'undefined' && !!(SCENE.vocabulary && SCENE.vocabulary.media)",
    'window.phaseName': "typeof window.phaseName === 'function'",
    'window.MEDIA': '!!window.MEDIA',
  });
  ok(booted, 'the map finished booting (waited on state, not a clock)');

  /* ---------- A. the map starts in the platform's words ---------- */
  const before = await page.evaluate(() => ({
    phase2: window.phaseName(2),
    phase1: window.phaseName(1),
    mediaCount: SCENE.vocabulary.media.length,
    hasSeaweed: SCENE.vocabulary.media.some(m => m.key === 'seaweed'),
  }));
  ok(before.phase2 === 'Building', `phase 2 starts as the default (${before.phase2})`);
  ok(before.hasSeaweed === false, 'the map has never heard of seaweed');

  /* ---------- B. the shell pushes a config over the real bridge ---------- */
  await page.evaluate((v) => window.postMessage({ type: 'config', vocabulary: v }, '*'), PUSHED);
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => ({
    road: SUBTYPES.road.slice(), water: SUBTYPES.water.slice(), zone: SUBTYPES.zone.slice(),
    phase1: window.phaseName(1), phase2: window.phaseName(2), phase3: window.phaseName(3),
    media: SCENE.vocabulary.media.map(m => ({ key: m.key, name: m.name, color: m.color, glyph: m.glyph })),
    MEDIA: { ...window.MEDIA },
  }));

  /* the three that always worked, so a regression there is visible too */
  ok(after.road.join() === PUSHED.road.join(), `road words landed (${after.road.join(', ')})`);
  ok(after.water.join() === PUSHED.water.join(), `water words landed (${after.water.join(', ')})`);
  ok(after.zone.join() === PUSHED.zone.join(), `zone words landed (${after.zone.join(', ')})`);

  /* ---------- C. phases, which the bridge used to drop ---------- */
  ok(after.phase2 === 'Rising', `phase 2 is the village's word (${after.phase2})`);
  ok(after.phase1 === 'Built' && after.phase3 === 'Planned',
    `unnamed phases keep their defaults (${after.phase1}/${after.phase3})`);

  /* ---------- D. media, which the bridge used to drop ---------- */
  ok(after.media.length === 2, `the media vocabulary is the village's (${after.media.length} types)`);
  const seaweed = after.media.find(m => m.key === 'seaweed');
  ok(!!seaweed && seaweed.name === 'seaweed', 'a medium this map never knew arrived intact');
  const cleanWater = after.media.find(m => m.key === 'water');
  ok(!!cleanWater && cleanWater.name === 'clean water' && cleanWater.color === '#5fb6d4',
    `a renamed medium kept both its name and its colour (${cleanWater && cleanWater.name})`);
  /*
   * rebuildMedia() has to run or the colour never reaches CSS: window.MEDIA is
   * the lookup the drawing code reads, and SCENE.vocabulary.media alone leaves
   * the flows drawn in the old palette with the new names in the panel.
   */
  ok(after.MEDIA.seaweed === '#4f7a52',
    `the colour reached the drawing table (MEDIA.seaweed = ${after.MEDIA.seaweed})`);
  ok(after.MEDIA.water === '#5fb6d4',
    `a changed colour replaced the old one (MEDIA.water = ${after.MEDIA.water})`);

  /* ---------- E. the tripwire ----------
   * Every key the export emits under map_scene.vocabulary must be a key the
   * absorber takes. This is the check that outlives today's five: add a sixth
   * to the export and forget the door, and this fails instead of the land
   * quietly wearing default words.
   */
  const wiring = await page.evaluate(() => ({
    keys: (typeof VOCAB_KEYS !== 'undefined' && Array.isArray(VOCAB_KEYS)) ? VOCAB_KEYS.slice() : null,
    exported: Object.keys((buildExportJSON().map_scene || {}).vocabulary || {}),
    oneDoor: typeof applyVocabulary === 'function',
  }));
  ok(wiring.oneDoor, 'there is one applyVocabulary() rather than an enumeration per door');
  ok(wiring.keys !== null, 'VOCAB_KEYS names what a vocabulary is');
  /*
   * `note` is prose the map ships for whoever opens the JSON, the same way
   * skinExport() carries one. It is written BY the map, never read back into
   * it, so it is the one key that is correct to have no door. Exempting it by
   * name rather than by "ignore strings" keeps the tripwire sharp: a future
   * key that happens to be a string still fails.
   */
  const OUTBOUND_ONLY = ['note'];
  const orphans = (wiring.exported || [])
    .filter(k => OUTBOUND_ONLY.indexOf(k) === -1)
    .filter(k => !(wiring.keys || []).includes(k));
  ok(orphans.length === 0,
    orphans.length
      ? `the export emits ${orphans.join(', ')} and applyVocabulary has no slot: add them to VOCAB_KEYS and the absorber, or they are dropped on every inbound push`
      : `every exported vocabulary key has a door (${(wiring.exported || []).join(', ')})`);

  /* ---------- F. the door carries all three, and changes only what it is sent ----------
   * `{type:'config'}` is one message carrying skin, walk and vocabulary, so a
   * half-working door is the failure mode here too. `verify_skin_bridge.js`
   * calls `applySkinExport()` directly, which proves the ABSORBER and never
   * the door that reaches it: precisely the blind spot that let the vocabulary
   * sit broken for a round. So this one posts a real message for the skin too.
   */
  const SKIN_PUSH = {
    theme: 'Terra Sol', words: '', accent: '#157f7d', parchment: '#f3e7cf',
    label_scale: 1.1, global_scale: 1.2, icon_mode: 'painted',
    flow_style: 'gold', label_style: 'tablet',
    mist: true, glow: false, painterly: { brush: 0.4, palette: 0.7 },
  };
  const WALK_PUSH = [
    { key: 'w1', say: 'This is the land.', need: 'tap' },
    { key: 'w2', say: 'And this is what needs hands.', need: 'tap' },
  ];
  await page.evaluate((a) => window.postMessage({ type: 'config', skin: a.sk, walk: a.walk }, '*'),
    { sk: SKIN_PUSH, walk: WALK_PUSH });
  await page.waitForTimeout(400);
  const f = await page.evaluate(() => ({
    flow: SKIN.flow_style, label: SKIN.label_style,
    tablet: document.body.classList.contains('lbl-tablet'),
    walk: (window.WALK || []).map(s => s.key).join(),
    phase2: window.phaseName(2), road: SUBTYPES.road.join(),
  }));
  ok(f.flow === 'gold' && f.label === 'tablet' && f.tablet === true,
    `the config door delivers skin as well as words (${f.flow}/${f.label})`);
  /*
   * walk is the third thing this one message carries, and it was the last
   * uncovered third. The first version of this gate checked skin and
   * vocabulary and left walk out, which is the same partial-coverage shape
   * the gate was written to catch.
   */
  ok(f.walk === 'w1,w2', `and the village's own Welcome Walk (${f.walk || 'none'})`);
  /* and a message that carries no vocabulary must not reset the words */
  ok(f.phase2 === 'Rising' && f.road === PUSHED.road.join(),
    `a config without a vocabulary leaves the words alone (${f.phase2})`);

  ok(perr.length === 0, `zero page errors (${perr.length})${perr.length ? ' — ' + perr[0] : ''}`);
  ok(cerr.length === 0, `zero console errors (${cerr.length})${cerr.length ? ' — ' + cerr[0] : ''}`);
  console.log(fails === 0 ? 'VOCAB BRIDGE: ALL GREEN' : `VOCAB BRIDGE: ${fails} FAILURES`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
