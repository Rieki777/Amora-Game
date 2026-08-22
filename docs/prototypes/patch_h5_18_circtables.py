# -*- coding: utf-8 -*-
"""L5/18: a circle name from a scene file cannot reach Object.prototype either.

Patch 17 fixed `roleApplyLive`, which keyed a plain object on ROLE names. The
same shape is live in three more lookups, keyed on CIRCLE names, and those come
from the same place: `x.c` is `org_roles.circle` as restoreScene read it out of
a scene file, which is hand-editable and importable from a stranger.

    roleHome()      if(ROLE_GOV[x.c]){ const h=CIRCLE_HOMES[x.c]; ... }
    roleLens()      CIRCLE_COL[x.c]||'#9aa08f'
    the org chart   const col=CIRCLE_COL[c]||'#9aa08f'

A circle called `constructor` - or `toString`, `valueOf`, `hasOwnProperty` -
is TRUTHY in all three before a single entry exists, and the fallbacks that
look like they cover this (`||'#9aa08f'`, `BY[h]`) never fire because the
inherited value is truthy too. What actually happens, in order:

    ROLE_GOV['constructor']      -> Object          -> the role is "governing"
    CIRCLE_HOMES['constructor']  -> Function        -> BY[<function source>] is
                                    undefined, so it falls to ROLE_GOV_HOME and
                                    the role gathers at the village centre with
                                    nothing having said so
    CIRCLE_COL['constructor']    -> Function        -> `Function + 'aa'` is a
                                    long string, canvas refuses it as a colour,
                                    KEEPS THE PREVIOUS strokeStyle, and the
                                    satellite is drawn in the last circle's ink

That last one is the worst of the three, because colour IS the lens's language:
the mark is not missing and not obviously wrong, it belongs to the wrong circle.

Object.create(null) on all three tables, which is the same fix and the same
one line each. Checked first that nothing calls a method ON these tables - no
`.hasOwnProperty`, no `.toString`, no `ROLE_GOV.` anywhere - and everything
that reads them uses `Object.keys`, `in`, or a bracket lookup, all of which
work unchanged on a null-prototype object.

CIRCLE_COL keeps its window reference, and `window.CIRCLE_COL=CIRCLE_COL`
still points at the same object.

    python patch_h5_18_circtables.py

Proved by qa/verify_org_lens.js R2g.
"""
import io
import os

HERE = os.path.dirname(os.path.abspath(__file__))
TARGET = os.path.join(HERE, 'grounds-v0.html')

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


# ---- 1/3 the colour table ----
OLD = (
    "const CIRCLE_COL={Land:'#6fae52',Building:'#c98b4e',Community:'#d0a94f',Learning:'#7f9fd0',Finance:'#b8b06a',\n"
    "  Coordination:'#d0785a',Gathering:'#c96a8a',Healing:'#8ad0c0',Wisdom:'#a98ad0',Arts:'#d0648f',Outreach:'#6ac9c0'};\n"
)
NEW = (
    "/* NO PROTOTYPE, because the key is a circle name out of a scene file and a\n"
    "   scene file is hand-editable and importable from a stranger. On a plain\n"
    "   object CIRCLE_COL['constructor'] is a Function, `Function+'aa'` is a long\n"
    "   string, canvas refuses it as a colour and KEEPS THE PREVIOUS ONE - so the\n"
    "   satellite is not missing and not obviously wrong, it is drawn in another\n"
    "   circle's ink. The `||'#9aa08f'` below reads like it covers this and cannot,\n"
    "   because the inherited value is truthy. Nothing calls a method on this\n"
    "   table; every reader uses Object.keys or a bracket lookup. */\n"
    "const CIRCLE_COL=Object.assign(Object.create(null),\n"
    "  {Land:'#6fae52',Building:'#c98b4e',Community:'#d0a94f',Learning:'#7f9fd0',Finance:'#b8b06a',\n"
    "  Coordination:'#d0785a',Gathering:'#c96a8a',Healing:'#8ad0c0',Wisdom:'#a98ad0',Arts:'#d0648f',Outreach:'#6ac9c0'});\n"
)
swap('1/3 the circle colours', OLD, NEW, mark='const CIRCLE_COL=Object.assign(Object.create(null),\n')

# ---- 2/3 the governing set ----
OLD = (
    "const ROLE_GOV={Outreach:1,Finance:1,Coordination:1,Wisdom:1};\n"
)
NEW = (
    "/* Same reason as CIRCLE_COL: `ROLE_GOV['constructor']` is truthy on a plain\n"
    "   object, so a circle with that name would be treated as governing and its\n"
    "   roles moved off the buildings they are addressed to. */\n"
    "const ROLE_GOV=Object.assign(Object.create(null),{Outreach:1,Finance:1,Coordination:1,Wisdom:1});\n"
)
swap('2/3 the governing circles', OLD, NEW, mark='const ROLE_GOV=Object.assign(Object.create(null),')

# ---- 3/3 the homes table ----
OLD = (
    "const CIRCLE_HOMES={Outreach:'gate',Community:'welcome',Finance:'market',Land:'greenhouse',Coordination:'community',\n"
)
NEW = (
    "/* And the same again: this one is asked `CIRCLE_HOMES[x.c]` with a circle\n"
    "   name from the scene, and an inherited Function passes the `h &&` guard\n"
    "   before BY[h] finally comes back undefined. */\n"
    "const CIRCLE_HOMES=Object.assign(Object.create(null),\n"
    "  {Outreach:'gate',Community:'welcome',Finance:'market',Land:'greenhouse',Coordination:'community',\n"
)
swap('3/3 the circle homes', OLD, NEW, mark='const CIRCLE_HOMES=Object.assign(Object.create(null),\n')

# The homes table's closing brace has to become a paren. Its last line is unique.
OLD = (
    "  Gathering:'kitchen',Learning:'library',Wisdom:'council',Building:'ridgeA',Healing:'sanctuary',Arts:'community'};\n"
)
NEW = (
    "  Gathering:'kitchen',Learning:'library',Wisdom:'council',Building:'ridgeA',Healing:'sanctuary',Arts:'community'});\n"
)
swap('3b/3 and its closing brace', OLD, NEW,
     mark="Healing:'sanctuary',Arts:'community'});\n")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
