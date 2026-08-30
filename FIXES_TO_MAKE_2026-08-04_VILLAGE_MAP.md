# Fixes to Make — 2026-08-04 — The Village Map

This document continues from `FIXES_TO_MAKE_2026-08-03.md`.

Companion artifact: `village-map-directions.html` (interactive prototype of every
change below, rendered on the real Amora circle and role data).

Scope: `client/src/pages/VillageMap.tsx`, `shared/mapLayout.ts`,
`shared/mapLayout.test.ts`, one new migration, `server/index.ts` map payload.

---

## Fix 1 — Role seats collide with circle labels every single time (Critical)

**Status:** SPEC READY

**Symptom:** On `/map`, a role dot sits on top of the first letter of almost every
circle name. Screenshot evidence: "Development Circle", "Advisory Bodies",
"Leadership Circle", "Community Circle", "Outreach & Growth Circle" all have a
seat dot through the text.

**Root cause:** `shared/mapLayout.ts:183`. The role ring runs a full 2π starting at
`-Math.PI / 2`, which is 12 o'clock:

```ts
const ra = -Math.PI / 2 + (2 * Math.PI * j) / Math.max(1, roles.length);
```

`VillageMap.tsx:268` draws the circle name at `pos.y - pos.r + 26` for a parent and
at `pos.y` for a leaf. Both land inside the arc the first seat occupies. Seat zero
and label zero are placed at the same angle by construction, so this is a guaranteed
collision rather than a crowding accident.

**Fix:** Reserve a crown. Give the role ring a start angle and a span so the top 80
degrees of every circle belongs to text alone.

In `shared/mapLayout.ts`, add next to the other geometry constants:

```ts
/** The label crown: seats never enter the top 80 degrees of a circle, so a
 *  name can never be covered. Angles run clockwise from due east. */
const SEAT_ARC_START = 40 * (Math.PI / 180);   // just past the crown's right edge
const SEAT_ARC_SPAN = 280 * (Math.PI / 180);   // stops just before its left edge
```

Then replace the role placement inside `place()`:

```ts
const rolePositions = roles.map((role, j) => {
  const t = roles.length === 1 ? 0.5 : j / (roles.length - 1);
  const ra = SEAT_ARC_START + SEAT_ARC_SPAN * t;
  return { id: role.id, vacant: role.vacant, x: x + ringR * Math.cos(ra), y: y + ringR * Math.sin(ra) };
});
```

The function stays pure, deterministic and jitter-free, so the spatial-memory
promise in the file header still holds.

**Also update** `ownRadius()`. The ring now uses 280 degrees instead of 360, so the
circumference available per dot drops by 22 percent:

```ts
const ringR = (c.roles.length * ROLE_DOT_R * 2.6) / (2 * Math.PI * 0.78);
```

**Files changed:** `shared/mapLayout.ts`, `shared/mapLayout.test.ts`

**Test to add** in `shared/mapLayout.test.ts`: for every circle in a fixture with
one to eight roles, assert no role position falls inside the crown wedge, that is
`Math.atan2(ry - cy, rx - cx)` is never between -140 and -40 degrees.

---

## Fix 2 — A seat dot carries almost no information (High)

**Status:** SPEC READY

**Symptom:** Filled versus open is the only fact a dot encodes, and it encodes it
with a 3px dash that disappears at map zoom. Which role, who holds it and how
urgent it is all stay invisible until the user clicks.

**Root cause:** `VillageMap.tsx:299-308` draws every seat as an 11px or 9px circle
with a two-value style.

**Fix:** Seats become segments of a shared arc on the circle's own stroke. Weight
carries the meaning, so nothing has to shout:

- a track: one continuous arc across the seat span, `#ebe7db`, full width
- a held seat: the circle's own tone, full width, round cap
- an open seat: amber `var(--color-amber)`, 52 percent width, round cap
- a forming seat: `#d7d2c4`, 30 percent width

