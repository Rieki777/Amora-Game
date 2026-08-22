# -*- coding: utf-8 -*-
"""L5/20: verify_org_paint measures the SATELLITE, not the seal dimming beside it.

P4 IS RED ON THE SHIPPED ARTIFACT, and it is right to be. Run as delivered:

    FAIL P4: with the lens surface hidden, 0 of 48 satellite-frames still read
             as painted -> [["gate","Site Guide",0.53],["ridgeA","Build Crew
             Lead",0.49],["ridgeA","Architect",0.52]]

P4 hides #lens and then measures P2 again. Half the boxes still swing 50%.
Something other than the satellite is moving, and P2 has been counting it.

IT IS NOT THE PLATES. Probed first, because patch 14 put ROLE_LAST_SATS into
BADGE_PTS and a plate that reflows on the toggle would explain it exactly.
Dumping every #banners child's text and rect either side of the toggle with
#lens hidden: IDENTICAL at both homes. The plate coupling is real and it is
not this.

IT IS THE SEALS. grounds-v0.html line 63:

    body.org-lens #badges{opacity:.32;transition:opacity .18s ease}

Turning the lens on dims EVERY BADGE SEAL ON THE PAGE to a third - patch 13,
so the satellites read against the seals they share ground with. So the old
`off` frame changed two things at once:

    the satellite ink went away          <- what P2 claims to measure
    and 50 seals went from .32 to 1      <- what P2 was also measuring

G4 in verify_org_ground.js already reports satellites and seals overlapping by
up to 10.71 px of a 20 px allowance, so a seal is INSIDE the 15x15 box at a
good many satellites. A box can clear P2's 15% threshold on the seal alone.

WHAT THAT MEANS ABOUT P2's GREEN. P2 asserts every satellite changes its box
enough to be seen. It has been asserting "something in this box changed",
and at every satellite sharing ground with a seal the something could have
been the seal. P2 could not have distinguished a painted satellite from an
unpainted one at those points, which is the entire question this suite was
written to answer. P4 was the check that noticed. Its reward for noticing is
not to be relaxed.

THE FIX: HOLD EVERYTHING ELSE STILL. The `off` frame stops toggling the lens
and hides the lens SURFACE instead, with orgOn left ON. Then between the two
frames the seals stay at .32, the plates stay dodged, the halos stay on #scene
- the halos are drawn on `cx` and only the satellites on `scx`, so hiding
#lens removes the satellites and nothing else - and the clock is already
frozen. The only difference on the page is the satellite ink, so the number
P2 reports is the satellite ink.

THE NEW P4, because "hide it in both frames" is no control at all - it would
just re-measure P3's noise and pass by construction. The signal has to be
proved LOCAL to the satellite. Every satellite point is displaced away from
the fan, up towards its own anchor, and the same difference is scored there.
Those boxes sit on the building sprite in #icons, which is invariant under
hiding #lens, so they must collapse. A displaced box is kept only when it is
further than one box plus one ink radius from EVERY recorded satellite at the
live zoom, and the number kept is asserted non-zero before a single one is
scored - an empty control set would otherwise walk the loop zero times and
print green, which is the failure this whole round has been about.

AND IT IS WATCHED RED. BREAK=toggle restores the old `off` frame - the lyOrg
click - and changes nothing else. Under it the displaced boxes light up on
the seal dimming and P4 goes red, which is this defect reproduced on demand:

    node qa/verify_org_paint.js                  P2 8/8, P4 green
    BREAK=toggle node qa/verify_org_paint.js     P4 red on the displaced boxes
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


# ---- 1/5: the header says what P2 and P4 now are ----
OLD1 = (
    " *   P4  NEGATIVE CONTROL, in the suite rather than in a paragraph. The lens\n"
    " *       surface is hidden and the whole of P2 is measured again. If those\n"
    " *       numbers do not collapse, P2 is not measuring the lens and its green\n"
    " *       means nothing.\n"
)
NEW1 = (
    " *   P4  NEGATIVE CONTROL, in the suite rather than in a paragraph. The same\n"
    " *       difference is scored at boxes DISPLACED off the fan onto the\n"
    " *       building's own sprite, which #lens does not paint. They must\n"
    " *       collapse. If they do not, P2's signal is page-wide and its green\n"
    " *       says nothing about any particular satellite.\n"
    " *\n"
    " * THE `off` FRAME HIDES #lens AND LEAVES orgOn ON. It used to click lyOrg,\n"
    " * and that changes two things: the satellites go, AND `body.org-lens` goes,\n"
    " * which un-dims every badge seal on the page from .32 to 1 (line 63 of the\n"
    " * artifact). Satellites and seals overlap by up to 10.71 px - G4 measures\n"
    " * it - so a box could clear P2's threshold on the seal alone, and P2 could\n"
    " * not tell a painted satellite from an unpainted one. P4 caught it: three\n"
    " * boxes still swung ~50% with the lens surface hidden. Holding the seals\n"
    " * still is what makes P2's number the satellite's.\n"
    " *\n"
    " *   BREAK=toggle  puts the lyOrg click back and changes nothing else, so\n"
    " *                 the seal dimming lands in the difference again. P4 must\n"
    " *                 go red on the displaced boxes.\n"
)
swap('1/5 header: what P2 and P4 measure now', OLD1, NEW1,
     mark=" *       building's own sprite, which #lens does not paint. They must\n")

# ---- 2/5: BREAK is read ----
OLD2 = "const ZOOMS = (process.env.ZOOMS || '1.2,2.0,2.8').split(',').map(Number);\n"
NEW2 = (
    "const ZOOMS = (process.env.ZOOMS || '1.2,2.0,2.8').split(',').map(Number);\n"
    "/* The one control: restore the `off` frame this suite used to take. */\n"
    "const BREAK = process.env.BREAK || '';\n"
    "/* How far a control box is pushed off the fan, in px, and how close it is\n"
    "   then allowed to sit to any satellite. The fan hangs BELOW the anchor and\n"
    "   the sprite stands above it, so up is off the ink and onto the building. */\n"
    "const CTRL_DY = 62;\n"
)
swap('2/5 read BREAK and the control offset', OLD2, NEW2, mark="const CTRL_DY = 62;\n")

# ---- 3/5: the sweep isolates the ink ----
OLD3 = (
    "  // one measurement pass; `hide` runs it with the lens surface taken off the page\n"
    "  async function sweep(hide) {\n"
    "    const out = [];\n"
    "    for (const z of ZOOMS) {\n"
    "      await page.evaluate(zz => { cam.z = zz; }, z);\n"
    "      await page.waitForTimeout(300);\n"
    "      for (const h of homes) {\n"
    "        await page.evaluate(k => { cam.x = BY[k].x; cam.y = BY[k].y; }, h.k);\n"
    "        await page.waitForTimeout(320);\n"
    "        const pts = await page.evaluate(k => window.ROLE_LAST_SATS.filter(r => r.home === k)\n"
    "          .map(r => { const [sx, sy] = worldToScreen(r.x, r.y); return { seat: r.seat, sx: sx / DPR, sy: sy / DPR }; }), h.k);\n"
    "        if (hide) await page.evaluate(id => { document.getElementById(id).style.visibility = 'hidden'; }, p1.ids[0]);\n"
    "        const on1 = await raw(await page.screenshot());\n"
    "        await page.waitForTimeout(260);\n"
    "        const on2 = await raw(await page.screenshot());\n"
    "        await page.evaluate(() => document.getElementById('lyOrg').click());\n"
    "        await page.waitForTimeout(260);\n"
    "        const off = await raw(await page.screenshot());\n"
    "        await page.evaluate(() => document.getElementById('lyOrg').click());\n"
    "        if (hide) await page.evaluate(id => { document.getElementById(id).style.visibility = ''; }, p1.ids[0]);\n"
    "        await page.waitForTimeout(200);\n"
    "        for (const p of pts) {\n"
    "          const inView = p.sx > BOX && p.sy > BOX && p.sx < on1.w - BOX && p.sy < on1.h - BOX;\n"
    "          out.push({\n"
    "            z, home: h.k, seat: p.seat, inView,\n"
    "            noise: boxDiff(on1, on2, p.sx, p.sy),\n"
    "            signal: boxDiff(on1, off, p.sx, p.sy),\n"
    "          });\n"
    "        }\n"
    "      }\n"
    "    }\n"
    "    return out;\n"
    "  }\n"
    "\n"
    "  const live = await sweep(false);\n"
    "  const scored = live.filter(r => r.inView);\n"
)
NEW3 = (
    "  /* ONE PASS. It scores each satellite AND a control box displaced off the\n"
    "     fan, from the SAME pair of screenshots, so the control cannot drift to a\n"
    "     different moment or a different camera than the thing it controls. */\n"
    "  async function sweep() {\n"
    "    const out = [], ctrl = [];\n"
    "    for (const z of ZOOMS) {\n"
    "      await page.evaluate(zz => { cam.z = zz; }, z);\n"
    "      await page.waitForTimeout(300);\n"
    "      for (const h of homes) {\n"
    "        await page.evaluate(k => { cam.x = BY[k].x; cam.y = BY[k].y; }, h.k);\n"
    "        await page.waitForTimeout(320);\n"
    "        /* EVERY satellite on screen, not just this home's, because a control\n"
    "           box has to be clear of all of them and a neighbour's fan is as\n"
    "           much ink as this one's. */\n"
    "        const all = await page.evaluate(() => window.ROLE_LAST_SATS.map(r => {\n"
    "          const [sx, sy] = worldToScreen(r.x, r.y);\n"
    "          return { seat: r.seat, home: r.home, sx: sx / DPR, sy: sy / DPR };\n"
    "        }));\n"
    "        const pts = all.filter(r => r.home === h.k);\n"
    "        /* The ink radius on screen: ROLE_SAT_RIM scene units at this zoom.\n"
    "           Read off the page rather than written down here, so a change to\n"
    "           the constant cannot leave this guard measuring the old one. */\n"
    "        const inkPx = await page.evaluate(() => ROLE_SAT_RIM * cam.z);\n"
    "        const clear = BOX + inkPx;\n"
    "        const on1 = await raw(await page.screenshot());\n"
    "        await page.waitForTimeout(260);\n"
    "        const on2 = await raw(await page.screenshot());\n"
    "        /* THE `off` FRAME. Default: the lens SURFACE goes, orgOn stays on,\n"
    "           so the seals stay dimmed and the only change is the ink.\n"
    "           BREAK=toggle: the old frame, which un-dims 50 seals as well. */\n"
    "        if (BREAK === 'toggle') await page.evaluate(() => document.getElementById('lyOrg').click());\n"
    "        else await page.evaluate(id => { document.getElementById(id).style.visibility = 'hidden'; }, p1.ids[0]);\n"
    "        await page.waitForTimeout(260);\n"
    "        const off = await raw(await page.screenshot());\n"
    "        if (BREAK === 'toggle') await page.evaluate(() => document.getElementById('lyOrg').click());\n"
    "        else await page.evaluate(id => { document.getElementById(id).style.visibility = ''; }, p1.ids[0]);\n"
    "        await page.waitForTimeout(200);\n"
    "        const inView = (x, y) => x > BOX && y > BOX && x < on1.w - BOX && y < on1.h - BOX;\n"
    "        for (const p of pts) {\n"
    "          out.push({\n"
    "            z, home: h.k, seat: p.seat, inView: inView(p.sx, p.sy),\n"
    "            noise: boxDiff(on1, on2, p.sx, p.sy),\n"
    "            signal: boxDiff(on1, off, p.sx, p.sy),\n"
    "          });\n"
    "          /* The control box: same x, pushed up towards the anchor and onto\n"
    "             the sprite. Kept only if it is on screen AND clear of every\n"
    "             satellite's ink, this one included. */\n"
    "          const cy = p.sy - CTRL_DY;\n"
    "          if (!inView(p.sx, cy)) continue;\n"
    "          let near = false;\n"
    "          for (const q of all) if (Math.hypot(q.sx - p.sx, q.sy - cy) < clear) { near = true; break }\n"
    "          if (near) continue;\n"
    "          ctrl.push({\n"
    "            z, home: h.k, seat: p.seat,\n"
    "            noise: boxDiff(on1, on2, p.sx, cy),\n"
    "            signal: boxDiff(on1, off, p.sx, cy),\n"
    "          });\n"
    "        }\n"
    "      }\n"
    "    }\n"
    "    return { out, ctrl };\n"
    "  }\n"
    "\n"
    "  const swept = await sweep();\n"
    "  const live = swept.out;\n"
    "  const scored = live.filter(r => r.inView);\n"
)
swap('3/5 one pass, ink isolated, control boxes scored beside it', OLD3, NEW3,
     mark="  async function sweep() {\n")

# ---- 4/5: P4 reads the displaced boxes ----
OLD4 = (
    "  /* ---------- P4: the control ---------- */\n"
    "  const blind = (await sweep(true)).filter(r => r.inView);\n"
    "  const stillLit = blind.filter(r => net(r) >= VISIBLE);\n"
    "  ok(blind.length === scored.length && stillLit.length === 0,\n"
    "    `P4: with the lens surface hidden, 0 of ${blind.length} satellite-frames still read as painted` +\n"
    "    (stillLit.length ? ' -> ' + JSON.stringify(stillLit.slice(0, 4).map(r => [r.home, r.seat, +net(r).toFixed(2)])) : ''));\n"
)
NEW4 = (
    "  /* ---------- P4: the control ----------\n"
    "     THE COUNT IS ASSERTED BEFORE ANYTHING IS SCORED. Every guard in sweep()\n"
    "     is a `continue`, so a displacement that cleared nothing, or a zoom that\n"
    "     pushed every control box off screen, would hand this an empty array -\n"
    "     and an empty array satisfies `every box collapsed` perfectly. */\n"
    "  const ctrl = swept.ctrl;\n"
    "  ok(ctrl.length >= scored.length / 2 && ctrl.length > 0,\n"
    "    `P4a: ${ctrl.length} control boxes cleared every satellite's ink and stayed on screen, ` +\n"
    "    `against ${scored.length} satellite boxes`);\n"
    "  const lit = ctrl.filter(r => net(r) >= VISIBLE);\n"
    "  ok(ctrl.length > 0 && lit.length === 0,\n"
    "    `P4: ${ctrl.length} boxes ${CTRL_DY}px off the fan, where #lens paints nothing, all collapse ` +\n"
    "    `(worst ${(100 * ctrl.reduce((m, r) => Math.max(m, net(r)), 0)).toFixed(0)}%)` +\n"
    "    (lit.length ? ' -> ' + JSON.stringify(lit.slice(0, 4).map(r => [r.home, r.seat, +net(r).toFixed(2)])) : ''));\n"
)
swap('4/5 P4 scores the displaced boxes and asserts its own count', OLD4, NEW4,
     mark="  const ctrl = swept.ctrl;\n")

# ---- 5/5: the runbook line ----
swap('5/5 name the control in the runbook line',
     " *   node qa/verify_org_paint.js\n */\n",
     " *   node qa/verify_org_paint.js\n"
     " *   BREAK=toggle node qa/verify_org_paint.js    <- P4 must go red\n */\n",
     mark=" *   BREAK=toggle node qa/verify_org_paint.js    <- P4 must go red\n")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
