# Fixes to Make — 2026-08-08 (grounds-v0.html QA return)

**Paste this whole file to the build session.** Companion doc: `FEATURE_GEOMETRY_LAYER.md`.

**Order of work — do not interleave these:**

1. **Fixes 1–11 first, on their own.** Independent crash, focus, clamp and layout bugs. Ship and verify them against a clean baseline.
2. **Then the geometry layer** (`FEATURE_GEOMETRY_LAYER.md`, Stage A → B). It rewrites `paintTerrain()`, the frame-loop road drawing and `zonesExport()` — the same code Fix 12 and Feature 13 touch, which is why both are folded into it.

Refactoring the geometry layer while an attention-cycle crash is still live makes both harder to verify.

---

You built `game-amora/docs/prototypes/grounds-v0.html` (4,653,984 bytes, mtime 2026-08-08 14:28 UTC). It went through the full v0.9 QA matrix — all 27 sections, one continuous Playwright session at 1600×1000, 84 screenshots, plus four isolated repro sessions.

**Result: 1 pageerror, 0 console errors across the whole session.** Sections 1–12, 14–26 pass in substance, including every Part II surface — inspect card (23 edit types, all audited), boundary editor with stranding + polygon undo, terrain switch, 28-sprite curation with live swap, the resolver's four chain rungs, and an export whose 94-entry `map_edits`, closed GeoJSON ring and compute-on-read contract all check out. Old B1 (icons intercepting "Back to the land"), B2 (Wall over the Build button), B3 (panel close-race) and B4 (remove leaving stale Wall/badge rows) are all confirmed fixed and did not regress.

Eleven defects below, priority order. Line numbers are from the build as tested. Fix them without redesigning anything else — every passing behaviour listed at the bottom must survive.

---

## Fix 1 — Attention cycle crashes on board-bound timed quests (CRITICAL)

**Status:** HUMAN STEP REQUIRED → hand to build session

**Symptom:** Build mode → open the Greenhouse inspect card → set "Plant the dry-season beds" address to **Quest Board — unaddressed** → leave build mode → click **⚑ What needs hands** repeatedly. On click #9 (the cycle walks the 8 seats first) it throws and the attention card never renders again — every further click re-throws.

```
Uncaught TypeError: Cannot read properties of undefined (reading 'x')
    at $.onclick (grounds-v0.html:1376:14)
```

**Root cause:** `attnItems()` (line 1368) maps `SCENE.quests` straight through, so a quest with `at === null` (or `at` pointing at a removed structure) enters the cycle. `$('attnBtn').onclick` (line 1375) then does `const s = BY[it.at]` → `undefined`, and line 1376 `travelTo(s.x, s.y, 1.3)` throws. The badge counts the item too, so the count promises something the UI cannot open.

**Fix:** filter `attnItems()` to entries with a live address — `q.at && BY[q.at]` for quests, `x.at && BY[x.at]` for seats — so the badge and the cycle agree. Add `if (!s) return;` in the onclick as a belt-and-braces guard. If board work should still be surfaced, give it its own card variant that opens the Wall instead of travelling.

**Files:** `grounds-v0.html` lines 1368–1380.

---

## Fix 2 — Panning during a tour leg kills the tour permanently (HIGH)

**Status:** HUMAN STEP REQUIRED → hand to build session

