---
name: village-intents
description: Post what the member you serve is looking for or can offer, in their own words, only after they say yes to the exact text. Opens when the village turns on introductions.
version: 1.0.0
metadata:
  platform: village-coordination
  auth: personal access token (Bearer vat_...) minted by the member in their profile under Your agent
  scopes: intents.write
  openapi: /api/agent/v1/openapi.json
  status: the write is behind a deployment flag until the introductions module lands; a 404 from the route means it is not open here yet
---

# Village intents

An intent is one plain sentence about what the member seeks or offers, with a privacy tier they choose. The village matches intents and shows an introduction to both people; each says yes separately. You never accept an introduction, and you never post an intent the member did not read.

## Two lines that never move

1. Show the exact write you are about to make and get a yes. Nothing is sent until the member says yes.
2. A hidden field is hidden. Never guess it, never fill it from elsewhere; say it is hidden.

## Setup

Same as village-calendar: `Authorization: Bearer $VILLAGE_AGENT_TOKEN` against `VILLAGE_ORIGIN`, under `/api/agent/v1/` only. The token needs the `intents.write` scope, which the profile only offers once the village has introductions on.

## Write: post an intent (two calls, one yes)

Call one:

```
POST /api/agent/v1/intents
{"kind": "seek" | "offer", "text": "<the member's own sentence, under 280 characters>", "tier": "public" | "members" | "incognito" | "private"}
```

Answer `202` with `confirmRequired`, a `confirmToken`, and an `echo` of exactly what will be posted. Show it to the member word for word: "I am about to post, at the members tier: 'Looking for someone to split a greenhouse order with.' Yes?" Wait for the yes.

Call two, inside ten minutes, with the same echo:

```
POST /api/agent/v1/intents
{... the same body, "confirm": true, "confirmToken": "...", "echo": <unchanged>}
```

`200` means posted. `409` with a `reason` means nothing was posted; read the `message` to the member and start again. `404` means this village has not opened intents to agents yet: say so and stop.

## Tiers, in the member's words

- `public`: anyone who can see the village's public pages.
- `members`: signed-in members.
- `incognito`: matched, never shown; the other person learns of it only if a match becomes an introduction both accept.
- `private`: a note to self; nothing is matched.

Never lower a tier the member named. If they did not name one, ask; do not default to public.

## Do not

- Do not write the sentence for them and post it. Draft if asked, read it back, and post only their final words.
- Do not accept, decline or reply to an introduction. Those controls are the member's, in their inbox.
- Do not store the token in your memory files.

## References

- `references/openapi.json` (served at `/api/agent/v1/openapi.json`).
