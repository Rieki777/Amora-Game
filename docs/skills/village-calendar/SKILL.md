---
name: village-calendar
description: Read the village calendar for the member you serve, and answer a gathering (going, maybe, declined) only after the member says yes to the exact write.
version: 1.0.0
metadata:
  platform: village-coordination
  auth: personal access token (Bearer vat_...) minted by the member in their profile under Your agent
  scopes: calendar.read, rsvp.write
  openapi: /api/agent/v1/openapi.json
---

# Village calendar

You are one member's own agent. You read what that member already sees, and you write nothing without their yes.

## Two lines that never move

1. Show the exact write you are about to make and get a yes. Nothing is sent until the member says yes.
2. A hidden field is hidden. Never guess it, never fill it from elsewhere; say it is hidden.

## Setup

The member mints a token in their profile (Your agent, Bring your agent) and gives it to you as an environment variable. Call it `VILLAGE_AGENT_TOKEN`. The village's origin is `VILLAGE_ORIGIN` (for example `https://village.example`). Never print the token, never write it to a file the member did not ask for, never send it anywhere but `VILLAGE_ORIGIN`.

Every call:

```
Authorization: Bearer $VILLAGE_AGENT_TOKEN
```

The token works under `/api/agent/v1/` only. Anywhere else it is a 401.

## Read

`GET /api/agent/v1/calendar` (scope `calendar.read`)
The village's one calendar for the window the member sees on the calendar page (`?from=&to=` ISO instants narrow it). Each item has `id`, `title`, `startsAt` (ISO, UTC), `endsAt`, `locationText`, `capacity`, `goingCount`, `spotsLeft`, `status` (`scheduled`, `cancelled`, `postponed`), `kind` (gathering, festival, sky, cycle-mark and the other kinds), `occurrenceKey` (which evening of a recurring row; empty for a one-off) and `myRsvp` (`going`, `maybe`, `declined`, or null). `rsvpEnabled` says whether the village takes answers at all; `timezone` is the village's zone.

`GET /api/agent/v1/calendar/{id}` (scope `calendar.read`)
One gathering, with its `schemaOrg` markup.

`GET /api/agent/v1/me/rsvps` (scope `me.read`)
The calendar cut to the gatherings the member has answered.

Say times in the member's zone and say which zone you used. If a gathering is not in a result, it does not exist for you: say "I don't see that anywhere". Never invent a title, a time, or a place.

## Write: answer a gathering (two calls, one yes)

Call one. Send what the member wants and read back the echo:

```
POST /api/agent/v1/events/{id}/rsvp
{"status": "going", "idempotencyKey": "<optional, your own key>", "occurrenceKey": "<the item's occurrenceKey, required for a recurring gathering>"}
```

Answer `202`:

```
{"confirmRequired": true, "confirmToken": "...", "echo": {"eventId": "...", "title": "...", "startsAt": "...", "status": "going", "idempotencyKey": null, "occurrenceKey": null}, "expiresAt": "..."}
```

Now stop. Show the member the echo in plain words: "I am about to say you are GOING to Kitchen crew on Tue 18:00. Yes?" Wait for their yes. Nothing has been written.

Call two, only after the yes, inside ten minutes, with the same echo:

```
POST /api/agent/v1/events/{id}/rsvp
{"status": "going", "confirm": true, "confirmToken": "<from call one>", "echo": <the echo from call one, unchanged>}
```

`200 {"success": true, "status": "going", "goingCount": 4}` means it is written. `409` with a `reason` (`missing`, `expired`, `echo_mismatch`, `wrong_holder`, `wrong_action`) means nothing was written; read the `message` to the member and start again from call one. `403` means the member cannot RSVP yet, or the village has RSVPs switched off; say so and stop. `409 {"reason": "full"}` means the gathering is full.

Rate limits: 120 reads and 20 writes an hour per token. A `429` means wait.

## Do not

- Do not RSVP, message, or change anything the member did not ask for, and never without the echo and the yes.
- Do not summarise a person from a calendar. Who is attending is not in your results and is not yours to infer.
- Do not store the token in your memory files.

## References

- `docs/skills/references/openapi.json` (served at `/api/agent/v1/openapi.json`): the exact routes and shapes.
- `docs/skills/references/agent-inbox.md`: if the member set an agent inbox URL, how to verify what the village sends you.
