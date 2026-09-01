# Governance evolution: the brief for the session that builds it

Written 2026-08-31 by the session that did the token foundations work. Read it end to end before
touching anything. Everything here was measured against the repository that day, not remembered,
and where a claim is a reading rather than a measurement it says so.

---

## 1. The mission

The founder, naming the deliverable:

> "Creat so that session will create the sole source of truth for governance of our villages and
> how it works."

And the principle that decides what kind of document that is:

> "these sources of truth will be derived from the live code base and what's true rather than what
> we want to be and we can continue to improve them from there"

**Derived, not written.** A hand-written governance document is wrong within a month, and wrong in
the most expensive direction: it describes the system somebody intended. Generate it from the
schema, the subject-type list, the close dispatcher's routing table, the threshold defaults and the
real gates. Then add a check that FAILS when the document and the code disagree. That check is what
makes it a source of truth rather than a nicely formatted opinion.

**It must describe what is TRUE, including what is broken.** If a subject type has no executor, the
document says so. If a threshold is unreachable from any screen, the document says so. If a rule
lives in two places that could disagree, it names both. This codebase spent a week finding checks
that reported green while the thing they named was broken, and a document is a check like any
other.

Its sibling is the token and economics source of truth, being built in parallel. If `docs/TOKENS.md`
and `scripts/check-token-doc.mjs` exist when you start, read them and follow their shape rather than
inventing a second convention. If not, build yours to be the one the next one copies, and say inside
it which parts are generated and which are prose.

### And the feature the document will describe

> "after the Game launches the admin screen becomes public to all players and they can go through
> and make a suite of edits which then collectively become one proposal and if it passes it goes
> into production"

> "Any player can access all the admin pages once the Game starts, and making any changes require a
> vote from the players so any player can see and engage with the 'admin-mint' but will require a
> successful vote to pass."

One feature described twice. A player opens a screen that used to be admin-only, makes a set of
changes, and those changes become a single proposal the village decides on together.

---

## 2. Read these first, in this order

**Most of the governance engine already exists, and it is good.** Three lanes built it (`wt/r5-gov`,
`wt/r5-gov-engine`, `wt/r5-gov2`) and all three are merged into `main`. Do not design a voting
system. Read the one that is there.

| File | Why |
|---|---|
| `drizzle/0089_governance_engine.sql` | Seven tables. Its header explains the whole design. |
| `server/lib/ballots.ts` | The ballot lifecycle and its rules. |
| `server/index.ts` around **25983** | The close dispatcher. Read the entire comment. |
| `server/lib/gameStart.ts` | Launch, R90, and what deliberately survives it. |
| `server/lib/proposalDrafts.ts` | Server-held drafts, and why a draft is not a proposal. |
| `server/routes/governanceWeights.ts` | Allocating weight, and its audit trail. |
| `drizzle/0091_proposal_drafts.sql`, `0043_mechanics_proposals.sql`, `0095_governance_prune.sql` | The rest of the schema. |

### Four properties you must preserve

1. **A ballot freezes its thresholds, electorate and weights AT OPEN.** The snapshot columns are the
   point: changing village settings can never rewrite a live or historical vote. Changeset ballots
   must freeze the same way, or a village could change the rules of a vote while it runs.

2. **CLOSING IS A HUMAN ACT. Nothing auto-executes at expiry.** Do not add a timer that applies a
   passed proposal. Somebody closes it, and the close is what executes.

3. **A subject type absent from the close dispatcher executes NOTHING.** In the code's own words:

   > "A subject type that is NOT a key here conducts a real decision and executes nothing. That is
   > the property that lets a village hold an advisory vote on the real engine, with the real frozen
   > roll and the real weights, and read the real answer without the answer doing anything. Absence
   > is also the fail-safe direction, so a subject type added by a later lane cannot execute
   > something by accident."

   **This is your biggest gift.** Ship the changeset subject type, the staging UI and real voting
   BEFORE the executor exists. Nothing can apply by accident, and real villages get to vote on real
   changesets while the execution path is still being got right. A voting system that decides
   correctly and executes nothing is one you can watch. One that executes on day one is one you
   find out about afterwards.

