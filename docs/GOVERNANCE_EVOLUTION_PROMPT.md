# Governance evolution: the prompt for the session that builds it

Written 2026-08-31 by the session that did the token foundations work, for a fresh session that
will build the next piece. Read it end to end before you touch anything. Everything below was
measured against the repository on that date, not remembered, and the places where it is a
timestamped hypothesis rather than a fact say so.

---

## What the founder asked for, in his words

> "after the Game launches the admin screen becomes public to all players and they can go through
> and make a suite of edits which then collectively become one proposal and if it passes it goes
> into production"

And separately, in the same conversation:

> "Any player can access all the admin pages once the Game starts, and making any changes require a
> vote from the players so any player can see and engage with the 'admin-mint' but will require a
> successful vote to pass."

Those are one feature described twice. A player opens a screen that used to be admin-only, makes a
set of changes, and those changes become a single proposal the village decides on together.

---

## THE MOST IMPORTANT THING TO KNOW FIRST

**Most of the governance engine already exists, and it is good.** Three lanes built it
(`wt/r5-gov`, `wt/r5-gov-engine`, `wt/r5-gov2`), and all three are merged into `main`. Do not
design a voting system. Read the one that is there and extend it.

Start with these files, in this order:

| File | Why |
|---|---|
| `drizzle/0089_governance_engine.sql` | Seven tables. Its header explains the whole design. |
| `server/lib/ballots.ts` | The ballot lifecycle, and the rules in its docblock. |
| `server/index.ts` around **25983** | The close dispatcher. Read the whole comment. |
| `server/lib/proposalDrafts.ts` | Server-held drafts, and why a draft is not a proposal. |
| `drizzle/0091_proposal_drafts.sql`, `0043_mechanics_proposals.sql`, `0095_governance_prune.sql` | The rest of the schema story. |

### Four properties of the existing engine you must preserve

1. **A ballot freezes its thresholds, electorate and weights AT OPEN.** The snapshot columns are
   the whole point: changing village settings can never rewrite a live or historical vote. Your
   changeset ballots must freeze the same way, or a village could change the rules of a vote while
   it is running.

2. **CLOSING IS A HUMAN ACT. Nothing auto-executes at expiry.** From `ballots.ts`. Do not add a
   timer that applies a passed proposal. Somebody closes it, and the close is what executes.

3. **A subject type absent from the close dispatcher executes NOTHING.** Quoting the code:

   > "A subject type that is NOT a key here conducts a real decision and executes nothing. That is
   > the property that lets a village hold an advisory vote on the real engine, with the real
   > frozen roll and the real weights, and read the real answer without the answer doing anything.
   > Absence is also the fail-safe direction, so a subject type added by a later lane cannot
   > execute something by accident."

   **This is your single biggest gift.** You can ship the changeset subject type, the staging UI
   and real voting on it BEFORE the executor exists, and nothing can apply by accident. Use that.
   Ship the decision first, the execution second, and you get to watch real villages vote on real
   changesets before a line of code applies one.

4. **A DRAFT IS NOT A PROPOSAL.** It has no supports, no ballot, no standing, and no reader but
   its author, and it is scoped by `user_id` in the SQL itself rather than by a check a caller
   could forget. Your staging area is a draft until it is submitted. Keep that boundary exactly
   where `proposalDrafts.ts` puts it.

### The six subject types that exist today

`mechanics`, `role_application`, `agreement`, `badge_grant`, `quest_payout`, `power_transfer`.

Only `mechanics` has an executor (`applyMechanicsProposal`, `server/index.ts:25514`). Read it
before you write yours: it is the worked example of "a passed proposal changes the world", and it
already handles the messages a proposer receives.

---

## What is actually missing

1. **A `changeset` subject type.** Many admin edits collected into one proposal.
2. **Its executor.** Apply a batch of settings changes when the ballot closes passed.
3. **Permission inversion.** Admin screens readable by every player once the game has launched.
4. **The staging UI.** Edits accumulate somewhere visible, then submit as one proposal.

---

## The four hard questions nobody has answered yet

These are the design, and getting them right matters more than shipping fast.

### 1. What happens when the world moves under a pending changeset?

A player stages "set the cycle pool to 1200". Three days pass, the vote succeeds, and meanwhile
somebody else's passed proposal set it to 900. Does the changeset apply blindly, refuse, or ask?

The store layer had exactly this bug at a lower level and the fix is worth copying: migration
`0122` stamps rows with a version at read, compares under `SELECT ... FOR UPDATE` at write, and
**rebases rather than refusing** where rebasing is honest. Read `server/repos/store-db.ts` and the
migration header before designing this. Note that a stale write there was silently winning, and
both requests answered 200.

### 2. What does a player see when they open an admin screen they cannot act on directly?

Every control becomes "propose this change" rather than "save". That is a large surface. Does the
screen look the same with a different button, or does it look different? A control that looks like
it saves and instead queues a proposal is the save-honesty defect this codebase has a dedicated
guard for (`scripts/check-save-honesty.mjs`). **Read that guard before designing the UI.**

### 3. What can NEVER be changed by a changeset?

