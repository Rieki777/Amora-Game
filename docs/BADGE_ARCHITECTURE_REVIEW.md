# Badge architecture review

Provenance: platform

Asked before shipping a capability-granting badge: can a badge grant a power
safely and revocably, does a deny really beat a grant, what happens at expiry
and revocation and a season's end, is a granted capability re-evaluated or
cached, and is this sound enough for a governance engine to hand out powers by
vote.

**Verdict: SOUND for granting ordinary powers, including by vote, with two
conditions that must be met before a `badge_grant` proposal type ships.** Both
are in section 7. Sections 1 to 6 are the evidence, and section 4 carries the
one finding that came close to flipping this.

Every claim below was read off the code in this worktree, not off a design doc.

---

## 1. A badge can grant a capability, and the grant is real

The one gate is `hasCapability` (`shared/capabilities.ts:163`). Its order of
authority is five lines:

```
185  if (ctx.isAdmin) return true;
186  if ((ctx.badgeDenies ?? []).includes(cap)) return false;
187  if (ctx.roleCapabilities.includes(cap)) return true;
188  if ((ctx.badgeCapabilities ?? []).includes(cap)) return true;
     ... stage unlock ...
```

`badgeCapabilities` is filled by `badgeGrantsFor` (`server/lib/badges.ts:209`),
one indexed query joining `badge_awards` to `badges`. There is no second read
path: every badge-granted power in the product comes through that function, so
a rule applied there is applied everywhere.

## 2. A badge cannot invent a power

Two gates, one validator.

- `badgeProblem` (`server/lib/badges.ts:110`) refuses any capability key that
  is not in `ALL_CAPABILITIES`, with the reason stated plainly: the gate would
  silently ignore it. It also refuses capabilities on `self` and `hypha`
  badges, denies on anything other than a `warning` badge, and a seasonal
  warning badge.
- `assertBadgeInvariants` (`server/lib/badges.ts:173`, called at
  `server/index.ts:4427`) re-runs that same validator over every active badge
  at boot and refuses to serve if any fails.

One validator for the write path and the boot check means a badge that cannot
be created can also never boot. A hand-edited row does not outlive a deploy.

**Gap, contained.** `assertBadgeInvariants` skips `isExample` rows, because the
seeder writes them after the assertion runs and a rejected row would land
quietly on one boot and brick the next. That left example definitions validated
by nothing, and the fix is already in place at the seeding seam
(`server/lib/examples.ts:673`), which runs `badgeProblem` itself and skips a bad
definition. `badgeGrantsFor` does not filter `is_example` or `kind`, which is
safe today only because example users never authenticate and the award, claim
and revoke routes all refuse example rows. It is defence in depth that is thin
by one layer, not a live hole.

## 3. A deny beats a grant, including a role grant

Line 186 sits above both line 187 and line 188, so a warning badge's deny beats
a role appointment and a stage unlock, and only `isAdmin` outranks it. That
ordering is asserted directly in `shared/capabilities.test.ts`, which is a
truth table rather than a sample:

- `GATE E: deny beats the badge grant`
- `GATE E: deny beats the ROLE grant - a warning a role overrides is no warning`
- `GATE E: deny beats the stage unlock`
- `GATE E: deny beats every grant source COMBINED`
- `admin outranks everything, including a deny`
- `a deny only blocks ITS capability, not the member's whole hand`

The admin explainer (`GET /api/admin/members/:id/capabilities`,
`server/index.ts:12009`) re-states the same order to report which source
decided, and carries a comment saying the test is what keeps the two honest.

## 4. Expiry, revocation, and a season ending

Four independent ways a badge-granted power goes away. All four take effect on
the next request.

| Lever | Mechanism | Latency |
| --- | --- | --- |
| Revoke the award | `DELETE FROM badge_awards` (`server/index.ts:14410`) | next request |
| Retire the badge | `b.active = 1` is in the `badgeGrantsFor` WHERE clause | next request |
| Expiry | `a.expires_at IS NULL OR a.expires_at > NOW()` in the same WHERE | at the clock, no sweeper |
| Season ends | `seasonallyDormantBadgeIds` (`server/lib/seasonPatterns.ts:137`) | up to 10 seconds |
| Module turned off | `capabilityCtx` skips the query entirely (`server/index.ts:2798`) | next request |

