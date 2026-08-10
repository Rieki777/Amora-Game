#!/usr/bin/env python3
"""D4.1 to D4.3: the inspect card grows up.

  D4.1  Duplicate a building, with everything addressed to it. Rye: "quick way
        to copy a building with all its filled out details." The copy carries
        the structure, its quests and its seats; it does NOT carry flows (an
        edge between two places is a deliberate statement) or the drawn
        footprint (the copy arrives sprite-only, to be drawn where it lands).
        Duplicating IS the creator's word, so the cloned items are addressed
        `creator` and never wear the amber guess rim.
  D4.2  The vitals override in plain words. `set value - founder's word`
        confused the person who wrote it. The row says where the number comes
        from first, then offers to hold a truer one.
  D4.3  The role field becomes a combobox. Typing surfaces the roles the
        village already has, in two groups: the ones with no home, and the
        ones living somewhere else. Picking one is the creator re-addressing
        it, which is exactly what the Loom's amber round is for.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_d4_hands.py [grounds-v0.html]
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


# ── D4.1 · duplicate ─────────────────────────────────────────────────────
swap(
    """   <button class="chip" id="iRemove" style="border-color:#a33d2a;color:#e8a090">✕ remove from the map</button>""",
    """   <button class="chip" id="iDup" style="margin-right:6px">⎘ Duplicate</button>
   <button class="chip" id="iRemove" style="border-color:#a33d2a;color:#e8a090">✕ remove from the map</button>""",
)
rep(
    """  B.querySelector('#iRemove').onclick=()=>removeStructure(s)}""",
    "",
    where="before",
)
swap(
    """  B.querySelector('#iRemove').onclick=()=>removeStructure(s)}""",
    """  B.querySelector('#iDup').onclick=()=>duplicateStructure(s.key);
  B.querySelector('#iRemove').onclick=()=>removeStructure(s)}
/* A copy of everything that is ABOUT this place: the building, the work
   addressed to it, the seats that sit in it. Not the flows, because an edge
   between two places is a statement about both of them, and not the drawn
   footprint, because the copy has not landed anywhere yet. */
