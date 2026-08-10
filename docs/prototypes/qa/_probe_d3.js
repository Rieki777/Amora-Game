const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  const perr=[]; p.on('pageerror',e=>perr.push(String(e)));
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1200);
  await p.click('#enterBtn'); await p.waitForTimeout(2600);
  console.log(JSON.stringify(await p.evaluate(() => {
    const media = SCENE.vocabulary.media;
    const sprites = media.every(m => flowSprite(m.key) instanceof HTMLCanvasElement);
    const mediums = [...new Set(SCENE.flows.map(f => f.medium))].sort();
    const known = mediums.every(k => media.some(m => m.key === k));
    // legacy alias + unknown adoption
    const alias = mediaKey('food');
    const n0 = media.length; const adopted = mediaOf('fish'); const n1 = media.length;
    // editor options come from the vocabulary
    document.getElementById('buildBtn').click();
    openInspect('kitchen');
    const sel = document.querySelector('[data-fmed]');
    const opts = sel ? [...sel.options].map(o => o.value) : [];
    closeInspect(); document.getElementById('buildBtn').click();
    const exp = buildExportJSON().map_scene.vocabulary.media;
    return { n: media.length, sprites, mediums, known, alias, adopted: adopted.key + '/' + adopted.glyph, grew: n1 === n0 + 1,
      optsFromVocab: opts.length === media.length && opts.every(o => media.some(m => m.key === o)),
      style: SKIN.flow_style, exported: Array.isArray(exp) && exp.length === media.length,
      expSkin: buildExportJSON().map_scene.art_manifest.skin.flow_style };
  }), null, 1));
  console.log('pageerrors', perr.length, perr.slice(0,2));
  await b.close();
})();