Nothing lives inside the circle any more, which is what makes Fix 1 permanent
rather than a tuning exercise. Keep the existing `<title>` on each segment and
keep the `role="button"` plus `tabIndex` wrapper: the accessibility work in the
comment at `VillageMap.tsx:244` is hard won and the segments inherit it unchanged.

Keep the `vacantHighlight` pulse. Animate `stroke-width` on open segments instead
of `r`.

The prototype ships five alternatives to this one (seat tray, initial tokens, role
glyphs, fill meter, petals). Capacity arc is the recommendation for the canvas
because it survives any zoom. Initial tokens and the fill meter belong on the card
views in Fix 7.

**Files changed:** `client/src/pages/VillageMap.tsx`

---

## Fix 3 — The centre of the map means nothing (High)

**Status:** SPEC READY — needs Fix 6 first

**Symptom:** Development Circle sits at the centre and dwarfs everything, which
reads as "this is the most important circle in the village". It is simply the
circle with the most rows.

**Root cause:** `packChildren()` in `shared/mapLayout.ts:110` sorts by radius and
puts the biggest at the centre. Radius comes from `ownRadius()`, which is driven by
`memberCount` and `roles.length`.

**Fix:** Sort the pack by governance layer, then by `sort_order`, then by id. The
linking circle takes the centre, everything else rings it. Circle size stops
carrying rank, so shrink the size range: raise `MIN_CIRCLE_R` to 56 and drop
`CIRCLE_R_K` to 5, which keeps a big circle and a small circle within about 30
percent of each other.

```ts
const LAYER_RANK: Record<string, number> = { link: 0, lead: 1, operating: 2, advisory: 3, council: 4 };
const sorted = [...children].sort(
  (a, b) => (LAYER_RANK[a.input.layer ?? 'operating'] - LAYER_RANK[b.input.layer ?? 'operating'])
    || a.input.order - b.input.order
    || a.input.id.localeCompare(b.input.id),
);
```

Note for white-label discipline: the layer is data, never a hard-coded id. A fork
with no linking circle falls through to `operating` and gets the current behaviour.

**Files changed:** `shared/mapLayout.ts`, `shared/mapLayout.test.ts`

---

## Fix 4 — Live and forming look the same (High)

**Status:** SPEC READY

**Symptom:** Eight councils that hold no seats carry the same visual weight as the
five circles doing the work today, separated only by `opacity: 0.5`. Two thirds of
the map is future and it reads as present.

**Root cause:** `VillageMap.tsx:243`, `<g opacity={forming ? 0.5 : 1}>`. Opacity is
a dimmer, not a status.

**Fix, two parts:**

**4a. Forming gets its own material.** Dashed stroke `7 5`, flat `#f6f3ea` fill,
a hatch pattern behind it, and the word "forming" as a small pill rather than
floating text.

**4b. Councils move to a named outer band.** Any circle with `layer = 'council'`
and no seats renders as a labelled arc segment of the village boundary instead of
as its own blob. Eight arcs, curved `textPath` labels, an icon at the arc midpoint,
and one word above the band: FORMING.

This is the single biggest legibility win in the whole redesign. It takes thirteen
competing shapes down to six circles inside a horizon. Reference implementation is
in the prototype's `viewNested()`.

Watch the label flip: for arcs whose midpoint angle falls between 0 and 180 degrees
the `textPath` runs upside down. Draw the path in reverse and move the icon to the
opposite side of the band. The prototype handles this at the `flip` variable.

**Files changed:** `client/src/pages/VillageMap.tsx`, `shared/mapLayout.ts`

---

## Fix 5 — The icons and colours already in the database never render (Medium)

**Status:** SPEC READY

**Symptom:** Every circle looks identical apart from a faint tint.

**Root cause:** `drizzle/0018_village_map.sql:16-17` gives `circles` an `icon` and a
`color` column. `server/seeds/circles-seed.json` fills both for all eight councils,
and `server/seeds/org-chart-2026-08.json` carries an icon per role as well. The map
reads `color` through `toneOf()` at `VillageMap.tsx:60` and ignores `icon`
completely.

