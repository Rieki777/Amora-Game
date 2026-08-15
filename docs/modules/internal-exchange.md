# Module design: Internal Exchange (slides 25 + 26): Wallet + Village Exchange — buy and swap platform-governed closed-loop credits, treasury as counterparty, everything settling through the one token ledger

Provenance: platform

> Produced by the 13-agent design workflow, 2026-07-26, from the 2020 village-demo deck (slides + speaker notes),
> the AMORA_FOUNDATION_UPGRADE_PLAN constraints, and the live codebase. Reconciled by MODULES_MASTER_PLAN.md —
> where this file and the master plan disagree, **the master plan wins** (it applies the two critique passes).

**A Uniswap-looking, nothing-like-Uniswap village shop: members buy internal credits with fiat (Stripe) or via admin-recorded cash, and swap internal credits against the village treasury at admin-governed posted prices — while Hypha-governed tokens (Amora equity, Voice, project shares) appear in the same wallet strictly read-only with a "Trade on Hypha" deep link.**

Estimated sessions: 7

## Improvements over the 2020 slide concept

- Resolved the slide-25/26 contradiction the deck itself contains: slide 26 shows buying 'Restaurant Tokens' (ownership of a village asset) in the internal exchange, but Rye's slide-25 rule says tradeable/share-like tokens are issued on Hypha. Design: the internal exchange executes trades ONLY on platform-governed closed-loop credits; anything share-like (Amora equity, Voice, project/business tokens) renders in the same wallet UI as a read-only balance card with a 'Trade on Hypha' deep link to the village's configured DHO. Recommended as the default for every fork; flagged below for Rye's confirmation.
- Replaced the implied AMM mechanism with treasury-as-counterparty at posted prices, keeping the Uniswap two-panel swap card purely as aesthetic. Why: (1) thin market — a village has dozens of participants, so an order book is empty and an AMM pool is so shallow one purchase moves price 30% and is trivially manipulable; (2) internal credits have intrinsic redemption value (a stay-credit IS a night, a library credit IS borrowing power), so price discovery is not just unnecessary, it would break the credits' meaning; (3) price-setting is a governance act — the village decides what a night costs, it doesn't let whoever trades most legislate it; (4) legal — running a floating-price exchange between users looks like operating a securities market; a treasury selling vouchers at posted prices looks like a shop.
- Anchor-priced rates instead of the slide's per-pair rates: every internal currency is priced in one unit of account (USD cents by default). Cross rates derive from the anchor, so triangular arbitrage (A->B->C->A profit) is impossible by construction and governance tunes ONE number per token instead of N-squared pairs.
- Truly slippage-free quotes, unlike the slide's '+13% / -1%' drifting rates: a quote embeds the price-row ids it was computed from; execution re-verifies them and either delivers exactly the quoted amount or fails with 409 QUOTE_STALE and a fresh quote. You can never receive less than you were shown.
- Rate changes are an append-only governance record: every price row carries who set it, when, and a REQUIRED written reason, and the history is a first-class UI surface (RateHistorySheet). This makes price-setting a visible governance act (F8's ethos applied to money) rather than a silent admin edit — the 2020 deck had no rate provenance at all.
- Recognition firewall extended to money (F4's spirit): the recognition currency (Gratitude) is structurally excluded from the exchange — not purchasable, not swappable, no price row can exist for it, enforced by a boot-time invariant and rejected server-side on write. The slide's generic token selector would have let money buy recognition.
- Double-entry settlement inside the single ledger: the treasury is a ledger account (sys-treasury), every purchase/swap writes balanced entries, so SUM(all accounts) per currency = 0 (net of opening balances) and outstanding credits are a visible, auditable treasury liability. The deck had no accounting model.
- Legal posture designed in rather than ignored: credits are closed-loop, non-withdrawable, non-fiat-redeemable (refunds only via reversal of the original Stripe payment inside a window), purchases gated at member stage by default so sales are to a closed community rather than the public, with KYC-free purchase limits per order / per 30 days / per year as fail-loud game variables. Arcade credits, not e-money.
- Cash-economy reality of an actual Costa Rican village: manual admin credit (cash/bank transfer/SINPE) is a first-class v1 order kind with reference field and receipt, not an afterthought — the 2020 deck assumed everyone had Seeds and a light wallet.
- Receipts, statements, and purchase limits: every completed order gets a sequential receipt number, an emailed receipt (existing Resend infra), and a per-currency ledger statement view. The deck showed balances but no paper trail.
- Every tunable is a fail-loud game variable with platform defaults (spread, limits, quote TTL, refund window, DHO URL), so hundreds of forks inherit sane values and tune without deploys; and the whole module ships OFF by default — a village that sells nothing never sees it.

## Data model

All ids `varchar(64)` unless noted; user FKs are `varchar(64)` matching `users.id`. All money/token amounts are **integer minor units** (fiat in cents; credits are whole units, `decimals` default 0). New tables live beside the existing 11 in `server/db/schema.ts`; JSON-era seeds go in `server/seeds/` + `ensureDataFiles()` if any piece ships pre-cutover.

### `currencies` — the unified registry (this IS F2's `currencies[]`, shipped as a table)
| column | type | notes |
|---|---|---|
| id | varchar(64) PK | slug: `gratitude`, `stay-credit`, `library-credit`, `event-ticket-x` |
| name | varchar(120) NOT NULL | "Stay Credits" |
| symbol | varchar(16) NOT NULL | display glyph/code |
| description | text | shown in wallet + buy panel |
| kind | varchar(24) NOT NULL | `recognition` \| `credit` \| `external` — recognition is firewalled from the exchange; external = Hypha/Base, read-only |
| governance | varchar(16) NOT NULL | `platform` \| `hypha` (external ⇒ hypha, enforced) |
| decimals | int NOT NULL default 0 | internal credits stay 0; external uses chain decimals |
| purchasable | boolean NOT NULL default false | may be bought with fiat/crypto |
| swappable | boolean NOT NULL default false | may appear on either side of a swap |
| minStageToBuy | varchar(64) NULL | per-currency override of the default member gate (e.g. event tickets open to `guest`) |
| chainId | int NULL | external only (Base = 8453) |
| contractAddress | varchar(42) NULL | external only, read-only balance display |
| hyphaUrl | varchar(500) NULL | external only: deep link target; falls back to `exchange.hypha_dho_url` |
| icon | varchar(64) NULL, sortOrder int default 0, active boolean default true | |
| createdAt / updatedAt | timestamp | |

**Invariants (boot assertion + rejected on write, F4-style):** `kind='recognition'` ⇒ `purchasable=false AND swappable=false`; `kind='external'` ⇒ never in a price row, never a swap leg, never credited by the ledger (guard already exists in `server/lib/ledger.ts`).

### `currency_prices` — append-only posted prices (the rate-change history IS the table)
| column | type | notes |
|---|---|---|
| id | varchar(64) PK | |
| currencyId | varchar(64) NOT NULL, INDEX | FK→currencies.id; `kind='credit'` only, enforced |
| priceMinor | int NOT NULL | anchor minor units (cents) per 1 whole credit |
| note | varchar(500) NOT NULL | REQUIRED reason — price-setting is a governance act |
| setBy | varchar(64) NOT NULL | userId of admin (or bot user when set via a consented agreement, F8) |
| agreementId | varchar(64) NULL | v2: links a price change to the decision that authorized it |
| effectiveAt | timestamp NOT NULL default now | current price = latest row per currency; UNIQUE(currencyId, effectiveAt) |

### `exchange_orders` — every purchase, swap, and admin credit
| column | type | notes |
|---|---|---|
| id | varchar(64) PK | |
| userId | varchar(64) NOT NULL, INDEX | buyer/swapper |
| kind | varchar(24) NOT NULL | `fiat_purchase` \| `crypto_purchase` \| `admin_credit` \| `swap` \| `refund` |
| status | varchar(16) NOT NULL default 'pending' | `pending` → `completed` \| `failed` \| `canceled` \| `expired` |
| payCurrency | varchar(64) NOT NULL | ISO code (`USD`) for purchases; a `currencies.id` for swaps |
| payAmountMinor | int NOT NULL | cents paid, or credits surrendered |
| receiveCurrencyId | varchar(64) NOT NULL | FK→currencies.id (`credit` kind only) |
| receiveAmount | int NOT NULL | credits delivered |
| priceSnapshot | json NOT NULL | the price row(s) the quote used — audit + stale-quote check |
| provider | varchar(24) NOT NULL | `stripe` \| `manual` \| `crypto_manual` \| `treasury` |
| stripeSessionId | varchar(255) NULL UNIQUE | webhook dedupe |
| stripePaymentIntentId | varchar(255) NULL | refunds |
| reference | varchar(255) NULL | bank/SINPE ref or tx hash for manual + crypto |
| createdBy | varchar(64) NULL | admin who recorded an `admin_credit` / completed a crypto order |
| receiptNo | int NULL UNIQUE | assigned at completion (MAX+1 in the settlement transaction); formatted with config-driven prefix |
| idempotencyKey | varchar(160) NOT NULL UNIQUE | client-supplied for swap; derived for webhook |
| failReason | varchar(255) NULL, createdAt / completedAt timestamps | pending fiat orders expire after 24h |

### `token_ledger` — EXISTING table, one change, made NOW while it has zero production rows
`token_type` migrates from `enum('gratitude','amora','voice')` to **`varchar(32)` validated in code against `currencies.id`** (unknown id throws — fail-loud is preserved, it just lives in the registry lookup instead of the enum). This is the plan's own reasoning applied early: altering a live MySQL enum later is the migration regen-civics refused to do, and the DB is not yet authoritative, so this is the last cheap moment. Flagged as a pre-cutover decision below. Add INDEX(userId, tokenType). **System accounts are reserved user ids** (`sys-treasury`; later `sys-library-pool` etc.), seeded as inert user rows so FK joins and admin views work — per the ONE LEDGER rule, treasury balances are just ledger sums for `sys-treasury`.

No other table stores a balance. Wallet balances = SUM(token_ledger) per (user, currency); `users.recognitionBalance` stays a recomputed cache exactly as today.

## Endpoints

- `GET /api/exchange/currencies — active currencies: credit kind with current price + purchasable/swappable flags; external kind with chain ref + hyphaUrl (module-off ⇒ 404)`
- `GET /api/exchange/rates — current posted price per credit currency + anchor unit`
- `GET /api/exchange/rates/history?currencyId= — append-only price rows with setBy/note/effectiveAt`
- `POST /api/exchange/quote — {from, to, amount, side:'pay'|'receive'} → {payAmount, receiveAmount, priceIds, anchorValueMinor, expiresAt}; receive-driven pairing minimizes integer-rounding remainder`
- `POST /api/exchange/swap — {from, to, payAmount, receiveAmount, priceIds, idempotencyKey} → verifies prices unchanged (else 409 QUOTE_STALE + fresh quote), writes 4 balanced ledger entries in one transaction, returns completed order`
- `POST /api/exchange/orders/fiat — {currencyId, receiveAmount} → limit checks → pending order + Stripe Checkout Session → {checkoutUrl}`
- `POST /api/webhooks/stripe — raw-body route mounted BEFORE express.json(), signature-verified; checkout.session.completed → idempotent settlement (ledger entries, receiptNo, receipt email, optional pulse entry)`
- `POST /api/exchange/orders/crypto — {currencyId, receiveAmount, txHash} → pending order awaiting admin verification (only when exchange.crypto_enabled)`
- `GET /api/exchange/orders — caller's orders, newest first`
- `GET /api/exchange/orders/:id/receipt — receipt JSON/HTML (also emailed at completion)`
- `GET /api/wallet — internal balances from ledger sums + external read-only balances (Base reads; null on RPC failure, never zero) + limits remaining`
- `GET /api/wallet/statement?currencyId= — the member's ledger entries for one currency (reuses entriesFor())`
- `GET /api/admin/exchange/currencies · POST · PUT /:id — registry CRUD; server rejects recognition-purchasable, external-swappable, unknown kinds (admin auth + exchange.manage capability)`
- `POST /api/admin/exchange/prices — {currencyId, priceMinor, note} → new append-only price row; note required; bounds-checked against exchange.price_change_max_pct`
- `GET /api/admin/exchange/orders?status=pending — manual + crypto verification queue`
- `POST /api/admin/exchange/orders/:id/complete — settle a manual/crypto order (idempotent) | POST .../cancel — with reason`
- `POST /api/admin/exchange/credit — {userId, currencyId, amount, reference, note} → admin_credit order, settled immediately (cash/bank fallback)`
- `POST /api/admin/exchange/orders/:id/refund — v2: Stripe refund of original payment + reversing ledger entries, only within exchange.refund_window_days and if credits unspent`
- `GET /api/admin/exchange/treasury — per-currency: sys-treasury balance, net issued (outstanding liability), sum-zero check result`

## Surfaces

**Pages** (routes contributed only when the module is enabled): `/wallet` — `WalletPage`: `BalanceCard` per internal currency (amount + 'what this is for' description), `ExternalTokenCard` per Hypha/Base token (read-only balance via existing economics-section Base reads, 'Trade on Hypha ↗' deep link, and nothing at all when address is blank or RPC fails — never a fake zero), `StatementSheet` (per-currency ledger lines), receipts list. `/exchange` — `ExchangePage` with two tabs: **Buy** (`BuyPanel`: pick a purchasable currency, quantity, live anchor price, limits banner showing remaining KYC-free headroom, pay-by-card → Stripe redirect, pay-by-cash instructions panel, pay-by-crypto when enabled) and **Swap** (`SwapCard`: the Uniswap-style two-panel from/to card as visual homage — token selectors, flip button, but a fixed-rate line reading 'Rate set by the village · no slippage · you receive exactly this or the trade cancels', with `RateHistorySheet` one tap away showing who changed the rate, when, and why). Success/cancel return routes `/exchange/complete/:orderId`. **Nav**: 'Wallet' entry in the drawer + `client/src/config/mobileNav.ts` contribution, only when enabled. **Admin**: one new tab in the existing `Admin.tsx` tab pattern — `AdminExchangeTab` with four sections: Currencies (registry editor, credit-kind only for economics; external tokens configured here too for display), Prices (current price per credit + append-only history + change form with required note), Orders (pending manual/crypto queue with complete/cancel, full order log, manual-credit form), Treasury (per-currency outstanding liability, sum-zero audit indicator). Tunables surface automatically in the existing Game Mechanics variables editor. **Mobile**: both pages are single-column cards already; SwapCard is thumb-reach with the flip button centered; limits banner collapses to a chip. **Copy**: all buy-panel and receipt legal text ('closed-loop credits, no cash value, non-refundable after N days') is admin-editable content in the config document store — zero Amora-specific copy in platform files.

## Mechanics

**Pricing model.** Every `credit` currency has one posted price in the anchor unit (USD cents by default): `priceMinor` = cents per 1 credit. Cross rate for swaps derives from the anchor, so there are no per-pair rates and no arbitrage triangles. Current price = latest `currency_prices` row; changing a price = appending a row (note required; bounded by `exchange.price_change_max_pct` per change to stop fat-fingers).

**Quotes (slippage-free).** `quote(from, to, amount, side)`: if side='receive', payAmount = ceil(receiveAmount × priceTo / priceFrom_effective); if side='pay', receiveAmount = floor(payAmount × priceFrom_effective / priceTo), where priceFrom_effective = priceFrom × (1 − spread%). The response carries both amounts, the exact price row ids used, the anchor value, and `expiresAt = now + exchange.quote_ttl_minutes`. Because credits are integers, the server returns the even pair that minimizes rounding remainder and the UI displays exactly what both sides are worth — no hidden dust. Execution re-checks that the supplied priceIds are still the latest rows; if an admin changed a price in between, the trade fails with 409 QUOTE_STALE and a fresh quote. The member always receives exactly the quoted amount or nothing.

**Settlement — one function, one ledger, double-entry.** A single `settleOrder(order)` function is the only code path that writes exchange ledger entries (mirrors F9's one-shared-function rule). All entries use the existing `creditTokens()` discipline: recompute-never-increment, idempotency key per entry derived from the order (`order:{id}:{account}:{currencyId}:{direction}`, fits varchar(160)). Post-cutover, all legs run in one MySQL transaction; the settlement is also safely re-runnable because every leg is idempotent (this is what makes Stripe webhook retries and admin double-clicks harmless).
- *Fiat/crypto purchase or admin credit*: `sys-treasury` −N currency, buyer +N currency. Fiat itself lives in the village's own Stripe account and is never ledgered — the ledger records token movement only; `payAmountMinor` on the order is the fiat audit trail.
- *Swap*: buyer −payAmount fromCurrency → `sys-treasury`; `sys-treasury` −receiveAmount toCurrency → buyer. Four entries, one order. Spread and rounding accrue to treasury implicitly (it nets the anchor-value difference).
- *Refund (v2)*: exact reversing entries + Stripe refund of the original payment intent. Never a fiat payout of credits — that single rule is what keeps this closed-loop.
**Invariant:** per currency, SUM(all ledger accounts including sys-treasury) = 0 net of `opening_balance` rows. `sys-treasury` balance is negative = credits outstanding = the village's liability, shown in the admin Treasury view with a green/red sum-zero audit check.

**Order state machine.** `pending → completed | failed | canceled | expired`. `fiat_purchase`: pending on creation, completed by webhook, expired by a sweep if unpaid after 24h (needs the Phase-3 scheduler; until then, expired lazily on read — no timer mutation, matching the 'nothing mutates on a timer' rule). `crypto_purchase`: pending until an admin verifies the tx hash and completes. `admin_credit` and `swap`: created and settled atomically. Completion assigns `receiptNo` (MAX+1 inside the settlement transaction), sends the receipt via existing `sendResendEmail()` (fire-and-forget, BCC to `exchange.receipt_bcc_email` if set), and optionally emits a Village Pulse entry via `addActivity()` when `exchange.pulse_purchases` is on (default off — purchases are private by default).

**Stripe flow.** POST /api/exchange/orders/fiat: capability check (`exchange.buy` — stage `member` by default, or the currency's `minStageToBuy` override) → limit check (sum of completed+pending fiat orders: per-order, rolling-30-day, calendar-year caps) → create pending order → create Checkout Session (line item named from the currency registry, metadata carries orderId, per-deployment STRIPE_SECRET_KEY env — each fork runs its OWN Stripe account; the platform never pools money). Webhook route registered with `express.raw()` BEFORE the json body parser, signature verified with STRIPE_WEBHOOK_SECRET, dedupes on `stripeSessionId` + entry idempotency keys. Client success page polls GET /api/exchange/orders/:id (never trusts the redirect as proof of payment).

**Firewalls (boot assertions, F4-style, in the config-load path).** (1) recognition-kind currency that is purchasable or swappable, or has a price row → refuse to boot; server rejects the write that would create it. (2) external-kind currency in a price row or swap leg → same. (3) ledger guard already refuses to credit non-platform tokens (`server/lib/ledger.ts` — the guard generalizes from `tokenType !== PLATFORM_TOKEN` to `currencies[id].governance !== 'platform'`). (4) module disabled → all /api/exchange routes 404 and nav contributes nothing.

**Capability gating** extends `shared/capabilities.ts`, never bypasses it: new keys `exchange.buy` (STAGE_UNLOCKS default: `member`), `exchange.swap` (default: `member`), `exchange.manage` (role-granted only, no stage unlock). Per-currency `minStageToBuy` may LOWER the gate for specific currencies (event tickets sellable to guests) but the check still runs through `hasCapability` + stage index.

**Maia (v2).** One new entry in the existing `PROPOSAL_KINDS` map (`server/index.ts:1536`): kind `credit-purchase-intent` — a guided intake for 'I want to pay cash for stay credits', producing a submission the admin converts to an `admin_credit` order. Reuses the injection guard and caps; no second AI plumbing.

## Game variables

- exchange.anchor_currency: 'USD' (choice: USD | CRC) — unit of account all credit prices are posted in; also the Stripe presentment currency
- exchange.swap_spread_pct: 0 (0–20, percentage) — spread applied to the from-side of swaps, accruing to the treasury; 0 keeps swaps value-neutral
- exchange.quote_ttl_minutes: 15 (1–1440) — how long a quoted pair is honored before the client must re-quote
- exchange.price_change_max_pct: 50 (1–500, percentage) — largest single price change allowed per append; bigger moves take two deliberate steps (fat-finger guard)
- exchange.purchase_min_minor: 500 (0–1000000) — minimum fiat purchase in anchor minor units ($5); keeps Stripe fees sane
- exchange.purchase_limit_order_minor: 50000 (0–10000000) — per-order KYC-free cap ($500)
- exchange.purchase_limit_30d_minor: 100000 (0–10000000) — rolling-30-day per-member cap ($1,000)
- exchange.purchase_limit_year_minor: 300000 (0–100000000) — calendar-year per-member cap ($3,000); all three limits fail with a friendly 'talk to the stewards' message, not a wall
- exchange.refund_window_days: 14 (0–90) — days within which an unspent fiat purchase can be reversed to the original payment method; 0 disables refunds (v2 flow)
- exchange.crypto_enabled: false (boolean) — shows the pay-by-crypto panel and enables POST /orders/crypto
- exchange.crypto_payment_address: '' (text, 0x-validated like tokens.*_address) — the village's receiving address for manual crypto purchases
- exchange.crypto_chain: 'base' (choice: base | ethereum) — which explorer the admin verification link uses
- exchange.hypha_dho_url: '' (text, https-validated) — the village's Hypha DHO base URL; every external token's 'Trade on Hypha' link resolves against it
- exchange.pulse_purchases: false (boolean) — post completed purchases to Village Pulse (names, never amounts)
- exchange.receipt_bcc_email: '' (text) — bookkeeping copy of every receipt
- exchange.fiat_expiry_hours: 24 (1–168) — unpaid Stripe orders expire after this long

## Admin controls

One 'Exchange' tab in the existing Admin.tsx tab pattern, four sections. (1) **Currencies**: create/edit internal credit currencies (name, symbol, description, purchasable/swappable flags, minStageToBuy, icon) and register external Hypha/Base tokens for read-only display (address, chain, hyphaUrl); server rejects any configuration that violates the recognition/external firewalls with a clear error, same pattern as F2's grantsVoice guard. (2) **Prices**: current posted price per credit currency; changing one requires a written reason and respects exchange.price_change_max_pct; full append-only history visible (who, when, why); v2 links price changes to consented agreements via the decision primitive. (3) **Orders**: pending queue (crypto tx verifications, expired-payment cleanups), complete/cancel with reason, the manual-credit form for cash/bank/SINPE payments (member picker, currency, amount, reference — becomes a settled admin_credit order with receipt), and a full searchable order log. (4) **Treasury**: per-currency outstanding credits (the sys-treasury liability), lifetime issued/absorbed, and a sum-zero ledger audit indicator that goes red if any code path ever writes an unbalanced entry. All sixteen tunables above appear automatically in the existing Game Mechanics variables editor (fail-loud registry in shared/gameVariables.ts). Module on/off toggle lives with the deployment's module registry — OFF by default; when off, no nav entry, no routes, no admin tab.

## Dependencies

- Ledger on MySQL (Phase 1b cutover of the token ledger domain) — settlement needs transactions; shipping the exchange before this means non-atomic multi-leg JSON writes protected only by idempotency keys, which is tolerable for admin_credit but not recommended for Stripe volume. Sequence this module immediately after the ledger domain cuts over.
- Pre-cutover schema decision: widen token_ledger.token_type from enum('gratitude','amora','voice') to varchar(32) validated against the currencies registry — must happen while the table has zero production rows (now), per the plan's own never-alter-a-live-enum reasoning.
- currencies registry table (this module ships it; it doubles as F2's currencies[] substrate, so F2's later work builds on it rather than colliding)
- shared/capabilities.ts (shipped) — three new capability keys plug into the existing gate
- shared/gameVariables.ts + server/lib/variables.ts (shipped) — sixteen new fail-loud variables
- Roles as data (shipped) — exchange.manage granted via role capabilities
- Resend email (exists, sendResendEmail) — receipts
- addActivity / Village Pulse (exists) — optional purchase announcements
- stripe npm package + per-deployment STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET env vars (each fork uses its own Stripe account — the platform must never pool merchant funds); express.raw() webhook mounting before the JSON body parser
- Base RPC reads for external token display — reuses the economics-section reader (tokens.base_rpc_url, tokens.*_address); until that ships, ExternalTokenCard simply renders nothing (address blank ⇒ hidden, per existing convention)
- Phase 3 scheduler (later) — order-expiry sweep; until then expiry is computed lazily on read
- Module registry / per-deployment toggle mechanism — exchange declares: requires ledger; contributes /wallet + /exchange routes, Wallet nav entry, Exchange admin tab

## v1 (ship first, useful alone)

Ship first, useful alone (4 sessions): **S1** — currencies registry table + seeds (gratitude as recognition, amora/voice as external, one example credit), token_type widening migration, boot invariants, ledger system account sys-treasury, settleOrder() with double-entry + idempotent legs, treasury admin view. **S2** — WalletPage (internal balances from ledger sums, external read-only cards with Hypha deep link, statement sheet), GET /api/exchange/currencies + /api/wallet, nav contribution behind the module toggle. **S3** — fiat purchases end-to-end: prices table + admin price editor with required note + history, BuyPanel with limits banner, Stripe Checkout + signature-verified idempotent webhook, purchase limits, receipts (numbered + emailed), success/cancel routes. **S4** — admin Orders section: manual admin-credit form (cash/bank/SINPE fallback), pending queue, cancel/complete, order log, capability keys wired, module-off 404s, loop-test-style e2e: buy → webhook replay credits once → balance correct → receipt exists → sum-zero holds. After v1 a village can sell stay credits and event tickets for real money with an audit trail — no swap needed yet.

## v2 (the full slide vision)

The full slide-26 vision minus the part that correctly lives on Hypha (3 sessions): **S5** — SwapCard (Uniswap-homage UI), quote endpoint with receive-driven even-pair rounding, QUOTE_STALE handling, 4-leg swap settlement, swap spread variable, RateHistorySheet as member-facing governance surface. **S6** — crypto purchases (instructions panel + tx-hash submission + admin explorer-verify flow; optionally Coinbase Commerce webhook if a real demand signal appears), refunds (Stripe reversal + reversing ledger entries within the window, unspent-credits check), order-expiry sweep on the Phase-3 scheduler. **S7** — governance integration: price changes and limit changes executable via the Phase-4 decision primitive (execution.kind 'variable_change' + a 'price_change' execution mapping to an appended price row, attributed to the bot user per F8), Maia PROPOSAL_KINDS 'credit-purchase-intent' for cash-purchase intake, statement CSV export, F13 instrumentation review (orders + price rows already emit everything the health dashboard will want).

## As shipped — swap v2 (S57–S61, 2026-07-27)

The swap engine is built and proven end to end. It is narrower than the v2 sketch above in three deliberate ways, and every narrowing is a safety property rather than a cut corner.

**Two legs, not four.** A swap is `member → sys:treasury` in the pay token and `sys:treasury → member` in the receive token, posted by `postTransferPair()` — one MySQL transaction, both legs or neither. There is no intermediate account and no minting: the treasury is the only counterparty, and if it does not hold the receive token the swap is refused rather than fulfilled. The pair function takes a single sorted `FOR UPDATE` lock across both accounts before creating anything, because materializing an account first takes a shared lock that two concurrent swaps then deadlock trying to upgrade. `allowNegative` is a hard error inside a pair — an overdraft may be a stay's grace debt, never a trade.

**The faucet firewall is destination-based, not name-based.** A token is unswappable if any faucet account has ever paid it to anywhere other than `sys:treasury`. Stocking the treasury (`sys:mint → sys:treasury`) is exempt; every other faucet payment taints the token permanently. This closes the hole a source-name allowlist leaves open: a generic `admin_mint` transfer would walk straight past a list of known reward sources. The practical effect is that anything a member could earn from thin air — recognition, quest rewards, hand-minted credits — can be bought but never swapped, however it was earned. `repairTaintedListings()` re-checks this at every boot and silently narrows any listing that has since become tainted; `assertSwapFirewalls()` then refuses to boot if anything illegal is still open.

**Receive-driven quoting, rounding toward the treasury.** The member says what they want to receive; the engine computes what they hand over as `ceil((qB × pB × 10000) / (pA × (10000 − spread)))` in BigInt. Ceiling on the pay side means the rounding dust always favours the village, which gives the property the loop test asserts across 2000 randomized price/spread tuples: swapping A→B→A can never return more A than you started with. The whole take (spread plus rounding dust) is printed to the member before they confirm — `takeMinor` is never hidden.

Also shipped: fail-closed per-cycle and per-member-per-cycle caps where **0 means zero, never unlimited**, checked twice — once cheaply before any transaction opens, so a member over their allowance gets a clear refusal and a remaining count, and again as a `PairGuard` **inside** the ledger transaction, after the accounts are locked. Only the second one binds. A cap read before the transaction is check-then-act: ten concurrent requests all read the same pre-swap total, all decide they fit, and all execute, so the cap bounds one request instead of the cycle. The guard runs under the same `sys:treasury` row lock that orders the writes, so each concurrent swap sees its committed predecessors; a vetoed pair rolls back having written nothing; a 45-day hold (`exchange.swap_fiat_hold_days`) that freezes card-bought tokens from swapping so a chargeback still finds them unconverted; one-click halt with a resume that requires a written sentence; `client_key` idempotency scoped per member so a double tap returns the same receipt — but only a **settled** order replays, and only for the same trade: a still-pending one answers `IN_FLIGHT` rather than guessing whether tokens moved, a failed or cancelled one releases its key so the member can retry the intent, and the same key sent for a different trade answers `KEY_REUSED` instead of confirming a swap nobody asked for; `QUOTE_STALE` when either posted price moved between quote and confirm; an hourly `exchange-reconcile` job plus a boot pass that resolves any order whose legs are ambiguous (two legs ⇒ paid, zero ⇒ cancelled, exactly one ⇒ throw, because guessing about a half-written trade is worse than an alarm); a pending swap blocking both module-disable and member exit; and a rate-history endpoint that shows who set each side of a cross rate and why.

Not shipped from the v2 sketch, and not currently planned: crypto purchases, refunds/reversals for swaps (a swap is final — the only reverse is swapping back at the posted prices), and governance-executed price changes. The last one has its landing pad: `currency_prices.decision_ref` is a nullable column the rate history already renders, enforced by nothing.

**Trading is OFF by default in every deployment, forever.** `exchange.tradingEnabled` is a per-deployment opt-in that requires accepting a version-stamped legal caution card; the server stamps who accepted it and when, refuses an acceptance of any card but the current one, and refuses to boot with trading on under a shared-password admin posture. On the Amora foundation deployment itself, zero tokens currently qualify for swapping — gratitude is recognition, amora and voice are Hypha-governed, stay-credit is sold by another module, library-credit is never listed, and credits/stay-credits are faucet-issued. The engine is platform capability for forks, shipped dark.

## Risks

- Legal (needs real review before real money flows, flagged per the mandate): closed-loop credits usually avoid e-money/money-transmitter status, but stay-credits resemble prepaid lodging (tax/VAT treatment in Costa Rica), EU-resident buyers may drag in EMD2 limited-network exclusions, US state gift-card laws regulate expiry/breakage, and the KYC-free thresholds chosen here are product defaults, not legal advice. Credits must NEVER become fiat-redeemable or transferable peer-to-peer without re-running this analysis — either change converts arcade credits into e-money.
- Slide-26 expectation gap: Rye's own words say 'shares of the different village projects' swap here. This design deliberately refuses that (Hypha boundary) — if Rye actually wants in-platform share swaps, that is a securities-exchange posture and a fundamentally different (and probably inadvisable) product. Must be confirmed, not assumed.
- Chargebacks after credits are spent: a disputed Stripe payment can claw back fiat while the credits are gone (a night already slept). Mitigation: negative-balance policy + limits keep exposure small; document the dispute flow for admins.
- Treasury pricing errors: a mispriced credit lets members drain treasury value via swaps. Mitigations shipped: price-change bound, required note, append-only history, sum-zero audit; residual risk is a deliberately wrong price, which is governance's problem, not code's.
- Unbalanced-entry drift: if any future module credits a user without the treasury counter-leg, the sum-zero invariant breaks silently. Mitigation: settleOrder() is the single writer for exchange flows, and the Treasury view surfaces the audit check permanently.
- Stripe per-fork onboarding friction: each village needs its own Stripe account, keys, and webhook endpoint configured — a real setup-wizard step for Custom-Game-Foundation, and the module must fail loud (admin banner) when keys are absent but the module is on.
- Shipping before the ledger cutover would put multi-leg settlement on non-atomic JSON writes; idempotency keys prevent double-credit but not half-applied swaps. The sequencing dependency is the mitigation — hold swaps until MySQL transactions exist.
- Scope creep magnet: accommodation auto-charge (slide 32) and library credits mechanics (slide 33) will want to live in this module. They are separate modules that SPEND credits through the same ledger; the exchange only sells and swaps them. Keep the boundary or this becomes the god-module.

## Open questions

- CONFIRM WITH RYE (the slide-25/26 tension): internal exchange trades platform-governed credits only; anything share-like — Amora equity, Voice, per-project/business tokens like slide 26's 'Restaurant' — displays read-only in the wallet with a 'Trade on Hypha' deep link. Recommended as the platform default for every fork. Is that acceptable as the permanent posture, or does he want a future bridge?
- Default purchase gate: member stage (recommended — sales to a closed community strengthen the legal posture) with per-currency minStageToBuy overrides for public-ish items like event tickets. Right default?
- Anchor currency for Amora: USD or CRC? (Stripe supports CRC; the deck priced in dollars; game variable either way.)
- Should Gratitude→credit conversion ever exist? Currently firewalled both directions on principle (recognition must stay unbuyable and unsellable); F2's release mechanism flows value TO members at cycle close, which is the sanctioned direction. Confirm the firewall is permanent.
- Where does the stay-credit SPEND side live? Slide 32's accommodation auto-charge is a separate module that debits the same ledger; the exchange only sells credits. Confirm that module boundary before anyone builds nightly billing into the exchange.
- Credit expiry/breakage: do credits ever expire (dormancy fee, expiry date)? Legally sensitive (gift-card laws), economically meaningful (unredeemed liability grows forever otherwise). Proposed default: no expiry, revisit with counsel.
- Refunds default-on (14-day window, unspent only) or default-off with admin-discretion refunds only? Consumer-friendliness vs. bookkeeping simplicity for a tiny village.
- Receipt numbering per calendar year (AMR-2026-000123, resets annually, config-driven prefix) or a single monotonic sequence forever?
