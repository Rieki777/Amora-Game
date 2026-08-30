# QA addendum — section 12: the living-land systems (append to Round C Part B)

Part A landed **plus** the approved feature round (F1–F5 + Rye's adjustments) in the same build.
Add these to the attack list. Suites: `qa/verify_features.js` (35 checks) now runs beside
`verify_loom.js` (40) and `verify_doors.js` (43, dock=7 / modules=10 expectations).

12.1 **Concierge (Maia's ask box)** — "book a room" → Stays door; "I want to help with planting" →
Garden Helper claim offer (quest-first only under help-intent words); "walk me to the greenhouse" →
travel; gibberish → honest miss, logged. Every ask lands in `concierge_queries` in the export
(`matched_kind` none = the demand signal). Try: module verbs vs building names that collide
("library"), empty input, HTML injection in the ask.

12.2 **Village pulse** — buildings shimmer (`.talk`) when a thread's home gets sample activity
(~31 s cadence, deterministic; `pulseTick('kitchen')` forces one). Off in build mode; off when the
skin's "village pulse" toggle is off; toggle survives restore.

12.3 **Occupancy (lots)** — `⌂2/5`-style counts on Ridge N/S + Pond Hamlet banners, hover cards,
panel line, and the Housing/Stays sheets — all from ONE source (`LOTS`/`ROOMS`); numbers must never
disagree between surfaces.

12.4 **Event lanterns** — star badge on every event home; urgency classes ev-u0…u3 (tonight pulses
brightest/fastest; 12-days-out barely breathes). RSVP increments once then disables, in the panel
card AND the Events dock sheet, same count. Multi-address events (feast = Kitchen + Community) badge
both homes.

12.5 **Computed vitals** — every vital + moon opens its dropdown: facts, how-computed line, source
label (drawn land / module sample / founder-set), an action that claims or creates a REAL quest
(check it appears in Get Involved + map_edits). Build mode: ✎ set overrides (audited, exported as
`vital_overrides`, survives restore, ↩ clears back to computed). Draw a forest zone → canopy flips
to "drawn land" and recomputes.

12.6 **Phase transparency** — phase 1 solid, phase 2 ≈.84, phase 3 ≈.62 ("loading into reality");
check interplay with blueprint ghosting, hover, and the held-key sweep.

12.7 **Public geometry lock** — clicking a `public:true` feature in draw mode refuses with the ⚿
toast until ⚿ Public land is toggled (audited `public-unlock`); relocking re-protects.

12.8 **Vocabulary** — skin step "zone words": rename a subtype → drawn zones follow, draw panel
options follow, export `map_scene.vocabulary` carries it, restore applies it. Add a word; Escape
cancels an edit.

12.9 **Wildlife + walkers** — 7 birds, 2 macaw pairs (red, blue/gold wings), a heron circling the
Ponds, a coati ambling foodforest→trailhead — all deterministic paths, no jitter on pause/resume.
Figure orbits scale with sprite size (check a 200% global scale — walkers must not hide under
buildings).

12.10 **Global scale × everything** — at 300%: labels (measured row height) still never collide,
event badges and pulse glows scale sanely, org map unaffected, export/restore of `global_scale`.

Known-context (don't report as new): canopy reads "module sample" until a forest zone with
`geom:'area'` is drawn; events/occupancy/pulse are labeled sample; `/events` route rides
`/seasonal-festivals` until the site's Events module lands; inspect-card phase/pool controls still
carry pre-A7 captions pending Rye's language-rules doc for the full copy pass.
