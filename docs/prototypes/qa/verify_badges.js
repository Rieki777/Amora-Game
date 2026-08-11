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

  /* ---------- P3: calm by default, loud only when asked ---------- */
  const calm = await page.evaluate(async () => {
    document.getElementById('panelClose').click(); closeDoor();
    __near();
    const idle = getComputedStyle(document.querySelector('#badges .bgroup.on')).opacity;
    featureOne(); const one = document.querySelectorAll('.bseal.featured').length;
    featureOne(); const still = document.querySelectorAll('.bseal.featured').length;
    /* seeded, so the same land breathes in the same order on every load */
    const seen = []; for (let i = 0; i < 6; i++) { featureOne(); const f = document.querySelector('.featured'); seen.push(f ? f.dataset.bk + ':' + f.dataset.bkind : '-'); }
    const lantern = [...document.querySelectorAll('.bseal.featured')].some(s => /ev-u/.test(s.className));
    return { idle, one, still, seen, lantern };
  });
  ok(calm.idle === '0.6', `P3: marks idle at sixty per cent (${calm.idle})`);
  ok(calm.one === 1 && calm.still === 1, `P3: exactly one mark breathes at a time (${calm.one}, then ${calm.still})`);
  ok(!calm.lantern, 'P3: a lantern is never the featured one, it already keeps its own time');

  const filt = await page.evaluate(async () => {
    document.getElementById('attnBtn').click();
    await new Promise(r => setTimeout(r, 700)); // the seals cross-fade over .2s, and refreshBadges can restart it
    const dim = getComputedStyle([...document.querySelectorAll('.bseal.b-talk')].find(s => getComputedStyle(s).display !== 'none')).opacity;
    const lit = getComputedStyle([...document.querySelectorAll('.bseal.b-quest')].find(s => getComputedStyle(s).display !== 'none')).opacity;
    const feat = document.querySelectorAll('.featured').length;
    document.getElementById('attnCard').classList.remove('show');
    badgeIntent('event', 1400);
    await new Promise(r => setTimeout(r, 700));
    const ev = getComputedStyle([...document.querySelectorAll('.bseal.b-event')].find(s => getComputedStyle(s).display !== 'none')).opacity;
    const q2 = getComputedStyle([...document.querySelectorAll('.bseal.b-quest')].find(s => getComputedStyle(s).display !== 'none')).opacity;
    await new Promise(r => setTimeout(r, 1100));
    const after = document.body.className;
    return { dim, lit, feat, ev, q2, after };
  });
  ok(+filt.lit === 1 && +filt.dim < 0.3, `P3: "What needs hands" lights the work and steps the rest back (${filt.lit} vs ${filt.dim})`);
  ok(filt.feat === 0, 'P3: the breathing mark stands down while an intent is speaking');
  ok(+filt.ev === 1 && +filt.q2 < 0.3, `P3: the Events door does the same for the lanterns (${filt.ev} vs ${filt.q2})`);
  ok(!/bfilter|f-quest|f-event/.test(filt.after), 'P3: and the land goes quiet again on its own');

  /* A ring is solved against ONE building, its own (patch_e2_ring). Nothing
     collapses because a neighbour crowded it, so this asserts the absence of
     the solver that used to do that: at the near camera every visible ring
     carries its own marks. Before the change, 7 of 19 did not. */
  const own = await page.evaluate(() => {
    __near();
    const vis = [...document.querySelectorAll('#badges .bgroup')]
      .filter(g => g._on && g.classList.contains('on'));
    return { visible: vis.length, clustered: vis.filter(g => g.classList.contains('clustered')).length };
  });
  ok(own.visible > 0 && own.clustered === 0,
    `P3: no ring is collapsed by its neighbours (${own.clustered} of ${own.visible} clustered)`);

  const fan = await page.evaluate(async () => {
    __near();
    /* THE PREMISE CHANGED WITH patch_e2_ring. This used to hunt for whichever
       ring had collapsed because its NEIGHBOURS crowded it, which made the
       check depend on an accident of layout and which stops happening once
       rings are told not to place each other. The fan belongs to a ring that
       cannot fit its OWN marks, so the check now makes one: shrink a building
       carrying several kinds until its own ring no longer fits. Deterministic,
       and it is the only reason a counted seal exists now. */
    const s = SCENE.structures.find(x => {
      const g = bgEls[x.key];
      return g && g._on && (g.dataset.kinds || '').split(',').filter(Boolean).length >= 2;
    });
    const was = s.scale || 1;
    s.scale = 0.3; __near();
    const key = s.key, g = bgEls[key], more = g.querySelector('.b-more');
    const clustered = g.classList.contains('clustered') && getComputedStyle(more).display !== 'none';
    const seen = () => [...g.querySelectorAll('.bseal:not(.b-more)')]
      .filter(x => getComputedStyle(x).display !== 'none').length;
    const before = seen();
    more.click(); await new Promise(r => setTimeout(r, 500)); syncBanners();
    const after = seen();
    const marks = [...g.querySelectorAll('.bseal:not(.b-more)')].map(x => x.getBoundingClientRect());
    let touch = 0;
    for (let i = 0; i < marks.length; i++) for (let j = i + 1; j < marks.length; j++)
      if (Math.hypot(marks[i].x - marks[j].x, marks[i].y - marks[j].y) < 43.5) touch++;
    const out = { key, clustered, before, after, fanned: g.classList.contains('fanned'), touch,
      moreHidden: getComputedStyle(g.querySelector('.b-more')).display === 'none' };
    s.scale = was; __near(); // leave the land as it was found
    return out;
  });
  ok(fan.clustered, `P3: a ring that cannot fit its own marks collapses to one counted seal (${fan.key})`);
  ok(fan.before === 0 && fan.after >= 2 && fan.fanned && fan.moreHidden,
    `P3: a counted seal opens into the ring it stood for (${fan.key}: ${fan.before} to ${fan.after})`);
  ok(fan.touch === 0, `P3: and the fanned marks still do not touch (${fan.touch})`);

  const walkGate = await page.evaluate(() => {
    const w4 = (window.WALK_SEED || []).find(s => s.id === 'w4');
    __near();
    window.WGATE = {};
    const seal = [...document.querySelectorAll('.bseal.b-quest')].find(s => getComputedStyle(s).display !== 'none');
    seal.click();
    const got = !!WGATE.badge;
    document.getElementById('panelClose').click();
    return { gesture: w4 && w4.gesture, hint: w4 && w4.gate_hint, got };
  });
  ok(walkGate.gesture === 'badge' && /leaf-pennant/.test(walkGate.hint || ''),
    `P3: the Greenhouse beat waits for a badge (${walkGate.gesture}: ${walkGate.hint})`);
  ok(walkGate.got, 'P3: and a real badge tap is what opens it');

  const pfan = await (async () => {
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3 });
    const pp = await pctx.newPage();
    const pe = []; pp.on('pageerror', e => pe.push(String(e)));
    await pp.goto(FILE + '#hud=pocket'); await pp.waitForTimeout(1600);
    if (await pp.evaluate(() => document.body.classList.contains('intro'))) await pp.click('#enterBtn');
    await pp.waitForTimeout(2400);
    const r = await pp.evaluate(async () => {
      cam.z = 1.7; clampCam(); refreshBadges(); syncBanners(); syncBanners();
      const key = SCENE.structures.find(s => bgEls[s.key] && bgEls[s.key].classList.contains('on')
        && bgEls[s.key].querySelectorAll('.bseal:not(.b-more)').length >= 2).key;
      document.getElementById('panel').classList.remove('open'); panelKey = null;
      pEls[key].click(); await new Promise(z => setTimeout(z, 350)); syncBanners();
      const first = { panel: panelKey, fanned: bgEls[key].classList.contains('fanned') };
      pEls[key].click(); await new Promise(z => setTimeout(z, 450));
      return { key, first, panel: panelKey };
    });
    await pctx.close();
    return { ...r, perr: pe.length };
  })();
  ok(pfan.first.panel === null && pfan.first.fanned && pfan.panel === pfan.key && pfan.perr === 0,
    `P3: in the pocket a crowded building fans first and opens on the next tap (${pfan.key})`);

  /* ---------- P4: the founder's word, and what leaves the map ---------- */
  const toggle = await page.evaluate(async () => {
    document.getElementById('panelClose').click(); closeDoor();
    document.getElementById('buildBtn').click();
    await new Promise(r => setTimeout(r, 250));
    const key = SCENE.structures.find(s => threadsAt(s.key).length && questsAt(s.key).length).key;
    openInspect(key); await new Promise(r => setTimeout(r, 350));
    const chips = [...document.querySelectorAll('[data-bkt]')].map(b => b.dataset.bkt + (b.classList.contains('on') ? '+' : '-'));
    document.querySelector('[data-bkt="talk"]').click();
    await new Promise(r => setTimeout(r, 250));
    __near();
    const after = { silenced: !!(BY[key].badges && BY[key].badges.talk === 0),
      mark: !!bgEls[key].querySelector('.b-talk'),
      list: threadsAt(key).length, // the lists never lose anything, only the land does
      audit: EDITS.some(e => e.action === 'badges'),
      exported: (buildExportJSON().map_structures.find(r => r.key === key).bindings.badges || []).map(b => b.kind + ':' + b.show).join(','),
      seal: (bgEls[key].querySelector('.aseal') || {}).textContent };
    return { key, chips, after };
  });
  ok(toggle.chips.length === 4 && toggle.chips.every(c => /\+$/.test(c)),
    `P4: every kind shows until a founder says otherwise (${toggle.chips.join(' ')})`);
  ok(toggle.after.silenced && !toggle.after.mark && toggle.after.list > 0,
    `P4: silencing a kind takes it off the land and leaves the list alone (${toggle.key}: ${toggle.after.list} conversations still there)`);
  ok(toggle.after.audit && toggle.after.exported === 'talk:false',
    `P4: audited and exported as a deliberate silence (${toggle.after.exported})`);

  const weight = await page.evaluate(async () => {
    const key = 'greenhouse';
    openInspect(key); await new Promise(r => setTimeout(r, 300));
    const sel = document.querySelector('[data-qw]'); const qi = +sel.dataset.qw;
    const derived = badgeWeight(SCENE.quests[qi]);
    sel.value = derived === 3 ? '1' : '3'; sel.dispatchEvent(new Event('change'));
    await new Promise(r => setTimeout(r, 300)); __near();
    const q = SCENE.quests[qi];
    const pips = (bgEls[q.at] && bgEls[q.at].querySelector('.b-quest')) ? bgEls[q.at].querySelectorAll('.b-quest .pip').length : -1;
    const exp = buildExportJSON().quests.find(x => x.title === q.q).weight;
    return { derived, set: q.weight, pips, exp, at: q.at, audit: EDITS.some(e => e.action === 'quest-weight'),
      hasOption: /read from the words/.test(sel.textContent) };
  });
  ok(weight.hasOption && weight.set !== weight.derived, `P4: a founder can overrule the words (${weight.derived} to ${weight.set})`);
  ok(weight.pips === weight.set && weight.exp === weight.set && weight.audit,
    `P4: and the pips, the audit and the export all follow (${weight.pips} pips, exported ${weight.exp})`);

  const round = await page.evaluate(async () => {
    const J = buildExportJSON();
    const key = SCENE.structures.find(s => s.badges).key;
    const qw = SCENE.quests.find(q => q.weight);
    const before = { badges: JSON.stringify(BY[key].badges), weight: qw.weight, title: qw.q };
    restoreScene(JSON.parse(JSON.stringify(J)));
    await new Promise(r => setTimeout(r, 400)); __near();
    const q2 = SCENE.quests.find(q => q.q === before.title);
    return { before, after: { badges: JSON.stringify(BY[key] && BY[key].badges), weight: q2 && q2.weight },
      mark: !!(bgEls[key] && bgEls[key].querySelector('.b-talk')) };
  });
  ok(round.after.badges === round.before.badges && !round.mark,
    `P4: the silence survives a restore (${round.after.badges})`);
  ok(round.after.weight === round.before.weight, `P4: so does the founder's weight (${round.after.weight})`);
  await page.evaluate(() => { closeInspect(); document.getElementById('buildBtn').click(); });

  ok(perr.length === 0, `zero page errors (${perr.length})${perr.length ? ' — ' + perr[0] : ''}`);
  ok(cerr.length === 0, `zero console errors (${cerr.length})${cerr.length ? ' — ' + cerr[0] : ''}`);
  console.log(fails === 0 ? 'BADGES: ALL GREEN' : `BADGES: ${fails} FAILURES`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
