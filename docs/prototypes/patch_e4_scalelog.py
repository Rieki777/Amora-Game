#!/usr/bin/env python3
"""The size slider keeps the number it started from.

Rye asked to "individually change the scale of each icon". That control already
exists and works: the size row in the inspect panel writes `s.scale`, the poi
transform reads `FAM_SCALE * s.scale * GSCALE`, and the value exports and
imports. Nothing needs building for the scale itself.

What is broken is the record of it. Three lines, and the third undoes the
second:

    sr.oninput  = ...  s.scale = value/100          // live, correct
    sr.onchange = e => { const from = sr._from ... } // remembers where it began
    sr.onchange = ()  => logEdit(... {to: s.scale})  // clobbers the line above

`onchange` is a property, not a listener list, so the second assignment
replaces the first outright. The consequences are quiet and all bad: `_from` is
set by every `oninput` and never cleared, so it pins to the FIRST drag of the
session forever; the "did not actually move" early return is gone, so nudging a
slider back to where it started still writes an edit; and every scale row in
the log carries a `to` with no `from`, which is the one thing that makes a
size edit reviewable.

This is the round's own lesson in miniature: a value crossed a boundary and
lost the part the far side had no slot for, nothing raised, and no existing
test looked. The fix is to delete the clobbering line. The handler beneath it
was already right.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable, and the marker is the ABSENCE of the clobbering line.
Usage: python3 patch_e4_scalelog.py [grounds-v0.html] [--check]
  --check verifies every anchor against the file and writes nothing.
"""
import sys

args = [a for a in sys.argv[1:] if not a.startswith("--")]
CHECK = "--check" in sys.argv
HTML = args[0] if args else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()
before = len(src)

CLOBBER = "\n  sr.onchange=()=>logEdit('scale','structure:'+s.key,{to:s.scale});"

if CLOBBER in src:
    n = src.count(CLOBBER)
    assert n == 1, f"anchor appears {n} times, expected 1"
    # The handler that survives is the one directly above it, which already
    # reads _from, clears it, and skips a no-op move.
    keeper = "logEdit('scale','structure:'+s.key,{from,to:s.scale||1});"
    assert keeper in src, "the handler this deletion relies on is not there; refusing"
    src = src.replace(CLOBBER, "", 1)
    print("  apply drop the clobbering onchange")
else:
    print("  skip  drop the clobbering onchange (already applied)")

if CHECK:
    print(f"CHECK ONLY, nothing written. {HTML} would go {before} -> {len(src)} bytes ({len(src)-before:+d})")
    sys.exit(0)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"scale log patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
