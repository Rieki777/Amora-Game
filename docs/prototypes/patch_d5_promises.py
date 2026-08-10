#!/usr/bin/env python3
"""D5.1 to D5.3: a promise you can take back, and a guide who walks with you.

  D5.1  RSVP disabled its own button forever, so "going" was a door that shut
        behind you. It toggles now, the count comes back down, and the line
        underneath says plainly what saying yes actually does.
  D5.2  Claiming a quest gets the same shape, plus `how_to`: when a founder
        has written the first step, the card shows it the moment you claim,
        because "yours" without "start here" is a dead end.
  D5.3  The journeys were narrated in toasts, which is a stranger shouting
        across a room. Maia presents them: her card carries the step, the
        progress, and the two controls, so a journey reads exactly like the
        Welcome Walk. One guide.

The side effects themselves stay in the site lane. This posts what happened
over the bridge and says so out loud; it does not pretend to have sent an
email.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_d5_promises.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()
before = len(src)


def rep(anchor, addition, where="after", count=1):
    global src
    n = src.count(anchor)
    assert n == count, f"anchor appears {n} times, expected {count}: {anchor[:70]!r}"
    src = src.replace(anchor, anchor + addition if where == "after" else addition + anchor, 1)


def swap(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


# ── the two stores, and the one wire out ─────────────────────────────────
rep(
    "window.refreshBadges=refreshBadges;\n",
    r"""/* What this browser has promised. Per-browser and per-person, so it lives in
   localStorage and never in the scene: the map is a lens, and a promise is
   about the reader rather than the land. */
function promiseLoad(k){try{return JSON.parse(localStorage.getItem(k)||'{}')||{}}catch(_){return{}}}
function promiseSave(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(_){}}
window.EV_RSVP=promiseLoad('amora-rsvp');
window.QUEST_CLAIM=promiseLoad('amora-claims');
/* The site does the real work: the calendar row, the email, the profile. This
   only says what happened, and only when there is a parent listening. */
function bridgePost(msg){try{if(window.parent&&window.parent!==window)window.parent.postMessage(msg,'*')}catch(_){}}
window.bridgePost=bridgePost;
const PROMISE_RSVP='Going adds this to your calendar in your profile and signs you up for updates by email. Tap again any time to change your answer.';
const PROMISE_CLAIM='Claiming adds this quest to your profile with how to begin, and signs you up for updates. Release it any time.';
window.PROMISE_RSVP=PROMISE_RSVP;window.PROMISE_CLAIM=PROMISE_CLAIM;
const questId=q=>slugify(typeof q==='string'?q:(q&&q.q));
window.questId=questId;
const claimed=q=>!!QUEST_CLAIM[questId(q)];
window.claimed=claimed;
""",
)

# ── D5.1 · RSVP is a promise you can take back ───────────────────────────
swap(
    """function evRSVP(id){const e=EVENTS.find(x=>x.id===id);if(!e||e._me)return;e.rsvp++;e._me=1;
  document.querySelectorAll(`[data-ev="${id}"]`).forEach(b=>{b.textContent='✔ '+e.rsvp+' going';b.disabled=true});
  toast('✔ You’re in — '+e.rsvp+' going. RSVP posts to the Events module; counted here as sample.')}""",
    """function evRSVP(id){const e=EVENTS.find(x=>x.id===id);if(!e)return;
  const on=!EV_RSVP[id];
  if(on){e.rsvp++;EV_RSVP[id]=1}else{e.rsvp=Math.max(0,e.rsvp-1);delete EV_RSVP[id]}
  e._me=on?1:0;promiseSave('amora-rsvp',EV_RSVP);
  document.querySelectorAll(`[data-ev="${id}"]`).forEach(b=>{b.textContent=on?'✔ Going · tap to change':'RSVP';b.disabled=false});
  bridgePost({type:'rsvp',id,title:e.title,on});
  window.hap&&hap(on?[12,50,12]:8);
  toast(on?('✔ You are going. '+e.rsvp+' going.'):'RSVP withdrawn. The door stays open.');
  if(typeof refreshBadges==='function')refreshBadges()}""",
)
swap(
    """   <button class="btn" data-ev="${e.id}" style="font-size:10.5px;padding:3px 10px" onclick="evRSVP('${e.id}')"${e._me?' disabled':''}>${e._me?'✔ '+e.rsvp+' going':'RSVP'}</button></div>`).join('')+`</div>`}""",
    """   <button class="btn" data-ev="${e.id}" style="font-size:10.5px;padding:3px 10px" onclick="evRSVP('${e.id}')">${EV_RSVP[e.id]?'✔ Going · tap to change':'RSVP'}</button></div>
   <div class="promise">${PROMISE_RSVP}</div>`).join('')+`</div>`}""",
)
# what this browser already promised, applied once at boot
rep(
    "window.evRSVP=evRSVP;\n",
    """(function seedPromises(){for(const e of (window.EVENTS||[])){
  if(EV_RSVP[e.id]&&!e._me){e._me=1;e.rsvp++}}})();
