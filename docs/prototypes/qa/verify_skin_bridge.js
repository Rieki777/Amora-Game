/* The skin contract between the site and the map, checked from the site side.
 *
 * WHY THIS EXISTS. The site stores a village's skin through `sanitiseMapSkin`
 * (shared/mapSkin.ts), which REBUILDS the object field by field rather than
 * passing it through. That is what makes it safe to store and what makes it
 * lossy: a key `skinExport()` gains and that function has not is dropped on
 * save, the wizard reports success, and the map is dressed in defaults. It has
 * happened three times, most recently to `flow_style` and `label_style` in
 * v0.8, and it never raises an error anywhere.
 *
 * So this walks the whole loop against the real artifact: the exact object the
 * site would store goes in through `applySkinExport`, the map's own state and
 * DOM are read back, and `skinExport()` has to return it unchanged. A key the
 * site silently drops fails here loudly.
 *
 * Run it whenever either side of the skin contract moves.
 *   cd docs/prototypes/qa && source ./env.sh && node verify_skin_bridge.js
 */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE || 'file:///root/amora/work/grounds-v0.html';
const EXE = process.env.PW_EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

/*
 * A full skin exactly as the site stores one, written out as a literal rather
 * than imported. The point is to pin the WIRE shape: if this file had to be
 * updated to match a refactor on the site, it would stop being a check on the
 * site and become a mirror of it.
 */
const STORED = {
  theme: 'Terra Sol', words: '', accent: '#157f7d', parchment: '#f3e7cf',
  label_scale: 1.1, global_scale: 1.2, icon_mode: 'painted',
  flow_style: 'gold', label_style: 'tablet',
  mist: true, glow: false, painterly: { brush: 0.4, palette: 0.7 },
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1180 } });
  const page = await ctx.newPage();
  const perr = [], cerr = [];
  page.on('pageerror', e => perr.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') cerr.push(m.text()); });

  await page.goto(FILE);
  await page.waitForTimeout(2600);

  /* ---------- A. the map starts in its own clothes ---------- */
  const before = await page.evaluate(() => ({
    flow: SKIN.flow_style || 'glyph',
    label: SKIN.label_style || 'ribbon',
    tablet: document.body.classList.contains('lbl-tablet'),
  }));
  ok(before.flow === 'glyph' && before.label === 'ribbon',
    `map starts undressed (${before.flow}/${before.label})`);
  ok(before.tablet === false, 'no tablet labels before a skin is pushed');

  /* ---------- B. a stored skin dresses the land ---------- */
  const after = await page.evaluate((sk) => {
    applySkinExport(sk);
    return {
      flow: SKIN.flow_style, label: SKIN.label_style, mist: !!SKIN.mist, glow: SKIN.glow,
      tablet: document.body.classList.contains('lbl-tablet'),
      flowSel: document.getElementById('skFlow') ? document.getElementById('skFlow').value : null,
      labelSel: document.getElementById('skLabelStyle') ? document.getElementById('skLabelStyle').value : null,
    };
  }, STORED);
  ok(after.flow === 'gold', `flow_style reached the map (${after.flow})`);
  ok(after.label === 'tablet', `label_style reached the map (${after.label})`);
  ok(after.tablet === true, 'tablet labels are actually drawn');
  ok(after.mist === true && after.glow === false, `mist and pulse both took (${after.mist}/${after.glow})`);
  // The map's own controls have to agree, or a founder opening the styling
  // panel sees glyph selected on a map drawing gold.
  ok(after.flowSel === 'gold' && after.labelSel === 'tablet',
    `the map's own controls agree (${after.flowSel}/${after.labelSel})`);

  /* ---------- C. every key the map exports survives the loop ---------- */
  const back = await page.evaluate(() => skinExport());
  for (const key of Object.keys(STORED)) {
    if (key === 'words' || key === 'theme') continue; // theme drives words; words is free text
    const want = JSON.stringify(STORED[key]).toLowerCase();
    const got = JSON.stringify(back[key]).toLowerCase();
    ok(want === got, `${key} survives the round trip (${got})`);
  }

  /*
   * D. The tripwire. Anything `skinExport()` emits that the site's stored
   * shape has no slot for is a key that will be dropped on the next save.
   * `note` is prose the map ships for whoever reads the JSON, never stored.
   */
  const IGNORED = ['note'];
  const unknown = Object.keys(back).filter(k => !(k in STORED) && IGNORED.indexOf(k) === -1);
  ok(unknown.length === 0,
    unknown.length
      ? `skinExport emits ${unknown.join(', ')} and the site has no slot: add them to MapSkin/sanitiseMapSkin or they are dropped on save`
      : 'the site can hold every key the map exports');

  ok(perr.length === 0, `zero page errors (${perr.length})${perr.length ? ' — ' + perr[0] : ''}`);
  ok(cerr.length === 0, `zero console errors (${cerr.length})${cerr.length ? ' — ' + cerr[0] : ''}`);
  console.log(fails === 0 ? 'SKIN BRIDGE: ALL GREEN' : `SKIN BRIDGE: ${fails} FAILURES`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
