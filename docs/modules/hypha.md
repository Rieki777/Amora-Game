# Module design: hypha

Provenance: platform

**The Hypha Bridge reads a village's DAO from Base and shows it here: the token contracts the
village actually holds, what those contracts call themselves, total supply and treasury balance,
and a record of every governance outcome that came home. It is read only, and the boundary is a
constitutional one rather than a technical convenience.**

Module id: `hypha`. Tier: included. Data class: village-content. Ships OFF.

## What was already here before this module

Most of the Hypha surface predates this module and it keeps working with the module off. That is
the point of the module being off by default: hundreds of forks inherit the shipped loop
untouched.

- `shared/hypha.ts` holds the read-only deep links. One variable (`hypha.org_url`) is the root
  and four named links derive from it, each individually overridable. A blank root hides every
  Hypha surface, so a dead governance button is impossible by construction. Every surface this
  module adds inherits that discipline.
- `server/lib/hypha-bridge.ts` is the ACT half: a mechanics proposal becomes a prefilled
  create-agreement URL carrying a `[gm:<id>]` marker.
- `server/lib/base-reads.ts` is the chain-read layer: `decimals()` read per contract and never
  assumed, raw uint256 kept raw with string math at the edge, an SSRF guard on the admin-typed
  RPC URL with a deliberate loopback exemption for a local node, and the rule that runs through
  everything here, **null on RPC failure, never zero**.
- `POST /api/admin/hypha/find-token` discovered a contract from the founder's Base account.

## The read-only boundary, and what would change it

Ring 0 says chain-governed tokens live on that chain, and that this platform reads them,
displays them, and links you out to them. It never mints, moves, or prices them. Two mechanisms
enforce it rather than one comment asserting it: `server/lib/ledger.ts` refuses to move a token
whose `governance` is `hypha`, and `weightTokenProblem` refuses one for voting weight. A boot
invariant fails loud if a ledger row for such a token ever exists.

The founder's ruling on future writes (R58b) was that the platform may eventually write directly
to Hypha and the architecture should not fight that. This module takes that as a shaping
instruction and not as permission:

- Nothing here writes to Hypha, and nothing here is built so that a write could only be added by
  turning the module inside out. The chain access sits behind one client factory
  (`baseChainClient` in `server/lib/base-reads.ts`); a write adapter would sit beside the read
  functions and take the same guarded client.
- **Enabling writes is a Ring 0 amendment and a founder act, not a code change.** The law it
  touches is the economy invariant that Hypha-governed tokens are read-only display, written in
  `CLAUDE.md` under Non-negotiable invariants, enforced in `server/lib/ledger.ts` (`validateLeg`)
  and `server/lib/governanceWeights.ts`. Whoever does it later amends the constitution first and
  the two enforcements second.
- There is deliberately **no test whose only job is to forbid writes forever**. The existing
  ledger and weight tests already refuse the movement paths that matter today, and a test written
  to freeze a founder's future decision is a lane overruling the person who gets to make it.

## Who runs the Base listener

The founder's ruling (R58a): if a village pays to be hosted, the hub runs the Base listener; if
it does not, the village runs its own. So the listener's location follows the hosting
relationship. It is not a toggle, because a village that flipped it would either be asking the
hub for unpaid work or turning off a listener nobody replaced, and both are silent failures.

`server/lib/hypha/listener.ts` derives the posture from what the village holds:

| posture | how it is derived | who pays for chain access |
|---|---|---|
| `hub` | `governance.hub_url` is set and the `governance_hub_secret` is configured | the hub, as part of hosting |
| `self` | no hub secret, and `tokens.base_rpc_url` is a dedicated endpoint | the village |
| `none` | neither | nobody, and outcomes are a human step |

The credential is the relationship. The hub issues its shared secret to villages it carries, so a
village that is not hosted does not hold one, and a fork cannot grant itself the hosted posture by
editing a field in a repository it owns. This is the same plane the module library already uses to
make a tier mechanical instead of decorative.

Standing up a self-hosted listener process is the village's own operational work. This module
reports the posture and says what it costs; it does not start a listener.

**Why the posture is worth naming at all.** The bridge header records that the hub runs one
Alchemy listener on Base for every fork. That single listener is a single point of failure for
every fork's governance outcomes, and until this module a fork had no way to know it was leaning
on it.

## Discovery proposes, the founder confirms

`server/lib/hypha/discovery.ts` lists every token the founder's Base account holds, with name,
symbol and address, marks the ones whose name matches a hint, and picks nothing.

The shipped lookup matched on a token's exact on-chain name and returned the single match. Two
things make that the wrong shape. A founder's account holds airdropped tokens nobody asked for,
and a scam token's whole trick is to carry the real token's exact name, so an exact-name test is
precisely the test an impersonating contract is built to pass.

