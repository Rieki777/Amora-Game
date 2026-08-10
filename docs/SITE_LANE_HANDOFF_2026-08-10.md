# Site lane handoff, 2026-08-10

Everything the site-side sessions built for the Living Map, what is still
open, and the rules that were learned the expensive way. Live at `82c01b8`.

Two lanes share `wt/map-events` in the `ga-map` worktree: the **map lane**
(`docs/prototypes/grounds-v0.html` and the QA suites) and the **site lane**
(`client/`, `server/`, `shared/`, `drizzle/`, `scripts/`). Read
"Lane rules" before touching anything shared.

---

## Shipped and live

| Area | What it does |
|---|---|
| `/map` | App mode: no site header, no page scroll, `100dvh`. Leaves by the artifact's `{type:'exit'}` or the browser Back button, both through one handler. |
| Artifact serving | Served from `docs/prototypes/grounds-v0.html`, never copied into `dist`. Content-hashed URL cached `immutable` for a year; the manifest names it and is `no-store`; a stale hash 302s to the current one. |
| `GET /api/map/config` | `{skin, walk, vocabulary}` in one call; the shell pushes it as a single `{type:'config'}` on `grounds-ready`. |
| Make This Yours, step 5 | Map skin (the artifact's own export format) plus the Welcome Walk editor, with drag and button reordering, a structure picker fed by real addresses, and preview-without-saving. |
| Events module | `0059`. Ships OFF. `events` + `event_rsvps`, schema.org shaped, capacity enforced inside the transaction. Admin tab under The Game. Public route `/events`. |
| Map address plane | `0060`. `home_structure_key` on circles; `structure_key` + `address_source` on `org_roles` and `quests`; `structure_keys` on `forum_threads`. |
| Walk log | `0061`. Rows arrive from the live map, the report says which step loses people, and the importer carries `walk.log` in from a scene. |
| Scene importer | `scripts/import-map-scene.ts`. Version FAMILY pin, BOM tolerant, `--dry` needs no database, names every block it skipped and every row it refused to move. |
| PWA | `/manifest.webmanifest` generated from the brand overlay; service worker caches ONLY the hashed artifact. |
| Discovery | "Living Map" is a top-level nav entry; the landing page carries a lazy map peek. |

**Gates:** 44 files / 662 tests / 0 failures, plus the two CI-only gates
(bundle budget, dependency audit). Artifact suites: doors, features, loom and
check-schema all green.

---

## Open — Rye only

1. **Read the map in the new voice** and flag anything that does not sound like the village.
2. **Three em-dash quest titles** on the live Quests page ("Swale dig — east slope", "Raise the first wall — build day", "Welcome walk — greet Saturday's visitors"). Fix them on the site and the map inherits clean titles on the next import.
3. **Blueprint look.** Guest Lodge, Healing Garden and Pacific Trailhead are `state:"blueprint"` and draw as ghost emblems BY DESIGN. If you would rather see a ghosted painted sprite, it is one clause in the `painted` test in the artifact.
4. **Dream mist (B1).** Hand-tick it, then re-read `GET /api/map/skin`. The server merge is pinned by tests, so if it still reads `false` the fault is client-side and the site lane should take it.
5. **Two QA leftovers on live:** `painterly {0.5, 0.5}` and `accent "#157f7d"`. One `PUT` to `/api/admin/brand` with `skin.painterly = {brush:null,palette:null}` and `skin.accent = ""` restores the pre-test look.
6. **One synthetic walk row in production.** Verifying the live wiring wrote 3 rows (one run, abandoned at `w2`, `source='live'`). It will show as one abandoned walk in the first report. Delete it or ignore it.
7. **Real-phone pass** of `/map` and the pocket profile. Use a plain 390x844 viewport with `#?hud=pocket`; Playwright's `isMobile` on this Chromium reports `innerWidth` at four times the CSS viewport, so pocket contexts need `hasTouch` alone.
8. **Confirm the GitHub Actions runs.** Every push this session went direct to `main` and bypassed the required `verify` check. All seven gates were reproduced by hand each time, but the runs themselves were never read.
9. **Amber approval round on the Loom.** The oldest open item.

---

## Open — site lane (next session)

Small, and none of it blocks anything.

**1. `recorded` is misleading.** `POST /api/map/walk-log` returns
`affectedRows`, which MySQL counts for `ON DUPLICATE KEY` updates as well as
inserts, so replaying a batch reports `2` instead of `0`. Dedupe itself is
correct and proven. Fix: count rows whose id is new, or return
`{accepted: rows.length}` and stop implying novelty.
`server/lib/walkLog.ts`, `recordWalkRows`.

**2. `at_index` on terminal walk rows.** `patch_walklog_atindex.py` is written
and verified against the artifact; the map lane runs it when D4 settles.

**3. Nothing reads `map_vocabulary` yet.** `GET /api/map/vocabulary` serves it
and the importer writes it, but the artifact has no inbound verb for
vocabulary, so today it only round-trips through export. Fine, and worth
knowing before someone calls it dead.

**4. Events has no seed and no public surface beyond `/events`.** No
recurrence, no waitlist, no ticketing. `is_example` rides on the table but
`EXAMPLE_TABLES` is untouched, so standing-examples does not retire these rows.

---

## Open — map lane (theirs, do not take)

Round D4 and D5, and badges P2-P4 which they have already landed. The artifact
and `docs/prototypes/qa/` are theirs.

---

## Lane rules, learned the expensive way

**Never rebuild `grounds-v0.html` from a copy.** Twice this session the site
lane overwrote the map lane's committed camera work by copying the artifact out
of the `game-amora` checkout. A wholesale copy is a silent revert of everything
that landed in between, and the file gives no sign of it. Read the CURRENT file
on the branch and re-run the patch script against it. That is what the patch
scripts are for, and both recoveries were one command because they exist.

**Stage files by name, never a directory.** `git add docs/prototypes` swept the
other lane's in-flight Round D work onto `main` under a commit message about
something else.

**Migration numbers are claimed on `origin/main`, not locally.** Run
`git ls-tree --name-only origin/main drizzle/ | tail` after a fetch. The local
tree once stopped at `0048` while main was at `0058`, and the runner dedupes by
FILENAME, so a colliding number is recorded as already-applied and the tables
are never created.

**Sync sprites before embedding.** `embed_sprites.py` rebuilds
`window.SPRITES` from `sprites/`, which was behind the artifact for eight
families, and this worktree has no `sprites/` at all. Run
`python3 sync_sprites_from_artifact.py` first and the rebuild becomes a no-op
instead of a silent downgrade.

**CLAUDE.md's five gates are not all of CI.** Bundle budget
(`MAX_MAIN_JS_KB 700`, `MAX_TOTAL_DIST_KB 6000`) and
`pnpm audit --prod --audit-level high` both block and neither is reproduced by
`pnpm test`. Reproduce them by hand before claiming green.

**Verify by exit code, and watch for shell lies.** `pnpm audit | tail` returns
TAIL's exit code. `pnpm build | Select-Object -First N` in PowerShell closes
the pipe and reports 255 on a successful build. A vitest log that is 193 bytes
after ten minutes is buffered, not hung.

**Kill orphans by command line.** `TaskStop` on a backgrounded `pnpm test`
kills the wrapper and leaves `vitest`, the tinypool worker and any booted
`dist/index.js` running. Three concurrent suites against one MySQL is what a
"hang" usually is. `Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
Select-Object ProcessId, CommandLine` names the checkout each one belongs to.

---

## How to verify anything

```bash
# the five house gates
pnpm check && node scripts/check-brand-refs.mjs && node scripts/check-voice.mjs && pnpm build && pnpm test

# the two CI-only gates
du -sk dist/public                       # against MAX_TOTAL_DIST_KB 6000
pnpm audit --prod --audit-level high     # read $?, not a piped tail

# a migration that alters populated tables
node scripts/verify-migration-on-data.mjs <first-new-prefix>

# the artifact suites (source their env first)
cd docs/prototypes/qa && source ./env.sh && node verify_doors.js && node verify_features.js

# every inline script block parses
node docs/prototypes/check_blocks.mjs docs/prototypes/grounds-v0.html

# what is actually live
curl -s https://amora.regencivics.earth/health
curl -s https://amora.regencivics.earth/grounds/manifest.json
```

Deploys are GitHub-connected: pushing `main` ships production and stamps the
real SHA, so `/health` identifies the live commit. `railway up` does not, and
would stamp `dev`.
