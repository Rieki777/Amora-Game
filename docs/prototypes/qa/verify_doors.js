/* Session 6 verification — module doors, dock, hash deep-links, journey walks, Make-This-Yours skin step. */
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = process.env.GROUNDS_FILE || 'file:///root/amora/work/grounds-v0.html';
const EXE = process.env.PW_EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

/*
 * Wait for a STATE, not a clock.
 *
 * Every gate in this directory sleeps a fixed number of milliseconds after
 * boot, and this one then asserts a deep link has landed. On 2026-08-10 that
 * assertion failed once on a cold page in a fresh directory and passed three
 * times afterwards on the same bytes, which is the signature of a boot that
 * occasionally takes longer than the sleep rather than of a bug in the map.
 *
 * A gate that fails intermittently costs more than the bug it guards, because
 * it teaches the next session to re-run instead of read. This returns whether
 * the condition arrived rather than throwing, so a genuine failure still
 * prints as a FAIL with its detail instead of a Playwright timeout stack.
 */
async function until(page, fn, ms = 15000) {
  try { await page.waitForFunction(fn, undefined, { timeout: ms, polling: 100 }); return true; }
  catch (_) { return false; }
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1180 } });
  const page = await ctx.newPage();
  const perr = [], cerr = [];
  page.on('pageerror', e => perr.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') cerr.push(m.text()); });

  /* ---------- A. deep-link boot: #/place/kitchen enters straight onto the land ---------- */
  await page.goto(FILE + '#/place/kitchen');
  await until(page, () => typeof panelKey !== 'undefined' && panelKey === 'kitchen'
    && !document.body.classList.contains('intro'));
  await page.waitForTimeout(300); // the panel is open; let it finish drawing before reading it
  const deep = await page.evaluate(() => ({
    intro: document.body.classList.contains('intro'),
    panel: panelKey, hash: location.hash
  }));
  ok(!deep.intro && deep.panel === 'kitchen', `#/place/kitchen deep-link lands with the panel open (intro=${deep.intro}, panel=${deep.panel})`);
  await page.click('#panelClose'); await page.waitForTimeout(300);
  const cleared = await page.evaluate(() => location.hash || '(clean)');
  ok(cleared === '(clean)' || cleared === '', 'closing the panel clears the address');

  /* ---------- B. approved wiring landed as the creator's word ---------- */
  const wir = await page.evaluate(() => {
    const q = t => SCENE.quests.find(x => x.q === t);
    const r = t => SCENE.seats.find(x => x.s === t);
    const T = loomTable(); const n = { creator: 0, resolver: 0, pool: 0 };
    T.forEach(x => n[x.prov]++);
    return {
      garden: q('Garden Helper'), trail: q('Trail Builder'), retreat: q('Retreat Host'), event: q('Event Coordinator'),
      arch: r('Architect'), eng: r('Civil & Sustainability Engineer'),
      j4s1: SCENE.journeys.find(j => j.id === 'j4').steps[0], n, total: T.length
    };
  });
  ok(wir.garden.at === 'greenhouse' && wir.garden.addr === 'resolver-guess', 'Garden Helper → Greenhouse, amber (unapproved suggestion)');
  ok(wir.trail.at === 'trailhead' && wir.trail.addr === 'resolver-guess', 'Trail Builder → Pacific Trailhead, amber (unapproved)');
  ok(wir.retreat.at === 'guest' && wir.event.at === 'kitchen', 'Retreat Host → Guest Lodge · Event Coordinator → Kitchen');
  ok(wir.arch.at === 'ridgeA' && wir.eng.at === 'tank', 'Architect → Ridge Hamlet · Engineer → Water Tank');
  ok(wir.j4s1.at === 'gate' && wir.j4s1.addr === 'resolver-guess', 'Investor step 1 → the Gate, amber (yours to drag)');
  ok(wir.n.pool <= 4, `pool shrinks to ${wir.n.pool} (was 17) — the land is wired`);

  /* ---------- C. the dock and the Exchange ---------- */
  const dockN = await page.evaluate(() => document.querySelectorAll('#dock button').length);
  ok(dockN === 7, `dock renders ${dockN} module doors at the map top`);
  await page.click('#dock button[data-m="wallet"]'); await page.waitForTimeout(400);
  const ex = await page.evaluate(() => ({
    open: document.getElementById('module').classList.contains('show'),
    h: document.getElementById('moduleCard').textContent,
    link: (document.querySelector('#moduleCard a.btn') || {}).href || '',
    hash: location.hash
  }));
  ok(ex.open && /The Exchange/.test(ex.h) && /Gratitude/.test(ex.h), 'Exchange sheet opens from the dock with the one-ledger sample');
  ok(ex.link === 'https://amora.regencivics.earth/wallet', `door deep-links to the live site (${ex.link})`);
  ok(ex.hash === '#/module/wallet', 'module gets an address');
  await page.evaluate(() => closeDoor()); await page.waitForTimeout(200);

  /* ---------- D. doors on the land: book / reserve / materials ---------- */
  const door = async (key, reCta, reSheet) => {
    await page.evaluate(k => openPanel(k), key); await page.waitForTimeout(700);
    const cta = await page.evaluate(re => {
      const b = [...document.querySelectorAll('#panel .doorcta')].find(x => new RegExp(re).test(x.textContent));
      return b ? b.textContent.trim() : null;
    }, reCta);
    if (!cta) { ok(false, `${key}: door CTA /${reCta}/ missing`); return; }
    await page.evaluate(re => {
      [...document.querySelectorAll('#panel .doorcta')].find(x => new RegExp(re).test(x.textContent)).click();
    }, reCta); await page.waitForTimeout(400);
    const sh = await page.evaluate(() => document.getElementById('moduleCard').textContent);
    ok(new RegExp(reSheet).test(sh), `${key}: “${cta}” → sheet (${reSheet})`);
    await page.evaluate(() => closeDoor());
    await page.evaluate(() => { document.getElementById('panel').classList.remove('open'); panelKey = null; });
  };
  await door('guest', 'Book a room', 'booking at Guest Lodge');
  await door('sanctuary', 'when built', "bookable when it's built");
  await door('ridgeA', 'Reserve a home', 'Ridge Hamlet North');
  await door('library', 'Material Library', 'Borrow quote');
  await door('market', 'Open the Exchange', 'Gratitude');

  /* ---------- E. founder door toggles in the inspect card ---------- */
  await page.click('#buildBtn'); await page.waitForTimeout(400);
  await page.evaluate(() => openInspect('kitchen')); await page.waitForTimeout(400);
  await page.click('.dchip[data-dk="stay"]'); await page.waitForTimeout(350);
  const t1 = await page.evaluate(() => ({ d: BY.kitchen.doors, e: EDITS.filter(x => x.action === 'doors').length }));
  ok(t1.d && t1.d.stay === 1 && t1.e >= 1, 'door toggle ON — audited');
  await page.click('.dchip[data-dk="stay"]'); await page.waitForTimeout(350);
  const t2 = await page.evaluate(() => BY.kitchen.doors && BY.kitchen.doors.stay);
  ok(t2 === 'future', 'second click → “when built”');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  await page.click('#buildBtn'); await page.waitForTimeout(300);

  /* ---------- F. the Make-This-Yours skin step ---------- */
  await page.evaluate(() => openSkin()); await page.waitForTimeout(300);
  await page.$eval('#skAccent', el => { el.value = '#ff2200'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.$eval('#skLbl', el => { el.value = 120; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForTimeout(200);
  const sk1 = await page.evaluate(() => ({
    acc: getComputedStyle(document.documentElement).getPropertyValue('--t-accent').trim(),
    lbl: getComputedStyle(document.documentElement).getPropertyValue('--lblScale').trim()
  }));
  ok(sk1.acc === '#ff2200' && sk1.lbl === '1.2', `skin retints live (accent ${sk1.acc}, labels ×${sk1.lbl})`);
  await page.evaluate(() => { document.querySelector('#skTheme .swb[data-t="Terra Sol"]').click(); });
  await page.waitForTimeout(200);
  const sk2 = await page.evaluate(() => ({ th: THEME.label, acc: getComputedStyle(document.documentElement).getPropertyValue('--t-accent').trim() }));
  ok(sk2.th === 'Terra Sol' && sk2.acc === '#ff2200', 'theme swap keeps the founder accent override');
  await page.click('#skSave'); await page.waitForTimeout(200);
  const sk3 = await page.evaluate(() => {
    const e = EDITS.filter(x => x.action === 'skin');
    const J = buildExportJSON();
    return { n: e.length, exp: J.map_scene.art_manifest.skin, mods: J.map_scene.modules.length,
      guestDoors: J.map_structures.find(s => s.key === 'guest').bindings.action_doors,
      sancDoors: J.map_structures.find(s => s.key === 'sanctuary').bindings.action_doors };
  });
  ok(sk3.n >= 1 && sk3.exp.accent === '#ff2200' && sk3.exp.theme === 'Terra Sol', 'skin saves + exports as art_manifest.skin');
  ok(sk3.mods === 10, `modules registry exports (${sk3.mods} modules with live routes)`);
  ok(sk3.guestDoors.length === 1 && sk3.guestDoors[0].route === '/stay' && sk3.guestDoors[0].state === 'open', 'Guest Lodge exports its stay door');
  ok(sk3.sancDoors[0].state === 'when-built', 'Sanctuary exports “when-built”');
  await page.click('#skClose');

  /* ---------- G. journey walk ---------- */
  await page.evaluate(() => playJourney('j1')); await page.waitForTimeout(700);
  const jw = await page.evaluate(() => ({ w: !!JWALK, t: !!travel, hash: location.hash }));
  ok(jw.w && jw.hash === '#/journey/j1', 'the Welcome Walk walks — camera travelling, address set');
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  const jw2 = await page.evaluate(() => !JWALK);
  ok(jw2, 'Esc ends the walk');

  /* ---------- H. autosave → restore: doors + skin survive ---------- */
  await page.waitForTimeout(3300);
  await page.goto(FILE); await page.waitForTimeout(1000);
  await page.click('#enterBtn'); await page.waitForTimeout(700);
  const bar = await page.evaluate(() => document.getElementById('restoreBar').style.display !== 'none');
  ok(bar, 'autosaved profile offered on return');
  if (bar) { await page.click('#restoreYes'); await page.waitForTimeout(1000); }
  const back = await page.evaluate(() => ({
    kd: BY.kitchen.doors && BY.kitchen.doors.stay,
    gd: BY.guest.doors && BY.guest.doors.stay,
    acc: getComputedStyle(document.documentElement).getPropertyValue('--t-accent').trim(),
    th: THEME.label,
    garden: SCENE.quests.find(q => q.q === 'Garden Helper').addr
  }));
  ok(back.kd === 'future' && back.gd === 1, 'door states survive restore');
  ok(back.acc === '#ff2200' && back.th === 'Terra Sol', 'the founder skin survives restore');
  ok(back.garden === 'resolver-guess', 'suggested (amber) wiring survives restore — still unapproved');

  /* ---------- I. map-type selector + the Circles org map ---------- */
  const selN = await page.evaluate(() => document.querySelectorAll('#mapSel button').length);
  ok(selN === 2, 'map-type selector renders at the top (Living Map | Circles)');
  const defLiving = await page.evaluate(() => document.getElementById('msLiving').classList.contains('on') && !document.body.classList.contains('circles'));
  ok(defLiving, 'defaults to the Living Map');
  await page.click('#msCircles'); await page.waitForTimeout(500);
  const org = await page.evaluate(() => ({
    on: document.body.classList.contains('circles'), hash: location.hash,
    nodes: document.querySelectorAll('#orgSvg .onode').length,
    roles: document.querySelectorAll('#orgSvg .orole').length,
    quests: document.querySelectorAll('#orgSvg .oquest').length,
    nSeats: SCENE.seats.length
  }));
  ok(org.on && org.hash === '#/circles', 'Circles map opens with its own address');
  ok(org.nodes >= 13 && org.roles === org.nSeats, `org chart draws 11 circles + village + ${org.roles} role nodes (open calls pulse)`);
  ok(org.quests > 5, `${org.quests} quest satellites orbit their circles`);
  await page.evaluate(() => {
    const g = [...document.querySelectorAll('#orgSvg .onode')].find(n => n.dataset.go === 'council' && n.dataset.kind === 'circle');
    g.querySelector('circle').dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
  await page.waitForTimeout(800);
  const walk = await page.evaluate(() => ({ circ: document.body.classList.contains('circles'), panel: panelKey }));
  ok(!walk.circ && walk.panel === 'council', 'clicking the Wisdom circle walks to the Council Fire door');
  await page.click('#panelClose'); await page.waitForTimeout(200);
  await page.click('#msCircles'); await page.waitForTimeout(400);
  const vb0 = await page.evaluate(() => document.getElementById('orgSvg').getAttribute('viewBox'));
  await page.mouse.move(740, 520); await page.mouse.wheel(0, -240); await page.waitForTimeout(250);
  const vb1 = await page.evaluate(() => document.getElementById('orgSvg').getAttribute('viewBox'));
  ok(vb0 !== vb1, 'the org map zooms on scroll');
  await page.keyboard.press('Escape'); await page.waitForTimeout(200);
  const backLiving = await page.evaluate(() => !document.body.classList.contains('circles'));
  ok(backLiving, 'Esc returns to the Living Map');

  /* ---------- I2. regressions ---------- */
  await page.click('#loomBtn'); await page.waitForTimeout(600);
  const loom = await page.evaluate(() => document.querySelectorAll('#loomWires .lw').length);
  ok(loom > 40, `the Loom still weaves (${loom} wires)`);
  await page.keyboard.press('Escape');
  await page.click('#wallBtn'); await page.waitForTimeout(250);
  const wall = await page.evaluate(() => document.getElementById('wall').classList.contains('show'));
  ok(wall, 'the Wall still opens');

  ok(perr.length === 0, `zero page errors (${perr.length})${perr.length ? ' — ' + perr[0] : ''}`);
  ok(cerr.length === 0, `zero console errors (${cerr.length})${cerr.length ? ' — ' + cerr[0] : ''}`);
  console.log(fails === 0 ? 'DOORS: ALL GREEN' : `DOORS: ${fails} FAILURES`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
