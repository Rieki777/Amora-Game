// Sections 17-20
module.exports = async function (page, H) {
  const L = H.log;
  const snap = () => H.ev(() => ({
    n: SCENE.structures.length, seats: SCENE.seats.length, quests: SCENE.quests.length,
    badge: document.getElementById('attnBadge').textContent,
    pois: Object.keys(pEls).length, banners: Object.keys(bEls).filter(k => !/^[dg]_/.test(k)).length,
    undo: UNDO.length, edits: EDITS.length,
  }));

  /* ================= 17. BUILD BASICS ================= */
  L('\n########## §17 BUILD BASICS ##########');
  await page.keyboard.press('h'); await H.wait(1600);
  await H.ev(() => { cam.z = 1.15; clampCam(); }); await H.wait(300);
  const s0 = await snap(); L('17. baseline', JSON.stringify(s0));

  // Wall open first, then Build on — old B2: Wall must never cover the Build button
  await page.click('#wallBtn'); await H.wait(400);
  await page.click('#buildBtn'); await H.wait(700);
  const rW = await H.rect('#wall'), rB = await H.rect('#buildBtn'), rBar = await H.rect('#buildBar');
  const ov = (a, b) => !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
  L('17. build on =', await H.ev(() => buildMode), '| body class', await H.ev(() => document.body.className));
  L('17. #wall', JSON.stringify(rW), '\n     #buildBtn', JSON.stringify(rB), '-> wall covers build btn =', ov(rW, rB));
  L('17. #buildBar', JSON.stringify(rBar), '-> wall beside palette (wall.l>bar.r) =', rW.l >= rBar.r);
  L('17. buildBtn topmost =', await H.topAt(Math.round((rB.l + rB.r) / 2), Math.round((rB.t + rB.b) / 2)));
  L('17. maia:', JSON.stringify(await H.maia(1)));
  // wall rows in build mode open the INSPECT card
  const wr0 = await H.ev(() => [...document.querySelectorAll('#wallList .wallrow')].length);
  await page.locator('#wallList .wallrow').nth(0).click(); await H.wait(1200);
  L('17. wall row in build mode ->', JSON.stringify(await H.ev(() => ({ inspect: document.getElementById('inspect').classList.contains('open'), panel: document.getElementById('panel').classList.contains('open'), key: inspKey }))));
  await H.closeInspect();
  await H.shot('17a-build-on');
  await page.click('#wallBtn'); await H.wait(300); // close wall for now

  // palette inventory
  const pal = await H.ev(() => ({ cats: [...document.querySelectorAll('#palette h5')].map(h => h.textContent), items: document.querySelectorAll('#palette .palItem').length, regs: REG.length }));
  L('17. palette categories(' + pal.cats.length + '):', JSON.stringify(pal.cats));
  L('17. palette items =', pal.items, '| REG length =', pal.regs);
  // outlines + ✕ on every icon
  const marks = await H.ev(() => { let o = 0, x = 0; for (const k in pEls) { const e = pEls[k]; if (getComputedStyle(e).outlineStyle === 'dashed') o++; const r = e.querySelector('.rm'); if (r && getComputedStyle(r).display !== 'none') x++; } return { total: Object.keys(pEls).length, outlined: o, xs: x }; });
  L('17. dashed outlines / ✕ marks:', JSON.stringify(marks));

  // ---- place: ghost follows cursor, red outside, rejection, Esc cancel ----
  L('-- §17 ghost + boundary rejection --');
  await page.click('#palette .palItem >> text=Greenhouse'); await H.wait(400);
  L('17. placing =', JSON.stringify(await H.ev(() => placing)), '| ghost display', await H.ev(() => document.getElementById('ghostPoi').style.display), '| body', await H.ev(() => document.body.className));
  await page.mouse.move(760, 520); await H.wait(200);
  const g1 = await H.ev(() => ({ tr: document.getElementById('ghostPoi').style.transform, bad: document.getElementById('ghostPoi').classList.contains('bad') }));
  // find a screen point OUTSIDE the property line
  const outPt = await H.landPt(false, 3);
  await page.mouse.move(outPt[0], outPt[1]); await H.wait(250);
  const g2 = await H.ev(() => ({ tr: document.getElementById('ghostPoi').style.transform, bad: document.getElementById('ghostPoi').classList.contains('bad'), ringStroke: getComputedStyle(document.querySelector('#ghostPoi .ring')).stroke }));
  L('17. ghost inside:', JSON.stringify(g1), '\n17. ghost outside @' + outPt + ':', JSON.stringify(g2));
  await H.shot('17b-ghost-outside-red');
  await H.clearToasts();
  const before = await snap();
  await page.mouse.click(outPt[0], outPt[1]); await H.wait(500);
  const afterRej = await snap();
  L('17. click outside -> toast', JSON.stringify(await H.toasts()), '| structures', before.n, '->', afterRej.n, '| placing still active =', await H.ev(() => !!placing));
  // Esc cancels
  await page.keyboard.press('Escape'); await H.wait(300);
  L('17. Esc -> placing =', await H.ev(() => placing), '| ghost display', await H.ev(() => document.getElementById('ghostPoi').style.display));

  // ---- pass-through placement: click right on top of an existing icon ----
  L('-- §17 pass-through placement --');
  await page.click('#palette .palItem >> text=Apiary'); await H.wait(350);
  const gh = await H.poiHit('council');
  const passTop = await H.topAt(gh.x, gh.y);
  await H.clearToasts();
  const bp = await snap();
  await page.mouse.move(gh.x, gh.y); await H.wait(150);
  await page.mouse.click(gh.x, gh.y); await H.wait(700);
  const ap = await snap();
  L('17. topmost under ghost while placing =', passTop);
  L('17. placed over an existing icon: structures', bp.n, '->', ap.n, '| toast', JSON.stringify(await H.toasts()));
  L('17. inspect auto-opened =', await H.ev(() => ({ open: document.getElementById('inspect').classList.contains('open'), key: inspKey })));
  await H.shot('17c-passthrough-place');
  await H.closeInspect();

  // ---- focus trap probe: after the inspect card closes, do global hotkeys still work? ----
  L('-- §17 hotkeys after closing the inspect card --');
  const fa = await H.ev(() => { const a = document.activeElement; return { tag: a.tagName, id: a.id, insideInspect: !!document.getElementById('inspect').contains(a) }; });
  const kb0 = await H.ev(() => ({ undo: UNDO.length, n: SCENE.structures.length, wall: document.getElementById('wall').classList.contains('show'), cam: [Math.round(cam.x), Math.round(cam.y)] }));
  await page.keyboard.press('Control+z'); await H.wait(400);
  await page.keyboard.press('w'); await H.wait(300);
  await page.keyboard.press('h'); await H.wait(900);
  const kb1 = await H.ev(() => ({ undo: UNDO.length, n: SCENE.structures.length, wall: document.getElementById('wall').classList.contains('show'), cam: [Math.round(cam.x), Math.round(cam.y)] }));
  L('17. activeElement after closing inspect:', JSON.stringify(fa));
  L('17. before hotkeys', JSON.stringify(kb0), '\n17. after Ctrl+Z / w / h', JSON.stringify(kb1));
  L('17. ANY hotkey took effect =', JSON.stringify(kb0) !== JSON.stringify(kb1));
  // now click bare land and retry the same keys
  const bare = await H.landPt(true, 2);
  await page.mouse.click(bare[0], bare[1]); await H.wait(300);
  const kb2a = await H.ev(() => ({ undo: UNDO.length, n: SCENE.structures.length, wall: document.getElementById('wall').classList.contains('show'), cam: [Math.round(cam.x), Math.round(cam.y)], act: document.activeElement.tagName }));
  await page.keyboard.press('Control+z'); await H.wait(400);
  await page.keyboard.press('w'); await H.wait(300);
  const kb2 = await H.ev(() => ({ undo: UNDO.length, n: SCENE.structures.length, wall: document.getElementById('wall').classList.contains('show') }));
  L('17. after clicking bare land', JSON.stringify(kb2a), '-> Ctrl+Z / w ->', JSON.stringify(kb2), '| now working =', kb2.undo !== kb2a.undo || kb2.wall !== kb2a.wall);
  if (await H.ev(() => document.getElementById('wall').classList.contains('show'))) { await page.click('#wallBtn'); await H.wait(300); }
  await H.closeInspect();

  // ---- one item from EACH category ----
  L('-- §17 one per category --');
  const cats = pal.cats;
  const placed = [];
  for (let ci = 0; ci < cats.length; ci++) {
    const label = await H.ev(ci => { const kids = [...document.getElementById('palette').children]; const hi = kids.findIndex(e => e.tagName === 'H5' && e.textContent === [...document.querySelectorAll('#palette h5')][ci].textContent); for (let j = hi + 1; j < kids.length; j++) { if (kids[j].tagName === 'H5') break; if (kids[j].classList.contains('palItem')) return kids[j].textContent.trim(); } return null; }, ci);
    await page.locator('#palette .palItem', { hasText: label }).first().click(); await H.wait(250);
    // drop it on a random-ish point inside the boundary
    const inPt = await H.landPt(true, ci + 1);
    await page.mouse.move(inPt[0], inPt[1]); await H.wait(120);
    await page.mouse.click(inPt[0], inPt[1]); await H.wait(450);
    const k = await H.ev(() => SCENE.structures[SCENE.structures.length - 1].key);
    const okIns = await H.ev(() => document.getElementById('inspect').classList.contains('open'));
    placed.push({ cat: cats[ci], label, key: k, pt: inPt, inspect: okIns });
    await H.closeInspect();
  }
  L('17. placed one per category:', JSON.stringify(placed));
  const sAfterPlace = await snap(); L('17. after placements', JSON.stringify(sAfterPlace));
  await H.shot('17d-one-per-category');

  // ---- drag inside (sticks) and outside (snaps back) ----
  L('-- §17 drag --');
  const dragKey = placed[0].key;
  await H.center(dragKey, 1.2);
  let hit = await H.poiHit(dragKey);
  const p0 = await H.ev(k => [Math.round(BY[k].x), Math.round(BY[k].y)], dragKey);
  await page.mouse.move(hit.x, hit.y); await page.mouse.down();
  await page.mouse.move(hit.x + 70, hit.y + 45, { steps: 8 }); await page.mouse.up(); await H.wait(400);
  const p1 = await H.ev(k => [Math.round(BY[k].x), Math.round(BY[k].y)], dragKey);
  L('17. drag inside:', JSON.stringify(p0), '->', JSON.stringify(p1), '| moved =', p0[0] !== p1[0] || p0[1] !== p1[1]);
  // drag outside the line
  await H.clearToasts();
  hit = await H.poiHit(dragKey);
  const outPt2 = await H.landPt(false, 7);
  await page.mouse.move(hit.x, hit.y); await page.mouse.down();
  await page.mouse.move(outPt2[0], outPt2[1], { steps: 10 }); await page.mouse.up(); await H.wait(500);
  const p2 = await H.ev(k => [Math.round(BY[k].x), Math.round(BY[k].y)], dragKey);
  L('17. drag outside -> pos', JSON.stringify(p2), '| snapped back =', p1[0] === p2[0] && p1[1] === p2[1], '| toast', JSON.stringify(await H.toasts()));

  // ---- remove the Greenhouse: map + minimap + Wall + badge ----
  L('-- §17 remove + undo --');
  await page.click('#wallBtn'); await H.wait(400);
  const beforeRm = await snap();
  const wallBefore = await H.ev(() => ({ rows: document.querySelectorAll('#wallList .wallrow').length, hasGh: [...document.querySelectorAll('#wallList .wallrow')].filter(r => r.textContent.includes('Greenhouse')).length }));
  await H.center('greenhouse', 1.5);
  const ghHit = await H.ev(() => { const e = pEls['greenhouse'].querySelector('.rm'); const r = e.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; const top = document.elementFromPoint(x, y); return { x, y, disp: getComputedStyle(e).display, topIsOurs: top === e, top: (top && (top.className || top.tagName)) + '' }; });
  L('17. greenhouse ✕ hit-test:', JSON.stringify(ghHit));
  await H.clearToasts();
  await page.mouse.click(ghHit.x, ghHit.y); await H.wait(700);
  const afterRm = await snap();
  const wallAfter = await H.ev(() => ({ rows: document.querySelectorAll('#wallList .wallrow').length, hasGh: [...document.querySelectorAll('#wallList .wallrow')].filter(r => r.textContent.includes('Greenhouse')).length }));
  const mmAfter = await H.ev(() => SCENE.structures.some(s => s.key === 'greenhouse'));
  L('17. ✕ removed greenhouse. toast', JSON.stringify(await H.toasts()));
  L('17.  before', JSON.stringify(beforeRm), 'wall', JSON.stringify(wallBefore));
  L('17.  after ', JSON.stringify(afterRm), 'wall', JSON.stringify(wallAfter));
  L('17.  poi gone =', await H.ev(() => !pEls['greenhouse']), '| BY gone =', await H.ev(() => !BY['greenhouse']), '| in SCENE =', mmAfter);
  await H.shot('17e-after-remove');
  // undo restores seats + quests too
  await page.click('#undoBtn'); await H.wait(700);
  const afterUndo = await snap();
  const wallUndo = await H.ev(() => ({ rows: document.querySelectorAll('#wallList .wallrow').length, hasGh: [...document.querySelectorAll('#wallList .wallrow')].filter(r => r.textContent.includes('Greenhouse')).length }));
  L('17.  undo ->', JSON.stringify(afterUndo), 'wall', JSON.stringify(wallUndo));
  L('17.  restored fully =', afterUndo.n === beforeRm.n && afterUndo.seats === beforeRm.seats && afterUndo.quests === beforeRm.quests && afterUndo.badge === beforeRm.badge);
  await page.click('#wallBtn'); await H.wait(300);

  // ---- undo add / move via button and Ctrl+Z ----
  L('-- §17 undo add & move, button + Ctrl+Z --');
  const uSnap0 = await snap();
  await page.locator('#palette .palItem', { hasText: 'Sauna' }).first().click(); await H.wait(250);
  const inPt3 = await H.landPt(true, 11);
  await page.mouse.move(inPt3[0], inPt3[1]); await H.wait(120); await page.mouse.click(inPt3[0], inPt3[1]); await H.wait(500);
  await H.closeInspect();
  const uAdd = await snap(); L('17. added Sauna ->', JSON.stringify(uAdd));
  await page.keyboard.press('Control+z'); await H.wait(600);
  const uUndo1 = await snap(); L('17. Ctrl+Z undo add ->', JSON.stringify(uUndo1), '| back to baseline =', uUndo1.n === uSnap0.n);
  // move then undo with the button
  const mvKey = placed[1].key;
  await H.center(mvKey, 1.2);
  const mh = await H.poiHit(mvKey);
  const m0 = await H.ev(k => [Math.round(BY[k].x), Math.round(BY[k].y)], mvKey);
  await page.mouse.move(mh.x, mh.y); await page.mouse.down(); await page.mouse.move(mh.x - 60, mh.y - 40, { steps: 8 }); await page.mouse.up(); await H.wait(400);
  const m1 = await H.ev(k => [Math.round(BY[k].x), Math.round(BY[k].y)], mvKey);
  await page.click('#undoBtn'); await H.wait(500);
  const m2 = await H.ev(k => [Math.round(BY[k].x), Math.round(BY[k].y)], mvKey);
  L('17. move', JSON.stringify(m0), '->', JSON.stringify(m1), '-> undo', JSON.stringify(m2), '| restored =', m0[0] === m2[0] && m0[1] === m2[1]);
  // multiple undos in a row
  const multi = [];
  for (let i = 0; i < 4; i++) { await page.click('#undoBtn'); await H.wait(400); multi.push((await snap()).n); }
  L('17. 4 more undos -> structure counts', JSON.stringify(multi));
  await H.clearToasts();
  for (let i = 0; i < 25; i++) { await page.click('#undoBtn'); await H.wait(120); }
  L('17. undo past the end -> toast', JSON.stringify(await H.toasts()), '| final', JSON.stringify(await snap()));
  await H.shot('17f-after-undo-all');

  /* ================= 18. AMBIENT ================= */
  L('\n########## §18 AMBIENT ##########');
  await page.click('#buildBtn'); await H.wait(500); // build off
  L('18. build off =', await H.ev(() => !buildMode));
  await H.ev(() => { document.getElementById('maiaLog').innerHTML = ''; });
  await H.clearToasts();
  const amb0 = await H.ev(() => ({ birds: birds.map(b => +b.p.toFixed(3)), sparkles: sparkles.length, smoke: smoke.length }));
  const t0 = Date.now(); const seenToasts = new Set(); let maiaN0 = await H.maiaCount();
  for (let i = 0; i < 32; i++) {
    await H.wait(1000);
    (await H.toasts()).forEach(t => seenToasts.add(t));
  }
  const amb1 = await H.ev(() => ({ birds: birds.map(b => +b.p.toFixed(3)), sparkles: sparkles.length, smoke: smoke.length }));
  L('18. 32s watch: birds', JSON.stringify(amb0.birds), '->', JSON.stringify(amb1.birds), '| smoke', amb0.smoke, '->', amb1.smoke);
  L('18. pulse toasts seen (' + seenToasts.size + '):', JSON.stringify([...seenToasts]));
  L('18. maia lines added during 32s =', (await H.maiaCount()) - maiaN0, JSON.stringify(await H.maia(2)));
  await H.shot('18a-ambient');

  // pulse guard: remove the Greenhouse (a pulse target) and wait past a pulse tick
  L('-- §18 pulse guard --');
  await page.click('#buildBtn'); await H.wait(500);
  await H.center('greenhouse', 1.3);
  const gx = await H.ev(() => { const e = pEls['greenhouse'].querySelector('.rm'); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await page.mouse.click(gx[0], gx[1]); await H.wait(500);
  L('18. greenhouse removed =', await H.ev(() => !BY['greenhouse']), '| pulse entries pointing at it =', await H.ev(() => SCENE.pulse.filter(p => p.at === 'greenhouse').length));
  const errBefore = H.errors.length;
  await H.wait(31000);   // two pulse ticks
  L('18. errors during 31s with greenhouse gone:', H.errors.length - errBefore);
  await page.click('#undoBtn'); await H.wait(600);
  L('18. undo restored greenhouse =', await H.ev(() => !!BY['greenhouse']), JSON.stringify(await snap()));
  await page.click('#buildBtn'); await H.wait(400);

  /* ================= 19. RESIZE ================= */
  L('\n########## §19 RESIZE ##########');
  const glue = async (tag) => {
    const d = await H.ev(() => { const out = []; for (const s of SCENE.structures.slice(0, 6)) { const el = pEls[s.key]; if (!el) continue; const r = el.getBoundingClientRect(); const [sx, sy] = worldToScreen(s.x, s.y); out.push([s.key, Math.round(r.left + r.width / 2 - sx / DPR), Math.round(r.top + r.height / 2 - sy / DPR)]); } return out; });
    L('19.', tag, 'icon-vs-world offset (px):', JSON.stringify(d));
    L('19.', tag, 'canvas', await H.ev(() => [cv.width, cv.height, cv.style.width, cv.style.height, innerWidth, innerHeight]), '| blackEdge', JSON.stringify(await H.blackEdge()));
    const hud = {}; for (const s of ['#layers', '#dayBtn', '#themeBtn', '#minimapWrap', '#attention', '#maia']) hud[s] = await H.rect(s);
    const rl = hud['#layers'], rd = hud['#dayBtn'], rt = hud['#themeBtn'];
    L('19.', tag, 'layers/day overlap =', !(rl.r <= rd.l || rd.r <= rl.l || rl.b <= rd.t || rd.b <= rl.t), '| day/theme overlap =', !(rd.r <= rt.l || rt.r <= rd.l || rd.b <= rt.t || rt.b <= rd.t), '| minimap', JSON.stringify(hud['#minimapWrap']));
  };
  await glue('1600x1000');
  await page.setViewportSize({ width: 1100, height: 700 }); await H.wait(900); await glue('1100x700'); await H.shot('19a-1100x700');
  await page.setViewportSize({ width: 900, height: 620 }); await H.wait(900); await glue('900x620'); await H.shot('19b-900x620');
  await page.setViewportSize({ width: 1920, height: 1080 }); await H.wait(900); await glue('1920x1080'); await H.shot('19c-1920x1080');
  await page.setViewportSize({ width: 1600, height: 1000 }); await H.wait(900); await glue('1600x1000-back');
  await H.shot('19d-back-to-1600');

  /* ================= 20. KEYBOARD-IN-FIELDS GUARD ================= */
  L('\n########## §20 KEYBOARD GUARD ##########');
  const probe = async (sel, label, opts = {}) => {
    const b = await H.ev(() => ({ cam: [Math.round(cam.x), Math.round(cam.y), +cam.z.toFixed(3)], mode, wall: document.getElementById('wall').classList.contains('show'), tour: tourI, attn: document.getElementById('attnCard').classList.contains('show'), day: +dayPhase.toFixed(2) }));
    await page.click(sel); await H.wait(150);
    await page.type(sel, 'who is having a vast week', { delay: 25 });
    await page.press(sel, 'ArrowLeft'); await page.press(sel, 'ArrowUp'); await page.press(sel, 'ArrowRight'); await page.press(sel, 'ArrowDown');
    await page.type(sel, ' +- h w v t', { delay: 25 });
    await H.wait(400);
    const a = await H.ev(() => ({ cam: [Math.round(cam.x), Math.round(cam.y), +cam.z.toFixed(3)], mode, wall: document.getElementById('wall').classList.contains('show'), tour: tourI, attn: document.getElementById('attnCard').classList.contains('show'), day: +dayPhase.toFixed(2) }));
    const val = await H.ev(s => document.querySelector(s).value, sel);
    L('20.', label, '\n     before', JSON.stringify(b), '\n     after ', JSON.stringify(a));
    L('20.', label, 'field value =', JSON.stringify(val), '| spaces kept =', (val.match(/ /g) || []).length);
    const changed = JSON.stringify([b.cam, b.mode, b.wall, b.tour, b.attn]) !== JSON.stringify([a.cam, a.mode, a.wall, a.tour, a.attn]);
    L('20.', label, 'MAP REACTED =', changed);
    if (opts.clear !== false) await page.fill(sel, '');
    return changed;
  };
  await probe('#maiaText', 'Maia box');
  await page.click('#themeBtn'); await H.wait(300);
  await probe('#aiWords', 'theme words');
  await page.click('#themeBtn'); await H.wait(250);
  // resolver + inspect fields (build mode)
  await page.click('#buildBtn'); await H.wait(600);
  await page.click('#resolverBtn'); await H.wait(500);
  await probe('#rqText', 'resolver text');
  L('20. Escape inside resolver...');
  await page.click('#rqText'); await page.keyboard.press('Escape'); await H.wait(400);
  L('20.  resolver open =', await H.ev(() => document.getElementById('resolver').classList.contains('show')), '| inspect open =', await H.ev(() => document.getElementById('inspect').classList.contains('open')), '| panel open =', await H.ev(() => document.getElementById('panel').classList.contains('open')));
  await H.clickPoi('kitchen'); await H.wait(1000);
  L('20. inspect open =', await H.ev(() => document.getElementById('inspect').classList.contains('open')));
  await probe('#iName', 'inspect name', { clear: false });
  await page.click('#iBlurb'); await page.keyboard.press('Escape'); await H.wait(400);
  L('20.  Escape in inspect -> inspect open =', await H.ev(() => document.getElementById('inspect').classList.contains('open')));
  await H.shot('20a-keyboard-guard');
  await page.click('#buildBtn'); await H.wait(500);
};
