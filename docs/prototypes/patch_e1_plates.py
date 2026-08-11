#!/usr/bin/env python3
"""A name stays with the building it names.

THE COMPLAINT, twice, from a phone: "need to make names stickier on the
buildings" and "the name plates / sprite titles are not sticking close enough
to their icons". The second screenshot shows the failure in its pure form: five
district plates stacked in a column at the top of the screen, naming nothing,
while the land they belong to sits untouched below.

WHY. Every escape a plate had was UPWARD and UNCAPPED. Three of them, in one
loop, five passes deep:

    py = o.py - (h+6)     above the plates already placed
    py = ic.y  - 40       above a neighbour's icon
    y  = p.y   - (h+18)   above every badge mark, four times per call

Each pass fed the next, and dodgeMarks ran its own four steps inside every one.
Nothing bounded the total. A plate in a cluster ratchets clean off its building
until `py=Math.max(py,26)` pins it under the vitals bar, and every other
homeless plate piles onto the same ceiling. That column IS the algorithm
working as written. On a phone, where the land is narrow and everything is a
cluster, it is most of what you see.

THE FIX IS A LEASH, NOT A BETTER SEARCH. The old code treated "find this plate
a clear spot" as always solvable, so it kept walking until it found one. But a
plate that has walked off its building has already failed: it is no longer a
name, it is an entry in a list. So a plate now gets a short list of offsets
near its own crown, tried in order, and if none of them is clear IT DOES NOT
DRAW. Nothing is lost in that silence. The counts moved to the seal and the
home chip two rounds ago, the name is one tap away on the card, and a plate
that cannot be placed honestly is worth less than the space it takes.

AND FEWER AT ONCE, which is the other half of Rye's call. Names are budgeted
per frame, nearest the middle of the screen first, because the middle is what
the reader is asking about. A pocket carries seven, a desk sixteen. Whatever
panel is open keeps its name whatever else happens.

Marks still win over plates. That part was right: a mark is a door and a plate
is a name, so the plate moves, or it goes.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable PER STEP, so a partly-applied file finishes rather than aborting.
Usage: python3 patch_e1_plates.py [grounds-v0.html] [--check]
  --check verifies every anchor against the file and writes nothing.
"""
import sys

args = [a for a in sys.argv[1:] if not a.startswith("--")]
CHECK = "--check" in sys.argv
HTML = args[0] if args else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()
before = len(src)


