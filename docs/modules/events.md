# Module: Events (0059) — the village calendar

**Gatherings with a time, a place, a capacity and an RSVP. Other surfaces read
it: the Living Map lights the building something is happening in.**

Written as-built, 2026-08-08. Where this file and the code disagree, the code
wins and this file is stale.

## Why it is a module and not a link

`brand.project.eventsUrl` pointed somewhere else and `/seasonal-festivals` was
prose. Nothing could answer "what is on this week", nothing knew who was
coming, and the map had no way to know a building was busy. Rye's call: events
are their own module, and the foundation other surfaces read.

## Naming, so nobody trips

The module id is `events` and the tables are `events` and `event_rsvps`.
The CODE is called **gatherings** (`server/lib/gatherings.ts`,
`shared/gatherings.ts`), because `server/lib/events.ts` is already the
platform's event SPINE (`recordEvent`, the one way into `health_events`) and
two unrelated things called `events` is a mistake waiting for a tired import.

## Data model

`events` — schema.org/Event shaped on purpose, near enough to emit JSON-LD with
no translation layer (`toSchemaOrg`, `shared/gatherings.ts`).

| column | notes |
|---|---|
| `starts_at`, `ends_at` | **datetime, not timestamp.** MySQL gives the first timestamp column an implicit `ON UPDATE CURRENT_TIMESTAMP`, which would move an event's start date every time anyone edited its description. `ends_at` NULL means the village did not say. |
| `structure_keys` | JSON array. The map's multi-address: a festival occupies the greenhouse AND the commons, and neither is the real one. |
| `capacity` | NULL is uncapped. **0 is a real answer meaning nobody.** Every reader tests `=== null`, never falsiness. |
| `status` | `draft` is ours and never leaves the admin surface; `scheduled`/`cancelled`/`postponed` map straight to schema.org `eventStatus`. Enums are ordinal, so new states go on the END. |
| `visit_type_id` | Nullable and unconstrained: stays ships off, and an event must not depend on a module being on. |

`event_rsvps` — one row per person per gathering (`UNIQUE (event_id, user_id)`),
so changing your mind UPDATEs and counting "going" is a plain COUNT.
`idempotency_key` is **NOT NULL**: MySQL UNIQUE indexes exempt NULLs, so a
nullable dedupe column would read as protection and prevent nothing.

## The one thing to not get wrong

**Capacity is enforced inside the transaction.** `rsvp()` takes
`SELECT ... FOR UPDATE` on the gathering row, then counts, then writes. Reading
a count in the route, deciding, and writing later is check-then-act: two people
answering the last seat both read 9 of 10 and both get in. This codebase has
already paid for that bug twice, in swap caps and in the per-cycle mint cap.

Only a NEW `going` consumes a seat. Someone already counted who re-confirms is
not a second body in the room, and withdrawing frees the seat because the count
is derived rather than a counter somebody has to remember to decrement.

## Gate and capabilities

Both prefixes mount behind `requireModule("events")`, admin included. There is
no settlement webhook and no value in flight, so nothing needs to stay mounted
while the module is off.

- `event.rsvp` — stage floor `guest`. Any account can say it is coming.
- `event.manage` — **not in `STAGE_UNLOCKS`**, deliberately. Putting something
  on the village calendar is an appointment, granted by a role or a badge,
  never reached by climbing.

## Game variables (all three are read)

`events.rsvp_enabled` gates the RSVP route. `events.upcoming_days` and
`events.past_visible_days` bound the list query, two-sided on purpose: a
calendar that drops a gathering the moment it starts tells somebody standing
at the door that nothing is happening.

## Privacy

An RSVP names a person and says where they will be on a given evening, so it
records to the spine with `audience: "admin"`. The gathering is public news;
who is attending is not. Creating one records as `public` unless it is a draft.

## What the map reads

`GET /api/events/by-structure` returns one entry per structure key with the
soonest gathering and its `daysUntil`. Registered ABOVE `/api/events/:id`,
because Express matches in order and would otherwise read `by-structure` as an
id. `daysUntil` is computed in `shared/gatherings.ts` and never in SQL, so the
server, the client and the map cannot drift.

## Prior art

The data model is read from **Gancio** (lean title/when/place core),
**Mobilizon** (participant roles, capacity options) and **Hi.Events** (RSVP as
its own row), plus **schema.org/Event** for portability. All three are AGPL, so
no code is copied: what is borrowed is the shape of the problem.

## The admin surface

Admin → The Game → **Gatherings** (`client/src/components/EventsAdminPanel.tsx`,
self-contained, mounted in one line). Create and edit, publish a draft, cancel
a scheduled gathering, delete, and read the answer list.

Admin tabs in this app are NOT filtered by module lifecycle: the nav is a flat
list and the API 404s instead, which is how every other module tab behaves. So
the panel handles the off state in words, because hiding the tab would leave a
founder hunting for a calendar that used to be there.

The answer list joins `users` with a LEFT JOIN so an answer from a member who
has since deleted their account still counts toward the room, and renders as a
tombstone. It carries names and never emails: an organiser needs to know who is
coming, and a downloadable address list is a different feature with its own
consent question.

## Not built

No recurrence (`RRULE`), no ActivityPub federation, no per-event visibility
beyond `draft`, no waitlist when a gathering fills, and no ticketing or
payments. `is_example` rides on the table but `EXAMPLE_TABLES` is untouched, so
the standing-examples machinery does not retire these rows.
