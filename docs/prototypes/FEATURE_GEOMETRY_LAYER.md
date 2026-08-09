# Feature spec — the geometry layer (supersedes Feature 13, absorbs Fix 12)

**Companion to `FIXES_TO_MAKE_2026-08-08.md`. Read that first for the crash/layout fixes; this replaces its Feature 13 section.**

---

## The insight

The ask — draw roads, draw waterways, draw a boundary around a food forest or a farm or any building — is not three tools. It's one missing layer.

Right now geometry is scattered across seven hardcoded shapes with no common type:

| Where | Shape | Editable today |
|---|---|---|
| `SCENE.bound` (653) | closed polygon | yes — the boundary editor |
| `SCENE.clearings` (476) | ellipses `[cx,cy,rx,ry,rot]` | no |
| `SCENE.roads` (489) | 8 polylines | no |
| `SCENE.pozaAzul` / `pacificEdge` (499–500) | 2 public polylines | no |
| `SCENE.water.creeks` (481) | 3 polylines | no |
| `SCENE.water.ponds` / `sanctPools` (486–487) | ellipses | no |
| structures | points (`x,y`) | yes — drag |

One of those seven is editable. The founder's hand can move a building and redraw the property line, but cannot fix the creek that runs through their land or say where the food forest actually ends. For a tool whose whole doctrine is *the founder's hand becomes ground truth*, that's the gap.

**Two things already in the file say this layer was always intended.** The export emits `footprint: null` on every structure, and `map_zones` is already a table of `{kind, polygon|path, phase}`. The production contract has the socket; nothing plugs into it.

**And it subsumes Fix 12.** That bug — the vector floor drawing unbuilt roads as built ground — exists *because roads are rendered twice by two unrelated code paths*: baked into the vector floor at full strength (`paintTerrain` 773–775) and drawn live over raster plates at `pa = 0.16/0.75` (`frame` 959). Two paths, two truths. A single feature renderer collapses them to one, and phase-awareness lands once for every kind instead of per-shape.

---

## 1. The model

```js
SCENE.features = [
  {
    id: 'f12',
    kind: 'road' | 'water' | 'zone' | 'structure-area' | 'boundary',
    geom: 'line' | 'area',
    points: [[x, y], …],          // world units, same space as everything else
    subtype: 'paved' | 'creek' | 'orchard' | …,
    phase: 1 | 2 | 3,
    owner: 'greenhouse' | null,   // the structure this belongs to, if any
    name: 'Food forest — east slope',
    note: '',
    sort: 0                        // optional paint-order override
  }, …
]
```

`geom:'area'` is implicitly closed — no `closed` flag, no half-states, and area maths never has to ask.

**Subtypes by kind** (extensible; these are the day-one set):

| kind | geom | subtypes |
|---|---|---|
| `road` | line | `unimproved` · `improved` · `paved` |
| `water` | line | `creek` · `river` · `canal` · `swale` · `pipeline` |
| `water` | area | `pond` · `wetland` · `reservoir` |
| `zone` | area | `meadow` · `forest` · `orchard` · `paddock` · `garden` · `protection` |
| `structure-area` | area | inherits the owner's archetype for styling |
| `boundary` | area | the property ring |

Springs stay **structures**, not features — they're already point archetypes with quests, seats and flows attached, and demoting them to geometry would lose all of that. A spring can *own* the creek it feeds via `owner`.

### Should `SCENE.bound` fold in?

Keep `SCENE.bound` as the canonical property ring and let the generic editor *operate on it* as one of its targets. `inBound()` is load-bearing — placement rejection, stranding, the GeoJSON export — and the boundary editor is currently QA-clean. Generalise the editor, not the data. You get the code reuse without risking a regression in the one geometry path that already works.

---

## 2. Migrate the seed geography in — don't run two systems

The tempting shortcut is to leave the hardcoded arrays alone and let `features` hold only new user-drawn things. **Don't.** That gives you a map where the founder can draw a new creek but can't move the existing one, and where half the geography exports through `map_zones` and half through a parallel table. Two sources of truth is exactly the failure mode this project's contract is written against.

Add a `migrateFeatures()` beside the existing `migrate()` (line 645) that converts, once, at boot:

- 8 `SCENE.roads` → `kind:'road'`, phases per the Fix 12 mapping, `subtype:'improved'`
- `pozaAzul` / `pacificEdge` → `kind:'road', subtype:'paved', phase:1, owner:null`, flagged `public:true` so the editor leaves them alone (they're off-property)
- 3 `water.creeks` → `kind:'water', geom:'line', subtype:'creek', phase:1`
- `water.ponds` → `kind:'water', geom:'area', subtype:'pond'`; `sanctPools` → same, `phase:2`
- 7 `clearings` → `kind:'zone', geom:'area', subtype:'meadow'`, phases per Fix 12; ellipses become 16-gons using the same `ell()` helper `zonesExport()` already has (1564–1566)

After migration the bake and the export read `SCENE.features` only. The legacy arrays can stay as the literal seed input to the migration and nothing else.

---

## 3. One renderer, two targets

```js
drawFeatures(ctx, { target: 'bake' | 'live', mode, cam })
```

- `paintTerrain()` calls it into the offscreen `terrain` canvas (vector floor)
- `frame()` calls it onto the main canvas over satellite/painted plates

Same geometry, same phase-ghosting rule, one place to change a look. This is the change that makes Fix 12 disappear rather than get patched: phase ≥2 renders in the blueprint language (`--ghost:#9fd4ff`, dashed) in *both* targets, so `Now` stops over-claiming everywhere at once.

**Paint order** must be explicit — today it's accidental (creeks overdraw roads only because they happen to come later, 776–779 after 773–775):

```
zones → water areas → roads → water lines → structure-areas → boundary → structures → labels
```

with `sort` as a per-feature override.

**Forest carving** (`inClearing` / `nearPath`, 786–788) keys off phase: only phase-1 zones and roads clear forest. An unbuilt food forest still reads as forest with a planned outline over it — which is the honest picture, and the whole point of Fix 12.

---

## 4. One editor

A single `✎ Draw` chip in `#buildFoot` replaces the planned separate road tool. It opens a compact panel: **kind → subtype → phase**, plus an *attach to* picker when kind is `structure-area`.

Mirror the boundary editor, which is proven and QA-clean:

- `roadMode`-style flag + `body.drawing` class, with `body.drawing .poi, body.drawing .banner { pointer-events:none }` alongside the existing `body.bounding` rule (254). QA confirmed that inert-icons rule works.
- **Draw:** click each vertex, live rubber-band to the cursor, double-click / Enter / click-the-first-vertex to finish. Areas auto-close. **Esc cancels the whole in-progress feature** — same convention as ghost placement.
- **Edit:** select a feature → gold vertex handles + faint mid-segment insertion ghosts. Generalise `boundHit(px,py)` (1640) to take a point list and it serves boundary, roads, water and zones unchanged — it already does screen-space 12px/10px radii, and `drawBoundaryEditor` already divides handle size by `cam.z`, so precision holds at every zoom.
- **Delete:** right-click a vertex removes it (refuse below 2 for lines, below 3 for areas, with the toast the boundary editor already uses); a ✕ removes the whole feature.
- **Retype/rephase** from the same panel with a feature selected — no re-drawing to change a track into a paved road.
- Draw in-progress on the **main** canvas via a `drawFeatureEditor(t)` sibling to `drawBoundaryEditor`, hung off the same unconditional call slot (1036) so it works in every terrain mode.

**Performance rule, non-negotiable:** `paintTerrain()` re-bakes 2400×1600. Re-bake on **pointerup / commit only**, never per pointermove. The boundary editor already follows this; inherit it rather than rediscover it.

**Undo + audit:** push `{t:'feature', prev:<deep copy of SCENE.features>}` per commit, exactly like `{t:'bound', prev}` — QA confirmed whole-snapshot undo restores count *and* positions. Log `feature-draw`, `feature-edit`, `feature-type`, `feature-phase`, `feature-attach`, `feature-delete` through `logEdit()` so it all rides into `map_edits`.

---

## 5. Precision — the part the request is actually about

- **Snap** to feature vertices, feature endpoints, structure anchors and the boundary within ~10 screen px, so a spur genuinely joins the network instead of floating 3 px off it. **Shift** suppresses; **Alt** constrains to 15° from the previous vertex.
- **Live length in metres** while drawing a line. `GEOREF.mPerUnit` is already in the file at `2592/2400` ≈ 1.08 m per world unit — it's one multiply.
- **Live enclosed area** while drawing an area — shoelace × `mPerUnit²`, shown in m² and ha. For a food forest or a farm boundary this is the number the founder actually wants, and it's what turns this from sketching into surveying.
- **Vertex coordinate readout** in world units and lat/lon — `worldToLatLon()` already exists (638) and is already proven correct by the export's GeoJSON ring.

---

## 6. Structure-attached areas — the consequences

"Any icon can have an extended boundary" is the highest-value part and the one with the most knock-ons. Each of these is small, but missing any one of them makes the feature feel broken:

| Concern | Behaviour |
|---|---|
| **Hit-testing** | `hitStruct` (928) currently takes nearest-anchor-within-`30/cam.z`. Point-in-polygon on an owned area should win over radius — clicking anywhere in the food forest opens the food forest. Fall back to the radius when a structure has no area. |
| **Drag** | Dragging a structure translates its owned area by the same delta. Otherwise the icon and its ground divorce on the first nudge. |
| **Remove** | Removing a structure removes its owned areas — and `{t:'remove'}` undo must restore them, exactly as QA confirmed it already restores seats and quests. |
| **Stranding** | Keep the anchor-based test for now (`strandedCheck`, 1647). A partially-outside footprint is a real third state; flag it as a known simplification rather than pretending. |
| **Rendering** | An owned area inherits the owner's circle colour, and its state — a phase-3 building's footprint ghosts with it. |
| **Export** | `footprint` on the structure stops being `null`. Store it as the **feature id**, not an inline copy, so there's one source of truth (consistent with the compute-on-read contract). |

---

## 7. The payoff — flows follow real routes

The Flows lens currently draws every edge as an abstract quadratic bow between two anchors (985–990). With a geometry layer, a flow gains an optional `via`:

```js
{ from:'spring3', to:'tank', medium:'water', via:'f12' }   // f12 = the pipeline you drew
```

and the particles run along the **actual canal, creek or pipe** instead of a decorative curve. The metabolism stops being a diagram and becomes the map. That is a small change in the flow renderer — walk the polyline instead of the bezier — and it's the moment the whole system earns its keep.

Second payoff, further out: the Canopy vital asserts "93.1 ha forest held". With zones carrying real area, that number becomes **computed** rather than typed — which is exactly the `counts: 'computed on read, never stored'` contract the export already declares.

---

## 8. Export changes

Keep `map_zones` as the wire name — it already carries both `polygon` and `path`, so the §5.2 contract survives — and widen the row:

```json
{ "id":"f12", "kind":"water", "geom":"line", "subtype":"canal",
  "path":[[x,y]…], "phase":2, "owner_structure_key":null,
  "name":"East canal", "length_m":214.6 }
```

Areas add `"polygon"` + `"area_m2"`. Structures' `footprint` becomes the owning feature's id. Derived measurements (`length_m`, `area_m2`) are fine to emit — they're computed from the geometry in the same file, not incremented counters.

---

## 9. Staging — build it in this order

| Stage | Scope | Why here |
|---|---|---|
| **A** | Model + `migrateFeatures()` + `drawFeatures()` unified renderer + generic editor for lines. **Delivers roads (all three surfaces) and retires Fix 12.** | Everything else stands on this. Ship it before anything below. |
| **B** | Areas: zones, water areas, and `structure-area` with the §6 knock-ons (hit-test, drag, remove/undo, export `footprint`). | The food-forest / farm / building-outline ask. |
| **C** | Water lines as first-class + flows `via` routing + length/area readouts. | Where it stops being a drawing tool and becomes the metabolism. |
| **D** | Computed vitals from geometry (canopy ha), zone-aware quests. | Optional; only once A–C are solid. |

---

## 10. What this changes in the fixes doc

- **Feature 13 (road tool) is superseded** — it becomes Stage A of this, with the same three surfaces and the same interaction model, but built on the general primitive instead of a road-only one.
- **Fix 12 is absorbed** — phase-tagging the land layer is step one of the migration, and the unified renderer is what actually fixes the over-claim. Do not implement Fix 12 separately and then refactor it; you'd migrate `SCENE.roads` twice.
- **Fixes 1–11 are untouched by all of this.** They're independent crash, focus, clamp and layout bugs. **Ship them first**, on their own, so the QA baseline stays clean — then take Stage A. Refactoring the geometry layer while an attention-cycle crash is still live makes both harder to verify.

---

## 11. Open decisions for Rye

1. **Public roads** (`pozaAzul`, `pacificEdge`) — editable, or locked as off-property context? Spec assumes locked, flagged `public:true`.
2. **Confirm the Fix 12 phase mapping** (roads and clearings) before it gets baked into the migration — I derived it from district and structure phases, it isn't ground truth.
3. **Partially-stranded footprints** — is "anchor inside, area crossing the line" a state you want flagged, or is anchor-based good enough for now?
4. **Zone subtypes** — the day-one list above is a guess at your vocabulary. Meadow / forest / orchard / paddock / garden / protection. What's missing, what's wrong?
