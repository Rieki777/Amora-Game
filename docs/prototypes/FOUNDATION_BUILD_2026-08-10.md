# THE FOUNDATION BUILD — characters, the Player Profile, and the economy engine of the custom game

**This is a single, self-contained program for one Claude Code (Opus) session to execute
end-to-end in the `game-amora` repo.** It MERGES and SUPERSEDES `PROFILE_BUILD_1_2026-08-10.md`
and `SITE_ECONOMY_PROFILE_2026-08-09.md` (same folder; read them only if a detail here seems
ambiguous, this doc wins on conflict). It has survived TWO adversarial red-team passes; §4 and
§12 encode the fixes. The design decisions are SETTLED: do not relitigate doctrine, schema
shape, or integrity rules. Open judgment calls are marked "builder's call".

**How to run this:** work in a worktree off current `origin/main`. Never edit
`docs/prototypes/**` (the map lane owns it). Execute phases §11 in order; each has a gate.
Verification before completion at every gate: run the commands, show the output, no green
claims without evidence. Voice rules for every user-facing string: the game voice, no
em-dashes, no AI-isms (grep gate in P8). All work ships OFF behind flag `economy` (characters
and profile ship behind flag `characters`, ON when P8 passes; economy stays OFF until Rye).

## §1 · Study first: copy what regen-civics already proved

The platform repo is at `C:\Users\taren\Downloads\regen-civics-clean`. Read before writing:

