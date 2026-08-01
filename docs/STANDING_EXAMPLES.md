# Standing examples — the empty-module problem

> Status: BUILT, under review by Rye (2026-08-01).
>
> **Content:** `server/seeds/examples-seed.json` — 81 rows across all 16
> modules, platform-generic copy.
> **Schema:** `drizzle/0046_standing_examples.sql` — `is_example` on 24 tables
> plus `example_state`.
> **Runtime:** `server/lib/examples.ts` — seeding, retirement, the inert guard
> and the cache reload; hooked into boot (core modules and already-enabled
> ones) and into `PUT /api/admin/modules/:id/lifecycle` (on first enable).
> **Guards:** refusals on library reserve, stay request, product checkout,
> feed heart, badge claim, badge award and exchange buy; the earned-badge
> engine skips example definitions.
> **Client:** `ExamplesBanner` on the nine module pages, fed by
> `GET /api/examples`.
> **Admin:** a per-module "Clear examples" panel in the Modules tab over
> `POST /api/admin/modules/:id/examples/clear`, driven by `showingExamples` /
> `examplesRetired` on the modules payload.
> **Tests:** `server/lib/examples.test.ts` (nine cases) plus two runnable
> provers, `scripts/check-examples.mjs` and `scripts/prove-examples.mjs`.

## The problem

Every non-core module ships OFF (`shared/modules.ts`). A founder turns one on
and lands on `No threads yet. Start the first one.` — the module is technically
working and tells them nothing about what it is FOR. The Library page says
`No items yet.`; the Tools Hub says `No tools have been added yet.`; Badges says
`No badges defined yet.` The founder has to imagine the product before they can
use it, and the fork runbook can't carry that imagination for eleven modules.

Standing examples fix this: turning a module on reveals a small, complete,
obviously-labelled set of worked examples, which retire themselves the moment
the village publishes anything real.

## The four rules

1. **Examples are inert.** They render in full, and every mutation against them
   is refused with a specific message. An example is never a ledger row, never
   escrow, never a Stripe object, never open economic state. This is the load-
   bearing rule: an example that could be borrowed or bought would create value
   the village never agreed to, and an example loan would block
   `setModuleLifecycle(id, "off")` through `openStateCheck` — a demo that traps
   you in the module it was demoing.
2. **Examples are labelled at the row, not in the theme.** The row itself
   carries the flag, so no read path can accidentally present one as real.
3. **Examples retire per module, one way.** The first real item published in a
   module deletes that module's examples permanently. Deleting your real items
   later does not bring them back — a village that has spoken for itself is
   never talked over again.
4. **Examples are platform content, not village content.** Copy is written in
   platform language and carries no village's brand, so `check-brand-refs.mjs`
   stays green and every fork inherits the same examples.

## Mechanism

### Marking

Each content table that can hold examples gets `is_example TINYINT(1) NOT NULL
DEFAULT 0`, added in one migration. A column rather than a side table on
purpose: the flag travels with the row through every existing SELECT, so there
is no join to forget and no cache to fall out of step. `DEFAULT 0` means every
row anyone has ever created is already correctly marked as real.

### Bookkeeping

One new table records the per-module state, so seeding is idempotent and
retirement is final:

```sql
CREATE TABLE example_state (
  module_id       varchar(64)  NOT NULL,
  seeded_at       timestamp    NULL,
  retired_at      timestamp    NULL,
  retired_reason  varchar(64)  NULL,   -- 'first_real_item' | 'admin_cleared'
  PRIMARY KEY (module_id)
);
```

`retired_at IS NOT NULL` is the permanent tombstone: seeding checks it and
refuses, so examples cannot return by any path short of a deliberate SQL edit.

### Seeding

`seedExamples(moduleId)` runs when a module's stored lifecycle leaves `off`
(inside `setModuleLifecycle`, after the write succeeds) and is a no-op when the
module has ever been seeded, has ever been retired, or already holds any real
row. Core modules (quests, gratitude, progression, profiles) can never be
enabled, so they seed at boot instead, through the existing
`seedIfMissingOrEmpty` posture — and only into a genuinely empty table, so
Amora's 14 live quests are never joined by examples.

### Retirement

`retireExamples(moduleId, reason)` deletes every `is_example = 1` row in that
module's tables and stamps `example_state`. It is called from exactly two
places:

- the module's own create paths, after a real row commits;
- `POST /api/admin/modules/:id/examples/clear`, so a founder who wants a clean
  slate does not have to publish something and delete it.

One helper, called after the write rather than before, so a failed create never
retires anything.

### Refusal

`assertNotExample(row)` throws a 409 `example_immutable` with the message
*"This is a standing example — publish your own to replace it."* Every mutation
route that can address an example row calls it. The client renders the same
message inline rather than as an error toast.

## What counts as a "real item", per module

Retirement has to key on publishing something, not on any write at all — a
founder editing an example's title must not silently retire the set. One
declared trigger per module, listed with the examples themselves once the
per-module tables are confirmed.

## What the build run proved

Four things that were guesses in the design and are now facts:

1. **Name-based labelling is not enough.** The example identities are named
   "Mira (example)", but the Forum renders authors by first name only, so the
   byline reads "Mira" and the marker vanishes. The tombstone precedent —
   a real row whose display name carries the meaning — does not survive
   first-name rendering. The client must read `is_example` and render a chip.
