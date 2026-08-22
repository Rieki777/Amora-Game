#!/usr/bin/env python3
"""Copy pass R5, group 2: public "seat" becomes "role" on the living map.

The founder's ruling (R45): [Put all public facing governance where we use
"seats" and use "Roles" instead]. This script renames every VISITOR-FACING
"seat" the census found on the map (COPY_CENSUS_2026-08-21.md, SEAT rows),
plus four the census missed (:3456, :3687, :6263, :6843) found by a fresh
grep. Machinery keeps its name: SCENE.seats, seatsAt(), kind:'seat', the
Loom's conn ids, and the badge buckets are identifiers, not copy.

Kept as "seat", on purpose:
  :4544/:4844-4846/:4910/:5012 build mode is the founder's own room (census
       1.24 lists it as founder-facing); the ruling is about PUBLIC copy.
  :6538 the edit log's past-tense lines are founder-facing too.
  Seed seat DATA (:1233-1240) carries role names, no "seat" word to rename.
  The Loom filter chip (:952) already says "roles".

House protocol: exact-count anchors, refuse on any count that is not 1,
idempotent (a rerun finds every new string already present, writes nothing).
Usage: python3 patch_copy_02_seats_to_roles.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()
before = len(src)
skipped = 0


def swap(old, new, count=1):
    """Replace old with new, refusing on a wrong count. Already-applied edits
    (old absent, new present) are skipped so a rerun writes zero bytes."""
    global src, skipped
    n = src.count(old)
    if n == 0 and new in src:
        skipped += 1
        return
    assert n == count, f"anchor appears {n} times, expected {count}: {old[:70]!r}"
    src = src.replace(old, new, count)


# -- 1. Circles lens subtitle (census :911) -------------------------------
swap(
    "open seats pulse as open calls</span>",
    "open roles pulse as open calls</span>",
)

# -- 2. Hover card counts (census :3413) ----------------------------------
swap(
    "<span>⛨ <b>${st}</b> seat${st===1?'':'s'} open</span>",
    "<span>⛨ <b>${st}</b> role${st===1?'':'s'} open</span>",
)

# -- 3. Panel tabs (census :3435) -----------------------------------------
swap(
    "const tabs=['Overview','Quests here','Seats here','Enter →'];",
    "const tabs=['Overview','Quests here','Roles here','Enter →'];",
)

# -- 4. Panel counts line (census :3456, missed flag) ---------------------
swap(
    "⚑ ${q.length} quests · ⛨ ${st.length} open seats ·",
    "⚑ ${q.length} quests · ⛨ ${st.length} open roles ·",
)

# -- 5. Seats-tab empty state (census :3483) ------------------------------
swap(
    "All seats filled here. Beautiful problem.",
    "All roles filled here. Beautiful problem.",
)

# -- 6. Get Involved wall heading (census :3560) --------------------------
swap(
    '`<div class="wallhead">open seats</div>`',
    '`<div class="wallhead">open roles</div>`',
)

# -- 7. Attention banner (census :3594) -----------------------------------
swap(
    "h:`⛨ Seat open: ${x.s}`",
    "h:`⛨ Role open: ${x.s}`",
)

# -- 8. Maia's structure summary (census :3628-3630) ----------------------
swap(
    "bits.push(`<b>${st.length}</b> open seat${st.length>1?'s':''}`)",
    "bits.push(`<b>${st.length}</b> open role${st.length>1?'s':''}`)",
)

# -- 9. Maia's seat/role/job answer (census :3640) ------------------------
swap(
    "Get Involved lists every open seat and quest in one place",
    "Get Involved lists every open role and quest in one place",
)

# -- 10. Maia's role match (census :3669) ---------------------------------
swap(
    "seat is open, and it sits at the",
    "role is open, and it sits at the",
)

# -- 11. Tour stop 4, the greenhouse (census :3683) -----------------------
swap(
    "Two seats are open and three quests are waiting",
    "Two roles are open and three quests are waiting",
)

# -- 12. Tour stop 8 (census :3687, missed flag) --------------------------
swap(
    "Claim a quest, raise a hand for a seat, come to the feast tonight.",
    "Claim a quest, raise a hand for a role, come to the feast tonight.",
)

# -- 13. Welcome Walk w7 (census :6752) -----------------------------------
swap(
    "a funded build, a claimed quest, a filled seat. Delete the map and no truth dies.",
    "a funded build, a claimed quest, a filled role. Delete the map and no truth dies.",
)

# -- 14. Maia's welcome (census :6843) ------------------------------------
swap(
    "a funded build, a claimed quest, a filled seat. Hover anything",
    "a funded build, a claimed quest, a filled role. Hover anything",
)

# -- 15. Wall button tooltip (census miss, :6263) --------------------------
swap(
    "wallBtn:'Every open seat and quest in one list. Find somewhere to help.'",
    "wallBtn:'Every open role and quest in one list. Find somewhere to help.'",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(
    f"copy-02 seats->roles patched {HTML}: {before} -> {len(src)} bytes "
    f"({len(src)-before:+d}), {skipped} edit(s) already applied"
)
