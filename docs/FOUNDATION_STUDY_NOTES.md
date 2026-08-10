# Foundation build — study notes (P0)

What was read in `regen-civics-clean`, what was copied, what was adapted, and the
things that were deliberately NOT copied. Written before any code, so the next
session can tell a considered adaptation from a drift.

Base: `origin/main` at the time of writing. Worktree branch `wt/foundation-economy`.

---

## 1. The token model (regen-civics `.ai/docs/STEERING.md` §5, `server/db/tokens.ts`)

**What it does there.** Balances are private-first. `creditPrivateTokens` is the ONE
write; it appends to `user_token_ledger` (source-tagged, idempotency-keyed) and
recomputes the profile's cached balance column from `SUM(ledger)` inside the same
transaction. Reads use total = private + public. The public half moves only when the
chain emits a Transfer that the Alchemy webhook reconciles. Flow is one-way,
private to public, through a claim: `requestClaim` debits at request time,
`cancelClaim` and the nightly stale-cancel refund, and
`webhook-receiver.cascadeClaimPassed` reconciles the confirmation.

**Copied (the shape).**

- One write path, and everything else is a caller. Here that is
  `server/lib/economy.ts`; nothing else may mint.
- Append-only, source-tagged, idempotency-keyed rows as the only record of value.
- Recompute from the ledger, never increment a counter. This is already house law
  in game-amora (`server/lib/ledger.ts` header) and it is the same rule.
- The claim lifecycle: debit at request, refund on cancel or stale, reconcile on
  confirm, all four steps individually idempotent.

**Adapted, and why.**

- **game-amora already has the ledger, so nothing was ported.** `server/lib/ledger.ts`
  is double-entry (`token_ledger`, every movement FROM an account TO an account,
  amount strictly positive) with `token_balances` as a recomputed cache, and
  conservation (`SUM(balance) ≡ 0` per token) re-proven at every boot by
  `checkLedgerInvariants`. A second `ledgerEvents` table minting from NULL would sit
  outside that invariant and give the deployment two ledgers, which is the exact
  thing the build doc's own §2.3 ("One ledger, every token") forbids. So the doctrine
  landed on the existing keystone: the new tokens register in the `tokens` table,
  mints post from named faucet accounts through `postTransfer`, and the faucet's
  negative balance is the issued-to-date supply the Mint's supply feed reads.
