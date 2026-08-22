#!/usr/bin/env python3
"""Copy pass R5, group 3: the Exchange room explains itself, enchant-first.

The founder's own reported confusion (census, WORST OFFENDERS 1 and 7): the
Exchange blurb carried three token types and a governance rule in two lines,
the retired name "Hearts" on top, and the library rows compressed the lending
doctrine to "wear quoted up front" and "escrowed". Revised under R46
(enchant-first): a door BLURB is a surface line, so it leads with the image
and keeps the plain mechanics after it; a DOCK TIP and a TABLE CELL are the
map's own tooltip layer, so they stay plain, which is exactly where R46 puts
the mechanics.

Census refs and their treatment:
  :892   dock tip, wallet door  -> plain one-liner, Hearts -> Gratitude.
  :5423  Exchange door blurb    -> one plain line per token, votes rule kept.
  :5424  Gratitude table row    -> "thanks for work, never pay".
  :5427  Library credits row    -> "escrowed while you borrow" becomes
                                   "set aside while you borrow".
  :895   dock tip, library door -> "wear quoted up front" spelled out.
  :5447  Material Library blurb -> same, in the door's own words.

Kept, deliberately:
  :5425 stay credits row ("work-exchange quests extend your stay") is already
        plain. :5448-5450's "quoted before you borrow" likewise.
  The table's sample balances are the SEED program's business.
  The site page (Wallet.tsx) got the same one-name treatment in the same
  commit, so door and page now agree: the room is The Exchange.

House protocol: exact-count anchors, refuse on any count that is not 1,
idempotent (a rerun finds every new string already present, writes nothing).
Usage: python3 patch_copy_03_exchange_room.py [grounds-v0.html]
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


# -- 1. The wallet dock tip (census :892) ---------------------------------
swap(
    'data-tip="The Exchange. One ledger, every token; Hearts are thanks, never a wage. · /wallet"',
    'data-tip="The Exchange. Every token in one room; Gratitude is thanks, never pay. · /wallet"',
)

# -- 2. The Exchange door blurb (census :5423) ----------------------------
swap(
    "blurb:'One ledger, every token. Hearts are gratitude, never a wage. Stay credits and library credits are useful, never votes.',",
    "blurb:'One room, one ledger: every token the village lives by leaves its thread here. "
    "Gratitude is thanks for work, never pay. Stay credits are nights earned through work "
    "exchange. Library credits are the deposit that waits while you borrow. None of them are votes.',",
)

# -- 3. The Gratitude table row (census :5424) ----------------------------
swap(
    "<tr><td>♥ Gratitude</td><td><b>132 ♥</b></td><td>recognition, the thank-you economy</td></tr>",
    "<tr><td>♥ Gratitude</td><td><b>132 ♥</b></td><td>thanks for work, never pay</td></tr>",
)

# -- 4. The Library credits row (census :5427) ----------------------------
swap(
    "<tr><td>🧰 Library credits</td><td><b>850</b></td><td>escrowed while you borrow</td></tr>",
    "<tr><td>🧰 Library credits</td><td><b>850</b></td><td>set aside while you borrow</td></tr>",
)

# -- 5. The library dock tip (census :895) --------------------------------
swap(
    'data-tip="Material Library. Borrow with a deposit, wear quoted up front. · /library"',
    'data-tip="Material Library. Borrow with a deposit; wear has a price, told to you first. · /library"',
)

# -- 6. The Material Library door blurb (census :5447) --------------------
swap(
    "blurb:'The lending commons. Add your tools to earn credits, borrow with a deposit, wear quoted up front. Every item carries its own story.',",
    "blurb:'One shelf, many hands: what you no longer need becomes what a neighbor was missing. "
    "Add your tools to earn credits; borrow with a deposit. Wear has a price, and you see it "
    "before you borrow. Every item carries its own story.',",
)

open(HTML, "w", encoding="utf8", newline="").write(src)
print(
    f"copy-03 exchange room patched {HTML}: {before} -> {len(src)} bytes "
    f"({len(src)-before:+d}), {skipped} edit(s) already applied"
)
