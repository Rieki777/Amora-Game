# Governance evolution: the brief for the session that builds it

Written 2026-08-31 by the session that did the token foundations work, and extended 2026-09-02 with
the founder's fuller vision and a measured map of the engine (sections 0 and 12 to 18). Read it end
to end before touching anything. Everything here was measured against the repository that day, not remembered,
and where a claim is a reading rather than a measurement it says so.

---

## 0. Read this first (added 2026-09-02)

This brief now has three layers, and the later ones win where they disagree with the earlier ones.

- **Sections 1 to 11** are the 2026-08-31 brief. Keep reading them: the reasoning is sound and the
  founder's quotes there are still his rulings. Three of its claims are superseded, named below.
- **Section 12** is the founder's fuller vision, stated 2026-09-02, in his words. It is the target
  the document must describe.
- **Section 19** is his answer to section 15, given the same evening, and the mandate to build.
- **Section 20** is the execution plan the coordinator runs: lanes, ownership, migration numbers, merge order, the QA walk.
- **Sections 13 to 18** are what fourteen readers measured against the repository on 2026-09-02,
  each reader's citations re-opened by a second, adversarial agent. Where section 13 contradicts
  sections 1 to 11, section 13 is right. The full reports, with evidence tables, are outside the
  repository at `C:\Users\taren\Desktop\Amora\governance-sources\reports\` (section 18).

**Sections 19C to 19E replace the steward-approval model wherever sections 3, 15, 19, 19B and the section 20.2 lane rows still describe one:** the steward is a 72-hour veto window, a token send executes at pass unless a seated steward votes no, and a Game change lands automatically at the later of the next new moon and the window's close. Section 20.8 records the audit that found the stale rows and the correction wave.

**Three claims in sections 1 to 11 are now wrong.**

1. "Governance mode cannot be switched back and forth" (sections 6, 7 and question 7). The founder
   reversed it on 2026-09-02 (section 12), and the code never enforced it anyway (section 13.2).
2. "Only `mechanics` has an executor" (section 2). Nine subject types execute at close (13.1).
3. "The governance test suite is currently unreliable" (section 7). Fixed by `c0ac180` on
   2026-08-31; the ledger records no governance defect (13.9).

**Every `server/index.ts` line number in this document is a locator, never a fact.** The file was
31,082 lines at `6f6a55e` when sections 1 to 11 were written, 28,562 on `main` at `8d2a9c4` when
this section was written, and it lost about 2,500 lines to route extractions in the hours between,
while the readers were inside it. Section 13 gives a search anchor for every site it names. Search
the anchor. The other governance files named in this document (`shared/governanceEngine.ts`,
`shared/ballotSubjects.ts`, `shared/gameVariables.ts`, `shared/lunar.ts`, `server/lib/ballots.ts`,
`server/lib/gameStart.ts`, `server/lib/mechanics.ts`, `server/lib/governanceWeights.ts`,
`server/lib/orgChart.ts`, `server/routes/governance*.ts`, `docs/TOKENS.md`) are byte-identical
between `6f6a55e` and `8d2a9c4`, so their line numbers in section 13 held at the time of writing.

**The canonical checkout moved while this was written.** `C:\Users\taren\Desktop\Amora\hotfix` was
`main` on the morning of 2026-09-02 and is another lane's live worktree (`wt/g-architecture`) by the
evening. Never read governance code from a directory you did not create. Make your own worktree
from `origin/main` and say its commit inside anything you generate.

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

**Proposals are never gated by the calendar.** *(Superseded by section 19E on 2026-09-03: a village may set governance windows per proposal kind; always-open stays a choice.)* A player may propose at any time. Governance week is
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
exactly the unpopular call the role exists to make. This is question 4 in section 10.

### Governance week already has a sibling in the codebase

`shared/gameVariables.ts:202` describes a claims window that opens once each season, and its own copy
says: *"Worth lining the window up so it CLOSES just before your governance actually meets: if it
shuts six weeks before anyone votes, claims simply sit and wait."* That is the same shape as
governance week and probably wants to be the same date. Read it before inventing a second season
window, and consider whether one setting should drive both.

Seasons carry explicit `startsOn` and `endsOn` dates (`shared/gameConfig.ts:192`) rather than a fixed
length, so "the week before a season ends" is computable and does not need a new field.

---

## 4. Vote delegation

> "One more requirement we need to build in is to delegate your vote to another member (where it
> just copies whatever they do as long as they have your delegation and you can remove and change a
> vote on an open proposal at anytime. So full rights to the individual but for those who don't want
> to vote can give their voice to someone they trust."

The concept is already in the domain language and was never built: `shared/power.ts:100` carries a
`delegated` power shape glossed *"You hand your voice to someone you choose."* Use that word.

### The data shape fits, and one choice keeps it clean

`ballot_votes` has PRIMARY KEY `(ballot_id, user_id)`: one row per member per ballot. So a delegated
vote is **a row for the DELEGATOR carrying the delegate's choice**, with provenance recorded, rather
than the delegate's weight going up.

**Copy the choice, never move the weight.** This is the decision the whole feature turns on and it
should not be revisited casually:

- The participation arithmetic stays honest. "9 of 12 people voted" counts nine rows, whoever
  decided them, which is what section 5's people-and-weight rule needs.
- The frozen electorate keeps meaning what it says. Who may vote and how much each vote counts were
  fixed at open; delegation changes only WHAT a vote says.
- **It dissolves the apparent conflict with the freeze.** His "change at any time" and property 1's
  "freezes at open" only collide if delegation moves weight. It does not: changing a delegation is
  the same class of act as changing your own vote, which an open ballot already allows.

### Four hazards, and the first one is not optional

**Cycles.** A delegates to B, B to C, C to A. Detect and REFUSE at the moment a delegation is
created, never at tally time. A cycle discovered while counting is an infinite loop in the one
routine nobody wants to debug at a season boundary.

**Chains are TRANSITIVE. Settled by the founder:**

> "I want transitive to start - that's okay but as you say concentration must be visible so we'll
> just show what's going on"

So A delegates to B, B delegates to C, and A follows C. I had recommended against it on the grounds
that chains concentrate power several hops from anyone who consented, and his answer is the same one
he has given all the way through: the protection is transparency, not prohibition. Show what is
going on.

**That makes three things load-bearing rather than nice to have:**

- **Cycle detection is now mandatory, not merely wise.** Without transitivity a cycle is a curiosity.
  With it, a cycle is an infinite loop in the tally. Refuse at creation.
- **A delegator must be able to see WHO THEY ACTUALLY FOLLOWED**, not only who they delegated to.
  If A delegated to B and the vote came from C four hops away, A following C is the whole mechanism
  working, and A not being able to see that is the concentration becoming invisible again.
- **Chain depth and effective concentration must both be shown.** How many delegations a member
  holds DIRECTLY is not the interesting number once chains exist. The interesting number is how many
  votes they effectively decide, counting everyone who reaches them through anybody.

**What happens when the delegate does not vote?** The delegator's vote is **not cast**. It is not an
abstain, because abstaining is a choice somebody made. That distinction decides quorum, and it is
the same empty-versus-zero rule that has bitten this codebase repeatedly.

**Concentration must be visible**, by his own principle. He ruled that a founder may hold most of
the voice as long as everyone can see it. **Delegation is weight concentration by another route**
and needs the same treatment: how many delegations a member holds, and what share of the electorate
that is, visible to every player. A member holding twenty delegations quietly is exactly the state
the transparency ruling exists to prevent.

### Two interactions to settle

**Secrecy resolves itself, and needs no new mechanism.** The founder:

> "A delegate would puncture because you always see on a proposal a vote you made. So since your vote
> was cast following another's you were able to see what that other member did because you can see
> what you did."

A member already sees their own vote on a proposal. A delegated vote IS their own vote, sitting in
their own row, carrying the choice it followed. So the delegator learns what their delegate did by
reading what they themselves voted, and no special disclosure rule is required. This is another
reason the copy-the-choice shape above is the right one: it makes the secrecy question dissolve
rather than need answering.

**The steward.** A steward holding many delegations has concentrated votes AND a veto. That may be
entirely fine, since both were given knowingly, but it should be visible in one place rather than
two.

---

## 5. Exploit 1 is overruled: transparency over prohibition

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

## 6. The design questions nobody has answered

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

## 7. Everything else the 2026-08-31 session learned that touches governance

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

## 7A. The hub side, from the coordinator session of 2026-08-30

Everything above is the village looking at itself. This section is the other end of the wire, written
by the session that held `regen-civics` (the hub) the same weekend. **Governance crosses a bridge, and
nobody has ever proven the crossing works.** Measure anything here before you build on it.

### The governance hub relay has never been proven, and the village already claims it works

`shared/gameVariables.ts:437-443` defaults the hub base URL to `https://regencivics.earth` and
describes registering a proposal's on-chain id with it, signed with a shared governance secret, so the
verified outcome can find its way home. The hub implements the receiving half at
`server/lib/hypha-bridge/fork-relay.ts`: `x-governance-hub-secret`, 401 on a missing header, signed
deliveries.

**`server/index.ts:25247` in this repo already tells a member:** *"registered with the governance hub.
The verified outcome will find this proposal by itself."*

That sentence is a claim about a system in another repository, and it is only true if the round trip
completes. **I could not prove it and did not guess.** Proving it needs the shared secret, which should
not travel between sessions in a message. The honest verdict today is NOT PROVEN, and a sentence shown
to a member is a worse place to be wrong than a log line.

**If you touch it, prove it end to end, and fix the sentence if it is not true.**

### The exact mistake this relay is about to repeat, with the fix already written next door

The feedback relay had the identical shape and was fixed in this repo on 2026-08-29 in `aef5ded`,
"stop the platform guessing somebody else's address". Its comment is the argument, verbatim:

> *"the setting that turns the relay on ships ON, so a hardcoded destination made every fork post its
> members' words to one specific organisation without ever choosing to."*

`feedbackHubUrl()` now returns `process.env.FEEDBACK_HUB_URL ?? ""`, and empty means nowhere.

**The governance relay still hardcodes `https://regencivics.earth` as its default.** Same shape, not
yet fixed. A fork that installs this platform and configures nothing currently registers its
governance outcomes with one specific organisation it has never heard of. For a feature about who
decides, that is worse than it was for feedback.

And the destination that was hardcoded for feedback, `hub.regencivics.earth`, **has no DNS record at
all**: `Non-existent domain`, against an apex control that resolves and returns 200. It was never a
404. It was never a host. If any governance constant points at a `hub.` subdomain, it fails at
resolution and the error will not look like a routing problem.

### Anonymous reads: section 7 flags one route, production has three

Section 7 says `GET /api/governance/ballots` at `server/index.ts:27617` reads as ungated with intent
unverified. Probed on production, it is broader than that:

- **`GET /api/governance/ballots`** answers an anonymous caller with 200
- **`GET /api/game/mechanics/proposals`** answers an anonymous caller with 200
- **`GET /api/governance/ballots/:id`** serves **the named voting record with per-person weight, plus
  the names of everyone who has not voted yet**

Both list endpoints return an empty array today, so **nothing leaks yet, because no ballot has ever
run.** The first ballot changes that in one step, with no code change and no warning.

**What a village publishes about its own votes is a founder decision, not a default**, and right now
the default is everything, to anyone, including who has not voted. You are the session that should
settle it. Put it to him with the third route named, because the per-person weight and the non-voter
list are the parts he will have an opinion about.

### The snapshot law, and how to prove you did not break it

**A vote is counted against the day it opened, with method, dials, roll and weights frozen at open.**
`ballots.test.ts` pins it.

Every governance lane in this programme is required to run that file **unmodified and green, and to
prove the file is byte-identical to the base** rather than merely passing. A changeset feature that
can edit weights or thresholds is precisely the kind of change that breaks this by accident, because
the whole point of a changeset is that settings move.

### The capability keys, which are the prerequisite nobody has done

The red team's largest single gap: **roughly 95 village-governance routes carry no capability key.**
It is a prerequisite for R90's steward powers and for any real handover, and it was deliberately
sequenced after ROLL and STEWARD because all three touch `server/index.ts`.

**One key was named and never added: something like `member.role`**, gating who may change an
account's tier. `PUT /api/admin/users/:id/role` is **the last standing scaffolding power over people**
after launch, and R90 says the village decides it eventually through the steward. If your changeset
can move powers, this is the power it must be able to move.

### check-admin-reach has a blind spot exactly where you are building

**Three steward routes have no browser surface.** A village can declare and seat a role by API today
and cannot do it from a page. They pass `check-admin-reach` **by living under `/api/governance`, which
is that gate's blind spot rather than a clean bill.**

You are about to build a large admin surface. A green from that gate does not mean your routes are
reachable by a human. Verify reach by loading the page.

### Four vote types collect real votes and then do nothing

Applying for a seat, writing an agreement, granting a badge, paying out a quest. **The working
`power_grant` executor is about a hundred lines and is the template for all four.** A vote that binds
nothing is a worse promise than a vote that was never offered, and this is the closest existing work
to a changeset executor.

### Module enablement is already a governance surface, and the founder edits it by hand

`shared/modules.ts` states it plainly: enablement lives in `module_settings`, read through
`server/lib/modules.ts`, and NOWHERE else. Around eighteen modules, each with a lifecycle of
`off | preview | members | public`.

That is a governance-shaped control that R91 says becomes member-visible and proposal-gated. **Today
it is a direct database write.** On 2026-08-30 four modules were switched off at 00:39 by the
founder's account, and I restored three of them on his instruction with a single UPDATE. No proposal,
no record a member could read, no way for anyone to see who changed what or why.

**Module lifecycle belongs in your changeset enumeration.** It is a worked example of the exact
problem: a founder acting alone on a control a launched village would vote on.

### A hardcoded threshold silently stalled a live pipeline for 34 days

Not governance code, but the same shape as a quorum or a majority rule, which is why section 5's
still-open abstain rule matters more than it looks.

The hub's content pipeline paused because a backpressure limit of 15 met a backlog of 22. **The cron
fired about 816 times over 34 days, drafted nothing, and reported success every time.** A downstream
weekly job then found no material and correctly reported zero, which made it look broken too while
being a victim. One hardcoded number, one month, and a deploy required to change it.

Fixed on 2026-08-30 by moving the numbers into `game_variables`, read per run, with 0 meaning no
brake.

**The lesson: any governance number a village might need to change must be changeable without a
deploy.** A quorum that needs an engineer contradicts R91's premise that the village decides. Section
5 notes that changing the abstain rule means editing `governanceEngine.ts`. That is the same defect,
in the code where it matters most.

### A pattern for claims a village makes about itself

The hub shipped one on 2026-08-30 that transfers directly. The fund's story lived in twenty-one places
and none of them agreed; two contradictory target figures had both been live for about two years.

The fix: **one exported source of truth** (`shared/fund.ts`), **fourteen surfaces reading from it**,
and **a CI gate** (`scripts/check-fund-claims.mjs`, wired as gate 1d) that fails the build when a
retired claim reappears or a named surface stops importing from the source. Deliberate exceptions use
`fund-claims-allow: <reason>` and must carry a reason.

