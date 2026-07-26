# Village OS — Modules Master Plan

**Created:** 2026-07-26. **Status:** designed, critiqued, reconciled; enum→registry correction already shipped to the live DB.
**Companion docs:** `AMORA_FOUNDATION_UPGRADE_PLAN.md` (the substrate: DB, ledger, forum, notifications — its build order continues unchanged underneath this plan), `docs/modules/*.md` (one full design spec per module — the build ticket each session works from), `docs/modules/CRITIQUE-economy.md` + `CRITIQUE-architecture.md` (the adversarial passes whose fixes are folded in below), `FIXES_TO_MAKE_2026-07-17_FOUNDATION_LEVERS.md` (F1–F16 governance/economy levers).

## What this is

The 2020 village-demo deck (45 slides, speaker notes recovered) sketched a village
operating system with live Hypha tech woven into an imagined whole. Six years later
the split is clean: **everything governance-shaped in that deck is Hypha's job**
(app.hypha.earth, each village configures its own DHO URL and we deep-link), and
**what remains is the village coordination layer** — the parts specific to running
a regenerative village day to day. Those are the modules this plan builds:

| Deck | Module | Spec |
|---|---|---|
| substrate | Module framework (toggles, lifecycle, Hypha links) | `docs/modules/module-framework.md` |
| substrate | Token registry + ledger (the keystone) | `docs/modules/token-registry-ledger.md` |
| 25 + 26 | Internal exchange (buy + swap closed-loop credits) | `docs/modules/internal-exchange.md` |
| 32 | Stays / accommodation payments | `docs/modules/stays.md` |
| 33 | Material library (the flagship) | `docs/modules/material-library.md` |
| 28 | Village map + coordination concierge | `docs/modules/village-map.md` |
| 30 | Tools hub | `docs/modules/tools-hub.md` |
| 31 | Gratitude feed | `docs/modules/gratitude-feed.md` |
| 34 | Village health dashboard | `docs/modules/health-dashboard.md` |
| 38 | Badges | `docs/modules/badges.md` |
| 43–45 | Crowdpool commitments dashboard | `docs/modules/crowdpool-dashboard.md` |

Every module ships **OFF by default**, is enabled per deployment through an admin
lifecycle (off → admin-preview → members-only → public), and is config-driven with
zero Amora copy in platform files — per the foundation plan's white-label mandate.

## How this was produced

Eleven design agents (one per module, each reading the deck extract, the foundation
plan, and the live code) fanned out in parallel; two adversarial critics then attacked
the whole set — one hunting economy exploits, one hunting architecture collisions and
false sequencing. The critics found that the designs are individually disciplined but
**fail as a set in exactly three places**, all fixed by declaring winners below. Their
full findings are in `docs/modules/CRITIQUE-*.md` and every CRITICAL/HIGH fix is folded
into this plan's rules. Anyone building a module MUST read its spec file **and** the
two critiques' findings for that module.

---

# Part 1 — Decisions (the reconciliation)

## D1. One ledger spec: the keystone wins ✅ partially shipped

Four designs mutated the ledger four incompatible ways. Resolution: the **Token
Registry + Ledger** design (`docs/modules/token-registry-ledger.md`) is the ONLY
ledger spec. No other module owns any token DDL — they call `postTransfer()` and
register pool accounts via `ensureSystemAccount()`. Struck from the other designs:
the Library's enum-append migration and private `transferTokens()`, the Exchange's
parallel `currencies` table, Stays' enum fallback, and the two per-module balance
columns on `users` (read `token_balances` instead).

**Already shipped (2026-07-26, Rye directive, live in MySQL):** `token_type` is
`varchar(32)` backed by a seeded `tokens` registry table (`drizzle/0006`), with a
fail-loud registry guard in `server/lib/ledger.ts` — unknown token = error, never a
silent 'gratitude'; `governance='hypha'` rows (amora, voice) are un-mintable. The
conversion landed while `token_ledger` had zero rows, i.e. inside the free window.

**Still needs Rye's sign-off (Decision Gate A):** the keystone's full shape —
`ledger_accounts` (system accounts as real account rows with a `faucet` flag; only
faucets may go negative) and **transfer rows** (`fromAccountId`/`toAccountId`,
conservation by construction) instead of today's single-entry signed rows. This is
the bigger amendment and the natural moment is the Phase 1b ledger cutover, when
JSON entries get rewritten into MySQL anyway (existing entries become transfers
from their source faucet). If declined, modules still work on single-entry +
paired writes, but conservation checks become per-module conventions instead of
structural — the critics rate that materially weaker.

