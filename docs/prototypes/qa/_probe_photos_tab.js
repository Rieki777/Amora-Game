/*
 * R5 / PHOTOS - is the Photos tab there, is it PRESSABLE, and does it paint?
 *
 * Written after a sibling lane paid for the lesson: a probe reported an
 * element visible, sized and opaque while `elementFromPoint` handed back the
 * thing covering it, and it found rows crushed below their content while all
 * 34 of its assertions stayed green. So this asks three separate questions
 * and takes a picture, because overlap is not a question elementFromPoint
 * answers on its own.
 *
 *   1. Does the tab row carry Photos, at index 3, with Enter after it?
 *   2. Does a real click at the tab's own centre point land ON the tab, and
 *      does the panel body change to the photo room?
 *   3. Does the room paint what the shell pushed, with the alt text and the
 *      attribution the server built, and does the door to /places exist?
 *
 * Run:  PW_EXE=<chrome> node _probe_photos_tab.js
 */
const { chromium } = require(process.env.PW_LIB || 'playwright');
const path = require('path');

const FILE = 'file:///' + path.resolve(__dirname, '..', 'grounds-v0.html').replace(/\\/g, '/');
const SHOT = process.env.SHOT || '';
let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

(async () => {
  const browser = await chromium.launch(process.env.PW_EXE ? { executablePath: process.env.PW_EXE } : {});
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await page.goto(FILE, { waitUntil: 'load' });
  // Wait for a STATE, not a clock: the scene is what every assertion below
  // needs, and a fixed sleep is what teaches the next session to re-run.
  await page.waitForFunction("typeof SCENE!=='undefined' && Array.isArray(SCENE.structures) && SCENE.structures.length>0", null, { timeout: 20000 });
  await page.waitForTimeout(1200);
  // #introCard covers the whole viewport at rest, so every click below would
  // land on it. The map's own Enter button is the way through, same as the
  // mask lane's probe uses.
  if (await page.evaluate(() => document.body.classList.contains('intro'))) {
    await page.click('#enterBtn').catch(() => {});
    await page.waitForTimeout(1400);
  }

  // The shell's push, exactly as client/src/pages/LivingMap.tsx sends it.
  const key = await page.evaluate(() => (SCENE.structures[0] || {}).key || '');
  ok(!!key, 'the map has at least one place to open (' + key + ')');
  await page.evaluate((k) => {
    window.postMessage({
      type: 'photos',
      places: {
        [k]: [
          { url: '', thumbUrl: '', alt: 'The north wall of the community kitchen, half built', caption: 'First course of block up.', by: 'Photo by Sol Vega, taken March 2026' },
          { url: '', thumbUrl: '', alt: 'The same wall a season later, with the roof trusses up', caption: null, by: 'Photo by Wren Ash, taken July 2026' },
        ],
      },
    }, '*');
  }, key);
  await page.waitForTimeout(400);

  await page.evaluate((k) => window.openPanel(k, 0), key);
  await page.waitForTimeout(1400);

  const labels = await page.evaluate(() => [...document.querySelectorAll('#tabs button')].map((b) => b.textContent));
  ok(labels.length === 5, 'the tab row has five tabs: ' + JSON.stringify(labels));
  ok(labels[3] === 'Photos', 'Photos sits at index 3');
  ok((labels[4] || '').indexOf('Enter') === 0, 'Enter moved to index 4');

  // PRESSABLE, not merely present. elementFromPoint at the tab's own centre.
  const hit = await page.evaluate(() => {
    const b = document.querySelectorAll('#tabs button')[3];
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      w: Math.round(r.width), h: Math.round(r.height),
      onScreen: r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth,
      topIsTab: top === b || b.contains(top),
      topTag: top ? top.tagName + '.' + (top.className || '') : 'nothing',
    };
  });
  ok(hit.w > 0 && hit.h > 0, 'the Photos tab has a real box: ' + hit.w + 'x' + hit.h);
  ok(hit.onScreen, 'the Photos tab is inside the viewport');
  ok(hit.topIsTab, 'a click at its centre lands on the tab, not on ' + hit.topTag);

  await page.click('#tabs button:nth-child(4)');
  await page.waitForTimeout(900);

  const room = await page.evaluate(() => {
    const body = document.getElementById('panelBody');
    const figs = [...body.querySelectorAll('figure')];
    return {
      selected: [...document.querySelectorAll('#tabs button')].findIndex((b) => b.classList.contains('on')),
      figures: figs.length,
      alts: figs.map((f) => (f.querySelector('img') || {}).alt),
      captions: figs.map((f) => (f.querySelector('figcaption') || {}).textContent),
      door: !!body.querySelector('.doorbtn'),
      doorText: (body.querySelector('.doorbtn') || {}).textContent || '',
      // Crushed rows: a figcaption shorter than the text inside it.
      crushed: figs.some((f) => {
        const c = f.querySelector('figcaption');
        return c && c.clientHeight > 0 && c.scrollHeight > c.clientHeight + 2;
      }),
      bodyScrollsSideways: body.scrollWidth > body.clientWidth + 1,
    };
  });
  ok(room.selected === 3, 'the Photos tab is the selected one after the click');
  ok(room.figures === 2, 'both pushed photographs painted (' + room.figures + ')');
  ok(room.alts[0] === 'The north wall of the community kitchen, half built', 'the alt text is the member\'s own words');
  ok(/Photo by Sol Vega, taken March 2026/.test(room.captions[0] || ''), 'the attribution line rides with the picture');
  ok(/First course of block up\./.test(room.captions[0] || ''), 'the caption rides with it too');
  ok(room.door && /Photographs/.test(room.doorText), 'the door to the site gallery is in the room');
  ok(!room.crushed, 'no caption is crushed below its own text');
  ok(!room.bodyScrollsSideways, 'the panel body does not scroll sideways');

  // The empty state is a real state, on a place nobody photographed.
  const other = await page.evaluate(() => (SCENE.structures[1] || {}).key || '');
  if (other) {
    await page.evaluate((k) => window.openPanel(k, 3), other);
    await page.waitForTimeout(700);
    const empty = await page.evaluate(() => document.getElementById('panelBody').textContent);
    ok(/Nobody has photographed this place yet/.test(empty), 'the empty state says so in words');
    ok(/Photographs/.test(empty), 'and still offers the door');
  }

  if (SHOT) {
    await page.evaluate((k) => window.openPanel(k, 3), key);
    await page.waitForTimeout(700);
    await page.screenshot({ path: SHOT });
    console.log('shot: ' + SHOT);
  }

  console.log(fails ? '\nPHOTOS TAB: ' + fails + ' FAILURE(S)' : '\nPHOTOS TAB: ALL GREEN');
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
