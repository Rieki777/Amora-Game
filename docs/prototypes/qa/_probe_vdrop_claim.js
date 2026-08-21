/* _probe_vdrop_claim.js — is the vital dropdown's Claim button a live breakout?
 *
 * NOT THIS LANE'S CODE, and that is why this is a probe and not a gate. #vdrop
 * became a top-band tenant in R15, so this lane read the surface closely and
 * found the button it hangs under building a JS STRING inside an onclick:
 *
 *   onclick="claimQuest('${escq(q2.q)}','…')">⚑ Claim: ${q2.q}</button>
 *
 * escq escapes & < " — NOT the apostrophe — so it is the right tool for the
 * double-quoted attribute and the wrong tool for the single-quoted JS string
 * inside it. And the button's own TEXT takes no escaping at all. Quest titles
 * arrive through the same restoreScene a stranger's village file drives.
 *
 * This measures both, through the real dropdown opened by a real tap. It writes
 * no gate and changes nothing; the number is for whoever owns that surface.
 */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE, EXE = process.env.PW_EXE;

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--allow-file-access-from-files', '--force-device-scale-factor=1'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  await page.evaluate(() => { if (typeof leaveIntro === 'function') leaveIntro() });
  await page.waitForTimeout(900);

  /* Two separate hostile titles so the two defects are told apart:
     BREAK closes the JS string and runs code with no tag at all — escq cannot
     see it. TAG is an element in the button's own unescaped text. */
  const BREAK = "harvest',''),window.__BREAK=1,claimQuest('x";
  const TAG = 'harvest <img src="x" data-xss="questtitle" onerror="window.__TAG=1">';

  const planted = await page.evaluate(([b, t]) => {
    const J = buildExportJSON();
    J.quests = [
      { title: b, structure_key: 'greenhouse', reward: 'r', need: 'n', desc: 'harvest garden seed plant' },
      { title: t, structure_key: 'greenhouse', reward: 'r', need: 'n', desc: 'harvest garden seed plant' },
    ];
    restoreScene(J);
    return { n: SCENE.quests.length, t0: SCENE.quests[0] && SCENE.quests[0].q, exact: SCENE.quests[0] && SCENE.quests[0].q === b };
  }, [BREAK, TAG]);

  /* The real dropdown, opened by a real tap on a real vital. */
  const tgt = await page.evaluate(() => {
    const vs = [...document.querySelectorAll('.vital')];
    const v = vs.find(x => /food|harvest/i.test(x.textContent || '')) || vs[0];
    if (!v) return null; const r = v.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: (v.textContent || '').trim().slice(0, 24) };
  });
  if (tgt) { await page.touchscreen.tap(tgt.x, tgt.y); await page.waitForTimeout(900) }

  const r = await page.evaluate(() => {
    const d = document.getElementById('vdrop');
    const btn = d ? [...d.querySelectorAll('button')].find(b => /Claim/.test(b.textContent || '')) : null;
    return {
      open: !!(d && d.classList.contains('show')),
      claimBtn: !!btn,
      onclickAttr: btn ? btn.getAttribute('onclick') : null,
      injectedInDrop: d ? d.querySelectorAll('[data-xss]').length : -1,
      injectedInDoc: document.querySelectorAll('[data-xss]').length,
      tagFired: typeof window.__TAG === 'undefined' ? null : window.__TAG,
      breakFired: typeof window.__BREAK === 'undefined' ? null : window.__BREAK,
      text: d ? (d.textContent || '').slice(0, 200) : null,
    };
  });

  /* The breakout only runs when the button is pressed, so press it. */
  let afterClick = null;
  if (r.claimBtn) {
    afterClick = await page.evaluate(() => {
      const d = document.getElementById('vdrop');
      const btn = [...d.querySelectorAll('button')].find(b => /Claim/.test(b.textContent || ''));
      let threw = null; try { btn.click() } catch (e) { threw = e.message }
      return { threw, breakFired: typeof window.__BREAK === 'undefined' ? null : window.__BREAK };
    });
  }

  console.log('planted   ' + JSON.stringify(planted));
  console.log('vital     ' + JSON.stringify(tgt));
  console.log('dropdown  ' + JSON.stringify(r, null, 0));
  console.log('on click  ' + JSON.stringify(afterClick));
  console.log('pageerrors ' + (errs.join(' ; ') || 'none'));
  await browser.close();
})().catch(e => { console.log('PROBE THREW: ' + e.message + '\n' + e.stack); process.exit(2) });
