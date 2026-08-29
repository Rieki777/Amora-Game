# Live QA — the Living Map on the deployed site

**Paste this whole file into the QA session.** Everything shipped: `origin/main` is at `a3915f4`
(map shell at `/map`, Make-This-Yours step 5 "Map & styling", gatherings module OFF, address-plane
migrations 0059/0060, the importer, and the committed artifact). Rye is deploying to Railway now.
This pass runs **in a real browser against `https://amora.regencivics.earth`** — the integration
seams that no local harness could touch. Your earlier Part B + addendum findings against the file
still stand; do not re-run that matrix here. Deliverable: `QA_REPORT_LIVE_<date>.md`, severity ·
surface · repro · expected vs actual, screenshots for anything visual, ending in a Handoff Breakdown.

## 0 · Deploy gate (first, before anything)

- Site boots at all — migrations 0059/0060 apply fail-loud at startup, so a boot failure IS the
  finding. Then `/map` renders the Living Map, not the "not installed" notice.
- **Artifact freshness fingerprint** (byte counts drifted across Windows line-ending handling, so
  test behavior, not size): in the iframe console, the boot `grounds-ready` message carries
  `version: 'v0.7-roundC'`, and `buildExportJSON().map_scene.address_source_vocabulary` exists.
  Both present = current artifact; either missing = a stale copy shipped — file it high.
- Zero `console.error` and zero pageerrors in BOTH frames (parent SPA and the map iframe),
  collected the whole session.
- One flag from the ship report to close out: the push bypassed the in-progress "verify" status
  check. Confirm the GitHub Actions run on `a3915f4` went green (Rye can open it if you can't).

## 1 · The bridge, live (the one thing never tested on a real origin)

Admin → Make This Yours → **Map & styling** (step 5): change accent, parchment, label size, map
scale, **painterly brush and palette** (these were the dead-dial fix — they must repaint the land),
dream mist, village pulse. Save. Expected: the embedded map at `/map` retints **without a reload**
(`grounds-ready` → shell pushes skin). Then reload `/map` — the saved skin must come back from
`GET /api/map/skin`. Try: rapid saves, a second tab open on `/map` while saving in the first,
skin while the module toggles.

## 2 · Doors and addresses on the real origin

- Dock ♥ → Exchange sheet → "Open /wallet on the site ↗" — **embedded means same-tab**: the SPA
  should navigate to `/wallet`; browser Back should return to `/map`. Record what actually happens
  to map state on return (v1 accepts a fresh boot; document it either way).
- Book a room → `/stay`, Reserve a home → `/housing`, Material Library → `/library`, Events door →
  `/seasonal-festivals` (still interim — `/events` pends Rye's confirmation; not a bug).
- Deep links cold from the address bar: `/map#/place/kitchen`, `#/loom`, `#/circles`,
  `#/journey/j1` — each should land inside the embedded map. Back/forward across them.
- `/map/circles` still serves the radial sociocratic page (concierge, contact relay) — it reads
  live data behind capability gates; check logged-out vs member views.

## 3 · The gatherings (Events) module, both states

- **OFF (shipped default):** `/api` surface 404s, no nav entry, admin tab states plainly the
  module is off. Nothing leaks.
- **ON (Rye flips the game variable):** admin tab creates a gathering; RSVP works and caps at
  capacity; a second RSVP is idempotent; **RSVPs must NOT appear on the Village Pulse or any
  anonymous surface** (the audience-default fix — personal attendance data). Turn it back OFF
  after unless Rye says keep it.

## 4 · Live-origin realities (record, don't guess)

- **Persistence is per-browser now**: founder edits autosave to localStorage on the real origin —
  reload `/map`, expect the restore offer. Verify a restore round-trip live, then check two
  browsers don't bleed into each other.
- **Weight**: the artifact is ~4.15 MB — record first-load and cached-load times for `/map`, and
  whether the static route sends cache headers. Slow-network throttle once.
- **Mobile**: open `/map` on a phone-sized viewport. The Living Map is desktop-first; record what
  a phone actually gets (the radial page's accordion was the mobile answer in the spec). Known
  limitation unless it's broken-broken.
- `GET /api/map/skin` is behind the map module gate — check the OFF behavior isn't a raw 500.

## 5 · Fifteen minutes of hostility

Same instincts as your file pass, now with a server: hash-spam navigation, double-clicking doors
during SPA route transitions, the skin save mid-`goto`, Loom drag → Save → immediate `/wallet`
navigation → Back, org-map ↔ living toggles while the iframe is still booting, and a full
zero-error sweep at the end.

## Report + Handoff Breakdown

End with: bugs (severity-ranked), what held, and the split — what a build session fixes
autonomously vs what needs Rye (GitHub Actions confirmation, `/events` route decision, module
ON/OFF flips, Railway logs if boot fails, and the amber approval round on the Loom, which is
still the oldest open item on the board).
