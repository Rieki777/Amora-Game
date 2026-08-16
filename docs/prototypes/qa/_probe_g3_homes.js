/* L3 wave-1 fix probe: the two blocking defects, measured rather than asserted.
 *
 *   A  ROUND TRIP. A hamlet set to 8/3 in builder mode has to come back as 8/3
 *      after a reload and a Restore, and after a shell scene push, because
 *      applyScene() calls restoreScene on EVERY push and the Restore button
 *      calls it directly. Before the granted line it came back as {}.
 *   B  UNPARSEABLE INPUT. abc, 8e and 1.2.3 all leave a number input reading ''
 *      which is indistinguishable from a field a founder emptied on purpose.
 *      Each has to be refused loudly and leave the previous number standing.
 *   C  STORED vs EFFECTIVE. `rows` is the write view and must carry storedTaken
 *      and no `taken` at all; `entries` is the public read block and must carry
 *      the effective taken with open derived from it.
 *
 *   cd docs/prototypes/qa && source ./env.sh && node _probe_g3_homes.js
 */
const { chromium } = require('playwright');

const FILE = process.env.GROUNDS_FILE;
const EXE = process.env.PW_EXE;
const KEY = 'pondhomes'; // seeded in window.LOTS at pristine :4511, archetype homes

let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

