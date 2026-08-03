# Fixes to Make, 2026-08-02: the role model split

Continues from `FIXES_TO_MAKE_2026-08-01_ROLES_CIRCLES.md`, which made the org chart editable.
This one makes it real data.

Reference for the design decisions: `docs/PEERDOM_LESSONS.md`.

**Status: SHIPPED 2026-08-03**, live on production at `f652bf4`. The boot log is the evidence for the
migration rows:

```
[db]   DONE: 0049_org_roles.sql
[db]   DONE: 0050_season_patterns.sql
[db] applied 2 migration(s)
[ledger] invariants hold: conservation ≡ 0, no hypha rows, no non-faucet negatives
[MIGRATION] org chart as rows: 25 seat(s), 9 circle(s), 8 council(s) moved to forming, 12 documented holder(s)
```

Gates at that commit: `pnpm check` clean, `pnpm build` clean, `pnpm test` 27/27 files and 308/308 tests,
brand guard passed (63 legacy refs, baseline 63), voice guard clean across 257 files.

Two rows landed differently from the plan and say so in place: 14 and 16.

---

## 1. The finding

`roles` and "role" mean two unrelated things in this codebase, and the org chart people actually read
is a document with no history.

### 1.1 The `roles` table is a permission-group carrier

Ten columns, none of them sociocratic: `id, name, description, capabilities, min_stage, sort_order,
created_at, circle_id, seats, is_example`. Created by `drizzle/0002_roles_and_cycles.sql:7-16`, then
touched by exactly two later migrations: `0018_village_map.sql:62-64` added `circle_id` and `seats`,
`0046_standing_examples.sql:18` added `is_example`.

The four rows a village is born with are permission bundles:

```
founders-circle  capabilities: [proposal.open, proposal.decide, quest.consent, forum.moderate, quest.propose, forum.post]
steward-circle   capabilities: [quest.consent, quest.propose, forum.post]
treasury         capabilities: [...]
practitioners    capabilities: [...]
```
Source: `server/seeds/roles-seed.json`.

`roles.capabilities` is the only per-village source of `ctx.roleCapabilities` in the one gate
(`roleCapabilitiesFor`, `server/index.ts:1854-1862`, called from `capabilityCtx` at `:2003`). It is
load-bearing security state.

### 1.2 The sociocratic org chart is a JSON document

24 role cards carrying `aim`, `domain`, `accountabilities`, `group`, `status`, `holders`,
`whyItMatters`, in the `roles` key of the single `content` document in `app_config`
(`server/index.ts:645`, `contentRepo`). Written once by `runOnce("org-chart-2026-08",
applyOrgChartRefresh)` at `server/index.ts:1068`, served by the public unauthenticated
`GET /api/content/:section` at `:4058`, rendered by `client/src/pages/Roles.tsx`.

The two planes share a word and nothing else. Their id namespaces are disjoint:
`founders-circle / steward-circle / treasury / practitioners` against
`visionary-lead / development-lead / finance-lead / ...`.

Holders are name strings. All of them, across all 24 cards:
`"Jessica"`, `"Kyleen"`, `"Eric (web)"`, `"Rick (Sera / backend AI)"`, `"Christian"`, `"Via"`,
`"Ky (interim)"`. Three carry parentheticals that could never match a `users.name`.

**There is no code anywhere that reads those holder strings on the server.** Every `nameOf` helper in
the repo goes id to name, never the reverse (`server/index.ts:5386`, `:9709`, and siblings). The
editor is a plain textarea: `client/src/pages/Admin.tsx:913`,
`["holders", "Who holds it (one name per line, or leave empty for an open seat)", "lines"]`.

### 1.3 The map renders permission groups as org-chart seats

`GET /api/map` reads `loadRoles()` with no filter (`server/index.ts:5353` onward), and
`client/src/pages/VillageMap.tsx:174-177` places `circleId`-null roles on the village boundary ring.
Because `server/index.ts:1041` seeds every role row as `circleId: null, seats: 1`, a map-enabled fork
on default seeds shows four seats named "Founders Circle", "Steward Circle", "Treasury" and "Trained
Practitioners", two of which are named as circles, orbiting eight councils that no one holds.

