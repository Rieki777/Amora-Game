#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""g6.05 (census) — THE EIGHTH SILENT ZERO, AND IT IS INSIDE THE SEVENTH'S FIX.

MEASURED, NOT ARGUED. patch_g6_05_gate.py's second change teaches the renderer
census to follow a decorated global to its declaration, because :6789 rebinds
`openPanel` and the census could therefore neither drive it nor declare it —
ABSENT, the one outcome that census exists to make impossible. That repair
works: with it the census reads `30 of 36 wrote … 1 reachable only through a
decorator: openPanel`, and neutering just the REBIND (keeping `found.push`)
takes it red with `openPanel  (never called at all)`.

Then disable the repair's regex — one control, `while (false && …)` — and the
whole gate comes back:

    PASS every renderer in the artifact is driven by this gate (29 of 35 wrote; 6 declared not-driven)
    ESCAPING: ALL GREEN

35 instead of 36, openPanel silently gone from the population, exit 0. **The
scan that finds nothing reports what the scan that found everything reports.**
That is shape 1 of this round's list — a guard naming something that is not
there — living inside the fix for shape 7, which is the fifth time in this lane
that a fix has exposed the next one.

WHY IT MATTERS BEYOND THE CONTROL. `dre` is a regex over the artifact's own
script text. A lane that renames the decorator's temporary, drops the `const`,
or moves the rebind onto a new line takes the match count to zero, and every
number after it is taken over a population that quietly lost a renderer. The
census is the only instrument in this gate whose POPULATION IS DISCOVERED rather
than declared; `__PLANT_FIELDS` and `__RENDERERS_NOT_DRIVEN` both fail in two
directions precisely so a declaration cannot rot behind the code, and the
discovery step had no such floor.