Some settings must not be votable, or a village can vote itself into a state it cannot leave.
Candidates worth arguing about, at least: the governance mode itself (the founder has ruled that
switching between one-person-one-vote and token-weighted must not be reversible), the vote
thresholds for changing thresholds, anything that would retroactively alter a closed ballot, and
anything touching a secret or a credential.

**Two constitutional exploits have already been found and closed in this codebase**: a founder
passing a launch vote alone, and a governance token being sold for cards. Find how those were
closed before you widen what a vote can reach. Whoever built the current engine already thought
about this; do not undo it by accident.

### 4. When does "the Game starts" actually happen, and what reads it?

Permission inversion hangs off it. Find the existing launch state rather than inventing one, and
check what already depends on it. `server/index.ts:14026` has a launch-readiness check that reads
the village name and reports success in a message naming the village, which was flagged as
misleading. Read it.

---

## Founder rulings from 2026-08-31 that constrain this work

Recorded in `SEASON2_FLEET_LEDGER.md`. The ones that touch governance:

- **Voice is optional**, for villages that choose not to run one-person-one-vote. The founder sets
  the initial allocation, and **it is the only token that may be issued before the game starts**.
- **That initial allocation is a ledger entry and appears in history as a proposal every player can
  see**, even though it predates launch. His words: *"it'll still show up as a proposal in the
  history and showing what happened for all players to see."*
- **Governance mode cannot be switched back and forth** between one-person-one-vote and
  token-weighted.
- **A module can only be switched on or off by a player vote** once the game has started and
  players hold tokens. Switching one off makes its balances **go dark**, and the rows survive so
  the village can resume. Nothing is destroyed.
- **Negative balances are allowed**, floored by a setting that defaults to zero.

---

## Traps this codebase has already paid for

Every one of these cost real time in the last week. They are not hypotheticals.

**Express 4 async handlers HANG on a throw.** A rejected handler promise is an unhandled rejection,
not a 500: `installCrashHandlers` reports it and the process survives, and the member's request
gets no answer at all. There is a filed request for a wrapper that forwards rejections to the error
middleware. If your executor can throw, read this first.

**The silent-zero class.** A check that reports the same value when it did not run as when it
passed. It has appeared in this repo as: a guard reading one file path after code moved out of it
and still exiting 0; a suite skipping 1,151 tests and exiting 0; a build marker reading "dev"
whether the stamp worked or the git context was absent. **Any status your governance code reports
must distinguish "nothing to do" from "could not tell".**

**An empty state and a real zero are different facts, and code guarding on falsiness cannot tell
them apart.** A 0% agreement reading was drawn as an absence because the mark function returned
"none" for any falsy value. In a voting system this class of bug is severe.

**A slug is history's identity.** Every ledger repeat-protection key carries the token slug, never
the display name. If your changeset can rename anything, check whether the thing renamed is used as
a durable key. **A rename can mint**: seat payments once keyed on a value being renamed, where the
rename would have re-paid every already-paid seat.

**Two copies of one rule disagree eventually.** The close dispatcher's own comment says it, and it
is the reason that logic lives in one place. Do not add a second opinion about whether a vote
binds.

---

## How to work in this repository

- **Your own worktree, always**: `git worktree add ../<name> -b <branch> main`. A lane checking out
  in a shared directory has cost this programme twice.
- **Copy `.env` into your worktree before running tests.** Without `TEST_DATABASE_URL` the 74
  database-backed files skip and the suite still exits 0. That produced a false green twice in one
  session, once with 1,151 tests silently not run.
- **Build before you test.** The e2e suites boot `dist/index.js` and throw only if it is missing,
  never if it is stale.
- **Capture exit codes with no pipe.** Reading the status after a pipe gives you the last command
  in the pipe. This produced a false green on a genuinely red tree four times in one day.
- **`server/index.ts` carries a ratchet** on both line count and route count, enforced in CI. New
  routes go in `server/routes/<domain>.ts` with a `register(app, deps)` and a `Pick<AppDeps, ...>`.
  Read `docs/ARCHITECTURE.md` and any module in `server/routes/` as the worked example. Route
  module imports and their register calls are exempt from the line count on purpose.
- **Migrations**: claim the next free number by checking remote refs, local branches, untracked
  files and `git worktree list`. Run the migration, never only review it. A rename migration here
  once collapsed two rows because MySQL `LPAD` truncates as well as pads.
- **Writing rules** apply to comments, commit messages and any user-facing copy: no em-dashes, no
  "not X but Y" contrast framing, no rhetorical openers. `scripts/check-voice.mjs` enforces some of
  it.

---

## What to do first

1. Read the five files in the table above. Do not design anything until you have.
2. Write down, in your own words, what the existing engine does and where a changeset would attach.
   If that description is wrong, everything after it is wrong.
3. Answer the four hard questions, with the founder where they are his to answer.
4. **Ship the subject type and the staging UI before the executor.** The dispatcher's fail-safe
   absence makes that safe, and it means real villages can vote on real changesets while the
   execution path is still being got right.

The last point is the one to argue for if there is pressure to do it all at once. A voting system
that decides correctly and executes nothing is a system you can watch. A voting system that
executes on day one is one you find out about afterwards.
