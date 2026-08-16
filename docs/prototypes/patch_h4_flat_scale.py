#!/usr/bin/env python3
"""
L4b / R16 -- per-icon scale reaches the FLAT emblem arm.

MEASURED PROBLEM (drove the real #iScale slider over CDP, ratio of drawn
transform at slider 200 vs slider 100, so a fallback cannot hide the result):

    mode     state       ratio    verdict
    painted  active      2.000    works
    painted  blueprint   1.000    NO-OP
    auto     any, z<1.05 1.000    NO-OP
    auto     any, z>=1.05 2.000   works   (gate boundary bisected: 1.04 dead, 1.06 live)
    iso      non-blueprint 2.000  works
    flat     everything  1.000    NO-OP   (every state, every zoom)

All four dead regions are the same single branch. The draw path has three
arms and only two of them carry `sc`:

    painted -> k*1.35*sc
    iso     -> k*1.35*sc
    flat    -> k*(window.GSCALE||1)          <-- s.scale dropped here

The flat arm is reached when iconMode is 'flat', when iconMode is 'auto'
below the 1.05 iso gate, whenever a structure is in the 'blueprint' state
(both `painted` and `iso` test state!=='blueprint'), and in painted mode
when a sprite family is missing or SPRITE_OK is false.

A second symptom falls out of the same line: hitStruct and the canvas
figures read (s.scale||1) with NO flat arm, so in flat mode the click
target grew from 28px to 72px while the icon stayed frozen at 0.98 --
an invisible hit target. Feeding the dial to the draw arm makes the two
agree again.

WHAT THIS CHANGES: the flat arm gains the founder's own dial and NOT the
FAM_SCALE family bias. Every structure ships s.scale undefined, so
(s.scale||1) is 1 and no default scene moves by a single pixel; only a
building whose slider a founder actually dragged changes. Pulling FAM_SCALE
into the flat arm as well would resize every emblem in Emblems mode and in
auto-far, which is a look change nobody asked for.

`sc` is left byte-identical so the painted and iso arms keep their exact
float association.

Re-runnable: every edit is guarded on its own, applies once, then skips.
"""
import hashlib
import io
import os
import sys

ART = os.path.join(os.path.dirname(os.path.abspath(__file__)), "grounds-v0.html")

SC_DECL = (
    "      const sc=((typeof FAM_SCALE!=='undefined'&&FAM_SCALE[fam])||1)"
    "*(s.scale||1)*(window.GSCALE||1);\n"
)
PSC_DECL = (
    "      const psc=(s.scale||1)*(window.GSCALE||1);"
    " // the founder's own size dial. The flat arm below used to drop it.\n"
)

# (label, find, replace, expected count of `find`, DONE marker)
#
# The done marker is a string present if and only if the edit has already
# landed. It must NOT be inferrable from `find`/`repl` containment: edit 1's
# replacement CONTAINS its own anchor, so a "repl in text" guard re-applies it
# forever and check_blocks.mjs reports "Identifier 'psc' has already been
# declared". Each edit carries its own explicit marker instead.
EDITS = [
    (
        "declare psc beside sc",
        SC_DECL,
        SC_DECL + PSC_DECL,
        1,
        "const psc=(s.scale||1)*(window.GSCALE||1);",
    ),
    (
        "crown offset: flat arm honours the dial",
        "k*30*(window.GSCALE||1)",
        "k*30*psc",
        1,
        "k*30*psc",
    ),
    (
        "icon transform: flat arm honours the dial",
        "k*(window.GSCALE||1)",
        "k*psc",
        1,
        "scale(${(iso||painted)?k*1.35*sc:k*psc})",
    ),
]


def main():
    raw = io.open(ART, "r", encoding="utf-8", newline="").read()
    before_sha = hashlib.sha256(raw.encode("utf-8")).hexdigest()
    before_len = len(raw.encode("utf-8"))
    text = raw
    applied = skipped = 0

    for label, find, repl, want, done in EDITS:
        if done in text:
            print(f"  SKIP  {label} (already applied)")
            skipped += 1
            continue
        n = text.count(find)
        assert n == want, (
            f"anchor count for {label!r}: expected {want}, found {n}. "
            "Refusing to patch a file that is not the one this script was written against."
        )
        text = text.replace(find, repl, 1)
        print(f"  APPLY {label}")
        applied += 1

    # A real assert on the RESULT, not on the anchors: the flat arm must now
    # read the dial, and the painted/iso arms must be untouched.
    assert "const psc=(s.scale||1)*(window.GSCALE||1);" in text, "psc was never declared"
    assert "k*30*psc" in text, "crown offset flat arm did not take the dial"
    assert "scale(${(iso||painted)?k*1.35*sc:k*psc})" in text, "transform flat arm did not take the dial"
    assert text.count(
        "const sc=((typeof FAM_SCALE!=='undefined'&&FAM_SCALE[fam])||1)*(s.scale||1)*(window.GSCALE||1);"
    ) == 1, "sc declaration was disturbed"
    assert "k*1.35*sc*54" in text and "k*1.35*sc*34" in text, "painted/iso crown arms were disturbed"

    if text != raw:
        with io.open(ART, "w", encoding="utf-8", newline="") as f:
            f.write(text)

    after = io.open(ART, "rb").read()
    print(f"  applied={applied} skipped={skipped}")
    print(f"  bytes {before_len} -> {len(after)} (delta {len(after)-before_len})")
    print(f"  sha256 {before_sha[:16]} -> {hashlib.sha256(after).hexdigest()[:16]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
