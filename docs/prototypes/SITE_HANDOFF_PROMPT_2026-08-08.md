# Site-side handoff — mount the Living Map, add the Make-This-Yours map step, found the Events module

**Paste this whole file as the opening prompt of a Claude Code session in `game-amora/`.**
This runs in parallel with a map build session and a QA session. **Guardrail: do not modify
`docs/prototypes/grounds-v0.html` or anything under `docs/prototypes/qa/`** — another session owns them.
You work in `client/`, `server/`, `shared/`, `drizzle/`, `docs/modules/`.

## Context

The Living Map prototype (`docs/prototypes/grounds-v0.html`, self-contained ~4 MB) is the geographic
map of Amora: painted solarpunk-elven buildings over cleaned satellite, module doors, journeys that walk,
a Loom of connections, a Circles org view, computed vitals, events, occupancy, a concierge. It already
speaks this site's language: every door deep-links to `https://amora.regencivics.earth` routes
(`/wallet`, `/stay`, `/housing`, `/library`, `/forum`, `/quests`, `/village-health`, `/admin?tab=setup`,
`/seasonal-festivals` interim for events), and every place/module/journey has a hash address
(`#/place/<key>`, `#/module/<key>`, `#/journey/<id>`, `#/loom`, `#/circles`). Its export is a 15-block
JSON matching the §5.2 tables (structures, zones, flows, edits, journeys, forum_threads, events,
stays_occupancy, concierge_queries, vital_overrides, vocabulary, skin…).

Decisions already made by Rye (do not re-litigate): the map defaults to the **Living Map** with a
selector to the **Circles** radial view; door links navigate **same-tab when embedded** (the map is the
primary surface; back returns to the land); the **Make This Yours wizard shows every dial** because
founders need realtime map feedback; **Events becomes its own module** and is the foundation other
surfaces read.

## Task 1 — Mount the map at `/map` (VillageMap.tsx)

- Copy the prototype to a served static asset (e.g. `client/public/grounds/index.html`) at build time —
  do NOT fork its source; treat it as an artifact the map session ships. Add a `scripts/` copy step or
  vite `publicDir` inclusion so updates flow.
- `pages/VillageMap.tsx` becomes a thin shell: full-viewport iframe of the grounds artifact, with the
  existing radial/sociocratic concept reachable later — the map's own top-left selector already offers
  Living | Circles, so the shell needs no second selector.
- Bridge: pass site context in via the iframe URL hash (e.g. `/map#/place/greenhouse`); accept
  `postMessage({type:'nav', route})` from the iframe so door clicks can navigate the SPA same-tab
  (the map already tries `window.top.location` when embedded — intercepting via postMessage is the
  cleaner v2; either works day one).
- Respect `map.enabled` gating per `docs/modules/village-map.md` conventions (nav entry contributed
  only when on).

## Task 2 — Make This Yours, step 6: "Map & styling"

Add a sixth step to the Admin setup wizard (`/admin?tab=setup`), same pattern as steps 1–5
(blank keeps Amora's value; Save; Done checkbox). Fields — these mirror `art_manifest.skin` exactly:

| field | type | maps to |
|---|---|---|
| Land theme | select: Emerald Atlas / Terra Sol / Mar Azul | `skin.theme` |
| Your land, in words | text (grows a theme deterministically) | `skin.words` |
| Accent | color | `skin.accent` |
| Parchment | color | `skin.parchment` |
| Label size | range 80–130% | `skin.label_scale` |
| Map scale | range 50–300% | `skin.global_scale` |
| Icon style | select auto/painted/iso (painted default) | `skin.icon_mode` |
| Paint brush / palette | ranges 0–100 | `skin.painterly.brush/.palette` |
| Dream mist | toggle, default off | `skin.mist` |
| Village pulse | toggle, default on | `skin.glow` |

Store in the village config/game-variables surface (follow the existing config-not-platform-files rule);
serve to the map iframe via a query/hash param or a small `GET /api/map/skin`. The map applies the same
object through its `applySkinExport()`.

## Task 3 — Found the Events module

Rye's call: **events are their own module** and the foundation other surfaces (map lanterns, Feed,
Visit) read. Approach: **build native** following `docs/modules/module-framework.md` conventions
(tables + JSON-seed twins, game variables, ships OFF, contributes nav/route only when on) rather than
embedding a foreign app — but **steal the data model** from the good open-source bases. Evaluate and
crib from (verify current state; do not adopt wholesale without checking license fit — most are AGPL):
- **Gancio** (Node/Vue, ActivityPub events — closest in spirit, lightweight model)
- **Mobilizon** (Elixir — the richest federated event model; schema inspiration only)
- **Hi.Events** (Laravel/React — ticketing-grade RSVP model if stays/payments ever meet events)
- plus plain **schema.org/Event** compliance so events are indexable and portable.

Minimum v1 tables: `events` (id, title, description, starts_at, ends_at, location_text,
structure_keys json — the map's multi-address, visit_type_id nullable, capacity nullable, status),
`event_rsvps` (event_id, user_id, status, idempotency key). Endpoints: list/upcoming, RSVP
(capability-gated), admin CRUD. Route: `/events` (keep `/seasonal-festivals` as content; the map's
Events door currently points there and will be repointed on your signal). The map reads
`days_until` to brighten its lanterns — expose it or `starts_at` and let the map compute.

## Task 4 — Seed importer (stretch)

`scripts/import-map-scene.ts`: reads an exported `amora-scene.json` and upserts JSON-seed twins for
circles (with `home_structure_key`), quests/org-roles `structure_key` + `address_source`
(creator's word is law — never overwrite a `creator` row with a guess), forum thread
`structure_keys`, events, vocabulary. Idempotent; dry-run flag; refuses on schema-version mismatch.

## Route inventory (A6) — current truth

Works on the live site: `/wallet /stay /housing /library /forum /forum/:id /quests /propose-quest
/roles /circles /tools /village-health /gratitude /feed /badges /team /network /profile /visit
/first-walk /resident /steward /investor /prosperity /seasonal-festivals /admin /map`.
**Do not use** (they don't exist): `/stays /health /products /exchange` — the exchange lives in
`/wallet`, health is `/village-health`. **Needs Rye:** final `/events` route + which legacy in-map
door labels (e.g. "Crowdpool/products") map to which real routes.

## Handoff Breakdown

### YOU (Rye) — only you
| # | Task | Why |
|---|---|---|
| 1 | Confirm `/events` as the module route | product call |
| 2 | Map legacy door labels → real routes | product call (list above) |
| 3 | Commit + push + Railway deploy | credentials, index.lock |
| 4 | Verify `/map` iframe on the live site in a browser | needs the real origin |

### THIS SESSION — autonomously
Tasks 1, 2, 3 (v1), 4 (if time) with tests per repo conventions; follow CLAUDE.md house rules;
zero console errors; do not touch `docs/prototypes/**`.
