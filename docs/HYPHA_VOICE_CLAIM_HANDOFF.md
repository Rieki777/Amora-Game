# The voice claim: what Rye has to do before it can be built

Everything else in the foundation build is on main and live. The voice-claim
bridge is not, and this is the only reason why.

It needs three things that only you can produce. Two are secrets and one is a
decision. Until they exist, anything I write is a webhook that has never
received a request, guarding value, with a secret nobody has generated. That is
the one shape in this build where "all gates green" would mean least, so the
dispatch path is deliberately unwritten rather than half-written.

The schema and the guards ARE shipped, in `0072_voice_claims.sql` and
`server/lib/economy.ts`. Voice accrues correctly today. It simply cannot leave.

---

## 1. Generate a webhook secret that belongs to this village alone

```bash
openssl rand -hex 32
```

Set it on the Railway service as `HYPHA_VOICE_WEBHOOK_SECRET`.

**It must NOT be the same value as `governance_hub_secret`.** That one verifies
mechanics-governance callbacks, which move a variable. This one verifies a
callback that confirms a member's claim on value they earned. Anything able to
sign the first would otherwise be able to confirm the second, and the two have
completely different blast radii. One secret for one job.

Keep it out of git. `server/lib/secrets.ts` is write-only with masked reads, so
an admin-typed value beats the env var if you would rather set it there.

## 2. Name the Hypha space, and only that one

The claim raises an intent against a Hypha DHO. Give me:

- the DHO slug or id the village's voice actually settles in;
- confirmation that it is the space YOU control, because an intent aimed at a
  space you do not control is value walking out of the door.

It goes into an allowlist, not a free-text field. A space is a destination for
value, so the code will refuse any target not on the list, and changing the list
is a co-signed, ledgered admin act rather than a settings edit.

## 3. Decide three numbers

| dial | what it is | my suggestion |
|---|---|---|
| voice claim threshold N | how much voice a member must hold before the chip turns claimable | 1.0 |
| Claims Week dates | the one week each season claims are open | one week around each equinox and solstice |
| voice token name | the founder's word for it, replacing the default | you have said Amora Voice |

The threshold exists so the village raises one governance pass a season instead
of a drip of hard proposals. Too low and Hypha fills with small claims; too high
and people wait a year. 1.0 means roughly ten confirmed quests or two role
cycles, which felt like a season's work when I seeded the rates.

---

## What happens when you hand those over

In one session, in this order, each provable before the next:

1. `requestVoiceClaim` debits under lock, one open claim per member, refuses
   below the threshold and outside Claims Week. Testable with no Hypha at all.
2. The bridge module raises exactly ONE intent per claim, idempotent on
   `intent_key`, so a retried dispatch reuses the existing proposal.
3. The webhook receiver: HMAC over the RAW body, fail closed on a missing
   secret, replays no-op, and village, token and amount read from the STORED
   claim row and never from the payload.
4. The poller, because a dropped webhook must not strand somebody's voice.
5. The boot assertion refuses to start if the secret is empty or matches a
   known platform constant.

## What already works without any of it

- voice accrues on confirmed quests and role cycles, in thousandths, through
  the one guarded write path;
- `voice_claims` exists with confirmed as a terminal state and a rejection that
  refunds, because nothing is confiscated for losing a vote;
- the two faucets are seeded, `sys:voice-mint` as a faucet whose negative
  balance is the issued supply, and `sys:voice-bridge` deliberately not one;
- `GET /api/economy/supply` publishes the totals.

A member can earn voice today and can see it. They cannot spend it, and nothing
pretends otherwise: the chip reads as accruing rather than offering a button
that would fail.

---

## One thing that is NOT blocked on you, and is a real decision

Two paths write `gratitude_log` with different caps, and both are live:

| route | allowance | per-recipient cap counts |
|---|---|---|
| `/api/game/gratitude/send` | 100, scaled by stage | SENDS, default 1 |
| `/api/gratitude` | 30 flat | HEARTS, default 10 |

They sum into the same table, so the new route already counts what the old one
spent, which makes it the stricter of the two and the safe direction for an
overlap to run in. It is still an overlap, and a member will see two different
refusal messages for what looks like the same action. Retiring one is a product
decision and I have deliberately not made it for you.
