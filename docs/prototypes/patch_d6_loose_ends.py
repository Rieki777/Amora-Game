#!/usr/bin/env python3
"""What Round D left unfinished, and three fixes that were waiting on someone.

  1. THE VOCABULARY EDITOR. D3.1 and D3.3 built `vocabulary.media` and
     `vocabulary.phases` as data, with export, restore and self-heal, and never
     built the UI either of them asked for. So a village could change its flow
     types or its phase names only by importing a scene, which is the opposite
     of q1d. The skin panel gains both sections, in the same pattern the zone
     words already use.

     A rename changes the NAME and never the key: flows reference the key, so
     the key is machinery and the name is the village's word for it. Renaming
     a zone rewrites every feature's subtype because a zone subtype IS the
     word; a medium key is not.

  2. THE BRIDGE REPLY. The map posts every promise to the shell and nothing
     could answer, so an anonymous visitor tapping RSVP got a promise the site
     would refuse. `promise-result` closes the loop: confirm, or revert and say
     why. Silence still means "local only", because the artifact runs from
     file:// with no parent at all and every QA suite drives it that way.

  3. Three seeded quest titles carried em-dashes, which the house rules forbid
     in player copy, and they travel into the site on import.

  4. The events door pointed at Seasonal Festivals because Events had no room
     of its own. The site lane shipped `/events`, so it has one now.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_d6_loose_ends.py [grounds-v0.html]
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


# ── 1. Two more rows in the panel ────────────────────────────────────────
rep(
    """ <div class="srow" style="align-items:flex-start"><span class="slbl">zone words</span><span id="skVocab" style="display:flex;gap:5px;flex-wrap:wrap;flex:1"></span></div>\n""",
    """ <div class="srow" style="align-items:flex-start"><span class="slbl">flow types</span><span id="skMedia" style="display:flex;gap:5px;flex-wrap:wrap;flex:1"></span></div>
 <div class="srow" style="align-items:flex-start"><span class="slbl">phase names</span><span id="skPhases" style="display:flex;gap:5px;flex-wrap:wrap;flex:1"></span></div>
""",
)
rep(
    "\nrenderVocab();\n",
    "renderMediaVocab();renderPhaseVocab();\n",
)
swap(
    "  if(typeof renderVocab==='function')renderVocab();",
    "  if(typeof renderVocab==='function')renderVocab();\n"
    "  if(typeof renderMediaVocab==='function'){renderMediaVocab();renderPhaseVocab()}",
)
rep(
    "\nrenderVocab();\n",
    r"""
/* ---------- the flow types, as the village's own words (D3.1, q1d) ----------
   A rename touches the NAME. The key stays put, because every flow row points
   at the key and a word a person changed is not a reason to rewrite the
   metabolism. */
function renderMediaVocab(){const host=$('skMedia');if(!host)return;
  const L=SCENE.vocabulary.media;
  host.innerHTML=L.map((m,i)=>`<button class="chip" data-vm="${i}" data-tip="Click to change its name, its colour or its mark. Every flow of this kind follows.">`+
      `<i style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${m.color};margin-right:5px;vertical-align:middle"></i>${escq(m.name)}</button>`).join('')
    +`<button class="chip" data-vm="+" style="border-style:dashed">+ type</button>`;
  host.querySelectorAll('[data-vm]').forEach(b=>b.onclick=()=>mediaEditor(b,b.dataset.vm))}
