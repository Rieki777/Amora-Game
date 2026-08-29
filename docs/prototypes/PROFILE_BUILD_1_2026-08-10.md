# Build 1 — Characters and the Player Profile (the RPG front door)

**Paste into Claude Code** (site lane: worktree off current `origin/main`; never edit
`docs/prototypes/**`). This is the FIRST build of the profile arc: characters + profile only.
The economy engine (SITE_ECONOMY_PROFILE_2026-08-09.md v2, same folder) is **Build 2**; its
profile-body tables that Build 1 needs ship HERE, its ledger ships later. Voice rules as always:
no em-dashes in user-facing strings, no AI-isms, the game voice. Use the NEXT free migration
numbers (lanes run in parallel; do not assume 0061).

**Repo routing (Rye confirms):** build in `game-amora` (the village app: map, admin, modules).
The archetype definitions, the 13 role cards, and the character art style guide live in the
platform repo `regen-civics-clean` (`client/src/pages/Team.tsx` archetypes array,
`client/src/data/gameRoles.ts`, `CLAUDE_CODE_PROMPT_2026-04-03_CHARACTER_ART.md`). Copy the
five archetype definitions and the style guide INTO this build; the platform repo adopts the
same character system later (bookmarked).

## 1 · The five classes (village vocabulary, Rye blesses names)

Archetypes are CLASSES. Seeded from the platform's 5 Archetypal Contributions, short names in
the game voice, renameable per village like all vocabulary:

| key | class | contribution (subtitle) |
|---|---|---|
| building | The Builder | Building & Developing |
| researching | The Architect | Researching & Architecting |
| facilitating | The Spaceholder | Facilitating & Space Holding |
| catalyzing | The Catalyst | Catalyzing & Connecting |
| storytelling | The Storyteller | Storytelling & Communicating |

**The law of classes: classes GUIDE, never gate.** Playing a class tunes what the game shows
you (quests, roles, journeys, map badges). It never locks a door: any hand may claim any quest.
Urgent calls (the ⚑ attention list) ignore class filters. Copy on the selection page says it
plainly: "Play as many as you like. Change any time. Every door stays open to every hand."

## 2 · Migrations (M1, M2 = next free numbers; Railway snapshot first)

**M1 `characters`:**
- `archetypes`: villageId, key, name, subtitle, blurb, sigil, sortOrder (seeded with the five).
- `playerCharacters`: id, profileId, archetypeKey, presentation ('f'|'m'), tone
  ('deep'|'olive'|'light'), isPrimary bool, chosenAt. Many per player; exactly one isPrimary.
- Role + quest tagging: `archetypes` json array column on the village's roles and quests
  (nullable; empty = shows for everyone). Admin editors get a class multi-select. Creator's
  word; the resolver never guesses classes.

**M2 `profile body`** (pulled forward from the economy doc, unchanged semantics):
- profile extension: handle UNIQUE, title, homeStructureKey nullable, joinedAt, privacy json
  ({showHome:false, showInventory:false, showCalendar:false, showBadges:true, showRoles:true}).
- `questClaims`: id, villageId, questId, profileId, state ('claimed'|'turned_in'|'confirmed'|
  'declined'), turnedInAt, confirmedAt, confirmedBy, note. Multi-claimant, recurring-safe.
  (Build 2's mint reads THIS table; Build 1 records, no currency.)
- `eventRsvps` (if not present from the promises round): eventId, profileId, on, ts.
- `badgeDefs` + `badgeAwards` + `journeyProgress` exactly per the economy doc §1.

NO ledger tables, NO mint rules, NO gratitude in Build 1.

## 3 · The avatars (30 card portraits; SAMPLES-FIRST GATE)

Reuse `CLAUDE_CODE_PROMPT_2026-04-03_CHARACTER_ART.md`'s Style Guide VERBATIM (solarpunk meets
elven meets regenerative future; deep forest greens, warm golds, bioluminescent teals; grown
tools; card portraits = 3/4 body, soft green-to-gold gradient background, no text, clean edges;
2K then `cwebp -q 85`). Output `client/public/images/avatars/{archetypeKey}-{f|m}-{tone}.webp`.

