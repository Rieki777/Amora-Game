const { boot, mk, ERRORS } = require('./lib2');
const fs = require('fs');

const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);

(async () => {
  const { browser, page } = await boot();
  const H = mk(page);
  const secs = [['A','./secA'],['B','./secB'],['C','./secC'],['D','./secD'],['E','./secE']];
  if (ONLY.length && !ONLY.includes('A')) { await page.click('#enterBtn'); await page.waitForTimeout(3000); console.log('(entered the land — §1 skipped in this run)'); }
  for (const [name, mod] of secs) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    let fn; try { fn = require(mod); } catch (e) { console.log('== skip ' + name + ' (' + e.message + ')'); continue; }
    try { await fn(page, H); }
    catch (e) { console.log('\n@@@@ SECTION ' + name + ' THREW: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')); await H.shot('CRASH-' + name); }
  }
  console.log('\n\n########## §27 FULL-SESSION ERROR TALLY ##########');
  console.log('total captured =', ERRORS.length);
  ERRORS.forEach((e, i) => console.log(`  [${i + 1}] ${e.kind}: ${e.text}\n       ${e.stack || e.loc || ''}`));
  fs.writeFileSync('/root/qa/tally.json', JSON.stringify(ERRORS, null, 2));
  await browser.close();
})();
