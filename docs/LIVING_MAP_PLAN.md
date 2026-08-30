# The Living Map — Vision, Design, and Architecture

**Status:** DESIGN — foundational plan, decisions locked with Rye 2026-08-08
**Scope:** Altitude 1 (the village Grounds map) is the build. Altitudes 2–3 (bioregion campaign maps, the globe) are mapped here as architectural foundations, built later.
**Companion docs:** `docs/VILLAGE_OVERVIEW.md`, `docs/MAIA_BRAIN_SPEC.md`, `FIXES_TO_MAKE_2026-08-04_VILLAGE_MAP.md`, `docs/ARCHITECTURE.md`, `docs/FORK_RUNBOOK.md`, `PLATFORM_FOUNDATION.md`
**Predecessor line:** PLATFORM_FOUNDATION.md already names this: "Living Village map (milestones rendered on an illustrated map of the land)." This doc is that phase, grown to its full size.

---

## 0. What this is

The platform has a game. It has quests, seats, circles, tokens, cycles, stages, a brain. What it does not yet have is a *world* — the thing you see when you arrive that makes all of it legible at a glance, the way an Age of Empires town tells you its whole economy in one look. The Living Map is that world: every village's real land, drawn from its real masterplan, rendered as an illustrated interactive map where every building is a door into the game. Scroll to the library building and click it: you are in the Material Library module. Hover the greenhouse: three open seats, two quests, a work party Saturday. This is the piece that turns our custom Games into games.

Three altitudes, one visual language:

| Altitude | Surface | What you see | Status |
|---|---|---|---|
| 3 — Globe | regencivics.earth | The Earth, organised by bioregions; active bioregions glow | Mapped (§3) |
| 2 — Bioregion | regencivics.earth | A Total War-style campaign map of one bioregion: watersheds, relief, and every land project rendered as a settlement that grows with its real progress | Mapped (§3) |
| 1 — Grounds | each village (this codebase) | The village's own land: SimCity × Farmville × Age of Empires. The landing surface of the Game | **This build** |

Six decisions are locked from the 2026-08-08 session: layered art on vector foundations (painted plates over a permanent vector floor, every structure its own stateful sprite), the experience studied against how Age of Empires and Civilization actually play — including the editor, which is built as the game's build mode, not admin software — the living sim with ambient life at launch, Maia as the full guide with tours from the day members arrive, members landing on the map as their home, and masterplan translation running fully automatic: upload to painted map in one pass, refinement in build mode after. Two implementation decisions remain flagged for veto in §1.

One principle governs everything downstream, and it is the same principle that governs Maia: **the map is a mirror, not a fantasy.** Every visual state traces to something true — a funded build, a completed quest, a seat filled, a lunation closed. A map that flatters is a map that lies, and the whole trust model of the platform composts with it. The game loop points outward: the best thing the map can do with a player is get them off it, into the real world, adding real value — and make the map visibly better because they did.

---

## 1. Decision register

