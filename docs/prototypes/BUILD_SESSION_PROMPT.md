# Build session — Amora Living Map, next wave

**Paste this file. Everything it references sits beside it in `game-amora/docs/prototypes/`.**

```
FIXES_TO_MAKE_2026-08-08.md     the 16 fixes, each with root cause + line numbers
FEATURE_GEOMETRY_LAYER.md       the geometry layer spec (Stages A–D)
QA_REPORT_2026-08-08.md         the full QA pass
qa/                             runnable Playwright harness + stylize.py reference impl
qa-evidence/                    screenshots that carry the arguments
```

`grounds-v0.html` went through the full 27-section v0.9 QA matrix — one continuous session at 1600×1000, 84 screenshots. **Result: 1 pageerror, 0 console errors.** Nearly everything passes, including the whole Part II surface. Old B1–B4 are fixed and did not regress. What follows is the next wave.

**Work it in three waves, in order. Do not interleave them.**

---

## Wave 1 — the defects (Fixes 1–11)

Independent crash, focus, clamp and layout bugs. Ship and verify these **alone**, against a clean baseline, before touching anything structural. Full detail with line numbers in `FIXES_TO_MAKE_2026-08-08.md`.

| # | Sev | What |
|---|---|---|
| 1 | **blocker** | Attention cycle throws on a Quest-Board-addressed timed quest — `attnItems()` yields `at:null`, `travelTo(s.x…)` dereferences `undefined` |
| 2 | high | Panning during a tour leg kills the tour permanently — `pointerdown` nulls `travel`, discarding the `done` callback that narrates and re-arms |
| 3 | high | Closing the inspect card traps focus on `#inspClose`; its blanket `stopPropagation` kills Ctrl+Z, W, H, V, T, Space and arrows |
| 4 | high | Camera renders past the map edge during travel — `clampCam()` only runs at `travel.t >= 1`; worst frame fills ~47 % of the viewport with void |
| 5 | high | Build palette footer covers 87 px of the minimap; its two top corners fire build buttons instead of travelling |
| 6 | med | Icon hover not suppressed in build mode — `updateHover` has no `buildMode` guard |
| 7 | med | Maia dock fully occluded by the portal panel / inspect card, which is where `openPanel` writes its narration |
| 8–11 | cosmetic | Icon-style chips never mark the active one · hover card doesn't pluralise · two residual crown overlaps · a crown slides under the vitals bar |

**Also sweep the class, not just the instance.** Fix 1 is one case of *a structure key held across a mutation*. At least one more is live: the resolver bakes `onclick="travelTo(BY['<key>'].x, …)"` into the DOM (line 1765) — resolve a quest, remove that structure in build mode, click **Show me**, same crash. Add safe `nameOf(key)` / `anchorOf(key)` accessors and invalidate rendered panels when a structure is removed.

---

## Wave 2 — truth and art (Fixes 14, 15, 16)

### Fix 16 — the terrain pipeline *(decided; do this one first in the wave)*

The painted plate is **a different place from the satellite**. Measured: ocean coverage 7.1 % → 19.6 %, shoreline displaced a mean of 252 world units (max 992) on a 2400-wide map, strong-edge agreement **0.069**, and the best rigid alignment is (0, −1) px — so it is not a correctable offset. Root cause: `gen_plate.py` was never given the satellite; `SRC` defaults to `masterplan-1.png`. Two unrelated source images. The same prompt also asks the model to *paint buildings*, so the plate shows villages that exist nowhere in `SCENE`, sitting beside the icons that do.

**Decision: the painterly pass becomes a deterministic filter over the satellite. The generated plate is retired as terrain.**

Reference implementation in `qa/stylize.py`, proven output in `qa-evidence/painterly-options.png`:

1. Anisotropic **Kuwahara** via summed-area tables — O(1) per pixel
2. **Posterise** ~22 levels
3. **Edge ink** along the luminance gradient (this is what reads as painted, not blurred)
4. **Canvas tooth** — seeded deterministic noise, idempotent like `paintTerrain()`
5. Optional **Reinhard palette transfer** in Ruderman lαβ

0.96 s filter-only / 1.25 s with palette at 1200×800 in numpy; in-browser it's a one-time bake into an offscreen canvas at load, same pattern as `paintTerrain()`.

**The palette donor collapses to six floats** — Reinhard consumes only the donor's per-channel mean and standard deviation. So the embedded painted plate and its **0.83 MB of base64 go away** (4.65 MB → ~3.8 MB) and the hand-painted warmth survives as six constants.

