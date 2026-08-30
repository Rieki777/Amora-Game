# Site-side final round — close every open item

**Paste into the Claude Code session** (worktree pattern as before; `origin/main` at `a3915f4`+).
Guardrail unchanged: `docs/prototypes/**` content is the map lane's — with the ONE exception in T1,
where you commit its already-written file verbatim, no edits.

## Context

Live QA passed the deploy gate (report: `QA_REPORT_LIVE 2026-08-08`). The map lane fixed its three
findings in the artifact, already written to the main checkout's working tree:
`docs/prototypes/grounds-v0.html` is now **v0.7-roundC1** — hash routes exclusive (B3), honest miss
on unknown `#/place` keys (B4), `map_scene.version` + `grounds-ready` share one `BUILD_VERSION` (B5).
Your job: ship it, fix the three site-side findings, and close the tail.

## Tasks

**T1 — Ship the fixed artifact.** From the main checkout: commit `docs/prototypes/grounds-v0.html`
exactly as it sits (the `.gitattributes -text` pin you added protects the bytes), push, redeploy.
Verify live: iframe `grounds-ready` reports `v0.7-roundC1` and `#/loom` → `#/circles` no longer
stacks. If the QA session is available, hand it the leftover sections (§2 same-tab door nav + Back,
§3 module-ON path, §4 localStorage/two-browser/mobile, §5 remaining hostility) — they rerun against
this build.

**T2 — B2/F1, painterly truth.** `MapSkinPanel` must initialize from `GET /api/map/skin` and treat
`painterly: null` as *unset*: render the map's runtime defaults (brush **1.0**, palette **0.3** —
shown as 100%/30%), and a Save with untouched sliders must write nothing new (no-op save may not
repaint the land). Prefer keeping `null` in storage until a founder actually moves a dial. Add the
regression test: fresh state → open panel → Save → `GET /api/map/skin` unchanged.

**T3 — B1, Dream mist (blocked on Rye's hand-tick).** If his manual tick also drops `mist`, trace
the form→PUT→merge path for a boolean lost in the brand merge (the `getBrand()` named-sections trap
you already know) and fix with a test. If his tick persists fine, close B1 as the synthetic-checkbox
artifact — no code change.

**T4 — F2, artifact caching.** Serve `/grounds/index.html` with a real `max-age` + ETag, or move to
a content-hashed filename with the manifest carrying the current name. A 4 MB revalidate on every
navigation is a free win. Keep the manifest probe contract intact.

**T5 — `/events` (on Rye's word in this same message thread).** If confirmed: nav entry + route
when the gatherings module is ON, per your T5 round-2 work. Note for the record that the map's
Events door repoint (`/seasonal-festivals` → `/events`) is a map-lane one-liner Rye will request
there — do not edit the artifact.

**T6 — Painterly `null` restore (optional, on request).** The QA pass left `painterly` at 0.5/0.5
where it was `null` pre-test. If Rye wants the original state: one `PUT`/DB nudge setting
`brand.skin.painterly = null`, disclosed in your report.

**T7 — Wrap.** Full gates (check/brand/voice/build/tests, budgets), single watched test run, orphan
sweep, push. Final report with the standard Handoff Breakdown.

## Handoff Breakdown

### RYE — only you
| # | Task |
|---|---|
| 1 | Hand-tick Dream mist once; tell the session what `GET /api/map/skin` returned (gates T3) |
| 2 | Confirm `/events` (gates T5) — then ask the map lane for the one-line door repoint |
| 3 | Confirm the GitHub Actions run on `a3915f4` went green (open item from the ship report) |
| 4 | Say the word on T6 if you want the pre-test plate back |
| 5 | Approve the amber wiring on the live Loom — drag, Save, export; the oldest open item, and now doable on the real site |

### SESSION — autonomously
T1, T2, T4, T7 immediately; T3/T5/T6 as unblocked above.
