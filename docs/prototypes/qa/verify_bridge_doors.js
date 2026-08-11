/* Every door the shell can knock on, opened with a real message.
 *
 * WHY THIS EXISTS. The artifact listens for six message types. Before this
 * file, exactly one gate posted a message at all: `verify_vocab_bridge.js`,
 * and only for `{type:'config'}`. Everything else was proven by calling the
 * handler's BODY directly, which is a different claim. `verify_skin_bridge.js`
 * is the clearest case: it calls `applySkinExport()` and proves the absorber
 * beautifully, while the `{type:'skin'}` door that reaches it has never been
 * knocked on by any gate.
 *
 * That distinction is not academic. The vocabulary bug of 2026-08-10 lived in
 * a DOOR, not an absorber: `restoreScene` took all five vocabulary keys the
 * whole time, and the `{type:'config'}` handler beside it took three. A test
 * of the absorber passes on a broken door, which is how it survived a round.
 *
 * So: one gate per door, each one posting the real thing.
 *
 * Section D is the part built to outlive today. It reads the artifact's own
 * source, finds every `d.type` it compares against, and fails when one is
 * neither covered here nor named as covered by another gate. Round E added
 * `hand` and `scene-result` and nothing forced them to be gated; the next
 * round's new door will not get in that quietly.
 *
 *   cd docs/prototypes/qa && source ./env.sh && node verify_bridge_doors.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = process.env.GROUNDS_FILE || 'file:///root/amora/work/grounds-v0.html';
const EXE = process.env.PW_EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

/* Doors a DIFFERENT gate drives with a real message. Named, not just listed,
 * so a door that loses its cover reads as a stale claim rather than a blank. */
const COVERED_ELSEWHERE = {
  config: 'verify_vocab_bridge.js',
  hand: 'verify_publish.js, via qa/shell_publish.html',
  'scene-result': 'verify_publish.js, via qa/shell_publish.html',
};
const COVERED_HERE = ['skin', 'goto', 'promise-result'];

/* Wait for a state, not a clock: a fixed post-boot sleep is what makes
 * verify_doors.js fail about once in ten on a cold page. Returns whether the
 * condition arrived, so a real failure reads as a FAIL and not as a stack. */
async function until(page, fn, ms = 15000) {
  try { await page.waitForFunction(fn, undefined, { timeout: ms, polling: 100 }); return true; }
  catch (_) { return false; }
}

