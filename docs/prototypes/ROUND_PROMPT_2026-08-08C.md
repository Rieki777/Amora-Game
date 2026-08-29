# Round C — build the seven, then QA v0.7

**Paste this whole file as the opening prompt of a fresh session.**

Two parts. **Part A is build work** from Rye's review of the running v0.7 prototype — seven items, each verified against the current file with measurements, not impressions. **Part B is the QA pass**, which runs *after* Part A lands and now includes checks for it.

Do not start Part B until Part A is in and self-verified. A QA pass against a surface that's about to change is wasted.

**Build under test:** `docs/prototypes/grounds-v0.html` — 4,118,562 bytes (3.93 MB), mtime 2026-08-08 21:49 UTC. Boots clean: **zero pageerror, zero console.error** on cold load and Enter.

Doctrine, unchanged: **D9 lens-not-ledger** (the map addresses, never stores — delete the map and no data dies) and **creator's word is law** (gold = creator pick, never re-resolved; amber = deterministic suggestion, always overridable; gray = the Board pool). Site quests/roles/journey-steps are deliberately amber pending Rye's approval round — that is not a bug.

---

# PART A — build (seven items from review)

Each was checked against the shipped file. Line numbers are from `grounds-v0.html` as measured.

## A1 · Icon style: default to Painted, and stop the chip row overflowing

**Two defects in one control.**

Default: `iconMode='auto'` (line 2086). It should ship **`'painted'`** — the painted 3D buildings are the house look now, and Auto's emblems-when-far behaviour should be a choice, not the first impression.

Overflow, measured at 1600×1000 with the theme panel open: the panel spans x 1324–1588 (264 px). The four chips run 1339 → **1604**. The "Painted" chip is **clipped 16 px past the panel edge**, and the row overflows its container by **31 px** (`scrollWidth` 265 vs `clientWidth` 234). Adding a fifth chip later makes it worse.

Fix the row, don't shave the labels — `flex-wrap: wrap` with a row gap, or a two-column grid. Both keep every label readable and survive a fifth option.

While in there: the markup now ships `class="chip on"` on Auto (line 545). **Confirm the click handler actually moves the `on` class** — the old defect was that `[data-im]` set `iconMode` but never toggled selection, unlike `[data-tm]` which does. If the handler still doesn't, this is a one-liner and it closes an old cosmetic bug.

## A2 · Global scale bar in the theme panel, 0–300 %

*"Let's make it all a bit bigger so we can fit more icons comfortably without crazy overlap."*

There is **no global scale control** in the file today. Two narrower things exist and should not be confused with this:

- `#skLbl` — label size 80–130 %, inside the Make-this-yours skin step
- `#iScale` / `#iScaleV` — per-structure size, inside the inspect card

The ask is a **global scale** in the theme panel that moves **icons and their crowns together**, ranging to **300 %**.

Two things to get right, because they're where this goes wrong:

1. **Scale multiplies the existing LOD, it doesn't replace it.** `syncBanners()` computes `k = max(.5, min(1.4, .28 + cam.z * .5))` and applies `scale(k)` (or `k * 1.35` in iso/painted). Multiply by the global factor — don't hardcode past the clamp, or the zoom-responsive sizing dies.
2. **The label collision engine must see the new size.** Crowns stack upward using a measured width and a fixed `h = 22`. At 300 % that constant is wrong and labels will overlap regardless of the resolver. Derive the row height from the scaled font size.

Bigger icons make crowding worse before better, so pair this with the collision fix already open: the resolver nudges a crown up **once** against already-placed crowns and never re-tests, and its thresholds (`h+4`, `(w+o.w)+8`) pass sub-4 px slivers. Iterate until clear, capped at ~4 passes.

Default 100 %. Audited and autosaved like the other skin fields.

## A3 · Vitals become interactive — and stop colliding

**Interaction.** The five vitals plus the moon are `title=` attributes and nothing else (line 1777–1778). Each should open a dropdown carrying two things: **facts** and **a way to act**.

