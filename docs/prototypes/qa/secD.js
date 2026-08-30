// Sections 21-23
module.exports = async function (page, H) {
  const L = H.log;
  const st = k => H.ev(k => { const s = BY[k]; return s ? { name: s.name, arch: s.archetype, circle: s.circle, phase: s.phase, fund: s.fund, act: s.act, state: s.state, doors: (s.modules || []).length, origin: (s.origin || '').slice(0, 25), blurb: (s.blurb || '').slice(0, 25) } : null; }, k);
  const poiLook = k => H.ev(k => { const e = pEls[k]; if (!e) return null; const b = bEls[k]; return { pring: e.style.getPropertyValue('--pring'), ringStroke: getComputedStyle(e.querySelector('.ring')).stroke, cls: e.className, prog: e.querySelector('.prog') && e.querySelector('.prog').getAttribute('stroke-dasharray'), flatIC: e.querySelector('.flat .ic').innerHTML, iso: e.querySelector('.iso').innerHTML, banner: b ? b.textContent.trim() : null, dot: b ? b.querySelector('.dot').style.background : null }; }, k);

  if (!(await H.ev(() => buildMode))) { await page.click('#buildBtn'); await H.wait(600); }
  await page.keyboard.press('h'); await H.wait(1500);

  /* ================= 21. INSPECT CARD ================= */
  L('\n########## §21 INSPECT CARD ##########');
  // open by ICON
  const camA = await H.cam();
  await H.clickPoi('kitchen'); await H.wait(1200);
  L('21. via icon ->', JSON.stringify(await H.ev(() => ({ open: document.getElementById('inspect').classList.contains('open'), key: inspKey, right: getComputedStyle(document.getElementById('inspect')).right }))), '| cam', JSON.stringify(camA), '->', JSON.stringify(await H.cam()));
  await H.shot('21a-inspect-open');
  await H.closeInspect();
  // open by BANNER
  const bb = await H.ev(() => { const b = bEls['kitchen']; const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, vis: getComputedStyle(b).display }; });
  if (bb.vis !== 'none' && bb.y > 4) { await page.mouse.click(bb.x, bb.y); await H.wait(900); }
  L('21. via banner ->', JSON.stringify(await H.ev(() => ({ open: document.getElementById('inspect').classList.contains('open'), key: inspKey }))));

  // ---- identity: rename live ----
  L('-- §21 identity --');
  const b0 = (await poiLook('kitchen')).banner;
  await page.click('#iName'); await page.keyboard.press('End');
  const mid = [];
  for (const ch of ' of Fire') { await page.keyboard.type(ch, { delay: 40 }); mid.push((await poiLook('kitchen')).banner); }
  L('21. rename: banner "' + b0 + '" -> live:', JSON.stringify(mid.slice(0, 4)), '... final "' + mid[mid.length - 1] + '"');
  L('21. name in model =', (await st('kitchen')).name);
  // archetype dropdown
  const archInfo = await H.ev(() => { const s = document.getElementById('iArch'); return { groups: s.querySelectorAll('optgroup').length, opts: s.querySelectorAll('option').length, val: s.value }; });
  const look0 = await poiLook('kitchen');
  await page.selectOption('#iArch', 'solar'); await H.wait(600);
  const look1 = await poiLook('kitchen');
  L('21. archetype select:', JSON.stringify(archInfo));
  L('21. emblem changed =', look0.flatIC !== look1.flatIC, '| iso changed =', look0.iso !== look1.iso, '| model arch =', (await st('kitchen')).arch);
  L('21.   iso len', look0.iso.length, '->', look1.iso.length, '| iso head0', JSON.stringify(look0.iso.slice(60, 130)), '| iso head1', JSON.stringify(look1.iso.slice(60, 130)));
  await page.selectOption('#iArch', 'kitchen'); await H.wait(500);
  // blurb + origin
  await page.fill('#iBlurb', 'QA blurb — woodsmoke and cardamom, edited.');
  await page.fill('#iOrigin', 'QA origin — written by the tester.');
  await page.click('#iName'); await H.wait(300);
  L('21. blurb/origin ->', JSON.stringify(await st('kitchen')));

  // ---- circle ----
  L('-- §21 circle --');
  for (const c of ['Land', 'Healing', 'Arts']) {
    await page.selectOption('#iCircle', c); await H.wait(500);
    const lk = await poiLook('kitchen');
    L('21. circle=' + c, '| --pring', lk.pring, '| ring stroke', lk.ringStroke, '| banner dot', lk.dot, '| expected', await H.ev(c => CIRCLE_COL[c], c));
  }
  await page.selectOption('#iCircle', ''); await H.wait(600);
  const un = await poiLook('kitchen');
  L('21. UNOWNED -> --pring', un.pring, '| ring', un.ringStroke, '| dot', un.dot, '| toast', JSON.stringify(await H.toasts()));
  await page.click('#wallBtn'); await H.wait(500);
  const wallUn = await H.ev(() => ({ heads: [...document.querySelectorAll('#wallList .wallhead')].map(h => h.textContent.trim()), steward: [...document.querySelectorAll('#wallList .wallrow')].filter(r => r.textContent.includes('Kitchen')).map(r => r.textContent.trim().slice(0, 60)) }));
  L('21. Wall after unowning:', JSON.stringify(wallUn));
  await H.shot('21b-unowned-wall');
  await page.click('#wallBtn'); await H.wait(300);
  // panel + hover copy
  await page.click('#buildBtn'); await H.wait(600);
  await H.hoverPoi('kitchen');
  L('21. hover copy:', JSON.stringify(await H.ev(() => document.getElementById('hovercard').textContent.replace(/\s+/g, ' ').trim().slice(0, 80))));
  await H.clickPoi('kitchen'); await H.wait(900);
  L('21. panel copy:', JSON.stringify(await H.ev(() => document.getElementById('panelHead').textContent.replace(/\s+/g, ' ').trim())));
  await H.closePanel();
  await page.click('#buildBtn'); await H.wait(600);
  await H.clickPoi('kitchen'); await H.wait(900);
  await page.selectOption('#iCircle', 'Gathering'); await H.wait(400);

  // ---- phase & pool: derived state ----
  L('-- §21 phase & pool (derived state) --');
  const readState = () => H.ev(() => ({ pill: document.getElementById('iState').textContent.trim(), model: BY[inspKey].state, fund: BY[inspKey].fund, phase: BY[inspKey].phase, prog: pEls[inspKey].querySelector('.prog').getAttribute('stroke-dasharray'), cls: pEls[inspKey].className }));
  for (const v of ['0', '30', '49', '50', '80', '100']) {
    await page.fill('#iFund', v); await H.ev(() => document.getElementById('iFund').dispatchEvent(new Event('input', { bubbles: true }))); await H.wait(250);
    L('21. pool=' + v + '% ->', JSON.stringify(await readState()));
  }
  await H.ev(() => document.getElementById('iFund').dispatchEvent(new Event('change', { bubbles: true }))); await H.wait(400);
  for (const ph of ['3', '1', '2']) {
    await page.check(`input[name=iPhase][value="${ph}"]`); await H.wait(400);
    L('21. phase=' + ph + ' ->', JSON.stringify(await readState()));
  }
  // phase 3 + zero pool -> blueprint
  await page.fill('#iFund', '0'); await H.ev(() => { const e = document.getElementById('iFund'); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }); await H.wait(400);
  await page.check('input[name=iPhase][value="3"]'); await H.wait(400);
  L('21. phase3 + pool0 ->', JSON.stringify(await readState()));
  // full pool + phase 1 -> alive; activity select
  await page.check('input[name=iPhase][value="1"]'); await H.wait(300);
  await page.fill('#iFund', '100'); await H.ev(() => { const e = document.getElementById('iFund'); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }); await H.wait(400);
  L('21. phase1 + pool100 ->', JSON.stringify(await readState()));
  for (const a of ['high', 'low', 'steady']) { await page.selectOption('#iAct', a); await H.wait(350); L('21. activity=' + a + ' ->', JSON.stringify(await readState())); }
  L('21. state directly editable anywhere in the card? state inputs =', await H.ev(() => [...document.querySelectorAll('#inspBody select,#inspBody input')].map(e => e.id).filter(Boolean).join(',')));
  await H.shot('21c-inspect-phasepool');

  // ---- roles ----
  L('-- §21 roles --');
  const roleSnap = () => H.ev(() => ({ badge: document.getElementById('attnBadge').textContent, here: SCENE.seats.filter(x => x.at === inspKey).map(x => x.s), total: SCENE.seats.length }));
  L('21. roles before:', JSON.stringify(await roleSnap()));
  // bring a role from elsewhere
  await H.ev(() => { const d = document.querySelector('#inspBody details'); if (d) d.open = true; }); await H.wait(250);
  await H.clearToasts();
  const otherIdx = await H.ev(() => { const cbs = [...document.querySelectorAll('#inspBody details [data-seat]')]; return cbs.length ? +cbs[0].dataset.seat : null; });
  const otherName = await H.ev(i => SCENE.seats[i].s, otherIdx);
  await page.locator(`#inspBody details [data-seat="${otherIdx}"]`).click({ force: true }); await H.wait(700);
  L('21. brought "' + otherName + '" here ->', JSON.stringify(await roleSnap()), '| toast', JSON.stringify(await H.toasts()));
  // uncheck -> returns to circle home
  await H.clearToasts();
  const idxNow = await H.ev(n => SCENE.seats.findIndex(x => x.s === n), otherName);
  await page.locator(`#inspBody [data-seat="${idxNow}"]`).first().click({ force: true }); await H.wait(700);
  L('21. unchecked ->', JSON.stringify(await roleSnap()), '| now at', await H.ev(n => { const s = SCENE.seats.find(x => x.s === n); return s ? (BY[s.at] ? BY[s.at].name : s.at) : null; }, otherName), '| toast', JSON.stringify(await H.toasts()));
  // add a role here
  await page.fill('#iSeatName', 'QA Hearth Keeper'); await page.fill('#iSeatNote', 'added by the tester');
  await page.click('#iSeatAdd'); await H.wait(600);
  L('21. added role ->', JSON.stringify(await roleSnap()));

  // ---- quests ----
  L('-- §21 quests --');
  const qSnap = () => H.ev(() => ({ here: SCENE.quests.filter(q => q.at === inspKey).map(q => q.q), board: SCENE.quests.filter(q => !q.at).map(q => q.q), badge: document.getElementById('attnBadge').textContent, total: SCENE.quests.length }));
  const qsel = await H.ev(() => { const s = document.querySelector('#inspBody [data-qaddr]'); return s ? { i: s.dataset.qaddr, opts: s.querySelectorAll('option').length, first: s.options[0].textContent } : null; });
  L('21. quest address dropdown:', JSON.stringify(qsel), '| structures =', await H.ev(() => SCENE.structures.length));
  await H.clearToasts();
  await page.selectOption(`#inspBody [data-qaddr="${qsel.i}"]`, 'library'); await H.wait(600);
  L('21. reassigned to Library ->', JSON.stringify(await qSnap()), '| toast', JSON.stringify(await H.toasts()));
  // send one to the board
  const q2 = await H.ev(() => { const s = document.querySelector('#inspBody [data-qaddr]'); return s ? s.dataset.qaddr : null; });
  await H.clearToasts();
  if (q2 !== null) { await page.selectOption(`#inspBody [data-qaddr="${q2}"]`, ''); await H.wait(600); }
  L('21. sent to board ->', JSON.stringify(await qSnap()), '| toast', JSON.stringify(await H.toasts()));
  await page.click('#wallBtn'); await H.wait(500);
  const wallBoard = await H.ev(() => ({ heads: [...document.querySelectorAll('#wallList .wallhead')].map(h => h.textContent.trim()), boardRows: [...document.querySelectorAll('#wallList .wallrow')].filter(r => r.textContent.includes('Quest Board')).map(r => ({ txt: r.textContent.trim().slice(0, 60), click: !!r.getAttribute('onclick') })) }));
  L('21. Wall board section:', JSON.stringify(wallBoard));
  await H.shot('21d-wall-board');
  await page.click('#wallBtn'); await H.wait(300);
  // add a quest here
  await page.fill('#iQTitle', 'QA quest — test the hearth'); await page.fill('#iQReward', '11 ♥'); await page.fill('#iQNeed', '2 hands, Saturday');
  await page.click('#iQAdd'); await H.wait(600);
  L('21. added quest ->', JSON.stringify(await qSnap()));

  // ---- doors ----
  L('-- §21 doors --');
  const dSnap = () => H.ev(() => ({ mods: BY[inspKey].modules.map(m => m.join('|')), rows: document.querySelectorAll('#inspBody [data-dlab]').length }));
  L('21. doors before:', JSON.stringify(await dSnap()));
  await page.fill('#inspBody [data-dlab="0"]', 'QA Door One');
  await page.fill('#inspBody [data-drt="0"]', '/qa-one');
  await page.click('#iName'); await H.wait(300);
  L('21. edited door0 ->', JSON.stringify(await dSnap()));
  await page.fill('#iDLabel', 'QA Added Door'); await page.fill('#iDRoute', '/qa-two');
  await page.click('#iDAdd'); await H.wait(500);
  L('21. added door ->', JSON.stringify(await dSnap()));
  await page.click('#inspBody [data-ddel="0"]'); await H.wait(500);
  L('21. removed door0 ->', JSON.stringify(await dSnap()));
  // reflected in the portal panel after leaving build mode
  await page.click('#buildBtn'); await H.wait(700);
  await H.clickPoi('kitchen'); await H.wait(900);
  await page.click('#tabs button[data-i="3"]'); await H.wait(300);
  L('21. portal Enter tab now:', JSON.stringify(await H.ev(() => [...document.querySelectorAll('#panelBody .doorbtn')].map(b => b.textContent.replace(/\s+/g, ' ').trim()))));
  await H.closePanel();
  // zero-door structure -> honest empty state
  await page.click('#buildBtn'); await H.wait(600);
  let zeroKey = await H.ev(() => { const s = SCENE.structures.find(x => !x.modules || !x.modules.length); return s ? s.key : null; });
  if (!zeroKey) { // place a fresh one — new structures are born door-less
    await page.locator('#palette .palItem', { hasText: 'Lookout Tower' }).first().click(); await H.wait(300);
    const zp = await H.landPt(true, 9); await page.mouse.move(zp[0], zp[1]); await H.wait(120); await page.mouse.click(zp[0], zp[1]); await H.wait(700);
    zeroKey = await H.ev(() => inspKey); await H.closeInspect();
  }
  L('21. zero-door structure =', zeroKey);
  if (zeroKey) {
    await page.click('#buildBtn'); await H.wait(500);
    await H.clickPoi(zeroKey); await H.wait(900);
    await page.click('#tabs button[data-i="3"]'); await H.wait(300);
    L('21. zero-door panel Enter tab:', JSON.stringify(await H.ev(() => document.getElementById('panelBody').textContent.replace(/\s+/g, ' ').trim().slice(0, 120))));
    await H.closePanel();
    await page.click('#buildBtn'); await H.wait(500);
  }
  await H.clickPoi('kitchen'); await H.wait(900);

  // ---- flows ----
  L('-- §21 flows --');
  const fSnap = () => H.ev(() => { const s = BY[inspKey]; const fin = SCENE.flows.filter(f => f.to === s.key), fout = SCENE.flows.filter(f => f.from === s.key); const onland = fin.filter(f => f.from).length; return { in: fin.map(f => (f.from || 'IMPORT') + '>' + f.medium), out: fout.map(f => f.medium + '>' + (f.to || 'OFFLAND')), loopTxt: (document.querySelector('#inspBody h5 span') || {}).textContent, calc: fin.length ? Math.round(onland / fin.length * 100) + '%' : null, total: SCENE.flows.length }; });
  L('21. flows before:', JSON.stringify(await fSnap()));
  await page.click('#iFInAdd'); await H.wait(500);
  L('21. +input ->', JSON.stringify(await fSnap()));
  await page.click('#iFOutAdd'); await H.wait(500);
  L('21. +output ->', JSON.stringify(await fSnap()));
  const fmed = await H.ev(() => { const s = document.querySelector('#inspBody [data-fmed]'); return s ? { i: s.dataset.fmed, opts: [...s.options].map(o => o.value) } : null; });
  L('21. medium options:', JSON.stringify(fmed));
  await page.selectOption(`#inspBody [data-fmed="${fmed.i}"]`, 'compost'); await H.wait(500);
  L('21. medium->compost:', JSON.stringify(await fSnap()));
  // pick an IMPORTED input (from == null) and give it an on-land source; loop % must rise
  const impSel = await H.ev(() => { const sels = [...document.querySelectorAll('#inspBody [data-foth][data-dir=in]')]; const s = sels.find(x => SCENE.flows[+x.dataset.foth].from == null); return s ? s.dataset.foth : null; });
  L('21. imported input select index =', impSel);
  if (impSel !== null) { await page.selectOption(`#inspBody [data-foth="${impSel}"]`, 'tank'); await H.wait(600); }
  L('21. imported endpoint -> Water Tank (loop % must rise):', JSON.stringify(await fSnap()));
  const fdel = await H.ev(() => { const b = document.querySelector('#inspBody [data-fdel]'); return b ? b.dataset.fdel : null; });
  await page.click(`#inspBody [data-fdel="${fdel}"]`); await H.wait(500);
  L('21. deleted a flow ->', JSON.stringify(await fSnap()));
  await H.shot('21e-inspect-flows');
  let bad = await H.badText(); L('21. badText in inspect:', JSON.stringify(bad));

  // ---- remove via danger button ----
  L('-- §21 danger remove --');
  await page.locator('#palette .palItem', { hasText: 'Hermitage' }).first().click(); await H.wait(300);
  const pt = await H.landPt(true, 4);
  await page.mouse.move(pt[0], pt[1]); await H.wait(120); await page.mouse.click(pt[0], pt[1]); await H.wait(700);
  const dkey = await H.ev(() => inspKey);
  await H.clearToasts();
  await page.click('#iRemove'); await H.wait(700);
  L('21. danger remove of', dkey, '->', JSON.stringify(await H.ev(k => ({ gone: !BY[k], poi: !pEls[k], inspect: document.getElementById('inspect').classList.contains('open') }), dkey)), '| toast', JSON.stringify(await H.toasts()));
  L('21. audit trail so far =', await H.ev(() => EDITS.length), 'actions:', JSON.stringify(await H.ev(() => [...new Set(EDITS.map(e => e.action))])));

  /* ================= 22. BOUNDARY EDITOR ================= */
  L('\n########## §22 BOUNDARY EDITOR ##########');
  await H.closeInspect();
  await page.keyboard.press('h');
  await H.ev(() => { travel = null; cam.x = 1450; cam.y = 680; cam.z = 0.82; clampCam(); }); await H.wait(500);
  await H.clearToasts();
  await page.click('#boundBtn'); await H.wait(600);
  L('22. boundary on =', await H.ev(() => boundaryMode), '| body', await H.ev(() => document.body.className), '| btn.on', await H.ev(() => document.getElementById('boundBtn').classList.contains('on')));
  L('22. maia:', JSON.stringify(await H.maia(1)));
  L('22. vertices =', await H.ev(() => SCENE.bound.length));
  await H.shot('22a-boundary-handles');
  // icons inert?
  const inert = await H.ev(() => { const e = pEls['tank']; const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; return { poiPE: getComputedStyle(e).pointerEvents, bannerPE: getComputedStyle(bEls['tank']).pointerEvents, topAtIcon: (() => { const t = document.elementFromPoint(x, y); return t ? (t.id || t.className) : null; })() }; });
  L('22. inert check:', JSON.stringify(inert));
  // drag a vertex
  const v0 = await H.ev(() => SCENE.bound.map(p => [Math.round(p[0]), Math.round(p[1])]));
  const vScreen = await H.ev(() => { for (let i = 0; i < SCENE.bound.length; i++) { const [sx, sy] = worldToScreen(SCENE.bound[i][0], SCENE.bound[i][1]); const x = sx / DPR, y = sy / DPR; if (x > 60 && y > 60 && x < innerWidth - 60 && y < innerHeight - 60) return { i, x, y }; } return null; });
  L('22. dragging vertex', JSON.stringify(vScreen));
  await page.mouse.move(vScreen.x, vScreen.y); await page.mouse.down(); await page.mouse.move(vScreen.x + 45, vScreen.y + 30, { steps: 8 }); await page.mouse.up(); await H.wait(600);
  const v1 = await H.ev(() => SCENE.bound.map(p => [Math.round(p[0]), Math.round(p[1])]));
  L('22. vertex moved =', JSON.stringify(v0[vScreen.i]), '->', JSON.stringify(v1[vScreen.i]), '| count', v0.length, '->', v1.length, '| undo depth', await H.ev(() => UNDO.length));
  // mid-segment ghost -> insert + drag in one gesture
  const mScreen = await H.ev(() => { const n = SCENE.bound.length; for (let i = 0; i < n; i++) { const a = SCENE.bound[i], b = SCENE.bound[(i + 1) % n]; const [sx, sy] = worldToScreen((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); const x = sx / DPR, y = sy / DPR; if (x > 80 && y > 80 && x < innerWidth - 80 && y < innerHeight - 80) return { i, x, y }; } return null; });
  await page.mouse.move(mScreen.x, mScreen.y); await page.mouse.down(); await page.mouse.move(mScreen.x + 35, mScreen.y - 25, { steps: 8 }); await page.mouse.up(); await H.wait(600);
  const v2 = await H.ev(() => SCENE.bound.map(p => [Math.round(p[0]), Math.round(p[1])]));
  L('22. mid-ghost @' + JSON.stringify(mScreen) + ' -> vertices', v1.length, '->', v2.length, '| inserted+dragged in one gesture =', v2.length === v1.length + 1);
  await H.shot('22b-vertex-inserted');
  // right-click delete
  const rScreen = await H.ev(() => { for (let i = 0; i < SCENE.bound.length; i++) { const [sx, sy] = worldToScreen(SCENE.bound[i][0], SCENE.bound[i][1]); const x = sx / DPR, y = sy / DPR; if (x > 60 && y > 60 && x < innerWidth - 60 && y < innerHeight - 60) return { i, x, y }; } return null; });
  await page.mouse.click(rScreen.x, rScreen.y, { button: 'right' }); await H.wait(600);
  const v3 = await H.ev(() => SCENE.bound.length);
  L('22. right-click delete: vertices', v2.length, '->', v3);
  // refuses below 3
  await H.clearToasts();
  const cut = await H.ev(() => { while (SCENE.bound.length > 3) SCENE.bound.pop(); return SCENE.bound.length; });
  await H.wait(300);
  const r2 = await H.ev(() => { const [sx, sy] = worldToScreen(SCENE.bound[0][0], SCENE.bound[0][1]); return [sx / DPR, sy / DPR]; });
  L('22. trimmed to', cut, 'vertices; vertex0 at', JSON.stringify(r2));
  if (r2[0] > 4 && r2[1] > 4 && r2[0] < 1596 && r2[1] < 996) {
    await page.mouse.click(r2[0], r2[1], { button: 'right' }); await H.wait(500);
    L('22. right-click at 3 vertices -> count', await H.ev(() => SCENE.bound.length), '| toast', JSON.stringify(await H.toasts()));
  } else L('22. (vertex0 offscreen — refusal tested via count only)', await H.ev(() => SCENE.bound.length));

  // ---- strand the Water Tank ----
  L('-- §22 stranding --');
  await H.ev(() => { SCENE.bound.length = 0; [[350, 240], [700, 150], [1060, 110], [1420, 130], [1660, 160], [1980, 300], [2260, 520], [2200, 780], [2100, 980], [1990, 1230], [1830, 1400], [1600, 1500], [1280, 1560], [1000, 1470], [820, 1300], [640, 1050], [500, 800], [400, 600], [360, 420]].map(p => TP(p[0], p[1])).forEach(p => SCENE.bound.push(p)); strandedCheck(false); paintTerrain(); mmDirty = true; UNDO.length = 0; });
  await H.wait(400);
  L('22. boundary reset to', await H.ev(() => SCENE.bound.length), 'vertices; tank inside =', await H.ev(() => inBound(BY.tank.x, BY.tank.y)));
  // find the vertex nearest the tank and drag it far east, so the tank falls outside
  await H.ev(() => { travel = null; cam.x = 1150; cam.y = 620; cam.z = 0.9; clampCam(); }); await H.wait(400);
  await H.clearToasts();
  const near = await H.ev(() => { const t = BY.tank; let bi = 0, bd = 1e12; SCENE.bound.forEach((p, i) => { const d = (p[0] - t.x) ** 2 + (p[1] - t.y) ** 2; if (d < bd) { bd = d; bi = i } }); const [sx, sy] = worldToScreen(SCENE.bound[bi][0], SCENE.bound[bi][1]); return { i: bi, x: sx / DPR, y: sy / DPR, tank: [Math.round(t.x), Math.round(t.y)] }; });
  L('22. nearest vertex to tank:', JSON.stringify(near));
  // drag several vertices east of the tank
  for (const di of [0, -1, 1, -2, 2]) {
    const vs = await H.ev(([bi, di]) => { const n = SCENE.bound.length; const i = ((bi + di) % n + n) % n; const [sx, sy] = worldToScreen(SCENE.bound[i][0], SCENE.bound[i][1]); return { i, x: sx / DPR, y: sy / DPR }; }, [near.i, di]);
    if (vs.x < 4 || vs.y < 4 || vs.x > 1596 || vs.y > 996) continue;
    const tgt = await H.ev(() => { const [sx, sy] = worldToScreen(BY.tank.x + 190, BY.tank.y); return [sx / DPR, sy / DPR]; });
    await page.mouse.move(vs.x, vs.y); await page.mouse.down(); await page.mouse.move(tgt[0], tgt[1] + di * 30, { steps: 8 }); await page.mouse.up(); await H.wait(400);
    if (await H.ev(() => !!BY.tank.stranded)) break;
  }
  const strand = await H.ev(() => ({ stranded: SCENE.structures.filter(s => s.stranded).map(s => s.key), tankCls: pEls.tank ? pEls.tank.className : null, ringStroke: pEls.tank ? getComputedStyle(pEls.tank.querySelector('.ring')).stroke : null, anim: pEls.tank ? getComputedStyle(pEls.tank.querySelector('.ring')).animationName : null, stillOnMap: !!BY.tank }));
  L('22. stranding result:', JSON.stringify(strand), '| toast', JSON.stringify(await H.toasts()));
  await H.shot('22c-stranded-tank');
  await page.click('#wallBtn'); await H.wait(500);
  L('22. Wall:', JSON.stringify(await H.ev(() => ({ heads: [...document.querySelectorAll('#wallList .wallhead')].map(h => h.textContent.trim()), stranded: [...document.querySelectorAll('#wallList .wallrow')].filter(r => r.textContent.includes('⚠')).map(r => r.textContent.trim().slice(0, 70)) }))));
  await H.shot('22d-wall-stranded');
  await page.click('#wallBtn'); await H.wait(300);
  // undo restores the polygon (count AND positions) and clears the flag
  const vBefore = await H.ev(() => SCENE.bound.map(p => [Math.round(p[0]), Math.round(p[1])]));
  await page.click('#undoBtn'); await H.wait(700);
  const vAfter = await H.ev(() => SCENE.bound.map(p => [Math.round(p[0]), Math.round(p[1])]));
  L('22. undo: vertices', vBefore.length, '->', vAfter.length, '| polygon changed =', JSON.stringify(vBefore) !== JSON.stringify(vAfter), '| tank stranded now =', await H.ev(() => !!BY.tank.stranded), '| tank still on map =', await H.ev(() => !!BY.tank));
  for (let i = 0; i < 6; i++) { await page.click('#undoBtn'); await H.wait(300); }
  L('22. after full undo: vertices =', await H.ev(() => SCENE.bound.length), '| stranded =', await H.ev(() => SCENE.structures.filter(s => s.stranded).length));

  // vector terrain: baked boundary updates + deterministic repaint
  L('-- §22 vector bake --');
  await page.click('#themeBtn'); await H.wait(300);
  await page.click('[data-tm="vector"]'); await H.wait(900);
  await page.click('#themeBtn'); await H.wait(300);
  const bake0 = await H.ev(() => { const g = terrain.getContext('2d'); const d = g.getImageData(0, 0, W, H).data; let h = 0; for (let i = 0; i < d.length; i += 9973) h = (h * 33 + d[i]) >>> 0; return h; });
  await H.ev(() => { paintTerrain(); }); await H.wait(400);
  const bake1 = await H.ev(() => { const g = terrain.getContext('2d'); const d = g.getImageData(0, 0, W, H).data; let h = 0; for (let i = 0; i < d.length; i += 9973) h = (h * 33 + d[i]) >>> 0; return h; });
  L('22. repaint deterministic (same forest) =', bake0 === bake1, '(' + bake0 + ' vs ' + bake1 + ')');
  const vv = await H.ev(() => { const [sx, sy] = worldToScreen(SCENE.bound[0][0], SCENE.bound[0][1]); return [sx / DPR, sy / DPR]; });
  if (vv[0] > 60 && vv[1] > 60 && vv[0] < 1540 && vv[1] < 940) {
    await page.mouse.move(vv[0], vv[1]); await page.mouse.down(); await page.mouse.move(vv[0] + 40, vv[1] + 30, { steps: 6 }); await page.mouse.up(); await H.wait(700);
    const bake2 = await H.ev(() => { const g = terrain.getContext('2d'); const d = g.getImageData(0, 0, W, H).data; let h = 0; for (let i = 0; i < d.length; i += 9973) h = (h * 33 + d[i]) >>> 0; return h; });
    L('22. baked line updated after edit =', bake1 !== bake2);
    await page.click('#undoBtn'); await H.wait(500);
  } else L('22. (vertex0 not reachable on screen for the vector-bake edit)');
  await H.shot('22e-vector-boundary');
  L('22. vector mode: canvas boundary/road overlay drawn? (drawn only when a raster plate is active) — activePlate =', await H.ev(() => !!activePlate()));
  await page.click('#boundBtn'); await H.wait(400);

  /* ================= 23. TERRAIN + PAINTED + CURATION ================= */
  L('\n########## §23 TERRAIN / PAINTED / CURATION ##########');
  await page.click('#themeBtn'); await H.wait(300);
  const tchips = await H.ev(() => [...document.querySelectorAll('[data-tm]')].map(b => ({ tm: b.dataset.tm, txt: b.textContent, on: b.classList.contains('on'), disp: getComputedStyle(b).display })));
  L('23. terrain chips:', JSON.stringify(tchips), '| paintPlate loaded =', await H.ev(() => !!paintPlate));
  for (const tm of ['sat', 'paint', 'vector']) {
    await H.clearToasts();
    await page.click(`[data-tm="${tm}"]`); await H.wait(900);
    const mmH = await H.mmHash();
    L('23. terrain=' + tm, '| toast', JSON.stringify(await H.toasts()), '| activePlate =', await H.ev(() => !!activePlate()), '| minimap hash', mmH, '| chips on', JSON.stringify(await H.ev(() => [...document.querySelectorAll('[data-tm]')].map(b => b.classList.contains('on')))));
    await H.shot('23a-terrain-' + tm);
  }
  await page.click('[data-tm="paint"]'); await H.wait(700);
  // Vision overlays + mist over the painted plate
  await page.click('#themeBtn'); await H.wait(200);
  await page.click('#lyVision'); await H.wait(900); await H.shot('23b-paint-vision');
  await page.click('#lyNow'); await H.wait(900); await H.shot('23c-paint-now-mist');
  await page.click('#themeBtn'); await H.wait(300);

  // Painted icon style
  await page.click('[data-im="painted"]'); await H.wait(900);
  L('23. painted maia:', JSON.stringify(await H.maia(1)));
  const paintState = await H.ev(() => { const o = { painted: 0, bp: 0, fallback: [], total: 0 }; for (const s of SCENE.structures) { const p = pEls[s.key]; if (!p) continue; o.total++; if (s.state === 'blueprint') { o.bp++; continue } if (p.classList.contains('m-painted')) o.painted++; else o.fallback.push(s.key + ':' + s.archetype); } return o; });
  L('23. painted icons:', JSON.stringify(paintState));
  L('23. sprite families =', await H.ev(() => Object.keys(SPRITES).length), '| all have data =', await H.ev(() => Object.values(SPRITES).every(v => typeof v === 'string' && v.length > 200)));
  await H.shot('23d-painted-icons');

  // curation grid
  await page.click('#themeBtn'); await H.wait(250);
  if (!(await H.ev(() => buildMode))) { await page.click('#buildBtn'); await H.wait(600); }
  await page.click('#spriteBtn'); await H.wait(700);
  const cur = await H.ev(() => ({ cells: document.querySelectorAll('#curGrid .curCell').length, imgs: document.querySelectorAll('#curGrid img').length, svgOnly: [...document.querySelectorAll('#curGrid .curCell')].filter(c => !c.querySelector('img')).map(c => c.querySelector('.nm').textContent), broken: [...document.querySelectorAll('#curGrid img')].filter(i => !i.complete || i.naturalWidth === 0).length }));
  L('23. curation grid:', JSON.stringify(cur));
  await H.shot('23e-curation');
  // approve toggle -> live swap
  await H.clearToasts();
  const fam = 'kitchen';
  const beforeSwap = await H.ev(f => { const s = SCENE.structures.find(x => { const fm = (ARCHMAP[x.archetype] || {}).icon || x.archetype; return fm === f && x.state !== 'blueprint' }); return s ? { key: s.key, painted: pEls[s.key].classList.contains('m-painted') } : null; }, fam);
  await page.click(`#curGrid [data-cok="${fam}"]`); await H.wait(800);
  const afterSwap = await H.ev(f => { const s = SCENE.structures.find(x => { const fm = (ARCHMAP[x.archetype] || {}).icon || x.archetype; return fm === f && x.state !== 'blueprint' }); return { ok: window.SPRITE_OK[f], painted: s ? pEls[s.key].classList.contains('m-painted') : null, cellOff: document.querySelector(`#curGrid [data-cok="${f}"]`).closest('.curCell').classList.contains('off'), btn: document.querySelector(`#curGrid [data-cok="${f}"]`).textContent }; }, fam);
  L('23. un-approve "' + fam + '":', JSON.stringify(beforeSwap), '->', JSON.stringify(afterSwap));
  await H.shot('23f-curation-unapproved');
  await page.click(`#curGrid [data-cok="${fam}"]`); await H.wait(700);
  L('23. re-approve ->', JSON.stringify(await H.ev(f => ({ ok: window.SPRITE_OK[f] }), fam)));
  // re-roll marks + accumulating toast
  await H.clearToasts();
  await page.click('#curGrid [data-crr="spring"]'); await H.wait(500);
  L('23. re-roll #1 toast:', JSON.stringify(await H.toasts()));
  await page.click('#curGrid [data-crr="tank"]'); await H.wait(500);
  L('23. re-roll #2 toast:', JSON.stringify(await H.toasts()));
  L('23. marked =', await H.ev(() => Object.keys(window.SPRITE_RR).filter(k => window.SPRITE_RR[k])));
  await page.click('#curClose'); await H.wait(400);
  L('23. curation closed =', await H.ev(() => !document.getElementById('curation').classList.contains('show')));

  // eyeball pass: wide / close / night in Painted + Painted
  L('-- §23 eyeball passes --');
  await page.click('#buildBtn'); await H.wait(500);
  await H.ev(() => { travel = null; cam.x = 1450; cam.y = 700; cam.z = 0.75; clampCam(); dayAuto = false; dayPhase = 0.5; }); await H.wait(900);
  await H.shot('23g-painted-wide-day');
  await H.ev(() => { travel = null; cam.x = BY.community.x; cam.y = BY.community.y; cam.z = 2.0; clampCam(); }); await H.wait(900);
  await H.shot('23h-painted-close-day');
  await H.ev(() => { dayPhase = 1.85; }); await H.wait(900);
  await H.shot('23i-painted-close-night');
  await H.ev(() => { travel = null; cam.z = 0.75; clampCam(); }); await H.wait(800);
  await H.shot('23j-painted-wide-night');
  // labels always on top of sprites
  const lab = await H.ev(() => { const out = []; for (const s of SCENE.structures.slice(0, 12)) { const b = bEls[s.key], p = pEls[s.key]; if (!b || getComputedStyle(b).display === 'none') continue; const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 2 || y < 2 || x > innerWidth - 2 || y > innerHeight - 2) continue; const t = document.elementFromPoint(x, y); out.push([s.key, t ? (t.className || t.tagName) + '' : null, b.contains(t) || t === b]); } return out; });
  L('23. label-on-top hit tests:', JSON.stringify(lab));
  L('23. labels always win =', lab.every(x => x[2]));
  await H.ev(() => { dayPhase = 0.35; }); await H.wait(400);
  let bad2 = await H.badText(); L('23. badText:', JSON.stringify(bad2));
};
