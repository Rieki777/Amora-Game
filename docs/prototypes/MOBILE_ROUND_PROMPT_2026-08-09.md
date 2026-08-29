# Mobile round — the village in your hand (v2, Rye-locked)

**The whole plan: research → architecture → the Walk as data → delight → phases → QA → handoff.**
Locked by Rye: mobile is the dominant experience; **no Loom drags on mobile**; **first visit
auto-runs the Welcome Walk** as the tutorial; **all walk language is village-editable data, never
hardcoded**; **entering the map is app-mode** (site chrome gone) with an explicit **exit** back to
the website. Doctrine unchanged: D9 lens-not-ledger, creator's word is law, one artifact — mobile
is a **layout profile**, never a fork.

## 1 · What the genre teaches (research digest)

From the mobile-game canon (Clash of Clans, Township, Sky, Pokémon GO, Monument Valley) and the
current UX literature: **the world is the screen; all UI is a guest.** Onboarding is learn-by-doing
inside the world within seconds — camera-led, one instruction at a time, gated on the player's own
touch, skippable after first completion. Navigation lives in the thumb zone: one bottom bar,
bottom sheets, top display-only. Progressive disclosure; 44 px targets; microfeedback (short
motion, haptic ticks, opt-in sound) is the feel. Retention through honest rhythms (the lunar
cycle), never streaks or dark patterns. Every session ends one tap from sharing a moment.

## 2 · Architecture — layout profile + app-mode

- **Profile at boot**: `HUD_PROFILE = touch+narrow ? 'pocket' : 'desk'` (test override
  `#?hud=pocket`). Same engine/scene/exports/addresses; only the HUD manifest differs.
- **App-mode enter/exit (both profiles, strongest on pocket):** navigating to `/map` fades the
  site shell away — no SPA header, no bottom nav; a short full-bleed arrival breath; the map IS
  the app. An **⏏ Exit** affordance (pocket: first item in the ☰ drawer + swipe-down-past-top
  strip; desk: small corner chip) posts `{type:'exit'}` → the shell restores the site nav and
  returns to the site (home, or the page they came from). Browser Back mirrors exit cleanly
  (history entry on enter). Door links that leave the map behave as exits too. PWA-installed
  launches are always app-mode.
- **Pocket chrome**: slim top strip (village name, 3 tappable vital glyphs, moon) + a **4-slot
  bottom bar**: 🏞/◎ toggle · **Ask Maia** (concierge = search) · ⚑ attention · ☰ drawer (module
  doors, Get Involved, Events, Journeys, skin view, replay the Walk, 🔊, 📷, ⏏ Exit). Dock,
  mapSel row, minimap die on pocket; pinch-out clamped to whole-land is the minimap.
- **Bottom sheets everywhere**: place panels, doors, events, Maia — peek 30 %, drag to full,
  swipe down to dismiss. Tap → camera flies the target to the upper third → sheet rises. Hash
  addresses unchanged; every sheet shareable.
- **Gesture layer**: one-finger pan with inertia, pinch about the midpoint, double-tap zoom-in,
  two-finger-tap zoom-out, long-press hover-card.
- **Mobile scope cuts (v1)**: Loom read-only (grouped by place, "rewire on desktop" note); build /
  draw / boundary / curation desktop-only; skin view-only.
- **Site shell**: implements app-mode (nav hide/restore on `/map`), PWA manifest + service worker.

## 3 · The Welcome Walk — VILLAGE DATA, not code

**The walk script is content a founder owns, exactly like identity and skin.** Amora's 8 beats
ship only as the **default seed**; every string is editable, every step re-orderable, addable,
deletable per village.

- **Data model** (site-side, `map_walk` document in `app_config` beside `skin` — or its own table
  when steps grow): ordered steps of
  `{id, structure_key, title, body, gesture_gate: pan|tap|pinch|toggle|none, cta?: {label, kind:
  quest|event|journey|route, ref}, lang:'en'}`. Multi-language ready (per-`lang` sets); blank
  keeps Amora's value as the suggestion — the Make-This-Yours pattern.
