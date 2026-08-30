# The Exchange engine and the Player Profile — the economy gets a body (v2, adversarially hardened)

**Paste into Claude Code** (site lane: worktree off current `origin/main`; never edit
`docs/prototypes/**`). Stack per the `regen-database-sql` skill: MySQL on Railway, Drizzle ORM,
`npx drizzle-kit generate`, `node apply-migrations.mjs`, seeds in `scripts/` with `--dry-run`.
Voice per `regen-content-repurposing` and the map's voice pass: no em-dashes in any user-facing
string, no AI-isms, the game voice throughout. Ships OFF behind flag `economy` (gatherings
pattern) until Rye flips it. **v2 note:** this revision survived a red-team pass; the integrity
rules in §2 are load-bearing, not optional polish. **Sequencing note (2026-08-10):** this doc is
now BUILD 2. The profile-body tables from §1's second migration (questClaims, badges, journey
progress, profile extension, privacy) ship first inside `PROFILE_BUILD_1_2026-08-10.md` (same
folder) together with characters and the selection page; this build then adds the ledger,
rules, gratitude, and the Standing/Gratitude/Inventory/Moon Ledger sections of the profile.

## 0 · The economic laws (doctrine, enforced in code)

1. **Hearts are gratitude, never a wage.** Hearts are GIVEN, not paid. Giving MINTS fresh Hearts
   to the receiver (recognition is not zero-sum; nothing leaves the giver's balance). What bounds
   it: a per-moon **giving allowance** (default 30 ♥, village dial) computed from the ledger
   itself, never stored as a counter. Self-gratitude is blocked.
2. **Useful, never votes.** Stay credits and library credits spend on real things. No token buys
   governance, and no account-creation path mints voice: the village's VOICE token (the founder
   names it; **Amora Voice** at Amora) mints ONLY from confirmed contribution (quest
   confirmations, role cycles), never from onboarding, joining, or admin grants. Enforced in the
   engine, not in policy. Voice's true home is Hypha; the ledger accrues it on-platform and the
   claim bridge carries it there (§7).
3. **One ledger, every token.** `ledgerEvents` is append-only. No UPDATE, no DELETE; corrections
   are reversing entries with their own idempotency. Balances, allowances, and counts are all
   COMPUTED from the ledger (recompute, never increment — the counts doctrine is the money
   doctrine).
4. **The moon closes the books.** A settlement job each lunation: stewards are thanked, giving
   allowances reset (unused does not roll over and nothing held is ever confiscated), Moon Ledger
   recap cards are issued. Honest rhythm; no streaks, no decay, no dark patterns.
5. **Creator's word, next moon.** Token types, rule amounts, allowance size, titles, and labels
   are village vocabulary, editable in The Mint; every admin change is itself ledgered, and
   amount changes take effect at the NEXT cycle so a rule cannot be spiked and reverted around a
   payout. Platform tokens ($ReGen, RGVoice) are outside village editing entirely.
6. **Reward outcomes, not participation.** Value mints on CONFIRMED completion (two-party
   consent: claimant turns the quest in, a steward who is not the claimant confirms). Attendance
   earns badge progress only, and only via steward check-in, never via RSVP alone.
7. **Surfaces are lenses (D9).** Map, profile, and wallet all read the same ledger. Delete any
   surface and no value dies.

## 1 · Migrations (0061, 0062 — Drizzle-generated, Railway snapshot first)

Every economy table carries `villageId` (default the Amora village row): balances, rules,
allowances, and idempotency are all village-scoped. Cheap now, painful to retrofit.

