# game-amora — Architecture of the shipped system

> The canonical description of what is actually running. Everything here is
> verified against the code in this repository as of build marker
> `2026-07-28-s66-launch-round` (`server/index.ts:216`, platform `1.0.0` per
> `server/lib/identity.ts:26`). Where an older planning document disagrees
> with this file, this file wins; where this file disagrees with the code,
> the code wins and this file has a bug — fix it.

---

## 1. What the platform is

A white-label village-coordination platform. One Node process serves a React
19 SPA and an Express API over MySQL. The product is a loop: someone arrives,
finds a path, does useful work, a human consents to it, recognition carries
value, they do more. Around that loop sit eleven optional modules — map,
forum, feed, stays, exchange, library, badges, health, automation, network,
tools — every one of which ships OFF and is enabled per deployment by an
admin. Real value
(equity, voice) lives on Hypha and is only ever displayed here; the
platform's own ledger is double-entry-lite with conservation provable at
every boot. "Amora" is merely the first tenant: identity is an overlay,
behaviour is data, and a fork inherits the platform by pulling, not by
find-and-replace.

---

## 2. The one-page map

**Processes.** Exactly one: `dist/index.js` (esbuild bundle of
`server/index.ts`, `--packages=external`, see `package.json` `build`). It
runs migrations, serves `/api/*`, serves the built SPA from `dist/public`,
and hosts the scheduler. One process per deployment (Railway) is a
load-bearing assumption: the S12 store caches are sound *because* there is
no second writer (`server/repos/store-db.ts:21-23`). MySQL is the only
authority; the `data/` volume holds only uploads and archived JSON
(`docs/FORK_RUNBOOK.md` "Backups").

**Directories.**

| Path | What lives there |
|---|---|
| `server/index.ts` | The one Express server (~8,400 lines): auth, routes, boot |
| `server/lib/*` | Domain libraries: ledger, modules, payments, exchange, notify, scheduler, events, secrets, identity, launch, feedback, exit, health, … |
| `server/db/` | `migrate.ts` (the engine), `testDb.ts` (S5 harness), `schema.ts` |
| `server/repos/` | `store-db.ts` (MySQL-authoritative, memory-cached, write-through stores), `users.ts`, `quests.ts`, `gratitude.ts` |
| `server/seeds/` | Fork-onboarding seeds (content, quests) — a declared brand home |
| `shared/` | Isomorphic registries: `modules.ts`, `capabilities.ts`, `gameVariables.ts`, `gameConfig.ts`, `launchRequirements.ts`, `hypha.ts`, `lunar.ts` |
| `client/src/` | React 19 + Vite + wouter SPA; `modules/ModuleProvider.tsx` is the client's one module-truth source |
| `drizzle/` | Numbered SQL migrations `0001`–`0031`, applied by the custom runner |
| `scripts/` | `check-brand-refs.mjs` (the ratchet), `run-migration.ts`, `smoke-all-modules.mjs`, `enable-all-modules.mjs` |
| `docs/` | This file, `FORK_RUNBOOK.md`, `FEEDBACK_HUB_CONTRACT.md`, per-module design docs |

**Request path.** SPA → `/api/*` → (1) the raw-body Stripe webhook, mounted
*before* `express.json()` (`server/index.ts:2167`) → (2) `express.json`
(1 MB cap) → (3) automatic admin audit middleware — any non-GET under
`/api/admin` that succeeds writes an attributed audit event
(`server/index.ts:2186-2202`) → (4) CORS → (5) `requireModule(id)` for
module-prefixed routes → (6) per-route auth (`authedUser` /
`isAdmin`) and capability checks (`hasCapability` over `capabilityCtx`) →
(7) handler → repos/pool. Async handler rejections are routed to the error
pipeline by a one-time patch of the four registration verbs
(`server/index.ts:2141-2156`); the terminal handler answers JSON 500.

**Boot sequence — in order, all fail-loud** (`startServer()`,
`server/index.ts:1845`):

1. **Migrations** (1852–1863). `applyPending` from `server/db/migrate.ts` —
   the same engine the CLI (`pnpm db:migrate`) and the test harness use.
   No `DATABASE_URL`, or any migration failure → the process throws and
   never serves. Ledger table: `_migrations_applied`.
2. **Token registry** (1868). `loadTokenRegistry` reads the `tokens` table
   into memory; `ensureStayToken` / `ensureLibraryToken` create module
   tokens even while their modules are off, so rewards never race an enable
   click (1871–1872).
3. **Ledger invariants refuse boot** (1873–1880). `checkLedgerInvariants`
   (`server/lib/ledger.ts:575`); any problem → throw, do not serve. "A
   server that boots over a broken ledger normalizes the break."
4. **Stores + variables** (1883, `initStores` at 669). Every S12 repo cache
   fills (roles, brand, season, settings, …) plus `loadVariables`.
5. **Instance identity** (696). `ensureInstanceIdentity` mints-or-reads the
   permanent UUID.
6. **Secrets** (703). `loadSecrets`, plus a one-time migration of legacy
   keys out of the email-config document (704–724).
7. **Scheduler** (1887–1941). Seven jobs registered — among them
   network-sync (6 h), which sleeps while the network module is off — then
   `startScheduler`.
