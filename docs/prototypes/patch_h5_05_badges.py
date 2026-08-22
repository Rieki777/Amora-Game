# -*- coding: utf-8 -*-
"""L5/5: the marks gain weight, and at mid range they answer to the party.

RYE, R8: "zoomed out I shouldn't see ALL the available buttons on buildings.
Instead I should see the most relevant to me depending on the character(s) I'm
playing in my profile. But when I click on a building it should show me all
available buttons for that building. Also these buttons need to be just a bit
bigger to be easier to see and click on."

THE INK CANNOT GROW, AND THAT IS MEASURED RATHER THAN CAUTIOUS. The seal is 28
and the mid-range seal is 22, and 22 is what Rye is looking at, because `bmid`
is on below cam.z 1.45 and the map spends most of its life there. I shipped 26
first and verify_features D2 A1 caught it.

That check counts a door as unreliable when the nearest door belonging to a
DIFFERENT building is closer than the seal is WIDE, and it reads the width off
the live CSS, so the ink is the bar. Widening it raises the bar against geometry
that has not moved. Swept on the shipped land, worst band, 50 doors:

    22 -> 4 bad     the ratchet, and it is already exactly at it
    23 -> 6         24 -> 6        25 -> 8        26 -> 8

No headroom at any width. A bigger mark at z 1.0 is a mark that answers a tap
meant for its neighbour, which is the opposite of easier to click on. The
check's own comment predicted it: "the ink grows before the ring does".

SO THE MARK GETS WEIGHT INSTEAD. At 22 px against a 24-unit viewBox every stroke
renders at 0.917 of its authored width, so the rim lands at 1.83 device px; 2.6
lands at 2.38. Footprint, the 44 px hit target, MARK_FLOOR and every door
distance the budget measures are all untouched, because none of them is a stroke
width. If Rye wants literal size at low zoom, that is a deliberate spend of the
D2 A1 ratchet with the numbers above on the table, and it is his call.

NO NEW ZOOM THRESHOLD. There are already at least seven bare cam.z literals in
this file with no shared constant, and an eighth is how that happened. "Zoomed
out" reuses `bmid`, which is the gate that already exists at cam.z < 1.45 and
already means "far enough that the marks are small".

WHAT NARROWS, AND WHAT CANNOT. A class tag lives on `org_roles` and on `quests`
and NOWHERE ELSE (migration 0069 tagged exactly those two tables, and it says
why: `roles` is the capability plane and a class must never come near a
permission). So the seat mark and the quest mark answer to the party, and the
conversation, event and home marks do not, because there is nothing in the
schema that says who a conversation is for. Inventing a class-to-mark table here
would be inventing a product decision, and it would be invisible in the code
that reads it.

    Rye, 2026-08-15: "If a user picks all 5 characters they should see all the
    buttons as that is what they're wanting."

That is the union across the party, and `roleRelevant` reads it that way. It
also answers TRUE for an untagged row, which is the server's own law: NULL and
empty both mean "every class", and collapsing them the other way is how a filter
quietly empties a board. So a village that has tagged nothing sees no change at
all, and `body.role-party` is absent entirely until a party arrives, which keeps
a visitor's map and every file:// QA run exactly as they were.

TAP TO REVEAL IS THE MECHANISM THAT EXISTS. `fanGroup()` already opens a
collapsed ring for 2600ms and `layoutBadges` already puts `.fanned` on the group
for it, and tapping a building already calls it. So `.fanned` lifts the filter,
and "click a building and see all its buttons" is one selector rather than a
second mechanism.

THE LAYOUT IS NOT TOUCHED. Hiding is CSS only, so `layoutBadges` still places
every seal and still pushes every mark into BADGE_PTS for the plate solver. Two
reasons, and neither is laziness. A ring that re-solved when the filter changed
would make the visible seals JUMP when a player edits their party, and the ring
rotation is solved against the neighbours, so a mark that vanishes would move the
mark next door. And BADGE_PTS is the plate solver's input, which is another
lane's; feeding it a set that changes with who is signed in would make plate
placement depend on the reader.

    python patch_h5_05_badges.py
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


# ---------------------------------------------------------------- 1/7  the ink
OLD = "  .bmid .bseal{width:22px;height:22px;margin:-11px 0 0 -11px}\n"
NEW = (
    "  /* 22 IS THE LARGEST THAT FITS, and it is worth writing down why, because\n"
    "     the next person to read Rye's \"a bit bigger\" will try 26 as I did.\n"
    "     verify_features D2 A1 counts a door as unreliable when the nearest door\n"
    "     on ANOTHER building is closer than the seal is wide, reading the width\n"
    "     off this rule, so the ink is the bar. Swept on the shipped land, worst\n"
    "     band, 50 doors: 22 -> 4 bad, 23 -> 6, 24 -> 6, 25 -> 8, 26 -> 8, against\n"
    "     a ratchet of 4. There is no headroom, and a wider mark at z 1.0 is a\n"
    "     mark that answers its neighbour's tap.\n"
    "\n"
    "     So the mid-range mark gets WEIGHT instead of width. At 22 px against a\n"
    "     24-unit viewBox every stroke renders at 0.917 of its authored width, so\n"
    "     the rim lands at 1.83 device px; 2.6 lands at 2.38. Footprint, hit\n"
    "     target and every door distance the budget measures are untouched.\n"
    "     `sol` and `cut` stay as they are: sol is a filled silhouette, and cut\n"
    "     carves the face colour back out of it, so a heavier carve closes the\n"
    "     detail that exists to survive being small. */\n"
    "  .bmid .bseal{width:22px;height:22px;margin:-11px 0 0 -11px}\n"
    "  .bmid .bseal .rim,.bmid .bseal .ink,.bmid .bseal .staff{stroke-width:2.6}\n"
)
swap('1/7 the mid mark keeps its 22 px and gains its weight', OLD, NEW,
     mark='.bmid .bseal .rim,')

# ---------------------------------------------------------------- 2/7  the filter CSS
OLD = "  /* A collapsed ring, opened. Transform only, so nothing reflows. */\n"
NEW = (
    "  /* ---------- L5: THE MARKS ANSWER TO THE PARTY (R8) ----------\n"
    "     Only when a party has arrived, only at mid range, and never on a group\n"
    "     the reader has opened. `body.role-party` is absent until a shell pushes\n"
    "     a party, so a visitor's map and every file:// QA run are untouched.\n"
    "     Hiding is display, so the seal stays in the DOM and every check that\n"
    "     reads the marks a building wears still reads all of them. */\n"
    "  body.role-party #badges .bgroup.bmid:not(.fanned) .bseal[data-brel=\"0\"]{display:none}\n"
    "  /* A collapsed ring, opened. Transform only, so nothing reflows. */\n"
)
swap('2/7 the filter, gated on the party, mid range and an unopened ring', OLD, NEW,
     mark='body.role-party #badges .bgroup.bmid')

# ---------------------------------------------------------------- 3/7  relevance over a list
OLD = "function roleSetParty(v){ROLE_PARTY=roleTagsIn(v)||null;\n"
NEW = (
    "/* Is ANY of these worth showing this player? A mark stands for every item of\n"
    "   its kind at a building, so one relevant quest keeps the quest mark. An\n"
    "   empty list is not a narrowing: the invite seal means \"there is room for\n"
    "   work here\" and it is addressed to everyone. */\n"
    "function roleAny(list){\n"
    "  if(!ROLE_PARTY||!ROLE_PARTY.length)return true;\n"
    "  if(!list||!list.length)return true;\n"
    "  for(const it of list)if(roleRelevant(it&&(it._tags||it.archetypes)))return true;\n"
    "  return false}\n"
    "window.roleAny=roleAny;\n"
    "function roleSetParty(v){ROLE_PARTY=roleTagsIn(v)||null;\n"
    "  document.body.classList.toggle('role-party',!!ROLE_PARTY);\n"
)
swap('3/7 relevance over a list, and the body class the filter hangs on', OLD, NEW,
     mark='function roleAny(list){')

# ---------------------------------------------------------------- 4/7  the quest mark
OLD = (
    "        rim:(q.addr==='creator'||q.address_source==='creator')?'':'r-amber',\n"
    "        braid:badgeSkilled(q),n:qs.length});\n"
)
NEW = (
    "        rim:(q.addr==='creator'||q.address_source==='creator')?'':'r-amber',\n"
    "        /* The mark stands for every quest here, so it survives if ANY of\n"
    "           them is this party's work. `roleAny` answers true until a party\n"
    "           arrives and true for an untagged row either way. */\n"
    "        rel:(typeof roleAny==='function')?roleAny(qs):true,\n"
    "        braid:badgeSkilled(q),n:qs.length});\n"
)
swap('4/7 the quest mark carries its relevance', OLD, NEW,
     mark='roleAny(qs):true,')

# ---------------------------------------------------------------- 5/7  the seat mark
OLD = (
    "    if(st.length&&badgeOn(s,'seat')) marks.push({kind:'seat',tint:(window.CIRCLE_COL&&window.CIRCLE_COL[st[0].c||s.circle])||'',\n"
    "      pips:0,rim:'r-silver r-open',braid:false,n:st.length});\n"
)
NEW = (
    "    if(st.length&&badgeOn(s,'seat')) marks.push({kind:'seat',tint:(window.CIRCLE_COL&&window.CIRCLE_COL[st[0].c||s.circle])||'',\n"
    "      rel:(typeof roleAny==='function')?roleAny(st):true,\n"
    "      pips:0,rim:'r-silver r-open',braid:false,n:st.length});\n"
)
swap('5/7 the seat mark carries its relevance', OLD, NEW,
     mark='roleAny(st):true,')

# ---------------------------------------------------------------- 6/7  the signature
OLD = (
    "    const sig=marks.map(m=>m.kind+m.pips+m.rim+m.tint+(m.claimed?'✓':'')+(m.extra||'')).join(',')+'|'+total;\n"
)
NEW = (
    "    /* Relevance is IN the signature, so editing the party rebuilds the ring\n"
    "       instead of leaving the last reader's answer on the land. */\n"
    "    const sig=marks.map(m=>m.kind+m.pips+m.rim+m.tint+(m.claimed?'✓':'')+(m.rel===false?'-':'')+(m.extra||'')).join(',')+'|'+total;\n"
)
swap('6/7 relevance joins the signature so a party change rebuilds', OLD, NEW,
     mark="(m.rel===false?'-':'')")

# ---------------------------------------------------------------- 7/7  the attribute
# RE-DERIVED for the regeneration onto 64ba144: #29 (ace9d9d) escapes every
# data-bk write with escq(), so the anchor carries escq(s.key), NEVER the raw
# s.key. Resolving this edit back to `${s.key}` would REOPEN the stored XSS
# #29 closed (proven: a hostile structure key executed 4 times raw, 0 escaped).
# The lens only ADDS its attributes; the escaping is #29's and it stays.
OLD = (
    "        return `<span class=\"${cls}\" data-bk=\"${escq(s.key)}\" data-bkind=\"${m.kind}\"${tint}>`+\n"
)
NEW = (
    "        return `<span class=\"${cls}\" data-bk=\"${escq(s.key)}\" data-bkind=\"${m.kind}\" data-brel=\"${m.rel===false?'0':'1'}\"${tint}>`+\n"
)
swap('7/7 the seal says whether it is this party\'s work', OLD, NEW,
     mark='data-bkind="${m.kind}" data-brel=')

if applied:
    io.open(TARGET, 'w', encoding='utf-8', newline='').write(src)
    end_bytes = len(src.encode('utf-8'))
    print('\n  wrote %d bytes (%+d)' % (end_bytes, end_bytes - start_bytes))
else:
    print('\n  0 bytes changed (%d)' % start_bytes)
print('  %d applied, %d skipped' % (applied, skipped))
