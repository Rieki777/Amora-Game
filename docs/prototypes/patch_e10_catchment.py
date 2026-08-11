#!/usr/bin/env python3
"""A mark needs room for a thumb, not room for a cursor.

THE MAP LANE CAUGHT THIS AND THEY ARE RIGHT.

patch_e5_taps made overlap safe by resolving a tap to the nearest seal centre,
and `verify_features` asserted 34 of 34 marks answer their own tap. Both true.
Both insufficient, and in the exact shape of the four bugs this round spent
itself removing: the measurement is about the mechanism, the experience is
broken, and nothing raises a hand.

Nearest-centre resolution gives two centres `d` apart a catchment of `d/2`.
A fingertip contact patch is roughly 30 to 45 CSS px. Measured on the land:

  library:quest    vs council:event      13.0 px apart   catchment  6.5 px
  pondhomes:invite vs ponds:talk         17.3 px         catchment  8.6 px
  community:quest  vs kitchen:event      29.3 px         catchment 14.7 px
  greenhouse:quest vs library:talk       31.7 px         catchment 15.9 px
  greenhouse:seat  vs community:event    31.9 px         catchment 15.9 px

The bottom three are fine. The top two are not: on a phone, tapping
`library:quest` usually opens `council:event`, and a synthetic click at either
exact centre resolves correctly all day long. The gate passes; the finger does
not.

THE FLOOR IS 22 PX, half the 44 px hit footprint, so each catchment is 11: the
seal's own radius. A tap anywhere on the ink resolves to that mark.

WHAT GIVES WAY IS A FEW DEGREES, AND NOTHING ELSE. Not the radius, so a mark
never leaves the building it belongs to, which was Rye's whole complaint. Not
a collapse, so no neighbour ever hides another building's marks. The WHOLE
ring turns together, so every kind keeps its seat relative to every other and
a reader who learned where to look still finds it. Rye asked that marks not be
pushed away from their own sprite and said they may overlap other SPRITES;
marks burying each other is a different thing, and it costs a door.

Rings are turned in a stable order and only when they have to be: a ring that
already clears everything placed before it keeps rot 0, which is nearly all of
them, so the rotation search runs for the two or three that are actually
crowded rather than every frame for everyone.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable PER STEP, so a partly-applied file finishes rather than aborting.
Usage: python3 patch_e10_catchment.py [grounds-v0.html] [--check]
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
    if marker in src:
        print(f"  skip  {name} (already applied)")
        return
    swap(old, new)
    print(f"  apply {name}")


# ------------------------------------------------------------ 1. the solver
step(
    "the catchment solver",
    """function layoutBadges(){
  const groups=[];""",
    """/* ---------- ROOM FOR A THUMB (E10) ----------
   Nearest-centre resolution gives two centres d apart a catchment of d/2, and
   a fingertip is 30 to 45 px wide. Two marks 13 px apart resolve perfectly at
   their exact centres and open the wrong door under an actual thumb. So marks
   belonging to DIFFERENT buildings keep a floor between them.

   22 px is half the 44 px hit footprint, which leaves each mark a catchment of
   11: its own radius, so a tap anywhere on the ink lands on the mark it looks
   like. Same-ring spacing is untouched and still BADGE_GAP. */
const MARK_FLOOR=22;
/* The only thing a crowded ring gives up. The radius never changes, so a mark
   never leaves its building; the whole ring turns at once, so every kind keeps
   its seat relative to the others. */
const RING_ROT=[0,9,-9,18,-18,27,-27];
function markPts(g,rot){
  const out=[];
  for(const kd of g.kinds){if(kd==='home')continue;
    const a=((BADGE_SLOT[kd]!==undefined?BADGE_SLOT[kd]:215)+rot)*Math.PI/180;
    out.push({x:g.cx+Math.cos(a)*g.R,y:g.cy-Math.sin(a)*g.R})}
  const ha=(BADGE_SLOT.home+rot)*Math.PI/180; // the home chip is a door too
  out.push({x:g.cx+Math.cos(ha)*g.R,y:g.cy-Math.sin(ha)*g.R});
  return out}
/* Stable order, earlier rings hold their ground, and a ring that already
   clears everything keeps rot 0 without searching. That last part is why this
   is cheap enough to run every frame: on a normal land only two or three rings
   are crowded and the rest cost one pass each. */
function solveRotations(groups){
  const live=[];
  for(const g of groups){g.rot=0;g._pts=null;
    if(!g.cluster&&!g.bg.classList.contains('far'))live.push(g)}
  for(let i=0;i<live.length;i++){
    const g=live[i];
    const near=pts=>{let worst=Infinity;
      for(let j=0;j<i;j++){const o=live[j];
        for(let m=0;m<o._pts.length;m++)for(let n=0;n<pts.length;n++){
          const d=Math.hypot(o._pts[m].x-pts[n].x,o._pts[m].y-pts[n].y);
          if(d<worst)worst=d}}
      return worst};
    let best=0,bestPts=markPts(g,0),bestMin=near(bestPts);
    if(bestMin<MARK_FLOOR)for(let r=1;r<RING_ROT.length;r++){
      const rot=RING_ROT[r],pts=markPts(g,rot),m=near(pts);
      if(m>bestMin){bestMin=m;best=rot;bestPts=pts}
      if(m>=MARK_FLOOR)break}
    g.rot=best;g._pts=bestPts}
}
function layoutBadges(){
  const groups=[];""",
    "ROOM FOR A THUMB",
)

# ------------------------------------------------------------ 2. call it
step(
    "solve before placing",
    """  const CR=g=>Math.max(g.off,20); // where a collapsed ring puts its one seal""",
    """  solveRotations(groups); // a few degrees, where two buildings crowd each other
  const CR=g=>Math.max(g.off,20); // where a collapsed ring puts its one seal""",
    "solveRotations(groups);",
)

# ------------------------------------------------- 3. the seals take the turn
step(
    "seals take the turn",
    """    } else for(const seal of g.bg.querySelectorAll('.bseal')){
      const a=(BADGE_SLOT[seal.dataset.bkind]!==undefined?BADGE_SLOT[seal.dataset.bkind]:215)*Math.PI/180;""",
    """    } else for(const seal of g.bg.querySelectorAll('.bseal')){
      const a=((BADGE_SLOT[seal.dataset.bkind]!==undefined?BADGE_SLOT[seal.dataset.bkind]:215)+g.rot)*Math.PI/180;""",
    "+g.rot)*Math.PI/180;\n      seal.style.left",
)

# ------------------------------------------- 4. the home chip rides the same ring
step(
    "the home chip rides along",
    """    if(hc2){const ha=BADGE_SLOT.home*Math.PI/180,hr=g.cluster?Math.max(g.off,24):g.R;
      hc2.style.left=(Math.cos(ha)*hr)+'px';hc2.style.top=(-Math.sin(ha)*hr)+'px'}""",
    """    if(hc2){const ha=(BADGE_SLOT.home+g.rot)*Math.PI/180,hr=g.cluster?Math.max(g.off,24):g.R;
      hc2.style.left=(Math.cos(ha)*hr)+'px';hc2.style.top=(-Math.sin(ha)*hr)+'px'}""",
    # The marker must exist ONLY after the change. `hc2.style.left=...` alone
    # is in the file before it too, which would silently skip the step.
    "+g.rot)*Math.PI/180,hr=g.cluster?Math.max(g.off,24):g.R;\n      hc2.style.left",
)

# --------------------------------------- 5. the plates are told where they landed
step(
    "the plates hear about it",
    """    else for(const kd of g.kinds){if(kd==='home')continue;
      const a=(BADGE_SLOT[kd]!==undefined?BADGE_SLOT[kd]:215)*Math.PI/180;
      pts.push({x:g.cx+Math.cos(a)*g.R,y:g.cy-Math.sin(a)*g.R})}
    if(hc2){const ha=BADGE_SLOT.home*Math.PI/180,hr=g.cluster?Math.max(g.off,24):g.R;
      pts.push({x:g.cx+Math.cos(ha)*hr,y:g.cy-Math.sin(ha)*hr})}""",
    """    else for(const kd of g.kinds){if(kd==='home')continue;
      const a=((BADGE_SLOT[kd]!==undefined?BADGE_SLOT[kd]:215)+g.rot)*Math.PI/180;
      pts.push({x:g.cx+Math.cos(a)*g.R,y:g.cy-Math.sin(a)*g.R})}
    if(hc2){const ha=(BADGE_SLOT.home+g.rot)*Math.PI/180,hr=g.cluster?Math.max(g.off,24):g.R;
      pts.push({x:g.cx+Math.cos(ha)*hr,y:g.cy-Math.sin(ha)*hr})}""",
    # Same trap as the step above: anchor the marker on the rotation AND on the
    # line that follows it, so it cannot match the pre-change file.
    "+g.rot)*Math.PI/180,hr=g.cluster?Math.max(g.off,24):g.R;\n      pts.push",
)

if CHECK:
    print(f"CHECK ONLY, nothing written. {HTML} would go {before} -> {len(src)} bytes ({len(src)-before:+d})")
    sys.exit(0)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"catchment patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