def swap(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


def step(name, old, new, marker):
    """One edit, skipped when its marker says it already landed."""
    if marker in src:
        print(f"  skip  {name} (already applied)")
        return
    swap(old, new)
    print(f"  apply {name}")


# ------------------------------------------------------------- 1. the leash itself
# Replaces dodgeMarks outright. Nothing outside the artifact referenced it (no
# qa probe, no shell), and leaving a function whose whole job was the unbounded
# walk would invite the next reader to call it.
step(
    "the leash",
    """/* A plate steps up until it is clear of every mark. Marks win, because a
   mark is a door and a plate is a name. */
function dodgeMarks(x,y,w,h){
  const P=window.BADGE_PTS||[];
  for(let g=0;g<4;g++){let moved=false;
    for(let i=0;i<P.length;i++){const p=P[i];
      if(Math.abs(x-p.x)*2<w+34&&Math.abs(y-p.y)<h+18){y=p.y-(h+18);moved=true}}
    if(!moved)break}
  return y;
}
window.dodgeMarks=dodgeMarks;""",
    """/* ---------- A NAME STAYS WITH ITS BUILDING (E1) ----------
   A plate used to escape upward, without a bound, past the plates already
   placed and the neighbours' icons and every badge mark, five passes deep with
   a four-step dodge inside each one. In a cluster that walks a plate clean off
   the building it names and into a column at the top of the screen.

   A plate is a name, and a name that has walked away from its building is not
   a name any more. So it gets a LEASH: a short list of offsets near its own
   crown, tried in order, and if none is clear it DOES NOT DRAW. Nothing is
   lost in that silence. The counts moved to the seal and the home chip, the
   name is one tap away on the card, and a plate that cannot be placed honestly
   is worth less than the space it takes.

   Ordered by how much each offset still reads as "this building": straight
   above first, then a little higher, then the shoulders. */
const PLATE_LEASH=[[0,0],[0,-14],[0,13],[-40,-4],[40,-4],[0,-28],[-54,11],[54,11]];
/* A mark is a door and a plate is a name, so the mark still wins. */
function marksHit(x,y,w,h){const P=window.BADGE_PTS||[];
  for(let i=0;i<P.length;i++){const p=P[i];
    if(Math.abs(x-p.x)*2<w+34&&Math.abs(y-p.y)<h+18)return true}
  return false}
/* A spot within the leash, or null for "do not draw this one". `others` is
   every plate already laid this frame whatever kind it is, so a place-name and
   a building name cannot land on each other. */
function platePlace(ax,ay,w,h,others,avoidMarks,icons,selfKey){
  for(let i=0;i<PLATE_LEASH.length;i++){
    const x=ax+PLATE_LEASH[i][0],y=ay+PLATE_LEASH[i][1];
    if(y<26)continue; // the vitals bar owns the top of the screen
    let clear=true;
    for(let n=0;n<others.length&&clear;n++){const o=others[n];
      if(Math.abs(x-o.x)*2<(w+o.w)+12&&Math.abs(y-o.y)<h+6)clear=false}
    if(clear&&icons)for(let n=0;n<icons.length&&clear;n++){const ic=icons[n];
      if(ic.k!==selfKey&&Math.abs(x-ic.x)*2<w+44&&Math.abs(y-ic.y)<27)clear=false}
    if(clear&&avoidMarks&&marksHit(x,y,w,h))clear=false;
    if(clear)return{x,y}}
  return null}
/* How many building names the land carries at once. A phone is not a desk: the
   count that reads as a map on a laptop reads as a wall of words in a hand. */
function plateBudget(){return document.body.classList.contains('pocket')?7:16}
window.platePlace=platePlace;window.marksHit=marksHit;window.plateBudget=plateBudget;""",
    "PLATE_LEASH",
)

# --------------------------------------------------------------- 2. district plates
step(
    "district plates",
    """    const dw=el.offsetWidth||140,dh=el.offsetHeight||22;
    const dx=sx/DPR;let dy=dodgeMarks(dx,sy/DPR,dw,dh),g2=0,hit2=true;
    while(hit2&&g2++<4){hit2=false;
      for(let i=0;i<placedD.length;i++){const o=placedD[i];
        if(Math.abs(dx-o.x)*2<(dw+o.w)+14&&Math.abs(dy-o.y)<dh+8){dy=o.y-(dh+8);hit2=true}}
      const ny=dodgeMarks(dx,dy,dw,dh);if(ny!==dy){dy=ny;hit2=true}}
    el.style.left=dx+'px';el.style.top=dy+'px';placedD.push({x:dx,y:dy,w:dw})}""",
    """    const dw=el.offsetWidth||140,dh=el.offsetHeight||22;
    const spot=platePlace(sx/DPR,sy/DPR,dw,dh,placedD,true);
    if(!spot){el.style.display='none';continue}
    el.style.left=spot.x+'px';el.style.top=spot.y+'px';placedD.push({x:spot.x,y:spot.y,w:dw})}""",
    "platePlace(sx/DPR,sy/DPR,dw,dh",
)

# -------------------------------------------------------------- 3. place-name plates
step(
    "place-name plates",
    """    const gw=el.offsetWidth||120,gh=el.offsetHeight||20;
    const gx2=sx/DPR;let gy2=dodgeMarks(gx2,sy/DPR,gw,gh),g3=0,hit3=true;
    while(hit3&&g3++<4){hit3=false;
      for(let i2=0;i2<placedD.length;i2++){const o=placedD[i2];
        if(Math.abs(gx2-o.x)*2<(gw+o.w)+14&&Math.abs(gy2-o.y)<gh+8){gy2=o.y-(gh+8);hit3=true}}
      const ny=dodgeMarks(gx2,gy2,gw,gh);if(ny!==gy2){gy2=ny;hit3=true}}
    el.style.left=gx2+'px';el.style.top=gy2+'px';placedD.push({x:gx2,y:gy2,w:gw})});""",
    """    const gw=el.offsetWidth||120,gh=el.offsetHeight||20;
    const spot=platePlace(sx/DPR,sy/DPR,gw,gh,placedD,true);
    if(!spot){el.style.display='none';return}
    el.style.left=spot.x+'px';el.style.top=spot.y+'px';placedD.push({x:spot.x,y:spot.y,w:gw})});""",
    "platePlace(sx/DPR,sy/DPR,gw,gh",
)

# ------------------------------------------------------------- 4. building plates
# `placed` starts from placedD so a place-name and a building name cannot land
# on each other: their zoom bands overlap between 0.95 and 1.25, which the old
# two-list version never accounted for.
step(
    "building plates",
    """  const placed=[]; // collision-resolved label crowns: labels always win, labels never collide
  const iconPts=[]; // …and a label never squats on a neighbour's doorstep (its icon click centre)
  for(const s of SCENE.structures){if(mode==='now'&&s.state==='blueprint')continue;
    const[ax,ay]=worldToScreen(s.x,s.y);iconPts.push({k:s.key,x:ax/DPR,y:ay/DPR})}
  for(const s of SCENE.structures){const el=bEls[s.key];
    const hide=(!zoomed)||(mode==='now'&&s.state==='blueprint');
    el.style.display=hide?'none':'block';if(hide)continue;
    const[sx,sy]=worldToScreen(s.x,s.y);let px=sx/DPR,py=sy/DPR-(s._crownOff||k*30+10);
    el.classList.toggle('ghosted',s.state==='blueprint'||((s.state==='funding')&&mode==='vision'));
    const q=questsAt(s.key).length,st=seatsAt(s.key).length;
    /* The counts used to live here as text and nobody found them. They are
       the activity seal and the home chip now, in the badge plane, at a size
       and a contrast a person can actually see. */
    el.querySelector('.cnt').textContent='';
    const w=el.offsetWidth||120,h=el.offsetHeight||22; // A2: measured row height — collision survives any scale
    let guard=0,hit=true; // iterate until clear — one pass leaves slivers
    while(hit&&guard++<5){hit=false;
      for(let kk=0;kk<placed.length;kk++){const o=placed[kk];
        if(Math.abs(px-o.px)*2<(w+o.w)+12&&Math.abs(py-o.py)<h+6){py=o.py-(h+6);hit=true}}
      for(let kk=0;kk<iconPts.length;kk++){const ic=iconPts[kk];if(ic.k===s.key)continue;
        if(Math.abs(px-ic.x)*2<w+44&&Math.abs(py-ic.y)<27){py=ic.y-40;hit=true}}
      const ny=dodgeMarks(px,py,w,h);if(ny!==py){py=ny;hit=true}}
    if(px>innerWidth/2-360&&px<innerWidth/2+360&&py<88){el.style.display='none';continue} // never under the vitals bar — hidden at the extreme edge, not squeezed into neighbours
    py=Math.max(py,26);
    el.style.left=px+'px';el.style.top=py+'px';placed.push({px,py,w})}}""",
    """  const placed=placedD.slice(); // one field: a place-name and a building name never overlap
  const iconPts=[]; // ...and a label never squats on a neighbour's doorstep (its icon click centre)
  for(const s of SCENE.structures){if(mode==='now'&&s.state==='blueprint')continue;
    const[ax,ay]=worldToScreen(s.x,s.y);iconPts.push({k:s.key,x:ax/DPR,y:ay/DPR})}
  /* Nearest the middle of the screen first, because the middle is what the
     reader is asking about, so the budget runs out from the edges inward.
     Whatever panel is open keeps its name whatever else happens. */
  const cxm=innerWidth/2,cym=innerHeight/2;
  const order=SCENE.structures.map(s=>{const[sx,sy]=worldToScreen(s.x,s.y);
      const px=sx/DPR,py=sy/DPR;
      return{s,px,py,d:(typeof panelKey!=='undefined'&&panelKey===s.key)?-1:Math.hypot(px-cxm,py-cym)}})
    .sort((a,b)=>a.d-b.d);
  let budget=plateBudget();
  for(const o of order){const s=o.s,el=bEls[s.key];
    const hide=(!zoomed)||(mode==='now'&&s.state==='blueprint');
    el.style.display=hide?'none':'block';if(hide)continue;
    if(budget<=0){el.style.display='none';continue}
    el.classList.toggle('ghosted',s.state==='blueprint'||((s.state==='funding')&&mode==='vision'));
    /* The counts used to live here as text and nobody found them. They are
       the activity seal and the home chip now, in the badge plane, at a size
       and a contrast a person can actually see. */
    el.querySelector('.cnt').textContent='';
    const w=el.offsetWidth||120,h=el.offsetHeight||22; // measured row height: collision survives any scale
    const spot=platePlace(o.px,o.py-(s._crownOff||k*30+10),w,h,placed,true,iconPts,s.key);
    if(!spot){el.style.display='none';continue}
    // never under the vitals bar: hidden at the extreme edge, not squeezed into neighbours
    if(spot.x>innerWidth/2-360&&spot.x<innerWidth/2+360&&spot.y<88){el.style.display='none';continue}
    el.style.left=spot.x+'px';el.style.top=spot.y+'px';placed.push({x:spot.x,y:spot.y,w});budget--}}""",
    "let budget=plateBudget()",
)

if CHECK:
    print(f"CHECK ONLY, nothing written. {HTML} would go {before} -> {len(src)} bytes ({len(src)-before:+d})")
    sys.exit(0)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"plates patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