The 5 circles the organisation actually runs on never appear on the map at all.

### 1.4 Five circle vocabularies

| # | Source | Contents |
|---|---|---|
| 1 | `circles` table, seeded from `server/seeds/circles-seed.json` | the 8 aspirational councils |
| 2 | content circle cards, `org-chart-2026-08.json` | 13 cards: the same 8 as `stage:"future"`, plus 5 real `stage:"today"` circles |
| 3 | `quests.circle` free text | 9 values, **already reconciled** through `circles.aliases` |
| 4 | `client/src/pages/Roles.tsx:52-67` `GROUP_SUBTITLES` | 7 hardcoded role-group names |
| 5 | `client/src/pages/Quests.tsx:91-103` | its own hardcoded copy of the same 9 quest strings |

Corrections to what was assumed before this was checked properly:

- The 8 council **ids are identical** across sources 1 and 2, byte for byte, with identical `name`
  values. The gap is the other direction: the 5 `stage:"today"` circles (`general-circle`,
  `outreach-growth-circle`, `community-circle`, `development-circle`, `finance-business-circle`) have
  no row in the `circles` table. Prose diverges on all 8 shared ids, since the table has `purpose` and
  the card has `description`.
- `quests.circle` is **not** drifted. `drizzle/0018_village_map.sql:10-12` introduced `circles.aliases`
  for exactly this, coverage is 9 of 9 today, resolution runs at `server/index.ts:5353`
  `circleIdForQuestName`, collisions are refused at `:5438-5449`, and
  `server/loop.e2e.test.ts:1221` and `:1248` assert it.
- The relational plane **does** derive vacancy (`server/index.ts:5403`,
  `vacant: held.length < Number(r.seats ?? 1)`), route notifications to holders (`:7587`, `:7816`,
  `:5772`, `:12897`), and track history (`role_holders.granted_at` / `granted_by`). The content plane
  can do none of it.
- Severity today is **latent, not live**. The map module ships OFF (`shared/modules.ts:118` carries no
  `core: true`; `server/lib/modules.ts:14`, absent `module_settings` row means off), and nothing at
  boot writes that row. `/api/circles`, `/api/map`, `/api/admin/circles`, `/api/admin/map` and
  `/api/assistant/coordinate` all 404 by default. The 8 seeded circle rows are unreachable. The only
  live circle surface on a default deployment is the public `/circles` page reading
  `/api/content/circles`.

Severity flips the day an admin enables the map.

### 1.5 The content document has drifted against itself

Role cards link to circles by the free-text `group` string. Three of the seven group values match no
circle card name:

| `group` value | role cards | matching circle card |
|---|---|---|
| "Leadership Circle" | 4 | none |
| "General Circle" | 3 | none, the card is "General Coordinating Circle" |
| "Advisory Bodies" | 3 | none |

That is 10 of 24 role cards pointing at a circle that does not exist in the same document. Both team
cards also carry `circle: "Leadership Circle"`.

The hand-typed `status` field already contradicts its own data: `land-steward` and
`social-media-steward` are `status: "filled"` with `holders: []`, which
`client/src/pages/Roles.tsx:146` renders as open.

### 1.6 Why this matters beyond tidiness

A role card with six accountabilities and no linked account is how invisible labour gets generated:
named work with unnamed doers, and no way to ask who is carrying too much. Terms, vacancy, succession,
grievance routing, contact relay, the founder-concentration read, and any published org export are all
blocked on the same missing column.

---

## 2. The decision

**Do not rename or split the `roles` table.** Its `capabilities` column feeds the one gate through 12+
read sites with no foreign keys anywhere in `drizzle/`, so a rename cannot be caught by the database
and every miss returns an empty list instead of an error. Two of those sites fail quiet: `/api/roles`
and `/api/map` would show every seat vacant.

