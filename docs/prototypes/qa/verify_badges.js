/* The badge language, verified against the artifact's own projections.
   D9 holds: nothing here is stored, so every check reads questsAt/seatsAt/
   eventsAt/threadsAt and asks whether the marks agree with them. */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE || 'file:///root/amora/work/grounds-v0.html';
const EXE = process.env.PW_EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

const NEAR = () => { cam.z = 1.7; cam.x = 1240; cam.y = 700; clampCam(); refreshBadges(); syncBanners(); syncBanners(); };

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1180 } });
  const page = await ctx.newPage();
  const perr = [], cerr = [];
  page.on('pageerror', e => perr.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') cerr.push(m.text()); });
  await page.goto(FILE); await page.waitForTimeout(1100);
  await page.click('#enterBtn'); await page.waitForTimeout(2600);
  await page.evaluate(() => { window.__near = () => { cam.z = 1.7; cam.x = 1240; cam.y = 700; clampCam(); refreshBadges(); syncBanners(); syncBanners(); }; });

  /* ---------- P1: the marks are the projections ---------- */
  const p1 = await page.evaluate(() => {
    __near();
    const wrong = [];
    for (const s of SCENE.structures) {
      const g = bgEls[s.key]; if (!g || !g.classList.contains('on')) continue;
      const want = [];
      if (questsAt(s.key).length) want.push('quest'); else want.push('invite');
      if (seatsAt(s.key).length) want.push('seat');
      if (threadsAt(s.key).length) want.push('talk');
      if (eventsAt(s.key).length) want.push('event');
      const got = [...g.querySelectorAll('.bseal:not(.b-more)')].map(x => x.dataset.bkind);
      if (want.sort().join(',') !== got.sort().join(',')) wrong.push({ k: s.key, want, got });
    }
    return { wrong, lit: document.querySelectorAll('.bgroup.on').length };
  });
  ok(p1.wrong.length === 0 && p1.lit > 10,
    `P1: every building wears exactly the marks its lists justify (${p1.lit} lit, ${p1.wrong.length} wrong${p1.wrong.length ? ': ' + JSON.stringify(p1.wrong[0]) : ''})`);

  const p1b = await page.evaluate(() => {
    __near();
    const q = SCENE.quests.find(x => x.at && questsAt(x.at)[0] === x && x.addr === 'resolver-guess');
    const g = q ? bgEls[q.at] : null;
    const seal = g ? g.querySelector('.b-quest') : null;
    const anySkill = [...document.querySelectorAll('.b-quest')].some(s => s.classList.contains('r-braid'));
    const pips = [...document.querySelectorAll('.b-quest')].map(s => s.querySelectorAll('.pip').length).filter(n => n > 0);
    return { amber: !!(seal && seal.classList.contains('r-amber')), at: q && q.at, anySkill,
      pipMin: Math.min(...pips), pipMax: Math.max(...pips),
      openSeat: !!document.querySelector('.b-seat.r-open'), soft: !!document.querySelector('.b-talk.r-soft') };
  });
  ok(p1b.amber, `P1: an unapproved address wears the amber rim (${p1b.at})`);
  ok(p1b.openSeat && p1b.soft, 'P1: a seat still open is dashed, a conversation is soft');
  ok(p1b.pipMin >= 1 && p1b.pipMax <= 3, `P1: weight reads one to three pips (${p1b.pipMin}..${p1b.pipMax})`);

  const gate = await page.evaluate(() => {
    cam.z = 0.8; clampCam(); syncBanners();
    const off = document.querySelectorAll('.bgroup.on').length;
    cam.z = 1.7; clampCam(); syncBanners();
    return { off, on: document.querySelectorAll('.bgroup.on').length };
  });
  ok(gate.off === 0 && gate.on > 10, `P1: the zoom gate holds (${gate.off} lit at 0.8, ${gate.on} at 1.7)`);

  /* ---------- P2: every mark is a door with an address ---------- */
  const quest = await page.evaluate(async () => {
    __near();
    const seal = [...document.querySelectorAll('.bseal.b-quest')].find(s => getComputedStyle(s).display !== 'none');
    const key = seal.dataset.bk; seal.click();
    await new Promise(r => setTimeout(r, 700));
    const f = document.querySelector('.itemfocus');
    return { key, hash: location.hash, focus: f ? f.dataset.item : null,
      tab: [...document.getElementById('tabs').children].findIndex(x => x.classList.contains('on')),
      claim: !!(f && f.querySelector('.claim button')), want: itemAddr('quest', questsAt(key)[0]) };
  });
  ok(quest.tab === 1 && quest.focus === quest.want, `P2: a leaf-pennant opens its own quest, lit (${quest.focus})`);
  ok(quest.hash === `#/place/${quest.key}?item=${quest.want}`, `P2: and the address says which one (${quest.hash})`);
  ok(quest.claim, 'P2: the card it lands on carries the claim');

  const cold = await (async () => {
    await page.goto(FILE + quest.hash); await page.waitForTimeout(1500);
    return page.evaluate(() => ({ panel: panelKey, tab: [...document.getElementById('tabs').children].findIndex(x => x.classList.contains('on')),
      focus: (document.querySelector('.itemfocus') || {}).dataset ? document.querySelector('.itemfocus').dataset.item : null,
      intro: document.body.classList.contains('intro') }));
  })();
  ok(!cold.intro && cold.panel === quest.key && cold.tab === 1 && cold.focus === quest.want,
    `P2: the same address, arrived at cold, lands on the same card (${cold.focus})`);
  await page.waitForTimeout(200);

  const kinds = await page.evaluate(async () => {
    const out = {};
    const tap = async k => {
      document.getElementById('panelClose').click(); closeDoor();
      __near();
      const s = [...document.querySelectorAll('.bseal.b-' + k)].find(x => getComputedStyle(x).display !== 'none');
      if (!s) return null;
      s.click(); await new Promise(z => setTimeout(z, 600));
      const f = document.querySelector('.itemfocus');
      return { bk: s.dataset.bk, hash: location.hash, focus: f ? f.dataset.item : null,
        tab: [...document.getElementById('tabs').children].findIndex(x => x.classList.contains('on')),
        card: document.getElementById('module').classList.contains('show') ? document.getElementById('moduleCard').textContent : '',
        resolver: document.getElementById('resolver').classList.contains('show'), home: window._rqHome || null };
    };
    out.seat = await tap('seat'); out.event = await tap('event'); out.talk = await tap('talk'); out.invite = await tap('invite');
    document.getElementById('resolverClose').click(); closeDoor();
    return out;
  });
  ok(kinds.seat.tab === 2 && /^seat:/.test(kinds.seat.focus || ''), `P2: a raised hand opens the seat it stands for (${kinds.seat.focus})`);
  ok(kinds.event.tab === 0 && /^event:/.test(kinds.event.focus || ''), `P2: a star opens the event card (${kinds.event.focus})`);
  ok(/Forum/.test(kinds.talk.card) && new RegExp(kinds.talk.bk === 'gate' ? 'Gate' : '.').test(kinds.talk.card),
    `P2: a rising curl opens the conversations pinned to that place (${kinds.talk.bk})`);
  ok(kinds.invite.resolver && kinds.invite.home === kinds.invite.bk,
    `P2: the seed opens the resolver with this place already chosen (${kinds.invite.home})`);

  const made = await page.evaluate(async () => {
    const key = 'ponds', n0 = SCENE.quests.length;
    inviteHere(key);
    document.getElementById('rqText').value = 'rake the far path';
    renderResolver();
    const shown = document.getElementById('rqSteps').textContent;
    resolverCreate();
    const q = SCENE.quests[SCENE.quests.length - 1];
    document.getElementById('resolverClose').click();
    return { n0, n1: SCENE.quests.length, at: q.at, addr: q.addr, shown: /your hand/.test(shown),
      audited: EDITS.some(e => e.action === 'quest-add') };
  });
  ok(made.n1 === made.n0 + 1 && made.at === 'ponds' && made.addr === 'creator' && made.shown && made.audited,
    `P2: a quest written from the seed lands where the hand chose it, as the creator's word (${made.at}, ${made.addr})`);

  const pocket = await (async () => {
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3 });
    const pp = await pctx.newPage();
    const pe = []; pp.on('pageerror', e => pe.push(String(e)));
    await pp.goto(FILE + '#hud=pocket'); await pp.waitForTimeout(1600);
    if (await pp.evaluate(() => document.body.classList.contains('intro'))) await pp.click('#enterBtn');
    await pp.waitForTimeout(2400);
    const r = await pp.evaluate(async () => {
      const key = SCENE.structures.find(s => questsAt(s.key).length === 0 && s.state !== 'blueprint').key;
      inviteHere(key); await new Promise(z => setTimeout(z, 300));
      const c = document.getElementById('moduleCard');
      return { open: document.getElementById('module').classList.contains('show'), txt: c.textContent,
        href: (c.querySelector('a.btn') || {}).getAttribute ? c.querySelector('a.btn').getAttribute('href') : '' };
    });
    await pctx.close();
    return { ...r, perr: pe.length };
  })();
  ok(pocket.open && /This place has room for work\./.test(pocket.txt) && /\/propose-quest/.test(pocket.href) && pocket.perr === 0,
    'P2: in the pocket the seed opens a sheet to the proposal page');

  ok(perr.length === 0, `zero page errors (${perr.length})${perr.length ? ' — ' + perr[0] : ''}`);
  ok(cerr.length === 0, `zero console errors (${cerr.length})${cerr.length ? ' — ' + cerr[0] : ''}`);
  console.log(fails === 0 ? 'BADGES: ALL GREEN' : `BADGES: ${fails} FAILURES`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
