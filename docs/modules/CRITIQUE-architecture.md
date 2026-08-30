# Architecture & sequencing critique

> Adversarial critique pass over all 11 module designs, 2026-07-26.

## Verdict

Individually, these designs are unusually disciplined — idempotency keys, recompute-never-increment, faucet accounting, and the recognition firewall appear everywhere, and the deck's genuinely dangerous ideas (in-app share trading, voting-multiplier badges, free infinite hearts) were correctly killed. Collectively, they fail the ONE LEDGER rule they all cite: three incompatible registry schemas, two ledger row shapes, three system-account representations, and four Hypha URL variables, which means the conservation and reconciliation checks each module promises cannot actually hold across modules. The three critical exploits are all cross-module seams no single design can see from inside itself: the F2-release-on-top-of-pay-at-send double-pay reintroduced via a different target token (defeating the per-token XOR invariant), faucet-minted library credits laundering into real beds through the exchange treasury, and the ledger spec fork itself. The remaining high findings — appraisal minting without caps, unhandled chargebacks, multi-path escrow release, the Sybil-to-capability chain through badges, pool insolvency, and every admin attribution field resting on one shared password — are each fixable with bounded spec changes. Roughly 90% of the fixes are cheap now (spec edits, bound changes, one shared helper, one invariant test) and expensive after Phase 1b freezes the ledger shape into hundreds of forks. Recommendation: hold all module builds behind a one-session ledger-spec reconciliation pass, then proceed — the portfolio is sound underneath the seams.

## Findings

### [CRITICAL] Token Registry + Ledger / Internal Exchange / Material Library / Stays (ledger consistency)

**Issue:** The eleven designs fork the ledger spec at least three ways, and the forks are mutually destructive. (1) Registry: keystone ships a `tokens` table with `ledger_accounts`; Exchange ships a DIFFERENT `currencies` table as 'this IS F2's currencies[]'; Library ships `ALTER TABLE token_ledger MODIFY token_type ENUM('gratitude','amora','voice','library_credit')` — an enum-append that, if it runs after the keystone/exchange varchar-FK migration, REVERTS the column to an enum and is the exact live-enum ALTER the plan forbids. (2) Row shape: keystone uses transfer rows (fromAccountId/toAccountId, conservation by construction); Library/Exchange/Stays assume single-entry signed rows with paired writes ('4 balanced entries', transferTokens()). (3) System accounts: keystone = rows in `ledger_accounts`; Exchange = 'reserved user ids seeded as inert user rows' (sys-treasury as a users row!); Library = 'rows in token_ledger only, never in users'. (4) Conservation convention: keystone says per-token global SUM is identically zero with faucets deliberately negative; Exchange says SUM=0 'net of opening balances'; Library mints intake awards with NO source account defined at all. Every module's reconciliation check is computed against a different invariant, so none of them can actually detect a leak, and cross-module exploits (findings below) become invisible.

**Fix:** Freeze ONE ledger spec before Phase 1b writes a single MySQL ledger row: adopt the keystone's tokens + ledger_accounts + transfer-row shape (it is the only one where conservation holds by construction), add a `faucet boolean` on ledger_accounts (only faucet accounts may go negative; postTransfer rejects overdrafts on everything else). Delete the Library enum-append migration and the Exchange `currencies` table outright — both modules rewrite their dataModel ledger touchpoints as rows in the one `tokens` registry and calls to the one postTransfer(). Every mint (library intake, crowdpool recognition, admin mint) must name its from-account. Add a cross-module reconciliation test in the keystone session that all other module test suites import.

### [CRITICAL] Stays (v2 open question) / Internal Exchange (open questions) / Token Registry XOR invariant

