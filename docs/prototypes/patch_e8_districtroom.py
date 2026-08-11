#!/usr/bin/env python3
"""A region name needs more room than the first estimate gave it, and it needs
to be measured against the real boxes rather than a guess at them.

TWO THINGS THE GATE FOUND, in order.

ONE, the table was too small. patch_e6 gave districts thirteen places to stand
and patch_e7 taught them to take the cheapest. Best cost still was not free:

  pm 6 4 3 2 4   ->  pm 2 1 2 1 1   after scoring, and it stops there

Scoring cannot find a clear spot that is not in the table. A district names an
AREA: it has no roof it must touch, so it can stand a long way from its centre
and still be true, and the table now says so. Twenty-one offsets out to 150 px
across and 66 px up, which is still a leash. The thing being prevented is a
plate walking to the top of the screen and joining a column of homeless names,
not a plate standing to one side of the region it names.

TWO, and this is why the first estimate was wrong: the overlap test was not
measuring the boxes the gate measures. `.banner` is `translate(-50%,-100%)`, so
its `left` is the CENTRE and its `top` is the BOTTOM edge, while a mark's
stored point is its centre. The old rule compared a distance from that bottom
edge, which prices a band hanging below the plate that does not exist and
misses part of the plate's own body. It now tests the actual rectangles, the
same intersection the gate does, with two pixels of margin so a plate does not
sit exactly flush against a door.

The lesson is the round's own, again: a value crossed a boundary, this time
from CSS into arithmetic, and the far side had no slot for the transform.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable PER STEP, so a partly-applied file finishes rather than aborting.
Usage: python3 patch_e8_districtroom.py [grounds-v0.html] [--check]
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


# ------------------------------------------------- 1. the boxes, not a guess
# A plate's x is its CENTRE and its y is its BOTTOM edge, because .banner is
# translate(-50%,-100%). A mark's point is its centre and the widest mark drawn
# is a 28 px seal.
step(
    "the real boxes",
    """function marksHit(x,y,w,h){const P=window.BADGE_PTS||[];let n=0;
  for(let i=0;i<P.length;i++){const p=P[i];
    if(Math.abs(x-p.x)*2<w+34&&Math.abs(y-p.y)<h+18)n++}
  return n}""",
    """function marksHit(x,y,w,h){const P=window.BADGE_PTS||[];let n=0;
  /* .banner is translate(-50%,-100%): x is the CENTRE, y is the BOTTOM edge.
     A mark's point is its centre and the widest one drawn is a 28 px seal.
     Rectangles, because that is what an overlap is, plus 2 px so a name does
     not sit flush against a door. */
  const L=x-w/2-2,R=x+w/2+2,T=y-h-2,B=y+2;
  for(let i=0;i<P.length;i++){const p=P[i];
    if(L<p.x+16&&p.x-16<R&&T<p.y+16&&p.y-16<B)n++}
  return n}""",
    "translate(-50%,-100%): x is the CENTRE",
)

# --------------------------------------------------------- 2. room to stand in
step(
    "room for a region name",
    """const DISTRICT_LEASH=[[0,0],[0,-18],[0,17],[-62,-6],[62,-6],[0,-34],[0,32],
  [-88,14],[88,14],[-62,-32],[62,-32],[0,48],[0,-50]];""",
    """const DISTRICT_LEASH=[[0,0],[0,-18],[0,17],[-62,-6],[62,-6],[0,-34],[0,32],
  [-88,14],[88,14],[-62,-32],[62,-32],[0,48],[0,-50],
  [-120,0],[120,0],[-120,-34],[120,-34],[0,-66],[0,64],[-150,20],[150,20]];""",
    "[-150,20],[150,20]",
)

if CHECK:
    print(f"CHECK ONLY, nothing written. {HTML} would go {before} -> {len(src)} bytes ({len(src)-before:+d})")
    sys.exit(0)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"district room patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