8. **Module framework** (1946–1958). `loadModuleSettings`,
   `assertModuleGraph` (loud demotion, one-seller-per-token assertion),
   `wireModuleAuth`, then server-side `openStateCheck` closures are attached
   to stays/exchange/badges/library.
9. **Economy firewalls re-proven** (1963–2001). `assertExchangeFirewalls`,
   `assertBadgeInvariants`, `assertLibraryInvariants`; then
   `repairTaintedListings` (auto-delist, loudly — automated authority may
   narrow the market, never widen it), `assertSwapFirewalls`,
   `reconcileSwapOrders`.
10. **Payment handlers** (2007–2106). stays and exchange register
    settle/reversal with the trio.
11. **Seeds** (2111). Quest library seeds only into an *empty* table.
12. **Routes serve** (2130 onward). Express app, webhook seam, middleware,
    ~200 routes, static SPA fallback, `server.listen` on `PORT || 3000`
    (8495–8505).

---

## 3. The subsystems

### 3.1 The ledger keystone — `server/lib/ledger.ts`

**What it is.** Every token movement is a transfer FROM one account TO
another, amount a strictly positive integer, in `token_ledger`.
`token_balances` is a cache. Two disciplines carried from regen-civics
(file header, lines 14–20): **recompute, never increment** (both touched
balances are rewritten from `SUM(transfers)` inside the posting
transaction), and **every write carries an idempotency key** (the UNIQUE
index is the dedupe; a replay returns `duplicate: true`, it never posts
twice).

**Accounts.** `mem:<userId>` (materialised on first touch), and system
accounts that must already exist — a typo'd system id is an error, not a new
account. Faucets may run negative and their negative balance IS
issued-to-date supply: `sys:gratitude-pool`, `sys:cycle-pool` (seeded by
`drizzle/0009`), `sys:mint` (0011), `sys:library-mint` (0024). Deliberately
NOT faucets: `sys:treasury` (an ordinary vault — selling more than was
stocked *fails*, out of stock is never a mint), `sys:exit-settlement`
(0027), `sys:library-escrow/pool/sink` (0024). Conservation is therefore
checkable: per token, `SUM(balance)` over all accounts ≡ 0.

**`postTransfer`** (ledger.ts:212). One leg, one transaction: lock accounts
`FOR UPDATE`, insert the transfer (UNIQUE key rejects replays), recompute
both balances in sorted order (deadlock avoidance), overdraft-check the
sender. Non-faucet accounts can only go negative when the caller sets
`allowNegative` AND the source is in `ALLOW_NEGATIVE_SOURCES` — a static set
of exactly `{"stay_night", "payment_reversal"}` (ledger.ts:144), extended
only by a reviewed one-line change, never at runtime.

**`postTransferPair` + `PairGuard`** (ledger.ts:333). Exactly two legs, one
transaction — built for swaps, where sequential `postTransfer` calls could
debit without crediting. Fixed at two legs on purpose: "a generic N-leg API
is what makes a router easy to build, and a router is an automated market
maker wearing a helper function." Rules enforced inside the primitive:
`allowNegative` is illegal in a pair (a swap may never create debt, line
366); the two keys must differ; one sorted `FOR UPDATE` over the deduped
account union (lock first, create member accounts second — the shared-lock
upgrade deadlock is designed out, 385–407); a partial idempotency collision
(one of two keys already present) *refuses* rather than guesses (456–460);
every non-faucet sender is overdraft-checked; deadlock victims retry up to
three times. The `PairGuard` is a veto closure that runs *inside* the
transaction after the locks — for limits living outside the ledger
(per-cycle swap caps), so check-then-act races are impossible (418–424).

