<!-- carried 2026-08-29, round 7 lane CARRY -->

> **Dated 2026-08-29. Closed record. Do not work from its handoff tables.**
> This is a live pass run 2026-08-08 against a build that has since moved on.
> It sat uncommitted for three weeks and is committed here as evidence of what
> was measured, along with the ten screenshots in `qa-evidence/` that two
> already-committed documents reference. Every bug and every suggested fix in
> it was checked against `origin/main` before this header was written, and all
> of them are closed:
>
> | Item | Where it landed |
> |---|---|
> | B1, Dream mist does not persist | `MapSkinPanel.tsx` rebuilt the toggle as a React row and `shared/mapSkin.ts` normalises `mist: s.mist === true` on the way through. The report flagged its own synthetic-event caveat, so the original reading was never safe either. |
> | B2 and F1, painterly sliders misrepresent the land | `shared/mapSkin.ts` now carries `RUNTIME_PAINTERLY = { brush: 1, palette: 0.3 }`, the exact 100/30 named here, and its comment records that a first save used to write the wrong value. `MapSkinPanel.tsx` holds a real "not set" state for both dials. |
> | B3, hash routes are additive | `routeHash` in `grounds-v0.html` now closes the Loom and leaves circles before opening a place, and `#/loom` leaves circles first. The routes are exclusive. |
> | B4, `#/place/nope` is a silent no-op | `openPanel` and `routeHash` both call `toast('That place is no longer on the map.')` and clear the hash. |
> | B5, `map_scene.version` reports a stale build string | `map_scene.version` reads `window.BUILD_VERSION`, the same source as the `grounds-ready` handshake. The artifact is at `v0.8-publish`. |
> | F2, no cache headers on the 4 MB artifact | The grounds route computes a sha256 of the file and caches it behind a stat key. |
>
> The "Handoff Breakdown" and "Still to run" sections below are the 2026-08-08
> picture. Nothing in them is a live task.

# QA REPORT LIVE — 2026-08-08

Live pass against **https://amora.regencivics.earth**, real Chrome (Windows), signed in as Rye.
Companion to the file-level Part B + addendum findings, which still stand and were not re-run here.

## Coverage — read this first

| § | Surface | Status |
|---|---|---|
| 0 | Deploy gate | **complete — PASS** |
| 1 | The bridge (admin → live map) | **complete** — 6 of 7 dials verified live, 2 findings |
| 2 | Doors + addresses | **partial** — deep links + hash routing done; module-door → SPA navigation and Back not done |
| 3 | Gatherings module | **OFF state complete — PASS**; ON state not exercised |
| 4 | Live-origin realities | **partial** — API gate, weight, cache, timings done; localStorage persistence, two-browser bleed, mobile not done |
| 5 | Fifteen minutes of hostility | **partial** — hash-spam and route-stacking done; the rest not done |

**Zero `pageerror` and zero `console.error` captured in both frames across everything exercised.** Collectors were installed in the parent and inside the `/grounds/index.html` iframe and left in place for the session.

Sections marked partial stopped for session length, not because anything blocked them. Nothing in what remains is gated on a fix.

---

## 0 · Deploy gate — PASS

- Site boots; migrations 0059/0060 did not fail-loud. `/map` renders the Living Map, no "not installed" notice.
- **Artifact is current, not stale.** Both fingerprints present:
  - boot handshake: `{"type":"grounds-ready","version":"v0.7-roundC"}` at **516 ms** after iframe attach
  - `buildExportJSON().map_scene.address_source_vocabulary` exists, carrying the full law text (`creator`, `resolver-guess`, `creator-board`, `pool` + "creator and creator-board are the creator's word — never overwritten by a guess")
- Export ships **17 top-level blocks**, matching the local build.
- `/grounds/manifest.json` → `{"present":true,"bytes":4151630}`.
- Round C Part A confirmed **live**: `iconMode = "painted"`, heading reads `Get Involved — find somewhere to help`, all **7** dock glyphs render as SVG (wallet · stay · housing · library · journeys · events · admin), `"In the live platform"` returns `indexOf === -1`, `GSCALE` present and defaulting to 1.

