const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  const perr=[]; p.on('pageerror',e=>perr.push(String(e)));
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1500);
  await p.click('#enterBtn'); await p.waitForTimeout(2800);
  console.log(JSON.stringify(await p.evaluate(() => {
    const rows=[];
    for (const z of [0.52, 0.62, 0.8, 0.92]) {
      cam.z = z; cam.x = W/2; cam.y = H/2; clampCam(); refreshBadges(); syncBanners(); syncBanners(); syncBanners();
      const plates = [...SCENE.districts.map(d=>bEls['d_'+d.id]), ...GEO.map((g,i)=>bEls['g_'+i])]
        .filter(e=>e && e.style.display!=='none').map(e=>({t:e.textContent, r:e.getBoundingClientRect()}));
      let over=0, first='';
      for (let i=0;i<plates.length;i++) for (let j=i+1;j<plates.length;j++){
        const a=plates[i].r,c=plates[j].r;
        if(a.left<c.right&&c.left<a.right&&a.top<c.bottom&&c.top<a.bottom){over++; if(!first)first=plates[i].t+' / '+plates[j].t}}
      rows.push({z, plates:plates.length, over, first});
    }
    return rows;
  }), null, 1));
  console.log('pageerrors', perr.length);
  await b.close();
})();