Instead, add the object that was missing, and leave the security path untouched.

| Concept | Table | Answers |
|---|---|---|
| Permission group | `roles` (unchanged) | may this account press this button |
| Sociocratic role | `org_roles` (new) | what work exists, in which circle, with what aim and domain |
| Seat | `org_role_assignments` (new) | who holds it, with what focus, from when, until when |

`roles.circle_id` and `roles.seats` become unused once the map cuts over. Leave them in place; a
shipped migration is never edited, and dropping them earns nothing.

The bridge between the two planes (`org_roles.permission_group_id`, so holding the Treasury seat grants
the treasury bundle) is **deliberately out of scope for this document**. It touches the gate. It gets
its own change, its own tests, and its own review, after the org model has been live for a lunation.

### 2.1 Two design choices that carry their own weight

**Holders that are not accounts.** `org_role_assignments.holder_kind` is `member` or `documented`.
A `documented` holder carries a `display_name` and no `user_id`, which is how "Jessica" exists as a
real seat holder before she has an account, and how an external advisor or a historical holder stays
representable forever. Peerdom calls this access level "No-access" and it is the single feature whose
absence forced holders into a textarea in the first place.

The MySQL trap applies: unique indexes exempt NULLs, so a nullable `user_id` in a unique key admits
unlimited duplicate seatings. The uniqueness column is therefore a NOT NULL generated `holder_key`:
`user_id` for members, `doc:<slug(display_name)>` for documented holders.

**Migration by one tap, not by an admin project.** Nobody re-enters 24 cards. On next login, a member
whose name fuzzy-matches an unclaimed `documented` assignment sees one card: "Jessica Filkins holds
Visionary Lead. Is this you?" Yes converts the assignment to `holder_kind='member'` and writes a
`seat.claimed` event. No offers a member picker. The free-text name stays as the fallback, so nothing
breaks for people who will never have an account.

---

## 3. Fixes

### Phase 1: the model

