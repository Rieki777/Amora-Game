# -*- coding: utf-8 -*-
"""I6 stopped being able to see the break it was written for, and the breaker
said so on the first run after the strip landed.

WHAT HAPPENED. `the claim attribute loses its JS escape` swaps escja for escq
in the concierge's claim link, so a quest named `');window.__JS=1;('` closes
the JS string inside the onclick. I6 measured EXECUTIONS, and with the new
attribute strip in maiaClean nothing executes any more: the broken value no
longer matches MSAY_ON_OK, so the handler is removed and the anchor arrives
inert. Layer two now holds when layer one breaks, which is the entire point of
having two, and the price is that the row went

    the claim attribute loses its JS escape   81   SILENT  I5,J3b   MISSING I6

I6 is not wrong. It is now guarded by two defences and can no longer tell them
apart, which is the same "two defences, one observation" defect section J was
built to end, arriving from the other direction.

THE FIX IS A CHECK OVER LAYER ONE ALONE. I6b spies on maiaClean and reads the
STRING the concierge handed it, before any strip touches it, and asserts the
raw closer never appears there. It cannot be satisfied by layer two, because
layer two runs after it. It also asserts the payload DID reach the parser, so
a concierge that answered with something else entirely reads as a failure
rather than as a clean pass.

The two knock-on reds are worth naming rather than requiring:
  I5   the claim link no longer has an onclick, because the strip took it
  J3b  and the strip says so, which is the dock losing a control it wrote
Those are layer two working. The row is about layer one, so the row requires
the layer-one check.
"""
import io, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SUITE = os.path.join(HERE, "qa", "verify_maia_journey.js")
BREAKER = os.path.join(HERE, "qa", "break_maia_journey.py")

SUITE_EDITS = [
    # The spy, installed around the drive that is already there.
    ("""  const i5 = await page.evaluate(async () => {
    window.__JS = 0;
    const q = SCENE.quests[0];
    if (!q) return { drove: false };""",
     """  const i5 = await page.evaluate(async () => {
    window.__JS = 0;
    /* THE STRING THE PARSER WAS HANDED, kept so layer one can be read on its
       own. Without this the only observable is "did it execute", and since
       maiaClean started stripping handlers that answers NO whether escja works
       or not. Same spy as section J, same reason. */
    const realClean = window.maiaClean;
    window.__SEEN2 = [];
    window.maiaClean = function (h) { window.__SEEN2.push(String(h)); return realClean(h); };
    const q = SCENE.quests[0];
    if (!q) { window.maiaClean = realClean; return { drove: false }; }"""),

    ("""    const a = document.querySelector('#maiaLog a[onclick]');
    if (a) a.click();
    await new Promise(r => setTimeout(r, 400));
    return { drove: true, hasAnchor: !!a, attr: a ? a.getAttribute('onclick') : '', fired: window.__JS || 0 };
  });""",
     """    const a = document.querySelector('#maiaLog a[onclick]');
    if (a) a.click();
    await new Promise(r => setTimeout(r, 400));
    window.maiaClean = realClean;
    return { drove: true, hasAnchor: !!a, attr: a ? a.getAttribute('onclick') : '', fired: window.__JS || 0,
             handed: (window.__SEEN2 || []).join('\\n') };
  });"""),

    ("""  ok(i5.fired === 0, `I6: and a quest name cannot close the JS string inside its attribute (${i5.fired} executions)`);""",
     """  ok(i5.fired === 0, `I6: and a quest name cannot close the JS string inside its attribute (${i5.fired} executions)`);

  /* I6b. LAYER ONE ON ITS OWN, and it exists because I6 stopped being able to
     see the break it was written for. I6 measures EXECUTIONS, and maiaClean
     now strips a handler whose value is not one this file writes, so a broken
     escja produces an inert anchor rather than a live one and nothing executes
     either way. Two defences, one observation, exactly the shape section J was
     built to end. This reads the string the concierge handed the parser,
     before any strip touches it, so layer two cannot satisfy it.

     AND IT ASSERTS THE PAYLOAD ARRIVED. "no raw closer in the string" is also
     what an empty string reports, and what a concierge that answered about
     something else entirely reports. */
  const i6raw = i5.handed ? i5.handed.indexOf("');window.__JS=1;('") >= 0 : false;
  const i6saw = !!(i5.handed && i5.handed.indexOf('claimQuest(') >= 0 && i5.handed.indexOf('window.__JS') >= 0);
  ok(i6saw && !i6raw,
    `I6b: LAYER ONE. the quest name reaches the parser with its quotes already escaped (payload reached it=${i6saw}, raw closer present=${i6raw})`);"""),

    (" *   claim attribute loses escja        -> I6\n",
     " *   claim attribute loses escja        -> I6b, and I5 and J3b as\n"
     " *     knock-ons: layer two strips the broken handler, so the link\n"
     " *     arrives inert and I6 sees nothing execute either way\n"),

    ("  const EXPECTED = 81;", "  const EXPECTED = 82;"),
]

