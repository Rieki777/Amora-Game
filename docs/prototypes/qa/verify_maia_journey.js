/* Maia's guided conversation: the journey on both profiles, her voice, and the
 * sink the last pass left open.
 *
 * WHAT THIS GATE REFUSES TO DO, because the round has been bitten seven times:
 *
 *   It never measures a scratch surface. Every visual claim here ends at
 *   document.elementFromPoint() over the COMPOSITED page: the line has to be
 *   the thing actually under its own centre, in a viewport, with the profile
 *   the person is on. A count of DOM nodes is not evidence that anyone can see
 *   them.
 *
 *   It never trusts a poisoner. Section E asserts the payload LANDED in
 *   SCENE.journeys before it asserts the payload did not fire, because "all
 *   green over an empty payload" is the same output as "all green".
 *
 *   It never reports zero as a pass. The tail prints the check count and fails
 *   when it is short, so a suite that dies at check 3 of 73 reads as a failure
 *   and not as a clean subset.
 *
 *   It never infers two defences from one observation. See section J.
 *
 * PROVEN BY BREAKING IT, and the proof is a script rather than a sentence:
 * break_maia_journey.py mutates the artifact one defect at a time, stages each
 * mutant as <dir>/grounds-v0.html under a real C: path, and asserts both that
 * the run produced a full check count and that the named checks went red.
 *
 * IT HAS ALREADY CAUGHT THIS FILE LYING. An earlier draft asserted the XSS
 * defences only by their combined outcome, so un-escaping the journey title
 * passed (maiaClean stripped the <img>) and restoring the raw innerHTML passed
 * (escaping had already defanged the string). Two defences, one observation,
 * three silent breaks. Section J now measures each layer on its own.
 *
 *   cd docs/prototypes/qa && source ./env.sh && node verify_maia_journey.js
 *   cd docs/prototypes/qa && source ./env.sh && python3 break_maia_journey.py
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const FILE = process.env.GROUNDS_FILE || 'file:///root/amora/work/grounds-v0.html';
const EXE = process.env.PW_EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

/* THE SHOTS GO SOMEWHERE GIT ALREADY IGNORES, and they are derived from this
 * file's own location rather than from the cwd. These two frames are 2.8 MB of
 * PNG; written by bare relative path they landed in whatever directory the
 * suite happened to be launched from, and in qa/ they showed up as untracked
 * files that a `git add .` in a shared worktree would have committed. The
 * repo's .gitignore already carries docs/prototypes/.qa-out/, which is where
 * env.sh puts EXPORT_OUT for the same reason. */
const SHOTS = path.join(__dirname, '..', '.qa-out');
function shot(name) { try { fs.mkdirSync(SHOTS, { recursive: true }); } catch (_) {} return path.join(SHOTS, name); }

/* The mutations break_maia_journey.py runs, and what each one must turn red.
 * Every row below was observed, not predicted.
 *   journey title unescaped again      -> J3
 *   dock parses in a live document     -> J1, J2
 *   maiaContext prints the name raw    -> I2
 *   claim attribute loses escja        -> I6
 *   the phone sheet never opens        -> D3, D4, D5
 *   #maia gets a bottom literal        -> D5
 *   the third answer disappears        -> C1, D6
 *   the engine is reached for on file: -> F3b, F4, F6, F7
 *   haptics stop waiting for a gesture -> D10
 *   she stops speaking as a resident   -> B3, F7, G5
 *   the voice ships defaulted to hear  -> F1b
 *   the arrival callback drops its
 *     JWALK re-check                   -> C7b
 *   MSAY_BAN loses <style>             -> J8
 *   maiaClean stops reading attributes -> J7b
 *   the sign-in href goes back to escq -> K2
 */
const BREAKS = 15;

