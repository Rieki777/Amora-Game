# Session handoff, 2026-09-03

Everything below is verified, not remembered. Re-verify anything older than an
hour. Written because the session was about to hit its limit.

## Where the work is

`main` is at `e2d1cbd` and **is production**: a push to main auto-builds on
Railway within seconds and applies migrations at boot. Verified live.

**ALL FOUR LANE BRANCHES ARE MERGED** and live, as of `afb2ac2`. CI green, the
deploy is serving it, `/health` reports `database ok`. The branches below are
history now; nothing is waiting.

| Branch | Fate |
|---|---|
| `wt/g-architecture` | merged (also carried forkability and operability by content) |
| `wt/g-forkability` | contained in the above |
| `wt/g-operability` | contained in the above |
| `wt/g-upgrade` | merged |
| `wt/g-client` | never produced a commit; the Client dimension is untouched |

What that landed: 2,614 lines out of `server/index.ts` into five route modules
(31,082 -> 28,562 physical lines, 485 -> 414 registrations in that file), 25
previously undocumented environment variables in `.env.example` plus a new
`scripts/fork-env-audit.mjs` guard, a 519-line `docs/RUNBOOK.md` and a
much-expanded `db-backup.yml`, and `docs/UPGRADING.md` / `docs/RELEASING.md` /
`CHANGELOG.md` for the release path.

VERIFIED BEFORE MERGE by four audits plus three adversarial angles. The
extraction is behaviour-preserving and that was proved mechanically: 568
method/path pairs byte-identical, the flattened registration order (619 entries)
diffing to zero, and each moved handler body differing from its original only by
the `deps` destructuring. One agent patched `express.application` before
`dist/index.js` built its app and dumped live registration order to confirm the
static model, then booted a real server and checked that literal routes are not
swallowed by neighbouring `:id` routes.

STILL OPEN, neither blocking:
- **64 dead imports** left in `server/index.ts` by the extraction. No behaviour
  change; the ratchet could come down further. Deserves its own pass.
- **`db-backup` goes red on its next scheduled run**, and truthfully: the
  uploads volume has no backup and `BACKUP_EXPORT_ORIGIN` /
  `BACKUP_EXPORT_TOKEN` do not exist. `openssl rand -hex 32` gives the token;
  set it on the Railway app service and as a GitHub secret, set ORIGIN to
  `https://amora.regencivics.earth`. Or make the jobs warn instead of fail.
- (CLOSED) Both suggested-task lanes merged in `458b2eb`, each verified by a
  second independent agent that re-ran the controls rather than reading the diff.
  `pnpm test` with no database now exits 1 and names the 1,190 tests across 91
  files that did not run; `ALLOW_NO_TEST_DB=1` buys the smaller suite back and
  prints a receipt saying the run proves nothing about the ledger, the economy or
  any route; CI outranks that waiver. And the signup error banner now announces
  to screen readers, confirmed from Chrome's accessibility tree rather than the
  source, along with a sweep of the other refusal surfaces.

  Both of testDb.ts's claims to be loud were false and are corrected in place.
  `:11` was aspirational. `:92` was literally true of `provisionTestDb` and
  meaningless, because every caller sits inside `describe.skipIf(...)` so the
  throw was unreachable: a dead branch that read as a guarantee.

RESOLVED, recorded so nobody re-opens it: the backup reporting 89 users before
2026-08-31T14:39 and 5 after was a CORRECTION, not data loss. The pre-repoint
database had no `token_ledger` table; Amora demonstrably does. The old
`PROD_DATABASE_URL` was dumping a different database entirely.

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