**Fix:** Add an icon resolver that maps the stored lucide name to the imported
component, with `CircleDot` as the fallback for an unknown name. Draw the glyph
inside each circle above the label, and inside each role row in the side panel.

Keep the import list explicit rather than dynamic: `lucide-react` has no
tree-shakeable dynamic access, so a `Record<string, LucideIcon>` of the twenty or
so names the seeds actually use is both smaller and safer.

`TONE` at `VillageMap.tsx:54` only knows four tokens and the seeds ship eight
(`rose`, `stone`, `sky`, `emerald` all fall through to teal). Extend the map or
switch to a hash-to-palette fallback so two adjacent circles never collide.

**Files changed:** `client/src/pages/VillageMap.tsx`

---

## Fix 6 — Circles have no governance layer, so the map cannot rank them (Medium)

**Status:** SPEC READY — migration required

**Symptom:** Blocks Fix 3 and Fix 4b. Nothing in the schema says which circle links
the others, which ones do the work today, and which ones are named for later.

**Root cause:** `circles` carries `status` (`active` / `forming` / `dormant`) and
`parent_circle_id` and nothing else structural.

**Fix:** One new migration file. Never edit a shipped one.

`drizzle/00NN_circle_layer.sql`:

```sql
-- 00NN: the governance layer of a circle, so the map can rank what it draws
-- without hard-coding any village's circle names into platform code.
ALTER TABLE `circles` ADD COLUMN `layer` enum('link','lead','operating','advisory','council') NOT NULL DEFAULT 'operating';
```

Keep every `--` comment on its own line and never end one with `;`. The runner
splits on line-final semicolons (`splitStatements`, `server/db/migrate.ts`) and
migration 0015 lost half a statement to exactly this.

Then:
- surface `layer` in the `/api/map` payload (it rides `circlesRepo.all()` already,
  so this is free once the column exists)
- add `layer` to `NestedInput` in `shared/mapLayout.ts`
- add it to the admin circle editor so a fork can set it without SQL
- append one line to `docs/FORK_RUNBOOK.md` in the same session, per CLAUDE.md

**Files changed:** `drizzle/00NN_circle_layer.sql`, `shared/mapLayout.ts`,
`server/index.ts`, `docs/modules/village-map.md`, `docs/FORK_RUNBOOK.md`

---

## Fix 7 — No legend, no headline, no second view (Medium)

**Status:** SPEC READY

**Symptom:** Nothing on the canvas says what a ring, a dot, a colour or a small
amber dot means. A first-time visitor gets a beautiful diagram and no key to it.
The side panel's "The whole village" state is the only place the counts appear, and
it disappears the moment anything is selected.

**Fix, three parts:**

**7a. One headline sentence under the title:** "5 circles at work, 8 forming, 11
seats open." Computed from the payload the page already holds. This sentence is the
whole map for most visitors and it gives the concierge bar something to answer.

**7b. A four-item legend under the canvas:** seat held, open call, forming, the
forming band. Static markup, no data.

**7c. A second tab: the circle wall.** Every circle as a card with icon, purpose,
fill meter, holder initials and an open-seat count, filterable by "open seats
first" / "at work today" / "everything". Same payload, same `NodeDetail`, no new
endpoint. It wins the job the map is actually hired for, which is "find me
somewhere to help".

The wall also replaces `CircleAccordion` as the mobile view, which retires a second
code path and gives phones a real map instead of a list. Reference implementation
is `viewWall()` in the prototype.

**Files changed:** `client/src/pages/VillageMap.tsx`

---

## Priority order

1. Fix 1 (crown) — one constant, kills the reported bug outright
2. Fix 2 (capacity arc) — makes Fix 1 structural rather than a tuning exercise
3. Fix 6 (layer column) — unblocks 3 and 4b
4. Fix 4 (live versus forming) — biggest legibility win
5. Fix 3 (meaningful centre)
6. Fix 5 (icons and colours)
7. Fix 7 (legend, headline, wall)

