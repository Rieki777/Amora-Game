/* Draft, publish and undo, checked on the real bridge (D8/0063).
 *
 * WHY THIS EXISTS. The map gained a button that changes what every visitor
 * sees. Three of the things it must do are invisible from inside the artifact
 * and were not covered by any suite:
 *
 *   1. The Build button must be gone for a visitor the village says may not
 *      edit, AND present when there is no village to ask. Getting the second
 *      half wrong is how D8 shipped a map whose Build button never appeared
 *      from file://, which verify_doors caught and this now pins.
 *   2. A scene pushed from the shell must never repaint over unpublished
 *      work. Somebody else publishing while you are mid-drag must not move
 *      the ground under your hands.
 *   3. Publishing must post the scene AND the base version it forked from.
 *      Without the base the server cannot refuse a stale publish, and the
 *      refusal is the only thing standing between two admins and a silent
 *      overwrite.
 *
 * Section G is the part that matters after today. It fails when a verb or an
 * edit word exists on one side of the bridge and not the other, which is the
 * mistake this repo has now made twice (`media` and `phases` absorbed on the
 * file door and dropped on the live one, for a whole release, with nothing
 * raising anywhere). A partial absorber looks exactly like a working one from
 * outside, so the only way to catch it is to compare the two lists.
 *
 *   cd docs/prototypes/qa && source ./env.sh && node verify_publish.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const FILE = process.env.GROUNDS_FILE || 'file:///root/amora/work/grounds-v0.html';
const EXE = process.env.PW_EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
/* THE SHELL COMES FROM THE ARTIFACT'S DIRECTORY, NOT FROM ITS NAME.
 *
 * This was `FILE.replace(/grounds-v0\.html$/, 'qa/shell_publish.html')`, which
 * is a NO-OP for any artifact not called grounds-v0.html - so SHELL came back
 * equal to FILE, the suite loaded the artifact as its own shell, found no
 * frame, and threw at check 3 of 31. That is what happened on the control side
 * of FIVE OF FIVE paired reps, on a lane and on its reviewer, and because
 * paired_summary.sh greps '^FAIL' a crash contributed an EMPTY failing set and
 * the comparison printed "SUBSET" about a side that never ran.
 *
 * qa/shell_publish.html hardcodes `<iframe src="../grounds-v0.html">`, so a
 * control MUST be staged as <dir>/grounds-v0.html with a qa/ beside it. That
 * requirement is now checked and named at check A0 instead of being discovered
 * as a TypeError twenty lines later. */
const DIR = FILE.replace(/\/[^/]*$/, '');
const SHELL = DIR + '/qa/shell_publish.html';
const ART = path.join(__dirname, '..', 'grounds-v0.html');
const SHARED = path.join(__dirname, '..', '..', '..', 'shared', 'mapScene.ts');

let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

