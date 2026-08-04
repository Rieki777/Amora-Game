# Publish surface fixes, 2026-08-03: implementation result

Companion to `FIXES_TO_MAKE_2026-08-03_PUBLISH_SURFACE.md`. Every finding was
re-verified against the code before being touched; the line numbers in the
original had not moved, and the two grep-based claims (`anonymizeMember`
containing zero references to `org_role_assignments`, `is_example` appearing in
neither seat-claim function) both held.

Everything in §1, §2.1, §3 and §4 is done. §2.2 is corrected where the document
said it belonged. §2.3 was left alone.

Four of the fixes were implemented differently from the prescription, each
because the prescription was measured against the code and did not cover the
whole hole. Those four are the interesting part of this document.

## Where the prescription changed

### §4: comparing a pinned key proves nothing on its own

The document says: add `public_key` to `peer_instances`, pin it on first
contact, compare every sweep, pause when it changes.

A public key is public. An impostor fetches the real village's
`/.well-known/village.json`, copies the whole `publicKey` block into its own
document, and matches any string this village stored. The comparison passes and
the impostor is trusted, which is the state the pin was meant to end.

What binds identity is the SIGNATURE, checked against the pinned key, because
that is the one thing an impostor cannot produce. So the sweep verifies the
document's proof against `peer_instances.public_key` rather than against the key
the document publishes, and a key is only pinned in the first place once its
holder has proved it (`provenKey`). The comparison survives, as the thing that
NOTICES a rotation. It is not the thing that makes the check work.

Two smaller decisions inside that:

- **The PEM is rebuilt from the raw 32 bytes, never read from the document.** A
  peer publishing the real village's `publicKeyBase64url` beside its own
  `publicKeyPem` would otherwise match the pin and verify its own signature in
  the same breath. There is a test for exactly this shape.
- **A peer that answers without a key pauses**, where the obvious reading is
  "it must be an old build, carry on". A rollback to a pre-signing build and a
  downgrade attack are the same bytes, and the friendlier reading means any
  attacker turns the check off by serving the unsigned v0 document. The refusal
  message names both causes so an operator who just rolled back recognises
  their own event.

The decision the document asked for, on what "changed" means: **a changed key
pauses the peer and this village does not guess why.** A rotation and an
impostor are indistinguishable without a rotation protocol, and there is no
rotation protocol yet. The way out is the door that already existed for an
identity change: "accept & resume" re-reads the handshake and re-pins whatever
answers, which is a human agreeing to the rotation. A peer that never signed
(v0, or a hand-written static file) pins nothing and keeps exactly the posture
it had before, and pins itself on the first sweep it starts signing.

### §1.1: the documented holder needed a door, not just a mention

The document's fix covers the member half: end their seatings in
`anonymizeMember`. Two things needed adding.

**The name survives a claim.** `claimSeating` converts a documented seating to a
member one and leaves `display_name` exactly as written, so ending the seating
is not enough: the row still restates the person independently of the users
table, and the tombstone never reaches it. `display_name` and `note` are cleared
from every row for that user, live and ended. `focus` stays, because it says
which slice of the seat was held, which is a fact about the seat.

**A documented holder has no account to delete.** The document names this as the
worse half and prescribes nothing for it, correctly, because there is nothing
`anonymizeMember` can do: nothing joins that name to a user row. It needs an
admin act, so it got one: `POST /api/admin/org/seatings/:id/forget` ends and
de-names every seating sharing that `holder_key`, past seats included, and
rewrites the key itself, because `documentedKey` derives it from the name and a
slug is a name with hyphens. Forgetting somebody from one seat and leaving them
named on the next one is not forgetting them.

### §1.3: the tier moved into the function

The document offers a choice: drop `recordedBy` from the public read, or resolve
it to a first name behind the same tier the rest of the dashboard uses.

Resolving it, with the tier passed INTO `regenEntries` as a `nameFor` resolver
rather than applied by each route. Two routes read this and both serve callers
who may be anonymous; a function that hands back a user id and trusts both
callers to remember to strip it is how the id reached the open internet in the
first place. No resolver means no people, which is the safe default at the one
place that cannot be forgotten.