WHAT THIS ASSERTS: `CENSUS.hidden` is not empty. This artifact provably carries
a decorator at :6789 and the function under it provably writes HTML, so an empty
`hidden` is the chain having broken somewhere — the regex matched nothing, the
declaration could not be located, or the HTML-write test stopped matching. It is
deliberately NOT a count assertion on `found`: eight lanes add functions to this
file, and a two-directional equality on 36 would be red every day for reasons
that have nothing to do with escaping, which is how a ratchet becomes a shrug
(see the deep variant's cap, same README).

WHY `hidden` AND NOT A RAW MATCH COUNT. The first draft counted `dre` matches
inside the loop and carried the number out. It was strictly weaker — three
matches all filtered out would have passed it — and it also broke the lane's
one-owner-per-line rule: every one of those insertions landed INSIDE the block
patch_g6_05_gate.py writes, so re-running THAT patch reported GONE and exited 3.
Two patches must not both claim one line. This version touches one line the gate
patch does not own, and `hidden` is the end of the chain rather than its start.

WHAT IT STILL CANNOT SEE, written down instead of implied. `dre` matches ONE
decoration syntax: `const _x = y; y = function`. A decorator written
`y = (function(o){…})(y)`, or with `let`, or as an arrow, is not matched, is not
counted, and a renderer hidden behind it is absent from the population with this
check green — as long as the openPanel one still matches. Closing that needs the
syntax-independent form — every `\\nfunction NAME(` in the text whose
`window[NAME].toString()` is not that declaration — and it is a bigger edit than
this one; it is named here so the next lane inherits a limit rather than a
belief.

SEEN TO FAIL FIRST: rebuild the `while (false && …)` control against the PATCHED
gate and it goes red naming the scan, where against the shipped gate it was ALL
GREEN. Both runs are in the report.

ORDER: after patch_g6_05_gate.py, whose lines it reads and does not move.

Re-runnable: the edit is guarded, the RESULT is tested before the ANCHOR, and a
second run is all skips and zero bytes. Re-running patch_g6_05_gate.py and
patch_g6_05_selectors.py after this one is still all skips and zero bytes, which
is the property the first draft broke and is worth re-checking after any change
here.
"""
import io, os, sys, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
GATE = os.path.join(HERE, 'qa', 'verify_escaping.js')


def say(s):
    """Print without assuming the operator's console speaks Unicode."""
    enc = getattr(sys.stdout, 'encoding', None) or 'ascii'
    sys.stdout.write(s.encode(enc, 'replace').decode(enc, 'replace') + '\n')


EDITS = []


def edit(name, old, new, count=1):
    EDITS.append((name, old, new, count))


def _nl(text, crlf):
    """Match and write in the file's OWN line endings.

    verify_escaping.js is CRLF and the artifact is not. patch_g6_05_gate.py
    learned this the expensive way — four multi-line anchors reported GONE and
    the three that landed wrote LF into a CRLF file — so anchors are written
    with \\n here and translated once.
    """
    return text.replace('\n', '\r\n') if crlf else text


edit('the decorator scan must not come back empty',
  """  ok(CENSUS.rotten.length === 0 && CENSUS.phantom.length === 0,""",
  """  /* THE POPULATION IS DISCOVERED, SO THE DISCOVERY NEEDS A FLOOR (g6.05).
     Every other list in this gate is DECLARED and fails in both directions; the
     renderer census finds its own population by scanning the artifact's script
     text for decorated globals, and a scan that matches nothing hands the count
     above a population that quietly lost a renderer. MEASURED: disable the
     regex in __instrumentRenderers and the line above reads `29 of 35 wrote`
     and the gate exits 0, with openPanel gone from the census entirely.
     `hidden` is the END of that chain, not its start — a name only lands there
     after the regex matched it, its column-0 declaration was located, and that
     declaration tested as an HTML writer — so this covers all three failures
     with one number. NOT an assertion on `found`: that stays free to grow,
     because eight lanes add functions to this file.
     LIMIT, so the next lane inherits it rather than a belief: the regex knows
     ONE syntax, `const _x = y; y = function`. A decorator written any other way
     is not matched, and a renderer behind it is absent from the population with
     this check green. */
  ok(CENSUS.hidden && CENSUS.hidden.length > 0,
    `the decorator scan reached the decorated renderer this artifact carries (${(CENSUS.hidden || []).length}: ${(CENSUS.hidden || []).join(', ') || 'NONE'})` +
    ((CENSUS.hidden || []).length ? '' : '\\n       FOUND NOTHING — and a file with no decorators looks exactly like this.\\n       :6789 rebinds openPanel and openPanel writes markup, so if that is still true the scan in\\n       __instrumentRenderers has rotted and every renderer count above was taken over a population\\n       missing whatever it hid.'));
  ok(CENSUS.rotten.length === 0 && CENSUS.phantom.length === 0,""")


def main():
    if not os.path.exists(GATE):
        sys.exit('no gate at ' + GATE)
    src = io.open(GATE, encoding='utf-8', newline='').read()
    before = src
    crlf = src.count('\r\n') > 0
    n_apply = n_skip = 0
    gone = []

    for name, old, new, count in EDITS:
        old, new = _nl(old, crlf), _nl(new, crlf)
        # GUARD PER EDIT, three outcomes, and THE RESULT IS TESTED BEFORE THE
        # ANCHOR: "anchor absent, result absent" means the site MOVED, which is
        # printed under its own heading and exits non-zero.
        if new in src:
            say('  skip   ' + name)
            n_skip += 1
            continue
        if old not in src:
            say('  GONE   ' + name)
            gone.append(name)
            continue
        got = src.count(old)
        assert got == count, ('anchor count wrong for "%s": expected %d, found %d'
                              % (name, count, got))
        src = src.replace(old, new)
        say('  apply  ' + name)
        n_apply += 1

    if src == before:
        say('\n%d applied, %d skipped, %d gone. 0 bytes written.'
            % (n_apply, n_skip, len(gone)))
    else:
        with io.open(GATE, 'w', encoding='utf-8', newline='') as f:
            f.write(src)
        say('\n%d applied, %d skipped, %d gone. %d -> %d bytes (%+d).'
            % (n_apply, n_skip, len(gone), len(before.encode('utf-8')),
               len(src.encode('utf-8')),
               len(src.encode('utf-8')) - len(before.encode('utf-8'))))
        say('sha256 ' + hashlib.sha256(src.encode('utf-8')).hexdigest()[:16])
    if gone:
        say('\nSITES THAT MOVED OR WENT AWAY - read each one before believing this run:')
        for g in gone:
            say('  - ' + g)
        sys.exit(3)


if __name__ == '__main__':
    main()
