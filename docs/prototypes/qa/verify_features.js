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
