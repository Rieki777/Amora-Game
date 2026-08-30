# Quest experience upgrade — 2026-08-10

Ported the hard-won lessons from regen-civics's quest system (three page
redesigns, the disclosure spec, the progression specs) into game-amora's
quest module, adapted to this platform's shape: white-label, DB-backed,
consent-gated rewards. Amora's reward integrity was already ahead of the
sibling game (server-resolved amounts, human consent, range caps) — that
machinery is untouched. What was missing was everything a member reads and
feels BEFORE the claim button, and everything after it that isn't a form.

## The lessons ported (and where each landed)

| Lesson from regen-civics | Where it landed here |
|---|---|
| Cards are tier 1 of a disclosure ladder: draw the eye, state the offer, nothing to operate | `QuestCard.tsx` — poster card, whole card is one link, zero buttons |
| Every quest deserves its own deep-linkable page (modal-only hurt them) | `QuestDetail.tsx` at `/quests/:id` |
| Story before instructions: why it matters, then how | `story` field, "Why this quest matters" section |
| A first step small enough to do today, stated beside the full shape | `firstStep` field, amber callout, "fifteen minutes or less" |
| "What you'll share" sits directly above the submit form it feeds | `deliverable` field + `QuestActions` embedded under it |
| Life signs: real counts or silence, never a zero | `GET /api/quests/field`, "N in the field now", "Recently completed" feed |
| Continue beats start: surface held quests first | "Pick up where you left off" strip + `nextQuestFor()` |
| No greyed-out locks: a gated quest stays in full color and says what opens it | `gateLabel()` — "Opens at the Member stage", "Held for: …" |
| Art-first boards, but art must not block launch | `questScene()` — deterministic brand-tone gradients per circle, optional `imageUrl` per quest |
| First names only on public social surfaces | field endpoint uses `firstName()` |
| Examples never masquerade as life | field endpoint filters example quests AND example users |
| Content lives in one source | seed carries the story layer; `quest-story-2026-08-10` runOnce fills live rows where empty |

## Files changed

**Server**
- `drizzle/0068_quest_story.sql` — nullable columns: `subtitle`, `story`, `first_step`, `steps` (json), `deliverable`, `tips` (json), `image_url`
- `server/repos/quests.ts` — QuestRecord + SELECT/INSERT/UPDATE carry the story layer (25 columns; one writer keeps label and bounds in agreement, unchanged)
- `server/db/schema.ts` — matching drizzle columns
- `server/index.ts` — `GET /api/quests/field` (public life signs) + `backfillQuestStories` registered as runOnce `quest-story-2026-08-10`
- `server/seeds/quests-seed.json` — all 14 quests now carry subtitle, story, first step, steps, deliverable, tips (existing fields byte-identical)

**Client**
- `client/src/lib/questBoard.ts` (+ `questBoard.test.ts`) — pure helpers: `questScene`, `nextQuestFor`, `gateLabel`, `linesToList`/`listToLines`, `relativeWhen`
- `client/src/components/QuestCard.tsx` — poster card + `QuestPoster` (shared with detail hero and journey strip)
- `client/src/pages/Quests.tsx` — rebuilt board: journey strip, data-driven circle filters, poster grid, life-signs feed; hero/CTA/explainer preserved, currency names now config-driven throughout
- `client/src/pages/QuestDetail.tsx` — new page: poster hero, offer row, story, first step, steps, tips, completions, action rail, gate card, related quests
- `client/src/App.tsx` — `/quests/:id` route (lazy)
- `client/src/components/GameDashboard.tsx` — claim rows link to quest pages
- `client/src/pages/Admin.tsx` — Quests tab: "Story, steps, and poster" editor per quest (subtitle, story, first step, steps, tips, deliverable, image URL, circle, difficulty, duration, impact); dirty check covers all of it

**Docs**
- `docs/FORK_RUNBOOK.md` — one line on the seed's story layer + backfill

## What happens on deploy

1. Migration 0054 adds the columns (one statement, resumable).
2. On a running village: seeds skip (table not empty), then runOnce
   `quest-story-2026-08-10` fills story fields from the seed ONLY where the
   live value is empty. Admin-written copy survives.
3. On a fresh fork: seeds land with the story layer already in them; the
   runOnce finds nothing to fill.

## Verified before handoff

- `node scripts/check-voice.mjs` on every changed file: clean (seed prose,
  both pages, card, Admin, server).
- Seed JSON parses; all 14 quests carry the story layer.
- INSERT placeholder count matches the 25-column list; UPDATE order matches
  `questParams` order.
- 0054 splits to exactly one statement; no comment line ends in `;`.
- No brand names in any new client/platform file (ratchet-safe).
- New unit tests in `client/src/lib/questBoard.test.ts` (scene determinism,
  suggestion priorities, gate labels, lines round-trip, relative dates).

All five gates were then run ON THE WINDOWS CHECKOUT (2026-08-10 evening,
via Desktop Commander) with this work in the tree:

```
pnpm check                        exit 0
pnpm build                        green, dist/index.js built @ af75515
pnpm test                         32 files, 455 tests, ALL PASSED (1672s,
                                  loop e2e included, examples e2e included)
node scripts/check-brand-refs.mjs ratchet holds at baseline 63, hard-clean clean
node scripts/check-voice.mjs      clean across 265 files, 2 pre-existing waivers
```

## Deliberately deferred

- **Poster art**: `imageUrl` is live end to end, but no images generated
  (nano-banana-pro still unusable from Cowork). Board looks finished without
  them via the scene gradients; add art quest-by-quest whenever.
- **Example quests' story layer**: `examples-seed.json` untouched; an example
  quest's page falls back to description + impact cleanly.
- **Stage/role gate pickers in Admin**: `minStage` / `requiresRole` stay
  API-editable only, as before this session.
- **Crews / multiplayer quests, completion celebration animation**: the
  sibling game's Move 2 and the celebration moments are real ideas for a
  later session; the banned-pattern list (no popups, no streak guilt) should
  ride along when they come.

## Handoff Breakdown

| # | Task | Who | Why |
|---|---|---|---|
| 1 | Review the diff, run the five gates on Windows | Rye (or a local Claude Code session) | Sandbox has no toolchain for this repo |
| 2 | `git add` the 15 files listed above (targeted, not `-A`) and commit | Rye | Concurrent sessions may hold other work in the tree |
| 3 | Push → Railway deploy → check `/health`, then `/quests` and one `/quests/:id` | Rye | Deploy + live verify |
| 4 | Confirm the runOnce log line `quest-story-2026-08-10 filled 14 quest(s)` on first boot after deploy | Rye | Proves live rows got the story layer |
| 5 | Optional: set poster images on a few quests (Admin → Quests → Story, steps, and poster) | Rye / admins | Pure content, live immediately |
