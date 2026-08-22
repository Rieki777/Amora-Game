# -*- coding: utf-8 -*-
"""L5/19: the control that reproduces the SHIPPED defect, so G5c can be watched red.

THE GAP. verify_org_ground.js was written to answer BLOCKING 1 - two governing
satellites invisible on screen - and its answer is G5c, which scores each
satellite's keyline on the COMPOSITED page. G5c is the right check. It had
never been watched red on the defect it exists for.

Run against this artifact, the three controls do go red, and each on a
different check:

    BREAK=floor   G2   satellite geometry lands inside the sprite box
    BREAK=plane   G0e  the lens plane sits under the seals and the plates
    BREAK=ink     G5c  the plane never reaches the compositor at all

Only the third reaches G5c, and it reaches it by turning the whole layer's
opacity to zero - which is a defect nobody has ever shipped. The two controls
that model defects this lane ACTUALLY shipped are caught by a DOM z-index read
and by a geometric clearance. So the pixel check - the one thing in the suite
that reads the surface a person is looking at - was carried by the other two.

WHY NEITHER OF THEM REACHES IT. The shipped defect needed BOTH halves at once:

    the ring inside the sprite      (no floor: patch 12)
    AND the ink under the sprite    (#icons is z 10; the lens was on #scene)

Either alone is visible. A satellite on the roof among the seals is ugly and
G2 catches it; a plane under the SEALS is still over the SPRITES and the
satellite reads fine. Measured, both halves together and separately:

    BREAK=floor            G5c passes,  worst keyline 71%
    BREAK=plane            G5c passes,  worst keyline 71%
    floor+plane as written G5c passes,  worst keyline 71%     <- still green

That third row is the finding. Applying both existing controls together STILL
leaves G5c green, because BREAK=plane sets the lens to z-index 11 - which is
above #icons at 10. The `plane` control models patch 13 (the seals and the
name plates) and never modelled patch 11 (the sprites) at all. Nothing in the
suite has ever put the ink under a building.

    BREAK=orig             G5c FAILS,   worst keyline 0%

THE CONTROL. `orig` is the artifact as the review measured it: the foot back to
zero and the lens plane dropped to 9, one below #icons. It is the only control
here that is a defect this lane really shipped, and it takes G5c to 0% on a
satellite that the record still says was drawn - a lens reporting sixteen
satellites over a screen showing fifteen. It takes G0c and G2 with it, which is
correct and is the point: three independent checks, three independent reasons,
and the pixel one is now known to be load-bearing rather than assumed to be.

    node qa/verify_org_ground.js               25 checks, all green
    BREAK=orig node qa/verify_org_ground.js    G0c, G0e, G2 and G5c red

WHY THE Z GOES THROUGH page.evaluate's ARGUMENT. `BREAK` is a Node-side const.
Written as a bare closure reading BREAK, the injected function throws
ReferenceError inside the page, the suite dies before check 1, and the run
prints NO FAIL LINES AT ALL - which greps identically to a clean pass and is
the same crash-is-a-pass shape verify_publish.js was just caught in. It is
passed as an argument.
"""
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'qa', 'verify_org_ground.js')
src = io.open(TARGET, encoding='utf-8', newline='').read()
start_bytes = len(src.encode('utf-8'))
applied = skipped = 0


def swap(name, old, new, count=1, mark=None):
    global src, applied, skipped
    if (mark or new) in src:
        print('  skip   %s' % name)
        skipped += 1
        return
    n = src.count(old)
    assert n == count, 'anchor for %s appears %d times, expected %d' % (name, n, count)
    src = src.replace(old, new, count)
    print('  apply  %s' % name)
    applied += 1


# ---- 1/3: say what the fourth control is, and correct the claim beside it ----
OLD = (
    "       BREAK=ink    lets the lens record every satellite and paints none of\n"
    "                    them. This is the defect G5 exists for and the only one of\n"
    "                    the three that can still reach it: patch 15 sent the three\n"
    "                    Wisdom roles back to the council fire they are addressed\n"
    "                    at, so the Community Center - the crowded building whose\n"
    "                    fifty seals were doing the covering - now has no satellites\n"
    "                    to cover, and no z-order change alone reproduces it on this\n"
    "                    land any more. G5c must go red at every satellite. */\n"
)
NEW = (
    "       BREAK=ink    lets the lens record every satellite and paints none of\n"
    "                    them, by taking the whole plane's opacity to zero. G5c\n"
    "                    must go red at every satellite. It is a reachability\n"
    "                    test for G5c and NOT a defect anybody shipped, which is\n"
    "                    why `orig` below exists as well.\n"
    "       BREAK=orig   THE DEFECT THIS SUITE WAS WRITTEN FOR, whole. The review\n"
    "                    measured two governing satellites at 0% and 4% on the\n"
    "                    composited page, and reproducing that needs BOTH halves\n"
    "                    at once: the ring inside the sprite (no floor, patch 12)\n"
    "                    AND the ink under the sprite (#icons is z 10 and the lens\n"
    "                    was on #scene, patch 11). Either half alone is visible -\n"
    "                    a satellite on the roof is ugly and G2 catches it, and a\n"
    "                    plane under the SEALS is still over the SPRITES.\n"
    "                    Note what this means about `plane` above: it sets z 11,\n"
    "                    which is ABOVE #icons, so it models patch 13 and has\n"
    "                    never once put ink under a building. Run together as\n"
    "                    written the two controls still leave G5c green at 71%.\n"
    "                    G0c, G0e, G2 AND G5c must go red here, and G5c at 0%.\n"
    "                    Without this control the one check in the suite that\n"
    "                    reads the composited page was carried by a z-index read\n"
    "                    and a geometric clearance, and had never been seen to\n"
    "                    fail on anything a person could have looked at. */\n"
)
swap('1/3 name the fourth control', OLD, NEW,
     mark="       BREAK=orig   THE DEFECT THIS SUITE WAS WRITTEN FOR, whole.")

# ---- 2/3: the foot break also fires for `orig` ----
swap('2/3 orig takes the floor away too',
     "  if (BREAK === 'floor') await page.evaluate(() => {\n",
     "  if (/^(floor|orig)$/.test(BREAK)) await page.evaluate(() => {\n",
     mark="  if (/^(floor|orig)$/.test(BREAK)) await page.evaluate(() => {\n")

# ---- 3/3: the plane break fires for `orig`, and for `orig` it goes UNDER #icons ----
OLD3 = (
    "  if (BREAK === 'plane') await page.evaluate(() => {\n"
    "    document.getElementById('lens').style.zIndex = '11';\n"
    "    document.getElementById('badges').style.opacity = '1';\n"
    "  });\n"
)
NEW3 = (
    "  /* Z THROUGH THE ARGUMENT, NOT THE CLOSURE. `BREAK` is a Node const; read\n"
    "     bare inside an injected function it throws ReferenceError, the suite\n"
    "     dies before check 1, and the run prints no FAIL lines - which greps\n"
    "     exactly like a clean pass. 11 is above #icons (10) and models patch 13;\n"
    "     9 is below it and is the plane the satellites were actually lost on. */\n"
    "  if (/^(plane|orig)$/.test(BREAK)) await page.evaluate((Z) => {\n"
    "    document.getElementById('lens').style.zIndex = Z;\n"
    "    document.getElementById('badges').style.opacity = '1';\n"
    "  }, BREAK === 'orig' ? '9' : '11');\n"
)
swap('3/3 orig drops the plane below #icons', OLD3, NEW3,
     mark="  if (/^(plane|orig)$/.test(BREAK)) await page.evaluate((Z) => {\n")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
