# -*- coding: utf-8 -*-
"""L5/4: the seat state and the class tags survive the round trip, and the party
reaches the map on a message of its own.

TWO THINGS THE LENS CANNOT DO WITHOUT, and both of them are plumbing.

1. `restoreScene` IS A FIELD-BY-FIELD WHITELIST, and it is reached on EVERY
   shell scene push through `applyScene`, not only on a manual restore. A
   per-role field with no line in it is dropped on the first publish/restore
   round trip, silently, and the symptom is a lens that works until the village
   publishes and then quietly goes back to drawing everything as open. `state`
   and `archetypes` get their lines here and their matching export rows.

   Both are VALIDATED at the boundary rather than trusted. `state` is checked
   against the five values `seatState()` in server/lib/orgChart.ts can return,
   and anything else becomes undefined, which `roleState()` reads as open. Class
   tags are filtered to strings and capped. A scene file is something a founder
   can hand-edit and a village can import from a stranger, so neither of these
   fields may put an arbitrary string anywhere near a comparison the lens makes.

2. THE PARTY RIDES A CREDENTIALED MESSAGE, AND ITS OWN.
   `/api/map/config` is fetched WITHOUT credentials and returns the same answer
   to every reader, so which characters a particular player has chosen cannot go
   on it. That leaves the session-bearing side of the bridge.

   It does NOT go on `hand`, which was the first cut. `hand` is what decides
   whether the Build button works, so the shell has to be able to send it the
   moment `/api/map/draft` answers. The seats beside the party come from
   `/api/map`, which is four queries and reads the whole `users` table when the
   caller may see people, and hanging that off `hand` makes a founder's edit
   rights wait on the org chart. So `lens` is its own branch, and nothing waits
   on it.

   It degrades the way the rest of the bridge does: a shell that sends no `lens`
   leaves ROLE_PARTY null, and null means every role is relevant, so a visitor
   and a file:// QA run narrow nothing.

Rye, on which characters count, 2026-08-15: "If a user picks all 5 characters
they should see all the buttons as that is what they're wanting." So it is the
UNION across the party, never the primary, and `roleRelevant` already reads it
that way.

    python patch_h5_04_roundtrip.py
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


# ---------------------------------------------------------------- 1/4  the boundary readers
OLD = "const ROLE_DARK='rgba(28,20,11,.86)';\n"
NEW = (
    "const ROLE_DARK='rgba(28,20,11,.86)';\n"
    "/* THE FIVE VALUES `SeatState` ALLOWS, copied from the type in\n"
    "   server/lib/orgChart.ts:24 rather than remembered:\n"
    "\n"
    "       open | filled | partial | forming | expired\n"
    "\n"
    "   Getting this list wrong is silent in both directions. A value that is\n"
    "   here and not in the type is a state nothing can ever send, and a value\n"
    "   in the type and not here is refused at the door and quietly drawn as\n"
    "   open. This list held a `frozen` that does not exist and was missing\n"
    "   `forming`, which is exactly both mistakes at once.\n"
    "\n"
    "   A scene file is hand-editable and importable from a stranger, so what\n"
    "   arrives is checked against this list and anything else becomes\n"
    "   undefined. `forming` and `expired` both draw open, because Rye asked\n"
    "   for three inks and a seat being set up and a seat whose holders have\n"
    "   lapsed are both openly waiting for somebody. */\n"
    "const ROLE_STATES=['open','partial','filled','forming','expired'];\n"
    "function roleStateIn(v){return ROLE_STATES.indexOf(String(v||''))>=0?String(v):undefined}\n"
    "/* Class tags, filtered to strings and capped. Absent and empty both mean\n"
    "   \"every class\", so both return undefined and roleRelevant() answers true. */\n"
    "function roleTagsIn(v){if(!Array.isArray(v))return undefined;\n"
    "  const out=v.filter(a=>typeof a==='string'&&a.length<40).slice(0,12);\n"
    "  return out.length?out:undefined}\n"
    "/* The party, as archetype keys. Same filter, and the same law: an empty\n"
    "   party is no party, because a player who has chosen nothing has asked for\n"
    "   no narrowing rather than for an empty map. */\n"
    "function roleSetParty(v){ROLE_PARTY=roleTagsIn(v)||null;\n"
    "  if(typeof refreshBadges==='function')refreshBadges();\n"
    "  return ROLE_PARTY}\n"
    "window.roleSetParty=roleSetParty;\n"
)
swap('1/4 the boundary readers for state, tags and the party', OLD, NEW,
     mark='const ROLE_STATES=')

# ---------------------------------------------------------------- 2/4  restoreScene's whitelist
OLD = (
    "  SCENE.seats=(J.org_roles||[]).map(r=>({s:r.role,at:(r.structure_key&&BY[r.structure_key])?r.structure_key:null,c:r.circle,note:r.note,\n"
    "    addr:(r.address_source&&r.address_source!=='pool')?r.address_source:undefined,\n"
    "    src:r.src||undefined,circle_site:r.circle_site||undefined}));\n"
)
NEW = (
    "  SCENE.seats=(J.org_roles||[]).map(r=>({s:r.role,at:(r.structure_key&&BY[r.structure_key])?r.structure_key:null,c:r.circle,note:r.note,\n"
    "    addr:(r.address_source&&r.address_source!=='pool')?r.address_source:undefined,\n"
    "    src:r.src||undefined,circle_site:r.circle_site||undefined,\n"
    "    /* This function is a WHITELIST and it is reached on every shell scene\n"
    "       push through applyScene, not only on a manual restore. A per-role\n"
    "       field with no line here is dropped on the first round trip and the\n"
    "       loss is silent: the lens would keep working until the village\n"
    "       published, then go back to drawing every seat as open. */\n"
    "    state:roleStateIn(r.state),archetypes:roleTagsIn(r.archetypes)}));\n"
)
swap('2/4 state and class tags join restoreScene\'s whitelist', OLD, NEW,
     mark='state:roleStateIn(r.state),archetypes:roleTagsIn(r.archetypes)}));')

# ---------------------------------------------------------------- 3/4  the export row
OLD = (
    "    org_roles:SCENE.seats.map(x=>({role:x.s,structure_key:x.at||null,circle:x.c,note:x.note,\n"
    "      address_source:addrSrc(x),src:x.src||'scene',circle_site:x.circle_site||null})),\n"
)
NEW = (
    "    org_roles:SCENE.seats.map(x=>({role:x.s,structure_key:x.at||null,circle:x.c,note:x.note,\n"
    "      address_source:addrSrc(x),src:x.src||'scene',circle_site:x.circle_site||null,\n"
    "      /* Null is the honest absence and importers map it to NULL. A seat this\n"
    "         map has never been told about reads open, and writing 'open' here\n"
    "         would make \"nobody has said\" indistinguishable from \"the village\n"
    "         says nobody holds it\". */\n"
    "      state:x.state||null,archetypes:x.archetypes||null})),\n"
)
swap('3/4 the export row carries them back out', OLD, NEW,
     mark='state:x.state||null,archetypes:x.archetypes||null})),')

# ---------------------------------------------------------------- 4/4  the lens message
# NOT on `hand`, and that is the whole point of a separate branch. `hand` decides
# whether the Build button works, so the shell must be able to send it the moment
# the draft answers. Hanging the party off it would make a founder's edit rights
# wait on the org chart.
OLD = (
    "  if(d.type==='hand')applyHand(d);\n"
)
NEW = (
    "  if(d.type==='hand')applyHand(d);\n"
    "  /* L5. WHO IS PLAYING, and what the village says about its seats.\n"
    "\n"
    "     Its own message rather than a field on `hand`, because `hand` decides\n"
    "     whether this browser may edit the land and must not wait on anything.\n"
    "     The shell reads the party from /api/me/characters and the seats from\n"
    "     /api/map, and both are slower and less important than the draft.\n"
    "\n"
    "     CREDENTIALED, and it has to be. /api/map/config is fetched WITHOUT\n"
    "     credentials and is the same answer for every reader, so which\n"
    "     characters a particular player has chosen cannot ride it. Absent\n"
    "     leaves ROLE_PARTY null, which narrows nothing, so a visitor and a\n"
    "     file:// QA run are exactly as they were. */\n"
    "  if(d.type==='lens'){\n"
    "    if(typeof roleSetParty==='function')roleSetParty(d.party);\n"
    "    if(d.roles&&typeof roleApplyLive==='function')roleApplyLive(d.roles)}\n"
)
swap('4/4 the party and the seats get their own message', OLD, NEW,
     mark="d.type==='lens'")

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
