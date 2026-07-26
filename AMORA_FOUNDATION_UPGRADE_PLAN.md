# Amora Foundation Upgrade Plan

**Created:** 2026-07-18. **Status:** decisions locked, Phase 0 next.
**Companion docs:** `PLATFORM_FOUNDATION.md` (what exists today), `FIXES_TO_MAKE_2026-07-17_FOUNDATION_LEVERS.md` (the governance/economy spec), `CUSTOM_GAMES_MASTER_PLAN.md` in regen-civics (the product this feeds).

## What this actually is

Not "upgrade Amora." The Custom Games master plan defines `Custom-Game-Foundation` as *"a copy of game-amora with B1 + B2 applied"*, with Amora as downstream consumer #1. **That repo does not exist yet, so this work is the extraction.** Every system built here is what a $20,000 custom game inherits.

That sets the quality bar. A forum that silently drops posts under concurrency is survivable for one village and unsellable as a product with "100% ownership of the code."

## Decisions locked (Rye, 2026-07-18)

1. **Migrate to a real database before porting anything.** Biggest up-front cost, only version that survives being sold, and it makes regen-civics code portable instead of rewritten.
2. **Build in `game-amora`, extract `Custom-Game-Foundation` after.** One repo to debug, Amora gets value immediately, extraction becomes a mostly mechanical pass once the systems are proven in production. Consequence: build every system config-driven from the start. No hardcoded Amora copy, names, or categories in platform files.
3. **Minimal forum.** In: categories, threads, replies, @mentions, thread-follow, notification bell, basic moderation. Out: AI elders, governance stages, nine capitals, straw polls, thread chains. Elders stay on the shelf as a documented Phase 7 option; the research says they separate cleanly once posts and replies exist.

## Revision 2 (Rye, 2026-07-26): loop first, and the token model settled

The first version of this plan was a systems checklist sequenced by technical
dependency. That was the wrong axis. The product is a **loop** (someone arrives,
finds a path, does something useful, it gets seen, recognition carries real value,
they do more) and sequencing by "what is upstream in the stack" builds a forum
before the loop closes.

The leverage: **Amora already has most of a coordination game built and inert.**
Quests with a consent gate, Gratitude with cycle budgets, twelve stages, four
paths. Making those live is cheaper than building anything new and delivers more.

**The finding that forced the revision.** Amora already *describes* the systems the
Custom Games page sells, in content, while implementing only recognition:

- `server/index.ts:105` promises revenue "is distributed as Gratitude to the village community". There is no distribution mechanism.
- `data/content.json:398` gives a role the job of approving "major financial decisions and budget allocations". There is no proposal object and no budget object.
- `server/index.ts:215` has "Consent-Based Decision Making" as a **training module**, not as a decision.
- Stages are computed and displayed but **nothing is gated on them**; they only scale a Gratitude budget.

So the sales page leads with "who decides, where the money goes, how contribution
gets seen" and Amora genuinely does the third. The first two are copy. That is a
promise published ahead of its mechanism, which is more urgent than a roadmap gap.

### Decisions locked

1. **Three distinct currencies, and the naming is settled.** Amora wanted its equity token called Gratitude, which collides with the in-site mechanic. Resolved:
   - **Gratitude**: in-site recognition. Earned from consented quests, sent peer to peer. Distributed on **lunar cycles**, copying regen-civics so both products compute identical cycle boundaries. Platform-governed.
   - **Amora**: the land project's **equity** token. Lives on Base, governed by **Hypha**. The platform never mints, moves or prices it; it reads and displays balances.
   - **Voice**: governance weight. Also on Base, also Hypha-governed.
2. **Stages gate real capabilities**, which requires full member profiles that track progression.
3. **Roles as data**, supporting gating and role-targeted messaging.
4. **Full forum** from regen-civics, scoped to a single land project, **keeping the decision primitive**. This supersedes decision 3 of revision 1 ("minimal forum"), which would have left governance undemonstrable.
5. **Money transparency lives on Hypha.** The platform builds an economics section that reads Base for Amora and Voice balances and shows Gratitude flows, mirroring the regen-civics profile section. No competing ledger of record inside the platform.
6. **A founder-and-investor command centre** in the admin, as the coordination surface the buyer actually sits in daily.
7. **Second instance deferred** until Amora itself is the standard, then extract `Custom-Game-Foundation`.

### Build order