window.renderMediaVocab=renderMediaVocab;
function mediaEditor(btn,idx){
  const L=SCENE.vocabulary.media,add=idx==='+';
  const m=add?{key:'',name:'',color:'#e8c877',glyph:'seed'}:L[+idx];
  const used=add?0:SCENE.flows.filter(f=>mediaKey(f.medium)===m.key).length;
  const box=document.createElement('span');
  box.style.cssText='display:inline-flex;gap:4px;align-items:center;flex-wrap:wrap';
  const fld='background:rgba(44,33,20,.9);border:1px solid #c9a25e;border-radius:6px;color:#fff;font-family:inherit;font-size:10.5px;padding:3px 7px';
  box.innerHTML=`<input class="vmn" type="text" value="${escq(m.name)}" placeholder="what moves" style="${fld};width:104px">`+
    `<input class="vmc" type="color" value="${m.color}" style="width:26px;height:22px;padding:0;border:1px solid #c9a25e;border-radius:6px;background:none">`+
    `<select class="vmg" style="${fld}">${Object.keys(GLYPH_PATH).map(g=>`<option value="${g}"${g===m.glyph?' selected':''}>${g}</option>`).join('')}</select>`+
    `<button class="chip vmok">keep</button>`+
    (add?'':`<button class="chip vmx" style="border-color:#a33d2a;color:#e8a090" data-tip="${used?used+' flows still move this way':'nothing moves this way'}">✕</button>`);
  btn.replaceWith(box);
  const n=box.querySelector('.vmn');n.focus();n.select&&n.select();
  const keep=()=>{
    const name=n.value.trim();if(!name)return renderMediaVocab();
    const color=box.querySelector('.vmc').value,glyph=box.querySelector('.vmg').value;
    if(add){const key=slugify(name);
      if(L.some(x=>x.key===key))return toast('That type already exists.');
      L.push({key,name,color,glyph});logEdit('vocab','media:+',{added:key})}
    else{const was=m.name;m.name=name;m.color=color;m.glyph=glyph;
      logEdit('vocab','media:'+m.key,{name:was===name?undefined:name,color,glyph})}
    rebuildMedia();flowSpriteReset();mmDirty=true;renderMediaVocab();
    if(typeof renderInspect==='function'&&typeof inspKey!=='undefined'&&inspKey)renderInspect();
    toast('The village calls it '+name+' now.')};
  box.querySelector('.vmok').onclick=keep;
  n.onkeydown=e=>{if(e.key==='Enter')keep();if(e.key==='Escape')renderMediaVocab();e.stopPropagation()};
  const x=box.querySelector('.vmx');
  if(x)x.onclick=()=>{
    /* A type still carrying flows is not removed out from under them. */
    if(used)return toast(used+' flow'+(used===1?'':'s')+' still move'+(used===1?'s':'')+' this way. Point them elsewhere first.');
    L.splice(+idx,1);logEdit('vocab','media:-',{removed:m.key});
    rebuildMedia();flowSpriteReset();mmDirty=true;renderMediaVocab();toast(m.name+' is no longer a kind of moving thing here.')}}

/* ---------- the phase names (D3.3) ---------- */
function renderPhaseVocab(){const host=$('skPhases');if(!host)return;
  host.innerHTML=[1,2,3].map(nn=>`<button class="chip" data-vp="${nn}" data-tip="Click to rename. Every surface that names a phase follows; the export keeps the number.">${escq(phaseName(nn))}</button>`).join('');
  host.querySelectorAll('[data-vp]').forEach(b=>b.onclick=()=>{
    const nn=+b.dataset.vp;
    const inp=document.createElement('input');inp.type='text';inp.value=phaseName(nn);
    inp.style.cssText='width:96px;background:rgba(44,33,20,.9);border:1px solid #c9a25e;border-radius:6px;color:#fff;font-family:inherit;font-size:10.5px;padding:3px 7px';
    b.replaceWith(inp);inp.focus();inp.select&&inp.select();
    inp.onkeydown=e=>{
      if(e.key==='Enter'){const v=inp.value.trim();
        if(v&&v!==phaseName(nn)){SCENE.vocabulary.phases[nn]=v;logEdit('vocab','phase:'+nn,{to:v});
          if(typeof renderInspect==='function'&&typeof inspKey!=='undefined'&&inspKey)renderInspect();
          if(typeof panelKey!=='undefined'&&panelKey)openPanel(panelKey);
          toast('Phase '+nn+' is “'+v+'” now.')}
        renderPhaseVocab()}
      if(e.key==='Escape')renderPhaseVocab();
      e.stopPropagation()}})}
window.renderPhaseVocab=renderPhaseVocab;
""",
    where="before",
)

# ── 2. The shell can answer a promise ────────────────────────────────────
rep(
    "window.bridgePost=bridgePost;\n",
    r"""/* A promise is optimistic: the map flips, saves and tells the shell. If the
   shell answers `ok:false` this puts it back and says why. If NOTHING answers,
   the promise stands, because the artifact runs from file:// with no parent at
   all and that is how every suite drives it. Silence means local only. */
