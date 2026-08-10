/* Write the export the way a founder would, so check-schema has something real to read. */
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1200);
  await p.click('#enterBtn'); await p.waitForTimeout(2600);
  const J = await p.evaluate(() => buildExportJSON());
  fs.writeFileSync(process.argv[2] || 'amora-scene.json', JSON.stringify(J, null, 1));
  console.log('wrote', process.argv[2] || 'amora-scene.json');
  await b.close();
})();