- **Hearts** → gratitude flows this cycle + *send gratitude*
- **Canopy** → hectares held, trend + a quest such as *plant fruit trees to raise canopy*
- **Water** → spring/tank health + a quest such as *clean the creeks*
- **Food** → harvest this cycle + a quest
- **People** → active members this cycle + a way in
- **Moon** → the cycle, what closes when

Build it on the existing quest primitives rather than a parallel path: the action is *create or claim a quest addressed to the relevant structure*, so it flows into the Wall/Get-Involved list, the badge, and `map_edits` for free. Facts should read from `window.FACTS` and the flows graph where they exist, and say so honestly where they don't — the "sample data" label already sets that precedent.

**Collision, measured.** The vitals bar is centre-anchored and fixed-width (657 px); the right-hand HUD is right-anchored. They collide as the window narrows:

| viewport | vitals | overlaps |
|---|---|---|
| 1600 | 472–1128 | clear |
| 1440 | 392–1048 | **✦ Theme** |
| 1280 | 320–960 | **✦ Theme, ☀ day** |
| 1100 | 230–870 | **✦ Theme, ☀ day, layer bar** |

That's the clipped "132 Hear|ts" in the review screenshot. Adding dropdowns to a bar that's already being overlapped will make it worse. Give the top bar a real layout — a flex row that reserves space for both clusters and collapses the vitals to icon-only below a breakpoint.

## A4 · Rename "The Wall" → "Get Involved"

Two visible strings — the button `☰ The Wall` (line 567) and the heading `The Wall — find somewhere to help` (line 604) — plus Maia's copy at line 2036 (*"The Wall lists every open seat and quest in one place…"*). Sweep the copy, not just the button.

Internal ids (`#wall`, `#wallBtn`, `#wallList`, `buildWall()`, `wallGo()`) can stay — renaming them churns the QA suites for no user-visible gain. Note the decision in a comment so the next reader isn't confused by the mismatch.

The heading becomes **`Get Involved — find somewhere to help`**, and Maia's line should follow the same rename.

## A5 · On-brand dock icons

The dock mixes two rendering systems: `♥ ⌂ ➹ ◐` render as monochrome text glyphs, while `🛏` and `🧰` render as **full-colour emoji** — the pink toolbox in the review screenshot. Same 38 × 38 button, completely different visual language.

Replace all six with on-brand SVG. The file already has the vocabulary to draw from: `ICONS` holds 28 hand-drawn stroke emblems in exactly the house style (`stroke: var(--t-icon)`, 3 px, round caps). Author six siblings — wallet, stay, housing, library, journeys, admin — and they inherit theming for free, which the emoji never will.

`➹` is also reused as the journeys glyph in the Loom filter chips (line 612) and the journeys section header (line 2927). Move those to the same new icon so the two surfaces agree.

If you'd rather generate them, they go through `gen_sprites.py` under `STYLE_NATURAL`-style constraints — but SVG is the right call here: these are UI chrome at 38 px, not world art.

## A6 · Build the flows out; stop narrating the prototype

*"Why are we saying anything about 'in the live platform'?"*

Line 3127 still reads *"In the live platform this door mounts the **X** module right here, with the map still behind you."* That's the prototype explaining itself to its own user. Every module sheet should present as the thing itself — sample content plus the live-site link — with no apology and no future tense.

Then the larger half of the ask: **test every route and surface the ones that need work.** Produce a route inventory as part of this item, not as a QA finding:

| route | surface | status | what it needs |
|---|---|---|---|
| `/library` | Library & Workshop door | works / stub / needs-info | … |

Cover both route families — module doors (`/stays`, `/library`, `/health`, `/forum`, `/products`, `/roles`, `/gratitude`, `/feed`, `/quests`, `/profile`, `/team`, `/tools`, `/badges`, `/network`, `/exchange`) and hash routes (`#/place/<key>`, `#/module/<key>`, `#/journey/<id>`, `#/loom`, `#/circles`). For each: does it open, does it carry real sample content, does the live-site link resolve to something that exists at `https://amora.regencivics.earth`. **Anything that needs a decision or missing information gets listed for Rye rather than guessed at.**