**Registry.** The `tokens` table is the registry; the in-memory map is a
boot-loaded cache refreshed by `registerToken` (table first, then reload —
"the table is the truth", ledger.ts:99–113). `tokenDef()` returning
undefined means "not a token" and callers must fail loud: `validateLeg`
refuses unknown slugs outright ("a typo that silently became 'gratitude'
would be a mint bug wearing a coercion costume", 200–204) and refuses to
move any `governance: 'hypha'` token.

**Boot invariants** (`checkLedgerInvariants`, 575–616), all five re-proven
at every boot: (1) hypha tokens have zero ledger rows; (2) no orphan token
slugs; (3) conservation ≡ 0 per token; (4) cache agrees with recomputation;
(5) no non-faucet account is negative without an `ALLOW_NEGATIVE_SOURCES`
debit explaining it.

**Extending it.** New issuance = a new `source` string and an idempotency
key grammar (`ord:<id>:leg1`, `exit:<id>:sweep:<token>` are the house
patterns). Never add a balance column anywhere else; never touch
`token_balances` by hand — recompute. If a flow genuinely needs debt, that
is a reviewed edit to `ALLOW_NEGATIVE_SOURCES`, nothing less.

### 3.2 The module framework — `shared/modules.ts` + `server/lib/modules.ts`

**What it is.** ONE registry of everything the platform can be
(`MODULES`, shared/modules.ts:62): four core modules (quests, gratitude,
progression, profiles — listed for catalogue honesty, not disableable in
v1, always served `public`) and eleven optional ones (map, forum, feed,
stays, automation, health, library, badges, exchange, network, tools). Per-module
`<module>.enabled` game variables from older design docs are void:
enablement lives in `module_settings` and nowhere else (file header, lines
1–10).

**Lifecycle.** `off | preview | members | public`, rank-ordered
(`LIFECYCLE_RANK`). Semantics (server/lib/modules.ts:9–17): `off` → routes
404, zero nav, variables hidden; `preview` → admins only, and non-admins
get the *identical* 404 body so the catalogue of what a village is trying
never leaks; `members` → signed-in only (anon gets 401 so the client can
prompt login); `public` → everyone, per-route capability checks still apply.
**Absent row = OFF** — delta-only, so every fork inherits each new platform
module as off, and enabling is always a recorded admin act
(`module_events`).

**The gate.** `requireModule(id)` (modules.ts:167) is mounted once per API
prefix declared in the registry's `apiPrefixes`. The Stripe settlement
webhook is NEVER mounted behind it — in-flight orders must settle even when
a module was just disabled.

**Demotion, not bricking.** `effectiveLifecycle` (modules.ts:78) serves a
module whose hard dependency is off as OFF regardless of its stored row;
`assertModuleGraph` (125) logs demotions at fatal volume, lists orphan ids,
and *throws* only for the one-selling-module-per-token violation.

**Writes.** `setModuleLifecycle` (203): core refuses; enabling requires
every hard dep non-off (409 with `missing`); a `legalReview` module refuses
to leave off while a shared password is the only admin credential (403);
disabling refuses while dependents are non-off (409) or while
`openStateCheck` reports open economic state (409 with settle-first
guidance). `setModuleConfig` runs the module's `validateConfig` first. Both
append `module_events` rows.

**The preview-leak guard.** Module code emits public activity through
`moduleActivity` (303), which is a structural no-op below `members` — "a
structural no-op beats a review-enforced rule."

**Registry entry surface** (`ModuleDef`, shared/modules.ts:23–60): `id`,
founder-facing `name`/`description` (platform copy, never a village brand),
`core`, `requires` (hard, blocks both directions), `recommends` (warn only),
`capabilities` (keys ADDED to the one gate — never a second permission
mechanism), `variableKeys`, `apiPrefixes`, `hyphaLinks`, `legalReview`,
`hyphaOnly`, `sellsToken` (at most one selling module per token,
boot-asserted), `validateConfig`, `defaultConfig`, `openStateCheck`
(attached server-side at boot for the four modules that need the pool,
`server/index.ts:1955-1958` — the shared file stays import-clean for the
client bundle).

### 3.3 The ONE capability gate — `shared/capabilities.ts`

Thirteen capability keys; `ALL_CAPABILITIES` is the canonical value the
badge validator and unlock diffs iterate (keep the union and the array in
lockstep, lines 38–55). `hasCapability` (93) is pure and isomorphic, and its
order of authority IS the policy (Gate E, shipped S36):

1. `isAdmin` → true (the operator can always act — a real role on the user
   record, never a parallel path);
2. `badgeDenies` → false (a warning badge's deny beats role AND stage
   grants — "a warning that a role trivially overrides is not a warning";
   only admin outranks it);
3. `roleCapabilities` → true (appointments);
4. `badgeCapabilities` → true (earned/granted badges);
5. stage unlock (`STAGE_UNLOCKS`, deliberately only a handful of real
   gates) → true;
6. otherwise false.

Server side, `capabilityCtx(user)` (`server/index.ts:1237`) builds the
context once per request; badge grants/denies are only queried while the
badges module is non-off — off means the gate is byte-identical to its
pre-badges self. Modules extend the union; they never invent a second
mechanism.

### 3.4 The five config planes

Each plane exists for a different kind of fact. Do not move facts between
planes.

1. **Identity — `shared/gameConfig.ts`.** Names, paths, the stage ladder,
   images. Code, "the white-label swap point". Not admin-editable; changing
   the stage ladder is a fork of the game, not a re-skin
   (`docs/FORK_RUNBOOK.md` "NOT overlayable").
2. **Brand overlay — the `brand` document.** Edited by the admin Setup
   Wizard, merged over gameConfig by `mergedConfig()`
   (`server/index.ts:1090`): a blank field inherits the platform default,
   so a fork overrides only what differs. Served through `/api/game/config`
   and read by every email, page and the network handshake.
3. **Behaviour — `shared/gameVariables.ts` + `server/lib/variables.ts`.**
   Every tunable number/toggle/threshold as data, typed and bounded, edited
   from Admin without a deploy. **Delta-only**: only changed values are
   stored in `game_variables`; setting a value back to its default DELETES
   the override so the fork keeps inheriting future platform defaults
   (variables.ts:94–99). Readers are synchronous against the boot-loaded
   cache; unknown keys throw — "a typo must not read as 0" (37–41).
4. **Module structural config — `module_settings.config`.** Validated JSON
   per module (`validateConfig`), seeded from `defaultConfig` — forum
   categories, tools categories, the exchange's `tradingEnabled` +
   version-stamped `legalAck`.
5. **`app_config` documents + integration secrets.** Singleton JSON
   documents in `app_config`: exit policy, the `runOnce` data-migrations
   ledger, email config and the like go through `dbDocument` repos, while
   instance-identity and launch-state are raw INSERT/SELECT rows written
   directly by `server/lib/identity.ts` and `server/lib/launch.ts`;
   and `server/lib/secrets.ts` (S63) for third-party keys:
   `stripe_secret_key`, `stripe_webhook_secret`, `resend_api_key`,
   `assistant_api_key`. The one rule: **a secret is write-only.** Reads
   return `{configured, last4, source, setBy, setAt}` and never the value;
   the value leaves the module only toward the service it belongs to
   (secrets.ts:65–73). Resolution is admin-typed first, env fallback second
   (the env names `FORK_RUNBOOK.md` has always documented). Storage is
   plaintext JSON in `app_config` — masked-read without encryption-at-rest
   was an explicit decision (2026-07-27); revisit if backups leave the
   trust boundary.

The store substrate under planes 2 and 5 is `server/repos/store-db.ts`:
MySQL-authoritative, memory-cached, write-through; reads synchronous, writes
async and *renamed* (`replaceAll`, `put`) so the compiler forces every write
site through the conversion.

### 3.5 The event spine — `server/lib/events.ts`

`recordEvent()` is the ONE way anything lands in the village's history. The
public Pulse and the admin audit trail are the same `health_events` table
split by `audience`. Every row can carry WHO (`actorUserId`) and WHAT
(`entityType`/`entityRef`). Recording never throws into the caller — "an
event is a trace of a mutation that already happened" (events.ts:8–10).
Admin mutations under `/api/admin` are audited automatically by middleware
(`server/index.ts:2186`); richer endpoints still write their own rows.
Module code must emit public activity via `moduleActivity`, never
`recordEvent` directly, or preview leaks.

### 3.6 The notification spine — `server/lib/notify.ts`

Fresh implementation of regen-civics' *rules* without its warts (header,
lines 1–25): `dedupe_key` is NOT NULL with a real UNIQUE index (one stable
key per event+recipient; a retried producer inserts exactly once, forever);
delivery is an explicit dispatch step after a fresh insert, never a side
effect; preferences are one typed, junk-tolerant model
(`resolveNotifyPrefs`). `DAILY_EMAIL_CAP = 20` per rolling 24 h — over the
cap the in-app row still exists, only the email drops. Cadence per type
(`emailCadenceFor`, 69–96): quests/roles/mentions/replies immediate by
preference, gratitude/stage daily, `thread_activity` in-app only,
`payments_alert` and `restorative_intake` always immediate, unknown types
in-app only. The daily digest job batches unread, never-emailed rows from
the last 3 days. `emailed_at` is stamped even when the provider quietly
declined — a late retry email surprises more than a missed one. Tombstones
and claim-pending accounts (no `passwordHash`) get no email.