| # | Fix | Detail | Status | Evidence |
|---|---|---|---|---|
| 1 | `drizzle/0048_org_roles.sql` | New file (highest today is `0047_example_market.sql`). Creates `org_roles` and `org_role_assignments`. `--` comments on their own lines, never ending in `;` (the 0015 trap, `server/db/migrate.ts` `splitStatements`). | SHIPPED | f652bf4 |
| 2 | `org_roles` columns | `id varchar(64) PK, circle_id varchar(64) NULL, name varchar(160) NOT NULL, aim text, domain text, accountabilities json, why_it_matters text, seats int NOT NULL DEFAULT 1, criticality enum('normal','high') DEFAULT 'normal', icon varchar(64), color varchar(32), sort_order int DEFAULT 0, status_override enum('open','filled','partial','forming') NULL, status_override_expires_at timestamp NULL, is_example tinyint DEFAULT 0, created_at, updated_at` | SHIPPED | f652bf4 |
| 3 | `org_role_assignments` columns | `id varchar(64) PK, org_role_id varchar(64) NOT NULL, holder_kind enum('member','documented') NOT NULL, user_id varchar(64) NULL, display_name varchar(160) NULL, holder_key varchar(200) NOT NULL, focus varchar(200), note varchar(280), started_at timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP, ended_at timestamp NULL, ended_reason varchar(160), granted_by varchar(64), UNIQUE KEY (org_role_id, holder_key), KEY (user_id), KEY (org_role_id, ended_at)` | SHIPPED | f652bf4 |
| 4 | Seat status is derived | Active assignments (`ended_at IS NULL`) against `seats`. `status_override` exists only as a time-boxed manual override that lapses back to derived. No permanent hand-typed status column, which is what already produced the two `filled` cards with empty holders. | SHIPPED | f652bf4 |
| 5 | The 5 real circles get rows | Insert `general-circle`, `outreach-growth-circle`, `community-circle`, `development-circle`, `finance-business-circle` into `circles` with `status='active'`. Set the 8 aspirational councils to `status='forming'` so they render greyed as a call, which is what `0018` designed that enum value for. | SHIPPED | f652bf4 |
| 6 | Backfill reads the LIVE document, not the seed | `runOnce("org-roles-backfill-2026-08", ...)` reads `app_config.content.roles/circles/team` when present and falls back to `server/seeds/org-chart-2026-08.json`. A village that already edited its cards keeps its edits. New id, never an edited body: `runOnce` is permanent per id and swallows failures (`server/index.ts:1498`). | SHIPPED | f652bf4 |
| 7 | Holder strings become `documented` assignments | `"Ky (interim)"` becomes `display_name: "Ky"`, `note: "interim"`. `"Eric (web)"` becomes `display_name: "Eric"`, `focus: "web"`. The parenthetical is the focus field Peerdom charges for. | SHIPPED | f652bf4 |
| 8 | Fix the 10 broken group links during backfill | `"Leadership Circle"` and `"General Circle"` both map to `general-circle`. `"Advisory Bodies"` gets a new `advisory-bodies` circle at `status='forming'`. **Rye confirms or overrides this mapping** (see R1). | SHIPPED | f652bf4 |
| 9 | ColumnSpec completeness | Both new repos list **every** column in their `dbCollection` spec. `store-db.ts:131-138` `replaceAll` is DELETE-all + re-INSERT and writes only specced columns, so an omitted column resets to DEFAULT on the next admin edit. This is the exact trap the `isExample` comment at `server/index.ts:625-629` documents. | SHIPPED | f652bf4 |
| 10 | A write lock on assignments | `withOrgAssignmentLock`, modelled on `withRoleHolderLock` (`server/index.ts:1838-1846`). The S12 caches are safe only under one process, and `circles` mutation today has **no** lock while doing the same read-modify-`replaceAll`. Do not repeat that. | SHIPPED | f652bf4 |

### Phase 2: the surfaces

| # | Fix | Detail | Status | Evidence |
|---|---|---|---|---|
| 11 | `GET /api/org` | Public, unauthenticated, structure only: circles, roles, aim, domain, accountabilities, seats, derived vacancy, holder counts. Names and avatars stay behind `map.viewPeople`, matching the tiering `/api/roles` already applies at `server/index.ts:12739-12768`. | SHIPPED | f652bf4 |
| 12 | Admin CRUD | `POST/PUT/DELETE /api/admin/org/roles`, `POST/DELETE /api/admin/org/roles/:id/assignments`. This is genuinely new surface: the `roles` table has **no** create, delete, or capability-edit route today (`server/seeds/examples-seed.json`: "Roles have no POST route"), and `PUT /api/admin/roles/:id` accepts only `circleId` and `seats`. | SHIPPED | f652bf4 |
| 13 | Pages read the new API | `client/src/pages/Roles.tsx`, `Circles.tsx`, `Team.tsx` read `/api/org`. Grouping comes from `circle_id`, not a free-text `group` string, which retires the `GROUP_SUBTITLES` hardcode at `Roles.tsx:52-67`. | SHIPPED | f652bf4 |
| 14 | Admin editor keeps its shape, writes rows | **Landed differently.** A new Admin, Org Chart tab edits the rows, and the old card editor carries a banner saying the public pages no longer read it. Converting the card editor in place would have meant a status dropdown over derived state, which is the drift this whole change removes. | SHIPPED, changed | `client/src/pages/Admin.tsx` OrgChartTab |
| 15 | The map reads `org_roles` | `/api/map` swaps `loadRoles()` for the org plane. Vacancy math is unchanged in shape. Circle-delete guard, concierge candidate set, contact-relay role name, and raise-hand all follow. | SHIPPED | f652bf4 |
| 16 | Seat claim on login | Shipped as a card on `/roles` rather than on login: that is the page which names you, and `Profile.tsx` was being edited by another session. The server re-checks the name match on claim, so an assignment id alone cannot take a seat. | SHIPPED | `client/src/components/SeatClaimCard.tsx` |
| 17 | Content sections retired, data left in place | Stop reading `content.roles/circles/team`. Do not delete them. Leave the `org-chart-2026-08` runOnce marker recorded so it can never re-apply over the new plane. | SHIPPED | f652bf4 |

