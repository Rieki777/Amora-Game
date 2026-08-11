#!/usr/bin/env python3
"""The floor is the seal's own width, and it is measured, not reasoned.

The map lane proposed a 22 px floor, deriving it as half the 44 px hit
footprint so each catchment is 11: "the seal's own radius". The derivation is
right and the number is stale by one round. `patch_e2_ring` took seals from
22 px to 28, so the ink radius is 14 and a 22 px floor leaves a catchment of
11: three pixels of ink at the outer edge of every crowded mark still resolve
to the neighbour. Much smaller than the 6.5 px it replaced, and still not the
rule we meant.

The self-consistent floor is the seal's WIDTH, 28, so catchment 14 covers the
ink exactly.

RAISING THE CONSTANT ALONE MAKES IT WORSE. Measured in `qa/_probe_floor.js`,
re-running the same greedy solver against different floors:

  steps [0,+-9,+-18,+-27]           floor 22 -> min 23.1   (4 rings turned)
                                    floor 26 -> min 24.8   (5)
                                    floor 28 -> min 20.8   (6)   WORSE than 22
                                    floor 32 -> min 20.8   (6)

  steps [0,+-6..+-42]               floor 28 -> min 28.3   (6)   <- meets it
                                    floor 32 -> min 24.5   (6)
                                    floor 36 -> min 24.5   (6)

That is the greedy pathology, and it is the useful part of this patch. A ring
stops searching at the first rotation clearing the floor, so a HIGHER floor
makes an early ring keep hunting past a rotation that was good for everyone and
settle somewhere that costs a later ring more than it gained. Asking for more
returns less. The fix is finer and wider steps, not a bigger number.

So: floor 28, and rotations every 6 degrees out to 42 rather than every 9 out
to 27. Six rings of nineteen turn at all. The cost is that a turned ring can
sit up to 42 degrees off its printed slot, which is real: adjacent slots are
about 50 degrees apart, so a heavily turned mark approaches where a different
kind would sit on an unturned ring. Correctness wins that argument, because the
failure it prevents is opening the WRONG DOOR and the failure it causes is
looking in a slightly unfamiliar place. Only the crowded rings pay it.

Do not raise the floor past 28 without re-running `qa/_probe_floor.js`. The
numbers above are the reason.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable PER STEP.
Usage: python3 patch_e11_floor.py [grounds-v0.html] [--check]
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


step(
    "the measured floor",
    """const MARK_FLOOR=22;
/* The only thing a crowded ring gives up. The radius never changes, so a mark
   never leaves its building; the whole ring turns at once, so every kind keeps
   its seat relative to the others. */
const RING_ROT=[0,9,-9,18,-18,27,-27];""",
    """/* The seal's WIDTH, so the catchment is 14 and covers the ink exactly. It is
   28 because `.bseal` is 28; if the seal is ever resized, this moves with it.
   Do NOT raise it without re-running qa/_probe_floor.js: the solver is greedy
   and a higher floor measured WORSE (floor 28 reached 20.8 on the old narrow
   steps, against 23.1 for floor 22). Asking for more returned less. */
const MARK_FLOOR=28;
/* The only thing a crowded ring gives up. The radius never changes, so a mark
   never leaves its building; the whole ring turns at once, so every kind keeps
   its seat relative to the others. Finer and wider than the first attempt,
   which is what actually bought the floor: same solver, same land, min 20.8
   on nine-degree steps and 28.3 on these. */
const RING_ROT=[0,6,-6,12,-12,18,-18,24,-24,30,-30,36,-36,42,-42];""",
    "MARK_FLOOR=28",
)

if CHECK:
    print(f"CHECK ONLY, nothing written. {HTML} would go {before} -> {len(src)} bytes ({len(src)-before:+d})")
    sys.exit(0)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"floor patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
