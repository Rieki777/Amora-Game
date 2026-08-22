# -*- coding: utf-8 -*-
"""L5/24: the paint suite pins the camera the same way the ground suite does.

THE SAME BUG, IN THE FILE NEXT DOOR, AND I SHIPPED THREE GREEN REPS OVER IT.

Patch 22 made every wait in verify_org_paint.js a frame wait, and three
consecutive runs came back 9 pass / 0 fail with P3's noise floor at 0.0%.
Three reps is the bar this round set and it was not enough: a fourth run,
same artifact, same suite, read

    FAIL P3: the still land moves under 56.9% of a box

Patch 23 had already found why, in the OTHER suite. The intro fly-through owns
the camera for seconds after #enterBtn and overwrites anything assigned under
it - measured there: `cam.z = 0.9` sits at 0.8893 until the flight ends. The
ground suite's own restPlates() had always known, with

    travel = null; cam.vx = cam.vy = 0;

and patch 23 spread that across the ground sweep. IT NEVER REACHED THE PAINT
SUITE, which sets `cam.z` and `cam.x/cam.y` bare:

    await page.evaluate(zz => { cam.z = zz; }, z);
    await page.evaluate(k => { cam.x = BY[k].x; cam.y = BY[k].y; }, h.k);

No clampCam, no travel cancel, no read-back. So the flight keeps moving the
camera THROUGH the frame wait, `on1` and `on2` are two different views of the
land, and P3 reports 57% of a box moving in a world whose clock is stopped.

WHY THE FRAME WAIT DID NOT SAVE IT. frames(3) waits for three paints. If the
camera is being animated, three paints is three DIFFERENT cameras - the wait
makes the pair further apart rather than closer. Waiting longer is worse, not
better, which is why the fix has to be cancelling the flight and not another
sleep.

WHY THREE GREEN REPS MISSED IT. The flight ends a few seconds after
#enterBtn, and the suite's first measurement lands near that edge. Which side
of it a run falls on is luck, and three coin flips came up the same way. The
lesson is the round's own: a green that repeats is not the same thing as a
green that CANNOT fail for the reason you have not checked. P3 is the check
that made this visible both times, which is the argument for keeping a noise
floor as a hard assertion rather than a printed number.

THE FIX. One `setCam` covering both the zoom and the home move: cancel the
flight, zero the inertia, assign, clamp, wait frames, READ BACK, and retry
until the page holds what it was asked for. It returns whether it converged
and P2c asserts that it did, every time, for every camera this suite takes -
so a flight that outlasts the retries fails a named check instead of quietly
moving the ground under a screenshot pair.
"""
import io, os

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'qa', 'verify_org_paint.js')
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


# ---- 1/4: the helper, next to the other waiters ----
OLD1 = (
    "  await frames(3);\n"
    "  await page.evaluate(() => { if (!orgOn) document.getElementById('lyOrg').click(); });\n"
    "  await awaitLens();\n"
)
NEW1 = (
    "  /* PIN THE CAMERA. The intro fly-through keeps moving cam for seconds\n"
    "     after #enterBtn and overwrites a bare assignment, so `on1` and `on2`\n"
    "     become two different views and P3 reports a still world moving over\n"
    "     half a box. A longer wait makes it WORSE - more paints, more cameras.\n"
    "     `travel=null` and zeroed velocity are the ground suite's idiom; the\n"
    "     read-back is what turns it into a fact. False if it never converged,\n"
    "     and P2c is the check that says so. */\n"
    "  let camMisses = 0;\n"
    "  const setCam = async (z, k) => {\n"
    "    for (let i = 0; i < 25; i++) {\n"
    "      await page.evaluate(([zz, kk]) => {\n"
    "        travel = null; cam.vx = cam.vy = 0;\n"
    "        if (zz !== null) cam.z = zz;\n"
    "        if (kk) { cam.x = BY[kk].x; cam.y = BY[kk].y }\n"
    "        clampCam();\n"
    "      }, [z === undefined ? null : z, k || null]);\n"
    "      await frames(3);\n"
    "      const got = await page.evaluate(([zz, kk]) => ({\n"
    "        z: cam.z,\n"
    "        onHome: !kk || (Math.abs(cam.x - BY[kk].x) < 1e-6 && Math.abs(cam.y - BY[kk].y) < 1e-6),\n"
    "      }), [z === undefined ? null : z, k || null]);\n"
    "      if ((z === undefined || z === null || Math.abs(got.z - z) < 1e-6) && got.onHome) return true;\n"
    "    }\n"
    "    camMisses++;\n"
    "    return false;\n"
    "  };\n"
    "\n"
    "  await frames(3);\n"
    "  await page.evaluate(() => { if (!orgOn) document.getElementById('lyOrg').click(); });\n"
    "  await awaitLens();\n"
)
swap('1/4 setCam()', OLD1, NEW1, mark="  const setCam = async (z, k) => {\n")

# ---- 2/4: the zoom ----
OLD2 = (
    "      await page.evaluate(zz => { cam.z = zz; }, z);\n"
    "      await frames(3);\n"
)
NEW2 = (
    "      await setCam(z, null);\n"
)
swap('2/4 the zoom is pinned', OLD2, NEW2, mark="      await setCam(z, null);\n")

# ---- 3/4: the home move ----
OLD3 = (
    "        await page.evaluate(k => { cam.x = BY[k].x; cam.y = BY[k].y; }, h.k);\n"
    "        /* The move must REACH THE SCREEN before the first shot, or the pair\n"
    "           below is two different cameras and reads as a still world that\n"
    "           moved over the whole box. */\n"
    "        await frames(4);\n"
)
NEW3 = (
    "        /* The move must REACH THE SCREEN and STAY there before the first\n"
    "           shot, or the pair below is two different cameras and reads as a\n"
    "           still world that moved over the whole box. */\n"
    "        await setCam(z, h.k);\n"
    "        await frames(2);\n"
)
swap('3/4 the home move is pinned', OLD3, NEW3, mark="        await setCam(z, h.k);\n")

# ---- 4/4: and it is asserted ----
OLD4 = (
    "  ok(worstNoise < 0.05,\n"
)
NEW4 = (
    "  /* EVERY CAMERA THIS SUITE TOOK ACTUALLY LANDED. Without this a flight\n"
    "     outlasting the retries just moves the ground under the screenshots and\n"
    "     the only symptom is a noise floor nobody can attribute. */\n"
    "  ok(camMisses === 0,\n"
    "    `P2c: every camera the sweep set was the camera it measured at (${camMisses} that never settled)`);\n"
    "  ok(worstNoise < 0.05,\n"
)
swap('4/4 P2c asserts the camera settled', OLD4, NEW4, mark="  ok(camMisses === 0,\n")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
