# -*- coding: utf-8 -*-
"""L5/25: the ground suite waits for the lens to have DRAWN, not for 700ms.

THE LAST CORNER OF THE SAME ROOT CAUSE. Run on the settled tree, with patches
23 and 32 both in:

    FAIL G0:  the lens recorded all 16 seats as drawn satellites (0) at 0 buildings
    FAIL G0b: on ONE canvas that is in the document and has a size ([], null, sized false)
    FAIL G0c: whose plane is above the sprites (satellites z null, ...)
    FAIL G0e: and above every other plane painted over the land ...
    FAIL G7b: turning the lens on costs at most one building name (worst 2, at community z1.2)

FIVE REDS, ONE FACT: `ROLE_LAST_SATS` was EMPTY when G0 read it. The four G0
checks are all reading the same empty array, and G7b is downstream of it - with
no satellites recorded, patch 14's `BADGE_PTS` carries none either, so the
plate layout with the lens on is not the layout G7b is trying to compare.

WHY IT IS EMPTY. Line 106:

    await page.evaluate(() => { if (!orgOn) document.getElementById('lyOrg').click(); });
    await page.waitForTimeout(700);

The record is filled BY A FRAME - roleLensFrame pushes into it while painting.
This artifact renders at 3 to 10 frames a second in this browser, so 700ms is
two to seven frames and, with the intro fly-through still competing for the
loop, sometimes none at all. The suite then reports a lens that drew nothing,
about a page where it drew sixteen.

verify_org_paint.js hit exactly this and patch 22 gave it `awaitLens()` -
poll until the record holds one row per seat, bounded, so a lens that
genuinely never draws still fails P1 instead of hanging. The ground suite
never got it. This is that, here.

WHY THE BOUND STILL FAILS LOUDLY. The wait is for the CONDITION and it gives
up after a fixed number of frames, so BREAK=ink - which paints nothing while
still recording - is unaffected, and a real regression that stops the lens
recording anything hits G0 with the same red it always did. The wait cannot
manufacture a pass; it can only stop the suite reading before the answer
exists.

WHAT THIS IS NOT. It is not a longer sleep. 700ms became "up to 60 frames, or
as soon as the record is full", which on a fast machine is faster than the
sleep it replaces and on a slow one is correct instead of fast.
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


OLD = (
    "  await page.evaluate(() => { if (!orgOn) document.getElementById('lyOrg').click(); });\n"
    "  await page.waitForTimeout(700);\n"
)
NEW = (
    "  await page.evaluate(() => { if (!orgOn) document.getElementById('lyOrg').click(); });\n"
    "  /* WAIT FOR THE RECORD, NOT FOR A DURATION. ROLE_LAST_SATS is filled by a\n"
    "     FRAME, and this artifact renders at 3-10 fps here, so the 700ms sleep\n"
    "     that used to stand here was two to seven frames and sometimes none -\n"
    "     which handed G0, G0b, G0c and G0e an empty array to agree about, and\n"
    "     G7b a lens-on plate layout with no satellites in it. Bounded, so a lens\n"
    "     that never draws fails G0 exactly as before instead of hanging here. */\n"
    "  for (let i = 0; i < 60; i++) {\n"
    "    const ready = await page.evaluate(() =>\n"
    "      window.ROLE_LAST_SATS && window.ROLE_LAST_SATS.length >= SCENE.seats.length);\n"
    "    if (ready) break;\n"
    "    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r(true))));\n"
    "  }\n"
)
swap('1/1 wait for the lens record before G0 reads it', OLD, NEW,
     mark="  for (let i = 0; i < 60; i++) {\n    const ready = await page.evaluate(() =>\n")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
