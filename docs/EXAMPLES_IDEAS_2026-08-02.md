# Making the modules illustrative: the working list

Started 2026-08-02. **Revised 2026-08-03**: the top six are BUILT and shipped;
what follows is what is left, plus what building them turned up.

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

**Feed.** Reply nesting is seeded, stored, returned, and rendered flat.
Either indent by `parentReplyId` or stop seeding it. Tags are seeded and the
feed has a tag filter; the tags never render as chips, so the filter looks
like it filters nothing.

**Exchange.** The swap card renders only when a member holds a swappable
balance, so the whole swap mechanic stays invisible until real trading opens.
A display-only example pair would need care with the swap firewall; design
pass first.

**Stays.** `capacity` is seeded, read into the row type, and never rendered.
Show "sleeps N" or drop the field. One room carrying both a member price and
a visitor price would make the two-tier pricing visible.

**Automation.** The example transcript is seeded and invisible: the admin
shows title and status, never the transcript or the synthesis. Rendering the
synthesis (chapters, decisions, tasks) for the example recording is the
module's whole story; today it reads as a list of filenames.

**Network.** Peer version is written and never rendered. "Sync now" on an
example-only network silently no-ops and should say so.

**Commerce.** Every example product is `provider: stripe`, `audience:
public`, so the members-only visibility branch never demonstrates.

**Health.** The capitals wheel from the Hypha reference has no data source
in the platform. Deciding what feeds it is a design conversation; building
it first would be decoration. Per-village doughnut floors already work
through the health module config; an admin editor is a small addition.

**Map.** Circle icons are seeded and unused on the canvas. Member initials
on filled seats (for viewers with `map.viewPeople`) and a double-click focus
mode would finish the Peerdom look.

**Badges.** Expiry now renders. The remaining gap is that
`/api/badges/of/:userId` selects `expires_at` and never returns it, so
`BylineChips` cannot show a lapsing badge next to a name.

### Cross-cutting

- **A "clear examples" preview.** The admin button retires a module's
  examples permanently. Showing the honest empty state first would prevent
  regret clicks.
- **The walk could offer the publish.** Every stop ends at a page where the
  founder could make the real thing. A "publish your first one" affordance
  on the last stop would close the loop from reading to doing.
