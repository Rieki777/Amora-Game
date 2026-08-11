#!/usr/bin/env python3
"""A building's marks belong to that building.

THE COMPLAINT, from a phone: "The icon surrounding a Sprite when I click on it
and they fanned out all over the place. They need to really fit out attached to
the current Sprite and not get pushed back by the boundaries of other sprites,
they can overlap them if needed."

Two separate causes, and the instruction settles both.

ONE. The ring stood further out on tap. `R: fan ? Math.max(R0*1.35, 52) : R0`
threw the marks to at least 52 px and half again their radius the moment a
reader opened one, which is exactly the "fanned out all over the place" being
reported. The intent was to give hidden marks somewhere to go. They already
have somewhere: a fanned seal grows 18% in CSS, which is how a tap says "this
one", and it says it without moving the marks off the roof.

TWO, and this is the real one. There were three passes here that measured
every mark against every OTHER building's marks and collapsed whichever ring
lost the argument. So a building's marks were placed by its neighbours. Tap a
sprite in a dense hamlet and its ring answered to the land around it rather
than to the sprite under your thumb, and on a phone every hamlet is dense.
That whole solver is gone.

WHAT STAYS, and why it is not the same thing. A ring is still solved against
ITSELF: BADGE_GAP is a 44 px tap target, and two of those overlapping means the
neighbouring seal answers your tap. Measured at 26 px, the wrong seal won two
of every thirty-six. That is a correctness rule about which door opens, not a
tidiness rule about how the land looks, which is why it survives an instruction
that overlapping is fine. The intrinsic collapse stays for the same reason: a
building too small to carry its own ring without flinging it wide still shows
one counted seal that fans on tap.

Marks may now overlap a neighbour's sprite and a neighbour's marks. That is the
instruction, taken literally.

ALSO HERE, because it is the same plane and the same complaint: the seals are
bigger. 22 px to 28 near, and the mid-zoom variant 16 px to 22, which is the
size a thumb actually meets on a phone. The ART is a separate round; this is
only the size.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable PER STEP, so a partly-applied file finishes rather than aborting.
Usage: python3 patch_e2_ring.py [grounds-v0.html] [--check]
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


# ------------------------------------------------------- 1. a tap does not throw
step(
    "the fan stays home",
    """    /* A ring the reader opened on purpose stays open, and stands a little
       further out so the marks it was hiding have somewhere to be. */
    const fan=(bg._fan||0)>performance.now(),R0=Math.max(off,need,20);
    groups.push({bg,kinds,off,R:fan?Math.max(R0*1.35,52):R0,""",
    """    /* A ring the reader opened on purpose stays open. It does NOT stand
       further out to do it: the marks belong to this building, and throwing
       them into the neighbours' air on tap was the complaint. A fanned seal
       already grows 18% in CSS, which is how a tap says "this one". */
    const fan=(bg._fan||0)>performance.now();
    groups.push({bg,kinds,off,R:Math.max(off,need,20),""",
    "which is how a tap says",
)

# ------------------------------------------- 2. neighbours stop placing each other
step(
    "rings stop fighting",
    """  /* Each pass collapses the rings that are fighting and looks again. A
     collapsed ring is one mark instead of four, so the land only ever gets
     quieter and three passes are enough to settle it. */
  for(let pass=0;pass<3;pass++){
    const pts=[];
    for(const g of groups){
      if(g.cluster){pts.push({g,x:g.cx-0.82*CR(g),y:g.cy+0.57*CR(g)});continue}
      for(const k of g.kinds){const a=(BADGE_SLOT[k]!==undefined?BADGE_SLOT[k]:215)*Math.PI/180;
        pts.push({g,x:g.cx+Math.cos(a)*g.R,y:g.cy-Math.sin(a)*g.R})}
    }
    let hit=false;
    for(let i=0;i<pts.length;i++)for(let j=i+1;j<pts.length;j++){
      if(pts[i].g===pts[j].g)continue;
      if(Math.hypot(pts[i].x-pts[j].x,pts[i].y-pts[j].y)>=BADGE_GAP)continue;
      const a=pts[i].g,b=pts[j].g;if(a.cluster&&b.cluster)continue;
      hit=true;
      /* The busier ring reaches further, so it gives way first. On a tie the
         building further up the hill yields, because the one nearer the
         reader is the one they are looking at. */
      let give;
      if(a.pin&&b.pin)continue; // both opened by hand; the reader gets to see both
      if(a.pin)give=b; else if(b.pin)give=a;
      else if(a.cluster)give=b; else if(b.cluster)give=a;
      else if(a.kinds.length!==b.kinds.length)give=a.kinds.length>b.kinds.length?a:b;
      else give=a.cy<b.cy?a:b;
      give.cluster=true;
    }
    if(!hit)break;
  }
""",
    """  /* A RING IS SOLVED AGAINST ONE BUILDING: ITS OWN.
     Three passes used to sit here measuring every mark against every other
     building's marks and collapsing whichever ring lost, which meant a
     building's marks were placed by its neighbours. Tap a sprite in a dense
     hamlet and the ring answered to the land around it rather than to the
     sprite under the thumb. Marks may now overlap a neighbour's sprite and a
     neighbour's marks, which is the instruction taken literally.

     Two rules survive it, and neither is about tidiness. The ring is still
     spaced against ITSELF, because BADGE_GAP is a 44 px tap target and two
     overlapping targets mean the wrong seal answers the tap: at 26 px the
     wrong one won two of every thirty-six. And a building too small to carry
     its own ring still collapses to one counted seal that fans on tap, which
     is `cluster` above, decided by this building's own geometry alone. */
""",
    "A RING IS SOLVED AGAINST ONE BUILDING",
)

# ------------------------------------------------------------- 3. a thumb-sized seal
step(
    "bigger seals",
    """  .bseal{position:absolute;width:22px;height:22px;margin:-11px 0 0 -11px;pointer-events:auto;
    cursor:pointer;transition:opacity .2s ease,transform .18s ease}
  .bmid .bseal{width:16px;height:16px;margin:-8px 0 0 -8px}""",
    """  /* Sized for a thumb, not a cursor. The 44 px HIT footprint the ring is
     solved for has not moved; this is the ink catching up to it. */
  .bseal{position:absolute;width:28px;height:28px;margin:-14px 0 0 -14px;pointer-events:auto;
    cursor:pointer;transition:opacity .2s ease,transform .18s ease}
  .bmid .bseal{width:22px;height:22px;margin:-11px 0 0 -11px}""",
    "Sized for a thumb, not a cursor",
)

if CHECK:
    print(f"CHECK ONLY, nothing written. {HTML} would go {before} -> {len(src)} bytes ({len(src)-before:+d})")
    sys.exit(0)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"ring patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
