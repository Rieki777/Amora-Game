#!/usr/bin/env python3
"""Badges P3: the feel. Calm by default, loud only when asked.

Thirty-odd marks that all pulse is a slot machine, and thirty-odd marks that
never move is wallpaper. The rule from the plan is one featured mark per
screen at a time, and motion reserved for time.

  the calm      marks idle at 60 per cent; one of them breathes, chosen on a
                seeded rotation so the same land breathes in the same order
  the filters   "What needs hands" dims everything that is not work for eight
                seconds; the Events door does the same for the lanterns
  the fan       a collapsed ring opens on a tap instead of only flying you
                closer, and in the pocket a building with two or more marks
                fans before it acts, so a thumb gets a target it can hit
  the walk      the Greenhouse beat now waits for a real badge tap

House protocol: exact-count anchors, refuse on any count that is not 1.
Usage: python3 patch_badges_p3.py [grounds-v0.html]
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


# ── 1. The calm, the filters and the fan, in CSS ─────────────────────────
rep(
    "  .bgroup .hchip{display:block} /* a home is a door at every distance */",
    """
  /* One mark breathes at a time. Motion is reserved for time, so this is a
     slow invitation and never a queue of things demanding attention. */
  .bseal.featured{opacity:1;animation:bfeat 2.9s ease-in-out infinite}
  @keyframes bfeat{0%,100%{transform:scale(1)}50%{transform:scale(1.16)}}
  /* An intent said out loud: everything that is not the answer steps back. */
  body.bfilter #badges .bgroup.on{opacity:1}
  body.bfilter #badges .bseal{opacity:.18}
  body.f-quest #badges .b-quest,body.f-quest #badges .b-invite,
  body.f-event #badges .b-event{opacity:1}
  /* A collapsed ring, opened. Transform only, so nothing reflows. */
  .bgroup.fanned .bseal{display:block;transform:scale(1.18)}
  .bgroup.fanned .b-more{display:none}""",
)

# ── 2. The building knows its own name, so a tap can find its marks ──────
swap(
    "  const el=document.createElement('div');el.className='poi st-'+s.state;\n  paintPoiArt(s,el);",
    "  const el=document.createElement('div');el.className='poi st-'+s.state;el.dataset.k=s.key;\n  paintPoiArt(s,el);",
)

# ── 3. A fanned ring outranks the sweep that wanted to collapse it ───────
swap(
    """    const need=badgeRing(kinds,BADGE_GAP);
    groups.push({bg,kinds,off,R:Math.max(off,need,20),
      cluster:need>Math.max(off*1.8,30), // too small a building to carry its own ring
      cx:bg._cx,cy:bg._cy});""",
    """    const need=badgeRing(kinds,BADGE_GAP);
    /* A ring the reader opened on purpose stays open, and stands a little
       further out so the marks it was hiding have somewhere to be. */
    const fan=(bg._fan||0)>performance.now(),R0=Math.max(off,need,20);
    groups.push({bg,kinds,off,R:fan?Math.max(R0*1.35,52):R0,
      cluster:!fan&&need>Math.max(off*1.8,30), // too small a building to carry its own ring
      pin:fan,cx:bg._cx,cy:bg._cy});""",
)
swap(
    """      let give;
      if(a.cluster)give=b; else if(b.cluster)give=a;
      else if(a.kinds.length!==b.kinds.length)give=a.kinds.length>b.kinds.length?a:b;
      else give=a.cy<b.cy?a:b;
      give.cluster=true;""",
    """      let give;
      if(a.pin&&b.pin)continue; // both opened by hand; the reader gets to see both
      if(a.pin)give=b; else if(b.pin)give=a;
      else if(a.cluster)give=b; else if(b.cluster)give=a;
      else if(a.kinds.length!==b.kinds.length)give=a.kinds.length>b.kinds.length?a:b;
      else give=a.cy<b.cy?a:b;
      give.cluster=true;""",
)
swap(
    """  for(const g of groups){
    g.bg.classList.toggle('clustered',g.cluster);""",
    """  for(const g of groups){
    g.bg.classList.toggle('clustered',g.cluster);
    g.bg.classList.toggle('fanned',!!g.pin);""",
)

# ── 4. The calm system, the filters and the fan ──────────────────────────
rep(
    "window.layoutBadges=layoutBadges;\n",
    r"""/* ---------- the calm system ----------
   Sixty per cent is the resting state, set in CSS. This picks the one mark
   that breathes, on a seeded rotation so it is a rhythm rather than a
   surprise, and it stands down whenever an intent is already speaking. */
let FEAT_I=0,FEAT_EL=null;
function featureOne(){
  if(FEAT_EL){FEAT_EL.classList.remove('featured');FEAT_EL=null}
  if(document.body.classList.contains('bfilter'))return;
  const pool=[...document.querySelectorAll('#badges .bgroup.on .bseal')]
    .filter(s=>getComputedStyle(s).display!=='none'&&!/\bev-u/.test(s.className)); // a lantern already keeps its own time
  if(!pool.length)return;
  FEAT_EL=pool[Math.floor(mulberry(9173+FEAT_I++)()*pool.length)];
  FEAT_EL.classList.add('featured');
}
window.featureOne=featureOne;
setTimeout(featureOne,2600);setInterval(featureOne,9000);

/* An intent, said out loud for eight seconds. Everything that is not the
   answer steps back rather than the answer shouting. */
let FTMR=null;
function badgeIntent(kind,ms){
  clearTimeout(FTMR);
  if(FEAT_EL){FEAT_EL.classList.remove('featured');FEAT_EL=null}
  document.body.classList.remove('f-quest','f-event');
  document.body.classList.add('bfilter','f-'+kind);
  FTMR=setTimeout(()=>{document.body.classList.remove('bfilter','f-quest','f-event');featureOne()},ms||8000);
}
window.badgeIntent=badgeIntent;
if($('attnBtn'))$('attnBtn').addEventListener('click',()=>badgeIntent('quest',8000));
(function eventsDoorFilter(){const b=document.querySelector('#dock button[data-m="events"]');
  if(b)b.addEventListener('click',()=>badgeIntent('event',8000))})();

/* ---------- the fan ----------
   A collapsed ring is one seal standing for several. Opening it is a beat of
   its own, so the tap that opens it is not also the tap that acts. */
function fanGroup(key,ms){
  const g=bgEls[key];if(!g)return false;
  g._fan=performance.now()+(ms||2600);
  window.hap&&hap(6);
  return true;
}
window.fanGroup=fanGroup;
/* In the pocket a building with two or more marks fans before it opens its
   door, because a 22 px mark under a thumb needs to be somewhere findable
   first. Capture phase, so the poi's own click never runs. */
$('icons').addEventListener('click',e=>{
  if(!document.body.classList.contains('pocket'))return;
  const poi=e.target.closest('.poi');if(!poi||!poi.dataset.k)return;
  const g=bgEls[poi.dataset.k];if(!g||!g.classList.contains('on'))return;
  if((g._fan||0)>performance.now())return; // already open: this tap is the one that acts
  if(g.querySelectorAll('.bseal:not(.b-more)').length<2)return; // one mark acts at once
  e.stopPropagation();e.preventDefault();
  fanGroup(poi.dataset.k);
},true);
""",
)

# ── 5. The counted seal opens rather than only flying you closer ─────────
swap(
    """  if(kind==='more'){travelTo(s.x,s.y,Math.max(cam.z,1.6));return} // closer, where the ring opens""",
    """  if(kind==='more'){ // the ring it stands for, opened here rather than only flown to
    fanGroup(key);
    if(cam.z<1.35)travelTo(s.x,s.y,1.45); // and a little closer, if the marks would be tiny
    return}""",
)

# ── 6. The walk waits for a real badge ───────────────────────────────────
swap(
    "  window.hap&&hap(6);\n  if(kind==='more'){",
    "  window.hap&&hap(6);window.WGATE&&(WGATE.badge=true); // the Greenhouse beat waits on this\n  if(kind==='more'){",
)
swap(
    """ {id:'w4',structure_key:'greenhouse',title:'The Growing Engine',gesture:'none',
  body:'Quests live where the work lives. Small acts, real impact. The ⚑ flags mark where hands are wanted. Find the work you love that the village needs, and it will thank you in Hearts.'},""",
    """ {id:'w4',structure_key:'greenhouse',title:'The Growing Engine',gesture:'badge',
  body:'Quests live where the work lives. Small acts, real impact. The ⚑ flags mark where hands are wanted. Find the work you love that the village needs, and it will thank you in Hearts.',
  gate_hint:'tap the leaf-pennant at the door'},""",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"badges P3 patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
