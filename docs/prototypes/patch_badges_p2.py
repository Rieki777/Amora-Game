#!/usr/bin/env python3
"""Badges P2: every mark is a door, and every door has an address.

P1 drew the marks and D2/A1 made them reachable. A tap opened the right tab
and stopped there, which is one step short of the point: a building with four
quests opened four quests and left the reader to find the one they tapped.

  addresses   `#/place/<key>?item=<kind>:<id>` opens the panel focused on one
              item, so a badge can be linked, shared and walked back to
  focus       the card it names lights for a beat and scrolls itself into view
  the curl    conversations were the one kind with nowhere to land; the forum
              door already scopes itself to a building, so the curl opens it
  the seed    the invitation says what it is and offers the way to write one:
              the resolver on desk, with this place already chosen, and the
              proposal page in the pocket

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_badges_p2.py [grounds-v0.html]
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


# ── 1. The lit card ──────────────────────────────────────────────────────
rep(
    "  .bseal .cnum{fill:var(--ink);font:600 10px/1 Georgia,serif;text-anchor:middle}",
    """
  /* The card a badge names: lit for a beat, then it is just a card again. */
  .itemfocus{outline:2px solid var(--t-accent,#e8a13c);outline-offset:3px;border-radius:6px;
    animation:ifoc 2.6s ease-out 1}
  @keyframes ifoc{0%{background:rgba(232,161,60,.3)}100%{background:transparent}}
  .cvrow{display:flex;gap:8px;align-items:flex-start;margin:4px 0;padding:5px 8px;border:1px solid #c8ab6f;
    border-radius:7px;background:#fdf6e0;font-size:11.5px;color:#4a3a26;cursor:pointer}
  .cvrow b{font-weight:normal;color:#3a2b12;display:block}
  .cvrow small{color:#8a7347;font-size:10px}""",
)

# ── 2. Names for things that already exist ───────────────────────────────
rep(
    "window.refreshBadges=refreshBadges;\n",
    r"""/* An id a person could read in a URL, made from the words the founder
   already typed. Quests and seats carry no id of their own; threads and
   events do, and theirs wins. */
function slugify(t){return String(t||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,48)}
window.slugify=slugify;
function itemAddr(kind,x){
  if(kind==='quest')return 'quest:'+slugify(x&&x.q);
  if(kind==='seat')return 'seat:'+slugify(x&&x.s);
  if(kind==='event')return 'event:'+((x&&x.id)||slugify(x&&x.title));
  if(kind==='talk')return 'talk:'+((x&&x.id)||slugify(x&&x.title));
  return '';
}
window.itemAddr=itemAddr;
/* Lit, then scrolled to. The order matters: scrolling first and lighting
   after makes the beat happen off screen. */
let ITEM_TMR=null;
function focusItem(addr){
  if(!addr)return false;
  const el=$('panelBody')&&$('panelBody').querySelector(`[data-item="${addr}"]`);
  if(!el)return false;
  document.querySelectorAll('.itemfocus').forEach(e=>e.classList.remove('itemfocus'));
  el.classList.add('itemfocus');
  try{el.scrollIntoView({block:'nearest',behavior:'smooth'})}catch(_){el.scrollIntoView()}
  clearTimeout(ITEM_TMR);ITEM_TMR=setTimeout(()=>el.classList.remove('itemfocus'),2600);
  return true;
}
window.focusItem=focusItem;
""",
)

# ── 3. openPanel learns to carry an item ─────────────────────────────────
swap(
    """  $('panel').classList.add('open'); // opened before the flight so travelTo can measure the strip that stays visible
  travelTo(s.x,s.y,Math.max(cam.z,1.25));""",
    """  $('panel').classList.add('open'); // opened before the flight so travelTo can measure the strip that stays visible
  travelTo(s.x,s.y,Math.max(cam.z,1.25));
  if(item)setHash('#/place/'+key+'?item='+item); // the badge you tapped, in the address bar""",
)
swap(
    "function openPanel(key,tab){const s=BY[key];if(!s){toast('That place is no longer on the map.');return}panelKey=key;closeInspect();setHash('#/place/'+key);",
    "function openPanel(key,tab,item){const s=BY[key];if(!s){toast('That place is no longer on the map.');return}panelKey=key;closeInspect();setHash('#/place/'+key);",
)
swap(
    "  renderTab(tab||0);maiaContext(s)}",
    "  renderTab(tab||0);maiaContext(s);if(item)focusItem(item)}",
)
swap(
    "const _openPanelW=openPanel;openPanel=function(k,t){window.WGATE&&(WGATE.tap=true);return _openPanelW(k,t)};",
    "const _openPanelW=openPanel;openPanel=function(k,t,i){window.WGATE&&(WGATE.tap=true);return _openPanelW(k,t,i)};",
)

# ── 4. The cards learn their own names ───────────────────────────────────
swap(
    """  if(i===1)body.innerHTML=q.length?q.map(x=>`<div class="qcard"><h4>⚑ ${x.q}</h4><div class="meta">${x.r} · ${x.need}</div>""",
    """  if(i===1)body.innerHTML=q.length?q.map(x=>`<div class="qcard" data-item="${itemAddr('quest',x)}"><h4>⚑ ${x.q}</h4><div class="meta">${x.r} · ${x.need}</div>""",
)
swap(
    """  if(i===2)body.innerHTML=st.length?st.map(x=>`<div class="seatrow"><div class="nm"><b>${x.s}</b><span>${x.c} circle · ${x.note}</span></div>""",
    """  if(i===2)body.innerHTML=st.length?st.map(x=>`<div class="seatrow" data-item="${itemAddr('seat',x)}"><div class="nm"><b>${x.s}</b><span>${x.c} circle · ${x.note}</span></div>""",
)
swap(
    """  return `<div style="margin-top:9px">`+evs.map(e=>`<div class="mrow" style="margin:4px 0">""",
    """  return `<div style="margin-top:9px">`+evs.map(e=>`<div class="mrow" data-item="${itemAddr('event',e)}" style="margin:4px 0">""",
)

# The overview counted conversations and gave no way to reach one, so the
# rising curl was a mark with no door behind it.
swap(
    """    <p style="margin-top:8px;font-size:12px;color:#6b4d1e">⚑ ${q.length} quests · ⛨ ${st.length} open seats · 💬 ${threadsAt(s.key).length} conversation${threadsAt(s.key).length===1?'':'s'}${s.event?' · ✦ '+s.event:''}</p>""",
    """    <p style="margin-top:8px;font-size:12px;color:#6b4d1e">⚑ ${q.length} quests · ⛨ ${st.length} open seats · 💬 ${threadsAt(s.key).length} conversation${threadsAt(s.key).length===1?'':'s'}${s.event?' · ✦ '+s.event:''}</p>
    ${threadsAt(s.key).length?`<div style="margin-top:8px">${head('what people are saying here')}
      ${threadsAt(s.key).map(t=>`<div class="cvrow" data-item="${itemAddr('talk',t)}" onclick="openDoor('forum',{at:'${s.key}'})"><span>💬</span><span><b>${t.title}</b><small>${t.author} · ${t.replies} replies · ${t.last} ago</small></span></div>`).join('')}
      </div>`:''}""",
)

# ── 5. The address bar learns to carry an item ───────────────────────────
swap(
    """  const m=h.match(/^#\\/(place|module|journey)\\/([A-Za-z0-9_?=-]+)/);if(!m)return;
  leaveIntro();
  if(m[1]==='place'){if(BY[m[2]]){if(document.body.classList.contains('loom'))closeLoom();
      if(document.body.classList.contains('circles'))setMapType('living',true);openPanel(m[2])}""",
    """  const m=h.match(/^#\\/(place|module|journey)\\/([A-Za-z0-9_-]+)(?:\\?item=([A-Za-z0-9_:-]+))?/);if(!m)return;
  leaveIntro();
  /* Which tab an item lives on is a property of the kind, so the address
     carries the kind and never a tab number. */
  const ITAB={quest:1,seat:2,event:0,talk:0};
  if(m[1]==='place'){if(BY[m[2]]){if(document.body.classList.contains('loom'))closeLoom();
      if(document.body.classList.contains('circles'))setMapType('living',true);
      openPanel(m[2],m[3]?ITAB[m[3].split(':')[0]]||0:0,m[3]||null)}""",
)

# ── 6. A tap on a mark goes to the thing it stands for ───────────────────
swap(
    """const BADGE_TAB={quest:1,invite:1,seat:2,talk:0,event:0,more:0};
$('badges').addEventListener('click',e=>{
  const seal=e.target.closest('.bseal');if(!seal)return;
  e.stopPropagation();
  const key=seal.dataset.bk,kind=seal.dataset.bkind;const s=BY[key];if(!s)return;
  window.hap&&hap(6);
  if(kind==='more'){travelTo(s.x,s.y,Math.max(cam.z,1.6));return} // closer, where the ring opens
  (typeof buildMode!=='undefined'&&buildMode?openInspect:openPanel)(key,BADGE_TAB[kind]||0);
});""",
    """const BADGE_TAB={quest:1,invite:1,seat:2,talk:0,event:0,more:0};
$('badges').addEventListener('click',e=>{
  const seal=e.target.closest('.bseal');if(!seal)return;
  e.stopPropagation();
  const key=seal.dataset.bk,kind=seal.dataset.bkind;const s=BY[key];if(!s)return;
  window.hap&&hap(6);
  if(kind==='more'){travelTo(s.x,s.y,Math.max(cam.z,1.6));return} // closer, where the ring opens
  if(typeof buildMode!=='undefined'&&buildMode){openInspect(key);return} // the founder is rewiring, not reading
  if(kind==='invite'){inviteHere(key);return}
  if(kind==='talk'){openDoor('forum',{at:key});return} // the forum door already scopes itself to a place
  /* A mark stands for the first thing of its kind here, which is the same
     thing refreshBadges drew it from. */
  const first={quest:()=>questsAt(key)[0],seat:()=>seatsAt(key)[0],event:()=>eventsAt(key)[0]}[kind];
  const obj=first?first():null;
  openPanel(key,BADGE_TAB[kind]||0,obj?itemAddr(kind,obj):null);
});
/* The seed says what it is, and offers the way to plant one. On desk that is
   the resolver with this place already chosen; in the pocket it is the
   proposal page, because building lives on the desktop map. */
function inviteHere(key){
  const s=BY[key];if(!s)return;
  if(document.body.classList.contains('pocket')){
    $('moduleCard').innerHTML=`<h2>⚑ ${s.name}</h2>
      <div class="route">This place has room for work.</div>
      <p>Nothing is asked for here yet. If you can see what wants doing, write it and the village will meet you at it.</p>
      <div class="acts">
        <a class="btn" href="${siteHref('/propose-quest')}" target="_blank" rel="noopener" onclick="return siteNav(event,'/propose-quest')">Propose a quest here</a>
        <button class="btn ghostbtn" onclick="closeDoor()">Back to the land</button>
      </div>`;
    $('module').classList.add('show');return;
  }
  window._rqHome=key;
  $('resolver').classList.add('show');
  renderResolver();
  const t=$('rqText');if(t){t.focus();t.select&&t.select()}
  toast('⚑ '+s.name+' has room for work. Write it and it lands here.');
}
window.inviteHere=inviteHere;""",
)

# ── 7. The resolver honours a place the founder already chose ────────────
swap(
    """function renderResolver(){
  const q={text:$('rqText').value,role:$('rqRole').value||null,circle:$('rqCircle').value||null};
  const r=resolveQuestAddress(q);
  const addr=r.key?BY[r.key].name:'the Quest Board pool';""",
    """function renderResolver(){
  const q={text:$('rqText').value,role:$('rqRole').value||null,circle:$('rqCircle').value||null};
  const r=resolveQuestAddress(q);
  /* A place chosen from the land outranks anything the lexicon would guess.
     Creator's word is law, and this is the creator saying it with a tap. */
  const home=window._rqHome&&BY[window._rqHome]?window._rqHome:null;
  if(home){r.key=home;r.guessed=false;
    r.steps=r.steps.concat([{rule:'your hand',detail:`you opened this from ${BY[home].name}, so that is where it lands`,hit:true}])}
  const addr=r.key?BY[r.key].name:'the Quest Board pool';""",
)
swap(
    "  $('resolverClose').onclick=()=>$('resolver').classList.remove('show');",
    "  $('resolverClose').onclick=()=>{$('resolver').classList.remove('show');window._rqHome=null};",
)
swap(
    """  SCENE.quests.push({q:q.text.trim(),at:r.key,r:'20 ♥',need:'hands welcome',addr:r.guessed?'lexicon guess':(r.key?'resolved':'board')});""",
    """  SCENE.quests.push({q:q.text.trim(),at:r.key,r:'20 ♥',need:'hands welcome',
    addr:r.guessed?'lexicon guess':(window._rqHome?'creator':(r.key?'resolved':'board'))});
  window._rqHome=null;""",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"badges P2 patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