Loop first, then the surfaces that make it legible:

1. Test harness + **the loop test** as the acceptance criterion. **DONE** (`8c7a42f`).
2. Repository layer, per-domain cutover from JSON to MySQL, splitting `server/index.ts` as it goes.
3. **Roles as data + real gates. DONE** (`8b98151`, live). Four seeded roles with capability grants and stage floors; quest claims gate on minStage/requiresRole; shared/capabilities.ts is the single gate mechanism (stage unlock OR role grant); appointments respect the ladder.
4. Full member profiles: progression, contributions, Gratitude flows, token balances.
5. **Lunar cycles and cycle close. DONE** (`8b98151`, live: cycle 328 serving). shared/lunar.ts is a verbatim regen-civics port with a pinned tripwire test; budgets reset at each new moon; admin-triggered idempotent close settles per-recipient totals at /api/game/cycle/distributions — the report founders carry to Hypha. Close records and resets, never mints: real value stays on Hypha per decision 5, which also dissolves the double-pay collision the research critic ranked highest-risk. Note for production: the two gated seed quests (q-circle-scribe, q-retreat-center-host) only carry their gates in fresh data dirs; the live volume's quests.json predates them, so an admin edit or data fixup applies them to prod when wanted.
6. Full forum with the decision primitive.
7. Economics section reading Base for Amora and Voice.
8. Founder and investor command centre.
9. Automation: recordings to forum to role-targeted work. Reframed, correctly, as **"your weekly call becomes assigned work"** rather than content distribution.
10. Extract `Custom-Game-Foundation`.

### The acceptance criterion

Not coverage. One end-to-end run: register, declare a path, claim, submit, consent,
Gratitude lands, send to a peer, cycle closes, a release lands, a stage advances and
unlocks something. `server/loop.e2e.test.ts` walks all of that except cycle close and
the unlock, which are steps 3 and 5 above. Those two assertions are the definition of
done for this whole revision.

## Revision 3 (2026-07-26): findings from the regen-civics port audit

Eight agents mapped every source system in regen-civics, then a critic pass looked
for collisions. The findings below are load-bearing; several contradict what the
individual system maps claimed was portable.

### The collision that would have broken the economy

**Amora pays at SEND. ReGen pays at CLOSE. Never run both.**

Amora's gratitude send credits the recipient immediately (`server/index.ts`, the
`heartsBalance + amt` line). ReGen's ADR-30 model is the opposite: sending mints
nothing, and recipients are paid pro-rata at cycle close from a fixed pool. A
naive "finish the port" that adds pool minting on top of Amora's send-time credit
would **pay every acknowledgment twice** and the fixed pool would stop being fixed.

Resolved, and this is deliberate: **Amora keeps pay-at-send. `gratitude_cycles` and
`gratitude_distributions` are a SETTLEMENT AUDIT of each lunation (who received
what, from how many distinct people), not a second payment.** Cycle close credits
nobody. Anyone extending this must not "fix" that by adding a distribution.

Note also that under ADR-30 the sender does not choose an amount at all, so
porting it would change the API, the UI and the wall. Amora's sender-chosen amount
stays.

### Corrected build order

The ledger moves BEFORE cycle close. `hearts_balance` is currently incremented in
two places across non-atomic file writes, so there are already two writers to the
same number and no audit trail. Order:

1. Storage layer and repository split. **Set `timezone: 'Z'` on the MySQL pool.**
   `GAME_CONFIG.season.timezone` is `America/Costa_Rica` (UTC-6) and someone will
   helpfully point the pool at it, shifting every lunar boundary six hours.
2. **The ledger**, with `tokenType enum('gratitude','amora','voice')` correct on
   day one, because altering a live MySQL enum later is the migration regen
   refused to do. One opening `migrated_from_hearts` row per member, after which
   `hearts_balance` is a recomputed cache and never `+=` again.
3. Rewire quest consent through the ledger. The loop test is the regression gate.
4. Roles as data, one capability helper, `quests.roleRequired` validated against
   `roles.slug` on write (today it is an unvalidated pointer).
5. Stage gating and `stage_events`. DONE.
6. Profiles, against real data.
7. Lunar cycles and close. DONE, as settlement only.
8. Notification spine. Prerequisite for the forum and for role-targeted messaging.
9. Forum and the decision primitive.
10. Economics section (Base reads).
11. Command centre.

### Traps that are specific to this codebase

