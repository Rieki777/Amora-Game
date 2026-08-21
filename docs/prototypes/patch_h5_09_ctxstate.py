# -*- coding: utf-8 -*-
"""L5/9: the lens hands the canvas back the way it found it.

`roleLens` sets `lineWidth`, `strokeStyle`, `fillStyle`, `globalAlpha` and a
line dash, and leaves the last values in place. The loop it replaced did the
same and left `lineWidth` at 1.2; this one leaves it at 2 or 2.6, so every pass
that strokes AFTER the lens without setting its own width now draws differently
depending on whether the Org button is on.

Nothing visible is broken today. I read the passes that follow: the flows lens
sets its own width on every stroke, and the night pools, the council fire, the
figures, the smoke, the sparkles and the wildlife are all fills that set their
own style. So this is not a bug report, it is the removal of a question.

The alternative to `save`/`restore` is auditing every later pass in a 5 MB draw
function and then re-auditing it whenever another lane adds one, which is a
promise nobody can keep. Two calls make the lens unable to affect anything
downstream, whatever gets added next.

`globalAlpha` is the one that would have hurt most: `roleSat` sets it for a
pulsing open satellite and resets it to 1, but only on the branch that set it,
so a future early return anywhere in there would leave the whole rest of the
frame drawing at 60 per cent. `restore` makes that class of edit safe.

    python patch_h5_09_ctxstate.py
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


# The opening line of roleLens, and its final line. Both are unique.
OLD = (
    "function roleLens(cx,mode,t){\n"
    "  const homes=roleHomes(mode),byHome={};\n"
)
NEW = (
    "function roleLens(cx,mode,t){\n"
    "  /* The lens leaves lineWidth, strokeStyle, fillStyle, globalAlpha and a\n"
    "     dash pattern behind it, and every pass that draws later in this frame\n"
    "     inherits them. Auditing those passes works once and rots the moment\n"
    "     another lane adds one, so the lens is simply unable to reach them. */\n"
    "  cx.save();\n"
    "  const homes=roleHomes(mode),byHome={};\n"
)
# The mark is the ONE line this edit exists to add, not the block. Patch 10
# rewrites the satellite loop that sits between these two edits, and a
# block-shaped guard would have stopped matching the moment it did: this patch
# would then re-apply on a family replay, fail to find its own OLD anchor, and
# abort the replay. That is the exact failure the swap() docstring above warns
# about, and both guards here were the block until patch 10 was written.
swap('1/2 the lens takes a copy of the canvas state', OLD, NEW,
     mark='     another lane adds one, so the lens is simply unable to reach them. */\n  cx.save();\n')

OLD = (
    "      roleSat(cx,s.x+R*Math.cos(a),s.y+R*Math.sin(a),\n"
    "        CIRCLE_COL[x.c]||'#9aa08f',st,st==='open'&&roleRelevant(x._tags||x.archetypes),t||0)})}}\n"
)
NEW = (
    "      roleSat(cx,s.x+R*Math.cos(a),s.y+R*Math.sin(a),\n"
    "        CIRCLE_COL[x.c]||'#9aa08f',st,st==='open'&&roleRelevant(x._tags||x.archetypes),t||0)})}\n"
    "  cx.restore()}\n"
)
swap('2/2 and gives it back', OLD, NEW,
     mark="t||0)})}\n  cx.restore()}\nwindow.roleLens=roleLens;")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
