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

## THE DELIVERABLE: the sole source of truth for how village governance works

The founder, naming it:

> "Creat so that session will create the sole source of truth for governance of our villages and
> how it works."

And the principle that decides what kind of document that is:

> "these sources of truth will be derived from the live code base and what's true rather than what
> we want to be and we can continue to improve them from there"

Read that twice. It is the whole specification for the document, and it rules out the thing most
people would build.

**Derived, not written.** A hand-written governance document is wrong within a month, and it is
wrong in the most expensive direction: it describes the system somebody intended. Generate it from
the schema, the subject-type list, the close dispatcher's routing table, the threshold defaults and
the actual gates. Then add a check that FAILS when the document and the code disagree, so the
document cannot quietly drift into fiction. That check is what makes it a source of truth rather
than a nicely formatted opinion.

The token and economics document is its sibling and is being built in parallel by another session.
If `docs/TOKENS.md` and `scripts/check-token-doc.mjs` exist when you start, **read them first and
follow their shape** rather than inventing a second convention. If they do not exist yet, build
yours to be the one the next document copies, and say in it which parts are generated and which
are prose.

**It must describe what is TRUE, including what is broken.** A source of truth that documents only
the happy path is not one. If a subject type has no executor, the document says so. If a threshold
default is unreachable from any screen, the document says so. If a rule exists in two places that
could disagree, the document names both. This codebase has spent a week finding checks that
reported green while the thing they named was broken, and a document is a check like any other.

Structure it so a machine can parse the per-subject facts and a founder who has never read the code
can follow the prose. Both audiences, one file, and say which parts are which.

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

## STEWARDS, AUTO-EXECUTE, AND A CONFLICT WITH R90 THAT NEEDS SETTLING FIRST

On 2026-08-31 the founder described a graduated trust model, and it is the shape of the whole
feature:

> "having it default that the steward (by default the founder(s) are granted a steward role after
> Game launch) needs to approve a proposal to change the game before it actually goes through is a
> great addition, but also there's another stage of maturity where the founder gives up this power
> and then auto-execute takes over. Stewards have the power to approve anything in the Game that
> needs approval - they're the 'training wheels' for the Game until it matures enough that they can
> give more and more power to the Game to auto-execute decisions."

**This fits the existing engine almost exactly**, which is the good news. "CLOSING IS A HUMAN ACT.
Nothing auto-executes at expiry" is already the training-wheels state, and the close dispatcher's
fail-safe absence is already the mechanism: a subject type not in the routing table decides and
executes nothing. Adding a per-subject "does this auto-execute" flag, defaulting to off, gives you
the gradient he describes without inventing a second decision path. **Build it as a gradient, not a
switch.** His words are "more and more power", and a village may reasonably auto-execute quest
payouts while still wanting a steward on mechanics changes.

### THE CONFLICT. Do not build until the founder settles this.

His instruction today says founders are granted a steward role **by default** after launch. A
recorded ruling of his own, **R90**, says the opposite, and the code implements R90 today. From
`server/lib/gameStart.ts:160`, quoting him:

> "The founder role disappears once the game starts and a minimum of 3 people vote the game to
> start. After that they can optionally vote in a steward role and give various powers to this
> steward to immediately act."

The difference is where power comes from at launch:

| | R90, implemented today | The 2026-08-31 instruction |
|---|---|---|
| Steward exists at launch | only if the village votes one in | yes, automatically |
| Founder after launch | an administrator and nothing more | holds steward approval by default |
| Power flows from | the village granting it | founding, then relinquished |

Both are coherent villages. They are not the same village, and thirteen of them are about to be
built on whichever one you implement. **Ask him which, quoting both, before writing any code.**

Read the whole of `server/lib/gameStart.ts` before you do. R90 is implemented carefully and its
comments explain what deliberately does NOT end at launch: the admin panel survives because "a
village may choose never to vote in a steward and must still work completely", and eighteen
branches read `role === "admin" || role === "founder"` meaning only "is this person an
administrator". Ending those at launch would leave a village unable to administer itself with no
way back. Whatever is decided must keep that property.

Note also that R90 already anticipated the gradient: "give various powers to this steward **to
immediately act**" is the same axis as auto-execute.

### Three questions his model raises that nobody has answered

1. **What happens when a proposal PASSES and the steward refuses to approve it?** That is a veto,
   and an unbounded silent veto makes "the village decided" false. At minimum the refusal should be
   recorded, visible, and carry a reason, the same way weight changes already do. Whether it can be
   overridden, and by what, is his call.