### 3.7 The scheduler — `server/lib/scheduler.ts`

ONE mechanism, deliberately (regen-civics ran two, unlocked). A registry in
code (`registerJob`), a ledger in the database (`scheduled_jobs`), one claim
rule: every 5-minute tick, `UPDATE scheduled_jobs SET last_run_at = NOW()
WHERE job = ? AND (last_run_at IS NULL OR last_run_at <= ?)` —
`affectedRows` says who won. Restart-safe, multi-process-safe, runs when
DUE not N ms after boot. **What it will never do, written down so nobody
"helpfully" adds it** (24–31): it does NOT close gratitude cycles
(settlement releases value and is an explicit admin act, `POST
/api/admin/cycles/close`), and it does NOT roll seasons (compute-on-read by
design). Registered jobs (`server/index.ts:1887-1941`): notification-digest
(24 h), retention-sweep (24 h), stay-nightly (1 h, idempotent by keyed
ledger legs), exchange-reconcile (1 h — a reaper, never a settler),
feedback-relay (15 min), network-sync (6 h — `syncPeers`,
`server/index.ts:1928`, early-returns while the network module is off),
recording-rss (6 h, purely additive ingestion). Jobs for off modules return
early.

### 3.8 The payments trio — `server/lib/payments.ts`

Built once (S32), consumed by every fiat module. Three responsibilities:

1. **Checkout.** Stripe Checkout Sessions via the REST API — no SDK. Every
   session is stamped `metadata {module, orderId}`; the webhook dispatches
   on nothing else. Money math: **rounding favours the treasury** —
   `ceilMinor` what the member pays, `floorTokens` what the member receives;
   the property test asserts no round trip extracts value.
2. **Settlement + reversal.** ONE raw-body webhook
   (`POST /api/webhooks/stripe`, mounted before `express.json`,
   `server/index.ts:2167`). Signature verification is a manual HMAC of
   Stripe's v1 scheme over the RAW body with a 5-minute replay tolerance and
   `timingSafeEqual` (payments.ts:97–117). **Fail closed:** a missing
   webhook secret is a misconfiguration, not permission — unsigned events
   are rejected 400 and admins alerted (183–190). Event-level dedupe rides
   the UNIQUE `stripe_event_id` in `payments_log`; a failed dispatch
   *releases* the dedupe claim and answers 500 so Stripe retries — ledger
   keys make the retries safe (266–277). Disputes and refunds are
   **mechanical**: the module's reversal handler claws back exactly what was
   granted (negative balances are the truthful state), the buyer is
   auto-suspended on disputes — but not for refunds the village itself
   issued (the `villageInitiated` check, 240–253) — and admins are notified.
   Never manual reconstruction.
3. **Limits.** `assertCanPurchase` is one cross-module helper over
   `fiat_charges`: suspension check, per-order / 30-day / annual caps from
   the three `payments.purchase_limit_*` variables. "Limits that only see
   one module are theater." (Note: here a 0 variable disables that cap;
   the fail-closed-zero rule belongs to *swap* caps — §3.10.)

