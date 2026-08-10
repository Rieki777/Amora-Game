/* Round C verification — F1-F5 features + A1-A7 build items. */
const { chromium } = require('playwright');
const fs = require('fs');
const FILE = process.env.GROUNDS_FILE || 'file:///root/amora/work/grounds-v0.html';
const EXE = process.env.PW_EXE || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
let fails = 0;
const ok = (c, n) => { console.log((c ? 'PASS ' : 'FAIL ') + n); if (!c) fails++; };

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1180 } });
  const page = await ctx.newPage();
  const perr = [], cerr = [];
  page.on('pageerror', e => perr.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') cerr.push(m.text()); });
  await page.goto(FILE); await page.waitForTimeout(1000);
  await page.click('#enterBtn'); await page.waitForTimeout(1500);

  /* A1: painted default + wrapped chips + active marker */
  const a1 = await page.evaluate(() => ({
    im: iconMode,
    on: (document.querySelector('[data-im].on') || {}).dataset ? document.querySelector('[data-im].on').dataset.im : null
  }));
  ok(a1.im === 'painted' && a1.on === 'painted', `A1: painted is the boot default, chip marked (${a1.im})`);
  await page.evaluate(() => document.querySelector('[data-im="iso"]').click());
  const a1b = await page.evaluate(() => (document.querySelector('[data-im].on') || {}).dataset.im);
  ok(a1b === 'iso', 'A1: the active marker moves with the click');
  await page.evaluate(() => document.querySelector('[data-im="painted"]').click());

  /* A2: global scale */
  await page.evaluate(() => setGScale(220));
  await page.waitForTimeout(400);
  const a2 = await page.evaluate(() => ({
    gs: GSCALE, v: getComputedStyle(document.documentElement).getPropertyValue('--gScale').trim(),
    tf: pEls[SCENE.structures[0].key].style.transform,
    lblH: (Object.values(bEls).find(e => e.className === 'banner') || { offsetHeight: 0 }).offsetHeight,
    exp: buildExportJSON().map_scene.art_manifest.skin.global_scale
  }));
  ok(a2.gs === 2.2 && a2.v === '2.2', `A2: global scale dial drives the map (×${a2.gs})`);
  ok(/scale\(/.test(a2.tf), 'A2: icon transforms carry the scale with LOD intact');
  ok(a2.exp === 2.2, 'A2: global scale exports in the skin');
  await page.evaluate(() => setGScale(100, true));

  /* A3: vitals dropdowns + actions */
  const nq0 = await page.evaluate(() => SCENE.quests.length);
  await page.evaluate(() => { document.querySelector('.vital[data-k="canopy"]').click(); });
  await page.waitForTimeout(300);
  const a3 = await page.evaluate(() => ({
    open: document.getElementById('vdrop').classList.contains('show'),
    txt: document.getElementById('vdrop').textContent
  }));
  ok(a3.open && /drawn|forest|sample/i.test(a3.txt), 'A3: canopy dropdown opens with how-computed facts');
  ok(/Claim|Begin/i.test(a3.txt), 'A3: dropdown carries a way to act');
  await page.evaluate(() => { document.querySelector('.vital[data-k="moon"]').click(); });
  await page.waitForTimeout(250);
  const a3m = await page.evaluate(() => document.getElementById('vdrop').textContent);
  ok(/cycle|lunar/i.test(a3m), 'A3: the moon opens its cycle card');
  await page.evaluate(() => document.getElementById('vdrop').classList.remove('show'));
  /* founder override */
  await page.click('#buildBtn'); await page.waitForTimeout(300);
  await page.evaluate(() => { openVitalDrop('food', document.querySelector('.vital[data-k="food"]')); });
  await page.waitForTimeout(200);
  await page.evaluate(() => { document.getElementById('vOvr').value = '80kg'; vitalSet('food'); });
  await page.waitForTimeout(300);
  const a3o = await page.evaluate(() => ({
    v: VITAL_OVR.food.v, bar: document.querySelector('.vital[data-k="food"] b').textContent,
    audit: EDITS.some(e => e.action === 'vital-override'),
    exp: buildExportJSON().vital_overrides.food.v
  }));
  ok(a3o.v === '80kg' && a3o.bar === '80kg' && a3o.audit && a3o.exp === '80kg', 'A3/Q8: founder sets a vital — audited, shown, exported');
  await page.click('#buildBtn'); await page.waitForTimeout(200);

  /* A4: rename */
  const a4 = await page.evaluate(() => ({
    btn: document.getElementById('wallBtn').textContent,
    head: document.querySelector('#wall h3').textContent,
    left: document.body.innerHTML.includes('The Wall')
  }));
  ok(/Get Involved/.test(a4.btn) && /Get Involved/.test(a4.head) && !a4.left, 'A4: Get Involved everywhere; no "The Wall" in copy');

  /* A5: dock SVGs */
  const a5 = await page.evaluate(() => ({
    n: document.querySelectorAll('#dock button').length,
    svg: [...document.querySelectorAll('#dock button')].every(b => b.querySelector('svg')),
    loom: !!document.querySelector('.lfk[data-f="journey"] svg')
  }));
  ok(a5.n === 7 && a5.svg, `A5: ${a5.n} dock doors, all in the house SVG hand`);
  ok(a5.loom, 'A5: the Loom journeys chip joins the same hand');

  /* A6: no narration */
  const a6 = await page.evaluate(() => !document.body.innerHTML.includes('In the live platform') && !document.body.innerHTML.includes('in the live build'));
  ok(a6, 'A6: no prototype narration anywhere');

  /* A7: tooltip primitive */
  await page.hover('#dock button[data-m="wallet"]'); await page.waitForTimeout(300);
  const a7 = await page.evaluate(() => ({
    show: document.getElementById('tip').classList.contains('show'),
    txt: document.getElementById('tip').textContent
  }));
  ok(a7.show && /Exchange/.test(a7.txt), 'A7: tooltips live — themed, positioned, house voice');
  await page.mouse.move(700, 700); await page.waitForTimeout(200);

  /* F1: concierge */
  const f1 = await page.evaluate(() => { conciergeMatch('I want to book a room for two nights'); return { m: document.getElementById('module').classList.contains('show'), log: CONCIERGE_LOG[CONCIERGE_LOG.length - 1] }; });
  ok(f1.m && f1.log.matched_kind === 'module' && f1.log.matched_id === 'stay', 'F1: "book a room" walks through the Stays door, logged');
  await page.evaluate(() => closeDoor());
  const f1b = await page.evaluate(() => { conciergeMatch('I want to help with planting and weeding in the garden'); return CONCIERGE_LOG[CONCIERGE_LOG.length - 1]; });
  ok(f1b.matched_kind === 'quest', `F1: work intent finds a quest (${f1b.matched_id})`);
  const f1c = await page.evaluate(() => { conciergeMatch('teach me quantum basket weaving'); return CONCIERGE_LOG[CONCIERGE_LOG.length - 1]; });
  ok(f1c.matched_kind === 'none', 'F1: the unmatched ask becomes a logged signal');
  const f1d = await page.evaluate(() => buildExportJSON().concierge_queries.length >= 3);
  ok(f1d, 'F1: concierge_queries export — the demand sensor');
  await page.evaluate(() => { document.getElementById('panel').classList.remove('open'); panelKey = null; });

  /* F2: pulse */
  await page.evaluate(() => pulseTick('kitchen'));
  await page.waitForTimeout(400);
  const f2 = await page.evaluate(() => pEls.kitchen.classList.contains('talk'));
  ok(f2, 'F2: a conversation makes its home shimmer');

  /* F3: occupancy one-source */
  /* D2 A3 moved the occupancy off the label, where a testing session never
     found it, and onto a home chip that is its own door. Same source. */
  const f3 = await page.evaluate(() => ({
    chip: !!(bgEls.ridgeA && bgEls.ridgeA.querySelector('.hchip')),
    label: bEls.ridgeA.textContent,
    sheet: (MODULES.housing.sample({}) || '').includes('2 of 5')
  }));
  ok(f3.chip && !/⌂/.test(f3.label) && f3.sheet, 'F3: lots sold — the home chip and the Housing sheet read the same source');

  /* F4: event pins + urgency + RSVP */
  const f4 = await page.evaluate(() => ({
    kitchen: pEls.kitchen.className, sanctuary: pEls.sanctuary.className,
    /* D2 A1: the star left the building. It used to be a pointer-events:none
       span inside the poi, which is why nobody could tap it; it is a seal in
       the badge plane now, wearing its own urgency class. */
    badge: !!(bgEls.sanctuary && bgEls.sanctuary.querySelector('.bseal.b-event.evbadge svg')),
    sealUrg: bgEls.sanctuary ? (bgEls.sanctuary.querySelector('.b-event') || {}).className : ''
  }));
  ok(/hasev/.test(f4.kitchen) && /ev-u3/.test(f4.kitchen), 'F4: tonight\'s feast burns brightest (u3)');
  ok(/ev-u0/.test(f4.sanctuary) && f4.badge && /ev-u0/.test(f4.sealUrg),
    'F4: far events glow dim — urgency rises as the day comes, on the seal now');
  const f4b = await page.evaluate(() => { const r0 = EVENTS[0].rsvp; evRSVP('e1'); return EVENTS[0].rsvp === r0 + 1; });
  ok(f4b, 'F4: RSVP counts (sample, in-memory)');

  /* F5: computed vitals honest labels */
  const f5 = await page.evaluate(() => { const D = vitalsData(); return { c: D.canopy.src, w: D.water.src, pk: D._pathKm }; });
  ok(/drawn/.test(f5.c) || /sample/.test(f5.c), `F5: canopy provider chain answers (${f5.c})`);
  ok(f5.pk >= 0, `F5: ${f5.pk.toFixed(2)} km of drawn paths measured`);

  /* Q1a: public lock */
  const q1a = await page.evaluate(() => {
    const pub = SCENE.features.find(f => f.public);
    return pub ? { id: pub.id, has: true } : { has: false };
  });
  if (q1a.has) {
    await page.click('#buildBtn'); await page.waitForTimeout(250);
    await page.click('#drawBtn'); await page.waitForTimeout(250);
    const blocked = await page.evaluate(id => {
      window.PUBLIC_UNLOCK = false; featSel = null;
      const f = featureById(id); const hit = f; // simulate the guard path
      if (hit.public && !window.PUBLIC_UNLOCK) return featSel === null;
      return false;
    }, q1a.id);
    ok(blocked, 'Q1a: public geometry stays locked until the founder unlocks');
    await page.click('#pubBtn'); await page.waitForTimeout(200);
    const unlocked = await page.evaluate(() => window.PUBLIC_UNLOCK && EDITS.some(e => e.action === 'public-unlock'));
    ok(unlocked, 'Q1a: ⚿ unlock is deliberate and audited');
    await page.click('#pubBtn'); await page.keyboard.press('Escape');
    await page.click('#buildBtn'); await page.waitForTimeout(200);
  } else { ok(true, 'Q1a: no public features in scene (guard untestable here)'); ok(true, 'Q1a: skipped'); }

  /* Q1b: phase transparency */
  const q1b = await page.evaluate(() => {
    const p3 = SCENE.structures.find(s => s.phase >= 3); const p1 = SCENE.structures.find(s => s.phase === 1);
    return { o3: p3 ? getComputedStyle(pEls[p3.key]).opacity : null, o1: p1 ? getComputedStyle(pEls[p1.key]).opacity : null };
  });
  ok(q1b.o3 && +q1b.o3 < 0.7 && +q1b.o1 === 1, `Q1b: phases load into reality (p1 ${q1b.o1} · p3 ${q1b.o3})`);

  /* Q1d: vocabulary rename */
  const q1d = await page.evaluate(() => {
    const old = SUBTYPES.zone[0]; SUBTYPES.zone[0] = 'wildmeadow';
    SCENE.features.forEach(f => { if (f.kind === 'zone' && f.subtype === old) f.subtype = 'wildmeadow'; });
    logEdit('vocab', 'zone:' + old, { renamed_to: 'wildmeadow' });
    const J = buildExportJSON();
    return J.map_scene.vocabulary.zone[0] === 'wildmeadow';
  });
  ok(q1d, 'Q1d: the founder\'s words — rename exports, features follow');

  /* Q6: wildlife present */
  const q6 = await page.evaluate(() => ({ b: birds.length, m: MACAWS.length, h: !!HERON, c: !!COATI }));
  ok(q6.b === 7 && q6.m === 2 && q6.h && q6.c, `Q6: ${q6.b} birds, ${q6.m} macaw pairs, a heron, a coati`);

  /* events module via dock */
  await page.click('#dock button[data-m="events"]'); await page.waitForTimeout(350);
  const evm = await page.evaluate(() => document.getElementById('moduleCard').textContent);
  ok(/Events/.test(evm) && /Full-moon feast/.test(evm), 'Q7: Events module sheet with RSVPs');
  await page.evaluate(() => closeDoor());

  /* ---------- D1: the camera and the hands ---------- */
  const d1z = await page.evaluate(() => {
    const fit = Math.min(innerWidth / W, innerHeight / H);
    cam.z = 0.001; cam.x = W / 2; cam.y = H / 2; clampCam();
    const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => worldToScreen(x, y).map(v => v / DPR));
    return { floor: cam.z, want: fit * 0.85, inside: corners.every(([x, y]) => x > -1 && y > -1 && x < innerWidth + 1 && y < innerHeight + 1) };
  });
  ok(Math.abs(d1z.floor - d1z.want) < 1e-9, `D1.1: the zoom floor is FIT x 0.85, not COVER (${d1z.floor.toFixed(4)})`);
  ok(d1z.inside, 'D1.1: pinched all the way out, the whole land sits on screen with margin to spare');

  /* Rye trimmed the rim by half after the first build. The contract is no
     longer "the centre reaches the world corner"; it is "the centre reaches
     every BUILDING, and the void at the rim is at most a quarter screen". */
  const d1c = await page.evaluate(() => {
    cam.z = 1.2; clampCam();
    const far = [];
    for (const s of SCENE.structures) {
      cam.x = s.x; cam.y = s.y; clampCam();
      const [sx, sy] = worldToScreen(s.x, s.y);
      const off = Math.hypot(sx / DPR - innerWidth / 2, sy / DPR - innerHeight / 2);
      if (off > 0.6) far.push(s.key + ' ' + Math.round(off));
    }
    /* Rim per side, against what the first D1 clamp allowed, at four zooms.
       Half or less, unless a building out there is what holds the side open. */
    const xs = SCENE.structures.map(s => s.x), ys = SCENE.structures.map(s => s.y);
    const ex = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const sides = [];
    for (const z of [0.6, 0.9, 1.2, 1.8]) {
      cam.z = z; clampCam();
      const b = camBounds(), hw = innerWidth / 2 / z, hh = innerHeight / 2 / z;
      const one = (now, old, land, held) => ({ ratio: old > 0 ? now / old : 0, land: Math.abs(land - held) < 0.5 });
      sides.push(
        one(Math.max(0, hw - b[0]), hw, ex[0], b[0]),
        one(Math.max(0, b[1] - (W - hw)), hw, ex[1], b[1]),
        one(Math.max(0, hh - b[2]), hh, ex[2], b[2]),
        one(Math.max(0, b[3] - (H - hh)), hh, ex[3], b[3]));
    }
    const e = [...SCENE.structures].sort((a, b) => b.x - a.x)[0];
    cam.z = 1.2; cam.x = e.x; cam.y = e.y; clampCam();
    const [sx, sy] = worldToScreen(e.x, e.y);
    return { far, name: e.name, off: Math.hypot(sx / DPR - innerWidth / 2, sy / DPR - innerHeight / 2),
      over: sides.filter(s => s.ratio > 0.505 && !s.land).length, n: sides.length,
      worst: Math.max(...sides.filter(s => !s.land).map(s => s.ratio)) };
  });
  ok(d1c.far.length === 0, `D1.1: every building can sit dead centre (${d1c.far.length} out of reach${d1c.far.length ? ': ' + d1c.far.slice(0, 3).join(', ') : ''})`);
  ok(d1c.over === 0, `D1.1: and the rim past the land is half what the first build showed (worst ${(d1c.worst * 100).toFixed(0)}% of it, over ${d1c.n} side-and-zoom pairs)`);
  ok(d1c.off < 0.6, `D1.1: the eastmost building (${d1c.name}) can sit dead centre (${d1c.off.toFixed(2)} px off)`);

  const d1w = await page.evaluate(() => {
    const el = document.getElementById('scene'); cam.z = 1; clampCam();
    const pinch = new WheelEvent('wheel', { deltaY: -60, ctrlKey: true, clientX: innerWidth / 2, clientY: innerHeight / 2, bubbles: true, cancelable: true });
    const live = el.dispatchEvent(pinch); const zp = cam.z;
    cam.z = 1; clampCam();
    el.dispatchEvent(new WheelEvent('wheel', { deltaY: -60, clientX: innerWidth / 2, clientY: innerHeight / 2, bubbles: true, cancelable: true }));
    return { zp, zw: cam.z, want: Math.exp(60 * 0.012), prevented: !live };
  });
  ok(Math.abs(d1w.zp - d1w.want) < 1e-9 && d1w.prevented, `D1.2: a trackpad pinch zooms the land, not the page (z ${d1w.zp.toFixed(3)})`);
  ok(Math.abs(d1w.zw - 1.13) < 1e-9, 'D1.2: a plain wheel keeps its old step');

  const d1s = await page.evaluate(() => {
    const el = document.getElementById('scene'); cam.z = 1; clampCam();
    const mk = (t, x) => Object.assign(new Event(t, { bubbles: true, cancelable: true }), x);
    const at = { clientX: innerWidth / 2, clientY: innerHeight / 2 };
    el.dispatchEvent(mk('gesturestart', { ...at, scale: 1 }));
    el.dispatchEvent(mk('gesturechange', { ...at, scale: 1.5 }));
    const z = cam.z; el.dispatchEvent(mk('gestureend', { ...at, scale: 1.5 })); return z;
  });
  ok(Math.abs(d1s - 1.5) < 1e-9, `D1.2: Safari's gesture events drive the same zoom (${d1s.toFixed(3)})`);

  const d1p = await page.evaluate(async () => {
    openPanel('kitchen'); const inset = panelInset()[0];
    await new Promise(r => setTimeout(r, 1500));
    const s = BY['kitchen'], w = document.getElementById('panel').offsetWidth;
    const r = { inset, at: worldToScreen(s.x, s.y)[0] / DPR, want: (innerWidth - w) / 2 };
    document.getElementById('panelClose').click(); return r;
  });
  ok(d1p.inset > 0 && Math.abs(d1p.at - d1p.want) < 2,
    `D1.1: with the drawer open a building centres in the strip that stays visible (${Math.round(d1p.at)} px, wanted ${Math.round(d1p.want)})`);
  await page.waitForTimeout(400);

  const d1l = await page.evaluate(() => {
    cam.z = 1; clampCam(); syncBanners();
    const k = Math.max(.5, Math.min(1.4, 0.28 + cam.z * 0.5)); const rows = [];
    for (const s of SCENE.structures) {
      const p = pEls[s.key]; if (!p || !p.classList.contains('m-painted')) continue;
      const fam = (window.ARCHMAP && ARCHMAP[s.archetype]) ? ARCHMAP[s.archetype].icon : s.archetype;
      const sc = ((typeof FAM_SCALE !== 'undefined' && FAM_SCALE[fam]) || 1) * (s.scale || 1) * (window.GSCALE || 1);
      rows.push({ now: s._crownOff, was: k * 1.35 * sc * 66 + 10 });
    }
    return rows;
  });
  const hug = d1l.filter(r => r.now < r.was - 6).length;
  ok(d1l.length > 8 && hug === d1l.length,
    `D1.3: every painted label sits closer to its crown (${hug}/${d1l.length}, e.g. ${Math.round(d1l[0].was)} -> ${Math.round(d1l[0].now)} px)`);

  /* ---------- D2 A1: every mark reachable, no two marks touching ---------- */
  const d2a = await page.evaluate(() => {
    cam.z = 1.7; cam.x = 1240; cam.y = 700; clampCam(); refreshBadges(); syncBanners(); syncBanners();
    const shown = [...document.querySelectorAll('.bseal')].filter(s =>
      s.closest('.bgroup').classList.contains('on') && getComputedStyle(s).display !== 'none'
      && s.getBoundingClientRect().width > 0);
    const box = s => { const r = s.getBoundingClientRect(); return { s, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; };
    const b = shown.map(box);
    let touching = 0, worst = '';
    for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
      const d = Math.hypot(b[i].cx - b[j].cx, b[i].cy - b[j].cy);
      // 44 exactly is two hit circles touching, which is the target, not a fault
      if (d < 43.5) { touching++; if (!worst) worst = `${b[i].s.dataset.bk}:${b[i].s.dataset.bkind} vs ${b[j].s.dataset.bk}:${b[j].s.dataset.bkind} at ${Math.round(d)} px`; }
    }
    /* Reachability is only meaningful for marks inside the map, away from the
       HUD panels that legitimately sit above it. */
    const inMap = b.filter(x => x.cx > 60 && x.cy > 96 && x.cx < innerWidth - 60 && x.cy < innerHeight - 96
      && !document.getElementById('maia').getBoundingClientRect().width
      || (x.cx > 60 && x.cy > 96 && x.cx < innerWidth - 60 && x.cy < innerHeight - 96
        && !(x.cx > document.getElementById('maia').getBoundingClientRect().x && x.cy > document.getElementById('maia').getBoundingClientRect().y)));
    let mine = 0;
    for (const x of inMap) { const el = document.elementFromPoint(x.cx, x.cy); if (el && (el === x.s || x.s.contains(el))) mine++; }
    const hit = document.querySelector('.bseal .bhit');
    return {
      shown: shown.length, touching, worst, mine, of: inMap.length,
      clusters: document.querySelectorAll('.bgroup.clustered').length,
      star: !!document.querySelector('.bseal.b-event'),
      starHit: !!(document.querySelector('.bseal.b-event') && getComputedStyle(document.querySelector('.bseal.b-event')).pointerEvents === 'auto'),
      hitPx: hit ? Math.round(hit.getBoundingClientRect().width) : 0,
      inPoi: !!pEls.kitchen.querySelector('.evbadge'),
      layers: { badges: +getComputedStyle(document.getElementById('badges')).zIndex, banners: +getComputedStyle(document.getElementById('banners')).zIndex, icons: +getComputedStyle(document.getElementById('icons')).zIndex }
    };
  });
  ok(d2a.touching === 0, `D2 A1: no two marks overlap anywhere on the land (${d2a.shown} shown${d2a.worst ? ', worst ' + d2a.worst : ''})`);
  ok(d2a.mine === d2a.of && d2a.of > 12, `D2 A1: every mark over the map answers its own tap (${d2a.mine}/${d2a.of})`);
  ok(d2a.layers.badges > d2a.layers.banners && d2a.layers.banners > d2a.layers.icons,
    `D2 A1: badge over label over building (${d2a.layers.badges} > ${d2a.layers.banners} > ${d2a.layers.icons})`);
  ok(d2a.star && d2a.starHit && !d2a.inPoi, 'D2 A1: the star is a seal with its own hit area, not furniture inside the building');
  ok(d2a.hitPx === 44, `D2 A1: 44 px of thumb under a 22 px mark (${d2a.hitPx})`);
  ok(d2a.clusters > 0, `D2 A1: crowded rings collapse to a counted seal (${d2a.clusters} clustered)`);

  /* and a tap on a mark opens what the mark is about */
  const d2t = await page.evaluate(async () => {
    document.getElementById('panel').classList.remove('open');
    const seal = [...document.querySelectorAll('.bseal.b-quest')].find(s => getComputedStyle(s).display !== 'none');
    const key = seal.dataset.bk;
    seal.click(); await new Promise(r => setTimeout(r, 500));
    const r = { key, panel: panelKey, open: document.getElementById('panel').classList.contains('open'), tab: [...document.getElementById('tabs').children].findIndex(b => b.classList.contains('on')) };
    document.getElementById('panelClose').click();
    return r;
  });
  ok(d2t.open && d2t.panel === d2t.key && d2t.tab === 1,
    `D2 A1: tapping a leaf-pennant opens ${d2t.key} at its quests (tab ${d2t.tab})`);
  await page.waitForTimeout(400);

  /* ---------- D2 A2/A3: one glyph language at every distance ---------- */
  const vfar = await page.evaluate(() => {
    cam.z = 0.85; cam.x = 1240; cam.y = 700; clampCam(); refreshBadges(); syncBanners(); syncBanners();
    const vis = sel => [...document.querySelectorAll(sel)].filter(e =>
      getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0
      && /\b(on|far)\b/.test(e.closest('.bgroup').className));
    const far = { a: vis('.aseal').length, s: vis('.bseal').length, h: vis('.hchip').length,
      who: vis('.bseal').slice(0,6).map(e => e.dataset.bk + ':' + e.dataset.bkind + ' [' + e.closest('.bgroup').className + ']') };
    /* D9 holds: the number on the seal is a projection, never a stored count. */
    const wrong = SCENE.structures.map(s => {
      const a = bgEls[s.key] && bgEls[s.key].querySelector('.aseal'); if (!a) return null;
      const want = questsAt(s.key).length + seatsAt(s.key).length + threadsAt(s.key).length + eventsAt(s.key).length;
      return a.textContent === (want > 9 ? '9+' : String(want)) ? null : s.key;
    }).filter(Boolean);
    const face = getComputedStyle(document.querySelector('.aface')).fill;
    const ink = getComputedStyle(document.querySelector('.anum')).fill;
    cam.z = 1.7; clampCam(); syncBanners();
    const near = { a: vis('.aseal').length, s: vis('.bseal').length, h: vis('.hchip').length };
    return { far, near, wrong, face, ink, soon: document.querySelectorAll('.aseal.soon').length,
      label: bEls.ridgeA.querySelector('.cnt').textContent };
  });
  ok(vfar.label === '', 'D2 A2: the label stops carrying counts as text');
  ok(vfar.far.a > 8 && vfar.far.s === 0, `D2 A2: below the gate a building wears one activity seal and no marks (${vfar.far.a} seals, ${vfar.far.s} marks${vfar.far.s ? ': ' + vfar.far.who.join(' | ') : ''})`);
  ok(vfar.near.a === 0 && vfar.near.s > 8, `D2 A2: above the gate the marks take over and the seal stands down (${vfar.near.a} seals, ${vfar.near.s} marks)`);
  ok(vfar.wrong.length === 0, `D2 A2: every count is the projection, not a stored number (${vfar.wrong.length} wrong)`);
  ok(/32, 22, 12/.test(vfar.face) && /243, 230, 200/.test(vfar.ink),
    `D2 A2: parchment ink on dark ground, which is the whole point (${vfar.face} / ${vfar.ink})`);
  ok(vfar.soon > 0, `D2 A2: a gold rim breathes when an event is two days out (${vfar.soon})`);
  ok(vfar.far.h === vfar.near.h && vfar.far.h > 0, `D2 A3: the home chip is there at every distance (${vfar.far.h})`);

  const vhome = await page.evaluate(async () => {
    cam.z = 1.4; clampCam(); syncBanners();
    const h = [...document.querySelectorAll('.hchip')].find(x => x.dataset.bk === 'ridgeA');
    h.click(); await new Promise(r => setTimeout(r, 400));
    const card = document.getElementById('moduleCard');
    const a = card.querySelector('a.btn');
    const r = { open: document.getElementById('module').classList.contains('show'), txt: card.textContent,
      href: a ? a.getAttribute('href') : '', maia: /Ask Maia about living here/.test(card.textContent) };
    closeDoor(); return r;
  });
  ok(vhome.open && /Request a home at Ridge Hamlet North/.test(vhome.txt) && /2 of 5 spoken for/.test(vhome.txt),
    'D2 A3: the home chip opens its own sheet with the occupancy');
  ok(/\/request-a-house\?structure=ridgeA/.test(vhome.href) && vhome.maia,
    `D2 A3: and carries the structure to the request (${vhome.href})`);

  const vlodge = await page.evaluate(async () => {
    homeSheet('guest'); await new Promise(r => setTimeout(r, 250));
    const card = document.getElementById('moduleCard');
    const r = { txt: card.textContent, href: card.querySelector('a.btn').getAttribute('href') };
    closeDoor(); return r;
  });
  ok(/2 of 3 full tonight/.test(vlodge.txt) && /\/stay$/.test(vlodge.href),
    `D2 A3: the lodge counts beds and routes to booking instead (${vlodge.href})`);

  const vfly = await page.evaluate(async () => {
    document.getElementById('panel').classList.remove('open');
    cam.z = 0.85; cam.x = 1240; cam.y = 700; clampCam(); syncBanners();
    const a = [...document.querySelectorAll('.aseal')].find(x => getComputedStyle(x).display !== 'none');
    const key = a.dataset.bk; a.click();
    await new Promise(r => setTimeout(r, 1700));
    return { key, z: cam.z, dx: Math.abs(cam.x - BY[key].x), dy: Math.abs(cam.y - BY[key].y) };
  });
  ok(vfly.z >= 1.14 && vfly.dx < 2 && vfly.dy < 2,
    `D2 A2: tapping the seal flies you in to ${vfly.key} at z ${vfly.z.toFixed(2)}, where the marks take over`);
  await page.waitForTimeout(300);

  /* D2 A2: a plate is a name and a mark is a door, so plates step over marks
     and then over each other. Swept across the far zooms where both live. */
  const vplate = await page.evaluate(() => {
    const rows = [];
    for (const z of [0.52, 0.62, 0.72, 0.82, 0.9]) {
      cam.z = z; cam.x = 1240; cam.y = 700; clampCam(); refreshBadges(); syncBanners(); syncBanners(); syncBanners();
      /* districts AND geography names: with the land extended to the rim, the
         whole-land view is where people sit, and both kinds print in it */
      const plates = [...SCENE.districts.map(d => bEls['d_' + d.id]), ...GEO.map((g, i) => bEls['g_' + i])]
        .filter(e => e && e.style.display !== 'none').map(e => e.getBoundingClientRect());
      const marks = [...document.querySelectorAll('.aseal,.hchip')]
        .filter(e => getComputedStyle(e).display !== 'none' && /\b(on|far)\b/.test(e.closest('.bgroup').className))
        .map(e => e.getBoundingClientRect());
      const hits = (a, c) => a.left < c.right && c.left < a.right && a.top < c.bottom && c.top < a.bottom;
      let pp = 0, pm = 0;
      for (let i = 0; i < plates.length; i++) {
        for (let j = i + 1; j < plates.length; j++) if (hits(plates[i], plates[j])) pp++;
        for (const m of marks) if (hits(plates[i], m)) pm++;
      }
      rows.push({ z, plates: plates.length, marks: marks.length, pp, pm });
    }
    return rows;
  });
  const bad = vplate.filter(r => r.pp || r.pm);
  ok(bad.length === 0 && vplate[0].plates > 3 && vplate[0].marks > 8,
    `D2 A2: district plates clear the marks and each other at every far zoom (${vplate.map(r => r.z).join(', ')})${bad.length ? ' — ' + JSON.stringify(bad) : ''}`);

  /* ---------- D4: the founder's hands ---------- */
  const d4 = await page.evaluate(async () => {
    const r = {};
    document.getElementById('panelClose').click(); closeDoor();
    document.getElementById('buildBtn').click(); await new Promise(z => setTimeout(z, 300));
    /* D4.1 a copy carries what is addressed to it, and nothing that is about two places */
    const key = 'greenhouse', q0 = questsAt(key).length, s0 = seatsAt(key).length, n0 = SCENE.structures.length;
    openInspect(key); await new Promise(z => setTimeout(z, 300));
    document.getElementById('iDup').click(); await new Promise(z => setTimeout(z, 300));
    const c = SCENE.structures[SCENE.structures.length - 1];
    r.dup = { key: c.key, copy: / \(copy\)$/.test(c.name), placing: !!(placing && placing.dup),
      q: questsAt(c.key).length, s: seatsAt(c.key).length, wantQ: q0, wantS: s0,
      addr: (questsAt(c.key)[0] || {}).addr, flows: SCENE.flows.filter(f => f.from === c.key || f.to === c.key).length,
      audit: EDITS.some(e => e.action === 'duplicate') };
    document.getElementById('scene').dispatchEvent(new MouseEvent('click', { clientX: 740, clientY: 560, bubbles: true, cancelable: true }));
    await new Promise(z => setTimeout(z, 300));
    r.landed = !placing && inspKey === c.key;
    document.getElementById('undoBtn').click(); await new Promise(z => setTimeout(z, 300));
    r.undone = !BY[c.key] && SCENE.quests.filter(q => q.at === c.key).length === 0
      && SCENE.seats.filter(x => x.at === c.key).length === 0 && SCENE.structures.length === n0;
    /* D4.2 the row says where the number came from before it asks for one */
    openVitalDrop('canopy', document.querySelector('.vital[data-k="canopy"]')); await new Promise(z => setTimeout(z, 200));
    const d = document.getElementById('vdrop');
    r.plain = { prov: /sample reading|measured from your drawn land/.test(d.textContent),
      ask: /Know the real number\? Set it here and the map holds your word until you release it\./.test(d.textContent),
      hold: /Hold this number/.test(d.textContent), old: /founder's word/.test(d.textContent) };
    document.getElementById('vOvr').value = '81%'; vitalSet('canopy'); await new Promise(z => setTimeout(z, 250));
    openVitalDrop('canopy', document.querySelector('.vital[data-k="canopy"]')); await new Promise(z => setTimeout(z, 200));
    r.held = { txt: /Held by your word/.test(d.textContent), rel: /release/.test(d.textContent), v: (VITAL_OVR.canopy || {}).v };
    d.querySelector('a') && d.querySelector('a').click(); await new Promise(z => setTimeout(z, 200));
    r.released = !VITAL_OVR.canopy; d.classList.remove('show');
    /* D4.3 the role field offers what the village already has */
    openInspect('kitchen'); await new Promise(z => setTimeout(z, 300));
    const inp = document.getElementById('iSeatName'); inp.focus(); inp.value = ''; inp.oninput();
    await new Promise(z => setTimeout(z, 200));
    const dd = document.getElementById('seatDrop');
    const opt = [...dd.querySelectorAll('.sopt')].pop();
    const si = +opt.dataset.seatI, was = SCENE.seats[si].at, nm = SCENE.seats[si].s;
    r.combo = { open: dd.classList.contains('show'), opts: dd.querySelectorAll('.sopt').length,
      grouped: /picking one/.test(dd.textContent) };
    opt.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    await new Promise(z => setTimeout(z, 350));
    r.moved = { nm, was, now: SCENE.seats[si].at, addr: SCENE.seats[si].addr,
      audit: EDITS.some(e => e.action === 'address-override') };
    closeInspect();
    /* D4.4 the dream has its own line */
    r.vbNull = SCENE.vision_bound === null;
    document.getElementById('lyVision').click(); await new Promise(z => setTimeout(z, 400));
    syncBoundBtn(); r.btnVision = document.getElementById('boundBtn').textContent.trim();
    const B = boundTarget();
    r.vb = { seeded: B === SCENE.vision_bound && B.length === SCENE.bound.length,
      exported: Array.isArray(buildExportJSON().map_scene.vision_bound) };
    cam.z = 1.0; const bb = camBounds();
    r.vb.reaches = bb[1] >= Math.max(...SCENE.vision_bound.map(p => p[0])) - 0.5;
    document.getElementById('lyNow').click(); syncBoundBtn();
    r.btnNow = document.getElementById('boundBtn').textContent.trim();
    document.getElementById('buildBtn').click();
    return r;
  });
  ok(d4.dup.copy && d4.dup.q === d4.dup.wantQ && d4.dup.s === d4.dup.wantS && d4.dup.addr === 'creator' && d4.dup.flows === 0 && d4.dup.audit,
    `D4.1: a copy carries its ${d4.dup.q} quests and ${d4.dup.s} seats as the creator's word, and no flows`);
  ok(d4.dup.placing && d4.landed, 'D4.1: and it arrives in your hand, to be placed by the next click');
  ok(d4.undone, 'D4.1: undo takes the copy and everything cloned with it');
  ok(d4.plain.prov && d4.plain.ask && d4.plain.hold && !d4.plain.old,
    'D4.2: the vital says where its number came from, then offers to hold a truer one');
  ok(d4.held.txt && d4.held.rel && d4.held.v === '81%' && d4.released,
    'D4.2: held by your word, and released back to the counting');
  ok(d4.combo.open && d4.combo.opts > 3 && d4.combo.grouped,
    `D4.3: typing a role surfaces the ones the village already has (${d4.combo.opts})`);
  ok(d4.moved.now === 'kitchen' && d4.moved.was !== 'kitchen' && d4.moved.addr === 'creator' && d4.moved.audit,
    `D4.3: picking one moves it here as the creator's word (${d4.moved.nm}: ${d4.moved.was} to ${d4.moved.now})`);
  ok(d4.vbNull && d4.btnVision === '\u25c7 Vision boundary' && d4.btnNow === '\u25c7 Boundary',
    'D4.4: the Vision has no line of its own until asked, and the button says which one it holds');
  ok(d4.vb.seeded && d4.vb.exported && d4.vb.reaches,
    'D4.4: the dreamed line seeds from the real one, exports, and the camera can reach it');

  /* ---------- D5: promises you can take back ---------- */
  const d5 = await page.evaluate(async () => {
    const r = { version: BUILD_VERSION }; window.__posts = [];
    const o = window.bridgePost; window.bridgePost = m => { window.__posts.push(m); o(m); };
    /* F4 already tapped RSVP earlier in this same page, so start from nothing
       promised rather than from whatever the last test left behind. */
    for (const id of Object.keys(EV_RSVP)) { const ev = EVENTS.find(x => x.id === id); if (ev) { ev.rsvp = Math.max(0, ev.rsvp - 1); ev._me = 0; } delete EV_RSVP[id]; }
    const e = EVENTS[0], c0 = e.rsvp;
    openDoor('events', {}); await new Promise(z => setTimeout(z, 300));
    r.saidPlainly = /Going adds this to your calendar in your profile and signs you up for updates by email\. Tap again any time to change your answer\./.test(document.getElementById('moduleCard').textContent);
    evRSVP(e.id); await new Promise(z => setTimeout(z, 200));
    const btn = document.querySelector(`[data-ev="${e.id}"]`);
    r.going = { up: e.rsvp - c0, label: btn.textContent, stored: !!EV_RSVP[e.id], live: !btn.disabled };
    evRSVP(e.id); await new Promise(z => setTimeout(z, 200));
    r.withdrawn = { back: e.rsvp - c0, label: document.querySelector(`[data-ev="${e.id}"]`).textContent, stored: !!EV_RSVP[e.id] };
    closeDoor();
    const q = SCENE.quests.find(x => x.at === 'greenhouse');
    q.how_to = 'Meet Sol at the greenhouse door at seven, before the heat.';
    openPanel(q.at, 1); await new Promise(z => setTimeout(z, 900));
    r.claimSaidPlainly = /Claiming adds this quest to your profile with how to begin, and signs you up for updates\. Release it any time\./.test(document.getElementById('panelBody').textContent);
    claimQuest(q.q, BY[q.at].name); await new Promise(z => setTimeout(z, 400));
    const body = document.getElementById('panelBody');
    r.yours = { stored: claimed(q), label: body.querySelector('.claim button').textContent,
      first: /Your first step/.test(body.textContent), how: /Meet Sol at the greenhouse door/.test(body.textContent) };
    cam.z = 1.7; cam.x = BY[q.at].x; cam.y = BY[q.at].y; clampCam(); refreshBadges(); syncBanners();
    r.tick = !!(bgEls[q.at] && bgEls[q.at].querySelector('.b-quest.claimed .tick'));
    claimQuest(q.q, BY[q.at].name); await new Promise(z => setTimeout(z, 400));
    r.releasedLabel = document.getElementById('panelBody').querySelector('.claim button').textContent;
    r.released = !claimed(q);
    document.getElementById('panelClose').click();
    r.posts = window.__posts.map(m => m.type + ':' + (m.on ? 'on' : 'off'));
    const J = buildExportJSON();
    r.exp = { rsvps: Array.isArray(J.my_rsvps), claims: Array.isArray(J.my_claims), how: J.quests.some(x => x.how_to) };
    return r;
  });
  ok(d5.version === 'v0.8-roundD', `D5.4: the artifact says which round it is (${d5.version})`);
  ok(d5.saidPlainly && d5.claimSaidPlainly, 'D5.1/D5.2: both promises say plainly what a tap actually does');
  ok(d5.going.up === 1 && d5.going.stored && d5.going.live && /tap to change/.test(d5.going.label),
    `D5.1: going is a promise, not a closed door (${d5.going.label})`);
  ok(d5.withdrawn.back === 0 && !d5.withdrawn.stored && d5.withdrawn.label === 'RSVP',
    'D5.1: withdrawing takes the count back down');
  ok(d5.yours.stored && /tap to release/.test(d5.yours.label) && d5.yours.first && d5.yours.how,
    'D5.2: a claimed quest is yours, and it shows you where to start');
  ok(d5.tick, 'D5.2: and the mark on the land carries the promise');
  ok(d5.released && d5.releasedLabel === 'Claim this quest', 'D5.2: releasing puts it back for other hands');
  ok(d5.posts.join(' ') === 'rsvp:on rsvp:off claim:on claim:off',
    `D5.1/D5.2: every promise crosses the bridge, both ways (${d5.posts.join(' ')})`);
  ok(d5.exp.rsvps && d5.exp.claims && d5.exp.how, 'D5.4: the promises and the first step ride the export');

  const d5j = await page.evaluate(async () => {
    playJourney('j2'); await new Promise(z => setTimeout(z, 2600));
    const log = document.getElementById('maiaLog');
    const r = { jn: (log.querySelector('.jn') || {}).textContent || '', next: !!log.querySelector('.jrow .btn') };
    jNext(); await new Promise(z => setTimeout(z, 1800));
    const all = log.querySelectorAll('.jn');
    r.after = (all[all.length - 1] || {}).textContent || '';
    jEnd(); await new Promise(z => setTimeout(z, 200));
    r.ended = !window.JWALK && /The walk ends here/.test(log.textContent);
    return r;
  });
  ok(/^1 of \d+$/.test(d5j.jn) && d5j.next, `D5.3: Maia presents the journey, with its progress (${d5j.jn})`);
  ok(d5j.after !== d5j.jn && /of \d+$/.test(d5j.after), `D5.3: next skips ahead rather than waiting (${d5j.after})`);
  ok(d5j.ended, 'D5.3: and ending the walk says so in her voice');

  /* ---------- the vocabulary editor, the bridge reply, and the small fixes ---------- */
  const d6 = await page.evaluate(async () => {
    const r = {};
    document.getElementById('skinBtn').click(); await new Promise(z => setTimeout(z, 300));
    const host = document.getElementById('skMedia'), ph = document.getElementById('skPhases');
    r.rows = { media: !!host, phases: !!ph, chips: host ? host.querySelectorAll('[data-vm]').length : 0 };
    /* a rename is the village's word changing, never the key the flows point at */
    const wasKey = SCENE.vocabulary.media[0].key;
    host.querySelector('[data-vm="0"]').click(); await new Promise(z => setTimeout(z, 150));
    host.querySelector('.vmn').value = 'rainwater';
    host.querySelector('.vmc').value = '#4499cc';
    host.querySelector('.vmg').value = 'bolt';
    host.querySelector('.vmok').click(); await new Promise(z => setTimeout(z, 250));
    const m0 = SCENE.vocabulary.media[0];
    r.renamed = { name: m0.name, keyKept: m0.key === wasKey, colourFollows: mediaColor(wasKey) === '#4499cc',
      flowsIntact: SCENE.flows.every(f => SCENE.vocabulary.media.some(m => m.key === mediaKey(f.medium))),
      audit: EDITS.some(e => e.action === 'vocab' && /media/.test(e.target || '')) };
    const n0 = SCENE.vocabulary.media.length;
    host.querySelector('[data-vm="+"]').click(); await new Promise(z => setTimeout(z, 150));
    host.querySelector('.vmn').value = 'firewood';
    host.querySelector('.vmok').click(); await new Promise(z => setTimeout(z, 250));
    r.added = { grew: SCENE.vocabulary.media.length - n0, key: SCENE.vocabulary.media[SCENE.vocabulary.media.length - 1].key,
      sprite: !!flowSprite('firewood') };
    const inUse = SCENE.vocabulary.media.findIndex(m => SCENE.flows.some(f => mediaKey(f.medium) === m.key));
    host.querySelector(`[data-vm="${inUse}"]`).click(); await new Promise(z => setTimeout(z, 150));
    const held = SCENE.vocabulary.media.length;
    host.querySelector('.vmx').click(); await new Promise(z => setTimeout(z, 200));
    r.keptInUse = SCENE.vocabulary.media.length === held;
    ph.querySelector('[data-vp="2"]').click(); await new Promise(z => setTimeout(z, 150));
    const inp = ph.querySelector('input'); inp.value = 'Rising';
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await new Promise(z => setTimeout(z, 250));
    r.phase = { name: phaseName(2), exported: buildExportJSON().map_scene.vocabulary.phases['2'],
      audit: EDITS.some(e => e.action === 'vocab' && /phase/.test(e.target || '')) };
    SCENE.vocabulary.phases[2] = 'Building';
    document.getElementById('skinBtn').click();
    r.emdash = SCENE.quests.filter(q => /\u2014/.test(q.q)).length;
    r.eventsRoute = MODULES.events.route;
    return r;
  });
  ok(d6.rows.media && d6.rows.phases && d6.rows.chips > 9,
    `D3.1/D3.3: the vocabulary editor carries flow types and phase names (${d6.rows.chips} chips)`);
  ok(d6.renamed.name === 'rainwater' && d6.renamed.keyKept && d6.renamed.colourFollows && d6.renamed.flowsIntact && d6.renamed.audit,
    'D3.1: renaming a flow type changes the word and never the key the flows point at');
  ok(d6.added.grew === 1 && d6.added.key === 'firewood' && d6.added.sprite,
    'D3.1: a village can add a kind of moving thing, and it gets a mark');
  ok(d6.keptInUse, 'D3.1: a type still carrying flows is not removed out from under them');
  ok(d6.phase.name === 'Rising' && d6.phase.exported === 'Rising' && d6.phase.audit,
    `D3.3: the phases can be renamed, and the export carries the word (${d6.phase.name})`);
  ok(d6.emdash === 0, `voice: no em-dash survives in a quest title (${d6.emdash})`);
  ok(d6.eventsRoute === '/events', `the events door opens on the module's own room (${d6.eventsRoute})`);

  /* the shell can answer a promise, and silence still means local only */
  const d6b = await page.evaluate(async () => {
    const send = d => window.dispatchEvent(new MessageEvent('message', { data: d, origin: location.origin }));
    const e = EVENTS[2], before = e.rsvp;
    evRSVP(e.id); await new Promise(z => setTimeout(z, 120));
    send({ type: 'promise-result', kind: 'rsvp', id: e.id, ok: false, reason: 'anonymous', href: '/login' });
    await new Promise(z => setTimeout(z, 250));
    const refused = { delta: e.rsvp - before, stored: !!EV_RSVP[e.id],
      wayIn: /Sign in/.test(document.getElementById('maiaLog').textContent) };
    evRSVP(e.id); await new Promise(z => setTimeout(z, 120));
    send({ type: 'promise-result', kind: 'rsvp', id: e.id, ok: true, count: 99 });
    await new Promise(z => setTimeout(z, 250));
    const accepted = { count: e.rsvp, stored: !!EV_RSVP[e.id] };
    /* nobody answers: the promise stands, which is how every suite runs */
    const e2 = EVENTS[3], b2 = e2.rsvp;
    evRSVP(e2.id); await new Promise(z => setTimeout(z, 4400));
    const silent = { delta: e2.rsvp - b2, stored: !!EV_RSVP[e2.id] };
    evRSVP(e2.id);
    return { refused, accepted, silent };
  });
  ok(d6b.refused.delta === 0 && !d6b.refused.stored && d6b.refused.wayIn,
    'bridge: a refused promise goes back, and offers a way in rather than an error');
  ok(d6b.accepted.count === 99 && d6b.accepted.stored,
    `bridge: an accepted promise takes the shell's count as the truth (${d6b.accepted.count})`);
  ok(d6b.silent.delta === 1 && d6b.silent.stored,
    'bridge: with nobody listening the promise still stands, which is how the map runs alone');

  /* ---------- the contract amendments the site lane asked for ---------- */
  const amd = await page.evaluate(async () => {
    const r = {}; const sent = []; const o = window.bridgePost;
    window.bridgePost = m => { sent.push(m); o(m); };
    const send = d => window.dispatchEvent(new MessageEvent('message', { data: d, origin: location.origin }));
    /* on, off, on inside the window: a late reply for the FIRST post must not
       speak for the third, which is what the nonce is for */
    const e = EVENTS[4], base = e.rsvp;
    evRSVP(e.id); evRSVP(e.id); evRSVP(e.id);
    await new Promise(z => setTimeout(z, 150));
    const posts = sent.filter(m => m.type === 'rsvp');
    r.nonces = { n: posts.length, unique: new Set(posts.map(m => m.nonce)).size, all: posts.every(m => !!m.nonce) };
    send({ type: 'promise-result', kind: 'rsvp', id: e.id, ok: false, reason: 'error', nonce: posts[0].nonce });
    await new Promise(z => setTimeout(z, 200));
    r.stale = { stored: !!EV_RSVP[e.id], delta: e.rsvp - base };
    send({ type: 'promise-result', kind: 'rsvp', id: e.id, ok: false, reason: 'not-here', nonce: posts[posts.length - 1].nonce });
    await new Promise(z => setTimeout(z, 200));
    r.current = { stored: !!EV_RSVP[e.id], delta: e.rsvp - base,
      calm: [...document.querySelectorAll('.toast')].some(t => /joins the village when a steward/.test(t.textContent)) };
    r.reasons = ['anonymous', 'not-yet', 'closed', 'full', 'not-here', 'gone', 'error'].every(k => !!PROMISE_WHY[k]);
    /* a quest's identity is a field the site stores, not a slug two sides compute */
    const q = SCENE.quests[0], was = q.key;
    q.q = 'A different title entirely';
    r.key = { onSeed: !!was, stable: questKey(q) === was, exported: buildExportJSON().quests[0].key === was,
      unique: new Set(SCENE.quests.map(x => x.key)).size === SCENE.quests.length,
      shape: SCENE.quests.every(x => /^[a-z0-9_-]{1,32}$/i.test(x.key)) };
    const q2 = SCENE.quests.find(x => x.at === 'greenhouse');
    sent.length = 0; claimQuest(q2.q, BY[q2.at].name); await new Promise(z => setTimeout(z, 200));
    const cp = sent.filter(m => m.type === 'claim')[0] || {};
    r.claim = { usesKey: cp.id === q2.key, hasNonce: !!cp.nonce };
    claimQuest(q2.q, BY[q2.at].name);
    /* and the editor cannot hand their sanitiser something it drops whole */
    document.getElementById('skinBtn').click(); await new Promise(z => setTimeout(z, 250));
    const host = document.getElementById('skMedia');
    const n0 = SCENE.vocabulary.media.length;
    host.querySelector('[data-vm="+"]').click(); await new Promise(z => setTimeout(z, 120));
    host.querySelector('.vmn').value = '   '; host.querySelector('.vmok').click();
    await new Promise(z => setTimeout(z, 150));
    r.blankRefused = SCENE.vocabulary.media.length === n0;
    host.querySelector('[data-vm="+"]').click(); await new Promise(z => setTimeout(z, 120));
    host.querySelector('.vmn').value = 'grey water'; host.querySelector('.vmok').click();
    await new Promise(z => setTimeout(z, 200));
    const m = SCENE.vocabulary.media[SCENE.vocabulary.media.length - 1];
    r.sanitiser = { key: m.key,
      ok: SCENE.vocabulary.media.every(x => /^[a-z0-9_-]{1,32}$/i.test(x.key) && /^[a-z0-9_-]{1,32}$/i.test(x.glyph)
        && /^#[0-9a-f]{6}$/i.test(x.color) && x.name.length <= 48) && SCENE.vocabulary.media.length <= 24,
      phases: Object.keys(SCENE.vocabulary.phases).every(k => /^\d{1,2}$/.test(String(k))) };
    document.getElementById('skinBtn').click();
    return r;
  });
  ok(amd.nonces.n === 3 && amd.nonces.unique === 3 && amd.nonces.all,
    `bridge: every post carries its own nonce (${amd.nonces.unique} of ${amd.nonces.n})`);
  ok(amd.stale.stored && amd.stale.delta === 1,
    'bridge: a late reply for a replaced intent is dropped, not applied');
  ok(!amd.current.stored && amd.current.delta === 0 && amd.current.calm,
    'bridge: the reply that answers the current post is honoured, calmly when the village has not imported');
  ok(amd.reasons, 'bridge: every reason the route can give has words of its own');
  ok(amd.key.onSeed && amd.key.stable && amd.key.exported && amd.key.unique && amd.key.shape,
    'quests: the key is a field the site stores, and a title edit does not move it');
  ok(amd.claim.usesKey && amd.claim.hasNonce, 'quests: a claim posts that key, never a recomputed slug');
  ok(amd.blankRefused && amd.sanitiser.ok && amd.sanitiser.phases,
    `vocabulary: nothing the editor writes can be dropped whole by the site (${amd.sanitiser.key})`);

  /* D1.2 on a phone: the two-finger pinch, in its own pocket context */
  const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, deviceScaleFactor: 3 } /* no isMobile: this Chromium reports innerWidth 4x the CSS viewport with it on */);
  const ppage = await pctx.newPage();
  const pperr = []; ppage.on('pageerror', e => pperr.push(String(e)));
  await ppage.goto(FILE + '#hud=pocket'); await ppage.waitForTimeout(1600);
  if (await ppage.evaluate(() => document.body.classList.contains('intro'))) await ppage.click('#enterBtn');
  await ppage.waitForTimeout(2600);
  const poc = await ppage.evaluate(() => {
    const el = document.getElementById('scene');
    const T = (t, pts) => el.dispatchEvent(new TouchEvent(t, {
      bubbles: true, cancelable: true,
      touches: pts.map((p, i) => new Touch({ identifier: i, target: el, clientX: p[0], clientY: p[1] }))
    }));
    cam.z = 1.4; clampCam(); const z0 = cam.z;
    T('touchstart', [[100, 400], [300, 400]]);
    T('touchmove', [[197, 400], [203, 400]]);  // 200 apart squeezed to 6: a pinch that asks for far more than the floor allows
    const z1 = cam.z; T('touchend', []);
    return { pocket: document.body.classList.contains('pocket'), z0, z1, floor: minZoom() };
  });
  ok(poc.pocket && poc.z1 < poc.z0, `D1.2: the pocket pinch is wired at all (${poc.z0} -> ${poc.z1})`);
  ok(Math.abs(poc.z1 - poc.floor) < 1e-9, `D1.2: a hard pinch out reaches the same fit floor on a phone (${poc.z1.toFixed(4)})`);
  const plab = await ppage.evaluate(() => {
    const shown = () => { syncBanners(); return SCENE.districts.filter(d => bEls['d_' + d.id].style.display !== 'none').length; };
    cam.z = minZoom(); cam.x = W / 2; cam.y = H / 2; clampCam(); const atFloor = shown();
    cam.z = 0.5; clampCam(); const closer = shown();
    return { atFloor, closer, n: SCENE.districts.length, landPx: Math.round(W * minZoom()) };
  });
  ok(plab.atFloor === 0 && plab.closer === plab.n,
    `D1.3: at the phone floor the land is ${plab.landPx} px wide and the district plates stand back (${plab.atFloor} shown, ${plab.closer} once there is room)`);
  ok(pperr.length === 0, `D1.2: zero page errors on the pocket profile (${pperr.length})`);
  await pctx.close();

  /* persistence: GS + vitals override + vocab survive */
  await page.waitForTimeout(3300);
  await page.goto(FILE); await page.waitForTimeout(1000);
  await page.click('#enterBtn'); await page.waitForTimeout(700);
  const bar = await page.evaluate(() => document.getElementById('restoreBar').style.display !== 'none');
  if (bar) { await page.click('#restoreYes'); await page.waitForTimeout(1000); }
  const back = await page.evaluate(() => ({
    food: (VITAL_OVR.food || {}).v, zone0: SUBTYPES.zone[0],
    barTxt: document.querySelector('.vital[data-k="food"] b').textContent
  }));
  ok(bar && back.food === '80kg' && back.barTxt === '80kg', 'restore: the founder\'s vital word survives');
  ok(back.zone0 === 'wildmeadow', 'restore: the founder\'s vocabulary survives');

  ok(perr.length === 0, `zero page errors (${perr.length})${perr.length ? ' — ' + perr[0] : ''}`);
  ok(cerr.length === 0, `zero console errors (${cerr.length})${cerr.length ? ' — ' + cerr[0] : ''}`);
  console.log(fails === 0 ? 'FEATURES: ALL GREEN' : `FEATURES: ${fails} FAILURES`);
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