const enter = async page => {
  await page.waitForTimeout(1800);
  await page.evaluate(() => leaveIntro());
  await page.waitForTimeout(400);
  await page.click('#buildBtn');
  await page.waitForTimeout(400);
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1180 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  const perr = [];
  page.on('pageerror', e => perr.push(String(e)));

  await page.goto(FILE);
  await enter(page);
  await page.evaluate(k => openInspect(k), KEY);
  await page.waitForTimeout(400);

  const fields = await page.evaluate(() => ({
    total: !!document.getElementById('iHomesTotal'),
    taken: !!document.getElementById('iHomesTaken'),
    label: !!document.getElementById('iHomesLabel'),
  }));
  ok(fields.total && fields.taken && fields.label, 'the three homes fields render in builder mode');

  /* ---------- type 8 and 3 the way a founder does ---------- */
  const type = async (id, v) => {
    await page.fill('#' + id, String(v));
    await page.evaluate(i => document.getElementById(i).dispatchEvent(new Event('change', { bubbles: true })), id);
    await page.waitForTimeout(250);
  };
  await type('iHomesTotal', 8);
  await type('iHomesTaken', 3);

  const wrote = await page.evaluate(k => ({
    row: JSON.parse(JSON.stringify(SCENE.housing[k] || null)),
    lots: JSON.parse(JSON.stringify(window.LOTS[k] || null)),
    ex: buildExportJSON().housing,
  }), KEY);
  ok(wrote.row && wrote.row.total === 8 && wrote.row.storedTaken === 3,
    `the founder's number lands in storedTaken (${JSON.stringify(wrote.row)})`);
  ok(!('taken' in (wrote.row || {})), 'and the stored row carries no effective `taken` field of its own');
  ok(wrote.lots && wrote.lots.sold === 3 && wrote.lots.total === 8,
    `and reaches window.LOTS, which is what the three player surfaces read (${JSON.stringify(wrote.lots)})`);

  /* ---------- C. the two export shapes ---------- */
  const row = wrote.ex.rows.find(r => r.structureKey === KEY);
  const ent = wrote.ex.entries.find(r => r.structureKey === KEY);
  ok(row && row.storedTaken === 3 && !('taken' in row),
    `rows is the WRITE view: storedTaken only, never taken (${JSON.stringify(row)})`);
  ok(ent && ent.taken === 3 && ent.open === 5 && ent.total === 8,
    `entries is the public block: effective taken with open derived (${JSON.stringify(ent)})`);
  ok(wrote.ex.configured === true, 'and configured flips once one hamlet is fully set');

  /* ---------- B. what a number input cannot parse ----------
     The three strings do NOT behave alike and the first fix for this only
     covered two of them, so each is driven with REAL KEYSTROKES from a field
     showing the good number, and the state is reset between them: reusing a
     row already broken by the previous string makes every later assertion a
     cascade and hides which one actually failed. */
  for (const bad of ['abc', '8e', '1.2.3', '4.5']) {
    await type('iHomesTotal', 8);
    await page.evaluate(() => { document.getElementById('toasts').innerHTML = ''; });
    await page.click('#iHomesTotal');
    await page.evaluate(() => document.getElementById('iHomesTotal').select());
    await page.type('#iHomesTotal', bad);
    await page.evaluate(() => document.getElementById('iHomesTotal').dispatchEvent(new Event('change', { bubbles: true })));
    await page.waitForTimeout(260);
    const after = await page.evaluate(k => ({
      total: (SCENE.housing[k] || {}).total,
      toast: (document.getElementById('toasts') || {}).textContent || '',
      bad: document.getElementById('iHomesTotal') ? document.getElementById('iHomesTotal').validity.badInput : null,
      shown: document.getElementById('iHomesTotal') ? document.getElementById('iHomesTotal').value : null,
    }), KEY);
    ok(after.total === 8, `"${bad}" leaves the good total of 8 standing (${after.total})`);
    ok(/whole number/i.test(after.toast), `"${bad}" is refused OUT LOUD (${after.toast.trim().slice(0, 46)})`);
  }

  /* A PASTED bad value arrives in the same shape as a typed one and must be
     refused the same way. Driven with a real Ctrl+C / Ctrl+V, because a
     synthetic paste event proves nothing about what Chromium does. */
  await type('iHomesTotal', 8);
  await page.evaluate(() => {
    document.getElementById('toasts').innerHTML = '';
    const t = document.createElement('textarea');
    t.id = 'pasteSrc';
    t.value = 'abc';
    // parked off-screen and focused programmatically: appended in the flow it
    // lands under #mapSel, whose buttons intercept the click.
    t.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(t);
    t.focus();
    t.select();
  });
  await page.keyboard.press('Control+C');
  await page.click('#iHomesTotal');
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Control+V');
  await page.evaluate(() => document.getElementById('iHomesTotal').dispatchEvent(new Event('change', { bubbles: true })));
  await page.waitForTimeout(280);
  const pasted = await page.evaluate(k => ({
    total: (SCENE.housing[k] || {}).total,
    toast: document.getElementById('toasts').textContent || '',
  }), KEY);
  ok(pasted.total === 8, `a PASTED "abc" leaves the good total of 8 standing (${pasted.total})`);
  ok(/whole number/i.test(pasted.toast), 'and is refused out loud, same as a typed one');
  await page.evaluate(() => { const t = document.getElementById('pasteSrc'); if (t) t.remove(); });

  /* A character the control ate that did NOT empty the field is not a refusal:
     5a shows 5, and what the field shows is what a person means. Narrowing the
     rule to "eaten AND now empty" is what keeps this from nagging. */
  await type('iHomesTotal', 8);
  await page.click('#iHomesTotal');
  await page.evaluate(() => document.getElementById('iHomesTotal').select());
  await page.type('#iHomesTotal', '5a');
  await page.evaluate(() => document.getElementById('iHomesTotal').dispatchEvent(new Event('change', { bubbles: true })));
  await page.waitForTimeout(260);
  ok(await page.evaluate(k => (SCENE.housing[k] || {}).total === 5, KEY),
    'typing 5a writes the 5 the field is showing rather than nagging about the a');

  /* an unparseable read must also not be mistaken for a deliberate clear */
  await page.fill('#iHomesTotal', '');
  await page.evaluate(() => document.getElementById('iHomesTotal').dispatchEvent(new Event('change', { bubbles: true })));
  await page.waitForTimeout(260);
  ok(await page.evaluate(k => (SCENE.housing[k] || {}).total === null || !SCENE.housing[k], KEY),
    'while an actually-emptied field still clears the number, which is the whole point of telling them apart');

  await type('iHomesTotal', 8);
  const saved = await page.evaluate(() => JSON.parse(JSON.stringify(buildExportJSON())));

  /* ---------- A1. reload, then Restore ---------- */
  await page.goto(FILE);
  await enter(page);
  const fresh = await page.evaluate(k => JSON.stringify(SCENE.housing || {}) + '|' + JSON.stringify(window.LOTS[k]), KEY);
  ok(/^\{\}\|/.test(fresh), `a fresh page starts with no housing and the seeded sample (${fresh})`);

  await page.evaluate(J => restoreScene(J), saved);
  await page.waitForTimeout(500);
  const back = await page.evaluate(k => ({
    row: JSON.parse(JSON.stringify(SCENE.housing[k] || null)),
    lots: JSON.parse(JSON.stringify(window.LOTS[k] || null)),
    ex: buildExportJSON().housing.entries.length,
  }), KEY);
  ok(back.row && back.row.total === 8 && back.row.storedTaken === 3,
    `RESTORE: 8/3 survives the round trip (${JSON.stringify(back.row)})`);
  ok(back.lots && back.lots.sold === 3 && back.lots.total === 8,
    `RESTORE: and window.LOTS carries it, so the player surfaces agree (${JSON.stringify(back.lots)})`);
  ok(back.ex === 1, `RESTORE: and the export is not empty (${back.ex} entries)`);

  /* ---------- A2. a scene WITHOUT housing replaces, it does not linger ---------- */
  await page.evaluate(J => {
    const bare = JSON.parse(JSON.stringify(J));
    delete bare.housing;
    restoreScene(bare);
  }, saved);
  await page.waitForTimeout(400);
  const gone = await page.evaluate(k => ({
    row: SCENE.housing[k] || null,
    lots: JSON.parse(JSON.stringify(window.LOTS[k] || null)),
  }), KEY);
  ok(gone.row === null, 'a restored scene with no housing REPLACES rather than merges, so nothing lingers on top of it');
  ok(gone.lots && gone.lots.sold === 3 && gone.lots.total === 4,
    `and the seeded sample comes back rather than being destroyed (${JSON.stringify(gone.lots)})`);

  /* ---------- A3. a half-typed row survives, which is what `rows` is for ---------- */
  await page.evaluate(k => { SCENE.housing = {}; housingRow(k, true).total = 5; }, KEY);
  const half = await page.evaluate(() => JSON.parse(JSON.stringify(buildExportJSON())));
  await page.evaluate(J => restoreScene(J), half);
  await page.waitForTimeout(300);
  const halfBack = await page.evaluate(k => JSON.parse(JSON.stringify(SCENE.housing[k] || null)), KEY);
  ok(halfBack && halfBack.total === 5 && halfBack.storedTaken === null,
    `a half-typed row survives the export it would otherwise be filtered out of (${JSON.stringify(halfBack)})`);

  /* ---------- A3b. a malformed housing block fails closed, not loudly ----------
     restoreScene runs inside one try/catch, so a `rows` that is not an array
     would throw and take the WHOLE scene restore down with it. */
  const survived = await page.evaluate(J => {
    const bent = JSON.parse(JSON.stringify(J));
    bent.housing = { rows: { nope: 1 }, entries: null };
    const r = restoreScene(bent);
    return { returned: r, buildings: SCENE.structures.length, housing: JSON.stringify(SCENE.housing) };
  }, saved);
  ok(survived.returned === true && survived.buildings > 0 && survived.housing === '{}',
    `a bent housing block costs the housing block and nothing else (restore returned ${survived.returned}, ${survived.buildings} buildings kept)`);

  /* ---------- A4. the dominant path: applyScene, the shell's own door ---------- */
  await page.goto(FILE);
  await enter(page);
  await page.evaluate(J => applyScene(J, 7), saved);
  await page.waitForTimeout(600);
  const pushed = await page.evaluate(k => JSON.parse(JSON.stringify(SCENE.housing[k] || null)), KEY);
  ok(pushed && pushed.total === 8 && pushed.storedTaken === 3,
    `applyScene(), which every shell push goes through, carries it too (${JSON.stringify(pushed)})`);

  ok(perr.length === 0, `zero page errors (${perr.length})${perr.length ? ' — ' + perr[0] : ''}`);
  console.log(fails === 0 ? 'G3 HOMES: ALL GREEN' : `G3 HOMES: ${fails} FAILURES`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