function duplicateStructure(key){
  const s=BY[key];if(!s)return;
  const base=key.replace(/-c\\d+$/,'');let slug=base+'-c2',n=2;
  while(BY[slug])slug=base+'-c'+(++n);
  const c={...s,key:slug,name:s.name+' (copy)',
    modules:(s.modules||[]).map(m=>[m[0],m[1]]),
    doors:s.doors?{...s.doors}:undefined,
    badges:s.badges?{...s.badges}:undefined,
    state:s.state,phase:s.phase,scale:s.scale,circle:s.circle};
  delete c._crownOff;
  const sfx=slug.slice(base.length); // '-c2', so a clone of a clone stays readable
  const q2=[],x2=[];
  for(const q of SCENE.quests)if(q.at===key)q2.push({...q,at:slug,addr:'creator',address_source:'creator',_why:''});
  for(const x of SCENE.seats)if(x.at===key)x2.push({...x,s:x.s+' '+sfx.replace('-',''),at:slug,addr:'creator',address_source:'creator',_why:''});
  SCENE.structures.push(c);BY[slug]=c;makePoi(c);makeBanner(c);
  q2.forEach(q=>SCENE.quests.push(q));x2.forEach(x=>SCENE.seats.push(x));
  UNDO.push({t:'dup',key:slug,quests:q2.length,seats:x2.length});
  logEdit('duplicate','structure:'+slug,{from:key,quests:q2.length,seats:x2.length});
  refreshWork();closeInspect();
  /* Straight into placing, so the next click is where it goes. */
  placing={dup:slug};document.body.classList.add('placing');
  const g=$('ghostPoi');if(g){g.innerHTML=`<svg viewBox="0 0 64 64"><g class="ic">${(window.ICONS&&ICONS[(window.ARCHMAP&&ARCHMAP[c.archetype])?ARCHMAP[c.archetype].icon:c.archetype])||''}</g></svg>`;g.style.display='block'}
  toast('⎘ '+c.name+' is in your hand, with '+q2.length+' quest'+(q2.length===1?'':'s')+' and '+x2.length+' seat'+(x2.length===1?'':'s')+'. Click where it stands.');
}
window.duplicateStructure=duplicateStructure;""",
)
# the placing click either stakes a new archetype or lands the copy
swap(
    """cv.addEventListener('click',e=>{if(!placing)return;const[wx,wy]=screenToWorld(e.clientX,e.clientY);
  if(!inBound(wx,wy)){toast('Outside the property line. The mirror only maps your land.');return}
  const a=placing.archetype;""",
    """cv.addEventListener('click',e=>{if(!placing)return;const[wx,wy]=screenToWorld(e.clientX,e.clientY);
  if(!inBound(wx,wy)){toast('Outside the property line. The mirror only maps your land.');return}
  if(placing.dup){const c=BY[placing.dup];
    if(c){c.x=wx;c.y=wy;c.district=nearestDistrict(wx,wy);
      logEdit('place','structure:'+c.key,{via:'duplicate',x:Math.round(wx),y:Math.round(wy)})}
    placing=null;document.body.classList.remove('placing');$('ghostPoi').style.display='none';
    mmDirty=true;refreshWork();if(c)openInspect(c.key);return}
  const a=placing.archetype;""",
)
swap(
    """  if(u.t==='bound'){SCENE.bound.length=0;""",
    """  if(u.t==='dup'){const s=BY[u.key];
    if(s){const i=SCENE.structures.indexOf(s);if(i>=0)SCENE.structures.splice(i,1);
      pEls[s.key]&&pEls[s.key].remove();bEls[s.key]&&bEls[s.key].remove();
      delete pEls[s.key];delete bEls[s.key];delete BY[s.key]}
    /* the clones go with the clone: a copy that leaves its quests behind is
       worse than no undo at all */
    SCENE.quests=SCENE.quests.filter(q=>q.at!==u.key);
    SCENE.seats=SCENE.seats.filter(x=>x.at!==u.key);
    if(typeof inspKey!=='undefined'&&inspKey===u.key)closeInspect();
    if(placing&&placing.dup===u.key){placing=null;document.body.classList.remove('placing');$('ghostPoi').style.display='none'}
    refreshWork()}
  if(u.t==='bound'){SCENE.bound.length=0;""",
)

# ── D4.2 · the vitals override, in plain words ───────────────────────────
swap(
    """  const ovr=(typeof buildMode!=='undefined'&&buildMode&&k!=='moon')?
    `<div style="display:flex;gap:6px;align-items:center"><input id="vOvr" type="text" placeholder="set value — founder's word" style="flex:1;background:rgba(44,33,20,.8);border:1px solid #6b5430;border-radius:6px;color:var(--parch);font-family:inherit;font-size:11px;padding:4px 8px">
     <button class="btn" style="font-size:10.5px;padding:3px 9px" onclick="vitalSet('${k}')">✎ set</button>${(window.VITAL_OVR||{})[k]?`<button class="btn ghostbtn" style="font-size:10.5px;padding:3px 9px" onclick="vitalClear('${k}')">↩</button>`:''}</div>`:'';""",
    """  /* Where this number comes from, said before anything is asked of you.
     "set value - founder's word" confused the founder who wrote it. */
  const held=!!(window.VITAL_OVR||{})[k];
  const rawSrc=String((D[k]&&D[k].src)||'');
  const prov=held?'held by your word':(/drawn/.test(rawSrc)?'measured from your drawn land':'sample reading');
  const unit=(String((D[k]&&D[k].v)||'').match(/[^0-9.,\\s]+$/)||[''])[0];
  const ovr=(typeof buildMode!=='undefined'&&buildMode&&k!=='moon')?
    `<div style="margin-top:8px;border-top:1px dashed #6b5430;padding-top:7px">
       <div style="font-size:10px;letter-spacing:.06em;color:${held?'var(--gold-b)':'#b9af8f'}">${prov}</div>
       ${held
         ? `<div style="font-size:11.5px;margin-top:4px">Held by your word · <a href="#" onclick="vitalClear('${k}');return false" style="color:var(--gold-b)">release</a></div>`
         : `<div style="font-size:11px;color:#cfc7a8;margin-top:4px">Know the real number? Set it here and the map holds your word until you release it.</div>
            <div style="display:flex;gap:6px;align-items:center;margin-top:5px">
              <input id="vOvr" type="text" placeholder="the true number" style="flex:1;background:rgba(44,33,20,.8);border:1px solid #6b5430;border-radius:6px;color:var(--parch);font-family:inherit;font-size:11px;padding:4px 8px">
              ${unit?`<span style="font-size:11px;color:#b9af8f">${unit}</span>`:''}
              <button class="btn" style="font-size:10.5px;padding:3px 9px" onclick="vitalSet('${k}')">Hold this number</button>
            </div>`}
     </div>`:'';""",
)

# ── D4.3 · the role field surfaces the roles that already exist ──────────
swap(
    """   <div class="irow" style="margin-top:4px"><input type="text" id="iSeatName" placeholder="add a role here — name">""",
    """   <div class="irow" style="margin-top:4px;position:relative"><input type="text" id="iSeatName" autocomplete="off" placeholder="add a role here"><div id="seatDrop"></div>""",
)
rep(
    "  .bseal .cnum{fill:var(--ink);font:600 10px/1 Georgia,serif;text-anchor:middle}",
    """
  /* The roles this village already has, offered while you type. */
  #seatDrop{display:none;position:absolute;left:0;right:0;top:100%;z-index:60;max-height:210px;overflow-y:auto;
    background:linear-gradient(180deg,rgba(30,22,13,.99),rgba(20,14,8,.99));border:1px solid #6b5430;
    border-radius:8px;box-shadow:0 10px 26px rgba(0,0,0,.5);margin-top:3px}
  #seatDrop.show{display:block}
  #seatDrop .sgrp{font-size:9.5px;letter-spacing:.12em;font-variant:small-caps;color:#8f855f;padding:6px 9px 2px}
  #seatDrop .sopt{padding:5px 9px;font-size:11.5px;color:var(--parch);cursor:pointer}
  #seatDrop .sopt:hover{background:rgba(236,208,138,.14)}
  #seatDrop .sopt small{display:block;font-size:9.5px;color:#b9af8f}""",
)
rep(
    """  B.querySelector('#iSeatAdd').onclick=()=>{const n=B.querySelector('#iSeatName').value.trim();if(!n)return;""",
    """  /* A combobox over the roles the village already has. Picking one is the
     creator saying where it lives, which outranks whatever guessed before. */
  (function seatCombo(){
    const inp=B.querySelector('#iSeatName'),dd=B.querySelector('#seatDrop');
    if(!inp||!dd)return;
    const render=()=>{
      const q=inp.value.trim().toLowerCase();
      const hit=x=>!q||String(x.s).toLowerCase().includes(q);
      const unplaced=SCENE.seats.filter(x=>!x.at&&hit(x));
      const elsewhere=SCENE.seats.filter(x=>x.at&&x.at!==s.key&&hit(x));
      if(!unplaced.length&&!elsewhere.length){dd.classList.remove('show');return}
      const row=(x,i)=>`<div class="sopt" data-seat-i="${SCENE.seats.indexOf(x)}">${escq(x.s)}<small>${escq(x.c||'no circle')}${x.at?' · at '+escq((BY[x.at]||{}).name||x.at):''}</small></div>`;
      dd.innerHTML=(unplaced.length?`<div class="sgrp">unplaced · picking one homes it here</div>`+unplaced.map(row).join(''):'')
        +(elsewhere.length?`<div class="sgrp">open elsewhere · picking one moves it here</div>`+elsewhere.map(row).join(''):'');
      dd.classList.add('show');
      dd.querySelectorAll('[data-seat-i]').forEach(o=>o.onmousedown=ev=>{ev.preventDefault();
        const x=SCENE.seats[+o.dataset.seatI];if(!x)return;
        x.at=s.key;x.addr='creator';x.address_source='creator';x._why='';
        logEdit('address-override','seat:'+x.s,{to:s.key,via:'inspect combobox'});
        dd.classList.remove('show');inp.value='';
        refreshWork();renderInspect();
        toast('⛨ '+x.s+' now lives at '+s.name+'.')});
    };
    inp.onfocus=render;inp.oninput=render;
    inp.onblur=()=>setTimeout(()=>dd.classList.remove('show'),120);
    inp.onkeydown=ev=>{if(ev.key==='Escape'){dd.classList.remove('show');ev.stopPropagation()}
      if(ev.key==='Enter'){dd.classList.remove('show');B.querySelector('#iSeatAdd').click()}};
  })();
""",
    where="before",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"D4.1-D4.3 patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