function pathFromFileUrl(u) {
  let p = decodeURIComponent(String(u).replace(/^file:\/\//, '').replace(/[?#].*$/, ''));
  if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1); // file:///C:/x gives /C:/x on Windows
  return p;
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1180 } });
  const page = await ctx.newPage();
  const perr = [], cerr = [];
  page.on('pageerror', e => perr.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') cerr.push(m.text()); });

  await page.goto(FILE);
  /*
   * Bare identifiers, not `window.X`. Most of the artifact's state is declared
   * with top-level `const` in an inline script, which makes a SCRIPT-scope
   * binding: `SCENE` resolves, `window.SCENE` is undefined. Only what is
   * explicitly assigned (`window.EVENTS`, `window.promiseWatch`) is on the
   * object. The first draft of this predicate used `window.SCENE` and waited
   * the full timeout on a page that was ready in a second.
   */
  const booted = await until(page, () => typeof SKIN !== 'undefined' && typeof SCENE !== 'undefined'
    && Array.isArray(window.EVENTS) && window.EVENTS.length > 0
    && typeof window.promiseWatch === 'function');
  ok(booted, 'the map finished booting (waited on state, not a clock)');

  /* ---------- A. the {type:'skin'} door ----------
   * Village Settings pushes this on save. verify_skin_bridge.js owns whether
   * the skin is absorbed correctly; this owns only whether the door delivers.
   */
  const SKIN_PUSH = {
    theme: 'Terra Sol', words: '', accent: '#0b7285', parchment: '#f3e7cf',
    label_scale: 1.1, global_scale: 1.2, icon_mode: 'painted',
    flow_style: 'gold', label_style: 'tablet',
    mist: true, glow: false, painterly: { brush: 0.4, palette: 0.7 },
  };
  const beforeSkin = await page.evaluate(() => SKIN.accent || '');
  await page.evaluate((sk) => window.postMessage({ type: 'skin', skin: sk }, '*'), SKIN_PUSH);
  await page.waitForTimeout(400);
  const afterSkin = await page.evaluate(() => ({
    accent: SKIN.accent, flow: SKIN.flow_style, tablet: document.body.classList.contains('lbl-tablet'),
  }));
  ok(beforeSkin !== '#0b7285', `the map is not already wearing the pushed accent (${beforeSkin || 'none'})`);
  ok(afterSkin.accent === '#0b7285' && afterSkin.flow === 'gold',
    `the skin door delivers (accent ${afterSkin.accent}, flow ${afterSkin.flow})`);
  ok(afterSkin.tablet === true, 'and the land is actually redrawn in it');

  /* ---------- B. the {type:'promise-result'} door ----------
   * The nonce is the whole contract: a reply that is not answering the post
   * the map is waiting on must be dropped, or a late undo lands on top of a
   * newer intent. Driven through `promiseWatch`, which is what the rsvp and
   * claim toggles call, so this is the same pending entry a real toggle makes.
   * `bridgePost` is a no-op outside a frame, so nothing needs a parent here.
   */
  const evId = await page.evaluate(() => ((window.EVENTS || [])[0] || {}).id || null);
  ok(!!evId, `there is a sample event to answer for (${evId})`);

  await page.evaluate((id) => {
    window.__undone = false;
    window.promiseWatch('rsvp', id, 'nonce-A', () => { window.__undone = true; });
  }, evId);

  /* a straggler for an intent the reader already replaced */
  await page.evaluate((id) => window.postMessage(
    { type: 'promise-result', kind: 'rsvp', id, nonce: 'nonce-B', ok: false, state: 'off', reason: 'error' }, '*'), evId);
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__undone === false),
    'a reply with the wrong nonce is dropped, and the promise stands');

  /* the real answer, which must still be waiting after the straggler */
  await page.evaluate((id) => window.postMessage(
    { type: 'promise-result', kind: 'rsvp', id, nonce: 'nonce-A', ok: false, state: 'off', reason: 'not-here' }, '*'), evId);
  await page.waitForTimeout(300);
  ok(await page.evaluate(() => window.__undone === true),
    'the matching nonce undoes it, so the straggler did not consume the wait');

  /* ok:true with a count: the site owns the number, the map takes it */
  await page.evaluate((id) => {
    window.__undone = false;
    window.promiseWatch('rsvp', id, 'nonce-C', () => { window.__undone = true; });
    window.postMessage({ type: 'promise-result', kind: 'rsvp', id, nonce: 'nonce-C', ok: true, state: 'on', count: 42 }, '*');
  }, evId);
  await page.waitForTimeout(400);
  const counted = await page.evaluate((id) => ({
    n: ((window.EVENTS || []).find(x => x.id === id) || {}).rsvp, undone: window.__undone,
  }), evId);
  ok(counted.n === 42, `an ok reply hands the count to the map (${counted.n})`);
  ok(counted.undone === false, 'and an ok reply does not undo anything');

  /* ---------- C. the {type:'goto'} door ----------
   * The shell routes the land with this when a link elsewhere on the site
   * points at a place. Last, because it opens a panel and changes the address.
   */
  await page.evaluate(() => window.postMessage({ type: 'goto', hash: '#/place/kitchen' }, '*'));
  await page.waitForTimeout(700);
  const went = await page.evaluate(() => ({
    hash: location.hash, panel: typeof panelKey !== 'undefined' ? panelKey : null,
    intro: document.body.classList.contains('intro'),
  }));
  ok(went.hash === '#/place/kitchen', `the goto door sets the address (${went.hash})`);
  ok(went.panel === 'kitchen', `and actually routes the land (panel=${went.panel})`);
  ok(went.intro === false, 'and leaves the intro, so the push is not swallowed by the ceremony');

  /* ---------- D. the tripwire ----------
   * Read the artifact for every type it compares a message against. A door
   * neither driven here nor named as driven elsewhere is a door with no gate.
   */
  const src = fs.readFileSync(pathFromFileUrl(FILE), 'utf8');
  const found = [...new Set([...src.matchAll(/\bd\.type\s*[!=]==\s*'([a-z-]+)'/g)].map(m => m[1]))].sort();
  ok(found.length > 0, `found ${found.length} doors in the artifact (${found.join(', ')})`);
  const ungated = found.filter(d => COVERED_HERE.indexOf(d) === -1 && !(d in COVERED_ELSEWHERE));
  ok(ungated.length === 0,
    ungated.length
      ? `no gate posts a real message for: ${ungated.join(', ')}. Add it here, or add it to COVERED_ELSEWHERE naming the gate that does.`
      : `every door has a gate (${COVERED_HERE.length} here, ${Object.keys(COVERED_ELSEWHERE).length} named elsewhere)`);

  ok(perr.length === 0, `zero page errors (${perr.length})${perr.length ? ' — ' + perr[0] : ''}`);
  ok(cerr.length === 0, `zero console errors (${cerr.length})${cerr.length ? ' — ' + cerr[0] : ''}`);
  console.log(fails === 0 ? 'BRIDGE DOORS: ALL GREEN' : `BRIDGE DOORS: ${fails} FAILURES`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