**UI:** keep three terrain chips (Satellite · Painted · Vector), add two sliders under Painted — **brush** (filter strength; 0 = raw satellite) and **palette** (donor blend; **0 removes the generated graphic entirely**). Default palette **0.25–0.35**: the prototype shows 0.85 launders a different landscape's colour onto Amora, because the donor is ~20 % beach and savanna-yellow. Take the donor statistics from a *forest crop*, not the whole image.

Two riders: grade with `THEME` as an input (today `THEME.wash` applies only in `sat` mode, so Painted ignores the theme entirely), and **re-fetch the satellite tile with the data gap** — a pale untextured rectangle in the lower-left, currently hidden by the generated plate and about to become visible.

### Fix 14 — natural features are rendering as architecture

Not a spring problem — a systemic one. Three natural-subject families were extracted and inspected: `spring` (prompt says "a WATER FEATURE with **no building**") is a glazed bathhouse; `orchard` ("seven graceful fruit trees") is a three-storey building; `fire` ("carved stone seats around a flame") is a glazed pavilion. Three for three.

Cause: the shared `STYLE` preamble is architecture-first — *"A single isolated **building** sprite … SOLARPUNK-ELVEN **architecture** … flowing **rooflines** …"* — roughly a hundred words of building language that no six-word per-family override can beat.

Add a second preamble **`STYLE_NATURAL`** sharing camera, lighting, magenta-key and margin rules but with no architectural nouns — explicitly *"a natural landscape feature, no building, no roof, no walls, no windows, no railings; nothing man-made beyond at most one small worn marker."* Route `spring`, `orchard`, `fire`, `sacred`, `field`, `hive`, `cycle`, `stage` through it and re-roll those eight.