const PROMISE_PENDING={};
function promiseWatch(kind,id,undo){
  const k=kind+':'+id,p=PROMISE_PENDING[k];
  if(p)clearTimeout(p.t);
  PROMISE_PENDING[k]={undo,t:setTimeout(()=>{delete PROMISE_PENDING[k]},4000)}}
window.promiseWatch=promiseWatch;
const PROMISE_WHY={
  anonymous:'Sign in and this is yours to keep.',
  full:'That one is full. The door stays open for the next.',
  closed:'That has closed. The door stays open for the next.',
  gone:'That is no longer on the board.',
  error:'That did not save. Try again in a moment.'};
function promiseResult(d){
  const k=d.kind+':'+d.id,p=PROMISE_PENDING[k];
  if(p){clearTimeout(p.t);delete PROMISE_PENDING[k]}
  if(d.ok){
    /* The shell owns the real count; the map's own number is sample data. */
    if(d.kind==='rsvp'&&typeof d.count==='number'){
      const e=(window.EVENTS||[]).find(x=>x.id===d.id);
      if(e){e.rsvp=d.count;if(typeof refreshBadges==='function')refreshBadges()}}
    return}
  if(p&&p.undo)p.undo();
  toast(PROMISE_WHY[d.reason]||PROMISE_WHY.error);
  if(d.reason==='anonymous'&&d.href)
    maiaSay(`That one is kept against your name, so it needs a name. <a href="${escq(d.href)}" target="_blank" rel="noopener">Sign in</a> and tap it again; nothing is lost.`);
}
window.promiseResult=promiseResult;
""",
)
swap(
    """  if(d.type==='goto'&&typeof d.hash==='string'){leaveIntro();location.hash=d.hash;routeHash()}""",
    """  if(d.type==='goto'&&typeof d.hash==='string'){leaveIntro();location.hash=d.hash;routeHash()}
  if(d.type==='promise-result'&&d.id&&(d.kind==='rsvp'||d.kind==='claim'))promiseResult(d);""",
)
# both promises register how to put themselves back
swap(
    """  bridgePost({type:'rsvp',id,title:e.title,on});""",
    """  bridgePost({type:'rsvp',id,title:e.title,on});
  promiseWatch('rsvp',id,()=>{ // put it back exactly, without posting again
    if(on){e.rsvp=Math.max(0,e.rsvp-1);delete EV_RSVP[id];e._me=0}else{e.rsvp++;EV_RSVP[id]=1;e._me=1}
    promiseSave('amora-rsvp',EV_RSVP);
    document.querySelectorAll(`[data-ev="${id}"]`).forEach(b=>{b.textContent=on?'RSVP':'✔ Going · tap to change'});
    if(typeof refreshBadges==='function')refreshBadges()});""",
)
swap(
    """  bridgePost({type:'claim',id,on});""",
    """  bridgePost({type:'claim',id,on});
  promiseWatch('claim',id,()=>{
    if(on)delete QUEST_CLAIM[id];else QUEST_CLAIM[id]=1;
    promiseSave('amora-claims',QUEST_CLAIM);
    if(typeof refreshBadges==='function')refreshBadges();
    if(typeof panelKey!=='undefined'&&panelKey)renderTab(1)});""",
)

# ── 3. Three titles, said the house way ──────────────────────────────────
swap('{q:"Swale dig — east slope",', '{q:"Swale dig on the east slope",')
swap('{q:"Raise the first wall — build day",', '{q:"Build day: raise the first wall",')
swap("{q:\"Welcome walk — greet Saturday's visitors\",", "{q:\"Welcome walk, greeting Saturday's visitors\",")

# ── 4. Events has a room of its own now ──────────────────────────────────
swap(
    "  events:{name:'Events',icon:MICON.events,route:'/seasonal-festivals',",
    "  events:{name:'Events',icon:MICON.events,route:'/events',",
)
swap(
    """      +`<div class="lastv">for now this door opens on Seasonal Festivals. Events will get a room of its own</div>`},""",
    """      +`<div class="lastv">the Events module keeps these, with the RSVPs and the capacity. Two doors, one room</div>`},""",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"loose ends patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