Expiry is lazy, evaluated in the WHERE clause, so there is no window where a
lapsed warning still bites or a lapsed grant still opens a door.

Two things that were missing and are now present, both from `drizzle/0033_badge_rights.sql`:
the member is TOLD when a warning expires (`sweepExpiredWarnings`,
`server/lib/badges.ts:312`), and re-issues are counted in `reissue_count` and
written into the audit text, so an indefinitely renewed silencing leaves a
trail instead of overwriting one row forever.

Seasonal dormancy sleeps only the GRANTING half. `badgeGrantsFor` applies the
dormant set to capabilities and never to denies, and `badgeProblem` refuses to
save a seasonal warning badge at all. A sanction that lifts because a season
turned would not be a sanction.

The 10 second window on dormancy is a cache of which badges are asleep, not a
cache of who holds what, and its failure path returns "nothing is asleep",
which neither widens nor narrows anyone's permissions.

### The fifth lever nobody counted: editing the definition

Raised by the silent-mutation lane, verified here against the route.

`PUT /api/admin/badges/:id` (`server/index.ts:14273`) takes a `capabilities`
array and writes it straight to the row. Because grants are read live off that
row (section 1), the edit re-writes what EVERY existing holder can do, on their
next request. Adding a key to `denies` on a warning badge suspends a capability
across every holder the same way. **It is real.** No holder is notified: there
is no `notify()` call anywhere in the route.

There IS a record, and it is too coarse to be the answer: one audit row reading
`badge:edit:<id>`, `audience: "admin"`. It says a definition changed. It does
not say which capabilities moved, how many holders were affected, or who lost
what, and no member can see it.

What makes this sharper is that the route ALREADY solved this exact problem for
one field. Changing a badge's `kind` counts the affected awards, refuses with a
409 naming the number and the stakes, requires `confirmKindChange: true`, and
then writes a specific audit row carrying `old->new` and the award count. The
comment above it records the ruling in as many words: what may never happen is
the change landing SILENTLY. Capabilities and denies ARE the power, and they
got none of that treatment.

**Why this does not flip the verdict.** It hands an admin nothing they did not
already have. Admins pass the gate on its first line, and can revoke any award
or retire any badge outright. The live re-read that makes an edit bite is the
same property that makes revocation instant, which is the behaviour we want.
This is a NARRATION defect on an admin-trusted path, and it is serious for the
reason in section 7 rather than for what it lets an admin do.

**The fix, specified.** Extend the kind-change pattern to `capabilities` and
`denies`: count the holders, refuse the first PUT with a 409 naming what is
being taken away and from how many people, accept a confirm flag, write an
audit row naming the removed and added keys, and notify each affected holder
through the notify spine with a stable `dedupe_key` per (badge edit, member).
That last part is the half the kind-change pattern is also missing.

