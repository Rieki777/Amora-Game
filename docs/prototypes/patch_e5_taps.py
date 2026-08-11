#!/usr/bin/env python3
"""When marks overlap, the nearest centre wins the tap.

THIS IS THE BILL FOR patch_e2_ring, AND IT COMES DUE IMMEDIATELY.

Rings hug their own building now and may cross a neighbour's, which is what
was asked for. The cost, left alone, is that the topmost element under a thumb
stops being the mark the thumb was aimed at. Measured on the land right after
the ring change: two marks in thirty-four answered a NEIGHBOUR's door. The
gate that caught it is the same one that caught this class of error the first
time, at 26 px, when the wrong seal won two of every thirty-six.

The old defence against it was spatial: keep every 44 px hit target clear of
every other, across the whole land, by moving rings apart. That is precisely
the behaviour the instruction removed, so the defence has to move from the
LAYOUT to the RESOLUTION. It is the better place for it anyway. The browser
stacks by paint order and has no idea what a person meant; distance does. A
thumb that lands between two marks means the closer one, always, whichever
happens to be painted on top.

So the plane re-aims. One delegated listener already resolved a tap to a seal
with `e.target.closest('.bseal')`; it now takes that answer only when no
visible seal centre is nearer to the point. Nothing else changes: the same
seal, the same handler, the same doors.

WHY NOT z-INDEX. Ordering the groups by depth makes the overlap deterministic
and still leaves a mark whose centre is covered unreachable, because the thing
on top would keep the whole 44 px. Stacking answers "which is in front", and
the question here is "which did they mean".

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable PER STEP, so a partly-applied file finishes rather than aborting.
Usage: python3 patch_e5_taps.py [grounds-v0.html] [--check]
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


# The BADGE_TAB line pins this to the SEAL listener. There are two click
# listeners on #badges and the other one handles the far seal and the home
# chip, so `$('badges').addEventListener` alone would match twice and abort.
step(
    "the nearest centre wins",
    """const BADGE_TAB={quest:1,invite:1,seat:2,talk:0,event:0,more:0};
$('badges').addEventListener('click',e=>{
  const seal=e.target.closest('.bseal');if(!seal)return;
  e.stopPropagation();""",
    """const BADGE_TAB={quest:1,invite:1,seat:2,talk:0,event:0,more:0};
/* The visible mark whose centre is closest to a point, within a thumb of it.
   Marks may overlap since rings stopped moving each other apart, so the plane
   resolves a tap by DISTANCE rather than by paint order: the browser knows
   which mark is in front, and only distance knows which one was meant. */
function nearestSeal(x,y){
  let best=null,bd=1e9;
  for(const s of document.querySelectorAll('#badges .bgroup.on .bseal,#badges .bgroup.far .bseal')){
    if(getComputedStyle(s).display==='none')continue;
    const r=s.getBoundingClientRect();if(!r.width)continue;
    const d=Math.hypot(x-(r.x+r.width/2),y-(r.y+r.height/2));
    if(d<bd){bd=d;best=s}}
  return bd<=30?best:null}
window.nearestSeal=nearestSeal;
$('badges').addEventListener('click',e=>{
  let seal=e.target.closest('.bseal');if(!seal)return;
  /* The element the browser picked is right unless another mark's centre is
     nearer to the point, which is what an overlap means. */
  seal=nearestSeal(e.clientX,e.clientY)||seal;
  e.stopPropagation();""",
    "function nearestSeal",
)

if CHECK:
    print(f"CHECK ONLY, nothing written. {HTML} would go {before} -> {len(src)} bytes ({len(src)-before:+d})")
    sys.exit(0)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"taps patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