4. **A DRAFT IS NOT A PROPOSAL.** No supports, no ballot, no standing, no reader but its author,
   scoped by `user_id` in the SQL itself rather than by a check a caller could forget. Your staging
   area is a draft until submitted. Keep the boundary where `proposalDrafts.ts` puts it.

### What exists, and what does not

Six subject types: `mechanics`, `role_application`, `agreement`, `badge_grant`, `quest_payout`,
`power_transfer`. **Only `mechanics` has an executor** (`applyMechanicsProposal`,
`server/index.ts:25514`). Read it: it is the worked example of a passed proposal changing the world,
and it already handles the messages a proposer receives.

Missing, and this is the build:

1. A **`changeset` subject type**: many admin edits collected into one proposal.
2. Its **executor**: apply a batch of settings changes when the ballot closes passed.
3. **Permission inversion**: admin screens readable by every player once the game has launched.
4. **The staging UI**: edits accumulate visibly, then submit as one.

---

## 3. The steward model, as the founder settled it

All quotes 2026-08-31. These supersede anything older, R90 included.

> "having it default that the steward (by default the founder(s) are granted a steward role after
> Game launch) needs to approve a proposal to change the game before it actually goes through is a
> great addition, but also there's another stage of maturity where the founder gives up this power
> and then auto-execute takes over. Stewards have the power to approve anything in the Game that
> needs approval - they're the 'training wheels' for the Game until it matures enough that they can
> give more and more power to the Game to auto-execute decisions."

> "I want to override the optionally vote in that role to where the founders automatically inherit
> it, but just like every role resets every season - this role too needs to be voted back in to be
> maintained."

> "Yes giving up the power is reversible but the village would need to vote in another steward."

> "Yes stewards have the ability to veto through non approval. This is primarily to protect against
> harm they see that the village wasn't able to (which is why they voted them to be stewards to
> begin with)."

> "No terms should definitely end when they end not with a polite warning! If they're not voted back
> in then they expire when they expire!"

### What that means

- **Founders inherit the steward role at launch.** This overrides R90's "optionally vote in a
  steward role" (`server/lib/gameStart.ts:160`), which is what the code implements today.
- **The role must be voted back in each season.** If it is not, it expires.
- **A steward approves a passed proposal before it takes effect**, and can refuse. The veto is the
  purpose of the role, not a side effect: it exists to catch harm the village could not see.
- **Auto-execute is the maturity path.** Build it as a GRADIENT, not a switch. His phrase is "more
  and more power", and a village may reasonably auto-execute quest payouts while keeping a steward
  on mechanics changes. The dispatcher's fail-safe absence is already the mechanism: a per-subject
  auto-execute flag defaulting to off gives you the whole gradient without a second decision path.
- **Relinquishing is reversible, but only through the village.** A founder can step back; only a
  vote can fill the seat again. A founder cannot take it back themselves.

Why this design is better than either side of the conflict it settled, and it should shape how you
build it: **it makes relinquishment automatic rather than an act of virtue.** The founder never has
to decide they are ready to give up power. They have to be re-granted it. Every benevolent-founder
model fails at exactly that judgment, and this one does not depend on it at all.

### The mechanism he named does not do what its name suggests. Build it first.

Measured 2026-08-31:

- `expires_each_season` is a **per-role column** (`server/lib/orgChart.ts:143`), nullable and
  opt-in. Roles do not universally reset. "Just like every role" is not true of the code today.
- **A term ending takes nothing away.** The `term-watch` job (`server/index.ts:5754`) runs daily and
  NOTIFIES. Its own copy to the holder: *"You are still holding the seat and nothing has been taken
  away. What has run out is the agreement to keep holding it unasked"*, and *"Nothing happens
  automatically when it does."*

