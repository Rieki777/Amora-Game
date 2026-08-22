/* verify_help_l8.js — lane L8, both halves: the help sheet (§0-§4) and the top
 * band's vital dropdown (§5). One command covers the lane.
 *
 * RUN IT FROM docs/prototypes/qa:
 *     cd docs/prototypes/qa && source ./env.sh && node verify_help_l8.js
 * GROUNDS_FILE overrides the artifact, which is how a control is compared:
 *     GROUNDS_FILE="file:///C:/.../other/grounds-v0.html" node verify_help_l8.js
 * Stage a control AS <dir>/grounds-v0.html on a real C:/ path. A control under
 * /tmp does not resolve for the browser on Windows, and a control under another
 * name has burned this round already elsewhere.
 *
 * THE SISTER GATE HAS ITS OWN CWD TRAP: check_blocks.mjs defaults its argument
 * to the bare relative "grounds-v0.html", so from the repo root it reads
 * <root>/grounds-v0.html, throws ENOENT and exits 1 — a red that is about a file
 * that does not exist rather than about your change. Run it from
 * docs/prototypes, or pass the path and it works from anywhere:
 *     node docs/prototypes/check_blocks.mjs docs/prototypes/grounds-v0.html
 *
 * EVERY CHECK HERE HAS BEEN WATCHED GOING RED, and the harness that does it
 * ships beside this file: qa/_mut_l8.py stages the patched artifact with ONE
 * thing broken, and qa/_mut_run_l8.sh proves the gate BOTH ways. It runs the
 * UNMUTATED shipped artifact first and aborts unless that control is clean
 * (checks>0, fails==0) — a red baseline would lend every mutant a free
 * "fails>0" — then requires each mutant to ADD fails over the control and a
 * NON-ZERO check count, so a crash (empty FAIL set) is a hole, not a pass.
 *
 *     cd docs/prototypes/qa
 *     MUT_ROOT="C:/some/real/path/L8MUT" bash _mut_run_l8.sh
 *     # control must read control|0|<checks>|0; every mutant <name>|1|<checks>|<fails>
 *     # with checks>0 and fails>0 (> the control's 0). ACCEPTANCE PASSED prints last.
 *
 * THREE OF THE CHECKS EXIST BECAUSE A MUTATION SURVIVED THE DRAFT BEFORE THEM:
 *   - deleting t.replies instead of escaping it passed all 191 checks of the
 *     first draft, because one shared payload let another field's text vouch for
 *     it (§1 is per-field now);
 *   - stripping the var() out of #vdrop's `top` passed all 280 of the second,
 *     because a var with a fallback cannot fail visibly (§5 compares the
 *     element's own top against the number the band published);
 *   - unescaping the PLACE NAME passed all 288 of the third, silently, because
 *     PLANT only poisoned forum_threads and a place name enters through
 *     map_structures. That is the whole silent-zero shape — a check that cannot
 *     reach the thing reports what a check that passed reports. §1 now plants a
 *     sixth payload through the door that field actually uses.
 *
 * RECONCILED ONTO #32 (the Maia voice). #31 derived this gate against a walk
 * card (#walkCard) that rose over the band on every first run; #32 retired that
 * rise BY DESIGN — the journey speaks from the Maia dock now, and #walkCard's
 * markup, CSS and band slot are still in the file with nothing showing them
 * (:7989). Every check that asserted the card was up, or ratcheted what it
 * covered, was re-derived against the dock: the sweep waits for the JOURNEY
 * state (body.msheet + #maia up), asserts that opening this sheet DISMISSES
 * the dock (openHelp removes msheet — one sheet at a time, :7857), and pins
 * the card's retirement outright. Two of #31's pinned measurements INVERTED
 * when the card went: the 568x320 starvation (§4b) and the landscape cap
 * bites (§4) were both facts about the card's 143px in a 279px band, so both
 * are ratchets in the other direction now. Read the notes at §4 and §4b
 * before touching either.
 *
 * IT ASSERTS ON THE SURFACE A PERSON SEES. Every geometric check reads the live
 * #help in the document after a REAL touch tap on the REAL #pbAttn button, and
 * the two that matter most are hit tests: document.elementFromPoint over the
 * sheet's own title and its close button, on the composited page, which is the
 * only check that can tell "laid out correctly" from "visible". No scratch node
 * is created anywhere in this file.
 *
 * IT REFUSES TO PASS ON NOTHING. Section 0 fails if the sheet is missing, if the
 * button is missing, if the tap rendered zero rows, or if the row count and
 * SCENE.threads disagree — so a payload that plants nothing, or a renderer that
 * never ran, is a FAIL and not a quiet green. The last line prints the number of
 * checks executed and the run fails if that number is zero.
 *
 * IT IS SCOPED TO THIS LANE'S SURFACE ON PURPOSE, AND RE-DERIVED ONTO #29. The
 * banner sink a poisoned place name also reaches — bannerHTML (:3163) — is closed
 * on this base: #29 wraps that write in escq(s.name), so restoreScene injects no
 * node there and the pre-tap count is 0, not 1. The place name is still counted
 * per payload rather than document-wide, which now buys a control in both
 * directions: unescape #help's own escq(nameOf(k)) and the sheet's count goes up,
 * revert #29's bannerHTML escq and the pre-tap count goes up. What this lane owns
 * is asserted as the delta either way.
 */
const { chromium } = require('playwright');

const FILE = process.env.GROUNDS_FILE;
const EXE = process.env.PW_EXE;
if (!FILE || !EXE) { console.log('FAIL env: source ./env.sh first (GROUNDS_FILE / PW_EXE unset)'); process.exit(2) }

let CHECKS = 0, FAILS = 0;
/* Every landscape screen where the published cap came out below the authored
   42vh. Empty means the var exists and never bit anything. */
const BITES = [];
/* Every swept screen on which the sheet opened with a list too short to seat a
   single row. Pinned after the sweep, not silently tolerated. */
const STARVED = [];
const ok = (name, cond, detail) => {
  CHECKS++;
  if (cond) console.log('  ok   ' + name + (detail ? '  [' + detail + ']' : ''));
  else { FAILS++; console.log('FAIL ' + name + '  [' + detail + ']') }
};
const info = (s) => console.log('  --   ' + s);

