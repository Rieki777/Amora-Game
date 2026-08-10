const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  const perr=[]; p.on('pageerror',e=>perr.push(String(e)));
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1200);
  await p.click('#enterBtn'); await p.waitForTimeout(2800);
  console.log(JSON.stringify(await p.evaluate(() => {
    const out = {};
    cam.z = 0.85; cam.x = 1240; cam.y = 700; clampCam(); refreshBadges(); syncBanners(); syncBanners();
    const vis = sel => [...document.querySelectorAll(sel)].filter(e => e.getBoundingClientRect().width > 0 && getComputedStyle(e).display !== 'none' && e.closest('.bgroup').className.match(/\b(on|far)\b/));
    out.far = { aseals: vis('.aseal').length, hchips: vis('.hchip').length, seals: vis('.bseal').length,
      counts: vis('.aseal').slice(0,6).map(a => a.dataset.bk + '=' + a.textContent), soon: document.querySelectorAll('.aseal.soon').length };
    // the counts must equal the projections
    out.check = SCENE.structures.slice(0, 40).map(s => {
      const a = bgEls[s.key] && bgEls[s.key].querySelector('.aseal'); if (!a) return null;
      const want = questsAt(s.key).length + seatsAt(s.key).length + threadsAt(s.key).length + eventsAt(s.key).length;
      return { k: s.key, shown: a.textContent, want: want > 9 ? '9+' : String(want) };
    }).filter(Boolean).filter(r => r.shown !== r.want);
    cam.z = 1.7; clampCam(); syncBanners();
    out.near = { aseals: vis('.aseal').length, hchips: vis('.hchip').length, seals: vis('.bseal').length };
    out.labelChip = bEls.ridgeA.querySelector('.cnt').textContent;
    // no overlap including the chips
    const all = [...document.querySelectorAll('.bseal,.aseal,.hchip')].filter(e => e.getBoundingClientRect().width>0 && getComputedStyle(e).display!=='none' && e.closest('.bgroup').className.match(/\b(on|far)\b/));
    const bx = all.map(e => { const r = e.getBoundingClientRect(); return { e, cx: r.x+r.width/2, cy: r.y+r.height/2 }; });
    out.touching = []; 
    for (let i=0;i<bx.length;i++) for (let j=i+1;j<bx.length;j++) {
      const d = Math.hypot(bx[i].cx-bx[j].cx, bx[i].cy-bx[j].cy);
      if (d < 43.5 && out.touching.length < 5) out.touching.push(`${bx[i].e.dataset.bk}:${bx[i].e.dataset.bkind||bx[i].e.className} vs ${bx[j].e.dataset.bk}:${bx[j].e.dataset.bkind||bx[j].e.className} ${Math.round(d)}`);
    }
    return out;
  }), null, 1));
  console.log('pageerrors', perr.length, perr.slice(0,2));
  await b.close();
})();