Used as-is, a founder would keep steward power indefinitely while the system told them their term
had ended. That is the same shape as every defect this codebase spent a week removing: a status
reporting one thing while the power says another.

He has ruled that terms must genuinely end. **Take the ruling.** Carry one thing from the behaviour
it replaces, because that reasoning is still partly true: the old design was protecting against a
seat emptying and nobody noticing. Real expiry does not remove that risk, it relocates it. **Make
the vacancy loud.** An unfilled seat should be visible on the screens that depend on it and should
escalate, especially for operational roles where the person watching the water simply stops being
anybody. Ending the term is his call. Making the ending silent would be a new defect of the same
family.

### Governance week: the default pattern, and it is a pattern rather than a rule

> "As a default pattern the week before a season ends is the 'governance week' where all the players
> who want a role in the next season put up proposals for their roles - they play out for the
> season."

> "Players can make proposal at anytime and it's a cultural pattern when and how people will
> actually show up to vote. So that's for every village to decide but as a default pattern we offer
> the above."

Three things follow, and the third is the hard one.

**It answers most of the gap.** Renewal happens in the week BEFORE the season ends, so a steward's
term is normally voted on while the current one still holds. The gap below is the exception path,
not the ordinary one. Build the ordinary path first.

**Proposals are never gated by the calendar.** A player may propose at any time. Governance week is
about when people SHOW UP, not about when the system will accept work. Do not implement it as a
window that opens and closes; that would turn a cultural pattern into a permission check, and the
founder has said explicitly it is the village's to decide.

**Offering a pattern in software without enforcing it is genuinely hard, and it is the design
problem here.** Anything the product schedules, reminds about, or renders a countdown for becomes
the norm, whatever the docs say. The honest shape is: the pattern is VISIBLE, SKIPPABLE, and
NAMED AS A DEFAULT the village can change, and the product never refuses an action because it is the
wrong week. A village that runs its governance differently should never see a screen implying it is
doing it wrong.

There is an existing mechanism to build on rather than beside: `term-watch` already notices seatings
whose terms end within 14 days and notifies their holders. Governance week is one week. Read that
job before adding a second thing that knows about the end of a season.

### THE ONE OPEN QUESTION: what executes when there is no steward?

Governance week makes this the exception rather than the rule, but it does not remove it: a village
may not hold the week, or may hold it and vote the steward out with nobody else standing. A season
closes, the seat is empty, and real expiry means it is genuinely empty. Three answers, none
obviously right:

- **Nothing executes.** A village that passed a proposal cannot enact it. That is the failure
  `gameStart.ts` already warns about for the admin panel: a village with no way back.
- **Auto-execute takes over.** More coherent with the maturity framing than it first looks, since
  the steward is protection the village chose and its absence means operating without it. But
  forgetting to hold a vote would hand the Game full autonomy, which is a large consequence for an
  omission rather than a decision.
- **Proposals pass and QUEUE**, executing when a steward is next voted in. Nothing is lost, nothing
  auto-applies, and the backlog is itself pressure to hold the vote. Its problem is a queue of stale
  changesets landing at once against a world that has moved, which is section 5's question.

**Put all three to him with what each costs. Do not choose it yourself.**

### Two more things his rulings leave open

- **Do the granted POWERS reset with the seat, or only the seat?** R90 grants powers to the steward
  separately ("give various powers to this steward to immediately act"). A steward re-elected into a
  seat that silently retains last season's powers is a different thing from one whose powers are
  re-granted.
- **Who inherits when there are several founders?** He wrote "founder(s)". Does each get a seat, and
  does approving need one of them or all?

### The veto carries a reason. Settled.

> "Yes a steward veto absolutely should carry a reason"

So a refusal is a first-class act with a name, a reason, and a record, the way weight changes
already are. Build it that way rather than as a proposal that quietly never executes. The
alternative is a proposal the village passed dying without anybody being told why, which is the same
family as every other defect this codebase has spent a week removing.

