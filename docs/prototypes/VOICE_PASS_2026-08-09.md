# Voice pass · v0.7-voice1 — the map now speaks the game

**What happened.** A full language audit of `grounds-v0.html` against the ReGen Civics voice rules
(the `regen-content-repurposing` skill and the no-AI-isms rules). 269 exact-count rewrites across
every user-facing surface: Maia's lines, toasts, tooltips, module doors and their footers, the Loom
panel, the resolver, the inspect card, build tools, the tour, vitals, the skin panel, the circles
map, placeholders, headers, and the data layer (blurbs, role lines, thread titles, pulse messages,
event titles). All three script blocks pass `node --check`; verify_loom (40), verify_doors (43),
verify_features (35) and check-schema (16 blocks) all green, zero page errors. Deployed to
`docs/prototypes/grounds-v0.html` and the Cowork artifact. `BUILD_VERSION='v0.7-voice1'`.

## The two rules that did the work

1. **No em-dashes in anything a player reads.** 348 → 72, and every survivor is accounted for
   (see the ledger below). Replacements: a period and a second sentence where the thought splits,
   a comma where it flows, the house ` · ` where it separates chips.
2. **No robot explaining to a robot.** Engineering vocabulary is gone from player surfaces:
   "deterministic", "unaddressed", "lexicon", "audited", "module CTA", "config", "JSON",
   "geometry", "§5.2", "(stays.md)", "art_manifest.skin", "VITAL_PROVIDERS", "re-resolved",
   "FX math", "escrow". The concepts stay; they are now said the way you would say them at the
   Council Fire.

## The new vocabulary (used consistently everywhere)

| was | now |
|---|---|
| unaddressed / un-address | not yet placed · unplace · "waits at the Quest Board" |
| lexicon guess / my deterministic guess | a guess (amber), "always yours to move" |
| the creator's word (kept, it is good lore) | your word · "Save makes it your word" |
| audited / logged / exported | "the land remembers" · "carried in every export" |
| structure | building · place |
| module / module bindings | door · room · "what this place opens" |
| CTA | button |
| borrow against escrow | borrow with a deposit |
| re-roll (sprites) | repaint |
| sorting engine | "How work finds its home. You always win." |

Sample before → after, the flavor of the whole pass:
- "Deterministic address chain — no model, no tokens. Every guess is labeled and overridable; the
  override is the record." → **"Same words in, same home out. No AI, no dice. Every guess wears a
  label, and your correction is what sticks."**
- "⧉ 3 rewires saved — the creator's word now, audited and autosaved." → **"⧉ 3 rewires saved.
  Your word now; the land remembers."**
- "sample rooms — admin-posted prices per token, zero FX math (stays.md)" → **"sample rooms. Each
  price is posted in its own token; nothing converts"**
- "Scene exported — … This file matches §5.2's tables…" → **"Scene exported: … This one file is
  the land's whole memory, and autosave keeps the same story in this browser."**

## Deliberately NOT touched (the ledger of the 72 remaining em-dashes)

- **Code comments and block headers** (~44): not user-facing; the build notes keep their style.
- **Export contract notes** (`law`, `note`, `counts` strings inside the JSON export): dev-facing
  documentation the site lane reads; changing them churns the contract for zero player value.
- **Null markers and glyphs**: `nameOf()` fallback '—', the Maia minimize '—', the district '—'.
  These are blanks, not prose.
- **Site-sourced quest titles** ("Swale dig — east slope", "Raise the first wall — build day",
  "Welcome walk — greet Saturday's visitors"): these mirror the live site's Quests page. Renaming
  them map-side would split them from their site records. RYE: fix them on the site and the map
  inherits the clean titles on the next import.
- **Round D's six surfaces** (left verbatim because ROUND_D_PLAN quotes them as patch anchors and
  rewrites them anyway): the vOvr placeholder (D4.2), the iSeatName placeholder (D4.3), the RSVP
  toast (D5.1), the journey step toast (D5.3), the label count chips (D2), the phase radios (D3.3).

## For Claude Code (paste this note with ROUND_D_PLAN)

The artifact you inherit is `v0.7-voice1`. All Round D SEARCH-STRING anchors survive except none;
the six surfaces Round D rewrites were left byte-identical on purpose. Every NEW string you write
follows the same two rules above; the Round D plan already gives most strings verbatim. When D5.4
bumps the version, go from `v0.7-voice1` to `v0.8-roundD`.

## Rye — only you
| # | Task |
|---|---|
| 1 | git add, commit, push, deploy (the artifact + this doc are already in docs/prototypes/) |
| 2 | Read the map once in the new voice; flag any line that does not sound like Amora |
| 3 | Site-side: clean the three quest titles above on the live Quests page (em-dash law) |
| 4 | Then paste ROUND_D_PLAN_2026-08-09.md into Claude Code; the amber round stays open |