- **There is no tRPC here.** Every "port this procedure" is an Express rewrite,
  including the guards, the error-code-to-HTTP mapping, and the client's
  `staleTime` / `refetchInterval` / optimistic-update behaviour.
- **Ids are `varchar(64)`, not INT.** Every regen table that keys on a user is
  INT-keyed, so idempotency keys grow: widen `idempotencyKey` to at least 160.
- **Equity decimals are a cap-table problem, not a rounding problem.** Regen reads
  balances with integer BigInt division into INT columns, so 0.5 tokens displays as
  0. Acceptable for a recognition token; for **Amora as equity, displayed beside a
  member's name, it is a misstatement.** Read `decimals()`, store fixed point, and
  **return null on RPC failure rather than persisting a zero.**
- **Wallet binding needs proof of control.** Regen's link only checks nobody else
  claimed the string. `users.wallet_verified_at` (0003) exists to record a signed
  message, and equity must not be displayed against an unverified binding.
- **Two cycle keys.** `gratitude_log.cycle_id` historically held a calendar month
  (`"2026-07"`); it now holds lunar ids (`lunar-000328`). Harmless today because
  production has no gratitude rows, but the cutover should add an int cycle FK,
  rename the old column `legacy_cycle_month`, and make the uniqueness
  `(from_id, to_id, cycle_id)`.
- **`visitor.gratitudeMultiplier` is 0**, so a zero-budget sender is reachable by
  default. Regen's floor is 1.0 and never hits this. Any future pooled maths must
  treat total weight zero as "nothing to settle", not divide by it.
- **Stage is computed live** over three JSON files on every call, so snapshotting a
  derived tier into a budget row freezes different values depending on when a
  member first touched the cycle.

### What we are explicitly NOT porting

- The legacy season gratitude path (`gratitude_transactions`, `gratitude_budgets`,
  `game.sendGratitude`, the hand-typed `lunar_cycles` table whose dates are a year
  wrong). Amora already has the faucet; the job is not to import a second one.
- The Hypha claim bridge, unless Gratitude-to-Amora conversion becomes a real
  product decision. Roughly 600 lines, a hand-provisioned webhook, a weak bridge
  key, and public endpoints leaking wallet and payout. Decision 1 says the platform
  never mints or moves Amora, so a bridge that requests issuance is out of scope by
  our own rule. `governance.hypha_threshold` is a progress target until then.
- Percentile scoring and trust scores. `PERCENT_RANK()` over eight players makes
  fourth place a rank. Use absolute counts.
- The public/private balance split and the second and third token ledgers. One
  ledger.
- Nine capitals, bioregions, seasons-as-infrastructure, thread chains,
  multi-tenancy, quest unlock tiers. Movement-scoped or dead. Caveat:
  `quests.circle` IS populated in Amora, so circles are a real decision rather
  than a blanket delete.
- **Regen's `game_variables` table.** It fails soft (a missing key silently becomes
  a code default, so a typo yields a plausible economy with no error) and has five
  duplicated readers. Our `shared/gameVariables.ts` plus `server/lib/variables.ts`
  deliberately does the opposite: an unknown key throws, there is one reader, and
  only changed values are stored so platform defaults stay inheritable.

## What already exists, do not rebuild

Verified by reading the code and probing production, not assumed.

| System | State | Evidence |
|---|---|---|
| **Maia, the Work With Us AI guide** | **Live in production right now** | `/api/assistant/status` returns `{"available":true}`. Real Anthropic intake agent at `server/index.ts:1102-1194`, 10-field proposal walk, prompt-injection guard at 1146, per-IP 30/hr + global 600/day caps, admin-editable name and greeting. Listed here so nobody rebuilds it. **Owned by a separate session, not this plan.** |
| **Quest system, including the consent gate** | Fully built | Definitions `data/quests.json`, claim `server/index.ts:1710`, submit 1735, **admin consent 1756-1779** which is what actually releases value, admin review list 1749. Consented count feeds stage progression at 419-422. |
| **Gratitude / recognition currency** | Fully built | Send 1816-1855 with per-cycle-per-recipient cap and required message, public wall 1858, personal journal 1868, budget scaled by stage multiplier 452-461. |
| **Activity / Village Pulse** | Exists, minimal | `addActivity()` 378-382, capped at 500 entries. Flat `{type, text}` free-text log with no actor ids or entity refs. |
| **Transactional email** | Partial, reusable | `sendResendEmail()` 564-595, fire-and-forget, no retry or send log. Only 3 triggers, all form-submission related. |

