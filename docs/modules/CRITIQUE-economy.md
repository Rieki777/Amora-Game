# Economy exploit critique

> Adversarial critique pass over all 11 module designs, 2026-07-26.

## Verdict

The portfolio is unusually well-aligned on the rules that matter most — every design honors the Hypha read-and-deep-link boundary, pay-at-send survives everywhere (the Feed's heart-as-send and the keystone's XOR boot assertion are genuinely good resolutions), nothing assumes the nonexistent scheduler, and the fail-loud variable discipline is universal. But the batch fails as a SET in three places it succeeds as individuals: four designs mutate the ledger substrate four incompatible ways (transfer-row FK registry vs varchar+currencies vs enum-append vs per-user cache columns), two designs each build 'the' module framework with contradictory toggle models that eight other designs then assume inconsistently, and the Hypha DHO URL has four proposed homes. All three are resolvable by declaring winners — Token Registry for the ledger (its enum→registry argument is honest and correct on the merits, but it amends a locked decision and must get Rye's explicit sign-off before the Phase 1b ledger session, which is a this-week deadline verified against schema.ts:314), module-framework for enablement (tools-hub demotes to its reference consumer), and hypha.org_url for the DHO link. With those merges, the deletion of Crowdpool's money→Gratitude variable, buy-only Exchange v1, and the Feed's forum-schema riders written into the Phase 4 ticket, the suite is buildable in roughly 42 sessions of v1 work (down from 71 claimed) on the interleaved order above: keystone → event spine → framework → tools, then foundation phases 1b/3/4 interleaved with three parallel-safe module tracks, Crowdpool deferred until its triggering campaign exists. Ship nothing token-shaped until the two decision-gate questions are answered in writing.

## Findings

### [CRITICAL] Ledger substrate — four incompatible mutations of token_ledger

**Issue:** Four designs each rewrite the ledger differently and none of them cite the others as authoritative: (1) Token Registry replaces the enum with tokenId varchar(64) FK -> tokens.id AND changes row shape from single-entry signed (userId, amount) to transfer rows (fromAccountId, toAccountId, bigint > 0) with a ledger_accounts table; (2) Internal Exchange widens the enum to varchar(32) validated against its OWN 'currencies' table and keeps single-entry shape with system accounts as fake seeded rows in users; (3) Material Library does 'ALTER TABLE token_ledger MODIFY token_type ENUM(...,'library_credit')' — an enum APPEND, the exact pattern the other two exist to kill — plus a transferTokens() paired-entry helper on the old shape; (4) Stays hedges between 'varchar validated against the registry' and 'minimally add stay_credit to the enum'. If built as written these produce three different live table shapes and two different double-entry conventions. This is the single worst collision in the batch.

**Fix:** Declare the Token Registry + Ledger design the ONLY ledger spec (it self-describes as 'this design IS that session's spec' and it is the best of the four: conservation by construction, hypha-rows-zero invariant, pay-at-send XOR pool-release boot assertion). Strike from the other three designs: Library's enum-append migration and transferTokens(), Exchange's currencies table and settleOrder's private entry shape, Stays' enum fallback. Those modules call the keystone's postTransfer() and register pool accounts via its ensureSystemAccount() — they own zero ledger DDL.

### [CRITICAL] tokenType enum vs registry — the locked-decision amendment

**Issue:** Revision 3 build order #2 locks 'tokenType enum(gratitude,amora,voice) correct on day one, because altering a live MySQL enum later is the migration regen refused to do.' The keystone designer's resolution — the requirement is 'the shape must be right on day one', the enum only satisfies that if the token set is closed, and the deck proves it is open — is, evaluated honestly, CORRECT on the merits: seven of the eleven modules mint new token types at runtime (library-credit, stay-credit, event tickets), so shipping the enum into live rows guarantees the exact forbidden live-enum ALTER, inherited by every fork. The plan's own rationale (never alter a live enum) argues FOR widening now, while token_ledger has no authoritative rows. The deadline claim is verified: schema.ts:314 has the enum, Phase 1a data is re-importable, Phase 1b is NEXT. But this is still an amendment to a decision Rye locked in writing, and the keystone also silently upgrades the row shape to transfer rows — a second, larger change riding the same session.

**Fix:** Put a one-paragraph amendment in front of Rye BEFORE the Phase 1b ledger session, framed exactly as the keystone argues it: 'the invariant you locked is shape-right-on-day-one; with runtime tokens that means tokenId FK, not enum; the governance column (platform|hypha) stays a true closed enum; day-one seeds are your exact three tokens.' Get the transfer-row shape change (single-entry -> from/to accounts) approved in the same breath — it is the bigger migration and the designs treat it as a footnote. If Rye declines, every credit/stay/library module in this batch is unbuildable as designed and must be re-scoped.

### [CRITICAL] Two competing module frameworks + a third contradiction in every module's toggle

**Issue:** module-framework builds a module_settings table with an off/preview/members/public lifecycle and explicitly states 'module LIFECYCLE is deliberately NOT a game variable.' tools-hub builds a SECOND shared/modules.ts with binary toggles stored as game variables (module.tools.enabled), its own requireModule, its own GET /api/modules, its own useModules hook and its own admin Modules tab. Meanwhile eight other designs declare their toggles as game variables (map.enabled, library.enabled, badges.enabled, health.dashboard_enabled, crowdpool.enabled, modules.stays_enabled, feed toggle) — i.e. they all assume the tools-hub model that module-framework forbids. There is no single config story across the suite, which violates the config-driven mandate at the substrate level.

**Fix:** module-framework wins — it is the substrate design and the lifecycle model is genuinely better than a boolean. Every '<module>.enabled' game variable in the other ten designs is deleted; enablement lives in module_settings only. tools-hub is demoted from a standalone 2-session module to the enrichment of module-framework's own v1 Session 3 (which already builds the tools directory as the reference consumer): keep tools-hub's registry CRUD, per-audience visibility, click beacon, SSRF-guarded link checker and icon upload as +1 session on top of the framework. One registry, one middleware, one admin tab, one /api/modules.

### [HIGH] Two token registries both claiming to be F2's currencies[]

**Issue:** Token Registry ships a 'tokens' table (kind: recognition|credit|ticket|equity|voice; flags transferable/spendable/adminMintable) and says any F2 currencies work 'must route through this registry.' Internal Exchange ships a 'currencies' table (kind: recognition|credit|external; flags purchasable/swappable/minStageToBuy) and says 'this IS F2's currencies[], shipped as a table.' Different table names, different kind vocabularies, different flag sets, both claiming the same canonical role. Building both creates the parallel currency store the one-ledger rule forbids.

**Fix:** One table: the keystone's `tokens`. Exchange's commerce flags (purchasable, swappable, minStageToBuy) move to either extra columns on tokens or a satellite token_exchange_settings table keyed on tokens.id, added in the Exchange module's own migration. Unify the kind vocabulary once (recognition | credit | ticket | equity | voice, with governance='hypha' subsuming Exchange's 'external'). The currency_prices append-only price table is good and survives — pointed at tokens.id.

### [HIGH] System accounts modeled three incompatible ways

**Issue:** Keystone: ledger_accounts table, system rows have userId NULL and a slug. Exchange: system accounts are 'reserved user ids seeded as inert user rows' — fake users named sys-treasury inside the users table, which will leak into member lists, stage computation, profile queries, and every COUNT(users). Library: raw 'sys:library-pool' strings in token_ledger.userId with no account table at all.

**Fix:** ledger_accounts wins; reject the inert-users hack outright (it is the kind of pollution that costs a week to unpick later). Library and Exchange register their pools via the keystone's ensureSystemAccount('sys:<module>:<slug>') API, which the keystone already specifies.

### [HIGH] Per-module balance columns on users

**Issue:** Stays adds users.stayCreditBalance and Library adds users.library_credit_balance as 'recompute caches mirroring recognitionBalance'. The keystone already provides token_balances(accountId, tokenId) as the generic recomputed cache and explicitly schedules users.recognitionBalance for removal after one release. Two new per-token user columns rebuild the drift surface the keystone is removing, and each is a schema ALTER on users that every fork inherits.

**Fix:** Delete both columns from the Stays and Library designs; read token_balances. The 'balance may go legitimately negative' note from Stays (grace nights) transfers to token_balances semantics unchanged.

### [HIGH] Hypha DHO URL configured in four different places

**Issue:** module-framework defines hypha.org_url + four hypha.link_* variables + shared/hypha.ts + a HyphaLink component. tools-hub defines governance.hypha_org_url (and refactors CoCreatorsGuide.tsx onto it). Exchange defines exchange.hypha_dho_url. Crowdpool defines crowdpool.hypha_dho_url (self-flagging 'reuse if platform-wide exists'). Stays, Library, Badges, Map and Feed all reference 'the deployment's configured DHO URL' generically. Four homes for one URL means dead links and drift — the exact failure HyphaLink exists to prevent.

**Fix:** hypha.org_url (module-framework's set) is the single home; it lands in the module-framework session together with shared/hypha.ts and HyphaLink. Delete governance.hypha_org_url, exchange.hypha_dho_url, crowdpool.hypha_dho_url from those designs. The CoCreatorsGuide.tsx refactor (kills the live [YOUR-DHO-SLUG] placeholder) rides the framework session, not tools-hub.

### [HIGH] F13 instrumentation spine claimed by three modules

**Issue:** Health Dashboard builds health_events + recordEvent() wrapping addActivity and ALTERs the activity table (actorId/entityType/entityRef). Gratitude Feed ALSO alters activity with the same three columns. Badges says badge_events 'doubles as an F13 health event' without saying whether that means a row in health_events or just a queryable table. Map and tools-hub add their own instrumentation tables (fine — domain tables). If Feed and Health both ship the activity ALTER, or Badges invents a second event-spine convention, the 'instrument now' data forks at birth.

**Fix:** Pull Health Dashboard Session 1 ONLY (recordEvent + convert the 11 addActivity call sites + health_events born DB-native) forward to immediately after the ledger keystone — it is cheap, has no UI, and every later module emits through it. The activity-table columns ship once, in that session. Feed and Badges emit via recordEvent; badge_events/concierge_queries/tool_clicks remain domain tables but their write paths also call recordEvent where a health signal exists.

### [HIGH] Feed's hard requirement on Phase 4 forum schema

**Issue:** The Feed's whole architecture (correctly, the best resolution in the batch — it avoids a fourth content surface) depends on forum_threads shipping WITH kind/meta/imageUrl/heartCount columns and forum_thread_tags 'specified at forum design time so no ALTER later', plus gratitude_log gaining kind/contextType/contextRef and the unique heart index during the gratitude domain cutover. Neither the foundation plan's Phase 4 sketch nor any other artifact currently records these obligations; if the forum session is built from the plan alone, Feed inherits exactly the live-ALTER debt the whole batch is organized to avoid.

**Fix:** Two cross-cutting schema riders must be written into the build tickets now: (a) Phase 4 forum schema includes Feed's columns + tags table + forum_reports as specced; (b) the gratitude domain cutover migration includes kind/context columns, backfills kind='acknowledgment', adds the (from_id, context_ref, kind) unique index, AND executes Revision 3's own cycle-key cleanup (int cycle FK, legacy_cycle_month rename) in the same migration.

### [HIGH] Crowdpool fulfill_recognition breaches the recognition firewall

**Issue:** crowdpool.fulfill_recognition grants Gratitude when a (usually fiat) pledge is released — a money-in, recognition-out path. Exchange, Feed and Badges all encode 'recognition must stay unbuyable' as a boot invariant (F4's spirit, F2's no-posted-price rule), and Crowdpool itself would put a de-facto price on Gratitude (X dollars fulfilled = Y Gratitude). Defaulting to 0 mitigates but the variable's existence invites a fork to wire money->recognition with one admin edit, which the rest of the platform treats as structurally impossible.

**Fix:** Remove the variable. If a village wants to thank a donor, the mechanism already exists: a human sends Gratitude through the normal budgeted send, or the admin posts a Pulse/Feed acknowledgment. If Rye insists on keeping it, it must be added to the same boot-invariant family (hard cap, kind check, and an explicit F4-style startup assertion) — but the cleaner answer is deletion.

### [MEDIUM] JSON-vs-DB inconsistency for NEW append-only data

**Issue:** tools-hub correctly argues new append-only data with no JSON legacy should be born in MySQL (tool_clicks). But Map puts contact_requests and concierge_queries in JSON files (and itself flags the resulting lost-write race), Badges puts four stores including the ledger-disciplined badge_events in JSON, and Health uses a JSONL era for health_events with a crash-truncation caveat. The DB is live and Phase 1a proved the migration runner; only EXISTING domains are waiting on cutover. Every new JSON store is voluntary cutover debt plus a real concurrency hazard the plan documents.

**Fix:** Adopt one rule: new module tables are DB-native from day one (they never appear in data/); JSON interim is permitted only for singleton config documents read through a variables.ts-shaped reader (data/modules.json qualifies; contact_requests and badge_events do not). Map, Badges, and Health drop their JSON/JSONL eras; Health's 'decide at build start' open question resolves to DB-native now.

### [MEDIUM] Structural config placement drift (the ONE config story, second layer)

**Issue:** module-framework declares the split: tunables -> game variables; module structural config -> module_settings.config; identity -> gameConfig/brand. Several designs violate it: feed.category_slug is structural but shipped as a game variable, tools-hub keeps its category list inside data/tools.json, Health keeps regen metric registry in a separate health-config doc/appConfig key. Individually harmless; collectively the fork operator faces four places where 'module configuration' lives.

**Fix:** Audit each design against the framework's declared split before build: feed category slug, tools categories, and health regen-metric registry all become that module's module_settings.config document, validated by its validateConfig(). Game variables stay strictly numeric/boolean/choice tunables with bounds.

### [MEDIUM] Badges rewires ONE GATE semantics platform-wide

**Issue:** Badges inserts badgeDenies (deny beats role grant, admin bypasses) and badgeCapabilities (a third grant source) into hasCapability's evaluation order. This is the only design that changes the gate's semantics rather than adding keys, and every module in the batch plus the shipped quest/role gating feels it. It also means ctx composition per request grows a badge-awards read on the hot path. The design is careful (boot assertions, invariant tests) but it is buried inside a 7-session module rather than treated as the platform change it is.

**Fix:** Extract the capabilities.ts change into its own small, heavily-tested session with explicit Rye sign-off on deny-beats-role-grant (a timeout silencing a role holder is a governance-adjacent policy, not a code detail). Serialize it against anything else touching shared/capabilities.ts. The rest of Badges then builds on a stable gate.

### [MEDIUM] Session estimates — specific corrections

**Issue:** Portfolio totals ~71 sessions; several estimates are off in both directions. Too optimistic: Token Registry v1 at 2 sessions — Session A alone packs registry + accounts table + transfer-shape migration + byte-exact idempotency-preserving import + rewiring quest consent and gratitude send + boot invariants + pinned tests; that is 2 sessions by itself (v1 realistically 3). tools-hub at 2 is honest standalone but ~1 after merging into the framework's reference-consumer session. Exchange's S1 (currencies registry + token_type widening + sys-treasury) collapses almost entirely into the keystone, so Exchange v1 is ~3 not 4. Too padded / premature: Crowdpool's 'v1' paragraph describes six tables, CSV dry-run import, dashboards, linking, receipts and an admin tab — that is 5-6 sessions on its own, for a module whose trigger event (a passed regen-civics crowdpool campaign, with a contract that repo has not built) has not happened. Library's 10 is the most honest estimate in the batch and should be believed, not negotiated down.

**Fix:** Rebudget: Token Registry v1 = 3; module-framework v1 + merged tools = 4 total; Exchange v1 = 3 (and see the swap-deferral finding); Crowdpool deferred entirely until a campaign is scheduled, then re-estimate against the real regen-civics contract. Working portfolio for the next two quarters ≈ 45-50 sessions of v1 work instead of 71.

### [MEDIUM] Exchange swap product — build the shop, defer the swap

**Issue:** Exchange's own rationale demolishes the swap: thin market, credits with intrinsic redemption value, price-setting as governance. What remains of 'swap' after their (correct) treasury-as-counterparty redesign is converting one closed-loop credit into another at posted prices — a feature with no demonstrated demand and real settlement complexity (4-leg transactions, QUOTE_STALE machinery, spread accounting). Meanwhile the genuinely needed thing (sell stay credits and event tickets for fiat with receipts) is v1 S3-S4. The slide-25/26 confirmation with Rye (no in-platform share trading, ever) is also still an open question — building any of this before that answer risks a fundamental rework.

**Fix:** Get Rye's written confirmation of the Hypha-only posture for anything share-like FIRST (it is the module's own top open question). Ship Exchange v1 as buy-only (wallet, prices, Stripe, manual/cash orders, receipts, treasury view). Move SwapCard and the quote engine to a demand-triggered v2 that may never be scheduled. This also removes the strongest legal surface until counsel has reviewed the closed-loop credit posture.

### [MEDIUM] Stays capability-stage mapping implies a new platform mechanism

**Issue:** Stays defines stay.member_rate_stage as a game variable that 'feeds STAGE_UNLOCKS'. Today stage unlocks are code (shared/capabilities.ts); no mechanism exists for a variable to rewire a capability's stage floor, and inventing one ad hoc inside Stays would be a second gate-configuration path (one-gate erosion by side door).

**Fix:** Either hardcode stay.member_rate at stage 'member' in the capability map (fine for v1; role grants already provide the override valve), or design variable-driven stage floors ONCE at the platform level as a deliberate capabilities.ts feature — not inside a lodging module.

### [MEDIUM] Stripe plumbing built twice

**Issue:** Stays S3 and Exchange S3 each independently build: stripe npm integration, express.raw() webhook mounted before the JSON parser, signature verification, idempotent settlement on session id, receipt email, per-fork key env handling, and an admin manual-payment recorder. Two webhook endpoints, two settlement conventions, duplicated per-fork onboarding docs.

**Fix:** One shared server/lib/payments.ts (checkout session creation, ONE /api/webhooks/stripe route with a source-dispatching metadata convention, idempotent settle callback, receipt email helper) built in whichever module ships first; the second module consumes it. Same for the 'module on but keys absent' admin banner.

### [LOW] Crowdpool treasury_receipts vs decision 5 framing

**Issue:** treasury_receipts self-describes as 'the seed of the future economics/treasury history'. Decision 5 says money transparency lives on Hypha and the platform keeps no competing ledger of record. Operational receipts for received pledges are fine; the framing as the economics section's fiat history creeps toward a platform money ledger.

**Fix:** Keep the table, change the contract: it is an evidence log for pledge fulfillment (like evidenceUrl), not a treasury system. The economics section (build order #10) reads Base/Hypha; it may LINK to receipts, never sum them as a balance.

### [LOW] Map contact relay privacy posture

**Issue:** Reply-To exposes the sender's email by design, message bodies are stored and admin-readable, and there is no per-pair block — all three flagged by the design itself, but they land in v1 with real members.

**Fix:** Ship v1 with: compose-screen disclosure of the Reply-To behavior, a retention variable for message bodies, and the block-list noted as a pre-scale requirement in the admin tab itself. Fold the GDPR retention question into the same legal review pass the credit modules already need.

### [LOW] Preview-lifecycle leakage has no enforcement

**Issue:** module-framework states the rule (no addActivity/notify calls unless lifecycle >= members) but admits it is review-enforced only. Feed, Library, and Stays all emit Pulse entries and would leak preview-module activity to the public feed.

**Fix:** Cheap structural fix instead of a lint: route module Pulse emissions through a helper (moduleActivity(moduleId, ...)) that checks effectiveLifecycle before delegating to addActivity/recordEvent. One function, leak becomes impossible rather than reviewed-for.

## Sequencing notes

- DECISION GATE (this week, before any build session): Rye ratifies the enum→registry amendment (tokenId varchar FK + governance closed enum + transfer-row shape) and the Hypha-only posture for anything share-like (Exchange's top open question). Both are ~30-minute conversations that unblock or re-scope half the portfolio. Nothing token-touching starts without them.
- Session 1 (foundation): test harness bootstrap + Phase 1b begins — first low-risk domain cutover (users/auth) and the server/index.ts split starts (Phase 1c rides along per the plan). This is the safety net every later session assumes.
- Sessions 2-4 (foundation = keystone): Token Registry + Ledger v1, rebudgeted to 3 sessions. This IS Revision 3 build-order step 2 and 3 — tokens/ledger_accounts/token_ledger DDL, byte-exact idempotency-preserving JSON import, postTransfer(), rewire quest consent + gratitude send, boot invariants (hypha-never-mints, pay-at-send XOR release), pinned tests (loop e2e green, cycle close writes zero ledger rows), then the Tokens/Ledger admin tabs + reconciliation panel. Nothing else in the portfolio may touch token_ledger DDL after this.
- Session 5: Health Dashboard S1 ONLY, pulled forward — recordEvent() + health_events born DB-native + convert the 11 addActivity call sites + the activity-table actor/entity columns (shipped once, here, not again in Feed). Every subsequent module emits through it; the data is unrecoverable retroactively, which is why this jumps the queue. The dashboard UI stays where the design put it (much later).
- Sessions 6-7: module-framework v1 (registry + module_settings + requireModule + boot reconciliation; then Admin Modules tab + hypha.org_url/shared/hypha.ts/HyphaLink + ModuleProvider/nav wiring + the CoCreatorsGuide DHO refactor). module_settings goes DB-native (skip data/modules.json — the DB is live for new tables). All '<module>.enabled' game variables across the other designs are void from this point.
- Session 8: tools module as the framework's reference consumer — module-framework's S3 merged with tools-hub's extras (CRUD registry, audience visibility via canSeeTool, click beacon, SSRF-guarded link check, icon upload). First visible member-facing win of the batch; proves registry→enable→nav→route→config end-to-end.
- Sessions 9-11 (foundation, interleavable with track A below): remaining Phase 1b cutovers — quests domain; gratitude domain INCLUDING the sendGratitude() service extraction (Feed's prerequisite), gratitude_log kind/context columns + heart unique index, and Revision 3's cycle-key cleanup (int cycle FK, legacy_cycle_month) in one migration; then config-doc domains. Phase 1b is declared complete here; data/ stops being authoritative.
- PARALLEL TRACK A opens after Session 8 (no ledger writes, no forum, no capabilities semantics changes): Village Map v1 (5 sessions — circles as DB-native tables, not JSON). Safe to run interleaved with Sessions 9-11 and with Phase 3 because it touches disjoint domains; its only shared files are schema.ts/capabilities.ts key additions and Admin.tsx tab registration, which must be merge-coordinated, not simultaneous.
- PARALLEL TRACK B opens after Session 4: Stays v1 (3 sessions, includes shared server/lib/payments.ts Stripe plumbing built ONCE), then Exchange v1 rebudgeted to 3 sessions, buy-only (registry flags satellite + prices + BuyPanel + wallet page + manual orders), consuming payments.ts. Swap deferred to demand-triggered v2. Stays before Exchange because a real village needs lodging payments before credit swapping, and Stays exercises the keystone hardest (per-date idempotent consumption).
- Sessions ~12-13 (foundation): Phase 3 notification spine + scheduler, exactly as planned (insertNotification/dedupeKey, email, push, prefs, cron host). On landing, retrofit hooks land as small riders in already-shipped modules (stay low-balance, library reservation-ready, map contact) rather than new sessions.
- Sessions ~14-16 (foundation): Phase 4 forum + decision primitive, built WITH Feed's schema riders baked in (forum_threads kind/meta/imageUrl/heartCount, forum_thread_tags, forum_reports). The forum ships AS a module on the framework from birth — module-framework's own recommendation, and it validates the substrate under real load.
- Sessions ~17-19: Gratitude Feed v1 (3 sessions) immediately after the forum — its hard deps (forum tables, sendGratitude service, gratitude_log columns) are all satisfied by construction at this point. This is the correct 'Phase 4.5' slot the design itself claims.
- PARALLEL TRACK C (any time after Session 4 + the capabilities gate change): Badges. FIRST a standalone gate-semantics session (badgeCapabilities/badgeDenies in hasCapability, Rye-approved, serialized against all other capabilities.ts edits), then Badges v1 sessions 2-4. Its cycle-close evaluation hook is safe because cycle close is shipped and idempotent.
- PARALLEL TRACK D (after Session 4, serialized within itself, parallel-safe vs Map/Feed/Badges): Material Library v1, 6 sessions, believed at face value — it is DB-native, transaction-hungry, and correctly self-sequenced after the repository pattern exists. Do not start it before the keystone's transactions are real MySQL transactions.
- Sessions late: Health Dashboard v1 remainder (S2-S4, 3 sessions) after a few lunations of health_events have accumulated and the ledger system accounts exist — its economy metrics then read real data instead of fabrications. It feeds directly into the plan's command centre (build order #11), which should consume it rather than duplicate it.
- DEFERRED: Crowdpool Commitments entirely, until a regen-civics campaign is actually scheduled and the webhook/export contract exists in that repo as a doc. Its v1 alone is realistically 5-6 sessions and its trigger event has not occurred; the only pre-work worth doing now is agreeing the material-library draft-item back-ref shape (one paragraph, not a session) so neither schema freezes wrong.
- Serialization rules for all parallel tracks: (1) any session touching token_ledger/tokens DDL is exclusive — after Session 4 that set must be empty; (2) shared/capabilities.ts semantic changes are exclusive (Badges gate session); key ADDITIONS are merge-coordinated; (3) schema.ts, shared/gameVariables.ts and Admin.tsx are append-only merge points — tracks may run in parallel weeks but their PRs land serialized; (4) anything emitting public activity from a preview-lifecycle module is blocked until the moduleActivity() guard exists (one hour of work in Session 6).
- Revised portfolio arithmetic: foundation remaining ≈ 10 sessions (1b/1c completion, Phase 3, Phase 4), modules v1 ≈ 32 sessions (keystone 3, framework+tools 4, map 5, stays 3, exchange 3, library 6, feed 3, badges 4+1 gate, health 1+3), crowdpool deferred, all v2 backlogged behind demand. First visible member-facing ship is Session 8 (tools hub); first money-touching ship is around Session 12-14 (Stays with Stripe) — both early enough to keep momentum while the foundation lands underneath.
