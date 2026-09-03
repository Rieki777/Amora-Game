# The economics session

You own the village economy: what is true about it, what keeps that true, and
proving it works before a real person is the one who finds out.

Four deliverables, in this order. The order is load-bearing and the reasons are
given where each is described.

1. **`docs/ECONOMICS.md` becomes the single source of truth**, describing what
   the code actually does rather than what it intends.
2. **A pipeline that keeps it accurate**, so it cannot silently drift the way
   every other document in this repo has.
3. **The dry run**: a feature any village can run during setup to see its economy
   work, and afterwards to model a proposed change before voting on it. This is
   the largest piece and it is a product feature, not a test.
4. **The decimals sweep**, last, with the dry run as the safety net.

---

## Read these first, in this order

1. `docs/ECONOMICS.md`, the current state of the truth. It is yours to replace.
2. `docs/TOKENS.md`, GENERATED from the code and guarded, so it cannot drift.
   Read `scripts/generate-token-doc.mjs` and `scripts/check-token-doc.mjs`
   alongside it: that pair is the pattern deliverable 2 should follow.
3. `PLAN_TO_A.md`, where Economy sits among eleven graded dimensions, and what
   blocks it. Claim the Economy row.
4. `server/lib/economy.ts`, `server/lib/ledger.ts`, `server/lib/spending.ts`,
   `server/lib/exit.ts`, `server/lib/voiceClaim.ts`.
5. `SESSION_HANDOFF.md` for the environment traps.

---

## What is true today, measured

Read from the live Amora database on 2026-09-03. Re-measure before you rely on
any of it; these are timestamped facts, not standing ones.

| | |
|---|---|
| `token_ledger` | **0 entries** |
| `token_balances` | **0 rows** |
| `gratitude_log` | **0 rows** |
| `users` | 5, three of them examples |
| `quest_claims` | 1, never confirmed |
| foreign keys in the whole schema | **0**, across 153 tables |
| migrations applied | 114, at boot, with no approval gate |

**Nothing in this economy has ever run for a real person.** That is the single
most important fact you have. It means every mistake is still free, and it means
no part of this may be described as proven in production.

Seven real tokens. `village-voice` has `decimals = 3`; every other token is `0`.
Five faucets: `sys:gratitude-pool`, `sys:cycle-pool`, `sys:voice-mint`,
`sys:mint`, `sys:library-mint`. A faucet's negative balance IS the issued supply.

---

## What has been proven, and what is broken

An audit drove real value through a scratch database and through the built
production server. Both halves matter and you should not re-derive either.

**Proven.** Conservation never broke: not through a gratitude give, a confirmed
quest, a settlement, a sink spend, an exit sweep, a hand mint, a deliberate
nine-quadrillion posting, or three kinds of race. Idempotency is real: the same
claim confirmed four times at once paid exactly once, and five settlement runs on
one cycle wrote exactly eight rows per token. The allowance cannot be overspent
by a member racing themselves: sixty simultaneous gives of 5 against an allowance
of 100 spent exactly 100, three runs running. **That keystone is genuinely well
built. Do not rewrite it.**

**Broken.** All of it in `docs/ECONOMICS.md` section 10 with measurements. Two
are being fixed as this is written, on `wt/fix-gratdead` and `wt/fix-decimals`;
check whether they landed before touching them:

- **Two members thanking at the same moment deadlock.** At twelve concurrent
  givers, ten fail. `writeGratitudeRow` ran at SERIALIZABLE, whose gap locks
  cover a range every giver shares.
- **A member can be charged for a credit that was never delivered.** `give()`
  spends the allowance, then posts the credit outside the lock. 20 to 30 of every
  100 charged units vanished, and `checkLedgerInvariants` cannot see it because
  nothing was created at all.
- **The wallet renders Village Voice 1000x too large.** `fromLedgerUnits` has one
  non-test caller.
- **`reverse()` takes its amount from the caller.** A 25-credit posting was
  reversed into a 1,000,000-credit payment with every invariant green. Still open.
- **`postTransfer` has no deadlock retry** while `postTransferPair` does. Still open.
- **`mint_rules.amount` is `decimal(18,4)` and its tokens are `decimals 0`**, so a
  founder can save a rule for an amount the registry rounds away. Still open.

---

## Deliverable 1: the document

`docs/ECONOMICS.md` exists and is a decent start. Make it the thing a founder, a
contributor and an agent can all rely on.

The bar: **anything in it that is not true is worse than nothing**, because
somebody will act on it. Two rules that produced the current version and should
survive into yours:

- Where the code and the intention differ, say so. Do not describe the intention.
- Where a claim is proven, say what proved it. Where it is not, say that too.
  "Proven by its tests" and "proven" are different words in this file.

What it still lacks:
- The spend side. `server/lib/spending.ts`, the sinks, what a member can actually
  buy, and what refuses them. Currently a sentence.
