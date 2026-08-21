# -*- coding: utf-8 -*-
"""L5/12: a satellite never lands on the building it belongs to.

THE DEFECT, AND IT IS MINE TWICE.

My first cut drew the satellites inside the sprite. I fixed it with

    const ROLE_SAT_R=30;   // "the sprite boxes at the ten curated homes
                           //  measure 20.1 to 28.9 scene units of half-extent"

and then wrote a lens that never uses it for a building that HAS a halo. Those
take `h.r`, and `h.r` is the output of the no-overlap solver, which is free to
go all the way down to ROLE_HALO_MIN=18. So the constant guards the four homeless
buildings and nothing else, and the review found the three Community Center
satellites painted on the roof.

The 20.1-to-28.9 measurement was also taken in the wrong icon mode. Measured off
the live DOM at cam.z 2.0, iconMode 'painted', in SCENE units below the anchor:

    home          halo r   halfW   foot     on the ring?
    community      29.11    43.0   31.6     no  (-2.5 before the rim is added)
    library        29.11    36.7   28.0     no
    council        32.19    39.8   22.0     yes, by 10
    greenhouse     33.03    39.6   28.5     yes, by 4.5
    kitchen        32.19    35.3   25.9     yes, by 6.3
    welcome        41.03    37.5   25.9     yes
    market/ridgeA/sanctuary/gate  41-46  21-26  21-26   yes, comfortably

`halfW` is the sprite's half-width and `foot` is how far it reaches BELOW the
anchor, which is the number that matters because the fan points down. The
painted sprites are far bigger than the flat boxes I measured: 31.6 against
28.9, and 43.0 of half-width against the 28.9 I wrote down.

WHY THE Z-ORDER FIX WAS NOT THE WHOLE FIX. Patch 11 gave the lens its own plane
above #icons, and the composited page then changed at 91-100% of the pixels in a
15x15 px box at every satellite the recon walked - fourteen of the sixteen, the
two at the tank being missed because that recon iterated roleHomes() and the
tank is not a circle home - against three at 0-47% before. (The suite that
replaced that recon scores the mark's own rim rather than a box, for a reason
patch 13 explains, so its numbers are not comparable to these.) They were
VISIBLE. They were still in the wrong place: the screenshot shows them sitting
in the row of badge seals across the Community Center's roof, the same size and
the same dark keyline, reading as two more seals rather than as the roles of a
circle.

THE FIX, AND WHY IT IS A FLOOR AND NOT A BIGGER RADIUS.

Pushing the ring out until it clears the sprite cannot work on this land. The
Community Center's sprite is 43 units of half-width and the Library's is 36.7,
and they stand 58 apart: the SPRITES already overlap, so a radius that clears
one lands inside the other's halo and the satellite would read as the Library's
role. Raising ROLE_HALO_MIN breaks the no-overlap proof outright.

So the ring stays exactly where it is and the satellite POINT gets a floor:

    py = max(s.y + R*sin(a), s.y + foot + ROLE_SAT_RIM)

Every point that already cleared the sprite is untouched - the geometry the
review signed off does not move a pixel where it was already right - and the
crowded ones run along the ground line beneath their own building instead of
across its roof. Which points those are depends on the zoom, because the
sprite's size in scene units does (k/cam.z runs 1.06 at cam.z .5 down to 0.47
at 3), so it is not a fixed list of buildings and this patch does not claim one.
`px` is untouched either way, so nothing reaches further sideways than the halo
already did and no satellite can migrate into a neighbour's circle.

WHERE `foot` COMES FROM, AND WHY IT IS NOT A CONSTANT.

It is published by syncBanners, from the same `sc` / `psc` / `k` it writes into
the sprite's own transform on the same line. That is the point: a constant is a
copy, and this file's whole history of silent zeros is copies drifting from the
thing they copied. The CSS says the box:

    .poi{width:52px;height:52px;margin:-26px 0 0 -26px}      -> 26 below the anchor
    .poi .sprite{bottom:-4px;height:76px}                     -> 30 below the anchor

and syncBanners already scales that box by `k*1.35*sc` for a painted or iso
sprite and `k*psc` for a flat one. Checked against the DOM at cam.z 2.0: the
model gives sc=1.22 for community (FAM_SCALE.bighall is 1.22), 0.95 for market
(FAM_SCALE.market is .95), 1.05 for ridgeA and 1.00 for sanctuary. Exact at
four of four, so this is the sprite's real box and not an estimate of it.

Stored in SCENE units, not screen pixels like `_crownOff`, because the lens
draws in scene units and the ratio k/cam.z is not constant across zooms
(0.78 at cam.z 1, 0.64 at 2, 0.47 at 3). Converting at write time keeps the
numerator and the denominator inside the same frame.

ONE FRAME STALE, ON PURPOSE. syncBanners runs at the end of frame() and the
lens near the middle, so the lens reads the value the previous frame stored.
The alternative is a second copy of the scale arithmetic inside the lens, which
is the drift this patch exists to prevent. Absent entirely - the very first
frame - the floor collapses to the anchor and the satellites sit on the ring,
which is the behaviour of the last eleven patches.

    python patch_h5_12_footline.py

Proved by qa/verify_org_ground.js, which measures the sprite's rect off the DOM
and the satellite's point out of ROLE_LAST_SATS - two independent sources - and
by the composited-page check in the same suite.
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
    """One edit, one guard. The guard is a sentinel a later patch will not
    touch; an anchor matching anything but `count` aborts before a byte moves."""
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


# ---- 1/3 the sprite says how far down it reaches, once, where it is scaled ----
OLD = (
    "      s._crownOff=(painted?k*1.35*sc*54:(iso?k*1.35*sc*34:k*30*psc))+6;\n"
)
NEW = (
    "      s._crownOff=(painted?k*1.35*sc*54:(iso?k*1.35*sc*34:k*30*psc))+6;\n"
    "      /* HOW FAR THIS SPRITE REACHES BELOW ITS ANCHOR, in SCENE units, for\n"
    "         anything that has to draw on the ground under it. From the CSS box\n"
    "         and THIS line's own scale factors, so a sprite that changes size\n"
    "         cannot leave the number behind: .poi is 52px with margin -26, so\n"
    "         its own box ends 26 below the anchor, and .sprite is bottom:-4 on\n"
    "         top of that, so a painted one ends at 30. Scene units and not\n"
    "         screen pixels like _crownOff above, because k/cam.z is not\n"
    "         constant across the zoom range and the reader is the lens, which\n"
    "         draws in scene space. */\n"
    "      s._footU=(painted?k*1.35*sc*30:(iso?k*1.35*sc*26:k*psc*26))/cam.z;\n"
)
swap('1/4 the sprite publishes its own foot', OLD, NEW, mark='      s._footU=(painted?')

# ---- 2/3 the satellite's outer edge, named once ----
OLD = (
    "const ROLE_SAT_R=30;\n"
)
NEW = (
    "const ROLE_SAT_R=30;\n"
    "/* The satellite's OUTER edge, which is not its arc: roleSat strokes a 2.6\n"
    "   keyline on a 5.8 circle, so the ink stops at 5.8+1.3. Every clearance in\n"
    "   this file is measured against this and not against the 5 the coloured rim\n"
    "   uses, because the keyline is the part that has to sit on clear ground. */\n"
    "const ROLE_SAT_RIM=7.1;\n"
)
# The guard drops the VALUE: patch 13 replaces 7.1 with the 8.06 the ink
# actually measures, and a guard carrying the number stopped matching, so this
# patch re-applied on a replay and declared ROLE_SAT_RIM twice.
swap('2/4 the satellite names its outer edge', OLD, NEW, mark='const ROLE_SAT_RIM=')

# ---- 3/4 the floor itself ----
OLD = (
    "    const h=byHome[k],R=h?h.r:ROLE_SAT_R;\n"
)
NEW = (
    "    const h=byHome[k],R=h?h.r:ROLE_SAT_R;\n"
    "    /* ...AND NEVER ON THE BUILDING. A ring is a circle around an anchor and\n"
    "       a sprite is a tall box standing on it, so at the crowded homes the\n"
    "       ring is INSIDE the sprite: the no-overlap solver takes the Community\n"
    "       Center's ring to 29.1 while its sprite reaches 31.6 below the same\n"
    "       anchor. Three satellites landed on the roof among the seals.\n"
    "       A FLOOR, NOT A BIGGER RADIUS. Community's sprite is 43 of half-width\n"
    "       and Library's is 36.7 and they stand 58 apart, so the sprites already\n"
    "       overlap and any radius that clears one lands inside the other's halo.\n"
    "       This leaves px alone - nothing reaches further sideways than the halo\n"
    "       already did - and drops only the points that would have been covered. */\n"
    "    const floorY=s.y+(s._footU||0)+ROLE_SAT_RIM;\n"
)
swap('3/4 the ground line under each building', OLD, NEW,
     mark='    const floorY=s.y+(s._footU||0)+ROLE_SAT_RIM;\n')

OLD = (
    "      const st=roleState(x),px=s.x+R*Math.cos(a),py=s.y+R*Math.sin(a);\n"
)
NEW = (
    "      const st=roleState(x),px=s.x+R*Math.cos(a),py=Math.max(s.y+R*Math.sin(a),floorY);\n"
)
swap('3b/4 and the point that obeys it', OLD, NEW,
     mark='py=Math.max(s.y+R*Math.sin(a),floorY);')

# ---- 4/4 a copy does not inherit the original's foot ----
# `duplicateStructure` spreads the source object and then deletes `_crownOff`,
# for exactly this reason: both fields are per-frame scratch that syncBanners
# owns, and a copy carrying the original's is wrong until the next frame
# rewrites it. With the org lens on, that is one frame of a satellite sitting
# at the wrong depth on a building the reader is in the middle of placing.
OLD = (
    "  delete c._crownOff;\n"
)
NEW = (
    "  delete c._crownOff;delete c._footU;\n"
)
swap('4/4 a duplicate does not inherit the foot either', OLD, NEW,
     mark='delete c._crownOff;delete c._footU;')


if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
