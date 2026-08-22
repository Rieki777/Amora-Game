#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
R5 / MASK, THIRD PASS - four more the driven probe found, all of them mine.

1. THE VILLAGE'S OWN WORDS WERE NEVER HIDDEN FROM A MEMBER, which is the one
   rule this whole lane exists to enforce. `#skin [data-village]{display:none}`
   and `#skin .srow{display:flex}` carry the SAME specificity (0,1,1,0), the
   `.srow` rule is declared six hundred lines later in the sheet, and later
   wins. The law read correctly, the selector lost the tie, and nothing said
   so. MEASURED with `body.can-edit` removed: the four rows still stood 58, 95,
   170 and 45 px tall. This is the identical trap `body.can-edit #buildBtn`
   paid for in the consent lane, one lane later.

2. THE THEME PICKER RAN OFF THE RIGHT EDGE OF THE PHONE. `#skTheme` is a
   `.swrow`, a single flex line with `flex:1` on each child. That was right for
   seven one-word chips. The merged picker carries colour dots, a name and a
   sentence, so on a 330 px desk panel each swatch came out around 40 px wide
   and on a 390 px sheet the line simply left the screen. MEASURED:
   `elementFromPoint` at a swatch's own centre returned null, because the
   centre was not on the glass. It is a list now.

3. THE PANEL REOPENED WHERE IT WAS LEFT. `overflow-y:auto` gave the panel a
   scroll position and nothing ever put it back, so a person who read to the
   bottom, closed it and opened it again arrived below the header with no
   heading, no first sentence and no close button in view. MEASURED on the
   desk: `#skX` at 44x44, fully styled, and `elementFromPoint` at its centre
   returned null because it was scrolled above the panel's own top edge.

4. THREE COLOUR WELLS WERE 30x24 ON A PHONE. The second pass raised the ones
   under `#skin .srow` and missed the three inside the nested theme panel's
   `.customrow`, because the selector named the row and not the control.
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
    src, "the mask law wins its specificity tie",
    "  #skin [data-village]{display:none}\n"
    "  body.can-edit #skin [data-village]{display:flex}\n",
    "  /* THE TIE THAT LOST. `#skin [data-village]` and `#skin .srow` are both\n"
    "     (0,1,1,0) and the .srow rule is declared six hundred lines further\n"
    "     down, so it won and the village's own words stayed on screen for\n"
    "     everybody. MEASURED with body.can-edit off: 58, 95, 170 and 45 px of\n"
    "     rows that a member must never see. Naming the class alongside the\n"
    "     attribute settles it on specificity instead of on source order, which\n"
    "     is the only tiebreak that cannot be undone by an edit somewhere else\n"
    "     in the sheet. */\n"
    "  #skin .srow[data-village],#skin [data-village]{display:none}\n"
    "  body.can-edit #skin .srow[data-village],body.can-edit #skin [data-village]{display:flex}\n",
    guard="  #skin .srow[data-village],#skin [data-village]{display:none}")

src = edit(
    src, "the theme picker is a list, not a line that leaves the screen",
    "  #skin #maskLook{display:flex;flex-direction:column;gap:9px}\n",
    "  /* THE PICKER IS A LIST. `.swrow` is one flex line with flex:1 on each\n"
    "     child, which was right for seven one-word chips and is wrong for seven\n"
    "     swatches carrying a colour trio, a name and a sentence: at 330 px each\n"
    "     came out around 40 px wide, and on a 390 px sheet the line ran off the\n"
    "     right edge. MEASURED: elementFromPoint at a swatch's own centre\n"
    "     returned null, because the centre was not on the glass. The look is\n"
    "     the theme panel's own .swatchbtn, restored here because `#skin .swb`\n"
    "     is the more specific selector and was overruling it. */\n"
    "  #skin #skTheme{flex-direction:column;align-items:stretch;gap:6px}\n"
    "  #skin #skTheme .swb{flex:0 0 auto;width:100%;display:flex;align-items:center;gap:10px;\n"
    "    min-height:44px;padding:8px 10px;text-align:left;font-size:11px;\n"
    "    background:rgba(236,208,138,.06);border:1px solid rgba(201,162,94,.4);\n"
    "    border-radius:8px;color:var(--parch)}\n"
    "  #skin #skTheme .swb.on{border-color:var(--gold-b);background:rgba(236,208,138,.14)}\n"
    "  #skin #skTheme .swb b{font-variant:small-caps;letter-spacing:.1em;font-weight:normal;font-size:12.5px}\n"
    "  #skin #skTheme .swb small{display:block;font-size:10px;color:#b9af8f}\n"
    "  #skin #maskLook{display:flex;flex-direction:column;gap:9px}\n",
    guard="  #skin #skTheme{flex-direction:column;align-items:stretch;gap:6px}")

src = edit(
    src, "every colour well on a phone, not only the ones in a labelled row",
    "  body.pocket #skin .srow input[type=color]{width:56px;height:44px}\n",
    "  /* NAMED ON THE CONTROL, NOT ON THE ROW. The first two passes said\n"
    "     `.srow input[type=color]` and missed the three wells inside the nested\n"
    "     theme panel's .customrow, which measured 30x24 on a phone. */\n"
    "  body.pocket #skin input[type=color]{width:56px;height:44px}\n",
    guard="  body.pocket #skin input[type=color]{width:56px;height:44px}")

src = edit(
    src, "the panel opens at its top, where its name and its way out are",
    "  $('skin').classList.add('show');\n"
    "  const tp=$('themePanel');if(tp)tp.classList.add('show');\n",
    "  $('skin').classList.add('show');\n"
    "  /* OPEN AT THE TOP. The panel scrolls its own tail now, so it also KEPT a\n"
    "     scroll position: read to the bottom, close, open again, and you\n"
    "     arrived below the header with no heading, no first sentence and no way\n"
    "     out in view. MEASURED on the desk: #skX at 44x44, fully styled, and\n"
    "     elementFromPoint at its centre returned null because it sat above the\n"
    "     panel's own top edge. */\n"
    "  $('skin').scrollTop=0;\n"
    "  const tp=$('themePanel');if(tp)tp.classList.add('show');\n",
    guard="  $('skin').scrollTop=0;")

if APPLIED:
    save(src)

print("\npatch_r5_mask_c: %d applied, %d skipped, %+d bytes"
      % (len(APPLIED), len(SKIPPED), len(src) - before))
sys.exit(0)