**One consequence to put to him, because two of his rulings meet here.** Voter identity defaults to
SECRET. A veto carries a reason and is visible. Is the vetoing steward NAMED? A secret veto with a
public reason is a strange object, and the argument runs both ways: naming them is consistent with
"transparency is the protection", and not naming them protects a steward from pressure for making
exactly the unpopular call the role exists to make. This is question 4 in section 9.

### Governance week already has a sibling in the codebase

`shared/gameVariables.ts:202` describes a claims window that opens once each season, and its own copy
says: *"Worth lining the window up so it CLOSES just before your governance actually meets: if it
shuts six weeks before anyone votes, claims simply sit and wait."* That is the same shape as
governance week and probably wants to be the same date. Read it before inventing a second season
window, and consider whether one setting should drive both.

Seasons carry explicit `startsOn` and `endsOn` dates (`shared/gameConfig.ts:192`) rather than a fixed
length, so "the week before a season ends" is computable and does not need a new field.

---

## 4. Exploit 1 is overruled: transparency over prohibition

An earlier session closed a "constitutional exploit" where a founder carried a launch vote alone.
The founder overruled the framing:

> "The first exploit isn't a concern because proposals should also say how many people voted on it!
> We can have a settings where it would be public who's voting or secret (defaulted to secret)."

> "Founders can self-grant themselves voice. Their ability to do this is fine, our protection is in
> the transparency of it, showing what % of total voice every player is holding."

**A founder concentrating voice in themselves is a legitimate act of founding a village.** What must
not happen is anyone being unable to SEE it.

### This needs almost nothing removed

Checked rather than assumed, and it matters, because the obvious reading points at the wrong code:

- **`server/routes/governanceWeights.ts` already permits self-allocation.** Its
  `actorId === target.id` check at line 151 only skips the NOTIFICATION, since there is no point
  telling you what you just did. The change proceeds, and there is already an append-only trail.
  Nothing to remove.
- **`server/index.ts:19343`'s `self_grant_refused` is a DIFFERENT route** and should stay. That is
  the admin mint, which creates token SUPPLY out of `sys:mint`. Allocating weight among existing
  holders and minting new supply into your own account are different acts. The ruling is about the
  first. If you think it should reach the second, ask him.

### Three things to build

1. A proposal shows **how many people voted**, not only the weighted result.
2. A setting for whether **voter identity is public or secret**, defaulting to secret.
3. A display of **what percentage of total voice every player holds**, visible to players.

### The nuance counts alone do not close

The harm in exploit 1 was not only that concentration was invisible. The frozen document ASSERTED
*"100% participation and 100% agreement"* and *"3 people hold a voice today"*. Both sentences were
true of the weights and false of the village, and a participation count elsewhere on the page does
not unsay them.

**So: any generated sentence about a vote states people AND weight together, never one alone.**
*"1 of 3 people voted, holding 100% of the weight"* is honest. *"100% participation"* is not,
whatever sits beside it.

Secret ballots interact with this. With voter identity hidden by default, the weight-share display
does most of the transparency work. That is a reason to make it prominent, not a reason to change
the default.

---

## 5. The design questions nobody has answered

### What happens when the world moves under a pending changeset?

A player stages "set the cycle pool to 1200". Three days pass, the vote succeeds, and meanwhile
another passed proposal set it to 900. Apply blindly, refuse, or ask?

The store layer had this bug one level down and the fix is worth copying: migration `0122` stamps
rows with a version at read, compares under `SELECT ... FOR UPDATE` at write, and **rebases rather
than refusing** where rebasing is honest. Read `server/repos/store-db.ts` and that migration's
header. Note the symptom it fixed: a stale write silently won and both requests answered 200.

### What does a player see on an admin screen they cannot act on directly?

Every control becomes "propose this change" rather than "save". That is a large surface. A control
that looks like it saves and instead queues a proposal is the save-honesty defect this codebase has
a dedicated guard for. **Read `scripts/check-save-honesty.mjs` before designing the UI.**

### What can NEVER be changed by a changeset?

