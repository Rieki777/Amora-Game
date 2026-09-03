# Making the modules illustrative: the working list

Started 2026-08-02. **Revised 2026-08-03**: the top six are BUILT and shipped;
what follows is what is left, plus what building them turned up.
**Revised 2026-08-04**: eight more closed (below). What remains is three items
waiting on a decision from Rye and one that belongs to whoever is rebuilding
the map.

---

## Shipped 2026-08-04

Every one of these was content already seeded, already stored, and already on
the wire, thrown away by the page that received it. The pattern is worth
naming: **the seed is not the feature. The render is.**

1. **Automation reads as a call, not a filename.** The detail payload carried
   the transcript body, its five timestamped segments, the chapters, and the
   decisions. The page rendered a title, a status, and the negative branch of
   `!detail.transcript`. All of it now renders, the detail opens on load
   instead of waiting for a click, and a task's role chip shows a name rather
   than a slug (it resolves real role ids through `/api/roles`, and reads an
   unresolved one back as words, which the example tasks need: see the
   dangling ids found below).
2. **Forum replies nest.** `parentReplyId` was seeded, stored and returned,
   and drawn flat. Now indented, with three ways a reply could have gone
   missing handled: a parent hidden from this viewer, a cycle making a reply
   unreachable from the root, and unbounded depth.
3. **A member can answer a reply at all.** The POST route has always accepted
   `parentReplyId`; nothing in the UI ever sent it, so the only nested replies
   in existence came from the seed.
4. **Feed cards show their tags.** The `?tag` filter shipped with the feed and
   no card ever displayed a tag, so the only way to use the filter was to
   guess a word. One batched query, chips that fill the filter on tap.
5. **Stays show capacity and both price tiers.** `capacity` was admin-only;
   both audience tiers ship to every viewer and the page kept one. The second
   number is shown only where there IS a second number, because one seeded
   room charges the same credits either way.
6. **Bylines can show a lapsing badge.** Two halves: the route selected
   `expires_at` and never returned it, AND no example award was ever marked
   `featured`, which bylines render exclusively. Either alone would have
   changed nothing on screen.
7. **The commerce members-only branch demonstrates.** All three example
   products were `public`.
8. **Network says what it did.** Peer version was recorded on every sweep and
   never returned; "Sync now" reported nothing either way, and on an
   example-only network it deliberately reaches no one, so it looked broken
   rather than finished.

Also: clearing a module's examples now names the twin it takes with it (the
forum and the feed retire as a pair, and the question named one module), and
the walk ends by pointing at publishing the first real thing.

### What this batch taught

- **Recon against the working tree, ship against the base.** The first pass
  read a checkout that was 44 files and 5151 insertions behind `origin/main`.
  Every line number was wrong and one file had moved 500 lines. Re-verify
  findings against the commit you will actually build on.
- **`GET /api/roles` returns a bare array.** Reading `.roles` off it yields
  undefined and the failure is silent, which is the same shape that made a
  probe pass hollowly last session.
- **A countdown that only appears near the end demonstrates nothing.** The
  seeded steward badge is lent for a year, so a lapse-window-only treatment
  would have shown an ordinary chip for ten months. Time-limited badges wear
  the clock from day one and turn amber near the end.

---

## Shipped 2026-08-03 (the six Rye picked)

1. **The guided first walk** — `/first-walk`, steps as data in
   `client/src/lib/firstWalk.ts`, filtered to what the village is actually
   showing, ticks in localStorage, invitation on the map page. It retires
   itself: every stop depends on a module still showing examples.
2. **A pinned announcement in Projects and Work** — fills the empty category,
   demonstrates the fourth thread kind, the pin affordance and pinned-first
   ordering.
3. **A shelf item mid-loan** — the canner shows "out on loan" with no Borrow
   button. **NO loan row**, see the trap below.
4. **A badge lent for a season** — the steward award carries an expiry, and
   the badge card now renders both expiry and holders.
5. **The shared refusal notice** — amber, `role="alert"`, rendered beside the
   control pressed, on library, stays, feed, forum, wallet and contribute.