/* The payload is an <img> and not a <script>: innerHTML never executes a script
   element, so a script tag would prove nothing either way, while a broken image
   source fires onerror off a file:// page and sets a flag this file can read.
 *
 * ONE PAYLOAD PER FIELD, and the reason is a hole this gate actually had. With a
 * single shared payload, "the payload is on screen as literal text" was satisfied
 * by ANY field that carried it, so a renderer that DELETED t.replies instead of
 * escaping it passed all 191 checks: the string was still on screen, from the
 * title of the next row. Deleting the field is a plausible wrong fix (it does
 * stop the injection) and it silently drops the reply count the reader came for.
 * The payloads differ only in the data-xss VALUE, so every one of them is still
 * counted by the injected-node checks and still fires the same flag, while each
 * field's presence is now asserted about that field and nothing else. */
const pay = f => '<img src="x" data-xss="' + f + '" onerror="window.__XSS=(window.__XSS||0)+1">';
/* Every field renderHelp writes into the row as element text. A payload is
   planted into each, but replies is a special case on #29 (see RAWFIELDS). */
const FIELDS = ['title', 'author', 'replies', 'last', 'excerpt'];
/* The string fields restoreScene passes straight through unchanged, so they
   survive the import byte-for-byte and must render as escaped literal text.
   `replies` is DELIBERATELY NOT HERE: #29 coerces it to a number at restore
   (restoreScene :5089, replies:Number(t.replies)||0), so a hostile string
   becomes 0 and never reaches the row as a string. It is asserted on its own
   terms below — that the coercion happened and that the reader still gets a
   count — not as a raw-string survivor, which it is no longer. */
const RAWFIELDS = ['title', 'author', 'last', 'excerpt'];
const PAYLOADS = {}; for (const f of FIELDS) PAYLOADS[f] = pay(f);

/* THE SIXTH FIELD, AND THE HOLE IT CLOSES. Every check above was watched going
   red under a single-edit mutation except one: stripping the escq off the PLACE
   NAME — `homes.map(k=>escq(nameOf(k)))`, which renderHelp writes twice into
   every row, once in the where-line and once in "take me to <place> →" — left
   this file at 288 checks, 0 fails, exit 0. It was guarded by nothing, because
   PLANT only ever poisoned forum_threads and a place name does not come from
   there. It comes from map_structures, through the same restoreScene.
   ITS FLAG IS ITS OWN, and that is not tidiness. A poisoned place name ALSO
   reaches a sink this lane does not own: bannerHTML (:3163) interpolates the
   place name and makeBanner writes it with innerHTML. #29 closed that sink with
   escq(s.name), so on this base restoreScene injects NO node there — but sharing
   window.__XSS would still tie "nothing executed" to the banner rather than this
   sheet, and would hide a future revert of #29's banner escq behind #help's own
   result. Split, each surface is provable on its own: the banner's pre-tap count
   is 0 and must stay 0, and the sheet's own count is 0 and must stay 0. Unescape
   renderHelp's place name and the sheet adds two nodes; revert #29's bannerHTML
   escq and the pre-tap count goes to 1. Either is one line, and each reds its
   own check. */
const PLACE_PAY = '<img src="x" data-xss="place" onerror="window.__XSSPLACE=(window.__XSSPLACE||0)+1">';
/* Every character escq touches, plus a space, plus the two it deliberately does
   not touch. This is the identifier the deep link has to carry back out of a
   dataset attribute byte for byte. */
const HOSTILE_ID = 'th&1 <b>"q"\' >x';

const PORTRAIT = [[390, 844], [393, 851], [375, 667], [360, 640], [414, 896], [430, 932]];
/* 568x320 IS AN iPHONE SE HELD SIDEWAYS and it is in this list because it is the
   screen that found the next thing. 640x360 is the commonest Android landscape.
   Neither was in R15's eleven, and the shorter of the two is where the room the
   band can publish (72px) is smaller than the sheet's own head and footer
   together, so the list seats nothing — measured below, not assumed. */
const LANDSCAPE = [[844, 390], [851, 393], [667, 375], [740, 360], [932, 430], [640, 360], [568, 320]];
const DESK = [[1280, 800], [1920, 1080]];

async function open(browser, w, h, touch) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { if (typeof leaveIntro === 'function') leaveIntro() });
  await page.waitForTimeout(900);
  return { ctx, page, errs };
}

/* THE JOURNEY IS A RACE THE WALK CARD USED TO LOSE. On #31's base the sweep
   waited nine seconds for #walkCard, because a card that had not animated in
   yet satisfied every overlap check by not being there. #32 retired the card:
   the walk auto-starts on a fresh pocket profile (:8020, no 'amora-walk-done'
   in localStorage) and the journey renders into the Maia dock, which
   body.msheet raises as a full-width bottom-band tenant (:696). The state the
   sweep is about is the state it was always about — a first-time reader, the
   band's other tenant up — so it waits for THAT state and then asserts it.
   Measured on 2719f4f: msheet and the dock are up within ~20ms of open()'s own
   settling, so the bound is generous, not hopeful. Only on a pocket: a desk
   keeps Maia as a corner card, msheet never appears there, and the walk never
   auto-starts. */
/* THE BAND PUBLISHES ON A rAF, AND rAF IS THROTTLED IN A PAGE NOBODY IS
   LOOKING AT. bandSoon is `requestAnimationFrame(bandLayout)`, and Chromium
   parks rAF in an occluded tab — which is what a Playwright page becomes the
   moment another browser is in front of it. A fixed sleep after the tap is
   therefore not a bound on anything: MEASURED, --band-t-vdrop is null at t+0 on
   EVERY viewport and profile with #vdrop sitting on its 46px CSS fallback, and
   is published by t+700 in 5 of 5 unloaded reps — but one loaded run of this
   file read null at t+700 on both desks and took five checks red about the
   harness rather than the artifact.
   SO WAIT FOR THE STATE, WITH A BOUND, AND STILL ASSERT AFTERWARDS. This is not
   the assertion waiting for itself: on a timeout it returns false, every check
   below runs anyway, and they go red. That is exactly what
   v2_vdrop_not_tenant and l2_tenant_no_max do in the mutation matrix — the var
   is never published there, this wait spends its bound, and the checks that
   name the var fail. A wait that could hide a defect would have made those
   two green. */
async function waitVar(page, name, ms = 6000) {
  try {
    await page.waitForFunction(
      n => !!getComputedStyle(document.documentElement).getPropertyValue(n).trim(),
      name, { timeout: ms, polling: 200 });
    return true;
  } catch (e) { return false }
}

async function waitDock(page, ms = 9000) {
  try {
    await page.waitForFunction(() => {
      if (!document.body.classList.contains('msheet')) return false;
      const m = document.getElementById('maia');
      if (!m) return false;
      const cs = getComputedStyle(m);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && m.getBoundingClientRect().height > 2;
    }, null, { timeout: ms, polling: 200 });
    return true;
  } catch (e) { return false }
}