**Issue:** Cross-token double-pay — the foundation plan's #1 hazard, reintroduced through a side door. Stays v2 proposes 'the Gratitude cycle-close release can target stay credits' and Exchange calls F2 releases 'the sanctioned direction'. Scenario: Alice thanks Bob 50 Gratitude → Bob is credited 50 at SEND (pay-at-send, live today). At cycle close an F2 release job weights the pool by the SAME ack rows and credits Bob stay-credits pro-rata. One ack, two payouts in two tokens. The keystone's boot invariant is 'pay-at-send XOR pool-release PER TOKEN' — it cannot fire here because the release targets a different token than the one paid at send. This is exactly the ADR-30 collision Revision 3 resolved, resurrected with a token swap, and two module designs independently treat it as open/sanctioned.

**Fix:** Strengthen the invariant from per-token to per-source-event: while any token pays at send, no release job may weight on that token's ack/send rows when crediting ANY token. Concretely: boot assertion refuses a `releases` config whose weight source is gratitude_log while gratitude pays at send; pinned test in keystone session A asserts an ack row funds at most one ledger credit across all tokens, ever. If Amora ever wants recognition to feed lodging, it must first flip gratitude to pay-at-close (the full F2 model), never run both.

### [CRITICAL] Material Library + Internal Exchange (cross-module laundering)

**Issue:** Faucet-minted credits become real goods through the exchange. Steps: (1) contribute a junk item; steward appraises it at 1,000 → 1,000 library-credits mint from nothing (intake_award_pct default 100, bound allows 150). (2) An admin — or a fork admin following the Exchange design, which lets any 'credit'-kind currency be flagged swappable — marks library-credit swappable at a posted price. (3) Swap library-credit → stay-credit against sys-treasury. (4) Sleep real nights. The treasury is the unlimited counterparty, so the appraisal faucet is now a bed-printing machine; nothing in either design forbids it. Secondary collision: Library v2 sells credits at 120% with the 20% spread to sys:library-pool, while the Exchange sells the same token with spread to sys-treasury — two purchase paths for one token with different pool routing, violating the one-payment-path principle and silently underfunding the library pool.

**Fix:** Exchange server-side rejects swappable=true and purchasable=true on any token whose ledger contains non-purchase faucet sources (library_intake_award etc.) unless an explicit invariant override with legal-caution card; seed library-credit as swappable=false, non-overridable in v1. One purchase path per token: if the library sells its credits, the exchange must not, and vice versa — enforce as a boot assertion (token has at most one selling module) not a convention. Add a reconciliation metric: total library-credit supply vs total appraised replacement value of active inventory, surfaced red when supply > backing.

### [HIGH] Material Library (intake appraisal mint)

**Issue:** Junk-intake / collusion mint with no rate limit. Contributor and steward (or a generous solo steward) mint unbounded credits: contribute low-value items, appraise high, receive 100% (config allows 150% — mint > backing by declared config bounds) in credits at intake. Then borrow real gear with those credits as escrow and destroy/keep it: writeoff charges min(escrow, value) — you traded junk for a chainsaw at par, and the village's 'security deposit' was confetti you printed. There is no per-member intake cap, no per-cycle mint cap, no second sign-off at any value threshold, and escrow is denominated in the same inflatable credit it is supposed to secure.

**Fix:** Cap intake_award_pct bound at 100 (150 is a mint-over-backing config the fail-loud philosophy should exclude). Add library.intake_award_cycle_cap (credits mintable per member per lunar cycle) and library.dual_signoff_threshold (appraisals above it need steward + admin/second steward). Gate high-value items (per-item minStage/requiresRole, already an open question — answer: yes, v1) and require their escrow to be covered by non-intake-sourced credits (earned/purchased), cheap to compute from ledger sources. Surface 'credits minted vs replacement value backing' on the pool dashboard from day one (F13).

### [HIGH] Internal Exchange + Stays (Stripe fiat edge)

**Issue:** Chargebacks are unhandled in v1 of both fiat modules. Scenario: buy $500 of stay credits (max KYC-free order), sleep the nights, file a card dispute — Stripe claws the fiat back regardless of platform policy; the credits/nights are spent; the refund endpoint's 'credits unspent' check never runs because disputes don't go through it. Neither design defines a charge.dispute.created / charge.refunded webhook handler; Exchange relegates chargebacks to a risks bullet ('document the dispute flow'), Stays has only an admin-initiated refund action. Free value bounded only by purchase limits, repeatable across accounts.

