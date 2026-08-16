# -*- coding: utf-8 -*-
"""The journey's arrival callback learns the guard its three siblings already have.

THE DEFECT, red on origin/main before any lane touched it.

    verify_features:  FAIL zero page errors (1)
      TypeError: Cannot read properties of null (reading 'i')
        at grounds-v0.html:4682:35
        at frame (grounds-v0.html:1942:67)

`playJourney` keeps its position in a script-scope `JWALK`, and EVERY entry point
re-checks that it still exists before touching it, because the walk can end at any
moment from three places: `jEnd()`, the Escape keydown handler, and `step()` itself
running past the last stop.

    step()            if(!JWALK||JWALK.id!==id)return;          <- guarded
    jNext()           if(!JWALK||JWALK.id!==id)return;          <- guarded
    the JTMR timer    if(JWALK&&JWALK.id===id){...}             <- guarded
    the travelTo done callback                                  <- NOT guarded

The unguarded one is the only callback that fires LATER, from the render loop, when
the camera flight lands. `frame()` at :1942 does `const d=travel.done;travel=null;d&&d()`,
so it runs however many frames after `step()` started it. A walk that ended during the
flight leaves `JWALK` null, and `${JWALK.i+1} of ${stops.length}` throws inside the
render loop.

THE FIX IS THE SIBLING'S OWN LINE, and it is the whole change. When JWALK is live this
is a no-op, so nothing about a normal walk moves. `stops` and `id` are captured by the
closure and stay valid either way.

WHAT THIS DOES NOT FIX, stated so nobody reads a green here as more than it is:
  - `verify_features` D5.3 asserts `!window.JWALK` to decide the walk ended. JWALK is a
    script-scope `let`, NOT a window property, so `window.JWALK` is permanently
    undefined and that assertion is true no matter what happens. Measured directly:
    `playJourney('j2')` renders `.jn` = "1 of 11" while `window.JWALK` reads false.
    That is a defect in the GATE, not in the artifact, and it is left alone here
    because this patch does not own the suite.
  - The other stable-red failures on main (D1.1, D2 A2, and the doors/loom/badges
    reds) are untouched and are separate work.

Re-runnable: the edit guards itself. A second run prints a skip and writes nothing.

    python patch_g7_01_journey_guard.py
"""
import io
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'grounds-v0.html')

src = io.open(TARGET, encoding='utf-8', newline='').read()
start_bytes = len(src.encode('utf-8'))
applied = 0
skipped = 0


def swap(name, old, new, count=1):
    """One edit, one guard. An anchor matching anything other than `count` times
    aborts before a byte is written."""
    global src, applied, skipped
    if new in src:
        print('  skip   %s' % name)
        skipped += 1
        return
    n = src.count(old)
    assert n == count, 'anchor for %s appears %d times, expected %d' % (name, n, count)
    src = src.replace(old, new, count)
    print('  apply  %s' % name)
    applied += 1


# The anchor is the callback's opening line plus the comment that already sits inside
# it, which is CODE and a code comment rather than player copy: the words Maia speaks
# are built from `x.st.t` and `x.st.body` and are not touched here.
OLD = (
    "    travelTo(s.x,s.y,1.25,()=>{\n"
    "      /* Maia is the PRESENTER; the words stay village content, so `t` and the\n"
    "         optional `body` are printed as they were written. */\n"
)
NEW = (
    "    travelTo(s.x,s.y,1.25,()=>{\n"
    "      /* The flight lands FRAMES after step() started it, and the walk can end\n"
    "         in between from jEnd(), Escape, or step() passing the last stop. Every\n"
    "         other entry point re-checks JWALK for exactly that reason; this one is\n"
    "         the only callback that fires late, so it is the only one that threw. */\n"
    "      if(!JWALK||JWALK.id!==id)return;\n"
    "      /* Maia is the PRESENTER; the words stay village content, so `t` and the\n"
    "         optional `body` are printed as they were written. */\n"
)
swap('1/1 the arrival callback re-checks the walk is still running', OLD, NEW)

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
