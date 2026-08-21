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
 * thing broken, qa/_mut_run_l8.sh runs this gate against each and asserts a
 * NON-ZERO check count before believing any verdict — a crash contributes an
 * empty FAIL set and would otherwise read as a clean pass.
 *
 *     cd docs/prototypes/qa
 *     MUT_ROOT="C:/some/real/path/L8MUT" bash _mut_run_l8.sh
 *     # every row must read <name>|1|<checks>|<fails>  with checks>0 and fails>0
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
 * ONE CHECK IS A PINNED MEASUREMENT, NOT A CLAIM OF SUCCESS. §4b names the one
 * swept screen (568x320, an iPhone SE sideways) where the room the band can give
 * this sheet is smaller than the sheet's own head plus footer, so the list seats
 * nothing. It is not a regression — on the pristine base that button opened a
 * card body.pocket hides outright — and it is not cheaply fixable; both ways out
 * were measured and both are worse. Read the note at §4b before touching it.
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
 * IT IS SCOPED TO THIS LANE'S SURFACE ON PURPOSE. A poisoned place name also
 * reaches bannerHTML (:3151), which interpolates `${s.name}` into a template and
 * lets makeBanner write it with innerHTML — a sink older than this lane, fired by
 * restoreScene before #help exists. Counting data-xss document-wide would make
 * this file red about the map banner, which is how a gate stops being read. The
 * counts are per payload, the banner's one node is measured BEFORE the tap, and
 * what this lane owns is asserted as the delta.
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
/* Every field renderHelp writes into the row as element text. */
const FIELDS = ['title', 'author', 'replies', 'last', 'excerpt'];
const PAYLOADS = {}; for (const f of FIELDS) PAYLOADS[f] = pay(f);

/* THE SIXTH FIELD, AND THE HOLE IT CLOSES. Every check above was watched going
   red under a single-edit mutation except one: stripping the escq off the PLACE
   NAME — `homes.map(k=>escq(nameOf(k)))`, which renderHelp writes twice into
   every row, once in the where-line and once in "take me to <place> →" — left
   this file at 288 checks, 0 fails, exit 0. It was guarded by nothing, because
   PLANT only ever poisoned forum_threads and a place name does not come from
   there. It comes from map_structures, through the same restoreScene.
   ITS FLAG IS ITS OWN, and that is not tidiness. A poisoned place name ALSO
   reaches a sink this lane does not own: bannerHTML (:3151) interpolates
   `${s.name}` into a template string and makeBanner writes it with innerHTML, so
   restoreScene alone injects and fires it before #help exists at all. Sharing
   window.__XSS would make "nothing executed" red about the map banner rather
   than about this sheet. Split, the sheet's own contribution is provable: the
   banner's one node is measured BEFORE the tap, and the count after the tap must
   still be that same one. Unescape the place name and renderHelp adds two more
   (the where-line and the link), and three checks go red at once. */
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

/* THE WALK CARD IS A RACE, AND THREE CHECKS USED TO PASS BY ITS ABSENCE.
   nextWalk fills #walkCard and shows it inside travelTo's completion callback
   (:6699) — a camera animation — and the walk auto-starts on a fresh profile
   (:6738, no 'amora-walk-done' in localStorage). Every check that mentions the
   card is written `!r.walk || …`, so on a machine where the animation runs long
   the card is not up yet and the overlap checks are satisfied by nothing being
   there. That is not theory: on a loaded box _probe_l8_adv.js measured #walkCard
   absent at 568x320 and the room the band published went 72px to 209px, which
   would have taken §4b red for a reason with nothing to do with the artifact.
   So wait for it, and then ASSERT it — the whole landscape fix is about the
   state where this card is up, and a sweep that measures the other state is
   measuring the wrong page. Only on a pocket: on a desk the card never shows,
   and waiting for it there would be nine wasted seconds per viewport. */
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

