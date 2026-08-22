# -*- coding: utf-8 -*-
"""Renumber the second-layer checks so the printed order runs forwards.

J6 had to be READ before J4, because J4 hands maiaClean its own
`<button onclick="void 0">` and the record J6 reads would otherwise count the
experiment's own leavings. Moving the read left the printed sequence going
J1 J2 J3 J6 J4 J5 J7, which is a small thing that costs a reader a double
take every time they scan a failing run. Names are labels; the order they
print in is the interface.

  record read before J4        J6  -> J3b
  the element survives         J7  -> J6
  no live handler survives     J7b -> J6b
  the record says what it took J7c -> J6c
  style, marquee, details      J8  -> J7

The variables go with them, and the two breaker expectations that name these
checks are rewritten in the same pass: a renamed check with a stale expectation
is a mutation that proves nothing while printing a full check count.
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SUITE = os.path.join(HERE, "qa", "verify_maia_journey.js")
BREAKER = os.path.join(HERE, "qa", "break_maia_journey.py")

# (path, [(find, expected_count, replace), ...])
SUITE_EDITS = [
    ("const j6 = await page.evaluate(() => (window.MSAY_STRIPPED || []).slice());", 1,
     "const jrec = await page.evaluate(() => (window.MSAY_STRIPPED || []).slice());"),
    ("  ok(j6.length === 0,\n"
     "    `J6: nothing the dock wrote for itself was stripped by the handler allowlist "
     "(${j6.length}${j6.length ? ': ' + j6.join(' ') : ''})`);", 1,
     "  ok(jrec.length === 0,\n"
     "    `J3b: nothing the dock wrote for itself was stripped by the handler allowlist "
     "(${jrec.length}${jrec.length ? ': ' + jrec.join(' ') : ''})`);"),
    ("  /* J6. THE ALLOWLIST'S OWN POSITIVE CONTROL", 1,
     "  /* J3b. THE ALLOWLIST'S OWN POSITIVE CONTROL"),

    ("  /* J7. LAYER TWO AGAINST ATTRIBUTES", 1, "  /* J6. LAYER TWO AGAINST ATTRIBUTES"),
    ("  const j7 = await page.evaluate(async () => {", 1,
     "  const jattr = await page.evaluate(async () => {"),
    ("  ok(j7.kept && j7.text === 'hover me',\n"
     "    `J7: the element itself is still kept, so the village still reads what it wrote "
     '("${j7.text}")`);', 1,
     "  ok(jattr.kept && jattr.text === 'hover me',\n"
     "    `J6: the element itself is still kept, so the village still reads what it wrote "
     '("${jattr.text}")`);'),
    ("  ok(j7.fired === 0 && j7.on && j7.on.length === 0,\n"
     "    `J7b: and no live handler survives the parse, driven by a real mouseover and a real click "
     "(fired=${j7.fired}, on=${JSON.stringify(j7.on)})`);", 1,
     "  ok(jattr.fired === 0 && jattr.on && jattr.on.length === 0,\n"
     "    `J6b: and no live handler survives the parse, driven by a real mouseover and a real click "
     "(fired=${jattr.fired}, on=${JSON.stringify(jattr.on)})`);"),
    ("  ok(j7.took.length === 2,\n"
     "    `J7c: and the strip says what it took, which is what makes J6's empty list mean something "
     "(${JSON.stringify(j7.took)})`);", 1,
     "  ok(jattr.took.length === 2,\n"
     "    `J6c: and the strip says what it took, which is what makes J3b's empty list mean something "
     "(${JSON.stringify(jattr.took)})`);"),

    ("  /* J8. The three elements that were missing from MSAY_BAN.", 1,
     "  /* J7. The three elements that were missing from MSAY_BAN."),
    ("  const j8 = await page.evaluate(() => {", 1, "  const jban = await page.evaluate(() => {"),
    ("  ok(j8.style === 0 && j8.marquee === 0 && j8.details === 0 && j8.b === 1,\n"
     "    `J8: style, marquee and details go too, and the text beside them stays "
     "(style=${j8.style}, marquee=${j8.marquee}, details=${j8.details}, b=${j8.b})`);", 1,
     "  ok(jban.style === 0 && jban.marquee === 0 && jban.details === 0 && jban.b === 1,\n"
     "    `J7: style, marquee and details go too, and the text beside them stays "
     "(style=${jban.style}, marquee=${jban.marquee}, details=${jban.details}, b=${jban.b})`);"),

    (" *   MSAY_BAN loses <style>             -> J8\n"
     " *   maiaClean stops reading attributes -> J7b\n", 1,
     " *   MSAY_BAN loses <style>             -> J7\n"
     " *   maiaClean stops reading attributes -> J6b\n"),

    ("             return { style: probe.querySelectorAll('style').length,", 0, None),
]

BREAKER_EDITS = [
    ('      ",track,marquee,details\';"),\n     ["J8"]),', 1,
     '      ",track,marquee,details\';"),\n     ["J7"]),'),
    ('      ""),\n     ["J7b"]),', 1,
     '      ""),\n     ["J6b"]),'),
]


def apply(path, edits, label):
    s = io.open(path, encoding="utf-8").read()
    for find, want, repl in edits:
        n = s.count(find)
        if n != want:
            sys.exit("ABORT: %s anchor found %d times, expected %d.\n---\n%s\n---"
                     % (label, n, want, find[:220]))
        if repl is not None:
            s = s.replace(find, repl, 1)
    io.open(path, "w", encoding="utf-8", newline="").write(s)
    return s


suite = apply(SUITE, [e for e in SUITE_EDITS if e[1] == 1], "suite")
breaker = apply(BREAKER, BREAKER_EDITS, "breaker")

# The old names must be gone from every place that PRINTS or EXPECTS one.
for stale in ("`J6: nothing the dock", "`J7: the element itself", "`J7b: and no live",
              "`J7c: and the strip", "`J8: style, marquee", '["J8"]', '["J7b"]',
              "-> J8", "-> J7b"):
    if stale in suite or stale in breaker:
        sys.exit("ABORT: a stale name survived: " + stale)

for fresh in ("`J3b: nothing the dock", "`J6: the element itself", "`J6b: and no live",
              "`J6c: and the strip", "`J7: style, marquee"):
    if fresh not in suite:
        sys.exit("ABORT: new name missing: " + fresh)
for fresh in ('["J7"]', '["J6b"]'):
    if fresh not in breaker:
        sys.exit("ABORT: new expectation missing: " + fresh)

print("renumbered: J6->J3b, J7->J6, J7b->J6b, J7c->J6c, J8->J7")
print("breaker expectations rewritten to match")
