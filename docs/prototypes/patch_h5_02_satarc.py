# -*- coding: utf-8 -*-
"""L5/2: the satellites come out from under the building sprites.

MEASURED, and it is why this patch exists. Patch 01 put each satellite at
`halo.r * 0.66` on a full circle, which is the org chart's geometry moved onto
the land without asking what is standing there. Every building sprite is a DOM
element in `#icons`, ABOVE the scene canvas, and its box is square and centred on
the anchor. Read back in scene units at the ten circle homes:

    community 28.9   library 25.6   ridgeA 24.9   kitchen 23.7   welcome 23.7
    sanctuary 23.7   market  22.5   greenhouse 21.3  gate 20.1   council 20.1

Half-extent 20 to 29, against satellites drawn at 19 to 30. Every one of them
was inside a sprite, and the first screenshot showed exactly that: halos, and no
satellites anywhere.

THE FIX IS THE CHART'S OWN LAW, POINTED AT THE READER.

`buildOrgMap` puts role nodes ON the orbit ring, not inside it (`46*cos(b)`
against a `<circle r="46">`), and fans them across a limited arc rather than the
whole circle, with `spread=min(2.6,0.62*(n-1))`. It fans them OUTWARD from the
village centre because outward is the direction with nothing in it.

On the land that direction is DOWN. A building stands up from its anchor, so the
ground below it is the one arc a sprite never covers, and it is also where the
halo ring is already legible in the screenshots. So the fan keeps the chart's
spread law and centres on +y. The 2.6 cap holds the widest possible fan inside
15 to 165 degrees, which is the lower half whatever the seat count.

The radius becomes the halo's own, so a satellite sits ON its circle's ring the
way the chart's sit on the orbit. A building no circle calls home has no ring to
sit on and takes ROLE_SAT_R, which is 30: one unit past the widest sprite
half-extent measured above, plus the satellite's own radius.

Two rings are tangent at worst (the proof in patch 01 gives r_a + r_b <= d), so
two satellites from neighbouring homes can only meet if both fans point exactly
at the tangent point. On the shipped land the closest pair is community/library
at 58 apart, tangent at 32 degrees from community, and community's three-seat fan
spans 54 to 126.

Also the key, which patch 01 put at `top:44px right:12px`, straight on top of
`#dock` (`top:52px right:12px`, 38 wide). The corner holds three things and the
key has to clear two: below `#layers`, left of `#dock`. `verify_org_lens` reads
all three rectangles and fails on an intersection, because the first correction
here moved it off the dock and onto the layer bar, and both placements looked
fine in the CSS.

    python patch_h5_02_satarc.py
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
    """One edit, one guard.

    The guard is a SENTINEL that no later patch in this family touches. It is
    not the whole inserted block, because guarding on the block makes a patch
    re-apply itself the moment a later patch edits one line inside it, and
    then a second pass over the family duplicates work instead of skipping.
    Falls back to the block when an edit is nobody else's anchor.

    An anchor matching anything other than `count` times aborts before a byte
    is written."""
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


# ---------------------------------------------------------------- 1/4  the key clears the corner
OLD = "  #roleKey{position:absolute;top:44px;right:12px;z-index:30;display:none;gap:9px;\n"
NEW = ("  /* The corner holds three things and the key has to clear two of them.\n"
       "     BELOW #layers, which is top 10 and is the bar carrying the Org button\n"
       "     itself, and LEFT of #dock, which is top 52 right 12 with 38 wide\n"
       "     buttons. top 44 and right 58 is the one place that clears both.\n"
       "     verify_org_lens reads all three rectangles and fails on an\n"
       "     intersection, because patch 01's right 12 landed on the dock and the\n"
       "     first correction for that landed on the layer bar. Neither was\n"
       "     measured; both looked fine in the CSS. */\n"
       "  #roleKey{position:absolute;top:44px;right:58px;z-index:30;display:none;gap:9px;\n")
swap('1/4 the key clears the layer bar AND the dock', OLD, NEW,
     mark='top:44px;right:58px')

# ---------------------------------------------------------------- 2/4  the satellite radius constant
OLD = (
    "const ROLE_HALO_MAX=46,ROLE_HALO_MIN=18;\n"
)
NEW = (
    "const ROLE_HALO_MAX=46,ROLE_HALO_MIN=18;\n"
    "/* Where a satellite sits when no circle calls this building home and there\n"
    "   is no ring to sit on. The sprite boxes at the ten curated homes measure\n"
    "   20.1 to 28.9 scene units of half-extent, so 30 clears the widest of them\n"
    "   before the satellite's own 5 is added. */\n"
    "const ROLE_SAT_R=30;\n"
)
swap('2/4 the radius for a building no circle calls home', OLD, NEW,
     mark='const ROLE_SAT_R=30;')

# ---------------------------------------------------------------- 3/4  a satellite you can see
OLD = (
    "  cx.lineWidth=1.6;cx.strokeStyle=col;\n"
    "  cx.beginPath();cx.arc(px,py,4.2,0,7);\n"
    "  if(st==='full'){cx.fillStyle=col;cx.fill();cx.stroke();return}\n"
    "  if(st==='partial'){cx.fillStyle='rgba(20,14,8,.72)';cx.fill();cx.stroke();\n"
    "    cx.beginPath();cx.moveTo(px,py);cx.arc(px,py,4.2,-Math.PI/2,Math.PI/2);cx.closePath();\n"
)
NEW = (
    "  cx.lineWidth=1.6;cx.strokeStyle=col;\n"
    "  cx.beginPath();cx.arc(px,py,5,0,7);\n"
    "  if(st==='full'){cx.fillStyle=col;cx.fill();cx.stroke();return}\n"
    "  if(st==='partial'){cx.fillStyle='rgba(20,14,8,.72)';cx.fill();cx.stroke();\n"
    "    cx.beginPath();cx.moveTo(px,py);cx.arc(px,py,5,-Math.PI/2,Math.PI/2);cx.closePath();\n"
)
swap('3/4 the satellite grows from 4.2 to 5', OLD, NEW,
     mark='cx.arc(px,py,5,0,7);')

# ---------------------------------------------------------------- 4/4  the fan
OLD = (
    "    /* Inside the halo where there is one, and on a ring of its own where\n"
    "       there is not: a role can be addressed to a building no circle calls\n"
    "       home, and it still has to be visible there. */\n"
    "    const h=byHome[k],R=h?Math.max(12,h.r*0.66):26;\n"
    "    list.forEach((x,i)=>{\n"
    "      const a=-Math.PI/2+2*Math.PI*i/n;\n"
)
NEW = (
    "    /* ON the circle's ring, the way the chart's role nodes sit on the orbit\n"
    "       ring rather than inside it. A building no circle calls home has no\n"
    "       ring, and takes ROLE_SAT_R. */\n"
    "    const h=byHome[k],R=h?h.r:ROLE_SAT_R;\n"
    "    /* The chart's own fan law, pointed at the reader. It fans roles OUTWARD\n"
    "       from the village centre because outward is the direction with nothing\n"
    "       in it. On the land that direction is DOWN: a sprite stands up from its\n"
    "       anchor and covers a box 20 to 29 units of half-extent, so the ground\n"
    "       below is the only arc never covered. The 2.6 cap holds even the widest\n"
    "       fan inside 15 to 165 degrees, which stays in the lower half. */\n"
    "    const spread=Math.min(2.6,0.62*Math.max(1,n-1));\n"
    "    list.forEach((x,i)=>{\n"
    "      const a=Math.PI/2+(n===1?0:(i/(n-1)-0.5)*spread);\n"
)
swap('4/4 the fan turns to face the reader', OLD, NEW,
     mark='const a=Math.PI/2+(n===1?0:')

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
