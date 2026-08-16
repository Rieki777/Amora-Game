/* L3 wave-2 fix: STORED-SCENE INJECTION THROUGH THE HOUSING IMPORT PATH.
 *
 * patch_g3_03_homes.py wrote rigorous validation on the WRITE path and none at
 * all on the READ path it also wrote, so a stored scene could carry a string
 * into SCENE.housing and from there into a double-quoted attribute, into
 * window.LOTS (three player surfaces render it) and back out through the export
 * with configured:true and open serialising to JSON null.
 *
 * This measures the attack rather than asserting the fix, and it is written to
 * FAIL LOUD on the pre-fix artifact. Run it both ways:
 *
 *   cd docs/prototypes/qa && source ./env.sh && node _probe_g3_injection.js
 *   GROUNDS_FILE="file:///.../pre-patch.html" node _probe_g3_injection.js
 *
 * A  THE READ PATH. A poisoned scene goes in through restoreScene, which is the
 *    dominant path: applyScene() calls it on every shell scene push, the Restore
 *    button calls it directly, and scheduleAutosave ships the export to
 *    draft-save. Nothing hostile may survive as a value, a phantom key, a LOTS
 *    entry or an export field, and the refusal has to be SAID.
 * B  THE RENDER SITES, measured independently by writing the payload straight
 *    into SCENE.housing so the import path cannot be what saves it. The two
 *    number attributes render whatever the row holds, so they are the live
 *    breakout test; the help line no longer renders a non-number at all, which
 *    is the point, so what is measured there is that it refuses.
 * C  REGRESSION. Everything the wave-1 probe proved still has to hold: 8/3
 *    survives, zero counts as set, a legacy `taken`-only row still imports, a
 *    half-typed row still survives an export.
 */
const { chromium } = require('playwright');

const FILE = process.env.GROUNDS_FILE;
const EXE = process.env.PW_EXE;
const KEY = 'pondhomes'; // seeded in window.LOTS, archetype homes

let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

/* Wait for a state, not a clock, and name the term that never went true. Terms
 * are expression STRINGS because a structurally false predicate (`window.SCENE`
 * for a top-level const) times out exactly like a slow boot. */
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

/* The payloads. ATTR closes the value="" it is interpolated into and hangs a
   handler off the input; TEXT is markup in an element-text position. Both are
   inert as DATA and both are live as MARKUP, which is the whole difference this
   probe exists to measure. */
