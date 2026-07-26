# Fork Onboarding Runbook (living document)

**Rule (from MODULES_MASTER_PLAN.md v3, S56):** every session that adds an env
var, seed file, or provisioning step appends one line here, so extraction
assembles this runbook instead of reverse-engineering it. Keep entries terse:
what, where, what breaks without it.

## Provisioning

- Railway project + service (nixpacks), volume mounted at `/app/data` — seeds
  live in `server/seeds/`, never in `data/` (volume shadows the image).
- MySQL service on the private network; `DATABASE_URL` referenced on the app
  service. Run `pnpm db:migrate`; verify with `pnpm db:status`.
- GitHub repo connected with auto-deploy on `main` (Railway GitHub App needs
  repo access; sudo-mode approval required once).

## Environment variables

| Var | Purpose | Without it |
|---|---|---|
| `AUTH_TOKEN_SECRET` | Signs member tokens | **Silently degrades to per-process sessions** — logins die on every restart |
| `ADMIN_PASSWORD` | Bootstrap-only (S1): each fork sets its own value and uses it once to create its founder via `POST /api/admin/bootstrap`. Inert after bootstrap — keeping it set is fine (foundation policy, Rye 2026-07-26); deleting it is optional hygiene. | No founder can be created |
| `JOURNEY_PASSWORD` | Legacy Command Centre gate — retired at v3 S2 | — |
| `BREAK_GLASS_ADMIN_EMAIL` | (from S1) may re-elevate exactly that account | No recovery if all admins are demoted |
| `ANTHROPIC_API_KEY` | Maia guided proposals (`/api/assistant/*`) | Assistant hides; forms still work |
| `RESEND_API_KEY` | Transactional email | Emails silently skipped (logged) |
| `FRONTEND_URL` | CORS origin | Cross-origin API calls fail |
| `TEST_DATABASE_URL` | (dev/CI only, local .env) scratch-schema MySQL for DB-backed tests — the harness DROPs/CREATEs `amora_test`; never point it at the app schema | DB suites skip loudly |

## Seeds & per-deployment data

- `server/seeds/content-seed.json`, `quests-seed.json` — page copy + quest
  library (self-heals via `seedIfMissingOrEmpty`).
- `tokens` table rows (0006 seeds gratitude/amora/voice) — a fork renames its
  recognition token here + in `shared/gameConfig.ts` + brand overlay.
- `data/brand.json` via the admin Setup Wizard ("Make This Yours") — identity,
  images (uploaded, sharp-compressed), dues, personas.
- Game variables: only CHANGED values are stored; platform defaults inherit.

## Integrations

- Hypha: set `hypha.org_url` (v3 S13) — every governance surface deep-links
  from this one value; blank hides all Hypha buttons.
- Stripe (v3 S32+): per-fork keys; ONE webhook endpoint; test with the CLI
  before go-live; dispute handling is mandatory, not optional.

## Smoke test after provisioning

`/health` → ok; register → claim → submit → consent (admin) → gratitude send →
wall shows it; `/api/season` shows the seeded season; admin Modules tab lists
everything OFF.
