# -*- coding: utf-8 -*-
"""L5/10: the lens writes down what it actually drew, and on which canvas.

WHY THIS EXISTS, and it is the review's finding rather than a nicety.

verify_org_lens L5 and R5 proved the three inks by driving `roleSat` onto
canvases made with document.createElement and reading the pixels back. Thirty
eight checks were green while two of the three governing satellites were
INVISIBLE ON SCREEN, because a scratch canvas has no #icons over it and no
building sprite in the way. Nothing in that suite ever read the canvas a person
looks at, so nothing in it could have caught the defect.

A gate cannot be trusted to answer about a surface it never touched. This patch
is the half of the fix that makes the real surface readable:

  * `ROLE_LAST_SATS` holds one row per satellite the lens laid down on the LAST
    frame, with the seat's name, the building it drew at, its state, the SCENE
    point roleSat was handed, and THE ID OF THE CANVAS IT WENT ONTO.

  * The rows are only written when `cx.canvas.isConnected` is true. A scratch
    canvas is not in the document, so driving roleSat or roleLens onto one
    writes nothing here and cannot make a stale frame look like a fresh one.
    The gate asserts on `surface` itself, so the claim "these landed on the
    canvas above the sprites" is made by the artifact and checked by the suite
    instead of being assumed by both.

  * The point is the one the DRAW was handed. `px`/`py` are computed once and
    passed to roleSat, so the log and the ink cannot disagree. Recording a
    re-derivation of the same expression is how a probe ends up reporting a
    place nothing was painted.

The array is mutated in place and never reassigned: `window.ROLE_LAST_SATS`
holds the same object forever, so a reader that grabbed it early keeps reading
live rows.

    python patch_h5_10_satlog.py
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
    """One edit, one guard. The guard is a sentinel a later patch does not
    touch; an anchor matching anything other than `count` times aborts before a
    byte is written."""
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


# ---------------------------------------------------------------- 1/3
OLD = (
    "/* The whole lens, called from the draw loop with the canvas already in scene\n"
    "   coordinates. Halos first so the satellites sit on top of their own wash. */\n"
)
NEW = (
    "/* WHAT THE LENS PUT ON A REAL CANVAS, on the last frame that drew one.\n"
    "   One row per satellite: the seat, the building it drew at, the address it\n"
    "   answers to, the state, the SCENE point roleSat was handed, and the id of\n"
    "   the canvas the ink went onto.\n"
    "\n"
    "   ONLY FROM A CANVAS THAT IS IN THE DOCUMENT. The org-lens suite proves the\n"
    "   three inks by driving roleSat onto canvases made with createElement, and\n"
    "   those are not connected, so a scratch drive leaves this untouched and\n"
    "   cannot pass off a rehearsal as a frame.\n"
    "\n"
    "   MUTATED IN PLACE, NEVER REASSIGNED, so the window reference below stays\n"
    "   the live array for anything that grabbed it at boot. */\n"
    "const ROLE_LAST_SATS=[];\n"
    "window.ROLE_LAST_SATS=ROLE_LAST_SATS;\n"
) + OLD
swap('1/3 the record of what was drawn, and where', OLD, NEW,
     mark='const ROLE_LAST_SATS=[];')

# ---------------------------------------------------------------- 2/3
OLD = "  cx.save();\n  const homes=roleHomes(mode),byHome={};\n"
NEW = (
    "  cx.save();\n"
    "  /* A canvas in the document is a canvas a person can be looking at. The\n"
    "     suite's scratch canvases are not, and they must not overwrite the\n"
    "     record of the last real frame. */\n"
    "  const live=!!(cx.canvas&&cx.canvas.isConnected);\n"
    "  if(live)ROLE_LAST_SATS.length=0;\n"
    "  const homes=roleHomes(mode),byHome={};\n"
)
# THE SENTINEL IS THE COMMENT ABOVE THE LINE, NOT THE LINE. Patch 11 gives
# roleLens a second context for the satellites and rewrites this test to ask
# `sx2.canvas` instead of `cx.canvas`, so a guard carrying `cx.canvas` stopped
# matching - and the OLD anchor was gone too, so a second pass aborted here on
# the count assert rather than skipping.
swap('2/3 a real canvas clears the record, a scratch one leaves it alone', OLD, NEW,
     mark='     record of the last real frame. */\n')

# ---------------------------------------------------------------- 3/3
# The point is computed ONCE and both the log and the draw take that one value.
OLD = (
    "      const st=roleState(x);\n"
    "      roleSat(cx,s.x+R*Math.cos(a),s.y+R*Math.sin(a),\n"
)
NEW = (
    "      const st=roleState(x),px=s.x+R*Math.cos(a),py=s.y+R*Math.sin(a);\n"
    "      if(live)ROLE_LAST_SATS.push({seat:x.s,circle:x.c,home:k,at:x.at||null,\n"
    "        x:px,y:py,st:st,surface:cx.canvas.id});\n"
    "      roleSat(cx,px,py,\n"
)
swap('3/3 one point, handed to the ink and to the record alike', OLD, NEW,
     mark='      if(live)ROLE_LAST_SATS.push({seat:x.s,')

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
