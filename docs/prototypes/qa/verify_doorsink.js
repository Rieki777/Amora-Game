/* THE PANEL IS A SINK, DRIVEN THE WAY A VISITOR DRIVES IT.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT verify_escaping.js. That gate proves the
 * escaping CONTRACT across ~50 surfaces, and it drives them by CALLING their
 * renderers. This one proves a much smaller claim about a much longer path: it
 * never calls a renderer. It seeds the browser the way a returning founder's
 * browser is seeded, reloads, clicks the Restore bar, clicks a building's name
 * plate on the land, clicks the panel's tabs, and clicks the door buttons —
 * and asks what a person would see and what ran.
 *
 * Two independent reviewers reported the headline as one sink:
 *
 *     onclick="openModule('${m[0]}','${m[1]}')"    BOTH ARGUMENTS UNESCAPED
 *
 * rendered twice, in renderTab's tab 0 and tab 3. It is real, it is on
 * origin/main today, and a door route of  x');window.__PWN.push('OWNED');('
 * executes on a real click. But a fix that escapes the two module arguments
 * closes two of the sites a visitor reaches on that same path. The panel is
 * assembled from THREE hosts, and every one of them writes a founder-
 * controlled string into innerHTML:
 *
 *     #banners     bannerHTML(s)             s.name, and the circle colour
 *     #panelHead   openPanel()               s.name, s.circle, s.event
 *     #panelBody   renderTab() tabs 0-3      s.blurb, t.title, t.author,
 *                                            t.last, t.replies, the door
 *                                            label and the door route
 *
 * WHAT THE STORED PAYLOAD IS. Not self-XSS. `persistenceBoot` reads
 * `localStorage['amora-grounds-scene']` on every load and offers to restore
 * it, and `scheduleAutosave` ships the same export to draft-save, so the value
 * round-trips through the server and comes back to whoever opens the map. This
 * gate uses THAT path — the seed, the bar, the click — and not restoreScene()
 * by hand, because the bar is where a visitor consents and everything after it
 * is what they get.
 *
 * NO GATE IN THIS LANE HAD EVER DRIVEN IT. Every other suite calls
 * restoreScene directly. The whole flow hangs off a `localStorage.getItem`
 * inside a try/catch that swallows, so on a browser that refuses storage for
 * file:// URLs the bar never appears, nothing is restored, and a gate built on
 * top of it drives NOTHING while printing exactly what a clean run prints.
 * Section 0 is that question asked out loud, and it fails the run.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE ONE THIS GATE FOUND THAT THE ESCAPING PASS WALKED PAST: t.replies.
 *
 *     <small>${escq(t.author)} · ${t.replies} replies · ${escq(t.last)} ago</small>
 *
 * Escaped on both sides and raw in the middle, through four rounds of an
 * escaping gate, because the field name reads as a count. It is not one:
 * restoreScene stores it as `replies:t.replies||0`, and `'<img …>'||0` is
 * `'<img …>'`. Three render sites carry it — the panel at :3458, the Journeys
 * room at :5203, the module room at :5454. Section D holds BOTH halves of the
 * fix separately, because they fail separately: the value is coerced to a
 * NUMBER at the door, and it is escaped at the sinks. Break either one alone
 * and section D still goes red.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * HOW IT AVOIDS REPORTING A GREEN IT DID NOT EARN.
 *
 *  - IT RUNS ON THE UNFIXED ARTIFACT. The boot wait names only terms that
 *    pristine origin/main also has (SCENE, restoreScene, #restoreYes). The
 *    helpers the fix adds — openDoorHere, escq's element context — are
 *    ASSERTED, never waited on. A gate that stops dead without the fix cannot
 *    be shown to detect its absence, and every number below was taken red
 *    first against origin/main.
 *  - A HOST THAT NEVER DREW IS NOT A HOST THAT IS SAFE. Section A asserts each
 *    of the three hosts has the marker in its textContent before section B is
 *    allowed to mean anything. `elements 0` over a host that rendered nothing
 *    is the same 0 a clean host prints.
 *  - THE MARKER CANNOT MATCH BY ACCIDENT. It carries a hyphen, which is not in
 *    the base64 alphabet, so it cannot occur inside the 5.4 MB of embedded
 *    image data — and 0a asserts that against the pristine document anyway.
 *  - THE CLICKS ARE MOUSE CLICKS AT COORDINATES, and the banner is chosen by
 *    hit-testing `elementFromPoint`, so an occluded plate fails the gate
 *    instead of quietly producing zero checks.
 *  - NOTHING HERE IS TIMED. Waits are on state (`#panel.open`, a plate with a
 *    non-zero rect), never on a millisecond budget: openPanel starts a camera
 *    flight whose length is counted in frames, and a fixed window around it
 *    captures the opening line and nothing else.
 *
 *   source ./env.sh && node verify_doorsink.js
 *   GROUNDS_FILE="file:///…/pristine.html" node verify_doorsink.js   # red
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const FILE = process.env.GROUNDS_FILE;
const EXE = process.env.PW_EXE;
const SCENE_JSON = path.join(__dirname, 'amora-scene.json');

let pass = 0, fail = 0;
const ok = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); cond ? pass++ : fail++; };

/* ── the payload ──────────────────────────────────────────────────────────
   One string, three grammars, because one value can land in any of them and
   a fix for one is not a fix for another:

     h:  a JS string inside an inline handler   onclick="f('HERE')"
     e:  element content                        <b>HERE</b>
     a:  a double-quoted attribute              data-x="HERE"

   The lone backslash before the quote is deliberate. `.replace(/'/g,"\\'")`
   — which this file shipped by hand — escapes the quote without escaping the
   backslash first, so `\` + `'` becomes `\` + `\` + `'`: an escaped backslash
   followed by a live apostrophe, and the string still closes.               */