- The exit path. What a departing member's balance does, who decides, and what
  the village owes. This is the single most litigated question in real intentional
  communities and it is two lines here.
- Worked examples with real numbers. A member joins, completes a quest, gives
  gratitude, holds a seat through a settlement, spends, leaves. Every posting,
  named, with the row it writes. That is the section a founder will actually read.
- The failure modes as a member experiences them, not as the code raises them.

---

## Deliverable 2: the pipeline that keeps it true

Every document in this repository has drifted, including this one within a day of
being written. The generated ones did not. Copy that.

`docs/TOKENS.md` is generated by `scripts/generate-token-doc.mjs` from the code
and enforced by `scripts/check-token-doc.mjs`, which fails CI when the file and
the code disagree and prints both sides. That guard has caught real drift twice.

`docs/ECONOMICS.md` cannot be fully generated, because most of it is judgement.
So split it:

- **The facts are generated.** The token table, the faucets, the mint rules, the
  decimals, the sinks, the conservation invariant, the trigger table. These come
  out of the code and the schema, into marked regions of the file, and a guard
  refuses a mismatch exactly as the token doc guard does.
- **The narrative is guarded differently.** A check that fails when any file in
  the economy's own surface changes without `docs/ECONOMICS.md` being touched in
  the same change. Crude, and right: it cannot know whether the prose is correct,
  but it can refuse to let somebody change how money moves and say nothing.

Name the economy surface explicitly in the guard so the list is reviewable:
`server/lib/economy.ts`, `ledger.ts`, `spending.ts`, `exit.ts`, `voiceClaim.ts`,
the token registry migrations, and the mint-rule routes.

**Give the guard its own self-test**, in the shape of
`scripts/check-identity-keys.test.mjs` or `scripts/check-migration-compat.test.mjs`,
both of which build real fixtures and assert real exit codes. An unrun guard is a
comment; a guard with no self-test is a comment that looks like a guard. This repo
has both mistakes on record, and note that the token doc guard itself does NOT
have a self-test today, which is worth fixing while you are in there.

---

## Deliverable 3: the dry run

**This is a product feature, not a test harness, and it is the largest piece.**

Rye's words: it is *"part of the setup process for any game to also run a
governance and economics dry run to see how it's all working"*, it *"should also
stay available to model changes and how they would affect a game when players are
proposing to change anything"*, and it *"should be able to catch and flag
potential issues during the test phase so we don't have to catch them live."*

So it has three lives:

1. **At setup.** A founder who has never run an economy sets their rules and
   presses something that says: here is what a season looks like. They see the
   numbers before thirteen people are depending on them.
2. **Attached to a proposal.** When a player proposes changing a mint rule, an
   allowance, a threshold or a weight mode, the proposal can carry a preview of
   what that change does. This is how a village votes on an economy rather than
   on a number.
3. **As the regression harness**, run in CI over a complete cycle so the things
   found this session cannot come back.

### The cardinal rule

**A simulation must never write to the real ledger.** Not one row. Design that in
from the first line, and make it structurally impossible rather than carefully
avoided: a separate schema, or a projection that never touches `postTransfer`'s
real connection. The whole feature is worthless if a founder pressing "what if"
can move real money, and it will be pressed by people who do not know what a
ledger is.

### What it simulates

It reads a village's ACTUAL configuration, not a fixture: its tokens and their
decimals, its `mint_rules`, its `game_variables`, its module state, its member
count and seats. Then it runs N cycles of plausible activity and reports.

Inputs a founder can move: how many members, how active they are, quests
completed per cycle, how much gratitude is given, how many seats are held, how
much is spent at sinks, how many claims are made.

### What it must flag, and this is where the value is

Every one of these is a real failure mode this codebase has or could have:

- **A rule that can never pay.** The engine already computes `unpayable` for
  exactly this: a `from_source` rule on a token the work posts no amount in, a
  faucet that does not exist, an amount below the token's own resolution. Surface
  it in words a founder understands rather than in a log line.
- **An amount that rounds away.** `mint_rules.amount` carries four decimal places
  and most tokens carry none, so 0.4 credits saves cleanly and pays nothing.
- **A pool that exhausts.** Gratitude allowance times members times cycles
  against the pool. Say which cycle it runs dry in.
- **Concentration.** What percentage of total voice one holder ends up with after
  N cycles. Rye has ruled that founders may self-grant voice and that the
  protection is transparency, so this number IS the protection. It belongs on
  screen before a vote, not in a report nobody opens.
- **Conservation.** Every token summing to zero across all accounts including
  faucets, asserted at every step, so a simulated economy that breaks the
  invariant is caught here rather than in production.
- **Negative balances that are not faucets**, and any ceiling that is never
  reached or always hit, which usually means it was set without thinking.
