/* _probe_thread_sinks.js — is the stored-XSS in the thread feed one sink or a class?
 *
 * NOT A GATE. This is the measurement behind a report: it plants one scene
 * through restoreScene — the same call the autosave, the draft restore and the
 * shell bridge all make — and then DRIVES each surface that renders a thread,
 * counting injected nodes and executions on the real page.
 *
 *     cd docs/prototypes/qa && source ./env.sh && node _probe_thread_sinks.js
 *
 * ONE SURFACE PER PAGE. Every surface renders every thread, so a marker on the
 * thread cannot say which renderer produced a node once two of them have run;
 * a fresh page per surface makes the count unambiguous. The wait after driving
 * is load-bearing too: onerror is asynchronous and an immediate read reports
 * "nothing executed" over a document full of injected nodes.
 */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE, EXE = process.env.PW_EXE;
if (!FILE || !EXE) { console.log('source ./env.sh first'); process.exit(2) }

const PAY = '<img src="x" data-sink="1" onerror="window.__HIT=(window.__HIT||0)+1">';

/* Each entry drives ONE surface through the app's own opener, never by calling
   the renderer directly. `null` is the control: plant, open nothing. */
const SURFACES = [
  ['(control: nothing opened)', () => { }],
  ['help sheet  #pbAttn -> renderHelp', () => { const b = document.getElementById('pbAttn'); if (b) b.click() }],
  ['place panel Overview  openPanel', () => openPanel('council', 0)],
  ['the Loom  openLoom', () => openLoom()],
  ['a door card  openDoor', () => openDoor('forum', { at: 'council' })],
];

(async () => {
  console.log('artifact: ' + FILE + '\n');
  const browser = await chromium.launch({ executablePath: EXE, args: ['--allow-file-access-from-files'] });
  const rows = [];
  for (const [label, drive] of SURFACES) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(FILE, { waitUntil: 'load' });
    await page.waitForTimeout(2200);
    await page.evaluate(() => { if (typeof leaveIntro === 'function') leaveIntro() });
    await page.waitForTimeout(700);

    await page.evaluate(pay => {
      const J = buildExportJSON();
      J.forum_threads = [{
        id: 'sink-1', title: pay, structure_keys: ['council'], author: pay,
        audience: 'member', replies: pay, last_activity: pay, excerpt: pay,
      }];
      restoreScene(J);
    }, PAY);
    await page.waitForTimeout(400);
    const planted = await page.evaluate(() => SCENE.threads.length === 1 && SCENE.threads[0].replies.indexOf('onerror') >= 0);

    await page.evaluate('(' + drive.toString() + ')()');
    await page.waitForTimeout(1200); /* onerror is async */
    const r = await page.evaluate(() => ({
      nodes: document.querySelectorAll('[data-sink]').length,
      fired: window.__HIT || 0,
    }));
    rows.push({ label, planted, ...r, errs: errs.length });
    await ctx.close();
  }
  await browser.close();

  console.log('planted one hostile thread through restoreScene, then drove one surface per page\n');
  for (const r of rows) {
    console.log('  ' + (r.nodes > 0 ? 'LIVE  ' : 'safe  ') + r.label.padEnd(36)
      + ' injected=' + String(r.nodes).padStart(2)
      + '  onerror fired=' + String(r.fired).padStart(2)
      + '  planted=' + r.planted + (r.errs ? '  pageerrors=' + r.errs : ''));
  }
})().catch(e => { console.log('probe threw: ' + e.message + '\n' + e.stack); process.exit(2) });
