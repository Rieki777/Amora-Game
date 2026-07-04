# Village Coordination Game — Platform Foundation

Amora is the **first project** built on this foundation. The goal is that hundreds of
communities can stand up their own coordination game from this codebase. This doc
explains what is platform (reusable) vs project (swappable), and how to launch
project #2.

## The core idea

The site is an **infinite game**: it doesn't funnel visitors to a form and end. It
gives every persona a progression path, a contribution loop, and a reason to return
until (and after) the physical village exists. The design principles, borrowed from
ReGen Civics and hard-won there:

1. **Stages are earned by real acts, never abstract points.** Training completed,
   covenant signed, quests consented — each stage proves the person did the thing.
2. **Value only moves with a human yes.** Quest rewards are credited only when a
   team member consents in Admin. No automatic payouts.
3. **Recognition, not compensation.** Gratitude sends are acknowledgments with a
   required message; the public wall shows the words, never the amounts.
4. **Nothing is decorative.** Every element on screen maps to real data (season,
   pulse events, stage ladder, budgets).
5. **Rhythm over streaks.** Budgets reset monthly; there is no daily-login anxiety.

## The swap points (what changes per project)

| Layer | File(s) | What lives there |
|---|---|---|
| **Game config** | `shared/gameConfig.ts` | Project name, member name, currency name, personas/paths, the stage ladder + earning rules, gratitude budget rules, next-best-action rules, default season. **This is the primary swap point.** |
| Theme | `client/src/index.css` | Color tokens, fonts |
| Content seeds | `data/content-seed.json`, `data/quests-seed.json`, `DEFAULT_*` constants in `server/index.ts` | Page copy, starter quests, FAQs, milestones, training modules, visit config |
| Pages | `client/src/pages/*` | Persona journey pages and marketing content are project-specific by nature; the game components they embed are platform |

Platform code (server game engine, `client/src/lib/gameApi.ts`, the game components
below) must never hardcode a project name, currency name, or stage — it reads
`/api/game/config`. If you find a hardcoded "Amora" outside content/seeds, that's a
platform bug.

## The game engine (platform)

### Server (`server/index.ts`)

| Endpoint | What it does |
|---|---|
| `GET /api/game/config` | Public config: project, currency, paths, stages, current season |
| `GET /api/game/me` (auth) | Player state: stage, ladder position, gratitude balance + budget, quest claims, next-best-action |
| `POST /api/game/journey/sync` (auth) | Mirrors journey/training step completion into the player record |
| `GET /api/quests` + admin CRUD | Quest library (seeded from `data/quests-seed.json`) |
| `POST /api/game/quests/:id/claim` / `submit` (auth) | Claim a quest, submit evidence (artifact link + note) |
| `GET /api/admin/quest-claims` + `POST .../consent` | Team consent queue; consent credits the reward and emits a pulse event |
| `POST /api/game/gratitude/send` (auth) | Monthly budget (stage-multiplied), message required, once per recipient per cycle |
| `GET /api/game/gratitude/wall` | Public wall (names + messages only) |
| `GET /api/game/gratitude/me` (auth) | Private journal with amounts |
| `GET /api/game/pulse` | Public activity feed (joins, quests, gratitude, stage advances, season) |
| `GET /api/season` + `PUT /api/admin/season` | Current season banner data |
| `GET /api/admin/players` + `PUT .../:id/stage` | Player list with computed stages; grant ceremony-based stages |

Stage computation: `computeStage()` interprets the declarative rules in
`gameConfig.stages` (`default`, `account`, `training-complete`, `membership`,
`quests {min}`, `granted`). Adding a new rule type = one switch case.

### Client components (platform)

- `components/GameDashboard.tsx` — profile: next-best-action, stage ladder, gratitude, quests
- `components/QuestActions.tsx` — claim/submit UI on quest cards
- `components/SeasonBanner.tsx` — homepage season strip
- `components/VillagePulse.tsx` — homepage activity feed
- `pages/GratitudeWall.tsx` — public wall + send form (`/gratitude`)
- `lib/gameApi.ts` — auth fetch + types

### Admin (The Game section)

- **Quest Claims** — the consent queue (evidence, amount, consent/decline)
- **Players** — everyone's computed stage; grant Immersant/Initiate/Co-Creator/etc.
- **Season** — name, theme, focus, dates for the homepage banner

## Launching project #2 (checklist)

1. Fork the repo; rename in `package.json`.
2. Rewrite `shared/gameConfig.ts` — names, currency, paths, stages, actions, season.
3. Swap theme tokens in `client/src/index.css` and the fonts in `client/index.html`.
4. Replace `data/quests-seed.json` and the `DEFAULT_*` seeds in `server/index.ts`
   (FAQs, milestones, training modules, visit config, investor summary).
5. Rewrite the persona journey pages + marketing pages for the new project.
6. Set env vars: `ADMIN_PASSWORD`, `JOURNEY_PASSWORD`, `FRONTEND_URL`.
7. Deploy with a **persistent volume mounted at `/app/data`** (all game state lives
   in `data/*.json`; without a volume every deploy wipes it).

## Known trade-offs and next steps

- Storage is flat JSON — right for one village (tens-to-hundreds of members), and
  the API layer means a database can replace it later without client changes.
- The auth token is unsigned base64 (pre-existing). Fine for a community site at
  this trust level; upgrade to signed tokens before scale.
- Legacy field: the player balance is stored as `heartsBalance` in `users.json`
  (predates the Gratitude rename); the API exposes it as `gratitude.balance`.
- Not yet built (next phases): Living Village map (milestones rendered on an
  illustrated map of the land), Season Harvest recap page, journey-page step sync
  (training already syncs), shareable profile cards, forum sensing/governance.
