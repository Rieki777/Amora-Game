# The village economy, as built

The source of truth for how tokens are created, held, moved and destroyed in
Village OS. Every claim here is measured against the code or against the live
Amora database, and where the code and the intention differ, this file says so
rather than describing the intention.

Two companion files. `docs/TOKENS.md` is GENERATED from the code by
`scripts/generate-token-doc.mjs` and guarded by `scripts/check-token-doc.mjs`,
so it cannot drift: it is the registry, the rules and the amounts. This file is
the narrative around it, written by hand, and it can drift. When they disagree,
`docs/TOKENS.md` is right.

Measured against production on 2026-09-02 unless stated otherwise.

---

## 1. The state of the live village, measured

Amora is the only running village. Read directly from its database:

| | |
|---|---|
| `token_ledger` | **0 entries** |
| `token_balances` | **0 rows** |
| `gratitude_log` | **0 rows** |
| `users` | 5 |
| `quest_claims` | 1, status `claimed`, never confirmed |
| migrations applied | 112, newest `0125_payouts_stop_defaulting_to_gratitude.sql` |
| economy epoch | stamped `2026-09-01T09:33:03.797Z` |

**No token has ever moved in this system.** That is the single most useful fact
in this document, because it means every decision below is still cheap. It also
means nobody should describe any part of this economy as proven in production.
It is proven by tests, and by one village that has not yet spent anything.

The epoch matters because of what stamped it. `economyEpoch` was for one release
the thing that both read the epoch and created it, and its only caller was the
mint, so the first confirmed quest in a village's life wrote the epoch and was
then ruled out by it, losing its own payout by about twenty milliseconds. That
is fixed: see `startEconomyEpoch` in `server/lib/economy.ts` and the boot call
in `server/index.ts`. Amora's epoch carries a boot timestamp and its ledger is
empty, which is the proof it was stamped by the boot and not by a lost quest.
Amora never lost a payout, because Amora has never confirmed a quest.

---

## 2. The seven tokens

Two of the nine rows in the live `tokens` table are examples
(`is_example = 1`), there to show a founder what the surface looks like. The
seven real ones:

| Slug | Name | Kind | Governed by | Sendable |
|---|---|---|---|---|
| `gratitude` | Gratitude | recognition | the village | no |
| `credits` | Village Credits | credit | the village | **yes** |
| `village-voice` | Village Voice | voice | the village | no |
| `library-credit` | Library Credit | credit | the village | no |
| `stay-credit` | Stay Credits | credit | the village | no |
| `equity` | the village's own name | equity | Hypha, on Base | no |
| `voice` | Voice | voice | Hypha, on Base | no |

`governance` splits the table in two and is the most important column in it.
`platform` means this software mints it and this software is the record.
`hypha` means the real thing lives on Base and the row here is a MIRROR: a
number this village read from a chain it does not control. Never write a hypha
token as though minting it here creates anything.

The equity row is the one place a village's own name is correct. On Amora it
reads `Amora`, because migration `0124` sets the neutral name only where the
current name is not the village's own, read from the brand document. A twelfth
village that never chose a name gets `Village Equity`.

`credits` is the only token a member can send to another member. Everything
else moves only when the system moves it.

---

## 3. Where tokens come from

Five faucet accounts, all present on production:

    sys:gratitude-pool     Gratitude, refilled each cycle
    sys:cycle-pool         Village Credits
    sys:voice-mint         Village Voice
    sys:mint               Stay Credits
    sys:library-mint       Library Credits

A faucet is allowed to hold a negative balance, and that negative IS the issued
supply. The reconciliation panel reads it as "issued to date" rather than as a
problem, and the invariant it checks is that every token sums to zero across all
accounts including its faucet.

There are exactly three ways a token is created.

**A mint rule fires.** Rules live in `mint_rules` and are read by `rulesFor()`.
They key on a trigger. Live on Amora today:

| Trigger | Token | Amount | Ceiling | Recipient | On |
|---|---|---|---|---|---|
| `quest.completed` | `credits` | 25 | 250 | claimant | yes |
| `quest.completed` | `village-voice` | 10 | 100 | claimant | yes |
| `role.cycle` | `credits` | 25 | 250 | holder | yes |
| `role.cycle` | `village-voice` | 50 | 200 | holder | yes |
| `role.cycle` | `gratitude` | 20 | 100 | holder | **no** |

That last row being off is Rye's ruling of 2026-08-30, shipped as `0125`. It is
shipped off rather than deleted because there is no route that CREATES a mint
rule: `PATCH /api/admin/economy/rules/:id` edits an existing row, so a deleted
rule is a payout the village could never make again.

**A steward confirms a quest.** Gratitude is the exception to the rule engine.
It is posted by the consent route in `server/index.ts` from the range the quest
itself advertises, at an amount the steward types, and `mintForConfirmedClaim`
deliberately skips the `gratitude` slug so one piece of work cannot pay twice.