### Phase 3: the defects found while grounding this

| # | Fix | Detail | Status | Evidence |
|---|---|---|---|---|
| 18 | `GET /api/roles` omits `circleId` and `seats` | Response at `server/index.ts:12751-12766` has neither, while `client/src/pages/Admin.tsx:3384` reads `(r as any).circleId`, so the role-to-circle dropdown always renders "unassigned". Moot for `org_roles`; fix or delete for `roles`. | SHIPPED | f652bf4 |
| 19 | `server/db/schema.ts` is a stale mirror | `roles` at `:233-243` is missing `circleId`, `seats`, `isExample`; there is no `mysqlTable("circles")` at all. Not a migration driver, so it breaks nothing, and it misleads anyone treating it as schema of record. | SHIPPED | f652bf4 |
| 20 | Admin quest form never binds `circle` | `client/src/pages/Admin.tsx:2609` declares `circle: ""` in state and no field is ever bound to it. `POST /api/admin/quests` spreads `req.body`, so every admin-created quest lands `circle: ""`, filtered out of every chip in `Quests.tsx` and `circleId` null on the map. `quests.circle` is settable only by seed or raw SQL today. | SHIPPED | f652bf4 |
| 21 | `defaultConfig: { circlesSource: "platform" }` is dead | `shared/modules.ts:136`. Repo-wide grep returns the declaration and no reader. Delete it or implement it. | SHIPPED | f652bf4 |
| 22 | Admin badge editor is missing 3 capabilities | `client/src/pages/Admin.tsx:4497-4500` hardcodes 12 of the 15 in `ALL_CAPABILITIES`; `exchange.swap`, `health.record` and `mechanics.propose` cannot be granted or denied from the UI. | SHIPPED | f652bf4 |
| 23 | Two docs cite files that do not exist | `docs/modules/health-dashboard.md:111` cites `server/lib/health-snapshots.ts`; `docs/GAME_MECHANICS_AUDIT_2026-07-31.md:397` cites `client/src/data/gameRoles.ts`. Neither exists in this repo. Do not plan against either. | SHIPPED | f652bf4 |
| 24 | `client/src/pages/Quests.tsx:91-103` hardcodes the 9 quest circles | Filter at `:149` compares raw strings and never touches the table, so the alias reconciliation that `0018` built is bypassed on the one page members actually use. | SHIPPED | f652bf4 |

### Shipped after this document was written

| Item | Why it was not in the original list |
|---|---|
| Season patterns, the roll, the retrospective (0050) | Rye specified the season model after this doc; `docs/COORDINATION_SUBSTRATE.md` carries the design |
| Badge `season_scope` and `multiplier` | Same conversation: a badge's powers may be permanent or seasonal |
| Terms and season lapsing, derived | The columns shipped with 0049 and nothing read them; `isLapsed` and the `expired` seat state close it |
| Concierge stopword filtering | Adding seats to the candidate set let long prose outscore a circle on function words |
| `commerce-reap` join fix | Found in a boot log while verifying this work; it had thrown hourly since it shipped |

### Explicitly out of scope

- **The permission bridge** (`org_roles.permission_group_id` feeding `roleCapabilitiesFor`). Touches
  the gate. Separate change.
- **Terms** (`term_ends_at`, expiring list, re-selection sweep). Wants the model to exist first. Next
  document.
- **A per-node change journal**, the org export, and the founder-concentration metric. All three want
  assignments to be rows. Next document.
- **Renaming `roles` to `permission_groups`.** Correct eventually. Not while it is the only thing
  standing between an account and `proposal.decide`.