Modules plug in via `registerPaymentHandlers(moduleId, {settle, reversal,
renew})`; stays, exchange and commerce register at boot. Settle handlers
throw when the order does not exist ("refusing to settle into thin air") and
when the treasury is under-stocked — out of stock surfaces via webhook
retries, never a mint.

#### What a settle handler has to get right

Six rules, each of which was learned by getting it wrong. Any new fiat module
inherits all six.

1. **The period key comes from Stripe, never from a counter.** A failed
   dispatch releases the dedupe claim, so attempt 2 must compute the SAME key
   as attempt 1 or it will look like a fresh charge and pay out twice.
   Precedence is invoice id → payment intent → event id. Note *where* the
   invoice id lives: on a checkout session it is `obj.invoice`, but on an
   `invoice.paid` event the object IS the invoice, so it is `obj.id`.
2. **Completed is not paid.** `checkout.session.completed` arrives with
   `payment_status: "unpaid"` for SEPA, ACH and Boleto, sometimes days before
   the money moves. Deliver on `paid`/`no_payment_required`;
   `checkout.session.async_payment_succeeded` brings the confirmation.
3. **Money in, then goods, then the mark.** Record the charge, attempt
   delivery, and only then record the period as settled. Marking first makes
   a failed delivery permanent; a retry would skip it and the member never
   receives what they paid for.
4. **Mark it in one statement.** `JSON_ARRAY_APPEND … WHERE NOT
   JSON_CONTAINS` under the row lock. Reading a JSON array in one query and
   writing it back in another loses keys when two deliveries interleave, and
   the counter beside it drifts out of agreement with the list.
5. **Reversal claws back only what was delivered.** Because rule 3 records
   the money before the goods, a charge row can exist with nothing granted
   behind it. Clawing back anyway drives the member negative for tokens they
   never held and hands the treasury stock nobody issued — and no boot
   invariant catches it, since conservation still nets to zero and
   `payment_reversal` is on the allow-negative list.
6. **A renewal re-asks checkout's questions.** The renew handler runs the
   same body months later: re-check that the product is active, the token
   still legally sellable, the buyer not suspended. A refusal banks the money
   and withholds the goods with a loud admin alert — it must NOT throw, or
   Stripe retries a decision forever.

A partial `charge.refunded` is not a reversal: compare `amount_refunded` to
`amount` and treat anything less than the whole as money moving, not a
purchase unwinding.

#### Claim versus completion

`payments_log.stripe_event_id` is UNIQUE and the row is written *before* the
work, so a replay is a no-op. But a claim is not a completion: if the handler
throws the claim is deleted and Stripe retries, while if the **process dies**
nothing deletes it and the retry is answered "duplicate" for work that never
happened. `handled_at` (0038) separates the two — an unstamped claim past
`CLAIM_GRACE_MINUTES` is abandoned and the next delivery is allowed through.
The retention sweep never deletes an unstamped row, at any age.

### 3.9 Data lifecycle — retention, export, anonymisation, exit

- **Retention** (`runRetentionSweep`, `server/index.ts:1539`): daily job
  driven entirely by variables — `retention.submissions_days`,
  `map.contact_retention_days` (contact bodies), and
  `retention.notifications_days` (read rows only). 0 disables a sweep.
- **Export** (`GET /api/profile/export`, 8432): everything the village
  holds on the member — profile minus secrets, stage, claims, gratitude
  both directions, full signed ledger, balances, stage events, submissions,
  notifications, preferences — as a downloadable JSON (Law 8968 posture).
- **Anonymisation = deletion** (`anonymizeMember`, 1585). Value rows are
  NEVER deleted — conservation must keep holding — so the member row
  becomes a tombstone (name/email/handle scrubbed, password removed,
  `tokenVersion` bumped so every session dies) and every denormalised trace
  is scrubbed: gratitude names, claim names, ledger descriptions (keyed by
  structured refs, never string matching), submission PII keys, tool
  clicks, role seats. PUBLIC pulse lines naming them are deleted; ADMIN
  audit rows are kept as the legal record.
- **Member exit** (`server/lib/exit.ts`, S52/F12): `openStateCheck`
  semantics applied to a person. ENUMERATE every domain's open state
  (loans, stays, orders, debts block; balances, roles, warnings inform);
  SETTLE through each domain's own terminals — exit adds exactly ONE move
  of its own, sweeping positive balances to `sys:exit-settlement`,
  idempotent per `(exit, token)`; RESOLVE refuses until clean, then the
  anonymise tombstone runs. Restorative content flows only to its
  recipients; the `exits` row carries a pointer and a status, never the
  content.

### 3.10 The exchange and the swap firewalls — `server/lib/exchange.ts`

