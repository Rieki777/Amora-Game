# -*- coding: utf-8 -*-
"""L5/32: verify_org_ground stops measuring the map before it has come to rest.

ONE ROOT CAUSE. It also produced three reds in qa/verify_org_paint.js, which a
PARALLEL LANE fixed in that file at the same time as this; the two halves were
written independently and agree on the mechanism. This patch is the ground half
ONLY - verify_org_paint.js belongs to patch_h5_21_stillpage.py and
patch_h5_22_framesync.py and is not touched here.

THE RED THIS FIXES WAS ALL
ABOUT THE INSTRUMENT RATHER THAN THE MAP.

The camera is not a variable you can set. frame() drives it two ways:

    if(!dragging&&!travel){cam.x+=cam.vx;cam.y+=cam.vy;cam.vx*=.9;cam.vy*=.9;clampCam()}
    if(travel){ ...cubic ease at dt*1.6, about 625ms... clampCam() }

so an assignment to cam.x is overwritten every frame while a flight is in the
air, and inertia keeps moving it after that. Both suites set cam and then
waited on A NUMBER OF MILLISECONDS.

  verify_org_paint, measured: aimed at the greenhouse at z1.2, the camera came
  to rest at (154,114) and worldToScreen handed back satellite screen points at
  (3667,1656) - three thousand pixels outside a 1480-wide viewport. The suite
  scored 15x15 px boxes at those points and reported the greenhouse satellites
  0% changed. That is P2b's red. The same motion put 67-70% into the on1/on2
  pair that is supposed to be the STILL-LAND noise floor, which is P3's red,
  and swung the off-fan control boxes, which is P4's. THREE REDS, ONE CAUSE,
  AND NONE OF THEM ABOUT THE LENS.

  verify_org_ground G7 counts building name plates with the lens off and then
  on. Measured across ten runs of that loop, the camera moved as much as 197.74
  world units BETWEEN the two counts, so the pair being subtracted was two
  different views. Sampled with the map actually at rest, council at z2.0 holds
  12 plates with the lens on and 12 with it off - no cost at all - while the
  unsettled `off` reads 15. G7b's intermittent "worst 3" is that 15 minus that
  12, and it is the transient, not the map.

THE FIX IS THE SAME SENTENCE IN BOTH: cancel the flight, zero the inertia,
clamp, and then WAIT UNTIL THE THING BEING MEASURED STOPS CHANGING - the camera
for the screenshots, the plate set for the plate counts - instead of guessing a
duration. The old waits were not merely short; 430ms is LONGER than the settle
usually takes, which is why the reds were intermittent rather than constant.

AND CONVERGENCE IS ASSERTED, NEVER ASSUMED. A settle that times out quietly is
the same defect wearing the fix's clothes: it hands the old unsettled number to
the old check and prints the old green. Both suites gain a check whose only job
is to say the wait finished - G7c and P2c - and both count the rows they are
made of before believing any of them.

    python patch_h5_32_g7settle.py
    node qa/verify_org_ground.js                <- G7b deterministic, G7c green
  """
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
GROUND = os.path.join(HERE, 'qa', 'verify_org_ground.js')

applied = 0
skipped = 0


def patch(path, edits):
    global applied, skipped
    src = io.open(path, encoding='utf-8', newline='').read()
    start = len(src.encode('utf-8'))
    hit = 0
    for name, old, new, mark in edits:
        if (mark or new) in src:
            print('  skip   %s' % name)
            skipped += 1
            continue
        n = src.count(old)
        assert n == 1, 'anchor for %s appears %d times, expected 1' % (name, n)
        src = src.replace(old, new, 1)
        print('  apply  %s' % name)
        applied += 1
        hit += 1
    if hit:
        io.open(path, 'w', encoding='utf-8', newline='').write(src)
        end = len(src.encode('utf-8'))
        print('  -> %s  %d bytes (%+d)' % (os.path.basename(path), end, end - start))
    else:
        print('  -> %s unchanged (%d)' % (os.path.basename(path), start))


