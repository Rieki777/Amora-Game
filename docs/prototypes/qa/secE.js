// Sections 24-26 (+ deferred cross-checks)
const fs = require('fs');
module.exports = async function (page, H) {
  const L = H.log;

  /* ================= 24. QUEST ADDRESS RESOLVER ================= */
  L('\n########## §24 RESOLVER ##########');
  if (!(await H.ev(() => buildMode))) { await page.click('#buildBtn'); await H.wait(600); }
  await page.click('#resolverBtn'); await H.wait(600);
  L('24. open =', await H.ev(() => document.getElementById('resolver').classList.contains('show')));
  const rd = () => H.ev(() => ({
    steps: [...document.querySelectorAll('#rqSteps .rstep')].map(s => ({ hit: s.classList.contains('hit'), no: s.querySelector('.no').textContent, txt: s.textContent.replace(/\s+/g, ' ').trim().slice(6, 105) })),
    addr: (document.querySelector('#rqSteps .raddr') || {}).textContent ? document.querySelector('#rqSteps .raddr').textContent.replace(/\s+/g, ' ').trim().slice(0, 110) : null,
    key: (window._rq && window._rq.r) ? window._rq.r.key : undefined, guessed: !!(window._rq && window._rq.r && window._rq.r.guessed),
    btns: [...document.querySelectorAll('#rqSteps .raddr .btn')].map(b => b.textContent),
  }));
  const show = async (tag) => { const r = await rd(); L('24.', tag, '-> key=' + r.key, 'guessed=' + r.guessed, '| steps ' + r.steps.length); r.steps.forEach((s, i) => L('      ' + (s.hit ? '✓' : s.no) + ' ' + s.txt)); L('      addr:', r.addr, '| btns', JSON.stringify(r.btns)); return r; };

  // live re-resolution as you type
  L('-- live typing --');
  for (const frag of ['fix', 'fix the', 'fix the drip', 'fix the drip lines']) {
    await page.fill('#rqText', frag); await H.wait(350);
    const r = await rd(); L('24. "' + frag + '" -> ' + r.key + ' (steps ' + r.steps.length + ', guessed ' + r.guessed + ')');
  }
  const r1 = await show('"fix the drip lines"');
  await H.shot('24a-resolver-lexicon');
  // pledged role
  await page.fill('#rqText', 'check the valves'); await H.wait(250);
  await page.selectOption('#rqRole', 'Water Steward'); await H.wait(400);
  const r2 = await show('role=Water Steward');
  // circle
  await page.selectOption('#rqRole', ''); await H.wait(250);
  await page.selectOption('#rqCircle', 'Gathering'); await H.wait(400);
  await page.fill('#rqText', 'zzzz qqqq'); await H.wait(400);
  const r3 = await show('circle=Gathering');
  // gibberish -> 5 steps -> board
  await page.selectOption('#rqCircle', ''); await H.wait(250);
  await page.fill('#rqText', 'zzzz qqqq wwww'); await H.wait(450);
  const r4 = await show('gibberish');
  await H.shot('24b-resolver-board');
  // explicit override path
  L('-- create + show me --');
  await page.fill('#rqText', 'fix the drip lines'); await H.wait(400);
  const qBefore = await H.ev(() => SCENE.quests.length);
  await H.clearToasts();
  await page.click('#rqSteps .raddr .btn'); await H.wait(700);          // "Create it there"
  const created = await H.ev(() => { const q = SCENE.quests[SCENE.quests.length - 1]; return { q: q.q, at: q.at, addr: q.addr, r: q.r, need: q.need }; });
  L('24. Create it there ->', JSON.stringify(created), '| quests', qBefore, '->', await H.ev(() => SCENE.quests.length), '| toast', JSON.stringify(await H.toasts()));
  L('24. field cleared =', await H.ev(() => document.getElementById('rqText').value === ''));
  // board creation
  await page.fill('#rqText', 'zzzz qqqq wwww'); await H.wait(450);
  await H.clearToasts();
  await page.click('#rqSteps .raddr .btn'); await H.wait(700);
  const created2 = await H.ev(() => { const q = SCENE.quests[SCENE.quests.length - 1]; return { q: q.q, at: q.at, addr: q.addr }; });
  L('24. board create ->', JSON.stringify(created2), '| toast', JSON.stringify(await H.toasts()));
  // "Show me" travels
  await page.fill('#rqText', 'fix the drip lines'); await H.wait(450);
  const camB = await H.cam();
  const btns = await H.ev(() => [...document.querySelectorAll('#rqSteps .raddr .btn')].map(b => b.textContent));
  if (btns.length > 1) { await page.click('#rqSteps .raddr .btn.ghostbtn'); await H.wait(1500); }
  L('24. Show me: cam', JSON.stringify(camB), '->', JSON.stringify(await H.cam()));
  let bad = await H.badText(); L('24. badText:', JSON.stringify(bad));
  await page.click('#resolverClose'); await H.wait(400);

  /* ---- deferred: timed quest sent to the Quest Board, then cycle the attention pill ---- */
  L('\n-- deferred: board-bound TIMED quest vs the attention cycle --');
  const timed = await H.ev(() => { const i = SCENE.quests.findIndex(q => /Saturday|tonight|Thu/.test(q.r + q.need) && q.at); return i < 0 ? null : { i, q: SCENE.quests[i].q, at: SCENE.quests[i].at }; });
  L('  timed quest picked:', JSON.stringify(timed), '| badge', await H.ev(() => document.getElementById('attnBadge').textContent));
  await H.clickPoi(timed.at); await H.wait(1100);
  const sel = await H.ev(i => { const s = document.querySelector(`#inspBody [data-qaddr="${i}"]`); return !!s; }, timed.i);
  if (sel) {
    await page.selectOption(`#inspBody [data-qaddr="${timed.i}"]`, ''); await H.wait(700);
    L('  sent to board. quest.at =', await H.ev(i => SCENE.quests[i].at, timed.i), '| badge', await H.ev(() => document.getElementById('attnBadge').textContent));
    L('  attnItems now contains a null address =', await H.ev(() => attnItems().some(it => !it.at || !BY[it.at])));
    await H.closeInspect();
    await page.click('#buildBtn'); await H.wait(600);
    const errB = H.errors.length;
    let crashed = null;
    for (let i = 0; i < 18; i++) {
      await page.click('#attnBtn'); await H.wait(320);
      if (H.errors.length > errB) { crashed = i; break; }
    }
    L('  cycled the attention pill 18x -> new errors =', H.errors.length - errB, crashed !== null ? ('CRASHED on click #' + (crashed + 1)) : '(no crash)');
    if (H.errors.length > errB) L('  verbatim:', JSON.stringify(H.errors.slice(errB), null, 1));
    await H.shot('24c-attention-board-quest');
    await H.ev(() => document.getElementById('attnCard').classList.remove('show'));
    await page.click('#buildBtn'); await H.wait(500);
    // put it back
    await H.clickPoi(timed.at); await H.wait(900);
    await H.closeInspect();
    await H.ev(([i, at]) => { SCENE.quests[i].at = at; refreshWork(); }, [timed.i, timed.at]);
  }

  /* ================= 25. DATA LAYERS ================= */
  L('\n########## §25 DATA LAYERS ##########');
  if (await H.ev(() => buildMode)) { await page.click('#buildBtn'); await H.wait(600); }
  for (const k of ['greenhouse', 'kitchen', 'tank', 'council', 'spring2']) {
    await H.clickPoi(k); await H.wait(900);
    const ov = await H.ev(() => {
      const b = document.getElementById('panelBody');
      const heads = [...b.querySelectorAll('div')].map(d => d.textContent.trim()).filter(t => /vitals at this address|metabolism/i.test(t.slice(0, 40))).map(t => t.slice(0, 70));
      return { txt: b.textContent.replace(/\s+/g, ' ').trim(), chips: [...b.querySelectorAll('span')].map(s => s.textContent.trim()).filter(Boolean).slice(0, 12), heads };
    });
    const roleLine = await H.ev(k => (BY[k] || {}).role || null, k);
    L('25.', k, '\n     roleLine:', JSON.stringify(roleLine));
    L('     chain:', JSON.stringify((ov.txt.match(/(Village Heart|The [A-Za-z ]+|the land) · phase \d · AMORA MASTER PLAN V7/) || [])[0] || null));
    L('     vitals hdr:', JSON.stringify(ov.heads.filter(h => /vitals/i.test(h))), '| metabolism hdr:', JSON.stringify(ov.heads.filter(h => /metabolism/i.test(h))));
    L('     chips:', JSON.stringify(ov.chips));
    L('     imported warning present =', /imported inputs are quests waiting to be written/.test(ov.txt), '| no-flows line =', /No declared flows yet/.test(ov.txt), '| no-readings line =', /No live readings here yet/.test(ov.txt));
    if (k === 'greenhouse') await H.shot('25a-overview-greenhouse');
    if (k === 'spring2') await H.shot('25b-overview-spring2');
    await H.closePanel();
  }
  // flows lens
  L('-- §25 flows lens --');
  await H.ev(() => { travel = null; cam.x = 1400; cam.y = 700; cam.z = 0.9; clampCam(); }); await H.wait(500);
  await H.clearToasts();
  await page.click('#lyFlows'); await H.wait(900);
  L('25. flows on =', await H.ev(() => flowsOn), '| toast', JSON.stringify(await H.toasts()), '| maia', JSON.stringify(await H.maia(1)));
  const fstats = await H.ev(() => ({ total: SCENE.flows.length, imports: SCENE.flows.filter(f => !f.from).length, realEdges: SCENE.flows.filter(f => f.from && f.to).length, bpEdges: SCENE.flows.filter(f => (f.from && BY[f.from] && BY[f.from].state === 'blueprint') || (f.to && BY[f.to] && BY[f.to].state === 'blueprint')).length }));
  L('25. flows:', JSON.stringify(fstats));
  await H.shot('25c-flows-lens-now');
  // particles actually animate: sample the canvas twice
  const px1 = await H.ev(() => { const g = cv.getContext('2d'); const d = g.getImageData(0, 0, cv.width, cv.height).data; let h = 0; for (let i = 0; i < d.length; i += 4001) h = (h * 31 + d[i]) >>> 0; return h; });
  await H.wait(700);
  const px2 = await H.ev(() => { const g = cv.getContext('2d'); const d = g.getImageData(0, 0, cv.width, cv.height).data; let h = 0; for (let i = 0; i < d.length; i += 4001) h = (h * 31 + d[i]) >>> 0; return h; });
  L('25. canvas animating =', px1 !== px2);
  await page.click('#lyVision'); await H.wait(1000); await H.shot('25d-flows-lens-vision');
  L('25. vision+flows: blueprint edges now visible (mode=vision) =', await H.ev(() => mode === 'vision'));
  await page.click('#lyNow'); await H.wait(800);
  await page.click('#lyFlows'); await H.wait(500);
  L('25. flows off =', await H.ev(() => !flowsOn));

  /* ---- deferred cross-checks ---- */
  L('\n-- deferred: labels-always-win at label zoom, vector+vision, minimap follows terrain --');
  await H.ev(() => { travel = null; cam.x = 1350; cam.y = 640; cam.z = 1.25; clampCam(); }); await H.wait(700);
  const labTest = async (tag) => {
    const lab = await H.ev(() => { const out = []; for (const s of SCENE.structures) { const b = bEls[s.key], p = pEls[s.key]; if (!b || getComputedStyle(b).display === 'none') continue; const r = b.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 2 || y < 2 || x > innerWidth - 2 || y > innerHeight - 2) continue; const t = document.elementFromPoint(x, y); out.push([s.key, (t && (t.className || t.tagName)) + '', !!(t && (b === t || b.contains(t)))]); } return out; });
    L('  ' + tag + ': tested ' + lab.length + ' crowns | all on top =', lab.every(x => x[2]), lab.filter(x => !x[2]).length ? JSON.stringify(lab.filter(x => !x[2])) : '');
    // banner-vs-banner overlap
    const col = await H.ev(() => { const items = SCENE.structures.map(s => ({ k: s.key, b: bEls[s.key] })).filter(o => o.b && getComputedStyle(o.b).display !== 'none').map(o => ({ k: o.k, r: o.b.getBoundingClientRect() })); const pairs = []; for (let i = 0; i < items.length; i++)for (let j = i + 1; j < items.length; j++) { const a = items[i].r, d = items[j].r; if (!(a.right <= d.left || d.right <= a.left || a.bottom <= d.top || d.bottom <= a.top)) pairs.push([items[i].k, items[j].k, Math.round(Math.min(a.right, d.right) - Math.max(a.left, d.left)) + 'x' + Math.round(Math.min(a.bottom, d.bottom) - Math.max(a.top, d.top))]); } return { n: items.length, overlaps: pairs.length, pairs }; });
    L('  ' + tag + ': crowns', JSON.stringify(col));
  };
  await page.click('#themeBtn'); await H.wait(250);
  for (const im of ['flat', 'iso', 'painted']) { await page.click(`[data-im="${im}"]`); await H.wait(700); await labTest('iconMode=' + im); }
  await page.click('[data-im="painted"]'); await H.wait(400);
  await page.click('[data-tm="paint"]'); await H.wait(700);
  await page.click('#themeBtn'); await H.wait(300);
  await H.shot('25e-labels-painted-zoom');
  // vector + vision
  await page.click('#themeBtn'); await H.wait(250); await page.click('[data-tm="vector"]'); await H.wait(800); await page.click('#themeBtn'); await H.wait(250);
  await page.click('#lyVision'); await H.wait(900);
  L('  vector+vision: activePlate =', await H.ev(() => !!activePlate()), '| mode', await H.ev(() => mode));
  await H.shot('25f-vector-vision');
  await page.click('#lyNow'); await H.wait(600);
  // minimap follows the active terrain mode
  const hashes = {};
  await page.click('#themeBtn'); await H.wait(250);
  for (const tm of ['sat', 'paint', 'vector']) { await page.click(`[data-tm="${tm}"]`); await H.wait(800); hashes[tm] = await H.mmHash(); }
  await page.click('[data-tm="paint"]'); await H.wait(600);
  await page.click('#themeBtn'); await H.wait(250);
  L('  minimap hashes per terrain:', JSON.stringify(hashes), '| all distinct =', new Set(Object.values(hashes)).size === 3);
  await H.shot('25g-minimap-paint');

  /* ================= 26. EXPORT ================= */
  L('\n########## §26 EXPORT ##########');
  if (!(await H.ev(() => buildMode))) { await page.click('#buildBtn'); await H.wait(600); }
  const dl = page.waitForEvent('download', { timeout: 15000 });
  await page.click('#exportBtn');
  let json = null, fname = null;
  try {
    const d = await dl; fname = d.suggestedFilename();
    const p = '/root/qa/' + fname; await d.saveAs(p);
    json = JSON.parse(fs.readFileSync(p, 'utf8'));
    L('26. downloaded', fname, fs.statSync(p).size, 'bytes | valid JSON = true');
  } catch (e) {
    L('26. download failed:', e.message);
  }
  L('26. maia:', JSON.stringify(await H.maia(1)));
  if (json) {
    const has = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o) !== undefined;
    const keys = Object.keys(json);
    L('26. top-level keys:', JSON.stringify(keys));
    const need = ['map_scene', 'map_zones', 'map_structures', 'map_flows', 'map_structure_facts', 'map_edits', 'boundary', 'circles', 'org_roles', 'quests'];
    L('26. required blocks present:', JSON.stringify(need.map(k => k + '=' + (json[k] !== undefined))));
    const g = json.map_scene.georef;
    L('26. georef:', JSON.stringify({ pin: g.pin, pin_world: g.pin_world, meters_per_unit: g.meters_per_unit, affine: g.masterplan_affine }));
    L('26. art_manifest:', JSON.stringify(json.map_scene.art_manifest).slice(0, 300));
    const s0 = json.map_structures[0];
    L('26. structure sample keys:', JSON.stringify(Object.keys(s0)));
    L('26. structure sample:', JSON.stringify(s0).slice(0, 320));
    L('26. structures =', json.map_structures.length, '| live SCENE =', await H.ev(() => SCENE.structures.length));
    // compute-on-read contract: no counts embedded per structure
    const countish = json.map_structures.filter(s => JSON.stringify(s).match(/"(quest_count|seat_count|counts|num_quests|open_seats)"/));
    L('26. per-structure count fields =', countish.length, '| counts note =', JSON.stringify(json.counts));
    L('26.   quest_tags present (empty by contract) =', JSON.stringify(s0.bindings.quest_tags));
    L('26. flows =', json.map_flows.length, '| imported flagged =', json.map_flows.filter(f => f.imported).length, '| sample', JSON.stringify(json.map_flows[0]));
    L('26. facts =', json.map_structure_facts.length, '| sample', JSON.stringify(json.map_structure_facts[0]));
    const seqs = json.map_edits.map(e => e.seq);
    L('26. edits =', json.map_edits.length, '| seq ascending =', seqs.every((v, i) => i === 0 || v > seqs[i - 1]), '| first seq', seqs[0], '| last', seqs[seqs.length - 1]);
    L('26. edit actions:', JSON.stringify([...new Set(json.map_edits.map(e => e.action))]));
    const ring = json.boundary.geojson.geometry.coordinates[0];
    L('26. boundary: scene_units', json.boundary.scene_units.length, '| masterplan_px', json.boundary.masterplan_px.length, '| ring', ring.length,
      '| closed =', JSON.stringify(ring[0]) === JSON.stringify(ring[ring.length - 1]), '| first', JSON.stringify(ring[0]), '| type', json.boundary.geojson.geometry.type);
    const lons = ring.map(p => p[0]), lats = ring.map(p => p[1]);
    L('26. lon range', Math.min(...lons).toFixed(4), '..', Math.max(...lons).toFixed(4), '| lat range', Math.min(...lats).toFixed(4), '..', Math.max(...lats).toFixed(4));
    L('26. circles =', json.circles.length, '| with home_structure_key =', json.circles.filter(c => c.home_structure_key).length, '| sample', JSON.stringify(json.circles.slice(0, 2)));
    L('26. org_roles =', json.org_roles.length, '| sample', JSON.stringify(json.org_roles[0]));
    const addrs = json.quests.map(q => q.address);
    L('26. quests =', json.quests.length, '| address labels:', JSON.stringify([...new Set(addrs)]), '| counts', JSON.stringify(addrs.reduce((a, v) => (a[v] = (a[v] || 0) + 1, a), {})));
    L('26. lexicon-guess quests:', JSON.stringify(json.quests.filter(q => q.address === 'lexicon guess')));
    L('26. board quests:', JSON.stringify(json.quests.filter(q => !q.structure_key).map(q => q.title)));
    L('26. map_zones =', json.map_zones.length, '| kinds', JSON.stringify([...new Set(json.map_zones.map(z => z.kind))]));
    const badJson = JSON.stringify(json).match(/"[^"]*undefined[^"]*"/g);
    L('26. "undefined" strings in export =', badJson ? JSON.stringify(badJson.slice(0, 5)) : 'none');
    // sprite approvals / re-rolls recorded
    L('26. sprite manifest:', JSON.stringify(json.map_scene.art_manifest.sprites));
    L('26. sprite edits in trail:', JSON.stringify(json.map_edits.filter(e => /sprite/.test(e.action)).map(e => e.action + ':' + e.target)));
    L('26. boundary edits in trail:', JSON.stringify(json.map_edits.filter(e => /boundary/.test(e.action)).length));
  }
  await H.shot('26a-export-done');
  if (await H.ev(() => buildMode)) { await page.click('#buildBtn'); await H.wait(500); }
};
