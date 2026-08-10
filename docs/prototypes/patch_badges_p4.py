#!/usr/bin/env python3
"""Badges P4: the contract. What the founder decides, and what leaves the map.

The marks are projections, so there is almost nothing to store. Two things
are genuinely the founder's word and belong in the export:

  toggles   which kinds a building shows. Default is all of them, so only a
            deliberate silence is ever written down.
  weight    a quest's ask, when the derivation from its `need` text is wrong.
            Absent means "read it from the words", which is what it does now.

Both ride the shapes that already exist: `bindings` on a structure, and the
quest row. No new endpoints, no new stored state, nothing the site importer
has to learn beyond two optional fields.

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_badges_p4.py [grounds-v0.html]
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


# ── 1. A building may keep a kind to itself ──────────────────────────────
rep(
    "window.refreshBadges=refreshBadges;\n",
    """/* Silence is the only thing worth writing down: a building shows every kind
   unless its founder has said otherwise, so an untouched map exports nothing
   here at all. The home chip is not in this list because a home is data, not
   a decision, and the counted seal is a layout artefact. */
const BADGE_KINDS=['quest','seat','event','talk'];
function badgeOn(s,kind){
  if(kind==='invite')kind='quest'; // the seed is the quest slot saying it is empty
  return !(s&&s.badges)||s.badges[kind]!==0;
}
window.badgeOn=badgeOn;
""",
)
swap(
    """    if(qs.length){
      const q=qs[0]; // the heaviest ask leads; the rest live on the card""",
    """    if(qs.length&&badgeOn(s,'quest')){
      const q=qs[0]; // the heaviest ask leads; the rest live on the card""",
)
swap(
    """    } else {
      // No work here yet, so the door says there is room for some.
      marks.push({kind:'invite',tint:'',pips:0,rim:'r-open',braid:false,n:0});
    }""",
    """    } else if(!qs.length&&badgeOn(s,'quest')){
      // No work here yet, so the door says there is room for some.
      marks.push({kind:'invite',tint:'',pips:0,rim:'r-open',braid:false,n:0});
    }""",
)
swap(
    """    if(st.length) marks.push({kind:'seat',""",
    """    if(st.length&&badgeOn(s,'seat')) marks.push({kind:'seat',""",
)
swap(
    """    if(th.length) marks.push({kind:'talk',""",
    """    if(th.length&&badgeOn(s,'talk')) marks.push({kind:'talk',""",
)
swap(
    """    if(ev.length) marks.push({kind:'event',""",
    """    if(ev.length&&badgeOn(s,'event')) marks.push({kind:'event',""",
)
# The far seal counts what the building actually shows, or the number would
# promise marks that a founder has deliberately silenced.
swap(
    """    const open=qs.length+st.length+th.length+ev.length;""",
    """    const open=(badgeOn(s,'quest')?qs.length:0)+(badgeOn(s,'seat')?st.length:0)
      +(badgeOn(s,'talk')?th.length:0)+(badgeOn(s,'event')?ev.length:0);""",
)
swap(
    """    const asig=open+'|'+(soon<=2?'soon':'')+'|'+(lot?lot.sold+'/'+lot.total:room?room.taken+'/'+room.total:'');""",
    """    const asig=open+'|'+(soon<=2?'soon':'')+'|'+(lot?lot.sold+'/'+lot.total:room?room.taken+'/'+room.total:'')
      +'|'+(s.badges?BADGE_KINDS.map(k=>s.badges[k]===0?'0':'1').join(''):'1111');""",
)