---

## 4. Traps this change must not step in

Every one of these cost a real session in this repo or is written into `CLAUDE.md` as an invariant.

1. **Never edit a shipped `drizzle/*.sql`.** A part-applied file resumes at its recorded statement
   offset in `_migrations_partial` (`server/db/migrate.ts:97,112`). Reordering statements in such a
   file makes the resume skip the wrong DDL and the failure is silent. Fix forward, always.
2. **`--` comments on their own lines, never ending in `;`.** `splitStatements` strips full comment
   lines only. A tail comment ending in a semicolon cut migration 0015 in half.
3. **MySQL UNIQUE exempts NULLs.** Hence `holder_key NOT NULL`. A nullable column in a unique key
   admits unlimited duplicates, and here that means a member seated an unbounded number of times.
4. **`replaceAll` zeroes unspecced columns.** Every new column goes into the `dbCollection` ColumnSpec
   in the same change.
5. **`runOnce` is permanent per id and swallows errors.** A revised fixup needs a new id, never an
   edited body. A failure leaves only `[MIGRATION] <id> failed (continuing)` in the log.
6. **`apiPrefixes` in `shared/modules.ts` is dead documentation.** Nothing reads it at runtime. Every
   new route must be hand-mounted with `app.use(prefix, requireModule(id))`, including the
   `/api/admin/*` variants the registry never lists. An updated registry with no mount is an ungated
   endpoint.
7. **`notifications.dedupe_key` is globally unique, not per-user.** Any fan-out key must embed the
   recipient or the second recipient silently gets nothing.
8. **A new notification type missing from `emailCadenceFor`'s switch** falls through to
   `default: return "off"` and becomes in-app-only forever. It compiles, it inserts, nobody is emailed.
9. **Do not run `vitest -t`.** `server/loop.e2e.test.ts` threads nine mutable bindings through ~55
   ordered `it()` blocks. Run whole files. Run `pnpm build` first or you test stale code.
10. **A copy change can break a test by capitalization alone.** Assertions use `toContain` on phrases.
    Grep test files case-sensitively before editing any user-facing string.
11. **New files land in the brand guard's HARD-CLEAN zone by default.** `scripts/` is a ratchet zone,
    `server/lib/` is not, so a helper moved between them changes its enforcement class. No village name
    in any new `server/lib` file.
12. **The voice guard's `/\brather than\b/` fires on ordinary technical prose** in shipped strings, and
    it scans `docs/knowledge/*.md` end to end. The sanctioned escape is an inline `voice-ok: <reason>`,
    and waivers are counted and printed.
13. **Example rows are load-bearing inertia.** Every map mutation route carries an `isExample` refusal
    returning `EXAMPLE_REFUSAL_BODY`, and `onRealItemPublished` retirement fires from
    `POST /api/admin/circles` and `PUT /api/admin/roles/:id`. `EXAMPLE_TABLES['progression'] = ['roles']`
    (`server/lib/examples.ts:52`), the retirement path deletes by table name in raw SQL, and
    `wireExampleCaches` reloads by table name (`server/index.ts:3172`). Adding `org_roles` means
    updating all three plus `scripts/seed-examples.mjs`, or examples become mutable or undeletable.
    Retirement is a permanent tombstone (`0046:41-43`).
14. **The contact relay's caps are read outside the transaction that enforces them** (`:5561` read,
    `:5570` insert). Two concurrent sends both pass. Pre-existing; do not make it worse when the relay
    moves to `org_roles`.
15. **`VillageMap.tsx` SVG accessibility is annotated as previously broken.** `role="group"` at
    `:193`, plus `role`/`tabIndex`/`onKeyDown` on every circle and seat. No test catches a regression.

---

## 5. Verification required before any VERIFIED mark

All five gates, from the repo root:

```bash
pnpm check && pnpm build && pnpm test && node scripts/check-brand-refs.mjs && node scripts/check-voice.mjs
```

