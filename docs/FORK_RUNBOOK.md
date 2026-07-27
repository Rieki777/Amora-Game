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
| `ANTHROPIC_API_KEY` | Maia guided proposals (`/api/assistant/*`), the map concierge tie-break, and call synthesis (S54). May also be set per-deployment in Admin → Email Settings instead. | Assistant hides; forms still work; call synthesis refuses with an honest 503 while ingestion, transcripts and publishing keep working |
| `ANTHROPIC_BASE_URL` | (optional, dev/CI) points the assistant at a stub instead of api.anthropic.com | Defaults to the real API |
| `RESEND_API_KEY` | Transactional email | Emails silently skipped (logged) |
| ↳ *sender domain* | **Every fork must verify its sender domain in Resend (resend.com/domains: SPF + DKIM records in the domain's DNS).** Resend returns 200 on unverified domains and delivers NOTHING — email death is silent. **Amora handoff item (Rye, 2026-07-26): `amora.cr` is unverified and only its team can add the DNS records — verify it during handoff.** | Claim links & notifications never arrive |
| `FRONTEND_URL` | CORS origin | Cross-origin API calls fail |
| `STRIPE_SECRET_KEY` | (S32) Stripe API key (`sk_live_…`) — powers card checkout for every fiat module (stays, exchange). **Amora handoff item (Rye, 2026-07-26): the Amora team creates its own Stripe account and sets this in Railway during handoff** — until then card checkout answers an honest 503 and manual payments carry stays. | Card checkout disabled (503); manual payment path still works |
| `STRIPE_WEBHOOK_SECRET` | (S32) Signing secret (`whsec_…`) for the ONE webhook endpoint `POST /api/webhooks/stripe`. Create the endpoint in the Stripe dashboard (Developers → Webhooks) pointing at `https://<your-domain>/api/webhooks/stripe`, subscribe to `checkout.session.completed`, `charge.refunded`, `charge.dispute.created`, then copy its signing secret here. **Amora handoff item (Rye, 2026-07-26): create the endpoint + set this secret together with `STRIPE_SECRET_KEY` — a missing secret means unsigned events are processed only in dev shapes; a wrong one rejects every settlement with `sig_fail` alerts to admins.** Test with `stripe listen --forward-to` before go-live. | Settlements unverified or rejected; orders never credit |
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
- Stripe (v3 S32+): per-fork keys; ONE webhook endpoint (`/api/webhooks/stripe`,
  raw-body signature verification — see the two `STRIPE_*` env rows above for
  the full setup checklist); test with the CLI before go-live; dispute
  handling is mandatory, not optional — a dispute auto-suspends the buyer and
  claws back what was granted, and admins hear about it on the bell.

## Backups (S12 — MySQL is the ONLY authority now)

- **What's authoritative:** everything lives in MySQL. The `data/` volume
  holds ONLY uploaded images (`data/uploads/`) plus historical JSON kept as
  an archive. `scripts/import-json-to-mysql.ts` remains the restore/cutover
  tool for that archive format.
- **Automated:** `.github/workflows/db-backup.yml` dumps the production
  schema daily (09:17 UTC), keeps 30 days of artifacts, and — on every run —
  RESTORES the dump into a scratch MySQL and asserts row counts plus an
  exact round-tripped timestamp against a manifest taken at dump time. A red
  `db-backup` run means the backup is bad, not just late. Requires the
  `PROD_DATABASE_URL` repo secret (the Railway MySQL public-proxy URL);
  every fork sets its own.
- **Manual restore:** download the artifact →
  `gunzip -c dump.sql.gz | mysql <target-url>` → point `DATABASE_URL` at the
  target. Boot migrations and invariants verify the rest.

## Smoke test after provisioning

`/health` → ok; register → claim → submit → consent (admin) → gratitude send →
wall shows it; `/api/season` shows the seeded season; admin Modules tab lists
everything OFF.