BREAKER_EDITS = [
    ("""    ("the claim attribute loses its JS escape",
     ("<a onclick=\\"claimQuest('${escja(best.q)}','${escja(nm)}')\\">",
      "<a onclick=\\"claimQuest('${escq(best.q)}','${escq(nm)}')\\">"),
     ["I6"]),""",
     """    # THIS ROW MOVED WHEN LAYER TWO ARRIVED, and it moved for a good reason.
    # I6 measures executions. maiaClean now strips a handler whose value is not
    # one this file writes, so a broken escja produces an INERT anchor and I6
    # reads zero executions whether escaping works or not. The first run after
    # the strip landed reported exactly that:
    #   the claim attribute loses its JS escape  81  SILENT  I5,J3b  MISSING I6
    # I6b reads the string the parser was handed, before any strip, so it is
    # the one that can still see layer one. I5 and J3b go red too and are NOT
    # required: I5 because the anchor lost its onclick, J3b because the strip
    # records that the dock lost a control it wrote. Those are layer two doing
    # its job, and requiring them would make this row red for something that is
    # not the escaping.
    ("the claim attribute loses its JS escape",
     ("<a onclick=\\"claimQuest('${escja(best.q)}','${escja(nm)}')\\">",
      "<a onclick=\\"claimQuest('${escq(best.q)}','${escq(nm)}')\\">"),
     ["I6b"]),"""),
]


def apply(path, edits, label, guard=None):
    # Guard added on the 2026-08-22 replay onto main a897583: the regeneration
    # rebuilds the ARTIFACT from main's bytes, while these qa files ride the
    # rebase already carrying I6b and the moved breaker row. A file that
    # already holds them is left alone; the marker checks below still read it.
    s = io.open(path, encoding="utf-8").read()
    if guard is not None and guard in s:
        print("skip %s (already present)" % label)
        return s
    for i, (find, repl) in enumerate(edits, 1):
        n = s.count(find)
        if n != 1:
            sys.exit("ABORT: %s edit %d anchor found %d times, expected 1.\n---\n%s\n---"
                     % (label, i, n, find[:260]))
        s = s.replace(find, repl, 1)
    io.open(path, "w", encoding="utf-8", newline="").write(s)
    return s


suite = apply(SUITE, SUITE_EDITS, "suite", guard="`I6b: LAYER ONE.")
breaker = apply(BREAKER, BREAKER_EDITS, "breaker", guard='["I6b"]),')

for m in ("`I6b: LAYER ONE.", "window.__SEEN2 = [];", "handed: (window.__SEEN2 || []).join(",
          "const EXPECTED = 82;", "-> I6b, and I5 and J3b as"):
    if m not in suite:
        sys.exit("ABORT: suite marker missing: " + m)
if '["I6b"]' not in breaker or '["I6"]),' in breaker:
    sys.exit("ABORT: breaker expectation not rewritten")
print("I6b added; breaker row now requires I6b")
