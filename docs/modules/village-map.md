# Module design: Village Map (slide 28) — interactive sociocratic map + coordination concierge

Provenance: platform

> Produced by the 13-agent design workflow, 2026-07-26, from the 2020 village-demo deck (slides + speaker notes),
> the AMORA_FOUNDATION_UPGRADE_PLAN constraints, and the live codebase. Reconciled by MODULES_MASTER_PLAN.md —
> where this file and the master plan disagree, **the master plan wins** (it applies the two critique passes).

> **Superseded on one point, 2026-08-03: what a "role" on this map is.**
>
> Everywhere below, "role" means a row in the `roles` table with the `circle_id`
> and `seats` columns that `0018_village_map.sql` added. That is no longer what
> the map renders. `roles` is a PERMISSION-GROUP carrier whose `capabilities[]`
> is the only per-village source feeding the capability gate, and it held four
> rows (`founders-circle`, `steward-circle`, `treasury`, `practitioners`), so
> the map was drawing permission groups as org-chart seats. Nobody saw it
> because the module ships off.
>
> `0049_org_roles.sql` split them. Seats now live in `org_roles`, holders in
> `org_role_assignments` as dated rows with terms and history, and `/api/map`
> reads that plane. Nothing in it reaches the gate.
>
> What still holds exactly as written: vacancy stays DERIVED with no status
> column (now `seatState`, which gained a fifth state, `expired`, for a seat
> whose holders' mandates have run out); the `map.viewPeople` / `map.contact`
> tiers; the deterministic-first concierge and its unmatched-query log as the
> demand signal. What changed underneath: the concierge scores seat prose in
> the `purpose` bucket and filters stopwords, because seats joining the
> candidate set let a long accountability list outrank the circle it sits in.
>
> `docs/ARCHITECTURE.md` §3.15 is the as-built description of the two planes,
> and §3.16 covers what a season turn does to a seat. Where this file disagrees
> with either, they win.

**A deterministic radial SVG map of circles, roles (holders' faces, vacancies greyed as open calls) and quest satellites that doubles as a coordination tool: type "I want to plant trees" and it routes you to the Food Forest circle lead with a one-click, privacy-respecting contact relay.**

Estimated sessions: 7

## Improvements over the 2020 slide concept

- Closed the loop the 2020 slide left open: the slide was a visualization; every node here has an action — occupied role -> view profile/contact relay, vacant role -> raise-your-hand application into the EXISTING admin submissions inbox (no new moderation surface), quest satellite -> claim via the shipped quest flow.
- Concierge with deterministic-first matching: keyword/tag scoring over circles/roles/quests resolves unambiguous queries with ZERO LLM tokens (the plan's 'deterministic first' pattern); the LLM ('coordination' assistant kind, reusing Maia's guards, caps and injection framing) only disambiguates and drafts the intro message. Slide had no search at all.
- The map is also a demand sensor: every concierge query is logged (F13 'instrument now, dashboard later'), so UNMATCHED queries — things members want to do that no role covers — become the founders' signal for which role to create next. The 2020 concept only displayed supply.
- Deterministic hand-rolled radial orbit layout instead of amcharts force-directed physics: positions are a pure function of (circle sortOrder, node index), so the map is spatially stable between visits (spatial memory), jitter-free, snapshot-testable, SSR-safe, and zero new dependencies — animated with the framer-motion already in the repo.
- A privacy layer the slide never considered: faces/names are member-gated via shared/capabilities.ts (map.viewPeople), contactability is per-user opt-out, emails never render anywhere, and contact goes through a Resend relay with Reply-To so reply-by-email works with no DM system and no address leak in the UI.
- Vacancy is a DERIVED state (zero role_holders rows) plus a seats count, so 'Food Forest crew — 1 of 3 seats filled' renders as a partial call instead of the slide's binary greyed/filled; no status column to drift out of sync.
- Circle name reconciliation: quests.circle free-text values ('Regenerative Agriculture') don't match the hardcoded Circles.tsx page ('Permaculture Council'); circles get an aliases[] column and an admin reconciliation helper, turning an existing latent data bug into structure.
- Mobile-first honesty: below 768px the force/radial canvas is replaced by a circle-accordion list with identical data and actions — the 2020 concept ignored phones entirely, and a network graph at 390px is unusable.
- White-label per the config mandate: all Amora circle names live in server/seeds/circles-seed.json, colors come from CSS theme tokens, the module ships OFF behind map.enabled and contributes nav/route/admin-tab only when on.
- Hypha boundary made explicit where the slide said 'on-chain data nested by circle': v1 sources entirely from platform roles/quests; v2 adds an optional per-deployment read-and-display of a Hypha DHO circle structure with deep-links out — never writes, per the locked rule.

## Data model

## New tables (Drizzle/MySQL; JSON-file twins first, since data/ is still authoritative — `data/circles.json`, `data/contact-requests.json`, `data/concierge-queries.json`, each with a seed in `server/seeds/` + `ensureDataFiles()` entries)

### `circles` (seed: `server/seeds/circles-seed.json` — Amora names live in the seed, never platform files)
| column | type | notes |
|---|---|---|
| id | varchar(64) PK | slug, e.g. `permaculture-council` |
| name | varchar(120) NOT NULL | |
| purpose | text | one-liner shown on node card |
| aliases | json | legacy `quests.circle` free-text names that resolve here (fixes the Circles.tsx vs quests.json name drift) |
| parent_circle_id | varchar(64) NULL | self-reference; sociocratic nesting (render depth 2 in v1) |
| lead_role_id | varchar(64) NULL | FK-by-convention to `roles.id`; the concierge's default contact |
| icon | varchar(64) | lucide name, same convention as `quests.icon` |
| color | varchar(32) | theme token name, not hex, so forks re-skin via CSS |
| status | enum('active','forming','dormant') DEFAULT 'active' | `forming` renders greyed as a call |
| sort_order | int DEFAULT 0 | drives deterministic layout angle |
| created_at | timestamp DEFAULT now() | |

### `contact_requests` (the "contact event" — NOT a DM system, NOT a shadow notifications table)
| column | type | notes |
|---|---|---|
| id | varchar(64) PK | |
| from_user_id | varchar(64) NOT NULL | member sending |
| to_user_id | varchar(64) NOT NULL | holder resolved at send time |
| role_id | varchar(64) NULL | which role they were contacted AS |
| circle_id | varchar(64) NULL | |
| quest_id | varchar(64) NULL | context ("about Food Forest Tender") |
| query_id | varchar(64) NULL | links back to `concierge_queries` for the funnel metric |
| message | text NOT NULL | required, like gratitude messages |
| source | varchar(32) NOT NULL | 'map' or 'concierge' |
| email_status | enum('queued','sent','failed') DEFAULT 'queued' | Resend relay outcome |
| idempotency_key | varchar(160) NOT NULL UNIQUE | `contact:{fromId}:{toId}:{sha1(message)[0:24]}` |
| created_at | timestamp DEFAULT now() | |

### `concierge_queries` (F13: instrument now, dashboard later; data is unrecoverable retroactively)
| column | type | notes |
|---|---|---|
| id | varchar(64) PK | |
| user_id | varchar(64) NULL | null for logged-out structure view (v2 public concierge, if ever) |
| query | varchar(500) NOT NULL | |
| matched_kind | enum('role','quest','circle','none') | 'none' rows are the role-creation signal |
| matched_id | varchar(64) NULL | |
| method | enum('deterministic','llm') | tracks token spend vs zero-cost resolution |
| contacted | boolean DEFAULT false | flipped when a contact_request cites query_id |
| created_at | timestamp DEFAULT now() | |

## Alterations to existing tables
- `roles`: ADD `circle_id varchar(64) NULL` (validated against `circles.id` on write, same rule as `quests.roleRequired`), ADD `seats int DEFAULT 1` (vacancy = holders < seats, derived, no status column).
- `users`: ADD `contactable boolean DEFAULT true` (JSON: `user.contactable`; opt-out honored server-side, absent = true).
- `quests`: NO column change in v1 — `quests.circle` free text resolves through `circles.aliases`; a proper `circle_id` FK lands with the Phase 1b quest-domain cutover.

## No ledger interaction
This module moves zero tokens. Contact is unpaid; nothing touches `token_ledger`. Stated so nobody adds a "contact costs Gratitude" side-balance later without going through the one ledger.

## Endpoints

- `GET /api/map — whole graph in one payload {circles, roles(+holders w/ userId, first name, avatar), quests(open, resolved circleId), meta}; anonymous callers get structure-only (holder names/avatars stripped to counts) when map.public_structure is on, 404 when map.enabled is off; 60s in-memory cache`
- `GET /api/circles — public circle list (also retires the hardcoded Circles.tsx content over time)`
- `POST /api/admin/circles — create (admin)`
- `PUT /api/admin/circles/:id — edit incl. aliases, leadRoleId, parentCircleId (admin; rejects alias collisions and parent cycles)`
- `DELETE /api/admin/circles/:id — refuses while roles reference it (admin)`
- `PUT /api/admin/roles/:id — set circleId/seats (admin; circleId validated against circles)`
- `POST /api/assistant/coordinate — {query} member-only; deterministic prefilter -> optional LLM 'coordination' kind registered beside PROPOSAL_KINDS with the guard stack (per-IP 30/hr, global daily cap, injection framing) extracted into a shared helper — NOT a second AI plumbing; returns {matches[], contact:{roleId, circleId, holder|null}, draftMessage|null, queryId}; degrades to deterministic-only when no API key`
- `POST /api/map/contact — {toUserId, roleId?, circleId?, questId?, queryId?, message} gated by capability map.contact; checks recipient contactable, sender daily cap, recipient daily cap; writes contact_requests idempotently; relays via sendResendEmail with Reply-To sender; hooks insertNotification(dedupeKey) once the Phase 3 spine exists`
- `POST /api/map/roles/:id/raise-hand — {note} creates a submissions row type='role-application' (reuses shipped submissions inbox + admin review flow); surfaces role.minStage shortfall as a warning, not a block`
- `PUT /api/game/preferences — {contactable} on the member's own record`
- `GET /api/admin/map/contact-log — paginated relay log for abuse review (admin)`
- `GET /api/admin/map/concierge-log?unmatched=1 — query log with the unmatched filter, the 'which role is missing' view (admin)`

## Surfaces

**Pages/components (all under `client/src/`):**
- `pages/VillageMap.tsx` — route `/map`; registered in nav + `config/mobileNav.ts` ONLY when `map.enabled` (module contributes entries, never squats).
- `components/map/mapLayout.ts` — pure deterministic layout function (unit-tested, no DOM).
- `components/map/MapCanvas.tsx` — SVG orbit render, pan/zoom via viewBox transform, hover raise, framer-motion entrance + vacant-node pulse; desktop/tablet ≥768px.
- `components/map/CircleAccordion.tsx` — mobile <768px fallback: circles as accordion sections, role rows (avatar/vacant badge/contact), quest chips; identical data and actions, zero graph.
- `components/map/NodeCard.tsx` — the unused-and-installed `ui/sheet.tsx` as a side sheet: circle card (purpose, lead, members, open quests), role card (description, holders -> `/profile/:id`, Contact button, Raise-hand when vacant, 'requires {stage}' chip from minStage), quest card (deep-link to `/quests`).
- `components/map/ConciergeBar.tsx` — "What do you want to do?" input above the map; renders matches, draft intro (editable before send), contact CTA; hidden when `map.concierge_enabled` off.
- `pages/Profile.tsx` — add "Contactable via the Village Map" toggle.
- `pages/Admin.tsx` — new "Circles & Map" tab (existing activeTab pattern).

**Visibility tiers:** public = structure only (circle/role names, vacancy, counts — no names, avatars, or contact); logged-in (capability `map.viewPeople`, stage floor `guest`) = faces + profiles; capability `map.contact` (stage floor `member`, or role grant) = contact relay. Both new capabilities added to `shared/capabilities.ts` — the one gate, extended not bypassed.

**Mobile:** accordion is the default below 768px with a "view as map" escape hatch (pinch-zoomable but not the primary surface); FAB/bottom-nav entry comes from the existing config-driven mobileNav.

## Mechanics

**Layout (deterministic radial orbit, ~200 LoC, zero deps — d3-force explicitly rejected):** village node at center; circle i of N placed at angle `-π/2 + 2πi/N` (sortOrder order) on radius R1; circle node radius scales `minR + k·log(1+members)`. Roles sit on an inner orbit around their circle (evenly spaced, sorted vacant-last); open quests are smaller satellites on an outer dashed orbit (capped display with a "+n more" chip). Sub-circles (parentCircleId) render as a second-level orbit in v2. Rationale vs d3-force: the data is a strict 2-level tree (~10 circles × ~15 nodes), not an arbitrary graph; a simulation buys nothing but nondeterminism, tick loops, hydration jank and untestability, and recharts is the wrong tool for networks entirely. Pure function -> stable positions -> framer-motion animates mount/hover/pulse.

**Node states:** filled role = avatar chip (member view) / solid dot (public); vacant role (holders < seats) = grey dashed ring + slow pulse + "Open call" badge (the slide's default-faces idea, upgraded); circle status `forming` = whole circle greyed as a call.

**Concierge pipeline (deterministic first):** 1) normalize query, score every circle/role/quest: +3 per quest tag hit, +2 per name hit, +1 per purpose/description hit, aliases count as circle-name hits; 2) if top score ≥3 and leads runner-up by ≥2 -> resolve WITHOUT the LLM; 3) else send top-8 candidates as compact JSON (ids, names, one-line purposes, holder FIRST names only — no emails) to the 'coordination' assistant kind; response schema `{matchKind, matchId, altIds, draft}`; server validates matchId against the candidate set and DISCARDS hallucinated ids (evidence-or-drop). 4) Contact resolution: quest -> its circle's leadRoleId holder; role -> its holders, or circle lead if vacant; circle -> lead; if the resolved seat is itself vacant, the answer becomes the call: "nobody holds this yet — raise your hand." Every query logged to concierge_queries.

