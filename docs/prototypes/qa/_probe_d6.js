const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  const perr=[]; p.on('pageerror',e=>perr.push(String(e)));
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1500);
  await p.click('#enterBtn'); await p.waitForTimeout(2800);
  console.log(JSON.stringify(await p.evaluate(async () => {
    const r={};
    // 1. media vocabulary editor
    document.getElementById('skinBtn').click(); await new Promise(z=>setTimeout(z,300));
    const host=document.getElementById('skMedia');
    r.media={chips:host.querySelectorAll('[data-vm]').length, types:SCENE.vocabulary.media.length};
    const chip=host.querySelector('[data-vm="0"]'); const wasKey=SCENE.vocabulary.media[0].key;
    chip.click(); await new Promise(z=>setTimeout(z,150));
    const box=host.querySelector('.vmn'); box.value='rainwater';
    host.querySelector('.vmc').value='#4499cc'; host.querySelector('.vmg').value='bolt';
    host.querySelector('.vmok').click(); await new Promise(z=>setTimeout(z,250));
    r.renamed={name:SCENE.vocabulary.media[0].name, key:SCENE.vocabulary.media[0].key, keyKept:SCENE.vocabulary.media[0].key===wasKey,
      color:SCENE.vocabulary.media[0].color, glyph:SCENE.vocabulary.media[0].glyph,
      mediaColorFollows: mediaColor(wasKey)==='#4499cc', flowsIntact: SCENE.flows.every(f=>SCENE.vocabulary.media.some(m=>m.key===mediaKey(f.medium))),
      audit: EDITS.some(e=>e.action==='vocab'&&/media/.test(e.target||''))};
    // add a type
    const n0=SCENE.vocabulary.media.length;
    host.querySelector('[data-vm="+"]').click(); await new Promise(z=>setTimeout(z,150));
    host.querySelector('.vmn').value='firewood'; host.querySelector('.vmok').click(); await new Promise(z=>setTimeout(z,250));
    r.added={n:SCENE.vocabulary.media.length-n0, key:(SCENE.vocabulary.media[SCENE.vocabulary.media.length-1]||{}).key,
      sprite: !!flowSprite('firewood')};
    // delete a type still in use is refused
    const inUse=SCENE.vocabulary.media.findIndex(m=>SCENE.flows.some(f=>mediaKey(f.medium)===m.key));
    host.querySelector(`[data-vm="${inUse}"]`).click(); await new Promise(z=>setTimeout(z,150));
    const before=SCENE.vocabulary.media.length; host.querySelector('.vmx').click(); await new Promise(z=>setTimeout(z,200));
    r.refusedDelete = SCENE.vocabulary.media.length===before;
    // 2. phase names
    const ph=document.getElementById('skPhases');
    r.phases={chips:ph.querySelectorAll('[data-vp]').length, shown:[...ph.querySelectorAll('[data-vp]')].map(e=>e.textContent)};
    ph.querySelector('[data-vp="2"]').click(); await new Promise(z=>setTimeout(z,150));
    const inp=ph.querySelector('input'); inp.value='Rising';
    inp.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); await new Promise(z=>setTimeout(z,250));
    r.renamedPhase={name:phaseName(2), exported:buildExportJSON().map_scene.vocabulary.phases['2'],
      audit:EDITS.some(e=>e.action==='vocab'&&/phase/.test(e.target||''))};
    document.getElementById('skinBtn').click();
    // 3. the three titles
    r.emdash = SCENE.quests.filter(q=>/—/.test(q.q)).length;
    // 4. events door
    r.eventsRoute = MODULES.events.route;
    return r;
  }), null, 1));
  console.log('pageerrors', perr.length, perr.slice(0,2));
  await b.close();
})();
