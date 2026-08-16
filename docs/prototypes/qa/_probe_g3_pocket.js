/* L3: the same four things on the pocket profile.
   hasTouch ALONE, never isMobile: a 390x844 isMobile context on this Chromium
   reports innerWidth 1560, and the profile rule at :5448-5450 reads innerWidth,
   so isMobile flips the answer to 'desk' as a harness artifact. */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true })).newPage();
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(process.env.GROUNDS_FILE);
  await p.waitForFunction("typeof SCENE!=='undefined'");
  const boot = await p.evaluate(() => ({ profile: window.HUD_PROFILE, body: document.body.className, iw: innerWidth, vv: visualViewport && Math.round(visualViewport.width) }));
  // on this profile the intro card is already gone by the time the scene boots,
  // so the tap is conditional rather than assumed
  if (await p.locator('#enterBtn').count()) { await p.tap('#enterBtn'); }
  await p.waitForTimeout(2600);
  await p.evaluate(() => { if (!document.body.classList.contains('build')) $('buildBtn').click(); });
  await p.waitForTimeout(500);
  await p.evaluate(() => openInspect('ridgeA')); await p.waitForTimeout(700);

  const panel = await p.evaluate(() => {
    const R = e => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) }; };
    return { inspect: R(document.getElementById('inspect')), body: R(document.getElementById('inspBody')),
      lbButtons: document.querySelectorAll('#inspect .insp-lb-btn').length,
      nativeVisible: [...document.querySelectorAll('#inspect select')].filter(s => +getComputedStyle(s).opacity > 0).length,
      helpLines: document.querySelectorAll('#inspect .insp-help').length,
      homes: !!document.querySelector('#iHomesTotal') };
  });

  // tap the activity control and read the list
  await p.evaluate(() => { const b2 = document.querySelector('#iAct ~ .insp-lb-btn'); if (b2) b2.scrollIntoView({ block: 'center' }); });
  await p.waitForTimeout(400);
  await p.tap('#iAct ~ .insp-lb-btn');
  await p.waitForTimeout(350);
  const open = await p.evaluate(() => {
    const l = document.querySelector('body > .insp-lb-list.open');
    const r = l && l.getBoundingClientRect();
    return { open: !!l, z: l ? getComputedStyle(l).zIndex : null,
      rect: r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) } : null,
      insideViewport: r ? (r.left >= 0 && r.top >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1) : null,
      options: l ? [...l.querySelectorAll('[role=option]')].map(o => o.dataset.v) : [] };
  });
  // tap the second option
  if (open.open) { await p.tap('body > .insp-lb-list.open [role=option]:nth-child(2)'); await p.waitForTimeout(500); }
  const after = await p.evaluate(() => ({ act: BY['ridgeA'].act || 'steady', state: BY['ridgeA'].state,
    listsLeft: document.querySelectorAll('body > .insp-lb-list').length,
    inspectOpen: document.getElementById('inspect').classList.contains('open') }));

  console.log(JSON.stringify({ boot, panel, open, after, pageerrors: perr.length, perr: perr.slice(0, 3) }, null, 1));
  await b.close();
})().catch(e => { console.error('POCKET PROBE FAILED', e); process.exit(1); });
