# Site-side mobile round — app-mode shell, walk editor, one config push

**Paste into Claude Code** (worktree off current `origin/main`; never edit `docs/prototypes/**`
except committing the map lane's file verbatim when asked). The artifact now carries the pocket
profile (`body.pocket`, auto below 820 px touch; test with `#?hud=pocket`), the Welcome Walk
engine with gesture gates, and two bridge contracts you build against:

- map → parent: `{type:'grounds-ready', version}` (existing) and now `{type:'exit'}`
- parent → map: `{type:'config', skin?, walk?, vocabulary?}` — one push applies all three.
  `walk` is an ordered array `{id, structure_key, title, body, gesture: pan|tap|pinch|toggle|none|choice,
  gate_hint?}`; the artifact's built-in Amora seed is the fallback and ships in every export at
  `walk.steps`. Walk completion/abandon events sit in `walk.log` (instrument-now).

## Tasks

**T1 — App-mode shell + Exit.** On `/map`: hide the SPA header/bottom nav, full-bleed the iframe;
listen for `{type:'exit'}` → restore chrome and navigate back (or home). Push a history entry on
enter so browser Back exits identically. Commit the current artifact (has viewport-meta pocket
build) and deploy with this.

**T2 — `/api/map/config`.** Returns `{skin, walk, vocabulary}` from village config (walk stored as
`map_walk` doc beside `skin`, `config_key` discipline as before; null walk = seed). Shell pushes
`{type:'config', ...}` on `grounds-ready` (keep the old `{type:'skin'}` push for compat, or drop
it after verifying). PUT endpoint admin-gated.

**T3 — Walk editor panel** in Make This Yours (self-contained panel pattern): ordered step list
(drag to reorder, add, delete), per-step structure picker (source keys from the scene export or a
static list endpoint), title/body/gesture/gate-hint fields, and **Preview on the map** — push the
draft via `{type:'config', walk: draft}` to an embedded preview iframe without saving. Blank keeps
Amora's value. Multi-language ready: store steps per `lang`, default `en`.

**T4 — Walk analytics landing.** Optional table (or reuse the concierge pattern) so future
imports of `walk.log` have a home; importer extension can wait.

**T5 — PWA.** Manifest + minimal service worker so `/map` is installable; installed launches are
app-mode by definition.

**T6 — Gates + wrap.** All house gates, single watched test run, orphan sweep, PR body, push
commands for Rye. Real-phone verification is Rye + QA (note: desktop Playwright's `isMobile`
emulation mis-maps clicks on this artifact — test pocket with a plain 390×844 viewport +
`#?hud=pocket`, or a real device).

## Rye — only you
Bless the walk seed copy (feedback round is open in the map lane); real-phone pass of `/map`
after T1 deploys; `/events` route call (still open); amber approval round (still open).