2. **Is giving up the power reversible?** If a founder can take the training wheels back on, they
   never came off. The strongest shape, and the one that matches his ruling that governance mode
   cannot switch back and forth: **the founder can relinquish unilaterally, and only a village vote
   can grant it back.** That keeps the giving-up real while leaving the village a remedy if
   auto-execute goes wrong. Propose it; do not assume it.

3. **What does auto-execute mean for a changeset specifically?** A mechanics change applies to one
   variable. A changeset is a batch, and a batch can half-apply. If auto-execute is on and item
   four of seven fails, what happened? Answer this before auto-execute reaches changesets, and note
   that the store layer's version-guard pattern (migration `0122`) exists because a half-applied
   write already bit this codebase once.

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

## Everything the 2026-08-31 session learned that touches governance

All measured that day. Where a claim is a reading rather than a measurement it says so.

### THE FOUNDER HAS RULED ON EXPLOIT 1. Read this before the account below it.

On 2026-08-31, after reading the account that follows, the founder overruled its framing:

> "The first exploit isn't a concern because proposals should also say how many people voted on
> it! We can have a settings where it would be public who's voting or secret (defaulted to
> secret)."

> "Founders can self-grant themselves voice. Their ability to do this is fine, our protection is in
> the transparency of it, showing what % of total voice every player is holding."

**The design principle is transparency over prohibition.** A founder concentrating voice in
themselves is a legitimate act of founding a village. What must not happen is anyone being unable
to SEE that it happened. That is a different system from the one the earlier fix reached for, and
it is his call.

**What that means concretely, and it is less demolition than it sounds:**

1. **Nothing needs removing from the weights route.** `server/routes/governanceWeights.ts` already
   permits a founder to allocate weight to themselves. Line 151's `actorId === target.id` check
   only skips the NOTIFICATION (there is no point telling you what you just did), and the change
   itself proceeds. There is already an append-only audit trail. Verified by reading, not assumed.
2. **The `self_grant_refused` at `server/index.ts:19343` is a DIFFERENT route and should stay.**
   That is the admin mint, which creates token SUPPLY out of `sys:mint`. Allocating weight among
   existing holders and minting new supply into your own account are different acts, and his ruling
   is about the first. Do not conflate them. If you think it should also change, ask him rather
   than assuming the ruling reaches it.
3. **Three things to BUILD**, which is where the work actually is:
   - A proposal shows **how many people voted**, not only the weighted result.
   - A setting for whether **voter identity is public or secret**, defaulting to secret.
   - A display of **what percentage of total voice every player holds**, visible to players.

**One nuance to get right, because counts alone do not close it.** The harm in exploit 1 was not
only that the concentration was invisible. It was that the frozen document ASSERTED *"100%
participation and 100% agreement"* and *"3 people hold a voice today"*. Both sentences were true of
the weights and false of the village, and a participation count printed somewhere else on the page
does not unsay them. **So the rule is that any generated sentence about a vote states people AND
weight together, never one alone.** "1 of 3 people voted, holding 100% of the weight" is honest.
"100% participation" is not, whatever appears beside it.

Secret ballots interact with this: with voter identity hidden by default, the weight-share display
is doing most of the transparency work. That is a reason to make it prominent rather than a reason
to change the default.

### The two constitutional exploits, and the one that is still open

Both were reproduced end to end over HTTP against the built server BEFORE any fix, then refused
afterwards with the exploit conditions unchanged. Read `SEASON2_FLEET_LEDGER.md` section 7j for the
full account. **Read it before you widen what a vote can reach**, because widening is exactly what
a changeset does.

**Exploit 1, a founder carrying the launch vote alone.** OVERRULED, see the section above. Kept
here because the mechanics are still worth understanding and because the launch route's refusal
may now be too strict. The founder set `weight_mode=custom`,
allocated weight 1 to themselves and nothing to the other two members. The launch route reported
`onTheRoll: 3, tooFew: null`. The ballot opened with `unity_pct=100, quorum_pct=100,
electorate_count=3, total_weight=1`, and one yes closed it as passed. The frozen document then told
the village *"100% participation and 100% agreement"* and *"3 people hold a voice today"*. Both
sentences were true of the weights and false of the village.

**Exploit 2, the governance token bought with a card.** A voice-kind token was listed purchasable,
priced, and stocked with 100 minted out of `sys:mint`. A member's buy reached the LAST gate before
completing, meaning kind, governance, seller, price, stock and stage had all passed. The founder
could then point `governance.weight_token` at it.

