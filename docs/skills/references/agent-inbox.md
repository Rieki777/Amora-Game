# The agent inbox: what the village sends you, and how to check it

A member may set one https URL in their profile (Your agent, Bring your agent, Agent inbox). The village then POSTs signed JSON to it: a test when the member asks for one, the week ahead, the weekly digest, and introductions once the village turns them on. Every payload is built from that member's own view; nothing in it is a row the member could not see themselves.

## The secret

When the member saves the URL the village shows a 64-character hex secret ONCE. It is derived from the deployment's member-secrets key and the inbox id, so the village never stores it either. Saving a new URL makes a new secret and the old one stops verifying. Keep it in the environment of the receiver as `VILLAGE_INBOX_SECRET`.

## The wire

```
POST <your url>
Content-Type: application/json
X-Village-Signature: t=<sentAt>,v1=<hex hmac>

{"id":"dlv-...","kind":"test|week_ahead|weekly_digest|opportunity","sentAt":"<ISO>","data":{...},"signature":"<the same hex hmac>"}
```

## Verify, recipe A (header, preferred)

1. Take the raw request body. Parse it. Rebuild the signed string as the JSON of the four fields `id`, `kind`, `sentAt`, `data` in that order, with no spaces (that is exactly what the village serialised before it added `signature`).
2. Compute `HMAC-SHA256(secret, sentAt + "." + thatJson)` as lowercase hex.
3. Compare, constant-time, with `v1` from the header. Refuse when `sentAt` is more than ten minutes from now.

## Verify, recipe B (in-body, when your receiver cannot read headers)

Same string, same HMAC; compare with the `signature` field instead of the header.

Node, both recipes:

```js
import { createHmac, timingSafeEqual } from "crypto";
export function verify(secret, body, header) {
  const raw = JSON.stringify({ id: body.id, kind: body.kind, sentAt: body.sentAt, data: body.data });
  const want = createHmac("sha256", secret).update(`${body.sentAt}.${raw}`).digest("hex");
  const given = header ? /v1=([0-9a-f]+)/.exec(header)?.[1] : body.signature;
  if (!given || given.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(want));
}
```

Python: `json.dumps({"id":..,"kind":..,"sentAt":..,"data":..}, separators=(",", ":"), ensure_ascii=False)` reproduces the same bytes for the payloads the village sends.

## Retries and the breaker

Answer `2xx` quickly and do the work after. A non-2xx or a timeout is retried at 1 minute, 5 minutes, 30 minutes, 2 hours and 12 hours, then dropped. Ten failures in a row switch the inbox off and the member is told in their notifications; they turn it back on by saving the URL again.

## Payload shapes

- `test`: `{"message": "...", "sentBy": "profile"}`.
- `week_ahead`: `{"timezone": "<IANA>", "items": [{"id","title","startsAt","endsAt","location","status","myRsvp"}]}`, the member's own next seven days.
- `weekly_digest`, `opportunity`: shaped by the introductions module when it lands; always the member's own view, with the reasoning attached to an opportunity and the accept control left to the member in their village inbox.