## A7 · A tooltip system, written in Rye's voice

The file has **25 `title=` attributes and no tooltip system** — no `.tip` class, no `data-tip`, nothing. Native `title` is the wrong primitive here: it can't be styled, it can't carry two lines, and it doesn't show on touch.

The trigger was the inspect card's **Phase & Pool** block — phase radios, activity select, pool slider, size slider, and a doors row captioned *"doors put a module CTA on this place's card — off → open → when-built"*. Rye's note: *"this isn't clear what's going on here."* It isn't. That caption assumes the reader already knows what a door, a CTA and when-built each mean.

Build one small tooltip primitive (hover + focus + touch, themed, two lines max) and apply it across the inspect card, the theme panel, the layer bar, the dock, the build footer and the vitals dropdowns from A3.

**Every new string is public-facing writing and must follow Rye's language rules.**

> ⚠️ **Blocked on Rye:** point the build session at the language-rules doc. Candidates in the repo: `amora_brand_guide_notes.md`. If the rules live in a skill rather than a file, name it. **Do not invent house voice** — write the tooltips against the actual rules or leave them for a copy pass.

A rule of thumb that holds regardless: explain *what it does to the map*, not what the control is. "Pool" isn't "a funding percentage" — it's "how much of this build is funded; a full pool brings the place alive."

---

# PART B — QA pass (after Part A lands)

The deliverable is a numbered bug list — severity · surface · repro · expected vs actual — committed as `docs/prototypes/QA_REPORT_<date>.md`, plus screenshots of anything visual.

**Verified green before handoff:** `qa/verify_loom.js` (40 checks), `qa/verify_doors.js` (43 checks), `qa/run.js` sections A–E, `qa/check-schema.js` — all zero page/console errors. Your job is to break it anyway.

## Surfaces to attack

