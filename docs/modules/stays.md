# Module design: Stays / Accommodation Payments — module id `stays`

Provenance: platform

> Produced by the 13-agent design workflow, 2026-07-26, from the 2020 village-demo deck (slides + speaker notes),
> the platform foundation plan's constraints, and the live codebase. Reconciled by MODULES_MASTER_PLAN.md —
> where this file and the master plan disagree, **the master plan wins** (it applies the two critique passes).

**A closed-loop stay-credit economy on the one ledger: admin-priced accommodations payable in stay credits, fiat (Stripe), or manually-confirmed crypto, with "paid nights remaining" as a derived ledger balance and work-exchange quests as the way to earn your stay.**

Estimated sessions: 5

## Design decisions, and why

- Killed the FX/swap framing. The original concept was literally a Uniswap fork (speaker refs confirm) — a currency dropdown with exchange rates. Replaced with explicit admin-posted prices per token per room (155 stay-credits OR $80 — two independent posted numbers, never a computed rate). No DEX, no implied exchange, no money-transmitter posture; anything tradeable stays on Hypha per the boundary rule.
- Firewalled the payment token. The slide let you pay with Seeds/HUSD/village shares — equity-adjacent tokens. Here equity/Voice are never spendable in-platform (Hypha boundary), and Gratitude never gets a posted price (F2/F4: recognition must not become a wage). Stays run on a dedicated compensation-kind closed-loop credit, so the thank-you economy stays uncorrupted.
- 'Paid Days Remaining: 52' was a static mock number. Ours is derived from an append-only ledger: every purchased night, comped night, work-exchange reward, nightly deduction, and admin correction is a signed ledger row with an idempotency key. Disputes become a query, not an argument.
- The speaker note 'go earn tokens' had no mechanism. We wire it to the existing consent-gated quest system: quests can carry a stay-credit reward released in the same consent transaction, and a low-nights balance surfaces work-exchange quests as the member's next-best action. Work literally extends the stay.
- 'Set autopayment token' becomes a real state machine: autopay flag, idempotent per-date nightly posting (admin-triggered until the Phase 3 scheduler exists — the exact precedent set by admin-triggered cycle close), grace nights, low-balance warnings via the notification spine, and never auto-eviction (zero balance flags the admin; a human decides).
- Guest-vs-member pricing rides the existing progression ladder through shared/capabilities.ts (new `stay.member_rate` capability: stage unlock OR role grant), so the game and the till reinforce each other — an incentive to join that the slide didn't have.
- Honest booking-lite instead of a pretend PMS: v1 is a nights-balance with soft capacity flags and an explicit cut list; the admin gets the operational surface a booking page usually skips entirely (occupancy list, comp nights, manual adjustments, cash-payment recording, which are real needs anywhere people pay cash at the office).
- Three payment paths, ONE crediting path: Stripe webhook, admin manual record (cash/bank/crypto), and quest consent all land credits through the same idempotent ledger write — the module-level analog of 'the platform pays at SEND, never add a second payment path'.
- Integrated with the existing Visit program instead of building a parallel system: accommodations optionally link to visit_types, so the Visit page grows a 'where you'll stay' strip reading the same catalog, and visit-config stays the singleton doc it already is.
- Everything tunable is a fail-loud game variable with platform defaults, and the whole module ships OFF — forks inherit a working stays system by flipping one variable and entering their own rooms and prices.

## Data model

All tables MySQL/Drizzle, string PKs, `varchar(64)` user FKs, matching `server/db/schema.ts` conventions. Until the Phase 1b cutover completes, v1 ships JSON seeds (`server/seeds/accommodations-seed.json`, `stays-seed.json`) + `ensureDataFiles()` entries; the credit balance itself requires the live ledger (hard dependency, see below).