- **Admin UI**: a "Welcome Walk" panel in Make This Yours (same self-contained panel pattern as
  Map & styling): step list with drag-order, per-step structure picker (populated from the map's
  exported structure list), title/body editors, gesture-gate select, CTA picker, **"Preview on the
  map"** — pushes the draft over the bridge so the founder watches their own words on the land
  before saving.
- **Delivery**: consolidate to **one config push** — `GET /api/map/config` returns
  `{skin, walk, vocabulary}`; the shell pushes `{type:'config', ...}` on `grounds-ready` (bridge
  gains one handler; `{type:'skin'}` stays for compat). The artifact's built-in script is the
  fallback when no override exists — the map still works standalone.
- **Amora's seed** (the default every fork inherits, then rewrites in their own culture): Gate
  ("drag to look around"), Welcome Lodge (hearts are recognition, never wages — first tap, first
  sheet), Ponds (pinch), Greenhouse (quests + R-Ikigai), Village Heart (circles + ◎ toggle),
  Ridge (pool %, lots, the ✦ lantern), Sanctuary (Vision; everything traces to something true),
  Council Fire (**end in a choice**: claim a starter quest · RSVP tonight · begin a journey).
- Auto-start on first pocket visit; replay from the drawer; deep-linked arrivals skip it;
  completion remembered locally. **Walk-step completion is logged** (same instrument-now pattern
  as concierge queries) so founders see where newcomers drop off — onboarding's demand sensor.

## 4 · The delight layer

Costa Rica's real clock on the land (dawn/dusk grades, fireflies after dark, brighter council
fire); date-seeded Osa weather (brief afternoon rain, mist after — never blocks reading, skin
toggle); haptics (10 ms tick on select, triple-pulse on claim/RSVP, soft pulse per walk beat);
opt-in ambience (birds, rain, fire); pull-down-to-ask-Maia; **photo mode** (chrome fades, framed
share card, native share sheet); arrival moments (one true line on open — "✦ feast tonight", "the
cycle closes in 2 days" — never a queue); lunar rhythm, no streaks; optional first-visit veil that
lifts as the Walk progresses (founder maps always load clean); performance manners (DPR cap 2,
ambient halved when hidden/battery-saver, transform-only sheets); `prefers-reduced-motion`
respected (weather, pulses, walk camera eases become cuts); **resume where you left off** (camera
+ last surface per profile); post-walk add-to-home-screen offer.

## 5 · Phases

- **P1 Chrome triage + app-mode** — profile switch, bottom bar + drawer, sheets, minimap retired,
  shell nav hide/restore + ⏏ Exit contract. *Fixes the screenshot and lands the app feel.*
- **P2 Feel** — gestures with inertia, camera-first taps, haptics, 44 px audit, Loom read-only.
- **P3 The Walk as data** — schema + `/api/map/config` + bridge handler + admin editor with live
  preview + Amora seed + gesture gates + completion logging.
- **P4 Alive** — clock/weather/fireflies, ambience, photo mode, arrival moments, veil,
  reduced-motion, resume, PWA prompt.

Each phase: `verify_pocket.js` (profile boot, chrome absence, sheet lifecycle, synthetic gestures,
walk gates + custom-script override, exit contract, zero errors), real-phone pass via Rye's
Chrome, commit, artifact update.

## 6 · Handoff

**Map lane:** §2 in-artifact, §3 map side (fallback script, config handler, gates, logging), §4,
§5 suites. **Site lane:** app-mode shell + ⏏ restore, `/api/map/config`, walk storage + admin
editor panel with bridge preview, PWA manifest/SW, walk-completion table. **Rye:** bless the
4 bottom-bar slots; write (or bless) Amora's seed walk copy — it's the culture in your voice and
now it's just content; choose whether the veil ships on; real-phone pass per phase; and the amber
approval round on the desktop Loom — still the oldest open item on the board.

**Later, same pattern (noted, not this round):** Maia's canned lines, module blurbs and tooltips
join the walk in one per-village **voice pack** — the day a fork can re-language the whole land
without touching code.