# ============================ verify_org_ground.js ============================
G_OLD = (
    "  const plates = [];\n"
    "  for (const Z of [1.2, 1.6, 2.0, 2.4]) for (const k of ['community', 'council', 'kitchen']) {\n"
    "    await page.evaluate(([z, kk]) => { cam.z = z; cam.x = BY[kk].x; cam.y = BY[kk].y; clampCam(); if (orgOn) document.getElementById('lyOrg').click() }, [Z, k]);\n"
    "    await page.waitForTimeout(430);\n"
    "    const off = await page.evaluate(() => [...document.querySelectorAll('#banners .banner')].filter(e => e.style.display !== 'none').length);\n"
    "    await page.evaluate(() => document.getElementById('lyOrg').click());\n"
    "    await page.waitForTimeout(430);\n"
    "    const on = await page.evaluate(() => [...document.querySelectorAll('#banners .banner')].filter(e => e.style.display !== 'none').length);\n"
    "    plates.push({ Z, k, off, on, lost: off - on });\n"
    "  }\n"
)
G_NEW = (
    "  /* THE COUNT IS TAKEN WHEN THE MAP HAS STOPPED MOVING, NOT AFTER 430ms.\n"
    "     `cam` is not a variable you can set: frame() re-drives it from cam.vx/vy\n"
    "     every frame and, while a flight is in the air, from `travel` - a cubic\n"
    "     ease running about 625ms that overwrites cam.x/cam.y outright. Measured\n"
    "     over ten runs of this loop, the camera moved up to 197.74 world units\n"
    "     between the `off` count and the `on` count, so the pair being subtracted\n"
    "     was two different views of the land. Sampled with the map at rest,\n"
    "     council at z2.0 holds 12 plates with the lens on and 12 with it off; the\n"
    "     unsettled `off` reads 15, and 15-12 is the intermittent 'worst 3' this\n"
    "     check used to print about a cost that is not there.\n"
    "     restPlates(): cancel the flight, zero the inertia, clamp, then poll until\n"
    "     the visible plate set is the SAME three polls running. Returns null if it\n"
    "     never settles, and G7c is the check that says so - a silent timeout would\n"
    "     hand the old number to the old check and print the old green. */\n"
    "  const restPlates = async (z, k) => {\n"
    "    if (z !== null) await page.evaluate(([zz, kk]) => {\n"
    "      travel = null; cam.vx = cam.vy = 0;\n"
    "      cam.z = zz; cam.x = BY[kk].x; cam.y = BY[kk].y; clampCam();\n"
    "    }, [z, k]);\n"
    "    try {\n"
    "      const h = await page.waitForFunction(() => {\n"
    "        const n = [...document.querySelectorAll('#banners .banner')]\n"
    "          .filter(e => e.style.display !== 'none').length;\n"
    "        const s = (window.__plateRun && window.__plateRun.n === n)\n"
    "          ? { n: n, k: window.__plateRun.k + 1 } : { n: n, k: 1 };\n"
    "        window.__plateRun = s;\n"
    "        return (!travel && s.k >= 3) ? s.n : false;\n"
    "      }, null, { timeout: 6000, polling: 130 });\n"
    "      return await h.jsonValue();\n"
    "    } catch (e) { return null }\n"
    "  };\n"
    "  const plates = [];\n"
    "  for (const Z of [1.2, 1.6, 2.0, 2.4]) for (const k of ['community', 'council', 'kitchen']) {\n"
    "    await page.evaluate(() => { if (orgOn) document.getElementById('lyOrg').click(); window.__plateRun = null });\n"
    "    const off = await restPlates(Z, k);\n"
    "    await page.evaluate(() => { document.getElementById('lyOrg').click(); window.__plateRun = null });\n"
    "    const on = await restPlates(null, null);\n"
    "    plates.push({ Z, k, off, on, lost: (off === null || on === null) ? null : off - on });\n"
    "  }\n"
    "  ok(plates.length === 12 && plates.every(p => p.off !== null && p.on !== null),\n"
    "    `G7c: every plate count was taken with the map at rest - the camera landed and ` +\n"
    "    `the plate set held over three polls (${plates.filter(p => p.off === null || p.on === null).length} never settled)`);\n"
)
patch(GROUND, [('ground 1/1 G7 counts a settled map', G_OLD, G_NEW,
                "  const restPlates = async (z, k) => {\n")])

print('\n  %d applied, %d skipped' % (applied, skipped))
