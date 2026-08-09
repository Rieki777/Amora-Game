# QA pass — Amora Living Map prototype v1.0 (grounds-v0.html)

You are a QA tester. Your ONLY job is to exercise every control and pathway in this web app and produce a structured bug report. Do NOT fix anything, do NOT edit the file, do NOT redesign. Report only.

## Setup

The file is `game-amora/docs/prototypes/grounds-v0.html` (self-contained, ~3.9 MB: harmonized satellite plate + 30 embedded sprites; the painted mode is a deterministic in-browser filter, no second plate). A runnable harness lives beside it in `qa/` (`node run.js`, `node check-schema.js <export>`). Stage/copy it into your workspace, then drive it with Playwright (chromium, viewport 1600×1000). Attach listeners BEFORE loading and keep them for the whole session:
- `page.on("pageerror")` and `page.on("console")` (type=error) — every captured error goes in the report verbatim.

Load via `file://` URL. One continuous session for the whole matrix (no reloads) unless a step says otherwise. Take a screenshot at every numbered step; keep the ones that show bugs. Two cross-cutting rules to police everywhere: **labels always win** (banner crowns never covered by icons/sprites; stacking upward on collision), and **no "undefined"/"null" text ever rendered anywhere**.

## Test matrix — run ALL of it, in order

### Part I — the standing surfaces (v0.5 behaviors, all previously green — regression)

1. **Intro**: page loads with the whole HUD dimmed to invisible (vitals, layer bar, Theme/day buttons, Wall/Build buttons, minimap, attention pill, Maia dock) — only the AMORA card over the dim map. "Enter the Land" → camera flies in, HUD fades up, Maia greets.
2. **Camera**: drag-pan (inertia on release), wheel zoom toward cursor, double-click travel, arrow keys, +/−, H home. Never black beyond map edges.
3. **Hover**: hover 5 different icons → card shows name, circle (or "needs a steward"), state, quest/seat counts; disappears on leave. In build mode, icon hover is suppressed.
4. **Portal panels**: open ≥8 structures (include a spring, the Sanctuary, Water Tank, and one blueprint in Vision mode). 4 tabs each; "Claim this quest" toast + Maia line; "Raise a hand" toast; every Enter-door opens the module stub and "Back to the land" ALWAYS clickable (icons must never intercept — regression of old B1); ✕ and Esc close. Close-race check (old B3): open Water Tank → ✕ → immediately click another structure through the closing panel → its panel opens cleanly, zero errors, no stale header.
5. **Minimap**: 4-corner travel; viewport rect tracks; minimap base image matches the ACTIVE terrain mode (satellite/painted/vector — check after §22).
6. **Vitals bar**: 5 vitals + moon tooltips via title attributes.
7. **Layers**: the bar now has FOUR buttons — Now | Vision | Org | Flows — and must not overlap the ☀ day button or ✦ Theme button at 1600px width. Vision shows masterplan overlay + ghosts; Org halos toggle; Now restores mist.
8. **Day/night**: cycle via ☀; at night: window glow (iso), light pools, moonlight. Verify against actual dayPhase state, not wall-clock assumptions.
9. **Themes**: Emerald Atlas / Terra Sol / Mar Azul re-ink everything live; Maia announces.
10. **Icon style**: now FOUR chips — Auto / Emblems / Isometric / **Painted** (Painted tested in §23; here verify the original three still behave, blueprints stay emblematic).
11. **Custom palette** + 12. **Weave it**: unchanged expectations (deterministic palette from words).
13. **Maia**: 3 chips; free text ("walk me to the greenhouse", "night", "show me quests", "seats", gibberish→graceful fallback); Enter sends; header minimizes.
14. **Tour**: 8 stops, pan mid-tour safe, ends with invitation.
15. **Attention cycle**: Space + button; "Open the door" opens right tab; "Later" ALWAYS clickable; badge counts 8 seats + timed quests and UPDATES when seats/quests are added/removed/moved in build mode (new).
16. **The Wall** (☰ / W): all seats + quests; rows travel + open right tab. NEW sections to verify: "needs a steward" (unowned structures — place one in build mode to see it), "stranded — outside the boundary" (make one via §20), and quests reassigned to the board list as "Quest Board — unaddressed" (non-clickable row). In build mode the Wall sits BESIDE the palette (left offset), and Wall rows open the INSPECT card instead of portal panels.
17. **Build basics**: toggle on (Wall must never cover the Build button — old B2), palette (10 categories, 83 items), ghost placement with boundary rejection, **pass-through placement** (a ghost click on top of an existing icon/banner still places — icons go inert while placing), drag with snap-back, ✕ remove (map + minimap + Wall + badge all clean — old B4; undo restores seats/quests too), Undo button + Ctrl+Z across add/move/remove/boundary, Esc cancels ghost.
18. **Ambient** (~30s): birds, shimmer, surf, smoke, pulse toast ~14s, some Maia narration. Remove the Greenhouse in build mode, wait ≥15s → pulse must NOT error (guarded); undo.
19. **Resize**: 1600×1000 → smaller → larger → back; icons stay glued to buildings.
20. **Keyboard-in-fields guard** (new): focus ANY text input (Maia box, theme words, inspect fields, resolver) and type letters including "w", "h", "v", space, arrows — the map must NOT pan/zoom/toggle wall/fire hotkeys. Escape inside inspect/resolver closes that panel only.

