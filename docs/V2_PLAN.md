# Amora / Village OS — V2 PLAN

**Written:** 2026-07-27 · **Supersedes:** nothing; extends `MODULES_MASTER_PLAN.md` Part 2 and the deferral lines at `:486–487`
**Precedence:** the MASTER_PLAN precedence rule (lines 18–20) still governs — where `docs/modules/*.md` contradicts Part 2 or the two CRITIQUE files, the fix wins. This document is now a third fix-bearing source and outranks `docs/modules/internal-exchange.md` on swap.
**Repo state at authorship:** S0–S56 shipped. Last migration on disk is `drizzle/0028_automation_pipeline.sql`. Every module ships OFF.

---

# PART 1 — EXCHANGE SWAP v2 (S57–S61)

## 1.1 The synthesis: which design won, and what was grafted onto it

**Base: Design A (minimal-risk).** Two of the four panels put A first and a third named it the correct *base* while scoring it second. The decisive argument is that on an economy this small, the number of doors matters more than the quality of the alarms. A ships the fewest: a posting primitive fixed at exactly two legs, `allowNegative` refused as a hard error inside the primitive rather than as a calling convention, no faucet-firewall override, no swap reversal, no N-leg generic API, no new negative-allowed source, no new listing flag. Its ~4 real sessions against B's ~6 and C's ~8–9 is not a tiebreak, it is the reason a demand-triggered build is buildable at all. Where A was wrong it was wrong in ways with cheap, named fixes, and every one of those fixes already exists fully specified in a runner-up.

**Grafted from C (governance-first) — three things, all cheap:**
- **The destination-based faucet test.** A's `SWAP_NEUTRAL_FAUCET_SOURCES` allowlist declares `admin_mint` non-tainting by name, and `server/index.ts:5450–5459` posts `sys:mint → mem:{user}` under exactly that source for *any* slug — the single most general faucet-to-member issuance route in the codebase walks straight through A's firewall. C's rule is structural: a faucet sending to anything other than `sys:treasury` is issuance; a faucet sending to `sys:treasury` is stocking. It is one query, no table, no cache, no allowlist to maintain, and no future module can invent a source string that slips past it. This is the single most valuable idea across all three designs and it deletes A's risk 8 and its per-replica TTL-cache window in one move.
- **Boot assertions 5 and 6** (no `exchange_swap` row touches a faucet on either side; every `source_ref` group is exactly two rows, opposite directions across `sys:treasury`, distinct tokens). A's reconciler only sweeps `pending` orders, so a half-pair on a settled order is invisible to it forever. C's version is a permanent, whole-ledger detector for precisely the failure CRITIQUE-architecture §91 and `internal-exchange.md` §189 both name.
- **Fail-closed per-token caps** (`0` means zero, not unlimited) and **unilateral halt**. A public number bounding per-cycle treasury outflow is the only answer any of the three designs offers to "what if the steward is captured," and it survives regardless of how legitimately the number was chosen. Halt separable from delisting is a circuit breaker A and B simply lack.