**accommodations** — admin-defined stay offerings (the slide's "Resort Rm1")

| column | type | notes |
|---|---|---|
| id | varchar(64) PK | e.g. `acc-jungle-casita-1` |
| name | varchar(120) NOT NULL | |
| description | text | |
| capacity | int NOT NULL default 1 | concurrent stays before the admin sees an over-capacity flag (soft, v1) |
| photoUrl | varchar(500) | |
| visitTypeId | varchar(64) NULL | links to a `visit_types[].id` in the existing visit-config doc; lets Visit page show "where you'll stay" |
| active | boolean NOT NULL default true | |
| sortOrder | int NOT NULL default 0 | |
| createdAt / updatedAt | timestamp | |

**accommodation_prices** — nightly rate PER TOKEN, admin sets each explicitly, zero FX math

| column | type | notes |
|---|---|---|
| id | varchar(64) PK | |
| accommodationId | varchar(64) NOT NULL | FK → accommodations |
| tokenType | varchar(32) NOT NULL | `stay_credit` (required base row) \| `usd` \| future currency-registry ids (F2) |
| audience | mysqlEnum('guest','member') NOT NULL default 'guest' | member resolved via `hasCapability("stay.member_rate")` |
| amountMinor | int NOT NULL | cents for usd; whole credits for stay_credit |
| active | boolean NOT NULL default true | |
| UNIQUE | (accommodationId, tokenType, audience) | |

Rule: a `stay_credit` row is REQUIRED per accommodation (it is the base denomination all consumption posts in); other tokens optional.

**stays** — booking-lite record, NOT a PMS

| column | type | notes |
|---|---|---|
| id | varchar(64) PK | |
| userId | varchar(64) NOT NULL | |
| accommodationId | varchar(64) NOT NULL | |
| status | mysqlEnum('requested','active','ended','cancelled') NOT NULL default 'requested' | admin activates on arrival |
| arriveOn | date NULL | v1: informational only, no calendar allocation |
| departOn | date NULL | v2 date-range mode |
| autopay | boolean NOT NULL default true | from `stay.autopay_default` |
| autopayTokenType | varchar(32) NOT NULL default 'stay_credit' | future-proof for F2 currencies[]; v1 only stay_credit |
| lastPostedOn | date NULL | cache; truth is ledger idempotency keys `stay:{id}:night:{YYYY-MM-DD}` |
| notes | text | |
| createdAt / updatedAt | timestamp | |

**stay_purchases** — order/intent records (every path that grants credits except quest consent)

| column | type | notes |
|---|---|---|
| id | varchar(64) PK | |
| userId | varchar(64) NOT NULL | |
| accommodationId | varchar(64) NULL | null = generic credit pack |
| nights | int NULL | |
| payTokenType | varchar(32) NOT NULL | `usd`, `crypto`, `stay_credit`(admin comp uses source not purchase) |
| amountMinor | int NOT NULL | what was paid, in the pay token's minor units |
| creditsGranted | int NOT NULL | stay credits landed on success = nights × room's posted stay_credit rate |
| provider | mysqlEnum('stripe','manual') NOT NULL | crypto = manual (link-out + admin confirms) |
| providerRef | varchar(160) UNIQUE | Stripe checkout session id / bank ref; the idempotency anchor |
| status | mysqlEnum('pending','paid','failed','cancelled','refunded') NOT NULL default 'pending' | |
| recordedBy | varchar(64) NULL | admin userId for manual records |
| createdAt / paidAt | timestamp | |

**token_ledger** (EXISTS — extension required): `tokenType` must accept `stay_credit`. Recommendation: convert `mysqlEnum('gratitude','amora','voice')` → `varchar(32)` validated fail-loud in code against the currency registry, BEFORE Phase 1b makes the ledger live — the plan itself warns altering a live MySQL enum is the migration regen refused to do, and F2's admin-defined `currencies[]` can never live in an enum anyway. `users` gains `stayCreditBalance int NOT NULL default 0` as a recomputed cache of SUM(ledger where tokenType='stay_credit'), never `+=`, mirroring `recognitionBalance`. "Paid nights remaining" is always derived: `floor(stayCreditBalance / activeStay's posted stay_credit rate)` — never stored.

Ledger sources used: `stay_purchase`, `stay_night` (negative), `stay_comp`, `stay_adjustment` (signed), `quest_stay_reward`. Idempotency keys: `staypurchase:{purchaseId}`, `stay:{stayId}:night:{date}`, `queststay:{claimId}`, `staycomp:{id}`.

**quests** (EXISTS — extension): add `stayCreditReward int NULL` — credits released at consent in the same transaction as the Gratitude release, separate field so recognition and compensation never share a column (F2).

## Endpoints

- `GET /api/stays/catalog — accommodations + audience-resolved prices for caller + module flags (public; 404s when modules.stays_enabled is false, like every stays route)`
- `GET /api/stays/me — auth: stay-credit balance (from ledger cache), active stay, nights-remaining per accommodation, autopay pref, purchase history`
- `POST /api/stays/book — auth: {accommodationId, arriveOn?, notes} → 'requested' stay; gated by stay.guest_booking_enabled or capability`
- `POST /api/stays/:id/autopay — auth, owner: {autopay: boolean}`
- `POST /api/stays/:id/end — auth, owner or admin: posts any unposted nights through today, sets status 'ended'`
- `POST /api/stays/checkout — auth (v1.5): {accommodationId, nights} → Stripe Checkout Session URL; creates pending stay_purchase`
- `POST /api/webhooks/stripe — raw-body signature-verified; idempotent credit via providerRef; MUST be mounted before express.json()`
- `GET /api/admin/stays — occupancy list: requested/active stays, balances, nights remaining, lastPostedOn, over-capacity flags`
- `POST /api/admin/stays/accommodations | PUT/DELETE /api/admin/stays/accommodations/:id — CRUD`
- `PUT /api/admin/stays/accommodations/:id/prices — replace price rows (validates required stay_credit row)`
- `POST /api/admin/stays/post-nights — idempotent batch: for each active autopay stay, one negative ledger entry per unposted date since lastPostedOn through yesterday (village timezone); safe to run twice; the v1 stand-in for the scheduler`
- `POST /api/admin/stays/adjust — {userId, credits (signed), reason} → ledger source 'stay_adjustment'`
- `POST /api/admin/stays/comp — {userId, accommodationId, nights, reason} → credits nights × posted rate, source 'stay_comp'`
- `POST /api/admin/stays/payments/manual — record off-platform fiat/crypto: {userId, accommodationId?, nights?, amountMinor, payTokenType, providerRef, creditsGranted} → paid stay_purchase + ledger credit`
- `GET /api/admin/stays/ledger?userId= — stay-credit ledger history for support/disputes`

## Surfaces

Pages: `client/src/pages/Stay.tsx` at `/stay` (registered in App.tsx + desktop nav + `client/src/config/mobileNav.ts` entry ONLY when module enabled — bootstrap flag from /api/stays/catalog or the existing config fetch). Layout: accommodation cards with per-token nightly prices, a NightsMeter ("Paid nights remaining: N" + credit balance), days input with live total per token, purchase panel (Stripe button when keys configured; crypto card = instructions + deep link to the village's configured wallet/Hypha URL + "the team confirms manually"), autopay toggle, and a WorkExchangeStrip of quests tagged `work-exchange` that carry stayCreditReward — shown prominently when nights remaining < stay.low_balance_warn_nights. Components: `client/src/components/stays/AccommodationCard.tsx`, `NightsMeter.tsx`, `StayPurchasePanel.tsx`, `WorkExchangeStrip.tsx`. Integration surfaces: Visit.tsx gains a "Where you'll stay" section per visit type (catalog filtered by visitTypeId — extends the existing Visit program, no parallel system); GameDashboard gets a small nights-remaining card when the member has an active stay; Village Pulse gets addActivity entries on stay start/end (no amounts, F3 spirit). Admin: one new "Stays" tab in Admin.tsx following the existing tab pattern (`AdminStays.tsx`) with sub-views: Occupancy, Accommodations & Pricing, Adjustments/Comps, Payments log, plus a "Post nights" button. Mobile: NightsMeter first, Stripe redirect flow works in webview, purchase panel is a bottom sheet (drawer.tsx already installed and unused).

## Mechanics

CORE INVARIANT: one internal denomination (stay_credit), one ledger, credits land exactly once per external event. The platform never computes an exchange rate — a fiat purchase of N nights applies two independent admin-posted numbers (charge N × usd rate; credit N × stay_credit rate). 

State machines: stay_purchase `pending → paid | failed | cancelled` (paid transition is the ONLY place credits mint, idempotent on providerRef; `refunded` reverses with a negative ledger entry, admin-only). stay `requested → active → ended` (admin activates; end posts remaining nights). 

Nightly consumption: for each active stay with autopay, for each date d in (lastPostedOn, yesterday]: ledger entry {userId, tokenType:'stay_credit', amount: −postedRate(accommodation, audience-at-post-time), source:'stay_night', idempotencyKey:`stay:{stayId}:night:{d}`}; then lastPostedOn=d. Missed runs catch up losslessly because the key is per-date. Balance may go negative up to stay.grace_nights × rate, after which the stay is flagged `attention` in admin — never auto-ended (humans decide evictions). v1 trigger: admin button; v2: scheduler job at stay.autopay_post_hour in GAME_CONFIG.season.timezone (America/Costa_Rica — NOT the UTC pool, per the plan's timezone trap). 

Pricing resolution: audience = hasCapability("stay.member_rate", ctx) ? 'member' : 'guest', where STAGE_UNLOCKS gains `"stay.member_rate": "member"` and any role (e.g. Karma Yogi) can grant it — the ONE GATE, extended not bypassed. Missing member row falls back to guest row (never the reverse). 

Work-exchange loop: quest consent (existing admin consent path, server/index.ts:1756-1779 pattern) additionally ledger-credits stayCreditReward with key `queststay:{claimId}` inside the same operation — consent remains the single moment value releases. Low balance → nextActions rule `{when:'stay-low-balance', label:'Earn nights with a work-exchange quest', href:'/quests?tag=work-exchange'}` + one notification via the Phase 3 spine (dedupeKey `stay-low:{stayId}:{nightsBucket}`, so one warning per threshold, not one per night). 

Hypha boundary: equity/Voice balances may be DISPLAYED beside the purchase panel (read-only, existing economics reads) with copy "equity and Voice live on Hypha" + deep link to the village's configured DHO URL; they are never accepted as payment in-platform. Crypto payment = link-out + admin manual record, provenance stamped (recordedBy), mirroring F9's `relay:"admin"` pattern. 

Legal posture encoded: stay credits are non-withdrawable, non-refundable-to-fiat-by-default, non-transferable-by-default (variable, default false, with a warning that transferable purchased credits drift toward e-money), redeemable only for lodging — arcade-credit shape.

## Game variables

- modules.stays_enabled: false (boolean) — master toggle; module ships OFF, every route/nav/tab keys off it
- stay.guest_booking_enabled: true (boolean) — whether pre-member accounts can request a stay
- stay.member_rate_stage: 'member' (choice: stage ids) — feeds STAGE_UNLOCKS for stay.member_rate
- stay.autopay_default: true (boolean) — new stays start with autopay on
- stay.autopay_post_hour: 12 (0–23, hours, village timezone) — v2 scheduler posting hour
- stay.low_balance_warn_nights: 3 (0–30 nights) — warning + work-exchange surfacing threshold
- stay.grace_nights: 2 (0–14 nights) — how far negative before the admin attention flag
- stay.max_purchase_nights: 90 (1–365 nights) — cap per checkout, keeps a single Stripe charge sane
- stay.credit_expiry_days: 0 (0–3650, 0 = never) — OFF by default; expiring fiat-purchased credits triggers gift-card/escheatment law, see risks
- stay.credits_transferable: false (boolean) — keep false; member-to-member transfer of purchased credits changes the legal shape
- stay.work_exchange_tag: 'work-exchange' (text) — quest tag surfaced when nights run low
- All registered in shared/gameVariables.ts (category 'Stays') with descriptions written for a founder; unknown key throws per the fail-loud registry; only changed values stored so forks inherit platform defaults

## Admin controls

One "Stays" tab in Admin.tsx (existing tab pattern): (1) Occupancy — requested/active/attention stays with balance, nights remaining, lastPostedOn, over-capacity flags per accommodation, activate/end actions, and the "Post nights" idempotent batch button (v1 stand-in for the scheduler); (2) Accommodations & Pricing — CRUD + per-token per-audience price editor, validation refuses saving without the base stay_credit row, optional visitTypeId link into the existing visit-config doc; (3) Adjustments & Comps — signed credit corrections with required reason, comp-nights grant (picks accommodation, computes credits at posted rate), both landing as attributed ledger rows; (4) Payments — manual payment recorder (cash/bank/crypto with reference), Stripe purchase log, refund action (reverses via negative ledger entry); (5) Ledger view per member for disputes. Module toggle + all tunables live in the existing Game Mechanics variables editor, not bespoke switches. Every admin mutation emits an F13 health event (who adjusted, who comped, size) — instrument now, dashboard later.

## Dependencies

- HARD: token_ledger live (Phase 1b cutover) — credits are ledger rows or they are nothing; do not ship a JSON shadow balance
- HARD (coordination, do NOW): widen token_ledger.tokenType to varchar(32) with fail-loud code validation (or minimally add 'stay_credit' to the enum) BEFORE the ledger goes live — the plan's own warning about live MySQL enum migrations, and F2's admin-defined currencies[] makes varchar the right end-state
- SOFT: Phase 3 scheduler — automates nightly posting and low-balance digests; v1 uses the admin-triggered idempotent batch (same precedent as admin-triggered cycle close)
- SOFT: Phase 3 notification spine + existing Resend email — low-balance warnings and payment receipts; v1 works without them
- SOFT: Stripe account + STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET env per deployment (each fork brings its own); manual payment recording covers the gap
- EXISTING, reused: shared/capabilities.ts (new stay.member_rate key), shared/gameVariables.ts registry, quest consent path (stay-credit rewards), visit-config doc (visitTypeId link), addActivity, Admin tab pattern, mobileNav config, drawer.tsx
- OPTIONAL v2: Maia — one new PROPOSAL_KINDS entry 'stay-inquiry' reusing the existing guarded assistant plumbing, zero new AI infra

## v1 (ship first, useful alone)

Ships alone and useful (3 sessions): admin defines accommodations with explicit per-token guest/member nightly prices; members see the Stay page with the slide's core loop — pick accommodation, see daily cost and total for N days, see ledger-derived "paid nights remaining"; credits arrive via work-exchange quest consent, admin comp/adjustment, or admin-recorded off-platform payment (cash at the office, bank transfer, crypto via link-out + manual confirm); nights are consumed by an idempotent per-date admin-triggered batch; Occupancy admin tab. Explicit v1 cuts: no calendar/date-range allocation (nights-balance only — arriveOn is informational), no availability search, capacity is a soft over-capacity flag not a hard block, no Stripe yet (session 3 adds it), no automatic nightly posting (no scheduler exists), no notifications, single payer per stay, no refund self-service. Session plan: S1 = schema + seeds + ensureDataFiles + catalog/admin CRUD endpoints + variables + module toggle; S2 = Stay.tsx + Admin Stays tab + ledger crediting/consumption + quest stayCreditReward at consent; S3 = Stripe Checkout + raw-body webhook + manual payments + receipts email.

## v2 (the rest of the design)

The full slide vision plus operations (2 sessions, after Phase 3 lands): scheduler-driven nightly autopay at the configured village-timezone hour with grace nights and admin attention flags; low-balance notifications ("3 nights left — here are two work-exchange quests") through the notification spine with dedupe keys, plus the nextActions 'stay-low-balance' rule; date-range bookings with per-date capacity checks (still deliberately not a PMS — no housekeeping, no room assignment, no channel management); occupancy dashboard upgrades (arrivals this week, projected nights, revenue by token); Stripe refund handling; equity/Voice display beside the purchase panel with Hypha deep link; Maia 'stay-inquiry' proposal kind; optional F2 wiring where the Gratitude cycle-close release can target stay credits if a village ever wants recognition to feed lodging through the governed-pool mechanism instead of (or alongside) direct quest rewards.

## Risks

- ENUM TIMING (act now, independent of this module's build slot): token_ledger.tokenType is enum('gratitude','amora','voice') in server/db/schema.ts and nothing reads the DB yet — this is the only cheap moment to widen it; after Phase 1b it becomes the live-enum migration the plan explicitly refuses
- LEGAL — needs real review before Stripe goes live: selling stay credits for fiat is prepaid lodging (accommodation tax, which is 13% IVA in Costa Rica, plus consumer refund law and receipts); expiring fiat-purchased credits can trigger gift-card/escheatment rules (expiry ships 0/never); transferable credits would drift toward e-money (ships false). The closed-loop non-withdrawable design is chosen precisely to stay in arcade-credit territory, but a lawyer should bless the fiat path
- Stripe webhook signature verification requires the raw request body; express.json() is applied globally in server/index.ts, so the webhook route must be mounted with express.raw() BEFORE the JSON parser or every event fails verification silently
- No scheduler: if the admin forgets the post-nights button, deductions post late — idempotent per-date keys make catch-up lossless and double-charge-impossible, but a guest could depart before posting; the stay-end action closes that hole by posting through today
- Soft capacity can oversell in v1 (flag, not block) — acceptable at village scale, but the admin UI must show the flag loudly so it is a choice, not a surprise
- Posted stay-credit prices sit adjacent to unpriced recognition: keep quest Gratitude and stayCreditReward in separate fields and separate UI blocks, or F1/F2's no-posted-price-on-recognition rule erodes by proximity
- Audience is resolved at posting time, so a member who crosses the member stage mid-stay starts paying the member rate the next night — correct behavior, but document it or it reads as a billing bug
- Negative-balance grace means users.stayCreditBalance cache can go negative; any future pooled math must not assume non-negative (echo of the visitor.gratitudeMultiplier=0 trap)

## Open questions

- Generic credit packs vs nights-at-a-room as the Stripe SKU: the schema supports both (accommodationId nullable on stay_purchases), and which one a village shows first is a per-deployment choice with no default worth forcing.
- Should Gratitude's cycle-close release mechanism (F2 §1.1a weighted pool) be allowed to target stay credits, making recognition indirectly feed lodging through the governed pool, or should work-exchange stay strictly on direct quest rewards? (v1 chooses direct rewards only)
- Refund policy for fiat night purchases: default is non-refundable-to-fiat (credits stay spendable). Whether that survives consumer law where the land sits is a question each village answers before it sells a night, and the platform does not answer it for them.
- Households: one stay record per room with a single payer is v1 — do partners/kids need to share a credit balance or split billing later?
- Which visit types bundle lodging into the visit price vs pay-separately-via-stays? The visitTypeId link supports both, and the decision belongs to the village, per visit type
- Weekly/monthly discounted rates: representable later as additional audience rows or a duration-tier column on accommodation_prices — worth deferring until a real long-stay exists?
- Does a deposit-for-damages concept belong in stays v2, or in the material library module, which already carries the health-decay mechanic it would borrow?

## Paying a night in village credits (0092)

A room posts a nightly rate per token, and `accommodation_prices.token_type`
now takes any credit-kind platform token beside `stay-credit` and `usd`. A
stay is ACTIVATED in exactly one of them and the choice is snapshot in
`stays.rate_snapshot_token` beside the rate, for the same reason the rate is:
catch-up posting stays deterministic and a price edit mid-stay re-rates
nobody.

**EITHER ACCEPTED, never a rate between them.** Nothing converts one token
into the other, and the design that had to be refused is the obvious one:
"buy stay credits with village credits" would take a token issued by the
cycle-pool faucet and make it into a token that is also sold for money at
`/api/stays/checkout`. That is a path from a faucet-issued token into a
purchased one. That is the taint rule `server/lib/ledger.ts` enforces from
the other end, reached by a side door. A choice of currency at the door creates no such
path: the two tokens never touch and the ledger sees two independent burns.

Everything else about a night is unchanged, deliberately. `stay_night` is
still the source, `allowNegative` is still on inside the grace window, and
`checkLedgerInvariants` already asks its negative-balance question per
(account, token), so a member in grace on credits is legal for exactly the
reason a member in grace on stay credits is. What DOES follow the token is
the sink: stay credits retire into `sys:mint`, whose negative balance is the
outstanding stay-credit supply, and every other token lands in
`sys:treasury`. Paying village credits back into `sys:cycle-pool` would
redefine that faucet's negative balance from "released to date" into
"outstanding", which several surfaces read.

`stay.credits_transferable` is untouched and still refused at the variables
route: a stay credit is a claim on a specific night, and the e-money question
its description names has not changed. Member-to-member sending opens on the
village's own credits, never on a module's voucher.