Fixes 1, 2, 5 and 7a/7b ship without any schema change and are worth landing as a
first pass on their own.

---

## Gates

All five before calling any of this done:

```
pnpm check
pnpm build
pnpm test
node scripts/check-brand-refs.mjs   # read $?, its last line is blank on failure
node scripts/check-voice.mjs
```

Voice notes for the new copy in Fix 7a and the legend: no em-dashes or en-dashes,
no `not X but Y` framing, no rhetorical-question openers. "5 circles at work, 8
forming, 11 seats open" clears all three.

Brand notes: no Amora circle name goes into `client/` or `shared/`. Layer, icon,
colour and label all arrive as data.

---

## Handoff Breakdown — Who Does What

### YOU (Rye) — things only you can do

| # | Task | Why only you | Command / Where |
|---|------|-------------|-----------------|
| 6a | Review the prototype and pick a seat treatment and a layout direction | Design call, not a code call | Open `village-map-directions.html` |
| 6b | Push the branch so Railway applies the new migration at boot | Claude Code can hold `index.lock`; Railway deploy needs your account | `git add -A && git commit -m "map: crown, capacity arcs, governance layer" && git push` |
| 6c | Backfill `layer` for Amora's 15 circles after the migration lands | Railway MySQL is unreachable from the VM (`EAI_AGAIN *.proxy.rlwy.net`) | Script below |
| 6d | Confirm the Railway deploy is green and `/health` reports the new SHA | Railway dashboard login | Railway → game-amora → Deployments |
| 6e | Sign in on regencivics.earth and eyeball `/map` at desktop and phone width | Browser action | https://amora.regencivics.earth/map |

**Script for 6c** (run on Windows, after 6b has deployed):

```powershell
# Load .env into the PowerShell session first
$env = Get-Content .env | Where-Object { $_ -match '=' -and $_ -notmatch '^#' }
foreach ($line in $env) { $k,$v = $line -split '=',2; [System.Environment]::SetEnvironmentVariable($k,$v) }

# Then run the backfill
npx tsx scripts/backfill-circle-layer.ts
```

### CLAUDE CODE — already done or can be done without you

| # | Task | Status |
|---|------|--------|
| 1 | Reserve the label crown in `layoutNestedMap` + widen `ownRadius` | SPEC READY |
| 1t | Add the crown-collision test to `shared/mapLayout.test.ts` | SPEC READY |
| 2 | Replace seat dots with capacity arcs, keep the a11y wrapper and the pulse | SPEC READY |
| 3 | Rank the pack by governance layer, flatten the size range | SPEC READY |
| 4a | Give forming circles their own material instead of `opacity: 0.5` | SPEC READY |
| 4b | Render councils as labelled arcs of the village boundary band | SPEC READY |
| 5 | Wire the stored `icon` and widen the `TONE` map | SPEC READY |
| 6 | Write `drizzle/00NN_circle_layer.sql` and surface `layer` in `/api/map` | SPEC READY |
| 6s | Write `scripts/backfill-circle-layer.ts` for Rye to run | SPEC READY |
| 7 | Headline sentence, legend, circle-wall tab, retire `CircleAccordion` | SPEC READY |
| 7d | Update `docs/modules/village-map.md` and append one line to `docs/FORK_RUNBOOK.md` | SPEC READY |

### WAITING ON YOU before Claude Code can proceed

- **6a** gates Fix 2 and Fix 7c. Six seat treatments and four layouts are on the
  table; the prototype recommends capacity arc plus nested-debugged, with the
  circle wall as the second tab. Say the word and the rest is mechanical.
- **6c** gates the visible result of Fix 3 and Fix 4b. Until `layer` is backfilled
  every circle defaults to `operating`, the centre stays whichever circle is
  biggest, and no council moves to the band. The code is safe to deploy before the
  backfill; it just looks like today's map.