**Symptom:** Click **Take the tour**, wait ~420 ms (stop 0's flight is still running, `travel === true`), then drag on bare land. The tour dies silently. `tourI` stays at 0 for 25 s+, stop 0's narration never fires, no stop ever advances. Reproduced 3×.

**Root cause:** `cv`'s `pointerdown` handler (line 916) sets `travel = null` to cancel camera flight. That discards `travelTo`'s `done` callback, which is the *only* thing that narrates the stop and schedules `nextTour` (line 1434: `travelTo(s.x,s.y,st.z,()=>{maiaSay(st.txt);tourTimer=setTimeout(nextTour,5600)})`). Nothing re-arms the chain.

**Fix:** decouple the tour chain from arrival. Either (a) run the pending `done` immediately when a travel is cancelled, or (b) have `nextTour` schedule the narration + next-stop timer itself rather than hanging them off arrival. The spec is explicit — "You can wander off any time; the land doesn't mind" — so wandering must not end the walk.

**Files:** `grounds-v0.html` lines 915–917, 1434.

---

## Fix 3 — Closing the inspect card traps focus and kills every hotkey, including Ctrl+Z (HIGH)

**Status:** HUMAN STEP REQUIRED → hand to build session

**Symptom:** Build mode → place anything from the palette (the inspect card auto-opens) → click the card's **✕** → press **Ctrl+Z**. Nothing. `W`, `H`, `V`, `T`, `Space` and the arrows are dead too. Clicking bare land fixes it. The ↩ Undo button always works.

**Root cause:** line 1919 — `$('inspect').addEventListener('keydown', e => { if (e.key === 'Escape') closeInspect(); e.stopPropagation() })` stops propagation for **every** key, and after closing the card `document.activeElement` is still `#inspClose`, which lives inside `#inspect`. So the window-level keydown handler never fires. The global handler at line ~1444 already early-returns on `INPUT|TEXTAREA|SELECT`, so the blanket `stopPropagation` isn't needed for field-guarding.

**Fix:** only `stopPropagation()` when `e.target` is a form field, and blur focus out of the card in `closeInspect()` (blur the active element, or focus `#scene`). Check `#resolver`'s identical handler (line ~1780) for the same pattern — it closes correctly today, but the focus-trap risk is the same.

This lands on the single most common build path — place → card opens itself → close → undo — so Ctrl+Z is unreachable exactly when you'd reach for it.

**Files:** `grounds-v0.html` lines 1794 (`closeInspect`), 1919, ~1780.

---

## Fix 4 — Camera renders past the map edge during travel (HIGH)

**Status:** HUMAN STEP REQUIRED → hand to build session

**Symptom:** camera at (1900,1250) z=1.6 → click the minimap's top-left corner. The worst rendered frame sits at **cam (30,30) — 470 world units past the clamp limit of (500,312.5)** — filling roughly **47 % of the viewport with the void colour `#101d13`** before snapping back. In the main run, 5 of 8 sampled screen corners were off-map for ~300 ms. Screenshot: `B-blackedge-midtravel-frame.png`.

**Root cause:** `travelTo` (line 915) stores the raw target, and `frame()` (line 946) interpolates `cam.x/y/z` toward it but calls `clampCam()` **only** at `travel.t >= 1`. Any target outside the legal camera box gets flown to literally. The minimap click handler (line 1310) hands over unclamped world coordinates by design (`(e.clientX-r.left)/240*W`), so edge clicks are the easy repro — but the same hazard applies to any `travelTo` near a boundary.

**Fix:** clamp inside the travel loop (call `clampCam()` every frame while travelling), and/or clamp the target once in `travelTo` against the legal box for the target zoom. Note settled positions are always correct; drag, wheel, arrows and H never produced an off-map corner.

**Files:** `grounds-v0.html` lines 912–915, 946–948, 1310–1311.

---

## Fix 5 — Build palette footer covers half the minimap; two corners unclickable (HIGH)

**Status:** HUMAN STEP REQUIRED → hand to build session

**Symptom:** in build mode the ✦ Sprites / ◇ Boundary / ⌖ Address a quest / ↩ Undo / ⤓ Export scene row sits on top of the minimap. Minimap top-left hit-tests to `#spriteBtn`, top-right to `#boundBtn` — clicking those corners fires the build buttons and **the camera does not move** (TL/TR `cam moved = false`, BL/BR `true`).

**Root cause:** `#buildBar` (line 75) is `top:96px; bottom:120px` at `z-index:32` → occupies y 96–880 at a 1000 px viewport. `#minimapWrap` (line 141) is `bottom:14px`, ~193 px tall → y 793–986. **87 px overlap, i.e. 79 px of the 162 px minimap canvas (≈49 %)** hidden and inert. `#wall` (line 248, `bottom:120px`, z32) and `#curation` (line 332, `bottom:120px`, z48) overlap identically. Reproduces at 1100×700 too.

**Fix:** raise the bottom clearance on all three panels so they stop above the minimap (roughly `bottom:220px` at current minimap height), or relocate/collapse the minimap in build mode. Whatever you pick, all four minimap corners must travel with build mode on.

**Files:** `grounds-v0.html` lines 75, 248, 332 (CSS).

---

## Fix 6 — Icon hover is not suppressed in build mode (MEDIUM)

**Status:** HUMAN STEP REQUIRED → hand to build session

**Symptom:** build mode → hover any icon → the hover card still appears (`#hovercard` computed `display: block`), floating over the thing you're trying to drag or place.

**Root cause:** the DOM path is guarded (`el.onmouseenter = () => { if (!buildMode) showHover(s, el) }`), but the window-level `pointermove` → `updateHover(px, py)` path (line 1234) has no `buildMode` check and re-opens the card via `hitStruct`.

**Fix:** early-return from `updateHover` when `buildMode` (and while `placing` / `boundaryMode`).

**Files:** `grounds-v0.html` line 1234.

---

## Fix 7 — Maia dock is fully hidden whenever a right-hand panel is open (MEDIUM)

**Status:** HUMAN STEP REQUIRED → hand to build session

**Symptom:** open any structure. `#maia` occupies 1256–1586 × 682–986 at `z-index:35`; `#panel` occupies 1200–1600 × 0–1000 at `z-index:45`. Total occlusion — `elementFromPoint` at the dock's centre returns `#panelBody`. The context line `openPanel()` just wrote ("The Greenhouse & Gardens — seed to seedling to supper. Right now: 3 quests · 2 open seats.") is invisible, and the input is unreachable. `#inspect` (384 px, z47) does the same. Screenshot: `13e-maia-covered-by-panel.png`.

The app narrates *into a dock the user cannot see*, triggered by the very panel that covers it.

**Fix:** shift the dock clear when a right panel opens — e.g. a `body` class that sets `#maia { right: 414px }` while `#panel.open` / `#inspect.open` — or move the dock left, or raise it above the panel.

**Related nit:** with focus in `#maiaText`, Escape is swallowed by the Maia keydown handler (line 1417), so Escape can't close the panel that's covering the dock. Let Escape through, or blur on Escape.

**Files:** `grounds-v0.html` lines 215 (`#maia` CSS), 180 (`#panel` CSS), 281 (`#inspect` CSS), 1417.

---

## Fix 8 — Icon-style chips never show which one is active (LOW / cosmetic)

**Status:** HUMAN STEP REQUIRED → hand to build session

**Symptom:** ✦ Theme → click Isometric / Emblems / Painted / ✦ Auto. `[...document.querySelectorAll('[data-im]')].map(b => b.classList.contains('on'))` is `[false,false,false,false]` in every state. Only Maia's line tells you what mode you're in — and the terrain chips and theme swatches both mark themselves, so it reads as broken.

**Root cause:** line 1357's handler sets `iconMode` and narrates but never toggles `on`. The `[data-tm]` handler (line 1352) does `x.classList.toggle('on', x === b)`.

**Fix:** mirror the `[data-tm]` pattern. Set the initial `on` for Auto at boot.

**Files:** `grounds-v0.html` lines 370 (markup), 1357.

---

## Fix 9 — Hover card doesn't pluralise (LOW / cosmetic)

**Status:** HUMAN STEP REQUIRED → hand to build session

**Symptom:** "⚑ **1** quests ⛨ **0** seats open", "⛨ **1** seats open". Maia's context line pluralises correctly in the same situation ("1 quest · 1 open seat"), so the two copy paths disagree.

**Fix:** pluralise in `showHover` (line 1228), matching `maiaContext`'s wording.

**Files:** `grounds-v0.html` line 1228.

---

## Fix 10 — Crown collision resolver leaves residual overlaps (LOW / cosmetic)

**Status:** HUMAN STEP REQUIRED → hand to build session

**Symptom:** camera (1350,640) z=1.25 — 2 overlapping pairs out of 20 visible crowns, identical in flat/iso/painted: **Community Center × Library & Workshop, 145 × 3 px** and **Community Center × Food Forest, 1 × 21 px**. Screenshot: `23h-painted-close-day.png`.

**Root cause:** the resolver (line ~1220) nudges each crown up once against already-placed crowns and never re-tests after moving; its thresholds (`h+4`, `(w+o.w)+8`) let sub-4 px slivers through.

**Fix:** iterate until clear (cap at ~4 passes), and tighten the thresholds.

**Files:** `grounds-v0.html` lines 1218–1222.

---

## Fix 11 — A crown can slide under the vitals bar (LOW / cosmetic)

**Status:** HUMAN STEP REQUIRED → hand to build session

**Symptom:** camera (1350,640) z=1.25 — Market Pavilion's crown sits behind the top-centre vitals HUD (`elementFromPoint` returns `.vital`). 19 of 20 crowns pass the on-top test in every icon style; this one loses to HUD chrome. Strictly the "labels always win" rule is about icons/sprites, so this is a judgment call.

**Fix:** clamp crown `py` to a floor below the vitals bar, or hide a crown that would render beneath it.

**Files:** `grounds-v0.html` lines 1218–1222.

---

## Fix 12 — The vector floor draws unbuilt land as built ground (MEDIUM — doctrine)

> **ABSORBED into `FEATURE_GEOMETRY_LAYER.md` (Stage A).** Keep reading for the root cause and the phase mapping — both are still needed — but **do not implement this as a standalone patch**. Phase-tagging is step one of the feature migration, and the unified renderer is what actually removes the over-claim. Patching it here and refactoring later means migrating `SCENE.roads` twice.

**Status:** HUMAN STEP REQUIRED → hand to build session (as part of Stage A)
**Decision made 2026-08-08:** phase-tag the land layer and ghost the unbuilt in the bake. Promoted from "optional" after review — do this one.

**Symptom:** in Vector terrain, `Now` renders the entire masterplan as existing ground — phase-2 and phase-3 roads, clearings and pools are painted at full strength alongside phase-1 ones, with nothing distinguishing them. Screenshot: `25f-vector-vision.png`.

**Do not "fix" this by un-gating the Vision overlay.** That was the first read and it's wrong. `paintTerrain()` already bakes, opaquely, everything the Vision overlay exists to reveal: the same clearing ellipses (lines 744–748), the same creeks (776–779), the same village roads (773–775), the same dashed property line (795–797). Un-gating would draw a yellow film over solid shapes and make Vision read as Now-with-a-tint. The overlay stays gated on `if (_pl)`.

**Root cause:** the real asymmetry is in `Now`, not Vision. Satellite/painted mode deliberately under-draws the plan — masterplan roads at `pa = 0.16` — so Now stays honest and Vision does the revealing. The vector floor has no equivalent restraint, because **`SCENE.roads` and `SCENE.clearings` carry no phase field** while structures do. Vector is the day-one floor for a village with nothing built yet, so this is exactly the village whose map over-claims. It reads against "everything you see traces to something true."

Same root cause leaks into the seed: `zonesExport()` (lines 1567–1570) stamps `phase:1` on every meadow, water body, road and the forest, unconditionally.

**Fix:**

1. **Attach phase without changing shape.** JS arrays are objects, so `SCENE.roads[3].phase = 2` works and leaves `migrate()`'s in-place mutation, `P(SCENE.roads.flat())`, `smooth(r)`, `nearPath()` and every iteration untouched. Same trick for each `SCENE.clearings` entry. Minimal diff, no call-site churn.

2. **Proposed mapping** — derived from the district and structure phases already in the file; confirm before coding:

   | Roads (index, comment in source) | Phase |
   |---|---|
   | 0 gate → ponds · 1 arrival spur · 2 ponds → heart · 7 heart → water tank | 1 |
   | 3 heart → the ridge road · 4 ridge → sanctuary | 2 |
   | 5 sanctuary → grove · 6 grove → trailhead | 3 |

   | Clearings (centre, pre-migrate) | Phase |
   |---|---|
   | [680,300] arrival · [1140,450] ponds · [820,660] heart · [430,570] tank | 1 |
   | [1140,930] ridge · [1270,1120] sanctuary | 2 |
   | [1610,1140] grove | 3 |

   Water: `SCENE.water.ponds` phase 1; `SCENE.water.sanctPools` phase 2 (they're the Sanctuary's hot pools, and the Sanctuary is phase 2).

3. **Bake the unbuilt as unbuilt.** For phase ≥ 2, use the blueprint language already in the file (`--ghost:#9fd4ff`, dashed) rather than solid tan/blue — a dashed ghost line for planned roads, a faint outlined ellipse for planned clearings.

4. **The important half: stop carving the forest for land that isn't cleared yet.** The forest loop skips stamps near roads and inside clearings (`inClearing(x,y,6) || nearPath(x,y,allR,16)`, lines 786–788). Restrict those two guards to phase-1 roads and clearings, so an unbuilt zone still reads as forest with a planned outline over it. This is what makes the floor honest rather than merely annotated.

5. **`zonesExport()`** emits the real phase per zone instead of the hardcoded `1`, so the production seed stops over-claiming too.

**Knock-on:** Vision in Vector keeps revealing ghost structures, ghosted funding crowns and the lifting mist — now over a floor that was already telling the truth. If you later want Vision to *solidify* the ghosted plan in the vector bake, that's a second cached floor swapped on toggle; `paintTerrain()` is already proven deterministic, so it's safe whenever you want it.

**Files:** `grounds-v0.html` — `SCENE.roads` / `SCENE.clearings` / `SCENE.water` declarations (~lines 470–490), `paintTerrain()` lines 744–748, 773–779, 786–797, `zonesExport()` lines 1567–1570.

---

## Fix 14 — Natural features are rendering as architecture (MEDIUM — art direction)

**Status:** HUMAN STEP REQUIRED → hand to build session
**Raised 2026-08-08:** "the natural springs icon shouldn't have a human built component to it."

**Symptom, generalised.** It isn't the spring alone. Three natural-subject families were extracted from the build and inspected:

| Family | Prompt in `gen_sprites.py` | What the sprite actually is |
|---|---|---|
| `spring` | "a natural spring pool — a WATER FEATURE with **no building**" | a glazed, timber-framed bathhouse pavilion over a pool |
| `orchard` | "a small grove of **seven graceful fruit trees**… mulched path" | a three-storey curved building |
| `fire` | "a council fire circle of **carved stone seats** around a flame" | a glazed pavilion enclosing a flame |

Three for three. The per-family subject is not the problem — the `spring` prompt already says "no building" in capitals and still produced one.

**Root cause: the shared `STYLE` preamble is architecture-first.** Every family inherits it, and it opens with *"A single isolated **building** sprite … FUTURISTIC SOLARPUNK-ELVEN **architecture** … flowing **rooflines** … sculpted timber and bamboo … woven living-branch lattices … brass-and-gold inlay."* Roughly a hundred words of building language against a six-word "no building" override. The override cannot win, so every open-air or living subject gets a roof put on it.

**Fix:**

1. Add a second preamble, `STYLE_NATURAL`, sharing the camera, lighting, magenta-key and margin rules but with **no architectural nouns** — explicitly "a natural landscape feature, no building, no roof, no walls, no windows, no railings; nothing man-made beyond at most one small worn marker."
2. Route the open-air families through it: `spring`, `orchard`, `fire`, `sacred`, `field`, `hive`, `cycle`, `stage` — then re-roll those eight. **`orchard` gets a rewritten subject** (founder's direction, 2026-08-08): *"a dense patch of old-growth forest that is bearing fruit — tall mature broadleaf canopy in layers, heavy with ripe fruit, deep green shade beneath, no clearing, no path, no structure of any kind."* Not an orderly planted grove — a forest that happens to feed you. The `↻ re-roll` curation flow already accumulates the exact command, and un-approved families fall back to their SVG emblem meanwhile, so the map stays coherent during the regeneration.
3. **Split the overloaded `spring` family.** It currently serves four palette archetypes — `spring`, `well`, `pond`, `aquaponics` — plus the seeded **The Ponds** structure. One sprite is being asked to be both a natural source and built water infrastructure, which is part of why it compromised into a bathhouse. Natural sources keep `spring`; built water gets its own family.

---

## Fix 15 — Two missing water archetypes: waterfall and river pool (LOW — content)

**Status:** HUMAN STEP REQUIRED → hand to build session
**Raised 2026-08-08:** "we need an icon to show waterfalls and river pools (for swimming) to show those vital features."

- **`waterfall` already exists as a palette archetype** — `['waterfall','Waterfall','Wild & sacred','spring']` (line 1505) — but it borrows the spring icon, so it has no art of its own. Give it a family.
- **River pool / swimming hole is absent entirely.** Add it: `['swimhole','River Pool','Wild & sacred','pool']`.

Each needs four things: an `ICONS` emblem, an `isoSVG` case, a `FAMILIES` prompt in `gen_sprites.py` under `STYLE_NATURAL`, and the REG wiring. `renderCuration()` iterates `Object.keys(ICONS)`, so new families appear in the grid automatically.

**Sequence it:** ship the SVG emblems first — they work immediately, need no API key, and the Painted style falls back to them gracefully. Sprites follow on the next `gen_sprites.py` run.

**Talk to the geometry layer before over-investing here.** A waterfall is a point; a river pool and a pond are **areas**. The right long-term shape is icon-as-marker with a `water/area` feature as its footprint (`FEATURE_GEOMETRY_LAYER.md` Stage B) — the icon labels it, the drawn area is its true extent and gives you the swimmable surface in m². Build the emblems now, but don't build a pond sprite that Stage B will make redundant.

---

## Fix 16 — The painted plate is a different place from the satellite (HIGH — truth)

**Status:** HUMAN STEP REQUIRED → hand to build session
**Raised 2026-08-08:** "the painted overlay replacing the Satellite base must completely match the satellite base — just add the painterly overlay, not change features."

**Measured.** Both plates were extracted from the build and compared:

| | satellite | painted |
|---|---|---|
| resolution | 2198 × 1465 | 2400 × 1600 |
| ocean coverage | 7.1 % | **19.6 %** (2.75×) |
| shoreline offset vs satellite | — | mean **+252 world units**, max **+992** (map is 2400 wide) |
| strong-edge IoU between the two | — | **0.069** — 93 % of features are in different places |
| best rigid alignment shift | — | (0, −1) px — so it is **not** a correctable offset |

Evidence: `qa-evidence/plate-drift.png` (satellite · painted · both shorelines overlaid).

**Root cause — the generator never sees the satellite.** `gen_plate.py` defaults `SRC` to `masterplan-1.png`, the masterplan drawing. The satellite comes from a different script, `fetch_sat.py` (Esri World Imagery). Two unrelated source images; nothing ever asked them to agree. The prompt's "Keep the ACTUAL geography faithful" is a text instruction to a generative model with no structural conditioning, so it is advisory at best.

**Second defect in the same prompt.** It asks the model to *render buildings* — "tropical timber-and-thatch structures, tiny homes, community center, greenhouses, gardens, ponds." The plate therefore contains villages, roads and ponds that exist nowhere in `SCENE`. In Painted mode the founder sees buildings on their land that aren't real, can't be clicked, and sit beside the icons that are. Same doctrine failure as Fix 12, one layer down: the picture itself is asserting things that don't trace to anything true.

**Fix — three steps, in order:**

1. **Feed it the satellite.** Point `gen_plate.py` at `fetch_sat.py`'s output, not the masterplan. This alone moves it from "a different coast" to "the right coast, loosely."
2. **Stop asking for buildings.** The structures are DOM icons drawn on top. The plate must contain terrain only — no buildings, no roads that aren't in the source imagery, no invented water. Restyle language only: same coastline, same river courses, same ridge lines, same clearings.
3. **Decide whether "close" is acceptable.** It won't be pixel-exact even done correctly — image-to-image resamples. If the requirement really is *completely match*, the operation has to be a **filter, not a generation** (see below).

**DECIDED 2026-08-08: the filter is the base; the generated plate is retired as terrain.**

Accuracy beats looks this round. Build the painterly pass as a **deterministic filter over the satellite**, and keep the hand-painted warmth as an *optional, tunable* colour layer on top — never as geometry.

**Prototyped and proven** (`qa/stylize.py`, reference implementation; `qa-evidence/painterly-options.png`, four-way comparison):

1. **Anisotropic Kuwahara** via summed-area tables — O(1) per pixel regardless of radius, so cost is linear in pixels. Flattens the image into brush facets.
2. **Posterise** to ~22 levels.
3. **Edge ink** — darken along the luminance gradient; this is what reads as "painted" rather than "blurred".
4. **Canvas tooth** — a seeded, deterministic noise multiply (same seed → same grain, so repaints are idempotent like `paintTerrain()`).
5. **Optional palette donation** — Reinhard transfer in Ruderman lαβ from the generated plate.

Measured at 1200×800 in numpy: **0.96 s filter-only, 1.25 s with palette**. In-browser this is a one-time bake into an offscreen canvas at load — the same pattern `paintTerrain()` already uses — and JS/WebGL will beat numpy comfortably.

**The palette donor collapses to six floats.** Reinhard consumes only the donor's per-channel mean and standard deviation — 3 + 3 numbers. Nothing else from the generated image is used. So `amora-plate-v1.png` and its **0.83 MB of embedded base64 stop existing**; the file drops from 4.65 MB to roughly 3.8 MB, and the "hand-painted feel" survives as six constants.

**Honest finding from the prototype: default the palette blend LOW.** At 0.85 the transfer visibly launders a different landscape's colour onto Amora — the donor plate is ~20 % beach and savanna-yellow, so it drags rainforest toward yellow-green and the ocean toward violet. Recommend **0.25–0.35 default**, and take the donor statistics from a **forest crop** of the generated plate rather than the whole image. This is exactly why it must be a slider, not a baked decision.

**UI — the overlay select Rye asked for.** Keep three terrain chips (Satellite · Painted · Vector) and put two sliders under Painted:

- **brush** — filter strength (0 = raw satellite, so the chips stay honest)
- **palette** — donor blend, **0 removes the generated graphic entirely** and leaves pure deterministic painterly satellite

That single control answers "show me just the satellite with the painterly treatment" without adding a fourth mode.

**Also worth grading with the theme.** `THEME.wash` currently applies only when `terrainMode === 'sat'` (frame, line 955), so Painted ignores Emerald/Terra/Mar entirely. A runtime filter should take the theme as a grading input, which finally lets the ground re-ink with the map.

**Separate small finding:** the satellite plate has a **data gap** — a pale untextured rectangle in the lower-left (visible in all four panels of `painterly-options.png`). It comes from `fetch_sat.py` and it is currently hidden by the generated plate. Once the filter is the base, it will be visible. Re-fetch that tile.

Keep `gen_plate.py` — it is the right tool for concept reference, for the vector floor's art direction, and now for producing the palette donor. It is the wrong tool for the base plate under a georeferenced map.

---

## Feature 13 — Road drawing tool (SUPERSEDED)

> **SUPERSEDED by `FEATURE_GEOMETRY_LAYER.md`.** The request widened on 2026-08-08 to waterways (springs, rivers, creeks, canals) and to per-icon extended boundaries (a food forest's edge, a farm's edge, a building's outline). That's one geometry layer, not three tools — see the companion doc. **Roads become Stage A of it**, with the same three surfaces and the same interaction model below, built on the general primitive instead of a road-only one.
>
> The surface specs, interaction model, precision affordances and performance rule in this section all still stand — read them as the road-specific detail of Stage A.

**Status:** HUMAN STEP REQUIRED → hand to build session (as Stage A)
**Requested 2026-08-08.** "Just as we can redraw the boundary lines we should be able to draw roads — three road types (unimproved, improved, paved), pick the type and the phase, and draw it right on the map with precision."

**Data shape.** Fix 12 alone could get away with attaching `.phase` as a property on the existing point arrays. Once roads are user-drawn and carry a surface type, go to a real object instead:

```
SCENE.roads = [ { path:[[x,y],…], phase:1, type:'improved' }, … ]
```

Five call sites move, all one-liners: `migrate()`'s `P(SCENE.roads.flat())`, `paintTerrain()`'s village-road loop (773–775), `frame()`'s masterplan-roads loop (~968), the `allR` list feeding `nearPath()` (786), and `zonesExport()` (1569). Keep `SCENE.pozaAzul` / `SCENE.pacificEdge` as-is — they're public roads, outside the property, not founder-editable.

**The three surfaces.** The bake already contains the vocabulary; formalise it rather than inventing new looks:

| Type | Reference in the current bake | Suggested spec |
|---|---|---|
| `paved` | public roads, lines 771–772 | casing `rgba(30,24,14,.35)` w13 · fill `#cbb98b` w10 · dashed white centreline w1.4 |
| `improved` | village roads, lines 773–775 | casing `rgba(35,28,16,.4)` w9 · fill `#d9c491` w6 |
| `unimproved` | *(new)* | no casing · `#a08b62` w3.5, dotted — a track, not a road |

Phase ≥ 2 overrides the fill with the ghost language from Fix 12 (dashed, `--ghost:#9fd4ff`) whatever the surface, so "planned paved road" reads as planned first and paved second.

**Interaction — mirror the boundary editor.** That pattern is already built and QA-clean, so reuse rather than reinvent:

- A `⌒ Roads` chip in `#buildFoot` beside `◇ Boundary`, toggling `roadMode` + `document.body.classList.toggle('roading')`. Add `body.roading .poi, body.roading .banner { pointer-events:none }` alongside the existing `body.bounding` rule (line 254) so icons go inert — QA confirmed that rule works.
- A control row while active: three type chips + phase radios 1/2/3 (same control idiom as the inspect card's phase radios).
- **Draw:** click to drop each vertex, live rubber-band segment to the cursor, double-click / Enter / clicking the first vertex to finish, **Esc to cancel the whole in-progress road** — matching the ghost-placement Esc convention users already know.
- **Edit:** existing roads get the same gold vertex handles and faint mid-segment insertion ghosts. Generalise `boundHit(px,py)` (line 1640) to take a point list instead of hardcoding `SCENE.bound`, and it serves both editors unchanged — it already does screen-space 12px/10px hit radii, and `drawBoundaryEditor` already divides handle sizes by `cam.z`, so precision holds at every zoom.
- **Delete:** right-click a vertex removes it (refuse below 2, with a toast, mirroring the boundary's below-3 refusal); a ✕ or right-click on the last remaining segment removes the road.

**Precision affordances** (this is the part the request is really about):

- Snap to existing road endpoints/vertices within ~10 screen px, so a new spur actually joins the network instead of floating 3 px off it. Snap to structure anchors and to the boundary line too.
- Hold **Shift** to suppress snapping; hold **Alt** to constrain to 15° from the previous vertex.
- Live segment length in metres while drawing — `GEOREF.mPerUnit` is already in the file (`2592/2400` ≈ 1.08 m per world unit), so this is a multiply, and it turns the tool from sketching into surveying.
- Reject or warn on vertices outside the property line, reusing `inBound()` — same call the placement flow already uses.

**Performance — one rule.** `paintTerrain()` re-bakes the full 2400×1600 floor. Follow the boundary editor's discipline exactly: draw the in-progress road live on the main canvas (a `drawRoadEditor(t)` sibling to `drawBoundaryEditor`, called from the same unconditional slot at line 1036 so it works in every terrain mode), and only call `paintTerrain()` on **pointerup / commit** — never per pointermove.

**Undo + audit.** Push `{t:'road', prev:<deep copy of SCENE.roads>}` on every commit, exactly like `{t:'bound', prev}` — QA confirmed whole-snapshot undo restores both count and positions correctly. Log `road-draw`, `road-edit`, `road-type`, `road-phase`, `road-delete` via `logEdit()` so they ride into `map_edits`.

**Export.** `zonesExport()` gains `surface` alongside the real `phase` from Fix 12:
`{kind:'road', path:[…], phase:2, surface:'unimproved'}`.

**Knock-on with Fix 12:** the forest-carving guard (`nearPath(x,y,allR,16)`, line 786) should consider both phase and type — only phase-1 roads clear forest at all, and a paved road plausibly clears a wider corridor than a track. That falls out naturally once the type is on the object.

---

## Do not regress — confirmed passing

- Intro dims all ten HUD groups to `opacity:0`; only the AMORA card is hit-testable; Enter flies the camera and fades the HUD up.
- Drag inertia (153 px glide), wheel-toward-cursor (2.7 world-unit drift over 6 steps), dblclick, arrows, +/−, H home. No off-map corners from drag/wheel/keys/H even at min zoom in all four corners.
- Panels: 4 tabs, claim/raise toasts, every Enter-door opens the stub with **"Back to the land" as the topmost element**, ✕ and Esc close, and the close-race (Water Tank → ✕ → immediate click on Council Fire) resolves cleanly with no stale header.
- Layer bar: four buttons at 1321–1588 px, no overlap with ☀ (1259–1298) or ✦ Theme (1163–1244) at 1600 px or at 1100×700 / 900×620 / 1920×1080.
- Icon style: Isometric = 19/19 non-blueprint at z 0.7→2.2 with blueprints staying emblematic; Emblems = 0 iso everywhere; Auto crossfades exactly at z 1.05 (0/22 at 1.04 → 19/22 at 1.05).
- Weave it is deterministic — identical palette from the same words across a theme switch.
- Keyboard-in-fields guard: all four field types (`#maiaText`, `#aiWords`, `#rqText`, `#iName`) swallow letters/space/arrows with zero map reaction and all spaces retained; Escape closes only the owning panel.
- Build: 10 categories / 83 items, pass-through placement (icons inert while placing), boundary rejection toast, Esc cancel, drag snap-back, ✕ remove clean across map + minimap + Wall + badge with undo restoring seats and quests, undo stack bottoming out with "Nothing to undo."
- Derived state: 0/30/49 % → funding, 50/80 % → building, 100 % → alive, phase 3 → blueprint, phase 3 + pool 0 → blueprint, activity high/low → thriving/resting; progress ring tracks; no direct state control anywhere.
- Boundary editor: icons and banners inert, vertex drag, mid-segment insert-and-drag in one gesture, right-click delete refusing at 3, stranding flags red + Wall section + toast **without ever removing the structure**, whole-polygon undo, deterministic `paintTerrain()`.
- Painted: 19/19 sprites with 3/3 blueprints emblematic and 0 fallbacks; curation grid 28/28 images, 0 broken; un-approve live-swaps back to SVG map-wide; re-roll accumulates the `gen_sprites.py` command.
- Resolver: 4-step lexicon guess, 2-step role, 3-step circle, 5-step board, "Create it there" carrying the address label into the export.
- Export: all 10 blocks, 94 audited edits with strictly ascending seq covering every action type, closed 20-point GeoJSON ring at lon −83.8394…−83.8285 / lat 9.2278…9.2379, 11 circles with home keys, 0 per-structure count fields, no "undefined" anywhere.
- Pulse guard holds with a pulse-target structure removed (31 s, two ticks, 0 errors).
- Resize: icon-vs-world offset exactly (0,0) px at every viewport tested.

---

## Acceptance criteria for the next QA pass

1. **Zero pageerrors and zero console errors** for the whole matrix — including the Fix 1 repro (board-address a timed quest, then cycle the pill through every item at least twice).
2. Tour survives a pan during any camera leg and still narrates all 8 stops.
3. Ctrl+Z undoes an add immediately after closing the inspect card with ✕, with no intervening click.
4. No rendered frame anywhere places a viewport corner outside `0..W / 0..H` — assert per-frame, not on settle.
5. All four minimap corners travel with build mode on, Wall open, and curation open.
6. Hover card stays hidden in build mode.
7. Maia's dock is readable and usable with a portal panel and with an inspect card open.
8. Vector `Now` shows phase-2/3 roads and clearings as planned, not as built, and still-forested zones still read as forest; `zonesExport()` emits the real phase per zone (Fix 12).
9. Curation grid shows **one cell per `ICONS` family** (30 after Fix 15, not the 28 this pass asserted), every one with art, 0 broken images.
10. No natural-subject family renders with a roof, walls or railings after the Fix 14 re-roll.
11. Road tool (Feature 13): draw / edit / retype / rephase / delete a road with icons inert, snapping honoured, Esc cancelling cleanly, `paintTerrain()` firing only on commit, undo restoring the full road set, and `road-*` actions present in `map_edits` with `surface` + `phase` in `map_zones`.

---

## Plan review — six things I'd change before this goes out

Asked for, on 2026-08-08: what's weak in this plan?

**1. Fix 1 is one instance of a class, and the class isn't swept.**
There are 13 `BY[…]` dereferences in the file. Most are guarded by a ternary. The dangerous ones are wherever a **structure key is held across a mutation** — which is exactly what Fix 1 is. At least one more latent instance exists: the resolver bakes `onclick="travelTo(BY['<key>'].x, BY['<key>'].y, 1.3)"` into the DOM (line 1765). Resolve a quest, remove that structure in build mode, click **Show me** → the same TypeError. QA didn't reach it because it needs that exact order. Fix the class — a `nameOf(key)` / `anchorOf(key)` helper that returns null safely, plus invalidating rendered panels on structure removal — rather than patching the one call site QA happened to trip.

**2. No persistence — and Stages A–B make that dangerous.**
Everything lives in memory. A refresh loses all of it; the only save is ⤓ Export scene. That's tolerable while the founder nudges a few icons. It stops being tolerable the moment you invite them to survey roads, waterways and footprints for an hour — the geometry layer turns this from a toy into unsaved work. **Minimum:** a `beforeunload` guard whenever `EDITS.length > 0`. **Better:** autosave to `localStorage` keyed by scene, with a "restore your last session?" prompt on load. (Fine here — it's a local file, not a claude.ai artifact, so storage APIs are available.)

**3. `new1`, `new2`… leak into the production seed as primary keys.**
Per the §5.2 contract, `map_structures[].key` is the primary key going into `map_structures`. Every founder-placed structure currently exports as `new7`. Slugify from the name at creation or at export (`new-lookout-tower`), with collision suffixes — and decide it now, because once a seed is imported those keys are load-bearing.

**4. A hole in my own geometry spec: feature id stability.**
I proposed flows referencing routes via `via:'f12'` and structures via `footprint:'f12'`. If ids are reissued on undo/redo, or re-minted when the seed migration re-runs, those references dangle **silently** — no error, the flow just stops following its canal. Ids must be monotonic, never reused within a session, and **undo must restore the same id rather than mint a new one**. Worth writing into Stage A before anything references a feature.

**5. The QA harness dies with my session.**
I built roughly 600 lines of Playwright — a helper lib plus five section modules — that drives all 27 sections, asserts against app internals rather than pixels (camera clamp per frame, class flags per icon, undo depth, export schema), and captures frame-accurate canvas grabs. It currently lives in a sandbox that evaporates. If you want this to be regression testing rather than a one-off report, it should live in the repo next to the prototype. Say the word and I'll hand it over as a runnable `qa/` folder.

**6. Nothing checks the export against its own contract.**
I validated all ten blocks by hand this pass — required keys, ascending `seq`, closed GeoJSON ring, lon/lat range, zero per-structure counts. None of that is repeatable. A small JSON-schema assertion in the harness catches contract drift the moment Stage A starts rewriting `zonesExport()`, which is precisely when it'll drift.

### Decisions taken 2026-08-08 — all six accepted

| # | Decision | Extra direction from Rye |
|---|---|---|
| 1 | Sweep the held-key crash class | — |
| 2 | Persistence | Save to the **user's own profile**, not just localStorage. Scenes must be **downloadable**. Prompt to save when they move away from the screen, **plus one non-repeating in-session nudge** while they're working. Do not nag. |
| 3 | Structure keys | Build a proper key structure — no `new7` in the seed |
| 4 | Feature id stability | Do it |
| 5 | QA harness | Handed over — `qa/` folder beside the prototype |
| 6 | Export schema check | Do it |

On (2), the shape that follows: `EDITS.length > 0` arms a `beforeunload` guard; a debounced autosave writes the scene under a profile key; one toast fires at the first meaningful milestone ("your work is saved — you can download the scene any time") and never fires again that session; ⤓ Export scene stays the explicit download. Autosave must store the same JSON the export produces, so restore and import are one code path.

**Not worth doing yet:** keyboard/screen-reader access for the map surface. It's a real gap, but it's a different project from a founder-facing cartography tool, and half-doing it would be worse than scoping it deliberately later.

---

## Handoff Breakdown — Who Does What

### YOU (Rye) — things only you can do

| # | Task | Why only you | Command / Where |
|---|------|-------------|-----------------|
| 1 | Paste this file into the build session | Session handoff is a human step | Cowork / Claude Code, `game-amora/docs/prototypes/` |
| 2 | Commit + push once the fixes land | Claude Code may hold `index.lock` | `git add -A && git commit -m "grounds-v0: QA fixes B1–B11" && git push` |
| 3 | Eyeball the prototype in a real browser after the fixes | Headless QA can't judge feel | open `grounds-v0.html` |
| 4 | Confirm the Fix 12 road/clearing phase mapping | It's your masterplan — I derived it from district + structure phases, but you know the ground | Fix 12, step 2 tables |
| 4b | Answer the 4 open decisions (public roads editable? partial stranding? zone vocabulary?) | Product calls, not code calls | `FEATURE_GEOMETRY_LAYER.md` §11 |
| 5 | Re-run `gen_plate.py` after the Fix 16 change, or greenlight the filter approach | Needs `GEMINI_API_KEY` / a product call | see Fix 16 |
| 6 | Re-run `gen_sprites.py` after the Fix 14 prompt change | Needs `GEMINI_API_KEY`, which stays off the VM | `GEMINI_API_KEY=… python3 gen_sprites.py spring orchard fire sacred field hive cycle stage waterfall pool --force` |
| 7 | Ask for the re-QA pass when you want it | Kicks off a new session | "run the QA matrix again on grounds-v0.html" |

### CLAUDE CODE — already done or can be done without you

| # | Task | Status |
|---|------|--------|
| 1 | Full 27-section QA matrix, 1600×1000, one continuous session | VERIFIED |
| 2 | 84 screenshots + full instrumented log | DONE |
| 3 | Root-cause diagnosis with exact line numbers for all 11 defects | DONE |
| 4 | Frame-accurate capture proving the off-map camera frame | DONE |
| 5 | Export JSON schema validation against the §5.2 contract | VERIFIED |
| 6 | Fixes 1–11 in `grounds-v0.html` | HUMAN STEP REQUIRED (build session) |
| 7 | Fix 12 root cause + phase mapping derived from district/structure phases | DONE (folded into Stage A) |
| 7b | QA harness packaged and committed to `qa/` beside the prototype | DONE |
| 8 | Geometry-layer spec — model, seed migration, unified renderer, editor, footprint knock-ons, export shape, staging | DONE (`FEATURE_GEOMETRY_LAYER.md`) |
| 9 | Implement fixes 1–11, then 14–15, then Stage A → B | HUMAN STEP REQUIRED (build session) |
| 9b | Sweep the held-key crash class (§Plan review 1), add the unsaved-work guard (2), fix seed keys (3) | HUMAN STEP REQUIRED (build session) |
| 10 | Re-QA after each wave, incl. criteria 8–9 | BLOCKED (waiting on fixes) |

### WAITING ON YOU before Claude Code can proceed

- Fixes 1–11 need the build session to edit `grounds-v0.html`. This QA session deliberately did not touch the file — report only.
- The re-QA pass (acceptance criteria above) is blocked until the fixed build exists on disk.