**Note on the quest consent queue.** The "Quest credit lands only after the people involved consent to it" bullet on regen-civics `CustomGames.tsx:207` appears in that repo **exactly once, as marketing copy**. It is not implemented there. It **is** implemented here. Porting regen's quest system backwards would be a downgrade. Amora's real gaps are crews/multiplayer, the quest journal, and unlock tiers.

## What does not exist

Forum (zero routes, zero tables, zero components). In-app notifications, unread counts, digests, preferences. **Roles as data.** Any database. Any test. Any background job or scheduler. Mobile FAB or bottom nav.

**Roles deserve emphasis.** "Send messages to roles" has no substrate. `paths[]` is cosmetic and self-selected; the 12 `stages` only scale a gratitude multiplier; **no route in the app is gated on either**. The Roles page is content, not people assigned to roles with permissions. Role-targeted messaging is a prerequisite, not a step.

## Phase 0: sign the auth tokens. Blocking, do first.

`encodeToken()` at `server/index.ts:262` is `btoa(JSON.stringify({userId, email, timestamp}))`. No signature, no HMAC. **Anyone can forge a token for any user id in seconds.**

Contained today on a read-mostly journey site. The moment a forum exists it becomes "anyone can post as anyone, in public, permanently," including as the founder to investors. Related: `authPassword()` at 245-252 accepts the admin password via **query string**, so it lands in access logs and browser history.

- Sign tokens (HMAC or a real JWT lib) with a `JWT_SECRET` env var. Reject unsigned and tampered tokens.
- Keep the 30-day expiry. Existing sessions will invalidate once; that is correct and acceptable at current scale.
- Drop query-string and body password acceptance from `authPassword()`. Header only.
- Rotate `ADMIN_PASSWORD` and `JOURNEY_PASSWORD` (both currently `1love`, and both were briefly exposed in plaintext in a capture manifest).

**Acceptance:** a hand-crafted token for another user id is rejected; `?password=` no longer authenticates; existing login flow still works end to end.

## Phase 1: storage layer

Today every mutation is read-entire-JSON-file, modify, write-entire-file, via `readJson`/`writeJson` (611-621) called directly inside ~78 route handlers. No locking, no transactions, no atomic rename. Two simultaneous writers = one silently lost. `POST /api/game/gratitude/send` already does two non-atomic writes across two files with no rollback.

- Postgres or MySQL + Drizzle, matching regen-civics so its code ports rather than gets rewritten.
- Real migration files from the start. Regen-civics' lesson (36 broken historical migrations, recorded in its SHIPPED_LOG) is that migration discipline is cheap early and expensive later.
- **Repository layer, not raw queries in handlers.** The current god-file pattern is exactly what produced regen-civics' 3,335-line `server/db.ts`. Domain modules from day one.
- Migrate the 19 existing JSON files with a reversible script. `data/` is gitignored and volume-mounted, so back up the production volume before running anything.
- **Split `server/index.ts` (1,977 lines, 80 routes) while doing this**, not after. Adding a forum to it unsplit pushes it past 3,000.

**Acceptance:** every existing route works against the DB; a concurrent-write test proves two simultaneous posts both survive; the migration script round-trips.

## Phase 2: mobile FAB + bottom nav

Cheapest visible win, zero database dependency, do it any time after Phase 0.

Port from regen-civics `client/src/components/mobile/`: `WizardRadialMenu.tsx` (383), `MobileTabBar.tsx` (112), plus `useSmartNav.ts` / `useNavVisits.ts` / `usePageTools.ts`. Roughly 950 lines for a minimum viable lift.

- Only two tRPC calls to sever (`userProfiles.getMe` for one field, and `useContextualCTA`). Stub them.
- Replace the `PATH_AFFINITY` / `PAGE_META` maps and menu config with Amora's routes. **Config-driven per decision 2**, so a custom game overrides them without editing platform files.
- Keep the iOS Safari fix verbatim: `max(env(safe-area-inset-bottom) + 8rem, 9rem)`. PWA mode and embedded webviews report `safe-area-inset-bottom: 0` and collapse the FAB into the tab bar.
- `ui/drawer.tsx` and `ui/sheet.tsx` are already installed here and unused. Free scaffolding.
- Amora currently has only a hamburger drawer (`Layout.tsx:136-225`). Decide whether the FAB replaces or complements it.