# ── 2. The chip row, beside the doors it belongs with ────────────────────
swap(
    """   <h5>doors · what this place opens</h5>""",
    """   <h5>badges · what this place shows</h5>
   <div style="font-size:10px;color:#b9af8f;margin-bottom:5px">every kind shows unless you turn it off here. Nothing is hidden from the lists, only from the land.</div>
   <div class="irow" style="flex-wrap:wrap;gap:4px">${['quest','seat','event','talk'].map(k=>
     `<button class="chip${badgeOn(s,k)?' on':''}" data-bkt="${k}">${({quest:'quests',seat:'seats',event:'events',talk:'conversations'})[k]}</button>`).join('')}</div>
   <h5>doors · what this place opens</h5>""",
)
rep(
    """  B.querySelector('#iDAdd').onclick=()=>{const l=B.querySelector('#iDLabel').value.trim();if(!l)return;""",
    """  B.querySelectorAll('[data-bkt]').forEach(b=>b.onclick=()=>{const k=b.dataset.bkt;
    s.badges=s.badges||{};s.badges[k]=badgeOn(s,k)?0:1;
    /* All four back on is the default again, so the map stops carrying a
       record of a decision that no longer says anything. */
    if(BADGE_KINDS.every(x=>s.badges[x]!==0))delete s.badges;
    logEdit('badges','structure:'+s.key,{show:BADGE_KINDS.filter(x=>badgeOn(s,x)).join(',')||'none'});
    refreshBadges();renderInspect()});
""",
    where="before",
)

# ── 3. Weight, when the words get it wrong ───────────────────────────────
swap(
    """   <div class="irow" style="margin-top:3px"><span class="ilbl" style="width:52px">address</span>
   <select data-qaddr="${qi}"><option value="">Quest Board · not yet placed</option>${structOpts(q.at,null)}</select></div></div>`}""",
    """   <div class="irow" style="margin-top:3px"><span class="ilbl" style="width:52px">address</span>
   <select data-qaddr="${qi}"><option value="">Quest Board · not yet placed</option>${structOpts(q.at,null)}</select></div>
   <div class="irow" style="margin-top:3px"><span class="ilbl" style="width:52px">ask</span>
   <select data-qw="${qi}"><option value=""${q.weight?'':' selected'}>read from the words (${badgeWeight(q)})</option>${[1,2,3].map(w=>`<option value="${w}"${q.weight===w?' selected':''}>${({1:'1 · an hour',2:'2 · a session',3:'3 · a full day'})[w]}</option>`).join('')}</select></div></div>`}""",
)
rep(
    """  B.querySelectorAll('[data-bkt]').forEach(b=>b.onclick=()=>{const k=b.dataset.bkt;""",
    """  B.querySelectorAll('[data-qw]').forEach(sel=>sel.onchange=()=>{const q=SCENE.quests[+sel.dataset.qw];if(!q)return;
    if(sel.value)q.weight=+sel.value;else delete q.weight; // empty means the words decide again
    logEdit('quest-weight','quest:'+q.q,{weight:q.weight||'from the words'});
    refreshBadges();renderInspect()});
""",
    where="before",
)

# ── 4. The contract: out, and back in ────────────────────────────────────
swap(
    """      quest_tags:[],href:null},""",
    """      quest_tags:[],href:null,
      /* Only a deliberate silence is written; an untouched building has no
         `badges` key at all, which is what "default all on" has to mean in a
         file another village will read. */
      badges:s.badges?BADGE_KINDS.filter(k=>s.badges[k]===0).map(k=>({kind:k,show:false})):[]},""",
)
swap(
    """    if(r.bindings&&Array.isArray(r.bindings.action_doors)&&r.bindings.action_doors.length){s.doors={};""",
    """    if(r.bindings&&Array.isArray(r.bindings.badges)&&r.bindings.badges.length){s.badges={};
      r.bindings.badges.forEach(b=>{if(b&&b.show===false)s.badges[b.kind]=0})}
    if(r.bindings&&Array.isArray(r.bindings.action_doors)&&r.bindings.action_doors.length){s.doors={};""",
)
swap(
    """      src:x.src||'scene',circle_site:x.circle_site||null,circle_aff:x.aff||null,
      address_source:addrSrc(x),""",
    """      src:x.src||'scene',circle_site:x.circle_site||null,circle_aff:x.aff||null,
      weight:x.weight||null, // null means read it from the need text, which is what the map does
      address_source:addrSrc(x),""",
)
swap(
    """    desc:r.desc||undefined,src:r.src||undefined,circle_site:r.circle_site||undefined,aff:r.circle_aff||undefined,""",
    """    desc:r.desc||undefined,src:r.src||undefined,circle_site:r.circle_site||undefined,aff:r.circle_aff||undefined,
    weight:(r.weight===1||r.weight===2||r.weight===3)?r.weight:undefined,""",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"badges P4 patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