**0061 `economy core`** (match the codebase's existing naming style):
- `tokenTypes`: villageId, key ('hearts','stay_credit','library_credit','voice'), name (voice's
  display name is the founder's word, default 'Amora Voice'), glyph, color, kind
  ('gratitude'|'utility'|'voice'), transferable bool, spendable bool, decimals, sortOrder,
  external_ref nullable (voice's Hypha mirror lives here). Flags at seed: hearts
  {transferable:false, spendable:false} (standing is never tradeable), stay/library
  {true, true}, voice {false, false}. The VILLAGE seed carries no platform tokens: $ReGen and
  RGVoice belong to the platform game's own instance of this engine.
- `ledgerEvents`: villageId, ts, tokenKey, amount decimal, fromProfileId nullable (null = MINT),
  toProfileId nullable (null = SINK), sourceKind ('quest'|'gratitude'|'role_cycle'|'journey'|
  'welcome_aboard'|'stay'|'library'|'event'|'admin_grant'|'transfer'|'reversal'), sourceId,
  note, ruleId nullable, reversedEventId nullable, idempotencyKey UNIQUE (villageId baked in),
  createdBy. Append-only; no update/delete path exists in code.
- `questClaims` (multi-claimant, recurring-safe): id, villageId, questId, profileId, state
  ('claimed'|'turned_in'|'confirmed'|'declined'), turnedInAt, confirmedAt, confirmedBy, note.
  A build day with eight hands is eight claim rows; a weekly quest is a new claim row per week.
  Turn-in without a prior claim is allowed (the row is created at turn-in; consent still happens
  at confirm). Round D's `{type:'claim'}` bridge posts land here.
- `mintRules`: villageId, trigger, tokenKey, amount decimal nullable (null = from_source),
  ceiling decimal nullable (hard cap on any from_source amount), recipient, enabled, note,
  effectiveFromCycle. Village-editable ONLY for village tokens; rules touching 'regen'/'rgvoice'
  are code-fixed and render read-only in The Mint.
- `gratitudeNotes`: id, villageId, fromProfileId, toProfileId, amount, note, tag nullable,
  structureKey nullable, quiet bool, clientNonce UNIQUE, ts. The ledger row's sourceId is THIS
  row's server-assigned id.

**0062 `profile body`**:
- `badgeDefs`: villageId, key, name, charge ('quest'|'role'|'event'|'conversation'|'journey'|
  'special'), circleKey nullable, criteria json, blurb, sortOrder.
- `badgeAwards`: profileId, badgeKey, ts, sourceNote. UNIQUE(profileId, badgeKey, villageId).
- `journeyProgress`: profileId, journeyId, stage, ts.
- `eventCheckins`: eventId, profileId, confirmedBy, ts (steward check-in; the ONLY source of
  event badge progress).
- profile extension: title, handle UNIQUE, portraitKind ('medallion'|'generated'|'photo'),
  portraitRef, homeStructureKey nullable, joinedAt, verifiedAt nullable, privacy json
  ({showBalances:false, showCalendar:false, showBadges:true, showRoles:true, showHearts:true,
  showHome:false, showInventory:false}).

## 2 · The engine service (one module, e.g. `server/economy.ts`) — the integrity rules

ONE guarded write path. `mint()`, `reverse()`, and `transfer()` all pass through the same
validator; nothing else writes `ledgerEvents`.

**Idempotency keys carry the occurrence, so repeatable things repeat and replays never
double-mint:**
- `quest.completed:<villageId>:<questId>:<claimId>:<profileId>` (claimId is the occurrence:
  recurring quests and multi-claimant quests mint correctly)
- `gratitude.given:<villageId>:<gratitudeNoteId>`
- `role.cycle:<villageId>:<cycleKey>:<seatId>:<profileId>` (two seats = two thanks)
- `journey.stage_reached:<villageId>:<journeyId>:<stage>:<profileId>`
- `welcome_aboard.quest:<villageId>:<questNo>:<profileId>`
- `transfer:<villageId>:<transferRowId>` (never keyed on a nullable recipient)
- `reversal:<villageId>:<eventId>`

**Validation, every write:** amount > 0 for every non-reversal (a negative gratitude POST is an
attack, not a gift); decimals per token; from_source amounts clamped to the rule's ceiling;
tokenType flags enforced (no transfer of non-transferables, no spend of non-spendables).

**Gratitude:** self-gratitude rejected. The giver's spent allowance is computed inside the same
serializable transaction that writes the mint (SUM of this cycle's gratitude.given minus
same-cycle reversals of those gifts; `SELECT ... FOR UPDATE` on the giver row closes the
five-simultaneous-gives race). Per-recipient cap: max 10 ♥ to the same person per moon (village
dial). Accounts before their first confirmed quest can give at most 10 ♥ per moon total; full
allowance unlocks with the first confirmation. Reversing an in-cycle gift refunds the giver's
allowance by construction (the SUM subtracts it). The meter clamps at 0; dial changes apply only
to gives made after the change and are themselves ledgered.

**Quests:** confirm requires confirmer ≠ claimant (a steward turning in their own quest
escalates to another steward or admin). Reciprocal confirm pairs (A confirms B while B confirms
A in the same moon) are flagged in the audit feed, not blocked. Reward numbers are fixed at post
time by someone other than the eventual confirmer, and clamped by the rule ceiling. Quest clones
from Round D's Duplicate carry a lineageKey; the audit surfaces repeated same-claimant payouts
across a lineage.

**Reversals:** `reverse(eventId, note)` writes ONE mirror (its own idempotency key), records
`reversedEventId`, and refuses to reverse a reversal or an already-reversed event. Because
occurrence keys live on claims and notes, an honest re-do after a wrong reversal mints cleanly
as a new occurrence.

**Transfers:** serializable transaction proving SUM(sender, token) ≥ amount before the write; a
double-spend of the last stay credit loses the race, not the credit.

**Platform tokens are Sybil-hardened, and village games never touch them (Rye's call):**
'regen' and 'rgvoice' never mint via admin_grant, never appear in village-editable rules, and
never mint from a village game at all. In the PLATFORM game only, welcome-aboard mints $ReGen
(33/quest, 330 + 1 RGVoice + first-Claim unlock at ten, amounts fixed in code) and requires
`verifiedAt` set AND a vouch from an existing verified member recorded on the profile: a
hundred sockpuppets get no voice and no $ReGen. RGVoice, and every village's own voice token,
mint only from quest.completed and role.cycle. The first-Claim unlock is UNIQUE-constrained per
profile. In a CUSTOM village game,
welcome-aboard quests mint the VILLAGE's own token (Amora: Hearts) through ordinary
village-editable rules with ceilings; the village's welcome is the village's currency.

**The settlement job** (cron each full moon; the SITE owns the canonical lunation math and
exposes `cycleKey` in `/api/map/config` so the map's moon and the ledger's moon never drift):
per-recipient occurrence keys make a re-run or a resumed partial run a no-op; rule amounts are
read as-of cycle start (effectiveFromCycle).

## 3 · Default seed (Amora's Mint, editable day one)

| trigger | token | amount | ceiling | to |
|---|---|---|---|---|
| gratitude.given | hearts | giver's input (1..allowance) | 30 | receiver |
| quest.completed | hearts | from_source (posted ♥) | 100 | each confirmed claimant |
| welcome_aboard.quest (platform game only) | regen 33 + rgvoice 0.1 | code-fixed | n/a | verified + vouched member |
| welcome_aboard.all_ten (platform game only) | regen 330 total + rgvoice 1 + first Claim | code-fixed | n/a | verified + vouched member |
| welcome_aboard.quest (village game) | hearts | 10 (village dial) | 30 | member |
| welcome_aboard.all_ten (village game) | Welcome Aboard badge + title | n/a | n/a | member |
| role.cycle | hearts | 20 (village dial) | 100 | each active role holder, per seat |
| quest.completed | voice | 0.1 (village dial) | 1 | each confirmed claimant |
| role.cycle | voice | 0.5 (village dial) | 2 | each active role holder, per seat |
| journey.stage_reached('resident') | stay_credit | 2 (welcome gift) | 10 | member |
| library.contributed | library_credit | from_source (posted valuation) | 50 | contributor |
| stay.work_exchange | stay_credit | from_source (posted) | 10 | claimant |
| event check-in (steward-confirmed) | no currency | n/a | n/a | badge progress only |

Badge seed (criteria count CONFIRMED occurrences only): First Fruit (first confirmed quest),
Wall-Raiser (3 build-day check-ins), Greenhouse Guardian (3 confirmed greenhouse quests), Deep
Roots (Resident stage), Fire Keeper (a season holding a role), Welcome Aboard (all ten),
Storyteller (origin-story quest). Same seal language as the map badges.

Genesis: pre-ledger balances (if any) enter as admin_grant rows noted "genesis: pre-ledger
balance honored" — Hearts numbers from Rye or zero-start; $ReGen genesis only from platform
records.

## 4 · The Player Profile (`/profile` own · `/profile/:handle` public)

A character sheet, not a settings page. Parchment and gold, the map's skin tokens. Sections:

- **Header**: portrait (v1 medallion: circle-colored ring, chosen sigil or initial; 'generated'
  waits on Rye's art blessing), name + equipped **Title**, circle ribbons, "11 moons on the
  land". Home on the land ("hearths at Pond Homes", deep link `#/place/<key>`) shows ONLY per
  the `showHome` flag (default members-only): where someone sleeps is not public data.
- **The Standing row**: one chip per held tokenType: ♥ · stay · library · Amora Voice. The
  voice chip renders as earned, never spendable, and carries its claim state: accruing, then
  "claimable at Claims Week" once the threshold is met (§7). Platform tokens appear only when
  the platform game links its own ledger. Tap a chip → its ledger drawer; the drawer inherits
  `showBalances` on the public view.
- **Gratitude**: the headline is warm, not cumulative: "thanked by 14 members this season" with
  recent thanks beneath, and lifetime Hearts as the smaller line. Gratitude GIVEN sits co-equal
  beside received (generosity is a status axis, not just accumulation). Recent thanks cards
  show giver, note, tag, place; a `quiet` gift shows publicly as "someone, quietly". The give
  button carries the allowance meter ("You can still give 18 ♥ this moon", clamped at 0) and an
  optional tag + place. Public view aggregates: no giver handles, places, or timestamps on
  strangers' screens unless the giver opted in.
- **Quest Log**: active claims with the Round D "Your first step" block and a **Turn in**
  button; turned-in shows the confirming steward; history shows confirmations; progress lines
  toward badges ("2 of 3 build days toward Wall-Raiser").
- **Roles**: current seats with circle color and term ("Water Steward since the Flower Moon"),
  past service; links into `#/circles`.
- **Badge cabinet**: earned seals in the map's SVG seal language; nearby earnables as dashed
  seals with honest progress. Tap flips a seal to its story.
- **Inventory** (real things only, `showInventory` gated): borrowed library items (due + wear),
  booked stays, reserved lots, welcome gifts. Empty state: "Light pack. The Library door is
  open."
- **My calendar** (`showCalendar` gated): RSVPs, take-backable here too.
- **Moon Ledger**: last cycle's recap card; a new member's first card celebrates arrival, not
  zeros. Members before their first confirmed quest read as "new on the land", never "0 Hearts".
- NO XP bar, NO level number. Journeys are the levels ("Stage 4 of 8 · Resident"), badges the
  achievements, warm standing the reputation, titles the identity. Never invent points.

## 5 · The Mint (admin panel in Make This Yours) + APIs

Panel: tokenTypes editor (add, rename, glyph from the SHARED glyph library the map's flow media
use, color, flags), mintRules table (trigger, token, amount, ceiling, on/off; platform-token
rows visible but read-only, marked "held by the platform"), allowance + per-recipient dials,
titles editor, badge editor, **supply dashboard** (per token per moon: minted, by source — the
inflation early-warning), settlement preview ("at the next full moon: 6 stewards thanked,
120 ♥"), **claims controls** (the voice claim threshold N, each season's Claims Week dates, and
the Hypha DHO/space the voice-claim intent targets), manual grant form (village tokens only;
grants above 100 ♥ or any grant to yourself require a second steward's co-sign; always noted,
always ledgered). Every change writes an audit row; the audit feed is visible to all members:
transparency is the control, not bureaucracy.

**The Mint is also a BUILDING on the map** (Rye's call; shipped as sample content in the
artifact's v0.7-mint1, map lane). Its room shows The rules, The voice, The flow, Claims Week,
and The work. This build feeds it live: `GET /api/economy/rules` returns the enabled mintRules
rendered in plain game voice, `GET /api/economy/supply` returns per-moon minted by source (the
same numbers as the admin supply dashboard: the village's books are public), and roles/quests
tagged `tokenomics` surface in The work. The map swaps its sample rows for these reads next map
round.

APIs: `GET /api/me/profile` · `GET /api/profiles/:handle` (privacy-filtered) ·
`GET /api/me/ledger?token=` · `POST /api/gratitude` (clientNonce required) ·
`POST /api/quests/:id/turn-in` · `POST /api/quests/:id/confirm` (steward-gated, ≠ claimant) ·
`POST /api/events/:id/checkin` (steward-gated) · admin CRUD (village-scoped) · the settlement
cron. Round D's `/api/quests/claim` + `/api/events/rsvp` write `questClaims`/RSVPs.
`/api/map/config` gains `me: {claims:[], rsvps:[]}` and `cycleKey` (optional fields; the map
consumes them next round).

## 6 · Order of work, gates

P1 ledger core: 0061, engine + validator, idempotency/reversal/transfer unit tests. P2 sources:
claims + turn-in/confirm, gratitude + allowance transaction, welcome-aboard vouch wiring,
settlement job. P3 the Player Profile + public view + privacy. P4 The Mint + badges + check-ins
+ Moon Ledger + config `me{}`/`cycleKey`. P5 seeds, full test run, orphan sweep, PR body, push
commands. Flag stays OFF until Rye's word.

**Tests that matter most (each was a live exploit in review):** same idempotencyKey twice = one
row; five concurrent gives cannot exceed the allowance; negative and zero gratitude rejected;
reverse twice = one mirror; reversing a reversal refused; re-confirm after a wrong reversal
mints as a new occurrence; two claimants on one quest both mint; a recurring quest mints per
claim row; the last stay credit survives a double-spend race; RGVoice via admin_grant refused;
welcome-aboard mint without vouch refused; a rule amount raised mid-cycle does not change the
current settlement; the same key in two villages coexists; privacy flags honored on the public
route; steward cannot confirm their own claim; clone-lineage payouts surface in audit;
settlement re-run is a no-op; a voice claim below threshold is refused; a claim outside Claims
Week waits (unless admin-excepted) and inside the window raises exactly ONE voice-claim bridge
intent; debit at request, refund on cancel, reconcile on webhook confirm, each idempotent.

## 7 · Voice at Hypha: the claim bridge and Claims Week (Rye's design)

Voice accrues on-platform in this ledger, exactly like every token. Its destination is Hypha,
and the bridge between them cuts hard proposals there dramatically:

- **Threshold**: `claim_threshold_voice` (N, admin dial in The Mint). Below N the profile chip
  simply accrues. At or above N the chip turns claimable.
- **The claim** MUST go through the Hypha Bridge module (`server/lib/hypha-bridge/`) with a NEW
  intent type `voice-claim`; never hand-roll redirects. Mirror the platform's proven
  private-to-public claim bridge (STEERING §5): debit the claimed voice from the ledger at
  request time (a ledger event to the bridge sink), refund on cancel or stale claim, reconcile
  on the webhook confirm (the cascadeClaimPassed pattern). One-way, idempotent under concurrent
  dispatch, validated at raise AND at execution.
- **Claims Week**: one week each season, dates set in The Mint. Claims OPEN during the window
  (admin can allow exceptions case by case); outside it the chip reads "3.2 accrued · claims
  open with the Harvest moon". The whole season's contributions formalize into Hypha in one
  governance pass instead of a drip of hard proposals.
- **Spends are rows too**: room stays and library borrows debit spendable credits as ledger
  events to the village sink. Every spend is as auditable as every mint.

## Bookmarks (approved by Rye, separate builds)
Mint schedule + circle bounty budgets decided by village VOTE: its own module and build.
Game Mechanics admin page: reward-suggester weights (open, customizable), future economy levers.
Seasons × class activity matrix (a Builder builds software in the foundations season and
buildings in the village season; platform roles already carry `seasons[]`). QR / four-word
check-in founder launch kit in admin. Full list lives in PROFILE_BUILD_1's bookmarks.

## Handoff — RYE only
| # | Task |
|---|---|
| 1 | Railway snapshot, then run 0061 + 0062; set the settlement cron env |
| 2 | Bless the dials: 30 ♥ allowance, 10 ♥ per-recipient cap, 20 ♥ steward thanks, 2 stay credits at Resident, 100 ♥ co-sign threshold |
| 3 | Decide the vouch flow's shape (who can vouch a newcomer) and any genesis Hearts numbers |
| 3b | Name the voice token, set the claim threshold N and each season's Claims Week dates, and provide the Hypha DHO/space for the voice-claim intent |
| 4 | Bless portrait art direction from samples before 'generated' ships (medallions fine day one) |
| 5 | Flip the `economy` flag when P5 gates are green; push and deploy |
| 6 | Standing items: amber approval round on the Loom; site quest titles em-dash cleanup |
