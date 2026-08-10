const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport:{width:1480,height:1180} })).newPage();
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1400);
  await p.click('#enterBtn'); await p.waitForTimeout(2600);
  console.log(JSON.stringify(await p.evaluate(() => {
    const rows = SCENE.quests.map(q=>({len:q.key.length, key:q.key, title:q.q}));
    return { n: rows.length, atCap: rows.filter(r=>r.len>=32), maxLen: Math.max(...rows.map(r=>r.len)),
      dupes: rows.length - new Set(rows.map(r=>r.key)).size,
      collideTest: (()=>{ // two titles that differ only past char 32
        const a='Walk the possible spring with the hydrologist', c='Walk the possible spring with the surveyor';
        return {a:slugify(a), c:slugify(c), same:slugify(a)===slugify(c)};})() };
  }), null, 1));
  await b.close();
})();
