#!/usr/bin/env python3
r"""
L8 / R17 — A FLOOR THE BAND CANNOT MEASURE IS NOT A FLOOR AT ZERO.

HOW IT WAS FOUND, and it is worth the paragraph because nothing else would have
found it. R16's gate slept 700ms after opening the vital dropdown and then read
--band-t-vdrop. Replacing that sleep with a bounded WAIT — poll until the band
has published, then assert — turned a stable green into a 40% red:

    rep1 ok    rep2 FAIL    rep3 ok    rep4 FAIL    rep5 ok
    FAIL 1920x1080: the dropdown clears the vitals bar [vdrop.t=6 vitals.b=46]

The sleep was landing after a corrective pass most of the time. The wait lands
on the FIRST published value, which is sometimes 6px — and 6px is not a frame of
flicker. In the failing runs it is where the dropdown stayed: sitting on top of
the vitals bar it hangs from, covering the readings the reader tapped for.

THE MECHANISM, reproduced on demand by qa/_probe_band_floor.js rather than waited
for. bandPlace measures its floor through bandShown and its own comment states
the rule: "A hidden floor is a zero floor." With the floor unmeasurable, base=0
and the first tenant lands at base+pad = 6. Forced by hiding #vitals for exactly
one bandLayout pass and putting it straight back:

    1920x1080  settled 52px -> floor hidden 6px   (vitals bottom 46)
    1280x800   settled 42px -> floor hidden 6px   (vitals bottom 36)
     390x844   settled 41px -> floor hidden 6px   (vitals bottom 35)

Every profile, every time.

WHY THIS LANE OWNS IT. Before R15 #vdrop carried a hardcoded `top:46px` and could
not do this on any screen. R15 made it a tenant of the top band and it inherited
the rule. The rule itself is older, and it is RIGHT for the case its comment
describes — a floor that is genuinely gone on this profile — but that case is
already handled one line earlier by `only`, which returns before any measuring
happens. What is left is a floor that is present and merely not measurable yet,
and for that, zero is a guess dressed as a measurement.

THE FIX IS TO PUBLISH NOTHING RATHER THAN PUBLISH A GUESS. A band that cannot
find its own edge clears its tenants' properties and returns, and every tenant
falls back to the value it had before any of this machinery existed — verified,
not assumed: all nine band vars are read as var(--name,<fallback>) and none is
read bare, so a cleared band leaves every overlay exactly where the CSS puts it
(#vdrop 46px, which clears the bar at 35, 36 and 46). The next pass with a
measurable floor publishes the real number.

A FLOOR ELEMENT THAT DOES NOT EXIST AT ALL KEEPS THE OLD BEHAVIOUR. A fork that
deletes the bar has no edge to find and zero is the honest answer there, so the
guard tests for an element that is present and unmeasurable, never for absence.

Re-runnable. The edit carries its own guard; a second run is a skip and zero
bytes changed. Run qa/verify_help_l8.js from docs/prototypes/qa afterwards, and
check_blocks.mjs FROM docs/prototypes.
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
    """One anchored replacement. The guard is PER EDIT, never per script."""
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

ANCHOR = (
    "  const fl=document.getElementById(B.floor);\n"
    "  /* A hidden floor is a zero floor. #pbar is display:none off pocket (:606) and\n"
    "     the band then starts at the screen edge instead of 60px up from it. */\n"
    "  const fr=bandShown(fl)?fl.getBoundingClientRect():null;"
)

NEW = (
    "  const fl=document.getElementById(B.floor);\n"
    "  /* A FLOOR THAT IS PRESENT BUT NOT MEASURABLE IS NOT A FLOOR AT ZERO, and the\n"
    "     difference is a dropdown sitting on top of the bar it hangs from. With the\n"
    "     floor unmeasurable this used to fall through to base=0 and place the first\n"
    "     tenant at base+pad = 6px. MEASURED by hiding #vitals for exactly one pass\n"
    "     and putting it straight back: 1920x1080 published 52px settled and 6px\n"
    "     forced, 1280x800 42 and 6, 390x844 41 and 6, against a bar whose bottom is\n"
    "     46, 36 and 35. It is not a frame of flicker either — nothing schedules a\n"
    "     corrective pass, so a run of verify_help_l8.js caught it 2 times in 5 with\n"
    "     the dropdown still at 6px when the sheet was read.\n"
    "     PUBLISH NOTHING RATHER THAN A GUESS. Every band var is read as\n"
    "     var(--name,<fallback>) and none is read bare, so a cleared band leaves each\n"
    "     overlay where the CSS alone puts it: #vdrop at 46px, which clears the bar\n"
    "     on all three. The next pass with a measurable floor publishes the truth.\n"
    "     THE OLD RULE SURVIVES WHERE IT WAS RIGHT. Its comment described a floor\n"
    "     that is GONE on this profile — #pbar off pocket — and that case never\n"
    "     reaches here: `only` returns three lines above. A floor ELEMENT that does\n"
    "     not exist at all still means zero, because a fork that deleted the bar has\n"
    "     no edge to find, so this tests present-and-unmeasurable and not absence. */\n"
    "  if(fl&&!bandShown(fl)){\n"
    "    for(const t of B.tenants){clear.push(t.v);if(t.max)clear.push(t.max)}\n"
    "    return {set,clear,box:null,base:0,over:0}}\n"
    "  const fr=bandShown(fl)?fl.getBoundingClientRect():null;"
)

src = edit(src, "an unmeasurable floor publishes nothing", ANCHOR, NEW,
           guard="A FLOOR THAT IS PRESENT BUT NOT MEASURABLE")

if APPLIED:
    save(src)

print("\npatch_h8_4: %d applied, %d skipped, %+d bytes"
      % (len(APPLIED), len(SKIPPED), len(src) - before))
sys.exit(0)