### Part II — the founder's hand (v0.6–v0.8)

21. **Inspect card** (build mode — test hardest with §22, they're newest):
    - Click any structure (icon, banner, or Wall row) → dark inspect card slides in right; camera travels.
    - Identity: rename → banner crown updates live mid-keystroke; archetype dropdown (83 grouped) → emblem AND iso body re-ink instantly; blurb + origin story editable.
    - Circle: attach each of a few circles → emblem ring + banner dot adopt the circle color; "— unowned —" → neutral gray-green ring + Wall "needs a steward" row. Panel/hover copy says "needs a steward" too.
    - Phase & pool: phase radios 1/2/3, pool slider 0–100, activity select. The state pill is DERIVED live (funding <50%, building ≥50%, alive at full pool/phase 1, blueprint at phase 3 + zero pool) and the emblem's gold progress ring tracks the slider. State is never directly editable.
    - Roles: seats here checked; "bring a role from elsewhere" reassigns it here; unchecking returns it to its circle's home structure (toast names it); "add a role here" creates a seat; attention badge updates each time.
    - Quests: listed with address dropdowns (all structures + "Quest Board — unaddressed"); reassign moves them (toasts); board-bound quests appear in the Wall's board section; "add a quest here" works.
    - Doors: edit label/route inline; ✕ removes; add door; portal panel Enter tab reflects changes immediately after leaving build mode; structures with zero doors show the honest empty state in their panel.
    - Flows: inputs and outputs listed with medium dots; add input (defaults to "imported / off-land"), add output; change medium and endpoints; delete. The "% of inputs on-land" figure recomputes on every change.
    - Remove from the map via the card's danger button.
    - EVERY action above must land in the audit trail (verify via export, §26).
22. **Boundary editor** (◇ Boundary in the build footer):
    - On: gold vertex handles + faint mid-segment ghosts render on the line; icons/banners go INERT (clicks near the line never grab or open structures — this was a real bug once).
    - Drag a vertex; click a mid-segment ghost → inserts a vertex and drags it in one gesture; right-click a vertex → deletes (refuses below 3, with toast).
    - Redraw the line to strand the Water Tank outside → red pulsing ring on its emblem + Wall "stranded" section + toast; the structure is NEVER auto-removed; drag it back inside or undo → flag clears.
    - Undo restores whole-polygon snapshots (vertex count AND positions).
    - In vector terrain mode, the baked boundary line updates after each edit (and repaint is deterministic — same forest every time).
23. **Terrain switch + Painted icon style + curation** (✦ Theme panel):
    - Terrain row: Satellite (default) / Painted / Vector. Painted = a DETERMINISTIC FILTER over the satellite (kuwahara + posterize + edge ink + seeded tooth), baked in-browser after load — geometry pixel-aligned by construction. Two sliders appear under Painted: **brush** (0 = raw satellite, pixel-identical — verify by canvas hash) and **palette** (0 = pure filtered satellite, no generated colour; default 30%). THEME wash grades satellite AND painted. Minimap follows mode + sliders.
    - Icon style "Painted": sprites replace emblems for all 30 families; NO natural family (spring, orchard, fire, sacred, field, hive, cycle, stage, waterfall, pool) may show a roof, wall, or railing (blueprints stay emblematic); families toggled off in curation fall back to SVG emblems seamlessly.
    - Curation grid (✦ Sprites in build footer): 30 cells (waterfall + pool joined), every one with a sprite image; approve toggles live-swap that family map-wide; ↻ re-roll marks a family and toasts the accumulating gen_sprites.py command; approvals/re-rolls appear in the export's art_manifest.
    - Eyeball pass at wide/close/night in Painted+Painted: sprites sit on the plate convincingly, labels always on top, night tint reads well. Screenshot each.
24. **Quest address resolver** (⌖ Address a quest): typing re-resolves live with ALL reasoning steps visible (miss rows gray, hit row green). Verify each chain rung: free text "fix the drip lines" → Greenhouse via lexicon (labeled "lexicon guess", overridable); pledged role Water Steward → Water Tank in 2 steps; circle Gathering → Kitchen; gibberish → 5 steps → Quest Board pool. "Create it there" adds the quest (board creates unaddressed); "Show me" travels. Created lexicon quests carry their label into the export.
25. **Data layers**: Overview tab of ≥4 structures shows: role-in-the-organism line, district → phase → masterplan chain, vitals strip labeled "sample data" (or the honest empty line), metabolism strip with loop-closure % + imported ⚠ chips ("quests waiting to be written") or the honest no-flows line. Flows lens: animated particles (blue water / gold matter / rose care) along real edges, dashed fall-ins on imports, blueprints' edges hidden in Now mode.
26. **Export** (⤓ Export scene): valid JSON with ALL of: map_scene (georef: pin, affine, meters_per_unit, terrain/art_manifest with sprite approvals), map_zones, map_structures (thin: anchor/footprint/rot/phase/circle_id/blurb/origin_story/state_inputs/bindings/icon/sort), map_flows (imported flag), map_structure_facts (12 sample readings), map_edits (every action from §§17,21,22,23 present, seq ascending), boundary (scene_units + masterplan_px + CLOSED GeoJSON ring with lon ≈ −83.83…, lat ≈ 9.23…), circles (11 with home_structure_key), org_roles, quests (address labels: explicit / lexicon guess / board). Counts must NOT be embedded per-structure anywhere (compute-on-read contract).

27. **The geometry layer** (✎ Draw in the build footer — newest, test hardest):
    - Boot migration: 25 features (10 roads incl. 2 locked public, 3 creeks, 5 water areas, 7 zones) with REAL phases; vector `Now` bakes phase-2/3 roads/clearings as dashed ghosts over unbroken forest (never solid tan/meadow), phase-1 as built; `zonesExport` emits ids, phases, subtypes, length_m/area_m2.
    - Draw: kind → subtype → phase; click vertices (snap within ~10px to vertices/anchors/boundary, Shift suppresses, Alt = 15°); live m / ha readout while drawing; finish via double-click, Enter, or clicking the first vertex; Esc cancels. Icons inert (`body.drawing`).
    - Edit: select → gold handles + mid-segment ghosts; drag commits on pointerup only (re-bake never per-move); right-click deletes a vertex (refuses below 2/3); retype + rephase from the panel without redrawing; ✕ deletes; public roads refuse selection.
    - Undo: whole-set snapshots; a deleted feature returns with the SAME id (references must never dangle).
    - Footprints (`structure-area`): attach to a structure; clicking anywhere inside opens that structure (polygon beats anchor radius); dragging the structure translates the footprint; remove/undo carries it; export `footprint` = feature id.
    - Flows `via`: a flow routed via a drawn line runs its particles along that polyline (seed: ponds → food forest via the center quebrada); via select lives in the inspect card's flow rows.
    - Audit: `feature-draw/edit/type/phase/delete` all in `map_edits`.
28. **Persistence**: any audited edit arms a `beforeunload` guard and a debounced (~2.5s) autosave to this browser profile; ONE non-repeating nudge toast after ~5 edits; reload → "Saved work found" bar after Enter → Restore rebuilds structures, seats, quests, flows, features (same ids), boundary, edit log, curation state — byte-shaped like ⤓ Export scene. Run `qa/check-schema.js` on a fresh export: must be ALL GREEN.

### Part III — final

27. **Full-session error tally**: total pageerror + console-error count across the ENTIRE session. The bar is zero. Also assert per-frame (not on settle) that no viewport corner ever leaves `0..W / 0..H` during any travel.

## Report format (this exact structure)

```
## BUGS (most severe first)
B1 [blocker|major|minor|cosmetic] [area] —
   Steps: …
   Expected: …
   Actual: … (+ verbatim console/pageerror if any, + screenshot filename)
…
## PASSED
(one line per numbered section that fully passed)
## NOT TESTABLE
(anything you couldn't exercise, and why)
```

Be precise about coordinates, zoom levels, and which icon/structure you used. A wrong-but-pretty screenshot beats a vague sentence. Do not fix anything — report.
