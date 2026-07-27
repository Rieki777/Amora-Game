# The feedback hub contract (S66)

Every fork ships a feedback relay: bugs and ideas submitted at `/feedback`
land in the village's own admin queue ALWAYS, and — while
`platform.feedback_relay` is on (the default) — a copy flows to one central
endpoint the platform team reads. This file is the contract for whoever
stands that endpoint up. The fork side is already live and fails soft: an
absent or broken hub costs a log line and a retry, never a village error.

## What the fork sends

`POST {FEEDBACK_HUB_URL}` (default `https://hub.regencivics.earth/api/feedback/ingest`),
every 15 minutes when there is anything unrelayed, up to 50 items per batch,
oldest first:

```json
{
  "instance": {
    "instanceId": "17007ef4-…",   // permanent uuid, minted at first boot
    "version": "1.0.0",           // platform semver — which contract it speaks
    "build": "2026-07-28-s66-…",  // human-readable deploy marker
    "name": "Amora"               // the village's public name (brand overlay)
  },
  "items": [
    {
      "localId": "fb-…",          // village-local id, for future fix-status echoes
      "kind": "bug",              // or "idea"
      "title": "…",
      "detail": "…",
      "pageUrl": "https://…",     // where they stood, when captured
      "fingerprint": "40 hex chars", // sha256 prefix over kind+normalized text
      "createdAt": "2026-07-28T…Z"
    }
  ]
}
```

**Never present:** who submitted it. `submitted_by` exists only in the
village's local table. The hub sees content and provenance (which village,
which build), not people. Keep it that way — the disclosure on every fork's
submission form promises it.

## What the hub must do

- Answer **2xx** only after the batch is durably stored. The fork marks
  items relayed on 2xx and never resends them; a 2xx that then loses data
  loses it forever.
- Any non-2xx or timeout means the whole batch is retried next sweep —
  ingestion MUST be idempotent. Key on `(instance.instanceId, item.localId)`.
- Collapse duplicates across villages by `fingerprint`: forty forks hitting
  one crash should read as one issue with a count and a village list.
- Treat `instance.name` as untrusted display text from a self-managed
  deployment. `instanceId` is the identity; names collide and change.

## What the hub owes back (future, optional)

Nothing yet — the relay is fire-and-forget. The designed next step is a
fix-status echo: the hub answering a batch with
`{"resolved": [{"fingerprint": "…", "fixedInVersion": "1.2.0"}]}` so a
village's admin queue can say "known issue, fixed upstream — upgrade". Build
it when the hub exists; the fork's `localId`/`fingerprint` plumbing already
supports it.

## Operator notes

- The endpoint will receive traffic from every fork on the internet:
  rate-limit per instanceId, cap batch size at 50 (the fork already does),
  and cap item sizes (title 200, detail 8000 — enforced fork-side, verify
  hub-side anyway).
- A fork that turns the relay off simply stops POSTing; nothing to clean up.
