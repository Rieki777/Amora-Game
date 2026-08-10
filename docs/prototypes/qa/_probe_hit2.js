const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1200);
  await p.click('#enterBtn'); await p.waitForTimeout(2800);
  console.log(JSON.stringify(await p.evaluate(() => {
    cam.z = 1.7; cam.x = 1240; cam.y = 700; clampCam(); syncBanners(); refreshBadges(); syncBanners();
    const out = { badgesZ: getComputedStyle(document.getElementById('badges')).zIndex, steals: [] };
    const inView = [...document.querySelectorAll('.bseal')].filter(s => {
      const r = s.getBoundingClientRect();
      return r.width > 0 && r.x > 60 && r.y > 90 && r.right < innerWidth - 60 && r.bottom < innerHeight - 90
        && s.closest('.bgroup').classList.contains('on')
        && getComputedStyle(s).display !== 'none';
    });
    out.inView = inView.length; out.mine = 0;
    for (const s of inView) {
      const r = s.getBoundingClientRect();
      const el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      if (el && (el === s || s.contains(el))) { out.mine++; continue; }
      const chain = []; let n = el;
      while (n && n !== document.body) { const cs = getComputedStyle(n); chain.push((n.id ? '#' + n.id : n.tagName.toLowerCase()) + (cs.zIndex !== 'auto' ? '[z' + cs.zIndex + ']' : '')); n = n.parentElement; }
      if (out.steals.length < 8) out.steals.push({ seal: s.dataset.bk + ':' + s.dataset.bkind, by: chain.join(' < ') });
    }
    return out;
  }), null, 1));
  await b.close();
})();
