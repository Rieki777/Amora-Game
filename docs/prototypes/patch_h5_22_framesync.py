# -*- coding: utf-8 -*-
"""L5/22: the paint suite waits for FRAMES, not for the wall clock.

PATCH 21 STOPPED THE CSS CLOCK AND THE SUITE STILL DID NOT REPEAT:

    rep 1   6 pass 3 fail   P3 noise 100%, greenhouse 0%
    rep 2   9 pass 0 fail   P3 noise 0%
    rep 3   3 pass 6 fail   P1 recorded 0 satellites

Three runs, one artifact, three different answers. So the animations were a
real cause and not the only one.

MEASURED, instead of guessed at. A counter on the rAF wrapper, sampled every
250ms across four boots:

    run1  5f 6f 7f 7f 10f 12f 17f 20f
    run2  3f 6f 7f 9f 11f 12f 16f 17f

THE DRAW LOOP RUNS AT THREE TO TEN FRAMES A SECOND in this browser - a 5.5 MB
artifact at 1480x1000 in headless. Every wait in this suite is a wall-clock
sleep sized for sixty:

    camera moved, then waitForTimeout(320)      = one to three frames, or none
    screenshot, waitForTimeout(260), screenshot = a pair that can straddle a
                                                  repaint of the camera move

That is both remaining failures, and they are the same bug wearing two hats:

  P3 noise 100%   on1 is the OLD camera and on2 is the NEW one. Two shots of
                  "the same frozen moment" that are actually different moments,
                  so the whole box differs, and since every number is
                  signal-minus-noise the satellite under it reads 0%.
  P1 zero sats    lyOrg is clicked and ROLE_LAST_SATS is read 500ms later. The
                  record is filled BY A FRAME. At 3 fps, 500ms is one frame,
                  and sometimes it is none - so the read lands before the lens
                  has ever drawn, and the suite reports a lens that drew
                  nothing over a page where it drew sixteen.

NOTE WHAT P2b DID WITH THAT. `dark.length === 0` over an empty `scored` is
true, so P2b printed

    PASS P2b: all 0 satellite-frames change at least 15% of their box

which is the silent-zero this whole round is about, sitting inside the suite
written to stop it. P4a caught the run because patch 20 gave it an explicit
count, and P2b is given the same thing here.

THE FIX: SYNCHRONISE TO THE LOOP THAT ACTUALLY PAINTS.

  `frames(n)` resolves after n real rAF ticks, so a wait is n frames however
  long the browser takes over them. Every sleep around a screenshot or a
  camera move becomes a frame wait, and a slow machine simply takes longer
  instead of measuring the wrong moment.

  `awaitLens()` polls until the record holds one row per seat before P1 reads
  it, bounded, so a lens that genuinely never draws still fails P1 rather than
  hanging. The wait is for the CONDITION, not for a duration that used to be
  enough.

WHY NOT JUST SLEEP LONGER. Because a longer sleep is the same bug with a
bigger number: it passes on this machine until the artifact grows or CI is
busier, and then it reports "0 satellites" again with nothing to say why. The
frame counter is the thing that is actually being waited on.

    node qa/verify_org_paint.js               x3, identical, P3 floor 0.0%
    BREAK=toggle node qa/verify_org_paint.js  P4 red on the displaced boxes
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


# ---- 1/5: the freeze also installs the counter, and the waits become frames ----
OLD1 = (
    "  await page.evaluate(() => {\n"
    "    const r = window.requestAnimationFrame.bind(window);\n"
    "    window.__frz = performance.now();\n"
    "    window.requestAnimationFrame = cb => r(() => cb(window.__frz));\n"
    "    if (typeof dayAuto !== 'undefined') dayAuto = false;\n"
    "  });\n"
    "  await page.waitForTimeout(400);\n"
    "  await page.evaluate(() => { if (!orgOn) document.getElementById('lyOrg').click(); });\n"
    "  await page.waitForTimeout(500);\n"
)
NEW1 = (
    "  await page.evaluate(() => {\n"
    "    const r = window.requestAnimationFrame.bind(window);\n"
    "    window.__frz = performance.now();\n"
    "    window.__frames = 0;\n"
    "    window.requestAnimationFrame = cb => r(() => { window.__frames++; cb(window.__frz) });\n"
    "    if (typeof dayAuto !== 'undefined') dayAuto = false;\n"
    "  });\n"
    "\n"
    "  /* WAIT FOR PAINTS, NOT FOR MILLISECONDS. This artifact renders at three\n"
    "     to ten frames a second here - measured off the counter above - so every\n"
    "     wall-clock sleep in this suite was sized for a loop that does not exist.\n"
    "     A pair of screenshots 260ms apart could straddle the repaint of a\n"
    "     camera move and report 100% noise about a still world. */\n"
    "  const frames = n => page.evaluate(k => new Promise(res => {\n"
    "    let c = 0;\n"
    "    const step = () => (++c >= k ? res(window.__frames) : requestAnimationFrame(step));\n"
    "    requestAnimationFrame(step);\n"
    "  }), n);\n"
    "\n"
    "  /* The record is filled BY A FRAME, so the wait is for the record and not\n"
    "     for a duration that used to be long enough. Bounded: a lens that never\n"
    "     draws has to fail P1, not hang. */\n"
    "  const awaitLens = async () => {\n"
    "    for (let i = 0; i < 40; i++) {\n"
    "      const done = await page.evaluate(() =>\n"
    "        window.ROLE_LAST_SATS && window.ROLE_LAST_SATS.length >= SCENE.seats.length);\n"
    "      if (done) return true;\n"
    "      await frames(2);\n"
    "    }\n"
    "    return false;\n"
    "  };\n"
    "\n"
    "  await frames(3);\n"
    "  await page.evaluate(() => { if (!orgOn) document.getElementById('lyOrg').click(); });\n"
    "  await awaitLens();\n"
)
swap('1/5 frame counter, frames() and awaitLens()', OLD1, NEW1,
     mark="  const frames = n => page.evaluate(k => new Promise(res => {\n")

# ---- 2/5: the camera settles by frames ----
OLD2 = (
    "      await page.evaluate(zz => { cam.z = zz; }, z);\n"
    "      await page.waitForTimeout(300);\n"
)
NEW2 = (
    "      await page.evaluate(zz => { cam.z = zz; }, z);\n"
    "      await frames(3);\n"
)
swap('2/5 the zoom settles by frames', OLD2, NEW2, mark="      await frames(3);\n")

OLD2b = (
    "        await page.evaluate(k => { cam.x = BY[k].x; cam.y = BY[k].y; }, h.k);\n"
    "        await page.waitForTimeout(320);\n"
)
NEW2b = (
    "        await page.evaluate(k => { cam.x = BY[k].x; cam.y = BY[k].y; }, h.k);\n"
    "        /* The move must REACH THE SCREEN before the first shot, or the pair\n"
    "           below is two different cameras and reads as a still world that\n"
    "           moved over the whole box. */\n"
    "        await frames(4);\n"
)
swap('2b/5 the camera move reaches the screen', OLD2b, NEW2b, mark="        await frames(4);\n")

# ---- 3/5: every screenshot gap is a frame gap ----
OLD3 = (
    "        await clearToasts();\n"
    "        const on1 = await raw(await page.screenshot());\n"
    "        await page.waitForTimeout(260);\n"
    "        await clearToasts();\n"
    "        const on2 = await raw(await page.screenshot());\n"
)
NEW3 = (
    "        await clearToasts();\n"
    "        const on1 = await raw(await page.screenshot());\n"
    "        await frames(3);\n"
    "        await clearToasts();\n"
    "        const on2 = await raw(await page.screenshot());\n"
)
swap('3/5 the noise pair is three frames apart', OLD3, NEW3,
     mark="        const on1 = await raw(await page.screenshot());\n        await frames(3);\n")

OLD3b = (
    "        await page.waitForTimeout(260);\n"
    "        await clearToasts();\n"
    "        const off = await raw(await page.screenshot());\n"
)
NEW3b = (
    "        await frames(3);\n"
    "        await clearToasts();\n"
    "        const off = await raw(await page.screenshot());\n"
)
swap('3b/5 the off frame is three frames after the change', OLD3b, NEW3b,
     mark="        await frames(3);\n        await clearToasts();\n        const off = await raw(await page.screenshot());\n")

OLD3c = (
    "        else await page.evaluate(id => { document.getElementById(id).style.visibility = ''; }, p1.ids[0]);\n"
    "        await page.waitForTimeout(200);\n"
)
NEW3c = (
    "        else await page.evaluate(id => { document.getElementById(id).style.visibility = ''; }, p1.ids[0]);\n"
    "        await frames(2);\n"
)
swap('3c/5 the restore lands before the next home', OLD3c, NEW3c, mark="        await frames(2);\n")

# ---- 4/5: P2b may not pass over an empty set ----
OLD4 = (
    "  const dark = scored.filter(r => net(r) < VISIBLE);\n"
    "  ok(dark.length === 0,\n"
    "    `P2b: all ${scored.length} satellite-frames change at least ${100 * VISIBLE}% of their box`);\n"
)
NEW4 = (
    "  /* THE COUNT, BEFORE THE VERDICT. `dark.length === 0` is true of an empty\n"
    "     set, so a run where the lens never drew printed \"all 0 satellite-frames\n"
    "     change at least 15%\" in green - a silent zero inside the suite written\n"
    "     against silent zeros. P1 and P2 both went red on that run, but this\n"
    "     line must not be the one that says everything is fine. */\n"
    "  const dark = scored.filter(r => net(r) < VISIBLE);\n"
    "  ok(scored.length > 0 && dark.length === 0,\n"
    "    `P2b: all ${scored.length} satellite-frames change at least ${100 * VISIBLE}% of their box`);\n"
)
swap('4/5 P2b asserts its own count', OLD4, NEW4, mark="  ok(scored.length > 0 && dark.length === 0,\n")

# ---- 5/5: say it in the runbook ----
swap('5/5 note the frame sync in the header',
     " * Bare identifiers throughout: SCENE, cam, BY and worldToScreen are\n"
     " * script-scope and are NOT window properties.\n",
     " * EVERY WAIT IS A FRAME WAIT. The artifact renders at 3-10 fps in headless\n"
     " * here, so wall-clock sleeps sized for 60 fps let a screenshot pair straddle\n"
     " * a camera repaint (P3 noise 100%) and let P1 read the satellite record\n"
     " * before any frame had filled it (P1 zero satellites). Both were seen, on\n"
     " * an artifact that did not change between runs.\n"
     " *\n"
     " * Bare identifiers throughout: SCENE, cam, BY and worldToScreen are\n"
     " * script-scope and are NOT window properties.\n",
     mark=" * EVERY WAIT IS A FRAME WAIT.")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