Confirming a candidate (`POST /api/admin/hypha/bind`) reads `name()`, `symbol()` and `decimals()`
off the contract itself and stores them with the moment they were read and the admin who
confirmed. A contract that will not answer is refused with nothing stored. That is the check a
name match cannot perform for itself.

Pointing the platform at a contract stays a **separate** write through the audited variables
route (`tokens.equity_address`, `tokens.voice_address`). Two human acts, one audit trail each.
Folding them together would move a contract pointer change outside the trail every other variable
change gets.

**Discovery can only see what the account holds.** Creating a token on Hypha does not by itself
put a balance anywhere. `HYPHA_FIRST_STEPS` carries the four steps a founder does in Hypha first
and the admin panel renders them.

## The token names come from the chain

Base is already declared the source of truth for a village's token names and `tokenNameClash`
enforces that rule, and until this module nothing had ever asked a contract what it was called.
The names on screen came from a founder typing them into a variable, so the guard defended a claim
it could not check.

`readTokenIdentity` in `server/lib/base-reads.ts` reads all three fields with no cache, because a
binding happens once and correctness there matters more than a round trip. The decimals cache in
that file serves the hot balance path, and reusing it would let a stale entry decide what a new
binding is scaled by. `hypha_token_bindings` stores the answer with `read_at`, so a displayed name
carries the date the chain said it.

## The village, not only the member

`onchain_balances` is keyed per user, so every chain figure the platform held was one person's
holding. `hypha_village_reads` holds facts about the village: total supply per bound token, and
what the treasury address (`hypha.treasury_address`) holds of it.

Same null-never-zero discipline, no exceptions. On a successful read the row is upserted. On any
failure nothing is written and the caller gets the last known figure marked stale with the moment
it was true, or nothing at all when the chain has never answered. A zero total supply reads as a
statement that the DAO issued nothing, which is a claim about the village's whole cap table.

## The marker, the agreement id, and the orphans

`hypha-bridge.ts` says it in its own header: the `[gm:<id>]` marker is the whole contract and a
human can delete it. A title is an editable field in somebody else's product.

`server/lib/hypha/outcomes.ts` keys on the **agreement id** Hypha returns at creation, which
`mechanics_proposals.hypha_proposal_id` already stores at link time and which the chain carries by
itself. The marker stays as the fallback for a delivery that carries no agreement id.

When both resolve and disagree, the agreement id wins and the disagreement is reported. The only
ways it happens are a mispasted link or two proposals sharing an id, and both are worth a human
looking at.

When neither matches, the delivery is recorded in `hypha_outcomes` with `matched_by = 'none'` and
appears in the admin panel's orphan list. It used to be answered and forgotten, so a village
learned a decision had gone missing when somebody asked why nothing had applied. A steward answers
an orphan by hand with a note; nothing here resolves one automatically.

Outcome logging happens only while the module is non-off. With the module off the callback behaves
exactly as it always has.

## Does the outcome really come from your space

`hypha.space_id` shipped with a description promising it would let the platform verify that
on-chain outcomes claiming to be yours really came from your space. Nothing read the field. The
governance webhook authenticated on a shared header secret alone, so a founder who filled the
field in believed they had added chain-level provenance and had added nothing.

**The decision was to make it true rather than to delete the claim**, because the check is real,
cheap and defends against the likeliest failure. The signature proves the sender holds this
village's secret; it cannot prove the outcome is this village's. One hub watches Base for many
forks off one listener, so a routing mistake there arrives correctly signed.

`checkSpace` returns one of four verdicts and `/api/webhooks/mechanics-governance` acts on each:

- `unconfigured` (the village recorded no space id): nothing is checked and nothing is claimed.
- `match`: accepted.
- `mismatch`: **refused with a 403**, and reported.
- `unstated` (the village recorded one, the delivery named none): accepted, and reported. A check
  that cannot run must never read as a check that passed, and refusing instead would take a
  working integration down the first time a sender dropped an optional field.

The check is **not** module-gated, because `hypha.space_id` is platform configuration every
village can see whether or not this module is on, and its description now states this behaviour.

## Moving a village's governance to Hypha

**The answer is: finish here, then switch.** Nothing in flight moves, nothing in flight is
cancelled, and the change takes effect on the next decision opened.

That is what the snapshot law already makes true, and this module's job was to name it, prove it
and show it:

- A ballot freezes its method, dials, electorate and weights inside the transaction that opens it
  (`server/lib/ballots.ts`), and every later read is of the frozen columns.
  `governance.default_method` is read once, at open, and never again. An already-open ballot
  cannot notice the flip.