Some settings must not be votable, or a village can vote itself into a state it cannot leave.
Candidates to argue about: the governance mode itself (he has ruled that switching between
one-person-one-vote and token-weighted must not be reversible), the thresholds for changing
thresholds, anything that would retroactively alter a closed ballot, and anything touching a secret
or credential.

### What does auto-execute mean for a batch?

A mechanics change applies to one variable. A changeset is a batch, and a batch can half-apply. If
auto-execute is on and item four of seven fails, what happened? Answer this before auto-execute
reaches changesets.

### When does "the Game starts", and what reads it?

Permission inversion hangs off launch state. Find the existing one (`readGameStart`, and
`gameStart.ts` explains at length why it is read from the database rather than held in a module)
rather than inventing a second. A second copy of launch state is a second thing that can disagree.

---

## 6. Everything else the 2026-08-31 session learned that touches governance

### The exploits that stand, and the one still open

Read `SEASON2_FLEET_LEDGER.md` section 7j. Both were reproduced end to end over HTTP against the
built server BEFORE any fix, then refused afterwards with conditions unchanged.

**Exploit 2, the governance token bought with a card.** A voice-kind token was listed purchasable,
priced, and stocked with 100 minted out of `sys:mint`. A member's buy reached the LAST gate before
completing, meaning kind, governance, seller, price, stock and stage had all passed. The founder
could then point `governance.weight_token` at it.

**A third hole nobody had named:** equity was refused only via `governance === 'hypha'`, which held
**by accident of the seed data**. A platform-governed equity token traded freely.

**STILL OPEN, disclosed rather than fixed:** a launch can carry on one yes and two abstentions. That
is the engine's documented abstain rule, it takes three people choosing to answer, and changing it
means editing `governanceEngine.ts`. If your work touches thresholds, this is waiting for you.

### Voting weight is a token balance

`Village Voice` (slug `village-voice`, platform-governed, 3 decimals) **IS voting weight under
token-weighted governance**. It rides in thousandths so a rule of 0.1 does not round to zero: a chip
showing 0.1 is 100 units underneath. Any changeset editing weights must respect the scale.

There is a SECOND voice token, slug `voice`, the read-only Hypha mirror on Base. Two rows,
deliberately. `docs/TOKENS.md`, when it exists, is the authority.

### Founder rulings about Voice

- Voice is **optional**, for villages not running one-person-one-vote.
- The founder sets the initial allocation, and it is **the only token issuable before the game
  starts**.
- That allocation **is a ledger entry and appears in history as a proposal every player can see**,
  even though it predates launch.
- **Governance mode cannot be switched back and forth.**

### The governance code moved, and one detail matters

Ten routes were extracted into `server/routes/governanceWeights.ts` (allocating power) and
`server/routes/governanceWizard.ts` (reporting a member their own standing). Both `register()` calls
sit downstream of `app.use("/api/governance", requireModule("governance"))`, so a village with the
module off still 404s every path. **Keep that ordering.**

`weightModeNow` is passed through `deps` and never copied. Twelve of its thirteen call sites remain
in `server/index.ts`. The module header says why: a copy would be **a second decider of a village's
weight mode**, and two copies of one rule disagree eventually. Do not make a third.

### Two things flagged and NOT fixed, both in your path

**`GET /api/governance/ballots` at `server/index.ts:27617` reads as ungated.** It calls `authedUser`
and passes `viewer?.id` optionally, so anonymous read appears deliberate. The lane that found it did
not verify intent. **You are the session that should settle it**, because permission inversion is
exactly the question of who may read what.

**The launch-readiness check at `server/index.ts:14026` reads the village name only**, then reports
success in a message naming the village while other identity fields may still be another village's.
Separately, `server/index.ts:13926`'s `brand-basics` returns `state: "ok"` whenever a stale
`setup.identity` tick exists, and the launch page, admin banner and assistant all read it.

### The governance test suite is currently unreliable