""",
)

# ── D5.2 · claiming, and the first step ──────────────────────────────────
swap(
    """function claimQuest(q,at){window.hap&&hap([12,50,12,50,12]);toast(`⚑ Claimed: “${q}” at ${at}. See you out there.`);maiaSay(`Claimed. <b>${q}</b> is yours, and it lives at the ${at}. That's the whole point of this map: now go make it true, and I'll light the building up when you do.`)}""",
    """function claimQuest(q,at){
  const id=questId(q),on=!QUEST_CLAIM[id];
  if(on)QUEST_CLAIM[id]=1;else delete QUEST_CLAIM[id];
  promiseSave('amora-claims',QUEST_CLAIM);
  bridgePost({type:'claim',id,on});
  window.hap&&hap(on?[12,50,12,50,12]:8);
  if(on){toast(`⚑ Claimed: “${q}” at ${at}. See you out there.`);
    maiaSay(`Claimed. <b>${q}</b> is yours, and it lives at the ${at}. That's the whole point of this map: now go make it true, and I'll light the building up when you do.`)}
  else toast('Quest released. It stays open for other hands.');
  if(typeof refreshBadges==='function')refreshBadges();
  if(typeof panelKey!=='undefined'&&panelKey)renderTab(1)}""",
)
swap(
    """  if(i===1)body.innerHTML=q.length?q.map(x=>`<div class="qcard" data-item="${itemAddr('quest',x)}"><h4>⚑ ${x.q}</h4><div class="meta">${x.r} · ${x.need}</div>
    <div class="claim"><button class="btn" onclick="claimQuest('${x.q.replace(/'/g,"\\\\'")}','${s.name.replace(/'/g,"\\\\'")}')">Claim this quest</button></div></div>`).join('')""",
    """  if(i===1)body.innerHTML=q.length?q.map(x=>`<div class="qcard" data-item="${itemAddr('quest',x)}"><h4>⚑ ${x.q}</h4><div class="meta">${x.r} · ${x.need}</div>
    <div class="claim"><button class="btn" onclick="claimQuest('${x.q.replace(/'/g,"\\\\'")}','${s.name.replace(/'/g,"\\\\'")}')">${claimed(x)?'✔ Yours · tap to release':'Claim this quest'}</button></div>
    ${claimed(x)&&x.how_to?`<div class="firststep"><b>Your first step</b>${escq(x.how_to)}</div>`:''}
    <div class="promise">${PROMISE_CLAIM}</div></div>`).join('')""",
)
rep(
    "  .cvrow small{color:#8a7347;font-size:10px}",
    """
  /* The small print under a promise. Small, because it is a footnote, and
     always there, because it is the truth about what a tap does. */
  .promise{font-size:10px;line-height:1.45;color:#8a7347;margin-top:5px}
  .firststep{margin-top:6px;padding:7px 9px;border-left:2px solid var(--gold);
    background:rgba(201,162,94,.12);border-radius:0 6px 6px 0;font-size:11.5px;color:#4a3a26}
  .firststep b{display:block;font-weight:normal;font-variant:small-caps;letter-spacing:.1em;
    font-size:10px;color:#8a6a33;margin-bottom:2px}
  /* a promise kept, marked on the land itself */
  .bseal.claimed .rim{stroke:#8fd06a}
  .bseal .tick{fill:none;stroke:#4d7c2a;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}""",
)
# the mark on the land carries the promise too
swap(
    """      marks.push({kind:'quest',tint:(window.CIRCLE_COL&&window.CIRCLE_COL[aff])||'',""",
    """      marks.push({kind:'quest',claimed:(typeof claimed==='function')&&claimed(q),
        tint:(window.CIRCLE_COL&&window.CIRCLE_COL[aff])||'',""",
)
swap(
    """        const cls=['bseal','b-'+m.kind,m.rim,m.braid?'r-braid':'',m.extra||''].filter(Boolean).join(' ');""",
    """        const cls=['bseal','b-'+m.kind,m.rim,m.braid?'r-braid':'',m.claimed?'claimed':'',m.extra||''].filter(Boolean).join(' ');""",
)
swap(
    """        return `<span class="${cls}" data-bk="${s.key}" data-bkind="${m.kind}"${tint}>`+
               badgeSvg(m.kind,m.pips?badgePips(m.pips):'')+`</span>`;""",
    """        const tick=m.claimed?'<path class="tick" d="M7.6 12.4l2.9 2.9 6-6.2"/>':'';
        return `<span class="${cls}" data-bk="${s.key}" data-bkind="${m.kind}"${tint}>`+
               badgeSvg(m.kind,(m.pips?badgePips(m.pips):'')+tick)+`</span>`;""",
)
swap(
    """    const sig=marks.map(m=>m.kind+m.pips+m.rim+m.tint+(m.extra||'')).join(',')+'|'+total;""",
    """    const sig=marks.map(m=>m.kind+m.pips+m.rim+m.tint+(m.claimed?'✓':'')+(m.extra||'')).join(',')+'|'+total;""",
)

# ── D5.3 · Maia walks the journeys ───────────────────────────────────────
swap(
    """    const x=stops[JWALK.i];const s=BY[x.st.at];
    toast(`➹ ${x.si+1}/${j.steps.length} — ${x.st.stage?x.st.stage+': ':''}${x.st.t} → ${s.name}`);
    travelTo(s.x,s.y,1.25,()=>{setTimeout(()=>{if(JWALK&&JWALK.id===id){JWALK.i++;step()}},1500)})};
  step()}""",
    """    const x=stops[JWALK.i];const s=BY[x.st.at];
    travelTo(s.x,s.y,1.25,()=>{
      /* Maia is the PRESENTER; the words stay village content, so `t` and the
         optional `body` are printed as they were written. */
      maiaSay(`<b>${x.st.stage?x.st.stage+': ':''}${x.st.t}</b> at ${s.name}`+
        (x.st.body?`<div style="margin-top:3px">${x.st.body}</div>`:'')+
        `<div class="jrow"><button class="btn" onclick="jNext()">▸ next</button>`+
        `<button class="btn ghostbtn" onclick="jEnd()">✕ end the walk</button>`+
        `<span class="jn">${JWALK.i+1} of ${stops.length}</span></div>`);
      JTMR=setTimeout(()=>{if(JWALK&&JWALK.id===id){JWALK.i++;step()}},1500)})};
  window.jNext=()=>{clearTimeout(JTMR);if(!JWALK||JWALK.id!==id)return;JWALK.i++;step()};
  window.jEnd=()=>{clearTimeout(JTMR);JWALK=null;setHash('');
    maiaSay('The walk ends here. Wander wherever you like.')};
  step()}
let JTMR=null;""",
)
swap(
    """document.addEventListener('keydown',e=>{if(e.key==='Escape'&&JWALK){JWALK=null;toast('Walk ended. Wander freely.');setHash('')}},true);""",
    """document.addEventListener('keydown',e=>{if(e.key==='Escape'&&JWALK){clearTimeout(JTMR);JWALK=null;
  maiaSay('The walk ends here. Wander wherever you like.');setHash('')}},true);""",
)
rep(
    "  .promise{font-size:10px;line-height:1.45;color:#8a7347;margin-top:5px}",
    """
  #maia .jrow{display:flex;gap:7px;align-items:center;margin-top:6px}
  #maia .jrow .btn{font-size:10.5px;padding:3px 10px}
  #maia .jn{margin-left:auto;font-size:10px;color:#8f855f}""",
)

# ── the contract ─────────────────────────────────────────────────────────
swap(
    """    events:(window.EVENTS||[]).map(e=>({id:e.id,title:e.title,structure_keys:e.at,days_until:e.days,when:e.when,rsvp_count:e.rsvp,src:'sample'})),""",
    """    events:(window.EVENTS||[]).map(e=>({id:e.id,title:e.title,structure_keys:e.at,days_until:e.days,when:e.when,rsvp_count:e.rsvp,src:'sample'})),
    /* Per-browser promises. They ride the export so a session can be carried,
       and the site owns what they actually DO. */
    my_rsvps:Object.keys(window.EV_RSVP||{}),
    my_claims:Object.keys(window.QUEST_CLAIM||{}),""",
)
swap(
    """      weight:x.weight||null, // null means read it from the need text, which is what the map does""",
    """      weight:x.weight||null, // null means read it from the need text, which is what the map does
      how_to:x.how_to||null, // the first step, when a founder has written one""",
)
swap(
    """    weight:(r.weight===1||r.weight===2||r.weight===3)?r.weight:undefined,""",
    """    weight:(r.weight===1||r.weight===2||r.weight===3)?r.weight:undefined,
    how_to:r.how_to||undefined,""",
)
# The Events module sheet has its own renderer, so "under EVERY RSVP button"
# meant two places, not one.
swap(
    """      <button class="btn" data-ev="${e.id}" style="font-size:10.5px;padding:3px 10px" onclick="evRSVP('${e.id}')"${e._me?' disabled':''}>${e._me?'✔ '+e.rsvp+' going':'RSVP'}</button></div>`).join('')""",
    """      <button class="btn" data-ev="${e.id}" style="font-size:10.5px;padding:3px 10px" onclick="evRSVP('${e.id}')">${EV_RSVP[e.id]?'✔ Going · tap to change':'RSVP'}</button></div>
      <div class="promise">${PROMISE_RSVP}</div>`).join('')""",
)

swap(
    "window.BUILD_VERSION='v0.7-voice1-badges1';",
    "window.BUILD_VERSION='v0.8-roundD';",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"D5.1-D5.3 patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