/* file:///C:/a/b.html -> C:/a/b.html, and file:///root/x -> /root/x */
const onDisk = u => decodeURIComponent(String(u).replace(/^file:\/\/\//, /^file:\/\/\/[A-Za-z]:/.test(u) ? '' : '/'));

/* A scene the map will accept: same shape buildExportJSON writes, cut to what
   restoreScene actually reads, plus one building that is not in the seed so a
   successful apply is visible as a count. */
const PUSHED_SCENE = {
  map_scene: { key: 'test', version: 'v0.8-roundD2', vocabulary: {} },
  map_structures: [
    { key: 'gate', name: 'Gateway', archetype: 'gate', anchor: { x: 900, y: 1200 }, phase: 1 },
    { key: 'obs', name: 'Observatory', archetype: 'hall', anchor: { x: 1100, y: 900 }, phase: 1 },
  ],
  map_zones: [], map_flows: [], org_roles: [], quests: [], forum_threads: [], map_edits: [],
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1180 } });
  const page = await ctx.newPage();
  const perr = [], cerr = [];
  page.on('pageerror', e => perr.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') cerr.push(m.text()); });

  /* ---------- A0. THE SUITE CAN ACTUALLY RUN ----------
     First, and it exits rather than continuing, because everything after B
     needs a shell with the artifact inside it and a suite that dies partway
     reports NO failures at all - which is indistinguishable from a clean run
     to anything counting '^FAIL' lines. */
  const staged = /\/grounds-v0\.html$/.test(FILE) && fs.existsSync(onDisk(SHELL));
  ok(staged,
    `A0: the artifact is staged where the shell can frame it - <dir>/grounds-v0.html with qa/ beside it ` +
    `(artifact ${FILE}, shell ${SHELL}${fs.existsSync(onDisk(SHELL)) ? '' : ', WHICH IS NOT ON DISK'})`);
  if (!staged) {
    console.log('\nverify_publish cannot run against this path. qa/shell_publish.html carries a hardcoded');
    console.log('<iframe src="../grounds-v0.html">, so a control has to be COPIED to <dir>/grounds-v0.html');
    console.log('with a qa/ directory beside it, and <dir> has to be a real C:/ path - a /tmp path does');
    console.log('not resolve for the browser on Windows.');
    await browser.close();
    console.log(`\n${fails} FAILED`);
    process.exit(1);
  }

  /* ---------- A. standalone: nobody to ask, so the hand is open ---------- */
  await page.goto(FILE);
  await page.waitForTimeout(2600);

  const solo = await page.evaluate(() => ({
    canEdit: document.body.classList.contains('can-edit'),
    visible: getComputedStyle(document.getElementById('buildBtn')).display !== 'none',
  }));
  ok(solo.canEdit && solo.visible, `standalone keeps the founder's own hand (build visible: ${solo.visible})`);

  // The intro card covers the land and swallows pointer events, so every
  // suite that touches a control leaves the ceremony first.
  await page.evaluate(() => leaveIntro());
  await page.waitForTimeout(400);
  await page.click('#buildBtn');
  await page.waitForTimeout(400);
  const soloBar = await page.evaluate(() => ({
    build: document.body.classList.contains('build'),
    bar: getComputedStyle(document.getElementById('draftBar')).display !== 'none',
    says: document.getElementById('draftState').textContent,
    pub: getComputedStyle(document.getElementById('pubGo')).display,
  }));
  ok(soloBar.build, 'build mode still opens with no village behind it');
  ok(/running on its own/i.test(soloBar.says) && soloBar.pub === 'none',
    `the bar tells the truth standalone and hides publish (${soloBar.says.slice(0, 44)})`);

  /* ---------- B. inside a shell, the village decides ---------- */
  const shell = await ctx.newPage();
  const sperr = [];
  shell.on('pageerror', e => sperr.push(String(e)));
  await shell.goto(SHELL);
  await shell.waitForTimeout(3000);
  /* THE FRAME IS IDENTIFIED BY IDENTITY, NOT BY NAME. `find(f =>
     /grounds-v0/.test(f.url()))` returns undefined when the artifact is called
     something else and then every line below throws; worse, it returns the
     WRONG frame when a control sits in a directory whose grounds-v0.html is
     somebody else's. The shell has exactly one child and it must be the file
     this run was pointed at. */
  const kids = shell.frames().filter(f => f !== shell.mainFrame());
  const frame = kids[0];
  ok(kids.length === 1 && !!frame && frame.url() === FILE,
    `B0: the shell framed the artifact under test and nothing else (${kids.length} frame(s): ${kids.map(f => f.url()).join(' | ') || 'none'})`);
  if (!frame || frame.url() !== FILE) {
    console.log('\nThe shell did not load the artifact this run was pointed at, so nothing below would');
    console.log('be about it. Stage the artifact AS <dir>/grounds-v0.html with qa/ beside it.');
    await browser.close();
    console.log(`\n${fails} FAILED`);
    process.exit(1);
  }
  await frame.evaluate(() => leaveIntro());
  await shell.waitForTimeout(300);

  const framed = await frame.evaluate(() => ({
    canEdit: document.body.classList.contains('can-edit'),
    visible: getComputedStyle(document.getElementById('buildBtn')).display !== 'none',
  }));
  ok(!framed.canEdit && !framed.visible,
    `inside a shell the map waits to be told, and shows no Build until it is (${framed.visible})`);

  await shell.evaluate(() => window.__hand({ canEdit: false, canPublish: false, liveVersion: 3 }));
  await shell.waitForTimeout(300);
  ok(await frame.evaluate(() => getComputedStyle(document.getElementById('buildBtn')).display === 'none'),
    'a visitor the village says may not edit gets no Build button');

  await shell.evaluate(() => window.__hand({ canEdit: true, canPublish: true, liveVersion: 3, live: { version: 3, by: 'Rye' } }));
  await shell.waitForTimeout(300);
  ok(await frame.evaluate(() => getComputedStyle(document.getElementById('buildBtn')).display !== 'none'),
    'a cartographer gets it');

  /* ---------- C. a published scene lands through the one absorber ---------- */
  const beforeN = await frame.evaluate(() => SCENE.structures.length);
  await shell.evaluate(s => window.__config({ scene: s, sceneVersion: 3 }), PUSHED_SCENE);
  await shell.waitForTimeout(700);
  const afterN = await frame.evaluate(() => SCENE.structures.length);
  ok(afterN === 2 && beforeN !== 2, `a pushed scene becomes the land (${beforeN} -> ${afterN} buildings)`);
  ok(await frame.evaluate(() => BASE_VERSION === 3),
    'and the map remembers which version it forked from');

  /* ---------- D. nothing repaints over unpublished work ---------- */
  await frame.evaluate(() => { logEdit('move', 'Observatory', {}); });
  await shell.waitForTimeout(200);
  const mine = await frame.evaluate(() => unpublished().length);
  ok(mine === 1, `an edit counts as unpublished (${mine})`);

  await shell.evaluate(() => window.__config({
    scene: { map_scene: { version: 'v0.8-roundD2' }, map_structures: [{ key: 'gate', name: 'Gateway', archetype: 'gate', anchor: { x: 1, y: 1 }, phase: 1 }], map_zones: [], map_flows: [], org_roles: [], quests: [], map_edits: [] },
    sceneVersion: 9,
  }));
  await shell.waitForTimeout(600);
  const held = await frame.evaluate(() => ({ n: SCENE.structures.length, base: BASE_VERSION, mine: unpublished().length }));
  ok(held.n === 2, `a colleague publishing does not move the ground under your hands (${held.n} buildings kept)`);
  ok(held.base === 3,
    `and your base version deliberately stays stale (${held.base}), so your next publish is REFUSED rather than silently overwriting them`);

  /* ---------- E. publish carries the scene and the base ---------- */
  // `previous: 2` with a live version of 4 is a HISTORY WITH A GAP, which is
  // the ordinary state of any village where two people have ever published at
  // the same moment: a refused insert still burns an AUTO_INCREMENT id. Undo
  // used to compute live-minus-one and would ask for a version 3 that never
  // existed, on the one button whose promise is that it is safe to press.
  await shell.evaluate(() => { window.__reply = { ok: true, version: 4, live: { version: 4, by: 'Rye', previous: 2 } }; });
  await frame.evaluate(() => openPublish());
  await shell.waitForTimeout(300);
  const card = await frame.evaluate(() => ({
    open: document.getElementById('pubWrap').classList.contains('show'),
    blast: document.getElementById('pubBlast').textContent,
    lines: document.querySelectorAll('#pubList li').length,
  }));
  ok(card.open, 'publish opens a confirm rather than firing on the click');
  ok(/every visitor/i.test(card.blast) && /draft is touched/i.test(card.blast),
    'the confirm names its blast radius and says whose drafts are safe');
  ok(card.lines === 1, `and lists the change in the founder's own words (${card.lines})`);

  await frame.evaluate(() => document.getElementById('pubConfirm').click());
  await shell.waitForTimeout(600);
  const post = await shell.evaluate(() => window.__seen.filter(m => m.type === 'publish').pop());
  ok(!!post && !!post.scene && !!post.nonce, 'the map posts a publish carrying a whole scene and a nonce');
  ok(post && post.baseVersion === 3,
    `carrying the base version it forked from (${post && post.baseVersion}), which is what lets the village refuse a stale publish`);
  ok(await frame.evaluate(() => unpublished().length === 0 && BASE_VERSION === 4),
    'a successful publish clears the unpublished count and rebases the draft');

  /* ---------- Ea. undo asks the history, it does not do arithmetic ---------- */
  await shell.evaluate(() => { window.__reply = { ok: true, version: 5, live: { version: 5, by: 'Rye', previous: 4 } }; });
  await frame.evaluate(() => undoPublish());
  await shell.waitForTimeout(500);
  const undo = await shell.evaluate(() => window.__seen.filter(m => m.type === 'restore').pop());
  ok(!!undo, 'undo posts a restore');
  ok(undo && undo.version === 2,
    `and asks for the version the history says came before (${undo && undo.version}), not live minus one, which would be a version that never existed`);

  /* ---------- F. a refusal is explained, not swallowed ---------- */
  await frame.evaluate(() => { logEdit('move', 'Gateway', {}); });
  await shell.evaluate(() => { window.__reply = { ok: false, reason: 'stale', error: 'Mara published a change while you were working.', live: { version: 7, by: 'Mara' } }; });
  await frame.evaluate(() => openPublish());
  await shell.waitForTimeout(200);
  await frame.evaluate(() => document.getElementById('pubConfirm').click());
  await shell.waitForTimeout(500);
  const conflict = await frame.evaluate(() => ({
    open: document.getElementById('pubWrap').classList.contains('show'),
    title: document.getElementById('pubTitle').textContent,
    body: document.getElementById('pubList').textContent,
    still: unpublished().length,
  }));
  ok(conflict.open && /moved while you were working/i.test(conflict.title),
    'a stale publish is answered in the card it was pressed from');
  ok(/draft is exactly as you left it/i.test(conflict.body) && conflict.still === 1,
    'and the work survives the refusal, which is the first thing a person needs told');

  /* ---------- G. THE TRIPWIRES: one list, never two ---------- */
  const art = fs.readFileSync(ART, 'utf8');
  const shared = fs.readFileSync(SHARED, 'utf8');

  // Skip the TYPE annotation before matching the array: `readonly string[]`
  // carries a `]` of its own, and stopping at the first one found an empty
  // list and reported every verb as fine.
  const sceneVerbs = ((shared.match(/SCENE_VERBS[^=]*=\s*\[([\s\S]*?)\]/) || [])[1] || '')
    .match(/"([a-z-]+)"/g)?.map(s => s.replace(/"/g, '')) || [];
  const posted = new Set([...art.matchAll(/shellAsk\('([a-z-]+)'/g)].map(m => m[1]));
  const unpostable = sceneVerbs.filter(v => !posted.has(v));
  const unrouted = [...posted].filter(v => !sceneVerbs.includes(v));
  ok(sceneVerbs.length > 0, `the site's verb list was found (${sceneVerbs.length} verbs)`);
  ok(unpostable.length === 0, `every verb the shell routes is one the map can post${unpostable.length ? ' — orphaned: ' + unpostable : ''}`);
  ok(unrouted.length === 0, `and every verb the map posts is one the shell routes${unrouted.length ? ' — DROPPED SILENTLY: ' + unrouted : ''}`);

  /* Every action logEdit can write needs a word on BOTH sides, or a publish
     confirm shows a raw key on one surface and a sentence on the other. */
  const actions = new Set([...art.matchAll(/logEdit\('([a-z-]+)'/g)].map(m => m[1]));
  const artVerbs = new Set([...art.matchAll(/^\s*'?([a-z-]+)'?:\s*'[^']*'/gm)].map(m => m[1]));
  const mapWords = (art.match(/const EDIT_VERBS=\{[\s\S]*?\};/) || [''])[0];
  const siteWords = (shared.match(/const EDIT_VERBS: Record<string, string> = \{[\s\S]*?\n\};/) || [''])[0];
  const missingMap = [...actions].filter(a => !new RegExp(`[{,]\\s*'?${a}'?:`).test(mapWords));
  const missingSite = [...actions].filter(a => !new RegExp(`[{,]\\s*"?'?${a}'?"?:`).test(siteWords));
  ok(actions.size > 20, `every edit the map can log was found (${actions.size} actions)`);
  ok(missingMap.length === 0, `each has a word in the map's list${missingMap.length ? ' — missing: ' + missingMap : ''}`);
  ok(missingSite.length === 0, `and in the site's list${missingSite.length ? ' — missing: ' + missingSite : ''}`);

  /* The scene door must go through the absorber that already exists. A second
     reader is exactly the shape of every boundary bug this lane has had. */
  ok(/function applyScene\([^)]*\)\{[\s\S]{0,700}?restoreScene\(/.test(art),
    'the scene door routes through restoreScene and does not reimplement it');

  ok(perr.length === 0, `zero page errors standalone (${perr.length})${perr.length ? ' — ' + perr[0] : ''}`);
  ok(sperr.length === 0, `zero page errors in the shell (${sperr.length})${sperr.length ? ' — ' + sperr[0] : ''}`);
  ok(cerr.length === 0, `zero console errors (${cerr.length})${cerr.length ? ' — ' + cerr[0] : ''}`);

  console.log(fails === 0 ? 'PUBLISH: ALL GREEN' : `PUBLISH: ${fails} FAILURES`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
