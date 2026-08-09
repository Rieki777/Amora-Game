# QA pass — Amora Living Map v0.7 (doors + circles + loom build)

Paste this whole file as the opening prompt of a fresh session. The deliverable of the QA session is a
numbered bug list (severity · surface · repro steps · expected vs actual), committed as
`docs/prototypes/QA_REPORT_<date>.md` — plus screenshots of anything visual.

## Context

`docs/prototypes/grounds-v0.html` (~4.1 MB, self-contained, no network needed except sprite-less fallback)
is the Living Map prototype for game-amora. Everything on it obeys two doctrines:
**D9 lens-not-ledger** (the map addresses, never stores — delete the map and no data dies) and
**creator's word is law** (gold = creator pick, never re-resolved; amber = deterministic suggestion,
always overridable; gray = the Board pool). The current wiring of site quests/roles/journey-steps is
**deliberately amber (unapproved)** — do not report "site quests are guesses" as a bug.

Verified green before handoff: `qa/verify_loom.js` (40 checks), `qa/verify_doors.js` (43 checks),
`qa/run.js` sections A–E, `qa/check-schema.js` — all zero page/console errors. Your job is to break it
anyway.

## Surfaces to attack

1. **Map-type selector** (top-left): 🏞 Living Map | ◎ Circles. Default Living. Esc from Circles returns.
   Try: rapid toggling, toggling mid-camera-travel, mid-journey-walk, with the Loom open, with a panel open,
   during build mode, after restore. Hash `#/circles` deep-link cold-boot.
2. **The Circles org map**: 11 circles + village center + role nodes (open calls pulse) + quest satellites.
   Wheel-zoom at cursor, drag-pan, click nodes (circle → its home structure's panel on the land; role/quest →
   its address; unplaced → toast). Try: zoom to extremes, drag then click (should NOT fire click after a drag),
   clicking while zoomed far out, window resize. Known nit: role labels crowd on the Land circle — report
   severity honestly.
3. **The Loom** (⧉ or `L`): filters (kind/provenance/circle), drag ◉ grips between places, stage → Save/Discard,
   un-address to the Board, thread `+ place` chips, journey `walk it` buttons. Try: dragging while filters hide
   the target's section, staging then switching map type, staging then closing and reopening, Save with 10+
   staged, Escape mid-drag.
4. **Module doors**: dock (♥🛏⌂🧰➹◐), door CTAs on Guest Lodge / Sanctuary (when-built) / Ridge Hamlets /
   Pond Hamlet / Library / Community Center / Market. Sheets must show sample content + a live-site link
   (`https://amora.regencivics.earth` + route). Inspect-card door toggles cycle off → open → when-built and
   are audited. Try: toggling doors then restoring, doors on a newly placed structure, legacy doors in tab 3.
5. **Hash addresses**: `#/place/<key>`, `#/module/<key>`, `#/journey/<id>`, `#/loom`, `#/circles` — cold boot
   each (skips intro), browser back/forward, panel close clears hash. Try nonsense keys (`#/place/nope`).
6. **Journey walks**: from the Loom, the ➹ dock sheet. Esc ends. Try: starting a second walk mid-walk,
   walking j4 (all amber), walking after rewiring steps on the Loom.
7. **Make-this-yours skin step** (build mode ✂ chip, or ◐ dock → open the step): themes, words-theme
   ("volcanic coast"), accent/parchment, label size 80–130, icon style, **dream-mist toggle (default OFF —
   the clean site map)**. Save → audited + autosaved; Reset to Amora. Try: skin + restore roundtrip, skin
   while Circles map open, extreme label sizes vs the label collision engine.
8. **Clean satellite**: bay foam and tile seams were removed; land untouched (white squares are roofs, not
   clouds). Check painted mode still bakes; check minimap; zoom the bay for inpaint artifacts.
9. **Persistence**: autosave (2.5 s debounce) → reload → restore. Everything above must survive: rewires,
   un-addresses (`creator-board` must NOT be re-guessed), doors, skin, scale, threads, journeys.
10. **Regressions**: build mode (place/move/remove/undo), draw/boundary/features, resolver demo, curation grid,
    the Wall, terrain switch (Satellite | Painted | Vector + brush/palette), themes, day/night, tour, Maia,
    held-key crash sweep (hold every arrow/key combo 5 s each across surfaces), export → `check-schema.js`.

## Automated suites (run before and after manual work)

The suites live in `docs/prototypes/qa/`. They were written against the cloud sandbox path — edit the
`FILE` constant at the top of each to your local absolute path of `grounds-v0.html`, and `EXE` to a local
Chromium if needed (or run with default Playwright install: remove `executablePath`).

    node qa/verify_loom.js     # 40 checks — Loom, provenance, drag/save, restore
    node qa/verify_doors.js    # 43 checks — doors, dock, deep-links, journeys, skin, circles map
    ONLY=A node qa/run.js      # boot + interactions harness (B,C,D,E likewise, one at a time)
    node qa/check-schema.js <exported amora-scene.json>   # 12-block export contract

A PASS wall is the starting line, not the finish. Zero `pageerror` and zero `console.error` is a hard gate
on every surface — collect them the whole session.

## Do not regress (fixed in earlier passes — re-verify, don't re-litigate)

- Labels always win, never collide, never squat on a neighbour's icon click-centre.
- Deterministic everything: same seed → same map; painted plate is a pure filter over the satellite
  (brush 0 = pixel-identical satellite).
- Slug keys only in exports; feature ids never reused; counts computed on read, never stored.
- Creator picks are never re-resolved; `creator-board` (explicit un-address) is never re-guessed.
- The sprite art direction is LOCKED: futuristic solarpunk-elven, grown-not-built.

## Open items (context so you don't report them as new)

- The whole site inventory is amber pending Rye's approval round on the Loom.
- Org-map role labels crowd on dense circles (Land); spacing pass welcome as a FIX suggestion.
- A very faint residual seam remains bottom-left in the bay at extreme zoom (under painted mode it vanishes).
- Rye still needs to add GEMINI_API_KEY to `.env` locally (remote tools may not write `.env`).
- Site-side work (not this file's scope): Make-This-Yours step 6 (map skin fields), mounting this map at
  `/map` beside the radial org view, module sheets → real module mounts, site → `#/place/…` links.

## Report format

    ## QA REPORT <date>
    ### Bugs
    B1 [high|med|low] <surface> — <one-line>
       repro: … · expected: … · actual: … · console: …
    ### Fixes suggested (not bugs)
    F1 …
    ### Verified clean
    <the surfaces/suites that held>

End the report with a **Handoff Breakdown**: what the next build session can do autonomously vs what needs
Rye (env vars, git push, browser-only checks, live-site verification).