2. **Visibility rules already do useful work.** A signed-out visitor sees one
   of the three example tools, because the other two are `members`; and two of
   the three example network items, because the third is `closed`. The
   examples exercise the audience rules rather than bypassing them, which is
   worth keeping.
3. **The example set is enough to unlock trends.** Three lunations of
   snapshots put the Village Health dashboard into its real trend state rather
   than its "N of 3 lunations collected" state, which is the only way to see
   what the module actually looks like in use.
4. **Seeding examples into an empty table suppresses the real seeds.** Example
   circles, roles and quests occupied their tables, so `circles-seed.json`,
   `roles-seed.json` and `quests-seed.json` were skipped at boot. That is
   correct for a fresh fork and wrong for a village that wanted the shipped
   starter content. The seeding hook must run AFTER the real seeds, never
   instead of them.

## What the adversarial review caught that the tests did not

An independent review (`STANDING_EXAMPLES_REVIEW_2026-08-01.md`) raised 29
findings, 28 confirmed: 5 blockers, 10 majors, 13 minors — against a set whose
own 9 tests and 2 provers were green. The reason is worth keeping: **the tests
walked only the routes that had already been guarded.** Coverage of the guard
list is not coverage of the mutation surface.

The five blockers, all fixed:

1. **`replaceAll` laundered examples into permanent real content.** The tools,
   circles and roles column specs omitted `is_example`, and `replaceAll` is
   DELETE-all + re-INSERT of the spec'd columns only — so the flag came back as
   DEFAULT 0. The tools-link-check job runs `replaceAll` DAILY, so within ~24h
   every example tool became real content that retirement could not find, the
   clear button could not remove, and the inert guards no longer refused. The
   write-direction twin of the cache bug below; fixing reads was half the job.
2. **Example quests were claimable**, and consent mints recognition, grants
   stay credits and advances a stage. On a fresh fork the whole quest board is
   examples, so this was the default path.
3. **`POST /api/stays/checkout` was unguarded** — an example room opens a real
   Stripe session and leaves a pending purchase that blocks module-off.
4. **Example identities were valid gratitude recipients.** Their addresses are
   fixed and public, so any member could spend real budget sending recognition
   into an account belonging to nobody, which the cycle close then pays a real
   pool share to.
5. **Forum/feed retirement was not scoped**, though the comment claimed it was:
   they share `forum_threads`, so the first real forum thread deleted the
   feed's examples while leaving the feed's banner over an empty page.

Also fixed: the exchange listing that deleted itself (a real listing updates the
example row in place, then retirement removed it); forum reply/subscribe/report
guards; health reading the infrastructure-written snapshot spine as village
content; the network job dialling the example peer every 6h; library backing
counting example shelves; the Sybil helper, solo-founder count and cycle
snapshots counting examples as people and activity; and bootstrap promoting an
example identity to a founder the roster hides.

Also closed: the six unguarded admin routes (product edit, network share
open/close, synthesis publish — which turned example content into a real forum
thread — regen retract, library write-off, badge edit).

Still open from the review, all client-side or cosmetic: banners on
quests/map/roles/exchange (those pages carry no example signal at all today),
`forgetExamplesCache` has no callers so the banner lingers until a reload, the
feed's seeding check and its retirement trigger disagree about what counts as
real feed content, `GET /api/examples` names modules that are only in preview,
and integration-fed recordings (Riverside webhook, YouTube RSS) do not retire
automation examples.

## Three bugs the runtime build found, all of them invisible on the page

Each of these passed review and typecheck and was caught only by running the
flow end-to-end against a real database.

1. **A raw DELETE cannot reach a memory-cached collection.** `tools`, `circles`
   and `roles` are served by `store-db.ts` caches. Retirement deleted the rows
   from MySQL and the API kept serving all three examples from memory — the
   worst possible state, since the data was gone and the page said otherwise.
   Fixed with `wireExampleCaches()`, injected at boot like `wireModuleAuth`,
   and called after both seeding and retirement. Seeding had the same hole:
   boot seeding runs after `initStores`, so freshly seeded rows would have been
   invisible until the next restart.
2. **The shared event spine made a module look already-populated.**
   `health_events` was in the feed's table list, and it is never empty — every
   boot and toggle writes to it — so the "does this village already have real
   content?" check said yes and the feed silently never seeded. Shared spine
   tables are now excluded from that question, and the feed gets a custom check
   (a non-example thread in the feed's own category).
3. **Modules that seed nothing claimed to be showing examples.** `gratitude`
   and `profiles` are stamped seeded so the attempt is not retried every boot,
   which put them in `modulesWithExamples()` and would have banner-labelled a
   page with nothing on it. Membership now requires rows that actually exist.

## Open questions for Rye

1. **Interactivity** — confirmed inert, or do you want the harmless ones
   (replying to an example forum thread, hearting an example feed post) to be
   live? Hearts move real budget, so "harmless" is not quite free.
2. **Authorship** — examples need an author. Proposed: one reserved non-member
   identity that cannot log in and is excluded from member lists, gratitude
   eligibility, Sybil metrics and health counts. The alternative — a small cast
   of named placeholder villagers — demos better but puts fake people in
   `users`, which the architecture warns against.
3. **Retirement scope** — per module (proposed), or platform-wide, where the
   first real item anywhere clears every module's examples at once?
