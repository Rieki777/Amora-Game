const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const ctx = await b.newContext({ viewport: { width: 1480, height: 1180 } });
  const p = await ctx.newPage();
  const perr=[], posts=[];
  p.on('pageerror',e=>perr.push(String(e)));
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1500);
  await p.click('#enterBtn'); await p.waitForTimeout(2800);
  await p.evaluate(() => { window.__posts=[]; const o=window.bridgePost; window.bridgePost=m=>{window.__posts.push(m);o(m)}; });
  console.log(JSON.stringify(await p.evaluate(async () => {
    const r={version:BUILD_VERSION};
    // D5.1 rsvp toggle
    const e=EVENTS[0]; const c0=e.rsvp;
    openDoor('events',{}); await new Promise(z=>setTimeout(z,300));
    const card=document.getElementById('moduleCard');
    r.disclosure=/Going adds this to your calendar in your profile and signs you up for updates by email\. Tap again any time to change your answer\./.test(card.textContent);
    evRSVP(e.id); await new Promise(z=>setTimeout(z,200));
    const btn=document.querySelector(`[data-ev="${e.id}"]`);
    r.on={count:e.rsvp-c0, label:btn?btn.textContent:'', stored:!!EV_RSVP[e.id], disabled:btn?btn.disabled:null};
    evRSVP(e.id); await new Promise(z=>setTimeout(z,200));
    r.off={count:e.rsvp-c0, label:document.querySelector(`[data-ev="${e.id}"]`).textContent, stored:!!EV_RSVP[e.id]};
    closeDoor();
    // D5.2 claim toggle + first step
    const q=SCENE.quests.find(x=>x.at==='greenhouse'); q.how_to='Meet Sol at the greenhouse door at seven, before the heat.';
    openPanel(q.at,1); await new Promise(z=>setTimeout(z,900));
    r.claimDisclosure=/Claiming adds this quest to your profile with how to begin, and signs you up for updates\. Release it any time\./.test(document.getElementById('panelBody').textContent);
    claimQuest(q.q, BY[q.at].name); await new Promise(z=>setTimeout(z,400));
    const body=document.getElementById('panelBody');
    r.claimed={stored:claimed(q), label:(body.querySelector('.claim button')||{}).textContent,
      firstStep:/Your first step/.test(body.textContent), how:/Meet Sol at the greenhouse door/.test(body.textContent)};
    cam.z=1.7; cam.x=BY[q.at].x; cam.y=BY[q.at].y; clampCam(); refreshBadges(); syncBanners();
    r.tick=!!(bgEls[q.at]&&bgEls[q.at].querySelector('.b-quest.claimed .tick'));
    claimQuest(q.q, BY[q.at].name); await new Promise(z=>setTimeout(z,400));
    r.released={stored:claimed(q), label:(document.getElementById('panelBody').querySelector('.claim button')||{}).textContent};
    document.getElementById('panelClose').click();
    r.posts=window.__posts;
    // export
    const J=buildExportJSON();
    r.exp={rsvps:Array.isArray(J.my_rsvps), claims:Array.isArray(J.my_claims), howTo:J.quests.some(x=>x.how_to)};
    return r;
  }), null, 1));
  // D5.3 journey through Maia
  console.log(JSON.stringify(await p.evaluate(async () => {
    playJourney('j2'); await new Promise(z=>setTimeout(z,2600));
    const log=document.getElementById('maiaLog');
    const r={card:/of \d+$/.test((log.querySelector('.jn')||{}).textContent||''),
      next:!!log.querySelector('.jrow .btn'), toasts:document.querySelectorAll('.toast').length,
      jn:(log.querySelector('.jn')||{}).textContent};
    jNext(); await new Promise(z=>setTimeout(z,1800));
    r.after=(log.querySelectorAll('.jn')[log.querySelectorAll('.jn').length-1]||{}).textContent;
    jEnd(); await new Promise(z=>setTimeout(z,200));
    r.ended=!window.JWALK && /The walk ends here/.test(log.textContent);
    return r;
  }), null, 1));
  console.log('pageerrors', perr.length, perr.slice(0,2));
  await b.close();
})();