## Phase 3: notification spine

Port the clean ~700 lines, not the forum-shaped 775.

- **Take:** `insertNotification()` with its `dedupeKey` idempotency, the `notifications` table shape, `notification-email.ts`, `push.ts` (VAPID web push).
- **Leave:** `forum-notify.ts` (775 lines of forum business logic wearing a notification costume). Write Amora's own fan-out in Phase 4.
- Steal the precedence rule: mention beats direct reply beats thread-follow activity, so one person gets one notification per event. Plus the caps: 10 mentions per post, reaction milestones only at 1/5/10/25, hard ceiling of 20 notification emails per user per day.
- Per-user preferences need a home. Regen-civics puts them on `player_profiles.notificationPrefs` JSON; Amora's equivalent is the user record.
- **Needs a scheduler.** Amora has no cron and no `setInterval` jobs at all. Digests, decay, and season rollovers have nowhere to run today.

## Phase 4: forum, minimal

Write fresh using regen-civics as reference. Its `forum.ts` is fused to bioregions, nine capitals, dialogue governance stages, thread chains, seed posts, and roughly 15 category-seeding migrations. Roughly 1,500 lines here.

- Tables: categories, threads, replies, mentions, subscriptions, reads, reports, bans.
- **Categories are seeded from config, not migrations.** Regen-civics hardcoded ~15 named categories into migration files; a custom game must be able to define its own without touching platform code.
- Maintain denormalized `replyCount` / `lastReplyAt`, and remember they are hand-maintained in regen-civics (a known correctness hazard, worth a transaction here).
- Moderation: two-level report severity (soft = community can hide, hard = admin review) plus bans with optional expiry.
- Wire Phase 3's notification fan-out.

## Phase 5: the automation pipeline

**Name it correctly.** In regen-civics this is two separate systems, and the one described in the ask is not The Harvest.

- **The Harvest** = quick notes to ideas to drafts to publish. **Never touches the forum.** Do not port for this goal.
- **The recording / coordination pipeline** = what "we host a video, distill it, add to the forum, message roles" actually means: `server/webhooks/riverside.ts` (279), `server/jobs/coordinationPipeline.ts` (727), `server/lib/recording-finalize.ts` (260, this is the one that creates the forum thread at line 146), `server/lib/call-insights.ts` (234).

Pipeline to build here: video source (Riverside webhook, or YouTube RSS diffed against stored video ids, no API key needed) → transcript → LLM synthesize (overview, chapters, decisions, action items) → **forum thread** → notify subscribers → **role-targeted task proposals**.

Patterns worth copying exactly:

- **Evidence or drop.** Every extracted task requires a verbatim quote plus timestamp or it is discarded. This is what makes the output trustworthy instead of plausible.
- **Deterministic first.** The Harvest's ripeness scoring spends zero tokens. Score and filter before you call an LLM.
- **Suggestions, not actions.** Call insights surface at `/admin/calls` as suggestions only. Regen-civics' rule, worth keeping: nothing mutates on a timer.
- **Backpressure.** Auto-drafting pauses at 15 ready drafts, so the queue cannot run away.
- **Write-once AI bodies.** Keep `ai_body` untouched alongside the human-edited `body`. That pair is what makes a voice-learning loop possible later for free.
- **Idempotency on every send.** One formation email per member per crew, ever, enforced by a unique key rather than a flag.

Depends on: Phase 4 (needs a forum to post into) and a **roles layer** (needs role holders to message). Sequence the roles layer explicitly rather than discovering it mid-phase.

## Phase 6: extract Custom-Game-Foundation

Once the above is proven live in Amora. Mostly mechanical if decision 2 held: config-driven throughout, no Amora copy in platform files, categories and nav and personas all overridable from `data/` overlays and seeds. The master plan's rule that "generated games never edit platform files" currently has **no enforcement code**; consider a lint or CI check that fails when platform files reference village-specific content.

## Standing hazards in this repo