| # | Decision | Call | By | Status |
|---|---|---|---|---|
| D1 | Art direction | Painted plate + sprites, on vector foundations: the token-drawn vector terrain is the permanent floor every village gets on day one and the fallback forever; the AI-painted terrain plate renders on top; every structure is its own themed sprite with visual states, so buildings individually grow, light up, and open | Rye | **Locked** |
| D2 | Scope | Living sim at launch: growth states, ambient life, real sky, event ripples, construction truth | Rye | **Locked** |
| D3 | Maia | Full guide at launch: advisor dock, live narration, camera-driving directives, and guided welcome tours all ship with the member launch (G4). No reduced slice reaches members first | Rye | **Locked** |
| D4 | Experience study | Replicate the AoE / Civilization play experience where it serves us; refuse what doesn't (§2.6) | Rye | **Locked** |
| D5 | Landing | Members land on the Grounds map as their logged-in home from launch (the G4 flip). The public brochure shopfront keeps its job for visitors, with a read-only "Visit the village" portal | Rye | **Locked** |
| D6 | Translation | Fully automatic, then build mode: upload → one-pass scene read, composition, and paint → the scene publishes at **founder visibility**, behind a `map.grounds_enabled` game variable (the concierge's own gating pattern). Refinement happens in the Grounds Editor built as the game's **build mode** — an AoE-style asset palette with click-to-place ghost footprints and drag-to-move, for every asset we add onto the map | Rye | **Locked** |
| D7 | Rendering | PixiJS scene in a lazy route chunk; all text and panels stay DOM; layout stays pure shared functions; SVG vector mode remains as fallback and baseline | Claude, for veto | Proposed |
| D8 | Liveliness transport | Poll `/api/map/pulse` (~45s). No websockets; one process per deployment stays load-bearing. SSE is a later option behind the same route | Claude, for veto | Proposed |
| D9 | Data doctrine | **The map is a lens, not a ledger**: everything shown on the map lives canonically in a module and is reachable there in another standard format (the Wall's lists, forum threads, the export seed). The map addresses; it never stores. The test: delete the map and no data dies | Rye | **Locked** (2026-08-08 eve) |
| D10 | Conversation | Structures host forum conversations in place: a Talk tab on the portal panel renders the threads addressed at that structure, composer included. Threads are **multi-addressed** — at creation a thread picks any number of map locations — and unpicked threads resolve deterministically through the same address chain as quests. Read/write passes through the forum's existing audience gates; the public portal sees only public threads | Rye | **Locked** (2026-08-08 eve) |
| D11 | Graphics agency | Every rendered layer toggles between its options as a per-member preference: terrain Satellite \| Painted \| Vector, structures Auto \| Emblems \| Isometric \| Painted, ambient life Full \| Calm \| Off, label density. And the painted plate carries **land only** — built form belongs to sprites, so scenery can never contradict the record after a build-mode edit | Rye | **Locked** (2026-08-08 eve) |

D6's safety valve is scene visibility, not the module lifecycle: the `map` module already serves the org map to members and the public, so Grounds cannot hide behind `preview` without demoting what ships today. Instead the Grounds surface arrives OFF behind `map.grounds_enabled` (exactly how `map.concierge_enabled` gates the concierge), and each scene carries its own visibility: auto-translation publishes a complete, painted, *founder-visible* map in one pass — the magic demo — and members see it only when the doors open at launch. Nothing unrefined reaches the community; no review gate slows the reveal. The scene wears an `auto-generated, unrefined` badge until the founder's first edit, so the mirror principle survives the speed.

One dependency named honestly: the locked D1 and D2 stand on the proposed D7 — a veto there degrades the experience to the vector floor with reduced ambient density, a scope change rather than a style change. And D8's real constraint is event-loop contention on the single serving process (the store caches are safe either way; a socket adds no second writer) — polling is the honest fit for minute-resolution liveliness.

---

## 2. What we take from Age of Empires and Civilization — and what we refuse

The point of the study is not nostalgia. Those two games solved, decades ago, the exact interface problem we have: *make a complex living economy legible, charming, and steerable from one screen.* We take their solutions where the fit is real.

### 2.1 The readable economy (AoE)

An AoE town needs no dashboard. Villagers stream between fields and the town center; smoke rises from working buildings; sheep graze; a quarry has carts. You *see* the economy. Translation:

- Figures appear at structures where members actually hold seats or recently completed quests there. Ambient, aggregate, consent-gated (§4.4 L2) — never simulated people pretending to be community.
- Working buildings emit life: garden beds flush green after a harvest log, smoke curls from the kitchen on event days, the workshop glows when tool checkouts are active.
- Idle resources are visible the way AoE's idle-villager button made idle hands visible: the attention cycle (§2.4) surfaces open seats and unclaimed quests — "idle buildings," honestly labelled.

### 2.2 Ages and eras → stages and phases (AoE + Civ)

Dark Age → Feudal → Castle → Imperial is the single best retention mechanic ever built from *pride* rather than fear: the whole town visibly matures. We already have the ladders — the platform stage ladder, launch gates A–F, and each masterplan's construction phases. The map renders them:

- **Construction states per structure:** blueprint → funding → building (scaffolding, AoE-style) → active → thriving → dormant. Driven by real inputs (§4.4 L1), never by timers.
- **Phase reveal as fog of war:** masterplan phases not yet begun sit under wild forest and mist — present, mysterious, unconquered in the only sense we keep (unbuilt). Breaking ground clears the mist. Nothing "explores" it but reality.
- **The Vision toggle:** one tap swaps Now for the full masterplan build-out rendered as luminous blueprint ghosts. The gap between them is the fundable, questable delta — the single most persuasive fundraising surface the platform will own. A ghost building's portal panel shows what it takes to make it real (its crowdpool, its quests), where commerce/legal flags permit.
- **Era ceremony:** closing a phase or a season repaints the map with fanfare — the Rome II "dynamic city growth" moment, earned.

### 2.3 Advisors → Maia (Civ)

Civilization shipped a council of advisors a quarter century before LLMs. Ours is real. Maia holds the bottom-right dock (§5.4): narration of what's alive, dialogue grounded in her existing reader registry, and camera control — "let me walk you to the greenhouse" pans the camera and opens the panel, and newcomers get guided tours. All of it ships with the member launch (D3). Same brain, same authority order, same discard-what-you-cannot-cite discipline; the map is a new set of readers and one new directive channel, not a second Maia.

### 2.4 The "one more turn" loop, inverted (Civ)

Civ's end-turn button cycles you through everything needing attention; its genius is that attention always has a next home. We keep the mechanic and invert its purpose. The attention cycle button walks you through: open seats near your skills, quests at buildings you frequent, today's events, a stale brief section if you steward one. Every stop resolves into a *real-world commitment*, and the session-end card says what you claimed and where to show up. Civ's loop is engineered so you never leave; ours is engineered so you leave with something to do. The metric is the off-the-map rate (§5.4), and it is Maia's success metric too.

### 2.5 HUD grammar (both)

- **Vitals bar, top:** AoE's resource row reborn as village vitals — people, food, water, canopy, hearts (recognition), and tokens where enabled. Every number is a click-through to the module that produced it. No vanity numbers; the voice gate applies to every label.
- **Minimap, bottom-left:** viewport rectangle, event pings, one-click travel. (Bottom-right belongs to Maia.)
- **Banners:** structures carry Total War-style label crowns. The 2026-08-04 fixes doctrine carries over intact: labels always win; icons and figures never cover a name.
- **Inspect panel:** click a structure, a portal panel slides in from the right with the map still visible (§4.3). AoE's bottom-pane inspection, adapted for doors instead of unit stats.

### 2.6 What we refuse

No combat, no conquest, no zero-sum resources. No countdown timers, streaks, or loss-aversion mechanics; the wet season is the only clock. No simulated villagers doing fake labor — an empty plaza on a quiet Tuesday is the truth, and the truth is the product. No engagement-maximising loops: the map succeeds when time-on-map converts to value-off-map. The opponent in this game is degradation — of land, of trust, of attention — and the campaign map we are conquering is the masterplan itself.

---

## 3. Part 1 mapped: the globe and the bioregion campaign maps

Part 1 builds later, in the regencivics.earth codebase, but Part 2's schema must be shaped so Part 1 can stand on it. The architectural foundations:

### 3.1 The atlas card — federation without a registry

Doctrine holds: "No central registry, no login between villages, no village that is a runtime dependency of another," and a village will never "join a registry, or depend on one to keep working." The upper altitudes therefore run on **publication, not registration**:

- Each village that opts in exposes `GET /api/platform/atlas` — a new public, cacheable route beside the `/api/platform/info` handshake, never an extension of it. Contents: village name, coordinates (with an owner-set fuzz radius for privacy), bioregion self-identification, stage, phase, a handful of headline vitals from public health aggregates and the brand overlay, hero art references from the published theme pack, and open-invitation counts (seats, quests, stays). **No brief or record field ever appears on the card** — "the village brain never leaves the fork" holds here too, and the existing no-brief-leak assertion extends to the atlas route the day it exists.
- The hub (regencivics.earth) pulls the cohort it already knows — its incubated projects, its alliance list — on a schedule. Pull, never push. A village that goes dark fades gracefully on the campaign map with a "last verified" stamp; it never breaks anything. ReGen keeps no live read into any village beyond what the village published.
- A village with no land (a nomadic project, a ship, a network guild) publishes `kind: caravan | vessel | camp` and renders as exactly that — the movement has sea projects and road projects, and the map should say so.

### 3.2 Altitude 2: the bioregion campaign map

A bioregion activates when its first village publishes there. For each active bioregion the hub renders a full-screen Total War-style map: painted watershed-and-relief basemap (precomputed stylized tiles from HydroSHEDS/terrain data — generated once per bioregion, cheap to serve), rivers and coastlines legible the way the Rome II campaign reads, and each village drawn as a settlement sprite whose size and detail step with its published stage and vitals — the Rome II "dynamic city growth" grid, applied to real communities. Banners carry names; hover cards carry the atlas card; click travels to the village's own app.

The zoom from globe to bioregion to village is a *designed handoff*, not shared infrastructure: the hub animates the dive, then hands you to the village's domain, and the shared visual language (same sprite grammar, same banner grammar, same vitals iconography from the foundation) makes it feel like one world. Continuity is a style guide, not a runtime coupling — which is exactly the federation posture the platform already chose.

### 3.3 Altitude 3: the globe

The existing globe page gains a "See the World" full-screen entry: bioregion-organised Earth (the bioregion taxonomy source is an open question, §7), active bioregions glowing with settlement counts, click to dive. Projects render as trees today; they become settlements as villages publish atlas cards. Nothing here blocks Part 2; everything in Part 2 (sprite grammar, growth stages, vitals) becomes the reusable vocabulary.

---

## 4. The Grounds experience

### 4.1 Arrival

Members land on the map (D5). From the G4 flip onward it is the logged-in home: login resolves your context, the camera opens on a wide establishing shot of the whole land — the AMORA V7 sheet as living painting — then eases down to *your* place: the building where you hold a seat, or the Gate for newcomers with the Welcome Aboard arc waiting. (Through G0–G3 it lives as the founder-visible Grounds tab behind `map.grounds_enabled`, per §6.) Visitors keep the brochure shopfront; its "Visit the village" button embeds the read-only map with an invitation overlay, which is the shopfront doing what shopfronts do with a view this good.

For a newcomer the first five minutes are Maia's tour (§5.4): a deterministic scripted camera walk — the commons, the greenhouse, the council fire, the quest board — with her narration over it, ending at one concrete first action. Stage 1 of onboarding doctrine: one invitation, not five.

### 4.2 The camera

Pan, zoom, pinch, inertia; double-click travels; keyboard arrows and tab-cycling between structures for accessibility; camera bounds are the scene bounds. Two levels of detail: far reads the painted plate with banners only (the Total War long view); near fades in sprites, figures, and effects (the AoE close view). The camera is also an output device — Maia and deep links drive it (§5.4), and every quest, seat, and event elsewhere in the app gains a "show me on the map" affordance that lands the camera on its home structure.

### 4.3 Structures as portals

A structure is the map's atom: identity (name, archetype, banner), state (§4.4), and **bindings** — the doors it opens. The hover card shows name, circle, and live counts (seats open here, quests here, events today). Click opens the portal panel over the right edge, map still visible: **Overview | Quests here | Seats here | Enter →**. "Enter" deep-links into the bound module; one structure can host several doors (the Community Center plausibly holds forum, feed, and a library shelf; entering asks which, or shows a small lobby).

Default binding grammar (founders override everything in the Editor):

| Structure archetype | Natural bindings |
|---|---|
| Village Hall / Council Fire | progression (stages, seats), forum & decisions, governance tools |
| Quest Board / Great Tree | quests |
| Library / Workshop | library (material library), badges & skills |
| Greenhouse / Gardens / Food Forest | the circles that steward them: their seats, their quests, harvest logs feeding health |
| Kitchen / Hearth | gratitude, events, the feed |
| Market Pavilion | exchange, commerce (where enabled and legally reviewed) |
| Guest Lodge / Gate | stays, profiles, the welcome arc |
| Spring / Clinic Garden | village health |
| Harbor / Trailhead | village network (peers), the wider world |
| Homes | member profiles (opt-in) |

Two schema bridges make this cheap: circles gain `home_structure_id` (the org map and the grounds map become two lenses on one organism), and quests/org_roles gain an optional `structure_key` (work gets an address). Where a bound module's lifecycle is off, the structure renders quiet — present, unlit, honest — never broken.

### 4.3b Structure data depth (added with Rye 2026-08-08)

Each structure carries five data layers beyond doors and counts, all compute-on-read, all module-sourced, progressively disclosed (hover → Overview → tabs): **Role in the organism** (one honest system-function sentence + its chain: district → phase → masterplan intention); **Metabolism** (declared inputs→outputs; a per-structure flow strip; a map-wide **Flows lens** — Now | Vision | Org | Flows — animating real dependency edges spring→tank→beds, garden→kitchen, kitchen→compost→garden; each structure scores **loop closure**, % of inputs sourced on-land, and dangling "imported" edges read as quests waiting to be written); **Live vitals per address** (harvest, checkouts, nights hosted, hearts received here, kWh, water readings — wild structures carry ecological vitals as primary); **Memory** (origin story, photo timeline, crowdpool history, gratitude at this place); **Knowledge shelf** (the structure's own runbooks and calendars — a spatial index into the Material Library). Schema: `map_structures.flows(JSON: inputs[], outputs[])` + everything else resolved from existing module events; no hand-typed numbers, honest empty states.

### 4.3c Conversation gets an address (D10, locked with Rye 2026-08-08 evening)

The lens rule (D9) applied to talk. Forum threads gain map addresses through a join — `thread_structures(thread_id, structure_key)` — never a copy: the thread lives in the forum, full stop; the map renders it in place. A thread names **as many locations as it wants at creation** (a water-line thread plausibly lives at the tank, the spring, and the greenhouse), and threads that name none resolve deterministically through the same chain quests use — explicit pick → author's role home → circle `home_structure_id` → lexicon scorer → the commons pool at the Community Center. `shared/resolveQuestAddress()` generalizes to `resolveAddress(kind)`; one pure function, unit-tested, addressing everything that can visit a place.

The portal panel gains **Talk** — threads addressed here, most-recent first, with inline reply and "start the conversation" (which creates the forum thread with this structure pre-picked). Both doors get handles: every structure has a stable deep link (`#greenhouse` lands the camera there), and every map-addressed thread in the forum wears a "⌖ show me on the map" chip. Audience is the forum's own picker, read through the same gates everywhere — the map is a reader, never a side-channel; the read-only visitor portal shows public threads only, and below-audience threads render as honest counts, not content. New replies join the pulse (a structure's banner glints, rate-limited), and a fresh reply at a place you steward becomes an attention-cycle stop — talk joins seats and quests as a reason the map taps your shoulder, with the off-the-map rate still the metric that matters. No auto-spawned threads, ever: a quiet building shows a quiet Talk tab, and the truth is the product.

### 4.4 The living layer (D2 — living sim at launch)

Five systems, all computed from record, none from fantasy:

**L1 — Growth states.** Each structure's state (blueprint → funding → building → active → thriving → dormant) derives from declared inputs: funding progress where a crowdpool exists, tagged quest completions, activity recency, relevant health metrics. Derivation is a pure function computed on read, the way seasons already are — no cron mutates appearance, nothing derived is stored, and cycle close stays human (invariant 14 untouched). Until sprite-state art exists (G2), states render as banner treatments and markers on the plate; the truth ships before its costume.

**L2 — Ambient life.** Figures appear at structures in proportion to real, recent, consented human activity there — seat holders, quest completers, event attendees — as aggregate presence, name-tagged only under the existing `map.viewPeople` capability and per-member opt-in. Wildlife carries the delight budget: macaws over the canopy, agoutis on the paths, and paths themselves wear subtly where activity concentrates. Below a small-N floor, figures render as generic ambient life rather than countable presence — in an eight-person village, one figure at the greenhouse is a name, and the map never outs anyone. Every ambient animation is seeded from stable hashes of real state — determinism doctrine extends to charm: same state, same scene, every visit.

**L3 — Real sky.** Site-local time of day tints the plate; Costa Rica's wet and dry seasons swap foliage and cloud; the lunar cycle (`shared/lunar.ts` already governs cycles) hangs the actual moon over the map, so a full-moon cycle close *looks* like something. The map runs on the land's clock, which is the only timer this game will ever have.

**L4 — Event ripples.** The pulse — the existing activity stream read through its audience filters, the structure carried in each event's entity reference — animates on arrival: a completed quest sparkles at its building, gratitude drifts as hearts toward the hearth, a new member walks in through the Gate. Transport is a poll of `/api/map/pulse` (~45s, D8) behind a short in-memory cache: one process, no sockets, no second read path around the audience rules, alive at minute resolution — honest resolution.

**L5 — Construction truth.** Scaffolding rises only on real progress: crowdpool percentage, build-quest completions, a steward's logged milestone. No simulated progress bars, ever. Every structure carries a last-verified stamp surfaced in its panel; staleness is shown, not hidden. This is the Crowdpooling thesis made visible — pooled resources you can watch become a building.

### 4.5 The HUD

Top: the vitals bar (people, food, water, canopy, hearts, tokens where enabled), every figure a click-through to its source module. Bottom-left: minimap with viewport and pings. Bottom-center: the attention cycle. Bottom-right: Maia's dock. Top-right: layers — **Now | Vision | Org** (Org overlays circle territories and the orbit map's knowledge onto the land, completing the bridge with the 2026-08-04 org-map work, whose seven fixes proceed unchanged as the Circles lens).

Accessibility and low bandwidth are one design: every structure, state, and pulse item mirrors into the DOM — the Wall (from the fixes doc) grows into that mirror, remaining "the job the map is hired for: find me somewhere to help" in list form. Keyboard-complete, screen-reader-complete, reduced-motion honored, and on a 50 KB/s link the vector mode (D7) with the Wall is a full experience, not an apology.

---

## 5. Architecture

### 5.1 Rendering: one scoped doctrine amendment

The codebase's visual doctrine is SVG, hand-rolled, deterministic — and it was right: the org map's law is "a PURE function of the data — no DOM, no randomness, no time," and its module doc rejected physics simulation as buying nothing but nondeterminism, tick loops, and untestability. The Grounds scene is the first surface that earns an exception: thousands of draw calls (terrain tiles, sprites, figures, particles), a tweened camera, and continuous ambient motion. The amendment, tightly scoped:

- **PixiJS renders the scene only** — terrain, sprites, effects — loaded exclusively inside the lazy `/map` route chunk, so `main.js` stays untouched and the dist budgets are met by construction. WebGL with automatic canvas fallback.
- **Everything textual stays DOM/React:** banners, hover cards, portal panels, HUD, Maia. The voice gate keeps its jurisdiction; screen readers keep theirs; tests keep theirs.
- **Layout stays pure.** `shared/groundsLayout.ts` inherits the mapLayout law verbatim: a pure function of the data — no DOM, no randomness, no time. Scene graph in, positions out, unit-tested isomorphically. Pixi is a projector, never a source of truth. Ambient seeds are stable hashes of state.
- **Vector mode is the floor.** The same scene graph renders to SVG: token-drawn terrain polygons and structure glyphs in the village's `--tone-*` palette — the circleScenes lineage ("one set of drawings, endlessly re-coloured"). This is the no-WebGL fallback, the low-bandwidth mode, and the guaranteed day-one map for every village before any art generation runs.

Art serving obeys the standing rules: **nothing goes in `client/public/assets/`**; terrain tiles and sprite sheets live in the uploads volume with hashed names and year-immutable caching. The plate ships behind a ~40 KB low-res placeholder that paints first, with tiles fetched per viewport as the camera visits them — never the whole grid up front — under a hard total budget (whole plate target ≤ 1.5 MB), sized against the 50 KB/s serving doctrine rather than against hope. One more amendment named plainly: circleScenes doctrine holds that coherence comes from tokens, "not from generating per-village rasters" — the painted plate is a deliberate, budgeted exception for this one surface, and the token-drawn vector floor stays load-bearing beneath it forever.

### 5.2 Data model

New migration, four tables and two bridges; every binding resolves through registries that already exist (modules, capabilities, circles, quests, org_roles):

```
map_scenes        id, status(draft|active|archived),
                  visibility(founders|members), version, bounds,
                  georef(affine: masterplan px ↔ scene units),
                  art_manifest(JSON: plate tiles, sprite sheet, vector pack),
                  vision_of(scene id | null)   -- a Vision scene mirrors a Now scene
map_zones         scene_id, kind(forest|meadow|water|orchard|commons|
                  protection|road), polygon, phase
map_structures    id, scene_id, key, name, archetype, anchor(x,y), footprint, rot,
                  phase, circle_id?, blurb, origin_story,
                  state_inputs(JSON: declared derivation sources — the state
                  itself is computed on read, never stored),
                  bindings(JSON: module doors[], quest_tags[], href),
                  icon, sprite_ref, sort
                  -- THIN BY DESIGN: identity + geometry + authored essence only
map_flows         id, scene_id, from_id, to_id,
                  medium(water|food|materials|energy|compost|care), note, phase
                  -- first-class edges: the Flows lens is a graph query;
                  -- loop-closure % is computable; edges survive renames
map_structure_facts id, structure_id, kind(reading|story|photo|doc|schedule|custom),
                  audience(public|member|admin), payload(JSON), source,
                  logged_by, logged_at   -- indexed (structure_id, kind, logged_at)
                  -- the long tail: every NEW kind of information is a new row
                  -- kind, never a migration; audience filters at the read layer
map_edits         id, scene_id, actor_id, action, target, diff(JSON), at
                  -- build mode is audited: the founder's hand is a record;
                  -- undo history and multi-editor safety fall out for free
pulse             no new table or view: the existing activity stream, read
                  through its audience filters, structure in the entity reference
thread_structures thread_id, structure_key   -- D10: many-to-many; a thread shows up at
                  -- every place it names; the thread itself stays a forum row, untouched
circles           + home_structure_id
quests, org_roles, events + structure_key (optional; work gets an address)
```

Scaling contract: quests, roles, events, gratitude, and health data are NEVER copied onto structures — they attach by `structure_key` and counts compute on read behind the short cache (recompute, never increment). `GET /api/map/scene` returns thin structures + counts; the portal panel lazy-loads `GET /api/map/structure/:key` (facts by audience + module joins). Media lives in the uploads volume and the Material Library by reference — no blobs in rows. No JSON payload is ever queried by content; every filterable dimension is a real column. Build mode writes everything through one audited, admin-gated `PATCH /api/map/structure/:key` — the inspect card edits identity, story, circle, roles, doors, flows, schedule, and phase in place, so a founder can set up everything happening at a structure without leaving the map. Per-village forks keep their own DB (federation), so scale is per-village by construction.

Scenes version: the Editor edits a draft while the active scene serves; publish swaps atomically. The Vision scene is a sibling scene, so the toggle is a data flip, not a rendering special case. Scene `visibility` is the publication plane; the module-lifecycle plane is never borrowed for it — facts stay in their plane.

### 5.3 The translation pipeline: masterplan → world

The AMORA V7 sheet is the proof this pipeline deserves to exist: LiDAR contours, creeks and springs, forest cover, protection zones, and every building footprint color-coded by type. That is not an illustration problem, it is a *reading* problem, and reading is what models do now.

- **Stage 0 — Upload.** The Setup Wizard already collects a master plan image among its six hero images; this stage extends intake: masterplan PDF/image, optional drone orthophoto, the site's coordinates (one pin on a map — Amora's: 9.2320°N, 83.8343°W, the hills above Dominicalito), and the theme choice — a product surface of its own: three preset themes (Emerald Atlas, Terra Sol, Mar Azul), a custom-palette upload, or an AI-woven theme from a plain-language description of the land ("high-desert mesa, adobe & sage") — all landing in brand tokens, all re-inking every emblem, ring, and crown live. Prototyped 2026-08-08 (`docs/prototypes/grounds-v0.html`): the map's base is a **satellite foundation** — real imagery stitched around the founder's pin, graded into the theme — with the game rendered as the platform's own SVG emblem overlays on top (the Civ/AoE grammar, and the SVG doctrine's natural home). The satellite foundation is the onboarding pitch: upload a masterplan, drop a pin, watch your actual land wake up. The painted plate (D1) and the vector floor remain the offline/artistic modes of the same layer stack; production imagery needs a tile-provider decision (Google Maps Platform vs Esri, keys and attribution) alongside Q2.
- **Stage 1 — Read and compose (automatic).** A vision model extracts zone polygons (forest, clearing, water, road), building positions with size classes, and infrastructure from the plan; a deterministic post-pass simplifies and snaps geometry into scene units, stores the georef affine, assigns archetypes, and defaults every binding from the grammar in §4.3. The coordinate pin buys the world beyond the boundary: coastline, public roads, named water, and neighboring settlements pulled once from open map data render as a stylized context ring outside the property line — the coast is real, the neighbor's roof is generic — so every village map sits in its true place on Earth (Amora's proof: the Pacific is a thumb's width west of the Gate). Output: a complete scene, not a proposal.
- **Stage 2 — Paint (automatic, same pass).** The terrain plate renders from the masterplan and site photos in the village's theme — **land only (D11): no buildings are ever painted into the plate**; sprites carry all built form, so the plate stays true through every build-mode edit and only re-paints on land-change events; the scene auto-publishes at founder visibility wearing its `auto-generated, unrefined` badge (D6). Upload to living painted map in one pass — this is the demo that sells the incubator.
- **Stage 3 — Build mode (the Grounds Editor).** Refinement plays like the RTS it studied (D6): an asset palette in the AoE grammar — structures, groves, gardens, water features, decorations — a ghost footprint riding the cursor, click to place, drag to move, with merge, split, rename, rebinding, and phases in the inspect panel. Any asset regenerates from the Admin curation grid, founder taste as the gate. The badge drops on first edit; the scene stays founder-visible until the doors open at launch (G4). Later paint runs happen per scene version, on land-change events, never on a timer. Structure sprite-state sets and per-structure icons generate here too — every village's set uniquely its own, on its theme, replacing the lucide fallback names in `icon`. The vector pack remains beneath it always.
- **Stage 3b — The boundary and the address chain (locked with Rye 2026-08-08).** Build mode also edits the **property boundary**: draggable vertices, mid-segment insertion, deletion; structures stranded by a redraw flag visibly (pulsing ring + Wall entry) but are never auto-removed — the founder decides. Because the scene carries the georef affine, the corrected boundary exports as real-coordinate GeoJSON: the same polygon the atlas card publishes and Altitude 2 renders as the settlement footprint. And placement opens an inspect card that writes the **address chain**: structures are addresses, circles are owners (the emblem ring takes the circle's color), roles are residents (checkbox the seats that live here), quests are visitors. Quest→place resolves deterministically, zero-token, strict fallback order: explicit map-pick → role's home structure → circle's `home_structure_id` → pure lexicon scorer (quest text vs archetype vocabularies, circle-affinity tie-break) → visible pool at the Quest Board ("unaddressed work lives at the board"). Every guess is labeled and overridable; the override is the record. Implemented as one pure `shared/resolveQuestAddress()`, unit-tested.
- **Stage 4 — Live.** Bindings, pulse, growth derivations, and the sky switch on.

The plate prompt that works (validated against V7's actual content, ready for the first paint run):

> *Translate this real topographic ecovillage masterplan into a painterly video-game world map in the style of Age of Empires II and Anno campaign maps. Keep the ACTUAL geography faithful: the winding creeks and springs, the dense rainforest-covered ridges, the open clearings, the curving access roads, and building clusters exactly where the footprints sit — rendered as tropical timber-and-thatch structures, tiny homes, community center, greenhouses, gardens, ponds. Costa Rican Pacific coast rainforest hills, warm painterly light, soft high-angle bird's-eye view. Full-bleed terrain only: no text, no labels, no legend, no UI.*

### 5.4 Maia, the full guide (D3)

One brain, one new surface, all of it live for members at launch (D3). The dock itself is built with agent slots — Maia holds it first, and a village's other agents can join her there without a redesign, which is what "Maia and our AI agents" asks for. Everything extends `MAIA_BRAIN_SPEC` machinery; nothing forks it:

- **Mode:** `guide` joins the mode table with its own model choice and daily budget, so map guidance can never starve the proposal desk (the existing budget doctrine, applied).
- **Readers:** `map.scene`, `map.structure`, `map.pulse`, and the important one — `map.opportunities`: the capability-filtered join of open seats, quests, and events by structure, which is "find me somewhere to help" as a tool. Readers declare module/capability/audience like all fifteen before them; a reader the viewer cannot use is not described to her.
- **Directives:** a guide reply may carry typed directives — `camera.panTo(structureKey)`, `panel.open(structureKey, tab)`, `layer.set(now|vision|org)`. The server validates every `structureKey` against the active scene and **discards hallucinated keys** — the same discipline the concierge applies to match ids (discard what you cannot cite), now steering a camera. The client executes directives as tweens; Maia saying "let me walk you to the greenhouse" and the camera going there is the whole feature.
- **Tours:** the standard arcs (newcomer, visitor, investor) are deterministic scripted step lists — zero tokens, always available, degrade gracefully with no API key exactly as the concierge does. The LLM adds conversational garnish between steps when budget allows.
- **Narration:** pulse events render as template lines for free; Maia speaks unprompted only on your arrival, on changes in your own quest/seat context, and at cycle close. Rate-limited, dismissible, never a nag. Live state outranks the brief on facts; the brief outranks live state on intent — on the map as everywhere.
- **The metric:** the off-the-map rate — the share of map sessions ending in a claimed quest, a seat contact, an RSVP, or a pledge. That number is Maia's score and the map's. Time-on-map is explicitly not a KPI.

### 5.5 Two lenses, one organism

The 2026-08-04 org-map fixes proceed unchanged: label crowns, capacity arcs, layer rings, the forming material, the circle wall. The orbit map remains the **Organisation** lens; the Grounds map becomes the **Land** lens; the Wall remains the **work-finding** lens and doubles as the accessibility mirror. `/map` presents **Grounds | Circles | Wall**, and `home_structure_id` lets each lens point into the others — click a circle, see its buildings; click a building, see its circle.

---

## 6. Build phases

"Living sim at launch" means the map reaches members at the end of G4; G0–G3 build founder-visible behind the `map.grounds_enabled` variable, so today's org map keeps its lifecycle untouched. Amora is the pilot; the second village through the translator is the proof of generality. Each phase ends at a gate — the five CI gates plus the phase's own.

| Phase | Builds | Gate |
|---|---|---|
| **G0 — Ground truth** | Migration (§5.2); `shared/groundsLayout.ts` + tests; vector-mode scene render; portal panels with live seat/quest counts; Wall mirror wiring; founder-visible Grounds tab at `/map`; the housekeeping the repo demands (module-doc update, FORK_RUNBOOK append, smoke checks, a `grounds:scene-published` launch requirement) | Amora's map hand-authored from the V7 sheet is on screen, every structure a working door |
| **G1 — The one-pass translator** | Upload → read + compose + paint → auto-publish to `preview` with the unrefined badge; theme-pack jobs + budgets; plate tiling + placeholder; uploads-volume manifest serving | A second (test) village goes masterplan-to-*painted*-map in one pass, untouched by hands; budget report per run; vector fallback verified by disabling the pack |
| **G2 — Build mode** | The AoE-grammar editor: asset palette, ghost-footprint placement, drag-to-move; rebinding + phases in the inspect panel; Admin curation grid with per-asset regeneration; structure sprite-state sets; scene versioning UX | Amora's auto map refined to ground truth by its founder — in build mode, and it *feels like playing* — held at founder visibility; the badge lifecycle works |
| **G3 — The living layer** | Growth derivations; pulse route + ripples; ambient presence + consent gates; sky/lunar; vitals bar; minimap; attention cycle; Vision toggle | A week of real Amora activity animates correctly with zero manual touch; determinism tests hold |
| **G4 — The guide, and the doors open** | `guide` mode + readers + directives + tours + narration; member visibility opens + member-home switch (D5), blocked by the `grounds:scene-published` requirement; newcomer arc on-map | Off-the-map rate measurable; tour completes with API key absent; **launch** |
| **G5 — Foundations upward (Part 1 begins)** | `/api/platform/atlas` endpoint + fuzz controls; hub-side globe/bioregion prototype against 2–3 published cards | An atlas card round-trips from a real village to a hub campaign-map render |

Fork posture, confirmed against doctrine: the Grounds engine, schema, archetypes, vector pack, and Editor ship in the foundation and reach every fork by pull. Per-village property is data and art: the scene, the bindings, the theme pack, the paint. The stage ladder, path definitions, and season semantics stay untouched — this is a new surface over the game, never a change to the game's design.

## 7. Open questions

1. **Presence defaults.** L2's aggregate figures: opt-out or opt-in per member, and what small-N floor suppresses countable presence entirely? (Capability machinery supports either default; the floor is the part that protects a lone figure from being a name. A community-consent call, likely a Session 0 question per village.)
2. **Image-generation provider and ceilings.** The paint stage needs a provider decision (Nano Banana Pro / Gemini via the existing OpenRouter posture?) and per-village budget ceilings surfaced in Admin next to Maia's.
3. **Vision-mode funding CTAs at launch.** Ghost buildings linking to crowdpools crosses into commerce's `legalReview` territory — enable at G3, or hold for review?
4. **Bioregion taxonomy.** One Earth bioregions, watershed-first (HydroSHEDS levels), or self-identification only? Affects only Altitude 2/3 but shapes the atlas card field now.
5. **Sound.** AoE's soundscape is half its soul. Site-recorded ambient audio (rain, cicadas, the creek), off by default, member-toggled — worth a G3 spike?
6. **The org overlay's depth.** Does the Org layer draw circle *territories* over the land (zone tinting), or just badge structures with their circle marks? Territory tinting is beautiful and risks reading as ownership; needs a design pass with the Amora team's feedback in hand.

## 8. Handoff breakdown

| | Claude Code can do autonomously | Rye must do |
|---|---|---|
| G0 | Migration, groundsLayout + tests, vector render, portal panels, Wall wiring, hand-authoring Amora's draft scene from the V7 sheet into `server/seeds/`, the G0 housekeeping row | Verify the hand-authored scene against ground truth; design veto on archetype grammar; push + deploy |
| G1 | Read/compose integration, paint jobs, tiling, auto-publish + badge, manifest serving, fallback tests | Vision + image-gen provider decisions and keys (Q2) with budget ceilings; recruit the test village; Railway volume sizing check |
| G2 | Editor UI, versioning UX, curation grid, sprite-state and icon generation | Walk the Editor as a founder would; curate Amora's first pack (founder taste is the gate); sign off the refined scene (stays founder-visible until G4); decide Q1's presence floor and Q3's funding-CTA call before G3 starts |
| G3 | Derivations, pulse, ambient, sky, HUD, Vision toggle, determinism tests | A week of real-activity observation; verify the presence floor feels right on the ground |
| G4 | Guide mode, readers, directives, tours, narration, home switch behind flag | Anthropic budget for `guide` mode; script review for the three tours (voice); flip the member-home switch; launch call |
| G5 | Atlas endpoint + tests; hub prototype scaffolding | Bioregion taxonomy call (Q4); cohort list for the hub's first pull; regencivics.earth deploy |

First concrete step when we move to execution: G0's migration and `groundsLayout.ts`, plus hand-authoring Amora's scene from the V7 sheet — the map exists the week that lands, in vector mode, every building already a door. The paint makes it beautiful; the pulse makes it alive; Maia makes it welcoming; and the whole time it will already be telling the truth.
