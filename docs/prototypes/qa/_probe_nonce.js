const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.PW_EXE });
  const p = await (await b.newContext({ viewport: { width: 1480, height: 1180 } })).newPage();
  const perr=[]; p.on('pageerror',e=>perr.push(String(e)));
  await p.goto(process.env.GROUNDS_FILE); await p.waitForTimeout(1500);
  await p.click('#enterBtn'); await p.waitForTimeout(2800);
  console.log(JSON.stringify(await p.evaluate(async () => {
    const r={}; const sent=[]; const o=window.bridgePost;
    window.bridgePost=m=>{sent.push(m);o(m)};
    const send=d=>window.dispatchEvent(new MessageEvent('message',{data:d,origin:location.origin}));
    const e=EVENTS[4], base=e.rsvp;
    // on, off, on inside the window: three posts, three nonces
    evRSVP(e.id); evRSVP(e.id); evRSVP(e.id);
    await new Promise(z=>setTimeout(z,150));
    r.posts=sent.filter(m=>m.type==='rsvp').map(m=>({on:m.on,nonce:!!m.nonce}));
    r.uniqueNonces=new Set(sent.filter(m=>m.type==='rsvp').map(m=>m.nonce)).size;
    const cur=sent[sent.length-1].nonce;
    // a STALE reply for the first post tries to undo; must be ignored
    send({type:'promise-result',kind:'rsvp',id:e.id,ok:false,reason:'error',nonce:sent[0].nonce});
    await new Promise(z=>setTimeout(z,200));
    r.staleIgnored={stored:!!EV_RSVP[e.id], delta:e.rsvp-base};
    // the CURRENT reply is honoured
    send({type:'promise-result',kind:'rsvp',id:e.id,ok:false,reason:'not-here',nonce:cur});
    await new Promise(z=>setTimeout(z,200));
    r.currentHonoured={stored:!!EV_RSVP[e.id], delta:e.rsvp-base,
      calm:[...document.querySelectorAll('.toast')].some(t=>/joins the village when a steward/.test(t.textContent))};
    // quest keys
    const q=SCENE.quests[0];
    r.key={onSeed:!!q.key, value:q.key, exported:buildExportJSON().quests[0].key,
      stableAfterRename:(()=>{const was=q.key;q.q='A different title entirely';return questKey(q)===was})(),
      allUnique:new Set(SCENE.quests.map(x=>x.key)).size===SCENE.quests.length,
      shape:SCENE.quests.every(x=>/^[a-z0-9_-]{1,32}$/i.test(x.key))};
    // claim posts the key
    const q2=SCENE.quests.find(x=>x.at==='greenhouse');
    sent.length=0; claimQuest(q2.q, BY[q2.at].name); await new Promise(z=>setTimeout(z,200));
    r.claimPost=sent.filter(m=>m.type==='claim').map(m=>({id:m.id,nonce:!!m.nonce}));
    r.claimUsesKey=r.claimPost[0] && r.claimPost[0].id===q2.key;
    claimQuest(q2.q, BY[q2.at].name);
    // the editor cannot make a key their sanitiser drops
    document.getElementById('skinBtn').click(); await new Promise(z=>setTimeout(z,250));
    const host=document.getElementById('skMedia');
    host.querySelector('[data-vm="+"]').click(); await new Promise(z=>setTimeout(z,120));
    host.querySelector('.vmn').value='   '; host.querySelector('.vmok').click();
    await new Promise(z=>setTimeout(z,150));
    const n0=SCENE.vocabulary.media.length;
    host.querySelector('[data-vm="+"]').click(); await new Promise(z=>setTimeout(z,120));
    host.querySelector('.vmn').value='grey water'; host.querySelector('.vmok').click();
    await new Promise(z=>setTimeout(z,200));
    const m=SCENE.vocabulary.media[SCENE.vocabulary.media.length-1];
    r.editor={added:SCENE.vocabulary.media.length-n0, key:m.key, name:m.name,
      keyShape:/^[a-z0-9_-]{1,32}$/i.test(m.key), colorShape:/^#[0-9a-f]{6}$/i.test(m.color),
      allKeysOk:SCENE.vocabulary.media.every(x=>/^[a-z0-9_-]{1,32}$/i.test(x.key)&&/^#[0-9a-f]{6}$/i.test(x.color)&&x.name.length<=48)};
    document.getElementById('skinBtn').click();
    return r;
  }), null, 1));
  console.log('pageerrors', perr.length, perr.slice(0,2));
  await b.close();
})();