- **Concurrency.** Simulate several members acting in the same instant. That is
  what found the deadlock, and it is the class of defect a serial test cannot see.

### Output

A report a founder can act on, in plain language, saying what would happen and
what looks wrong. Not a table of raw postings. The audience is somebody standing
up their first village, and the whole point is that they learn something before
it costs them.

---

## Deliverable 4: the decimals sweep, last

Rye has ruled that **all tokens move to 4 decimals**. The ledger is empty, which
makes now the cheapest this will ever be. It is not a migration.

`postTransfer` takes MINOR units, correctly, and of its 44 callers **5 convert
and 39 hand it a human number**. Those 39 are not wrong today only because six of
seven tokens sit at `decimals = 0`, where the two are the same number. `give()`
posts `amount` straight through; set Gratitude to 4 without touching that line
and every give posts **0.0020**.

The obvious repair is also wrong. Converting inside `postTransfer` breaks
`sweepBalances`, which reads balances that are ALREADY minor units and posts them
unchanged, so a departing member's settlement is multiplied by ten thousand.

**The units question has to be answered per caller, with a test per path.** Do
this after deliverable 3, so the dry run is the net underneath it. And confirm
the wallet decimals fix has landed first: today one token is wrong by 1000x on
the wallet; after this sweep every token is wrong by 10,000x on any surface that
does not divide.

---

## How this codebase lies to you, and how to not be fooled

This session cost four separate discoveries of the same shape. Read them; they
are the difference between a green run and a true one.

- **A test proves a behaviour is INTENDED, never that it is correct.** A test
  named "pays a confirmed quest in voice and credits" asserted on four columns of
  `mint_rules` and never read a balance. It was green through a bug that cost
  every village its first payout. When you write a test, make it read the
  OUTCOME, and prove it fails when you remove the fix.
- **The first-payout bug is the cautionary tale for this whole area.**
  `economyEpoch` both read the epoch and created it, and its only caller was the
  mint. So the first confirmed quest in a village's life stamped the epoch and
  was then ruled out by it, losing by twenty milliseconds. 3,671 tests were green
  through it. A function that both establishes a boundary and judges against it
  will always let the first case through.
- **An empty state and a real zero are different facts**, and code guarding on
  falsiness cannot tell them apart.
- **A check that reports the same thing when it did not run as when it passed is
  worthless.** Two guards in this repo did exactly that.
- **Never exercised is not working.** It is the rule the third grading used, and
  it is why Economy fell from A to B-.

---

## Working here

- **Your own worktree, at a SHORT path.** From
  `C:/Users/taren/Desktop/Amora/hotfix`:
  `git worktree add -b wt/econ C:/Users/taren/Desktop/Amora/ECON main`, then copy
  `.env` into it and `pnpm install`. A deep path breaks `git show <rev>:<path>` on
  Windows and the migration guard then reports nonsense.
- **Copy `.env` or your green means nothing.** Without it about a third of the
  suite skips. An unfiltered run with no database now exits 1 and says so.
- **Exit codes after a pipe are the pipe's.** `cmd > /tmp/out.txt 2>&1; echo "RC=$?"`.
- **`main` is production.** A push auto-builds on Railway and applies migrations
  at boot. Commit on your branch; hand it to the coordinator to land.
- **Stage by name, never `git add -A`.** Other sessions share this tree.
- **Gates**: enumerate from the workflows DIRECTORY, never from memory:
  `grep -hoE "node scripts/check-[a-z0-9-]+\.mjs" .github/workflows/*.yml | sort -u`
- **Migrations are immutable once shipped** and apply at boot with no gate. A
  deploy is a schema change.

---

## Questions for Rye, when you reach them

1. **What does a departing member get?** The exit sweep moves their balance to a
   settlement account. Whether they are owed anything, in what, and who decides,
   is a governance and possibly a legal question, and it is the one that most
   often breaks real communities.
2. **Should the dry run be able to run against the LIVE village's real numbers**,
   or always against a copy? Real numbers are more useful and closer to the thing
   that must never write.
3. **When a proposal carries a dry run, is that preview binding on the proposal?**
   If the numbers change between proposing and executing, does the village vote
   on what it saw?
4. **Unspent gratitude expires at cycle close, by ruling.** Should the dry run
   show a village what it is losing that way, and is that a number you want
   visible?

---

## What to do first

1. Re-measure the production figures at the top of this file. They have a
   timestamp and you should not trust them.
2. Check whether `wt/fix-gratdead` and `wt/fix-decimals` have landed. Do not
   duplicate them; build on them.
3. Write the smallest honest version of the dry run: one cycle, one member, one
   quest, conservation asserted at every step. Get that true before you make it
   broad. The value of this feature is entirely in whether its answers can be
   trusted, and a broad simulator that is subtly wrong is worse than no simulator,
   because a founder will believe it.