Buy-only shop by default: stock moves `sys:mint → sys:treasury` (under the
same per-cycle mint cap as hand-mints), sales `sys:treasury → buyer`; the
treasury is not a faucet, so over-selling fails the settlement. The
firewalls are enforced at write time AND re-proven at boot so a hand-edited
row can never outlive a deploy (`tradingProblem`, 101–117): recognition
never trades; hypha tokens never trade; a token another module sells cannot
be listed; `NEVER_LISTED` statically bans `library-credit` (backed by
shelves). Swapping adds the structural faucet test
(`faucetIssuedTokens`, 139–147): the rule is about **destination, not
source names** — `faucet → sys:treasury` is stocking a shop; `faucet →
anything else` is issuance, and an issued token is permanently unswappable
at every privilege level ("a source-name allowlist rots"). Swap caps are
**fail-closed: 0 means ZERO, never unlimited** (`ExchangeSettings`, 44–47).
Trading itself is a per-deployment opt-in (`tradingEnabled` in module
config) behind a version-stamped legal card — `TRADING_CARD_VERSION`
(`server/index.ts:224`); an acceptance of any other card version is refused
(2730–2739). At boot, `assertSwapFirewalls` treats trading enabled under
shared-password posture as a PROBLEM and refuses to serve — it throws
(exchange.ts:730–748); only a stale card version is a mere warning that
closes swapping while the rest of the village keeps serving (739–744).
Quote math is receive-driven, ceil-on-pay, BigInt throughout via `BigInt()`
calls, not literals (exchange.ts:454–463).

### 3.11 Instance identity — `server/lib/identity.ts` (S62)

Everything cross-instance needs one stable answer to "which village said
that?". A URL is not it and a name is not it; the identity is a UUID minted
once at first boot (`INSERT IGNORE` into `app_config`, re-read; idempotent
under concurrent boots) and never regenerated. **Deliberately not
configurable**: an admin-editable id lets deployments impersonate one
another, an env var mints a new identity whenever an operator forgets to
pin it (file header, 10–16). `PLATFORM_VERSION` (`1.0.0`) is the contract
semver, distinct from each fork's `BUILD_MARKER`: peers and the hub compare
versions, humans read markers. Bump MINOR for additive endpoint/field
changes, MAJOR for anything a peer could break on.

### 3.12 Launch requirements — `shared/launchRequirements.ts` + `server/lib/launch.ts` (S62)

"What's left before launch?" as DATA. The registry declares WHAT must be
true (id, group, founder-facing copy, `severity`
blocking/recommended/optional, `checkKey`, `fixAt`, optional
`appliesWhenModule` and `runbookAnchor`); the server observes WHETHER it is,
via check closures injected from `server/index.ts` (`launchDeps`, 4213 —
they need the boot-loaded caches, and importing them into launch.ts would
be a cycle). Three consumers render it — the Journey to Launch page, the
admin banner, Maia's launch-guide mode — and none may invent an item.
`manual:*` checks (DNS, backup drill) are confirmed by a named admin, who
and when recorded. A registry entry with no wired resolver fails VISIBLY on
the page as a platform bug rather than silently dropping (launch.ts:107–112).
"Mark launched" is a one-way founder act gated on every blocking item; it is
deliberately not auto-derived, and the flag's one consumer is the admin
banner — nothing else may branch on it (launch.ts:14–19). Module-gated
requirements appear and withdraw with the module's lifecycle.

### 3.13 The feedback spine — `server/lib/feedback.ts` (S66)

Bugs and ideas from `/feedback` are captured locally ALWAYS
(`feedback_items`); a copy relays to the platform hub every 15 minutes only
while the `platform.feedback_relay` variable stays on. The relay honours
two people at once: the village admin always keeps the full local queue,
and the hub sees CONTENT, never people — the payload carries instance
identity (id, version, build, public name) and item text; `submitted_by`
never leaves the village. Queue-and-forget mechanics: batches of 50 oldest
first, `relayed_at` set only on a 2xx, 10-second timeout, any failure is a
log line and a natural retry — "the hub is a listener, not a dependency."
The 40-hex `fingerprint` (sha256 prefix over kind + normalised text) lets
the hub collapse forty villages hitting one crash into one counted issue.
Hub URL: `FEEDBACK_HUB_URL` env, default the ReGen Civics hub. The hub-side
obligations (durable-store-then-2xx, idempotent on
`(instanceId, localId)`, treat `name` as untrusted) live in
`docs/FEEDBACK_HUB_CONTRACT.md`.

### 3.14 The white-label discipline