## D2. One module framework: module-framework wins, tools-hub demotes

Two designs each built "the" framework with contradictory toggle models, and eight
others assumed one or the other. Resolution: **module-framework** is the substrate
(lifecycle in a `module_settings` table, NOT game variables — every
`<module>.enabled` variable in the other ten designs is void). **tools-hub demotes
from a standalone module to the framework's reference consumer** (+1 session for
its registry CRUD, audience visibility, click beacon, SSRF-guarded link check).

## D3. One Hypha home

Four designs minted four variables for the same DHO URL. Resolution: the
framework's `hypha.org_url` + four named deep-link overrides is the single home,
shipped with `shared/hypha.ts` + a `<HyphaLink>` component that hides itself when
unconfigured. `governance.hypha_org_url`, `exchange.hypha_dho_url`, and
`crowdpool.hypha_dho_url` are deleted from those designs. The CoCreatorsGuide
`[YOUR-DHO-SLUG]` placeholder fix rides the framework session. Add a CI grep that
fails on any second `*hypha*url*` variable registration.

## D4. One event spine, pulled forward

Three modules claimed F13 instrumentation. Resolution: **Health Dashboard Session 1
ONLY** (recordEvent() + `health_events` DB-native + converting the 11 addActivity
call sites + the activity-table actor/entity columns) ships immediately after the
ledger keystone — it is cheap, has no UI, and every later module emits through it.
The data is unrecoverable retroactively; that is why it jumps the queue. The
dashboard UI stays late (after a few lunations of data exist).

## D5. The feed is a forum lens, and the forum must know it

The Gratitude Feed correctly refuses to become a fourth content surface: it is a
feed-style read-model over a config-designated forum category, interleaved with
Pulse events, where a heart click IS a real budget-bounded Gratitude send through
the existing pay-at-send path. Consequence: **two schema riders are now part of the
foundation plan's own tickets** — (a) Phase 4 forum tables ship WITH
`kind`/`meta`/`imageUrl`/`heartCount` + `forum_thread_tags` + `forum_reports`;
(b) the Phase 1b gratitude domain cutover migration includes
`kind`/`contextType`/`contextRef` on `gratitude_log`, the `(from_id, context_ref,
kind)` unique heart index, and Revision 3's cycle-key cleanup, all in one migration.

## D6. Exchange v1 is buy-only; the swap is deferred

The Exchange design's own reasoning demolishes the swap (thin market, credits with
intrinsic redemption value, price-setting as governance). What a village actually
needs first is: sell stay credits and event tickets for fiat, with receipts. Swap
(the Uniswap-homage card, quote engine, 4-leg settlement) moves to a
demand-triggered v2 that may never be scheduled. This also shrinks the legal
surface until counsel reviews the closed-loop posture.

## D7. Crowdpool is deferred until its trigger exists

Campaigns run on regen-civics; the module's trigger event (a passed campaign, with
a webhook/export contract that repo has not built) has not happened. Its honest v1
is 5–6 sessions. Pre-work worth doing now: one paragraph agreeing the
material-library draft-item back-reference shape, so neither schema freezes wrong.
Also: **`crowdpool.fulfill_recognition` is deleted** (money-in → Gratitude-out
breaches the recognition firewall; if a village wants to thank a donor, a human
sends Gratitude through the normal budgeted send).

## D8. The economy invariants (from the exploit critique — non-negotiable)

1. **Per-source-event single payout**, not just per-token XOR: while any token pays
   at send, no release job may weight on that token's ack/send rows when crediting
   ANY token (kills the cross-token double-pay resurrection of ADR-30). Pinned test
   in the keystone session: an ack row funds at most one ledger credit, ever.
2. **No swappable/purchasable faucet tokens:** the exchange rejects
   `swappable=true`/`purchasable=true` on any token with non-purchase faucet
   sources (e.g. library intake awards) — library-credit seeds as non-swappable,
   non-overridable in v1. Kills the junk-item → appraisal-mint → swap-to-beds
   laundering chain.
3. **One selling module per token**, enforced as a boot assertion (if the library
   sells its credits, the exchange must not, and vice versa).
