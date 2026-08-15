# Module design: Village Material Library (slide 33) — flagship tool-lending commons with item provenance, health decay, credit escrow, and a steward-run Library Pool

Provenance: platform

> Produced by the 13-agent design workflow, 2026-07-26, from the 2020 village-demo deck (slides + speaker notes),
> the AMORA_FOUNDATION_UPGRADE_PLAN constraints, and the live codebase. Reconciled by MODULES_MASTER_PLAN.md —
> where this file and the master plan disagree, **the master plan wins** (it applies the two critique passes).

**A closed-loop lending commons where members contribute gear for Library Credits, borrow against escrowed credits, and every item carries a provenance-and-health history ("internal NFT" = an append-only DB event chain, not a blockchain token), with wear priced deterministically up front and all value movement flowing through the one platform ledger.**

Estimated sessions: 10

## Improvements over the 2020 slide concept

- Honest 'internal NFT': the provenance is an append-only library_item_events chain in OUR MySQL (optionally hash-chained for tamper-evidence in v2), not a blockchain token. No gas, no wallets, no securities surface. If a village ever wants a high-value asset genuinely tokenized/tradeable, that is share-like and goes to Hypha via deep-link — the platform never mints it.
- Wear is quoted BEFORE you borrow. The slide priced wear retroactively via subjective dual-assessment at handoff. Here expected decay is computed from duration x age-curve x declared wear-class and shown as a quote ('10 days ≈ 1.4% ≈ 84 credits') at reserve time — informed consent instead of a surprise deduction.
- Automatic wear is split from damage. Computed time-based decay applies with no negotiation; only damage BEYOND the computed floor is human-assessed and disputable. This removes the social friction of haggling over 2% at every single handoff, which is what would have killed the slide's design in a real village.
- Escrow is explicit and ledger-native. The slide showed Total vs Available credits with no mechanism. Here borrowing transfers creditRequirement to a sys:library-escrow ledger account with an idempotency key, so locks can't double-apply or leak, and the Total/Available split on screen is literally SUM(ledger) arithmetic.
- Reservation queue that never locks queued members' credits: escrow locks only when the item is actually ready for you (hold-with-expiry, default 48h). The slide's model would have frozen credits for weeks while you waited in line.
- Dual-sign is a real state machine with a failure path: reserved -> pickup_pending(both confirm + condition ack) -> active -> return_pending(both confirm) -> closed, with a dispute branch adjudicated by the Library Steward. The slide had signatures but no disagreement path.
- The Library Pool is a transparent ledger account (sys:library-pool), not a hidden bucket: every inflow (wear deductions, purchase spread) and outflow (steward reward, acquisition grants, repair burns) is an auditable ledger line members can see.
- Steward reward is automated on the existing lunar cycle close: a configurable % of the cycle's pool inflow settles to the steward idempotently per lunation, reusing shared/lunar.ts rhythm instead of the slide's undefined 'rewarding the steward'.
- Overdue pressure via a decay multiplier (overdue days wear at 2x against your escrow) instead of inventing a fine system — no new punishment currency, no negative balances.
- Inflation control made explicit: credits are minted only against appraised replacement value at intake (contributor gets 100%); the v2 purchase premium (120%) is where the pool captures spread; repairs/writeoffs BURN pool credits to sys:library-sink so supply tracks the real backing. The slide never closed this loop.
- Recognition firewall respected (F4): Library Credits cannot be bought with Gratitude, grant no voice, and are rejected by the same boot invariant pattern — a materially useful token deliberately kept out of the recognition and governance economies.
- Zero scheduler dependency: decay computes at settlement from elapsed time and overdue state evaluates lazily on read, so the module ships on today's cron-less platform; the Phase 3 scheduler only ADDS digests/reminders, it isn't load-bearing.
- Maia helps with intake: a new 'library-item-intake' PROPOSAL_KIND reuses the existing injection-guarded assistant plumbing to help members write a good item listing with a replacement-value estimate for the steward.
- Front-loaded decay is an actual formula (break-in half-life over cumulative borrow-days), tunable per fork via fail-loud game variables — the slide's '0.1-1%... more at the beginning... slows down' made concrete and white-labelable.
- Condition photos on handoff events (reusing the just-shipped sharp upload pipeline) give disputes evidence instead of memory.