**Grafted from B (member-experience) — four things, all near-free:**
- **Receive-driven quoting with ceil on the pay side.** "I need 5 tickets → that costs you 2 stay-credits" is how a person forms the intent. It costs nothing extra to implement, preserves rounding-favours-treasury in both directions, and the A→B→A no-profit property holds under ceil-on-pay at spread 0 (proof in §1.5).
- **The server-rendered `sentence`.** One plain-language promise authored by the engine that will honour it, shown verbatim by the client. Client and server can never disagree about what was offered, and refusal copy becomes a tested server artifact instead of frontend prose.
- **Live-pairs-only rendering** (`myPairs` computed from the member's own non-zero balances × swappable+priced+in-stock+uncapped tokens) and **the library redirect** — a member whose need implies `library-credit` gets a link to the real door, not a greyed-out row.
- **The `purchaseProblem` / `swapProblem` split** — but only the half where swap refuses *more* than buying.

**Rejected, explicitly:**
- **B's one-seller carve-out** (making `stay-credit` swappable). It creates a second issuance path for a token whose sale funds a module's pool; B concedes the stays pool ends up "quietly underfunded and the leak looks like generosity." Under the grafted destination-based faucet test it is moot anyway — `server/lib/stays.ts:6–8` issues `stay-credit` as `sys:mint → mem:guest` under `stay_comp` and `quest_stay_reward`, so `stay-credit` is faucet-tainted and refused.
- **B's `token_swap_guard` cache table** (three maintenance points, and as specified the in-`postTransfer` upsert is dead on arrival once `postTransfer` delegates to a batch). The destination query needs no cache.
- **B's N-leg `postTransferBatch` with `postTransfer` delegating to it.** Rewriting the transaction semantics of the keystone is an economy-wide risk for a two-leg feature.
- **C's mandate subsystem.** C's own risk 1 disassembles it: `forum_threads.kind='decision'` has no votes, no quorum, no eligibility — a single `proposal.decide` holder writes a string. It buys legibility plus a clock for two to three sessions. We keep the *legibility* for free (§1.9) and ship a `decision_ref` **contract column**, engine deferred — the same posture that made `swappable` cheap.
- **C's `faucet_override_decision_ref`.** A laundering door gated on a primitive its own author calls one person writing a string.
- **C's `exchange_quotes` table.** Stateless quotes plus an `expectPay` consent check give the same guarantee with no lifecycle, no expiry sweeper, and no reservation-griefing lever.
- **A's, B's, and C's `MODIFY COLUMN status` enum ALTER** — wait, C caught this; A and B did not. `drizzle/0019_forum.sql:4` states the house rule verbatim: *"a live enum ALTER is the forbidden migration class,"* and no migration 0014–0028 performs one. Swaps settle at `status='paid'` with `paid_at` set; the serializer renders `kind='swap' && status='paid'` as "completed."

---

## 1.2 Spec grounding

| Claim | Source |
|---|---|
| Internal token↔token trading is a separate opt-in capability, OFF by default, per deployment, with the legal caution card | Gate B, `MODULES_MASTER_PLAN.md:523` |
| Fiat flows IN only; tokens can never be sold for fiat on the platform | Gate C2, `:524` |
| Swap engine is demand-triggered, not scheduled | `:487` ("exchange swap (demand)"), reconciled with D6 at `:249–251` by v1 shipping the contract with no engine |
| No swappable/purchasable faucet tokens | invariant 2.2 #2 |
| Treasury is not a faucet; non-negative system accounts except declared faucets | invariant 2.2 #4; `server/lib/ledger.ts:6–10` |
| Rounding favors the treasury; A→B→A no-profit property test; `ord:{id}:leg{n}` positional keys | invariant 2.2 #10 |
| Per-source-event single payout — one ack row funds at most one ledger credit | invariant 2.2 #1; CRITIQUE-architecture §19 |
| Commerce flags live in `token_exchange_settings` keyed on `tokens.slug`; `currency_prices` survives | invariant 2.2 #15 |
| Module disable respects open economic state | invariant 2.2 #13; `server/lib/exchange.ts:267`, and `server/lib/exit.ts:137` reads the same predicate |
| Preview-lifecycle leak guard via `moduleActivity()` | invariant 2.2 #14 |
| One gate (`shared/capabilities.ts`), never a parallel path | product rule 2.1 #5 |
| Recognition unbuyable and unsellable; Hypha read-and-display only | 2.1 #3, 2.1 #6 |
| `idempotency_key` is varchar(191); do not build keys that approach it | `drizzle/0009_ledger_accounts_and_transfers.sql:62` |
| A live enum ALTER is the forbidden migration class | `drizzle/0019_forum.sql:4` |
| Faucet-minted credits becoming real goods is the laundering path | CRITIQUE-architecture §25–27 |
| Half-applied swaps / key truncation dropping a leg | CRITIQUE-architecture §91; `internal-exchange.md` §189 |
| No pair table, cross rate derives from the anchor | `internal-exchange.md` §115 |
| A treasury selling at posted prices looks like a shop; a floating user-to-user market does not | `internal-exchange.md` §14(4), §184 |

**Superseded by this ticket:** `internal-exchange.md`'s `currencies` table, `kind='external'`, the 4-leg order shape, and `exchange.swap_spread_pct` (renamed to `_bps`; a strictly-integer economy cannot represent 0.5% in whole percent — a deliberate rename, flagged rather than drifted).

---

## 1.3 Schema — `drizzle/0029_exchange_swap.sql`

No new tables. No enum ALTER. No ledger columns and no new system account — one index on `token_ledger` is the entire ledger-side footprint.

```sql
-- 0029 (S58): Exchange v2 — the internal swap engine.
--
-- A swap is TWO transfers between a member and sys:treasury, posted in ONE
-- transaction by the keystone's new postTransferPair. It mints nothing, it
-- touches no faucet, and it has no provider. The order row is the receipt.
--
-- NO enum ALTER (0019's forbidden migration class): a settled swap is
-- status='paid' with paid_at set, and the serializer renders kind='swap'
-- + 'paid' as "completed". Every read of exchange_orders is made kind-aware
-- in this same session — see the audit list in the ticket.
--
-- token_slug/quantity/price_minor_each keep meaning the RECEIVE side, so
-- receipts, the member order list, the admin list, exchangeOpenState() and
-- exit.ts's open-state read all keep working. The pay_* columns are new.
-- amount_minor is the PAY-side fiat valuation: a number for the receipt and
-- the caps, NEVER a charge. No swap ever enters payments.ts.

ALTER TABLE `exchange_orders`
  ADD COLUMN `kind` enum('fiat_purchase','swap') NOT NULL DEFAULT 'fiat_purchase' AFTER `user_id`,
  ADD COLUMN `pay_token_slug`       varchar(64) NULL AFTER `kind`,
  ADD COLUMN `pay_quantity`         int         NULL AFTER `pay_token_slug`,
  ADD COLUMN `pay_price_minor_each` int         NULL AFTER `pay_quantity`,
  -- The exact currency_prices rows the rate came from. Denormalized on
  -- purpose: a receipt must survive later price posts unchanged.
  ADD COLUMN `pay_price_row_id`     varchar(64) NULL,
  ADD COLUMN `receive_price_row_id` varchar(64) NULL,
  ADD COLUMN `spread_bps`           int         NULL,
  -- net_minor is the RECEIVE-side valuation. amount_minor - net_minor is
  -- the village's take (spread + whole-unit rounding), printed to the member
  -- BEFORE they confirm. We do not hide dust.
  ADD COLUMN `net_minor`            int         NULL,
  -- Member-supplied double-submit guard. Scoped to the member: a global
  -- unique key would let one member's key collide into another's order.
  ADD COLUMN `client_key`           varchar(80) NULL,
  ADD UNIQUE KEY `exchange_orders_client_key_uq` (`user_id`,`client_key`),
  ADD KEY `exchange_orders_kind_idx` (`kind`,`status`,`created_at`);
-- provider_ref stays UNIQUE and stays NULL for swaps (MySQL permits many
-- NULLs in a UNIQUE index). A swap has no provider, ever — boot-asserted.

-- Fail-closed caps and the halt switch. NO new listing flag: `swappable`
-- remains THE switch, exactly as 0022 promised. 0 means ZERO, not unlimited:
-- the act that opens a market must state its size in the same breath.
ALTER TABLE `token_exchange_settings`
  ADD COLUMN `max_swap_out_per_cycle`            int NOT NULL DEFAULT 0,
  ADD COLUMN `max_swap_out_per_member_per_cycle` int NOT NULL DEFAULT 0,
  -- Halt is unilateral and instant. Resume needs a note, not a ceremony.
  ADD COLUMN `swap_halted_at`     timestamp   NULL,
  ADD COLUMN `swap_halted_by`     varchar(64) NULL,
  ADD COLUMN `swap_halt_reason`   varchar(255) NULL;

-- CONTRACT COLUMN, engine deferred (the `swappable` pattern). A price post
-- may cite the decision thread that authorized it; the rate history renders
-- it when present. NOTHING enforces it in v2. This is the landing pad for
-- backlog item X6 (governance-executed price changes) and it costs one
-- nullable column now instead of a migration later.
ALTER TABLE `currency_prices`
  ADD COLUMN `decision_ref` varchar(64) NULL,
  ADD KEY `currency_prices_decision_idx` (`decision_ref`);

-- The faucet firewall scans by sender. Give it an index.
ALTER TABLE `token_ledger`
  ADD KEY `token_ledger_faucet_idx` (`from_account`,`token_type`);
```

**The `kind`-awareness audit, executed in S58** — five read sites, each gets an explicit filter or a kind-aware render:

| Site | Change |
|---|---|
| `server/index.ts:5173` (member order list) | select `kind`, `pay_token_slug`, `pay_quantity`, `net_minor`; render swaps as a swap line |
| `server/index.ts:5259` (admin order list) | same, plus a kind column and a kind filter |
| `server/index.ts:1955` (webhook settle → `paid`) | add `AND kind = 'fiat_purchase'` — a settlement webhook must never touch a swap |
| `server/index.ts:1987` (dispute/refund status write) | add `AND kind = 'fiat_purchase'` |
| `server/lib/exchange.ts:269` + `server/lib/exit.ts:137` (open state) | **no change** — kind-agnostic is correct; a pending swap must block both module-disable and member exit. Pin both with a test rather than editing the query. |

---

## 1.4 Server surface

### `server/lib/ledger.ts` — one new primitive, one pure refactor

```ts
export interface PairResult {
  ok: boolean;
  duplicate: boolean;
  error?: string;
  /** "accountId|tokenType" -> recomputed balance, all four touched pairs. */
  balances: Record<string, number>;
}

/**
 * Post EXACTLY TWO transfers in ONE transaction: both, or neither.
 *
 * postTransfer is single-leg and owns its transaction, so two sequential
 * calls can commit leg1 and fail leg2 — the member debited and never
 * credited that CRITIQUE-architecture §91 warned about. This is the fix.
 *
 * Fixed at two legs ON PURPOSE. A generic N-leg API is the thing that makes
 * a router easy to build, and a router is an AMM wearing a helper function.
 */
export async function postTransferPair(
  pool: Pool,
  legs: [TransferInput, TransferInput],
): Promise<PairResult>;
```

Ordered semantics:

1. **Shared validator.** Extract `postTransfer`'s pre-flight block (`ledger.ts:187–213`) into `validateLeg(input)`; both functions call it. **`postTransfer`'s transaction body is not touched** — this is the cheapest way to get atomicity into the keystone without rewriting the most load-bearing function in the system.
2. **`allowNegative` is illegal in a pair** — hard error, checked inside the primitive, not by convention. `"exchange_swap"` is never added to `ALLOW_NEGATIVE_SOURCES`; the pin at `server/payments.test.ts:72` catches anyone who tries.
3. Reject duplicate idempotency keys within the pair.
4. Materialize `mem:*` endpoints (`INSERT IGNORE`); system accounts must pre-exist.
5. **One sorted lock statement** over the deduped union: `SELECT id, faucet FROM ledger_accounts WHERE id IN (…) ORDER BY id FOR UPDATE`. Concurrent swaps serialize deterministically on `sys:treasury`; no deadlock.
6. Insert both rows.
7. On `ER_DUP_ENTRY`: rollback, then count both keys. **2** → `{ok:true, duplicate:true}` (clean replay). **1** → **throw** `partial idempotency collision on ord:…:legN — keys from different orders have merged; refusing to complete`; a mixed state is unreachable under one transaction, so this branch is a canary for a key-shape bug, and it refuses rather than guesses. **0** → rethrow.
8. Recompute all four `(account, token)` caches in sorted `account|token` order.
9. Overdraft-check **every** non-faucet sender after the inserts. Either failing rolls both legs back.
10. Commit once.

**All arithmetic in the quote path is BigInt.** `receiveQty · price · 10000` exceeds `Number.MAX_SAFE_INTEGER` at plausible bounds (1e6 units × ₡10,000 × 10^4 ≈ 1e17), and floating multiply can round *up* — the one direction that breaks the no-profit proof. Convert to `Number` only after the final integer division, and refuse anything above 1e9.

### `server/lib/exchange.ts` — firewalls

```ts
/** Never a swap source or destination, whatever an admin clicks. */
const NEVER_LISTED = new Set(["library-credit"]);   // unchanged, still static

/** Shared refusals — true of buying AND swapping (v1's rules, extracted). */
function tradingProblem(slug: string): string | null;

/** Buying: shared rules + NEVER_LISTED + one-seller. Behaviour unchanged. */
export function purchaseProblem(slug: string): string | null;

/**
 * Swapping refuses everything buying refuses, PLUS faucet issuance.
 * A token that can be earned from thin air must never become a claim on
 * real goods (2.2 #2, Gate B's closing sentence, CRITIQUE-arch §25-27).
 *
 * The test is STRUCTURAL, by destination, not by source name:
 *   faucet -> sys:treasury        = stocking, whatever it is called
 *   faucet -> anything else       = issuance, whatever it is called
 * A source-name allowlist rots — admin_mint posts sys:mint -> mem:{user}
 * for ANY slug (server/index.ts:5450-5459), and every future module invents
 * its own award source. This version no future module can walk past.
 */
export async function faucetIssuedTokens(pool: Pool): Promise<Map<string, number>>;
export async function swapProblem(pool: Pool, slug: string, tainted?: Map<string, number>): Promise<string | null>;
```

```sql
SELECT l.token_type, COUNT(*) AS n
  FROM token_ledger l
  JOIN ledger_accounts a ON a.id = l.from_account
 WHERE a.faucet = 1 AND l.to_account <> 'sys:treasury'
 GROUP BY l.token_type
```

The refusal string is written for a member, not an operator: *"Village Credits are minted by the village as a reward — tokens you can earn from thin air are never bought or swapped here."*

Also in `exchange.ts`: `quoteSwap()` (pure, BigInt, receive-driven), `createSwapOrder()` (extends `createExchangeOrder` — **the same `SELECT COALESCE(MAX(receipt_no),0) FOR UPDATE` sequence, not a fork**), `executeSwap()`, `reconcileSwapOrders()`, `repairTaintedListings()`, `swapCycleUsage()`, `swappableBalance()`, `assertSwapFirewalls()`.

### Routes

| Route | Notes |
|---|---|
| `POST /api/exchange/swap/quote` | Stateless. `{payToken, receiveToken, receiveQuantity}` → `{payQuantity, valueMinor, netMinor, takeMinor, spreadBps, payPriceRowId, receivePriceRowId, payPriceNote/setBy/setAt, receivePriceNote/…, sentence, disclosure, refusal}`. 501 when `tradingEnabled` is false, same as execute. No row is written. |
| `POST /api/exchange/swap` | **The frozen public path.** `{payToken, receiveToken, receiveQuantity, expectPayQuantity, payPriceRowId, receivePriceRowId, clientKey}`. Still 501 when `tradingEnabled` is false — only the message changes. |
| `GET /api/exchange` | + `swap: { enabled, halted, myPairs[] }`, + `mine.canSwap`. `tradingEnabled` stays exactly where it is. |
| `GET /api/exchange/rates/history?pair=a:b&since=` | Cross-rate series reconstructed by merging the two anchor series; each point carries both source rows, both notes, both setters, and `decision_ref` when present. Public when lifecycle is public. |
| `GET /api/admin/exchange` | + `swapSpreadBps`, `caps`, `haltState`, `taintedTokens: {slug, issuanceRows}[]` — so an admin sees *why* a token refuses to list instead of guessing. |
| `POST /api/admin/exchange/tokens/:slug/halt` | `exchange.manage`. One click, reason optional, audit event. |
| `POST /api/admin/exchange/tokens/:slug/resume` | `exchange.manage`. **Requires a note ≥ 20 chars**, re-runs every firewall for that slug, audit event. Narrowing is a hand; widening writes a sentence. |

### Variables — `shared/gameVariables.ts`, Exchange category

| Key | Type | Default | Bounds | Member-facing meaning |
|---|---|---|---|---|
| `exchange.swap_spread_bps` | integer | `0` | 0–2000 | "The village's share of each swap." Basis points, not percent — the economy is integer-only and 0.5% must be expressible. At 0 the card reads *"The village keeps nothing on this swap."* The spread is a policy dial, **not** the safety mechanism; ceil-on-pay is safe at zero. |
| `exchange.swap_fiat_hold_days` | integer | `45` | 0–180 | "Tokens you bought with a card settle for N days before they can be swapped." |
| `exchange.swap_max_receive_per_order` | integer | `500` | 1–1000000 | "The most you can receive in one swap." |

Per-token and per-token-per-member cycle caps live on `token_exchange_settings`, not here — they are per-listing facts, and they default to closed.

### Capability — `shared/capabilities.ts`

Add `"exchange.swap"` to the `Capability` union, to `ALL_CAPABILITIES` (or badges silently cannot grant it), and `STAGE_UNLOCKS["exchange.swap"] = "member"` — parity with `exchange.buy`. Not `contributor`: `tradingEnabled` plus fail-closed caps do the safety work, and a stage floor above the buy floor just shows more members a door they cannot open. Wire into `client/src/pages/Admin.tsx:3238`. One gate, `hasCapability` only, never a parallel path.

### Module def — `shared/modules.ts`

`capabilities: ["exchange.buy", "exchange.swap", "exchange.manage"]`; `variableKeys` gains the three above; `defaultConfig: { tradingEnabled: false }` **unchanged** — this is Gate B's opt-in switch and v2 gates the engine on it rather than replacing it. `validateConfig` additionally requires, when `tradingEnabled === true`, a `legalAck: { cardVersion, acceptedBy, acceptedAt }` matching the current card version.

### Boot assertions — `assertSwapFirewalls(pool)`, mounted immediately after `assertExchangeFirewalls(pool)` at `server/index.ts:1884`

0. **`repairTaintedListings()` runs first.** Any active listing that now fails the faucet rule is auto-delisted (`purchasable=0, swappable=0`), `console.error`'d, audit event `exchange:autodelist:{slug}`. Automated authority may **narrow** the market and never widen it. This is why v2 needs no two-release staged rollout: on an existing deployment the retroactive rule produces a loud, recoverable config change instead of a boot crash.
1. Per-listing sweep with `swapProblem` / `purchaseProblem` → throws on anything repair could not fix (unregistered slug, retired token).
2. `!ALLOW_NEGATIVE_SOURCES.has("exchange_swap")` → throw. Someone will eventually be tempted.
3. `"exchange_swap"` absent from every exported source-weighting set (cycle release, health scoring) → throw. **This is invariant #1's defence** and keeps the ADR-30 collision dead.
4. No `source='exchange_swap'` ledger row touches a `faucet=1` account on either side.
5. **Leg pairing:** every `source_ref` among `exchange_swap` rows has exactly 2 rows, opposite directions across `sys:treasury`, distinct `token_type`. A group of 1 → refuse boot, naming the order. Permanent half-pair detector across the whole ledger, not just pending orders.
6. No `kind='swap'` order carries `provider_ref` or `stripe_payment_intent_id`. **Gate C2 asserted in data**, not merely in code.
7. `reconcileSwapOrders()`: `kind='swap' AND status='pending' AND created_at < NOW() - INTERVAL 5 MINUTE` → both legs present ⇒ `paid`; neither ⇒ `cancelled`; **exactly one ⇒ throw**.
8. `tradingEnabled && guards.sharedPasswordPosture()` → throw. The framework's 403 covers only the `off → on` lifecycle transition; `tradingEnabled` is *config*, reachable by another route and by a hand-edited row.
9. `tradingEnabled` without a recorded legal ack for the current card version → throw.
10. All cap columns ≥ 0; `swap_spread_bps` within bounds.
11. Advisory (log, do not throw): `tradingEnabled` with fewer than two tokens that are swappable + priced + capped above zero.

Failures log `[swap firewall] …` per problem and throw `swap firewalls violated (N) — refusing to serve`, matching `exchange.ts:141`. Each message names the one-action fix.

`checkLedgerInvariants()` needs **no change** — conservation, cache drift, and illegal-negative already cover swaps for free, because both legs are ordinary transfers between two existing accounts.

### Scheduler

**One job, and it is a reaper, not a settler.** `registerJob("exchange-reconcile", …)` hourly, calling the same `reconcileSwapOrders()` the boot assertion calls, plus (free graft, closes backlog item X4) sweeping stale `kind='fiat_purchase' AND status='pending'` orders past `exchange.order_expiry`. The scheduler never executes a swap and never closes a cycle.

---

## 1.5 The math

Receive-driven, ceil on the pay side, BigInt throughout:

```
pA = latestPrice(payToken).price_minor          // > 0, required
pB = latestPrice(receiveToken).price_minor      // > 0, required
s  = exchange.swap_spread_bps                   // 0..2000

payQty    = ceil( qB · pB · 10000 / ( pA · (10000 − s) ) )   // ceil → treasury
grossMinor = payQty · pA          // what the member hands over, in fiat terms
netMinor   = qB · pB              // what the member receives, in fiat terms
takeMinor  = grossMinor − netMinor  // spread + whole-unit rounding. PRINTED.
```

**A→B→A no-profit, at spread 0 (invariant #10).** Holding `qB` of B, the largest `qA'` obtainable satisfies `ceil(qA'·pA·10000 / (pB·(10000−s))) ≤ qB`, hence `qA' ≤ qB·pB·(10000−s)/(pA·10000) ≤ qB·pB/pA`. And the original `payQty ≥ qB·pB/pA` by the ceiling. Therefore `qA' ≤ payQty` for every price pair and every spread including zero. The ceiling alone closes it; the spread is policy. Generalizes to n hops because all rates derive from one anchor vector — there is no triangle to arbitrage.

**Dust is disclosed, not hidden.** The confirm card prints both valuations and the difference in fiat terms, labelled: *"You hand over 3 stay-credits (₡15,000). You receive 7 event-tickets (₡14,000). The difference — ₡1,000 — is whole-unit rounding plus the village's 0% share."* Both B (risk 5) and A (§1.1) chose not to print this and both were marked down for it by two panels. Printing it costs one line and removes the only comprehension failure a sharp member can weaponize.

---

## 1.6 The execution path

**Ordered refusals, all before any write** (cheapest and most informative first). Each is a distinct code so the client can be honest, and each carries server-authored member copy.

| # | Check | Failure |
|---|---|---|
| 1 | module lifecycle non-off | 404 (existing `requireModule`) |
| 2 | `moduleConfig("exchange").tradingEnabled` | **501**, body preserved |
| 3 | authed | 401 |
| 4 | `hasCapability("exchange.swap", ctx)` | 403 |
| 5 | body shape: slugs, `receiveQuantity` 1..`swap_max_receive_per_order`, `clientKey` 1..80 | 400 |
| 6 | `payToken !== receiveToken` | 400 |
| 7 | existing order for `(user_id, client_key)` | **200 idempotent replay** — reconcile, return the same receipt |
| 8 | both settings `active && swappable`, neither `swap_halted_at` | 404 `NOT_SWAPPABLE` / 503 `HALTED` + reason |
| 9 | `swapProblem()` null for both (defence in depth against a hand-edited row) | 409 `FIREWALL` + the refusal string |
| 10 | both sides priced | 409 `NO_PRICE` |
| 11 | member has no negative balance in any token | 403 `ACCOUNT_SUSPENDED` |
| 12 | quote math yields `payQty ≥ 1` | 409 `DUST` + `minReceiveQuantity` |
| 13 | `expectPayQuantity === payQty` **and** both price row ids match `latestPrice` | **409 `QUOTE_STALE`** + the fresh quote in the body |
| 14 | fiat-hold-adjusted balance ≥ `payQty` | 409 `RECENT_PURCHASE_HOLD` + `clearsAt` |
| 15 | `treasuryStock[receiveToken] ≥ qB` | 409 `OUT_OF_STOCK` + available |
| 16 | per-token cycle cap | 409 `TOKEN_CAP` + remaining |
| 17 | per-token per-member cycle cap | 409 `MEMBER_CAP` + remaining |
| 18 | create order → `postTransferPair` → settle | 409 on pair failure, order → `failed` |

**Three transactions, in order.** TXN-A claims `receipt_no` and inserts the order (`kind='swap'`, `status='pending'`, id prefix `xs-`). TXN-B is the single `postTransferPair` call. TXN-C sets `status='paid'`, `paid_at=NOW()`, then emits `notify()` (dedupe `ord:{id}:notify`), `moduleActivity("exchange", …)` (invariant #14), and audit event `exchange:swap:{payQty}{A}->{qB}{B}`.

**The legs:**

| leg | from | to | token | amount | source | idempotency key |
|---|---|---|---|---|---|---|
| 1 | `mem:{userId}` | `sys:treasury` | pay | `payQty` | `exchange_swap` | `ord:{orderId}:leg1` |
| 2 | `sys:treasury` | `mem:{userId}` | receive | `qB` | `exchange_swap` | `ord:{orderId}:leg2` |

Key length: `ord:` (4) + `xs-1785484800000-a1b2` (21) + `:leg1` (5) = **30 chars** against `varchar(191)`. `xs-` for swaps and `xo-` for fiat orders means the `leg1` namespace never collides across kinds.

**Fiat hold** (`exchange.swap_fiat_hold_days`, `0` disables):
```sql
SELECT COALESCE(SUM(quantity),0) FROM exchange_orders
 WHERE user_id=? AND token_slug=? AND kind='fiat_purchase' AND status='paid'
   AND paid_at > NOW() - INTERVAL ? DAY
```
`swappableBalance = balanceOf(mem, token) − held`. Card-bought tokens are frozen from swapping long enough that a chargeback still finds them in the wallet. The reversal path at `server/index.ts:1969–1990` is **not touched**.

**Cap accounting** mirrors the existing mint-cap pattern at `server/index.ts:5324`:
```sql
SELECT COALESCE(SUM(amount),0) FROM token_ledger
 WHERE from_account='sys:treasury' AND token_type=? AND source='exchange_swap'
   AND at >= :cycleStart            -- (+ AND to_account=? for the member cap)
```

---

## 1.7 Guards and invariants — the ledger

| Invariant | How v2 keeps it |
|---|---|
| 2.2 #1 per-source-event single payout | Recognition can never be either side (refused at write, boot, and execute); boot assertion 3 proves `exchange_swap` is in no weighting allowlist |
| 2.2 #2 no swappable/purchasable faucet tokens | Destination-based faucet test at write time, at boot, and inside the swap path. **No override exists.** |
| 2.2 #3 one selling module per token | `purchaseProblem` keeps `moduleSoldTokens()`; `swapProblem` also keeps it (B's carve-out rejected) |
| 2.2 #4 non-negative system accounts except declared faucets | `sys:treasury` is not a faucet; `allowNegative` is a hard error inside `postTransferPair`; leg2 overdraft rolls both legs back |
| 2.2 #5 no per-token balance columns on `users` | v2 adds no columns to `users` |
| 2.2 #6 system accounts never rows in `users` | v2 adds no system account at all |
| 2.2 #10 fiat trio | Rounding favours the treasury (ceil-on-pay); A→B→A property test; positional `ord:{id}:leg{n}` keys |
| 2.2 #11 bounded admin power | Stocking still passes `ledger.admin_mint_cycle_cap`; swap adds two fail-closed per-token caps on top |
| 2.2 #12 ops readiness | `tradingEnabled` refuses under `sharedPasswordPosture()` at the lifecycle route **and** at boot; the legal card requires an ops-readiness ack |
| 2.2 #13 module disable respects open state | `exchangeOpenState()` unchanged and kind-agnostic; pinned by test. Same for `exit.ts:137`. |
| 2.2 #14 preview-lifecycle leak guard | `moduleActivity("exchange", …)` on settle |
| 2.2 #15 exchange consolidation | Flags stay in `token_exchange_settings`; `currency_prices` survives; no `currencies` table |
| Part 4 per-token conservation sums to zero | Both legs are ordinary transfers between two existing accounts; `checkLedgerInvariants()` check 3 needs no change |

---

## 1.8 Explicitly out of scope

Order books · limit, stop, or resting orders · partial fills · AMMs, bonding curves, liquidity pools, any price that depends on trade size · peer-to-peer or member-to-member swaps · request-and-match · a `swap_pairs` table or any per-pair rate or spread · a `quotes` table, quote reservation, or quote expiry · multi-hop routing (A→B→C) · fractional or decimal amounts · slippage tolerance · **fiat out in any form** · swapping recognition, hypha-governed, `NEVER_LISTED`, module-sold, or faucet-issued tokens · **any override or escape hatch for the faucet rule** · member-initiated undo · swap reversal, refund, or cancellation after commit (a mistaken swap is corrected by swapping back at current prices, or by an admin `manual` transfer that already exists) · a generic N-leg ledger API · a separate spread or dust account · `min_stage_to_swap` · price oracles or external feeds · automatic prices · a mandate/decision-enforcement subsystem (contract column only) · adding `exchange_swap` to `ALLOW_NEGATIVE_SOURCES` · editing `drizzle/0022_exchange.sql` · touching `payments.ts` or the existing reversal handlers · **any enum ALTER**.

---

## 1.9 Client surface — lean

- **`SwapCard`** on the existing exchange page. Receive-driven: the member enters what they need. Renders the server's `sentence` verbatim, the price note + setter + age for both sides (v1 already stores all three — this is free accountability at the point of consent), the dust disclosure line, and *"Swaps are final. The village cannot undo one."* before the tap.
- **`myPairs` only.** Rows the member can actually execute against their own balances. No grid of greys. A member with one swappable token sees the honest state: *"You'll need two kinds of village token to swap. Right now you hold one."*
- **The library redirect.** A pair query implying `library-credit` renders a link, not a disabled row: *"Library credits aren't traded — they come from bringing items to the library, or from a loan. Here's how."*
- **`RateHistorySheet`** — a link from the card to the cross-rate series with both notes and both setters per point. This is the artifact a member points at when they ask why their credit is worth less this moon.
- **Admin:** spread, per-token caps, halt/resume, and a `taintedTokens` panel that says *why* a token refuses to list.
- Every refusal is the server's string, rendered verbatim.

**Legal caution card** — rendered on the `tradingEnabled` toggle beside the existing `legalReview` gate. Three refusals: shared-password posture (existing 403 copy), missing ops-readiness ack (invariant #12 — tested restore, CI, error tracking, settlement alerts), missing `legalAck` matching the current card version. Confirmation requires typing the deployment name. The ack is written as audit event `exchange:trading:on:{cardVersion}` by `acceptedBy` — no new table. Copy names: internal trading is opt-in per deployment; the platform provides capability and the village owns the meaning and the legal posture; the treasury is the only counterparty at posted prices, which is a shop and not an exchange; tokens can never be sold for fiat here; share-like, recognition, and faucet-issued tokens can never trade here; Gate F counsel review (CR 13% IVA, consumer refund, gift-certificate/escheatment, Law 8968) is still pending.

---

## 1.10 Traps that must NEVER happen

1. **A member debited and never credited.** Structurally impossible under `postTransferPair`; detected forever by boot assertion 5; never auto-repaired when ambiguous.
2. **A swap that mints.** No leg names a faucet. Boot assertion 4 proves it across the whole ledger.
3. **A faucet-issued token becoming swappable.** No override exists in any form, at any privilege level, through any config path.
4. **`exchange_swap` in `ALLOW_NEGATIVE_SOURCES`,** or `allowNegative` on a swap leg. Refused inside the primitive; asserted at boot; pinned by an existing test.
5. **`exchange_swap` weighted by a release job.** Boot assertion 3.
6. **A swap carrying a provider ref.** Boot assertion 6 — Gate C2 asserted in data.
7. **A round trip that profits the member.** Ceil-on-pay, BigInt, property-tested across randomized price pairs and spreads including 0.
8. **Two purchase paths for one token.** `moduleSoldTokens()` applies to swapping too. The loop test's `stay-credits`/`stay-credit` slug confusion is fixed in S61 so its green means something.
9. **A settlement webhook touching a swap order.** `AND kind='fiat_purchase'` on both webhook writes.
10. **An idempotency key approaching 191 chars.** Keys are 30. Pinned by a length assertion.
11. **A silent, unlimited cap.** Every cap default is 0 = closed. There is no `0 = unlimited` anywhere in this feature.
12. **A boot that normalizes corruption.** Refusing to serve beats serving a market that sells what must not be sold.

---

## 1.11 Loop-test assertions

**Unchanged and must stay green with zero edits:** `loop.e2e.test.ts:1706` (`tradingEnabled === false`) and `:1709` (`POST /api/exchange/swap` → 501). `defaultConfig.tradingEnabled` is still `false` and the engine is gated on it, so the default deployment's behaviour is byte-identical. Rule 2.1 #1 satisfied without rewriting a pinned assertion.

**New `describe` block, trading enabled on a scoped fixture** (requires per-admin identities — `modules.ts:214` 403s any `legalReview` enablement under `sharedPasswordPosture()`):

1. Two platform credit tokens stocked from `sys:mint → sys:treasury` under the cap; both priced; both `swappable`; caps set above zero. A swap succeeds: member balance A down by `payQty`, B up by `qB`, treasury the mirror, `checkLedgerInvariants()` clean, per-token conservation zero.
2. Replay with the same `clientKey` → 200, same `receipt_no`, **no second ledger row**.
3. A→B→A round trip at spread 0: final A ≤ initial A. Property test over ≥200 randomized (pA, pB, qB, spread) tuples.
4. Treasury short of B → 409 `OUT_OF_STOCK` before any write; **zero** ledger rows created.
5. Member short of A → 409; zero rows.
6. Concurrent swaps for the last unit → one succeeds, one 409s, no deadlock, conservation holds.
7. Price moved between quote and execute → 409 `QUOTE_STALE` with a fresh quote; nothing written.
8. A `credit`-kind token with one `sys:cycle-pool → mem:*` row refuses to list as swappable **and** as purchasable; `repairTaintedListings` auto-delists it at boot with an audit row.
9. `library-credit` and any recognition-kind token refuse at all three layers.
10. **The slug fix:** the loop's ad-hoc `stay-credits` token is renamed to `stay-credit` so the one-seller firewall actually fires; a new case asserts the refusal string.
11. A pending swap order blocks `exchange` module-disable (`openStateCheck`) **and** blocks member exit (`exit.ts:137`).
12. A halted token refuses quote and execute with 503; resume without a note is refused.
13. A token at `max_swap_out_per_cycle = 0` refuses with `TOKEN_CAP` even when stocked and priced.
14. A fiat-purchased token inside the hold window refuses with `RECENT_PURCHASE_HOLD`; outside it, succeeds.
15. Boot assertion 5 fires: hand-insert a single `exchange_swap` ledger row and prove the server refuses to boot.

---

## 1.12 Session breakdown

**S57 — Keystone.** `validateLeg()` extracted from `postTransfer` (pure refactor, transaction body untouched); `postTransferPair()`; unit tests for atomic rollback, replay `duplicate:true`, one-key-dup throw, sorted lock order under concurrency, `allowNegative` hard refusal, per-leg validation parity. The `ALLOW_NEGATIVE_SOURCES` pin stays green. **Nothing user-visible ships.** This session carries the keystone risk and deserves to be alone.

**S58 — Schema and firewalls.** Migration 0029; the `kind`-awareness audit of all five `exchange_orders` read sites; `faucetIssuedTokens()` + `tradingProblem`/`purchaseProblem`/`swapProblem` split; `repairTaintedListings()`; `assertSwapFirewalls()` (all twelve); `exchange.swap` capability + `ALL_CAPABILITIES` + `STAGE_UNLOCKS` + Admin.tsx wiring; three game variables; module def update. Tests: the tainted-credit-token case, `library-credit`, recognition, hypha, one-seller, and a hand-edited-row boot throw.

**S59 — Engine.** BigInt receive-driven quote math with the A→B→A property test and a randomized conservation test; `createSwapOrder` (shared receipt sequence); `executeSwap`; `reconcileSwapOrders`; the eighteen ordered refusals; fiat hold; caps; halt/resume routes; the `exchange-reconcile` scheduler job (also closing backlog X4); `POST /api/exchange/swap/quote` and the real `POST /api/exchange/swap`.

**S60 — Surface.** `SwapCard` (receive-driven, server `sentence`, price notes at consent, dust disclosure, finality warning); `myPairs` on `GET /api/exchange`; the library redirect; `RateHistorySheet` + `GET /api/exchange/rates/history`; admin panel additions (spread, caps, halt, tainted tokens).

**S61 — Enablement, proof, docs.** Legal caution card copy + the `legalAck` config path + boot assertion 9; the enabled-path e2e fixture with per-admin identities; the fifteen loop-test cases including the `stay-credit` slug fix; `docs/modules/internal-exchange.md` amended with a v2 section marking the superseded parts; `docs/FORK_RUNBOOK.md` row for `tradingEnabled`.

**Five sessions. Do not compress to four by dropping S60** — a market whose refusals a member cannot read is a support queue, and two panels marked the base design down for exactly that.

### Blocking preconditions (resolve before S57 opens)

1. **X10 — receipt numbering scheme.** Swaps share the global gapless sequence. If the village wants `AMR-2026-000123`, deciding it *after* swap orders exist is a real migration across two order kinds instead of one. **Decide first.**
2. **PY4 — Gate F counsel engaged**, or an explicit written decision to ship `tradingEnabled` OFF with the card naming the review as pending. The card already says "pending"; someone must sign off on shipping it that way.
3. **A demand signal.** Per `MODULES_MASTER_PLAN.md:487` this build is demand-triggered. Before S57, count the deployment's tokens that pass `swapProblem`. **If the answer is fewer than two, do not build this yet** — a swap needs two, and after the faucet firewall a typical village may have one.

---

# PART 2 — MODULE v2 BACKLOG

## 2.1 Ranked deferred items

Value = user/village value. Effort: **S** ≤ half session · **M** ≈ one session · **L** ≥ two sessions. Rank orders by value ÷ effort, discounted by risk and by whether the trigger has already fired.

| # | Module | Item | Value | Effort | Risk | Trigger |
|---|---|---|---|---|---|---|
| 1 | Payments | **PY2** Resend sender-domain verification for `amora.cr` | High | S | **High** — Resend returns 200 on unverified domains and delivers nothing; email death is silent, and S1's founder claim link travels this path | NOW — Amora team DNS access only |
| 2 | Payments | **PY4** Gate F counsel engaged | High | — | **High** — 40 sessions past the stated point, three funds-bearing modules shipped; blocks 8 items | NOW — Rye only |
| 3 | Payments | **PY5** Delete two orphaned MySQL volumes (~1.85 GB billed) | Med | S | Low | NOW — live billing |
| 4 | Badges | **B4+B5** Warning-expiry sweep + re-issue counts in the audit view | High | S | **High if unbuilt** — an admin can silence a member indefinitely by re-issuing; this is a member-rights hole, not a feature gap | NOW — scheduler shipped at S17 |
| 5 | Badges | **B9** `GET /api/badges/of/:userId` + `/api/badges/match` | High | S | Low | NOW — one endpoint unblocks B10, map concierge matching, Team page, Maia suggestions |
| 6 | Library | **L10** Automatic dispute settlement at the deadline | High | S | Med — the variable is published as policy and does nothing | NOW — resolution semantics already coded in `settleLoan`; only the timer is missing |
| 7 | Tools | **T1+T2** Scheduled dead-link check **+ pinned-IP dialer / redirect re-validation** | Med | M | **High if split** — the SSRF risk calculus depends on the checker being admin-triggered; scheduling it without T2 converts an accepted risk into an unattended one | NOW — but ship as ONE unit, never T1 alone |
| 8 | Badges | **B2** Badge notifications | High | S | Low | NOW — spine shipped at S16, badges register no producer |
| 9 | Library | **L6** Item photos | Med | S | Low | NOW — `photo_url` column and `/api/uploads` both already exist |
| 10 | Health | **H3** Reserved metric keys: library utilization, stay occupancy, treasury/pool time series | High | M | Low — all three upstream sources are now live and non-fabricable | NOW |
| 11 | Forum | **F5** Role appointment behind `proposal.decide` | Med | S | Med — the code comment promises it; admin-only appointment is a legitimacy gap | NOW — decision primitive shipped at S26 |
| 12 | Exchange | **X4** Order-expiry sweep | Med | S | Low | **Free rider on swap v2 S59** — the reconcile job is built there |
| 13 | Cross-cutting | **P5** Make `pnpm audit` blocking | Med | S | Med | NOW — the stated revisit point (Block 6 / fiat) has passed |
| 14 | Cross-cutting | **P8** Effective-capabilities admin view | Med | S | Low — named mitigation for gate fog now that the gate is 5-source | NOW |
| 15 | Library | **L19** Stalled-intake visibility (no active steward) | Med | S | Med — single point of failure, currently silent | NOW |
| 16 | Stays | **S5** Low-balance nudge payload (quest suggestions) | Med | S | Low — trigger shipped, payload didn't | NOW |
| 17 | Framework | **MF4** `module_events` history viewer | Med | S | Low | NOW — data exists |
| 18 | Framework | **MF5** Soft-dependency nudges | Low | S | Low | NOW — `recommends[]` populated on 6 modules |
| 19 | Forum | **F1** Thread/reply editing | High | M | Low — `forum_mentions` was built as the edit-idempotency ledger for an editor that never shipped | NOW — the substrate is already paid for |
| 20 | Library | **L12** Notification-spine wiring (reservation-ready, overdue digests) | Med | S | Low | NOW — spine + scheduler exist |
| 21 | Health | **H7** Threshold alerts through the spine | Med | S | Low | NOW |
| 22 | Payments | **PY6** Third-party error tracker | Med | M | **High** — invariant 2.2 #12 makes it a go-live precondition equal in rank to bounded admin power; in-app admin alerts only half-satisfy the S32 rider | NOW — precondition for any funds-bearing go-live, incl. swap v2 enablement |
| 23 | Payments | **PY1** Stripe live configuration | High | S | Med | NOW — Amora team, before any fiat go-live |
| 24 | Ledger | **TK11** Delete two dead `readJson`/`writeJson` definitions | Low | S | None | NOW — trivial |
| 25 | Framework | **MF11** `seasonal-festivals` route | Low | S | Low | NOW — Journey content already references it |
| 26 | Badges | **B10** Forum byline chips + map featured-chip hardening | Med | S | Low | NOW, after #5 |
| 27 | Cross-cutting | **P1** Client code splitting / `lazy()` module chunks | Med | M | Med — hazard row said it dies at S13; it didn't, and 11 modules have landed | NOW — set a CI bundle threshold, then do it |
| 28 | Cross-cutting | **P3** `server/index.ts` route extraction (7,474 lines) | Med | L | Med — pure maintainability debt with no acceptance test of its own | NOW-eligible; trigger is the next session that has to navigate it |
| 29 | Cross-cutting | **P4** `Admin.tsx` decomposition (5,687 lines) | Med | L | Med | Same as #28 |
| 30 | Exchange | **X2** Zeffy adapter | High | M | Med — a **ratified Gate C2 decision that did not ship**; `payments.ts` has one provider | NOW-eligible — trigger is Rye wanting fee-free donations |
| 31 | Exchange | **X6** Governance-executed price/limit changes | Med | M | Low | **Made much cheaper by swap v2** — `currency_prices.decision_ref` ships in 0029 as a contract column |
| 32 | Library | **L5** Steward reward computation | Med | M | Med — invariant 2.2 #4 already dictates the formula | DECISION + NOW |
| 33 | Stays | **S4** In-platform Stripe refund API call | Med | M | Med — the failing half is asymmetric | DEMAND |
| 34 | Library | **L7** Member-side donation requests | Med | M | Med — intake is a MINT; convenience must not soften the front door | DEMAND |
| 35 | Library | **L3+L4** Wear classes + repair workflow with credit burns | Med | M | Low — `sys:library-sink` already seeded | DEMAND |
| 36 | Feed | **FD1–FD5** Heart milestones, weekly digest, Maia event-post kind, profile highlights | Med | M | Low | DEMAND |
| 37 | Badges | **B3+B7** `cycle_streak` rule + Maia skill extraction | Low | M | Low | DEMAND |
| 38 | Health | **H5+H6** Goal-metric bindings + shareable cycle report | Med | M | Low — S48 partially covers H6 | DEMAND |
| 39 | Framework | **MF3+MF6+MF7** Per-module health endpoint, guided fix flow, coming-soon catalog | Med | M | Med — MF7 conflicts with existence-hiding | DEMAND |
| 40 | Payments | **PY3** Web push delivery | Med | M | Low — table + dispatch seam shipped at S16 | DEMAND |
| 41 | Exchange | **X8** Statement CSV export | Low | S | Low | **Cheaper after swap v2** — `kind` + rate history give the shape |
| 42 | Map | **M7+M10** Map snapshot on command centre; gratitude gesture after a connection | Low | M | Med — M10 must route through the one ledger | DEMAND |
| 43 | Cross-cutting | **P2** Locale layer (i18n) | Med | L | **High** — the cheap-extraction hedge (rule 2.1 #7) was never built, so this is now full-cost; swap v2's server-rendered `sentence` adds to the surface | DEMAND — first non-English fork |
| 44 | Cross-cutting | **P6** Email verification at registration | Med | M | Med | DECISION — needed before crowdpool email-linking or self-service financial linkage |
| 45 | Map | **M2** Per-pair block list on the contact relay | Med | M | **High at scale** — a recipient's only hard stop today is going fully uncontactable | SCALE — first harassment report, or membership past ~50 |
| 46 | Map | **M3** Tokenized reply relay | Med | L | Med — v1 discloses the exposure instead | DECISION — Rye judging disclosure insufficient |
| 47 | Library | **L1+L2** Queue-join + peer-to-peer pass-off | Med | L | Med — `settleLoan()` must remain the single terminal (2.2 #8) | SCALE — contention on a popular item |
| 48 | Forum | **F2+F3+F4** Search, tag filter pages, pinned posts | Med | M | Low — `forum_thread_tags` is already a real junction table | SCALE (~200 threads) / DEMAND |
| 49 | Health | **H1** Turn the dashboard on | High | S | Low — **zero code change**; pure ops act | SCALE — 3 closed lunations |
| 50 | Health | **H2** Public aggregate variant with small-N suppression | Med | M | **High** — in a 6-person village "retention 83%" names the person who left | SCALE — ~20 active members |
| 51 | Map | **M1+M4** Nested sub-circle orbits; concierge funnel dashboard | Med | L | Med | SCALE — ~120 visible nodes / enough queries |
| 52 | Tools | **T3+T4** Click analytics + retention policy | Low | M | Low | SCALE |
| 53 | Ledger | **TK2** Ticket expiry sweeps + chain-cache refresh | Low | M | Low | SCALE |
| 54 | Exchange | **X3+X7** Crypto purchases; Maia credit-purchase-intent kind | Low | L | Med | DEMAND |
| 55 | Exchange | **X10** Receipt numbering scheme | Med | S | **High** — cheap now, a real two-kind migration later | **DECISION — before swap v2 S57** |
| 56 | Ledger / Library | **TK7 + L18** Fractional precision (tokens, library credits) | Low | M | **High** — cheap now, a real migration later | DECISION — Rye, ideally before volume |
| 57 | Ledger | **TK10** Final naming of the "Gratitude" token | Med | S | **High** — slugs are permanent; history is never re-denominated | DECISION — Rye/Amora, before volume accrues |
| 58 | Exit | **E1** The exit policy's actual terms | High | — | **High** — the single most user-visible placeholder in the product | DECISION — the community |
| 59 | Badges | **B14** Gate E formal sign-off | Med | — | Low — implemented and tested; only ratification is missing | DECISION — Rye |
| 60 | Ledger | **TK4** Quest-consent funding source (`sys:gratitude-pool` vs `sys:treasury`) | Med | — | Med — decides whether the treasury needs funding mechanics | DECISION — Rye |
| 61 | Exchange | **X12** Gate B permanent posture confirmation (slide-26 expectation gap) | Med | — | **High** — securities posture; Rye's own words expected project shares to trade | DECISION — Rye |
| 62 | Library | **L16+L17+L15** Ownership at intake, starter credits, contributor royalty | Med | — | Med | DECISION — Rye |
| 63 | Forum / Health | **F7 + H4** Consent/concern objects; governance analytics (silent-consent, objection-trending-to-zero) | Med | L | Med — H4 is blocked on F7, and F7 sits on the Hypha boundary | DECISION — resolve the boundary first |
| 64 | Forum / Automation | **F6 / A1** AI forum elders | Low | L | **High** — values call | DECISION — Rye only |
| 65 | Automation | **A2+A4** Accept creating a quest; re-synthesis | Low | M | **High** — crossing A2 is the module's whole risk ("suggestions never timer-mutations") | DECISION — requires an explicit rule change, not a feature request |
| 66 | Stays | **S1+S2** Credit expiry sweep; member-to-member credit transfer | Med | M | **High** — gift-card/escheatment; transferable credits drift toward e-money | **LEGAL** — Gate F must bless expiry *before* the sweep is written |
| 67 | Ledger | **TK1** Generic peer transfer endpoint | Med | M | **High** — transferability drifts toward e-money | LEGAL + DEMAND. **Partially obsoleted by swap v2**: treasury-mediated swap serves much of the same member need at a fraction of the legal exposure |
| 68 | Library | **L9** Buy Library Credits (fiat → shelf-backed credits) | Med | L | **Very high** — selling shelf-backed credits severs the backing | LEGAL — Gate F. **Swap v2 hardens the refusal**: `library-credit` stays in `NEVER_LISTED` and is now also faucet-tainted |
| 69 | Feed | **FD7** Internal closed-loop event-ticket credits | Low | M | **High** — stored-value edge | LEGAL — Gate F |
| 70 | Exchange | **X5+X11** Refunds inside the window; credit expiry/breakage policy | Med | M | High | LEGAL + DECISION. Swap v2 makes X5 *harder*: there is no swap reversal, deliberately |
| 71 | Badges | **B17** Retention/appeal policy for warning badges | Med | — | High — defamation exposure if a fork re-adds public negative badges | LEGAL |
| 72 | Exit | **E2+E3+E4** Exit valuation, involuntary process, restorative flow | High | L | **Very high** — "the highest-stakes decision the software will ever touch" | LEGAL + DECISION; equity-shaped, so Hypha's side |
| 73 | Map / Badges / Tools / Ledger | **M5, B1, T7, TK9** Hypha circle read, automated badge reads, editable sub-link suffixes, Base contract addresses | Med | M–L | Med | **EXTERNAL** — Hypha read API, a second village, token deployment |
| 74 | Framework | **MF1, MF2, MF8, MF9, MF10** Core modules disableable, preview cohorts, nav overlay, signed-out advertising, nav overflow | Low | M–L | Med — MF1 is a retrofit minefield across ~80 live routes | DEMAND / DECISION / SCALE |
| 75 | **Crowdpool** | The entire module (§13) | Med | **L** (3–5 sessions) | **High** — the material-library draft-item back-ref coordination window has **already closed**; `0024_library.sql` is frozen and reopening it costs a migration | EXTERNAL — a passed regen-civics campaign + that repo's webhook/export contract |

---

## 2.2 Waves

### Wave 1 — do next (highest value ÷ effort, no new gates)

Ranks **1–26**, in roughly that order. Every one of these has had its stated precondition already ship, adds no new capability, opens no new legal surface, and is S or M effort.

The cheapest true statement about Wave 1: **six of the top ten are half-session items whose infrastructure is already paid for.** B9 is one endpoint that unblocks four surfaces. L10 needs a timer around resolution semantics that `settleLoan` already implements. L6 needs a form field against a column and an upload pipeline that both exist. B2 needs a producer registration against a spine shipped at S16. F1 needs a UI against `forum_mentions`, which was explicitly built as the edit-idempotency ledger for an editor nobody wrote.

Three Wave 1 items are **not code** and should be pushed today because they are handoffs and every day of delay is real: **PY2** (silent email death — the highest-severity live item in the whole backlog), **PY5** (live billing), **PY4** (counsel, 40 sessions overdue and now blocking eight items plus swap v2's enablement posture).

Two Wave 1 items are **member-rights**, not features: **B4+B5** — nothing sweeps warning badges, and warnings suspend capabilities, so an admin can silence a member indefinitely by re-issuing. Ship the sweep and surface re-issue counts in the same session.

One Wave 1 item must **never be split**: **T1+T2**. The SSRF exposure in `toolcheck.ts` is accepted *only because* the checker is admin-triggered. Scheduling it without the pinned-IP dialer converts a documented, bounded risk into an unattended one. If only one can ship, ship neither.

**Suggested session order after swap v2 (S62+):** S62 = PY handoffs pushed + B4+B5 + B9 + B10 + TK11 + MF11. S63 = L10 + L6 + L19 + L12 + S5. S64 = T1+T2 as one unit. S65 = F1 + F5. S66 = H3 + H7 + P8 + MF4 + MF5 + P5.

### Wave 2 — after demand signal

Ranks **27–48, 52–54**. Real work with real value, waiting on someone actually asking. Includes the two big refactors (P3, P4) — genuinely valuable, genuinely large, and correctly deferred until a session has to navigate them; the Zeffy adapter (X2), which is unusual in that it is a *ratified gate decision that did not ship* and could reasonably be promoted to Wave 1 the moment Rye wants fee-free donations; the library's earning surfaces (L3, L4, L7); the feed's polish layer (FD1–FD5); and the framework's admin ergonomics (MF3, MF6, MF7).

The honest note on **P1** (code splitting): it is Wave 1 by leverage and Wave 2 by trigger. Set the CI bundle threshold in Wave 1 as a two-line change; do the splitting when the line goes red.

### Wave 3 — trigger-gated / may never

Ranks **49–51, 55–75**. Four distinct classes, and they should not be treated alike:

**Legal-blocked (66–72).** Do not build any of these before Gate F answers. Two carry an ordering trap worth stating explicitly: **S1** — do not write the credit-expiry sweep first and get it blessed after; the default of 0 is what keeps the platform out of escheatment, and building the mechanism creates pressure to use it. **L9** — swap v2 has now hardened the refusal in two independent layers, which makes this *more* clearly a legal question and less a technical one.

**Decision-blocked (55–65).** Only Rye or the community can unblock these. Three are **cheap now and expensive later** and should be forced to a decision inside the next two blocks regardless of demand: **X10** receipt numbering (blocking for swap v2), **TK7/L18** fractional precision, **TK10** the Gratitude token's final name. Each is a nullable-column-or-config change today and a migration across accrued history in six months.

**Scale-gated (49–54).** These become correct at a threshold, not at a date. **H1** deserves calling out as the cheapest high-value item in the entire backlog: turning the health dashboard on is *zero code change* and gated purely on three closed lunations. Put a reminder on the third close.

**External-blocked (73, 75).** Nothing to do but keep the seams. Crowdpool is the one item where inaction has already cost something: the draft-item back-ref shape was supposed to be agreed before either module froze its schema, and `0024_library.sql` froze first. Whoever builds crowdpool now pays a library migration. Write that down where the crowdpool builder will find it.

---

## 2.3 What swap v2 changes about this backlog

**Made obsolete:**
- **X1 — the swap engine.** This document *is* X1. Delete the row when S61 lands.

**Made cheaper or free:**
- **X4** (order-expiry sweep) — the `exchange-reconcile` scheduler job ships in S59; extending it to stale fiat pendings is a `WHERE` clause. **Free.**
- **X6** (governance-executed price changes) — `currency_prices.decision_ref` ships in 0029 as a nullable contract column, rendered in the rate history. Building the enforcement engine later needs no migration. **One session saved, and it becomes the first thing that makes the decision primitive more than a record.**
- **X8** (statement CSV) — `kind`, `pay_*`, `net_minor`, and the rate-history endpoint give the export its shape. **Roughly half.**
- **F5** (role appointment behind `proposal.decide`) — S58/S59 touch the same primitive and its read paths; sequence F5 immediately after swap v2 while the context is warm. **Marginal.**
- **P8** (effective-capabilities view) — `exchange.swap` is the sixth capability with a stage unlock and the first one gated by a per-deployment config flag on top. Building the view while adding the capability is cheaper than doing it cold.

**Made harder, or made more clearly refused:**
- **X5** (admin-initiated exchange refunds) — swap v2 deliberately ships **no swap reversal**. A discretionary refund path would have to be designed around that refusal, not on top of a generic reversal API.
- **L9** (Buy Library Credits) — now blocked at two independent layers (`NEVER_LISTED` and the faucet-issuance test). Any future L9 must argue past both.
- **FD7** (event-ticket credits) — a ticket-kind token that the faucet ever issues to a member is permanently unswappable. Anyone designing FD7 should design the issuance path with that in mind from the start.

**Made less urgent:**
- **TK1** (generic peer transfer) and **S2** (member-to-member stay credits) — a treasury-mediated swap satisfies a large share of the underlying member need ("I have the wrong token") at a fraction of the e-money exposure. Both drop a tier in priority; neither disappears.

**Newly created backlog (accept these as debt, written down now):**
- Swap cap accounting uses `at >= currentCycle().startsAt`, a timestamp window, copying the existing mint-cap pattern at `server/index.ts:5324`. Invariant 2.2 #4 prefers a stamped `cycleId`. **If a cycle boundary is ever moved retroactively, both swap caps and the mint cap re-scope silently.** This is inherited debt propagated, not fixed; it becomes a one-line change if the ledger ever gains a `cycle_id` stamp.
- The fiat hold is per-slug, not per-lot. A member who earned 100 of a token and bought 5 with a card is held on all 105. Simple, cheap, explainable, occasionally unjust. Per-lot cost basis is the correct fix and is its own module.
- Stripe dispute windows reach 120 days; the hold defaults to 45. A patient attacker gets through and lands in the existing negative-balance/auto-suspend path. Bounded by the per-token caps; named, not solved.
- Anchor mispricing remains real arbitrage against the treasury. `price_change_max_pct` bounds each *move*, not the level. The per-token cycle cap is the hard bound, and it is now a number someone had to set deliberately.