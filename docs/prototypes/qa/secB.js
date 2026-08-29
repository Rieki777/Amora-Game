// Sections 11-16
module.exports = async function (page, H) {
  const L = H.log;

  /* ================= 11. CUSTOM PALETTE ================= */
  L('\n########## §11 CUSTOM PALETTE ##########');
  if (!(await H.ev(() => document.getElementById('themePanel').classList.contains('show')))) await page.click('#themeBtn');
  await H.wait(300);
  await page.fill('#cSurface', '#3b1d4a');
  await page.fill('#cRing', '#ffd166');
  await page.fill('#cAccent', '#22d3a6');
  await page.click('#cApply'); await H.wait(600);
  const cv = await H.ev(() => { const c = getComputedStyle(document.documentElement); return ['--t-surface', '--t-ring', '--t-accent', '--gold', '--t-icon'].map(k => c.getPropertyValue(k).trim()); });
  L('11. vars after Apply:', JSON.stringify(cv));
  L('11. maia:', JSON.stringify(await H.maia(1)));
  L('11. swatch on-flags:', JSON.stringify(await H.ev(() => [...document.querySelectorAll('.swatchbtn')].map(b => b.classList.contains('on')))));
  let bad = await H.badText(); L('11. badText:', JSON.stringify(bad));
  await H.shot('11a-custom-palette');

  /* ================= 12. WEAVE IT ================= */
  L('\n########## §12 WEAVE IT ##########');
  if (!(await H.ev(() => document.getElementById('themePanel').classList.contains('show')))) await page.click('#themeBtn');
  await H.wait(250);
  await page.fill('#aiWords', 'high-desert mesa, adobe & sage');
  L('12. field value after typing:', JSON.stringify(await H.ev(() => document.getElementById('aiWords').value)));
  const camPre = await H.cam();
  await page.click('#aiGo'); await H.wait(700);
  const v1 = await H.ev(() => { const c = getComputedStyle(document.documentElement); return ['--t-surface', '--t-ring', '--t-icon', '--t-accent', '--gold'].map(k => c.getPropertyValue(k).trim()); });
  L('12. palette#1:', JSON.stringify(v1), '| panel closed=', await H.ev(() => !document.getElementById('themePanel').classList.contains('show')));
  L('12. maia:', JSON.stringify(await H.maia(1)));
  L('12. cam unchanged by typing?', JSON.stringify(camPre), '->', JSON.stringify(await H.cam()));
  await H.shot('12a-weave-desert');
  // determinism: same words again
  await page.click('#themeBtn'); await H.wait(250);
  await page.click('.swatchbtn:nth-of-type(3)'); await H.wait(400); // Mar Azul in between
  await page.fill('#aiWords', 'high-desert mesa, adobe & sage');
  await page.click('#aiGo'); await H.wait(600);
  const v2 = await H.ev(() => { const c = getComputedStyle(document.documentElement); return ['--t-surface', '--t-ring', '--t-icon', '--t-accent', '--gold'].map(k => c.getPropertyValue(k).trim()); });
  L('12. palette#2:', JSON.stringify(v2), '| identical =', JSON.stringify(v1) === JSON.stringify(v2));
  bad = await H.badText(); L('12. badText:', JSON.stringify(bad));
  // restore Emerald
  await page.click('#themeBtn'); await H.wait(250);
  await page.click('.swatchbtn:nth-of-type(1)'); await H.wait(300);
  await page.click('#themeBtn'); await H.wait(250);

  /* ================= 13. MAIA ================= */
  L('\n########## §13 MAIA ##########');
  const chips = await H.ev(() => [...document.querySelectorAll('#maiaActions .chip')].map(c => ({ say: c.dataset.say, txt: c.textContent })));
  L('13. chips:', JSON.stringify(chips));
  for (let i = 0; i < chips.length; i++) {
    const before = await H.maiaCount();
    await page.click(`#maiaActions .chip:nth-of-type(${i + 1})`); await H.wait(1200);
    L('13. chip"' + chips[i].txt + '" -> +' + ((await H.maiaCount()) - before) + ' lines |', JSON.stringify(await H.maia(1)));
    if (i === 0) { await H.ev(() => { clearTimeout(tourTimer); tourI = -1; travel = null; }); }  // kill tour started by chip 1
    await H.ev(() => document.getElementById('attnCard').classList.remove('show'));
  }
  await H.shot('13a-maia-chips');

  const ask = async (txt) => {
    await page.fill('#maiaText', txt);
    await page.press('#maiaText', 'Enter');           // Enter key sends
    await H.wait(1400);
    return { maia: await H.maia(2), cam: await H.cam(), panel: await H.ev(() => ({ open: document.getElementById('panel').classList.contains('open'), head: document.getElementById('panelHead').textContent.replace(/\s+/g, ' ').trim().slice(0, 60) })) };
  };
  let r = await ask('walk me to the greenhouse');
  L('13. "walk me to the greenhouse":', JSON.stringify(r));
  await H.closePanel();
  r = await ask('night');
  L('13. "night":', JSON.stringify({ maia: r.maia, dayPhase: r.cam.dayPhase, night: await H.ev(() => document.body.classList.contains('night')) }));
  await H.shot('13b-night-via-maia');
  r = await ask('show me quests');
  L('13. "show me quests":', JSON.stringify({ maia: r.maia, panel: r.panel }));
  await H.closePanel();
  r = await ask('seats');
  L('13. "seats":', JSON.stringify({ maia: r.maia, wall: await H.ev(() => document.getElementById('wall').classList.contains('show')) }));
  await H.ev(() => document.getElementById('wall').classList.remove('show'));
  r = await ask('xyzzy');
  L('13. "xyzzy" fallback:', JSON.stringify(r.maia));
  const links = await H.ev(() => [...document.querySelectorAll('#maiaLog .mline a')].slice(-2).map(a => { const s = getComputedStyle(a); const rr = a.getBoundingClientRect(); return { txt: a.textContent, cursor: s.cursor, color: s.color, w: Math.round(rr.width), clickable: !!a.onclick }; }));
  L('13. fallback links:', JSON.stringify(links));
  await H.shot('13c-maia-fallback');

  // --- Maia dock vs the right-hand panels (occlusion check) ---
  L('-- §13 dock occlusion --');
  await H.closePanel();
  const mFree = await H.rect('#maia');
  await H.clickPoi('greenhouse'); await H.wait(900);
  const pR = await H.rect('#panel'), mR = await H.rect('#maia');
  const ovl = !(pR.r <= mR.l || mR.r <= pR.l || pR.b <= mR.t || mR.b <= pR.t);
  L('13. #maia', JSON.stringify(mR), '#panel', JSON.stringify(pR), 'OVERLAP=', ovl);
  L('13. maia dock topmost at its centre =', await H.topAt(Math.round((mR.l + mR.r) / 2), Math.round((mR.t + mR.b) / 2)));
  L('13. maia z=', await H.ev(() => getComputedStyle(document.getElementById('maia')).zIndex), 'panel z=', await H.ev(() => getComputedStyle(document.getElementById('panel')).zIndex));
  L('13. (openPanel writes a Maia line while the dock is covered:', JSON.stringify(await H.maia(1)), ')');
  await H.shot('13e-maia-covered-by-panel');
  await H.closePanel();

  // click a fallback link
  await page.fill('#maiaText', 'zzzqqq'); await page.press('#maiaText', 'Enter'); await H.wait(1200);
  const before13 = await H.maiaCount();
  await page.click('#maiaLog .mline:last-child a:nth-of-type(2)'); await H.wait(900);
  L('13. clicked "where you can help" ->', JSON.stringify(await H.maia(1)), '| +' + ((await H.maiaCount()) - before13));
  await H.ev(() => document.getElementById('attnCard').classList.remove('show'));
  // dock minimize / restore
  await page.click('#maiaHead'); await H.wait(500);
  const mn1 = await H.ev(() => ({ min: document.getElementById('maia').classList.contains('min'), h: Math.round(document.getElementById('maia').getBoundingClientRect().height) }));
  await H.shot('13d-maia-minimised');
  await page.click('#maiaHead'); await H.wait(500);
  const mn2 = await H.ev(() => ({ min: document.getElementById('maia').classList.contains('min'), h: Math.round(document.getElementById('maia').getBoundingClientRect().height) }));
  L('13. minimise:', JSON.stringify(mn1), '-> restore:', JSON.stringify(mn2));

  /* ================= 14. TOUR ================= */
  L('\n########## §14 TOUR ##########');
  await H.ev(() => { document.getElementById('maiaLog').innerHTML = ''; });
  await page.click('#maiaActions .chip:nth-of-type(1)'); // "Take the tour"
  const narr = [];
  for (let i = 0; i < 66; i++) {
    await H.wait(1000);
    const st = await H.ev(() => ({ i: tourI, cam: [Math.round(cam.x), Math.round(cam.y)], lines: [...document.querySelectorAll('#maiaLog .mline')].map(d => d.textContent.replace(/\s+/g, ' ').trim()) }));
    while (narr.length < st.lines.length) { narr.push({ t: i, i: st.i, cam: st.cam, txt: st.lines[narr.length].slice(0, 62) }); }
    if (st.i === -1 && i > 8) { L('14. tour finished (tourI back to -1) at t=' + i + 's'); break; }
  }
  L('14. narration timeline (' + narr.length + ' lines):'); narr.forEach(s => L('    t=' + s.t + 's stopIdx=' + s.i + ' cam' + JSON.stringify(s.cam) + ' :: ' + s.txt));
  const tourTexts = await H.ev(() => TOUR.map(t => t.txt.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').slice(0, 40)));
  const said = narr.map(n => n.txt);
  L('14. TOUR stops =', tourTexts.length, '| stops narrated =', tourTexts.filter(t => said.some(s => s.includes(t.slice(0, 28)))).length);
  L('14. ends with:', JSON.stringify(await H.maia(1)));
  await H.shot('14a-tour-end');

  // pan DURING a travel leg (the hazard: pointerdown sets travel=null, killing the done-callback chain)
  L('-- §14 pan mid-travel --');
  await H.ev(() => { document.getElementById('maiaLog').innerHTML = ''; clearTimeout(tourTimer); tourI = -1; });
  await page.click('#maiaActions .chip:nth-of-type(1)');
  await H.wait(420);                       // stop 0's camera flight is in progress
  // pick a grab point that is empty land (not an icon, not HUD)
  const grab = await H.ev(() => { for (const p of [[300, 780], [250, 300], [420, 640], [900, 300]]) { const e = document.elementFromPoint(p[0], p[1]); if (e && e.id === 'scene') return p; } return null; });
  const trav = await H.ev(() => ({ travelling: !!travel, i: tourI, cam: [Math.round(cam.x), Math.round(cam.y)] }));
  await page.mouse.move(grab[0], grab[1]); await page.mouse.down();
  await page.mouse.move(grab[0] - 120, grab[1] + 70, { steps: 6 }); await page.mouse.up();
  const after = await H.ev(() => ({ travel: !!travel, cam: [Math.round(cam.x), Math.round(cam.y)] }));
  L('14. grab point', JSON.stringify(grab), '| before', JSON.stringify(trav), '| after', JSON.stringify(after), '| camera actually moved =', trav.cam[0] !== after.cam[0] || trav.cam[1] !== after.cam[1]);
  for (let s = 0; s < 5; s++) {
    await H.wait(4000);
    const st = await H.ev(() => ({ i: tourI, n: document.querySelectorAll('#maiaLog .mline').length, last: (document.querySelector('#maiaLog .mline:last-child') || {}).textContent }));
    L('14.  +' + ((s + 1) * 4) + 's after pan: stopIdx=' + st.i + ' lines=' + st.n + ' :: ' + (st.last || '').replace(/\s+/g, ' ').slice(0, 52));
  }
  await H.shot('14b-tour-after-pan');
  await H.ev(() => { clearTimeout(tourTimer); tourI = -1; });

  /* ================= 15. ATTENTION ================= */
  L('\n########## §15 ATTENTION ##########');
  const badge0 = await H.ev(() => document.getElementById('attnBadge').textContent);
  const expect0 = await H.ev(() => ({ seats: SCENE.seats.length, timed: SCENE.quests.filter(q => /Saturday|tonight|Thu/.test(q.r + q.need)).length }));
  L('15. badge =', badge0, '| seats+timedQuests =', expect0.seats + '+' + expect0.timed, '=', expect0.seats + expect0.timed);
  await page.keyboard.press('Space'); await H.wait(1600);
  const a1 = await H.ev(() => { const c = document.getElementById('attnCard'); const b = [...c.querySelectorAll('.btn')]; return { show: c.classList.contains('show'), txt: c.textContent.replace(/\s+/g, ' ').trim().slice(0, 90), btns: b.map(x => x.textContent), rects: b.map(x => { const r = x.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; }) }; });
  L('15. Space ->', JSON.stringify(a1), '| cam', JSON.stringify(await H.cam()));
  for (const [x, y] of a1.rects) L('15.  topmost @' + x + ',' + y + ' =', await H.topAt(x, y));
  await H.shot('15a-attention-card');
  // "Open the door"
  await page.click('#attnCard .btn:nth-of-type(1)'); await H.wait(900);
  L('15. Open the door ->', JSON.stringify(await H.ev(() => ({ open: document.getElementById('panel').classList.contains('open'), head: document.getElementById('panelHead').textContent.replace(/\s+/g, ' ').trim().slice(0, 50), tabOn: [...document.getElementById('tabs').children].findIndex(b => b.classList.contains('on')), card: document.getElementById('attnCard').classList.contains('show') }))));
  await page.keyboard.press('Escape'); await H.wait(300);
  // cycle several, check it advances through different items, then "Later"
  const seen = [];
  for (let i = 0; i < 5; i++) {
    await page.click('#attnBtn'); await H.wait(1000);
    seen.push(await H.ev(() => document.querySelector('#attnCard h4').textContent.trim()));
  }
  L('15. cycle:', JSON.stringify(seen), '| distinct =', new Set(seen).size);
  await page.click('#attnCard .btn.ghostbtn'); await H.wait(400);
  L('15. Later dismissed =', await H.ev(() => !document.getElementById('attnCard').classList.contains('show')));

  /* ================= 16. THE WALL ================= */
  L('\n########## §16 THE WALL ##########');
  await page.keyboard.press('w'); await H.wait(600);
  const w1 = await H.ev(() => ({ show: document.getElementById('wall').classList.contains('show'), heads: [...document.querySelectorAll('#wallList .wallhead')].map(h => h.textContent.trim()), rows: document.querySelectorAll('#wallList .wallrow').length, clickable: [...document.querySelectorAll('#wallList .wallrow')].filter(r => r.getAttribute('onclick')).length }));
  L('16. W key ->', JSON.stringify(w1));
  const cnt = await H.ev(() => ({ seats: SCENE.seats.length, quests: SCENE.quests.length }));
  L('16. expected rows = seats', cnt.seats, '+ quests', cnt.quests, '=', cnt.seats + cnt.quests);
  await H.shot('16a-wall');
  const wr = await H.rect('#wall'), bb = await H.rect('#buildBtn');
  L('16. #wall', JSON.stringify(wr), ' #buildBtn', JSON.stringify(bb), ' overlap=', !(wr.r <= bb.l || bb.r <= wr.l || wr.b <= bb.t || bb.b <= wr.t));
  // click a seat row and a quest row
  await page.locator('#wallList .wallrow').nth(0).click(); await H.wait(1400);
  L('16. seat row ->', JSON.stringify(await H.ev(() => ({ open: document.getElementById('panel').classList.contains('open'), head: document.getElementById('panelHead').textContent.replace(/\s+/g, ' ').trim().slice(0, 45), tab: [...document.getElementById('tabs').children].findIndex(b => b.classList.contains('on')) }))), '| cam', JSON.stringify(await H.cam()));
  await page.keyboard.press('Escape'); await H.wait(300);
  const qrow = await H.ev(() => [...document.querySelectorAll('#wallList .wallrow')].findIndex(r => r.textContent.includes('\u2691')));
  L('16. first quest row index =', qrow);
  await page.locator('#wallList .wallrow').nth(qrow).click(); await H.wait(1400);
  L('16. quest row ->', JSON.stringify(await H.ev(() => ({ open: document.getElementById('panel').classList.contains('open'), head: document.getElementById('panelHead').textContent.replace(/\s+/g, ' ').trim().slice(0, 45), tab: [...document.getElementById('tabs').children].findIndex(b => b.classList.contains('on')) }))));
  await page.keyboard.press('Escape'); await H.wait(300);
  await page.keyboard.press('w'); await H.wait(400);
  L('16. W toggles closed =', await H.ev(() => !document.getElementById('wall').classList.contains('show')));
  await page.click('#wallBtn'); await H.wait(400);
  L('16. ☰ button opens =', await H.ev(() => document.getElementById('wall').classList.contains('show')));
  await page.click('#wallBtn'); await H.wait(300);
};
