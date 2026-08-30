# Site-side round 2 — finish the job (continue in `wt/map-events`, worktree `C:\Users\taren\Desktop\Amora\ga-map`)

**Paste this into the same Claude Code session that built round 1.** Your base call (worktree off
`origin/main`, migration 0059, `gatherings` code name, additive-only) was right — keep all of it.
Same guardrail: **never touch `docs/prototypes/**`** (map + QA sessions own it), and Rye does the push.

## What changed on the map side since your report — read before coding

The map session applied your findings and shipped a new prototype commit
(`docs/prototypes/grounds-v0.html`, now ~4.15 MB):

1. **The painterly dead-dial is fixed.** `applySkinExport()` now reads `painterly.brush` and
   `painterly.palette` and drives the repaint live. **Remove the "stored faithfully but inert"
   caveat from MapSkinPanel** — those two dials are real now.
2. **The map listens to the shell.** New embed bridge in the artifact:
   - parent → map: `postMessage({type:'skin', skin})` applies a `brand.skin`-shaped object live;
     `postMessage({type:'goto', hash:'#/place/kitchen'})` routes the land.
   - map → parent: `postMessage({type:'grounds-ready', version})` once on boot (use it as the
     signal to send skin); door clicks still navigate via the `{type:'nav'}` shim you built.
   - Same-origin only (the artifact ignores cross-origin messages), which your `/grounds/` static
     serving already satisfies.
3. **Export is a 16-block contract** now validated by the prototype's own `qa/check-schema.js`:
   the blocks your importer knows plus `events`, `stays_occupancy`, `concierge_queries`,
   `vital_overrides`, and `map_scene.vocabulary`. `concierge_queries` rows are shaped exactly like
   the `concierge_queries` table in `docs/modules/village-map.md` — free demand-sensor data.
4. **Re-stage the artifact**: your `client/public/grounds/` copy predates these commits. Rebuild so
   `scripts/copy-grounds.mjs` picks up the current file, and re-run your manifest probe.

## Tasks, in order

### T1 — Wire skin end-to-end (small, do first)
In `LivingMap.tsx`: on the iframe's `grounds-ready` message, fetch `GET /api/map/skin` and
`postMessage({type:'skin', skin})` into the frame; re-send after a skin save (listen to whatever
event/refetch pattern MapSkinPanel uses). Acceptance: change accent in the wizard → the embedded
map retints without a reload. Update MapSkinPanel copy per the painterly fix above.

### T2 — Land the run you left in flight
Report the clean single-run test result from round 1 (you rebuilt the bundle after edits — one
clean cycle, streaming output, and check for orphaned `dist/index.js` listeners after). Nothing
merges on a suite nobody watched finish.

### T3 — The address-plane migration (your #1 follow-up — now authorized)
Next free migration number **re-checked against `origin/main` at that moment** (parallel sessions
push; 0059 was yours, do not assume 0060 is free). Additive columns only:

| table | add |
|---|---|
| `circles` | `home_structure_key varchar(64) NULL` |
| `org_roles` (roles) | `structure_key varchar(64) NULL`, `address_source varchar(24) NULL` |
| `quests` | `structure_key varchar(64) NULL`, `address_source varchar(24) NULL` |
| `forum_threads` | `structure_keys json NULL`, `address_source varchar(24) NULL` |

`address_source` vocabulary (must match the map exactly): `creator` · `resolver-guess` ·
`creator-board` (an explicit "lives at the Board" — address NULL is *not* the same as unaddressed).
Doctrine, enforced in code not convention: **a `creator` or `creator-board` row is never
overwritten by a guess** — importer and any future resolver may only fill NULLs or replace
`resolver-guess`. Vocabulary gets a home the same way skin did: a `map_vocabulary` document in
`app_config` (you already know it's `config_key`, not `key`).

### T4 — Finish the importer
With T3 landed, extend `import-map-scene` to the full contract: circles `home_structure_key`,
quests + org_roles addressing (match rows by title/role name; report unmatched, never create),
forum_threads `structure_keys`, `map_scene.vocabulary` → `map_vocabulary`, and (stretch)
`concierge_queries` into the village-map table if you stand it up. Keep `--dry` DB-free, keep the
BOM handling, keep named-skip reporting for anything absent.

### T5 — Gatherings admin tab + route confirmation
The module is API-only. Add the admin surface (your six-tab structure from `origin/main` — follow
`f502e38`'s pattern): create/edit gatherings, RSVP list, capacity flag. Public route: propose
**`/events`** in nav (contributed only when the module is ON) and tell Rye — the map's Events door
rides `/seasonal-festivals` and the **map session repoints it in one line** on his confirmation;
don't repoint anything yourself.

### T6 — Merge prep
Rebase `wt/map-events` on current `origin/main`, re-run every gate (`check`, `brand` ratchet,
`voice`, `build`, tests), write the PR description with the migration list and the module-OFF
default stated plainly, and hand Rye the exact merge/push commands. Flag any file where
`origin/main` moved under you since round 1 — the Admin restructure workstream is active.

## Context that saves you a wrong turn

- The map's occupancy (`stays_occupancy` in exports) is sample data by design — the Stays module
  feeds it later; nothing for you to build there this round.
- The map session, not you, owns: repointing the Events door, the tooltip copy pass (blocked on
  Rye's language rules), and everything in `docs/prototypes/**`.
- The QA session is attacking the prototype in parallel; if it files site-relevant findings
  (e.g. `/api/map/skin` shape), they'll arrive through Rye, not by editing your tree.
- Your step-5 placement stands (Rye approved "before Go live").

## Handoff Breakdown

### RYE — only you
| # | Task | Why |
|---|---|---|
| 1 | Confirm `/events` as the public route | product call — unblocks T5 nav + the map's one-line repoint |
| 2 | Bless the address-plane migration before it runs on Railway | schema change on four live tables |
| 3 | Merge + push `wt/map-events`; deploy | credentials, index.lock, Railway |
| 4 | Browser-verify `/map` + wizard skin → live retint on the deployed site | needs the real origin |

### THIS SESSION — autonomously
T1 → T6 in order, gates green at each step, single-run tests you actually watch finish,
orphan-process sweep after any killed run, zero edits outside the worktree.