/* The real button, tapped where a thumb would land. Returns false when the bar
   is not drawn at all, which is the desk profile and a fact rather than a fault. */
async function tapHelp(page) {
  const b = await page.evaluate(() => {
    const el = document.getElementById('pbAttn'); if (!el) return null;
    const cs = getComputedStyle(el); const bar = document.getElementById('pbar');
    if (cs.display === 'none' || (bar && getComputedStyle(bar).display === 'none')) return null;
    const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!b) return false;
  await page.touchscreen.tap(b.x, b.y);
  await page.waitForTimeout(800);
  return true;
}

/* One read of the live document. Everything here is measured off elements that
   are IN the page, never off a fragment built to be measured. */
const READ = () => {
  const el = document.getElementById('help');
  const rect = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right), h: Math.round(r.height) } };
  const shown = e => { if (!e) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') < 0.05) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 };
  const hit = sel => {
    const t = document.querySelector(sel); if (!t) return { sel, found: false };
    const r = t.getBoundingClientRect();
    const x = Math.round(r.left + r.width / 2), y = Math.round(r.top + r.height / 2);
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return { sel, found: true, onscreen: false, x, y };
    const top = document.elementFromPoint(x, y);
    const inHelp = !!(top && top.closest && top.closest('#help'));
    return {
      sel, found: true, onscreen: true, x, y, inHelp,
      mine: !!(top && (top === t || t.contains(top) || (top.closest && top.closest(sel)))),
      top: top ? ('#' + (top.id || '') + '.' + (typeof top.className === 'string' ? top.className.split(' ')[0] : '')) : null
    };
  };
  const root = getComputedStyle(document.documentElement);
  return {
    vw: innerWidth, vh: innerHeight,
    pocket: document.body.classList.contains('pocket'),
    exists: !!el,
    show: !!(el && el.classList.contains('show')),
    disp: el ? getComputedStyle(el).display : null,
    inDoc: !!(el && document.body.contains(el)),
    help: rect(el),
    rows: document.querySelectorAll('#help .help-row').length,
    threads: (typeof SCENE !== 'undefined' && SCENE.threads) ? SCENE.threads.length : -1,
    listH: (() => { const l = document.querySelector('#help .help-list'); return l ? l.clientHeight : null })(),
    over: document.body.dataset.bandOverflow || null,
    capVar: root.getPropertyValue('--band-b-help-max').trim() || null,
    botVar: root.getPropertyValue('--band-b-help').trim() || null,
    walk: shown(document.getElementById('walkCard')) ? rect(document.getElementById('walkCard')) : null,
    msheet: document.body.classList.contains('msheet'),
    dock: shown(document.getElementById('maia')) ? rect(document.getElementById('maia')) : null,
    vitals: shown(document.getElementById('vitals')) ? rect(document.getElementById('vitals')) : null,
    pbar: shown(document.getElementById('pbar')) ? rect(document.getElementById('pbar')) : null,
    hitClose: hit('#help .help-close'),
    hitTitle: hit('#help .help-head h4'),
    hitWork: hit('#help .help-work .help-wall'),
    /* Injected nodes anywhere in the document, not only inside the sheet: an
       escape that leaks past the sheet's own subtree is still an escape. */
    injectedInHelp: el ? el.querySelectorAll('[data-xss]').length : -1,
    injectedInDoc: document.querySelectorAll('[data-xss]').length,
    fired: (typeof window.__XSS === 'undefined') ? null : window.__XSS,
    /* PER PAYLOAD, because the place name reaches a sink outside this lane's
       surface (bannerHTML), and keeping its count separate lets #help's own
       contribution be asserted as zero without depending on what #29 did to the
       banner. On this base #29 escaped that sink, so the count is 0 either way;
       split, a future revert of it still shows up here. Counted by data-xss
       value so each field is still asserted about itself. */
    placeInHelp: el ? el.querySelectorAll('[data-xss="place"]').length : -1,
    placeInDoc: document.querySelectorAll('[data-xss="place"]').length,
    placeFired: (typeof window.__XSSPLACE === 'undefined') ? 0 : window.__XSSPLACE,
    helpText: el ? (el.textContent || '') : '',
  };
};

/* Plants a scene through restoreScene — the same call the autosave restore, the
   draft restore and the shell bridge all make — starting from the export the app
   itself writes, so the shape is the app's and not this file's invention. */
const PLANT = ([P, hid, place]) => {
  const J = buildExportJSON();
  /* The place name is poisoned in map_structures, not in the thread, because
     that is the only door it has. The threads still point at 'council', so the
     name renderHelp reads for the where-line and the link is this string. */
  const st = J.map_structures.find(x => x.key === 'council') || J.map_structures[0];
  const stKey = st.key; st.name = place;
  J.forum_threads = [
    { id: 'poison-1', title: 'ordinary thread', structure_keys: [stKey], author: 'Sol', audience: 'member', replies: P.replies, last_activity: '2h', excerpt: 'nothing to see' },
    { id: 'poison-2', title: P.title, structure_keys: [stKey], author: P.author, audience: 'member', replies: 3, last_activity: P.last, excerpt: P.excerpt },
    { id: hid, title: 'the identifier thread', structure_keys: [stKey], author: 'Rivka', audience: 'member', replies: 1, last_activity: '1h', excerpt: 'its id must survive the round trip' },
  ];
  restoreScene(J);
  const a = SCENE.threads[0] || {}, b = SCENE.threads[1] || {};
  /* Byte-exact PER FIELD after the import, so a poisoner that planted nothing
     into one field cannot be read as a renderer that escaped it. */
  return {
    n: SCENE.threads.length,
    landed: {
      title: b.title === P.title, author: b.author === P.author,
      last: b.last === P.last, excerpt: b.ex === P.excerpt,
    },
    /* #29 coerces replies to a number at restore (:5089), so the hostile string
       on poison-1 comes back as 0, not as itself. Captured as a POSITIVE property
       of the coercion — the control for that line — rather than as a failed
       byte-exact survival, which is what it read as when the gate was derived
       against #19. */
    repliesVal: a.replies,
    repliesNum: typeof a.replies === 'number',
    idExact: SCENE.threads[2] && SCENE.threads[2].id === hid,
    stKey: stKey,
    placeLanded: !!(typeof BY !== 'undefined' && BY[stKey] && BY[stKey].name === place),
    /* THE STATE BEFORE THIS SHEET HAS BEEN OPENED. restoreScene rebuilds the map
       banners on its way through; #29 wraps that write in escq(s.name)
       (bannerHTML :3163), so a poisoned place name is escaped there and this is 0.
       Captured now so the count after the tap can be attributed, and so a revert
       of #29's banner escaping shows up here as a node before #help ever runs. */
    preTapPlaceNodes: document.querySelectorAll('[data-xss="place"]').length,
    preTapPlaceFired: (typeof window.__XSSPLACE === 'undefined') ? 0 : window.__XSSPLACE,
    preTapHelpNodes: document.getElementById('help')
      ? document.getElementById('help').querySelectorAll('[data-xss]').length : -1,
  };
};