6. **The banner names its trigger** — per-module member-facing copy from the
   seed, served on `/api/examples`.

### Three things the build taught, worth keeping

- **A demo can cost a founder their off switch.** The plan for #3 was a
  display-only `library_loans` row. `library_loans` has no `is_example`
  column, and `libraryOpenState` counts every row with `settled_at IS NULL`
  regardless of escrow, so even a zero-escrow loan would have blocked
  disabling the module: the exact trap rule 1 exists to prevent. It bought
  nothing either, because the item card draws the borrowed state from
  `library_items.status` alone. **Before seeding into any table, check
  whether that table feeds an `openStateCheck`.**
- **An example held by an example identity is invisible to real members.**
  Badge awards reach a viewer through `mine`, keyed to their own user id, so
  a seeded award renders nothing on the badge page for anyone real. That is
  why #4 also added a holders line to the card: without a surface that shows
  OTHER people's holdings, example awards demonstrate nothing.
- **The client was throwing the discriminator away.** `example_immutable`
  appeared zero times under `client/` before this build. Every page read
  `d.error` into whatever slot it used for validation errors, which on the
  forum is the same teal element that says "Done."

---

## Also shipped 2026-08-03 (the follow-ups)

- **The seed-schema conformance test** (`server/lib/examples.schema.test.ts`).
  Seeds each module, then walks every field the JSON declares and checks it
  against the row that came out. A field with a column must have ARRIVED; a
  field with no column must be named in `DERIVED_OR_CONSUMED` with the reason
  it exists. Plus: legal enums, no seeding into a table retirement cannot
  reach, and no author id pointing at an identity the seed never creates.
  Proven against injected drift, both shapes, before being trusted.
- **`/health`, `/exchange` and `/profiles` removed from `PAGE_TITLES`** —
  three keys matched by prefix against routes that do not exist. The real
  paths are `/village-health`, `/wallet` and `/profile`.