Same family, corroborated while checking: `PUT /api/admin/governance/weights/:userId`
and its bulk sibling (`server/index.ts:20832`, `:20850`) require a written
reason (`server/lib/governanceWeights.ts:101`, "Every weight change carries a
reason. Say why"), store it in the append-only trail, and then notify nobody. Neither route
contains a `notify` or a `recordEvent` call. A member's voting weight can be
changed, with a reason on file, and the member is never told.

## 5. Nothing caches a member's capabilities

`capabilityCtx` (`server/index.ts:2798`) is built per request and answers
synchronously from there. `badgeGrantsFor` runs live inside it. Roles come from
the in-memory `rolesRepo` / `roleHoldersRepo` caches, which are written through
on change and serialized behind a write lock precisely because role holders
feed the one gate.

The practical consequence for governance: a power handed out by vote is live on
the grantee's next request, and a power taken back is gone on their next
request. There is no session to expire and no token to rotate.

The one thing to know: raw SQL against `roles` or `role_holders` bypasses those
caches until reboot. Anything that grants by vote must go through the repos, or
through `badge_awards`, which has no cache above it.

## 6. Module lifecycle cannot be sidestepped

`app.use("/api/badges", requireModule("badges"))` and the same for
`/api/admin/badges` (`server/index.ts:14031`). With the badges module off,
every badge route 404s AND `capabilityCtx` skips the grants query, so the gate
is byte-identical to its pre-badges self. A badge-granted power cannot outlive
the module that issues it.

This is also why seeding a badge definition is safe: a row that exists while
the module is off grants nothing, which is the reasoning `drizzle/0063_map_scene_publish.sql` already
wrote down for the Cartographer badge.

---

## 7. The condition: `ballot.vote` is now a grantable capability

The badges module contract (`docs/modules/badges.md`) states the F4 firewall
like this:

> the platform's Capability union (shared/capabilities.ts) contains no
> vote/voice/weight key at all, so a badge cannot grant governance voice even
> by admin typo

**That sentence is no longer true.** Round 5 added `ballot.vote` and
`member.vouch` to the union (`shared/capabilities.ts:52-53`), and the ballot
electorate is built by running the one gate over every sign-in-able member
(`server/index.ts:20420-20431`). A granted badge carrying `ballot.vote` puts
its holder in the electorate. `member.vouch` decides who gets through the
membrane. Both are governance voice, both are grantable by a badge today, and
the structural half of the firewall (a) is gone. Halves (b), (c) and (d), the
boot assertion and the write rejection and the tests, are all still standing,
but they only enforce that a key is KNOWN, and these keys are known.

For a `badge_grant` proposal type this is the whole question. The snapshot law
protects any single ballot: method, dials, electorate and weights freeze inside
the open transaction (`server/lib/ballots.ts:1-29`), so a grant landing
mid-ballot cannot change that ballot's own arithmetic. It does not protect the
SEQUENCE. An electorate that can vote to hand `ballot.vote` to chosen people is
an electorate that can vote to enlarge itself, one ballot at a time, and every
step is procedurally valid.

**Condition 1. `badge_grant` must refuse the governance keys.** `ballot.vote`
and `member.vouch` at minimum, and the founder should rule on
`proposal.decide` and `forum.moderate`. The refusal belongs on the proposal
type, next to the thing it constrains, and it belongs in code rather than in a
doc sentence. Whatever that list is, it should have exactly one home that the
proposal type imports, so the next capability added to the union has to be
classified rather than defaulting to grantable. The stale F4 sentence in
`docs/modules/badges.md` is corrected as of this review, so the contract stops
promising a firewall that has a hole in it.

**Condition 2. A badge that carries a vote-granted power must not be silently
editable.** This is section 4's definition-edit finding, and it is why that
finding matters more here than it does anywhere else. On the admin path it is a
narration defect, because an admin was already trusted. The moment a VOTE is
what put a capability on a badge, one admin editing that badge's capability
array silently overturns the village's decision: the vote granted X, the row
now says Y, every holder's powers changed, and nobody was told. A decision that
one actor can quietly rewrite afterwards is advisory, whatever the ballot
arithmetic said.

So `badge_grant` needs the confirm-and-notify treatment from section 4 shipped
alongside it, or it needs to bind its grant to something an admin edit cannot
reach. The second option is worth considering on its own: a vote-granted power
that lives in the AWARD rather than in the shared definition cannot be edited
out from under one holder by changing a row that other holders also answer to.

Neither condition blocks a badge that grants ordinary powers, which is what the
Cartographer badge does and what the appointment capabilities in section 8
need. Condition 1 blocks handing out the vote itself. Condition 2 blocks
treating a badge_grant ballot as binding until the definition it writes to
stops being quietly editable.

This lane corrects the doc claim (item 2) and reports the condition. Building
the refusal belongs with the governance engine, because that is where the
proposal type lives.

## 8. What this verdict allowed

Sound, so the appointment capabilities were seeded rather than documented away.
`map.edit` and `map.publish` already had the Cartographer badge
(`drizzle/0063_map_scene_publish.sql:87`). `feed.announce`, `exchange.manage`,
`health.record`, `event.manage` and `org.declare` were documented as
appointments granted by a role or a badge, and no seeded role or badge carried
any of them, so on a fresh village they were admin-only in practice. They now
ride the roles that already describe the work in prose. See
`server/seeds/roles-seed.json` and `docs/FORK_RUNBOOK.md`.
