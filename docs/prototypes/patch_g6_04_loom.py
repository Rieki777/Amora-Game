#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""g6.04 — THE LAST TWO ATTRIBUTE SINKS, AND THE ONE SELECTOR.

g6.01 closed the JS-string class. g6.02 closed the element and attribute sinks
it ENUMERATED. g6.03 closed the vocabulary and the four identifier attributes a
MEASUREMENT found once the poisoner stopped unhooking its own reader. Each of
those three called a class closed, and each time the next hole was in a surface
the gate had never rendered. This patch is the fourth, and the difference is
that neither of its two sinks came from reading the file: both came from the
gate being made to drive a surface it had never driven.

    :4485  drawLoomWires   data-conn="${cs}"       31-50 elements
    :2407  refreshBadges   data-bk="${s.key}"      82 elements, four sites
    :2410  refreshBadges   data-bk="${s.key}"
    :2427  refreshBadges   data-bk="${s.key}"
    :2431  refreshBadges   data-bk="${s.key}"
    :4524  the Loom hover  a CSS selector built by concatenation

Measured on the shipped g6.03 bytes, through the real restoreScene and the real
config push, with qa/verify_escaping.js driving both new surfaces:

    restoreScene / config push   113 elements   (#badges 82, #loomWires 31)
    ONE CLICK on #loomBtn         31 elements   every one inside #loomWires
    hovering the wires            31 payload handlers ran
    hovering a grip               31 uncaught SyntaxErrors

THE LOOM WIRE (:4485). `cs` is `thread:${t.id}:${ai}` and `step:${j.id}:${si}`,
so forum_threads[].id and journeys[].id reach a double-quoted attribute inside
`svg.innerHTML` with nothing in front of them. The value is not typed into that
line: drawLoomWires reads it back OUT of the grip's own `data-conn` — which
renderLoom wrote with escq — and writes it forward raw. One escape at one end of
a two-hop round trip is not an escape.

Everything else on that line is machine-made and stays as it is: `cls` is
connProv()'s return value, which is one of five string literals, and the `d`
attribute is six numbers through toFixed(1).

THE BADGE SEALS (:2407, :2410, :2427, :2431). A structure key into a
double-quoted attribute, four times, on the plane a visitor taps. This one was
NOT in any of the three earlier enumerations and it is not subtle — it is the
oldest sink in the file. It survived three passes because `refreshBadges()`
renders NOTHING after a restore: `bgEls` is built once, at column 0, by
`for(const s of SCENE.structures) makeBadgeGroup(s)`, and restoreScene rebuilds
pEls and bEls and leaves the badge groups keyed by the OLD keys, so every
structure hits `const g=bgEls[s.key]; if(!g)continue;`. The gate called it, the
host check saw #badges full of the badges BOOT drew, and the count was a zero
about a surface that had not rendered. On the real stored path there is no such
mercy: the shell serves the poisoned scene at load, boot builds the groups over
the poisoned keys, and the seals carry the payload before anyone clicks
anything.

THE HOVER (:4524) IS THE OTHER HALF OF THE LOOM SINK, and escaping the wire
does not touch it:

    const sel=`#loomWires .lw[data-conn="${g.dataset.conn}"]`;
    const p=document.querySelector(sel);

That is a founder string concatenated into a CSS selector. One double quote in a
thread id and querySelector throws a SyntaxError out of a pointerover listener
that nobody catches — the highlight stops working and the page collects an
uncaught error per hover. It is the same failure class as question 5 in the gate
(an inline handler that stopped compiling): not a look that is spoiled, a thing
that no longer works.

It could be escaped — CSS.escape is the third escape for the third context — but
the value never has to be a selector at all. The wires carry the same id in
their own dataset, so the line compares two strings instead of compiling one.
That is strictly better than a third escape: nothing to get wrong, nothing to
keep in step with the other two, and the id stays byte-exact on both sides of
the comparison.

NO ABSORBER FOR EITHER, AND THAT IS THE SAME DECISION g6.03 MADE AND WROTE
DOWN. Both values are IDENTIFIERS and both are read straight back out of the
DOM to address a row:

    data-bk    :2586 `BY[seal.dataset.bk]`, :2894 the same, :2897
               `homeSheet(h.dataset.bk)` — the badge you tap opens the place it
               names, or it opens nothing.
    data-conn  drawLoomWires reads the grip's, the hover match reads the wire's,
               and parseConn() splits it on ':' to reach a thread or a step.

A colour has a shape and a subtype has a shape, so both are held at the door. An
identifier's only shape is that it must come back BYTE-EXACT, and a normaliser
that touched one would break the reference this same escape exists to preserve.
So: escaped at the reader, untouched at the door, and BOTH round trips are
asserted byte-exact in the gate's over-escaping section — data-bk through
`BY[...]`, data-conn through both hops and then through the hover match, which
is the only reader of the wire's copy.

escq and only escq. Neither site is a JS string; escj outside one ships a
backslash into the reader's text, which is the rule g6.02 wrote down.

WHAT IS DELIBERATELY LEFT ALONE. `data-bkind="${m.kind}"` beside the same sink
is one of four literals from the badge builder. `--btint:${m.tint}` is
CIRCLE_COL[...] or '', a const table a stored scene cannot extend. The `d`
attribute on the wire is arithmetic. `staked &amp; pooled` in the Housing room
is hand-written HTML that escq would double-encode into a visible entity, and
the gate asserts it intact.

ORDER: after g6.01, g6.02 and g6.03. It touches no line any of them wrote.

Re-runnable: every edit is guarded on its own, the RESULT is tested before the
ANCHOR, and a second run is all skips and zero bytes.
"""
import io, os, sys, hashlib

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'grounds-v0.html')


def say(s):
    """Print without assuming the operator's console speaks Unicode.

    Same helper as g6.01 through g6.03: one edit name carries a character
    cp1252 has no glyph for, and a UnicodeEncodeError on the PRINT would leave a
    run that wrote its bytes and could not report them.
    """
    enc = getattr(sys.stdout, 'encoding', None) or 'ascii'
    sys.stdout.write(s.encode(enc, 'replace').decode(enc, 'replace') + '\n')


EDITS = []


def edit(name, old, new, count=1):
    EDITS.append((name, old, new, count))


# ===================== THE LOOM =====================

edit('the Loom wire: a thread id and a journey id into a double-quoted attribute (:4485, escq)',
  """    out+=`<path class="lw ${cls}" data-conn="${cs}" d="M """,
  """    out+=`<path class="lw ${cls}" data-conn="${escq(cs)}" d="M """)

