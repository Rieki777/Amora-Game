const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  const perr=[]; p.on('pageerror',e=>perr.push(String(e)));
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1500);
  await p.click('#enterBtn'); await p.waitForTimeout(2800);
  console.log(JSON.stringify(await p.evaluate(async () => {
    const r={};
    r.defaultNull = SCENE.vision_bound === null;
    r.btnNow = document.getElementById('boundBtn').textContent.trim();
    document.getElementById('lyVision').click(); await new Promise(z=>setTimeout(z,400));
    document.getElementById('buildBtn').click(); await new Promise(z=>setTimeout(z,300));
    syncBoundBtn();
    r.btnVision = document.getElementById('boundBtn').textContent.trim();
    r.editingVision = editingVision();
    const B = boundTarget();
    r.seeded = B === SCENE.vision_bound && B.length === SCENE.bound.length;
    r.outside = SCENE.vision_bound.every((p,i)=>{
      const c=SCENE.bound.reduce((a,q)=>[a[0]+q[0]/SCENE.bound.length,a[1]+q[1]/SCENE.bound.length],[0,0]);
      return Math.hypot(p[0]-c[0],p[1]-c[1]) > Math.hypot(SCENE.bound[i][0]-c[0],SCENE.bound[i][1]-c[1]); });
    // move a vertex, then undo
    const was = SCENE.vision_bound[0].slice();
    SCENE.vision_bound[0][0]+=140; 
    UNDO.push({t:'bound',prev:[[was[0],was[1]],...SCENE.vision_bound.slice(1).map(q=>[q[0],q[1]])],vis:true});
    document.getElementById('undoBtn').click(); await new Promise(z=>setTimeout(z,250));
    r.undo = Math.abs(SCENE.vision_bound[0][0]-was[0]) < 0.5;
    r.realUntouched = SCENE.bound.length > 3;
    // stranded still reads the deed
    const nStr0 = SCENE.structures.filter(s=>s.stranded).length;
    strandedCheck(false);
    r.strandedUsesDeed = SCENE.structures.filter(s=>s.stranded).length === nStr0;
    // camera reaches the dream
    cam.z=1.0; const bb=camBounds();
    const vx=Math.max(...SCENE.vision_bound.map(p=>p[0]));
    r.cameraReaches = bb[1] >= vx - 0.5;
    // export + restore
    const J = buildExportJSON();
    r.exported = Array.isArray(J.map_scene.vision_bound) && J.map_scene.vision_bound.length === SCENE.vision_bound.length;
    const keep = JSON.stringify(SCENE.vision_bound);
    restoreScene(JSON.parse(JSON.stringify(J))); await new Promise(z=>setTimeout(z,400));
    r.restored = JSON.stringify(SCENE.vision_bound) === keep;
    document.getElementById('buildBtn').click(); document.getElementById('lyNow').click(); syncBoundBtn();
    r.btnBack = document.getElementById('boundBtn').textContent.trim();
    return r;
  }), null, 1));
  console.log('pageerrors', perr.length, perr.slice(0,2));
  await b.close();
})();
