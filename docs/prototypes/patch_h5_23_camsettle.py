# -*- coding: utf-8 -*-
"""L5/23: the ground suite measures at the zoom it asked for, and says so.

verify_org_ground.js IS INTERMITTENT. Four runs, one artifact, no edits:

    rep A  22 pass 0 fail
    rep B  22 pass 0 fail
    rep C  20 pass 3 fail   G2 (-0.02 units), G3b, G7b
    rep D  22 pass 1 fail   G7b

Two of those three are one cause, and it is not the artifact.

READ THE FAILURE TEXT. G2 named its worst case `cam.z 0.8401664611`, and the
sweep only ever asks for 0.9, 1.2, 1.6, 2.0 and 2.4. G3b named its five zooms

    z0.84:0 seals/0 pairs, z0.84:0 seals/0 pairs, z1.6:50/28, z2:50/23, z2.4:50/16

- FIVE ZOOMS OF WHICH THE FIRST TWO ARE THE SAME ONE. The sweep believed it
had covered 0.9 and 1.2 and had covered 0.84 twice.

WHY. Probed directly, right where the suite starts measuring:

    minZoom()                                        0.524167
    2600ms after #enterBtn, set cam.z=0.9  ->  0.8893 0.8893 0.8893 ... (sticks)
    after a further 4s,     set cam.z=0.9  ->  0.9000 0.9000 0.9000

So it is not clampCam - the floor is 0.52 and 0.9 is nowhere near it. THE
INTRO CAMERA ANIMATION IS STILL FLYING when the sweep begins. It owns cam.z
and overwrites whatever the suite assigns, for several seconds after the
2600ms sleep the suite waits. Every measurement taken in that window is taken
at a zoom nobody chose, and G2's -0.02 units - a clearance that is otherwise
comfortably positive - is a reading from a frame at 0.84 with the camera still
moving under it.

THE SUITE ALREADY KNEW. Its own G7 section, at restPlates():

    travel = null; cam.vx = cam.vy = 0;
    cam.z = zz; cam.x = BY[kk].x; cam.y = BY[kk].y; clampCam();

That is the fix, written by the same hand, applied to one section and not to
the sweep that feeds G1, G2, G3 and G3b. This patch applies it consistently.

AND THEN IT IS ASSERTED, which matters more than the fix. `setZoom` sets the
camera, waits FRAMES rather than milliseconds - this artifact renders at 3-10
fps here, so a 520ms sleep is one to five frames and sometimes none - and then
reads cam.z back and retries until the value it asked for is the value the
page holds. It returns what it actually achieved, and a new check compares the
whole list against the whole list of requested zooms:

    G1z: every zoom the sweep asked for is the zoom it measured at

On rep C that check goes red and NAMES the two collapsed entries, instead of
G2 reporting a mystery clearance at a zoom that is not in the list and G3b
quietly comparing 0.84 to itself. A sweep that silently measures one zoom
twice is a sweep reporting five samples over four, and the duplicate is
invisible in every number downstream.

WHAT G7b TURNED OUT TO BE, written down because the first reading was wrong.
G7b - "turning the lens on costs at most one building name of the dozen on
screen" - failed at 2 (community, z1.2) and 3 (council, z2.4) at zooms that
WERE correctly achieved, so it looked like a real cost of patch 14, which put
the satellites into BADGE_PTS so the name plates dodge them. It is not. A
PARALLEL LANE working this same worktree traced it in patch_h5_32_g7settle.py
to the plate layout being read before it came to rest: an unsettled `off`
reads 15 plates where a settled one reads 12, and 15-12 is the 'worst 3'.
With both settle fixes in the file the suite reads 24 pass / 0 fail and G7b
reports worst 1, at kitchen z1.2.

Two independent halves of one root cause, then: the camera had not stopped
moving (this patch) and the plates had not stopped landing (patch 32). Both
are the same mistake - a wall-clock sleep standing in for a state that has to
be waited ON - and both were found by a check going red rather than by
reading the code, which is the argument for keeping the thresholds where they
are. Widening G7b to 3 would have hidden the settle bug permanently.
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


# ---- 1/4: the helpers ----
OLD1 = (
    "  const ZOOMS = [0.9, 1.2, 1.6, 2.0, 2.4];\n"
)
NEW1 = (
    "  /* n REAL FRAMES, not n milliseconds. Measured on this artifact in this\n"
    "     browser: 3 to 10 frames a second. Every wall-clock sleep in a suite\n"
    "     that screenshots or reads geometry was sized for sixty. */\n"
    "  const frames = n => page.evaluate(k => new Promise(res => {\n"
    "    let c = 0;\n"
    "    const step = () => (++c >= k ? res(true) : requestAnimationFrame(step));\n"
    "    requestAnimationFrame(step);\n"
    "  }), n);\n"
    "\n"
    "  /* SET THE CAMERA AND PROVE IT TOOK. The intro fly-through owns cam.z for\n"
    "     seconds after #enterBtn and overwrites anything assigned under it -\n"
    "     measured: cam.z=0.9 sticks at 0.8893 until it finishes. `travel=null`\n"
    "     and zeroed velocity are the suite's own idiom from restPlates(); the\n"
    "     read-back is what makes it a fact rather than a hope. Returns the zoom\n"
    "     actually held, so the caller can assert on it. */\n"
    "  const setZoom = async (Z, k) => {\n"
    "    let got = null;\n"
    "    for (let i = 0; i < 25; i++) {\n"
    "      await page.evaluate(([zz, kk]) => {\n"
    "        travel = null; cam.vx = cam.vy = 0;\n"
    "        cam.z = zz;\n"
    "        if (kk) { cam.x = BY[kk].x; cam.y = BY[kk].y }\n"
    "        clampCam();\n"
    "      }, [Z, k || null]);\n"
    "      await frames(3);\n"
    "      got = await page.evaluate(() => cam.z);\n"
    "      if (Math.abs(got - Z) < 1e-6) return got;\n"
    "    }\n"
    "    return got;\n"
    "  };\n"
    "\n"
    "  const ZOOMS = [0.9, 1.2, 1.6, 2.0, 2.4];\n"
    "  const zoomsGot = [];\n"
)
swap('1/4 frames() and setZoom()', OLD1, NEW1, mark="  const setZoom = async (Z, k) => {\n")

# ---- 2/4: the sweep uses it ----
OLD2 = (
    "  for (const Z of ZOOMS) {\n"
    "    await page.evaluate(z => { cam.z = z; clampCam(); }, Z);\n"
    "    await page.waitForTimeout(520);\n"
)
NEW2 = (
    "  for (const Z of ZOOMS) {\n"
    "    zoomsGot.push(await setZoom(Z));\n"
)
swap('2/4 the sweep sets the zoom and records what it got', OLD2, NEW2,
     mark="    zoomsGot.push(await setZoom(Z));\n")

# ---- 3/4: the other two setters ----
swap('3/4 the G5 camera settles too',
     "  await page.evaluate(() => { cam.z = 2.0; clampCam(); });\n",
     "  await setZoom(2.0);\n",
     mark="  await setZoom(2.0);\n")

swap('3b/4 the S-series camera settles too',
     "  await page.evaluate(() => { cam.z = 2.0; clampCam(); if (!orgOn) document.getElementById('lyOrg').click() });\n",
     "  await setZoom(2.0);\n"
     "  await page.evaluate(() => { if (!orgOn) document.getElementById('lyOrg').click() });\n",
     mark="  await setZoom(2.0);\n  await page.evaluate(() => { if (!orgOn) document.getElementById('lyOrg').click() });\n")

# ---- 4/4: the check ----
OLD4 = (
    "  ok(scored === g0.seats * ZOOMS.length,\n"
)
NEW4 = (
    "  /* THE SWEEP MEASURED WHERE IT SAID IT DID. Without this, an intro\n"
    "     animation holding the camera turns five zooms into 0.84, 0.84, 1.6,\n"
    "     2.0, 2.4 - and every count below still comes out right, because there\n"
    "     are still five entries. The duplicate is invisible downstream: G3b\n"
    "     compared 0.84 against itself and called it two zooms. */\n"
    "  ok(zoomsGot.length === ZOOMS.length &&\n"
    "    zoomsGot.every((z, i) => z !== null && Math.abs(z - ZOOMS[i]) < 1e-6),\n"
    "    `G1z: every zoom the sweep asked for is the zoom it measured at ` +\n"
    "    `(asked ${ZOOMS.join(', ')}; got ${zoomsGot.map(z => z === null ? 'null' : z.toFixed(4)).join(', ')})`);\n"
    "  ok(scored === g0.seats * ZOOMS.length,\n"
)
swap('4/4 G1z asserts the achieved zooms', OLD4, NEW4, mark="    `G1z: every zoom the sweep asked for is the zoom it measured at ` +\n")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
