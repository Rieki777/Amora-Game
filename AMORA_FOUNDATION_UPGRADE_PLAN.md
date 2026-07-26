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
| Phase 0: sign tokens, header-only admin auth | CLAUDE CODE | NEXT |
| Rotate `ADMIN_PASSWORD` + `JOURNEY_PASSWORD` | RYE | PENDING |
| Back up the production `data/` volume before Phase 1 | RYE (or Claude with explicit go-ahead) | PENDING |
| Choose Postgres vs MySQL for Amora | RYE | PENDING, MySQL matches regen-civics and maximizes portability |
| Phase 1: DB + migrations + repository layer + split `server/index.ts` | CLAUDE CODE | BLOCKED on the two rows above |
| Phase 2: mobile FAB + bottom nav | CLAUDE CODE | READY, independent of Phase 1 |
| Phase 3: notification spine + scheduler | CLAUDE CODE | after Phase 1 |
| Roles as data (role holders, assignment, gating) | CLAUDE CODE | prerequisite for Phase 5 |
| Phase 4: minimal forum | CLAUDE CODE | after Phase 3 |
| Phase 5: recording to forum to roles pipeline | CLAUDE CODE | after Phase 4 + roles |
| Phase 6: extract Custom-Game-Foundation | CLAUDE CODE | after Phase 5 proven live |
| AI elders in the forum (Phase 7 option) | RYE (decide later) | DEFERRED by decision 3 |

## Out of scope here

The 12 regen-civics copy and UX fixes from the 2026-07-18 screenshot review are a **separate batch in the other repo**: pricing restructure to three retainer tiers, remove "Amora is client #1", "built on a decade+ of R&D", new-features-per-project pitch, founder/investor burnout framing, site-replacement value prop, remove "of the forest", village-scoped needs and offers, "leave it blank and we will coach you" affordances, bullet list under the ranking field, and the voice picker lag investigation.
