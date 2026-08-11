#!/usr/bin/env python3
"""The pocket bar stops speaking in someone else's alphabet.

Rye: "Regenerate the menu icons to match our same style and aesthetic."

The four were EMOJI: a national-park landscape, a speech balloon, a flag and a
hamburger rule. An emoji is not drawn by this map, it is drawn by the reader's
operating system, so on the iPhone this was reported from they render as full
colour Apple glyphs sitting on a parchment-and-gold bar. Nothing about them can
be themed, tinted, or made to match anything, because the font owns them.

THESE ARE SVG, NOT GENERATED ART, AND THAT IS THE POINT. The obvious reading of
"regenerate the icons" is to paint four little pictures, and at the size this
bar draws (19 px) a painterly raster turns to mush. The file already says so
where the badge charges are defined: two earlier passes were drawn by eye at
sketch size and failed at render size, the leaf-pennant closing into a letter P
and a conversation mark reading as a question mark. Matching "the style of our
buildings and map" at 19 px means the LANGUAGE, which is bold organic silhouette
and carved gaps, not the rendering.

So they are drawn in the same hand as the badge charges, and two of them ARE
that hand: the conversation bubble with an ellipsis is the `talk` charge, which
was chosen by rendering candidates at 76, 22 and 16 px and keeping what
survived, and the swallowtail pennant is the `quest` charge. That repetition is
meaning rather than laziness. A pennant on a building says work is here; the
same pennant in the bar opens everything that needs hands.

They inherit `currentColor`, so the bar's own parchment carries them and a theme
change carries them with it. Nothing here is a font.

House protocol: exact-count anchors, refuse on any count that is not 1.
Re-runnable PER STEP.
Usage: python3 patch_f2_navicons.py [grounds-v0.html] [--check]
"""
import sys

args = [a for a in sys.argv[1:] if not a.startswith("--")]
CHECK = "--check" in sys.argv
HTML = args[0] if args else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()
before = len(src)


def swap(old, new, count=1):
    global src
    n = src.count(old)
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


def step(name, old, new, marker):
    if marker in src:
        print(f"  skip  {name} (already applied)")
        return
    swap(old, new)
    print(f"  apply {name}")


# ------------------------------------------------------------------ 1. the box
step(
    "the glyph box",
    """  #pbar button b{font-size:19px;font-weight:normal;line-height:1}""",
    """  #pbar button b{font-size:19px;font-weight:normal;line-height:1;display:flex;align-items:center;justify-content:center}
  /* Drawn by this map, in this map's colour. An emoji is drawn by the reader's
     operating system and cannot be themed, tinted or matched to anything. */
  #pbar button b svg{width:22px;height:22px;display:block;overflow:visible}
  #pbar button b .sol{fill:currentColor;stroke:none}
  #pbar button b .ln{fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}""",
    "#pbar button b svg",
)

# ---------------------------------------------------------------- 2. the glyphs
# 24-unit box, same as the badge charges, so the two sets stay one hand.
NAV = {
    # The land itself: a ridge line with a sun over it. Two masses and a disc,
    # which is all that survives at 22 px.
    "pbMap": '<svg viewBox="0 0 24 24" aria-hidden="true">'
             '<path class="sol" d="M2.2 19c2.6-4.2 4.6-7 6.6-7 2.1 0 3.4 2.3 4.9 4.5 1.2-1.8 2.2-3 3.5-3 1.7 0 3.1 2 4.8 5.5z"/>'
             '<circle class="sol" cx="16.8" cy="6.4" r="2.7"/></svg>',
    # The `talk` charge, unchanged in shape. It was chosen by rendering
    # candidates at 76, 22 and 16 px and keeping the one that read.
    "pbAsk": '<svg viewBox="0 0 24 24" aria-hidden="true">'
             '<path class="ln" d="M12 4.7c-4.3 0-7.9 2.8-7.9 6.3 0 2 1.2 3.8 3 5-.3 1.3-1 2.4-2.1 3.4 2.1-.4 3.9-1.2 5-2.3.6.1 1.3.2 2 .2 4.3 0 7.9-2.8 7.9-6.3s-3.6-6.3-7.9-6.3z"/>'
             '<circle class="sol" cx="8.7" cy="11" r="1.15"/><circle class="sol" cx="12" cy="11" r="1.15"/>'
             '<circle class="sol" cx="15.3" cy="11" r="1.15"/></svg>',
    # The `quest` charge: a swallowtail banner whose notch is what stops it
    # reading as a letter P. On a building it says work is here; here it opens
    # everything that needs hands.
    "pbAttn": '<svg viewBox="0 0 24 24" aria-hidden="true">'
              '<path class="ln" d="M6.3 3.9v16.4"/>'
              '<path class="sol" d="M6.3 5.1h11.6l-3.1 3.5 3.1 3.5H6.3z"/></svg>',
    # Three withies, bent the way everything else here is bent. A straight rule
    # is the one shape on this bar that could have come from anywhere.
    "pbMore": '<svg viewBox="0 0 24 24" aria-hidden="true">'
              '<path class="ln" d="M4.4 7.3q7.6-1 15.2 0M4.4 12q7.6-1 15.2 0M4.4 16.7q7.6-1 15.2 0"/></svg>',
}

step(
    "the four glyphs",
    """ <button id="pbMap"><b>\U0001f3de</b>map</button>
 <button id="pbAsk"><b>\U0001f4ac</b>ask maia</button>
 <button id="pbAttn"><b>⚑</b>help<span class="pbadge" id="pbBadge">0</span></button>
 <button id="pbMore"><b>☰</b>more</button>""",
    f""" <button id="pbMap"><b>{NAV['pbMap']}</b>map</button>
 <button id="pbAsk"><b>{NAV['pbAsk']}</b>ask maia</button>
 <button id="pbAttn"><b>{NAV['pbAttn']}</b>help<span class="pbadge" id="pbBadge">0</span></button>
 <button id="pbMore"><b>{NAV['pbMore']}</b>more</button>""",
    'id="pbMap"><b><svg',
)

if CHECK:
    print(f"CHECK ONLY, nothing written. {HTML} would go {before} -> {len(src)} bytes ({len(src)-before:+d})")
    sys.exit(0)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(f"nav icons patched {HTML}: {before} -> {len(src)} bytes ({len(src)-before:+d})")
