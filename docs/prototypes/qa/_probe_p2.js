const { chromium } = require('playwright');
const F = process.env.GROUNDS_FILE;
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const ctx = await b.newContext({ viewport: { width: 1480, height: 1180 } });
  const p = await ctx.newPage();
  const perr = []; p.on('pageerror', e => perr.push(String(e)));
  await p.goto(F); await p.waitForTimeout(1200);
  await p.click('#enterBtn'); await p.waitForTimeout(2600);
  const out = {};
  // tapping a quest badge lands on that quest
  Object.assign(out, await p.evaluate(async () => {
    cam.z = 1.7; cam.x = 1240; cam.y = 700; clampCam(); refreshBadges(); syncBanners(); syncBanners();
    const seal = [...document.querySelectorAll('.bseal.b-quest')].find(s => getComputedStyle(s).display !== 'none');
    const key = seal.dataset.bk; seal.click();
    await new Promise(r => setTimeout(r, 700));
    const f = document.querySelector('.itemfocus');
    return { key, hash: location.hash, focus: f ? f.dataset.item : null, tab: [...document.getElementById('tabs').children].findIndex(x => x.classList.contains('on')) };
  }));
  // the same address, arrived at cold
  const hash = out.hash;
  await p.goto(F + hash); await p.waitForTimeout(1400);
  Object.assign(out, { cold: await p.evaluate(() => ({ panel: panelKey, focus: (document.querySelector('.itemfocus') || {}).dataset ? document.querySelector('.itemfocus').dataset.item : null, tab: [...document.getElementById('tabs').children].findIndex(x => x.classList.contains('on')) })) });
  // seat, event, talk, invite
  Object.assign(out, await p.evaluate(async () => {
    const r = {};
    const tap = async k => { document.getElementById('panelClose').click(); closeDoor();
      cam.z = 1.7; clampCam(); refreshBadges(); syncBanners(); syncBanners();
      const s = [...document.querySelectorAll('.bseal.b-' + k)].find(x => getComputedStyle(x).display !== 'none');
      if (!s) return null; s.click(); await new Promise(z => setTimeout(z, 600));
      return { bk: s.dataset.bk, hash: location.hash, focus: (document.querySelector('.itemfocus') || {}).dataset?.item || null,
        module: document.getElementById('module').classList.contains('show') ? document.getElementById('moduleCard').textContent.slice(0, 60) : null,
        resolver: document.getElementById('resolver').classList.contains('show'), rqHome: window._rqHome || null };
    };
    r.seat = await tap('seat'); r.event = await tap('event'); r.talk = await tap('talk'); r.invite = await tap('invite');
    return r;
  }));
  console.log(JSON.stringify(out, null, 1));
  console.log('pageerrors', perr.length, perr.slice(0, 2));
  await b.close();
})();