**An admin mints by hand.** Capped per cycle by
`game_variables.ledger.admin_mint_cycle_cap`, and refused when the admin is the
recipient.

---

## 4. The gratitude cycle

Gratitude is recognition and is not meant to accumulate. Every member receives
an allowance at the start of each lunar cycle to give away, and what they do not
give expires when the cycle closes.

The allowance is **never stored**. `server/lib/economy.ts:558` computes it from
the ledger each time it is asked. A stored allowance is a number that can
disagree with the ledger, and the ledger is the record.

Every gratitude write holds one lock (`server/lib/economy.ts:713`), so two
simultaneous gives cannot both read the same remaining allowance and both
succeed.

Gratitude is not sendable in the ordinary sense. It moves through `give()`,
which checks self-gratitude, the allowance, and the village's issuance state
before anything is written.

---

## 5. Village Voice and the one-way bridge

Village Voice is the governance weight the village mints for itself. It is the
only platform token with decimals today (3), so it stores thousandths: a rule
that pays 10 posts 10000.

A member with enough of it can claim, which is the bridge to Base. The claim
debits the private balance at request time (`server/lib/voiceClaim.ts`), and the
on-chain confirmation reconciles it. The threshold is a game variable, not a
constant.

The bridge is one way by design. Rye, 2026-08-31: stage 1 is the one-way bridge,
stage 2 is full Hypha integration, stage 3 is the village's own game minting
directly to Base. What exists today is stage 1.

---

## 6. Units, decimals, and the thing to know before changing them

`token_ledger.amount` stores MINOR units. A token's `decimals` column says how
many. `toLedgerUnits()` and `fromLedgerUnits()` convert.

Today six of the seven tokens have `decimals = 0` and Village Voice has 3.

**Setting every token to 4 decimals is not a migration. It is a sweep of the
code that posts to the ledger.** This is the least obvious thing in this
document and the most expensive to get wrong.

`postTransfer` in `server/lib/ledger.ts:368` takes minor units, correctly: it is
the ledger primitive. Of its 44 callers, 5 convert with `toLedgerUnits` and the
rest hand it a human number. Those 39 are not wrong today, because at
`decimals = 0` a human number and a minor unit are the same number. `give()` at
`server/lib/economy.ts:916` is the plainest case: it posts `amount` straight
through as `tokenType: HEARTS, amount`. Set Gratitude to 4 decimals without
touching that line and every give posts 0.0020.

The obvious repair is wrong too. Converting inside `postTransfer` would break
`sweepBalances` in `server/lib/exit.ts`, which reads `balancesFor(...)`, already
minor units, and posts them unchanged, so a departing member's settled balance
would be multiplied by ten thousand. The units question has to be answered per
caller.

`0126` widens `token_ledger.amount` from `int` to `bigint` so the ceiling is no
longer part of that decision. It had been four billion times narrower than
`token_balances.balance`, which has been `bigint` since `0009`. At 4 decimals
the old `int` ceiling would have capped a single posting at 214,748.3647 of the
token a member holds.

`mint_rules.amount` is already `decimal(18,4)`, so a founder can type an amount
the registry then rounds away. That mismatch is real today and is another reason
the sweep is worth doing.

---

## 7. What is enforced, and what is only convention

Enforced by code or by a gate:

- Every token sums to zero across all accounts. Checked by the reconciliation
  panel and asserted in the e2e suite.
- A posting is idempotent on `idempotency_key`, and the key carries the token
  slug, so one occurrence paying two tokens writes two rows instead of one
  colliding pair.
- A token slug never changes once set (`slugFreezeRefusal`), because ledger rows
  key on it. A rename can mint.
- Migrations only expand (`scripts/check-migration-compat.mjs`), so the previous
  release can still read a database the newest one has migrated.
- `docs/TOKENS.md` matches the code (`scripts/check-token-doc.mjs`).

Convention only, and worth knowing:

- The 39 unconverted `postTransfer` callers described above.
- A rule can be set to an amount smaller than its token's resolution. The engine
  reports this as `unpayable` rather than paying zero silently, which is the
  right behaviour, but nothing stops the rule being saved.
- Faucets may go negative, and member accounts may too, by Rye's ruling. Nothing
  in the schema distinguishes an intended negative from a bug.

---

## 8. Open decisions

1. **Decimals.** Rye ruled 4 across the board. The ledger is empty, which makes
   now the cheapest moment there will ever be. The work is the 39-caller sweep
   in section 6, with a test per path. It is not a migration.
2. **Whether an audit event is a guarantee.** 62 `void recordEvent` calls post
   the audit trail without awaiting it, so a member who acts and immediately
   opens the audit feed can miss their own action. Fine as best effort, wrong if
   the feed is a control.

---

*Written 2026-09-02 against `main`. Production figures read the same day. If a
number here disagrees with `docs/TOKENS.md`, that file is generated and this one
is not.*