`server/governance.routes.e2e.test.ts`, the case *"...and closing it changes NOTHING, which is the
whole promise"*, **passes alone and fails inside the full 245-file run.** Same tree, same commit.
Order dependence or contention, not a code defect. A lane is diagnosing it. **Do not trust a green
from that file until you have run it both ways yourself, and do not weaken the assertion to get
one.**

### What R90 keeps, whatever else changes

`gameStart.ts` explains the load-bearing half: the admin panel deliberately survives launch, because
"a village may choose never to vote in a steward and must still work completely". Eighteen branches
read `role === "admin" || role === "founder"` meaning only "is this person an administrator". Ending
those at launch would leave a village unable to administer itself with no way back. Whatever you
build must keep that property.

### Three patterns worth copying

**Derive status from the record, never from a flag somebody ticked.** The setup checklist read
hand-ticked booleans, so a founder who ticked "images" and then lost every image kept a complete
checklist on the one screen built to answer that question. It now reads the brand document.
`client/src/components/admin/setupProgress.ts` is the worked example. **Your changeset status must
read the changeset.**

**Never declare a component inside another component.** `SetupWizard` declared `Section` in its own
body, so every keystroke made a new component type and React unmounted the whole subtree. Measured
on a phone: focus lost every keystroke, keyboard dismissed every letter, and **45 extra network
requests per five keystrokes**. `client/src/components/admin/SetupSection.tsx` is the fix. You are
about to build a large admin surface.

**A slug is history's identity.** Token slugs are frozen once set, because every ledger
repeat-protection key carries the slug and never the display name. If a changeset can rename
anything, check whether the renamed thing is a durable key first. **A rename can mint**: seat
payments once keyed on a value being renamed, where the rename would have re-paid every paid seat.

---

## 7. Traps this codebase has paid for

**Express 4 async handlers HANG on a throw.** A rejected handler promise is an unhandled rejection,
not a 500: `installCrashHandlers` reports it and the process survives, and the member's request gets
no answer at all. There is a filed request for a wrapper forwarding rejections to the error
middleware. If your executor can throw, read this first.

**The silent-zero class.** A check reporting the same value when it did not run as when it passed.
Seen here as: a guard reading one file path after code moved out of it and still exiting 0; a suite
skipping 1,151 tests and exiting 0; a build marker reading "dev" whether the stamp worked or the git
context was absent. **Any status your governance code reports must distinguish "nothing to do" from
"could not tell".**

**An empty state and a real zero are different facts, and code guarding on falsiness cannot tell
them apart.** A 0% agreement reading was drawn as an absence because the mark function returned
"none" for any falsy value. In a voting system this class is severe.

**Two copies of one rule disagree eventually.** The close dispatcher's own comment says it, and it
is why that logic lives in one place. Do not add a second opinion about whether a vote binds.

---

## 8. How to work in this repository

- **Your own worktree, always**: `git worktree add ../<name> -b <branch> main`. A lane checking out
  in a shared directory has cost this programme twice.
- **Copy `.env` into your worktree before running tests.** Without `TEST_DATABASE_URL` the 74
  database-backed files skip and the suite still exits 0. That produced a false green twice in one
  session, once with 1,151 tests silently not run.
- **Build before you test.** The e2e suites boot `dist/index.js` and throw only if it is missing,
  never if it is stale.
- **Capture exit codes with no pipe.** Reading the status after a pipe gives the last command in the
  pipe. This produced a false green on a genuinely red tree four times in one day.
- **`server/index.ts` carries a ratchet** on line count and route count, enforced in CI. New routes
  go in `server/routes/<domain>.ts` with a `register(app, deps)` and a `Pick<AppDeps, ...>`. Route
  module imports and their register calls are exempt from the line count on purpose.
- **Migrations**: claim the next free number by checking remote refs, local branches, untracked
  files and `git worktree list`. Run the migration, never only review it. A rename migration here
  once collapsed two rows because MySQL `LPAD` truncates as well as pads.