async function waitWalk(page, ms = 9000) {
  try {
    await page.waitForFunction(() => {
      const w = document.getElementById('walkCard');
      if (!w) return false;
      const cs = getComputedStyle(w);
      return cs.display !== 'none' && cs.visibility !== 'hidden' && w.getBoundingClientRect().height > 2;
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
    /* PER PAYLOAD, and only because one of the six reaches a sink outside this
       lane. A single document-wide total would make this file red about
       bannerHTML rather than about #help, which is the failure mode where a gate
       stops being read. Counted by data-xss value so each field is still
       asserted about itself. */
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
      replies: a.replies === P.replies, last: b.last === P.last, excerpt: b.ex === P.excerpt,
    },
    idExact: SCENE.threads[2] && SCENE.threads[2].id === hid,
    stKey: stKey,
    placeLanded: !!(typeof BY !== 'undefined' && BY[stKey] && BY[stKey].name === place),
    /* THE STATE BEFORE THIS SHEET HAS BEEN OPENED. restoreScene rebuilds the map
       banners on its way through, and bannerHTML (:3151) writes a place name
       into innerHTML unescaped, so this is already non-zero here — on a surface
       older than this lane and owned by another. Captured now so the count after
       the tap can be attributed. */
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
    for (const f of FIELDS) {
      ok('the ' + f + ' payload survived the import byte for byte', planted.landed[f],
        f + '-byte-exact=' + planted.landed[f]);
    }
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

    /* ---- the place name: this sheet's contribution is zero, and provably ----
       The banner sink fires during restoreScene, before #help exists, so the
       document count is 1 whatever this sheet does. What this lane owns is the
       DELTA: renderHelp writes the place name twice per row, so unescaping it
       takes the count from 1 to 3 and takes all three of these red at once. */
    ok('the place-name payload survived the import byte for byte', planted.placeLanded,
      'BY[' + planted.stKey + '].name byte-exact=' + planted.placeLanded);
    /* NODE COUNTS, not the flag, and the difference cost a red to learn. The
       node is parsed into the document synchronously by innerHTML; its onerror
       fires on a later turn. Asserting `fired` at plant time said 0 and asserted
       nothing about the sink. The count of nodes is the deterministic quantity,
       and the flag is asserted only as a BOUND on it afterwards. */
    ok('a poisoned place name reaches the document from restoreScene alone, before this sheet exists',
      planted.preTapPlaceNodes === 1 && planted.preTapHelpNodes === 0,
      'pre-tap nodes=' + planted.preTapPlaceNodes + ' in #help=' + planted.preTapHelpNodes
      + '  (bannerHTML :3151, a sink older than this lane; its onerror fires a turn later)');
    ok('no injected place name inside #help', r.placeInHelp === 0, 'place nodes in #help=' + r.placeInHelp);
    ok('opening the sheet added no place-name node',
      r.placeInDoc === planted.preTapPlaceNodes,
      'after tap nodes=' + r.placeInDoc + '  before tap nodes=' + planted.preTapPlaceNodes);
    ok('nothing beyond that one banner node ever executed',
      r.placeFired <= planted.preTapPlaceNodes,
      'window.__XSSPLACE=' + r.placeFired + ' against ' + planted.preTapPlaceNodes + ' injected node(s)');
    ok('the place name is on screen in the sheet as literal text',
      r.helpText.indexOf(PLACE_PAY) >= 0, 'present in #help textContent=' + (r.helpText.indexOf(PLACE_PAY) >= 0));
    /* THE OTHER HALF OF THE SAME CLAIM: escaped means SHOWN AS TEXT, not eaten,
       and it is asserted PER FIELD because a shared payload let one field's text
       vouch for another's. A renderer that dropped any one of these would satisfy
       every injection check above and go red on exactly one line here. */
    for (const f of FIELDS) {
      ok('the ' + f + ' payload is on screen as literal text', r.helpText.indexOf(PAYLOADS[f]) >= 0,
        f + ' present in #help textContent=' + (r.helpText.indexOf(PAYLOADS[f]) >= 0));
    }
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
      const walkUp = touch ? await waitWalk(page) : false;
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
      /* ASSERTED, NOT ASSUMED. Without this line the check below it is satisfied
         by a walk card that has not finished animating in, which is the state
         this whole section is NOT about. */
      ok(label + ': the walk card is up, so the next check is about something',
        walkUp && !!r.walk, 'waited=' + walkUp + ' walkCard=' + (r.walk ? r.walk.t + '..' + r.walk.b : 'not shown'));
      ok(label + ': the sheet and the walk card do not overlap',
        !r.walk || r.help.b <= r.walk.t || r.help.t >= r.walk.b,
        'help ' + (r.help ? r.help.t + '..' + r.help.b : '-') + ' walkCard ' + (r.walk ? r.walk.t + '..' + r.walk.b : 'not shown'));
      /* THE LIST IS WHAT THE READER CAME FOR, and a sheet whose list is 0px high
         is thirteen rows in the DOM that nobody can see — the same shape as
         every other silent zero this round. Asserted outright on every screen
         360px tall or more; below that the condition is a SCREEN HEIGHT, not a
         skip, and the one screen it lets through is pinned after the loop. */
      ok(label + ': the list seats a row on any screen 360px tall or more',
        r.vh >= 360 ? r.listH > 0 : true, 'vh=' + r.vh + ' list clientHeight=' + r.listH);
      /* The walk-card state is recorded with it because it is the cause: 143px
         of a 279px band. A starved screen with no walk card up would be a
         different defect and this line makes them tell apart. */
      if (!(r.listH > 0)) STARVED.push(label + ' vh=' + r.vh + ' cap=' + r.capVar
        + ' help.h=' + r.help.h + ' walkCard=' + (r.walk ? r.walk.h + 'px' : 'not shown'));

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
        + '  walkCard ' + (r.walk ? r.walk.t + '..' + r.walk.b : 'not shown')
        + '  cap=' + r.capVar + '  bottom=' + r.botVar + '  over=' + r.over);
      await ctx.close();
    }
  }

  /* §4  the var earns its keep. Asserted over the sweep rather than per screen,
     because a cap is allowed to be generous where there is room: 932x430 has
     188px to give against a 181px authored cap, and the honest answer there is
     that 42vh wins. What may not happen is that it wins EVERYWHERE. */
  console.log('\n§4  the published cap is the number that decides, on the screens where it must');
  ok('the cap comes out below 42vh on at least three landscape screens', BITES.length >= 3,
    BITES.length ? BITES.join(' | ') : 'it never bit anything');

  /* WHAT THIS LANE DID NOT CLOSE, pinned as a number so the next lane inherits a
     measurement instead of a hunch. At 568x320 the bottom band's whole room is
     279px, a 143px walk card takes half of it, and the 72px the band can publish
     for this sheet is exactly its own head plus its own footer. The sheet is on
     screen, uncovered, and its title, close button and Get Involved row all pass
     the hit tests — it is the LIST that seats nothing.
     IT IS NOT A REGRESSION: on the pristine base this button opened #attnCard,
     which body.pocket hides outright, so that screen showed nothing at all.
     IT IS NOT CHEAPLY FIXABLE EITHER, and the two ways out were measured before
     this line was written: a CSS floor on the sheet puts 44px of it back under
     the z-58 walk card, which is the regression this round was raised on, and
     giving the walk card a `max` of its own makes two shrinking tenants measure
     each other, which is the oscillation the one-shrinker rule exists to stop.
     IF YOU FIX IT this goes red and that is correct — edit the list, do not
     delete the check. If a SECOND screen joins it, that is a regression. */
  console.log('\n§4b the one screen whose room is smaller than the sheet\'s own chrome');
  ok('320px tall is the only swept screen where the list seats nothing',
    STARVED.length === 1 && / vh=320 /.test(STARVED[0]),
    STARVED.length ? STARVED.join(' | ') : 'no screen starved — if that is real, update this check');

  /* ================= §5  the top band: the vital dropdown ================= */
  /* THE OTHER HALF OF THIS LANE. R15 made #vdrop a tenant of the top band; this
     asserts that it still is after every rebase, and it ratchets the one thing
     the lane improved without closing.
     WHAT THE RATCHET IS FOR. Opening the dropdown raises the top band's ceiling
     by its own height, and the bottom band's limit is innerHeight minus that
     ceiling, so on a landscape phone the walk card gets clamped UP under the
     open dropdown. The `max` mechanism #help uses cannot reach this: the top
     band's limit is innerHeight, so the room it would publish is the whole
     screen. Closing it means letting the two edges solve for each other in one
     pass, which is a change to machinery every overlay in the app sits on, so
     this lane measured it and pinned it instead of half-doing it.
     THE NUMBERS BELOW ARE THE BASE'S, measured on the pristine origin/main blob
     through the same real tap, and they are a CEILING: the lane came in at
     1 / 0 / 16 / 31 against them. Any future change that covers more of the
     dropdown than the artifact this lane started from goes red here. */
  console.log('\n§5  the vital dropdown is a top-band tenant, and no worse than the base in landscape');
  const BASE_OVERLAP = { '390x844': 0, '844x390': 16, '851x393': 13, '667x375': 31, '740x360': 46, '932x430': 0, '1280x800': 0, '1920x1080': 0 };
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
    /* THE RATCHET BELOW IS AN OVERLAP AGAINST THE WALK CARD, so a walk card that
       has not animated in yet reports overlap=0 and passes every ceiling in
       BASE_OVERLAP for free. Waited for and asserted on the pocket, where it is
       the state the numbers were measured in; on a desk it never shows and the
       base numbers there are 0 for that reason. */
    const walkUp = touch ? await waitWalk(page) : false;
    if (touch) ok(label + ': the walk card is up, so the overlap ratchet is about something',
      walkUp, 'waited=' + walkUp);
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
      const vd = document.getElementById('vdrop'), wk = document.getElementById('walkCard'), vt = document.getElementById('vitals');
      if (!shown(vd)) return { open: false };
      const q = vd.getBoundingClientRect();
      /* Down the dropdown's own column, on the composited page. The reading the
         reader tapped for lives in the top two thirds; those may never be under
         anything. */
      const at = f => {
        const x = Math.round(q.left + q.width / 2), y = Math.round(q.top + q.height * f);
        const top = document.elementFromPoint(x, y);
        return top && top.closest && top.closest('#vdrop') ? 'vdrop' : (top ? ('#' + (top.id || (typeof top.className === 'string' ? top.className.split(' ')[0] : '?'))) : 'nothing');
      };
      const ov = (a, b) => Math.max(0, Math.min(a.b, b.b) - Math.max(a.t, b.t));
      const V = box(vd);
      return {
        open: true, vh: innerHeight, vdrop: V,
        walk: shown(wk) ? box(wk) : null, vitals: shown(vt) ? box(vt) : null,
        overlap: shown(wk) ? ov(V, box(wk)) : 0,
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
    ok(label + ': the top two thirds of the dropdown are uncovered',
      r.topAt.slice(0, 3).every(x => x === 'vdrop'), JSON.stringify(r.topAt));
    const allow = BASE_OVERLAP[label];
    ok(label + ': the walk card covers no more of it than it did on the base',
      r.overlap <= allow, 'overlap=' + r.overlap + ' base allowed=' + allow);
    if (r.vdropVar) capVals.add(r.vdropVar);
    ok(label + ': no page errors', errs.length === 0, errs.join(' ; ') || 'none');
    info(label + ': vdrop ' + r.vdrop.t + '..' + r.vdrop.b + '  walkCard '
      + (r.walk ? r.walk.t + '..' + r.walk.b : 'not shown') + '  overlap=' + r.overlap
      + ' (base ' + allow + ')  var=' + r.vdropVar);
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
