# ADR: a seat flagged `represents_circle` may declare how its circle decides

Date: 2026-08-21. Status: accepted. Round 4, lane L2 (P10, N5, ruling R30).

## Context

Since 0049 this codebase has kept two planes apart on purpose, and said so at
the top of `server/lib/orgChart.ts`:

> Two planes share the word "role" in this codebase and they are unrelated.
> The `roles` table is a PERMISSION-GROUP carrier whose `capabilities` JSON is
> the only per-village source feeding the one gate. This module owns the other
> one: the seats a village organises its work into. Nothing here touches the
> gate.

0049's own migration header repeats it: "The bridge that would let holding a
seat grant a permission group is deliberately NOT built yet."

The power map needs an answer to "who may declare how this circle decides?".
Rye's ruling (P10): admins, plus whomever is elected to represent a
circle or domain. The second half of that sentence is a fact about a SEAT,
which is exactly the plane the gate was built never to read.

## Decision

`mayDeclare(target, ctx)` in `server/lib/orgChart.ts` opens three doors:

1. an admin;
2. a holder of the `org.declare` capability, granted through the one gate
   like every other appointment;
3. **for one circle only**: a live, non-example holder of an active,
   non-example seat whose `represents_circle` flag is set, and only when
   `target` is that seat's own circle.

The village level takes doors 1 and 2 only. Door 3 is the exception this ADR
records: the first and only place a fact from the seat plane participates in
a permission decision.

## Why this is safe to allow once

- **Scope**: door 3 authorises exactly one write surface
  (`PUT /api/org/circles/:id/decides`) on exactly one circle. It grants no
  capability, joins no `capabilityCtx`, and no other gate consults seats.
- **Granting stays admin**: `represents_circle` and `how_chosen` are set only
  through the existing admin seat editor (`PUT /api/admin/org/roles/:id`),
  and every change is journaled by `describeOrgChange` as
  "speaks for its circle", so a seat quietly gaining the pen is visible.
- **It follows the seat's own lifecycle**: end the seating and the pen goes
  with it, which is the behaviour a delegate's mandate should have. A LAPSED
  holding still holds the pen, the same rule as everything else in the seat
  plane: nothing is revoked at a season turn, and the seat says out loud that
  it is waiting to be reassigned.
- **Examples are inert**: example seats and example seatings open nothing,
  the same rule every other surface applies to demo rows.

## Why not a capability instead

Granting `org.declare` to each delegate through a permission role was the
alternative, and it fails the ruling's own scope: `org.declare` is global, so
the kitchen's delegate could redeclare the council's method and the village
shape. Narrowing it would mean per-circle capability keys
(`org.declare:kitchen`), which is the permission table growing a copy of the
org chart: two sources of truth for one fact, the drift this repo's whole
design exists to avoid. The seat IS the source of truth for "who speaks for
this circle"; reading it directly, in one named place, keeps it that way.

## What this is not

Not a precedent. Any future "holding seat X grants power Y" proposal gets its
own ADR and its own argument; the pinning test
(`server/lib/orgDeclare.test.ts`) asserts that `org.declare` never enters
`STAGE_UNLOCKS`, that door 3 opens nothing at village level, nothing in any
other circle, and nothing for ended holdings, example rows or strangers. If
that test moves, this ADR is the document to argue with.

## Code

- `server/lib/orgChart.ts`: `mayDeclare`, `declarableTargets`,
  `DeclareContext` (the bridge, pure).
- `shared/capabilities.ts`: `org.declare` (union + `ALL_CAPABILITIES`,
  deliberately absent from `STAGE_UNLOCKS`).
- `drizzle/0083_power_map.sql`: the `represents_circle` column.
- `server/lib/orgDeclare.test.ts`: the rights matrix and the pin.
