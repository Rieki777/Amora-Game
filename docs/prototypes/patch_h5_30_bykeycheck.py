# -*- coding: utf-8 -*-
"""L5/30: the check for a hole patch 18 did not reach, added BEFORE the fix.

Patch 17 swept `roleApplyLive`, which keyed a plain object on ROLE names.
Patch 18 swept the three tables keyed on CIRCLE names - CIRCLE_COL, ROLE_GOV,
CIRCLE_HOMES. Both enumerated the tables they could see from the name of the
thing that had just bitten. NEITHER SWEPT THE TABLES KEYED ON BUILDING KEYS,
and a building key comes out of a scene file exactly the way a role name and a
circle name do: `x.at` is `org_roles.building` as restoreScene read it.

MEASURED ON THE SHIPPED ARTIFACT, one seat pushed with `at:'constructor'`:

    roleHome(x)      -> 'constructor'      (BY['constructor'] is a Function,
                                            so `x.at && BY[x.at]` is truthy)
    roleSeatsBy()    -> TypeError: (m[k] || m[k]).push is not a function
    ROLE_LAST_SATS   16 -> 0

and it does NOT come back when the seat is removed: the throw lands inside the
draw loop, so roleLensFrame dies on the way to its own clear and the lens is
gone for the rest of the session. Worse than the two holes already fixed -
those drew a wrong satellite, this one takes the lens down and leaves the Org
button doing nothing at all.

THIS PATCH ADDS ONLY THE CHECK. Patch 21 is the fix. Split on purpose: run in
that order and L9 goes red on the artifact as it stands, which is the one thing
that says the check is attached to the defect. Landed together it would have
been a check nobody had ever seen fail.

NO BACKSLASH ESCAPE ANYWHERE IN THE INJECTED JS. The first cut of this patch
wrote `String(e).split('\n')[0]` through a shell heredoc, the heredoc ate one
backslash, and the emitted JS carried a REAL line break inside a string
literal. Node then failed to parse the suite at all - which prints a stack and
NO PASS/FAIL LINES, and greps exactly like a clean run. `.slice` needs no
escape and cannot repeat it.

    python patch_h5_30_bykeycheck.py
    node qa/verify_org_lens.js        <- L9 RED, and L8 red with it
    python patch_h5_31_bykey.py
    node qa/verify_org_lens.js        <- both green
"""
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'qa', 'verify_org_lens.js')

src = io.open(TARGET, encoding='utf-8', newline='').read()
start_bytes = len(src.encode('utf-8'))
applied = 0
skipped = 0


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
    "  ok(perr.length === 0, `L8: zero page errors (${perr.length}${perr.length ? ': ' + perr[0] : ''})`);\n"
)
NEW = (
    "  /* ---------- L9: a BUILDING key from a scene file cannot reach Object.prototype ----------\n"
    "     The same shape as R2's role names and patch 18's circle names, one table\n"
    "     over. `BY` is a plain object keyed on `s.key`, so `BY['constructor']` is a\n"
    "     Function before a single structure is read, and a seat carrying\n"
    "     `at:'constructor'` walks straight through it: roleHome answers\n"
    "     'constructor', roleSeatsBy runs `(m[k]||(m[k]=[])).push(x)` against Object,\n"
    "     and the TypeError lands INSIDE THE DRAW LOOP. The lens does not draw wrong,\n"
    "     it stops - and it does not restart when the seat goes away.\n"
    "     ASSERTED ON ALL THREE: the address is refused, the count is untouched while\n"
    "     the seat is there, and the lens is still drawing once it is taken back out.\n"
    "     Any one alone passes for the wrong reason - a lens drawing nothing has an\n"
    "     untouched count of zero, which is why `before > 0` is in the conjunction. */\n"
    "  const l9 = await page.evaluate(async () => {\n"
    "    const step = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));\n"
    "    if (!orgOn) document.getElementById('lyOrg').click();\n"
    "    await step();\n"
    "    const before = ROLE_LAST_SATS.length;\n"
    "    const x = { s: 'Phantom Steward', c: 'Land', at: 'constructor' };\n"
    "    SCENE.seats.push(x);\n"
    "    let home = 'unread', grouped = null, threw = null;\n"
    "    try { home = roleHome(x); } catch (e) { threw = String(e).slice(0, 140); }\n"
    "    try { grouped = Object.keys(roleSeatsBy()).length; } catch (e) { threw = String(e).slice(0, 140); }\n"
    "    await step(); await step();\n"
    "    const during = ROLE_LAST_SATS.length;\n"
    "    /* PUT THE LAND BACK BEFORE ANYTHING IS ASSERTED, so a red here cannot leave\n"
    "       a phantom seat behind for every check that runs after it. */\n"
    "    const i = SCENE.seats.indexOf(x); if (i >= 0) SCENE.seats.splice(i, 1);\n"
    "    await step(); await step();\n"
    "    return { before, during, after: ROLE_LAST_SATS.length, home, grouped, threw };\n"
    "  });\n"
    "  ok(l9.threw === null && l9.home === null && l9.before > 0 &&\n"
    "    l9.during === l9.before && l9.after === l9.before,\n"
    "    `L9: a seat addressed at a prototype key is refused and the lens keeps drawing ` +\n"
    "    `(roleHome -> ${JSON.stringify(l9.home)}, ${l9.before} satellites before, ` +\n"
    "    `${l9.during} with it, ${l9.after} after${l9.threw ? '; THREW ' + l9.threw : ''})`);\n"
    "\n"
    "  ok(perr.length === 0, `L8: zero page errors (${perr.length}${perr.length ? ': ' + perr[0] : ''})`);\n"
)
swap('1/1 L9 the building-key hole', OLD, NEW, mark='L9: a seat addressed at a prototype key')

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
