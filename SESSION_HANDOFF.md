# Session handoff, 2026-09-03

Everything below is verified, not remembered. Re-verify anything older than an
hour. Written because the session was about to hit its limit.

## Where the work is

`main` is at `e2d1cbd` and **is production**: a push to main auto-builds on
Railway within seconds and applies migrations at boot. Verified live.

Five lane branches are pushed to origin so nothing depends on this machine:

| Branch | Head | Commits ahead of main | State |
|---|---|---|---|
| `wt/g-architecture` | `0507c61` | 8 | in flight, unaudited |
| `wt/g-forkability` | `dd0f482` | 7 | in flight, unaudited |
| `wt/g-operability` | `ba9d854` | 2 | in flight, unaudited |
| `wt/g-upgrade` | `b99dcf3` | 1 | in flight, unaudited |
| `wt/g-client` | `6f6a55e` | 0 | no commits made |

**None of these have been reviewed, gate-checked by me, or merged.** They were
raising the five audit dimensions below A. Each was told to run its own gate
sweep before committing, and each was to be audited by a second agent that
re-ran the gates independently. That audit did not complete. Treat every claim
on those branches as unverified until the gates are run again.

`wt/g-decimals` is merged and is `f639774`.

## Shipped after this file was first written

- `99a52b7` this handoff.
- `e2d1cbd` the last two village-specific platform defaults. `project.location`
  is now empty (there is no neutral location) and `project.footerBlurb` is
  "A regenerative village where all beings belong and thrive.", so a village
  that never edits its footer no longer tells visitors it is in Costa Rica.
  Safe because production was read first: Amora stores its own copy of both in
  `app_config.brand`, so clearing the defaults cannot blank what it renders.
  PENDING_CEILING 4 -> 2; `project.country` and `project.fiatCurrency` remain,
  both empty on production.
  **`wt/g-forkability` also graduated `project.country` on its own branch, so
  it WILL conflict with this commit in `scripts/check-identity-keys.mjs`.** The
  resolution is a pending list holding only `project.fiatCurrency` at ceiling 1,
  if that lane's reasoning holds up under audit.
- Deploy verified live at each step via `/health`, and `/api/platform/info`
  confirms Amora still renders its own name, tagline and location.

## The audit scorecard

Recovered from the session transcript; it was never committed anywhere else.

| Grade | Dimension |
|---|---|
| A | Economy, Governance, Security, Tests & CI, Bridges |
| B+ | Data model |
| B | Architecture (the 32k-line server), Fork-ability, Client |
| C+ | Operability, Upgrade path |

The five lane branches above were the attempt to move the bottom six to A-.

## What is settled

**Amora has never moved a token.** Measured on production 2026-09-02:
`token_ledger` 0 entries, `token_balances` 0 rows, `gratitude_log` 0 rows,
5 users, 1 quest claim that was never confirmed. Every economic decision is
still free, and that will not be true again.

**Amora never lost a first payout.** The economy epoch is stamped
`2026-09-01T09:33:03.797Z` with an empty ledger, which proves it was stamped by
the boot fix in `5bb5ce1` and not by a quest losing to it.

**The deploy path.** Railway builds the `Amora Game` service itself from
`Rieki777/village-os` branch `main` using the repo-root Dockerfile, auto
triggered by the push. It does NOT pull the GHCR image; that image is how other
villages self-host. There is no human step. The live build marker is at
`/health` (NOT `/api/health`, which is module-gated off).

**`0126` applied.** Verified on production after the deploy:
`token_ledger.amount` is `bigint`, `token_balances.balance` is `bigint`,
113 migrations applied, newest `0126`, ledger still 0 entries.

## The one open economic decision

Rye ruled decimals should be **4 across the board**. That ruling is right and
the ledger being empty makes now the cheapest moment there will ever be. It is
**not a migration**, and this is the single most important thing to carry
forward:

`postTransfer` (`server/lib/ledger.ts:368`) takes MINOR units, correctly. Of its
44 callers, 5 convert with `toLedgerUnits` and 39 hand it a human number. Those
39 are not wrong today only because six of seven tokens sit at `decimals = 0`,
where a human number and a minor unit are the same number.

- `give()` at `server/lib/economy.ts:916` posts `amount` straight through. Set
  Gratitude to 4 without touching that line and every give posts `0.0020`.
- Converting inside `postTransfer` is ALSO wrong: `sweepBalances` in
  `server/lib/exit.ts` reads `balancesFor(...)`, already minor units, and posts
  them unchanged. A departing member's settlement would be multiplied by 10,000.

So the work is a per-caller sweep with a test per path. Full reasoning is in
`docs/ECONOMICS.md` section 6.

Second open item recorded there: 62 `void recordEvent` calls post the audit
trail without awaiting it, so a member who acts and immediately opens the audit
feed can miss their own action. Fine as best effort, wrong if the feed is a
control.

## Traps this session paid for

1. **The Railway CLI answers confidently about the wrong project.** Three times
   today. The `hotfix` worktree was linked to `ReGen Civics / MySQL`; `wt-dec`
   had no link at all and `railway run` silently connected to the ReGen Civics
   database, where `token_ledger` does not exist. Run bare `railway status`
   first, every time, and confirm `Project: Amora Game`. A worktree inherits no
   link.
2. **Exit codes after a pipe are the pipe's.** `cmd | tail` then `$?` reports
   `tail`. Always `cmd > /tmp/x.txt 2>&1; echo "RC=$?"`.
3. **A missing `.env` skips 1,151 tests and exits 0.** Copy `.env` into every
   new worktree.
4. **`git show <rev>:<path>` stats its argument first**, so from a deep worktree
   it dies with `Filename too long`. `check-migration-compat` was folding that
   failure into "96 shipped migrations were edited". Fixed in `f639774`; an
   unreadable base is now its own failure. Keep working copies near the drive
   root on Windows.
5. **A test proves a behaviour is intended, never that it is correct.** A test
   named "pays a confirmed quest in voice and credits" asserted on four columns
   of `mint_rules` and never read a balance. It stayed green through a bug that
   cost every village its first payout.
6. **Never brief agents to `git checkout -b` in a directory you are working in.**
   I did, and a lane checked out its branch under me. Give each lane its own
   worktree.

## What to do first, next session

1. Run the gates on each of the four lane branches before believing anything on
   them. `git checkout <branch>`, then the sweep enumerated from
   `.github/workflows/` plus `pnpm check` and `node scripts/run-self-tests.mjs`.
2. Re-grade each dimension honestly against what those branches actually
   deliver, and merge only what holds up.
3. Decide whether to spend a focused pass on the 39-caller decimals sweep.
4. Check `db-backup`: the ledger records it failing since 2026-08-30 with an
   access-denied error, but it reported **success** on `6f6a55e` today. The
   operability lane was briefed with the stale claim and told to verify.