# The value never has to be a selector. Comparing the two datasets keeps the
# identifier byte-exact on both sides and removes the third escape entirely.
edit('the Loom hover: match the connection id, do not compile it into a selector (:4524)',
  """  const sel=`#loomWires .lw[data-conn="${g.dataset.conn}"]`;
  const p=document.querySelector(sel);if(p)p.classList.add('hi')});""",
  """  /* MATCHED, NOT INTERPOLATED (g6.04). `g.dataset.conn` carries the founder's
     forum thread id or journey id, and this line used to concatenate it into a
     CSS selector: one double quote in an id and querySelector throws a
     SyntaxError out of a listener nobody catches, so hovering the Loom on a
     stored scene killed the highlight and put an uncaught error on the page
     every time. The wires carry the same id in their own dataset, so compare
     the strings. Nothing to escape, nothing to keep in step, and the id stays
     byte-exact on both sides. */
  const cs=g.dataset.conn;let p=null;
  document.querySelectorAll('#loomWires .lw').forEach(x=>{if(!p&&x.dataset.conn===cs)p=x});
  if(p)p.classList.add('hi')});""")


# ===================== THE BADGE PLANE =====================
# Four sites, one value: the structure key, in a double-quoted attribute, read
# back at :2586, :2894 and :2897 to open the place the seal names.

edit('the badge seal: the structure key it hands back to BY[] (:2407, escq)',
  """        return `<span class="${cls}" data-bk="${s.key}" data-bkind="${m.kind}"${tint}>`+""",
  """        return `<span class="${cls}" data-bk="${escq(s.key)}" data-bkind="${m.kind}"${tint}>`+""")

edit('the count seal beside it (:2410, escq)',
  """      `<span class="bseal b-more" data-bk="${s.key}" data-bkind="more"><svg viewBox="0 0 24 24">`+""",
  """      `<span class="bseal b-more" data-bk="${escq(s.key)}" data-bkind="more"><svg viewBox="0 0 24 24">`+""")

edit('the far seal, which is the one a visitor sees before anything else (:2427, escq)',
  """        `<span class="aseal${soon<=2?' soon':''}" data-bk="${s.key}"><svg viewBox="0 0 24 24">`+""",
  """        `<span class="aseal${soon<=2?' soon':''}" data-bk="${escq(s.key)}"><svg viewBox="0 0 24 24">`+""")

edit('the home chip, whose key goes straight to homeSheet() (:2431, escq)',
  """        `<span class="hchip" data-bk="${s.key}"><svg viewBox="0 0 24 24">`+""",
  """        `<span class="hchip" data-bk="${escq(s.key)}"><svg viewBox="0 0 24 24">`+""")


def main():
    if not os.path.exists(TARGET):
        sys.exit('no artifact at ' + TARGET)
    src = io.open(TARGET, encoding='utf-8', newline='').read()
    before = src
    n_apply = n_skip = 0
    gone = []

    for name, old, new, count in EDITS:
        # GUARD PER EDIT, three outcomes rather than two, and THE RESULT IS
        # TESTED BEFORE THE ANCHOR. Several lanes work this artifact at once, so
        # "anchor absent, result absent" means the site MOVED OR WENT AWAY:
        # recorded, printed under its own heading, and the run exits non-zero so
        # nobody reads it as clean.
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
        say('  apply  ' + name + ('' if count == 1 else '  (x%d)' % count))
        n_apply += 1

    if src == before:
        say('\n%d applied, %d skipped, %d gone. 0 bytes written.'
            % (n_apply, n_skip, len(gone)))
    else:
        with io.open(TARGET, 'w', encoding='utf-8', newline='') as f:
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