**Open for Rye:** the GitHub Actions run on `a3915f4` — the push bypassed the in-progress "verify" check. I cannot see CI from the browser; please confirm it went green.

---

## Bugs

**B1 [med] admin · Dream mist does not persist**
repro: Admin → Make This Yours → Map & styling → tick **Dream mist** → Save map style → `GET /api/map/skin`.
expected: `mist: true`.
actual: `mist: false`. Every other dial in the same save round-tripped correctly — accent `#c0392b`, `global_scale 1.6`, `label_scale 1.2`, `painterly.brush 0.2`, `painterly.palette 0.8`. Mist alone is dropped between the form and the API.
console: none.
*Caveat worth 30 seconds of your time:* I set the checkbox with a native setter plus `input`/`change` events. React sometimes ignores synthetic events on checkboxes, so the DOM read `true` while React's state may have stayed `false`. **Please tick it by hand once and re-check the API before filing this against the build.** Everything else in this report was verified through paths that don't have that ambiguity.

**B2 [med] admin · opening step 5 and saving silently changes the painterly look**
repro: fresh state `GET /api/map/skin` → `painterly: {brush: null, palette: null}`. The map's own runtime defaults are `brush 100`, `palette 30`. The admin sliders render at **50 / 50**. Save step 5 without touching the sliders.
expected: a no-op save leaves the land looking the same.
actual: the API now stores `painterly: {brush: 0.5, palette: 0.5}` and the map repaints to 50/50 — a visibly different plate from both the unset state and the map's defaults. Three sources disagree: API `null`, admin UI `50`, map runtime `100/30`.
note: this is how my own restore left the site — see *State I changed* below.

**B3 [med] routing · hash routes are additive, they never close the previous surface**
repro (single tab, no reload): `#/place/kitchen` → `#/loom` → `#/circles` → `#/journey/j1`.
expected: each route owns the screen; entering Circles closes the Loom; a journey walks the land.
actual:
- at `#/circles`: `body.circles = true` **and `body.loom` still true** — the Loom stays mounted over the org map, with the Kitchen panel still open beneath it
- at `#/journey/j1`: the walk starts correctly (`➹ 1/8 — Welcome to Amora → The Gate`) but `body.circles` is **still true** — the journey walks the land while the Circles map is displayed
console: none. This is the "toggling with the Loom open" case from §1 of the brief, reachable by plain address-bar navigation.

**B4 [low] routing · `#/place/nope` is a silent no-op**
repro: `#/place/nope` from the address bar or by hash change.
expected: an honest miss — the codebase already has `toast('That place is no longer on the map.')` for an unknown key.
actual: nothing. No toast, no panel, no error, and the bad hash stays in the address bar as a bookmarkable dead address.

**B5 [low] export · `map_scene.version` reports a stale build string**
repro: `buildExportJSON().map_scene.version`.
expected: something matching the shipped build.
actual: `"v0.6-buildmode"`, while the boot handshake correctly reports `v0.7-roundC`. Every scene exported from this build mislabels itself in the seed that goes to production.

---

## Fixes suggested (not bugs)

**F1** Make the step-5 painterly sliders read their initial value from the map's actual state (or have `/api/map/skin` return the runtime defaults instead of `null`), so the admin form can't misrepresent the land before you touch it. This is the root of B2.

**F2** `/grounds/index.html` is served `cache-control: public, max-age=0` with no ETag. It works — the warm load revalidated and cost **~0 KB on the wire at 338 ms** against **4055 KB decoded** — so caching is functioning via `Last-Modified`. But a 4 MB artifact revalidating on every single navigation is a round-trip you could simply not spend: a real `max-age` plus a content-hashed filename would make repeat loads free.

---