**Contact relay state machine:** capability check -> contactable check -> caps (sender/day, recipient/day via variables) -> insert contact_requests (idempotency_key unique = safe retry) -> sendResendEmail to recipient with Reply-To = sender email, subject "[{project.name}] {First} wants to connect about {role}" -> email_status queued->sent|failed. Reply happens in the recipient's mail client; no DM system. Deliberately NOT written to the public Village Pulse (contact is private). When the Phase 3 spine lands, the same insert also calls insertNotification(dedupeKey=`contact:{id}`) — until then the only in-app trace is the recipient's own contact list on their profile, which reads the domain table directly and is not a shadow notification system.

**Module gating:** `map.enabled=false` platform default; when off, GET /api/map 404s, no nav entry, no admin tab. Declared deps: roles (required, shipped), circles (built here), assistant (optional — concierge degrades to deterministic), email (optional — contact button hidden without Resend config).

## Game variables

- map.enabled: false — master module toggle; ships OFF, contributes route/nav/admin tab only when on
- map.public_structure: true — logged-out visitors may see the structure-only map (names/faces always require login regardless)
- map.concierge_enabled: true — natural-language concierge bar; falls back to deterministic matching when no assistant API key is configured
- map.contact_daily_cap: 5 (0–50) — contact requests one member may send per day; 0 disables the relay entirely
- map.contact_recipient_daily_cap: 3 (1–20) — max contacts one recipient receives per day; further senders are pointed to the circle's open quests instead
- map.show_quests: true — render open quests as satellite nodes around their circles
- map.vacant_highlight: true — grey + pulse vacant roles and forming circles as open calls