- **Writing rules** apply to comments, commit messages and user-facing copy: no em-dashes, no
  "not X but Y" contrast framing, no rhetorical openers. `scripts/check-voice.mjs` enforces some.

---

## 9. Questions for the founder, collected

Every open question in one place, so you can put them to him in one pass rather than one at a time
across a week. Each carries the context and a recommendation, because a question with no
recommendation makes him do your thinking. He is holding a lot; do not send him a quiz.

**1. What executes when there is no steward?** A season closes, nobody was voted in, the seat is
genuinely empty. Governance week makes this the exception rather than the rule, but it will happen.
Three answers, in section 3: nothing executes (a village that passed a proposal cannot enact it),
auto-execute takes over (forgetting to vote hands the Game full autonomy), or proposals pass and
QUEUE until a steward exists (nothing lost, nothing auto-applied, but a stale backlog lands at once).
**Recommendation: queue.** It fails toward "nothing happens without a human" which is the engine's
existing posture, and the staleness problem it creates is the same one section 5 already has to
solve for any pending changeset.

**2. Do the granted POWERS reset with the seat, or only the seat?** R90 grants powers to a steward
separately from seating them. A steward re-elected into a seat that silently retains last season's
powers is a different thing from one whose powers are re-granted each time. **Recommendation: powers
reset with the seat.** Anything else means a power granted once in season one still standing in
season nine, held by somebody the village elected for different reasons.

**3. Who inherits when there are several founders?** He wrote "founder(s)". Does each inherit a
steward seat? Does approving a proposal need one of them, or all? **Recommendation: each inherits a
seat, and any one steward can approve.** Requiring all makes a single absent founder a veto by
accident, which is not what a veto is for.

**4. Is a vetoing steward NAMED?** Voter identity defaults to secret; a veto carries a reason and is
visible. Naming them is consistent with transparency being the protection. Not naming them protects
a steward from pressure for making exactly the unpopular call the role exists to make. **No
recommendation. This is a values question about what kind of village this is, and it is his.**

**5. Does the self-grant ruling reach the admin mint?** He ruled that founders may allocate voice to
themselves. `server/routes/governanceWeights.ts` already allows that. A separate route,
`server/index.ts:19343`, refuses minting new supply into your own account. **Recommendation: leave
the mint refusal in place.** Distributing weight among existing holders and creating new supply for
yourself are different acts, and only the first is what he ruled on.

**6. A launch can still carry on one yes and two abstentions.** Disclosed and never fixed. It takes
three people choosing to answer, and changing it means editing `governanceEngine.ts`. **Ask whether
he wants it changed now that he has ruled participation counts must be shown**, since the display
may be the fix he actually wanted.

**7. What can NEVER be changed by a changeset?** The un-votable list. Candidates: the governance
mode (he has ruled it cannot switch back and forth), the thresholds for changing thresholds,
anything that would retroactively alter a closed ballot, and anything touching a secret or
credential. **Recommendation: start with that list and let villages add, never remove.**

**8. What happens when a pending changeset's world has moved?** Apply blindly, refuse, or ask.
**Recommendation: rebase where rebasing is honest and refuse where it is not**, following migration
`0122`'s pattern, and show the member what changed underneath them either way.

**9. Should governance week and the claims window share a date?** `gameVariables.ts:202` already
advises lining the claims window up with when governance meets. **Recommendation: one setting drives
both**, so a village that moves its governance rhythm does not have to remember a second place.

---

## 10. What to do first

1. Read the seven files in section 2. Do not design anything until you have.
2. Write down, in your own words, what the existing engine does and where a changeset attaches. If
   that description is wrong, everything after it is wrong.
3. **Put section 9's nine questions to the founder in one pass**, with the recommendations. They
   are collected there so he answers once rather than being interrupted nine times.
4. **Build the real term expiry before anything else.** The whole steward model rests on it and it
   does not exist yet.
5. **Ship the changeset subject type and staging UI before the executor.** The dispatcher's
   fail-safe absence makes it safe, and it means real villages vote on real changesets while the
   execution path is still being got right.
