/* W1c before/after: the place panel, composited, at desk and at pocket.
 *
 * CTRL is the pristine artifact and GROUNDS_FILE is the working tree, so both
 * sides are shot by the same code in the same browser in the same run. The
 * composite is built as a page and screenshotted rather than stitched with an
 * image library, because nothing in this directory has one and a page is the
 * one compositor that is definitely installed.
 *
 *   CTRL=file:///.../base-grounds-v0.html node qa/shots_mapact.js
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LANE = process.env.GROUNDS_FILE;
const CTRL = process.env.CTRL;
const EXE = process.env.PW_EXE;
const OUT = process.env.SHOT_OUT || path.join(__dirname, '..', '.qa-out', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const PROFILES = [
  { name: 'desk', viewport: { width: 1480, height: 1180 }, hash: '', touch: false },
  { name: 'pocket', viewport: { width: 390, height: 844 }, hash: '#hud=pocket', touch: true },
];

/* Ridge Hamlet North carries the widest set: an event (RSVP), a door CTA, two
   module doors and two conversation rows, all on the Overview. */
const PLACE = process.env.SHOT_PLACE || 'ridgeA';

async function shoot(browser, file, prof, tag) {
  const ctx = await browser.newContext(Object.assign(
    { viewport: prof.viewport, deviceScaleFactor: 2 },
    prof.touch ? { hasTouch: true, isMobile: true } : {}));
  const page = await ctx.newPage();
  await page.goto(file + prof.hash, { waitUntil: 'load' });
  await page.waitForFunction("typeof SCENE!=='undefined' && !!(SCENE.structures && SCENE.structures.length)", null, { timeout: 40000 });
  if (!prof.touch) { await page.click('#enterBtn'); }
  await page.waitForTimeout(2600);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
  await page.evaluate(k => openPanel(k, 0), PLACE);
  await page.waitForTimeout(1200);
  const f = path.join(OUT, `${tag}.${prof.name}.png`);
  await page.locator('#panel').screenshot({ path: f });
  const n = await page.evaluate(() => document.querySelectorAll('#panel button, #panel [onclick]').length);
  console.log(`  ${tag}/${prof.name}: ${f}  (${n} interactive in panel)`);
  await ctx.close();
  return f;
}

const dataUri = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');

(async () => {
  if (!CTRL) { console.error('set CTRL to the pristine artifact URL'); process.exit(2); }
  const browser = await chromium.launch({ executablePath: EXE });
  const made = [];
  for (const prof of PROFILES) {
    const before = await shoot(browser, CTRL, prof, 'before');
    const after = await shoot(browser, LANE, prof, 'after');

    /* The composite. Both panels at their own natural size, side by side,
       captioned, on the map's own parchment so the plates read the way they
       read in the product. */
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#141009;font-family:Georgia,'Times New Roman',serif;padding:26px}
      h1{color:#ecd08a;font-variant:small-caps;letter-spacing:.18em;font-size:22px;font-weight:normal;margin:0 0 4px}
      .sub{color:#a3854a;font-size:13px;margin-bottom:20px;letter-spacing:.04em}
      .pair{display:flex;gap:26px;align-items:flex-start}
      figure{margin:0}
      figcaption{color:#f3e6c8;font-variant:small-caps;letter-spacing:.16em;font-size:15px;margin-bottom:9px}
      figcaption b{color:#8fd06a;font-weight:normal}
      figcaption i{color:#e0a34e;font-style:normal}
      img{display:block;border:1px solid #6b5430;box-shadow:0 8px 26px rgba(0,0,0,.6)}
    </style>
    <h1>W1c &middot; action points in the place panel</h1>
    <div class="sub">${PLACE}, Overview tab, ${prof.name} (${prof.viewport.width}&times;${prof.viewport.height})</div>
    <div class="pair">
      <figure><figcaption><i>before</i> &middot; RSVP 51&times;20</figcaption><img src="${dataUri(before)}"></figure>
      <figure><figcaption><b>after</b> &middot; RSVP 79&times;44</figcaption><img src="${dataUri(after)}"></figure>
    </div>`;
    const cpath = path.join(OUT, `composite.${prof.name}.html`);
    fs.writeFileSync(cpath, html);
    const cctx = await browser.newContext({ viewport: { width: 1500, height: 1400 }, deviceScaleFactor: 1 });
    const cp = await cctx.newPage();
    await cp.goto('file:///' + cpath.replace(/\\/g, '/').replace(/^\//, ''));
    await cp.waitForTimeout(600);
    const cfile = path.join(OUT, `W1c.${prof.name}.before-after.png`);
    await cp.screenshot({ path: cfile, fullPage: true });
    await cctx.close();
    console.log(`COMPOSITE ${prof.name}: ${cfile}`);
    made.push(cfile);
  }
  await browser.close();
  console.log('\n' + made.join('\n'));
})();
