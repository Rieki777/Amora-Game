/* What does P1 actually put on the land? Counts, overlaps, hit reachability. */
const { chromium } = require('playwright');
const FILE = process.env.GROUNDS_FILE, EXE = process.env.PW_EXE;

(async () => {
  const b = await chromium.launch({ executablePath: EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(FILE); await p.waitForTimeout(1200);
  await p.click('#enterBtn'); await p.waitForTimeout(2800);

  const r = await p.evaluate(() => {
    cam.z = 1.7; cam.x = 1240; cam.y = 700; clampCam(); syncBanners(); refreshBadges(); syncBanners();
    const seals = [...document.querySelectorAll('.bseal')];
    const vis = seals.filter(s => s.getBoundingClientRect().width > 0 && s.closest('.bgroup').classList.contains('on'));
    const boxes = vis.map(s => { const r = s.getBoundingClientRect(); return { k: s.dataset.bk, kind: s.dataset.bkind, cx: r.x + r.width / 2, cy: r.y + r.height / 2, w: r.width }; });
    let pairs = 0; const worst = [];
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const d = Math.hypot(boxes[i].cx - boxes[j].cx, boxes[i].cy - boxes[j].cy);
      const need = (boxes[i].w + boxes[j].w) / 2;
      if (d < need) { pairs++; if (worst.length < 6) worst.push({ a: boxes[i].k + ':' + boxes[i].kind, b: boxes[j].k + ':' + boxes[j].kind, d: Math.round(d), need: Math.round(need) }); }
    }
    // does the top element at a seal's centre belong to the seal?
    let reach = 0, stolen = [];
    for (const s of vis.slice(0, 40)) {
      const r = s.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (el && (el === s || s.contains(el))) reach++;
      else if (stolen.length < 5) stolen.push({ seal: s.dataset.bk + ':' + s.dataset.bkind, got: el ? (el.id || el.className || el.tagName) : 'null' });
    }
    const kinds = {}; vis.forEach(s => kinds[s.dataset.bkind] = (kinds[s.dataset.bkind] || 0) + 1);
    return {
      groups: document.querySelectorAll('.bgroup.on').length, seals: vis.length, kinds,
      overlappingPairs: pairs, worst, reachable: reach, of: Math.min(40, vis.length), stolen,
      evbadgeInPoi: !!pEls.kitchen.querySelector('.evbadge svg'),
      labelChip: bEls.ridgeA ? bEls.ridgeA.querySelector('.cnt').textContent : '(none)',
      zGate: { at08: (cam.z = 0.8, clampCam(), syncBanners(), document.querySelectorAll('.bgroup.on').length) }
    };
  });
  console.log(JSON.stringify(r, null, 1));
  console.log('pageerrors', perr.length);
  await b.close();
})();