## Admin controls

One new Admin tab, "Circles & Map" (existing tab pattern in Admin.tsx): (1) Circles CRUD — name, purpose, icon, theme color token, parent circle, lead role picker, status, aliases editor; (2) role-to-circle assignment + seats, with an unassigned-roles bucket; (3) alias reconciliation helper — lists every distinct `quests.circle` value with no matching circle/alias ("4 quests reference 'Regenerative Agriculture' — map to Permaculture Council?") and one-click-adds the alias; (4) contact relay log (from, to-as-role, date, email status; message bodies collapsed behind an explicit 'view for abuse review' click); (5) concierge query log with the Unmatched filter — the 'what role is the village missing' report; (6) role-application submissions arrive in the EXISTING submissions inbox, no new surface. All seven map.* variables edited in the existing Game Variables admin surface (fail-loud registry).

## Dependencies

- Roles-as-data + role_holders (SHIPPED — the map's spine)
- shared/capabilities.ts one-gate (SHIPPED — extended with map.viewPeople, map.contact)
- Game variables registry shared/gameVariables.ts + server/lib/variables.ts (SHIPPED)
- Maia assistant infra: guard stack extracted from handleProposalAssistant, 'coordination' kind registered beside PROPOSAL_KINDS (SHIPPED, optional at runtime)
- sendResendEmail() relay (SHIPPED, optional — contact hidden without email config)
- Submissions inbox for role applications (SHIPPED)
- ensureDataFiles() + server/seeds/ convention for the three new JSON files (data/ still authoritative until Phase 1b cutover)
- ui/sheet.tsx (installed, unused — free NodeCard scaffolding)
- Phase 3 notification spine — OPTIONAL integration point, explicitly not a blocker
- framer-motion, wouter, Tailwind (in repo); NO new npm dependencies

## v1 (ship first, useful alone)

Ships useful alone in 5 sessions: (S1) circles as data — schema + circles.json/seed/ensureDataFiles, roles.circleId + seats, GET /api/circles, admin Circles CRUD + alias reconciliation, aliases resolving quests.circle; (S2) GET /api/map + mapLayout.ts pure function with unit tests + MapCanvas SVG orbit render with pan/zoom, public-vs-member payload tiers via map.viewPeople; (S3) NodeCard sheet + CircleAccordion mobile fallback + nav/route/mobileNav gated behind map.enabled + vacant-role pulse + raise-hand into submissions; (S4) contact relay — users.contactable, contact_requests + idempotency, caps, Resend Reply-To relay, profile toggle, admin contact log, map.contact capability; (S5) concierge — deterministic matcher + concierge_queries logging + 'coordination' assistant kind with candidate-set validation + ConciergeBar + admin unmatched-queries view. Each session leaves the app deployable; sessions 1–3 already deliver Rye's "dynamic and beautiful sociocratic map"; 4–5 make it the coordination tool.

## v2 (the full slide vision)

The full slide vision plus what Phase 3+ unlocks (~2 sessions): nested sub-circle orbits (parentCircleId depth 2+, collapse/expand per circle — the amcharts 'collapsible tree' behavior, still deterministic); accounting-budget colored tags on nodes once a budget object exists (slide's second grouping axis — depends on the F5/F8 governance work, not built here); notification-spine integration (contact -> insertNotification + bell + daily-digest inclusion, replacing email-only); concierge funnel dashboard (query -> match -> contact -> quest-claim conversion, on top of the v1 instrumentation); optional per-deployment Hypha DHO circle read — display a village's on-chain circle/role structure alongside platform roles with deep-links to app.hypha.earth (read-and-display only, per the boundary); map snapshot on the founder command centre (Phase 8) showing vacancy heat.

## Risks

- Circle-name drift is live today: quests.json uses 'Regenerative Agriculture' etc. while Circles.tsx hardcodes 'Permaculture Council' etc. — the alias system absorbs it, but until quests get a real circle_id FK (Phase 1b), a typo'd new quest silently lands uncircled; the admin reconciliation helper is the mitigation, write-time validation is the cure.
- Contact relay abuse/harassment: caps + opt-out + admin log cover volume, but there is no per-pair block yet; a recipient's only hard stop is going fully uncontactable. Flag for a block-list follow-up before real membership scales.
- Reply-To exposes the SENDER's email to the recipient by design (that is what makes reply-by-email work) — must be disclosed in the compose UI; if unacceptable, v2 needs a tokenized reply relay, which is real work.
- Storing contact message bodies + concierge queries is personal data — retention window and the 'admin can read messages for abuse review' posture should get a real legal/privacy pass before a fork sells this to a village in a GDPR jurisdiction.
- JSON-file interim: contact_requests appends ride the same non-atomic readJson/writeJson as everything else, so two simultaneous contacts can drop one until the Phase 1b cutover; idempotency keys make client retry safe, which contains it.
- LLM matcher can hallucinate or be prompt-injected via the query text — mitigated by candidate-set validation server-side (discard unknown ids), the existing injection framing, and deterministic fallback; never let the model's text choose the recipient directly.
- If the map ships before the Phase 3 spine, the recipient-side in-app surface must stay a domain read of contact_requests and NOT grow unread-counts/preferences/digests, or it becomes the second notification system the plan forbids.
- Layout crowding past ~120 visible nodes: v1 caps quest satellites with a '+n more' chip; genuine scale needs v2's per-circle collapse.
- Scope temptation: 'circle lead' here is a display/contact convention (circles.leadRoleId), not a governance object — actual circle authority/domains belong to the F5 agreements work on Hypha's side of the boundary; keep the map from quietly becoming a governance UI.

## Publishing the land (0063 / artifact D8)

Build mode used to end at `Export scene`: a file, a person with database
access, and `scripts/import-map-scene.ts`, which skips `structures`, `zones`
and `flows` because the geometry had nowhere to land. The scene now has a home,
so the founder's hand reaches the live map.

| piece | where |
|---|---|
| Envelope, verbs, size ceiling, edit words | `shared/mapScene.ts` |
| Draft/publish/undo repository | `server/lib/mapScene.ts` |
| Tables | `drizzle/0063_map_scene_publish.sql` |
| Routes | `/api/map/draft` (GET/PUT/DELETE), `/api/map/publish`, `/api/map/revisions`, `/api/map/revisions/:v/restore` |
| Shell relay | `client/src/pages/LivingMap.tsx` |
| Artifact | `patch_d8_publish.py`, `patch_d8b_standalone_hand.py`, `patch_d8c_discard.py` |
| Gate | `qa/verify_publish.js` |

**The scene is stored verbatim.** `longtext`, not `json`: MySQL's json type
reorders keys and strips duplicates, which would quietly make "stored exactly
as the map wrote it" false. It is parsed on the way in to be CHECKED and the
original text is what is written. A field-by-field sanitiser here would be the
round-D boundary bug with twenty blocks of surface, firing every time the map
lane adds a field.

**The race is settled by the database.** `map_scene_revisions.base_version` is
UNIQUE, so two admins publishing from the same base means the second insert
fails with `ER_DUP_ENTRY` and is told who moved it. A read-then-write would
have a window, and the window is where a founder's afternoon disappears. Six
concurrent publishes are pinned in `server/lib/mapScene.test.ts`.

**Undo appends.** Restoring version 3 publishes a NEW revision carrying that
scene with `restored_from = 3`. Nothing is deleted or mutated, so the version
that was live when somebody pressed undo is still there to go back to, which
is what makes undo safe to press when unsure.

**A push never repaints over unpublished work.** If a colleague publishes while
you are mid-drag, your land does not move and your `BASE_VERSION` deliberately
stays stale, so your next publish is REFUSED and explains itself. Silently
rebasing you is how one admin overwrites another with neither noticing.

**Two capability keys, not one.** `map.edit` opens build mode and a private
draft; `map.publish` puts a change in front of every visitor. Split, a member
can shape a proposal without holding the live land. Neither is in
`STAGE_UNLOCKS`: both are appointments, granted by a role or the Cartographer
badge that 0063 seeds. A warning badge's deny suspends publishing on its own,
because the gate is the one gate.

**The gate is the server's, always.** `grounds-v0.html` is a static file at a
URL anyone can open, so its Build button is decoration. Every route asks
`hasCapability` itself; what the artifact is told only decides what it draws.

**Silence means local only.** With no shell there is no village to ask, so the
artifact keeps the founder's full hand and stays the standalone design tool it
has always been. Reading silence as a refusal is what made D8's first cut
invisible from `file://`, caught by `verify_doors` in one line.

## Open questions

- Source of truth for circles per deployment: some villages will already model circles in their Hypha DHO — should map.circles_source (platform | hypha-readonly) be a v2 deployment choice, and if hypha, does the concierge still resolve contacts against platform role_holders?
- Confirm the 'members see people' floor: design uses any logged-in account (stage guest) for faces and stage member for contacting — does Rye want faces member-gated too?
- Retire or keep Circles.tsx: fold the marketing content page into the /api/circles-driven map (one source of truth) or keep both during transition?
- Should raise-your-hand hard-block below role.minStage, or warn-and-allow so founders can consider exceptional applicants (design currently warns)?
- Investors: automatically excluded since they hold no roles — but should an investor account be able to USE the concierge/contact (currently yes, if stage/capability allows)?
- Does contact deserve a Gratitude-adjacent gesture later (e.g. attach thanks after a successful connection), and if so it must route through the one ledger — deliberately out of scope now?
- Seed content: who writes Amora's real circles-seed.json — port the 8 Circles.tsx councils verbatim, or restructure to match the 9 distinct quests.circle values first?

## How Power Is Held: the /map/circles rebuild (round 4, lane L2, 0083)

`/map/circles` is the POWER MAP now: the adopted 14-point interaction spec
(`SOCIOCRACY_MAPS_RESEARCH_2026-08-16.md`) plus the R29 layers. The page's H1
says "How Power Is Held"; the nav label and catalog rename are the
coordinator's and L1's respectively.

**Three layers and a lens.** The village declares a SHAPE (circle, pyramid,
council, flat, steward, network, other) and a default way of deciding, stored
as `power: {shape, shapeGloss?, decidesBy, decidesByGloss?}` in the map
module's config, validated by `orgChart.villagePowerProblem`. Each circle may
declare its own `decides_by` (+gloss), and may override it for exactly four
domains: money, people, space and land, rules (`decides_by_domains` JSON).
The "How we decide" lens colours circles by the resolved method: domain
override, else circle, else village default. Vocabulary ids are CLOSED
(`shared/power.ts`); `other` requires a one-line gloss the legend shows (R28).

**The picture morphs.** `layoutForShape` (`shared/mapLayout.ts`) draws one
`NestedLayout` per shape; `circle` is `layoutNestedMap` byte for byte, under
test, so today's map cannot drift. The camera is a pure reducer
(`components/power/camera.ts`) on van Wijk's `interpolateZoom`: tap a circle
to fly in (`?focus=` in the URL), tap the focused ring or backdrop to go out,
and a tap on a SEAT never moves the camera. Five seat states draw as five
glyphs, colour never alone.

**Who may declare (P10, N5).** `mayDeclare` in `orgChart.ts`: admin, the
`org.declare` capability (an appointment, never a stage rung), or a live
holder of a seat flagged `represents_circle`, for that one circle only. The
third door is the single sanctioned bridge from the seat plane to a
permission: `docs/ADR_2026-08_REPRESENTS_CIRCLE_DECLARES.md`, pinned by
`server/lib/orgDeclare.test.ts`.

**Now | Vision (P1, N2).** Vision draws open `org_drafts` as ghosts, each
with a `vision` block `{objectives[{text, metric, target, current, source,
done}], trigger}`. Measured metrics v1: `seats_filled`,
`seats_filled_in:<circleId>`, `members_at_stage:<stageId>`,
`seasons_completed`. When every objective is met the panel PROMPTS and links
a human to the existing publish button; nothing applies itself
(`visionNeverApplies.test.ts`).

**Currency (P8, N4).** Display only: `project.country` + `project.fiatCurrency`
(blank resolves to CHF), a per-viewer display currency (prefs or browser),
`shared/money.ts` for formatting and cross rates, and the `fx-rates-daily`
job caching the ECB daily list (base EUR) through the guarded dialer into
`fx_rates`. The ECB list carries no CRC (measured 2026-08-21): colones show
unconverted until an admin records a `manual` row, and the picker says so.
Stripe settlement never reads any of it.

**Publish surface.** `org.json` gains a top-level `shape`; circles gain
`decidesBy` and `decidesByDomains`, ids only and sanitised against the closed
sets, because a gloss is free text and free text can hold a name. The circle
markdown adds "Decides by: consent."

**The setup walk (§8 item 16).** Admins walk every open or partial seat
(assign / skip / open call), then every circle without a method, then the
shape, ending at "publish structure to the network?". Assignment posts to the
existing seating endpoint, so it stays a dated row.