- Applying a passed proposal keys on the proposal's own status, never on the village's current
  method. A proposal that passed an on-site ballot still applies after the flip.
- The flip's only live effect is on the next open: opening an on-site ballot is refused once the
  method is `hypha`, with a sentence saying so.

`switchoverPreflight` in `server/lib/hypha/switchover.ts` turns that into a sentence a founder
reads, naming how many decisions are running and what each group will do. `server/hypha.test.ts`
proves it by walking a real ballot across a real flip instead of by asserting the rule.

## Other DAO stacks

The founder's ruling (R58d) was to make the module open so other DAO stacks can integrate, with
each one being its own module because this one is specifically Hypha.

The seam is `server/lib/base-reads.ts`. Everything above `baseChainClient` is general: an
SSRF-checked dialer with the loopback exemption, a decimals cache, string-math formatting, and the
null-never-zero rule. `baseChainClient`, `readTokenIdentity` and `readVillageMetric` know nothing
about Hypha. A second stack writes a sibling module and builds on those, so it never reaches for
`createPublicClient` itself, which is the part that would actually go wrong.

It is deliberately not an adapter interface with one implementation. There is no second stack yet,
and a speculative abstraction shaped around a single case is a worse starting point for the second
case than plain functions are.

## Commercials

**Free to every village.** No pricing record, no licence key, no entitlement gate. That is the
v1.0 shape the founder set (R58c): modules earn `$ReGen` from the builders' pool and cost a village
nothing. A `pricing` block would be refused at `included` anyway, and the absence is the statement.

Note for whoever builds usage metering: `shared/modulePool.ts` decides pool ELIGIBILITY from the
registry and says in its own header that it deliberately does not know whether a village is
running a module, because that is per-village state and hub arithmetic. Nothing in this repository
counts module usage today. `module_events` records lifecycle, config and listing acceptances only;
`integration_health` records whether an integration's last call worked and carries no call count.

## Tables

`drizzle/0096_hypha_module.sql`

- `hypha_token_bindings` (PK `token_slug`): the contract, the chain's own name, symbol and
  decimals, `read_at`, and who confirmed it. `confirmed_by_user_id` is NOT NULL because a binding
  nobody confirmed must not exist.
- `hypha_village_reads` (PK `token_slug, metric, subject_address`): village-level figures as
  `DECIMAL(65,0)` with the decimals they are scaled by.

`drizzle/0097_hypha_outcomes.sql`

- `hypha_outcomes`: every delivery, matched or not, with a NOT NULL `delivery_key` unique index so
  a retry repairs instead of duplicating. Nothing here applies anything or changes a proposal's
  status; the existing verify path still owns all of that.

## Routes

`/api/hypha` mounts whole behind `requireModule("hypha")`. The admin routes sit under
`/api/admin/hypha` **per route**, because that prefix already carries `find-token`, which predates
this module and which every village reaches from the Integrate DAO panel today. Mounting the
prefix wholesale would answer 404 for a working founder surface on the deploy that added this
module.

| route | what it does |
|---|---|
| `GET /api/hypha` | links, listener posture, confirmed tokens with chain names and village figures |
| `POST /api/admin/hypha/candidates` | the pick-list. Proposes, never picks |
| `POST /api/admin/hypha/bind` | confirm a binding, reading name/symbol/decimals from chain |
| `DELETE /api/admin/hypha/bindings/:slug` | unbind. Nothing on Base changes |
| `GET /api/admin/hypha/status` | bindings, posture, switchover preflight, orphans |
| `POST /api/admin/hypha/refresh` | pull the village figures again now |
| `POST /api/admin/hypha/outcomes/:id/resolve` | a steward answers an orphan, with a note |

## Readiness, and an unconfigured fork

Setup is `required`, and readiness is a custom reader in `server/lib/modules.ts`: ready when
`hypha.org_url` is set **and** at least one token contract has been confirmed. Both halves are
needed. Without the org URL every Hypha surface hides by design, so a binding has nowhere to link
out to; without a binding there is no name, no supply and no treasury figure, and a page of empty
cards is exactly the broken-looking module this reader prevents.

The catalog card says the module needs a Base endpoint somebody pays for, and the admin panel
names which of the two listener paths this village is on before a founder configures anything.

## Secrets

`basescan_api_key` goes through `server/lib/secrets.ts`, write-only and masked to last4. The Base
RPC URL is an admin-typed game variable and every dial to it goes through the SSRF guard in
`base-reads.ts`. Discovery's two outbound calls go through `guardedFetchJson`, which pins the
vetted address and re-validates every redirect hop.