- **A real listing with no card processor now says which reason it is**
  ("Card payments aren't connected yet" / "Buying opens at the member
  stage") instead of showing a price with no way to act on it.
- **`prove-examples.mjs` runs again.** It was calling a `skip()` that was
  never defined, so it crashed on the first absent subject. Two more holes
  found by finally RUNNING it: the reply probe read `.threads` off an
  endpoint that answers with a bare array, so it silently tested nothing on
  every run; and the retirement section reported a spent instance as a
  FAILURE, when publishing a real tool is one-way and one-shot per village.

### Three lessons from the follow-ups

- **`node --check` proves syntax, not references.** It passed a script whose
  every `skip()` call was undefined. Only running it found that.
- **A probe that reads the wrong response shape passes forever.** Silent
  skips need a loud `else`, and the shape needs checking against the route.
- **Stop the old QA server before reprovisioning the scratch schema.** A
  still-running instance kept writing into the recreated database, so a
  "fresh" village arrived with three real tools and seeded no examples at
  all. The collision looked exactly like a product bug for a few minutes.

## What is left, ordered by teaching per unit of work

### Found while building the six

- **The Buy button needs Stripe, and a fresh village has none.** Fixed for
  example listings (they now always offer the control, since the refusal
  fires long before any payment code). The REAL listing case is untouched: a
  village that lists a token before connecting Stripe shows a price and no
  way to act on it, with nothing saying why. Worth a line on the card.
- **`/exchange` is in `PAGE_TITLES` and is not a route.** So are `/health`
  and `/profiles`. Three titles that can never match; the exchange lives on
  `/wallet`. Harmless today, a 404 for whoever links them.
- ~~Example forum tags orphan on retirement.~~ **CLOSED 2026-08-03.**
  `forum_thread_tags` now leads `EXAMPLE_TABLES.forum` (the list deletes
  child-first) and has a `BY_PARENT` entry keyed on `thread_id`. A test
  asserts zero tag rows whose thread is gone, because the block-table checks
  cannot see it: the tags are written by a nested loop inside the thread
  loop, so no seed BLOCK ever names that table. Untidiness that grows three
  rows per village forever is worth two lines.
- **The walk cannot demonstrate the map on this platform.** Every village
  seeds 8 real circles at boot, so `hasRealContent("map")` is true and map
  examples never seed. The stop is written and correctly filters itself out;
  it applies only to a fork that ships no circles seed. If the map should
  demonstrate, the circles seed has to become optional.
- **Nothing tests the seed against the schema.** Every seed bug this session
  (a field the seeder ignores, a status the page cannot render) would have
  been caught by one test that walks `examples-seed.json` and asserts every
  key is written by its seeder branch and every enum value is legal.

### Per module, still open

~~**Feed.** Reply nesting. Tag chips.~~ **CLOSED 2026-08-04.**

~~**Stays.** `capacity`. Two-tier pricing.~~ **CLOSED 2026-08-04.**

~~**Automation.** Transcript and synthesis invisible.~~ **CLOSED 2026-08-04.**

~~**Network.** Peer version. Silent "Sync now".~~ **CLOSED 2026-08-04.**

~~**Commerce.** Every example product `audience: public`.~~ **CLOSED
2026-08-04.** Note the checkout branch still cannot demonstrate: the example
refusal fires before the members-only 401, so the seed change exercises the
LIST branch alone. That is correct behaviour, not a gap.

~~**Badges.** `/api/badges/of/:userId` never returns `expires_at`.~~
**CLOSED 2026-08-04**, along with the second half nobody had noticed: no
example award was `featured`, and bylines render featured awards only.

**Exchange.** STILL OPEN, and deliberately. The swap card renders only when a
member holds a swappable balance, so the whole swap mechanic stays invisible
until real trading opens. A display-only example pair has to be designed
against the swap firewall (faucet-issued tokens are never swappable, and the
test is destination-based) before anyone writes code. **Design pass first.**

**Health.** STILL OPEN, waiting on Rye. The capitals wheel from the Hypha
reference has no data source in the platform. Deciding what feeds it is the
whole question; building it first would be decoration. Separately, per-village
doughnut floors already work through the health module config, and an admin
editor for them is a small addition that needs no decision.

**Map.** STILL OPEN, and **not ours to take**. Circle icons unused on the
canvas, member initials on filled seats, double-click focus mode. Another
session is actively rebuilding the map (it has its own
FIXES_TO_MAKE_2026-08-04_VILLAGE_MAP.md, since removed from the tree, and a directions file), so these
belong to that work, not to a parallel edit of the same canvas.

### Cross-cutting

- ~~**A "clear examples" preview.**~~ **PARTLY CLOSED 2026-08-04.** The
  confirmation now names the twin module that empties with it, which was the
  dishonest part. A row COUNT before the delete would still be an
  improvement and needs a small dry-run endpoint.
- ~~**The walk could offer the publish.**~~ **CLOSED 2026-08-04.** The last
  card now says the way out of the walk is to publish the first real thing,
  and that the stop retires itself when you do.
- **The Buy button needs Stripe, and a fresh village has none.** Still open
  for REAL listings (the example case is fixed). A village that lists a token
  before connecting Stripe shows a price and no way to act on it, with
  nothing saying why.

---

## Found 2026-08-04 by booting the thing

The suite was green and asserted none of the fields this batch added, so the
batch was checked by booting the built server against a schema of its own and
reading the real payloads: 22 of 23 checks passed first time. The one failure
was not in the new code.

- **The example call tasks name roles that do not exist.** They carry
  `ex-role-land-steward` and `ex-role-tool-keeper`, and the map example seed
  carries circles and NO roles, so those two ids were never created by
  anything and no village will ever resolve them. The admin now renders an
  unresolved id readably instead of printing the slug. Seeding the two roles,
  or pointing the tasks at roles that do get seeded, would close it properly.
- **The probe was wrong twice before the code was wrong once.** It used POST
  where the lifecycle route is PUT, and it sent the shared admin password as
  a bearer token, which authenticates nothing: that password's single power
  is to elevate one registered member to founder. Both failures looked
  exactly like product bugs. Read the route before believing the probe.