**Fix:** Handle dispute/refund webhook events in v1 of whichever fiat module ships first: on dispute, write reversal ledger entries that MAY drive the buyer's balance negative, auto-suspend exchange.buy / stay purchase capability for that user, flag active stays 'attention', queue for admin. Store stripePaymentIntentId → order → ledger-legs mapping so the clawback is mechanical. Also fix the refund race (separate finding): the 'unspent' check plus Stripe refund plus reversal is check-then-act across a network call — debit the credits into a refund-hold system account first, then call Stripe, then finalize or roll back.

### [HIGH] Material Library (escrow release paths)

**Issue:** sys:library-escrow is a commingled pot, and the loan state machine has MULTIPLE terminal paths each releasing escrow under a DIFFERENT idempotency key (`loan:{id}:release` at close, plus cancel, expire, dispute adjudication, mid-loan writeoff). Idempotency protects each path against replaying itself, but nothing prevents two distinct paths from both firing once — e.g. a race between cancel and pickup-confirm, or an adjudication that lands after a lazy expiry already refunded the hold. A double-release does not fail: it silently spends OTHER borrowers' locked credits, because the escrow account is commingled and (per finding 1) no design constrains it non-negative.

**Fix:** One terminal settle transition, one key: every path that ends a loan (close, cancel, expire, adjudicate, writeoff) must funnel through a single settleLoan() that posts under the shared key `loan:{id}:settle` inside one transaction with a row lock on the loan — first path wins, all others no-op. Invariant tests: per-loan escrow-in equals deduction-plus-release-out exactly once; reconciliation asserts sys:library-escrow balance == SUM(escrow_amount over loans in escrow-holding states) at all times, red on the admin panel otherwise.

### [HIGH] Gratitude Feed + Badges + platform gratitude budgets (Sybil chain)

**Issue:** Account creation is a mint: guest stage carries gratitudeMultiplier 1, so every free account gets a real 100/cycle sending budget. Chain: register 5 alts → each hearts/acks the main account (self-heart is blocked; alt-heart is not) → recognitionBalance inflates → gratitude_breadth distinctSenders ≥ 5 at cycle close mints the 'Widely Thanked' EARNED badge → earned badges may carry CAPABILITIES in shared/capabilities.ts. That turns a Sybil farm into privilege escalation through the one gate itself. The badges design's anti-gaming rule ('rules read consented/settled events only') does not help: settled distributions faithfully record the alts' sends, because the sends are real budget spends from free accounts.