- **The rule** (invariant 2.1 #2): identity in `shared/gameConfig.ts`,
  behaviour in `shared/gameVariables.ts`, per-deployment data in DB rows
  and seeds. A fork inherits the platform by pulling; a welded-in village
  name travels with it.
- **The guard** — `scripts/check-brand-refs.mjs`, run in CI. Three zones:
  **hard-clean** (`server/lib/**`, `shared/**` except the declared identity
  home, and every file not in the baseline — any hit fails), **declared
  homes** (gameConfig, seeds, docs, markdown — brand belongs there), and
  the **ratchet** (`server/index.ts`, `client/`, `drizzle/`, test fixtures
  — counts may only ever DECREASE against the committed baseline;
  `--update-baseline` after removals). The guard reads CODE, not
  commentary: provenance comments are counted and reported, never failed;
  genuine false positives carry an inline `brand-ok: <reason>`. Forks
  extend the `BANNED` list with their own terms.
- **The overlay.** The Setup Wizard ("Make This Yours") writes the brand
  document; `mergedConfig()` overlays it on gameConfig; blank inherits.
  Wizard order and the not-overlayable list are in `FORK_RUNBOOK.md`.
- **The handshake** — `GET /api/platform/info`
  (`server/index.ts:4187-4206`): public, unauthenticated; name/tagline
  /location from the merged overlay (never a literal), `instanceId`,
  `version`, `build`, the served module list, and whether Hypha is
  configured. A future village directory reads it; the fork smoke test
  reads it to prove no code path hardcodes a brand.
- **The runbook** — `docs/FORK_RUNBOOK.md` is a living document: every
  session that adds an env var, seed, or provisioning step appends one
  line. Env table, token naming (Gate D), backups (restore-verified daily
  dump), `enable-all-modules.mjs`, the 47-check
  `smoke-all-modules.mjs`, and the trading caution table live there.
- **The Hypha boundary** — `shared/hypha.ts`: one root variable
  (`hypha.org_url`), four named deep links derived by convention, each
  overridable; blank root hides every Hypha surface so a dead governance
  button is impossible. The platform reads, displays and deep-links; it
  never posts, mints, moves or prices anything Hypha governs.

---

## 4. Modules: how to add one, how to remove one

### Adding a module end-to-end

1. **Registry entry** in `shared/modules.ts`: id, founder-facing catalogue
   copy (platform language — the brand guard will hold you to it),
   `requires`/`recommends`, `apiPrefixes`, `variableKeys`,
   `capabilities`, and — as applicable — `legalReview`, `sellsToken`
   (remember: one seller per token is boot-asserted, and the exchange
   refuses to list what you sell), `defaultConfig` + `validateConfig`.
2. **Migration** in `drizzle/` — next number, plain SQL, one statement per
   `;`-at-end-of-line (see trap 1). Seed any system ledger accounts here
   with `INSERT IGNORE`, and say in a comment whether each is a faucet and
   why (0009/0024 are the model).
3. **Tokens.** If the module has a credit, create it via the token registry
   (`registerToken` / an `ensure<X>Token` called at boot *before* the
   invariant check, like `ensureStayToken`, `server/index.ts:1871`), and
   issue only through `postTransfer` with idempotency keys. No private
   balance columns — the framework gives modules no place to keep one.
4. **Routes** in `server/index.ts`, mounted behind
   `app.use("<prefix>", requireModule("<id>"))` for every prefix declared
   in the registry. Capability checks per route via
   `hasCapability(cap, await capabilityCtx(user))`. Settlement webhooks (if
   fiat) go through `registerPaymentHandlers`, never behind the module
   gate.
5. **Variables** in `shared/gameVariables.ts`, namespaced `<id>.*`, bounded,
   founder-readable descriptions. Admin hides the group while the module is
   off.
6. **Capabilities**: extend the union AND `ALL_CAPABILITIES` in
   `shared/capabilities.ts` (lockstep or badges cannot grant it), add a
   `STAGE_UNLOCKS` row only if the ladder should grant it.
7. **Public activity** through `moduleActivity(id, …)` only;
   notifications through `insertNotification` with a stable dedupe key and
   a cadence entry in `emailCadenceFor` if it should ever email.
8. **openStateCheck**: if the module creates economic state that must
   settle before disabling, attach the closure at boot next to the existing
   four (`server/index.ts:1955`), and add the member-level equivalent to
   `exitOpenState` if a departing member could hold it.
9. **Client**: page under `client/src/pages/`, gated by
   `useModules()`/`ModuleGate`; nav from the module manifest, never a
   hardcoded entry; the Admin Modules tab picks the module up from the
   registry automatically.
10. **Launch requirement** (only if a founder must act before the module is
    honest to run): one entry in `shared/launchRequirements.ts` + one check
    closure in `launchDeps` — every consumer updates itself.
11. **Docs + tests**: a design doc in `docs/modules/`, a runbook line for
    any new env var or seed, unit tests beside the lib, and a
    `smoke-all-modules.mjs` section.

### Removing (disabling) one safely

Disabling is the product's own flow — use it, do not hand-edit tables:
`setModuleLifecycle(id, "off")` refuses while (a) any non-off module still
`requires` it, or (b) `openStateCheck` reports open state (open loans,
active stays, pending orders, standing warnings), with settle-first
guidance. In-flight fiat orders still settle after the switch because the
webhook is outside the gate. Data is left in place — OFF hides surfaces, it
does not delete history; ledger rows are never deleted under any flow.
Removing a module from the *registry* entirely leaves its stored settings
row as a loudly-logged orphan (listed, never served) — acceptable for a
fork, but drop the row deliberately when you do it.

---

## 5. The standing invariants

1. **Fiat flows IN only.** Tokens are never sold back for money; there is
   no path out and adding one is not a setting — this is what keeps closed-
   loop credits from becoming securities-shaped.
2. **Hypha-governed tokens never trade and never move here.** The platform
   would otherwise quietly become the cap table's source of truth; refused
   in `validateLeg`, re-proven at every boot.
3. **Recognition is never buyable or swappable.** Appreciation with a price
   is a price, not appreciation (`tradingProblem`).
4. **Faucet-issued tokens never swap** — destination-based test, no
   override at any privilege level: what the village can conjure must never
   become a claim on goods someone paid real money for.
5. **One selling module per token**, boot-asserted — two sellers means two
   prices for the same promise.
6. **Swap caps fail closed: 0 = zero**, never unlimited — an unset cap must
   not be an open tap.
7. **Trading is per-deployment opt-in behind a version-stamped legal card**;
   amended terms force a re-read, and shared-password deployments cannot
   trade at all.
8. **Every module ships OFF; absent row = off.** Enabling is a recorded
   human decision, and forks inherit new modules dormant.
9. **Conservation ≡ 0 per token; recompute, never increment; every write
   carries an idempotency key.** The economy is checkable, not promised.
10. **Non-faucet accounts never go negative** except through the two
    statically-listed truthful-debt sources — a negative balance is a fact,
    never a convenience.
11. **Funds-bearing modules refuse to enable under shared-password
    posture** — money needs attributable humans.
12. **In-flight orders settle even when their module is off** — the webhook
    lives outside `requireModule`; a village's toggle must not eat a paid
    order.
13. **Value rows are never deleted.** Deletion is anonymisation; the
    tombstone keeps conservation and settlements explicable.
14. **Cycle close and season roll are never automated.** Releasing value is
    a human act; the scheduler's charter says so in writing.
15. **One gate, one ledger, one event spine, one scheduler, one webhook.**
    Any second mechanism for permissions, balances, history, cron or
    settlement is a bug by definition.

---

## 6. The trap list (all real, all paid for)

1. **Comment lines ending in `;` split SQL statements.** The migration
   runner splits on `;` at end of line and strips comment lines *before*
   splitting (`server/db/migrate.ts:30-42`) — but only full comment lines.
   Migration 0015 was cut in half by `-- …live in game_variables;`. Keep
   comments off statement tails; never end a comment line with `;`.
2. **PowerShell `Set-Content -Encoding utf8` double-encodes.** UTF-8 text
   written through it becomes mojibake; several section rules in
   `server/index.ts` still carry the scars (`â”€â”€ Seasons â”€â”€`,
   lines ~1260, ~4154). Write files with tools that respect the bytes;
   verify with a grep for `â` after any scripted edit on Windows.
3. **MySQL UNIQUE indexes exempt NULLs.** Multiple NULLs happily coexist
   under a unique index, which silently kills NULL-keyed dedupe. This is
   why `notifications.dedupe_key` is NOT NULL with a real unique index
   (`server/lib/notify.ts:6-8`). Any new dedupe column must be NOT NULL.
4. **BigInt literals break the build.** The bundle targets below ES2020, so
   `123n` fails; use `BigInt(123)` calls — the swap quote math does exactly
   this on purpose (`server/lib/exchange.ts:454-458`).
5. **Never filter the test run with `-t`.** `server/loop.e2e.test.ts` is
   order-dependent by design — each step of the loop builds on the last
   against one live server process. A `-t` filter skips earlier steps and
   fails later ones spuriously. Run the whole file or the whole suite.
6. **Build before test.** The loop test boots `dist/index.js` and throws if
   it is missing (`loop.e2e.test.ts:74-76`); CI orders build before test
   for this reason (`.github/workflows/ci.yml`).
7. **`timezone: 'Z'` on every MySQL connection.** mysql2 defaults to local
   time; a timestamp written local and read Z shifts every lunar boundary
   six hours (`server/db/migrate.ts:7-10`). The engine, the pool and the
   harness all set it — so must any new connection.
8. **`AUTH_TOKEN_SECRET` unset degrades silently** to per-process sessions:
   every restart logs everyone out (`FORK_RUNBOOK.md` env table).

---

## 7. Testing doctrine and the gate

**Harness (S5).** `server/db/testDb.ts` provisions a scratch schema
(`village_test` — fixed, brand-free), DROP/CREATEs it every run, and applies
*every* migration through the production engine. Sources: CI uses a
`mysql:8` service container; locally, `TEST_DATABASE_URL` in `.env` points
at a scratch-capable server — never the app schema. No `TEST_DATABASE_URL`
→ DB-backed suites **skip loudly** rather than pass hollowly.

**The loop test** (`server/loop.e2e.test.ts`) is the acceptance criterion
for the whole product, not a unit test: it boots the BUILT `dist/index.js`
as a subprocess on port 3781 against a scratch schema and a throwaway data
dir, then walks register → path → claim → submit → admin consent →
gratitude lands → peer send → wall → Pulse → progression. It is
order-dependent; never `-t`-filter it. If a change makes it fail, the
change is wrong.

**Unit suites** live beside their subjects: `server/ledger.test.ts`,
`server/swap.test.ts` (quote/conservation properties),
`server/payments.test.ts`, `server/automation.test.ts`,
`server/lib/gratitude-cycles.test.ts`, `server/repos/users.test.ts`,
`server/db/harness.test.ts`, `server/base-reads.test.ts`, and the
isomorphic `shared/*.test.ts` (capabilities, lunar, mapLayout). Vitest runs
in node env, `fileParallelism: false` (one server process per file, no port
fights), 120 s test timeout (`vitest.config.ts`).

**The gate** — the same commands locally and in CI
(`.github/workflows/ci.yml`), in this order:

```bash
pnpm check                        # tsc --noEmit
node scripts/check-brand-refs.mjs # brand guard: hard-clean spotless, ratchet only burns down
pnpm build                        # vite build + esbuild server bundle — BEFORE tests
pnpm test                         # vitest run, the FULL suite, loop included
```

CI adds an advisory bundle-size report and a non-blocking `pnpm audit`.
Pushing `main` deploys production, so the gate is the release process:
nothing merges red, and nothing green is assumed to work until the loop has
closed against the artefact that ships.