1. **Map-type selector** (top-left): `#msLiving` 🏞 Living Map | `#msCircles` ◎ Circles. Default Living. Esc from Circles returns. Try: rapid toggling, toggling mid-camera-travel, mid-journey-walk, with the Loom open, with a panel open, during build mode, after restore. Hash `#/circles` deep-link cold-boot.
2. **The Circles org map** (`#orgmap` / `#orgRoot` / `#orgSvg`): 11 circles + village centre + role nodes (open calls pulse) + quest satellites. Wheel-zoom at cursor, drag-pan, click nodes (circle → its home structure's panel on the land; role/quest → its address; unplaced → toast). Try: zoom to extremes, **drag then click — a click must not fire after a drag**, clicking while zoomed far out, window resize. Known nit: role labels crowd on the Land circle — report severity honestly.
3. **The Loom** (⧉ or `L`): filters (kind/provenance/circle), drag ◉ grips between places, stage → Save/Discard, un-address to the Board, thread `+ place` chips, journey `walk it`. Try: dragging while filters hide the target's section, staging then switching map type, staging then closing and reopening, Save with 10+ staged, Escape mid-drag.
4. **Module doors:** dock (six buttons — now on-brand per A5), door CTAs on Guest Lodge / Sanctuary (when-built) / Ridge Hamlets / Pond Hamlet / Library / Community Center / Market. Sheets show sample content + a live-site link (`https://amora.regencivics.earth` + route) **and no "in the live platform" narration** (A6). Inspect-card door toggles cycle off → open → when-built and are audited. Try: toggling doors then restoring, doors on a newly placed structure, legacy doors in tab 3.
5. **Hash addresses:** `#/place/<key>`, `#/module/<key>`, `#/journey/<id>`, `#/loom`, `#/circles` — cold-boot each (skips intro), browser back/forward, panel close clears hash. Try nonsense keys (`#/place/nope`).
6. **Journey walks:** from the Loom, the ➹ dock sheet. Esc ends. Try: starting a second walk mid-walk, walking j4 (all amber), walking after rewiring steps on the Loom.
7. **Make-this-yours skin step** (build mode ✂ chip, or ◐ dock → open the step): themes, words-theme ("volcanic coast"), accent/parchment, label size 80–130, icon style, dream-mist toggle (default OFF). Save → audited + autosaved; Reset to Amora. Try: skin + restore roundtrip, skin while Circles map open, extreme label sizes vs the collision engine — **and now against the A2 global scale at 300 %**.
8. **Clean satellite:** bay foam and tile seams removed; land untouched (white squares are roofs, not clouds). Check painted mode still bakes; check minimap; zoom the bay for inpaint artifacts.
9. **Persistence:** autosave (2.5 s debounce) → reload → restore. Everything must survive: rewires, un-addresses (`creator-board` must **not** be re-guessed), doors, skin, scale, threads, journeys — **plus the A2 global scale and A3 vitals state**.
10. **Regressions:** build mode (place/move/remove/undo), draw/boundary/features, resolver demo, curation grid, Get Involved, terrain switch (Satellite | Painted | Vector + brush/palette), themes, day/night, tour, Maia, held-key crash sweep (hold every arrow/key combo 5 s each across surfaces), export → `check-schema.js`.

## 11 · The Part A surfaces (new this round)

- **A1** — Painted is the boot default; every chip fully inside the panel at 1600, 1440, 1280, 1100 px and with a fifth chip injected; the active chip is marked and the marker moves.
- **A2** — scale at 50 / 100 / 200 / 300 %: icons and crowns scale together, zoom LOD still responds, **zero crown collisions at every step**, and the value survives reload.
- **A3** — every vital and the moon opens its dropdown; each carries facts *and* an action; actions create real quests that appear in Get Involved and the badge; **no HUD overlap at 1600 / 1440 / 1280 / 1100**.
- **A4** — no "The Wall" anywhere in visible copy, including Maia's lines.
- **A5** — all six dock glyphs are SVG in one visual language; no emoji fallback at any zoom or on a machine without an emoji font; they re-ink with the theme.
- **A6** — no "in the live platform" (or equivalent future-tense apology) anywhere; every route in the A6 inventory behaves as its status claims.
- **A7** — tooltips on every control named in A7, keyboard-reachable, dismissible, not clipped at panel edges; copy follows the language rules.

## Automated suites (run before and after manual work)

The suites live in `docs/prototypes/qa/`. Edit the `FILE` constant at the top of each to your local absolute path of `grounds-v0.html`, and `EXE` to a local Chromium if needed (or remove `executablePath` to use Playwright's own).

```
node qa/verify_loom.js     # 40 checks — Loom, provenance, drag/save, restore
node qa/verify_doors.js    # 43 checks — doors, dock, deep-links, journeys, skin, circles map
ONLY=A node qa/run.js      # boot + interactions harness (B, C, D, E likewise, one at a time)
node qa/check-schema.js <exported amora-scene.json>   # 12-block export contract
```

**A PASS wall is the starting line, not the finish.** Zero `pageerror` and zero `console.error` is a hard gate on every surface — collect them the whole session, and report the total.

## Do not regress (fixed in earlier passes — re-verify, don't re-litigate)

- Labels always win, never collide, never squat on a neighbour's icon click-centre.
- Deterministic everything: same seed → same map; the painted plate is a pure filter over the satellite (**brush 0 = pixel-identical satellite**).
- Slug keys only in exports; feature ids never reused; counts computed on read, never stored.
- Creator picks are never re-resolved; `creator-board` (explicit un-address) is never re-guessed.
- Sprite art direction is **LOCKED**: futuristic solarpunk-elven, grown-not-built.
- The attention cycle survives a board-addressed timed quest; the tour survives a pan mid-leg; Ctrl+Z works immediately after closing the inspect card; no rendered frame shows void past the map edge; all four minimap corners travel in build mode.

## Open items (context — do not report as new)

- The whole site inventory is amber pending Rye's approval round on the Loom.
- Org-map role labels crowd on dense circles (Land); a spacing pass is welcome as a FIX suggestion.
- A very faint residual seam remains bottom-left in the bay at extreme zoom (invisible under painted mode).
- Rye still needs to add `GEMINI_API_KEY` to `.env` locally (remote tools may not write `.env`).
- Site-side, out of scope for this file: Make-This-Yours step 6 (map skin fields), mounting this map at `/map` beside the radial org view, module sheets → real module mounts, site → `#/place/…` links.

## Report format

```
## QA REPORT <date>
### Bugs
B1 [high|med|low] <surface> — <one-line>
   repro: … · expected: … · actual: … · console: …
### Fixes suggested (not bugs)
F1 …
### Verified clean
<the surfaces/suites that held>
```

End with a **Handoff Breakdown**: what the next build session can do autonomously vs what needs Rye (env vars, git push, browser-only checks, live-site verification, language-rules approval).

---

## Handoff Breakdown — this round

### YOU (Rye) — only you

| # | Task | Why only you | Where |
|---|---|---|---|
| 1 | Name the language-rules doc for A7 | It's your voice; the build session must not invent it | `amora_brand_guide_notes.md`, or the skill name |
| 2 | Decide A6 routes flagged "needs-info" | Product calls about what each module actually is | A6 route inventory |
| 3 | `GEMINI_API_KEY` into `.env` | Remote tools can't write `.env` | local Windows |
| 4 | Commit + push | Claude Code may hold `index.lock` | `git add -A && git commit && git push` |
| 5 | Live-site verification of module links | Needs a browser against the real site | `https://amora.regencivics.earth` |

### BUILD SESSION — autonomously

| # | Task | Status |
|---|---|---|
| 1 | A1 icon-style default + chip row + active marker | HUMAN STEP REQUIRED |
| 2 | A2 global scale 0–300 % + collision engine iteration | HUMAN STEP REQUIRED |
| 3 | A3 vitals dropdowns + top-bar layout | HUMAN STEP REQUIRED |
| 4 | A4 Get Involved rename (copy sweep) | HUMAN STEP REQUIRED |
| 5 | A5 six SVG dock icons | HUMAN STEP REQUIRED |
| 6 | A6 module copy + full route inventory | HUMAN STEP REQUIRED (inventory partly blocked on Rye) |
| 7 | A7 tooltip primitive (copy blocked on language rules) | BLOCKED on #1 above |
| 8 | Part B QA pass + `QA_REPORT_<date>.md` | BLOCKED until Part A lands |

### Measurements already done for you (don't re-derive)

- chip row overflows its container by **31 px**; "Painted" clipped **16 px** past the panel edge (panel 1324–1588, chip ends 1604)
- `iconMode` default is `'auto'` at line 2086
- vitals bar 657 px, centre-anchored — overlaps ✦ Theme from **1440 px** down, ☀ day from **1280**, the layer bar from **1100**
- dock: `♥ ⌂ ➹ ◐` are text glyphs, `🛏 🧰` are colour emoji, all in 38 × 38 buttons
- "In the live platform" at line **3127**; "The Wall" at lines **567**, **604**, **2036**
- **25** `title=` attributes in the file; no tooltip system present
- no global scale control exists; `#skLbl` (80–130 label) and `#iScale` (per-structure) are the only relatives
- cold boot of the current build: **zero pageerror, zero console.error**

---

# 12 · The living-land systems (addendum — appended to Part B)

Part A landed, plus the approved feature round (F1–F5 + Rye's adjustments) in the same build. **Build under test:** 4,149,387 bytes (3.96 MB), 3,649 stripped lines.

Suites: `qa/verify_features.js` (35 checks) now runs beside `verify_loom.js` (40) and `verify_doors.js` (43, dock = 7 / modules = 10 expectations).

Handles verified present in the file, so you don't hunt for them:
`window.CONCIERGE_LOG` · `.talk` · `pulseTick(key)` · `window.LOTS` (line 3168) · `window.ROOMS` (3169) · `ev-u0…ev-u3` · `window.VITAL_OVR` · `public-unlock` · `map_scene.vocabulary` · `map_scene.skin.global_scale` (via `skinExport()`, restored by `setGScale()` at 3342) · `COATI` / `HERON` / `MACAW`.

## 12.1 Concierge (Maia's ask box)

"book a room" → Stays door · "I want to help with planting" → Garden Helper claim offer (quest-first **only** under help-intent words) · "walk me to the greenhouse" → travel · gibberish → honest miss, logged. Every ask lands in `concierge_queries` (`matched_kind: none` is the demand signal).

Try: module verbs vs colliding building names (**"library"** is both a module and a place — which wins, and is that the right call?), empty input, whitespace-only, **HTML injection** in the ask.

Push further: the injection test must be checked **twice** — rendered in the Maia log *and* in the exported JSON. `concierge_queries` spreads the raw record (`.map(c => ({...c}))`, line 2327), so whatever the user typed ships into the production seed verbatim. Confirm it is escaped on render and inert on re-import, and sanity-check that nothing personal a user might type into an ask box lands somewhere surprising.

## 12.2 Village pulse

Buildings shimmer (`.talk`) when a thread's home gets sample activity — ~31 s cadence, deterministic. `pulseTick('kitchen')` forces one. Off in build mode; off when the skin's "village pulse" toggle is off; the toggle survives restore.

Push further: force a pulse on a structure that was **removed** in build mode, and on one addressed to `creator-board`. This is the crash class that produced the only pageerror of the last full pass — a key held across a mutation.

## 12.3 Occupancy (lots)

`⌂2/5`-style counts on Ridge N/S + Pond Hamlet, in banners, hover cards, the panel line, and the Housing/Stays sheets — all from **one** source (`LOTS` / `ROOMS`).

The source is read in five places: banner `.cnt` (1893), hover card (1913), panel (1948), Housing sheet (3225), export (2326). Mutate `LOTS.ridgeA.sold` in the console and confirm **all five** move together without a reload.

Push further — **the framings disagree even though the numbers don't.** The banner renders `⌂2/5` (sold of total), the hover card renders "3 of 5 lots open" (remaining of total), the panel renders "2 of 5 lots". Same truth, opposite polarity, three phrasings. Report whether a person glancing between them would misread it.

## 12.4 Event lanterns

Star badge on every event home; urgency classes `ev-u0…ev-u3` (tonight pulses brightest and fastest; twelve-days-out barely breathes). RSVP increments once then disables — in the panel card **and** the Events dock sheet, same count. Multi-address events (the feast = Kitchen + Community) badge both homes.

Push further: RSVP, then reload and restore. Does the disabled state survive, and does the count stay put — or does restore let you RSVP a second time, or double-count? On the multi-address feast, does one RSVP increment once or twice?

## 12.5 Computed vitals

Every vital + moon opens its dropdown: facts, a how-computed line, a source label (drawn land / module sample / founder-set), and an action that claims or creates a **real** quest — confirm it appears in Get Involved *and* `map_edits`. In build mode, ✎ set overrides: audited, exported as `vital_overrides`, survives restore, ↩ clears back to computed. Draw a forest zone → canopy flips to "drawn land" and recomputes.

Push further: set an override on canopy, **then** draw a forest zone. Which wins? The precedence must be explicit and the source label must tell the truth about it. An override that silently masks a recomputation is the worst of both.

## 12.6 Phase transparency

Phase 1 solid, phase 2 ≈ .84, phase 3 ≈ .62 ("loading into reality"). Check the interplay with blueprint ghosting, hover, and the held-key sweep.

Push further: phase 3 at .62 **under a crown** — the standing rule is labels always win and never squat on a neighbour's click-centre. Verify a 62 %-transparent icon is still hit-testable at its centre and that the crown is still legible over it. Also check it against the A2 global scale at 300 %.

## 12.7 Public geometry lock

Clicking a `public:true` feature in draw mode refuses with the ⚿ toast until ⚿ Public land is toggled (audited `public-unlock`); relocking re-protects.

Push further: unlock, start a drag on a public vertex, and relock **mid-drag**. Also confirm undo across a lock boundary can't quietly reinstate an edit that the lock should have prevented.

## 12.8 Vocabulary

Skin step "zone words": rename a subtype → drawn zones follow, draw-panel options follow, `map_scene.vocabulary` carries it, restore applies it. Add a word; Escape cancels an edit.

Push further: rename a subtype that already has drawn zones **and** an entry in the export, then reload. Also try a rename to an existing word (collision), to an empty string, and to something with markup in it.

## 12.9 Wildlife + walkers

7 birds, 2 macaw pairs (red, blue/gold wings), a heron circling the Ponds, a coati ambling foodforest → trailhead — deterministic paths, no jitter on pause/resume. Figure orbits scale with sprite size; at 200 % global scale, walkers must not hide under buildings.

Push further: "pause/resume" in the wild is **tab-backgrounding**, where rAF throttles to ~1 fps and `dt` clamps. Background the tab for 60 s, return, and check nothing teleports or accumulates. And grep the wildlife paths for `Math.random()` — the determinism doctrine says same seed → same map, and `mulberry()` is the house PRNG.

## 12.10 Global scale × everything

At 300 %: labels (measured row height) still never collide; event badges and pulse glows scale sanely; the org map is unaffected; `global_scale` exports and restores.

It exports at **`map_scene.skin.global_scale`** (via `skinExport()`), not as a top-level key, and restores through `setGScale(Math.round(sk.global_scale*100), true)` at line 3342 — check the round-trip at 300 %, and that the `*100` / `/100` conversion doesn't drift over repeated save→restore cycles.

Push further: **hit-testing at scale.** `hitStruct()` uses a `30 / min(cam.z, 1.4)` world radius that has nothing to do with the visual size. At 300 % the icons are three times larger than their click target — verify clicking the visible edge of a big icon still opens it, and that two adjacent scaled icons don't steal each other's clicks. Also check the minimap, which draws fixed 3 px dots regardless of scale.

## 12.11 Export contract — a gap worth knowing before you start

The suite is described as a **12-block** contract. The build now exports **17 top-level blocks**:

```
map_scene · map_zones · map_structures · map_flows · map_structure_facts · map_edits ·
boundary · circles · org_roles · quests · journeys · forum_threads · events ·
stays_occupancy · concierge_queries · vital_overrides · counts
```

So unless `check-schema.js` was extended in the same round, **five blocks ship unvalidated** — `forum_threads`, `events`, `stays_occupancy`, `concierge_queries`, `vital_overrides`. The checker will pass while the newest surfaces in the build go unchecked. First job of section 12: run `check-schema.js` and report how many blocks it actually asserts. If it's 12, that's finding one, and extending it is the cheapest durable win in this round.

## Known-context (don't report as new)

- Canopy reads "module sample" until a forest zone with `geom:'area'` is drawn.
- Events / occupancy / pulse are labelled sample.
- `/events` rides `/seasonal-festivals` until the site's Events module lands.
- Inspect-card phase/pool controls still carry pre-A7 captions, pending Rye's language-rules doc for the full copy pass.

## Already measured — don't re-derive

- export has **17** top-level blocks (listed above)
- `global_scale` lives at `map_scene.skin.global_scale`, not top level
- `LOTS` = `{ridgeA:{sold:2,total:5}, ridgeB:{sold:1,total:6}, pondhomes:{sold:3,total:4}}`; `ROOMS` = `{guest:{taken:2,total:3}}`
- occupancy is read at lines 1893 / 1913 / 1948 / 3225 / 2326 — five surfaces, three phrasings
- `concierge_queries` spreads the raw log record into the export at line 2327