**Fix:** Filter sender eligibility in every breadth/recognition-derived metric and badge rule: count only senders at stage ≥ member or with ≥ 1 consented quest (a consent-gated, human-verified event alts cannot farm). Ship this in the badges earned-engine session AND the feed heart session, not retrofitted. Separately recommend forks consider budget floor at member (Amora's guest=1 is a config choice with a known Sybil cost); and require any capability-bearing earned badge to key exclusively on quest-consent metrics, never recognition-received metrics.

### [HIGH] Material Library (pool insolvency model)

**Issue:** The Library Pool can go negative as designed. Inflow is slow: base wear 10bp/day — a 1,000-credit item borrowed 7 days at ~2.5x new-item multiplier yields ~17.5 credits of wear; the 20% purchase spread is v2-only. Outflows are lumpy: one 200-credit repair burn consumes ~11 typical loans of inflow; acquisition grants are arbitrary-sized; steward reward is '10% of the cycle's pool INFLOW' — computed on inflow, paid from a pool whose balance may already be spent, so the reward itself can overdraw. No design states a non-negative constraint on sys:library-pool, and 'inflow' computed by timestamp window double-counts or drops rows when the admin-triggered cycle close runs late or re-runs across a boundary.

**Fix:** Non-negative enforcement on all system accounts except declared faucets (finding 1's faucet flag) — pool grants, repair burns, and steward rewards fail loudly when the pool lacks balance. Steward reward = min(pct × inflow, current pool balance). Attribute inflow by stamping cycleId on wear/spread ledger rows at write time (currentCycleId() exists), never by timestamp windows. Show projected vs actual pool runway on the admin pool dashboard.

### [HIGH] All money-touching admin surfaces (exchange, stays, library, registry mint) vs shared admin password

**Issue:** Every design leans on admin attribution — setBy on price rows, createdBy on mints, recordedBy on manual payments, fulfilledBy on pledges — but production admin auth is ONE shared password ('1love', rotation explicitly DECLINED in the plan). Attribution fields will all say 'admin'. The mint cap is also per-CALL (ledger.admin_mint_cap caps a single mint at 10,000; nothing caps N calls), so a leaked password is an unbounded mint, unbounded price manipulation, unbounded manual credit — across every module at once, with an audit trail that names nobody.

**Fix:** Make per-admin identities a hard precondition for enabling any funds-bearing module: the module framework's legalReview caution card should also assert auth posture and refuse (not just warn) while a shared password is the only admin credential. Add ledger.admin_mint_cycle_cap (aggregate per lunar cycle across all mints) beside the per-call cap. Until then, treat all 'admin-trusted' mitigations in these designs as unmitigated.

### [MEDIUM] Material Library (reservation squatting)

**Issue:** Denial-of-availability at zero cost: reserve an item (escrow locks for the 48h hold), never pick up, hold expires with full escrow refund, immediately re-reserve — the item cycles between 'reserved' and 'available' forever without ever being borrowable by others. Queue-join is also free and unbounded, so one member can sit in every queue and decline every hold, adding 48h latency per cycle to every popular item. No strike, cooldown, or forfeit exists in the design.

**Fix:** No-show strike counter per member: on hold expiry without pickup, increment; at library.max_noshows (variable, default 3/cycle) suspend reserving for library.noshow_cooldown_days and drop to back of queue. Optionally a small forfeit (e.g. 1% of escrow) to the pool per no-show after the first — priced friction, not punishment. Cap simultaneous active reservations per member (variable).

### [MEDIUM] Material Library (dispute griefing / dual-sign deadlock)

**Issue:** Two indefinite-freeze paths: (1) either party can dispute a return, freezing settlement with no deadline and no default outcome — a borrower disputes every wear charge to defer deduction; a hostile receiver disputes to keep the borrower's escrow locked; (2) return needs BOTH signatures, so a steward who never confirms holds the borrower's escrow hostage indefinitely, while a borrower who never initiates return merely burns down their bounded escrow via 2x overdue wear and walks away once it's exhausted (suspension is the only residual penalty).

**Fix:** Apply the F6 default-outcome-on-deadline pattern: library.dispute_deadline_days (default 14) after which unadjudicated disputes settle at computed wear only, zero assessed damage; receiver non-confirmation past library.return_confirm_timeout_days auto-settles at computed wear (explicitly cover return-confirm in the admin-fallback surface). Log both auto-settlements as provenance events so the pattern of who forces timeouts is queryable (F13).

### [MEDIUM] Internal Exchange + Stays (webhook route collision)

**Issue:** Both modules independently define POST /api/webhooks/stripe with express.raw() mounting and their own order tables (exchange_orders keyed on stripeSessionId vs stay_purchases keyed on providerRef). If both ship, the second mount is shadowed or events for one module hit the other's handler and 'complete' nothing — a paid customer with no credits, or worse, a handler that partially matches and settles the wrong order shape.

**Fix:** One shared raw-body Stripe webhook router (registered once, before express.json()) that verifies the signature and dispatches on Checkout Session metadata ({module, orderId}) to per-module settle functions. The module framework should own the mount; modules register handlers. Add a test that an exchange event never reaches the stays settler and vice versa.

### [MEDIUM] Gratitude Feed (per-recipient cap bypass via heart amount)

**Issue:** The declared bounds permit defeating the spread-giving cap: gratitude.maxPerRecipientPerCycle is 1 acknowledgment, but feed.heart_amount is bounded 1–100 and feed.max_hearts_per_recipient_per_cycle 1–100. A fork tuned to heart_amount=100, cap=3 lets a sender route 300 extra Gratitude to one recipient per cycle beside the single ack — hearts become a second, larger acknowledgment channel wearing a micro-appreciation costume. Bounded by total budget, so no inflation, but the per-recipient concentration cap (the anti-clique control) is bypassed within declared bounds.

**Fix:** Bound feed.heart_amount at 1–5 (bounds should exclude broken economies, per the fail-loud philosophy), or enforce a combined per-recipient per-cycle VALUE cap across kinds (acks + hearts) as the real invariant, with the 409 naming which cap fired.

**Closed 2026-08-29, 3882081:** `gratitude.max_share_per_recipient` replaced both per-recipient caps with one kind-blind share of the giver's own allowance, summed across acknowledgments and hearts together so neither channel can carry what the other refuses, and both 409s name the dial that fired.

### [MEDIUM] Internal Exchange (idempotency key width + rounding direction)

**Issue:** Two settlement-precision defects. (1) Swap-leg key scheme `order:{id}:{account}:{currencyId}:{direction}` claims to fit varchar(160) but is 64+64+64+direction plus separators ≈ 200+ chars worst case — truncation silently merges distinct legs' keys (an idempotency collision that DROPS one leg of a swap: member debited, never credited, or vice versa). (2) The quote endpoint 'returns the even pair that minimizes rounding remainder' — a nearest-rounding implementation can round in the member's favor, and with spread 0 (the default) a crafted amount pair makes A→B→A round-trips extract dust from the treasury at scale.

**Fix:** Standardize idempotencyKey at varchar(191) per the keystone and use positional leg keys (`ord:{orderId}:leg{n}`), with a unit test at max-width ids. Replace 'minimize remainder' with the hard rule: every rounding step favors the treasury (ceil what the member pays, floor what the member receives), plus a property test asserting no A→B→A round-trip ever increases the member's anchor value at any price pair and spread=0.

### [MEDIUM] module-framework (disable with open economic state)

**Issue:** The dependency graph blocks disabling a module another module requires, but nothing blocks disabling a module with open ECONOMIC state. Disabling library with active loans 404s every route while borrowers' escrow stays locked in sys:library-escrow; disabling stays with active autopay stays halts night-posting while guests keep sleeping; disabling exchange strands pending Stripe orders whose webhook now hits a 404-gated router (settlement silently lost if requireModule wraps the webhook path).

**Fix:** ModuleDef gains an openStateCheck(): {count, description} hook; the lifecycle PUT refuses off (409 with the count) while open state exists, offering 'settle first' guidance; funds-bearing modules alternatively support a read-only wind-down lifecycle. Webhook/settlement endpoints must be exempt from requireModule 404s for in-flight orders regardless of lifecycle.

### [MEDIUM] Crowdpool (unverified email self-service)

**Issue:** Commitments auto-link on registration-asserted (unverified) email, and linking grants mutating self-service: POST /withdraw kills someone else's pledge, /schedule and /evidence alter it. Registering with a known pledger's email — pledger emails are semi-public in any real campaign — lets a griefer withdraw a rival's $5k pledge or attach garbage evidence. The design flags viewing as the risk but ships withdraw as pledger-self-service anyway.

**Fix:** Verified email required before ANY mutating self-service on a linked pledge (withdraw/schedule/evidence); unverified links are view-summary-only (no amounts). Withdraw on financial pledges additionally requires admin confirm. The design's own open question answers itself: yes, verification, at least for mutations.

### [MEDIUM] Stays (rate resolution on late catch-up posting)

**Issue:** Nightly posting is admin-triggered and lossless via per-date keys, but the amount posted for a past date is the rate posted TODAY: audience 'resolved at post time' plus price read at post time means an admin who posts a week late after a price change bills seven nights at the wrong rate — and a member whose stage crossed mid-gap gets the new audience rate applied retroactively to pre-crossing nights. Not member-exploitable (members don't trigger posting) but it corrupts the billing audit the whole module exists to provide, and disputes become 'the ledger says X but the posted price on that date was Y'.

**Fix:** Resolve rate and audience per-DATE: look up the accommodation_prices row effective on date d (prices are already append-only-ish; make them effective-dated like currency_prices) and the member's stage as of d (stage_events exist). Cheaper v1 alternative: snapshot the nightly rate onto the stay at activation and on explicit admin re-rate, so catch-up posting is deterministic.

### [MEDIUM] Cross-module (Hypha URL variable fork)

**Issue:** Four designs each mint their own game variable for the same DHO URL: module-framework `hypha.org_url`, tools-hub `governance.hypha_org_url`, exchange `exchange.hypha_dho_url`, crowdpool `crowdpool.hypha_dho_url` (crowdpool at least says 'reuse if so'). Shipped as written, one village configures governance links in up to four places; drift means the exchange deep-links to a different DHO than the tools card — a trust-surface bug on the exact boundary (Hypha = source of truth for value) the architecture is built around.

**Fix:** One platform variable — module-framework's hypha.* set — is the single source; tools-hub, exchange, crowdpool, stays, library, badges, feed all read shared/hypha.ts resolveHyphaLinks(). Delete the other three keys from their designs before any ships; add a CI grep that fails on any second *hypha*url* variable registration.

### [MEDIUM] Material Library (steward reward cycle attribution)

**Issue:** Steward reward pays 'steward_reward_pct% of that cycle's pool INFLOW' at the admin-triggered lunar close with key `library_steward_reward:{cycleNumber}` — replay-safe per cycle, but 'that cycle's inflow' computed by timestamp window is wrong under the platform's own operating reality (closes run late, sometimes re-run): a late close attributes boundary-straddling wear rows to the wrong cycle, double-counting them in the next close's window or dropping them entirely, so the steward is systematically over/under-paid and the pool ledger disagrees with the settlement audit.

**Fix:** Stamp cycleId on every pool-inflow ledger row at write time (creditTokens already has the cycle helper); the reward computes SUM(inflow WHERE cycleId = closing cycle) — deterministic under any close timing. Same rule generalizes to every cycle-scoped economic aggregate (badges ledger_earned_total, health economy.gratitude_flow).

### [LOW] Stays (manual payment free-entry mint)

**Issue:** POST /api/admin/stays/payments/manual accepts creditsGranted as a free integer decoupled from nights × posted rate and from amountMinor — an admin typo (or the shared-password problem) mints arbitrary stay credits with a plausible-looking receipt.

**Fix:** Server derives creditsGranted = nights × posted stay_credit rate when accommodationId+nights are present; a mismatching explicit value requires an override flag and writes a distinct source ('stay_manual_override') so the ledger distinguishes derived from hand-typed credits.

### [LOW] Stays vs Exchange (inconsistent fiat purchase limits)

**Issue:** Exchange ships three-tier KYC-free purchase limits (per-order/30-day/annual); Stays ships only max_purchase_nights per checkout with no cumulative cap — the same buyer blocked at $1,000/30d in the exchange can route unlimited fiat through stay-credit purchases. Inconsistent exposure defeats the point of limits (and the legal posture they support).

**Fix:** Extract a shared purchase-limit helper (per-member fiat aggregates across ALL Stripe modules against the exchange.purchase_limit_* variables) and require every fiat-charging module to call it. Limits are per-member, not per-module, or they are theater.

### [LOW] Internal Exchange (receipt numbering race)

**Issue:** receiptNo assigned as MAX+1 'inside the settlement transaction' — under MySQL default isolation two concurrent settlements can read the same MAX and collide on the UNIQUE constraint, failing one settlement mid-webhook (retried by Stripe, but noisy and a needless failure mode).

**Fix:** SELECT ... FOR UPDATE on a counter row, or catch the unique violation and retry the number assignment only — never fail the settlement over the receipt sequence.

### [LOW] Crowdpool (second Gratitude faucet)

**Issue:** crowdpool.fulfill_recognition mints Gratitude to a pledger outside any sender budget — a third faucet (after quest consent and admin mint) for the recognition token, defaulting 0 and admin-triggered, but it makes 'total Gratitude issued = sys:gratitude-pool negative balance' quietly include fiat-recognition grants, and recognizing fiat gifts with the recognition token is the exact posted-price adjacency F2 exists to prevent.

**Fix:** Keep default 0; if enabled, source it from sys:gratitude-pool with its own source tag (already specified) AND exclude crowdpool-sourced rows from any breadth/badge metric; the admin caution card should quote F2's crowding-out rationale, not just the securities one.

### [LOW] Material Library (closed-loop escrow cannot replace real assets)

**Issue:** Escrow, wear, and writeoff all settle in a non-withdrawable credit: when a $600 chainsaw is destroyed, the pool receives 1,000 library-credits it cannot convert to a chainsaw — replacement depends on a member volunteering fiat against a pool credit grant. Solvency in credits is not solvency in gear; the dashboard will show a healthy pool while the shed empties.

**Fix:** Acknowledge the two-regime split (F15: rivalrous → restraint-based): high-value items get per-item stage/role gates and, as village policy, an off-platform fiat/cash deposit recorded as evidence on the loan — flag for the same legal review as credit sales rather than inventing an in-platform fiat deposit rail.

## Sequencing notes

- Freeze the single ledger spec THIS WEEK, before the Phase 1b ledger cutover session: one tokens registry (keystone's), transfer-row shape, ledger_accounts with a faucet flag, idempotencyKey varchar(191). Three designs independently flag the tokenType enum deadline; one decision, one migration. Explicitly kill the Library enum-append migration and the Exchange `currencies` table before either team writes code.
- Land the strengthened double-pay invariant (per-source-event single payout, not per-token XOR) plus its pinned test in keystone session A — before the stays and exchange designs, which both currently treat F2 releases-on-top-of-pay-at-send as an open/sanctioned option, reach their v2 planning.
- No fiat module (Exchange S3, Stays S3) ships before: (a) per-admin identities replace the shared admin password, (b) the shared Stripe webhook router with dispute/chargeback handling exists, (c) the shared cross-module purchase-limit helper exists. These are one-time platform investments the first fiat module must fund, not per-module afterthoughts.
- Consolidate the Hypha URL into module-framework's hypha.* variables in its session 2, before tools-hub (session 1 of its build!), exchange, and crowdpool register their duplicate keys — this is a five-minute fix now and a four-module migration later.
- Material Library ships post-cutover only (all three of its own risk notes agree) and its state machine must be respecified around a single settleLoan()/`loan:{id}:settle` terminal transition before its session 3 tests are written — retrofitting the unified settle key after the five terminal paths have separate tests means rewriting the test suite.
- The Sybil eligibility filter (breadth/recognition metrics count member+ or quest-consented senders only) must land WITH the badges earned-engine session and the feed heart session, because retrofitting it after badges have been publicly awarded means revoking badges from real members — a social cost the filter avoids entirely if it ships first.
- Feed's gratitude_log columns (kind, contextType, contextRef, the unique heart index with backfill) must be specified into the Phase 1b gratitude domain cutover now even though the feed builds after Phase 4 — otherwise it becomes a live-table ALTER on the busiest table, the exact migration class the plan refuses.
- The module framework's disable path needs the open-economic-state check before any funds-bearing module reaches 'members' lifecycle in production — the framework is scheduled first (6 sessions) so the hook costs one session-line now; after library/stays are live it is an emergency patch.
