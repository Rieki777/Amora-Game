#!/usr/bin/env bash
# Aggregate paired_reps.sh output as SETS, not counts.
#
# A raw failure count is not a comparison when the suite is intermittent: four
# on one side and one on the other says nothing until you know whether they are
# the SAME four. This prints, per suite, every check that ever failed on each
# side across all reps, then states the only verdict that matters: whether the
# lane's failing set is a subset of the control's.
#
# THE IDENTITY OF A CHECK IS ITS SENTENCE, NEVER ITS NUMBERS. Several of these
# print the value they measured into the message ("flies you in to gate at z
# 1.13"), so without normalising, two runs of the SAME failing check read as two
# different failures and the set comparison becomes nonsense. That is exactly
# what the first version of this script reported.
#
# AND A CRASH IS NOT A CLEAN RUN. This script used to grep '^FAIL' and nothing
# else, so a suite that threw at check 3 of 31 contributed an EMPTY failing set,
# the empty set is a subset of everything, and the verdict read
# "lane failures are a SUBSET of the control's" about a control that never ran.
# That happened on five of five reps, on a lane and on its reviewer, and the
# comparison it printed was worth nothing. Every side now has to prove it RAN:
# a non-zero check count on every rep, from the __QA_CHECKS trailer paired_reps
# writes, before a single set is compared.
set -u
OUT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../.qa-out/paired}"

# The check ID before the first colon is kept EXACTLY (D1.1 and D5.3 are
# different checks); only the measurement in the sentence after it is blanked.
norm() {
  sed 's/ *(.*//' \
    | awk '{ i = index($0, ": "); if (!i) { print; next }
             id = substr($0, 1, i + 1); rest = substr($0, i + 2)
             gsub(/[0-9]+(\.[0-9]+)*/, "#", rest); print id rest }'
}

fails() { cat "$OUT/$1.$2."*.log 2>/dev/null | grep '^FAIL' | norm; }

# Every rep's check count, one per line. A log with no trailer is from an older
# paired_reps run and is counted straight out of the log so this stays usable.
counts() {
  for f in "$OUT/$1.$2."*.log; do
    [ -e "$f" ] || continue
    t=$(sed -n 's/^__QA_EXIT [0-9-]* __QA_CHECKS \([0-9]*\)$/\1/p' "$f" | tail -1)
    [ -n "$t" ] || t=$(grep -cE '^(PASS|FAIL) ' "$f")
    echo "$t"
  done
}

rc=0
for suite in $(ls "$OUT" | sed 's/\.\(CTRL\|LANE\)\.[0-9]*\.log$//' | sort -u); do
  echo "== $suite"
  ran_ok=1
  for side in CTRL LANE; do
    reps=$(ls "$OUT/$suite.$side."*.log 2>/dev/null | wc -l)
    [ "$reps" -eq 0 ] && continue
    n=$(fails "$suite" "$side" | wc -l)
    c=$(counts "$suite" "$side" | tr '\n' ' ')
    dead=$(counts "$suite" "$side" | grep -c '^0$')
    echo "   $side  $reps reps, checks per rep [ $c], $n failing check(s) total"
    fails "$suite" "$side" | sort | uniq -c | sed 's|^|        |'
    if [ "$dead" -gt 0 ]; then
      ran_ok=0
      echo "        DID NOT RUN on $dead of $reps reps: zero checks reached. Its failing set is"
      echo "        empty because nothing was measured, NOT because nothing was wrong."
    fi
  done
  if [ "$ran_ok" -eq 0 ]; then
    rc=1
    echo "   VERDICT: NO COMPARISON. A side that produced no checks cannot be compared to one"
    echo "            that did; the empty set is a subset of everything and says nothing."
    continue
  fi
  only=$(comm -13 <(fails "$suite" CTRL | sort -u) <(fails "$suite" LANE | sort -u) | grep -v '^$')
  if [ -z "$only" ]; then
    echo "   VERDICT: lane failures are a SUBSET of the control's"
  else
    rc=1
    echo "   VERDICT: the lane fails checks the control never did:"
    echo "$only" | sed 's|^|        NEW |'
  fi
done
exit $rc
