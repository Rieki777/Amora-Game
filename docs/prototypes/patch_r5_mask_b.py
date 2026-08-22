#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
R5 / MASK, SECOND PASS - what the driven probe found once the room existed.

Every one of these was reported by `qa/_probe_r5_mask.js` at a viewport proved
from the payload (390x844, hasTouch, devicePixelRatio 3, body.pocket true), and
not one of them is visible by reading the stylesheet.

1. THE SHEET'S MIDDLE SAT UNDER THE BOTTOM BAR. `bottom:0` with `height:80%`
   put the sheet's last 60 px behind `#pbar`, which is z-index 60 and owns that
   strip. The `padding-bottom` cleared the sheet's LAST row and nothing else,
   so any row that happened to scroll into that strip was covered. MEASURED:
   `#skLbl`, the label-size dial, reported visible, correctly sized, fully
   opaque, and `elementFromPoint` at its centre returned `#pbAttn`. That is the
   exact failure shape a sibling lane warned about, found on the first run.
   The sheet now STOPS above the bar instead of running under it.

2. THE DRAWER'S OWN CELLS WERE 40 PX. Every way into the map on a phone lives
   in `#pdrawer`, and each cell was four pixels under the floor. Measured, not
   estimated: 40.

3. THE COLOUR AND RANGE INPUTS WERE 34 PX. The first pass raised them from the
   desk's 26 and stopped short of the floor.

The house floor is 44 px and it is not a rounding target.
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, "grounds-v0.html")


def load():
    with io.open(TARGET, "r", encoding="utf-8", newline="") as f:
        return f.read()


def save(s):
    with io.open(TARGET, "w", encoding="utf-8", newline="") as f:
        f.write(s)


APPLIED = []
SKIPPED = []


def edit(src, name, anchor, new, guard, count=1):
    if guard in src:
        SKIPPED.append(name)
        print("  skip   %s (guard already present)" % name)
        return src
    n = src.count(anchor)
    assert n == count, "%s: anchor found %d times, expected %d" % (name, n, count)
    out = src.replace(anchor, new, count)
    assert out != src, "%s: replacement changed nothing" % name
    assert guard in out, "%s: guard absent after apply" % name
    APPLIED.append(name)
    print("  apply  %s" % name)
    return out


src = load()
before = len(src)

src = edit(
    src, "the sheet stops above the bottom bar instead of running under it",
    "  body.pocket #skin{display:flex;position:fixed;left:0;right:0;top:auto;bottom:-104%;\n"
    "    width:auto;height:80%;max-height:none;z-index:59;\n"
    "    border:none;border-top:2px solid #8a6a33;border-radius:16px 16px 0 0;\n"
    "    padding:12px 16px calc(78px + env(safe-area-inset-bottom));\n"
    "    overflow-y:auto;overscroll-behavior:contain;\n"
    "    transition:bottom .3s cubic-bezier(.2,.8,.3,1)}\n"
    "  body.pocket #skin.show{bottom:0}\n",
    "  /* THE SHEET ENDS WHERE THE BAR BEGINS. It used to be `bottom:0` with a\n"
    "     padding that cleared its last row, which meant every row that scrolled\n"
    "     into the bottom 60 px was underneath #pbar (z-index 60) with nothing to\n"
    "     show for it. MEASURED: #skLbl reported visible, correctly sized and\n"
    "     fully opaque while elementFromPoint at its centre returned #pbAttn.\n"
    "     Resting the sheet's own floor on the bar's ceiling is the whole fix,\n"
    "     and 72% keeps the vitals strip and a strip of land in view above it. */\n"
    "  body.pocket #skin{display:flex;position:fixed;left:0;right:0;top:auto;bottom:-110%;\n"
    "    width:auto;height:72%;max-height:none;z-index:59;\n"
    "    border:none;border-top:2px solid #8a6a33;border-radius:16px 16px 0 0;\n"
    "    padding:12px 16px 16px;\n"
    "    overflow-y:auto;overscroll-behavior:contain;\n"
    "    transition:bottom .3s cubic-bezier(.2,.8,.3,1)}\n"
    "  body.pocket #skin.show{bottom:calc(60px + env(safe-area-inset-bottom,0px))}\n",
    guard="  body.pocket #skin.show{bottom:calc(60px + env(safe-area-inset-bottom,0px))}")

src = edit(
    src, "the pocket controls clear the 44 px floor, all of them",
    "  body.pocket #skin .srow input[type=color]{width:52px;height:34px}\n"
    "  body.pocket #skin .srow input[type=range],body.pocket #skin .customrow input[type=range]{height:34px}\n",
    "  body.pocket #skin .srow input[type=color]{width:56px;height:44px}\n"
    "  body.pocket #skin .srow input[type=range],body.pocket #skin .customrow input[type=range]{height:44px}\n"
    "  /* EVERY WAY INTO THE MAP ON A PHONE IS IN THIS DRAWER and every cell in\n"
    "     it was 40 px. Measured, not estimated. */\n"
    "  #pdrawer .pcell{min-height:44px}\n",
    guard="  #pdrawer .pcell{min-height:44px}")

if APPLIED:
    save(src)

print("\npatch_r5_mask_b: %d applied, %d skipped, %+d bytes"
      % (len(APPLIED), len(SKIPPED), len(src) - before))
sys.exit(0)