1. **The token model** (its `CLAUDE.md` + `.ai/docs/STEERING.md` §5): private-first balances,
   `creditPrivateTokens` as the only write, `user_token_ledger` append-only source-tagged,
   claim bridge (`requestClaim` debits at request, `cancelClaim`/nightly stale-cancel refund,
   `webhook-receiver.cascadeClaimPassed` reconciles). COPY the shape, not the code verbatim:
   every copied query gains `villageId` (finding #11, §4.9).
2. **The Hypha Bridge module** (`server/lib/hypha-bridge/`): intent-type pattern, validate at
   raise AND execution, idempotent under concurrent dispatch. Our `voice-claim` intent extends
   this pattern in game-amora's OWN module with game-amora's OWN env (§4.8).
3. **Characters + art**: `client/src/pages/Team.tsx` (the 5 archetypal contributions copy),
   `client/src/data/gameRoles.ts` (role card shape, `seasons[]`),
   `CLAUDE_CODE_PROMPT_2026-04-03_CHARACTER_ART.md` (THE style guide, reuse verbatim).
4. **Security**: `.ai/docs/security/BUILD-PLAYBOOK.md` webhook/env/endpoint checklists; apply
   them to every new endpoint and the webhook receiver here.
5. **Discipline**: migration runner pattern, seed `--dry-run`, ship-gate habits.

## §2 · The economic laws (doctrine, enforced in code, SETTLED)

1. **Hearts are gratitude, never a wage.** Given, not paid; giving MINTS fresh Hearts to the
   receiver, bounded by a per-moon giving allowance (default 30 ♥, dial) COMPUTED from the
   ledger, never stored. Self-gratitude blocked.
2. **Useful, never votes.** Stay/library credits spend on real things. No token buys
   governance. The village's VOICE token (founder-named; default **Amora Voice**) mints ONLY
   from confirmed contribution (quest confirmations, role cycles); never from onboarding,
   joining, or grants. Voice's true home is Hypha; the ledger accrues it, the claim bridge
   carries it (§8).
3. **One ledger, every token.** `ledgerEvents` append-only; no UPDATE/DELETE anywhere;
   corrections are keyed reversing entries. Balances, allowances, counts: computed, never
   incremented. Spends (stays, library) are ledger rows to the village sink.
4. **The moon closes the books.** Settlement each lunation: stewards thanked, allowances
   reset, Moon Ledger cards issued. Nothing held is ever confiscated. No streaks, no decay.
5. **Creator's word, next moon.** Token types, rule amounts, allowance, threshold N, Claims
   Week dates, titles, labels: village dials, every change ledgered, and every ECONOMIC dial
   (rule amounts, ceilings, threshold, window dates) takes effect at the NEXT cycle so nothing
   can be spiked or frozen around a payout (finding 2-#7). Platform tokens ($ReGen, RGVoice)
   do not exist in this deployment's seed at all.
6. **Reward outcomes, not participation.** Mints require two-party consent: claimant turns in,
   a steward who is NOT the claimant confirms. Attendance = badge progress only, via steward
   check-in, never RSVP.
7. **Classes guide, never gate.** Playing a class tunes DISCOVERY surfaces only (map badges,
   suggestions, class panels). The Quest Log, search, Get Involved, and every earning surface
   are NEVER class-filtered; the ⚑ urgent list ignores classes; "whole land" toggle persists
   per user (finding 2-note).
8. **Surfaces are lenses.** Map, profile, wallet, and The Mint building all read the same
   ledger. Delete any surface and no value dies.

## §3 · Schema (ONE migration sequence, M1→M4, next free numbers reserved up front)

Every economy/profile table carries `villageId`; every UNIQUE involving idempotency is
`UNIQUE(villageId, key)`. Railway snapshot before running. Each table created EXACTLY ONCE
(finding 2-#10: the two source docs overlap on questClaims/badges; this sequence is the truth).

**M1 `characters`:** `archetypes` (villageId, key, name, subtitle, blurb, sigil, sortOrder;
seeded: building/The Builder, researching/The Architect, facilitating/The Spaceholder,
catalyzing/The Catalyst, storytelling/The Storyteller, subtitles = the five contributions);
`playerCharacters` (id, profileId, archetypeKey, presentation, tone, chosenAt) with
`profiles.primaryCharacterId` FK for the one-primary invariant (finding 2-#14; NO isPrimary
bool); class tags: `archetypes` json array column on roles and quests (empty = everyone).

**M2 `profile body`:** profile extension (handle UNIQUE, title, homeStructureKey, joinedAt,
verifiedAt, privacy json {showHome:false, showInventory:false, showCalendar:false,
showBadges:true, showRoles:true, showHearts:true}); `questClaims` (id, villageId, questId,
profileId, state 'claimed'|'turned_in'|'confirmed'|'declined', turnedInAt, confirmedAt,
confirmedBy, note); `eventRsvps`; `eventCheckins` (steward-confirmed, sole source of event
badge progress); `badgeDefs` (criteria json), `badgeAwards` UNIQUE(profileId,badgeKey,
villageId), `journeyProgress`.

**M3 `economy core`:** `tokenTypes` (key ∈ hearts, stay_credit, library_credit, voice; voice
name is the founder's word default 'Amora Voice'; flags: hearts f/f, stay+library t/t, voice
f/f; external_ref for the Hypha mirror); `ledgerEvents` (ts, tokenKey, amount, fromProfileId
null=MINT, toProfileId null=SINK, sourceKind, sourceId, note, ruleId, reversedEventId,
idempotencyKey, createdBy; append-only); `mintRules` (trigger, tokenKey, amount nullable =
from_source, ceiling, recipient, enabled, note, effectiveFromCycle); `gratitudeNotes` (from,
to, amount, note, tag, structureKey, quiet, clientNonce UNIQUE, ts); `economySettings` per
village (givingAllowance, perRecipientCap, claimThresholdVoice, claimsWeekStart/End,
hyphaSpace, economyEpoch timestamp — all changes ledgered, cycle-deferred).

**M4 `voice claims`:** `voiceClaims` (id, villageId, profileId, amount, state 'requested'|
'confirmed'|'canceled'|'stale'|'rejected', debitEventId, intentKey UNIQUE, hyphaRef, ts...).

## §4 · Engine integrity (ONE guarded write path; every rule here was a live exploit)

`mint()`, `reverse()`, `transfer()`, `requestVoiceClaim()`, seeds, and the settlement all pass
one validator module (`server/economy.ts`). Rules:

1. **Occurrence-scoped idempotency keys** (villageId baked in): `quest.completed:<v>:<questId>:
   <claimId>:<profileId>` · `gratitude.given:<v>:<noteId>` · `role.cycle:<v>:<cycleKey>:
   <seatId>:<profileId>` · `journey.stage_reached:<v>:<journeyId>:<stage>:<profileId>` ·
   `welcome_aboard.quest:<v>:<questNo>:<profileId>` · `transfer:<v>:<transferRowId>` ·
   `reversal:<v>:<eventId>` · `voice-claim:<v>:<claimRowId>`. Duplicate key = silent
   already-done.
2. **Amounts**: > 0 for every non-reversal; decimals per token; from_source clamped to the
   rule ceiling; reward numbers fixed at post time by someone other than the confirmer.
3. **Gratitude**: self blocked; allowance = SUM of this cycle's gives minus same-cycle
   reversals of them, computed under `SELECT ... FOR UPDATE` on the giver inside the mint's
   transaction; per-recipient cap 10 ♥/moon (dial); pre-first-confirmed-quest accounts give
   ≤ 10 ♥/moon total; meter clamps at 0; quiet flag supported.
4. **Quests**: confirmer ≠ claimant (self-steward escalates); reciprocal confirm pairs flagged
   in audit; multi-claimant and recurring via claim rows; turn-in without prior claim allowed;
   duplicate-lineage payouts surface in audit.
5. **Reversals**: own key, `reversedEventId` recorded, never reverse a reversal or an
   already-reversed event; refunds are always reversals (inherits all guards).
6. **Transfers + claims prove balance under lock**: serializable transaction proving
   `SUM(sender/profile, token, village) ≥ amount` before the write (finding 2-#4 extends the
   transfer guard to `requestVoiceClaim`); one open voice claim per profile.
7. **economyEpoch** (finding 2-#1): mint source queries only consider `confirmedAt >=
   economyEpoch`. Confirms recorded before the engine's flag-flip are history, never backlog.
   Honoring pre-epoch work is an explicit admin-run, audited, keyed one-shot backfill.
8. **The webhook is ours** (findings 2-#2, 2-#5): game-amora has its OWN Hypha webhook secret
   and OWN env namespace; HMAC-verify every callback; reconcile keyed on the stored intent key
   (replays no-op); resolve village/token/amount from the persisted claim row, never the
   payload; boot assertion refuses to start if any Hypha secret/address is empty or equals a
   known platform constant; the target Hypha space is an admin dial validated against an
   allowlist, changes co-signed and ledgered.
9. **villageId lint** (finding 2-#11): a test greps/inspects every economy query for the
   village scope; any copied platform query without it fails CI.
10. **Flag requires seeds**: the `economy` flag's write paths activate only when the village's
    tokenTypes + mintRules exist (startup precondition), never on the bool alone.

## §5 · Default seed (Amora's Mint; upsert-by-natural-key, insert-if-absent for rules so a
re-run NEVER doubles genesis or clobbers Rye's edited dials — finding 2-#15)

| trigger | token | amount | ceiling | to |
|---|---|---|---|---|
| gratitude.given | hearts | giver's input (1..allowance) | 30 | receiver |
| quest.completed | hearts | from_source (posted ♥) | 100 | each confirmed claimant |
| quest.completed | voice | 0.1 (dial) | 1 | each confirmed claimant |
| role.cycle | hearts | 20 (dial) | 100 | each holder, per seat |
| role.cycle | voice | 0.5 (dial) | 2 | each holder, per seat |
| welcome_aboard.quest | hearts | 10 (dial) | 30 | member |
| welcome_aboard.all_ten | Welcome Aboard badge + title | n/a | n/a | member |
| journey.stage_reached('resident') | stay_credit | 2 | 10 | member |
| library.contributed | library_credit | from_source | 50 | contributor |
| stay.work_exchange | stay_credit | from_source | 10 | claimant |
| event check-in | badge progress only | n/a | n/a | attendee |

Badges (criteria count CONFIRMED occurrences only): First Fruit, Wall-Raiser (3 build-day
check-ins), Greenhouse Guardian, Deep Roots (Resident), Fire Keeper (a season in a role),
Welcome Aboard, Storyteller. Genesis Hearts (if Rye supplies numbers) as keyed admin_grant
rows noted "genesis: pre-ledger balance honored".

## §6 · Characters: the five classes, the selection page, the avatars

Class names SETTLED by Rye: **The Builder, The Architect, The Spaceholder, The Catalyst, The
Storyteller** (village-renameable vocabulary, subtitles = the archetypal contributions).

**Selection page** (`/profile/characters` + skippable first-run "Choose who you will be"):
left rail = five sigil chips; center stage = large avatar card, presentation (f/m) and tone
(three swatches) pickers, slow CSS breathing; right panel = class blurb, four example
contributions (copied from Team.tsx), **Open paths** (roles tagged with this class in the
role-card grammar: title, ~h/wk, circle band dots) and a quest count; bottom = "Walk this
path" → **Your Party** row (✕ remove, ★ primary). Multi-class is the point. Copy on page:
"Play as many as you like. Change any time. Every door stays open to every hand."

**Server validation** (finding 2-#9): presentation ∈ {f,m}, tone ∈ {deep,olive,light},
archetypeKey ∈ this village's `archetypes.key` rows; avatar file resolved through a FIXED
lookup map, never string-concatenated from stored values; attribute-encode the src. Primary
via `profiles.primaryCharacterId` set in one transaction; deleting the primary promotes the
next party member or falls to the medallion, same transaction (finding 2-#14).

**Avatars** (30 card portraits → `client/public/images/avatars/{archetype}-{f|m}-{tone}.webp`):
reuse the CHARACTER_ART style guide VERBATIM (solarpunk-elven, card portrait spec, 2K,
`cwebp -q 85`). `scripts/gen_avatars.py`, key from env only. **Resume-safe and model-pinned**
(finding 2-#13): skip outputs that exist; SAVE each base PNG so resumed tone-edits derive from
the SAME base; tone variants are edits of the base ("change the skin tone to X, keep face
structure, hairstyle, expression, clothing, tools, pose, lighting and background exactly the
same"); pin the blessed model, back off on 429, NEVER silently fall to another model; write a
manifest (asset → model, base, ts); selection page reads the manifest and degrades missing
assets to medallions (img onError too). Class props: Builder = living-wood mallet + floating
treehouse blueprint; Architect = crystalline lens, leaf-paper scrolls, floating path-map;
Spaceholder = circle staff with hearth-light bowl, woven mat, companion bird; Catalyst =
golden-green threads from the fingertips, mycelium cape, pulsing pendant; Storyteller =
glowing living-wood book, quill of light, firefly lantern.

**P1 SAMPLE GATE (before the 30):** generate exactly three and STOP for Rye: (1) Builder,
woman, deep brown skin — "Illustrated character design with a hand-painted quality, solarpunk
meets elven meets regenerative future aesthetic. Card portrait of a woman with deep brown skin
and dark coiled hair woven with tiny golden flowers, warm confident expression, subtle pointed
ears, subtle bioluminescent freckles, wearing a fitted builder's tunic of living woven fibers
in deep forest green and warm gold with soft glowing teal circuitry patterns, a tool belt of
grown-wood and brass tools with small glowing crystals, holding a living-wood mallet in one
hand while her other open palm raises a small floating translucent holographic blueprint of a
treehouse pavilion, moss cushion boots with tiny ferns, three-quarter body standing pose,
simple soft warm green-to-gold gradient background, no text, no scene elements, clean edges
for card compositing, detailed but not photorealistic, deep forest greens, warm golds,
bioluminescent teal accents, sunrise amber light"; (2) Builder, man, light freckled skin,
short copper hair with small leaves growing in it, carrying a living-wood beam with glowing
graft lines, same garb family and background; (3) the tone-edit of sample 1 → medium olive,
proving identity holds.

## §7 · The Player Profile (`/profile` own · `/profile/:handle` public)

A character sheet in the site's parchment-and-gold skin. Sections in order: **Header** (primary
character art as hero, medallion fallback; name + equipped Title from earned set: journey
stages, held roles, badge titles; circle ribbons; "11 moons on the land"; home per showHome);
**Your Party** (roster row, tap to front a character, add-a-path link); **Standing row** (one
chip per held token: ♥ · stay · library · Amora Voice; voice renders earned-never-spendable
with claim state "3.2 accrued · claims open with the Harvest moon" / "claimable at Claims
Week"; chip → ledger drawer, drawer inherits showBalances publicly); **Gratitude** (headline
"thanked by 14 members this season", lifetime small, GIVEN co-equal beside received, thanks
cards with giver/note/tag/place, quiet gifts show as "someone, quietly", give button with
allowance meter, public view aggregates without giver handles/places/timestamps); **Quest
Log** (never class-filtered; active claims with "Your first step", Turn in, steward Confirm;
history; badge progress lines); **Roles**; **Badge cabinet** (the map's seal SVG language,
dashed progress seals, tap flips to the story); **Inventory** (showInventory-gated; borrowed
items, booked stays, reserved lots; "Light pack. The Library door is open."); **My calendar**
(showCalendar-gated RSVPs, take-backable); **Moon Ledger** (cycle recap; a new member's first
card celebrates arrival; pre-first-quest members read "new on the land", never zeros). NO XP,
NO levels: journeys are the levels ("Stage 4 of 8 · Resident").

## §8 · The Mint (admin panel + the building's live feed) and Voice at Hypha

**Admin panel** (Make This Yours): tokenTypes editor (glyphs from the shared map glyph
library), mintRules table (amount, ceiling, on/off; platform-token rows do not exist here),
allowance + per-recipient dials, claims controls (threshold N, Claims Week dates, Hypha space
from the allowlist), titles/badges editors, supply dashboard (fine per-source detail lives
HERE), settlement preview, manual grant form (village tokens only; > 100 ♥ or self-grants need
a second steward co-sign). Every change ledgered; audit feed visible to all members. All
economic dials cycle-deferred (§2.5).

**The building's public feed** (the map's Mint room, shipped as sample in artifact
v0.7-mint1, swaps to these next map round): `GET /api/economy/rules` returns ENABLED
village-token rules only, whitelisted fields, rendered in the game voice; `GET
/api/economy/supply` returns village-level totals per token per moon ONLY (coarse; the
per-source fine grain stays admin-side, because at small N per-source public data
deanonymizes hidden balances — finding 2-#12); cached per (village, cycle). Roles/quests
tagged `tokenomics` feed "The work".

**Voice claims**: accrue → at ≥ N (cycle-deferred dial) the chip turns claimable → claims OPEN
during Claims Week (exceptions are co-signed, audited rows, not a toggle) → `requestVoiceClaim`
debits under lock (§4.6) and raises ONE `voice-claim` intent through game-amora's Hypha bridge
module (idempotent on intentKey: a retried dispatch reuses the existing Hypha proposal, never
duplicates) → states: requested → confirmed (TERMINAL: cancel/stale illegal after; finding
2-#6) | canceled/stale (refund via reverse(debit)) | **rejected** (Hypha voted no: terminal,
refund via reversal so voice re-accrues; no confiscation; finding 2-#8). Reconcile by webhook
(§4.8) AND by polling Hypha status so a dropped webhook cannot strand voice. Settlement
(cron, site owns the canonical lunation; expose `cycleKey` in `/api/map/config`): role.cycle
mints per occurrence keys, allowances reset, Moon Ledgers generated; re-runs and resumed
partial runs are no-ops.

## §9 · APIs

`GET /api/archetypes` · `POST /api/me/characters` (validated per §6) · `GET /api/me/profile` ·
`GET /api/profiles/:handle` (privacy-filtered) · `GET /api/me/ledger?token=` ·
`POST /api/gratitude` (clientNonce) · `POST /api/quests/:id/claim | /turn-in | /confirm` ·
`POST /api/events/:id/rsvp | /checkin` · `POST /api/me/voice-claim` + cancel ·
`GET /api/economy/rules | /supply` (public, per §8) · admin CRUD (village-scoped) · settlement
cron · Hypha webhook receiver (§4.8). **`/api/map/config`**: the village-shared config may be
cached per villageId, but `me: {archetypes, claims, rsvps}` is computed per authenticated
request and NEVER stored in a shared cache entry (finding 2-#3); plus `cycleKey`. The map
consumes `me{}` next map round: class-filtered discovery, ✓ overlays from the ledger.

## §10 · Build order (phases, each with a gate)

P0 study (§1; write a short STUDY_NOTES.md of what you copied and adapted) → P1 avatar
samples → **RYE GATE** → full 30 via the resume-safe pipeline → P2 migrations M1–M4 (reserve
numbers, snapshot first) + engine validator + the §12 unit tests for keys/reversals/locks →
P3 sources (claims, turn-in/confirm, gratitude, check-ins, settlement; economyEpoch) → P4
selection page + character APIs → P5 Player Profile + public view → P6 The Mint admin + public
feeds + voice-claim bridge + webhook + polling → P7 seeds (idempotent) + class tags on live
quests/roles as amber suggestions → P8 full test run + em-dash grep gate + orphan sweep + PR
body + push commands for Rye. Blocked only by a genuinely human decision? Note it in the PR
and continue with the stated default.

## §11 · Tests (every line was a live exploit in review; all must exist and pass)

Same idempotencyKey twice = one row · five concurrent gives cannot exceed the allowance ·
negative/zero gratitude rejected · reverse twice = one mirror · reversing a reversal refused ·
re-confirm after wrong reversal mints as new occurrence · two claimants both mint · recurring
quest mints per claim row · last stay credit survives a double-spend race · voice claim below
threshold refused · claim outside Claims Week waits; inside raises exactly ONE bridge intent ·
requestVoiceClaim races a spend safely (lock) · confirmed claim cannot be canceled or refunded ·
double-cancel refunds once · rejected claim refunds and voice re-accrues · webhook with bad
HMAC rejected; replayed confirm reconciles once; payload identifiers ignored in favor of the
stored row · pre-epoch confirms never mint; epoch backfill is keyed and admin-only · rule/
threshold/window changes apply next cycle only · same key coexists across villages; every
economy query carries villageId (lint test) · seeds re-run: no duplicate genesis, edited dials
untouched · presentation/tone/archetype enum injection rejected; avatar src never concatenated ·
two concurrent set-primary calls leave exactly one primary; deleting the primary promotes or
falls to medallion · /api/map/config never serves one user's me{} to another (cache test) ·
/api/economy/rules exposes only enabled village rules with whitelisted fields · /supply is
village-total-only, cached · economy flag without seeds keeps write paths off · privacy json
honored publicly · steward cannot confirm own claim · settlement re-run no-op · Quest Log and
Get Involved are never class-filtered · avatar pipeline resumes without regenerating existing
bases (manifest test).

## §12 · Adversarial ledger (why the weird rules exist; do not simplify them away)

Pass 1 (16 findings): Sybil onboarding, stored allowance counter, occurrence-less keys,
negative gratitude, non-idempotent reversals, steward self-dealing, single-claimant schema,
admin rule-spiking, missing villageId, clone farming, transfer double-spend, RSVP badge
farming, allowance dial mid-cycle, home/social-graph privacy leaks, incumbency cold-start,
gratitude sourceId ambiguity. Pass 2 (15 + 3): retroactive flag-flip backlog (economyEpoch),
webhook secret/replay/cross-village, me{} shared-cache leak, unlocked claim debit, copied
Hypha constants, confirm-terminal claim states, undeferred governance dials, Hypha rejection
undefined, character enum injection, duplicate table creation across source docs, copied
queries dropping villageId, supply-feed deanonymization, non-resumable art pipeline with
silent model fallback, primary-character races, non-idempotent seeds, class-filtered earning
surfaces, rules-feed overexposure, flag-without-seeds.

## Handoff — RYE only
| # | Task |
|---|---|
| 1 | Railway snapshot; run M1–M4; set game-amora's OWN Hypha webhook secret + env; settlement cron |
| 2 | Bless the three avatar samples (P1 gate), then the 30 |
| 3 | Bless the dials: 30 ♥ allowance, 10 ♥ per-recipient, 20 ♥ steward thanks, 0.1/0.5 voice rates, 2 stay credits at Resident, 100 ♥ co-sign threshold, voice threshold N, Claims Week dates |
| 4 | Name the voice token (default Amora Voice) and provide the Hypha space for the allowlist; any genesis Hearts numbers |
| 5 | Flip `characters` after P8; flip `economy` when you're ready to open the ledger |
| 6 | Standing items: amber round on the Loom; Round D paste for the map lane; site quest title em-dashes |