## Verified clean

- **Deploy gate** — boot, `/map` render, both freshness fingerprints, 17 export blocks, manifest.
- **The bridge, live and cross-tab.** With `/map` open in a second tab and Save pressed in the admin tab, the map **retinted with no reload**: accent → `#c0392b`, `GSCALE` → 1.6, brush → 20, palette → 80. Icons visibly larger at 160% (screenshot). This is the dead-dial fix working on a real origin, and it propagates *across tabs*, which is stronger than the spec asked for.
- **Skin persistence.** `GET /api/map/skin` returned exactly what was saved, and returned the restored values after I put them back.
- **Gatherings module OFF** — `/api/events` → **404** `{"error":"module_disabled","module":"events"}`. Explicit, no leak. Unknown endpoints → `{"error":"No such endpoint: ..."}`. `/api/map/skin` behind its gate returns a clean **200**, not a raw 500.
- **Cold deep link** `#/place/kitchen` — intro skipped, Kitchen panel open with the correct header, first try.
- `#/loom` opens the Loom with the provenance toast. `#/journey/j1` starts the walk with correct step text.
- **Weight** — artifact 4055 KB decoded → **2919 KB encoded** over **HTTP/3**; first paint of the map iframe 465–704 ms; warm navigation `domContentLoaded` **473 ms**, `load` **500 ms**.
- **Zero errors** in both frames throughout.

---

## State I changed on your live site

Disclosed in full so nothing surprises you:

- **Restored:** accent `#157f7d`, map scale 100, label size 100, Dream mist off — all confirmed back via `GET /api/map/skin`.
- **Not restorable through the UI:** `painterly.brush` and `painterly.palette` were `null` (never set) before this pass. My restore returned them to the admin default **0.5 / 0.5**, because the form has no "unset" for those two sliders. Per **B2** the map's own defaults are 100/30, so the painted plate may look slightly different from before I started. If you want the original `null` state back it needs a direct API/DB nudge, not the form.
- One test tab opened on `/map` and closed. No content created, no modules toggled, no founder edits made.

---

## Handoff Breakdown

### YOU (Rye) — only you

| # | Task | Why |
|---|---|---|
| 1 | Confirm the GitHub Actions run on `a3915f4` went green | The push bypassed the in-progress "verify" check; CI isn't visible from the browser |
| 2 | Hand-tick Dream mist once and re-check `/api/map/skin` | Settles the B1 caveat before a build session chases it |
| 3 | Decide the `/events` route | Still riding `/seasonal-festivals`; not a bug until you say so |
| 4 | Flip the gatherings module ON when you want §3 finished | Module ON/OFF is a game-variable change on the live site |
| 5 | Restore `painterly` to `null` if you want the pre-test plate exactly | Needs API/DB, not the admin form |
| 6 | The amber approval round on the Loom | Oldest open item on the board |

### BUILD SESSION — autonomously

| # | Task | Status |
|---|---|---|
| 1 | B3 — make hash routes exclusive: entering one surface closes the others | HUMAN STEP REQUIRED |
| 2 | B4 — honest miss for unknown `#/place/<key>` | HUMAN STEP REQUIRED |
| 3 | B5 — bump `map_scene.version` to the shipped build, and consider sourcing it from the same constant as `grounds-ready` | HUMAN STEP REQUIRED |
| 4 | B1 — mist persistence, once Rye confirms | BLOCKED on #2 above |
| 5 | B2 / F1 — painterly slider initial state | HUMAN STEP REQUIRED |
| 6 | F2 — cache headers + content-hashed artifact filename | HUMAN STEP REQUIRED |

### Still to run (not blocked, just not reached)

§2 module-door → SPA same-tab navigation and Back behaviour · §3 module ON path · §4 localStorage persistence round-trip, two-browser isolation, mobile viewport · §5 the remaining hostility set (double-click during route transitions, skin save mid-`goto`, Loom drag → Save → navigate → Back).