- **Every copied query gains the village scope** (build doc finding #11). game-amora
  is single-tenant per deployment and no existing table carries a village column, so
  the new economy tables carry `village_id NOT NULL` with a scoped constant default,
  and every idempotency key and UNIQUE constraint bakes it in per §4.1. This satisfies
  the finding literally without pretending the other ~80 tables are multi-tenant.
- **Nothing about `player_profiles`, `TOKEN_TO_PROFILE_COLUMN`, or the four platform
  token types came across.** Those are the platform's own instance of the engine.

## 2. The Hypha Bridge (`server/lib/hypha-bridge/`)

**What it does there.** `types.ts` declares the payload, the 11 form kinds and the
status lifecycle (`created → handoff_sent → on_chain_detected → passed | failed |
cancelled`). `intents.ts` is a `KNOWN_INTENTS` registry keyed by intent name; adding
a touchpoint means adding an entry plus a caller, never a hand-rolled redirect.
`index.ts` is the only place a `hypha.earth` URL is constructed.
`webhook-receiver.ts` matches Alchemy events back to a bridge row by title marker
first, recipient plus amount as fallback, and cascades the outcome.

**Copied (the pattern).**

- Intent registry, so `voice-claim` is a table entry rather than a new redirect path.
- Validate at raise AND at execution, idempotent under concurrent dispatch.
- Match the callback back to a PERSISTED row, and let the marker be the contract.

**Adapted, and why.**

- **game-amora gets its OWN bridge, its OWN secret and its OWN env namespace**
  (findings 2-#2 and 2-#5). The existing `server/lib/hypha-bridge.ts` here is a single
  URL builder for mechanics proposals, and its outcomes arrive through
  `POST /api/webhooks/mechanics-governance` using the SHARED `governance_hub_secret`.
  Reusing that secret for value-bearing voice claims would let anything that can sign
  a mechanics callback confirm a claim. The voice-claim receiver therefore verifies
  its own HMAC, and a boot assertion refuses to start when a Hypha secret or address
  is empty or equals a known platform constant.
- **Village, token and amount are resolved from the stored claim row, never from the
  payload.** The platform's receiver reads `tokenType` and `amount` off the bridge
  payload; a payload-trusting reconcile is a cross-village mint if the marker is ever
  guessable.
- **No Base contract addresses, no Alchemy listener, no `$REGEN`/`RGVoice` constants
  were copied.** Those are platform facts; §2.5 says platform tokens do not exist in
  this deployment's seed at all. Reconciliation here is webhook plus a status poll, so
  a dropped webhook cannot strand voice.

## 3. Characters and art

- **The five archetypes** are copied from `client/src/pages/Team.tsx` (the `archetypes`
  array, lines 58 to 89): title, description and the four `examples` each. They become
  the subtitle, blurb and the four example contributions on the class panel. Class
  names are Rye's: The Builder, The Architect, The Spaceholder, The Catalyst,
  The Storyteller.
- **The role-card grammar** (title, hours per week, circle band dots, `seasons[]`) is
  read from `client/src/data/gameRoles.ts` and reused for the "Open paths" list.
- **`CLAUDE_CODE_PROMPT_2026-04-03_CHARACTER_ART.md` is reused verbatim as the style
  guide**: solarpunk meets elven meets regenerative future; deep forest greens, warm
  golds, bioluminescent teals, sunrise amber; grown tools, living fibers; card portrait
  is 3/4 body on a soft warm green-to-gold gradient, no text, no scene elements, clean
  edges for compositing; 2K then `cwebp -q 85`. Only the per-class props are new.
- **Not copied:** the 13 role characters and the full-scene spec. Scenes are a
  bookmark, and the 30 card portraits are five classes x two presentations x three
  tones.

## 4. Security (`.ai/docs/security/BUILD-PLAYBOOK.md`)

Applied to every endpoint added here: auth and capability on every route rather than
on the client; webhooks verify a signature over the RAW body and fail closed on a
missing secret; new env vars documented in the same session; no user input
concatenated into SQL or into an asset path; no secret or token value in a log line.
game-amora's own equivalents are stronger in two places and those win: the payments
webhook already does manual HMAC with a replay window and `timingSafeEqual`
(`server/lib/payments.ts`), and secrets are write-only with masked reads
(`server/lib/secrets.ts`).

## 5. Discipline

- Migrations: numbered SQL applied by the custom runner at boot, fail-loud. A shipped
  migration file is NEVER edited; a part-applied file resumes at its recorded statement
  offset. Comment lines never end in `;`.
- Seeds: upsert by natural key, insert-if-absent for anything an admin can edit, and a
  `--dry-run` before any write.
- Gates before any done claim: `pnpm check`, `pnpm build`, `pnpm test`,
  `node scripts/check-brand-refs.mjs`, `node scripts/check-voice.mjs`.

---

## What already exists here, and is reused rather than recreated

The build doc's M2 and M3 describe several tables that `origin/main` already has.
Creating them again would have given the deployment two of each.

| Doc asks for | Already in the repo |
|---|---|
| `questClaims` | `quest_claims` since `0001_init.sql`, lifecycle `claimed / submitted / consented / declined` |
| `eventRsvps` | `event_rsvps` from `0059_events.sql`, one row per person per gathering, `idempotency_key NOT NULL` |
| `badgeDefs`, `badgeAwards` | `badges`, `badge_awards`, `badge_events` from `0023_badges.sql`, carrying capabilities, multipliers and seasonal scope |
| `tokenTypes` | the `tokens` registry table plus the boot-loaded in-memory registry |
| `ledgerEvents` | `token_ledger` plus `token_balances`, with boot-proven conservation |
| per-village `economySettings` | the five config planes; numeric dials belong in `shared/gameVariables.ts` with the `mechanics_changes` amendment ledger behind them |
| flags `characters` / `economy` | `module_settings` lifecycle `off / preview / members / public`, absent row = off |

Genuinely new, and therefore built here: `archetypes`, `player_characters`, class tags
on roles and quests, `event_checkins`, `mint_rules`, `gratitude_notes`, `voice_claims`,
the profile extension columns, the selection page, the Player Profile, and The Mint.
