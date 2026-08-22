# -*- coding: utf-8 -*-
"""L5/21: the paint suite stops the CSS clock too, so its numbers repeat.

THE SUITE PASSED ONCE AND THEN FAILED TWICE, on a byte-identical artifact:

    rep 1   9 pass 0 fail   worst per home: council 93% ... greenhouse 92%
    rep 2   6 pass 3 fail   FAIL P3 (noise 100%)   greenhouse 0%
    rep 3   6 pass 3 fail   FAIL P3 (noise 100%)   greenhouse 0%

A green that does not repeat is not a green, and the failing check is P3 - the
noise floor. Two screenshots of what is supposed to be the SAME frozen moment
differed over 100% of a box. Since every reported number is `signal - noise`,
a noisy box drives its satellite to 0% and takes P2b down with it, and a noisy
control box takes P4 down. All three failures are one cause.

WHAT IS STILL MOVING. The suite freezes the timestamp handed to
requestAnimationFrame, which holds the CANVAS world still - the land, the
halos, the satellites, the whole of frame(). It does nothing to CSS
animations, which run on their own clock in the compositor, and the artifact
has a dozen of them on the very elements these boxes are scored over:

    :81   .poi.st-thriving .halo   haloA 2.8s infinite   r 28 -> 34, width 1.5 -> 6
    :654  .bseal.ev-u0..u3         evp   0.8-3.4s        scale 1 -> 1.22
    :556  .bseal.featured          bfeat 2.9s            scale 1 -> 1.16
    :582  .aseal.soon .arim        brim  2.4s
    :920  .poi.stranded .ring      strandPulse 1.1s

haloA is the one that hurts. It is an expanding ring centred on the building
ANCHOR, sweeping r 28 to 34 with a stroke that fattens to 6 - which is exactly
where the fan hangs and exactly where P4's control boxes sit, 62px up towards
that same anchor. Whether a box is caught mid-sweep is luck, and the greenhouse
is thriving, which is why the greenhouse is the home that goes to zero.

THE ARTIFACT'S OWN SWITCH IS NOT ENOUGH, and that is worth writing down:

    :731  @media (prefers-reduced-motion:reduce){
    :732    .bseal,.aseal .arim,#loomWires .lw.staged,#orgSvg .ovac,.poi.talk{animation:none!important}

haloA IS NOT ON THAT LIST. Nor is .poi.stranded .ring. So emulating reduced
motion - which this patch does anyway, because asking the page in its own
language is the right first move - still leaves the thriving halo pulsing.
A reader who has asked their system for less motion still gets a ring
breathing on every thriving building. That is a real gap in the artifact and
it is NOT fixed here: :81 is the sprite lane's CSS, the brand ratchet scores
those pages, and a lens lane reaching into it is how two lanes overwrite each
other. It is reported instead.

SO THE SUITE STOPS THEM ITSELF, with a stylesheet of its own on top:

    *,*::before,*::after{animation:none!important;transition:none!important}

`animation:none` puts every element at its base state and leaves it there,
which is a still page rather than a page paused mid-pulse. `transition:none`
matters for the same reason under BREAK=toggle, where `body.org-lens #badges`
fades its opacity over .18s: the `off` screenshot could otherwise be taken
mid-fade and the control would measure a fraction of the defect it exists to
reproduce.

AND THE TOASTS GO. `animation:none` kills `toastout` as well, so the toast
lyOrg raises would sit on screen forever instead of fading at 5.4s - and under
BREAK=toggle a fresh one lands on every single toggle, stacking a box that IS
in the difference between the two frames. The box is emptied before each
screenshot. That is the state a person is looking at a few seconds later, and
it is the only piece of furniture this suite removes.

P3 IS NOT RELAXED BY ANY OF THIS. It still asserts the floor under 5%, and it
is now the check that proves the freeze worked rather than a number nobody
could act on. If a lane adds an animation these boxes can see, P3 goes red and
says so instead of one satellite quietly reading 0%.

    node qa/verify_org_paint.js                 x3, identical
    BREAK=toggle node qa/verify_org_paint.js    P4 still red
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


# ---- 1/4: ask the page in its own language, before it is even loaded ----
OLD1 = (
    "  const ctx = await browser.newContext({ viewport: { width: 1480, height: 1000 } });\n"
)
NEW1 = (
    "  /* THE PAGE'S OWN SWITCH FIRST. The artifact carries a\n"
    "     prefers-reduced-motion block (:731) and honouring it is the polite way\n"
    "     to ask for a still page. It is not sufficient - haloA at :81 is not on\n"
    "     that list - which is why the stylesheet below exists as well. */\n"
    "  const ctx = await browser.newContext({\n"
    "    viewport: { width: 1480, height: 1000 }, reducedMotion: 'reduce' });\n"
)
swap('1/4 emulate reduced motion at the context', OLD1, NEW1,
     mark="    viewport: { width: 1480, height: 1000 }, reducedMotion: 'reduce' });\n")

# ---- 2/4: and stop the rest of the CSS clock outright ----
OLD2 = (
    "  await page.evaluate(() => {\n"
    "    const r = window.requestAnimationFrame.bind(window);\n"
    "    window.__frz = performance.now();\n"
)
NEW2 = (
    "  /* THE CSS CLOCK. The rAF freeze below holds the canvas world still and\n"
    "     reaches nothing in the compositor. haloA (:81) sweeps a ring r 28->34\n"
    "     around the building ANCHOR - through the fan and through P4's control\n"
    "     boxes - and the seal pulses at :556/:582/:654 scale marks these boxes\n"
    "     sit on. Left running they put 100% of a box into P3's noise floor,\n"
    "     which is three failures on a suite that passed the run before. */\n"
    "  await page.addStyleTag({ content:\n"
    "    '*,*::before,*::after{animation:none!important;transition:none!important}' });\n"
    "  await page.evaluate(() => {\n"
    "    const r = window.requestAnimationFrame.bind(window);\n"
    "    window.__frz = performance.now();\n"
)
swap('2/4 stop the CSS animations and transitions', OLD2, NEW2,
     mark="  await page.addStyleTag({ content:\n")

# ---- 3/4: a still page has no toast on it ----
OLD3 = (
    "        const on1 = await raw(await page.screenshot());\n"
    "        await page.waitForTimeout(260);\n"
    "        const on2 = await raw(await page.screenshot());\n"
)
NEW3 = (
    "        /* `animation:none` killed toastout too, so the toast lyOrg raises\n"
    "           never fades on its own. Emptied before every frame, and before\n"
    "           the `off` frame in particular, where BREAK=toggle raises a fresh\n"
    "           one that would otherwise be part of the difference. */\n"
    "        await clearToasts();\n"
    "        const on1 = await raw(await page.screenshot());\n"
    "        await page.waitForTimeout(260);\n"
    "        await clearToasts();\n"
    "        const on2 = await raw(await page.screenshot());\n"
)
swap('3/4 clear the toast before the on pair', OLD3, NEW3, mark="        await clearToasts();\n")

OLD3b = (
    "        await page.waitForTimeout(260);\n"
    "        const off = await raw(await page.screenshot());\n"
)
NEW3b = (
    "        await page.waitForTimeout(260);\n"
    "        await clearToasts();\n"
    "        const off = await raw(await page.screenshot());\n"
)
swap('3b/4 clear the toast before the off frame', OLD3b, NEW3b,
     mark="        await clearToasts();\n        const off = await raw(await page.screenshot());\n")

# ---- 4/4: the helper ----
OLD4 = (
    "  /* ---------- P2/P3: the composited page, one camera per home ---------- */\n"
)
NEW4 = (
    "  /* Empty the toast rail. Not hidden: a toast is real furniture and this is\n"
    "     simply the page a few seconds later, once it has said its piece. */\n"
    "  const clearToasts = () => page.evaluate(() => {\n"
    "    const t = document.getElementById('toasts'); if (t) t.innerHTML = '';\n"
    "  });\n"
    "\n"
    "  /* ---------- P2/P3: the composited page, one camera per home ---------- */\n"
)
swap('4/4 the clearToasts helper', OLD4, NEW4, mark="  const clearToasts = () => page.evaluate(() => {\n")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
