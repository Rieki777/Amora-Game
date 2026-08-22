#!/usr/bin/env python3
"""Copy pass R5, group 10: the amber "guess" chip reads "suggested" in public.

The Loom's provenance taxonomy (creator / resolver / pool) is engine
vocabulary, and its public face was the word "guess" - compiler internals
dressed as UI (census 1.21, worst offender 5). The public label is
"suggested" now, everywhere a visitor meets the amber chip. Provenance
SEMANTICS are untouched: addr values ('resolver-guess', 'creator', 'pool'),
classify(), the export vocabulary, and the .achip.guess CSS class are
machinery and keep their names, so saved maps and exports stay compatible.

Census refs: :956-958 filter chips, :970-980 engine explainer step 4,
:1066-1068 resolver panel note, :4279 quest address line, :4290 created
toast, :5148 loom row label, :5170 provenance chips, :5199 row grip chip,
:5321 loom-open toast, plus the sorting-engine step detail (:4264) the
census bundled into the explainer rows.

Kept: the journeys' _why "a suggestion, unapproved..." (:1392/:1402) already
uses this word; "creator" and "pool" chips keep their names - this group's
ruling covers only the guess label.

House protocol: exact-count anchors, refuse on any count that is not 1,
idempotent (a rerun finds every new string already present, writes nothing).
Usage: python3 patch_copy_10_guess_to_suggested.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()
before = len(src)
skipped = 0


def swap(old, new, count=1):
    """Replace old with new, refusing on a wrong count. Already-applied edits
    (old absent, new present) are skipped so a rerun writes zero bytes."""
    global src, skipped
    n = src.count(old)
    if n == 0 and new in src:
        skipped += 1
        return
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


# -- 1. The Loom filter chip (census :957) --------------------------------
swap(
    '<button class="lchip lfp pr" data-p="resolver" title="a guess with a label. Always yours to move.">guesses</button>',
    '<button class="lchip lfp pr" data-p="resolver" title="suggested from the words. Always yours to move.">suggested</button>',
)

# -- 2. The engine explainer, step 4 (census :975) ------------------------
swap(
    '(<span style="color:#e0a34e">amber</span>: a guess, always yours to move)',
    '(<span style="color:#e0a34e">amber</span>: suggested, always yours to move)',
)

# -- 3. The resolver panel note (census :1067) ----------------------------
swap(
    "Same words in, same home out. No AI, no dice. Every guess wears a label, and your correction is what sticks.",
    "Same words in, same home out. No AI, no dice. Every suggestion wears a label, and your correction is what sticks.",
)

# -- 4. The sorting-engine step detail (census 1.21) ----------------------
swap(
    "(score ${bestScore})${tie}. A guess, yours to move`",
    "(score ${bestScore})${tie}. Suggested, yours to move`",
)

# -- 5. The quest address line (census :4279) -----------------------------
swap(
    "${r.guessed?' <span style=\"color:#e0a34e;font-size:10px\">· a guess</span>':''}",
    "${r.guessed?' <span style=\"color:#e0a34e;font-size:10px\">· suggested</span>':''}",
)

# -- 6. The created toast (census :4290) ----------------------------------
swap(
    "${r.guessed?'A guess for now; move it any time in the inspect card':'Placed'}",
    "${r.guessed?'Suggested for now; move it any time in the inspect card':'Placed'}",
)

# -- 7. The loom row's resolved name (census :5148) -----------------------
swap(
    "(t._res?atName(t._res.key)+' (guess)':'the Board')",
    "(t._res?atName(t._res.key)+' (suggested)':'the Board')",
)

# -- 8. The provenance chips on rows (census :5170) -----------------------
swap(
    "p==='resolver'?'<span class=\"lprov r\">guess</span>'",
    "p==='resolver'?'<span class=\"lprov r\">suggested</span>'",
)

# -- 9. The row grip chip (census :5199) ----------------------------------
swap(
    "escq(atName(t._res.key))+' · a guess'",
    "escq(atName(t._res.key))+' · suggested'",
)

# -- 10. The loom-open toast (census :5321) -------------------------------
swap(
    "toast('The Loom. Gold is your word, amber is a guess, gray waits at the Board. Drag any ◉ grip.')",
    "toast('The Loom. Gold is your word, amber is suggested, gray waits at the Board. Drag any ◉ grip.')",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(
    f"copy-10 guess->suggested patched {HTML}: {before} -> {len(src)} bytes "
    f"({len(src)-before:+d}), {skipped} edit(s) already applied"
)