(async () => {
  console.log('artifact: ' + FILE + '\n');
  const browser = await chromium.launch({ executablePath: EXE, args: ['--allow-file-access-from-files', '--force-device-scale-factor=1'] });

  /* ================= §0  the sheet exists and the button drives it ========= */
  console.log('§0  the button renders the sheet (nothing below is meaningful without this)');
  {
    const { ctx, page, errs } = await open(browser, 390, 844, true);
    const tapped = await tapHelp(page);
    ok('#pbAttn is tappable on a pocket', tapped, 'tapped=' + tapped);
    const r = await page.evaluate(READ);
    ok('#help is in the document', r.exists && r.inDoc, 'exists=' + r.exists + ' inDoc=' + r.inDoc);
    ok('the tap opened it', r.show && r.disp === 'flex', 'show=' + r.show + ' display=' + r.disp);
    ok('it rendered a non-zero number of rows', r.rows > 0, 'rows=' + r.rows);
    ok('one row per thread', r.rows === r.threads, 'rows=' + r.rows + ' SCENE.threads=' + r.threads);
    ok('no page errors on open', errs.length === 0, errs.join(' ; ') || 'none');
    await ctx.close();
  }

  /* ================= §1  stored XSS through restoreScene ================== */
  console.log('\n§1  a scene a stranger authored cannot execute in this sheet');
  {
    const { ctx, page, errs } = await open(browser, 390, 844, true);
    const planted = await page.evaluate(PLANT, [PAYLOADS, HOSTILE_ID, PLACE_PAY]);
    ok('the planted scene reached SCENE.threads', planted.n === 3, 'threads=' + planted.n);
    for (const f of RAWFIELDS) {
      ok('the ' + f + ' payload survived the import byte for byte', planted.landed[f],
        f + '-byte-exact=' + planted.landed[f]);
    }
    /* #29's coercion, asserted as the fix it is, not as a hole. restoreScene maps
       replies:Number(t.replies)||0 (:5089), so the hostile string on poison-1 is a
       number after import — 0 — and cannot ride into innerHTML as a string. Revert
       that coercion (x11) and this reds; escq(t.replies) in renderHelp is then only
       harmless hygiene over a value that is already a number. */
    ok('restoreScene coerces a hostile replies string to a number (#29)',
      planted.repliesNum && planted.repliesVal === 0,
      'typeof=' + (typeof planted.repliesVal) + ' value=' + JSON.stringify(planted.repliesVal));
    const tapped = await tapHelp(page);
    ok('the sheet opened over the planted scene', tapped, 'tapped=' + tapped);
    const r = await page.evaluate(READ);
    ok('the sheet rendered the planted rows', r.rows === 3, 'rows=' + r.rows);
    ok('no injected node inside #help', r.injectedInHelp === 0, 'data-xss nodes in #help=' + r.injectedInHelp);
    /* Everything the THREAD carried, document-wide. The place name is counted
       separately below because its sink is not this lane's. */
    ok('no thread payload reached the document as a node',
      r.injectedInDoc - r.placeInDoc === 0,
      'data-xss nodes in document=' + r.injectedInDoc + ' of which place=' + r.placeInDoc);
    ok('nothing a hostile thread carried executed', r.fired === null, 'window.__XSS=' + r.fired);

    /* ---- the place name: #29 closed the banner sink too, and this proves it ----
       restoreScene rebuilds the map banners on its way through, and #29 wraps that
       write in escq(s.name) (bannerHTML :3163). So a poisoned place name reaches
       the document as ESCAPED TEXT and injects NO node — not before this sheet
       exists, and not when renderHelp (which also escapes it) runs. This lane's
       contribution is zero and #29's is zero; unescaping EITHER surface takes a
       check here red. */
    ok('the place-name payload survived the import byte for byte', planted.placeLanded,
      'BY[' + planted.stKey + '].name byte-exact=' + planted.placeLanded);
    /* NODE COUNTS, not the flag. A node parsed by innerHTML lands synchronously;
       its onerror fires a turn later. The count of nodes is the deterministic
       quantity, and the flag is asserted only as a BOUND on it afterwards. */
    ok('#29 escapes the poisoned place name in bannerHTML: no node reaches the document before this sheet exists',
      planted.preTapPlaceNodes === 0 && planted.preTapHelpNodes === 0,
      'pre-tap nodes=' + planted.preTapPlaceNodes + ' in #help=' + planted.preTapHelpNodes
      + '  (bannerHTML :3163 now wraps escq(s.name); revert it and this reads 1)');
    ok('no injected place name inside #help', r.placeInHelp === 0, 'place nodes in #help=' + r.placeInHelp);
    ok('opening the sheet added no place-name node',
      r.placeInDoc === planted.preTapPlaceNodes,
      'after tap nodes=' + r.placeInDoc + '  before tap nodes=' + planted.preTapPlaceNodes);
    ok('no poisoned place name ever executed',
      r.placeFired <= planted.preTapPlaceNodes,
      'window.__XSSPLACE=' + r.placeFired + ' against ' + planted.preTapPlaceNodes + ' injected node(s)');
    ok('the place name is on screen in the sheet as literal text',
      r.helpText.indexOf(PLACE_PAY) >= 0, 'present in #help textContent=' + (r.helpText.indexOf(PLACE_PAY) >= 0));
    /* THE OTHER HALF OF THE SAME CLAIM: escaped means SHOWN AS TEXT, not eaten,
       and it is asserted PER FIELD because a shared payload let one field's text
       vouch for another's. A renderer that dropped any one of these would satisfy
       every injection check above and go red on exactly one line here. `replies`
       is not among them — it is a number now, shown as its own count, asserted
       just below. */
    for (const f of RAWFIELDS) {
      ok('the ' + f + ' payload is on screen as literal text', r.helpText.indexOf(PAYLOADS[f]) >= 0,
        f + ' present in #help textContent=' + (r.helpText.indexOf(PAYLOADS[f]) >= 0));
    }
    /* THE READER STILL GETS THE COUNT. poison-2 carries replies:3, and dropping
       the field instead of rendering it (the x2 mutant) takes "3 replies" to
       " replies" and reds this. That is the real regression left once the XSS is
       a non-issue: a lost count, not a lost escape. */
    ok('the numeric reply count is on screen for the reader', r.helpText.indexOf('3 replies') >= 0,
      '"3 replies" present in #help textContent=' + (r.helpText.indexOf('3 replies') >= 0));
    ok('no page errors over a hostile scene', errs.length === 0, errs.join(' ; ') || 'none');
    await ctx.close();
  }

  /* ================= §2  the identifier round trip ======================== */
  console.log('\n§2  an identifier out of a dataset attribute is byte-identical');
  {
    const { ctx, page } = await open(browser, 390, 844, true);
    const planted = await page.evaluate(PLANT, [PAYLOADS, HOSTILE_ID, PLACE_PAY]);
    ok('the hostile id reached SCENE.threads unchanged', planted.idExact, 'id-byte-exact=' + planted.idExact);
    await tapHelp(page);
    const rt = await page.evaluate(hid => {
      const rows = [...document.querySelectorAll('#help .help-row')];
      const row = rows.find(r => r.dataset.id === hid) || rows[rows.length - 1];
      const link = row ? row.querySelector('.help-link') : null;
      return {
        rows: rows.length,
        dataId: row ? row.dataset.id : null,
        dataItem: link ? link.dataset.item : null,
        dataAt: link ? link.dataset.at : null,
      };
    }, HOSTILE_ID);
    ok('data-id comes back byte-identical', rt.dataId === HOSTILE_ID,
      'got ' + JSON.stringify(rt.dataId) + ' want ' + JSON.stringify(HOSTILE_ID));
    ok('data-item carries the same id, unnormalised', rt.dataItem === 'talk:' + HOSTILE_ID,
      'got ' + JSON.stringify(rt.dataItem));
    ok('data-at is the place key it was given', rt.dataAt === 'council', 'got ' + JSON.stringify(rt.dataAt));
    await ctx.close();
  }

  /* ================= §3  the viewport sweep ============================== */
  console.log('\n§3  where the sheet sits, on every screen it opens on');
  for (const [tag, list, touch] of [['portrait', PORTRAIT, true], ['LANDSCAPE', LANDSCAPE, true], ['desk', DESK, false]]) {
    for (const [w, h] of list) {
      const label = tag + ' ' + w + 'x' + h;
      const { ctx, page, errs } = await open(browser, w, h, touch);
      const dockUp = touch ? await waitDock(page) : false;
      const closed = await page.evaluate(READ);
      const tapped = await tapHelp(page);

      if (tag === 'desk') {
        /* Off the pocket profile there is no tab bar to tap and no bottom band
           to be a tenant of, so the only right answer is that nothing was
           published and nothing opened. */
        ok(label + ': no help button off the pocket profile', !tapped, 'tapped=' + tapped);
        ok(label + ': the cap is not published there', closed.capVar === null, 'cap=' + closed.capVar);
        ok(label + ': the bottom offset is not published there', closed.botVar === null, 'bottom=' + closed.botVar);
        await ctx.close();
        continue;
      }

      ok(label + ': the cap is absent while the sheet is closed', closed.capVar === null, 'cap=' + closed.capVar);
      ok(label + ': the button opened it', tapped, 'tapped=' + tapped);
      /* Bounded, and the checks below run whatever it returns — see waitVar. */
      const capUp = await waitVar(page, '--band-b-help-max');
      const r = await page.evaluate(READ);
      ok(label + ': rows match SCENE.threads and are non-zero', r.rows > 0 && r.rows === r.threads,
        'rows=' + r.rows + ' threads=' + r.threads);

      /* THE BAND'S OWN VERDICT. Non-zero means it gave up no-overlap in order to
         keep everything on screen, which is the exact state this sheet used to
         force in landscape. */
      ok(label + ': the bottom band does not overflow', r.over === null, 'data-band-overflow=' + r.over);

      /* GEOMETRY, against the two bars and the tenant that shares the band. */
      ok(label + ': the sheet is entirely on screen', r.help && r.help.t >= 0 && r.help.b <= r.vh,
        'help ' + (r.help ? r.help.t + '..' + r.help.b : 'null') + ' vh=' + r.vh);
      ok(label + ': the sheet clears the tab bar', !r.pbar || r.help.b <= r.pbar.t,
        'help.b=' + (r.help && r.help.b) + ' pbar.t=' + (r.pbar && r.pbar.t));
      ok(label + ': the sheet clears the vitals bar', !r.vitals || r.help.t >= r.vitals.b,
        'help.t=' + (r.help && r.help.t) + ' vitals.b=' + (r.vitals && r.vitals.b));
      /* THE FIRST-RUN STATE, ASSERTED, NOT ASSUMED. #32 retired the walk card;
         the surface that rises on a fresh profile is the journey dock, and it
         is measured BEFORE the tap so the check after this one is about the
         state a newcomer is actually in when the thumb lands. */
      ok(label + ': the journey dock was up when the reader tapped',
        dockUp && closed.msheet && !!closed.dock,
        'waited=' + dockUp + ' dock=' + (closed.dock ? closed.dock.t + '..' + closed.dock.b : 'not shown'));
      /* ONE SHEET AT A TIME is how the band's overlap problem is solved now:
         openHelp (:7857) removes body.msheet, so the dock leaves the band as
         this sheet enters it, and nothing re-raises it — maiaSay keeps writing
         into the hidden dock while the journey runs on, measured +6s out. The
         walk card is pinned retired in the same breath: its markup and band
         slot are still in the file (:7989) and NOTHING may show it. */
      ok(label + ': the tap swapped the dock for the sheet, and no walk card rose',
        !r.msheet && r.dock === null && r.walk === null && closed.walk === null,
        'msheet=' + r.msheet + ' dock=' + (r.dock ? r.dock.t + '..' + r.dock.b : 'dismissed')
        + ' walkCard=' + (r.walk || closed.walk ? 'SHOWN' : 'retired'));
      /* THE LIST IS WHAT THE READER CAME FOR, and a sheet whose list is 0px high
         is thirteen rows in the DOM that nobody can see — the same shape as
         every other silent zero this round. Asserted outright on every screen
         360px tall or more; below that the condition is a SCREEN HEIGHT, not a
         skip, and the one screen it lets through is pinned after the loop. */
      ok(label + ': the list seats a row on any screen 360px tall or more',
        r.vh >= 360 ? r.listH > 0 : true, 'vh=' + r.vh + ' list clientHeight=' + r.listH);
      /* The band state is recorded with it because it is the diagnosis: on
         #31's base the cause was the walk card's 143px of a 279px band. The
         dock is dismissed by openHelp and the card is retired, so a starved
         screen now means the sheet's own chrome outgrew the room — a different
         defect, and this line makes them tell apart. */
      if (!(r.listH > 0)) STARVED.push(label + ' vh=' + r.vh + ' cap=' + r.capVar
        + ' help.h=' + r.help.h + ' dock=' + (r.dock ? r.dock.h + 'px' : 'dismissed')
        + ' walkCard=' + (r.walk ? r.walk.h + 'px' : 'retired'));

      /* THE COMPOSITED PAGE. Everything above can be true of a sheet nobody can
         see or touch; these three are the ones that cannot. */
      ok(label + ': the close button is the topmost thing at its own centre',
        r.hitClose.found && r.hitClose.onscreen && r.hitClose.mine,
        JSON.stringify(r.hitClose));
      ok(label + ': the title is not covered', r.hitTitle.found && r.hitTitle.onscreen && r.hitTitle.inHelp,
        JSON.stringify(r.hitTitle));
      ok(label + ': the Get Involved row is not covered', r.hitWork.found && r.hitWork.onscreen && r.hitWork.mine,
        JSON.stringify(r.hitWork));

      /* THE CAP IS FALSIFIABLE, and it takes three checks together to make it so.
         A published number that nothing reads would satisfy the first; a CSS rule
         reading a var that is never below the authored cap would satisfy the
         first two. The third is a property of the SWEEP and is asserted after the
         loop: the cap has to come out below 42vh on the short screens, or it is a
         var that changed nothing anywhere. */
      const cap = parseInt(r.capVar || '0', 10), vh42 = Math.round(r.vh * 0.42);
      ok(label + ': the cap is published while the sheet is open', /^\d+px$/.test(r.capVar || ''),
        'cap=' + r.capVar + ' settled=' + capUp);
      ok(label + ': the sheet is no taller than the cap it was given',
        cap > 0 && r.help.h <= cap + 2, 'help.h=' + (r.help && r.help.h) + ' cap=' + cap + ' 42vh=' + vh42);
      if (tag === 'LANDSCAPE' && cap > 0 && cap < vh42) { BITES.push(label + ' ' + cap + '<' + vh42); }
      ok(label + ': no page errors', errs.length === 0, errs.join(' ; ') || 'none');
      info(label + ': help ' + (r.help ? r.help.t + '..' + r.help.b : '-')
        + '  dock ' + (r.dock ? r.dock.t + '..' + r.dock.b : 'dismissed')
        + '  cap=' + r.capVar + '  bottom=' + r.botVar + '  over=' + r.over);
      await ctx.close();
    }
  }

  /* §4  INVERTED BY #32, on the same measurement. On #31's base the walk card
     took up to half the band, the published cap came out below the authored
     42vh on the short landscape screens, and this line demanded that it did —
     a var that never decided anything would have been the literal it replaced.
     #32 retired the card, and openHelp dismisses the dock, so the open sheet
     has the band to itself: the room is 209..821px against a 42vh ask on
     2719f4f, and no reachable swept state shrinks it. MEASURED, not assumed —
     the sweep still collects every landscape screen where the cap bites, and
     there must now be none. If this reds, a tenant is sharing the band with
     the open sheet again; that is the #31 scarcity come back, not a band
     defect, so re-derive the ratchet in that direction (the cap must bite and
     the sheet must obey it) rather than deleting the line. The cap machinery
     itself is still asserted per screen above: published while open, absent
     while closed, and the sheet no taller than the number it was given. */
  console.log('\n§4  the cap is published and obeyed, and nothing shares the band to make it bite');
  ok('no landscape screen shrinks the cap below the authored 42vh any more', BITES.length === 0,
    BITES.length ? BITES.join(' | ') : 'nothing shared the band');

  /* WHAT #31 PINNED, #32 FIXED FROM THE SIDE, and the pin inverts rather than
     dies. At 568x320 the walk card's 143px of a 279px band left this sheet
     72px — exactly its own head plus footer — and the list seated nothing;
     both cheap ways out were measured then and both were worse, so #31 pinned
     the starvation as a fact ("IF YOU FIX IT this goes red and that is
     correct"). #32 fixed it by retiring the card: the same screen now gets a
     209px cap and seats a 56px list on 2719f4f. So the pin flips into the
     ratchet #31 could not write: NO swept screen may starve the list. If this
     reds, either the sheet's own chrome grew past the room a short screen has,
     or a tenant is sharing the band again — each entry names the screen, the
     cap, and the dock and walk-card state so the diagnoses tell apart. */
  console.log('\n§4b no screen\'s room is smaller than the sheet\'s own chrome any more');
  ok('no swept screen starves the list (568x320 did, until #32 retired the walk card)',
    STARVED.length === 0,
    STARVED.length ? STARVED.join(' | ') : 'every open sheet seats at least one row');

  /* ================= §5  the top band: the vital dropdown ================= */
  /* THE OTHER HALF OF THIS LANE. R15 made #vdrop a tenant of the top band; this
     asserts that it still is after every rebase.
     THE WALK-CARD RATCHET THAT STOOD HERE RETIRED WITH THE CARD. The bands
     still cannot solve for each other in one pass — the bottom band's limit is
     innerHeight minus the top band's ceiling, the top band's limit is
     innerHeight full stop — so on a landscape phone the bottom band's tallest
     tenant is clamped UP under an open dropdown. On #31's base that tenant was
     the 143px walk card and its cover was pinned per screen as a ceiling
     (16/13/31/46px, bottom third only). #32's journey dock is a 279px sheet,
     so mid-journey on a landscape pocket it sits over MOST of an open
     dropdown, top included — measured on 2719f4f, not assumed, and a
     first-run-only state: the walk runs once per profile and body.msheet
     leaves with it. This lane's answer keeps #31's shape — measure it, pin WHO
     may do it, and assert the state a reader lives in afterwards. Mid-journey,
     nothing but the dock may sit over the readings and the walk card may not
     rise at all; the journey ended, the dropdown must still be open and every
     reading uncovered. A third surface over the readings, or any cover once
     the walk is done, reds this. A pixel ratchet on the dock itself would
     ratchet the length of whatever the current stop SAYS — copy, not layout —
     so there deliberately is none. */
  console.log('\n§5  the vital dropdown is a top-band tenant, mid-journey and after');
  const capVals = new Set();
  /* THE DESK PAIR IS NOT PADDING. #vdrop is a tenant of the TOP band, which is
     the one band that exists on both profiles, so unlike #help this surface has
     to be checked off the pocket too. They are also what makes the last check in
     this section falsifiable: on a pocket the offset is 41px on all six screens,
     so a set built from pockets alone would be a single constant and "measured,
     not a literal" would be vacuously true of a hardcoded 41. */
  for (const [w, h, touch] of [[390, 844, true], [844, 390, true], [851, 393, true], [667, 375, true],
  [740, 360, true], [932, 430, true], [1280, 800, false], [1920, 1080, false]]) {
    const label = w + 'x' + h;
    const { ctx, page, errs } = await open(browser, w, h, touch);
    /* THE MID-JOURNEY READS BELOW ARE ABOUT THE FIRST-RUN STATE, so a dock that
       is not up yet would let "only the dock covers it" pass on an empty page.
       Waited for and asserted on the pocket, where the walk auto-starts; on a
       desk there is no msheet and no auto-walk, and the strict form runs. */
    const dockUp = touch ? await waitDock(page) : false;
    if (touch) ok(label + ': the journey dock is up, so the mid-journey reads are about the first-run state',
      dockUp, 'waited=' + dockUp);
    const closedVar = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--band-t-vdrop').trim() || null);
    ok(label + ': --band-t-vdrop is absent while the dropdown is closed', closedVar === null, 'var=' + closedVar);

    const tgt = await page.evaluate(() => {
      const v = document.querySelector('.vital'); if (!v) return null;
      const r = v.getBoundingClientRect(); if (r.width < 2) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    ok(label + ': a vital is on screen to tap', !!tgt, tgt ? 'yes' : 'no .vital');
    if (!tgt) { await ctx.close(); continue }
    if (touch) await page.touchscreen.tap(tgt.x, tgt.y); else await page.mouse.click(tgt.x, tgt.y);
    await page.waitForTimeout(700);
    /* Bounded wait for the band to have run, then assert as before. */
    const varUp = await waitVar(page, '--band-t-vdrop');

    const r = await page.evaluate(() => {
      const shown = e => { if (!e) return false; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0 };
      const box = e => { const q = e.getBoundingClientRect(); return { t: Math.round(q.top), b: Math.round(q.bottom), h: Math.round(q.height) } };
      const vd = document.getElementById('vdrop'), wk = document.getElementById('walkCard'), vt = document.getElementById('vitals'), mk = document.getElementById('maia');
      if (!shown(vd)) return { open: false };
      const q = vd.getBoundingClientRect();
      /* Down the dropdown's own column, on the composited page. The reading the
         reader tapped for lives in the top two thirds, and WHO sits over a
         point matters: mid-journey the dock is allowed there and nothing else
         is, so the classifier names it rather than folding it into "covered". */
      const at = f => {
        const x = Math.round(q.left + q.width / 2), y = Math.round(q.top + q.height * f);
        const top = document.elementFromPoint(x, y);
        if (top && top.closest && top.closest('#vdrop')) return 'vdrop';
        if (top && top.closest && top.closest('#maia')) return 'dock';
        return top ? ('#' + (top.id || (typeof top.className === 'string' ? top.className.split(' ')[0] : '?'))) : 'nothing';
      };
      const V = box(vd);
      return {
        open: true, vh: innerHeight, vdrop: V,
        walk: shown(wk) ? box(wk) : null, vitals: shown(vt) ? box(vt) : null,
        dock: shown(mk) ? box(mk) : null,
        topAt: [at(0.08), at(0.33), at(0.62), at(0.95)],
        vdropVar: getComputedStyle(document.documentElement).getPropertyValue('--band-t-vdrop').trim() || null,
      };
    });
    ok(label + ': the tap opened the dropdown', r.open, 'open=' + r.open);
    if (!r.open) { await ctx.close(); continue }
    ok(label + ': --band-t-vdrop is published once it is open', /^\d+px$/.test(r.vdropVar || ''),
      'var=' + r.vdropVar + ' settled=' + varUp);
    /* R15's whole point: the var is MEASURED, not the 46px desk-bar literal it
       falls back to. A published 46px on a pocket is the fallback wearing a
       value. */
    ok(label + ': the published offset is not the 46px fallback', r.vdropVar !== '46px', 'var=' + r.vdropVar);
    /* THE VAR AND THE ELEMENT HAVE TO AGREE, and this is the only check in the
       section that can tell a read var from an ignored one. A var with a fallback
       cannot fail visibly: strip the var() out of #vdrop's `top` and the band
       goes on publishing 41px while the element sits at the 46px literal, and
       every other check here stays green because 46 still clears the bar, still
       fits on screen, and still overlaps the walk card by less than the base. */
    ok(label + ': the dropdown sits exactly where the band published',
      r.vdrop.t === parseInt(r.vdropVar || '-1', 10),
      'vdrop.t=' + r.vdrop.t + ' var=' + r.vdropVar);
    ok(label + ': the dropdown is entirely on screen', r.vdrop.t >= 0 && r.vdrop.b <= r.vh,
      'vdrop ' + r.vdrop.t + '..' + r.vdrop.b + ' vh=' + r.vh);
    ok(label + ': the dropdown clears the vitals bar', !r.vitals || r.vdrop.t >= r.vitals.b,
      'vdrop.t=' + r.vdrop.t + ' vitals.b=' + (r.vitals && r.vitals.b));
    if (touch) {
      /* Mid-journey, on the short screens, the 279px dock sits over the open
         dropdown — the bands cannot see each other, and #32 made the bottom
         tenant taller. WHO covers is the assertion: the dock, and nothing
         else. Anything a third surface put there names itself in the detail. */
      ok(label + ': mid-journey, nothing but the journey dock sits over the readings',
        r.topAt.slice(0, 3).every(x => x === 'vdrop' || x === 'dock'), JSON.stringify(r.topAt));
      ok(label + ': the walk card stays retired mid-journey', r.walk === null,
        'walkCard=' + (r.walk ? 'SHOWN ' + r.walk.t + '..' + r.walk.b : 'retired')
        + ' dock=' + (r.dock ? r.dock.t + '..' + r.dock.b : 'not shown'));
    } else {
      ok(label + ': the top two thirds of the dropdown are uncovered',
        r.topAt.slice(0, 3).every(x => x === 'vdrop'), JSON.stringify(r.topAt));
    }
    if (r.vdropVar) capVals.add(r.vdropVar);
    if (touch) {
      /* THE STATE A READER LIVES IN. The walk runs once per profile ever;
         every vital tapped after it is over must show its readings. jEnd() is
         the same call Escape and "stay here" make. The dropdown closes on a
         TAP anywhere else and this is not one, so it must still be open — a
         gate that ended the walk by closing the dropdown would be asserting
         the uncovered state of nothing. */
      await page.evaluate(() => { if (typeof window.jEnd === 'function') window.jEnd() });
      await page.waitForTimeout(600);
      const after = await page.evaluate(() => {
        const v = document.getElementById('vdrop');
        const q = v.getBoundingClientRect();
        const at = f => {
          const x = Math.round(q.left + q.width / 2), y = Math.round(q.top + q.height * f);
          const top = document.elementFromPoint(x, y);
          if (top && top.closest && top.closest('#vdrop')) return 'vdrop';
          if (top && top.closest && top.closest('#maia')) return 'dock';
          return top ? ('#' + (top.id || (typeof top.className === 'string' ? top.className.split(' ')[0] : '?'))) : 'nothing';
        };
        return { open: v.classList.contains('show'), msheet: document.body.classList.contains('msheet'),
                 topAt: [at(0.08), at(0.33), at(0.62), at(0.95)] };
      });
      ok(label + ': the journey over, the dropdown is still open and every reading is uncovered',
        after.open && !after.msheet && after.topAt.every(x => x === 'vdrop'),
        JSON.stringify(after));
    }
    ok(label + ': no page errors', errs.length === 0, errs.join(' ; ') || 'none');
    info(label + ': vdrop ' + r.vdrop.t + '..' + r.vdrop.b + '  dock '
      + (r.dock ? r.dock.t + '..' + r.dock.b : 'not shown')
      + '  topAt=' + JSON.stringify(r.topAt) + '  var=' + r.vdropVar);
    await ctx.close();
  }
  /* ================= §5b  a floor the band cannot measure ================= */
  /* THE CHECK THAT ONLY EXISTS BECAUSE THE SLEEP BECAME A WAIT. Replacing §5's
     fixed 700ms with waitVar turned a stable green into 2 reds in 5, always
     `1920x1080: the dropdown clears the vitals bar [vdrop.t=6 vitals.b=46]`.
     bandPlace measured its floor with bandShown and treated an unmeasurable one
     as a floor at zero, so the top band placed its first tenant at pad — 6px —
     and #vdrop sat ON TOP of the bar it hangs from, over the readings the reader
     tapped for. Nothing scheduled a corrective pass, so 6px is where it stayed.
     THIS DRIVES THE STATE RATHER THAN WAITING FOR IT. The floor is hidden for
     exactly one bandLayout pass and put straight back; nothing touches #vdrop.
     Before the fix this published 6px on all three profiles; after it, nothing,
     and the CSS fallback holds the dropdown clear of the bar. */
  console.log('\n§5b a band that cannot find its own edge publishes nothing, not zero');
  for (const [w, h, touch] of [[1920, 1080, false], [1280, 800, false], [390, 844, true]]) {
    const label = w + 'x' + h;
    const { ctx, page, errs } = await open(browser, w, h, touch);
    const tgt = await page.evaluate(() => {
      const v = document.querySelector('.vital'); if (!v) return null;
      const r = v.getBoundingClientRect(); return r.width < 2 ? null : { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    ok(label + ': a vital is on screen to tap', !!tgt, tgt ? 'yes' : 'no .vital');
    if (!tgt) { await ctx.close(); continue }
    if (touch) await page.touchscreen.tap(tgt.x, tgt.y); else await page.mouse.click(tgt.x, tgt.y);
    await page.waitForTimeout(700);
    await waitVar(page, '--band-t-vdrop');

    const f = await page.evaluate(() => {
      const vt = document.getElementById('vitals'), vd = document.getElementById('vdrop');
      const prev = vt.style.display;
      vt.style.display = 'none';
      bandLayout();
      vt.style.display = prev;
      return {
        v: getComputedStyle(document.documentElement).getPropertyValue('--band-t-vdrop').trim() || null,
        vdropTop: Math.round(vd.getBoundingClientRect().top),
        vitalsBottom: Math.round(vt.getBoundingClientRect().bottom),
        open: vd.classList.contains('show'),
      };
    });
    ok(label + ': the dropdown is still open for this to be about anything', f.open, 'show=' + f.open);
    ok(label + ': the band published nothing while its floor was unmeasurable', f.v === null, 'var=' + f.v);
    ok(label + ': the dropdown fell back to its CSS value, not to the top of the screen',
      f.vdropTop === 46, 'vdrop.t=' + f.vdropTop + ' (46 is the authored fallback)');
    ok(label + ': and it still clears the vitals bar', f.vdropTop >= f.vitalsBottom,
      'vdrop.t=' + f.vdropTop + ' vitals.b=' + f.vitalsBottom);

    /* It has to come BACK, or "publish nothing" would be a way to pass by
       switching the band off. */
    const recovered = await waitVar(page, '--band-t-vdrop');
    const a = await page.evaluate(() => {
      const vd = document.getElementById('vdrop'), vt = document.getElementById('vitals');
      return {
        v: getComputedStyle(document.documentElement).getPropertyValue('--band-t-vdrop').trim() || null,
        t: Math.round(vd.getBoundingClientRect().top), b: Math.round(vt.getBoundingClientRect().bottom)
      };
    });
    ok(label + ': the band publishes again once the floor is measurable',
      recovered && /^\d+px$/.test(a.v || '') && a.t === parseInt(a.v, 10) && a.t >= a.b,
      'var=' + a.v + ' vdrop.t=' + a.t + ' vitals.b=' + a.b);
    ok(label + ': no page errors', errs.length === 0, errs.join(' ; ') || 'none');
    await ctx.close();
  }

  /* R15's claim, made falsifiable. `--band-t-vdrop` replaced a hardcoded top:46px
     that stayed 46px whatever bar it hung from. A var that publishes ONE value on
     every screen would be that literal again under a new name, so this asserts the
     set has more than one member and that 46px is not among them. */
  ok('the published offset is measured and not a literal', capVals.size >= 2 && !capVals.has('46px'),
    'distinct published offsets: ' + ([...capVals].join(' ') || 'none'));

  await browser.close();
  console.log('\nCHECKS ' + CHECKS + '   FAILS ' + FAILS);
  /* A run that executed no checks is a crash wearing a pass. */
  if (CHECKS === 0) { console.log('FAIL harness: zero checks executed'); process.exit(3) }
  process.exit(FAILS ? 1 : 0);
})().catch(e => { console.log('FAIL harness threw: ' + e.message + '\n' + (e.stack || '')); console.log('\nCHECKS ' + CHECKS + '   FAILS ' + (FAILS + 1)); process.exit(2) });