4. **Non-negative system accounts except declared faucets** — pool grants, repair
   burns, and steward rewards fail loudly when the pool lacks balance; steward
   reward = min(pct × inflow, pool balance); inflow attributed by stamping cycleId
   on ledger rows at write time, never timestamp windows.
5. **Intake mint controls** (library): `intake_award_pct` bound capped at 100,
   per-member per-cycle mint cap, dual sign-off above a value threshold,
   high-value items stage/role-gated with escrow covered by non-intake credits,
   and a "credits minted vs replacement value backing" red-flag metric from day one.
6. **One terminal settle transition per loan** (`loan:{id}:settle`, row-locked) —
   every path that ends a loan funnels through a single `settleLoan()`;
   reconciliation asserts escrow account balance == SUM(open loans' escrow).
7. **Sybil eligibility filter, shipped WITH the feed-heart and badge-engine
   sessions** (not retrofitted): breadth/recognition-derived metrics and badge
   rules count only senders at stage ≥ member or with ≥ 1 consented quest; any
   capability-bearing earned badge keys exclusively on quest-consent metrics.
8. **Fiat platform trio before any fiat module ships:** (a) one shared
   `server/lib/payments.ts` + ONE raw-body Stripe webhook route dispatching on
   metadata (never two mounts), (b) dispute/chargeback webhook handling in v1
   (reversal entries that may go negative + auto-suspend + admin queue),
   (c) a shared per-member purchase-limit helper across ALL fiat modules.
9. **Per-admin identities are a hard precondition for enabling any funds-bearing
   module** (Decision Gate C). Every design's mint/price/manual-payment audit field
   is worthless while one shared admin password exists; the framework's legal
   caution card refuses (not warns) until real admin accounts exist. Plus
   `ledger.admin_mint_cycle_cap` (aggregate per cycle) beside the per-call cap.
10. **Module disable respects open economic state:** `openStateCheck()` on
    ModuleDef — refuse `off` while loans/stays/orders are open (offer wind-down);
    webhook settlement endpoints are exempt from module-off 404s.
11. **Rounding favors the treasury** (ceil what the member pays, floor what the
    member receives) with an A→B→A no-profit property test; idempotency keys
    positional (`ord:{id}:leg{n}`) at varchar(191).
12. **Preview-lifecycle leak guard:** module Pulse/feed emissions go through
    `moduleActivity(moduleId, …)` which checks lifecycle before delegating —
    structural, not reviewed-for.

## Decision gates for Rye (everything else proceeds without you)

| Gate | Question | Recommendation | Blocks |
|---|---|---|---|
| ~~Gate 0~~ | ~~enum → registry~~ | **DONE 2026-07-26** — you ordered it, it is live | — |
| A | Ledger row shape at Phase 1b cutover: transfer rows + `ledger_accounts` (+faucet flag), or keep single-entry signed rows? | Transfer rows — conservation holds by construction; the cutover rewrites rows anyway | Keystone sessions 2–4 |
| B | Confirm the Hypha-only posture: nothing share-like (project/business tokens, equity) ever trades in-platform; the internal exchange handles closed-loop credits only | Yes — it is the deck's own slide-25 rule, and the legal firewall | Exchange, Stays v2, token seeds |
| C | Per-admin identities (named admin accounts) before any module that sells for fiat goes live | Yes — otherwise every audit field says "admin" | Exchange S3, Stays S3 |
| D | One shared credit token vs one token per module (library-credit + stay-credit separate)? | Separate per module — cleaner pools, cleaner legal stories, the registry makes it free | Token seeds |
| E | Village dues option: should stays' nightly posting also cover the dues-offset story from the resident journey? | Defer — dues stay as-is until stays v2 | Nothing now |

---

# Part 2 — The build order (back-to-back sessions)

The foundation plan's remaining phases (1b repo cutover, notification spine, forum)
continue as planned — this order interleaves the modules around them. One session ≈
one focused block shipping a deployable increment. Parallel tracks are safe because
they touch disjoint domains; `schema.ts`, `gameVariables.ts`, `capabilities.ts` and
`Admin.tsx` are append-only merge points (PRs land serialized).

**Serialization rules:** (1) any session touching tokens/ledger DDL is exclusive —
after Session 4 that set must be empty; (2) `shared/capabilities.ts` SEMANTIC
changes are exclusive (the badges gate session); key additions merge-coordinate;
(3) no fiat module ships before the Gate-C trio (D8 #8–9).

| # | Session | Track | Depends on |
|---|---|---|---|
| 1 | Test harness bootstrap + Phase 1b begins (users/auth domain cutover, index.ts split starts) | Foundation | — |
| 2–4 | **Keystone:** token registry + ledger v1 per its spec (accounts + transfer shape per Gate A, byte-exact idempotent import, postTransfer(), rewire quest consent + gratitude send, boot invariants D8 #1, admin Tokens/Ledger tabs + reconciliation) | Foundation | Gate A |
| 5 | **Event spine** (health S1 only): recordEvent() + health_events + 11 call sites + activity columns | Foundation | S2 |
| 6–7 | **Module framework v1:** registry + module_settings (DB-native) + requireModule + boot reconciliation; Admin Modules tab + hypha.* + shared/hypha.ts + HyphaLink + moduleActivity() guard + CoCreatorsGuide DHO fix | Modules | — |
| 8 | **Tools hub** as framework reference consumer (first visible member-facing ship) | Modules | S7 |
| 9–11 | Phase 1b completion: quests domain; gratitude domain WITH the D5 riders (sendGratitude() service, gratitude_log columns + heart index, cycle-key cleanup); config docs. data/ stops being authoritative | Foundation | S2 |
| 12–14 | **Track B: Stays v1** (3 sessions; S3 = shared payments.ts + Stripe webhook router + purchase limits + chargeback handling, built ONCE) | Modules | S4, Gate C for S3 |
| 12–16 | **Track A (parallel): Village Map v1** (5 sessions; circles as data → map render → mobile fallback → contact relay → concierge) | Modules | S8 |
| 15–17 | **Track B: Exchange v1, buy-only** (3 sessions, consumes payments.ts) | Modules | S14, Gates B+C |
| 15 | **Track C: capabilities gate change** (badges grant/deny semantics, standalone, heavily tested, Rye signs off deny-beats-role-grant) | Modules | — (exclusive on capabilities.ts) |
| 16–19 | **Track C: Badges v1** (4 sessions; earned engine ships WITH the Sybil filter D8 #7) | Modules | S15, S5 |
| 17–22 | **Track D: Material Library v1** (6 sessions, believed; DB-native, real transactions, single settleLoan(), intake controls D8 #5) | Modules | S11 |
| 18–19 | Phase 3: notification spine + scheduler; retrofit hooks land as small riders in shipped modules (stay low-balance, library reservation-ready, map contact) | Foundation | S11 |
| 20–22 | Phase 4: forum + decision primitive, WITH the D5 feed riders, shipped AS a module on the framework | Foundation | S18 |
| 23–25 | **Gratitude Feed v1** (3 sessions — its deps are all satisfied by construction here) | Modules | S22 |
| 26–28 | **Health dashboard v1 remainder** (S2–S4: snapshots at cycle close, regen metrics entry, dashboard page + season-goals overlay) — after a few lunations of data | Modules | S5 + data |
| 29+ | Economics section (Base reads), founder command centre (consumes health), then **extract Custom-Game-Foundation** | Foundation | — |
| deferred | **Crowdpool** — until a regen-civics campaign is scheduled and the contract exists; **Exchange swap** — until demand; **all v2s** — behind demand | — | triggers |

**Working total: ~42 sessions of v1 work** (down from the designers' 71 — the
critics' rebudget). First visible member-facing ship: Session 8 (tools hub).
First money-touching ship: ~Session 14 (Stays with Stripe). The loop the foundation
plan protects (arrive → path → do → be seen → recognition carries value → do more)
is never blocked: it runs on today's shipped systems while this builds underneath.

---

# Part 3 — What the modules improve over the 2020 deck (the short version)

- **The deck rebuilt governance; we deep-link it.** Voting, referendums, share
  purchases, multisig badges — all Hypha, one configured URL, `<HyphaLink>`
  everywhere, zero dead links when unconfigured, zero securities surface.
- **The deck had tokens with no accounting.** Now: one registry, one
  conservation-checked ledger, pools as real accounts, idempotency on every
  movement, pay-at-send XOR release enforced at boot, recognition structurally
  unbuyable (F4), equity structurally unmintable (governance='hypha').
- **The deck's exchange was a Uniswap fork.** Now: treasury-as-counterparty at
  admin-posted, provenance-logged prices (price-setting is a governance act, not a
  market act), anchor pricing kills triangular arbitrage, quotes are
  slippage-free-or-fail, credits are closed-loop arcade credits with KYC-free
  limits — and anything share-like goes to Hypha, resolving the deck's own
  slide-25/26 contradiction.
- **The material library's speaker-note mechanics became a real economy:** wear
  quoted BEFORE you borrow (deterministic decay curve: front-loaded by item age ×
  duration × declared wear-class), automatic wear split from disputable damage,
  escrow as ledger rows, dual-sign as a state machine with a dispute branch and
  F6-style default-on-deadline, the 120%/20% pool split with a non-negative pool,
  steward paid idempotently at lunar close, "internal NFT" honestly = an
  append-only provenance chain in MySQL.
- **The map became a coordination tool, not a visualization:** deterministic
  radial layout (stable spatial memory, no physics jitter), vacant roles greyed as
  open calls with raise-your-hand applications, deterministic-first concierge
  ("I want to plant trees" → Food Forest lead) with the LLM only disambiguating,
  unmatched queries logged as founder demand signal, privacy-respecting contact
  relay, honest mobile fallback.
- **Hearts became scarce and real:** a heart IS a 1-Gratitude budgeted send —
  idempotent, irrevocable, cap-respecting — not a free like. The feed rides the
  forum (one content substrate), interleaves village life with system events, and
  never displays amounts (F2/F3).
- **Health became breadth-first and honest:** distinct sender-recipient pairs
  beats volume; cycle-aligned snapshots on the lunar rhythm; regenerative metrics
  as steward observations with provenance, not sensor vaporware; small-cohort
  suppression; season goals as the steering overlay.
- **Badges lost their weapons:** no voting multipliers ever (F4 welded shut),
  self-declared ≠ authorization (boot-asserted), warnings private + expiring,
  earned rules read only consented/settled events, Hypha multisig badges mirrored
  read-only.
- **Everything is a module a village can turn off**, with a lifecycle (soft-launch
  to admins → members → public), dependency checks, legal caution cards on
  funds-bearing modules, and delta-only inheritance so hundreds of forks get new
  modules as OFF automatically.

---

# Handoff Breakdown — Who Does What

### YOU (Rye) — things only you can do

| # | Task | Why only you | Where |
|---|---|---|---|
| 1 | Decision Gates A–D above (ledger row shape; Hypha-only for share-like; per-admin identities; one-credit-vs-per-module tokens) | Product/governance calls | Reply in any session; A blocks keystone sessions 2–4 |
| 2 | Legal review before real money flows: closed-loop credit sales (stays/exchange), Costa Rica 13% IVA on lodging, consumer refund law, gift-certificate/escheatment if credits ever expire | Counsel engagement | Before Exchange S3 / Stays S3 go live |
| 3 | Confirm Hypha deep-link URL shapes hold for your DHO (the four conventional suffixes) | Your Hypha org | 2 minutes, before framework S7 |
| 4 | regen-civics side: decide whether crowdpool pledges carry capital types + amount/unit, or the contract in `docs/modules/crowdpool-dashboard.md` drives that build | Cross-repo product call | Whenever a campaign approaches |
| 5 | Name the per-module credit tokens if Gate D = separate (stay credits, library credits display names) | Naming is yours | Before each module's seed |

### CLAUDE CODE — already done or can be done without you

| # | Task | Status |
|---|---|---|
| 0 | enum → token registry (0006), live DB converted, ledger guard, tests, import script, plan-doc supersede note | **DONE, verified in prod** (token_ledger had 0 rows — free window) |
| 1 | 11 module design specs + 2 critiques written to `docs/modules/` | DONE |
| 2 | This master plan | DONE |
| 3 | Sessions 1–28 as sequenced above | READY — each session's ticket = its `docs/modules/*.md` + this plan's decisions |

### WAITING ON YOU before Claude Code can proceed

- **Gate A** before keystone sessions 2–4 (the very next module-track work).
- Gates B–C before any fiat-touching session (≈ Session 14 at the earliest).
- Everything else in Sessions 1, 5–11 (foundation + framework + tools + map) is
  unblocked **today**.
