#!/usr/bin/env python3
"""Copy pass R5, group 1: the retired name "Hearts" leaves the living map.

The token has been Gratitude for rounds; the map still teaches the old name in
five places, including the Welcome Walk's "our first rule". Census refs
(COPY_CENSUS_2026-08-21.md) and their treatment here:

  :1111  vitals bar label "Hearts"        -> "Gratitude"; sub "gratitude this
         cycle" -> "sent this cycle" so the chip does not read
         "Gratitude - gratitude this cycle". Key k:"hearts" is machinery, kept.
  :5933  vitals name map hearts:'Hearts'  -> 'Gratitude' (the drop-down title,
         census :5929, renders from this map, so it is covered by this edit).
  :5456  quest door blurb "Hearts for the work" -> "Gratitude for the work".
  :6739  Welcome Walk w2 "our first rule: Hearts are gratitude"
         -> "our first rule: Gratitude is thanks". Plain first, rule kept.
  :6745  Welcome Walk w4 "thank you in Hearts" -> "thank you in Gratitude".

Decided NO-OPS, on purpose:
  :892 and :5423 are the Exchange room's own copy; they are rewritten whole by
       patch_copy_03_exchange_room.py so no line is edited by two scripts.
  :3654, :5929-5930, :1268-1269 carry the HEART GLYPH beside Gratitude amounts
       ("+15 [heart]", "132 [heart] moved this cycle"). The glyph is the
       Gratitude mark everywhere on the map and the site (quest rewards, the
       wall); none of these lines say "Hearts", so there is nothing to rename.
       The hardcoded sample numbers are the SEED program's business, not this
       pass's.

House protocol: exact-count anchors, refuse on any count that is not 1,
idempotent (a rerun finds every new string already present and writes nothing).
Usage: python3 patch_copy_01_hearts_to_gratitude.py [grounds-v0.html]
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


# -- 1. The crown vitals bar (census :1111) -------------------------------
swap(
    '{k:"hearts",label:"Hearts",v:132,sub:"gratitude this cycle",src:"Gratitude"}',
    '{k:"hearts",label:"Gratitude",v:132,sub:"sent this cycle",src:"Gratitude"}',
)

# -- 2. The vitals name map behind the drop-downs (census :5933, :5929) ---
swap(
    "const name={people:'People',food:'Food',water:'Water',canopy:'Canopy',hearts:'Hearts',moon:'The Moon'}[k]||k;",
    "const name={people:'People',food:'Food',water:'Water',canopy:'Canopy',hearts:'Gratitude',moon:'The Moon'}[k]||k;",
)

# -- 3. The quest door blurb (census :5456) -------------------------------
swap(
    "blurb:'Find somewhere to help. Hearts for the work, claimed with consent.',",
    "blurb:'Find somewhere to help. Gratitude for the work, claimed with consent.',",
)

# -- 4. Welcome Walk w2, the first rule (census :6739) --------------------
swap(
    "body:'First meals, first questions. And our first rule: Hearts are gratitude. We thank each other. We never pay each other to care.',",
    "body:'First meals, first questions. And our first rule: Gratitude is thanks. We thank each other. We never pay each other to care.',",
)

# -- 5. Welcome Walk w4 (census :6745) ------------------------------------
swap(
    "Find the work you love that the village needs, and it will thank you in Hearts.',",
    "Find the work you love that the village needs, and it will thank you in Gratitude.',",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(
    f"copy-01 hearts->gratitude patched {HTML}: {before} -> {len(src)} bytes "
    f"({len(src)-before:+d}), {skipped} edit(s) already applied"
)
