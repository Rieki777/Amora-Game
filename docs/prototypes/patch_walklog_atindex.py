#!/usr/bin/env python3
"""Keep the step number on the row that ends the walk.

`endWalk` resets WIDX before it pushes the terminal row, so `at_index` on
`complete` and `abandoned` is always -1. The drop-off report does not care: it
credits a departure to the last step actually SEEN, so the numbers are right
either way. What it costs is a raw row that cannot answer "where did this run
stop" without joining to the row before it, and walk_log is small enough that
somebody will read it directly one day.

The fix the Round D lane suggested, captured as a script so running it costs
them nothing while they are mid-round.

Usage: python3 patch_walklog_atindex.py [grounds-v0.html]
"""
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else "grounds-v0.html"
src = open(HTML, encoding="utf8").read()

OLD = ("function endWalk(done){clearTimeout(WTMR);WIDX=-1;"
       "$('walkCard').classList.remove('show');\n")
NEW = ("function endWalk(done){clearTimeout(WTMR);const atEnd=WIDX;WIDX=-1;"
       "$('walkCard').classList.remove('show');\n")

n = src.count(OLD)
assert n == 1, f"endWalk anchor appears {n} times, expected 1"
src = src.replace(OLD, NEW, 1)

OLD2 = "WALK_LOG.push({step:done?'complete':'abandoned',at_index:WIDX,ts_seq:WALK_LOG.length});"
NEW2 = "WALK_LOG.push({step:done?'complete':'abandoned',at_index:atEnd,ts_seq:WALK_LOG.length});"
n2 = src.count(OLD2)
assert n2 == 1, f"terminal-row anchor appears {n2} times, expected 1"
src = src.replace(OLD2, NEW2, 1)

open(HTML, "w", encoding="utf8").write(src)
print("terminal walk rows now carry the step they ended on")