let checks = 0, fails = 0;
const ok = (c, n) => { checks++; console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

/* Wait for a state, not a clock. Names the terms that never went true, so a
 * predicate that CANNOT be true reads differently from a slow boot. */
async function untilReady(page, terms, ms = 15000) {
  try {
    await page.waitForFunction(
      (src) => Object.keys(src).every(k => { try { return !!eval(src[k]); } catch (_) { return false; } }),
      terms, { timeout: ms, polling: 100 });
    return true;
  } catch (_) {
    const t = await page.evaluate((src) => {
      const out = {};
      for (const k of Object.keys(src)) { try { out[k] = !!eval(src[k]); } catch (_) { out[k] = false; } }
      return out;
    }, terms);
    console.log('  waited ' + ms + 'ms. never true: ' + (Object.keys(t).filter(k => !t[k]).join(', ') || '(every term reads true)'));
    return false;
  }
}

/* THE ONLY VISIBILITY TEST THIS FILE USES. A rect is not a sight line: an
 * element can have width and height and sit under the module overlay, off the
 * bottom of a phone, or behind the intro card. elementFromPoint answers the
 * question a person answers by looking. */
const SEEN = `(function(sel){
  const el=document.querySelector(sel);
  if(!el)return{seen:false,why:'no element for '+sel};
  const cs=getComputedStyle(el);
  if(cs.display==='none')return{seen:false,why:'display:none'};
  if(cs.visibility==='hidden')return{seen:false,why:'visibility:hidden'};
  if(parseFloat(cs.opacity||'1')<0.9)return{seen:false,why:'opacity '+cs.opacity};
  const r=el.getBoundingClientRect();
  if(r.width<1||r.height<1)return{seen:false,why:'zero box'};
  if(r.bottom<=0||r.top>=innerHeight||r.right<=0||r.left>=innerWidth)
    return{seen:false,why:'outside the viewport: '+JSON.stringify({t:Math.round(r.top),b:Math.round(r.bottom),h:innerHeight})};
  const cx=Math.round(Math.min(innerWidth-2,Math.max(2,r.left+r.width/2)));
  const cy=Math.round(Math.min(innerHeight-2,Math.max(2,r.top+r.height/2)));
  const hit=document.elementFromPoint(cx,cy);
  if(!hit)return{seen:false,why:'nothing at ('+cx+','+cy+')'};
  const mine=(hit===el)||el.contains(hit)||hit.contains(el);
  return{seen:mine,why:mine?'':'covered at ('+cx+','+cy+') by '+(hit.id?'#'+hit.id:hit.className||hit.tagName),
    box:{t:Math.round(r.top),b:Math.round(r.bottom)}};
})`;

async function seen(page, sel) { return page.evaluate(SEEN + '(' + JSON.stringify(sel) + ')'); }

async function open(browser, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const perr = [], cerr = [], net = [];
  page.on('pageerror', e => perr.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error') cerr.push(m.text()); });
  /* Everything that is not the file itself. The artifact makes exactly one
     request in its life and it is a POST to /api/map/walk-log; a voice that
     reaches for a CDN off a QA run would show up here. */
  page.on('request', r => { if (!/^file:/.test(r.url())) net.push(r.method() + ' ' + r.url().slice(0, 90)); });
  await page.goto(FILE);
  return { ctx, page, perr, cerr, net };
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });

  /* ================= DESK ================= */
  const D = await open(browser, { viewport: { width: 1280, height: 860 } });
  const page = D.page;

  ok(await untilReady(page, { boot: 'typeof playJourney==="function"', dom: '!!document.getElementById("maiaLog")' }),
    'A1: the artifact booted and the dock exists');
  await page.click('#enterBtn').catch(() => {});
  await page.waitForTimeout(1400);
  ok(await page.evaluate(() => document.body.classList.contains('pocket') === false), 'A2: this context is the desk profile');

  /* ---------- B. the journey, on the desk, on the real page ---------- */
  await page.evaluate(() => { document.getElementById('maiaLog').innerHTML = ''; playJourney('j1'); });
  const arrived = await untilReady(page, { line: 'document.querySelectorAll("#maiaLog .jrow").length>0' }, 9000);
  ok(arrived, 'B1: a stop arrives in the dock');

  const b2 = await seen(page, '#maiaLog .mline:last-child');
  ok(b2.seen, `B2: and a person can see it on the composited page ${b2.why || JSON.stringify(b2.box)}`);

  const b3 = await page.evaluate(() => {
    const last = document.querySelector('#maiaLog .mline:last-child');
    return { txt: (last.textContent || '').replace(/\s+/g, ' ').trim(), hash: location.hash, walking: !!JWALK };
  });
  ok(/I am Maia\. I live up past the ponds\./.test(b3.txt),
    `B3: she speaks as a resident, in her own words (${b3.txt.slice(0, 58)})`);
  ok(b3.hash === '#/journey/j1' && b3.walking, `B4: the walk is live at its own address (${b3.hash})`);

  const b5 = await page.evaluate(() => (window.MAIA_STOPS ? Object.keys(window.MAIA_STOPS).length : 0));
  ok(b5 === 8, `B5: she has a line for every stop of the Welcome Walk (${b5} of 8)`);

  /* ---------- C. she talks it out ---------- */
  const c1 = await page.evaluate(() => {
    const row = document.querySelector('#maiaLog .jrow');
    return { btns: row ? [...row.querySelectorAll('.btn')].map(b => b.textContent.trim()) : [],
             jn: (document.querySelector('#maiaLog .jn') || {}).textContent || '' };
  });
  ok(c1.btns.length === 3, `C1: three answers at every stop (${c1.btns.join(' | ')})`);
  ok(/^1 of \d+$/.test(c1.jn), `C1b: and the counter the older gates read (${c1.jn})`);

  const c2 = await page.evaluate(async () => {
    const before = document.querySelectorAll('#maiaLog .mline').length;
    jMore(); await new Promise(r => setTimeout(r, 300));
    const last = document.querySelector('#maiaLog .mline:last-child');
    return { grew: document.querySelectorAll('#maiaLog .mline').length > before,
             txt: (last.textContent || '').replace(/\s+/g, ' ').trim(), paused: typeof JWALK!=='undefined' && !!JWALK && !!JWALK.paused };
  });
  ok(c2.grew && /quest|seat|pool|Coming up|nothing else recorded/i.test(c2.txt),
    `C2: "tell me more" answers from the live scene (${c2.txt.slice(0, 62)})`);
  ok(c2.paused, 'C3: and asking her something stops the clock');

  /* The pause has to actually hold: the dwell is 6.5s, so an unpaused walk
     would have moved on twice by the time this reads. */
  const idx = await page.evaluate(() => JWALK.i);
  await page.waitForTimeout(8200);
  const c4 = await page.evaluate(() => (JWALK ? JWALK.i : -99));
  ok(c4 === idx, `C4: and she waits there rather than walking on without you (stop ${idx} -> ${c4})`);

  /* A STATE, NOT A CLOCK. "walk on" starts a camera flight and the next stop
     is written when the flight LANDS, so this used to sleep 1500ms and hope.
     It held on an idle machine and went red on three unrelated mutants during
     the break rehearsal, purely because eleven browsers had been through the
     box by then. A check that fails under load is a check that will one day
     fail in front of somebody and be called a flake. */
  await page.evaluate(() => { jNext(); });
  const c5arrived = await untilReady(page,
    { second: '/^2 of /.test((document.querySelectorAll("#maiaLog .jn")[document.querySelectorAll("#maiaLog .jn").length-1]||{}).textContent||"")' },
    9000);
  const c5 = await page.evaluate(() => {
    const all = document.querySelectorAll('#maiaLog .jn');
    return { jn: (all[all.length - 1] || {}).textContent || '', paused: !!(JWALK && JWALK.paused) };
  });
  ok(c5arrived && /^2 of \d+$/.test(c5.jn) && !c5.paused, `C5: "walk on" picks the walk back up (${c5.jn})`);

  const c6 = await page.evaluate(async () => {
    jEnd(); await new Promise(r => setTimeout(r, 250));
    return { ended: !JWALK, said: /The walk ends here/.test(document.getElementById('maiaLog').textContent),
             hash: location.hash, tourI: typeof tourI === 'undefined' ? null : tourI };
  });
  ok(c6.ended && c6.said && c6.hash === '', 'C6: "stay here" ends it, in her voice, and clears the address');
  ok(c6.tourI === -1, `C6b: and the view qa/secB.js reads goes back to -1 (${c6.tourI})`);

  /* C7. THE ARRIVAL GUARD. Rye named this one by hand as the thing to keep,
     and until now it was the only named invariant in this lane with no check
     of its own. step() starts a camera flight and speaks from the flight's
     ARRIVAL callback, which fires frames later; Escape, jEnd() and the last
     stop can all end the walk in between. Strip the `if(!JWALK...)return` from
     the top of that callback and a walk the visitor just ended speaks one more
     time into a dock that is already closing, and on a phone re-opens the
     sheet it just handed back.

     THE FIRST ASSERTION IS THE ONE THAT MAKES THE SECOND MEAN ANYTHING. If the
     flight has already landed by the time jEnd() runs, the late callback is
     never driven at all and C7b passes over a path nobody walked, which is
     this round's silent-zero in its purest form. So C7 asserts the walk really
     was still in the air.

     AND C7b COUNTS PAGE ERRORS, WHICH IS NOT THE OBVIOUS OBSERVABLE. The first
     draft of this check asserted only that no extra stop row appears, removed
     the guard to prove it, and stayed GREEN. Without the guard the callback
     reaches `jRow(JWALK.i+1, ...)` while JWALK is null, so it THROWS while
     building maiaSay's argument and never calls maiaSay at all: no row is
     added either way, and the row count cannot tell the two apart. The
     artifact's own comment beside that guard says "it is the only one that
     threw", which is the answer, written down, next to the thing being
     checked. The throw is the symptom, so the throw is what this measures.

     AND IT WAITED FOR A CLOCK, WHICH IS THE DEFECT F7 ALREADY TAUGHT THIS
     FILE AND THIS SECTION KEPT ANYWAY. The flight is FRAME-COUNTED:
     `travel.t += dt*1.6` with dt capped at .05, driven by
     requestAnimationFrame, so it is about 12.5 FRAMES long whatever the clock
     says. C7b budgeted a fixed 3500ms for it.

     THE FRAME RATE IS NOT A PROPERTY OF THIS SUITE, and it is worth knowing
     which knob moves it. Measured with _probe_arrival_dist.js: one browser on
     an idle box lands at 1858-2148ms, and four CPU-burning workers do not move
     that by a millisecond, because headless chromium's rAF throttle is the
     bound rather than the core. FOUR BROWSERS DO MOVE IT. With four suites
     running at once, which is the ordinary state of this box when several
     lanes work at the same time, the landing measured 3170-4220ms over twelve
     runs. The retired 3500ms budget sits inside that range.

     SO THE OLD CHECK WAS A COIN FLIP ON HOW MANY LANES WERE BUSY. Reverting
     the guard out of the artifact and running the two suites alternating, four
     browsers at a time: the 3500ms version missed the break in 2 of 6 runs and
     section J's 2600ms version missed its own in 6 of 6, while this version
     caught both 6 of 6. A missed run prints 73 of 73 ALL GREEN. Run the pair
     serially on an idle box and both versions catch everything 5 of 5, which
     is why an idle rerun is not a defence of a budget.

     So this polls the flight itself. `travel` is a top-level `let`, so it is
     a global binding without being a window property, and it is nulled by the
     rAF frame that fires the arrival callback. Waiting for it to go null waits
     for the exact event, and the 400ms after it is for the callback to finish
     and for a page error to reach the driver. THE TIMEOUT IS AN ASSERTION, not
     a fallback: if the flight never lands, C7 goes red instead of letting C7b
     pass over nothing. */
  const perrBefore = D.perr.length;
  const c7 = await page.evaluate(async () => {
    document.getElementById('maiaLog').innerHTML = '';
    playJourney('j1');
    await new Promise(r => setTimeout(r, 100));       // a frame or two in, far from the landing
    const flying = (typeof travel !== 'undefined' && !!travel);
    const before = document.querySelectorAll('#maiaLog .jrow').length;
    const t0 = Date.now();
    jEnd();
    const landed = await new Promise(r => {
      (function p() {
        if (!(typeof travel !== 'undefined' && !!travel)) return setTimeout(() => r(true), 400);
        if (Date.now() - t0 > 15000) return setTimeout(() => r(false), 400);
        setTimeout(p, 60);
      })();
    });
    return { flying, before, landed, waited: Date.now() - t0,
             after: document.querySelectorAll('#maiaLog .jrow').length,
             walking: typeof JWALK !== 'undefined' && !!JWALK, hash: location.hash };
  });
  /* The page error arrives over CDP, so give it a moment after the evaluate
     resolves before reading the list it lands in. */
  await page.waitForTimeout(250);
  ok(c7.flying && c7.before === 0 && c7.landed,
    `C7: the walk really was still mid-flight when it was ended, and the late callback was driven (flying=${c7.flying}, ${c7.before} stop rows, landed after ${c7.waited}ms)`);
  const c7err = D.perr.slice(perrBefore);
  ok(c7.after === 0 && !c7.walking && c7.hash === '' && c7err.length === 0,
    `C7b: and the landing that arrives after it speaks into nothing, and throws nothing ` +
    `(${c7.before} -> ${c7.after} stop rows, walking=${c7.walking}, hash="${c7.hash}", ` +
    `${c7err.length} page error(s)${c7err.length ? ': ' + c7err[0].slice(0, 70) : ''})`);

  /* ---------- F. her voice ---------- */
  const f1 = await page.evaluate(() => {
    const b = document.getElementById('maiaVoice');
    return { exists: !!b, tag: b ? b.tagName : null, pressed: b ? b.getAttribute('aria-pressed') : null,
             label: b ? b.textContent.trim() : null, mode: window.MVOICE ? window.MVOICE.mode : null };
  });
  ok(f1.exists && f1.tag === 'BUTTON', 'F1: the read-instead toggle is a real button');
  ok(f1.mode === 'read' && f1.pressed === 'false', `F1b: and it ships defaulted to reading her (${f1.mode})`);

  const f2 = await seen(page, '#maiaVoice');
  ok(f2.seen, `F2: a person can reach it ${f2.why}`);

  const netBefore = D.net.length;
  const f3 = await page.evaluate(async () => {
    window.__spoke = [];
    /* Stand in for the device tier so this asserts the ladder, not the
       machine's installed voices. */
    if (!('speechSynthesis' in window)) window.speechSynthesis = { cancel() {}, getVoices() { return []; }, speak() {} };
    const real = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u) => { window.__spoke.push(String(u.text || '')); try { real(u); } catch (_) {} };
    mvMode('hear');
    await new Promise(r => setTimeout(r, 900));
    return { mode: MVOICE.mode, pressed: document.getElementById('maiaVoice').getAttribute('aria-pressed'),
             spoke: window.__spoke.slice(), engine: MVOICE.engine, usable: mvKokoroUsable(), hosted: mvHostedLive() };
  });
  ok(f3.mode === 'hear' && f3.pressed === 'true', 'F3: the toggle turns her voice on');
  ok(f3.spoke.length > 0 && /I am here/.test(f3.spoke[0]), `F3b: and the device floor carries the line (${(f3.spoke[0] || '').slice(0, 34)})`);
  ok(f3.usable === false && f3.engine === 'idle',
    `F4: off a served page the engine is never reached for, so nothing downloads (usable=${f3.usable}, engine=${f3.engine})`);
  ok(f3.hosted === false, 'F5: the hosted signature tier is dark, so it costs nothing');
  ok(D.net.length === netBefore, `F6: and turning the voice on made zero requests (${D.net.length - netBefore})`);

  /* WAIT FOR THE ARRIVAL, NOT FOR A CLOCK, and this is the one place in this
     file that got that wrong. She says the opening line immediately and her
     resident line when the camera lands, and the flight is driven by
     requestAnimationFrame: `travel.t += dt*1.6` with dt capped at .05, so its
     duration is FRAME-COUNTED, not time-counted. A headless context runs rAF
     at roughly 8 to 11fps rather than 60, which puts the landing anywhere from
     1.4s to past 2.5s. The old fixed 2500ms budget failed 3 runs in 5 against
     an artifact that was speaking correctly every time, and each failure
     printed a full 71 of 71 checks, so it read as a real defect rather than as
     a flake. Polling returns as soon as she speaks, so this is also faster
     than the budget it replaces. */
  await page.evaluate(() => {
    window.__spoke = [];
    document.getElementById('maiaLog').innerHTML = '';
    playJourney('j1');
  });
  const said = await untilReady(page, { resident: '(window.__spoke||[]).some(t=>/I am Maia/.test(t))' }, 9000);
  const f7 = await page.evaluate(() => (window.__spoke || []).slice());
  const f7hit = f7.find(t => /I am Maia/.test(t)) || f7[0] || '';
  ok(said && f7.length > 0 && f7.some(t => /I am Maia/.test(t)),
    `F7: she says her own line out loud (${f7hit.slice(0, 40)})`);
  ok(!f7.some(t => /walk on|stay here|tell me more|\d of \d/.test(t)),
    `F8: and never reads the buttons beside it (${JSON.stringify(f7.map(t => t.slice(0, 20)))})`);

  const f9 = await page.evaluate(() => mvStrip('<b>Hi</b> there &amp; <img src=x onerror="window.__XSS=99"> done'));
  ok(f9 === 'Hi there & done', `F9: markup is stripped for speech without ever touching the DOM (${f9})`);
  ok(await page.evaluate(() => (window.__XSS || 0) === 0), 'F9b: and stripping it fires nothing');

  await page.evaluate(() => { jEnd(); mvMode('read'); });

  /* ---------- G. the promotion ---------- */
  const g = await page.evaluate(async () => {
    document.getElementById('maiaLog').innerHTML = '';
    try { localStorage.removeItem('amora-walk-done'); } catch (_) {}
    startTour(); await new Promise(r => setTimeout(r, 900));
    const tour = { walking: !!JWALK, id: JWALK ? JWALK.id : null, logging: !!(JWALK && JWALK.log) };
    jEnd(); await new Promise(r => setTimeout(r, 200));
    window.WALK_LOG = [];
    startWalk(true); await new Promise(r => setTimeout(r, 900));
    const walk = { walking: !!JWALK, id: JWALK ? JWALK.id : null,
                   logging: !!(JWALK && JWALK.log), rows: (window.WALK_LOG || []).length,
                   firstRow: (window.WALK_LOG || [])[0] || null };
    jEnd(); await new Promise(r => setTimeout(r, 250));
    walk.closed = (window.WALK_LOG || []).slice(-1)[0] || null;
    return { tour, walk, TOUR: (TOUR || []).length,
             txt: ((TOUR || [])[0] || {}).txt || '',
             card: !!document.querySelector('#walkCard.show'),
             nextWalk: typeof window.nextWalk };
  });
  ok(g.tour.walking && g.tour.id === 'j1', `G1: the desk tour is the journey now (${g.tour.id})`);
  ok(!g.tour.logging, 'G1b: and a tour is not counted as a newcomer run');
  ok(g.walk.walking && g.walk.id === 'j1' && g.walk.logging, `G2: the pocket walk is the same journey (${g.walk.id})`);
  ok(g.walk.rows > 0 && g.walk.firstRow && g.walk.firstRow.step === 'w1',
    `G3: and the newcomer measurement survived the merge (${JSON.stringify(g.walk.firstRow)})`);
  ok(g.walk.closed && g.walk.closed.step === 'abandoned' && g.walk.closed.at_index >= 0,
    `G4: the closing row carries a real index rather than the deleted WIDX (${JSON.stringify(g.walk.closed)})`);
  ok(g.TOUR === 8 && /I am Maia/.test(g.txt), `G5: TOUR is a view of what she says (${g.TOUR} stops, "${g.txt.slice(0, 26)}")`);
  ok(!g.card && g.nextWalk === 'undefined', `G6: the second card is gone (nextWalk=${g.nextWalk})`);

  await page.screenshot({ path: shot('maia-desk.png') }).catch(() => {});
  ok(D.perr.length === 0, `G7: zero page errors on the desk (${D.perr.length})${D.perr.length ? ' :: ' + D.perr[0] : ''}`);
  ok(D.cerr.length === 0, `G8: zero console errors on the desk (${D.cerr.length})${D.cerr.length ? ' :: ' + D.cerr[0] : ''}`);

  /* ---------- E. the sink the last pass left open ---------- */
  /* Journey text is rebuilt from J.journeys by restoreScene() on every shell
     push, so it is attacker-reachable and was going into innerHTML raw. */
  const PAY = '<img src=x onerror="window.__XSS=(window.__XSS||0)+1">POISON';
  const planted = await page.evaluate((pay) => {
    window.__XSS = 0;
    const j = SCENE.journeys.find(x => x.id === 'j1');
    j.name = pay; j.steps[0].t = pay; j.steps[0].body = pay;
    const st = SCENE.structures.find(s => s.key === 'gate'); if (st) st.name = pay;
    return { name: SCENE.journeys.find(x => x.id === 'j1').name.indexOf('onerror') >= 0,
             title: SCENE.journeys.find(x => x.id === 'j1').steps[0].t.indexOf('onerror') >= 0 };
  }, PAY);
  ok(planted.name && planted.title, 'E1: the payload really is in SCENE.journeys (the poisoner planted something)');

  await page.evaluate(() => { document.getElementById('maiaLog').innerHTML = ''; playJourney('j1'); });
  await untilReady(page, { line: 'document.querySelectorAll("#maiaLog .jrow").length>0' }, 9000);
  await page.waitForTimeout(600);
  const e2 = await page.evaluate(() => ({
    fired: window.__XSS || 0,
    imgs: document.querySelectorAll('#maiaLog img').length,
    asText: (document.getElementById('maiaLog').textContent || '').indexOf('onerror') >= 0,
  }));
  ok(e2.fired === 0, `E2: the payload never fires (${e2.fired} executions)`);
  ok(e2.imgs === 0, `E3: and plants no element in the dock (${e2.imgs} injected)`);
  ok(e2.asText, 'E4: it is shown as the text it is, so the village still sees what it typed');

  await page.evaluate(() => { jEnd(); });
  await page.waitForTimeout(200);

  /* ---------- H. the same sink, through the door it is actually reachable by
     ----------
     E poked SCENE.journeys directly, which is the EFFECT of a shell push and
     not the PATH. A gate that only pokes the object proves the escaping and
     says nothing about whether the payload can get there. This drives the real
     bridge: postMessage({type:'config',scene}) -> applyScene -> restoreScene,
     which is the same door verify_vocab_bridge.js pushes through, and it is
     one of the three ways SCENE.journeys is rebuilt from data the map did not
     author (shell push, autosave restore, site import).

     H1 asserts the payload SURVIVED the trip before H3 asserts it did not
     fire, because "nothing fired" is what an empty payload reports too. */
  const bridged = await page.evaluate(async (pay) => {
    window.__XSS = 0;
    const scene = JSON.parse(JSON.stringify(window.buildExportJSON ? buildExportJSON() : {}));
    if (!scene || !Array.isArray(scene.map_structures)) return { built: false };
    /* The authored scene, kept for anyone debugging a red run by hand: pushing
       it back over the same door un-poisons the page without a reload. The
       suite itself no longer needs it, because every poisoning section now
       runs AFTER the sections that measure the village. That ordering is the
       real fix; restoring state and hoping is not. */
    window.__CLEAN = JSON.parse(JSON.stringify(scene));
    /* THE BRIDGE'S OWN FIELD NAMES, not the map's. restoreScene reads
       st.title and st.structure_key and writes them out as st.t and st.at, so
       a payload written in the map's shape lands as `undefined` and the whole
       section then proves nothing while printing PASS. It also does NOT carry
       `body` across at all, which is worth knowing: a step body is reachable
       from the authored scene and the draft, and not from this door. */
    scene.journeys = [{ id: 'j1', name: pay, src: 'site', blurb: pay,
      steps: [{ title: pay, stage: pay, structure_key: 'gate', address_source: 'creator' }] }];
    const st = scene.map_structures.find(r => r.key === 'gate'); if (st) st.name = pay;
    window.postMessage({ type: 'config', scene, sceneVersion: 99 }, '*');
    await new Promise(r => setTimeout(r, 700));
    const j = SCENE.journeys.find(x => x.id === 'j1');
    return { built: true,
             landed: !!(j && String(j.name).indexOf('onerror') >= 0),
             stepLanded: !!(j && j.steps[0] && String(j.steps[0].t).indexOf('onerror') >= 0),
             nameLanded: !!(BY.gate && String(BY.gate.name).indexOf('onerror') >= 0) };
  }, PAY);
  ok(bridged.built, 'H1: the map can be pushed a scene over the config bridge at all');
  ok(bridged.landed && bridged.stepLanded,
    `H2: and a poisoned journey really survives restoreScene (name=${bridged.landed}, step=${bridged.stepLanded})`);
  ok(bridged.nameLanded, 'H2b: a poisoned structure name survives it too');

  await page.evaluate(() => { document.getElementById('maiaLog').innerHTML = ''; playJourney('j1'); });
  await untilReady(page, { line: 'document.querySelectorAll("#maiaLog .jrow").length>0' }, 9000);
  await page.waitForTimeout(600);
  /* SCOPED TO THE DOCK ON PURPOSE. window.__XSS is a whole-page counter and
     the poisoned structure name detonates in #banners the moment the scene
     lands, which is a real defect and belongs to the map lane. Reading the
     global here would make this lane's assertion go red for another lane's
     renderer, and, far worse, would have gone GREEN for the wrong reason on
     any day the banner happened not to draw. Count what this lane owns. */
  const h3 = await page.evaluate(() => ({
    dockImgs: document.querySelectorAll('#maia img').length,
    dockLoaders: document.querySelectorAll('#maia script,#maia iframe,#maia object,#maia embed,#maia svg').length,
    imgs: document.querySelectorAll('#maiaLog img').length,
    asText: (document.getElementById('maiaLog').textContent || '').indexOf('onerror') >= 0,
  }));
  ok(h3.dockImgs === 0 && h3.dockLoaders === 0,
    `H3: a payload that came over the bridge builds nothing loadable in the dock (${h3.dockImgs} img, ${h3.dockLoaders} other)`);
  ok(h3.imgs === 0, `H4: and plants no element in the dock (${h3.imgs} injected)`);
  ok(h3.asText, 'H5: the village still sees the text it pushed');

  /* The {type:'goto'} door already launches a guided walk, so it is checked
     rather than replaced. One argument means opts is undefined, which is what
     keeps an address-opened journey out of the newcomer count. */
  const h6 = await page.evaluate(async () => {
    jEnd(); await new Promise(r => setTimeout(r, 200));
    window.WALK_LOG = [];
    window.postMessage({ type: 'goto', hash: '#/journey/j1' }, '*');
    await new Promise(r => setTimeout(r, 1600));
    return { walking: !!JWALK, id: JWALK ? JWALK.id : null,
             logging: !!(JWALK && JWALK.log), rows: (window.WALK_LOG || []).length };
  });
  ok(h6.walking && h6.id === 'j1', `H6: the {type:'goto'} door still launches the walk (${h6.id})`);
  ok(!h6.logging && h6.rows === 0,
    `H7: and an address-opened journey is not counted as a newcomer run (rows=${h6.rows})`);

  /* ---------- I. the dock, which is the surface this lane owns ----------
     The journey walk was never the only way poisoned scene text reaches
     #maiaLog. openPanel() calls maiaContext(), which printed s.name, s.blurb
     and s.event straight into it, and the concierge answers printed quest,
     seat and place names the same way. That is why this section drives the
     PANEL and the CONCIERGE rather than the journey: a regression test that
     re-drives the path already fixed is the seventh failure of this round
     wearing a new hat. */
  const i1 = await page.evaluate(async () => {
    document.getElementById('maiaLog').innerHTML = '';
    openPanel('gate');
    await new Promise(r => setTimeout(r, 700));
    return { lines: document.querySelectorAll('#maiaLog .mline').length,
             txt: (document.getElementById('maiaLog').textContent || '') };
  });
  ok(i1.lines > 0, `I1: opening a place really does write into the dock (${i1.lines} lines, so this path is driven)`);
  ok(i1.txt.indexOf('onerror') >= 0,
    'I2: and the poisoned place name really did reach it (the poisoner is not planting into thin air)');

  const i3 = await page.evaluate(() => ({
    imgs: document.querySelectorAll('#maia img').length,
    anyLoader: document.querySelectorAll('#maia script,#maia iframe,#maia object,#maia embed,#maia svg').length,
  }));
  ok(i3.imgs === 0, `I3: nothing in Maia's dock ever becomes an <img> (${i3.imgs})`);
  ok(i3.anyLoader === 0, `I4: nor a script, iframe, object, embed or svg (${i3.anyLoader})`);

  /* The concierge is the other writer, and its quest answer puts a name into a
     JS string inside an HTML attribute. escq leaves ' alone, which is correct
     for text and wrong there, so this drives a payload that closes the JS
     string without touching an HTML delimiter. */
  const i5 = await page.evaluate(async () => {
    window.__JS = 0;
    const q = SCENE.quests[0];
    if (!q) return { drove: false };
    q.q = "');window.__JS=1;('";
    /* questBest() scores shared words over 3 letters and needs two of them, so
       the ask has to actually match this quest or the concierge answers with
       something else entirely and the section measures nothing. */
    q.desc = 'zzzalpha zzzbeta';
    document.getElementById('maiaLog').innerHTML = '';
    $('maiaText').value = 'I want to help with zzzalpha zzzbeta';
    $('maiaSend').click();
    await new Promise(r => setTimeout(r, 900));
    const a = document.querySelector('#maiaLog a[onclick]');
    if (a) a.click();
    await new Promise(r => setTimeout(r, 400));
    return { drove: true, hasAnchor: !!a, attr: a ? a.getAttribute('onclick') : '', fired: window.__JS || 0 };
  });
  ok(i5.drove && i5.hasAnchor, `I5: the concierge really does build a claim link with a name in it (${i5.hasAnchor})`);
  ok(i5.fired === 0, `I6: and a quest name cannot close the JS string inside its attribute (${i5.fired} executions)`);

  /* ---------- J. each defence on its own ----------
     THIS SECTION EXISTS BECAUSE THE BREAK REHEARSAL EMBARRASSED THE ONE
     BEFORE IT. The dock has two independent defences: every call site escapes
     what it interpolates, and maiaClean parses the result somewhere inert.
     Sections E, H and I only ever observed the OUTCOME of both together, so
     when break_maia_journey.py un-escaped the journey title, every check
     stayed green (maiaClean removed the <img>), and when it put the raw
     innerHTML assignment back, every check stayed green again (escaping had
     already defanged the string). Two defences, one observation, and a single
     regression in either one is invisible.

     So: measure the string handed to the parser, and measure the parser, and
     never infer one from the other.

     AND THE SPY HAS TO STAY OPEN UNTIL THE LINE IT IS FOR ACTUALLY ARRIVES.
     The poisoned step title is written by the flight's ARRIVAL callback, and
     this section used to hold the spy for a fixed 2600ms. See the note beside
     C7 for where that number sits: the landing is 1858-2148ms with one browser
     on an idle box and 3170-4220ms with four, so 2600ms is a bet on how many
     lanes are busy. Un-escape the title, run four at a time, and the 2600ms
     version missed the break in 6 of 6 runs while this one caught it 6 of 6.
     A missed run captured only the OPENING line,
     where the journey name is escaped by a different call, so J2 found its
     "&lt;img" and J3 found no live one and both printed green with the title
     they exist to inspect never handed over at all. break_maia_journey.py
     un-escaped that title and reported "SILENT (nothing) MISSING J3".

     J1 IS NOW THE POSITIVE CONTROL AND NOT A LINE COUNT. Counting lines
     answers "did the spy fire", which the opening line satisfies on its own.
     The question that makes J2 and J3 mean anything is "was the ARRIVAL line
     among them", and the stop row is the only maiaSay in a walk that carries
     jRow's markup, so that is what this looks for. */
  await page.evaluate(() => {
    /* maiaClean is a column-0 function declaration, so it is a property of the
       global object and the bare call inside maiaSay resolves through it. That
       is what makes this spy possible without touching the artifact. */
    window.__REALCLEAN = window.maiaClean;
    window.__SEEN = [];
    window.maiaClean = function (h) { window.__SEEN.push(String(h)); return window.__REALCLEAN(h); };
    document.getElementById('maiaLog').innerHTML = '';
    playJourney('j1');
  });
  const jArrived = await untilReady(page,
    { row: 'document.querySelectorAll("#maiaLog .jrow").length>0' }, 15000);
  const j1 = await page.evaluate(() => {
    window.maiaClean = window.__REALCLEAN;                 // always, on both paths
    const seen = window.__SEEN || [];
    return { n: seen.length,
             arrival: seen.filter(h => h.indexOf('class="jrow"') >= 0).length,
             all: seen.join('\n') };
  });
  await page.evaluate(() => { jEnd(); });
  await page.waitForTimeout(200);
  ok(jArrived && j1.arrival > 0,
    `J1: the ARRIVAL line, the one that carries the step title, really was handed to the parser (${j1.n} line(s) seen, ${j1.arrival} of them the stop row)`);
  ok(j1.all.indexOf('&lt;img') >= 0,
    'J2: LAYER ONE. the payload reaches the parser already escaped, as &lt;img');
  ok(j1.all.indexOf('<img') < 0,
    'J3: and no live <img> is ever handed to it, whatever the parser would do with one');

  const j4 = await page.evaluate(async () => {
    window.__INERT = 0;
    const frag = window.maiaClean('<img src=x onerror="window.__INERT=1">' +
      '<b>kept</b><button onclick="void 0">also kept</button>');
    await new Promise(r => setTimeout(r, 500));
    const probe = document.createElement('div');
    probe.appendChild(frag.cloneNode(true));
    return { fired: window.__INERT, imgs: probe.querySelectorAll('img').length,
             b: probe.querySelectorAll('b').length, btn: probe.querySelectorAll('button').length };
  });
  ok(j4.fired === 0 && j4.imgs === 0,
    `J4: LAYER TWO. maiaClean parses somewhere inert and drops the loader without ever running it (fired=${j4.fired}, imgs=${j4.imgs})`);
  ok(j4.b === 1 && j4.btn === 1,
    `J5: and keeps the markup the dock is built from, including its own onclick controls (b=${j4.b}, button=${j4.btn})`);

  /* J6. THE ALLOWLIST'S OWN POSITIVE CONTROL, and the reason the strip below
     can be trusted at all. maiaClean now removes every on* attribute whose
     value is not one of the five handlers this file writes, and the failure
     mode of an allowlist is silent: a stripped onclick renders as a button
     that does nothing, which looks exactly like a button nobody wired.

     SO THE STRIP KEEPS A RECORD AND THIS READS IT. By this line the suite has
     driven the tour, a journey from both entry points, the concierge, the
     claim link whose onclick carries an escja'd quest name, and two poisoned
     scenes over the config bridge. The record has to be empty. That is an
     enumeration; a grep over 37 call sites is not, because a template literal
     puts the handler on a different line from the maiaSay carrying it. */
  const j6 = await page.evaluate(() => (window.MSAY_STRIPPED || []).slice());
  ok(j6.length === 0,
    `J6: nothing the dock wrote for itself was stripped by the handler allowlist (${j6.length}${j6.length ? ': ' + j6.join(' ') : ''})`);

  /* J7. LAYER TWO AGAINST ATTRIBUTES, which is the half it did not have.
     maiaClean removed banned ELEMENTS and never looked at attributes, so a
     live on* handler on a <b> the parser was happy to keep went straight
     through it. Layer two exists for the day a call site forgets to escape,
     so this hands maiaSay a raw string on purpose, which is exactly that day.

     THEN IT DRIVES THE RENDERED ELEMENT WITH A REAL EVENT. An attribute list
     is a description of the page; a handler that fires is the thing a
     person's mouse finds. */
  const j7 = await page.evaluate(async () => {
    if (window.MSAY_STRIPPED) window.MSAY_STRIPPED.length = 0; else window.MSAY_STRIPPED = [];
    window.__ATTR = 0;
    document.getElementById('maiaLog').innerHTML = '';
    maiaSay('<b id="__probe" onmouseover="window.__ATTR=1" onclick="window.__ATTR=2">hover me</b>');
    const el = document.getElementById('__probe');
    if (el) {
      el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    await new Promise(r => setTimeout(r, 250));
    return { kept: !!el, text: el ? el.textContent : '', fired: window.__ATTR,
             on: el ? [...el.attributes].map(a => a.name).filter(n => /^on/i.test(n)) : null,
             took: (window.MSAY_STRIPPED || []).slice() };
  });
  ok(j7.kept && j7.text === 'hover me',
    `J7: the element itself is still kept, so the village still reads what it wrote ("${j7.text}")`);
  ok(j7.fired === 0 && j7.on && j7.on.length === 0,
    `J7b: and no live handler survives the parse, driven by a real mouseover and a real click (fired=${j7.fired}, on=${JSON.stringify(j7.on)})`);
  ok(j7.took.length === 2,
    `J7c: and the strip says what it took, which is what makes J6's empty list mean something (${JSON.stringify(j7.took)})`);

  /* J8. The three elements that were missing from MSAY_BAN. <style> is the one
     that matters: a single rule reaches the whole page, and a dock that prints
     a village's own text is a place a rule can arrive. */
  const j8 = await page.evaluate(() => {
    const probe = document.createElement('div');
    probe.appendChild(window.maiaClean(
      '<style>body{display:none}</style><marquee>m</marquee>' +
      '<details><summary>s</summary></details><b>kept</b>'));
    return { style: probe.querySelectorAll('style').length,
             marquee: probe.querySelectorAll('marquee').length,
             details: probe.querySelectorAll('details').length,
             b: probe.querySelectorAll('b').length };
  });
  ok(j8.style === 0 && j8.marquee === 0 && j8.details === 0 && j8.b === 1,
    `J8: style, marquee and details go too, and the text beside them stays (style=${j8.style}, marquee=${j8.marquee}, details=${j8.details}, b=${j8.b})`);

  /* ---------- K. a URL is not text ----------
     escq replaces &, < and ", which makes a value safe to SIT inside an
     attribute and says nothing about what the attribute then DOES.
     `javascript:alert(1)` goes through it letter for letter. The dock builds a
     sign-in door out of d.href, and d.href arrives on the promise-result
     message over the same bridge section H drives, so it is reachable by
     exactly the path this lane already hardened for scene text.

     IT IS LATENT AND NOT LIVE, AND THE CHECK IS HERE ANYWAY. A javascript:
     URL on an anchor carrying target="_blank" is declined by the browser, so
     nothing fires today. A defence that rests on another attribute's side
     effect is not a defence. The assertion is therefore on the href the anchor
     carries: clicking this one would measure the browser's rule and never the
     map's, and a green from it would be a green about somebody else's code. */
  const k1 = await page.evaluate(async () => {
    document.getElementById('maiaLog').innerHTML = '';
    promiseWatch('claim', 'kprobe', 'kn1', function () {});
    window.postMessage({ type: 'promise-result', id: 'kprobe', kind: 'claim', nonce: 'kn1',
                         ok: false, reason: 'anonymous', href: 'javascript:window.__HREF=1' }, '*');
    await new Promise(r => setTimeout(r, 600));
    const a = document.querySelector('#maiaLog a[target="_blank"]');
    return { drove: !!a, href: a ? a.getAttribute('href') : null, label: a ? a.textContent.trim() : '' };
  });
  ok(k1.drove && k1.label === 'Sign in',
    `K1: the shell really can put a sign-in door in the dock, so the poisoner is not posting into thin air ("${k1.label}")`);
  ok(k1.href === '#', `K2: and a javascript: URL never becomes its href (href="${k1.href}")`);

  const k3 = await page.evaluate(async () => {
    document.getElementById('maiaLog').innerHTML = '';
    promiseWatch('claim', 'kprobe2', 'kn2', function () {});
    window.postMessage({ type: 'promise-result', id: 'kprobe2', kind: 'claim', nonce: 'kn2',
                         ok: false, reason: 'anonymous', href: 'https://village.example/sign-in?a=1&b=2' }, '*');
    await new Promise(r => setTimeout(r, 600));
    const a = document.querySelector('#maiaLog a[target="_blank"]');
    return { href: a ? a.getAttribute('href') : null };
  });
  ok(k3.href === 'https://village.example/sign-in?a=1&b=2',
    `K3: and the real door still opens, ampersand and all (${k3.href})`);

  /* NOT A CHECK, and deliberately not one: these surfaces belong to other
     lanes. Naming them with evidence beats a red gate on code this lane must
     not edit, and beats saying nothing at all. */
  const outside = await page.evaluate(() => {
    const where = [];
    document.querySelectorAll('img').forEach(im => {
      if (!/(^|\/)x$/.test(im.getAttribute('src') || '')) return;
      const chain = [];
      for (let e = im; e && e !== document.body; e = e.parentElement) {
        chain.push(e.id ? '#' + e.id : (e.className ? '.' + String(e.className).split(' ')[0] : e.tagName));
      }
      where.push(chain.reverse().join(' > '));
    });
    return where;
  });
  console.log(`\nNOTE  the same payload still renders unescaped on ${outside.length} node(s) OUTSIDE this lane:`);
  outside.forEach(w => console.log('        ' + w));
  console.log('      not failed here because this lane does not own those renderers.\n');

  await D.ctx.close();

  /* ================= POCKET ================= */
  /* hasTouch ALONE. isMobile is unreliable on this machine, and the artifact's
     own profile test is ('ontouchstart' in window) against the short side. */
  const P = await open(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 2 });
  const pp = P.page;
  ok(await untilReady(pp, { boot: 'typeof playJourney==="function"' }), 'D0: the artifact booted on a phone');
  /* A REAL TAP, because a person taps. This is not cosmetic. hap() calls
     navigator.vibrate on the pocket profile, and Chrome refuses a vibrate the
     frame has never been touched for and logs it as a console error, so a run
     that only calls functions manufactures an error no person would ever see
     and D10 fails for a reason that is about the gate. Tapping also means D3
     measures the page a visitor is actually looking at, past the intro. */
  await pp.tap('#enterBtn').catch(() => {});
  await pp.waitForTimeout(1600);
  ok(await pp.evaluate(() => document.body.classList.contains('pocket')), 'D1: and it really is the pocket profile');
  ok(await pp.evaluate(() => !document.body.classList.contains('intro')),
    'D1b: and the tap really landed, so vibrate is permitted and the intro is gone');

  await pp.evaluate(() => { document.getElementById('maiaLog').innerHTML = ''; playJourney('j1'); });
  ok(await untilReady(pp, { line: 'document.querySelectorAll("#maiaLog .jrow").length>0' }, 9000), 'D2: the journey runs on the phone');

  const d3 = await seen(pp, '#maiaLog .mline:last-child');
  ok(d3.seen, `D3: and her line is visible on the phone screen ${d3.why || JSON.stringify(d3.box)}`);

  /* TENANCY, not a literal. #maia is placed by the bottom band, so its own
     bottom must be the value bandLayout published on the root. */
  const d4 = await pp.evaluate(() => {
    const el = document.getElementById('maia');
    return { sheet: document.body.classList.contains('msheet'),
             bottom: getComputedStyle(el).bottom,
             published: document.documentElement.style.getPropertyValue('--band-b-maia').trim(),
             box: window.bandBox ? window.bandBox('bottom') : null };
  });
  ok(d4.sheet, 'D4: the journey opens the sheet the phone keeps Maia in');
  ok(d4.published !== '' && d4.bottom === d4.published,
    `D5: and the band placed it, rather than any literal written here (bottom=${d4.bottom}, --band-b-maia=${d4.published || '(unpublished)'})`);

  const d6 = await pp.evaluate(() => ({ btns: document.querySelectorAll('#maiaLog .jrow .btn').length }));
  ok(d6.btns === 3, `D6: the same three answers on the phone (${d6.btns})`);

  await pp.screenshot({ path: shot('maia-pocket.png') }).catch(() => {});

  const d7 = await pp.evaluate(async () => { jEnd(); await new Promise(r => setTimeout(r, 350));
    return { sheet: document.body.classList.contains('msheet'), maia: getComputedStyle(document.getElementById('maia')).display }; });
  ok(!d7.sheet && d7.maia === 'none', `D7: ending it gives the phone its screen back (msheet=${d7.sheet})`);

  ok(P.net.length === 0, `D8: the phone run made zero requests (${P.net.length}${P.net.length ? ' :: ' + P.net[0] : ''})`);
  ok(P.perr.length === 0, `D9: zero page errors on the phone (${P.perr.length})${P.perr.length ? ' :: ' + P.perr[0] : ''}`);
  ok(P.cerr.length === 0, `D10: zero console errors on the phone (${P.cerr.length})${P.cerr.length ? ' :: ' + P.cerr[0] : ''}`);
  await P.ctx.close();

  /* ---------- the count is part of the result ---------- */
  const EXPECTED = 81;
  console.log(`\nchecks run: ${checks} (expected ${EXPECTED}), breaks proven when written: ${BREAKS}`);
  if (checks < EXPECTED) {
    console.log(`FAIL SHORT: this suite stopped at ${checks} of ${EXPECTED} checks. A crash contributes an empty set, `
      + 'so treat a short run as a failure and never as a clean subset.');
    fails++;
  }
  console.log(fails === 0 ? 'MAIA JOURNEY: ALL GREEN' : `MAIA JOURNEY: ${fails} FAILURES`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.log('SUITE THREW: ' + (e && e.stack || e)); process.exit(1); });
