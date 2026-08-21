# -*- coding: utf-8 -*-
"""L5/6: what the village says about its seats RIGHT NOW reaches the lens.

Patch 04 gave `state` a line in restoreScene's whitelist and a row in the
export, which is what a seat state written into a SCENE FILE needs. That is not
where a real seat state lives. It lives in `org_roles` and `org_role_assignments`
and it is derived on every read by `seatState()`, which GET /api/map already
calls and already emits beside `holderCount` and `vacant`.

So the live answer rides the `lens` message patch 04 added, beside the party,
and it is merged onto the seats BY NAME. Name is the join this codebase already
uses in the other direction: `scripts/import-map-scene.ts` addresses `org_roles`
rows with `matchColumn: "name"`. Case is folded here because a scene file is
typed by a person and the org chart is typed by a different person.

IT LANDS ON A TRANSIENT FIELD AND THE EXPORT NEVER WRITES IT.

`_state` and `_tags` take the leading underscore this file already uses for
things that are read but never saved (`_why` on a resolver guess, `_res` on a
thread's suggestion, `_crownOff` on a sprite). The export enumerates its fields
one by one and none of these is among them, which is the property that makes
this safe rather than a comment saying it is.

That separation is the whole point. `x.state` is what the SCENE says, which a
founder authored and which publishes and round-trips. `x._state` is what the
VILLAGE says this minute, which changes when somebody takes a seat. Writing the
live answer into `x.state` would freeze a Tuesday's holder count into the map a
founder drew, and the next publish would ship it as though it were a decision.
D9 holds: a lens, never a ledger.

Reading order is transient first, because when both exist the live one is the
one that is true now.

    python patch_h5_06_live.py
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
    """One edit, one guard.

    The guard is a SENTINEL that no later patch in this family touches. It is
    not the whole inserted block, because guarding on the block makes a patch
    re-apply itself the moment a later patch edits one line inside it, and
    then a second pass over the family duplicates work instead of skipping.
    Falls back to the block when an edit is nobody else's anchor.

    An anchor matching anything other than `count` times aborts before a byte
    is written."""
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


# ---------------------------------------------------------------- 1/3  read the live answer first
OLD = (
    "function roleState(x){const v=String((x&&x.state)||'open');\n"
    "  return v==='filled'?'full':(v==='partial'?'partial':'open')}\n"
)
NEW = (
    "function roleState(x){const v=String((x&&(x._state||x.state))||'open');\n"
    "  return v==='filled'?'full':(v==='partial'?'partial':'open')}\n"
)
swap('1/3 the live answer wins over the authored one', OLD, NEW,
     mark='(x._state||x.state)')

# ---------------------------------------------------------------- 2/3  and the same for the tags
OLD = (
    "        CIRCLE_COL[x.c]||'#9aa08f',st,st==='open'&&roleRelevant(x.archetypes),t||0)})}}\n"
)
NEW = (
    "        CIRCLE_COL[x.c]||'#9aa08f',st,st==='open'&&roleRelevant(x._tags||x.archetypes),t||0)})}}\n"
)
swap('2/3 the lens reads the live tags first too', OLD, NEW,
     mark='roleRelevant(x._tags||x.archetypes)')

# ---------------------------------------------------------------- 3/3  the merge
OLD = "window.roleSetParty=roleSetParty;\n"
NEW = (
    "window.roleSetParty=roleSetParty;\n"
    "/* What the village says about these seats right now, merged onto the scene's\n"
    "   own seats by name. `scripts/import-map-scene.ts` addresses org_roles with\n"
    "   matchColumn 'name', so name is already the join between these two worlds;\n"
    "   case is folded because the two sides are typed by different people.\n"
    "\n"
    "   IT LANDS ON `_state` AND `_tags`, which carry the leading underscore this\n"
    "   file uses for read-but-never-saved (`_why`, `_res`, `_crownOff`). The\n"
    "   export names its fields one by one and neither of these is among them, so\n"
    "   a live holder count can never freeze into the scene a founder drew.\n"
    "   Returns how many seats it matched, so a caller can say so and a probe can\n"
    "   read it. */\n"
    "function roleApplyLive(rows){\n"
    "  const by={};\n"
    "  if(Array.isArray(rows))for(const r of rows)\n"
    "    if(r&&typeof r.name==='string')by[r.name.trim().toLowerCase()]=r;\n"
    "  let n=0;\n"
    "  for(const x of SCENE.seats){\n"
    "    const r=by[String(x.s||'').trim().toLowerCase()];\n"
    "    if(!r){delete x._state;delete x._tags;continue}\n"
    "    x._state=roleStateIn(r.state);x._tags=roleTagsIn(r.archetypes);n++}\n"
    "  if(typeof refreshBadges==='function')refreshBadges();\n"
    "  return n}\n"
    "window.roleApplyLive=roleApplyLive;\n"
)
swap('3/3 the merge, by the same name join the importer uses', OLD, NEW,
     mark='function roleApplyLive(rows){')
# The caller is patch 04's `lens` branch, which already reads `d.roles`. It is a
# separate message from `hand` on purpose: `hand` decides whether the Build
# button works and must not wait on the org chart.

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
