#!/usr/bin/env bash
# Run verify_help_l8.js against every staged mutation and report, per mutation,
# whether the gate went RED and on which checks.
#
# THE TWO THINGS THIS ASSERTS BEFORE BELIEVING ANY VERDICT:
#   1. the control produced a NON-ZERO check count — a crash contributes an
#      empty FAIL set and would otherwise read as a clean pass;
#   2. the control's artifact is the STAGED one, echoed per run, so a green is
#      never about the working tree by accident.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${MUT_ROOT:?set MUT_ROOT to a real C:/ path}"
JOBS="${JOBS:-4}"
export PW_EXE="${PW_EXE:-C:/Users/taren/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe}"
export NODE_PATH="${NODE_PATH:-C:/Users/taren/Downloads/regen-civics-clean/node_modules}"

names="$(python "$HERE/_mut_l8.py" --list | awk '{print $1}')"
mkdir -p "$ROOT"

one () {
  local n="$1" d="$ROOT/$n"
  rm -rf "$d"
  python "$HERE/_mut_l8.py" "$n" "$d" >/dev/null || { echo "$n STAGE-FAILED"; return; }
  local url="file:///$(cygpath -m "$d/grounds-v0.html" | sed 's|^/||')"
  GROUNDS_FILE="$url" node "$HERE/verify_help_l8.js" > "$ROOT/$n.log" 2>&1
  local code=$?
  local checks fails
  checks=$(grep -oE '^CHECKS [0-9]+' "$ROOT/$n.log" | awk '{print $2}')
  fails=$(grep -oE 'FAILS [0-9]+$'   "$ROOT/$n.log" | awk '{print $2}')
  [ -z "${checks:-}" ] && checks=0
  [ -z "${fails:-}" ] && fails=0
  printf '%s|%s|%s|%s\n' "$n" "$code" "$checks" "$fails" >> "$ROOT/_summary.psv"
}

: > "$ROOT/_summary.psv"
i=0
for n in $names; do
  one "$n" &
  i=$((i+1))
  if [ $((i % JOBS)) -eq 0 ]; then wait; fi
done
wait
echo "done"
