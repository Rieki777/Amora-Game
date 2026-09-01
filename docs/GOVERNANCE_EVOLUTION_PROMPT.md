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