**`orchard` gets a rewritten subject** (founder's direction): *"a dense patch of old-growth forest that is bearing fruit — tall mature broadleaf canopy in layers, heavy with ripe fruit, deep green shade beneath, no clearing, no path, no structure of any kind."* A forest that happens to feed you, not an orderly grove.

**Split the overloaded `spring` family** — it currently serves `spring`, `well`, `pond` and `aquaponics` plus the seeded *The Ponds* structure. One sprite being asked to be both a natural source and built water infrastructure is part of why it compromised into a bathhouse.

### Fix 15 — two missing water archetypes

`waterfall` already exists as a palette archetype (line 1505) but borrows the spring icon — give it a family. **River pool / swimming hole is absent**; add `['swimhole','River Pool','Wild & sacred','pool']`.

Each needs an `ICONS` emblem, an `isoSVG` case, a `FAMILIES` prompt under `STYLE_NATURAL`, and REG wiring. `renderCuration()` iterates `Object.keys(ICONS)`, so they appear in the grid automatically. **Ship the SVG emblems first** — no API key needed and Painted falls back to them gracefully; sprites follow on the next `gen_sprites.py` run.

Don't over-invest: a waterfall is a point, but a river pool and a pond are **areas**. The right shape is icon-as-marker with a drawn water area as its footprint — Wave 3, Stage B.

---

## Wave 3 — the geometry layer (`FEATURE_GEOMETRY_LAYER.md`)

**This absorbs Fix 12 and supersedes Feature 13.** Do not implement either separately — you would migrate `SCENE.roads` twice.

Seven hardcoded geometry arrays live in `SCENE` and exactly one is editable. The founder can move a building and redraw the property line but cannot fix the creek running through their own land, or say where the food forest ends. One primitive replaces all of it:

```js
{ id, kind:'road'|'water'|'zone'|'structure-area'|'boundary',
  geom:'line'|'area', points:[[x,y]…], subtype, phase, owner, name, sort }
```

- **Stage A** — model + `migrateFeatures()` (bring the seed geography *in*; do not run two systems) + one `drawFeatures()` renderer feeding both the vector bake and the live overlay + generic editor for lines. **Delivers roads in three surfaces and retires Fix 12**, whose root cause is precisely that roads are rendered twice by unrelated code paths.
- **Stage B** — areas: zones, water areas, and `structure-area` with its knock-ons (point-in-polygon beats anchor-radius in `hitStruct`; footprints translate with a drag; remove/undo carries them like it already carries seats and quests; `footprint` stops being `null` in the export).
- **Stage C** — water lines first-class, flows gain `via:<featureId>` so particles run along the canal you actually drew, plus live length-in-metres and enclosed-area readouts.
- **Stage D** — optional: computed vitals from geometry.

Reuse rather than reinvent: generalise `boundHit()` to take a point list and it serves every editor; `body.bounding`'s inert-icons rule is QA-confirmed; whole-snapshot undo is proven. **Re-bake on commit only, never per pointermove.**

**Feature ids must be monotonic, never reused, and preserved by undo** — flows and footprints reference them, and a reissued id dangles silently.

---

## Cross-cutting decisions (all confirmed by Rye, 2026-08-08)

1. **Sweep the held-key crash class** — see Wave 1.
2. **Persistence.** Save to the **user's own profile**, not just localStorage. Scenes must be **downloadable**. Prompt to save when they move away from the screen, plus **one** non-repeating in-session nudge. Do not nag. Shape: `EDITS.length > 0` arms a `beforeunload` guard; a debounced autosave writes under a profile key; one toast at the first meaningful milestone and never again that session; ⤓ Export scene stays the explicit download. **Autosave must store the same JSON the export produces**, so restore and import are one code path. This matters more after Wave 3 — the geometry layer turns an hour of surveying into losable work.
3. **Structure keys.** `new1`, `new2`… currently export as `map_structures[].key`, which is the production primary key. Slugify from the name with collision suffixes.
4. **Feature id stability** — see Wave 3.
5. **QA harness** — committed to `qa/`. Run `node qa/run.js` (or `ONLY=A node qa/run.js` for one block).
6. **Export schema check** — add a JSON-schema assertion to the harness. It will catch contract drift the moment Stage A rewrites `zonesExport()`, which is exactly when it will drift.

---

## Acceptance criteria

1. **Zero pageerrors and zero console errors** across the whole matrix — including the Fix 1 repro (board-address a timed quest, then cycle the pill twice through every item) and the resolver variant.
2. Tour survives a pan during any camera leg and still narrates all 8 stops.
3. Ctrl+Z undoes an add immediately after closing the inspect card with ✕, no intervening click.
4. No rendered frame places a viewport corner outside `0..W / 0..H` — assert **per frame**, not on settle.
5. All four minimap corners travel with build mode on, Wall open, and curation open.
6. Hover card stays hidden in build mode.
7. Maia's dock is readable and usable with a portal panel and an inspect card open.
8. Painted terrain is **pixel-aligned with satellite** — shoreline offset 0, strong-edge IoU > 0.95 — and the palette slider at 0 yields pure filtered satellite.
9. Curation grid shows one cell per `ICONS` family (30 after Fix 15), every one with art, 0 broken.
10. No natural-subject family renders with a roof, walls or railings.
11. Vector `Now` shows phase-2/3 land as planned, not built; still-forested zones read as forest; `zonesExport()` emits real phases.
12. Draw / edit / retype / rephase / delete a feature with icons inert, snapping honoured, Esc cancelling, re-bake on commit only, undo restoring the full set, `feature-*` actions in `map_edits`.
13. Unsaved work survives a reload, and a `beforeunload` guard fires with pending edits.

---

## Do not regress

Full list in `FIXES_TO_MAKE_2026-08-08.md`. The ones most at risk from Waves 2–3:

- Drag inertia, wheel-toward-cursor, dblclick, arrows, +/−, H home — no off-map corners from any of them.
- Panels: 4 tabs, claim/raise toasts, every Enter-door opening the stub with **"Back to the land" topmost**, ✕ and Esc closing, and the close-race resolving cleanly.
- Icon style: Isometric 19/19 non-blueprint at every zoom with blueprints staying emblematic; Auto crossfading exactly at z 1.05.
- Build: 10 categories / 83 items, pass-through placement, boundary rejection, drag snap-back, ✕ remove clean across map + minimap + Wall + badge with undo restoring seats and quests.
- Derived state: pool 0/30/49 → funding, 50/80 → building, 100 → alive, phase 3 → blueprint; state never directly editable.
- Boundary editor: icons inert, mid-segment insert-and-drag in one gesture, right-click delete refusing at 3, stranding flagging red **without ever removing the structure**, whole-polygon undo, deterministic repaint.
- Keyboard-in-fields guard across all four field types, Escape closing only the owning panel.
- Export: all ten blocks, ascending `seq`, closed GeoJSON ring, 11 circles with home keys, zero per-structure counts, no `undefined`.

---

## Open — needs Rye, not the build session

1. Confirm the road/clearing **phase mapping** in Fix 12 step 2 — I derived it from district and structure phases; it is inference, not ground truth.
2. **Public roads** (`pozaAzul`, `pacificEdge`) — founder-editable, or locked as off-property context? Spec assumes locked.
3. **Zone vocabulary** — meadow / forest / orchard / paddock / garden / protection is a guess at your language.
4. **Partially-stranded footprints** — flag "anchor inside, area crossing the line", or is anchor-based enough for now?
