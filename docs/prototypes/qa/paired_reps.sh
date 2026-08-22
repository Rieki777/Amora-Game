#!/usr/bin/env bash
# PAIRED ALTERNATING reps of the artifact suites, CTRL then LANE, n times.
#
# The suites are intermittent on pristine main, so a single run of each proves
# nothing and a raw failure count proves less. This runs the same suite against
# the pre-patch blob and against the working tree back to back inside one rep,
# so a machine that is busy for thirty seconds is busy for BOTH sides of the
# pair, and reports each side's failures as a SET so the lane's can be compared
# to the control's as a subset or a superset rather than as a number.
#
#   CTRL=<path to the pristine artifact> REPS=5 bash paired_reps.sh
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$HERE/env.sh" >/dev/null
LANE_FILE="$GROUNDS_FILE"
CTRL_FILE="${CTRL:?set CTRL to the pristine artifact URL}"
REPS="${REPS:-5}"
SUITES="${SUITES:-verify_features.js verify_badges.js verify_publish.js verify_loom.js verify_doors.js verify_vocab_bridge.js}"
OUT="${OUT:-$HERE/../.qa-out/paired}"
mkdir -p "$OUT"

for r in $(seq 1 "$REPS"); do
  for side in CTRL LANE; do
    f=$CTRL_FILE; [ "$side" = LANE ] && f=$LANE_FILE
    for s in $SUITES; do
      log="$OUT/${s%.js}.$side.$r.log"
      GROUNDS_FILE="$f" NODE_PATH="${NODE_PATH}" node "$HERE/$s" >"$log" 2>&1
      code=$?
      n=$(grep -c '^FAIL' "$log")
      # HOW MANY CHECKS ACTUALLY RAN, recorded in the log itself.
      # A suite that throws partway prints no more FAIL lines, and a failure
      # count is then indistinguishable from a clean run. paired_summary.sh
      # reads this trailer and refuses to compare a side that produced none.
      ran=$(grep -cE '^(PASS|FAIL) ' "$log")
      printf '__QA_EXIT %s __QA_CHECKS %s\n' "$code" "$ran" >>"$log"
      echo "rep$r $side ${s%.js} exit=$code checks=$ran fails=$n"
    done
  done
done
