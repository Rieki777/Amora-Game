#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
R5 / MASK, FOURTH PASS - the rows were being crushed, and only a screenshot said so.

MEASURED on the phone, panel open, nothing else on screen:

    building size        row h=44   kids  slbl:12  skGS:44   skGSV:12
    land theme           row h=44   kids  slbl:12  skTheme:164      <-- 164 in a 44
    maskLook             row h=303  kids  themePanel:303
    accent               row h=44   kids  slbl:12  skAccent:44

A child 164 px tall inside a row 44 px tall. The theme list was painting 120 px
of itself straight over the rows above and below it, and every probe passed
throughout: the buttons were the right size, fully opaque, on screen, and
`elementFromPoint` at each centre returned the button itself. Overlap is not a
question any of those ask.

THE CAUSE IS THE OLDEST TRAP IN FLEXBOX AND THIS LANE WALKED INTO IT BY GIVING
THE PANEL A CEILING. `#skin` is `display:flex; flex-direction:column`, and it
now has a bounded height (`max-height` on the desk, `height:72%` in the pocket
sheet) so that its tail stops running under the taskbar. A flex item's default
`flex-shrink` is 1, so the moment the column is height-bounded every row is
allowed to shrink BELOW ITS OWN CONTENT. While every row held one line of
controls at roughly the same height nothing showed. The theme picker became a
list of seven swatches in the third pass, and it was the first row tall enough
for the crush to be visible.

`min-height:44px` on the pocket rows made it worse and hid it at the same time:
it pinned the crushed rows at exactly 44, which reads as deliberate.

The fix is to say what was always meant: rows keep their content height, and
the PANEL scrolls. `flex:0 0 auto` on the children of all three column
containers, because `#maskLook` and the nested `#themePanel` are columns inside
a bounded column and inherit the same defaults.
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
    src, "a bounded flex column stops crushing its own rows",
    "  #skin{max-height:calc(100vh - 120px);max-height:calc(100dvh - 120px);\n"
    "    overflow-y:auto;overscroll-behavior:contain}\n",
    "  #skin{max-height:calc(100vh - 120px);max-height:calc(100dvh - 120px);\n"
    "    overflow-y:auto;overscroll-behavior:contain}\n"
    "  /* THE ROWS KEEP THEIR OWN HEIGHT AND THE PANEL SCROLLS. Giving this\n"
    "     column a ceiling (above, and height:72% in the pocket sheet) is what\n"
    "     stops its tail running off the bottom of the screen, and it also let\n"
    "     flexbox do what flexbox does to a bounded column: flex-shrink defaults\n"
    "     to 1, so every row became free to shrink BELOW ITS OWN CONTENT.\n"
    "     MEASURED with the panel open and nothing else on screen: the land\n"
    "     theme row reported height 44 while the swatch list inside it reported\n"
    "     164, so 120 px of theme buttons painted over the rows above and below.\n"
    "     Every probe passed the whole time, because a crushed row's children\n"
    "     are still the right size, still opaque, still on screen, and\n"
    "     elementFromPoint at each centre still returns the button. Overlap is\n"
    "     not a question any of those ask, and a screenshot is what caught it.\n"
    "     All three containers, because #maskLook and the nested #themePanel are\n"
    "     themselves columns inside a bounded column and inherit the same\n"
    "     defaults. */\n"
    "  #skin>*,#skin #maskLook>*,#skin #themePanel>*{flex:0 0 auto}\n",
    guard="  #skin>*,#skin #maskLook>*,#skin #themePanel>*{flex:0 0 auto}")

src = edit(
    src, "the footer note is builder-context, so a builder is who reads it",
    " <div style=\"font-size:9.5px;color:#8a7347;font-style:italic\">this panel lives at step 6 "
    "of Make This Yours on the site. Style it once and site and land match.</div>\n",
    " <!-- This sentence is about where the VILLAGE's styling is administered, so\n"
    "      it belongs with the village's own rows and not above a member's\n"
    "      personal view. It was the last thing a member read in a panel whose\n"
    "      first sentence promises the opposite. -->\n"
    " <div data-village=\"1\" style=\"font-size:9.5px;color:#8a7347;font-style:italic\">this panel "
    "lives at step 6 of Make This Yours on the site. Style it once and site and land match.</div>\n",
    guard=" <div data-village=\"1\" style=\"font-size:9.5px;color:#8a7347;font-style:italic\">this panel ")

if APPLIED:
    save(src)

print("\npatch_r5_mask_d: %d applied, %d skipped, %+d bytes"
      % (len(APPLIED), len(SKIPPED), len(src) - before))
sys.exit(0)