The field is also renamed `recordedByName`. Nothing read the old one, so the
rename is free, and it means a stale reader fails loudly instead of quietly
getting a name where it expected an id.

### §3: the six columns are surfaced, not dropped

Surfaced, ADMIN ONLY on `/api/org`, and read back into `OrgRole` so the write
path and the read path finally agree. Dropping them would destroy anything a
village typed through the API, and they are useful fields for a recruiting seat.

They stop at the admin tier deliberately. They are not structure:
`compensationReality` is money, and the outcomes and evidence fields are what a
candidate is measured against. `buildOrgExport` names its fields one by one and
none of these is among them, and the export's leak test now sets all six on its
fixture roles, so the whole-bytes assertion covers them rather than trusting
that nobody adds them later.

Worth knowing: the Admin Org Chart tab writes name, circle, aim, domain and
seats, and has never written any of these six either. A village that has only
ever used the UI has nothing stored in them. No editor was added here, because
the trap was a write path with no read path and not a missing feature; six
textareas per seat is a product decision with its own review.

`user.membershipGranted` got a column (0058) and `server/db/schema.ts` got its
three missing `users` columns. **`freezeEmailMatchedMemberships` is deliberately
NOT re-run.** Its runOnce key is recorded on every deployment, so it never wrote
anything; replaying it today would convert every self-typed email match
accumulated since into a permanent grant, which is the exact hole that change
closed. It froze a moment, and the moment has passed. What is fixed is the
field: it can be written, it survives, and the explicit steward grant the gate
documents can now exist.

## Done as prescribed

- **§1.2** `/api/network` names its columns, `created_by` never leaves, and
  `author_name` is tiered behind `map.viewPeople` as a first name. Nothing
  client-side ever read it, so the join was pure leak.
- **§2.1** `AND is_example = 0` in both `unclaimedSeatingsFor` and
  `claimSeating`. The claim route answers `EXAMPLE_REFUSAL_BODY` BEFORE the
  name check, otherwise a member whose name is written on a demo seat gets
  "that seat is not recorded under your name", which is false.
- **§2.2** corrected in `docs/ARCHITECTURE.md` §3.15. `drizzle/0049` untouched.
- **§2.3** untouched, and the asymmetry is still recorded as correct.

## One premise in the original was wrong

§2.1 says "the `progression` module is CORE, so every fresh fork boots with
example seats and documented example holders already in the org tables". It does
not. Writing the test found it: `exampleId("org_role_assignments")` came back
empty against a freshly seeded scratch schema.

`seedExamples` skips a module that already `hasRealContent`, that check reads
every table in `EXAMPLE_TABLES`, `roles` is one of progression's three, and
`ensureDataFiles()` fills `roles` with the four starter permission groups on the
line before `seedExamplesAtBoot()` runs. So progression reads as already having
real content on the first boot of every fork, and its example block, including
the `orgRoles` seats added specifically so a fresh fork's map is not empty, has
never appeared on one.

Recorded in `docs/ARCHITECTURE.md` §3.15 and NOT changed. Making it seed would
put demo seats on every fork's map, which is a product decision with its own
review and not a correction to make in passing.

The §2.1 fix stands regardless, and the guard is still worth having: the dev
seeder forces a seed, and a fork that empties `roles` gets them. The test writes
its own example seat rather than reading one from the seed, which is what the
example-quest case in the same file already does for the same reason.

## Not done

- **`apiPrefixes` is documentation, not enforcement.** Already recorded
  elsewhere and out of scope here.
- **A documented holder who never claimed their seat is not reachable from
  `anonymizeMember`.** By construction: matching a member to a recorded name is
  the judgement the seat-claim flow keeps a human in the loop for, and
  §3.16 already refuses to merge two holder keys on a name. The admin door
  above is the answer, not a fuzzy match.

## Where this landed

Migrations `0057_peer_public_key.sql` and `0058_membership_granted.sql`.
New invariant 16 in `docs/ARCHITECTURE.md` §5 and new trap 13 in §6, because
both of these bug classes will recur: a person-shaped field on a route with no
session, and a write path whose read path never caught up.

Operator-facing halves are in `docs/FORK_RUNBOOK.md`: what a paused peer means
and how to accept it, why the signing key must be backed up with the database
now that peers pin it, and how to forget a documented holder.