const MARK = (f) => 'PWN-MARK-' + f;
const PAY = (f) =>
  MARK(f) + "x\\');window.__PWN.push('h:" + f + "');('" +
  '<img src=pwn onerror="window.__PWN.push(&#39;e:' + f + '&#39;)" data-pwn="' + f + '">' +
  '" data-pwn="a:' + f + '" onmouseover="window.__PWN.push(&#39;a:' + f + '&#39;)" q="';

/* Every field this gate plants, and the host it is planted to reach. A field
   that is declared and does not arrive fails; a host that is declared and
   draws nothing fails. Neither can rot behind the other. */
const FIELDS = [
  ['name', '#banners + #panelHead'],
  ['circle', '#banners style + #panelHead .sub'],
  ['event', '#panelHead .statepill'],
  ['blurb', '#panelBody tab 0'],
  ['doorlabel', '#panelBody tabs 0 and 3 — openModule arg 1'],
  ['doorroute', '#panelBody tabs 0 and 3 — openModule arg 2'],
  ['title', '#panelBody tab 0 — thread title'],
  ['author', '#panelBody tab 0 — thread author'],
  ['replies', '#panelBody tab 0 — the sibling that looks numeric'],
  ['last', '#panelBody tab 0 — thread last-activity'],
];

function poison() {
  const J = JSON.parse(fs.readFileSync(SCENE_JSON, 'utf8'));
  const keys = J.map_structures.map(s => s.key);
  for (const s of J.map_structures) {
    s.name = PAY('name');
    s.circle_id = PAY('circle');
    s.blurb = PAY('blurb');
    s.state_inputs = Object.assign({}, s.state_inputs, { event: PAY('event') });
    s.bindings = s.bindings || {};
    /* Two doors, so tab 0 and tab 3 both have something to render, and so the
       count below is a count and not a coin flip. */
    s.bindings.doors = [
      { label: PAY('doorlabel'), route: PAY('doorroute') },
      { label: PAY('doorlabel'), route: '/gratitude' },
    ];
  }
  /* Every thread at every place, so whichever plate turns out to be clickable
     has conversations under it. A payload that unhooks its own reader reads
     exactly like a clean surface. */
  for (const t of (J.forum_threads || [])) {
    t.structure_keys = keys.slice();
    t.title = PAY('title');
    t.author = PAY('author');
    t.replies = PAY('replies');   // a STRING, which is the whole point: `x||0` is x
    t.last_activity = PAY('last');
  }
  return J;
}

const untilReady = async (page, terms, ms = 90000) => {
  const src = Object.values(terms).join(' && ');
  try { await page.waitForFunction(src, null, { timeout: ms, polling: 100 }); return true; }
  catch (_) {
    const t = await page.evaluate((o) => {
      const out = {};
      for (const k of Object.keys(o)) { try { out[k] = !!eval(o[k]); } catch (e) { out[k] = 'THREW ' + e.message; } }
      return out;
    }, terms);
    console.log('  waited ' + ms + 'ms. never true: ' + JSON.stringify(t));
    return false;
  }
};

