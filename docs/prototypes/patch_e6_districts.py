#!/usr/bin/env python3
"""A district names a region, so it gets more rope than a building name.

patch_e1_plates gave every plate the same short leash and the same last
resort: if no offset near the anchor is clear, do not draw. That is right for
a BUILDING name, which is only a name while it is touching its roof, and the
counts it used to carry moved to the seal and the home chip long ago.

It is wrong for a DISTRICT, for two reasons the gate found immediately:

  D1.3  at the phone floor the land is 332 px wide and the district plates
        stand back (0 shown, 5 once there is room)

A district plate names an AREA, not a roof. There is no sprite it has to touch,
so a few dozen pixels of drift costs almost nothing in meaning. And district
plates only draw when the camera is pulled BACK, which is exactly when every
building name is hidden: at that zoom they are the only wayfinding on the
screen. A building name that cannot be placed honestly is better gone. A
district name that cannot be placed is still the only word out there.

So districts get their own table, wider and with more places to try, and they
fall back to their own anchor rather than to silence. Overlapping another
plate at the far zoom is a smaller harm than a map with no words on it.

Place-names keep the short leash and keep the right to go quiet: they are
decoration for a coastline, and there are always more of them than the eye
wants.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable PER STEP, so a partly-applied file finishes rather than aborting.
Usage: python3 patch_e6_districts.py [grounds-v0.html] [--check]
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


# --------------------------------------------------------- 1. the wider table
step(
    "a district's own leash",
    """const PLATE_LEASH=[[0,0],[0,-14],[0,13],[-40,-4],[40,-4],[0,-28],[-54,11],[54,11]];""",
    """const PLATE_LEASH=[[0,0],[0,-14],[0,13],[-40,-4],[40,-4],[0,-28],[-54,11],[54,11]];
/* A district names an AREA, not a roof, so drift costs it far less meaning
   than it costs a building name, and it only draws when the camera is pulled
   back, which is exactly when it is the only wayfinding on the screen. Wider,
   with more places to try, and it never gives up its spot entirely. */
const DISTRICT_LEASH=[[0,0],[0,-18],[0,17],[-62,-6],[62,-6],[0,-34],[0,32],
  [-88,14],[88,14],[-62,-32],[62,-32],[0,48],[0,-50]];""",
    "DISTRICT_LEASH",
)

# ------------------------------------------- 2. platePlace takes a table to use
step(
    "platePlace takes a table",
    """function platePlace(ax,ay,w,h,others,avoidMarks,icons,selfKey){
  for(let i=0;i<PLATE_LEASH.length;i++){
    const x=ax+PLATE_LEASH[i][0],y=ay+PLATE_LEASH[i][1];""",
    """function platePlace(ax,ay,w,h,others,avoidMarks,icons,selfKey,table){
  const T=table||PLATE_LEASH;
  for(let i=0;i<T.length;i++){
    const x=ax+T[i][0],y=ay+T[i][1];""",
    "const T=table||PLATE_LEASH",
)

# ---------------------------------------- 3. a district falls back to its anchor
step(
    "a district keeps its name",
    """    const spot=platePlace(sx/DPR,sy/DPR,dw,dh,placedD,true);
    if(!spot){el.style.display='none';continue}
    el.style.left=spot.x+'px';el.style.top=spot.y+'px';placedD.push({x:spot.x,y:spot.y,w:dw})}""",
    """    /* Its own anchor is the last resort, not silence: at this zoom the
       district names are the only words on the land. */
    const spot=platePlace(sx/DPR,sy/DPR,dw,dh,placedD,true,null,null,DISTRICT_LEASH)
      ||{x:sx/DPR,y:Math.max(sy/DPR,26)};
    el.style.left=spot.x+'px';el.style.top=spot.y+'px';placedD.push({x:spot.x,y:spot.y,w:dw})}""",
    "DISTRICT_LEASH)",
)

if CHECK:
    print(f"CHECK ONLY, nothing written. {HTML} would go {before} -> {len(src)} bytes ({len(src)-before:+d})")
    sys.exit(0)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"districts patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
