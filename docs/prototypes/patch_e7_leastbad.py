#!/usr/bin/env python3
"""A plate that must draw picks the least bad spot, not the first one.

patch_e6_districts gave district plates the right to fall back to their own
anchor rather than go silent, because at the far zoom they are the only words
on the land. It fell back to the RAW anchor, which is a spot chosen without
looking at anything, and the gate said so at once:

  D2 A2: district plates clear the marks and each other at every far zoom
         pp 0, pm 6 / 4 / 3 / 2 / 4

No plate landed on another plate, and six landed on MARKS. A mark is a door.
Covering one with a name that had twelve other places it could have stood is
the worst of the three outcomes, and it happened because "first clear spot, or
else the anchor" has no way to express "none of these is clear, but that one is
clearly better".

So placement is SCORED rather than filtered. Every offset in the table is
priced, the first free one still wins immediately, and a caller that must draw
something takes the cheapest instead of the rawest:

    a mark covered      8 each   a door, and the reason the marks won all along
    another plate       4 each   two names on top of each other, unreadable
    a neighbour's icon  2 each   ugly, costs no function

Weighted, not counted, so a spot that covers one mark loses to a spot that
overlaps two plates: the ordering the map has always used, now written down
where it can be read. Building names and place-names are unaffected. They keep
the right to go quiet, which is still the honest answer when a name cannot sit
on the thing it names.

marksHit counts instead of announcing, so "how bad" is answerable. Zero is
still falsy, so every existing truth test reads the same.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable PER STEP, so a partly-applied file finishes rather than aborting.
Usage: python3 patch_e7_leastbad.py [grounds-v0.html] [--check]
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


# ------------------------------------------------------- 1. how many, not whether
step(
    "marks are counted",
    """/* A mark is a door and a plate is a name, so the mark still wins. */
function marksHit(x,y,w,h){const P=window.BADGE_PTS||[];
  for(let i=0;i<P.length;i++){const p=P[i];
    if(Math.abs(x-p.x)*2<w+34&&Math.abs(y-p.y)<h+18)return true}
  return false}""",
    """/* HOW MANY marks a plate laid here would cover. A mark is a door and a
   plate is a name, so the mark still wins; counting rather than announcing is
   what lets a plate that MUST draw pick the cheapest spot instead of the
   first one. Zero is falsy, so a plain truth test reads exactly as before. */
function marksHit(x,y,w,h){const P=window.BADGE_PTS||[];let n=0;
  for(let i=0;i<P.length;i++){const p=P[i];
    if(Math.abs(x-p.x)*2<w+34&&Math.abs(y-p.y)<h+18)n++}
  return n}""",
    "HOW MANY marks a plate",
)

# ------------------------------------------------------------ 2. scored placement
step(
    "the least bad spot",
    """function platePlace(ax,ay,w,h,others,avoidMarks,icons,selfKey,table){
  const T=table||PLATE_LEASH;
  for(let i=0;i<T.length;i++){
    const x=ax+T[i][0],y=ay+T[i][1];
    if(y<26)continue; // the vitals bar owns the top of the screen
    let clear=true;
    for(let n=0;n<others.length&&clear;n++){const o=others[n];
      if(Math.abs(x-o.x)*2<(w+o.w)+12&&Math.abs(y-o.y)<h+6)clear=false}
    if(clear&&icons)for(let n=0;n<icons.length&&clear;n++){const ic=icons[n];
      if(ic.k!==selfKey&&Math.abs(x-ic.x)*2<w+44&&Math.abs(y-ic.y)<27)clear=false}
    if(clear&&avoidMarks&&marksHit(x,y,w,h))clear=false;
    if(clear)return{x,y}}
  return null}""",
    """/* Every offset is priced and the first free one still wins outright. A
   caller that passes `mustDraw` takes the cheapest instead of nothing, which
   is right for a name that is the only word on the screen and wrong for one
   that has a building to sit on. The weights ARE the priority order the map
   has always used, written where it can be read: a covered door costs most, a
   covered name next, a scuffed icon least. */
const PLATE_COST={mark:8,plate:4,icon:2};
function platePlace(ax,ay,w,h,others,avoidMarks,icons,selfKey,table,mustDraw){
  const T=table||PLATE_LEASH;
  let best=null,bestCost=Infinity;
  for(let i=0;i<T.length;i++){
    const x=ax+T[i][0],y=ay+T[i][1];
    if(y<26)continue; // the vitals bar owns the top of the screen
    let cost=0;
    for(let n=0;n<others.length;n++){const o=others[n];
      if(Math.abs(x-o.x)*2<(w+o.w)+12&&Math.abs(y-o.y)<h+6)cost+=PLATE_COST.plate}
    if(icons)for(let n=0;n<icons.length;n++){const ic=icons[n];
      if(ic.k!==selfKey&&Math.abs(x-ic.x)*2<w+44&&Math.abs(y-ic.y)<27)cost+=PLATE_COST.icon}
    if(avoidMarks)cost+=PLATE_COST.mark*marksHit(x,y,w,h);
    if(cost===0)return{x,y};
    if(cost<bestCost){bestCost=cost;best={x,y}}}
  return mustDraw?best:null}""",
    "PLATE_COST",
)

# --------------------------------------------- 3. the district asks for that spot
step(
    "a district asks for the cheapest",
    """    /* Its own anchor is the last resort, not silence: at this zoom the
       district names are the only words on the land. */
    const spot=platePlace(sx/DPR,sy/DPR,dw,dh,placedD,true,null,null,DISTRICT_LEASH)
      ||{x:sx/DPR,y:Math.max(sy/DPR,26)};""",
    """    /* Never silent at this zoom, because the district names are the only
       words on the land, so it takes the cheapest spot in its table rather
       than the raw anchor, which used to park it on top of a door. */
    const spot=platePlace(sx/DPR,sy/DPR,dw,dh,placedD,true,null,null,DISTRICT_LEASH,true)
      ||{x:sx/DPR,y:Math.max(sy/DPR,26)};""",
    "DISTRICT_LEASH,true)",
)

if CHECK:
    print(f"CHECK ONLY, nothing written. {HTML} would go {before} -> {len(src)} bytes ({len(src)-before:+d})")
    sys.exit(0)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"least-bad placement patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