(async () => {
  const J = poison();
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1180 } });
  const page = await ctx.newPage();
  const perr = [];
  page.on('pageerror', e => perr.push(String(e)));

  console.log('artifact: ' + FILE);

  /* ══ 0. THE INSTRUMENT MEASURES ITSELF FIRST ═══════════════════════════ */
  await page.goto(FILE);
  const bootedClean = await untilReady(page, {
    /* BARE `SCENE`. It is a top-level `const` in a classic script, so it is a
       lexical binding and never becomes a property of window; waiting on
       `window.SCENE` waits forever on a page that booted perfectly. */
    SCENE: "typeof SCENE !== 'undefined'",
    restoreScene: "typeof restoreScene === 'function'",
    restoreYes: "!!document.getElementById('restoreYes')",
  });
  ok(bootedClean, 'the map boots, on terms the UNFIXED artifact also satisfies');

  const clean = await page.evaluate((marks) => ({
    inText: marks.filter(m => document.body.innerText.indexOf(m) >= 0),
    inHTML: marks.filter(m => document.documentElement.innerHTML.indexOf(m) >= 0),
  }), FIELDS.map(f => 'PWN-MARK-' + f[0]));
  ok(clean.inText.length === 0 && clean.inHTML.length === 0,
    clean.inText.length || clean.inHTML.length
      ? 'the marker already occurs in the PRISTINE document, so every count below is meaningless: ' +
        JSON.stringify(clean)
      : '0a the marker occurs nowhere in the pristine document (' + FIELDS.length + ' markers, page and source)');

  /* ── seed the browser the way a returning founder's browser is seeded ── */
  await page.addInitScript((s) => {
    window.__PWN = [];
    try { localStorage.setItem('amora-grounds-scene', s); }
    catch (e) { window.__SEEDFAIL = String(e); }
  }, JSON.stringify(J));
  await page.goto(FILE);
  const booted = await untilReady(page, {
    SCENE: "typeof SCENE !== 'undefined'",
    restoreYes: "!!document.getElementById('restoreYes')",
  });
  ok(booted, 'the map booted with the poisoned scene sitting in storage');

  const seeded = await page.evaluate(() => ({
    seedfail: window.__SEEDFAIL || null,
    stored: (() => { try { return (localStorage.getItem('amora-grounds-scene') || '').length; } catch (e) { return -1; } })(),
    bar: getComputedStyle(document.getElementById('restoreBar')).display,
  }));
  ok(!seeded.seedfail && seeded.stored > 1000,
    seeded.seedfail ? '0b the seed never reached storage (' + seeded.seedfail + '), so nothing below drives anything'
      : '0b the poisoned scene reached storage (' + seeded.stored + ' bytes)');
  ok(seeded.bar !== 'none',
    seeded.bar === 'none'
      ? '0c persistenceBoot did NOT offer the Restore bar, so the real path never opens and every count below is about a clean scene'
      : '0c persistenceBoot offered the Restore bar, which is where a visitor consents');

  /* ── the real path: enter the land, then accept the restore ── */
  await page.click('#enterBtn').catch(() => {});
  await untilReady(page, { 'left the intro': "!document.body.classList.contains('intro')" }, 30000);
  await page.click('#restoreYes');

  const live = await page.evaluate((fields) => {
    const at = {
      name: (SCENE.structures[0] || {}).name,
      circle: (SCENE.structures[0] || {}).circle,
      event: (SCENE.structures[0] || {}).event,
      blurb: (SCENE.structures[0] || {}).blurb,
      doorlabel: ((SCENE.structures[0] || {}).modules || [[]])[0][0],
      doorroute: ((SCENE.structures[0] || {}).modules || [[]])[0][1],
      title: (SCENE.threads[0] || {}).title,
      author: (SCENE.threads[0] || {}).author,
      replies: (SCENE.threads[0] || {}).replies,
      last: (SCENE.threads[0] || {}).last,
    };
    return fields.map(f => ({ f, got: String(at[f] == null ? '' : at[f]).indexOf('PWN-MARK-' + f) >= 0 }));
  }, FIELDS.map(f => f[0]));
  const notPlanted = live.filter(r => !r.got).map(r => r.f);
  /* `replies` is EXPECTED to lose its marker once the fix coerces it at the
     door. That is the fix working, and section D is where it is measured. */
  const notPlantedReal = notPlanted.filter(f => f !== 'replies');
  ok(notPlantedReal.length === 0,
    notPlantedReal.length
      ? '0d a real #restoreYes click did NOT put these fields into live state, so no count about them means anything: ' + notPlantedReal.join(', ')
      : '0d a real #restoreYes click put ' + (FIELDS.length - notPlanted.length) + ' of ' +
        FIELDS.length + ' declared fields into live state' +
        (notPlanted.indexOf('replies') >= 0 ? ' (replies absent — coerced at the door, see D1)' : ''));

  /* ══ A. THE REAL CLICK PATH REACHES THE THREE HOSTS ════════════════════ */
  await untilReady(page, {
    'a name plate has been laid out': "[...document.querySelectorAll('.banner')].some(b=>b.getBoundingClientRect().width>0)",
  }, 30000);

  /* TWO REAL GESTURES, IN THE ORDER A VISITOR REACHES THEM: the building's
     emblem, then its name plate. Both are bound to openPanel by the artifact
     itself; neither is a function this gate calls.
     The emblem is tried FIRST and it is not a convenience. On the unfixed
     artifact the payload becomes real markup INSIDE the plate — a broken <img>
     and a stray attribute — which changes the plate's box between the hit-test
     and the click and loses the gesture. A gate that could only drive the
     plate would then report every panel number as 0 on precisely the artifact
     it exists to catch. The emblem's content is art, so a poisoned name cannot
     move it.
     Hit-test rather than trust the rect: #vitals paints over the band the
     plates draw in, and a click that lands on the bar is a check that never
     happened. */
  /* THE TARGET MOVES WHILE YOU AIM AT IT. syncBanners re-lays every plate on
     an animation frame, and on the unfixed artifact the payload becomes real
     markup INSIDE the plate — a broken <img> and a stray attribute — so the
     plate's box changes as the image fails. A coordinate captured by
     elementFromPoint and clicked a moment later lands on the land instead, the
     panel never opens, and every panel number below comes back 0: not because
     the sinks are closed but because nothing rendered. That is the exact
     failure this gate exists to refuse to print.
     locator.click() re-runs the hit-target check AT CLICK TIME and retries
     until the element is stable, so the click either lands on the thing or
     fails loudly. Both selectors are gestures the artifact binds to openPanel
     itself: the building's emblem, then its name plate. */
  const opened_ = { how: null, tries: 0 };
  for (const sel of ['.poi', '.banner']) {
    const n = await page.locator(sel).count();
    for (let i = 0; i < n && !opened_.how; i++) {
      opened_.tries++;
      try {
        await page.locator(sel).nth(i).click({ timeout: 3000 });
        await page.waitForFunction("document.getElementById('panel').classList.contains('open')",
          null, { timeout: 4000 });
        opened_.how = sel;
      } catch (_) { /* occluded, off-screen, or it opened nothing: try the next */ }
    }
    if (opened_.how) break;
  }
  ok(!!opened_.how,
    opened_.how
      ? 'A1 a real click on ' + (opened_.how === '.poi' ? "a building's emblem" : "a building's name plate") +
        ' opened the portal panel (' + opened_.tries + ' element(s) tried)'
      : 'A1 ' + opened_.tries + ' real clicks on emblems and name plates opened no panel — this gate cannot drive its own path, and a run that opens nothing proves nothing about the panel');
  const opened = !!opened_.how;
  ok(opened, 'A2 the portal panel is open, so the three hosts below have been written by the artifact');
  if (!opened) { console.log('\n' + pass + ' passed, ' + fail + ' failed'); await browser.close(); process.exit(1); }

  const HOSTS = ['banners', 'panelHead', 'panelBody'];
  const drew = await page.evaluate((hosts) => hosts.map(h => {
    const el = document.getElementById(h);
    return { h, marks: (el ? el.textContent : '').match(/PWN-MARK-[a-z]+/g) || [] };
  }), HOSTS);
  for (const d of drew) {
    ok(d.marks.length > 0,
      d.marks.length
        ? 'A3 #' + d.h + ' rendered the payload as text (' + [...new Set(d.marks)].sort().join(', ') + ')'
        : 'A3 #' + d.h + ' drew NONE of the payload, so an element count of 0 over it says nothing');
  }

  /* ══ B. AND NOTHING OF IT BECAME MARKUP ════════════════════════════════ */
  /* MEASURED PER TAB AND ACCUMULATED, NEVER ONCE AT THE END. #panelBody is one
     host with four different documents in it, and renderTab REPLACES its
     innerHTML — so a single reading after the walk describes only the tab that
     happened to be selected last. Read that way, this gate reported
     `#panelBody: elements 0` on the artifact whose tab 0 had just created
     thirty of them. Each tab is clicked and then read, and the counts are
     summed across the walk. */
  const nTabs = await page.evaluate(() => document.querySelectorAll('#tabs button').length);
  const perTab = [];
  for (let i = 0; i < nTabs; i++) {
    const box = await page.evaluate((k) => {
      const b = document.querySelectorAll('#tabs button')[k];
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, i);
    await page.mouse.click(box.x, box.y);
    perTab.push(await page.evaluate((hosts) => ({
      created: hosts.map(h => {
        const el = document.getElementById(h);
        return el ? el.querySelectorAll('[data-pwn], img[src="pwn"], [onmouseover]').length : -1;
      }),
      anywhere: document.querySelectorAll('[data-pwn], img[src="pwn"]').length,
    }), HOSTS));
  }
  ok(nTabs >= 4, 'B0 clicked all ' + nTabs + ' panel tabs, the way a visitor reads a place');

  const sum = (f) => perTab.reduce((a, t) => a + f(t), 0);
  const fired = await page.evaluate(() => (window.__PWN || []).slice());
  HOSTS.forEach((h, i) => {
    const total = sum(t => t.created[i]);
    const worst = Math.max(...perTab.map(t => t.created[i]));
    ok(total === 0, 'B1 #' + h + ': elements the payload created across the ' + nTabs +
      ' tabs — ' + total + ' (worst single tab ' + worst + '), cap 0');
  });
  ok(sum(t => t.anywhere) === 0, 'B2 elements the payload created anywhere on the page — ' +
    Math.max(...perTab.map(t => t.anywhere)) + ' at the high-water mark, cap 0');
  ok(fired.length === 0, 'B3 handlers the payload fired while rendering — ' + fired.length +
    ', cap 0' + (fired.length ? ' [' + [...new Set(fired)].sort().join(', ') + ']' : ''));

  /* ══ C. THE openModule ATTRIBUTES, BY EQUALITY ═════════════════════════ */
  /* Asserted by equality and not by "no payload found", because the only safe
     version of this attribute has no founder string in it at all. A door
     button whose onclick merely looks clean is one escape away from not being. */
  /* The tab is chosen by a real click on the real tab button, so the markup
     read below is the markup a visitor is looking at, not the markup a call to
     renderTab() would have produced. */
  const doorAttrs = [];
  for (const t of [0, 3]) {
    const box = await page.evaluate((k) => {
      const b = document.querySelectorAll('#tabs button')[k];
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, t);
    if (!box) continue;
    await page.mouse.click(box.x, box.y);
    const rows = await page.evaluate((tab) =>
      [...document.querySelectorAll('#panelBody button, #panelBody .doorbtn')]
        .map(b => ({ tab, onclick: b.getAttribute('onclick'), compiles: typeof b.onclick === 'function' }))
        .filter(r => r.onclick), t);
    doorAttrs.push(...rows);
  }
  /* WHICH BUTTONS ARE THE DOORS. The first version of this section demanded
     `openDoorHere(<index>)` of EVERY inline handler in the panel, and the
     panel also carries `evRSVP('e3')` and `doorClickHere('wallet')` — an event
     id and a door-kind key, both read from code tables, both correct as they
     are. It passed only because the building the click happened to open had
     neither, and went red on a mutant for a reason that had nothing to do with
     the mutation. Which buildings have an event card or an action door is a
     property of the scene, so that was a false positive waiting on a click.
     The module doors are counted from the structure's own record instead, and
     the general claim — no handler anywhere carries the payload — is asserted
     separately, where it cannot over-match. */
  const SAFE = /^openDoorHere\(\d+\)$/;
  const doorFacts = await page.evaluate(() => ({
    key: panelKey,
    modules: ((BY[panelKey] || {}).modules || []).length,
  }));
  const moduleDoors = doorAttrs.filter(d => /^openDoorHere\(|^openModule\(/.test(d.onclick));
  const unsafe = moduleDoors.filter(d => !SAFE.test(d.onclick));
  const payloadHandlers = doorAttrs.filter(d => d.onclick.indexOf('PWN-MARK-') >= 0);
  /* C0 IS A PRECONDITION, NOT A STATISTIC. With no rows to inspect, "none of
     them is unsafe" and "all of them compile" are both true of the empty set,
     and this gate printed exactly those two PASSes on the artifact where the
     sink is live. C1 and C2 now carry the precondition themselves. */
  ok(moduleDoors.length > 0,
    moduleDoors.length
      ? 'C0 the panel at "' + doorFacts.key + '" rendered ' + moduleDoors.length + ' module-door handler(s) from ' +
        doorFacts.modules + ' door(s) on the record, out of ' + doorAttrs.length + ' inline handlers in total'
      : 'C0 the panel rendered NO module-door handler — C1 and C2 below would otherwise pass over the empty set');
  ok(moduleDoors.length > 0 && unsafe.length === 0,
    !moduleDoors.length ? 'C1 no module-door handler was rendered, so nothing was inspected (see C0)'
      : unsafe.length
        ? 'C1 ' + unsafe.length + ' of ' + moduleDoors.length + ' module-door handler(s) carry a founder string instead of an index: ' +
          unsafe.slice(0, 2).map(d => 'tab ' + d.tab + ' onclick="' + d.onclick.slice(0, 100) + '"').join(' ; ')
        : 'C1 every one of the ' + moduleDoors.length + ' module-door handlers is exactly openDoorHere(<index>) — no founder string reaches the attribute');
  /* THE CLAIM THAT DOES NOT NEED AN ALLOWLIST. Every handler in the panel,
     whatever its shape and whoever added it, must be free of the payload. A
     new sink shape nobody here anticipated fails this one without anybody
     having to remember to add it. */
  ok(payloadHandlers.length === 0,
    payloadHandlers.length
      ? 'C1b ' + payloadHandlers.length + ' of ' + doorAttrs.length + ' inline handler(s) in the panel carry the payload: ' +
        payloadHandlers.slice(0, 2).map(d => 'onclick="' + d.onclick.slice(0, 90) + '"').join(' ; ')
      : 'C1b none of the ' + doorAttrs.length + ' inline handlers in the panel carries the payload, whatever its shape');
  const broken = doorAttrs.filter(d => !d.compiles);
  ok(doorAttrs.length > 0 && broken.length === 0,
    !doorAttrs.length ? 'C2 no handler was rendered, so nothing was compiled (see C0)'
      : broken.length
        ? 'C2 ' + broken.length + ' door handler(s) no longer COMPILE — a half-escape is a door that stops opening'
        : 'C2 all ' + doorAttrs.length + ' door handlers still compile (a broken escape is a broken door)');

  /* ══ D. THE SIBLING THAT LOOKS NUMERIC ═════════════════════════════════ */
  /* D RUNS BEFORE THE DOOR CLICKS ON PURPOSE. Opening a door raises
     `#module` over the whole map, and it intercepts pointer events — so a
     later real click on a tab button never lands and this gate dies in a Node
     stack rather than printing a result. The destructive gesture goes last. */
  /* Back to tab 0 by a real click: the conversation rows live there and
     section C left tab 3 showing. Reading #panelBody without this asks the
     Enter tab about a row it does not draw, and gets a clean answer. */
  await page.locator('#tabs button').nth(0).click();
  const rep = await page.evaluate(() => ({
    types: [...new Set(SCENE.threads.map(t => typeof t.replies))],
    values: SCENE.threads.slice(0, 2).map(t => String(t.replies).slice(0, 40)),
    /* The MARKER is a poor detector here: it survives as text whether or not
       the tags after it became elements, so "text 13, html 13" was a PASS on
       the artifact whose replies payload had just built thirteen <img>s. Count
       the ELEMENTS that payload stamps its own field name onto instead. */
    inPanel: (document.getElementById('panelBody').textContent.match(/PWN-MARK-replies/g) || []).length,
    elems: document.querySelectorAll('#panelBody [data-pwn="replies"], #panelBody [data-pwn="a:replies"]').length,
  }));
  ok(rep.types.length === 1 && rep.types[0] === 'number',
    rep.types[0] === 'number'
      ? 'D1 forum_threads[].replies is a NUMBER after a real restore — coerced at the door, so every reader of it is closed at once'
      : 'D1 forum_threads[].replies came back as ' + rep.types.join('/') + ' — a count that is a string is a sink in every template that prints it (' + rep.values.join(' | ') + ')');
  /* D2 IS ALSO A PRECONDITION FIRST. "html count equals text count" is true of
     0 and 0, which is what a panel that never drew reports. The thread rows
     have to be on screen before the comparison means anything, and after the
     fix the marker is gone from replies (it is a number), so the row is found
     by the thread TITLE's marker instead. */
  const drewThreads = await page.evaluate(() =>
    (document.getElementById('panelBody').textContent.match(/PWN-MARK-title/g) || []).length);
  ok(drewThreads > 0,
    drewThreads ? 'D2a the panel drew ' + drewThreads + ' conversation row(s), so D2b is a measurement'
      : 'D2a the panel drew NO conversation rows — D2b below would pass over an empty host');
  ok(drewThreads > 0 && rep.elems === 0,
    !drewThreads ? 'D2b no conversation row was drawn, so nothing was compared (see D2a)'
      : rep.elems === 0
        ? 'D2b the replies payload built 0 elements in #panelBody, cap 0'
        : 'D2b the replies payload built ' + rep.elems + ' element(s) in #panelBody — the count between two escaped siblings is markup');

  /* D3. THE DOOR IS THE ONLY DOOR.
     Reverting escq(t.replies) alone does NOT take this gate red, and that is
     not a gap to paper over — it is the true shape of the fix. The coercion at
     the door turns the payload into 0 before any of the three sinks sees it,
     so with both halves in place the escapes are never exercised. Each half is
     independently SUFFICIENT (measured: revert the door and B1/D2b still hold;
     revert the escapes and D1 still holds), and that redundancy is only worth
     anything while the door really is the only way in.
     So the invariant is asserted directly, against the artifact's source: every
     site that writes a `replies` property writes a number. A second importer
     added later — a new bridge message, a second restore path — fails HERE,
     which is the day the escapes stop being redundant and start being the
     thing holding the line. */
  const artifactPath = decodeURIComponent(String(FILE).replace(/^file:\/+/, ''));
  const text = fs.readFileSync(artifactPath, 'utf8');
  const writers = [...text.matchAll(/replies\s*:\s*([^,}\n]+)/g)].map(m => m[1].trim());
  const uncoerced = writers.filter(w => !/^\d+$/.test(w) && !/^Number\(/.test(w));
  ok(writers.length > 0, 'D3a found ' + writers.length + ' site(s) writing a replies property, so D3b is a measurement');
  ok(writers.length > 0 && uncoerced.length === 0,
    uncoerced.length
      ? 'D3b ' + uncoerced.length + ' site(s) write a replies property without making it a number: ' +
        [...new Set(uncoerced)].slice(0, 3).map(w => '`' + w.slice(0, 50) + '`').join(', ') +
        ' — the escapes at the three sinks are now the only thing holding this'
      : 'D3b all ' + writers.length + ' replies writers produce a number (literal or Number(...)), so the door is the only door');

  /* ══ C3/C4. AND THE DOOR STILL OPENS ══════════════════════════════════ */
  /* An escape that refuses the founder is not a fix: a door that no longer
     opens fails a visitor exactly as surely as one that runs a payload. Last,
     because it raises the door card over everything. */
  const clickAll = await page.evaluate(() => {
    let clicked = 0, opened = 0;
    for (const tab of [0, 3]) {
      renderTab(tab);
      for (const b of document.querySelectorAll('#panelBody button, #panelBody .doorbtn')) {
        try {
          b.click(); clicked++;
          if (document.getElementById('module').classList.contains('show')) {
            opened++; document.getElementById('module').classList.remove('show');
          }
        } catch (_) { }
      }
    }
    return { clicked, opened, fired: (window.__PWN || []).length };
  });
  ok(clickAll.clicked > 0, 'C3 clicked ' + clickAll.clicked + ' panel controls (a control that produced zero checks is not a control)');
  ok(clickAll.opened > 0, clickAll.opened
    ? 'C3b ' + clickAll.opened + ' of those clicks actually opened a door card — the escape did not cost the founder their door'
    : 'C3b not one of those ' + clickAll.clicked + ' clicks opened anything, which is what a half-escape looks like from the visitor\'s side');
  ok(clickAll.fired === 0, 'C4 those ' + clickAll.clicked + ' real clicks ran ' + clickAll.fired + ' payloads, cap 0');

  ok(perr.length === 0, perr.length ? 'E1 the page threw while being driven: ' + perr.slice(0, 2).join(' | ') : 'E1 the page threw nothing across the whole path');

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