const ATTR = '" onfocus="window.__PWN_ATTR=1" data-pwn="';
const TEXT = '<img src=x onerror="window.__PWN_TEXT=1">';

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1180 } });
  const page = await ctx.newPage();
  const perr = [], warns = [];
  page.on('pageerror', e => perr.push(String(e)));
  page.on('console', m => { if (m.type() === 'warning') warns.push(m.text()); });

  try {
    await page.goto(FILE);
    const booted = await untilReady(page, {
      leaveIntro: "typeof leaveIntro==='function'",
      restoreScene: "typeof restoreScene==='function'",
      housingImport: "typeof housingImport==='function'",
      buildExport: "typeof buildExportJSON==='function'",
      lots: '!!window.LOTS',
      scene: 'typeof SCENE!=="undefined" && SCENE.structures && SCENE.structures.length>0',
    });
    ok(booted, 'the map booted with the housing verbs and the seeded LOTS in place');
    if (!booted) { console.log('G3 INJECTION: 1 FAILURES'); await browser.close(); process.exit(1); }

    await page.evaluate(() => leaveIntro());
    await page.waitForTimeout(400);
    await page.click('#buildBtn');
    await page.waitForTimeout(400);

    /* ================= A. THE READ PATH ================= */
    const sample = await page.evaluate(k => JSON.parse(JSON.stringify(window.LOTS[k] || null)), KEY);

    const a = await page.evaluate(([k, attr, text]) => {
      const bent = JSON.parse(JSON.stringify(buildExportJSON()));
      bent.housing = {
        rows: [
          { structureKey: k, total: attr, storedTaken: text, label: { evil: 1 }, takenSource: { evil: 1 } },
          { structureKey: { evil: 1 }, total: 2, storedTaken: 1 },      // object key -> phantom hamlet
          { structureKey: 'ridgeA', total: -1, storedTaken: 2 },         // sentinel
          { structureKey: 'ridgeB', total: 12.5, storedTaken: 1 },       // fraction
        ],
      };
      const returned = restoreScene(bent);
      const row = SCENE.housing[k] || null;
      return {
        returned,
        buildings: SCENE.structures.length,
        row: JSON.parse(JSON.stringify(row)),
        totalType: row ? typeof row.total : 'no row',
        takenType: row ? typeof row.storedTaken : 'no row',
        labelType: row ? (row.label === null ? 'null' : typeof row.label) : 'no row',
        sourceType: row ? typeof row.takenSource : 'no row',
        keys: Object.keys(SCENE.housing),
        lots: JSON.parse(JSON.stringify(window.LOTS[k] || null)),
        lotsTypes: window.LOTS[k] ? [typeof window.LOTS[k].sold, typeof window.LOTS[k].total].join(',') : 'absent',
        ridgeA: JSON.parse(JSON.stringify(SCENE.housing.ridgeA || null)),
        ridgeB: JSON.parse(JSON.stringify(SCENE.housing.ridgeB || null)),
      };
    }, [KEY, ATTR, TEXT]);

    ok(a.returned === true && a.buildings > 0,
      `a poisoned housing block still restores the rest of the scene (returned ${a.returned}, ${a.buildings} buildings)`);
    ok(a.totalType !== 'string' && a.takenType !== 'string',
      `A1 the strings never become stored values (total ${a.totalType}, storedTaken ${a.takenType})`);
    ok(a.row && a.row.total === null && a.row.storedTaken === null,
      `A2 a refused number is UNSET, which is fail-closed (${JSON.stringify(a.row)})`);
    ok(a.labelType !== 'object' && a.sourceType === 'string',
      `A3 label and takenSource are coerced, never objects (label ${a.labelType}, takenSource ${a.sourceType})`);
    ok(a.keys.indexOf('[object Object]') === -1,
      `A4 a non-string structureKey mints no phantom hamlet (${a.keys.join(' ') || 'none'})`);
    ok(a.ridgeA === null || a.ridgeA.total === null,
      `A5 a -1 sentinel is refused rather than surviving the subtraction (${JSON.stringify(a.ridgeA)})`);
    ok(a.ridgeB === null || a.ridgeB.total === null,
      `A6 and a fractional home count is refused too (${JSON.stringify(a.ridgeB)})`);
    ok(JSON.stringify(a.lots) === JSON.stringify(sample) && a.lotsTypes === 'number,number',
      `A7 window.LOTS falls back to its seeded sample, all numbers (${JSON.stringify(a.lots)} / ${a.lotsTypes})`);
    ok(warns.some(w => /housing:/.test(w) && /refused/.test(w)),
      `A8 and the refusal is SAID, once, with a count (${warns.filter(w => /housing:/.test(w))[0] || 'nothing said'})`);

    const ex = await page.evaluate(() => {
      const h = buildExportJSON().housing;
      return { s: JSON.stringify(h), configured: h.configured, entries: h.entries.length,
        entryKeys: h.entries.map(e => e.structureKey).join(' ') };
    });
    ok(!/onfocus|onerror|__PWN/.test(ex.s),
      'A9 the export carries no payload, so a poisoned scene cannot persist through draft-save');
    ok(ex.entries === 0 && ex.configured === false,
      `A10 and no refused row publishes itself as configured (${ex.entries} entries, configured ${ex.configured})`);
    ok(!/"open":null/.test(ex.s),
      'A11 no entry carries open:null, which this contract reads as unset on a row that says it is set');

    /* ================= B. THE RENDER SITES ================= */
    /* Straight into the store, so the import path is not what is being tested.
       Both number attributes render whatever the row holds, set or unset. */
    await page.evaluate(([k, attr, text]) => {
      SCENE.housing[k] = { total: attr, storedTaken: text, label: null, takenSource: 'founder' };
      openInspect(k);
    }, [KEY, ATTR, TEXT]);
    await page.waitForTimeout(500);

    const b = await page.evaluate(() => {
      const el = document.getElementById('iHomesTotal');
      const el2 = document.getElementById('iHomesTaken');
      const panel = document.getElementById('inspect');
      if (el && el.focus) el.focus();
      if (el2 && el2.focus) el2.focus();
      return {
        present: !!el && !!el2,
        onfocus: el ? el.getAttribute('onfocus') : 'no field',
        pwnAttr: typeof window.__PWN_ATTR,
        pwnText: typeof window.__PWN_TEXT,
        injected: panel ? panel.querySelectorAll('img[src="x"],[onerror],[data-pwn]').length : -1,
        /* The ATTRIBUTE, not the property. A type=number control sanitises a
           non-numeric value to '' on the property, so el.value proves nothing
           either way; the attribute is where "did this stay one value or become
           three attributes" is actually visible. Measured: escaped, the whole
           payload is the attribute; unescaped, the attribute ends at the first
           quote and `onfocus` exists beside it. */
        valueAttr: el ? el.getAttribute('value') : 'no field',
        valueProp: el ? el.value : 'no field',
        helpUnset: !!(panel && /counts as unset/.test(panel.textContent)),
        set: housingSet('pondhomes'),
      };
    });
    ok(b.present, 'B0 the two number fields render for a poisoned row rather than blowing the panel up');
    ok(b.onfocus === null, `B1 the attribute never breaks out of value="" (onfocus ${b.onfocus})`);
    ok(b.pwnAttr === 'undefined' && b.pwnText === 'undefined',
      `B2 and nothing the payload wanted ever ran (attr ${b.pwnAttr}, text ${b.pwnText})`);
    ok(b.injected === 0, `B3 no injected node exists anywhere in the panel (${b.injected})`);
    ok(b.valueAttr === ATTR,
      `B4 the whole payload is ONE attribute value, byte for byte, not three attributes (${JSON.stringify(b.valueAttr)})`);
    ok(b.valueProp === '', `B4b and the number control then refuses it as a value (${JSON.stringify(b.valueProp)})`);
    ok(b.set === false && b.helpUnset,
      `B5 and the help line refuses a non-number row outright, so it renders no value at all (set ${b.set})`);

    /* ================= C. REGRESSION ================= */
    const c = await page.evaluate(k => {
      const clean = JSON.parse(JSON.stringify(buildExportJSON()));
      clean.housing = { rows: [
        { structureKey: k, total: 8, storedTaken: 3, takenSource: 'founder', label: null },
        { structureKey: 'ridgeA', total: 0, storedTaken: 0, takenSource: 'founder', label: null },
        { structureKey: 'ridgeB', total: 6, taken: 2, takenSource: 'founder', label: null },  // legacy
        { structureKey: 'kitchen', total: '9', storedTaken: '4', takenSource: 'founder', label: null },
      ] };
      restoreScene(clean);
      const h = buildExportJSON().housing;
      const by = {};
      h.entries.forEach(e => { by[e.structureKey] = e; });
      return {
        row: JSON.parse(JSON.stringify(SCENE.housing[k])),
        lots: JSON.parse(JSON.stringify(window.LOTS[k])),
        zero: by.ridgeA ? by.ridgeA.open : 'missing',
        zeroIn: !!by.ridgeA,
        legacy: JSON.parse(JSON.stringify(SCENE.housing.ridgeB)),
        coerced: JSON.parse(JSON.stringify(SCENE.housing.kitchen)),
        configured: h.configured,
        open: by[k] ? by[k].open : 'missing',
      };
    }, KEY);
    ok(c.row.total === 8 && c.row.storedTaken === 3,
      `C1 a clean 8/3 still survives the round trip (${JSON.stringify(c.row)})`);
    ok(c.lots.sold === 3 && c.lots.total === 8 && c.open === 5,
      `C2 and still reaches window.LOTS and the derived open (${JSON.stringify(c.lots)}, open ${c.open})`);
    ok(c.zeroIn && c.zero === 0, `C3 zero is still SET, not unset (open ${c.zero})`);
    ok(c.legacy.storedTaken === 2, `C4 a legacy taken-only row still imports (${JSON.stringify(c.legacy)})`);
    ok(c.coerced.total === 9 && c.coerced.storedTaken === 4,
      `C5 a hand-edited numeric string still reads as its number (${JSON.stringify(c.coerced)})`);
    ok(c.configured === true, 'C6 and configured still flips for real rows');

    const half = await page.evaluate(k => {
      SCENE.housing = {}; housingRow(k, true).total = 5;
      const h = buildExportJSON().housing;
      restoreScene(Object.assign(JSON.parse(JSON.stringify(buildExportJSON())), { housing: h }));
      return JSON.parse(JSON.stringify(SCENE.housing[k] || null));
    }, KEY);
    ok(half && half.total === 5 && half.storedTaken === null,
      `C7 a half-typed row still survives the export it is filtered out of (${JSON.stringify(half)})`);

    /* ========== D. THE DOMINANT PATH, not the one this probe found handy ==========
       restoreScene above is reached three ways, and applyScene is the one a
       SERVER reaches it by: every shell scene push goes through it, so a scene
       poisoned upstream arrives here and not through a button anybody pressed.
       Measured on a fresh page so nothing this probe already did is holding it
       up. */
    await page.goto(FILE);
    await untilReady(page, { applyScene: "typeof applyScene==='function'", lots: '!!window.LOTS' });
    await page.evaluate(() => leaveIntro());
    await page.waitForTimeout(400);
    const d = await page.evaluate(([k, attr, text]) => {
      const bent = JSON.parse(JSON.stringify(buildExportJSON()));
      bent.housing = { rows: [{ structureKey: k, total: attr, storedTaken: text }] };
      applyScene(bent, 7);
      const row = SCENE.housing[k] || null;
      return { row: JSON.parse(JSON.stringify(row)),
        lots: JSON.parse(JSON.stringify(window.LOTS[k] || null)),
        ex: JSON.stringify(buildExportJSON().housing) };
    }, [KEY, ATTR, TEXT]);
    ok(d.row && d.row.total === null && d.row.storedTaken === null,
      `D1 a scene pushed through applyScene is refused the same way (${JSON.stringify(d.row)})`);
    ok(!/onfocus|onerror|__PWN/.test(d.ex) && !/onfocus|onerror/.test(JSON.stringify(d.lots)),
      'D2 and nothing the push carried reaches the export or window.LOTS');

    ok(perr.length === 0, `zero page errors (${perr.length})${perr.length ? ' - ' + perr[0] : ''}`);
  } catch (e) {
    ok(false, 'the probe ran to the end without throwing: ' + String(e).split('\n')[0]);
  }

  console.log(fails === 0 ? 'G3 INJECTION: ALL GREEN' : `G3 INJECTION: ${fails} FAILURES`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
