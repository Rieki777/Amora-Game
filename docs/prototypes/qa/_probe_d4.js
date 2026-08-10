const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  const perr=[]; p.on('pageerror',e=>perr.push(String(e)));
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1500);
  await p.click('#enterBtn'); await p.waitForTimeout(2800);
  const out = await p.evaluate(async () => {
    const r = {};
    document.getElementById('buildBtn').click(); await new Promise(z=>setTimeout(z,300));
    // D4.1 duplicate
    const key='greenhouse', q0=questsAt(key).length, s0=seatsAt(key).length, n0=SCENE.structures.length;
    openInspect(key); await new Promise(z=>setTimeout(z,300));
    document.getElementById('iDup').click(); await new Promise(z=>setTimeout(z,300));
    const c=SCENE.structures[SCENE.structures.length-1];
    r.dup={key:c.key,name:c.name,placing:!!(placing&&placing.dup),n:SCENE.structures.length-n0,
      quests:questsAt(c.key).length, seats:seatsAt(c.key).length, wantQ:q0, wantS:s0,
      addr:(questsAt(c.key)[0]||{}).addr, flows:SCENE.flows.filter(f=>f.from===c.key||f.to===c.key).length,
      audit:EDITS.some(e=>e.action==='duplicate')};
    // land it
    const ev=new MouseEvent('click',{clientX:740,clientY:560,bubbles:true,cancelable:true});
    document.getElementById('scene').dispatchEvent(ev); await new Promise(z=>setTimeout(z,300));
    r.landed={x:Math.round(c.x),y:Math.round(c.y),placing:!!placing,inspect:inspKey};
    // undo takes the clone and its items
    document.getElementById('undoBtn').click(); await new Promise(z=>setTimeout(z,300));
    r.undone={gone:!BY[c.key],quests:SCENE.quests.filter(q=>q.at===c.key).length,seats:SCENE.seats.filter(x=>x.at===c.key).length,
      n:SCENE.structures.length-n0};
    // D4.2 vitals in plain words
    openVitalDrop('canopy',document.querySelector('.vital[data-k="canopy"]')); await new Promise(z=>setTimeout(z,200));
    const d=document.getElementById('vdrop');
    r.vital={txt:d.textContent.replace(/\s+/g,' ').slice(0,220), hasInput:!!document.getElementById('vOvr')};
    document.getElementById('vOvr').value='81%'; vitalSet('canopy'); await new Promise(z=>setTimeout(z,250));
    openVitalDrop('canopy',document.querySelector('.vital[data-k="canopy"]')); await new Promise(z=>setTimeout(z,200));
    r.held={txt:d.textContent.replace(/\s+/g,' ').slice(0,200), ovr:(VITAL_OVR.canopy||{}).v};
    d.querySelector('a')&&d.querySelector('a').click(); await new Promise(z=>setTimeout(z,200));
    r.released=!VITAL_OVR.canopy;
    d.classList.remove('show');
    // D4.3 role combobox
    openInspect('kitchen'); await new Promise(z=>setTimeout(z,300));
    const inp=document.getElementById('iSeatName'); inp.focus(); inp.value=''; inp.oninput();
    await new Promise(z=>setTimeout(z,200));
    const dd=document.getElementById('seatDrop');
    r.combo={open:dd.classList.contains('show'), groups:[...dd.querySelectorAll('.sgrp')].map(e=>e.textContent),
      opts:dd.querySelectorAll('.sopt').length};
    const opt=[...dd.querySelectorAll('.sopt')].pop();
    const si=+opt.dataset.seatI, was=SCENE.seats[si].at, nm=SCENE.seats[si].s;
    opt.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,cancelable:true}));
    await new Promise(z=>setTimeout(z,350));
    r.moved={name:nm, was, now:SCENE.seats[si].at, addr:SCENE.seats[si].addr,
      audit:EDITS.some(e=>e.action==='address-override')};
    closeInspect(); document.getElementById('buildBtn').click();
    return r;
  });
  console.log(JSON.stringify(out,null,1));
  console.log('pageerrors', perr.length, perr.slice(0,2));
  await b.close();
})();
