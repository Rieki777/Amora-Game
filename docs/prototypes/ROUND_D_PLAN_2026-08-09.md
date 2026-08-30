# Round D — the testing round: camera, badges amended, the land's dress, founder's hands, promises kept

**Paste into a Claude Code session.** You are the map lane: `docs/prototypes/grounds-v0.html` is
yours, using the house protocol — python `rep()` patch scripts with exact-count anchors (grep the
source first; line numbers below are landmarks, the SEARCH STRINGS are the anchors), `node --check`
every script block after each patch, run `qa/verify_doors.js` + `qa/verify_features.js` (+
`qa/verify_badges.js` once it exists) to zero failures and zero pageerrors, commit per phase.
This round comes from Rye's live testing screenshots. It SEQUENCES AND AMENDS
`BADGES_BUILD_PLAN_2026-08-09.md` (same folder): run D1 first, then the badges plan P1–P4 with the
§D2 amendments, then D3–D5. Doctrine unchanged: D9 lens-not-ledger, creator's word is law, voice
rules per the `regen-content-repurposing` skill — NO EM-DASHES in any user-facing string, no
AI-isms, warm and concrete. New user-facing strings are given verbatim below; use them.

## D1 · Camera and hands (do first — it unblocks Rye's own testing)

**D1.1 Overscroll + true zoom-out (screenshots: edge buildings can't center; pinch-out stops).**
One function is the whole bug. `function clampCam()` clamps the viewport fully inside the world
(`cam.x∈[hw, W-hw]`) and floors zoom at COVER fit (`mz=Math.max(innerWidth/W,innerHeight/H)`).
Rewrite both there and in `travelTo`:
- min zoom = FIT × 0.85: `mz=Math.min(innerWidth/W,innerHeight/H)*0.85` so pinch-out shows the
  whole land with a breath of margin;
- center clamp = the world itself: `cam.x∈[0,W], cam.y∈[0,H]` so ANY point of the map can sit at
  screen center (half a screen of beyond-the-edge is visible at the rim — Rye asked to always see
  a bit beyond).
- Letterbox manners: when zoomed past cover, the page background shows around the terrain canvas.
  Paint the gap in the sea/parchment tone (fill the canvas clear color to match the painted ocean
  edge) so overscroll reads as world, not void. The terrain already paints real geography beyond
  the boundary ("the world beyond the boundary" block), so most overscroll is already beautiful.
- Panel-aware centering: when `#panel` or `#moduleCard` is open on desk, `travelTo` targets the
  center of the VISIBLE strip — offset the target x by half the open panel's width in world units
  (`panelW/2/cam.z`). Tapped buildings then center in what the user can actually see.

**D1.2 Pinch everywhere.** Mobile pinch EXISTS (`/* gestures: one-finger pan, two-finger pinch */`,
clamp `.4..2.6`) — it was clampCam's floor that blocked zoom-out; D1.1 frees it. Desktop trackpad
pinch arrives as `wheel` with `ctrlKey:true` and today falls through to browser page zoom. In the
canvas wheel handler (`cam.z*=e.deltaY<0?1.13:0.885`): `e.preventDefault()` always; when
`e.ctrlKey` use a stronger factor (`Math.exp(-e.deltaY*0.012)`) about the cursor point. Add
Safari `gesturestart/gesturechange/gestureend` equivalents. Plain wheel keeps current behavior.

**D1.3 Labels hug their buildings (screenshot: a spring fits in the gap).** In `syncBanners`,
`s._crownOff=(painted?k*1.35*sc*66:...)+10` — reduce to target ~6 px of air between label and
sprite crown at z=1 (try `*54` and `+6`; verify across GSCALE 50–300 and both sprite modes). The
collision engine and neighbor-icon-squat guard stay authoritative — closer, never overlapping.

## D2 · Amendments to the badge round (then run BADGES_BUILD_PLAN P1–P4)

**A1 (screenshot: overlapping markers, unclickable star).** Non-negotiables folded into badge P1:
every marker on a building is clickable (the ✦ star folds into the seal system and opens the event
card); hit priority badge > label > building; 44 px invisible hit areas; NO two badges may overlap
— per-kind anchor slots first, and when a small sprite's slots collide, collapse into ONE cluster
seal with a count that fans on tap (pocket fan exists in the plan; desktop gets hover-spread or
click-fan, same radial math).

**A2 (screenshot: ⚑1 ⛨2 ⌂1/6 ✦ chips invisible in testing — nobody saw them for a long time).**
Kill the text chips in the label (`el.querySelector('.cnt').textContent=...`). Below the badge
zoom gate the building carries ONE **activity seal**: a small round chip, parchment ink on dark
ground (high contrast is the point), showing the count of open items (quests + seats + events +
conversations); gold rim that breathes when an event is ≤ 2 days out. Tap = `travelTo` the
building at z≈1.15, where real badges take over and fan. One glyph language at every distance:
far = one seal with a number, near = the seals themselves.

**A3 Housing is its own door (screenshot: ⌂ 1/6 should open the request flow).** Housing
structures (`LOTS`/`ROOMS` keys) get a dedicated **⌂ home chip** beside the activity seal, always
visible and always clickable. Tap opens an in-map sheet exactly like a module door:
title `Request a home at ${name}`, occupancy line `${sold} of ${total} spoken for` (rooms:
`${taken} of ${total} full tonight`), primary CTA `Begin your request` →
`siteNav('/request-a-house?structure='+key)` (Guest Lodge routes to booking instead), plus
`Ask Maia about living here` → concierge prefilled. Pull the request/booking rows out of the
generic panel so this chip is the front door for stays and homes.

## D3 · The land's dress (SAMPLES-FIRST GATE: screenshot each treatment for Rye before sweeping)

**D3.1 Flow glyphs are the DEFAULT: every flow type wears its own mark (Rye's call).** The flow
TYPES themselves become village vocabulary: `SCENE.vocabulary.media`, an editable list of
`{key, name, color, glyph}` (q1d doctrine — the vocabulary editor gains a **Flow types** section:
add or rename a type, pick its color, pick its glyph from the stock library). Amora's default set,
each glyph canvas-drawn in the ICONS hand (2 px stroke, pre-rendered offscreen sprites tinted by
the type color, `drawImage` along both the via-route and straight-line branches, replacing
today's `cx.arc(...,3.1)` dots in the `SCENE.flows.forEach` draw loop):

| type (key) | glyph | | type (key) | glyph |
|---|---|---|---|---|
| water | droplet | | unprepared food (`food-raw`) | fruit |
| energy | bolt | | prepared food (`food-prepared`) | steaming bowl |
| money | coin | | compost | leaf-curl |
| raw materials (`materials-raw`) | log | | care | heart |
| finished materials (`materials-finished`) | crate | | | |

Reseed Amora's flows to the finer taxonomy: greenhouse→kitchen, foodforest→kitchen and
greenhouse→market become `food-raw`; kitchen→community becomes `food-prepared`. The flow editor's
medium selects (`data-fmed`, `#iFInAdd`/`#iFOutAdd` defaults) source their options from the media
vocabulary, never a hardcoded list. Self-heal on restore: legacy `food` maps to `food-raw`
(one-line alias), and any medium key missing from the list is auto-added with a plain seed-dot
glyph and neutral gold so old exports keep rendering. `SKIN.flow_style` keeps three dresses:
`'glyph'` (the NEW DEFAULT), `'gold'` (one golden orb on every line, the ceremonial look), and
`'medium'` (today's plain colored dots) — in every style the faint route underlay keeps the type
color so lines still read at a distance. Media vocabulary rides `map_scene.vocabulary` (exported,
bridged via `{type:'config'}`, restored) with zero new site plumbing; `flow_style` lives inside
the skin object. Per-flow overrides wait. Screenshot the full glyph sheet at line size for the
blessing before the sweep.

**D3.2 Building, not transparent (screenshot: phase 2 reads as a rendering bug).** Replace
`.poi.ph2{opacity:.84}` with a real under-construction treatment: opacity back up to ~.92 PLUS a
**bamboo scaffold overlay** per phase-2 poi — a small inline SVG sized to the sprite box (two
uprights, three lattice rails, one diagonal brace, a tiny pennant at the top pole; 2 px
`var(--t-icon)` strokes, painterly-friendly). Static, calm, no animation. Phase 3 stays the ghost
it is (`.ph3{opacity:.62}`) — Rye keeps it as is. Screenshot one scaffolded building for the
blessing before applying to all.

**D3.3 The phases get real names.** `Built / Building / Planned` replace Phase 1/2/3 in every
user-facing surface: the inspect radios (`name="iPhase"` currently label bare 1/2/3), legends,
Vision copy, tooltips. Implement `phaseName(n)` reading `SCENE.vocabulary.phases`
(default `{1:'Built',2:'Building',3:'Planned'}`), editable in the existing vocabulary editor
(skVocab pattern) so every village can rename them — q1d doctrine. Exports keep numeric `phase`
untouched for compat; `map_scene.vocabulary` gains `phases`.

**D3.4 Golden tablet labels (an OPTION; ribbon stays default).** `SKIN.label_style:
'ribbon'|'tablet'`. Tablet = the label banner restyled as an etched plaque: gold gradient ground
(`#e2b84e→#c49a2e`), 1 px `#8a6a1d` border, inset top highlight for the etched cut, and REALLY
dark ink (`#241a05`) for high readability — Rye's spec. One class toggle on the banner elements;
skin panel gains the choice; exported inside skin. Screenshot both styles side by side for Rye.

## D4 · Founder's hands (the inspect card grows up)

**D4.1 Duplicate a building (Rye: "quick way to copy a building with all its filled out
details").** Inspect card action row (beside `#iRemove`) gains **⎘ Duplicate**. Deep copy: the
structure (name + ` (copy)`, new key `<slug>-c2`, same family/subtype/scale/phase/state, doors and
badge toggles), PLUS clones of every quest and seat addressed to it (new ids suffixed `-c2`,
`address_source:'creator'` — duplicating IS the creator's word). Do NOT clone flows (edges between
places stay deliberate) or the drawn footprint (the copy arrives sprite-only). Drop straight into
the existing `placing` mode so the founder places it with the next click; `logEdit('duplicate',…)`;
undo removes clone + cloned items; exports flow naturally.

**D4.2 The vitals override in plain words (Rye: "what does set value mean").** The `#vOvr` input
(`placeholder="set value — founder's word"`) confused its own founder — replace the row with a
sentence-first design. Each vital shows a provenance chip: `measured from your drawn land` |
`sample reading` | `held by your word`. Below it the helper line:
`Know the real number? Set it here and the map holds your word until you release it.` — then the
input (`placeholder="the true number"`, unit shown beside it) and button **`Hold this number`**.
While overridden the row reads `Held by your word · release`, and `release` returns it to the
computed chain. Same `VITAL_OVR` machinery, same audit (`vital-override`), same export; only the
language and the visible provenance change.

**D4.3 The role input becomes a combobox (Rye: typing should surface existing roles).** The
`#iSeatName` input (`placeholder="add a role here — name"`, also fix that em-dash →
`add a role here`) opens a dropdown on focus/type listing the village's existing roles, filtered
live, in two groups: `unplaced · picking one homes it here` and `open elsewhere · picking one
moves it here`. Selecting re-addresses that seat to this building as the creator's word
(`logEdit('address-override',…)`, toast `⛨ ${role} now lives at ${name}.`). Enter on unmatched
text keeps today's create path. Reuse the `#vdrop` dropdown pattern.

**D4.4 A Vision of more land (Rye: vision mode can have its own boundary).** Optional
`SCENE.vision_bound` (default null = vision uses the real bound). In build mode WHILE in vision
mode, the `◇ Boundary` button edits the vision bound instead (label flips to `◇ Vision boundary`;
same `drawBoundaryEditor` machinery, second target). Render only in vision: a dashed gold line
beyond the real boundary, the dreamed acquisition. Camera clamp in vision uses the union extents.
Export `map_scene.vision_bound`, schema, restore, undo. Stranded checks keep using the REAL bound.

## D5 · Promises kept (RSVP, claims, Maia walks the journeys)

**D5.1 RSVP is a promise you can take back.** `evRSVP` currently disables the button forever.
Make it a toggle: going → `✔ Going · tap to change`; tapping again withdraws (count decrements,
toast `RSVP withdrawn. The door stays open.`). Under every RSVP button, one disclosure line in
small print: `Going adds this to your calendar in your profile and signs you up for updates by
email. Tap again any time to change your answer.` Persist `EV_RSVP` in localStorage; export
`events.my_rsvps`; post `{type:'rsvp',id,title,on}` to the parent so the site can do the real
work. The side effects themselves (email, calendar, profile) are SITE-lane and admin-editable —
see §Site.

**D5.2 Claiming a quest is the same shape.** `claimQuest` gains the mirror: claimed state shows
`✔ Yours · tap to release` (unclaim toast: `Quest released. It stays open for other hands.`);
disclosure line: `Claiming adds this quest to your profile with how to begin, and signs you up
for updates. Release it any time.` Quests gain optional `how_to` (string; exported; Loom and
inspect can edit later) — when present, the post-claim card shows a **`Your first step`** block
with it. Persist claims (badge plan's ✓ overlay reads the same store); post
`{type:'claim',id,on}` to the parent.

**D5.3 Maia runs the journeys (Rye: "these journeys need to be run by Maia").** `playJourney`
already opens and closes in Maia's voice but narrates steps as bare toasts — move the whole walk
into her. Each stop speaks through the Maia card: step title + text, progress `${n} of ${total}`,
controls `▸ next` and `✕ end the walk` (tap next to skip the 1500 ms auto-advance; Esc still
ends). Her closing line keeps the site door. Journey step copy stays data (`st.t`; optional
`st.body` slot added for richer narration later) — Maia is the PRESENTER, the words remain
village content. This also makes journeys read identically to the Welcome Walk: one guide.

**D5.4 Wrap.** Bump `BUILD_VERSION='v0.8-roundD'` (export + grounds-ready). Extend
`qa/check-schema.js`: `vision_bound`, `vocabulary.phases`, `vocabulary.media`, skin
`label_style`/`flow_style`, `events.my_rsvps`, quest `how_to`/claims. Extend
`qa/verify_features.js` ~20 checks: min-zoom fit
+ corner-centering (cam center reaches a bound corner), ctrlKey wheel zoom (synthetic WheelEvent),
panel-aware centering, label offset shrunk + tablet class toggles with skin, activity seal counts
match *At() lists + high-contrast class present, ⌂ chip opens the sheet + route carries
`?structure=`, scaffold overlay present on every ph2 poi and absent on ph1/ph3, phase names in
radios and vocabulary roundtrip, a glyph sprite registered for every media entry + flow editor
options sourced from the vocabulary + the legacy `food` alias, vOvr new strings + hold/release
cycle, combobox lists + move
re-addresses + audit entry, duplicate clones structure + its quests/seats and undo removes all,
RSVP toggle + withdraw + postMessage spy, claim release + `Your first step` when `how_to` set,
journey Maia card + next/end controls, vision bound draw/export/restore, zero pageerrors. Rerun
doors + pocket + badges suites. Write the QA addendum beside the other QA docs, commit.

## Site lane (separate worktree, after or parallel — never blocks the map)

- `/api/events/rsvp` + `/api/quests/claim` receiving the bridge posts from the `/map` shell;
  profile gains **My calendar** (RSVPed events) and **My quests** (with `how_to` shown);
  email-updates opt-in wired to both.
- Admin (Make This Yours): a **Promises** panel — toggles for what RSVP/claim actually do
  (`rsvp_effects: {email, calendar, profile}`, same for claims) and the two disclosure strings,
  village-editable. Quest editor gains the `how_to` field.
- `/request-a-house` accepts `?structure=<key>` and preselects it.
- Skin schema: accept `label_style` and `flow_style` inside the skin object (two enums, no new
  endpoints); MapSkinPanel gains the two dials. Walk/config push unchanged.

## Order of work

D1 (one commit, small and mighty — Rye can retest the same day) → badges P1–P4 with §D2
amendments (their own commits; Rye blesses seal sketches after P1 per the badges plan) → D3 with
its two screenshot blessings → D4 → D5 + suites + version bump. Site lane rides parallel.

## Handoff — RYE only
| # | Task |
|---|---|
| 1 | After D1 deploys: real-phone pinch-out + edge-centering pass (the thing that annoyed you) |
| 2 | Bless: badge seal sketches (P1), scaffold sample, the flow-glyph sheet (all 9 at line size), ribbon vs tablet screenshot |
| 3 | Call the default label style per village Amora: ribbon stays unless the tablet wins you over |
| 4 | The amber approval round on the Loom — still the oldest open item on the board |
| 5 | /events route call (map door still rides Seasonal Festivals; repoint is one line) |
