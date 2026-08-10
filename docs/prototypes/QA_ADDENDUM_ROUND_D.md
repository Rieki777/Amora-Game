# QA addendum — Round D (`v0.8-roundD`)

Written beside `QA_ADDENDUM_ROUND_C.md`. This is what Round D added to the
suites, what a live tester should look at with their own eyes, and the three
things that are still open.

## Running the suites on Windows

The suites were born on a Linux sandbox and read their paths from
`qa/env.sh` now:

```bash
cd docs/prototypes && source qa/env.sh
node check_blocks.mjs grounds-v0.html   # every inline <script>, parsed alone
node qa/verify_doors.js                 # DOORS: ALL GREEN
node qa/verify_features.js              # FEATURES: ALL GREEN
node qa/verify_badges.js                # BADGES: ALL GREEN
node qa/verify_loom.js                  # LOOM: ALL GREEN
node qa/_dump_scene.js out.json && node qa/check-schema.js out.json
```

Two traps recorded so nobody pays for them twice:

- **Playwright's `isMobile` lies here.** On chromium-1223 a 390x844 context
  reports `innerWidth` 1560 while `visualViewport` still says 390. Anything
  the page sizes from `innerWidth` then renders at desktop scale inside a
  phone-shaped frame. The pocket contexts use `hasTouch` alone.
- **`qa/` needs its own `package.json`** (`{"type":"commonjs"}`) because the
  repo root is `"type":"module"` and the suites are CommonJS.

## What the suites now assert

`verify_features.js` grew from 35 checks to 71; `verify_badges.js` is new at
36. The additions, by round:

| round | what is held |
|---|---|
| D1 | the zoom floor is FIT x 0.85; the whole land fits at the floor; every building reaches screen centre; the rim past the land is half what the first build showed, across four zooms and four sides; ctrl-wheel and Safari gestures zoom the land and not the page; the panel-aware flight; label offsets; the pocket pinch reaching the same floor on a 390 px phone; district plates standing back when the land is too small to carry them |
| D2 A1 | no two marks overlap anywhere on the land; every mark over the map answers its own tap; badge over label over building; the star is a seal with its own hit area; 44 px of thumb under a 22 px mark; crowded rings collapse to a counted seal; a tap opens the right tab |
| D2 A2/A3 | the label carries no counts as text; one activity seal below the gate and none above it; every count is the projection; parchment ink on dark ground; the rim breathes at two days; the home chip at every distance, its sheet, and `?structure=`; the lodge counting beds; district plates and geography names clearing the marks and each other at five far zooms |
| badges P1-P4 | marks match the projections; rim vocabulary; pips one to three; the zoom gate; item addresses and the cold arrival; each kind opening its own thing; the seed writing a quest as the creator's word; the calm system, the filters, the fan, the walk's badge gate; the founder's silence and weight, exported and restored |
| D3 | (see below: held at the samples gate) |
| D4 | a copy carries its quests and seats and no flows, arrives in the hand, and undoes whole; the vital saying where its number came from; hold and release; the role combobox and its re-address; the Vision's own line, seeded, exported, reachable |
| D5 | both promises saying plainly what a tap does; going and withdrawing; yours and released; the first step; the mark on the land; every promise crossing the bridge both ways; Maia presenting a journey with its progress and its two controls |

## What a live tester should look at

The suites assert against app internals, so these are the things only eyes
catch:

1. **The rim, on a real phone.** Pinch all the way out. The whole land should
   sit on screen with real ground around it, not colour.
2. **The marks in the Village Heart at z 1.7.** Nothing should touch. Six or
   seven rings collapse to a counted seal there; tapping one should open it.
3. **The far view at z 0.85.** One dark chip per building with a number, and a
   home chip on the three housing structures. Nothing else.
4. **A journey.** Take the Resident Journey from the Loom. Every beat should
   arrive in Maia's card, never as a toast.
5. **Claim a quest with `how_to` set.** The first step should appear the
   moment it becomes yours.

## Held at the samples gate

Three D3 treatments are built, default-on where the plan said so, and waiting
on Rye rather than on code. Each is one line to change:

- the nine flow glyphs (`SKIN.flow_style`, default `'glyph'`)
- the bamboo scaffold on Building-phase structures
- ribbon versus the golden tablet (`SKIN.label_style`, default `'ribbon'`)

## Still open

- ~~`endWalk` set `WIDX=-1` before pushing the terminal row~~, so `at_index` on
  `complete` and `abandoned` was always -1. Found by the parallel lane and
  fixed by it in `patch_walklog_atindex.py`, applied here because this lane was
  holding the artifact.
- **The healed water in the surround plate** still shows a faint straight edge
  in the far south-west. It is Esri's own capture boundary, healed rather than
  removed, and it sits well outside the boundary.
- **`my_rsvps` and `my_claims` export at the top level**, not nested under
  `events`. The round doc said `events.my_rsvps`, and `events` is an array, so
  a JSON array cannot carry the key. Two top-level lists say the same thing.