Plus, specific to this change:

1. **Boot the built `dist/index.js` against a scratch MySQL.** Confirm the log carries
   `[MIGRATION] applied 0048_org_roles` and `[MIGRATION] applied org-roles-backfill-2026-08`.
2. **Backfill count assertion.** 24 `org_roles` rows, 13 circles, 7 `documented` assignments, zero
   role rows whose `circle_id` matches no circle.
3. **Idempotency.** Boot twice. Row counts identical after the second boot.
4. **Edit preservation.** Write a custom role card through the old content API, then run the backfill,
   then confirm the custom card survived as an `org_roles` row.
5. **Capability gate untouched.** `shared/capabilities.test.ts` green, and a live check that a
   `steward-circle` holder still resolves `quest.consent` after the migration.
6. **Map with the module on.** Enable `map` in a scratch deployment and confirm the 5 real circles
   render with their real roles, and that no permission group appears as a seat.
7. **New tests.** `server/org.test.ts` for derived vacancy, the documented-holder unique key, and the
   status-override lapse. Extend `server/loop.e2e.test.ts` with the seat-claim round trip, appended at
   the end so ordering is preserved.
8. **`docs/FORK_RUNBOOK.md`** gains its line in the same session, per `CLAUDE.md`.

---

## Handoff Breakdown: Who Does What

### YOU (Rye): things only you can do

| # | Task | Why only you | Where |
|---|---|---|---|
| R1 | ~~Confirm the circle mapping~~ | ANSWERED from the source documents, not the default. Jessica's notes name the Leadership Circle explicitly, so it was restored rather than collapsed. | done |
| R2 | **Decide whether the 8 aspirational councils stay seeded.** They do not exist. The adoption read is that seeded aspirational structure teaches members the chart is fiction, which is the belief that stops anyone correcting the real parts. Options: keep as `forming`, or delete from the seed and let a village add its own. | Product call, and it changes what every future fork is born with | `server/seeds/circles-seed.json` |
| R3 | **Name the real holders, or confirm the 7 free-text names are complete.** The backfill turns them into documented assignments. Anyone missing stays missing. | Only you know who actually holds what right now | The 24 cards |
| R4 | Review, commit, push, approve the Railway deploy | Git and Railway access | `git add -A && git commit && git push` |
| R5 | After deploy: confirm the two `[MIGRATION] applied` lines in the boot log, then spot-check `/roles`, `/circles`, `/team` | Railway dashboard access | Railway logs, live site |
| R6 | Optional: local DB-backed test run with `TEST_DATABASE_URL` set, if you want the loop green before pushing | Railway DB is reachable only from your machine | `pnpm build && pnpm test` |

### CLAUDE CODE: can be done without you

| # | Task | Status |
|---|---|---|
| C1 | This document | DONE |
| C2 | Fixes 1 through 10 (migration, backfill, lock, ColumnSpec) | BLOCKED on R1 for the mapping in row 8; everything else can start |
| C3 | Fixes 11 through 17 (API, pages, admin editor, map cutover, seat claim) | DONE |
| C4 | Fixes 18 through 24 (the defects found while grounding) | DONE |
| C5 | Tests | DONE, and named differently: `shared/seasonResolution.test.ts`, `server/lib/seatLapse.test.ts`, `server/lib/conciergeScoring.test.ts`, plus the rewritten map section of `server/loop.e2e.test.ts` |
| C6 | Docs | ARCHITECTURE.md gained 3.15 and 3.16; FORK_RUNBOOK.md gained its seed and variable lines. `docs/modules/village-map.md` is NOT yet reconciled and still describes the pre-0049 map. |

### WAITING ON YOU before Claude Code can proceed

- **R1** gates the backfill mapping in fix 8. Everything else in Phase 1 can be written first.
- **R2** changes what a fresh fork is born with. It can land later without reworking anything.
- **R4** gates all of it going live.

C4 has no dependency on any of the above and is the safest thing to ship first.