**Two things learned building it, both of which will bite you:**

1. **The suppression marker must be on the same line, or the line IMMEDIATELY above.** Two lines up is
   not read. I lost a gate cycle to exactly that.
2. **The gate caught its own author twice**, once on a code comment and once on a test asserting those
   strings are absent. That is the gate working, and it is the argument for a real gate over a
   convention.

If a changeset can alter what a village publishes about its own governance, that content wants this
shape: one source, many readers, a gate that fails on a retired claim.

### Three more silent-zeros, and the sharper tell

Section 8 names the class. Three fresh instances landed in one day, in three files, from three
different sessions, which is why it deserves a rule rather than a warning:

- `describe.skipIf(cond)` **skips the tests and still evaluates the describe body.** A `readFileSync`
  on an undefined path inside it threw at collection, and a failed collection is a failed SUITE rather
  than a skipped one. One untracked file absent on a CI runner, whole build red.
- A contrast checker printed `NAVIGATION FAILED` per route **and never counted it**, so a run where
  every navigation failed printed `0 contrast failure(s)` and exited 0.
- `harvest_runs` rows are written **only on the productive path**, so a table meaning "the job
  produced" was read by everything as "the job ran". A monitor built to make silence visible would
  have shown a healthy weekly job as late, in the one component built to be trusted about alarms.

**The rule, in one sentence: a guard that prevents an ACTION does not prevent EVALUATION.**

**And the tell is the summary line, not the guard.** For every count your governance code reports, ask
what value it takes when the check did not run. If that equals the success value, the check has no
failure mode. Section 8 already says an empty state and a real zero are different facts and that this
class is severe in a voting system. This is the same rule pointed at your own instrumentation: **a
changeset that applied 0 changes and a changeset that could not tell must not print the same line.**

### Verify against the deployed thing, not the diff

Twice on 2026-08-30 a change was correct, gated green, fully tested, and still wrong in production,
and neither was visible in the diff:

- A host-aware fix made every subpage of a subdomain correct while `/` stayed wrong, because a
  **dedicated `app.get("/")` handler earlier in the chain** never reached the code that changed. The
  diff was faultless; the bug lived in a file it did not touch.
- A title template shipped a name twice, on the most-read string of the newest surface.

Both were found by fetching the deployed URL. **For a governance surface this matters more, because
the reader who cannot tell is a member deciding how to vote.**

### Numbers to re-measure rather than trust

Coordinator numbers went stale in both directions the same weekend, so treat these as timestamped:

- **The hub's next free migration was recorded as 0231 and was actually 0230**, because a number had
  been allocated and returned unused. Three were then taken on 2026-08-30 and 31, so **next free is
  0233.**
- **Village next free is 0121.** 0115 to 0118 were allocated and returned unused. **0120 is applied**,
  verified in `_migrations_applied` rather than inferred from a merge.
- Reaching the village database from a laptop: `DATABASE_URL` on the app service points at
  `mysql.railway.internal` and is unreachable from outside. Use `railway run -s "MySQL" node <script>`
  and read `MYSQL_PUBLIC_URL` inside the subprocess, so the credential never enters a transcript. The
  village is its own Railway project, **"Amora Game"**, not a service inside the hub's project.

### The enumeration this session was asked for, and never started

`PROMPT_3_AMORA_ADMIN_AND_LAUNCH.md` makes its FIRST deliverable, ahead of any fix, an enumeration of
**what a founder may do alone before launch versus what becomes a community vote after**, because two
of the founder's own notes, the cycle settlement and minting by hand, turned out to be the same
missing model. His words: *"we need to audit all instances of this."* That prompt tells its session to
stop and show him the enumeration before building anything.

**That enumeration is your mission's foundation and it does not exist yet.** Module lifecycle above is
one entry. The roughly 95 unkeyed routes are most of the rest. Start there, and put it in front of him
before you build the tray.

---

## 8. Traps this codebase has paid for

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

## 9. How to work in this repository

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

## 10. Questions for the founder, collected

*Superseded by section 15 on 2026-09-02, which folds every question here into a fuller list. Kept
for the reasoning behind each recommendation.*

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

**12. What does a village publish about its own votes?** Three endpoints answer an anonymous caller
on production today: `GET /api/governance/ballots`, `GET /api/game/mechanics/proposals`, and
`GET /api/governance/ballots/:id`, which serves the named voting record with per-person weight plus
the names of everyone who has not voted yet. The lists are empty because no ballot has ever run, so
nothing has leaked and there is time to choose. **The first ballot makes this real with no code
change and no warning.** Section 5 settles that transparency beats prohibition for the exploit
question, and this is the same principle pointed at members rather than at attackers, which is not
automatically the same answer. **Recommendation: keep the tallies and the proposal list public, and
put the per-person record and the non-voter list behind membership.** A published list of who has not
voted yet is a pressure instrument, and a village that wants it should turn it on deliberately rather
than inherit it.

---

## 11. What to do first

*Superseded by section 17 on 2026-09-02. Kept because steps 1, 2 and 5 still hold word for word.*

1. Read the seven files in section 2. Do not design anything until you have.
2. Write down, in your own words, what the existing engine does and where a changeset attaches. If
   that description is wrong, everything after it is wrong.
3. **Put section 10's nine questions to the founder in one pass**, with the recommendations. They
   are collected there so he answers once rather than being interrupted nine times.
4. **Build the real term expiry before anything else.** The whole steward model rests on it and it
   does not exist yet.
5. **Ship the changeset subject type and staging UI before the executor.** The dispatcher's
   fail-safe absence makes it safe, and it means real villages vote on real changesets while the
   execution path is still being got right.

---

## 12. Addendum, 2026-09-02: the founder's fuller vision, in his words

Written 2026-09-02 by the session asked to make this brief complete. The founder restated the whole
vision in one message that day. Everything in this section is HIS, quoted or closely paraphrased,
and it supersedes any older ruling it contradicts. One reversal is flagged explicitly below.

### The deliverable, restated

> "Your task is going to be setting up the sole source of truth for governance and our game creating
> a document that is based off of truth that's human readable and beautiful, and also machine
> readable that sits in our repo so that everyone including bots can understand how the governance
> system works."

> "This isn't a full story and for you to fill out the whole story and create version 1.0 of this
> document for us to go back-and-forth on to ensure that we have the right vision."

So: one document, in the repo, generated from what is true (section 1), readable by a person AND by a
machine (follow `docs/TOKENS.md`: prose plus a JSON block, one generator, one guard that fails CI),
and shipped as a version 1.0 that he will iterate with you. He expects a draft to react to, not a
questionnaire.

### Founding: one to three founders, and only Voice

> "Every village starts off with 1 to 3 founders putting the initial conditions in place and the only
> tokens they can issue at this point is Voice tokens."

### Starting the game: three people, everyone, unanimous

> "then at some point when the game is mature enough and the founders deem it ready that they're
> ready to start the game then it starts with an initial proposal that needs a minimum of three votes
> three different parties voting and it has to get 100% quorum and 100% unity so every player of the
> game needs to show up to the start the game proposal. This proposal will also show the current
> distribution of Voice as that's the only token that had been issued at that time and give a brief
> overview of how the game is structured and the conditions that the game is at."

Four rules in one sentence: at least three DIFFERENT voters; 100% quorum (every player votes); 100%
unity (every vote is yes); and the proposal body itself renders the Voice distribution plus a summary
of the game's structure and current conditions. Section 7's still-open abstain case (one yes and two
abstentions carrying a launch) is settled by this rule in spirit: an abstention is not a yes, so
under 100% unity it cannot carry. Check what the engine does with it and fix the engine, not the copy.

### After launch: the admin panel is everyone's, and edits become proposals

> "after this point all members can see the admin section and all of the controls for the entire
> game so the admin panel that's available just for founders at the beginning becomes available for
> everyone to see and they can go through and just like a founder can make all these edits but the
> edits as they're making them just become a change log that will then turn into a proposal and if
> the proposal passes then changes the game at the start of the next lunar cycle"

Three consequences: the CHANGE LOG is the staging area (section 2's "draft is not a proposal"
boundary applies to it); passing does not apply; the passed changeset applies at the NEXT CYCLE
START. That gives the steward approval (section 3) a natural window: between the vote closing and
the new moon.

### Cycles: lunar by default, a setting by design

> "so that we're following lunar cycle periods for every lunar cycle. A new game structure can take
> place this lunar cycle is also a setting that it could be changed to any calendar cycle or any
> other cycle but we default to lunar cycles where a new cycle start and end at the new moon just
> like with the gratitude cycle"

The governance cycle and the gratitude cycle are the same rhythm and should be the same setting.
Find how the gratitude cycle computes "new moon" today before adding a second clock.

### Vote mode: switchable BOTH ways, holdings never deleted. THIS REVERSES AN EARLIER RULING.

> "within governance, we have some elements where you can have one person one vote or one token one
> vote where members can hold multiple voice tokens, and their vote is stronger. This should be able
> to go back-and-forth where you can change from one person one vote to one token one vote and vice
> versa and when we're making these changes, it doesn't delete the voice token holdings so if you
> have voice tokens, and you switch over to one person, one vote and just changes the overall
> governance that way, and then allows the community to go back to one token one vote and maintain
> the current token holdings"

Section 6 and section 7 of this brief record "Governance mode cannot be switched back and forth."
That is now WRONG. The 2026-09-02 ruling is: the mode is a village setting that may change in either
direction by proposal, the change touches only how votes are COUNTED, and Voice balances are
untouched by it. Ballots already open keep the mode they froze at open (property 1 in section 2).
Question 7's un-votable list loses "the governance mode" as a candidate.

### Proposals carry more than one element, because elements connect

> "for example, on that proposal, the proposal could also contain a clause where they're distributing
> a bunch of new Voice tokens out to different members if maybe there is unfair voice token holding
> that elicited their desire to go back to one person one vote but realize they actually just needed
> a fair distribution so that's why proposals need to contain more than one element because they
> might be connected."

A proposal is a LIST of changes voted as one. The changeset subject type (section 2) is that list.
Note that his example mixes a settings change (vote mode) with a token distribution (mint Voice to
members), so a changeset's elements are not only settings: they include ledger acts.

### The objection loop: vote down, say what to fix, withdraw, edit, resubmit

> "During the proposal process proposal comes up and people can vote it down and put their
> objections and what they would like fixed then a proposer can withdraw and edit their proposal and
> make those suggested changes and put it back up for vote to try to reach the required quorum and
> unity required."

So an objection carries text (what they would like fixed), a proposer may WITHDRAW an open proposal,
EDIT it, and RESUBMIT it, and the resubmission should be linked to what it replaces so the history
reads as one conversation rather than two unrelated proposals.

### Stewards, restated (unchanged from section 3, repeated because he repeated it)

> "having it default that the steward (by default the founder(s) are granted a steward role after
> Game launch) needs to approve a proposal to change the game before it actually goes through is a
> great addition, but also there's another stage of maturity where the founder gives up this power
> and then auto-execute takes over. Stewards have the power to approve anything in the Game that
> needs approval - they're the 'training wheels' for the Game until it matures enough that they can
> give more and more power to the Game to auto-execute decisions."

### The inspiration, and where a local copy lives

He named three sources for where this comes from. Read them; they are short, and the engine's
quorum, unity and weight dials descend from them directly.

| Source | What it is | Local text copy (outside the repo) |
|---|---|---|
| https://docs.google.com/presentation/d/1hjjo_p5VqaOkaUml9nR3s8ZGUt1AzCidCSw6VngJ3dc/edit?usp=drivesdk | Slide deck "So you want to make a DHO?" (Hypha / SEEDS). The three dials (voice token variance, quorum, unity) with named presets, plus voice half-life, vote period, role expiry, what requires a vote, vote scope by circle. | `C:\Users\taren\Desktop\Amora\governance-sources\hypha_slides.txt` |
| https://youtu.be/_TpyEO6NRnY | Talk "How to do a DHO/DAO: Guide for groups building new paradigm organizations" (SEEDS: ReGenerative Renaissance), 78 minutes. | `C:\Users\taren\Desktop\Amora\governance-sources\yt_transcript.txt` (auto captions, deduplicated) |
| https://docs.google.com/document/d/1hFJPe1N0yyntJ9g-iQFvhtf9j2pDsxmmG-ufxqnAt5g/edit?usp=drivesdk | Hypha Handbook V0.3. His words: "out of date and for a different type of organization than a village but still following some of the Game mechanics we have and the self-organization and regenerative principles throughout". | `C:\Users\taren\Desktop\Amora\governance-sources\hypha_gdoc.txt` |

The deck's own framing, which the document should probably adopt as its vocabulary: governance is
three dials (voice token variance, quorum, unity), and the named corners are classic democracy,
consent, consensus, distributed voice, and on the dark side oligarchy, dictatorship, anarchy. The
start-the-game rule above is the consensus corner with every dial at maximum.

### Repository facts measured 2026-09-02

- The canonical checkout on this machine is `C:\Users\taren\Desktop\Amora\hotfix`, on `main` at
  `6f6a55e` (2026-09-01), level with `origin/main`. The other directories under `Desktop\Amora` are
  worktrees of older branches; do not read governance code from them.
- The repository is now `Rieki777/village-os` and the package is PUBLIC (renamed 2026-08-31,
  `df779e3`). The governance document will be read by people standing up villages that are not
  Amora. Write it for a fresh village, as `docs/TOKENS.md` does, and keep Amora's politics out of it.
- `docs/TOKENS.md` exists and is the shape to copy: fully generated by
  `scripts/generate-token-doc.mjs`, guarded by `scripts/check-token-doc.mjs` in CI
  (`.github/workflows/ci.yml`), person-written sentences stored INSIDE the generator and marked,
  no timestamp, a JSON block at the end, a "what this file is made from" list, and a database test
  (`server/db/tokenDoc.test.ts`) that proves the generator's rows equal the real rows.
- Two dials the token document already reports that the governance document must own:
  `governance.weight_mode` (default `equal`) and `governance.weight_token` (default `gratitude`,
  NOT `village-voice`; check this against section 7's claim that Village Voice is the weight).
- Maia's knowledge shelf is `docs/knowledge/` (`decentralized-governance.md`, `sociocracy.md` and
  five more), read by `server/lib/knowledge.ts`. A generated governance document is exactly what
  that shelf should carry about this village's own rules.