1. **Zero tests, no CI, `vitest` installed and unused.** Nothing will tell you when the port breaks quest claiming or gratitude budgets. Add a test harness in Phase 1.
2. **No dev API proxy** in `vite.config.ts`. `pnpm dev` serves the SPA with no backend. Fix early; it costs every contributor time.
3. **New data files need a seed in `server/seeds/`, never in `data/`**, plus an entry in `ensureDataFiles()` (299-321). `data/` is a volume mount that shadows anything shipped inside it. Documented at lines 17-20 and 277-297.
4. **`questIdFromTitle()`** (`client/src/components/QuestActions.tsx:7-9`) derives quest ids from titles client-side. A quest rename silently breaks claims.
5. **Rate limiting and the AI daily cap are in-memory** module state (625-648). They reset on every redeploy and are per-process.
6. `readJson` returns `null` on any failure, so **a corrupt file reads as empty** rather than erroring.

## Handoff Breakdown

| Task | Owner | Status |
|---|---|---|
| Phase 0: sign tokens, header-only admin auth | CLAUDE CODE | SHIPPED, live. Verified on production: an unsigned token for a real existing user id is rejected, a token signed with the wrong secret is rejected, one signed correctly is accepted (the control), and `?password=` no longer authenticates. `AUTH_TOKEN_SECRET` is set on the Railway service. |
| Phase 2: mobile FAB + bottom tab bar | CLAUDE CODE | SHIPPED, live (`1352025`). Config-driven via `client/src/config/mobileNav.ts`. Verified at 390px on production. The trigger glyph is intentionally a plain icon: the brand PNGs carry the AMORA wordmark and are illegible at 32px, so `FabTriggerIcon` in the config is the swap point if a square brand glyph is ever cut. |
| Rotate `ADMIN_PASSWORD` + `JOURNEY_PASSWORD` | RYE | DECLINED, deliberate. Rye's call 2026-07-18: they are placeholders and meaningless until a real project takes over and sets its own. Revisit before any real membership exists. |
| Back up the production `data/` volume | CLAUDE CODE | DONE. `Desktop/Amora/backups/amora-data-2026-07-26_000010.tar.gz`, pulled over `railway ssh`, all 20 JSON files, archive verified to decompress to real content. Uploads was empty, so 116K is the whole dataset. |
| Choose Postgres vs MySQL | RYE | DONE, MySQL. Service provisioned and `DATABASE_URL` on the app service references it over the private network (`railway.internal`, no egress). |
| Delete two orphaned MySQL volumes | RYE | PENDING. `mysql-volume-PSJY` and `mysql-volume-Jin7`, 0MB, attached to nothing, left over from duplicate services created by retrying `railway add`. The CLI reports "deleted" and they persist, which is the `--2fa-code` gate in non-interactive mode, so this needs a dashboard click. |
| Phase 1a: schema, migration runner, verified JSON import | CLAUDE CODE | SHIPPED (`2a0e9e0`). 11 tables live, all 9 collection counts match the JSON, all 10 config documents structurally identical, import idempotent. **Nothing reads from the DB yet**; the app still reads JSON and `data/` stays mounted and authoritative. |
| Phase 1b: repository layer, then cut over one domain at a time | CLAUDE CODE | NEXT. ~78 route handlers still read JSON directly. Each domain moves behind a repository and is verified against the shadow copy before the next one starts. |
| Phase 1c: split `server/index.ts` (1,977 lines, 80 routes) | CLAUDE CODE | do it during 1b, not after |
| Test harness (vitest is installed and unused, zero tests exist) | CLAUDE CODE | do it at the start of 1b, it is the safety net the cutover needs |
| Phase 3: notification spine + scheduler | CLAUDE CODE | after Phase 1 |
| Roles as data (role holders, assignment, gating) | CLAUDE CODE | prerequisite for Phase 5 |
| Phase 4: minimal forum | CLAUDE CODE | after Phase 3 |
| Phase 5: recording to forum to roles pipeline | CLAUDE CODE | after Phase 4 + roles |
| Phase 6: extract Custom-Game-Foundation | CLAUDE CODE | after Phase 5 proven live |
| AI elders in the forum (Phase 7 option) | RYE (decide later) | DEFERRED by decision 3 |

## Out of scope here

The 12 regen-civics copy and UX fixes from the 2026-07-18 screenshot review are a **separate batch in the other repo**: pricing restructure to three retainer tiers, remove "Amora is client #1", "built on a decade+ of R&D", new-features-per-project pitch, founder/investor burnout framing, site-replacement value prop, remove "of the forest", village-scoped needs and offers, "leave it blank and we will coach you" affordances, bullet list under the ranking field, and the voice picker lag investigation.
