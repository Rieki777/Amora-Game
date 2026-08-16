/* L3 wave-1 fix F3: the listbox button keeps its paint order WITHOUT a z-index.
 *
 * The first version of patch_g3_02_listbox.py wrote `z-index:1` on
 * #inspect .insp-lb-btn and claimed no other z value in the file was touched.
 * The claim was false and the value was never allocated to this lane. It is
 * deleted rather than allocated, because it was redundant: the button is the
 * LAST child of .insp-lb and the <select> it covers is position:absolute, so
 * painting order already puts the button on top.
 *
 * "Already puts it on top" is the kind of sentence that is wrong half the
 * time, so this measures it instead: computed z-index is auto, the element
 * under the pointer at the button's centre is part of the button, and the list
 * still opens at the one z value this lane owns.
 *
 * WHY THIS FILE WAS REWRITTEN AFTER IT WAS ALREADY GREEN. It was green on the
 * artifact it was written against and it DIED WITH A NODE STACK on any artifact
 * without the control: `document.querySelector('#inspect .insp-lb')` returned
 * null, `.querySelector` on null threw inside page.evaluate, the rejection went
 * uncaught, no FAIL line was ever printed and the browser was never closed. A
 * coordinator running it against an integration tree that did not carry this
 * lane's patch saw a crash where the answer was "the control is not here", and
 * a crash is not a measurement. Every lookup below now reports its own absence,
 * the boot wait names the term that never went true, and nothing throws.
 *
 *   cd docs/prototypes/qa && source ./env.sh && node _probe_g3_zorder.js
 */
const { chromium } = require('playwright');

let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

/* Wait for a state, not a clock, and name the term that never went true. Terms
 * are expression STRINGS because a structurally false predicate (`window.SCENE`
 * for a top-level const) times out exactly like a slow boot. The old fixed
 * 1500ms sleep was the other half of this file's fragility. */
async function untilReady(page, terms, ms = 20000) {
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
    }, terms).catch(() => ({}));
    const dead = Object.keys(terms).filter(k => !t[k]);
    console.log('  waited ' + ms + 'ms. never true: ' + (dead.join(', ') || '(every term reads true)'));
    return false;
  }
}

(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const perr = [];
  p.on('pageerror', e => perr.push(String(e)));

  try {
    await p.goto(process.env.GROUNDS_FILE);
    const booted = await untilReady(p, {
      leaveIntro: "typeof leaveIntro==='function'",
      openInspect: "typeof openInspect==='function'",
      buildBtn: "!!document.getElementById('buildBtn')",
      scene: 'typeof SCENE!=="undefined" && SCENE.structures && SCENE.structures.length>0',
    });
    ok(booted, 'the map booted with the inspector verbs in place');
    if (!booted) throw new Error('boot');

    await p.evaluate(() => leaveIntro());
    await p.waitForTimeout(300);
    await p.click('#buildBtn');
    await p.waitForTimeout(300);
    await p.evaluate(() => openInspect('kitchen'));
    await p.waitForTimeout(500);

    /* Absence is an ANSWER here, not a crash: this suite is run against trees
       that may not carry the listbox at all. */
    const r = await p.evaluate(() => {
      const wrap = document.querySelector('#inspect .insp-lb');
      if (!wrap) return { missing: 'no .insp-lb in the inspector: this artifact has no upgraded listbox' };
      const btn = wrap.querySelector('.insp-lb-btn');
      if (!btn) return { missing: '.insp-lb is present but carries no .insp-lb-btn' };
      const sel = wrap.querySelector('select');
      const bx = btn.getBoundingClientRect();
      const hit = document.elementFromPoint(bx.left + bx.width / 2, bx.top + bx.height / 2);
      return {
        btnZ: getComputedStyle(btn).zIndex,
        lastChild: wrap.lastElementChild === btn,
        selectPos: sel ? getComputedStyle(sel).position : 'no select',
        onScreen: bx.width > 0 && bx.height > 0 && bx.top >= 0 && bx.bottom <= innerHeight,
        hitIsButton: !!(hit && btn.contains(hit)),
        hit: hit ? (hit.className || hit.tagName) : null,
      };
    });
    if (r.missing) {
      ok(false, 'the upgraded listbox is in the panel to be measured: ' + r.missing);
      throw new Error('absent');
    }
    ok(r.btnZ === 'auto', `the button carries no z-index of its own (${r.btnZ})`);
    ok(r.lastChild && r.selectPos === 'absolute',
      `and does not need one: it is the last child, over an absolutely positioned select (${r.selectPos})`);
    /* elementFromPoint answers about the VIEWPORT, so a button scrolled out of
       it returns null and would read as "something covers the button". Said
       separately so the two failures cannot be mistaken for each other. */
    ok(r.onScreen, 'the button is inside the viewport, which is what elementFromPoint can answer about');
    ok(r.hitIsButton, `so the button is what the pointer lands on, not the select it covers (${r.hit})`);

    await p.click('#inspect .insp-lb-btn');
    await p.waitForTimeout(300);
    const open = await p.evaluate(() => {
      const list = document.querySelector('.insp-lb-list.open');
      const btn = document.querySelector('#inspect .insp-lb-btn');
      return {
        lists: document.querySelectorAll('.insp-lb-list.open').length,
        expanded: btn ? btn.getAttribute('aria-expanded') : 'no button',
        z: list ? getComputedStyle(list).zIndex : 'no open list',
      };
    });
    ok(open.lists === 1 && open.expanded === 'true',
      `and it still opens on a real click (${open.lists}, aria-expanded ${open.expanded})`);
    ok(open.z === '64', `the open list sits at 64, the one z value allocated to this lane (${open.z})`);

    /* The whole point of the rule being redundant: the census must show exactly
       one value added to the file, and it must be that 64. Media rules are
       walked too, because a z-index inside one is invisible to a top-level
       sweep and would make this census falsely quiet. */
    const census = await p.evaluate(() => {
      const out = [];
      const walk = (rules) => {
        for (const r2 of rules) {
          if (r2.style && r2.style.zIndex) out.push((r2.selectorText || r2.cssText.slice(0, 40)) + ' -> ' + r2.style.zIndex);
          if (r2.cssRules) { try { walk(r2.cssRules); } catch (e) { /* cross-origin sheet */ } }
        }
      };
      for (const s of document.styleSheets) { try { walk(s.cssRules); } catch (e) { /* cross-origin sheet */ } }
      return out.filter(t => /insp-lb/.test(t));
    });
    ok(census.length === 1 && /64/.test(census[0]),
      `and this lane's stylesheet writes exactly one z value (${census.join(', ') || 'none'})`);
  } catch (e) {
    if (!/^(boot|absent)$/.test(e.message)) {
      ok(false, 'the probe ran to the end without throwing: ' + String(e).split('\n')[0]);
    }
  }

  ok(perr.length === 0, `zero page errors (${perr.length})${perr.length ? ' - ' + perr[0] : ''}`);
  console.log(fails === 0 ? 'G3 ZORDER: ALL GREEN' : `G3 ZORDER: ${fails} FAILURES`);
  await b.close();
  process.exit(fails ? 1 : 0);
})();
