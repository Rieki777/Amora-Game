# Fixes to Make, 2026-08-03: what the village already publishes

Found while building the OKF-style export (`server/lib/villageExport.ts`) by a
five-agent recon pass over the publishing surface, then verified by hand
against the code and, where marked, against the live production deployment.

Everything here is **pre-existing**. None of it was introduced by the export.
Four defects the same pass found IN the export were fixed before it shipped and
are recorded in `docs/ARCHITECTURE.md` §3.17.

The one that was closed with the export, because leaving it open would have
made the export's own promise hollow:

- **`/api/content/:section` published holder names to anyone.** Unauthenticated,
  no module gate, and the `roles` section is the card-shaped org chart that 0049
  replaced. Its cards kept `holders` and `holderNote`, so it answered anonymous
  callers with "Via", "Jessica", "Ky (interim)" and "Away and inactive."
  Verified live on production 2026-08-03. FIXED: the two person-shaped fields
  are stripped for non-admins.

---

## 1. Privacy

### 1.1 A deleted member keeps their seat

`anonymizeMember` (`server/index.ts`) ends **permission-plane** holdings
(`roleHoldersRepo.replaceAll`) and rewrites users, gratitude, quest claims,
notifications, skill tags, concierge queries and contact requests. It contains
**zero references to `org_role_assignments`** (verified by grep over the
function body).

So a member who exercised deletion still holds their org seat, under their real
`user_id`, and `/api/org` republishes their name to anyone with `map.viewPeople`
(which any self-registered account holds: its stage floor is `guest`, whose rule
is `{type: "account"}`).

A **documented** holder is worse: `display_name` is a real person's name, often
somebody with no account at all, and nothing in the codebase ever scrubs it.

The public export cannot leak either, because it carries no names. That is not a
fix, it is a different door.

**Fix:** end live `org_role_assignments` for the target in `anonymizeMember`, the
same way permission holdings are ended, and add the case to the exit test.

### 1.2 `/api/network` crosses the anonymous line with a real name

`app.get("/api/network")` runs `SELECT s.*, u.name AS author_name FROM
shared_items s LEFT JOIN users u ON u.id = s.created_by`. `SELECT *` plus a
name join is the one place a full legal name and a stable user id reach an
anonymous caller together. `/api/network/published` (the outbound federation
one) correctly lists its columns and omits `created_by`; this is its
inward-facing twin and does not.

**Fix:** name the columns, and tier `author_name` the way every other people
surface is tiered.

### 1.3 `regenEntries` hands out user ids anonymously

`server/lib/health.ts` `regenEntries` runs `SELECT * FROM regen_entries` and
maps `recordedBy: String(r.recorded_by)`, a stable user id, onto a payload the
health dashboard serves unauthenticated.

**Fix:** drop `recordedBy` from the public read, or resolve it to a first name
behind the same tier the rest of the dashboard uses.

---

## 2. Correctness

### 2.1 A real member can claim an EXAMPLE seating

`unclaimedSeatingsFor` and `claimSeating` (`server/lib/orgChart.ts`) do not
filter `is_example` (verified: zero occurrences in either function). The
`progression` module is CORE, so every fresh fork boots with example seats and
documented example holders already in the org tables. A member whose name
fuzzy-matches one of those seeded holders can claim it and become a member
holder of a demo seat.

**Fix:** `AND is_example = 0` in both. The refusal body `EXAMPLE_REFUSAL_BODY`
already exists for this shape of case.

### 2.2 The 0049 migration header is now false

`drizzle/0049_org_roles.sql` says: *"Neither new table is registered with the
standing-examples machinery... EXAMPLE_TABLES is untouched."* Since then
`server/lib/examples.ts:55` reads
`progression: ["org_role_assignments", "org_roles", "roles"]`, and
`examples.ts:474-491` seeds both tables with `is_example: 1`.

**Do not edit the migration** (a part-applied file resumes at its recorded
offset). The correction belongs in `docs/ARCHITECTURE.md`, which is the
as-built map, and this line is that correction.

### 2.3 The peer sync job and its publish endpoint disagree

`/api/network/published` floors at `>= LIFECYCLE_RANK.members` with a comment
explaining that `preview` is a founder still deciding. The `network-sync` job is
gated on `!== "off"`. So a village that previewed the network module does not
publish, but does go out and fetch from peers.

(The same `!== "off"` bug in the new discovery document's `policy.acceptsPeers`
was caught and fixed before it shipped.)

### 2.4 `peer_instances` reports the wrong collision

`peer_instances` carries two unique keys and `addPeer` maps every
`ER_DUP_ENTRY` to "already peered with that village". A URL collision with a
**different** village reports the same message, so the operator debugs the wrong
thing.

---

## 3. Dead weight

- **Six `org_roles` columns are write-only.** `authority`,
  `first_year_outcomes`, `first_90_day_outcomes`, `location_expectations`,
  `compensation_reality`, `evidence_required` are created by 0049 and written by
  `WRITABLE` in `orgChart.ts`, but `ROLE_COLS` (the only SELECT of that table)
  omits every one. Nothing has ever read them back. Either surface them or drop
  them, because a column named `compensation_reality` sitting unread beside a
  public export is a trap waiting for the next author.
- **`user.membershipGranted` is a phantom field**: read as a gate, written by a
  boot migration, silently dropped on every write because no column exists.
- **`server/db/schema.ts` is stale for `users`**, missing columns including a
  contact opt-out. It is a type mirror, not a migration driver, so it drifts
  quietly.
- **`apiPrefixes` in the module registry is documentation, not enforcement**,
  and has drifted from the real mounts. Already recorded elsewhere; repeated
  because a reader of the new export routes will look there first.

---

## 4. Worth knowing, not obviously wrong

- **`**/*.test.ts` is excluded from typecheck** (`tsconfig.json`). Test files
  are never type-checked, so a helper returning a type that has since gained a
  required field compiles forever and only fails if the runtime notices.
- **Every API route is registered above `app.use(compression())`**, so no JSON
  response on this server is compressed, including the three export documents.
  Platform-wide and long-standing; worth a measurement before a change.
- **`addPeer` hard-refuses any handshake whose `platform` string is not the
  literal `custom-game-foundation`.** This is the single line that keeps
  federation a product feature instead of a protocol. Teaching `syncPeers` to
  prefer `/.well-known/village.json` and accept anything that answers the shape
  is the next real step, and it is what the export was built to enable.
