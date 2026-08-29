// Sections 1-10
module.exports = async function (page, H) {
  const L = H.log;

  /* ================= 1. INTRO ================= */
  L('\n########## §1 INTRO ##########');
  const hudIds = ['#vitals', '#layers', '#dayBtn', '#themeBtn', '#wallBtn', '#buildBtn', '#minimapWrap', '#attention', '#maia', '#toasts'];
  const dim = {};
  for (const s of hudIds) dim[s] = (await H.rect(s)).op;
  L('1. body.intro=', await H.ev(() => document.body.className), ' HUD opacities:', JSON.stringify(dim));
  L('1. introCard z=', await H.ev(() => getComputedStyle(document.getElementById('introCard')).zIndex));
  const probes = [[800, 500], [200, 100], [1450, 60], [120, 940], [1500, 940], [800, 30]];
  for (const [x, y] of probes) L(`1. topmost @${x},${y} =`, await H.topAt(x, y));
  await H.shot('01a-intro-dimmed');

  await page.click('#enterBtn');
  await H.wait(3000);
  const dim2 = {}; for (const s of hudIds) dim2[s] = (await H.rect(s)).op;
  L('1. after Enter: body=', await H.ev(() => document.body.className), 'HUD opacities:', JSON.stringify(dim2));
  L('1. cam=', JSON.stringify(await H.cam()), 'introCard gone=', await H.ev(() => !document.getElementById('introCard')));
  L('1. maia=', JSON.stringify(await H.maia(2)));
  await H.shot('01b-after-enter');

  /* ================= 2. CAMERA ================= */
  L('\n########## §2 CAMERA ##########');
  const c0 = await H.cam();
  await page.mouse.move(800, 500); await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(800 - i * 26, 500 - i * 13); await H.wait(16); }
  await page.mouse.up();
  const cUp = await H.cam(); await H.wait(800); const cIn = await H.cam();
  L('2. drag', JSON.stringify(c0), '-> up', JSON.stringify(cUp), '-> +800ms', JSON.stringify(cIn));
  L('2. inertia glide px =', (Math.abs(cIn.x - cUp.x) + Math.abs(cIn.y - cUp.y)).toFixed(1));

  const cur = [1150, 320];
  const wB = await H.ev(([x, y]) => screenToWorld(x, y).map(v => +v.toFixed(1)), cur);
  await page.mouse.move(cur[0], cur[1]);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -120); await H.wait(70); }
  const wA = await H.ev(([x, y]) => screenToWorld(x, y).map(v => +v.toFixed(1)), cur);
  L('2. wheel-in world-under-cursor', wB, '->', wA, 'drift', (Math.abs(wA[0] - wB[0]) + Math.abs(wA[1] - wB[1])).toFixed(2), 'cam', JSON.stringify(await H.cam()));
  await H.shot('02a-wheel-in');
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, 120); await H.wait(50); }
  L('2. wheel-out cam', JSON.stringify(await H.cam()), 'blackEdge', JSON.stringify(await H.blackEdge()));
  await H.shot('02b-wheel-out-min');

  await page.mouse.dblclick(420, 760); await H.wait(1500);
  L('2. dblclick cam', JSON.stringify(await H.cam()), 'blackEdge', JSON.stringify(await H.blackEdge()));
  const kb = await H.cam();
  await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowUp'); await H.wait(200);
  L('2. arrows', JSON.stringify(kb), '->', JSON.stringify(await H.cam()));
  await page.keyboard.press('+'); await H.wait(120); const z1 = (await H.cam()).z;
  await page.keyboard.press('-'); await page.keyboard.press('-'); await H.wait(200); const z2 = (await H.cam()).z;
  L('2. +/- zoom ->', z1, z2, 'blackEdge', JSON.stringify(await H.blackEdge()));
  await page.keyboard.press('h'); await H.wait(1600);
  L('2. H home', JSON.stringify(await H.cam()), 'blackEdge', JSON.stringify(await H.blackEdge()));
  await H.shot('02c-home');

  // black-edge hunt: min zoom then shove to every corner
  for (let i = 0; i < 14; i++) { await page.mouse.wheel(0, 120); await H.wait(35); }
  for (const [dx, dy] of [[1400, 900], [-2800, 0], [0, -1800], [2800, 1800]]) {
    await page.mouse.move(800, 500); await page.mouse.down(); await page.mouse.move(800 + dx, 500 + dy, { steps: 10 }); await page.mouse.up(); await H.wait(450);
    const be = await H.blackEdge(); if (be.length) L('2. !! blackEdge after drag', dx, dy, JSON.stringify(be));
  }
  L('2. min-zoom corners done, cam', JSON.stringify(await H.cam()), 'blackEdge', JSON.stringify(await H.blackEdge()));
  await H.shot('02d-minzoom-corner');

  /* ================= 3. HOVER ================= */
  L('\n########## §3 HOVER ##########');
  await page.keyboard.press('h'); await H.wait(1700);
  for (const k of ['greenhouse', 'kitchen', 'ponds', 'ridgeA', 'sanctuary']) {
    await H.hoverPoi(k);
    const hv = await H.ev(() => { const h = document.getElementById('hovercard'); const r = h.getBoundingClientRect(); return { d: getComputedStyle(h).display, txt: h.textContent.replace(/\s+/g, ' ').trim(), top: Math.round(r.top), left: Math.round(r.left) }; });
    L('3.', k, JSON.stringify(hv));
    if (k === 'greenhouse') await H.shot('03a-hover-greenhouse');
    await page.mouse.move(30, 970); await H.wait(220);
    L('3.  after leave d=', await H.ev(() => getComputedStyle(document.getElementById('hovercard')).display));
  }

  /* ================= 4. PORTAL PANELS ================= */
  L('\n########## §4 PORTAL PANELS ##########');
  const set = ['greenhouse', 'spring2', 'sanctuary', 'tank', 'kitchen', 'library', 'gate', 'ridgeA', 'council'];
  for (const k of set) {
    await H.clickPoi(k); await H.wait(900);
    const p = await H.ev(() => ({ open: document.getElementById('panel').classList.contains('open'), head: document.getElementById('panelHead').textContent.replace(/\s+/g, ' ').trim(), tabs: [...document.getElementById('tabs').children].map(b => b.textContent) }));
    L('4.', k, 'open=' + p.open, '| head:', p.head, '| tabs', p.tabs.length);
    for (let i = 0; i < 4; i++) {
      await page.click(`#tabs button[data-i="${i}"]`); await H.wait(180);
      const b = await H.ev(() => document.getElementById('panelBody').textContent.replace(/\s+/g, ' ').trim().slice(0, 100));
      if (i > 0) L('4.   tab' + i, b.slice(0, 80));
    }
    const bad = await H.badText(); if (bad.length) L('4. !! badText@' + k, JSON.stringify(bad));
    await page.keyboard.press('Escape'); await H.wait(300);
  }
  await H.clickPoi('greenhouse'); await H.wait(800);
  await H.shot('04a-panel-greenhouse');
  // claim quest
  await page.click('#tabs button[data-i="1"]'); await H.wait(250);
  await H.clearToasts();
  await page.click('#panelBody .qcard .btn'); await H.wait(350);
  L('4. claim toast=', JSON.stringify(await H.toasts()), '| maia=', JSON.stringify(await H.maia(1)));
  // raise a hand
  await page.click('#tabs button[data-i="2"]'); await H.wait(250);
  await H.clearToasts();
  await page.click('#panelBody .seatrow .btn'); await H.wait(350);
  L('4. raise-hand toast=', JSON.stringify(await H.toasts()));
  // every door on Enter tab
  await page.click('#tabs button[data-i="3"]'); await H.wait(250);
  const nDoors = await H.ev(() => document.querySelectorAll('#panelBody .doorbtn').length);
  L('4. doors on Enter tab =', nDoors);
  for (let i = 0; i < nDoors; i++) {
    await page.click(`#panelBody .doorbtn:nth-of-type(${i + 1})`); await H.wait(450);
    const m = await H.ev(() => { const b = [...document.querySelectorAll('#moduleCard .btn')].pop(); const r = b.getBoundingClientRect(); return { show: document.getElementById('module').classList.contains('show'), title: document.querySelector('#moduleCard h2').textContent, bx: Math.round(r.left + r.width / 2), by: Math.round(r.top + r.height / 2) }; });
    const top = await H.topAt(m.bx, m.by);
    L('4.  door' + i, m.title, '| back-btn topmost:', top);
    if (i === 0) await H.shot('04b-module-stub');
    await page.click('#moduleCard .btn'); await H.wait(350);
    L('4.  closed=', await H.ev(() => !document.getElementById('module').classList.contains('show')));
  }
  // close via X then Esc
  await page.click('#panelClose'); await H.wait(400);
  L('4. X closed panel=', await H.ev(() => !document.getElementById('panel').classList.contains('open')));
  await H.clickPoi('kitchen'); await H.wait(700);
  await page.keyboard.press('Escape'); await H.wait(400);
  L('4. Esc closed panel=', await H.ev(() => !document.getElementById('panel').classList.contains('open')));

  // ---- close-race (old B3): Water Tank -> X -> immediately click another structure ----
  L('\n-- §4 close-race --');
  await H.clickPoi('tank'); await H.wait(900);
  await page.click('#panelClose');
  const b2 = await H.poiBox('council');
  await page.mouse.click(b2.x, b2.y);           // click THROUGH the closing panel, no wait
  await H.wait(1100);
  const race = await H.ev(() => ({ open: document.getElementById('panel').classList.contains('open'), head: document.getElementById('panelHead').textContent.replace(/\s+/g, ' ').trim(), key: panelKey }));
  L('4. race result:', JSON.stringify(race));
  await H.shot('04c-close-race');
  await page.keyboard.press('Escape'); await H.wait(300);

  // ---- blueprint in Vision ----
  L('\n-- §4 blueprint in Vision --');
  await page.click('#lyVision'); await H.wait(900);
  const bp = await H.poiHit("guest");
  L("4. guest(blueprint) poi:", JSON.stringify(bp));
  await H.clickPoi('guest'); await H.wait(900);
  const bpP = await H.ev(() => ({ open: document.getElementById('panel').classList.contains('open'), head: document.getElementById('panelHead').textContent.replace(/\s+/g, ' ').trim(), body: document.getElementById('panelBody').textContent.replace(/\s+/g, ' ').trim().slice(0, 200) }));
  L('4. blueprint panel:', JSON.stringify(bpP));
  await H.shot('04d-blueprint-panel');
  await page.keyboard.press('Escape'); await H.wait(300);

  /* ================= 5. MINIMAP ================= */
  L('\n########## §5 MINIMAP ##########');
  const mmr = await H.rect('#minimap');
  const corners = [[mmr.l + 6, mmr.t + 6, 'TL'], [mmr.r - 6, mmr.t + 6, 'TR'], [mmr.l + 6, mmr.b - 6, 'BL'], [mmr.r - 6, mmr.b - 6, 'BR']];
  for (const [x, y, nm] of corners) {
    await page.mouse.click(x, y); await H.wait(1500);
    const c = await H.cam(); const be = await H.blackEdge();
    L('5. mm', nm, '-> cam', JSON.stringify(c), 'blackEdge', JSON.stringify(be));
    if (be.length) await H.shot('05-blackedge-' + nm);
  }
  // viewport rect tracking: compare drawn rect to expectation
  const vp = await H.ev(() => {
    const hw = innerWidth / cam.z / 2, hh = innerHeight / cam.z / 2;
    return { exp: [((cam.x - hw) / W * 240).toFixed(1), ((cam.y - hh) / H * 160).toFixed(1), (hw * 2 / W * 240).toFixed(1), (hh * 2 / H * 160).toFixed(1)] };
  });
  L('5. viewport-rect expected px in minimap:', JSON.stringify(vp));
  await H.shot('05a-minimap');
  // mid-travel edge probe: at min zoom, a corner click targets an unclamped point
  L('-- §5 mid-travel edge probe --');
  for (let i = 0; i < 16; i++) { await page.mouse.wheel(0, 120); await H.wait(30); }
  await H.wait(400);
  L('5. min zoom before probe:', JSON.stringify(await H.cam()));
  await page.mouse.click(mmr.l + 3, mmr.t + 3);
  const during = [];
  for (let i = 0; i < 14; i++) { await H.wait(60); const c = await H.cam(); const be = await H.blackEdge(); during.push({ t: i * 60, cam: [c.x, c.y, c.z], travel: c.travel, off: be.length }); if (!c.travel && i > 2) break; }
  L('5. during travel to TL corner:'); during.forEach(d => L('     +' + d.t + 'ms cam' + JSON.stringify(d.cam) + ' travel=' + d.travel + ' offMapCorners=' + d.off));
  L('5. max off-map corners seen mid-travel =', Math.max(...during.map(d => d.off)), '| after settle', JSON.stringify(await H.blackEdge()));
  if (Math.max(...during.map(d => d.off)) > 0) await H.shot('05b-blackedge-midtravel');
  await page.keyboard.press('h'); await H.wait(1500);

  /* ================= 6. VITALS ================= */
  L('\n########## §6 VITALS ##########');
  const vit = await H.ev(() => [...document.querySelectorAll('#vitals .vital')].map(v => ({ t: v.getAttribute('title'), txt: v.textContent.replace(/\s+/g, ' ').trim() })));
  L('6. vitals:', JSON.stringify(vit, null, 0));
  L('6. count(with title)=', vit.filter(v => v.t).length, 'of', vit.length);

  /* ================= 7. LAYERS ================= */
  L('\n########## §7 LAYERS ##########');
  const rL = await H.rect('#layers'), rD = await H.rect('#dayBtn'), rT = await H.rect('#themeBtn');
  L('7. #layers', JSON.stringify(rL));
  L('7. #dayBtn', JSON.stringify(rD));
  L('7. #themeBtn', JSON.stringify(rT));
  const ov = (a, b) => !(a.r <= b.l || b.r <= a.l || a.b <= b.t || b.b <= a.t);
  L('7. OVERLAP layers/day =', ov(rL, rD), ' layers/theme =', ov(rL, rT), ' day/theme =', ov(rD, rT));
  L('7. layer buttons =', await H.ev(() => [...document.querySelectorAll('#layers button')].map(b => b.textContent)));
  await H.shot('07a-layerbar');

  await page.click('#lyNow'); await H.wait(600);
  await page.click('#lyVision'); await H.wait(1200);
  L('7. vision mode=', (await H.cam()).mode, '| maia=', JSON.stringify(await H.maia(1)));
  await H.shot('07b-vision');
  await page.click('#lyNow'); await H.wait(1200);
  L('7. back to now mode=', (await H.cam()).mode);
  await H.shot('07c-now-mist');
  await H.clearToasts();
  await page.click('#lyOrg'); await H.wait(700);
  L('7. org on=', await H.ev(() => orgOn), 'toast', JSON.stringify(await H.toasts()), 'btn.on=', await H.ev(() => document.getElementById('lyOrg').classList.contains('on')));
  await H.shot('07d-org-halos');
  await H.clearToasts();
  await page.click('#lyOrg'); await H.wait(500);
  L('7. org off=', await H.ev(() => orgOn), 'toast', JSON.stringify(await H.toasts()));

  /* ================= 8. DAY / NIGHT ================= */
  L('\n########## §8 DAY/NIGHT ##########');
  for (let i = 0; i < 3; i++) {
    await page.click('#dayBtn'); await H.wait(800);
    const st = await H.ev(() => ({ dayPhase: +dayPhase.toFixed(3), auto: dayAuto, btn: document.getElementById('dayBtn').textContent, night: document.body.classList.contains('night') }));
    L('8. click' + (i + 1), JSON.stringify(st));
    await H.shot('08-day' + (i + 1) + '-phase' + st.dayPhase.toFixed(2));
  }
  // force night and eyeball iso windows + light pools
  await H.ev(() => { dayAuto = false; dayPhase = 1.85; iconMode = 'iso'; });
  await H.wait(900);
  L('8. forced night: night class=', await H.ev(() => document.body.classList.contains('night')));
  await H.shot('08-night-iso');
  await H.ev(() => { iconMode = 'auto'; dayPhase = 0.3; });
  await H.wait(500);

  /* ================= 9. THEMES ================= */
  L('\n########## §9 THEMES ##########');
  await page.click('#themeBtn'); await H.wait(400);
  const swatches = await H.ev(() => [...document.querySelectorAll('.swatchbtn')].map(b => b.dataset.k));
  L('9. presets:', JSON.stringify(swatches));
  for (let i = 0; i < swatches.length; i++) {
    await page.click(`.swatchbtn:nth-of-type(${i + 1})`); await H.wait(600);
    const v = await H.ev(() => { const c = getComputedStyle(document.documentElement); return ['--t-surface', '--t-ring', '--t-icon', '--t-accent', '--gold'].map(k => c.getPropertyValue(k).trim()); });
    const on = await H.ev(() => [...document.querySelectorAll('.swatchbtn')].map(b => b.classList.contains('on')));
    L('9.', swatches[i], JSON.stringify(v), 'onFlags', JSON.stringify(on), '| maia', JSON.stringify(await H.maia(1)));
    const bad = await H.badText(); if (bad.length) L('9. !! badText', JSON.stringify(bad));
    await H.shot('09-theme-' + swatches[i].replace(/\s+/g, '-'));
  }
  await page.click('.swatchbtn:nth-of-type(1)'); await H.wait(500);

  /* ================= 10. ICON STYLE ================= */
  L('\n########## §10 ICON STYLE ##########');
  const chips = await H.ev(() => [...document.querySelectorAll('[data-im]')].map(b => ({ im: b.dataset.im, txt: b.textContent, on: b.classList.contains('on') })));
  L('10. chips:', JSON.stringify(chips));
  const modeOf = () => H.ev(() => { const o = {}; for (const s of SCENE.structures) { const p = pEls[s.key]; o[s.key] = { iso: p.classList.contains('m-iso'), painted: p.classList.contains('m-painted'), bp: s.state === 'blueprint' }; } return o; });
  // Isometric at every zoom
  await page.click('[data-im="iso"]'); await H.wait(500);
  L('10. iso maia=', JSON.stringify(await H.maia(1)));
  for (const z of [0.7, 1.0, 1.4, 2.2]) {
    await H.ev(z => { cam.z = z; clampCam(); }, z); await H.wait(400);
    const m = await modeOf(); const nonBp = Object.entries(m).filter(([, v]) => !v.bp);
    const bp = Object.entries(m).filter(([, v]) => v.bp);
    L(`10. iso @z=${(await H.cam()).z}: non-blueprint iso ${nonBp.filter(([, v]) => v.iso).length}/${nonBp.length} | blueprint iso ${bp.filter(([, v]) => v.iso).length}/${bp.length}`);
  }
  await H.ev(() => { cam.z = 1.3; clampCam(); }); await H.wait(400); await H.shot('10a-iso');
  // Emblems everywhere
  await page.click('[data-im="flat"]'); await H.wait(500);
  L('10. flat maia=', JSON.stringify(await H.maia(1)));
  for (const z of [0.7, 1.4, 2.4]) {
    await H.ev(z => { cam.z = z; clampCam(); }, z); await H.wait(350);
    const m = await modeOf();
    L(`10. flat @z=${(await H.cam()).z}: iso-count ${Object.values(m).filter(v => v.iso).length} painted-count ${Object.values(m).filter(v => v.painted).length}`);
  }
  await H.shot('10b-flat');
  // Auto crossfade at 1.05
  await page.click('[data-im="auto"]'); await H.wait(500);
  L('10. auto maia=', JSON.stringify(await H.maia(1)));
  for (const z of [0.9, 1.0, 1.04, 1.05, 1.06, 1.3]) {
    await H.ev(z => { cam.z = z; clampCam(); }, z); await H.wait(320);
    const m = await modeOf(); const zz = (await H.cam()).z;
    L(`10. auto @z=${zz}: iso-count ${Object.values(m).filter(v => v.iso).length}/${Object.keys(m).length}`);
  }
  await H.shot('10c-auto-zoomed-in');
  await H.ev(() => { cam.z = 0.84; clampCam(); }); await H.wait(400);
  await H.shot('10d-auto-zoomed-out');
};
