# -*- coding: utf-8 -*-
"""L5/31: a BUILDING key from a scene file cannot reach Object.prototype either.

The fix for the hole patch 20's L9 is watching. Read that patch's docstring for
the measurement; this one is about where the guard goes and why.

BY IS NOT MINE. `const BY={}; SCENE.structures.forEach(s=>BY[s.key]=s);` is base
code at line 1382, read by the doors lane, the plate solver, the loom and the
inspector. Making it null-prototype is a one-line change with a blast radius
across every lane in the tree, and `BY` is also handed to code that may well
call a method on it. So the guard goes on the READ, in the lens's own
functions, where this lane owns every line:

    roleBuilding(k)   own-property lookup, or null

and every `BY[...]` inside the lens goes through it. That is five reads, and
the rule is greppable, and it is checked rather than asserted: after this patch
the lens region from roleBuilding to window.roleLensFrame holds exactly ONE
`BY` subscript, the one inside roleBuilding itself. A later lane adding a sixth read gets caught by reading the rule,
not by remembering this bug.

AND THE THREE PER-FRAME MAPS. `roleSeatsBy`'s `m` is keyed on roleHome()'s
answer, which is the attacker-controlled one; `roleHomes`' `seen` and
`roleLens`' `byHome` are keyed on CIRCLE_HOMES VALUES, which are literals in
this file and cannot be steered today. All three become Object.create(null)
anyway, because the invariant worth having is "no table in the lens keyed by a
building key has a prototype", and a table that is safe only because of a fact
two functions away is a table that stops being safe when that fact changes.

WHAT roleHome NOW ANSWERS for `at:'constructor'`: `own` is null, the circle is
not governing, so it returns null and roleSeatsBy skips the seat entirely. The
phantom draws nothing and the sixteen real satellites are untouched - which is
exactly what L9 asserts.

    python patch_h5_31_bykey.py
    node qa/verify_org_lens.js       <- L9 green
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


# ---- 1/5: the guarded read, declared above its first caller ----
OLD = "function roleHome(x){\n"
NEW = (
    "/* ONE GUARDED READ OF `BY`, AND THE LENS USES NOTHING ELSE.\n"
    "   `BY` is a plain object keyed on `s.key`, so `BY['constructor']` is a\n"
    "   Function, `BY['toString']` is a Function and `BY['__proto__']` is\n"
    "   Object.prototype - all three truthy before a single structure is read. A\n"
    "   seat carrying `at:'constructor'` therefore passed the `x.at&&BY[x.at]`\n"
    "   guard below, roleHome handed back 'constructor', and roleSeatsBy's\n"
    "   `(m[k]||(m[k]=[])).push(x)` called .push on Object. That throw lands INSIDE\n"
    "   THE DRAW LOOP: the lens stopped at sixteen satellites and did not come back\n"
    "   when the seat was removed, because roleLensFrame died on the way to its own\n"
    "   clear. Measured, not reasoned about; qa/verify_org_lens.js L9 holds it.\n"
    "   THE GUARD IS ON THE READ AND NOT ON THE TABLE, because BY is base code that\n"
    "   four other lanes read. Returns null rather than undefined so every caller\n"
    "   can keep its `if(!s)` shape. */\n"
    "function roleBuilding(k){\n"
    "  return (typeof k==='string'&&Object.prototype.hasOwnProperty.call(BY,k))?BY[k]:null}\n"
    "window.roleBuilding=roleBuilding;\n"
    "function roleHome(x){\n"
)
swap('1/5 roleBuilding, the guarded read', OLD, NEW, mark="function roleBuilding(k){\n")

# ---- 2/5: the address a founder typed ----
swap('2/5 roleHome reads it for x.at',
     "  const own=(x.at&&BY[x.at])?x.at:null;\n",
     "  const own=(x.at&&roleBuilding(x.at))?x.at:null;\n",
     mark="  const own=(x.at&&roleBuilding(x.at))?x.at:null;\n")

# ---- 3/5: and for the two fallbacks (literals today, guarded anyway) ----
swap('3/5 roleHome reads it for the gather homes',
     "    if(h&&BY[h])return h;\n    if(BY[ROLE_GOV_HOME])return ROLE_GOV_HOME}\n",
     "    if(h&&roleBuilding(h))return h;\n"
     "    if(roleBuilding(ROLE_GOV_HOME))return ROLE_GOV_HOME}\n",
     mark="    if(h&&roleBuilding(h))return h;\n")

# ---- 4/5: roleHomes - the table and the read ----
swap('4/5a roleHomes table has no prototype',
     "  const seen={},out=[];\n",
     "  const seen=Object.create(null),out=[];\n",
     mark="  const seen=Object.create(null),out=[];\n")
swap('4/5b roleHomes reads BY through the guard',
     "    const k=CIRCLE_HOMES[c],s=k&&BY[k];\n",
     "    const k=CIRCLE_HOMES[c],s=k&&roleBuilding(k);\n",
     mark="    const k=CIRCLE_HOMES[c],s=k&&roleBuilding(k);\n")

# ---- 5/5: roleSeatsBy's map, and roleLens' map and read ----
swap('5/5a roleSeatsBy groups on a table with no prototype',
     "function roleSeatsBy(){const m={};\n",
     "/* NO PROTOTYPE: `k` is roleHome()'s answer, which starts life as `x.at` in a\n"
     "   scene file. On a plain object `m['constructor']` is the Object function and\n"
     "   `(m[k]||(m[k]=[])).push(x)` throws rather than grouping. */\n"
     "function roleSeatsBy(){const m=Object.create(null);\n",
     mark="function roleSeatsBy(){const m=Object.create(null);\n")
swap('5/5b roleLens byHome has no prototype',
     "  const homes=roleHomes(mode),byHome={};\n",
     "  const homes=roleHomes(mode),byHome=Object.create(null);\n",
     mark="  const homes=roleHomes(mode),byHome=Object.create(null);\n")
swap('5/5c roleLens reads BY through the guard',
     "    const s=BY[k];if(!s)continue;\n",
     "    const s=roleBuilding(k);if(!s)continue;\n",
     mark="    const s=roleBuilding(k);if(!s)continue;\n")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