**A third hole nobody had named:** equity was refused only via `governance === 'hypha'`, which held
by ACCIDENT of the seed data. A platform-governed equity token traded freely.

**STILL OPEN, disclosed rather than fixed:** a launch can carry on one yes and two abstentions.
That is the engine's documented abstain rule, it takes three people choosing to answer, and
changing it means editing `governanceEngine.ts`. If your changeset work touches thresholds, this is
the decision waiting for you.

### Voting weight is a token balance, and that has consequences

`Village Voice` (slug `village-voice`, platform-governed, 3 decimals) **IS voting weight under
token-weighted governance**. Two things follow that you must not undo:

- The admin hand-grant route refuses a self-grant outright, at any amount. That refusal is load
  bearing, not politeness.
- It rides in thousandths so a rule of 0.1 does not round to zero. A chip showing 0.1 is 100 units
  underneath. Any changeset that edits weights must respect the scale.

There is also a SECOND voice token, slug `voice`, which is the read-only Hypha mirror on Base. Two
rows, deliberately. Do not conflate them. `docs/TOKENS.md`, when it exists, is the authority.

### Founder rulings about Voice, from that day

- Voice is **optional**, for villages that choose not to run one-person-one-vote.
- The founder sets the initial allocation, and it is **the only token that may be issued before the
  game starts**.
- That allocation **is a ledger entry and appears in history as a proposal every player can see**,
  even though it predates launch. His words: *"it'll still show up as a proposal in the history and
  showing what happened for all players to see."*
- **Governance mode cannot be switched back and forth** between one-person-one-vote and
  token-weighted.

### The governance code moved on 2026-08-31, and one detail matters

Ten routes were extracted from the monolith into `server/routes/governanceWeights.ts` (allocating
power) and `server/routes/governanceWizard.ts` (reporting a member their own standing). Both
`register()` calls sit downstream of `app.use("/api/governance", requireModule("governance"))`, so a
village with the module off still 404s every path. **Keep that ordering if you add routes there.**

`weightModeNow` was the only genuine `startServer`-closure dependency in the entire extraction
queue, and it is passed through `deps` rather than copied. Twelve of its thirteen call sites remain
in `server/index.ts`. The module's own header says why: copying it would have made **a second
decider of a village's weight mode**, and two copies of one rule disagree eventually. Do not make a
third.

### Two things flagged and NOT fixed, both in your path

**`GET /api/governance/ballots` at `server/index.ts:27617` reads as ungated.** It calls
`authedUser` and passes `viewer?.id` optionally, so an anonymous read appears deliberate. The lane
that found it did not verify intent and did not change it. **You are the session that should
settle it**, because permission inversion is exactly the question of who may read what.

**The launch-readiness check at `server/index.ts:14026` reads the village name only**, then reports
success in a message naming the village, while other identity fields may still be another
village's. Permission inversion hangs off launch state, so read this before you depend on it.
Separately, `server/index.ts:13926`'s `brand-basics` check returns `state: "ok"` whenever a stale
`setup.identity` tick exists, which the launch page, the admin banner and the assistant all read.

### The governance test suite is currently unreliable, and it is being worked

`server/governance.routes.e2e.test.ts`, the case *"...and closing it changes NOTHING, which is the
whole promise"*, **passes alone and fails inside the full 245-file run**. Same tree, same commit.
Order dependence or contention, not a code defect. A lane is diagnosing it. **Do not trust a green
from that file until you have run it both ways yourself**, and do not "fix" it by weakening the
assertion.

### Patterns from that day worth copying

**Derive status from the record, never from a flag somebody ticked.** The setup checklist read
hand-ticked booleans, so a founder who ticked "images" and then lost every image kept a complete
checklist on the one screen built to answer that question. It now reads the brand document.
`client/src/components/admin/setupProgress.ts` is the worked example. **Your changeset status must
read the changeset, not a flag.**

**Never declare a component inside another component.** `SetupWizard` declared `Section` in its own
body, so every keystroke made a new component type and React unmounted the whole subtree. Measured
on a phone viewport: focus lost every keystroke, the keyboard dismissed every letter, and **45
extra network requests per five keystrokes**. `client/src/components/admin/SetupSection.tsx` is the
fix. You are about to build a large admin surface; do not reintroduce it.

**A slug is history's identity.** Token slugs are frozen once set, because every ledger
repeat-protection key carries the slug and never the display name. If a changeset can rename
anything, check whether the renamed thing is used as a durable key first.

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
