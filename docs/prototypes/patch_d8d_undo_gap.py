#!/usr/bin/env python3
"""Undo asks which version came before. It must not guess.

THE BUG. `undoPublish` computed the version to restore as `version - 1`. That
is right only while the history has no gaps, and the history gets gaps exactly
where this feature matters most.

`map_scene_revisions.version` is AUTO_INCREMENT, and InnoDB consumes an id on
a FAILED insert as well as a successful one. A refused publish is a failed
insert: it is how the UNIQUE `base_version` index settles two admins racing.
So every time two people publish at the same moment, one id is burned and the
history skips a number.

Which means the arithmetic broke precisely on the villages busy enough to have
two cartographers, and it broke on the button whose entire promise is that it
is safe to press when you are not certain. The founder gets "There is no
version 6 to put back" and no way forward.

THE FIX IS TO STOP COMPUTING IT. The server already knows which revision came
before the live one; `liveCard()` now reports it as `previous`, read from the
history rather than derived from a number. The map asks for that.

Degrades safely: a reply with no `previous` (a village with a single published
version, or an older server) says there is nothing earlier, which is true.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable: detects its own marker and skips rather than double-applying.
Apply AFTER patch_d8_publish.py.
Usage: python3 patch_d8d_undo_gap.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
src = open(HTML, encoding="utf8", newline="").read()
before = len(src)

if "PUBLISH_MARK" not in src:
    print(f"refusing: {HTML} has no D8 publish block; run patch_d8_publish.py first")
    sys.exit(1)

if "UNDO_ASKS" in src:
    print(f"already applied to {HTML} (UNDO_ASKS present); nothing to do")
    sys.exit(0)


def swap(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


swap(
    """async function undoPublish(version){
  const back=(+version||0)-1;
  if(back<1)return toast('There is no earlier version to go back to.');""",
    """async function undoPublish(){
  /* UNDO_ASKS. The version below the live one is NOT live minus one. A
     refused publish still consumes an AUTO_INCREMENT id, and a refused
     publish is how two admins racing get settled, so any village with two
     cartographers has gaps. The server reports `previous` from the history
     itself and this asks for that rather than doing arithmetic on it. */
  const back=(LIVE&&+LIVE.previous)||0;
  if(back<1)return toast('There is no earlier version to go back to.');""",
)

# The button passed the version it was minted for; there is nothing to pass now.
swap(
    """onclick="undoPublish(${version})">Undo this</button>`);""",
    """onclick="undoPublish()">Undo this</button>`);""",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"undo gap patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