## Data model

**Migration `drizzle/0006_material_library.sql`** — includes `ALTER TABLE token_ledger MODIFY token_type ENUM('gratitude','amora','voice','library_credit')`. **Append-only enum widening, and it must land NOW while the ledger is young** (production ledger is fresh; appending values at the end of a MySQL 8 enum is an in-place metadata ALTER — the migration regen refused was a reorder on a huge live table). Also `ALTER TABLE users ADD library_credit_balance INT NOT NULL DEFAULT 0` (a recompute-never-increment cache of SUM(ledger), same discipline as recognition_balance).

**System ledger accounts (rows in token_ledger only, never in users):** `sys:library-pool` (the Library Pool), `sys:library-escrow` (locked borrower credits), `sys:library-sink` (burns for repairs/writeoffs). Pool balance = SUM(entries WHERE user_id='sys:library-pool' AND token_type='library_credit'). No module-local balance table anywhere — ONE LEDGER holds.

| library_items | |
|---|---|
| id | varchar(64) PK |
| name | varchar(160) NOT NULL |
| description | text |
| category_id | varchar(64) FK -> library_categories |
| photos | json (array of /api/uploads/ urls) |
| status | enum('intake_pending','available','reserved','checked_out','return_pending','in_repair','retired','written_off') — denormalized, maintained in the same transaction as loan transitions |
| health_bp | int NOT NULL DEFAULT 10000 (basis points 0–10000; integers, no float drift) |
| credit_value | int NOT NULL (appraised replacement value, in credits) |
| credit_requirement | int NOT NULL (escrow to borrow; defaults to credit_value per the slide's 'value 1000 = requirement 1000'; steward may lower to subsidize) |
| contributor_id | varchar(64) FK users (who donated) |
| custodian_id | varchar(64) NOT NULL (the slide's 'Current Borrower', generalized: steward's user id when home) |
| home_location | varchar(160) (tool shed, kitchen...) |
| total_borrow_days | int NOT NULL DEFAULT 0 (drives the age/break-in curve) |
| loan_count | int NOT NULL DEFAULT 0 |
| max_loan_days | int NULL (per-item override) |
| steward_notes | text |
| acquired_at, retired_at, retirement_reason | timestamps / varchar(255) |
| created_at, updated_at | timestamps |

| library_categories | |
|---|---|
| id | varchar(64) PK |
| name | varchar(120) NOT NULL |
| icon | varchar(64) |
| sort_order | int DEFAULT 0 |
| Seeded from config (forum-categories rule: seeds, never migrations); admin-editable. |

| library_loans | (a reservation IS a loan in 'reserved'; the queue = reserved loans ordered by reserved_at) |
|---|---|
| id | varchar(64) PK |
| item_id | varchar(64) FK, INDEX(item_id, status) |
| borrower_id | varchar(64) FK users, INDEX(borrower_id, status) |
| status | enum('reserved','pickup_pending','active','return_pending','disputed','closed','cancelled','expired') |
| escrow_amount | int (snapshot of credit_requirement at lock time) |
| escrow_ledger_ref | varchar(160) (idempotency key of the lock entry: `loan:{id}:escrow`) |
| declared_wear_class | enum('normal','heavy','extreme') DEFAULT 'normal' (Rye's 'the person taking the item can choose higher') |
| health_at_checkout_bp, health_at_return_bp | int |
| computed_decay_bp | int (automatic wear) |
| assessed_damage_bp | int DEFAULT 0 (human-assessed, beyond computed) |
| total_deduction | int (credits routed escrow -> pool) |
| pickup_confirmed_holder_at, pickup_confirmed_borrower_at | timestamp NULL (the dual-sign: active only when BOTH set) |
| return_confirmed_borrower_at, return_confirmed_receiver_at | timestamp NULL |
| receiver_id | varchar(64) (steward, or next borrower on v2 peer pass-off) |
| hold_expires_at | timestamp (reservation hold, default now+48h) |
| due_at | timestamp (activation + loan days) |
| reserved_at, activated_at, closed_at | timestamps |
| dispute_reason, resolution_note | text; resolved_by varchar(64) |

| library_item_events | (the 'internal NFT': append-only provenance/custody/health chain) |
|---|---|
| id | varchar(64) PK |
| item_id | varchar(64), INDEX(item_id, at) |
| type | enum('intake','appraisal','revalue','photo_update','reserve','queue_join','pickup','handoff','return','wear_assessed','damage_reported','dispute_opened','dispute_resolved','repair_start','repair_done','retire','writeoff','admin_adjust') |
| actor_id | varchar(64); counterparty_id varchar(64) NULL (the two signers of a handoff) |
| loan_id | varchar(64) NULL |
| health_before_bp, health_after_bp | int |
| credit_delta | int (credits moved by this event) |
| ledger_ref | varchar(160) (links to token_ledger idempotency key — every credit_delta has a ledger line) |
| photos | json (condition evidence via sharp pipeline) |
| note | text; payload json |
| at | timestamp |
| v2: prev_hash/hash char(64) sha256 chain for tamper-evidence |

| library_wishes | (v2 — how the pool 'buys new equipment') |
|---|---|
| id, title, description, est_credit_value, requested_by, status enum('open','funded','fulfilled','declined'), fulfilled_item_id, created_at | |

**Ledger sources introduced (all through server/lib/ledger.ts, extended):** `library_intake_award`, `library_escrow_lock`, `library_escrow_release`, `library_wear`, `library_damage`, `library_pool_spread` (v2), `library_steward_reward`, `library_acquisition_grant`, `library_repair_burn`, `library_writeoff`, `library_admin_adjust`, `library_credit_purchase` (v2). ledger.ts changes: PLATFORM_TOKEN becomes a set `{gratitude, library_credit}` (amora/voice still hard-rejected); add `transferTokens()` writing a paired debit/credit atomically in one DB transaction with a shared idempotency-key prefix; system-account ids allowed as userId.

**gameConfig.ts addition (identity, not behaviour):** `library: { name: "Village Material Library", creditName: "Library Credits", creditNameShort: "credits" }` — display naming per white-label mandate; all numbers live in game variables.

## Endpoints

- `GET /api/library/items?category=&q=&status= — inventory: photo, health, custodian, credit requirement, queue length (public read when module on)`
- `GET /api/library/items/:id — detail + provenance timeline (item_events) + current queue`
- `GET /api/library/me — total credits, available (SUM ledger), escrowed (active-loan escrows), active loans, reservations + queue positions`
- `POST /api/library/items/contribute — member offers an item {name, description, categoryId, photos[]} -> intake_pending (capability library.contribute)`
- `POST /api/library/upload — member-scoped photo upload; reuses the sharp resize pipeline + rate limit from /api/admin/upload`
- `POST /api/library/items/:id/reserve — hold (escrow locks, expires in reservation_hold_hours) if available; queue-join (no lock) if out`
- `POST /api/library/items/:id/queue/leave`
- `POST /api/library/loans/:id/cancel — before activation; releases any held escrow`
- `POST /api/library/loans/:id/pickup/confirm — dual-sign step; body {healthAckBp, wearClass?}; each party calls once; when both have signed -> status active, escrow locked idempotently (key loan:{id}:escrow), pickup event written`
- `POST /api/library/loans/:id/return/initiate — borrower flags the return, shows receiver the computed wear quote`
- `POST /api/library/loans/:id/return/confirm — receiver (steward, or next-in-queue on v2 pass-off) confirms {healthAssessedBp?, damageNote?, photos?}; when both signed -> decay computed, deduction routed escrow->pool, remainder escrow->borrower, loan closed, item available (or handed off)`
- `POST /api/library/loans/:id/dispute — either party; freezes settlement, opens steward adjudication`
- `POST /api/library/steward/intake/:itemId/appraise — {creditValue, creditRequirement?, healthBp, homeLocation} -> mints intake award to contributor (idempotency key intake:{itemId}), item -> available (capability library.steward)`
- `POST /api/library/steward/intake/:itemId/decline — with reason`
- `POST /api/library/steward/loans/:id/adjudicate — {healthAfterBp, deduction, note} -> signed correction entries, dispute_resolved event`
- `POST /api/library/steward/items/:id/repair — start/done {healthRestoredBp, creditCost} -> pool burns creditCost to sys:library-sink`
- `POST /api/library/steward/items/:id/retire — {mode:'retired'|'written_off', reason}; mid-loan writeoff charges min(escrow, remaining-health value) per Rye's proportional rule`
- `POST /api/library/steward/items/:id/revalue — {creditValue} with revalue event (no retroactive escrow change on active loans)`
- `GET /api/library/steward/queue — intake pending, disputes, overdue (lazy-evaluated), return_pending, below writeoff_health_floor`
- `GET /api/admin/library/pool — pool balance + inflow/outflow ledger lines`
- `POST /api/admin/library/pool/grant — manual steward reward or acquisition grant with reason (also runs automatically at lunar cycle close)`
- `POST /api/assistant/proposal {kind:'library-item-intake'} — new PROPOSAL_KIND in the existing Maia plumbing; helps a member draft a listing + replacement-value estimate`

## Surfaces

**Pages (routes + nav contributed ONLY when the module is enabled, via the config-driven module registry):**
- `client/src/pages/Library.tsx` — the slide-33 screen: search bar, category chips, item cards (photo, HealthBar, credit requirement, custodian avatar, Reserve/Join-queue). Right rail 'Your Library Details': **Total vs Available credits with the escrowed difference itemized per loan** (the slide's 18,000/12,000 made mechanical), Currently Borrowing list with health bars, due dates, Return buttons.
- `client/src/pages/LibraryItem.tsx` — photo gallery, health history sparkline, **provenance timeline (the internal NFT made visible: every custody hop, appraisal, repair)**, reservation queue, and the WearQuote calculator ('borrow 10 days ≈ 1.4% ≈ 84 credits') with duration + wear-class inputs.
- `client/src/pages/LibraryHandoff.tsx` (route /library/loans/:id) — the dual-sign screen: two signature slots showing who has/hasn't confirmed, condition-ack health display, wear-class selector at pickup, damage note + photo attach at return, dispute button.
- Components: `LibraryHealthBar.tsx` (color-graded, from the slide), `CreditBalanceCard.tsx`, `WearQuote.tsx`, `ItemProvenanceTimeline.tsx`, `HandoffSignPanel.tsx`, `StewardQueuePanel.tsx`.
- **Steward view**: /library/steward (gated on library.steward capability) — intake appraisals, disputes, overdue list, repair/retire actions.
- **Admin**: `LibraryAdminTab` in `client/src/pages/Admin.tsx` following the existing *Tab pattern — pool dashboard (balance + ledger lines), categories editor, item CRUD/retire/revalue, dispute override, manual grants; tab appears only when module enabled. Tuning lives in the existing Game Mechanics variables editor (new defs only, no new UI).
- Nav: 'Library' entry added to `client/src/config/mobileNav.ts` and the Layout drawer, conditional on the toggle.
- Mobile: handoff dual-sign is the key mobile flow (two people standing next to a tent) — big tap targets, works offline-tolerant (confirm retries idempotently). Village Pulse (addActivity) entries: item contributed, borrowed, returned, retired — names only, no credit amounts.

## Mechanics

**Loan state machine:** reserved -> pickup_pending -> active -> return_pending -> closed; branches: reserved -> expired (hold lapses, escrow auto-released) | cancelled; pickup_pending -> cancelled (either party, escrow released); return_pending -> disputed -> closed (steward adjudicates); active -> closed via steward writeoff (lost/destroyed). Item.status is maintained in the same DB transaction as the loan transition. Dual-sign = both *_confirmed_*_at timestamps set; each confirm is idempotent (re-POST is a no-op), and the transition fires exactly once when the second signature lands (row lock on the loan).

**Escrow:** on hold/pickup, transferTokens(borrower -> sys:library-escrow, escrow_amount, key `loan:{id}:escrow`). On close: deduction goes escrow -> sys:library-pool (`loan:{id}:wear`), remainder escrow -> borrower (`loan:{id}:release`). Available = SUM(user ledger); Total = Available + active escrows. Nothing else in the module holds a balance.

**Decay formula (computed at settlement, NOT a cron tick — platform has no scheduler):**
- ageMultiplier = 1 + (new_item_wear_multiplier − 1) × exp(−item.total_borrow_days / newness_halflife_days) — front-loaded: a brand-new item wears ~2.5x base, asymptotes to 1x as it breaks in (Rye's 'ticks down more at the beginning... slows down').
- billedDays = min(actualDays, loanDays) + overdueDays × overdue_decay_multiplier.
- computed_decay_bp = clamp(round(base_decay_bp_per_day × billedDays × ageMultiplier × wearClassMult), 0, health_at_checkout_bp). wearClassMult: normal 1x, heavy 2x, extreme 4x (borrower-declared at pickup = Rye's 'can choose higher', now honest up-front pricing).
- total_deduction = round(credit_value × (computed_decay_bp + assessed_damage_bp) / 10000), capped at escrow_amount. Shortfall (damage > escrow): recorded as a shortfall event; borrower's library.borrow is suspended until the steward clears it — no negative balances, no fines.
- health_after = health_before − computed_decay_bp − assessed_damage_bp; item.total_borrow_days += actualDays.

**Credit economy:** intake mints credit_value × intake_award_pct/100 to the contributor (source library_intake_award, key intake:{itemId}) — supply stays backed by appraised replacement value. Ownership transfers to the village commons at appraisal (contributor is compensated in credits; avoids per-member bailment questions). Pool inflows: wear/damage deductions (+ v2 purchase spread). Pool outflows: steward reward, acquisition grants (v2 wishlist), repair burns to sys:library-sink (burning keeps supply ≈ backing). **Steward reward:** at the existing admin-triggered lunar cycle close, transfer steward_reward_pct% of that cycle's pool INFLOW to the Library Steward role holder, idempotency key `library_steward_reward:{cycleNumber}` — piggybacks the shipped cycle-close, credits nobody twice.

**Damage beyond repair:** steward writeoff mid-loan charges min(escrow, credit_value × health_at_checkout_bp/10000) — Rye's proportional rule at the limit; item -> written_off, replacement funded from pool via v2 wishlist.

**Firewalls:** Gratitude cannot buy Library Credits and credits grant no voice — enforced by the same boot-invariant pattern as F4, plus the ledger's token-type guard (amora/voice writes still hard-rejected: Hypha boundary intact). Capabilities via shared/capabilities.ts only: library.borrow (stage 'member' default), library.contribute (stage 'member'), library.steward (role-only; 'Library Steward' seeded in server/seeds/roles-seed.json). Overdue is evaluated lazily on read (steward queue, item pages) until the Phase 3 scheduler adds reminder digests.

## Game variables

- library.enabled: false (boolean) — module master toggle; OFF by default per platform rule
- library.base_decay_bp_per_day: 10 (0–100 bp) — base wear per borrowed day; 10bp=0.1%/day, Rye's 0.1–1% range enforced by bounds
- library.new_item_wear_multiplier: 2.5 (1–10) — decay multiplier for a brand-new item (front-loaded curve peak)
- library.newness_halflife_days: 60 (7–365) — cumulative borrow-days for the break-in multiplier to halve toward 1x
- library.wear_class_heavy_multiplier: 2 (1–10) — declared heavy-use multiplier
- library.wear_class_extreme_multiplier: 4 (1–20) — declared extreme-use multiplier
- library.default_loan_days: 7 (1–90); library.max_loan_days: 30 (1–365)
- library.reservation_hold_hours: 48 (1–336) — hold-with-escrow expiry when an item is ready
- library.overdue_decay_multiplier: 2 (1–10) — overdue days wear at this multiple (pressure without fines)
- library.escrow_pct: 100 (0–200) — % of credit_requirement locked while borrowing
- library.intake_award_pct: 100 (0–150) — % of appraised value minted to the contributor at intake
- library.credit_purchase_premium_pct: 120 (100–200) — v2 fiat purchase: cost of 100 credits as % (Rye's 1200-for-1000); spread accrues to pool
- library.steward_reward_pct: 10 (0–50) — % of each lunar cycle's pool inflow paid to the Library Steward at cycle close
- library.min_health_to_borrow_bp: 3000 (0–10000) — items below this can't be reserved
- library.writeoff_health_floor_bp: 2000 (0–10000) — below this the steward queue flags repair-or-retire
- library.starter_credits: 0 (0–10000) — optional one-time grant on reaching 'member' stage (idempotent per user)
- All registered in shared/gameVariables.ts (unknown key throws; platform defaults inherited by forks; only changed values stored)

## Admin controls

Module toggle (library.enabled) gating routes, nav, and the admin tab. All tunables above surface automatically in the existing Game Mechanics variables editor — no bespoke tuning UI. LibraryAdminTab: categories editor (seeded from config, editable), item registry CRUD with retire/writeoff/revalue (every change writes an admin_adjust provenance event), intake queue (admin can appraise when no steward exists), dispute override with signed correction ledger entries, pool dashboard (balance + every inflow/outflow line, read straight from token_ledger), manual pool grants (steward reward / acquisition) with required reason, and a member credit-adjustment action (signed, reasoned ledger correction — never a raw balance edit). Steward appointment happens in the existing roles-as-data admin UI by granting the seeded 'Library Steward' role (capability library.steward). Lunar cycle close screen gains one line: the library steward reward settlement for that cycle.

## Dependencies

- token_ledger + ledger.ts (SHIPPED; needs: enum append 'library_credit' NOW while the ledger is young, transferTokens() paired-entry helper, system-account support)
- roles-as-data + shared/capabilities.ts (SHIPPED; add library.* capability keys + Library Steward role seed)
- shared/gameVariables.ts + Game Mechanics admin editor (SHIPPED; add defs)
- sharp upload pipeline /api/admin/upload (SHIPPED; add member-scoped variant with same rate limits)
- lunar cycle close (SHIPPED; steward reward hooks its idempotent settlement)
- Phase 1b repository layer: library ships DB-NATIVE (its tables have no JSON legacy, and escrow/dual-sign genuinely need transactions) — it should be the pattern-setter or immediate follower of the first domain cutover; no data/ JSON files, so no ensureDataFiles()/seeds entries needed for records (only roles-seed + category config)
- Village Pulse addActivity (SHIPPED) for public events
- Resend email (SHIPPED) for v1's two blocking notifications (reservation ready, confirm needed); Phase 3 notification spine replaces/extends when it lands (NOT a v1 blocker)
- Maia PROPOSAL_KINDS (SHIPPED; one new kind)

## v1 (ship first, useful alone)

Ship first, useful alone (6 sessions): (1) Migration 0006 (4 tables + enum append + balance cache column), ledger transferTokens/system accounts, invariant + idempotency tests. (2) Item registry, categories from config, contribute -> steward appraisal -> intake mint, provenance events, member photo upload via sharp pipeline. (3) Loan state machine end-to-end server-side: reserve/hold/queue, dual-sign pickup, dual-sign return, decay engine + escrow settlement, dispute + steward adjudication, full vitest coverage of the state machine, decay math worked examples, and double-confirm/double-close idempotency. (4) Library.tsx inventory + Your Library Details (Total/Available/escrow itemized) + LibraryItem.tsx with provenance timeline and WearQuote. (5) LibraryHandoff dual-sign UX + steward queue view + dispute flow + Pulse entries + the two Resend emails. (6) LibraryAdminTab (pool dashboard, categories, item ops), steward reward at lunar cycle close, Library Steward role seed, nav wiring behind the toggle, e2e test: contribute -> appraise -> reserve -> pickup(2 signs) -> return(2 signs) -> wear deducted to pool -> cycle close pays steward. v1 deliberately has NO fiat purchase (pure contribute-to-earn faucet), no peer pass-off, notifications via Pulse+email only.

## v2 (the full slide vision)

The full slide vision (4 sessions): (7) Buy Library Credits — the slide's 120% purchase panel, fiat via Stripe checkout minting credits at the premium, spread to pool as library_pool_spread, closed-loop/non-refundable disclosure copy, behind its own toggle AND a completed legal review; alternatively (open question) route the sale through Hypha and let the platform only record grants. (8) Peer-to-peer pass-off: return_pending can settle directly to the next-in-queue borrower (loan A closes, loan B activates atomically; escrows swap in one transaction) — the slide's 'receiving account and current borrower both sign'. (9) Wishlist + pool acquisitions (library_wishes, pool grants fund new gear), repair workflow with burns, maintenance notes. (10) Hash-chained provenance (tamper-evident item history), notification-spine wiring (reservation-ready pushes, overdue digests once the scheduler exists), health-history charts, kits/bundles (borrow a 'camping kit' as one loan).

## Risks

- Legal: v1 is clean (credits only earned, never sold, non-withdrawable — arcade-credit posture), but v2 fiat purchase of credits NEEDS real legal review (closed-loop gift-certificate framing, refund law by jurisdiction, Costa Rica + forks elsewhere). Flagged, gated behind its own toggle and review.
- Sequencing: the module is DB-native while the app still reads JSON — it must land with/after the Phase 1b repository pattern or it becomes the pattern under time pressure. The enum append must ship before the ledger accrues real volume.
- Escrow requires real transactions; if any part is built on JSON files 'temporarily', dual-sign races WILL lose writes (the exact hazard the plan documents). Do not ship this module on the JSON layer.
- Inflation drift: appraisal generosity mints unbacked credits. Mitigations: steward-only appraisal, revalue events, burns on repair/writeoff, pool dashboard makes supply visible. Watch total credits vs total replacement value in the pool dashboard (instrument now per F13).
- Steward is a single point of failure (intake, disputes) — mitigated by admin fallback on every steward endpoint, but a village without an active steward gets a stalled intake queue; surface that state loudly.
- Social risk: damage assessment is where neighbors fall out. The computed-wear floor absorbs most cases, but dispute UX copy must stay non-accusatory, and adjudications are visible provenance events.
- The 'both parties sign' flow assumes two phones at handoff; poor connectivity at a rural tool shed means confirms must be retry-safe (idempotent) and allowed asynchronously within a window.
- Module toggle enforcement: nav/routes/tab must all key off library.enabled — a half-hidden module (routes live, nav hidden) leaks into forks.

## Open questions

- v2 credit sales: Stripe in-platform vs routing the purchase through Hypha (village sells a stablecoin package there; platform only records a credit grant). Hypha routing keeps ALL money off-platform and may erase the money-transmitter question entirely — Rye's call.
- Ownership at intake: design assumes items become village commons property (contributor compensated in credits). Confirm with Rye — a consignment model (contributor retains title) changes the writeoff and legal story materially.
- Should contributors earn a small ongoing usage royalty (e.g., 1% of each wear deduction) instead of/in addition to the one-time intake award? Incentivizes contributing heavily-used gear; slight inflation cost.
- starter_credits at 'member' stage: nice onboarding (you can borrow on day one) vs pure contribute-to-earn purity. Default 0; Rye to set.
- Queue fairness on v2 peer pass-off: strict FIFO enforced, or allow the current borrower to hand to anyone when no queue exists (design says next-in-queue when one exists — confirm).
- Do high-value items (chainsaw, vehicle) need a role/stage gate above 'member' (per-item minStage or requiresRole reusing quest-gate vocabulary)? Cheap to add to library_items; v1 or v2?
- Credit decimals: design uses integers (matches ledger int amount). Confirm no village wants sub-credit precision; changing later is a real migration.
- Does the Library Pool ever convert to real money (pool credits -> fiat purchase of new gear)? Current answer: never on-platform — the pool grants credits to a member who donates the purchased item; actual money stays in village accounts / Hypha. Confirm this satisfies the 'buying new equipment' intent.
