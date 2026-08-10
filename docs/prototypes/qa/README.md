# QA harness — Amora Living Map

Drives the full 27-section matrix against `grounds-v0.html` in one continuous
Playwright session and prints an instrumented log plus ~85 screenshots.

It asserts against **app internals**, not pixels — camera clamp per rendered
frame, per-icon class flags, undo depth, `SCENE` counts, export schema — so it
stays true when the art changes.

## Run

    npm i -D playwright
    node run.js                 # full matrix, ~19 min
    ONLY=A node run.js          # one block (A=§1-10 B=§11-16 C=§17-20 D=§21-23 E=§24-26)

Point `FILE` in `lib2.js` at your copy of the prototype, and `executablePath`
at your chromium if Playwright's bundled one isn't where it expects.

Output: `shots/` (screenshots), `errors.jsonl` + `tally.json` (every pageerror
and console error captured across the session — the bar is zero).

## Layout

| file | what |
|---|---|
| `lib2.js` | boot + listeners-before-navigation, and the helper vocabulary (`clickPoi`, `poiHit`, `landPt`, `blackEdge`, `badText`, `mmHash`, `closeInspect`…) |
| `run.js`  | session runner; enters the land, runs each block, prints the §27 tally |
| `secA–E`  | the matrix, one file per block |

## Two helpers worth knowing

- `H.landPt(inside, i)` returns a screen point that is **bare canvas** (not HUD,
  not an icon) and inside/outside the property line. Most flaky-looking failures
  are a click landing on a HUD button; this avoids that.
- `H.reachPoi(k)` hit-tests an icon's centre and re-centres the camera if
  something covers it, so tests fail on real bugs rather than on occlusion.

## Adding a check

Each section module is `async (page, H) => { … }`. Log with `H.log`, screenshot
with `H.shot('name')`, read app state with `H.ev(() => …)`. Anything thrown is
caught by `run.js`, screenshotted as `CRASH-<block>.png`, and the run continues.

## Standalone verifiers

The `verify_*.js` files run on their own against one concern each, outside the
27-section matrix. They read `GROUNDS_FILE` and `PW_EXE` from `env.sh`, print
`PASS`/`FAIL` lines, and exit non-zero on any failure.

    source ./env.sh && node verify_doors.js

`verify_skin_bridge.js` is the site lane's, and it checks the contract rather
than the map: the site stores a skin through a sanitiser that rebuilds the
object field by field, so any key `skinExport()` gains and the site has not is
dropped on save with no error anywhere. Its last check compares the two key
sets and names the difference. **When the map's skin gains a key, run it.**

## Known harness caveats

- Native `title` tooltips (the vitals bar) can't be screenshotted headlessly —
  the harness asserts the attributes instead.
- §22's "refuses below 3 vertices" trims `SCENE.bound` programmatically to reach
  the 3-vertex state, then right-clicks a real handle. The refusal is genuine;
  only the setup is scripted.
- The `§25` blueprint-edge check is vacuous with the shipped seed data — there
  are no flows touching a blueprint structure.