- Fourteen verified research reports on the engine as it stands on `main` (schema, engine,
  dispatcher, routes, launch, weights, flow, cycles, admin, docs, hub, inspiration, tests, legacy)
  live in `C:\Users\taren\Desktop\Amora\governance-sources\reports\`. Each has an evidence table
  with file:line citations that were re-opened by a second agent. Read them before re-deriving.

---

## 13. The engine as it actually is, measured 2026-09-02: errata to sections 1 to 11

Fourteen readers, one per subsystem, read `main` at `6f6a55e` and the files that did not change
through `8d2a9c4`. A second agent re-opened every cited line. What follows is what survived. Each
bullet names a file and, for `server/index.ts`, the string to search for, because that file's line
numbers do not hold (section 0).

### 13.1 The close dispatcher and its executors

- The dispatcher is `SUBJECT_CLOSERS` in `server/index.ts`. Search for the comment *"A subject type
  that is NOT a key here"*. It has **nine executing keys**: `mechanics`, `power_transfer`,
  `power_grant`, `power_return`, `role_declare`, `role_seat`, `role_unseat`, `village_launch`, and
  `mint_rule`, which is aliased to the mechanics executor under the comment *"ONE EXECUTOR, TWO
  SUBJECT TYPES (R81, R84)"*. `advisory` is opened with no executor by design. Section 2's "six
  types, one executor" is stale, and so is the header comment in `drizzle/0089` that lists five.
- `role_application`, `agreement`, `badge_grant` and `quest_payout` are **never opened as their own
  subject.** The wizard offers them and converts them to practice votes
  (`client/src/components/governance/TypeCards.tsx`). Section 7A's "four vote types collect real
  votes and then do nothing" overstates it: they collect practice votes, which is honest, and the
  document must say so.
- **The close route closes the ballot with one guarded UPDATE, THEN runs the executor, with no
  transaction around the pair.** An executor that throws lands in the Express 4 async patch and the
  500 handler; the ballot stays closed and passed, `notifyRoll` never fires, and only `mechanics`
  has a second door (the admin apply route). Before adding executors, write a durable "executor
  pending" row between close and route, cleared on return, so a throw leaves something a human can
  act on rather than a console line.
- `ballotBinds` derives "binding" from the same table, so absence really is fail-safe.
- **Launch goes through the same dispatcher.** `POST /api/admin/launch/propose` (founder-only,
  refused once the Game has started) opens `village_launch` at 100 unity, 100 quorum, a floor of
  three members, with `everySeatWeighs` (`shared/ballotSubjects.ts`). Its closer writes two
  `app_config` documents, `game-start` (`{startedAt, ballotId, startedBy, note}`, migration `0112`)
  and `launch-state`, and **nothing else: no role, no seat, no grant.** Founders inherit nothing at
  launch today.
- **Abstention.** `shared/governanceEngine.ts`: quorum is (yes + no + abstain) over the frozen
  total weight; unity is yes over (yes + no). So **one yes and two abstentions carries the launch at
  100 and 100.** `shared/ballotSubjects.ts` records this as a documented decision and
  `ballotSubjects.test.ts` pins that two yes plus one abstain carries. Under section 12's "every
  player must show up and agree", this is a defect to fix in the engine with a per-subject abstain
  policy or a minimum-yes-heads floor, and the pinning test rewritten red to green.
- **Closing is human, with one deliberate exception.** Mint rules stamped `pending_from_cycle` are
  promoted automatically by the hourly moon-settlement job at the boundary (search
  `pending_from_cycle`). Property 2 in section 2 ("nothing auto-executes at expiry") is already
  broken on purpose on that one path, and it is the worked example for "apply at the next cycle".

### 13.2 Thresholds, methods and dials

- `shared/governanceEngine.ts` is 168 lines and is the arithmetic: quorum checked first for every
  method; `majority` strictly above 50; `consensus` no weight on no and some on yes; `custom`
  unity at or above the frozen dial; `consent` zero standing objections. Village defaults, all in
  `game_variables` deltas: unity 80 (floor 50), quorum 20, vote window 7 days (max 30), consent
  window, default method `custom`, weight mode `equal`, weight token `gratitude`.
- **Subject floors are code.** `SUBJECT_THRESHOLDS` in `shared/ballotSubjects.ts`: launch 100/100/3
  with every seat weighing; `mint_rule` quorum 50. Also code: the majority constant, the unity floor
  of 50, the 90-day clamp, the 12-change cap, and the one-vocabulary rule. Section 7A's rule that a
  governance number must be changeable without a deploy applies to every one of these.
- **Fifteen `governance.*` keys** exist in `shared/gameVariables.ts`. The registry holds 149
  variables (122 literal entries plus 27 pushed by `VARIABLES.push(...)` near the bottom); 32 resolve
  to the founder ring, 117 to open. **`governance.weight_mode` and `governance.weight_token` are
  founder ring.** The ring header says nothing can open a founder dial to the village;
  `applyMechanicsProposal` refuses every non-open key (search *"ringOf"* in the apply path); the
  wizard hides them. **No `governance.*` key is cycle-timed.** No rhythm dial (13.7). No secrecy key,
  no steward key, no delegation key.
- **Mode switching has no irreversibility guard and never touches holdings.** The only writer is
  `PUT /api/admin/variables/:key`, which an admin may use freely; `weightModeNow` (search the
  function) reads the setting fresh at each ballot open and collapses unknown values to `equal`;
  nothing deletes or rewrites `governance_weights`, `token_balances` or `token_ledger`; open
  ballots keep the mode they froze. The code already matches section 12's reversal. What the code
  lacks is the VILLAGE's ability to vote the switch. Two documents say the opposite and must be
  fixed together: `docs/TOKENS.md` ruling 4 (its prose lives in `scripts/generate-token-doc.mjs`,
  "Staged. Not built." naming a one-way lock) and this brief's sections 6 and 7.
- **Two tokens are called Voice.** `village-voice` (platform-governed, 3 decimals, can weigh a vote)
  and `voice` (the Hypha mirror on Base, which `server/lib/governanceWeights.ts` refuses as a weight
  token). **The default weight token is Gratitude.** Section 7's "Village Voice IS voting weight" is
  true only after a founder sets `governance.weight_token` to `village-voice` by hand.
- **A display defect in token mode.** Ballot weights are ledger thousandths; a chip reading 0.1
  weighs 100 and `MyStanding` prints 100 (`server/lib/governanceWeights.ts`, `voteBars.ts`). Tallies
  are right; the number a member reads is not the number they hold. The admin mint form takes raw
  units with no hint: typing 1 for Voice mints 0.001.

### 13.3 Before launch

- **Nothing can be issued before launch, Voice included.** `issuanceRefusal` in
  `server/lib/gameStart.ts` refuses every faucet posting until `game-start` exists; it is called from
  `server/lib/ledger.ts` (two sites), the gratitude path, the economy path and the admin mint. There
  is no token exception. Section 7's "Voice is the only token issuable before the game starts" is a
  ruling the code does not implement; the code refuses it. Worse: in token mode with the weight token
  set to `village-voice`, `weightFloorProblem` refuses to OPEN the launch vote because nobody weighs
  anything, so **a fresh token-mode village cannot start.**
- The only pre-launch weight a founder can hand out is the **custom allocation table**
  (`governance_weights`, written by `server/routes/governanceWeights.ts`, append-only trail,
  self-allocation permitted). It is a number, never a token, and it appears nowhere as a proposal.
- **The admin mint refuses self-grants flat**, at any amount (search *"NOBODY GRANTS THEMSELVES POWER
  ALONE"*, migration `0106`). A lone founder cannot hand-mint Voice to themselves. Section 5's ruling
  that founders may self-allocate voice is satisfied today only by the custom table.
- Founders are a tier on `users.role`. Launch ends the founder-beyond-admin powers
  (`founderPowerStands`); the string survives on the account; `FOUNDER_EMAILS` can re-stamp it at
  sign-in without reading launch state (`server/lib/founderGrant.ts`); nobody new can be made a
  founder after launch (search *"founderStands"* near the role route). Founders are **refused by the
  six ceremonies** (power transfer, grant, return; role declare, seat, unseat) unless they hold
  `proposal.open` as a member, which unlocks at the co-creator stage. A founder-only village cannot
  open any of them.
- Nothing enforces "one to three founders".

### 13.4 After launch: admin, stewards, terms

- **The admin panel stays admin-only after launch, on purpose.** `gameStart.ts`: *"a village may
  choose never to vote in a steward and must still work completely"*. `client/src/pages/Admin.tsx`
  refuses every non-admin client-side; `isAdmin` (search *"async function isAdmin"*) is the account
  tier admin or founder; the nav hides the entry. **No admin GET reads launch state.** At HEAD there
  are 17 `role === "admin" || role === "founder"` branches in `server/index.ts`, one in
  `server/routes/places.ts`, and eight in client pages.
- **172 admin write routes** (`scripts/check-admin-reach.mjs` agrees on the total): 129 on `isAdmin`,
  41 on a capability through `guardCapability` or `mayAct` (12 keys), one bootstrap password, one
  founder-only. Two `app.use("/api/admin")` middlewares add audit attribution and DEFAULT-DENY.
  **Only two of the 172 have a proposal path today**: `PUT variables/:key` through mechanics
  proposals, and `PATCH economy/rules/:id`, which is refused after launch and redirected. `Admin.tsx`
  is 10,608 lines and mounts 47 tab components; the nav is data in `adminNavGroups.ts`. The full
  bucket table with a proposed founder / vote / steward / operator split per bucket is in
  `reports/admin.md`.
- **There is no steward in the platform, by design.** No type, flag, column, capability or seeded
  row (search *"no steward"* in `server/index.ts`). Lane STEWARD built three member-opened ballots
  (role-declarations, role-seats, role-unseats) whose executors act at close with no approval step.
  Section 7A's claim that they have no browser surface is confirmed, and so is the blind spot:
  `check-admin-reach` cannot see routes outside `/api/admin/`, so a changeset route under
  `/api/governance` would pass with no door.
- **The word "steward" already means three things.** In shipped quest copy it is the administrator
  who consents to work. "Village Steward" is a persona path in `shared/gameConfig.ts`. The founder's
  steward is an approver of passed proposals. Name them apart in the document.
- **The only post-pass human gate is the mechanics auto-apply brake.** `governance.auto_apply_enabled`
  (founder ring, default TRUE, meaning auto-apply is ON and described as an emergency brake) covers
  the mechanics closer only. When off, a pass is held with `held = "auto-apply is off"`, admins are
  notified, and `POST /api/admin/mechanics/proposals/:id/apply` (isAdmin) applies immediately,
  mid-cycle, reporting partial application as 207 or 409. Every other executor applies at close.
  **No veto object, no reason, no record.** So the code's default is the mature posture and the
  vision's default is training wheels.
- **Terms live on a different plane from powers.** Permission roles (`roles`, `role_holders`, from
  migration `0002`) carry powers and have **no term column**; `roleCapabilitiesFor` never reads
  lapse. Org-chart seats (`org_role_assignments.term_ends_at`, `org_roles.expires_each_season`,
  nullable per role, migration `0049`) carry terms and no powers. `server/index.ts` says it: search
  *"two planes that share only a word"*. `term-watch` (search `term-watch`) notifies once, daily
  checked, and its copy says *"nothing has been taken away"*. `seatLapse.test.ts` pins **NOTHING IS
  REVOKED** and `seatRecord.routes.e2e.test.ts` asserts a lapsed holder stays seated. Real expiry is
  a new rule; rewrite those tests red to green rather than around them. The `annual` reassignment
  cadence is dead code.
- `PUT /api/admin/users/:id/role` is `isAdmin`, founder-only before launch, and its own comment says
  the village does not decide its admins. No `member.role` capability exists.

### 13.5 Proposals and the member's flow

- **One flow exists end to end, for mechanics only.** Wizard draft (server-held, private, cap of
  five, autosaved to `POST /api/governance/drafts`); publish to `POST /api/game/mechanics/proposals`;
  gather supports on `/game-mechanics`; open the ballot with
  `POST /api/governance/mechanics/:id/open-ballot` (freezes roll and dials); vote (an upsert until
  `closes_at`); object (consent method only); a human closes with a required note; the dispatcher
  runs. Power transfer, grant and return publish straight into a ballot.
- **A change set is immutable.** `drizzle/0043`: *"a changed mind is a withdrawal and a new
  proposal."* There is no edit route, no PUT or PATCH on a proposal. Withdrawal: a proposal only at
  draft or open before its ballot opens; a ballot only while nobody has voted (or by `proposal.decide`
  or an admin, with a reason). A resubmission is a new proposal and a new ballot with a new freeze,
  linked only by same-subject prior attempts and, on consent ballots,
  `ballot_objections.led_to_ballot_id` (migration `0102`). **No supersedes pointer exists.**
- **Objections with text and rulings exist only under the consent method.** The default method is
  `custom`, so under defaults a member cannot record what they would like fixed. The vote widget does
  open a reason box on a `no` under voting methods too (label *"Say why, if you want to"*), but
  `votesFor` in `server/lib/ballots.ts` shows stored reasons to nobody.
- **A change set holds at most 12 open-ring dials; dials and mint rules never share a set** (the
  R81/R84 "one honest price" rule in `server/lib/mechanics.ts`); founder-ring keys are refused; a
  Voice distribution is not a vocabulary at all (weights are a direct admin write). So section 12's
  example proposal, switch the mode and distribute Voice, is refused twice and half of it cannot be
  balloted at all.
- A missed quorum returns the proposal to open and keeps its backers; a failed vote is terminal.
- **Save-honesty defects on the surface you will extend.** The wizard says *"It is in front of the
  village"* even when the server answered `draft`; *"Publishing does not start a vote"* and *"It
  needs N supporters"* render for power types whose route opens a vote on publish; the objection
  panel's "Uphold it" help claims the ballot closes when it does not; `CloseBeat` promises execution
  the brake may hold; `Admin.tsx` toasts *"Saved. The rule is live"* on `PUT variables/:key`. Read
  `scripts/check-save-honesty.mjs` and fix these before adding "propose this change" controls.
- **The launch document** (search *"# Start the Game"*) carries: what changes (*"Token issuance turns
  on."*), one quorum/unity/electorate line, an abstention sentence (*"takes no side"*), an optional
  weight-mode note, and a journey-read line. **No per-member Voice distribution, no structure
  overview, no conditions.** The frozen roll with names and weights already exists at open and is
  served by the decision page (`serveBallot`), so the data is there to embed.

### 13.6 Voter identity and who may read

- **Votes are named on purpose.** `serveBallot` says *"This village does not run secret ballots"*;
  `votesFor` returns user id, choice and weight; `VoterRoll.tsx` shows names. **No secrecy setting
  exists.** Ledger ruling **R9** (`SEASON2_FLEET_LEDGER.md`, search "R9") says ballot detail stays
  public and is *"Closed; do not re-litigate."* Section 5 records the founder's later words
  *"(defaulted to secret)"*. Two rulings collide and one of them has to be the documented default.
  This is question Q12 in section 15.
- **Anonymous reads, measured on production:** five `/api/game/mechanics` reads answer strangers
  regardless of module lifecycle (the registry, the amendment ledger with actor first names, every
  proposal with proposer names, the document, the handoff). Under `/api/governance` the list, the
  detail and the objection lineage accept a null viewer, so at lifecycle `public` the detail serves
  every voter's first name, choice and frozen weight plus every non-voter's name to the internet,
  and at `members` to any signed-in member. 23 of the 40 governance-prefixed routes carry no
  capability key. The route table is in `reports/routes.md`.
- **The governance module ships OFF.** `shared/modules.ts`: absent row means off, *"hundreds of forks
  inherit the shipped Hypha/manual loop unchanged until a founder turns this on."* Every
  `/api/governance` path is a 404 until then; the 13 `/api/game/mechanics` routes are never
  module-gated. The document must state this as its first fact about a fresh village.

### 13.7 Cycles, seasons and three calendars

- **One clock: `shared/lunar.ts`.** A cycle is a true astronomical lunation from a checked-in table
  (2020 to 2050) from cycle 330 onward, the mean 29.53-day formula before that, frozen forever
  (*"THE PAST IS FROZEN"*); ids are `lunar-NNNNNN`; the old calendar-month ids are refused at
  settlement. **The rhythm dial `gratitude.cycle_mode` was retired on 2026-08-29 at the founder's
  own instruction** (migration `0108`, `shared/gameVariables.ts` near the `0108` comment) because
  the panel offered a choice the engine did not honour. Section 12's "the cycle is a setting"
  reopens exactly that. About ten consumers import lunar arithmetic directly (`cycleIdFor`,
  `cycleBoundsFor`, `currentCycle`, `dueCycles`, health snapshots, module usage, mint and library
  caps, the calendar's cycle-close recurrence, the client `CycleClock`). If the dial returns, build a
  `CycleClock` seam first and route every consumer through it, or 0108's defect returns with it.
- **Nothing scheduled closes a cycle.** An admin presses `POST /api/admin/cycles/close`, which
  settles every overdue lunation in one press and only then applies held governance, and only while
  `auto_apply_enabled` is on. So "at the new moon" today means "when an admin next closes the
  moon", which can lag by days and can land several lunations at once. The exception is mint rules,
  promoted by the hourly job at the true boundary.
- **`CYCLE_APPLY_KEYS`** (ten dials plus the stage multipliers) wait for cycle close; every other
  dial and every non-mechanics executor applies at close. There is no `lands_at_cycle` column; the
  held state is implicit, a status plus a live check against a code list that can change between
  the vote and the close. A held proposal never tells the member which cycle it lands in; mint rules
  do (`pending.fromCycle`).
- **Seasons are a different object.** A `startsOn`/`endsOn` list in the village timezone
  (`America/Costa_Rica` civil dates) in `shared/gameConfig.ts`, derived on read, never rolled by a
  job; the season cadence's `lunar` option only moves a date suggestion by 30 civil days. **Claims
  week runs on solar MM-DD dates in UTC** and its copy in `gameVariables.ts` wrongly claims the
  moon's rhythm. `term-watch`'s 14 days is a literal. **No governance week exists.** Three
  calendars, none reads another. Section 3's "one setting drives both" was right and bigger than it
  looked: `expires each season` and `next lunar cycle` are two clocks today.
- The hub still runs the mean formula, so village and hub boundaries can differ by up to 17.6 hours
  from cycle 330 until the hub adopts the table.

### 13.8 The hub bridge: corrections to section 7A

- **Nothing is sent to the hub unless BOTH `governance.hub_url` and the secret are configured.**
  Section 7A's sentence that a fork configuring nothing registers its outcomes with one organisation
  is not what the code does; the `regencivics.earth` default is live only for crowdpool reads, gated
  on that module. The default-URL question (blank like `FEEDBACK_HUB_URL`, or kept) still stands.
- Still unproven end to end, in both directions. **Four displays are false today:** `hub_link_synced`
  is never set true so the UI always says "hub sync pending"; the hub never sends a space id so the
  space check idles on every delivery; `hypha_outcomes.source` is hardcoded `"hub"`; the card says
  the secret is "issued" by a hub that issues nothing. The hub stores fork secrets in plaintext, its
  outbound is a bare fetch, and it decodes `yesVotes`/`noVotes` and drops them, so the village cannot
  state people-and-weight for a Hypha ballot. Hypha-decided ballots are counted by Hypha, so the
  village's mode switch cannot reach them. `server/lib/hypha/switchover.ts` already makes the
  on-site/Hypha method switch reversible.

### 13.9 Tests: corrections to section 7

- "Currently unreliable" is stale. `c0ac180` (2026-08-31) made the harness say what it ran, named
  five flakes in the ledger, added no retries, and found no governance defect; the governance case now
  waits on a clock. The 100/100/3 launch rule is the best-covered piece of the vision (`launchVote`,
  `launchWeight`, `founderEnds`, `ballotSubjects` suites). Nothing is `.skip` or `.todo`; the only
  conditional skips are database gates, and `pnpm test:full` turns a hollow run into a failure.
- **The "byte-identical `ballots.test.ts`" rule is prose only.** Nothing enforces it; the file is
  unchanged since 2026-08-22. A sha256 self-test in `scripts/` (auto-globbed by
  `run-self-tests.mjs`) would make it real.
- **Zero tests** on `governance.auto_apply_enabled`, on the proposal withdraw route, or on the
  anonymous behaviour of the two governance list routes.

### 13.10 Documents and pages that disagree with the code or the vision

- `docs/knowledge/decentralized-governance.md` pattern 6: *"What NOT to copy: one-token-one-vote."*
  Maia loads that shelf at boot and CI voice-checks it. `docs/COORDINATION_SUBSTRATE.md` says never
  build token-weighted governance and that lapsed holdings keep power; the ADR says the same. Both
  now contradict rulings. `docs/ARCHITECTURE.md` never mentions ballots, `0089`, quorum, unity or
  `SUBJECT_CLOSERS`; `docs/VILLAGE_OVERVIEW.md` has no governance section. The R54 to R90 rulings
  register (`GOV_DESIGN`) is not in this repository; code comments are the only copy.
- **Nine public pages state governance that is not true**, and the repository is public now:
  `HowWeCreate.tsx` (a Board, an Advisory Council, eight circles, a Leadership Council, per-circle
  Hypha thresholds), `StewardRights.tsx` (a quarterly season vote, voice by years), `Circles.tsx` and
  `Governance.tsx` (a General Coordinating Circle, double links, elected representatives, "logged on
  Hypha"), `CoCreatorsGuide.tsx` (delegation, monthly calls, "founders cannot override"),
  `ResidentJourney.tsx` (voice grows with tenure), `Roles.tsx`, `GoodNeighbor.tsx` (a Resident Circle
  admission vote; only `membership.vouch_threshold` exists). `reports/legacy.md` has every line.
- `docs/TOKENS.md`'s per-token human sentences carry no marker, contrary to its own header;
  `check-voice` does not scan `docs/` outside `docs/knowledge`; `check-doc-links` checks six named
  documents only; `season_roll_log` is written and never read; the `0091` header says `0090`.

### 13.11 What the inspiration has that the engine does not

Measured against the deck, Handbook V0.3 and the talk (`reports/inspiration.md`). **Already here:**
unity and quorum exactly as Hypha defines them (the 80/20 default is named in the code as inherited
from Hypha), frozen snapshots, a 7-day vote period, consent objections with attributed rulings,
withdrawal with a reason, Voice mint rules on confirmed contribution, reversible modes. **Missing:**
voice half-life (Hypha halves earned voice yearly; R66 leaves waning to Hypha), a variance dial or any
concentration display, the named presets, circle-scoped ballots (`ballots.circle_id` was dropped in
`0095`; circles carry a `decides_by` word only), delegation, a secrecy setting, a steward,
per-subject auto-execute, edit and resubmit, real expiry, badge voice bonuses, a vouching step, and
any comms cadence. **Hypha's principles worth carrying:** structural votes (role, circle, badge,
policy) are village-wide and activity votes (assignment, quest, expense) belong to the paying circle,
and roughly 80% of decisions are never voted at all; "it is easier to not say yes than to say no",
so everything a member holds expires within at most three lunar cycles; passed decisions execute with
no approver, which is the end state the founder's steward gradient points at. **The sharpest tension
with section 12:** "every admin edit becomes a proposal" has no precedent in the inspiration, which
votes structure and resources and leaves operations to role holders. Recommend classifying every
admin write (founder / vote / steward / operator) as data both the document and the gate read.

---

## 14. Vision against code: the gap table

| Section 12 element | Exists today | Missing | Where it attaches |
|---|---|---|---|
| One to three founders | `users.role = founder` tier; ends at launch | Nothing enforces a count | Document the tier; enforce only if he asks |
| Only Voice issuable before launch | Custom weight table (a number); every faucet refused | A pre-launch issuance door for `village-voice` alone; a proposal-shaped record | One slug exempted in `issuanceRefusal`, proven at boot; or rename the custom table "founding allocation" and render it as a proposal |
| Start rule: 3 voters, 100/100 | `village_launch` floors, `everySeatWeighs`, tests | Abstain counts as showing up, not agreeing | Per-subject abstain policy or `minYesHeads` in `SUBJECT_THRESHOLDS` |
| Start document shows Voice distribution, structure, conditions | Dials, head count, abstain sentence, mode note | The distribution table, an overview, the conditions | The launch document builder; the frozen electorate is already computed at open |
| Admin section visible to all after launch | Admin-only by design; 172 writes, 129 `isAdmin` | Any launch-state read on an admin GET | Split `isAdmin` into `mayReadAdmin` (any member once `readGameStart().started`) and `mayAct`; classification per route |
| Edits become a change log, then one proposal | Server-held drafts; mechanics `change_set` (12 dials, one vocabulary) | A changeset subject spanning dials, weights, mode, modules, brand, roles, mint acts | Extend `mechanics_proposals.change_set` with key namespaces (the recipe comment in `server/index.ts`, search *"third vocabulary"*); price a mixed set at the max floor |
| Passed changes land at the next cycle start | `CYCLE_APPLY_KEYS` (ten dials); mint rules via the hourly job | A default of next-cycle; a `lands_at_cycle` fact; one apply gate | `lands_at_cycle` stamped at pass; `applyDueGovernance(pool, at)` called from both the human close and the settlement job |
| Lunar default, cycle as a setting | `shared/lunar.ts`, one clock, dial retired 2026-08-29 | The setting, and a seam for its consumers | `CycleClock` interface; `cycle.mode` key, launch-grade, cycle-close timing, past frozen |
| Vote mode switchable both ways by proposal | Reversible by admin PUT; holdings untouched | The village's vote; a record | Own subject type `governance_mode` with its own floor; executor calls `setVariable`; cycle-close timing |
| Holdings survive a switch | True by construction | A round-trip test | `token → equal → token` asserting frozen weights equal the original |
| Multi-element proposals | 12 dials, one vocabulary | Mixed vocabularies; ledger acts as elements; atomic apply | Typed items (dial, mint rule, weight allocation, mode switch, module lifecycle); max floor; one transaction, applied/failed printed |
| Objection with "what to fix" | Consent-only objections; `no` reason stored, shown to nobody | A structured ask on every method; visible to the proposer | Reuse `ballot_votes.reason`; add a nullable `ask` column; serve on `votes[]` |
| Withdraw, edit, resubmit | Withdraw (limited); new proposal; consent lineage | An edit before freeze; a supersedes link; objections travelling | `supersedes_proposal_id`; a "withdraw and rewrite" door that clones the set into a draft; PUT refused once a ballot is open |
| Steward approves before effect | Mechanics brake (default auto ON), admin apply route | A role, an approval act, a veto with a reason, a record | `ballot_approvals` (ballot_id PK, decided_by, decision, reason NOT NULL on refusal); `needsSteward` beside each subject; `held = "waiting for a steward"`; `POST /ballots/:id/approve` and `/refuse` gated by a new `steward.approve` capability |
| Founders inherit the steward at launch | Launch closer writes two facts | The seating | Inside the `village_launch` closer after `recordLaunchCarried`: find-or-create the role, grant the capability, seat every founder with a term ending at the next turn, idempotent on (role, user) |
| Steward expires each season unless re-voted | Terms on seats only; nothing revoked | Term columns on the permission plane; revocation; loud vacancy | Nullable `term_ends_at`, `season_id` on `role_holders`; `roleCapabilitiesFor` drops lapsed; `term-watch` reused with new copy; the vacancy shown on the approval route and `Decision.tsx` |
| Auto-execute as a gradient | One founder-ring boolean, mechanics only | Per-subject flags | A per-subject map defaulting off, read in the closer wrapper; `auto_apply_enabled` kept as the mechanics entry |
| Delegation | The word in `shared/power.ts` | Everything | Section 4's design: copy the choice, never move the weight; refuse cycles at creation; show effective concentration |
| Voter identity secret by default | Named on purpose; R9 says closed | A setting; viewer-aware serving | `serveBallot` viewer-aware: names for the frozen roll or under a village setting; tallies and counts for everyone |
| Percent of total voice per player | Nothing | `shareOfTotal` | On `GET /api/governance/weights` and `/standing`; token mode divides by issued supply, custom by the table sum, equal by electorate count; shown on `MyStanding`, `WeightRecord`, the launch document |
| People AND weight in every vote sentence | The card computes `votedCount`; the launch document says "N people hold a voice" | The rule applied everywhere | Generate the sentence from `votes.length`, `electorate_count` and tallies at close |
| Governance numbers changeable without a deploy | Dials in `game_variables` | Subject floors, abstain rule, majority constant, unity floor, 12-cap | Move `SUBJECT_THRESHOLDS` into `game_variables` with the registry as floors |
| A generated, guarded document | `docs/TOKENS.md` and its scripts | `docs/GOVERNANCE.md`, generator, guard, self-test, database test | Section 16.2 |

---

## 15. Questions for the founder, 2026-09-02 (replaces section 10)

Section 10's questions were confirmed still open by the readers and are folded in here. Each
question carries a recommendation. The first twelve decide the SHAPE of version 1.0 and need his
answer before the document is generated; the rest ship with the recommended default and change by
ruling. Put the whole list in front of him WITH the draft document, because he asked for a draft to
react to rather than a questionnaire.

### Decisions that shape version 1.0

**Q1. Which token is "Voice"?** Two rows carry the name: `village-voice` (platform-governed, can
weigh a vote, accrues here) and `voice` (the Hypha mirror on Base, read-only, refused as a weight
token). The default weight token is Gratitude. *Recommendation:* `village-voice` is THE Voice; the
Base mirror is "Voice claimed across"; `governance.weight_token` defaults to `village-voice` when the
token exists; the custom allocation table is renamed the "founding allocation" and survives until
launch.

**Q2. How do founders issue Voice before launch?** Every faucet is refused until the launch vote
carries, self-mint is refused flat, and a token-mode village cannot even open its launch vote.
*Recommendation:* one named "founding allocation" act, allowed only before launch, minting
`village-voice` through one slug exempted from the issuance gate and proven at boot; self-grant
allowed there with every player's share of total shown; recorded as a proposal-shaped entry the
launch document embeds. Every other faucet stays gated.

**Q3. Is an abstention agreement on the start vote?** Today one yes and two abstentions carries at
100 and 100. *Recommendation:* no. Give `village_launch` a policy that every frozen seat must vote
yes, and make abstain policy a per-subject setting so other subjects keep the Hypha rule.

**Q4. What is "the start of the next lunar cycle"?** The astronomical instant (a scheduler applies
it, as mint rules already are) or the moment an admin closes the previous gratitude cycle (a human
act that can lag by days)? *Recommendation:* the instant, through one `applyDueGovernance` gate that
both the settlement job and the human close call, so either may run first and neither applies twice.

**Q5. Does the cycle become a setting again?** He retired the rhythm dial on 2026-08-29 because it
lied about what the engine did; `shared/lunar.ts` is the one clock and cycle numbers are natural keys
on settlement rows. *Recommendation:* NOT in version 1.0. Document lunar as the one clock and the
setting as staged, and if it returns, build the `CycleClock` seam first, make the switch launch-grade
and boundary-timed, freeze every closed cycle, and drive seasons, claims week and governance week
from the same clock.

**Q6. The steward, in five parts.** Which plane (permission roles carry powers and no terms; org-chart
seats carry terms and no powers)? With several founders, one seat each, and does approval need one
or all? What executes when the seat is empty at a season turn? Is the refusing steward named? Does a
refusal end the proposal or return it? *Recommendation:* the permission plane with term columns
added; one seat each and any one steward approves; passed proposals QUEUE when the seat is empty (the
dispatcher's `held` field is the queue marker) and the vacancy is loud; the steward is named, because
his answer every time has been that transparency is the protection; a refusal returns the proposal to
its proposer with the reason and keeps its backers, the way a missed quorum already does.

**Q7. Late approval.** A steward approves after the new moon has passed. *Recommendation:* the
proposal rolls to the following boundary, because it is the only rule under which "takes effect at the
start of a cycle" stays literally true; the row shows its new landing cycle; no deadline and no lapse.

**Q8. Does `governance.weight_mode` leave the founder ring?** It was placed there to stop a majority
entrenching itself. *Recommendation:* yes, as its own subject type `governance_mode` with a
launch-grade floor (100 and 100) or the village's own dials plus steward approval, timed to cycle
close, so the switch has a record instead of a PUT. Keep the founder-ring refusal inside ordinary
mechanics proposals so a dial change cannot smuggle it.

**Q9. Multi-element proposals: one threshold, and what happens when item four of seven fails?**
*Recommendation:* the ballot freezes the MAX of every element's floor (`dialsForSubject` already takes
a max; extend it to a list); apply in one transaction, all or nothing, and print applied and failed
by name. Keep the cap of 12.

**Q10. What does "all members can see the admin section" include?** The panel has 47 tabs, among
them secrets (masked), integrations, uploads, email configuration, investor documents, deletion
routes, and rosters with emails. *Recommendation:* every GAME tab becomes readable by any member once
the Game has started, with every control rendered as "propose this change"; the operator tabs stay
with whoever runs the deployment; rosters carrying personal data stay behind membership and never go
to strangers.

**Q11. What can never be changed by proposal?** The old list loses the governance mode.
*Recommendation:* secrets and integrations, abuse guards and session lengths (the founder-ring
categories), the right-to-be-forgotten route, cycle close itself, refunds and card confirmations,
anything retroactive on a closed ballot, and the thresholds for changing thresholds. Villages may add
to the list and never remove from it.

**Q12. Voter identity.** Ledger ruling R9 says ballot detail stays public and is closed; he later
said "defaulted to secret". Both cannot be the documented default, and the start document's Voice
distribution presumes holdings are visible. *Recommendation:* names and choices visible to the frozen
roll (members) and hidden from strangers; tallies, counts and shares of weight public; a true secret
ballot offered as a setting, default off, as a later stage. This is his call and the document should
carry whichever he gives verbatim.

### Decisions that can ship with a default

**Q13.** "Three different parties" means three distinct member accounts. **Q14.** The roll stays
frozen; a member who leaves mid-vote makes 100% quorum unreachable and the vote is re-run with one
click, which the launch page should say. **Q15.** Objections with a "what would fix it" ask exist on
every method, not only consent; `ballot_votes.reason` is reused. **Q16.** A resubmission is a new
ballot with a fresh freeze; votes do not carry over; the predecessor's objections and asks travel to
it as "asked to be fixed" and both show on one page. **Q17.** Granted powers reset with the seat.
**Q18.** Mint rules keep their automatic promotion at the boundary until the gradient is built, then
sit under the same per-subject flag as everything else. **Q19.** Voice waning is offered as a
per-token half-life dial, default off, applied at cycle close as a posting to a sink; permanence stays
the default. **Q20.** Governance week, claims week and the term notice become one window derived from
the season's end, default seven days, and `term-watch`'s 14 becomes a variable. **Q21.** Maia's shelf
and `COORDINATION_SUBSTRATE.md` are amended to say the village chooses its mode with concentration
shown; the nine public pages drop the 2025 institutions or label them as history. **Q22.**
`governance.hub_url` ships blank, like the feedback relay, and the Hypha route is documented as a
later maturity stage rather than the binding vote of a launch-era village. **Q23.** The document
describes a FRESH village, as `docs/TOKENS.md` does, with the running village's chosen dials shown
by the admin page and never by the document. **Q24.** The five anonymous mechanics reads and the two
governance list routes answer strangers with tallies and titles only; per-person records need a
session. **Q25.** Under one-person-one-vote a member holding no Voice still votes, weight 1, which is
what `equal` mode does today.

---

## 16. Improvements to the plan

### 16.1 Write the document before the features, and let it name what is broken

Version 1.0 describes TODAY, including every gap in section 14, every ruling in sections 3, 4, 5 and
12 marked Built, Half built or Staged (the `docs/TOKENS.md` convention), and the residual defects:
the abstain carry, the three anonymous routes, the module lifecycle edited by hand, the hub relay's
four false displays, the 3-decimal display, the two Voice tokens, the dead `annual` cadence, the
stale schema comments. He asked for a draft to react to. A document that says "the steward does not
exist yet, and here is what the founder has ruled it will be" is more useful to him than one that
waits for the steward to exist.

### 16.2 The generator, file for file

Copy the sibling: `scripts/generate-governance-doc.mjs` (no shebang, for the same reason the token
generator has none; exports `ROOT`, `DOC_PATH`, `SOURCES`, `generateDetailed`, `--stdout`; a
`ReadError` that names the file and the text it could not read), `scripts/check-governance-doc.mjs`
(a copy of `check-token-doc.mjs` with the imports changed; CRLF normalised; `--list`; a pass line with
counts), `scripts/generate-governance-doc.test.mjs` (auto-globbed by `run-self-tests.mjs`;
determinism; both-direction prose coverage; an unknown dispatcher key refuses; an unknown
`governance.*` dial refuses; every human sentence run through `check-voice`'s `checkSpan`), and
`server/db/governanceDoc.test.ts` (the real `evaluateBallot`, `unityPctOf`, `quorumPctOf`,
`thresholdsForSubject` and dial defaults against the document's numbers).

**Sources, each read by an anchored, fail-loud reader:** `SUBJECT_CLOSERS` keys;
`SUBJECT_THRESHOLDS`, `CONDUCTABLE_TYPES` and the wizard's type list (three drift pairs the document
can check today); `BALLOT_METHODS` and `VOTE_CHOICES`; every Governance-category `VariableDef` with
`ringOf` and `applyTimingOf`; `CYCLE_APPLY_KEYS`; the capability keys and `DENIABLE`; the governance
module definition; the route registrations under `/api/governance` and `/api/game/mechanics` with
their auth (this needs a thin registration wrapper that records the capability key beside the path,
so `capabilityRegistry.ts` stops being hand-declared); `readGameStart` and `issuanceRefusal`'s
sentence; `shared/lunar.ts` constants and id format; the hub payload shape and the three posture
sentences; `registeredJobs()`.

**Structure, mirroring `docs/TOKENS.md`:** purpose; fresh-village scope; how to read this file; the
constitution in one screen (Ring 0, the launch rule, what can never be proposed), ahead of the long
tables, as Hypha keeps its strict rules short; what a decision is; how a vote is counted (formulas,
the abstain rule, the four methods); the dials (key, label, ring, default, bounds, apply timing);
what each kind of decision asks (floors, method, who may open, what executes, "conducts a decision
and executes nothing" for absent types); starting the Game; voting weight (modes, the weight token
rule, the trail, the display units); who may do what; what a village publishes (the anonymous routes,
read from registration); the cycle; the bridge, stated honestly; the founder's rulings (date,
verbatim, status); a machine-readable JSON block; what this file is made from.

**Rules for the generator:** every vote sentence states people AND weight together; a preset
read-back names which Hypha corner the village's dials describe (classic democracy, consent,
consensus, distributed voice, and the warning corners); the three stewards are named apart; the
module-off fact comes first; human prose is marked where it appears (fixing the sibling's half-kept
promise); anchors are syntax and exported symbols, never line numbers; the commit SHA is printed
inside the document; a Staged ruling carries a narrow staleness guard so "not built" cannot outlive
the build (copy `generate-token-doc.mjs`'s pattern).

**Wiring:** `docs/GOVERNANCE.md -text` in `.gitattributes`; two `ci.yml` steps beside "Token doc";
a `CLAUDE.md` gate line; a README door beside "Understanding the tokens"; one pointer each in
`ARCHITECTURE.md`, `VILLAGE_OVERVIEW.md` and `FORK_RUNBOOK.md`; the document added to
`check-doc-links`; `check-voice` extended to `docs/TOKENS.md` and `docs/GOVERNANCE.md`. Rewrite
ruling 4 in `generate-token-doc.mjs` and regenerate `docs/TOKENS.md` in the same commit.

**A second gate worth building:** "what the site says". Grep the public pages for retired governance
nouns (Development Board, Advisory Council, Leadership Council, General Coordinating Circle, double
links, eight Sociocratic Circles, votes on what kind of season) and fail on a new hit, the shape of
`check-fund-claims.mjs` in the hub.

### 16.3 The features, in the order the seams suggest

1. **Steward approval at one seam.** A wrapper on `SUBJECT_CLOSERS`: on passed, if the subject needs a
   steward and no auto-execute flag covers it, write the approval row and return
   `held = "waiting for a steward"`; the approve and refuse routes re-enter the same closer body;
   `Decision.tsx` already renders `held`. Auto-execute becomes a per-subject map defaulting off.
2. **Founders seated as stewards inside the launch closer**, idempotent, with a term.
3. **Real expiry on the permission plane, with a loud vacancy.** Rewrite `seatLapse.test.ts` and the
   seat-record e2e as the new rule first.
4. **`lands_at_cycle` and `applyDueGovernance`.** Stamp the landing cycle at pass; one gate, two
   callers; a held row tells the member which moon.
5. **The changeset as namespaces on `mechanics_proposals.change_set`**: module lifecycle, weight
   rows, weight mode, brand fields, roles, mint acts; every namespace applied through the existing
   writer so every refusal runs at apply time (`setModuleLifecycle`, `setModuleConfig`, the mechanics
   writer, the org executors, `setWeight`, the brand writer); never a direct table write; priced at
   the max floor; applied in one transaction.
6. **`mayReadAdmin`**, the smallest honest permission inversion, on admin GETs only, with every
   control on the member's view rendered as "propose".
7. **`supersedes_proposal_id`** and the "withdraw and rewrite" door; a PUT refused once a ballot is
   open, so editing is honest before the freeze and impossible after it.
8. **Viewer-aware `serveBallot`** and the secrecy setting, whichever way Q12 goes.
9. **`shareOfTotal`** on weights and standing, in display units, on the launch document too.
10. **Delegation**, exactly as section 4 designs it.
11. **The launch document widened** with the distribution table, the structure overview and the
    conditions, generated from the same sources as the document.

### 16.4 Tests to write red first

Pending approval applies nothing and `held` names the steward; approval executes; an empty refusal
reason is refused; a refusal records name, reason and ballot; a founder inherits at launch with a
term; a lapsed steward's capability is gone and the vacancy is visible; `token → equal → token`
leaves frozen weights equal to the original allocation and `governance_weight_changes` carries no
deletion; a passed changeset lands at the next new moon and not before; a mixed set is priced at the
max floor; item four of seven failing applies nothing; the launch document carries a distribution
table and a people-and-weight sentence (replace the head-count assertion in
`launchWeight.routes.e2e.test.ts`); the two list routes pinned anonymous or not; a launch with an
abstention refused; a sha256 self-test on `ballots.test.ts`.

### 16.5 Housekeeping the readers found

Fix `TOKENS.md` ruling 4 in its generator; state the two schema-comment drifts (`0089`, `0091`) in
the generated document rather than editing shipped migrations; read or delete `season_roll_log`; add
the `FORK_RUNBOOK.md` row for `HYPHA_VOICE_WEBHOOK_SECRET`; correct `ARCHITECTURE.md`'s feedback
default; give the three steward routes a page and extend `check-route-reachability` so
`/api/governance` writes stop passing by blind spot; put a decimals hint on the admin mint form; fix
the copy in `gameConfig.ts` ("per calendar-month cycle") and `gameVariables.ts` (claims week's
rhythm); move the five named flakes into `scripts/known-flakes.json`.

---

## 17. What to do first (replaces section 11)

1. **Your own worktree from `origin/main`**, `.env` copied in, built, and the three governance suites
   run alone and inside the full run before you touch anything. Say the commit SHA in everything you
   generate.
2. **Read the fourteen reports** (section 18), then re-measure every `server/index.ts` anchor on your
   HEAD. Write down, in your own words, what the engine does and where each section 14 seam is. If
   that description is wrong, everything after it is wrong.
3. **Generate `docs/GOVERNANCE.md` version 1.0 as the document of TODAY**, with the generator, the
   guard, the self-test and the database test, the rulings section carrying every quote in sections
   3, 4, 5 and 12 with its date and status, and every section 14 gap named as staged.
4. **Put section 15 to him with the draft**, the twelve shaping questions first. He answers once.
5. **Then build in section 16.3's order.** Steward approval and real expiry first; his model rests
   on them. Ship the changeset subject and staging before its executor, as section 2 says; the
   dispatcher's fail-safe absence makes that safe.

---

## 18. Where the research lives, and how far to trust it

- **Reports:** `C:\Users\taren\Desktop\Amora\governance-sources\reports\` holds fourteen files
  (`schema`, `engine`, `dispatcher`, `routes`, `launch`, `weights`, `flow`, `cycles`, `admin`, `docs`,
  `hub`, `inspiration`, `tests`, `legacy`), each with an evidence table (claim, file:line, quote), a
  conflicts list, a gaps list, questions and improvements. `_synthesis_input.txt` in the same folder
  is every reader's summary plus every verifier correction in one file. These are outside the
  repository on purpose: they cite a moving file by line and would rot inside it.
- **Verification:** thirteen of the fourteen were re-opened line by line by a second agent. Tallies
  (confirmed / wrong / unverifiable): schema 33/8/0, engine 40/0/0, dispatcher 40/1/0, routes 40/0/0,
  launch 24/16/0, weights 30/9/1, flow 22/18/0, admin 26/15/0, docs 32/7/0, hub 38/4/0, inspiration
  37/4/0, tests 35/5/0, legacy 39/1/0. **Every "wrong" was a `server/index.ts` line number that had
  moved under the reader, with the substance confirmed and the corrected line recorded**, except
  three: the launch reader's 18-branch count is 17 at HEAD; the admin reader's 143/29 split of the
  172 routes does not reproduce (only the total holds); and "every amendment-ledger row carries the
  ballot id" holds only for on-site passes (a Hypha-verified proposal writes `hyphaRef` and no ballot
  id).
- **Unverified:** the `cycles` reader's citations were never re-opened (the verifier ran out of
  session). Its clock facts (`shared/lunar.ts`, the retired dial, the human cycle close, mint-rule
  promotion, `CYCLE_APPLY_KEYS`, the three calendars) were each stated independently by the
  `launch`, `admin`, `engine` and `dispatcher` readers, whose citations were verified. Treat its
  `server/index.ts` line numbers as locators only.
- **The completeness critic never ran.** Nobody asked "what is missing across all fourteen". Areas
  no reader was assigned: notifications for governance events (`server/lib/notify.ts`), the ledger
  and audit trail for governance acts as such, the members and tiers model (who counts as a player
  for 100% quorum), the calendar and gathering hooks, Maia's answers about governance, i18n of
  governance copy, `server/lib/dryRun.ts`, and the equity token's relation to voting. Cover them
  before you call the document complete.
- **Sources the founder gave:** `hypha_slides.txt`, `hypha_gdoc.txt` (Handbook V0.3),
  `yt_transcript.txt` (the talk, auto captions), and `session63dc_user_turns.txt` (his own words
  from the session that wrote sections 1 to 11), all in `governance-sources\`.

---

## 19. Rulings of 2026-09-02, evening: the founder answers section 15

He answered the shaping questions in one message. His words first, then what each one changes.
Where he wrote "explain", the coordinator's explanation and the default it proceeds on follow.
These supersede section 15's recommendations where they differ.

### Q1, which token is Voice: no objection raised

He did not answer Q1 separately and wrote "Love them all" of the recommendations. **Proceed:**
`village-voice` is THE Voice; the Base mirror `voice` is "Voice claimed across";
`governance.weight_token` defaults to `village-voice`; the custom allocation table becomes the
"founding allocation" and survives until the Game starts.

### Q2, pre-launch Voice, plus a new idea: voice for other beings, and clans

> "part of step 2 is to encourage to name non-human governance roles in your Game (other beings who
> live on the land) to be part of governance. - For example giving voice to nature (a mountain your
> project is on a river it borders, the trees and fauna and flora that shares that piece of earth
> with us) - this creates another idea where a governance function of 'clans' (which groups can name
> whatever they like and change this name in admin) but groups within the village that anchor on
> living beings. The water group would tend to the waters the earth group to the land the air group
> to the air, etc the wolf group would tend to restoring this apex predator - which requires
> restoring the whole pyramid underneath the beaver clan, etc. etc all clans are namable in admin as
> well. But these other actors can be given voice - though this is considered a mature feature to
> build into the Game once you hit 144+ people."

What it changes: the founding-allocation act stands (Q2's recommendation), and the founding step
should INVITE the catalysts to name non-human governance roles: a mountain, a river, the trees, the
fauna and flora that share the land. **Clans** are a new governance object: groups within the
village, each anchored on a living being or element (water, earth, air, wolf, beaver), each tending
what it is named for, every name editable in the Game Mechanics section. **Non-human actors may be
given Voice**, and that is a MATURE feature, unlocked at 144 or more players. Version 1.0 documents
clans and non-human voice as staged, names the unlock, and builds the naming surface only.

### Q3, the start vote: a Birthing, unanimous, and the word Catalyst

> "No we need 100% saying yes as a collective 'Birthing' moment where you reveal the game, it's at
> LEAST 3 but could be many more people who then activate a new game before they all switch to
> being 'players' instead of just the catalysts (we say Catalyst instead of founder for those who
> play the game this way."

What it changes: **every frozen seat must vote YES**; an abstention does not carry a launch. The
launch is called the **Birthing** and its proposal reveals the Game. Three is the floor, never the
target. **The word is Catalyst, never founder**, in every surface a player reads; `users.role =
founder` stays as the storage value with the display name changed, because the slug is history's
identity (section 7). After the Birthing, catalysts become players like everyone else.

### Q4, what "the start of the next cycle" means: explained, and the default

He wrote: "I don't understand this fully."

The question, in plain words. Today the moon turns on its own, but the Game only notices when an
administrator presses "close the cycle" on the admin page. That press can come a day late or a week
late, and if two moons have passed it closes both at once. So "a passed proposal takes effect at
the next new moon" can mean two different things:

- **the moment of the new moon itself**, which needs the server to apply the change on its own, on
  a timer, with no person in the loop at that instant; or
- **the moment somebody presses close**, which is a human act but can land days after the moon.

The engine already does the first for one thing: a new minting rule voted in during a moon takes
effect automatically at the next new moon, by a job that runs every hour. **Default the
coordinator proceeds on:** the new moon itself. A passed proposal is stamped with the cycle it
lands in, one routine applies everything that is due, and both the hourly job and the human close
call that routine, so whichever runs first applies it and the other finds nothing left to do. A
member sees "lands at cycle 331" on the proposal from the moment it passes.

### Q5, the cycle as a setting: yes

> "Yes the cycle structure can be changed."

What it changes: the rhythm setting returns, lunar by default, with the seam section 13.7 requires:
one `CycleClock` interface every consumer reads through, a calendar implementation with its own id
prefix, past cycles frozen with the ids they closed under, the switch itself launch-grade and
boundary-timed. Seasons, claims week and the governance window read the same clock.

### Q6, stewards: accepted, and the end state named

> "Sure and it's perfectly fine to have no stewards and for the game to have self/executing
> agreements - Stewards are like the 'training wheels' to the game to help them start - not a
> desirable endstate. Except one where we're all stewards in our own way."

What it changes: section 15's Q6 recommendation stands in full (permission plane with terms, one
seat per catalyst, any one steward approves, proposals queue when the seat is empty, the steward is
named, a refusal returns the proposal with its reason). And the document must say plainly that a
village with no steward and self-executing agreements is a HEALTHY state, the one the training
wheels come off into. Never render an empty steward seat as a warning once a village has chosen it.

### Q7, late approval: explained, and the default

He wrote: "explain?"

The situation: a proposal passes on the 20th of the moon. The steward is away and approves it on
the 2nd of the next moon, after the new moon has already come and gone. Three things could happen:
(a) it takes effect the instant the steward approves, mid-moon, which breaks the promise that
changes land at cycle starts; (b) it waits for the NEXT new moon after the approval, so the promise
holds and the proposal shows its new landing date; (c) it expires because the steward missed the
moon, which punishes the village for a steward's absence. **Default the coordinator proceeds on:**
(b). The proposal rolls to the following new moon and the page says so.

### Q8, the vote mode leaves the founder ring: yes

> "yes"

What it changes: `governance.weight_mode` becomes proposable through its own subject type,
`governance_mode`, with a launch-grade floor, timed to the cycle boundary, with a record. The
ordinary mechanics path keeps refusing it so a dial change cannot carry it by the side door.

### Q9, multi-element proposals: explained, and the default

He wrote: "explain"

Two things hide in one question. First, **the threshold.** Each kind of change carries its own
floor: a minting rule needs 50% quorum, the Birthing needs 100 and 100, a small dial needs the
village's ordinary 20 and 80. When one proposal bundles a mode switch (a big change) with a Voice
distribution (a ledger act), which floor does the ballot use? **Default:** the highest floor among
its elements. A bundle is as hard to pass as its hardest part, so nobody can smuggle a big change
under a small one. This also fits the Q11 ruling: the most critical element sets the bar.

Second, **what happens when part of it fails.** Seven changes pass as one proposal. When the moon
turns and the Game applies them, the fourth one is refused, say because a module it turns on was
deleted last week. Two choices: apply the six that work and report one failure, or apply nothing
and report which one blocked. **Default:** nothing applies, and the proposal shows exactly which
element blocked it and why, so the proposer can withdraw, fix, and resubmit. A proposal that
half-applies leaves a village in a state nobody voted for.

### Q10, the Game Mechanics section, always public

> "yes, no PII exposed, but all the admin sections I'm able to see now as I'm making the Game. So
> truly there's no reason to ever hide these behind admin. Instead name them the 'Game Mechanics'
> section that's always public."

What it changes, and it is large: **the admin panel's game tabs are renamed the Game Mechanics
section and are PUBLIC, always, before and after the Birthing.** Before the Birthing, catalysts
edit directly and everyone can watch the Game being made. After it, every control becomes
"propose this change" for every player, and the edits collect into one proposal. Personal data
(rosters with emails, addresses, payment records) and operator matters (secrets, credentials,
integrations, uploads, deletion) are never exposed; they are not part of the Game Mechanics
section and stay with whoever runs the deployment.

### Q11, nothing is un-votable; criticality raises the bar; 97 is the recommended ceiling

> "Everything can be! But the more critical it is, the higher percentage of quorum you need (hard
> to get quorum) such that changing the most critical things would require a max high of 97%
> quorum where only 3% of the whole network would be able to not be informed and have 97% approval
> (max heights - we don't recommend more than those though they can exceed them (if they do we
> warn them) because the closer you get to 100% the chances of you getting a stalemate increase
> where the Game breaks even though a massive majority want to continue they can't because someone
> died suddenly or stopped playing the Game, etc."

What it changes: **there is no never-votable list.** Every setting carries a criticality tier, and
the tier sets the quorum and unity the change needs. The most critical tier asks 97% quorum and
97% approval. A village may set its dials above 97 and the Game WARNS it, in words, that the closer
to 100 it goes the likelier a stalemate becomes, because one player dying or drifting away can
freeze a Game a massive majority wants to continue. Section 13.2's floors that live in code move
into settings behind the same tiers. The Birthing stays at 100 and 100 because it is the one vote
where everyone is present by definition.

### Q12, voter identity: participation visible, choices hidden, faces after half

> "How about the name who participates is visible but by default we hide how they voted (and we
> only expose faces once 50% of the required vote count happens (so you can't really tell who
> voted what) but we don't say what they voted by default - but in settings this can be changed to
> public voting."

What it changes: by default, **who has voted is visible and how they voted is hidden.** The names
of those who have voted appear only once half of the required vote count has been reached, so an
early voter cannot be read off the tally. Choices stay hidden. A village setting switches to public
voting, where choices show. Ledger ruling R9 is superseded by this. The people-and-weight sentence
(section 5) is unaffected: counts and shares of weight are always shown.

### 19B. Rulings of 2026-09-02, late evening: the second round of answers

He answered the plan message. His words, then what each one changes. These supersede section 19
and section 20 where they differ, and one of them (Q7) reverses a default the dispatcher lane was
given; section 20.7 records how that is handled.

**Q1, settled.**

> "Yes village-voice is the Voice"

**Voice for other beings is exposed from the first day, with a representative.**

> "You expose catalysts at the beginning (even with 3 people) the concept of giving voice to nature
> and inviting them to consider it by either a human or AI agent taking the perspective - or even
> talking directly if they have the human ability to the nature beings)"

What it changes: the founding screen presents the concept to the catalysts on day one, whatever
their number, and lets them declare a non-human governance role (a mountain, a river, the trees,
the fauna and flora) with a REPRESENTATIVE who takes its perspective: a human member, or an AI
agent, or a person who speaks with that being directly. The 144-player line from section 19 Q2
becomes a recommendation shown on the screen ("most villages grow into this") rather than a lock;
the representative may be given Voice through the same founding allocation and ballots as anyone.
Coordinator's reading; flagged for him in section 20.7.

**Q7, reversed: approval executes at once.**

> "Q7 No whenever a steward approves it instantly executes"

What it changes: a steward's approval is the moment of effect. There is no waiting for the moon
after an approval and no rolling to the following boundary. The "lands at the next cycle start"
rule of section 12 applies to the path with NO steward in it: a subject the village has moved to
auto-execute lands at the next boundary through `applyDueGovernance`. So a village with training
wheels on gets changes when a steward says yes, and a village that has taken them off gets changes
at the new moon. Coordinator's reconciliation; flagged for him in section 20.7.

**Q9, confirmed, with the reason.**

> "Q9 yes the highest floor among them which discourages people to adjust those settings knowing the
> storytelling required for higher changes."

**Every setting shows its cost; catalysts set the initial amounts; a threshold changes at its own
bar.**

> "Yes every setting says what it costs and these are all editable from the start by catalysts to
> set the initial amounts. but they also can be changed by reaching the same amount they are set at
> can change their threshold again."

What it changes: the criticality tier and its quorum and unity are themselves settings a catalyst
edits before the Birthing. After it, changing a setting's threshold requires meeting that setting's
CURRENT threshold: a dial at 97 and 97 needs 97 and 97 to move, up or down. That is the "thresholds
for thresholds" rule, and it replaces any fixed list.

**The governance dashboard is a first-class experience.**

> "Love the governance dashboard! Super cool and an important piece to help players see and navigate
> the game of governance and to take action and guide their choices. Make it an engaging experience
> that's about empowerment and co-creating our game! IT's really cool!"

What it changes: the read-back on the front of the Game Mechanics section is a Phase 2 lane of its
own, designed as an invitation to act, not a status page: which Hypha corner the dials describe,
concentration of voice, participation over three moons, whether a steward holds the seat, what is
open to vote on now, what lands at the next moon, and a door to propose.

**Stalemate protection, with an abuse guard.**

> "I think so on the stalemate protections but we have to do this in a way where they can't be
> abused by people who don't like the outcome of a vote."

What it changes: the re-run is offered ONLY when a frozen seat has provably left the village (a
membership change recorded in the ledger, never a self-declared absence) and ONLY while the ballot
is open and mathematically unable to reach its quorum. A closed ballot is never re-run. The re-run
freezes a new roll from the current membership and links to the ballot it replaces, so the record
shows why. Nobody who dislikes an outcome gets a second vote out of it.

**The first governance actions are quests, with this framing.**

> "Yes absolutely first governance as quests that describes how this is how we empower ourselves,
> evolve the game, make sure we're always making it better, more fun, more empowering, more capable,
> as we co-create new realities and civilizations together and take this task seriously."

**The bridge to the hub is another session's, with a prompt from this one.**

> "The bridge to the hub can be a prompt you give me at the end for another session after yours."

**Two Voices, one shown at a time, and the graduation to Hypha.**

> "Village Voice is the voice unless they're running on Hypha then it changes, but only show one at
> the beginning, either they're using the platform or Hypha to vote. What we have is a sort of
> 'graduation' to Hypha when you complete a crowdpool and you want to accept all those
> contributions and have a secure vehicle with easy liquidity (an actual DAO on Base using
> Coinbase's liquidity) then you're using those actual tokens and mirroring your village game with
> Hypha updates (like every month or season) you would actually go to Hypha and vote to sync up the
> Games there. Then you would show both types of Voice if they're using both Tools but they should
> be in balance with every sync."

What it changes: a village shows ONE Voice. On the platform it is `village-voice`. A village
graduates to Hypha when it completes a crowdpool and wants a secure vehicle with liquidity (a real
DAO on Base); from then on the on-Base token is the vote, the village Game mirrors Hypha, and every
month or season the village goes to Hypha and votes to sync the two. A village using both tools
shows both Voices, and the sync keeps them in balance. The generated document says exactly this
under "Voting weight", and `docs/TOKENS.md`'s two-token section is rewritten to match. The sync
itself is the hub session's work (the prompt at the end).

**Merge #140, and a lane on the module image row.**

> "Merge PR #140 if it's good to go! You can also put a lane on the governance module image row to
> do that too!"

### 20.7 What the second round changes in the build

- **The dispatcher lane was briefed with the old Q7 default** (late approval rolls to the following
  boundary). The correction is small and contained: on approval, execute now; `lands_at_cycle` is
  stamped only for subjects in the auto-execute map. A follow-up lane applies it after Phase 1's
  verify, and the resume script carries the corrected prompt so a re-run gets it right.
- **Thresholds-for-thresholds** joins the thresholds lane's scope in Phase 2 (the tier settings are
  editable by catalysts before the Birthing; after it, a tier change is priced at the tier's own
  current bar).
- **Two coordinator readings flagged for him:** that non-human roles with a representative are
  available from day one and the 144 line is shown as guidance; and that "lands at the next cycle"
  now describes the auto-execute path only, with steward approval executing at once.

### 19C. Rulings of 2026-09-03, early: the steward is a veto window, and other beings from day one

> "Yes whenever a decision is approved it passes and executes (if it's sending tokens) if it's
> changing the Game then it starts at the next new moon or automatically if a steward doesn't
> block it, a steward is given 3 days minimum (so if the vote only gets enough quorum and total
> votes by the very last day of the lunar cycle then a steward will get 3 days to veto, if it's
> past longer than 3 days out of the end of the cycle then a steward has until the cycle ends to
> veto otherwise it goes into effect."

> "2. yes voice for other beings at day 1"

**What the first ruling changes, and it replaces the approval gate of sections 19 and 19B.**

Two kinds of decision, two clocks:

1. **A decision that sends tokens** (a payout, a distribution, a founding allocation) executes the
   moment it passes. No steward step.
2. **A decision that changes the Game** (a setting, a threshold, a role, a module, the vote mode,
   a structural change of any kind) takes effect **at the next new moon, automatically**, unless a
   steward **blocks** it inside the veto window.

**The veto window.** A steward always has at least three days. The window closes at whichever is
LATER: the end of the current lunar cycle, or three days after the vote carried. So:

- a vote that carries with more than three days left in the cycle: the steward may veto until the
  new moon; at the new moon it takes effect;
- a vote that carries with three days or fewer left, including on the last day: the steward may
  veto until three days after it carried; it takes effect when that window closes, which is a few
  days into the new cycle.

**Consequences for the build.**

- The steward does not APPROVE. There is no "waiting for a steward" hold, no approve route as a
  precondition of effect, and no queue when the seat is empty: a passed Game change lands at the
  window's close whether or not anybody holds the seat. A steward may still record an explicit
  "no objection" early; it is a courtesy that closes nothing sooner than the new moon.
- A veto is a first-class act with a name, a reason, and a record (section 3). It returns the
  proposal to its proposer with the reason and keeps its backers.
- `lands_at` is a TIMESTAMP on the passed row, `max(nextNewMoonAfter(passedAt), passedAt + 3 days)`,
  shown on the page from the moment the vote carries; the veto window closes at the same instant.
  `applyDueGovernance` applies rows whose `lands_at` has passed and that carry no veto, called from
  the hourly settlement job and from the human cycle close.
- The three days is a setting with a floor of three (a village may give its stewards longer, never
  shorter).
- The auto-execute gradient of section 3 is now the natural end state with no code of its own:
  a village that seats no steward simply has nobody who can veto. The per-subject map keeps one
  meaning: which subject kinds a steward MAY veto (default: every Game change), and which execute at
  pass (default: token sends).
- Section 19B's Q7 reading ("approval executes at once") is withdrawn. Section 20.2's dispatcher
  row and section 20.7 are read through this section.

**Open for him, flagged:** whether a token-sending decision is ALSO inside the veto window (his
sentence puts only Game changes there; the coordinator builds token sends as immediate at pass and
asks).

**What the second ruling settles.** Non-human governance roles, with a human or AI representative,
are declarable from the first day of a village. The 144-player line is guidance on the screen.

### 19D. Rulings of 2026-09-03: the steward and payouts, and the veto override

> "However if a steward votes down on a token payment proposal than it fails automatically."

> "Yes stewards can also block payouts, and yes to the veto override"

**What it changes.**

- **A token payment fails the moment a seated steward votes no on it.** The steward's "no" is
  itself the block: the ballot cannot carry, and the close records it as failed with the steward
  named and their vote reason as the veto reason. A steward may also record an explicit veto on an
  open token-send ballot with the same effect. Because a token send executes the instant it passes,
  a steward's block on a payout happens while the ballot is OPEN, never after; there is no window
  after the close.
- **Game changes keep the window of 19C**: they land at the later of the next new moon and three
  days after the vote carried, unless vetoed inside that window.
- **The veto override.** A proposal that was vetoed may be brought back. If the village passes it
  again at the NEXT criticality tier above the one it carried at (its quorum and unity raised one
  tier), it lands regardless of any steward. The record links the override to the vetoed original
  and the veto reason stays visible beside it. A proposal already at the top tier is overridden by
  passing again at that same tier plus a steward-free landing; the coordinator builds it that way and
  flags it.

**Two readings flagged for him.** That a steward's block on a payout must come while the ballot is
open, since a token send has no window after it passes. And what "next tier" means at the top: a
second pass at 97 and 97 lands regardless.

### 19E. Rulings of 2026-09-03: the override tier, governance windows, and the countdown

> "We can have a veto override if it goes up to the highest tier they have set as a village (this
> is also a setting that can change at the highest tier set)"

> "Yes stewards are sent emails and given notifications in the app. But we can also block all
> proposals from not happening within defined governance windows. Some can be 'always open' but
> some can have set windows (like the last week of every month or last 2 weeks of every season or
> whatever) but those two are the default choices we offer to guide."

> "Steward accountability on dashboard is excellent!"

> "72 hours from close and a countdown on it."

**What each one changes.**

- **The override tier is the village's highest set tier.** A vetoed proposal lands regardless of
  any steward when it is passed again at the highest criticality tier the village has configured.
  That highest tier is itself a setting, and changing it is priced at the highest tier. Section
  19D's "next tier up" is replaced by this.
- **Stewards are told twice.** The moment a vote carries, every seated steward gets an email and an
  in-app notification naming the proposal, the veto deadline and the door to veto.
- **Governance windows, and this supersedes section 3.** The Aug 31 brief said proposals are never
  gated by the calendar and that governance week must not become a permission check. The founder
  now rules that a village MAY block proposals outside defined governance windows. Per proposal
  kind, a village chooses: **always open**, or a **window**. Two window shapes ship as the default
  choices to guide a village: the last week of every month, and the last two weeks of every season.
  A village may define another. Outside a window the proposal is refused with the next window's
  dates, and the tray still collects edits so nothing is lost. The window is a setting with a
  criticality tier like any other.
- **Steward accountability lives on the dashboard.** Seat holder, term end, vetoes this season with
  their reasons, and payouts blocked.
- **The veto window is 72 hours from the close**, a countdown on the proposal page and on the
  dashboard, stated in the viewer's local time with the UTC instant beside it.

**Build consequences.** The override tier and the windows are a Phase 2 lane of their own,
`windows`, owning the open and publish paths (`server/lib/ballots.ts` openBallot, the mechanics
publish route, the ceremonies), new Governance settings (per-kind window choice, the highest tier),
and the refusal copy. The dispatcher lane reads "highest set tier" for the override. The
notifications join the ballot-surfaces lane (email through the existing mail path, in-app through
`server/lib/notify.ts`).

### 19F. Rulings of 2026-09-03, morning: lunar months, pure token weight, the bundle waits, timing per proposal

> "governance 'Months' are lunar months starting and ending with the moon as the default"

> "Quorum SHOULD be pure token weight (not counting people, unless it's 1-person-1-vote but we STILL
> SHOW PEOPLE counts, even though the quorum is calculated by village-voice token weight)"

> "1. who bundle waits! (along with this proposals can each carry - execute at accept or start with
> the new moon and to default to starting with the new moon to carry a pattern of new activities
> starting then)."

> "2. no any single steward has the ability to veto though we could add a 'Steward Council' option
> that makes it a majority of them"

> "3. No if there is 3 cycles without quorum it just doesn't pass."

> "4. default"

> "make sure you add the context and links to those context documents (on governance I gave you at
> the first) to the governance docs that humans and bots will read to get an understanding of this
> game."

**What each one changes.**

- **A governance month is a lunar month.** The window shape "the last week of every month" means
  the last seven days of every lunar cycle, new moon to new moon, by default. The season shape
  stays the last two weeks of every season.
- **Quorum is pure token weight. Section 20.8's head-count quorum is WITHDRAWN.** Quorum and unity
  are computed over `village-voice` weight (or over heads only when the village runs
  one-person-one-vote, where every seat weighs one). The Birthing keeps its rule that every frozen
  seat votes yes, which under 100 and 100 with every seat weighing is the same thing. People counts
  are ALWAYS shown beside weight, on every tier control, every ballot and every sentence
  ("3 of 9 people voted, holding 97% of the weight"), so concentration is visible; transparency is
  the protection, as he ruled in section 5. The audit's risk 4 (one holder clearing the top tier
  alone) is accepted as a consequence of that design and stated in the document.
- **A bundle waits as a whole**, and **every proposal carries a timing choice**: execute at
  acceptance, or start with the new moon. The default is the new moon, "to carry a pattern of new
  activities starting then". The coordinator's reading of how the choice meets the veto window:
  a Game change chosen "at acceptance" still cannot land before its 72-hour window closes, so it
  lands at `closes_at + veto_hours`; a token send chosen "at acceptance" executes at close; anything
  chosen "new moon" lands at the later of the next new moon and the window's close, and a steward
  may veto inside that window whatever the kind. Flagged for him.
- **Any single steward can veto.** A village may turn on a **Steward Council** setting, under which
  a veto needs a majority of the seated stewards.
- **No fallback.** A tier that misses quorum three cycles running simply does not pass. Section
  20.8's fallback is withdrawn.
- **The late-carry jump stays** as his rule gives it.
- **The generated document carries its lineage.** `docs/GOVERNANCE.md` gets a section, "Where
  this comes from", with the three sources he gave and one line of context each: the deck
  https://docs.google.com/presentation/d/1hjjo_p5VqaOkaUml9nR3s8ZGUt1AzCidCSw6VngJ3dc/edit?usp=drivesdk
  ("So you want to make a DHO?", the three dials of voice variance, quorum and unity, and the named
  corners), the talk https://youtu.be/_TpyEO6NRnY ("How to do a DHO/DAO", SEEDS Regenerative
  Renaissance), the Hypha Handbook V0.3
  https://docs.google.com/document/d/1hFJPe1N0yyntJ9g-iQFvhtf9j2pDsxmmG-ufxqnAt5g/edit?usp=drivesdk
  (out of date, written for a different kind of organisation, and still the root of the Game's
  self-organising and regenerative principles), plus this brief itself as the record of the
  rulings. Maia's shelf (`docs/knowledge`) gets the same section so the assistant can answer
  "where does this come from".

### The mandate that follows

> "your role now is to respond to my ideas for improvement with a final execution plan. Then you're
> going to oversee Agents who are running on Opus or lower for what you need and only you are the
> Fable model as the swarm coordinator to oversee building this whole plan. You'll only complete
> once you've done a QA test as a fake account going through all governance actions and
> interacting with the site. You'll continue with QA passes building in a better Game and
> experience as they 'Play the Game'."

The coordinating session runs on Fable; every building agent runs on Opus or lower. Completion
means a fake account has walked every governance action end to end on the site and the walk was
good enough to keep playing. Section 20 is the plan.

---

## 20. The execution plan (2026-09-02, evening)

The founder's mandate: the Fable session coordinates, every building agent runs on Opus or lower,
and the work is complete only when a fake account has played every governance action end to end on
the site and the walk was good. This section is the plan the coordinator runs. It is written here
so a coordinator that loses its context can pick it up.

### 20.1 Ground rules for every lane

- **Integration branch:** `wt/governance-build`, worktree `C:\Users\taren\Desktop\Amora\wt-govbuild`,
  cut from `origin/main` at `2bce3df`. Every lane branches from it (`git worktree add
  ../wt-gb-<lane> -b wt/gb-<lane> wt/governance-build`), commits only its own paths by name, and is
  merged back by a merge agent in the order listed. Nobody writes into `hotfix`.
- **Migration numbers are reserved here, once.** `0127` to `0131` are held by other lanes on this
  machine; the governance build takes **`0132` to `0139`** in the order below. A lane that needs one
  more asks the coordinator; nobody counts `ls drizzle/`.
- **Routes go in `server/routes/<domain>.ts`** exporting `register(app, deps)`, wired with exactly
  two lines in `server/index.ts` (the import and the register call, nothing adjacent), so the ratchet
  costs nothing. The close-dispatcher wrapper is the one exception and lives where `SUBJECT_CLOSERS`
  lives.
- **Migration numbers can be invalidated from above.** `scripts/check-migration-numbers.mjs` refuses a merge whose new migrations are numbered BELOW anything the base branch has since reached, and a fully green pull request goes red the moment another lane lands a higher number on `main`. Before landing the build on `main`, the merge agent simulates it (`git worktree add <scratch> --detach <branch>; cd <scratch> && git merge --no-edit origin/main; GITHUB_BASE_REF=main node scripts/check-migration-numbers.mjs`, no node_modules needed) and renumbers the build's migrations above `main`'s highest if the gate says so. Renumbering is allowed BEFORE a migration has run on any real instance and never after, because `_migrations_applied` keys on the filename.
- **New documents are guarded the day they land:** `scripts/check-doc-links.mjs` now globs every `.md` under `docs/` and the root (PR #141), so `docs/GOVERNANCE.md` must name only paths that exist; run it before pushing, and do not edit that script while #141 is open.
- **Every lane ships red-to-green tests**, runs `pnpm check`, `pnpm check:tests` cold, its own suites
  alone and inside the full run, `node scripts/check-voice.mjs`, and regenerates `docs/GOVERNANCE.md`
  and `docs/TOKENS.md` when its change moves either guard. A green from a pipe is not a green.
- **Writing rules** apply to copy, comments and commits. The word is Catalyst, never founder, in
  anything a player reads; `founder` stays as the stored role value.
- **Nothing auto-executes on a timer except through `applyDueGovernance`**, and every apply is
  idempotent on status so two callers cannot apply twice.

### 20.2 Phase 1, foundations (parallel lanes, then one merge)

| Lane | Owns | Builds | Migrations |
|---|---|---|---|
| **clock** | `shared/lunar.ts`, new `shared/cycleClock.ts`, every consumer that imports lunar arithmetic, the client `CycleClock` | The `CycleClock` seam (`boundsFor`, `idFor`, `parseId`, `startOf`); lunar implementation unchanged; a calendar implementation with its own id prefix; `cycle.mode` setting, lunar default, boundary-timed, launch-grade; past cycles frozen with their ids; a boot assertion that no setting is shown that nothing reads | `0132` if a column is needed |
| **thresholds** | `shared/governanceEngine.ts`, `shared/ballotSubjects.ts`, the Governance category of `shared/gameVariables.ts`, `server/lib/mechanics.ts`, the open path in `server/lib/ballots.ts` | A criticality tier on every setting with a tier-to-quorum-and-unity map; the 97/97 recommended ceiling with a warning above it; `SUBJECT_THRESHOLDS` as settings with the registry as floors; a per-subject abstain policy and minimum-yes-heads; the Birthing requires every frozen seat to vote yes; a mixed change set priced at the highest floor among its elements; the one-vocabulary rule replaced by typed items | none |
| **steward** | new `server/lib/stewardship.ts`, new `server/routes/governanceApprovals.ts`, `server/lib/orgChart.ts`, the `term-watch` job, `roleCapabilitiesFor`, `server/lib/founderGrant.ts` | `ballot_approvals` (ballot id, decided by, decision, reason NOT NULL on refusal); term columns on `role_holders`; `roleCapabilitiesFor` drops lapsed holdings; `term-watch` says the seat is empty and makes the vacancy loud where the approval is needed; approve and refuse routes gated by a new `steward.approve` capability; the seating of every catalyst as a steward, idempotent, with a term ending at the next season turn, exposed as one function the launch closer calls; a village with no steward documented as healthy | `0133` approvals, `0134` terms |
| **dispatcher** | the governance region of `server/index.ts`, new `server/lib/changeset.ts`, `server/lib/dryRun.ts` | The closer split into settle and execute; the approval hold (`held = "waiting for a steward"`) and the per-subject auto-execute map with the mechanics brake kept as its entry; `lands_at_cycle` stamped at pass; `applyDueGovernance(pool, at)` called from both the hourly settlement job and the human cycle close; late approval rolls to the following boundary; the `governance_mode` subject type with its executor; the changeset as typed namespaces on `mechanics_proposals.change_set` (dials, mint rules, weight allocation, mode switch, module lifecycle, brand fields, roles) applied through the existing writers in one transaction, all or nothing, with the blocking element named; a durable executor-pending row | `0135` landing and supersedes columns, `0136` executor-pending |
| **delegation** | new `server/lib/delegation.ts`, new `server/routes/delegation.ts`, the tally path in `server/lib/ballots.ts` | Delegations that copy the choice and never move the weight; transitive resolution; cycle refusal at creation; the delegator's row shows who they actually followed; effective concentration per member; concentration visible on the weights route | `0137` delegations |
| **docgen** | new `scripts/generate-governance-doc.mjs`, `scripts/check-governance-doc.mjs`, `scripts/generate-governance-doc.test.mjs`, `server/db/governanceDoc.test.ts`, `docs/GOVERNANCE.md`, `.gitattributes`, `ci.yml`, `CLAUDE.md`, `README.md`, ruling 4 in `scripts/generate-token-doc.mjs` | The generated document of TODAY exactly as section 16.2 specifies, with every ruling in sections 3, 4, 5, 12 and 19 carried verbatim with date and status, every section 14 gap named as staged, clans and voice for other beings named as staged at 144 players; the guard in CI; the self-test; the database test | none |

**Merge order:** clock, thresholds, steward, dispatcher, delegation, docgen. The merge agent
regenerates both documents after each merge and refuses to continue on a red guard.

### 20.3 Phase 2, surfaces (parallel lanes, then one merge)

| Lane | Builds |
|---|---|
| **mechanics-section** | The admin panel's game tabs renamed the **Game Mechanics** section and public always: `mayReadAdmin` true for everyone on the game tabs, every write still on `mayAct`; before the Birthing catalysts edit directly and everyone watches; after it every control renders "propose this change", edits collect into a visible change log (the staging tray, drafts as its store), and one button submits the tray as one proposal; operator tabs and every surface carrying personal data stay where they are; save-honesty defects in section 13.5 fixed; mobile first, because the founder plays from a phone |
| **birthing** | The launch renamed the Birthing in copy; the proposal document reveals the Game: the founding Voice distribution as a table with each catalyst's share of the total, the structure (modules on, roles declared, clans named, dials changed from default, seasons seeded), and the conditions; the invitation to name non-human governance roles on the founding screen; the founding-allocation act behind one exempted faucet; catalysts become players after it carries |
| **ballot-surfaces** | Viewer-aware ballot serving: who voted visible, how they voted hidden, names revealed only after half the required count, a village setting for public voting; the people-and-weight sentence on every card and page; `shareOfTotal` on standing and weights in display units; the 0.1-shows-as-100 defect fixed; objection asks on every method and visible to the proposer; the withdraw-and-rewrite door with the predecessor's asks carried over; "lands at cycle N" on every held proposal; the steward's approve and refuse on the decision page with the vacancy shown |
| **delegation-ui** | Give and withdraw a delegation from the standing page; see who you actually followed on each vote; the concentration view for every player |
| **clans** | The naming surface only: clans as named groups anchored on a living being, editable in the Game Mechanics section, with the 144-player unlock for voice shown as a staged feature, never as a broken one |

### 20.4 Phase 3, the record

Maia's shelf and `COORDINATION_SUBSTRATE.md` amended to the rulings; the nine public pages
stripped of the 2025 institutions or labelled as history; the "what the site says" gate; the
`ARCHITECTURE.md`, `VILLAGE_OVERVIEW.md` and `FORK_RUNBOOK.md` pointers; `docs/GOVERNANCE.md`
regenerated one final time against the merged tree.

### 20.5 Phase 4, playing the Game

A fresh village provisioned locally against the local MySQL, the built server started, and a fake
account driven through the Browser pane: claim the village as a catalyst; name the clans and a
non-human role; allocate founding Voice and see the shares; invite two more catalysts; open the
Birthing; watch it refuse an abstention; carry it unanimously; become a player; open the Game
Mechanics section as a plain member; stage three edits and submit them as one proposal; vote; see
who voted and not how; object with an ask; watch the proposer withdraw, rewrite and resubmit with
the ask carried; pass it; see the steward hold; approve as the steward; see "lands at cycle N";
turn the moon and see it land; propose a mode switch bundled with a Voice distribution and see the
highest floor; delegate a vote and see who was followed; let a steward's term lapse and see the
vacancy; switch the cycle setting and see nothing about the past change. Every rough edge found is
a lane in the next pass. The coordinator writes the walk down as a runbook and turns it into an e2e
script so the walk runs in CI after this.

### 20.6 What the coordinator adds beyond the founder's list

- **Criticality is a property of every setting, shown on its control** ("changing this needs 97 of
  100 to show up and 97 to agree"), so the bar is visible before anyone proposes.
- **A dry run on every proposal** before it is published, from `server/lib/dryRun.ts`, showing what
  would change and what would block it, so a proposal that cannot apply is caught before a vote.
- **A governance read-back on the Game Mechanics front page:** which Hypha corner the dials describe,
  concentration of voice, participation over the last three moons, and whether a steward holds the
  seat.
- **Stalemate protection the founder asked for in words:** when a frozen roll can no longer reach
  its quorum because a member left, the page says so and offers the re-run in one click.
- **The first governance actions as quests.** A short chain on the quest board (make your first
  proposal, cast your first vote, give your first delegation) so a new player learns the Game by
  playing it.
- **Every governance act posts to the feed and notifies**, with the people-and-weight sentence.
- **The bridge to the hub stays out of scope** and is described honestly in the document.
- **The fake account's walk becomes a CI script**, so the Game cannot quietly stop being playable.

### 20.8 The adversarial audit of 2026-09-03, and what it changed

Ten Opus lenses attacked sections 12 to 20 and the code (capture, the clock, the data model,
playability, privacy, forkability, consistency, completeness, testability, tokens, operations):
144 findings, the 80 non-minor ones each put to two independent skeptics told to refute, 64
survived, synthesised into twelve risks. The full audit is at
`C:\Users\taren\Desktop\Amora\governance-sources\audit_2026-09-03.md`. Nothing was executed; it
read the plan and the tree at `183460d`. What follows is what the coordinator adopted into the
plan, what it put to the founder, and the correction wave the build now needs.

**The twelve risks, in one line each.** (1) The admin plane sits outside the Game and owns every
control the veto leaves standing: an admin can seat themselves as steward, unseat the elected one,
rewrite every member's weight, flip the vote mode, and apply a passed proposal inside its window.
(2) Section 20's lane rows still describe the approval model 19C deleted, so a lane briefed from
its row builds the withdrawn thing. (3) A steward can veto their own removal, and the term that was
supposed to end never comes due (seasons are an ungoverned list ending 2026-12-21; `term_ends_at`
is erased by an unrelated appointment). (4) Quorum and unity are pure weight, so one holder of 97%
of the weight clears the 97/97 tier alone, and below about 34 members the top tier is unanimity.
(5) The pass instant is a human press, so the proposer chooses which three days the steward gets.
(6) Delegation is an unconsented read channel on hidden votes and a silent quorum veto. (7) The
secret ballot leaks through per-choice tallies, `silent[]` and timing, and a veto reason is
permanent free text about a named neighbour. (8) A bundle splits across two clocks, and the token
half cannot be un-minted. (9) The apply path can apply twice, half-apply, or roll back into caches
that keep serving the change. (10) The platform counts accounts, and the plan reads them as
people: three delegated rows or three accounts one person made satisfy the Birthing. (11) The
automatic landing path has single points of failure (the settlement job's early return, the brake,
a changeset switching the governance module off). (12) A fork inherits Amora's institutions,
calendar and hub on top of a governance module that ships off.

**Adopted by the coordinator (no ruling needed; consistent with his words).**

- `steward.veto` is a capability no admin route can grant or revoke; seating and unseating happen
  only through the `role_seat` and `role_unseat` executors, and the admin holders route refuses any
  role carrying it, admin path included.
- After the Birthing, the admin weight-write routes, the admin vote-mode flip and the admin
  mechanics apply route are refused and redirected to proposals; an apply inside a veto window is
  refused. Once the Game starts, those writes are the village's.
- `lands_at` and `veto_closes_at` are timestamps on the row; no hold, no queue, no cycle number on
  the vote path. `applyDueGovernance` runs as its own five-minute job outside the settlement job,
  elects a single executor with a guarded claim UPDATE (`passed` to `applying`), logs "nothing due"
  distinctly from "did not run", and marks a row stalled if the brake was off when it came due.
- The changeset applies in two phases, validate then apply, irreversible writes last, a per-element
  ledger row for every write, and every written-through cache reloaded afterwards. The legacy
  apply throws before its first write on any item it cannot type. Atomicity comes from
  pre-validation, and the document says so.
- A vote closes when its window ends, by the settlement path, so no human hand picks the steward's
  three days; early close is refused on every method. `lands_at` derives from the frozen
  `closes_at`.
- The seat that vetoes cannot veto its own removal: `role_seat` and `role_unseat` on
  steward-capable roles, and any edit to the veto map, execute at pass.
- Terms are stamped as instants computed from the cycle clock, kept in an append-only per-term
  table, and a term survives an unrelated appointment; `term-watch` treats "no season is running"
  as loud.
- *(Withdrawn by 19F: quorum is pure token weight.)* People counts are always shown beside weight
  on every tier control, ballot and sentence; the stalemate warning fires whenever a tier rounds to
  the whole roll. Delegated rows never count on a subject at 100 unity, the Birthing included.
- A delegation must be accepted by the delegate; the copied choice is suppressed on the
  delegator's row while choices are hidden ("cast, following Ren"); withdrawing a delegation or
  taking a vote back restores the not-cast state; a delegate's unvoted delegation count is visible
  on the live ballot.
- While a ballot is open and secret the payload carries a participation count and, after the
  half mark, the names of those who voted, and nothing else: no per-choice tallies, no `silent[]`
  names, no cast times; the route needs a session; the reveal floor is three named voters; a roll
  small enough that the tally determines the choices says so.
- A veto reason is length-capped plain text, escaped everywhere, marked public and permanent above
  the input, and redactable (the text blanks, the act, author and time stay). The same three rules
  apply to objection text.
- Stewards are notified at carry, at the half-way point and at two hours left, with the instant in
  their own zone, by email and in-app, through a veto-watch job.
- One person or agent holds at most one seat; a non-human being's representative is seated and
  replaced by a `role_seat` ballot, never by declaration; the village sets the total share of Voice
  all non-human seats may hold before the Birthing; the Birthing document shows how each seat
  arrived. The document says the platform counts accounts rather than people.
- A changeset cannot switch the governance module off; the module gets an open-state check.
- Fork defaults: the 2025 institutions leave the shipped pages, the circles seed ships empty,
  `governance.hub_url` ships blank, a fresh village's seasons derive from its cadence and timezone,
  every new surface renders one honest sentence when the module is off, and the quest chain is
  seeded only once the module serves members. Catalyst, Birthing and Steward join the per-village
  vocabulary object so no player-facing noun is hardcoded.
- Three new Phase 2 lanes: `dashboard`, `quests`, `phone-IA`. The QA walk is rewritten around the
  veto window and pinned to a 375px viewport, and "good enough to keep playing" is a printed
  checklist.

**Put to the founder (section 20.9), with the default the build proceeds on.**

1. A bundle mixing a token send with a Game change: the whole bundle takes the later clock and
   one veto window (default), or the token half executes at pass. Default: the later clock.
2. Several stewards seated: one veto stops a change (default, his training-wheels framing), or a
   majority of seated stewards.
3. A tier above 97: warn (his ruling, kept). *(19F: no fallback; three cycles without quorum means
   it does not pass.)*
4. The late-carry jump: a change carried one minute before the new moon lands in three days; one
   minute after, in twenty-nine. His words give the first rule and the build keeps it; he should
   know the jump exists.

**The correction wave (Phase 1b).** Wave A lanes were briefed from the old rows. After Merge A:
`steward-veto` converts the approval record to a veto record, renames the capability, makes it
ungrantable by admin routes, stamps terms from the clock; `thresholds-heads` adds head-count
quorum, minimum yes heads, the delegated-row rule at 100 unity, the tier render in heads, and
blanks the hub URL default; `delegation-consent` adds acceptance, suppression while hidden, the
uncast path and the unvoted count; `dispatcher` builds the veto-window model with the widened
ownership (the admin cycles region, the admin apply route, the withdraw reset, the own job);
`clock` with the widened ownership (seasons default, `voiceClaim.ts`, `suggestNextSeasonDates`, the
cycle-mode landing precondition); `docgen-refresh` regenerates against the merged tree with the
widened scope (sections 3, 4, 5, 12, 19 to 19E, withdrawn sentences as struck history). Then Merge
B, verify, fix.
