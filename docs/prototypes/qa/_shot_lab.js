const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1080, height: 1200 }, deviceScaleFactor: 4 })).newPage();
  await p.goto('file:///C:/Users/taren/Desktop/Amora/ga-map/docs/prototypes/qa/charge_lab.html');
  await p.waitForTimeout(600);
  await p.screenshot({ path: process.env.SHOT_DIR + '/charge-lab.png', fullPage: true });
  console.log('ok');
  await b.close();
})();
