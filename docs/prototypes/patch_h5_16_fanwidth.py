# -*- coding: utf-8 -*-
"""L5/16: the fan stops stacking on itself when a building carries four roles.

Patch 15 sent the three Wisdom roles back to the council fire, where they are
addressed, so the council fire went from one satellite to four - and G3 went
red: two of them overlapped by 0.21 units.

WHY THE OUTER PAIR, AND WHY IT WAS INVISIBLE UNTIL NOW.

The fan spaces roles by EQUAL ANGLES and they are read as HORIZONTAL DISTANCE,
and cos is flattest at the ends of an arc. Once patch 12's floor clamps the
points onto the ground line under a building - which is every point at the
council fire at cam.z 0.9, where the sprite is deepest in scene units - the
whole fan becomes a row, and the tightest gap in that row is always the OUTER
pair. Measured, council fire, halo radius 32.19, four roles, spread 1.86:

    outer pair    32.19 * (sin 0.93 - sin 0.31) = 15.98 units
    inner pair    32.19 * (sin 0.31 + sin 0.31) = 19.65 units
    two satellites need                            16.20 units

Three roles never reached it because three roles have no outer-but-one, and no
building carried four until the addresses were put right.

THE FIX IS TO WIDEN, WHICH IS COUNTER-INTUITIVE AND MEASURED. The end pair's
horizontal gap is R*(sin h - sin(h - 2h/(n-1))) with h the fan's half-angle,
and that is INCREASING in h: at h 0.93 it is 15.98 and at h 1.30 it is 17.50.
So the loop opens the fan until the tightest pair clears, in steps, and stops.

THE CAP IS 2.9 AND IT IS A CORRECTNESS BOUND, NOT A TASTE ONE. Every satellite
must stay below the anchor line, which is sin(a) > 0 for the whole arc, which
is a half-angle under pi/2. 2.9/2 = 1.45. The old cap of 2.6 was documented as
"15 to 165 degrees, which stays in the lower half" and this keeps that promise
with 8 degrees to spare. Nothing reaches further sideways than R either way,
so the halo is still the bound on where a satellite can go and no satellite can
walk into a neighbour's circle.

    python patch_h5_16_fanwidth.py

Proved by qa/verify_org_ground.js G3, which was watched red at -0.21 before this
was written and measures every pair at every building over five zooms.
"""
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'grounds-v0.html')

src = io.open(TARGET, encoding='utf-8', newline='').read()
start_bytes = len(src.encode('utf-8'))
applied = 0
skipped = 0


def swap(name, old, new, count=1, mark=None):
    global src, applied, skipped
    if (mark or new) in src:
        print('  skip   %s' % name)
        skipped += 1
        return
    n = src.count(old)
    assert n == count, 'anchor for %s appears %d times, expected %d' % (name, n, count)
    src = src.replace(old, new, count)
    print('  apply  %s' % name)
    applied += 1


OLD = (
    "       below is the only arc never covered. The 2.6 cap holds even the widest\n"
    "       fan inside 15 to 165 degrees, which stays in the lower half. */\n"
    "    const spread=Math.min(2.6,0.62*Math.max(1,n-1));\n"
)
NEW = (
    "       below is the only arc never covered. The cap holds even the widest fan\n"
    "       inside 11 to 169 degrees, which stays in the lower half - and that is\n"
    "       a correctness bound, because sin(a) > 0 over the whole arc is what\n"
    "       puts every satellite below the anchor line for the floor to catch. */\n"
    "    let spread=Math.min(2.6,0.62*Math.max(1,n-1));\n"
    "    /* ...AND THE FAN MAY NOT STACK ON ITSELF. Equal angles are not equal\n"
    "       distances: cos is flattest at the ends of an arc, so once the floor\n"
    "       above lays the fan out along the ground line the OUTER pair is always\n"
    "       the tightest. Four roles at the council fire came to 15.98 units where\n"
    "       two satellites need 16.2, and three roles never reached it because\n"
    "       three roles have no outer-but-one. Widening helps, which is worth\n"
    "       saying because it does not read that way: the end gap is\n"
    "       R*(sin h - sin(h-2h/(n-1))) and that rises with h over the range that\n"
    "       matters, 15.98 at h=0.93 to 17.50 at h=1.30. Horizontal distance is\n"
    "       the worst case of the two, since a point still on the arc has its\n"
    "       vertical separation as well.\n"
    "       WIDEST WINS IF NOTHING CLEARS, because the gap is not monotone all\n"
    "       the way out: for four roles it peaks near a half-angle of 1.35 and\n"
    "       falls again by the 1.45 cap, so a loop that simply widened until it\n"
    "       ran out would hand back a fan NARROWER at the ends than one it had\n"
    "       already walked past. It sweeps and keeps the best, and stops early at\n"
    "       the first width that clears - which on this land is 2.05, well before\n"
    "       the peak. A building crowded past what any width can hold still goes\n"
    "       red at G3 rather than silently taking the last value tried. */\n"
    "    if(n>1){const need=2*ROLE_SAT_RIM+0.4;let best=spread,bestGap=-1;\n"
    "      for(let w=spread;w<=2.901;w+=0.05){\n"
    "        const h=w/2,gap=R*(Math.sin(h)-Math.sin(h-w/(n-1)));\n"
    "        if(gap>bestGap){bestGap=gap;best=w}\n"
    "        if(gap>=need)break}\n"
    "      spread=best}\n"
)
swap('1/1 the fan opens until its tightest pair clears', OLD, NEW,
     mark="    if(n>1){const need=2*ROLE_SAT_RIM+0.4;let best=spread,bestGap=-1;\n")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
