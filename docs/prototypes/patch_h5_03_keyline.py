# -*- coding: utf-8 -*-
"""L5/3: a satellite that reads against a photograph.

Patch 02 put the satellites where they can be seen. This is about whether they
can be READ once they are there.

The land under them is a graded satellite image: bright surf and pale roofs on
one side of the property line, near-black forest canopy on the other. A 5-unit
token with a 1.6 rim and a near-black fill disappears into the canopy, which is
what the screenshot after patch 02 showed: the open satellites read as shadows
under the buildings instead of as marks.

Every other mark in this file already solved this. The badge seal is a PARCHMENT
FACE with the charge cut into it, and that is why a seal reads over water, over
canopy and over a roof alike. The satellite cannot borrow the face without
becoming a badge, so it borrows the principle: a dark keyline laid down first,
one unit outside the token, so the token separates from whatever is behind it.

Three changes, and none of them touches the three-ink language:

  1. A keyline. rgba(0,0,0,.55) at 2.6 wide, drawn at r+0.8 before anything
     else, so the coloured rim always has a dark edge outside it.
  2. The rim goes from 1.6 to 2, because a 1.6 line at a scene unit is under one
     device pixel below cam.z 0.63 and the map's zoom floor is 0.52.
  3. The open fill lightens from rgba(20,14,8,.72) to rgba(28,20,11,.86). More
     opaque, so the canopy stops showing through and the token reads as a thing
     rather than as a smudge, and still clearly the darkest of the three.

The key swatches in the CSS follow the same fill so the legend and the land keep
saying the same thing.

    python patch_h5_03_keyline.py
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


# ---------------------------------------------------------------- 1/2  the token
OLD = (
    "  cx.lineWidth=1.6;cx.strokeStyle=col;\n"
    "  cx.beginPath();cx.arc(px,py,5,0,7);\n"
    "  if(st==='full'){cx.fillStyle=col;cx.fill();cx.stroke();return}\n"
    "  if(st==='partial'){cx.fillStyle='rgba(20,14,8,.72)';cx.fill();cx.stroke();\n"
    "    cx.beginPath();cx.moveTo(px,py);cx.arc(px,py,5,-Math.PI/2,Math.PI/2);cx.closePath();\n"
    "    cx.fillStyle=col;cx.fill();return}\n"
    "  cx.fillStyle='rgba(20,14,8,.72)';cx.fill();\n"
    "  cx.globalAlpha=pulse?(0.6+0.3*Math.sin(t*2.618)):0.9;\n"
    "  cx.setLineDash([2.4,2]);cx.stroke();cx.setLineDash([]);cx.globalAlpha=1}\n"
)
NEW = (
    "  /* The keyline first. The land under a satellite is a graded photograph,\n"
    "     near-black under canopy and near-white on surf, and a token with no dark\n"
    "     edge reads as a smudge on the first and vanishes on the second. Every\n"
    "     badge seal solves this with a parchment face; a satellite is too small\n"
    "     to carry one, so it carries the edge instead. */\n"
    "  cx.lineWidth=2.6;cx.strokeStyle='rgba(0,0,0,.55)';\n"
    "  cx.beginPath();cx.arc(px,py,5.8,0,7);cx.stroke();\n"
    "  cx.lineWidth=2;cx.strokeStyle=col;\n"
    "  cx.beginPath();cx.arc(px,py,5,0,7);\n"
    "  if(st==='full'){cx.fillStyle=col;cx.fill();cx.stroke();return}\n"
    "  if(st==='partial'){cx.fillStyle=ROLE_DARK;cx.fill();cx.stroke();\n"
    "    cx.beginPath();cx.moveTo(px,py);cx.arc(px,py,5,-Math.PI/2,Math.PI/2);cx.closePath();\n"
    "    cx.fillStyle=col;cx.fill();return}\n"
    "  cx.fillStyle=ROLE_DARK;cx.fill();\n"
    "  cx.globalAlpha=pulse?(0.6+0.3*Math.sin(t*2.618)):0.9;\n"
    "  cx.setLineDash([2.4,2]);cx.stroke();cx.setLineDash([]);cx.globalAlpha=1}\n"
)
swap('1/2 the keyline, a heavier rim, and one name for the dark', OLD, NEW,
     mark='cx.arc(px,py,5.8,0,7);')

# ---------------------------------------------------------------- 2/2  the dark, named once
OLD = "const ROLE_SAT_R=30;\n"
NEW = (
    "const ROLE_SAT_R=30;\n"
    "/* The hollow. Opaque enough that canopy does not show through it, and still\n"
    "   the darkest of the three inks. The #roleKey swatches carry the same value,\n"
    "   so the legend and the land cannot drift. */\n"
    "const ROLE_DARK='rgba(28,20,11,.86)';\n"
)
swap('2/2 the hollow, named once for the land and the legend', OLD, NEW,
     mark="const ROLE_DARK='rgba(28,20,11,.86)';")

# ---------------------------------------------------------------- and the legend follows
OLD = (
    "  #roleKey .role-open{background:rgba(20,14,8,.72);border:1.6px dashed var(--gold)}\n"
    "  #roleKey .role-part{border:1.6px solid var(--gold);\n"
    "    background:linear-gradient(90deg,var(--gold) 50%,rgba(20,14,8,.72) 50%)}\n"
)
NEW = (
    "  #roleKey .role-open{background:rgba(28,20,11,.86);border:1.6px dashed var(--gold)}\n"
    "  #roleKey .role-part{border:1.6px solid var(--gold);\n"
    "    background:linear-gradient(90deg,rgba(28,20,11,.86) 50%,var(--gold) 50%)}\n"
)
swap('2b/2 the swatches carry the same dark, and fill the half the land fills', OLD, NEW,
     mark='#roleKey .role-open{background:rgba(28,20,11,.86)')

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