Pipeline: `scripts/gen_avatars.py` beside the sprite pipeline; key from env, never committed.
Per archetype write ONE base character prompt per presentation (10 bases), then generate the
two other skin tones as EDITS of the base image ("change the skin tone to X, keep face
structure, hairstyle, expression, clothing, tools, pose, lighting and background exactly the
same") so each character keeps their identity across tones. 10 generations + 20 edits = 30.

Class props (weave into the style guide's character template):
- Builder: living-wood mallet, grown-tool belt, floating translucent blueprint of a treehouse
  pavilion.
- Architect: crystalline lens or orrery, translucent leaf-paper scrolls, a floating map of
  glowing paths.
- Spaceholder: a circle staff with a soft hearth-light bowl, woven seating mat rolled on the
  back, a small companion bird.
- Catalyst: threads of golden-green light between the fingertips, a mycelium-pattern cape,
  a crystalline pendant pulsing softly.
- Storyteller: a living-wood book whose pages glow, a quill of light, a small lantern with a
  firefly glow.

**P1 GATE — the three blessing samples (run FIRST, send screenshots, wait for Rye):**
1. Builder, woman, deep brown skin: "Illustrated character design with a hand-painted quality,
   solarpunk meets elven meets regenerative future aesthetic. Card portrait of a woman with
   deep brown skin and dark coiled hair woven with tiny golden flowers, warm confident
   expression, subtle pointed ears, subtle bioluminescent freckles, wearing a fitted builder's
   tunic of living woven fibers in deep forest green and warm gold with soft glowing teal
   circuitry patterns, a tool belt of grown-wood and brass tools with small glowing crystals,
   holding a living-wood mallet in one hand while her other open palm raises a small floating
   translucent holographic blueprint of a treehouse pavilion, moss cushion boots with tiny
   ferns, three-quarter body standing pose, simple soft warm green-to-gold gradient background,
   no text, no scene elements, clean edges for card compositing, detailed but not
   photorealistic, deep forest greens, warm golds, bioluminescent teal accents, sunrise amber
   light"
2. Builder, man, light freckled skin, short copper hair with a few small leaves growing in it,
   carrying a beam of living wood with glowing graft lines over one shoulder; same garb family,
   same background treatment.
3. Tone edit of sample 1 → medium olive (the edit prompt above, verbatim) to prove identity
   holds across tones.

Optional after the 30 (Rye's call): five 16:9 class SCENES per the style guide's scene spec
(fruiting plants + creatures mandatory) as selection-screen backdrops.

## 4 · The character selection page (`/profile/characters`, and first-run)

High-end RPG character select (WoW roster + BG3 class panel), in the site's parchment-and-gold
skin:

- **Left rail**: the five classes as sigil chips (WoW race list feel); active class glows.
- **Center stage**: the large avatar card for the active class with two pickers beneath:
  presentation (f/m) and skin tone (three swatches). Slow breathing idle animation
  (CSS transform only). The class scene (if shipped) sits softly behind.
- **Right panel** (the BG3 class card): class name + subtitle, blurb in the game voice, four
  example contributions (from the platform's archetype examples), then **Open paths**: roles
  tagged with this class (title, ~h/wk, circle-colored band dots, exactly the role-card
  grammar) and a quest count ("7 quests on the land welcome a Builder's hands").
- **Bottom**: "Walk this path" adds the character to **Your Party**, a row of small chosen
  cards (remove with ✕, star to set primary). Multi-select is the point: play as many as you
  like. Save persists; first-run after signup opens this page with a skippable "Choose who you
  will be" (skip = all classes shown, no characters yet).
- Every string village-editable eventually; write them in the game voice now, no em-dashes.

## 5 · The Player Profile v1 (`/profile` own · `/profile/:handle` public)

The character sheet from the economy doc §4, MINUS everything that needs the ledger (Standing
row, Gratitude panel, Moon Ledger, Inventory wait for Build 2; leave no dead placeholders,
the sections simply arrive with Build 2):

- **Header**: the primary character's card art IS the hero portrait (medallion only as
  fallback for skipped selection), name + title (v1 titles: journey stage + held roles),
  circle ribbons, "11 moons on the land", home per `showHome`.
- **Your Party**: the character roster row; tap to switch which character fronts the sheet;
  "add a path" links to selection.
- **Roles held**: current seats with circle color and term, past service, links to `#/circles`.
- **Quest Log**: active `questClaims` with state chips (claimed / turned in / confirmed), the
  Round D "Your first step" block, Turn in button; steward Confirm exists and records (no
  currency until Build 2); history beneath.
- **Badge cabinet**: the map's seal SVG language; Build 1 awards from simple confirmed-count
  criteria (First Fruit, Wall-Raiser, Greenhouse Guardian, Deep Roots, Welcome Aboard) plus
  manual admin grants; dashed progress seals.
- **My calendar**: RSVPs, take-backable (`showCalendar` gated).
- Public view honors privacy json; handle chosen at first save.
- NO XP, NO levels. Journey chip reads "Stage 4 of 8 · Resident".

## 6 · APIs + the map contract

`GET /api/archetypes` · `POST /api/me/characters` (set party, primary, presentation, tone) ·
`GET /api/me/profile` · `GET /api/profiles/:handle` · claims: `POST /api/quests/:id/claim`,
`/turn-in`, `/confirm` (steward-gated, ≠ claimant) · `POST /api/events/:id/rsvp` · admin:
archetype rename/blurbs, class tags on role/quest editors, manual badge grant.

`/api/map/config` gains `me: {archetypes:[keys], claims:[], rsvps:[]}` (optional fields). The
MAP consumes this next map round (not this build): quest badges, the wall, and journeys filter
to your party's classes, a "whole land" toggle restores everything, ⚑ urgent items are always
exempt. The contract ships now so the map lane can build against it.

## 7 · Order of work, gates, tests

P1 avatar samples → RYE GATE → full 30 + webp. P2 M1+M2 + APIs + seeds (archetypes, badges,
class tags on the six live quests and current roles as Rye's suggestions marked amber in admin).
P3 selection page. P4 profile + public view. P5 admin tagging UI + config `me{}` + tests + PR.

Tests: party save/reload roundtrip; exactly one primary; class tag filtering endpoint; claim →
turn-in → confirm lifecycle (multi-claimant: two profiles on one quest); confirm by claimant
refused; badge award fires once (idempotent); privacy json honored publicly; config me shape;
selection skippable; every new user-facing string em-dash-free (grep gate).

## Bookmarks (explicitly NOT this build)
- Build 2: the economy engine (v2 doc as amended today: village welcome-aboard mints the
  VILLAGE token; $ReGen/RGVoice only in the platform game).
- Mint schedule + circle budgets with village voting: its own module and build.
- Game Mechanics admin page: reward-suggester weights (open, customizable), future levers.
- Seasons × class activity matrix (platform roles already carry `seasons[]`).
- QR / four-word check-in founder kit in admin.
- Platform repo adopts characters + selection (same schema, same art).

## Handoff — RYE only
| # | Task |
|---|---|
| 1 | Confirm repo routing (game-amora now, platform later) and free migration numbers |
| 2 | Bless the three P1 samples, then the class names (Builder / Architect / Spaceholder / Catalyst / Storyteller) |
| 3 | Railway snapshot before M1+M2; deploy after P5 |
| 4 | Note: the map session's Gemini key is over quota today; the repo pipeline runs with your env key |
| 5 | Standing items: amber round on the Loom; Round D paste; site quest title em-dashes |
