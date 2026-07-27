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
| `TEST_DATABASE_URL` | (dev/CI only, local .env) scratch-schema MySQL for DB-backed tests — the harness DROPs/CREATEs `village_test`; never point it at the app schema | DB suites skip loudly |

## Seeds & per-deployment data

- `server/seeds/content-seed.json`, `quests-seed.json` — page copy + quest
  library (self-heals via `seedIfMissingOrEmpty`).
- `tokens` table rows (0006 seeds gratitude/amora/voice) — a fork renames its
  recognition token here + in `shared/gameConfig.ts` + brand overlay.
- `data/brand.json` via the admin Setup Wizard ("Make This Yours") — identity,
  images (uploaded, sharp-compressed), dues, personas.
- Game variables: only CHANGED values are stored; platform defaults inherit.

## Brand overlay (make it yours)

The platform keeps three layers apart, on purpose: **identity** in
`shared/gameConfig.ts` (names, paths, the stage ladder, images),
**behaviour** in `shared/gameVariables.ts` (how much, how often, which
mode), **per-deployment data** in DB rows and seeds. A fork edits the last
two from the admin panel and almost never touches the first.

- **The overlay:** `data/brand.json` (a `dbDocument`, edited by the admin
  Setup Wizard — "Make This Yours") is merged OVER `gameConfig.ts` by
  `mergedConfig()` and served at `/api/game/config`. A blank field inherits
  the platform default, so a fork overrides only what differs.
- **Wizard order:** Identity (project + village name, tagline, currency
  name) → Pictures (uploaded, sharp-compressed, never hotlinked) →
  Numbers (dues, budgets — these write game variables) → Content (page
  copy, FAQs) → Go live.
- **NOT overlayable** (code-level edits, deliberately): the stage ladder and
  its ids, the path definitions, season cadence semantics. Those are game
  DESIGN; changing them is a fork of the game, not a re-skin.
- **The guard:** `node scripts/check-brand-refs.mjs` runs in CI. Platform
  zones (`server/lib/**`, `shared/**` except `gameConfig.ts`) must contain
  no village's brand at all; the app shell, client pages, applied
  migrations and test fixtures are ratcheted — their counts may only fall.
  Forks extend the banned-terms list in that script with their own names.

## Token naming (Gate D)

Two layers, both admin-owned:

1. **The recognition token** (the village's own word for appreciation):
   rename in the `tokens` table row, in `shared/gameConfig.ts`, and in the
   brand overlay — all three, or the UI and the ledger disagree.
2. **Per-module tokens, named at enable time (Gate D):** each funds-bearing
   module's token is created through Admin → Tokens with a name the village
   chooses (stay credits, library credits, whatever the village calls
   them). There is no shared platform credit token — one seller per token
   is boot-asserted, and the exchange refuses to list a token another
   module already sells.

Verify after naming: the boot log prints `[ledger] invariants hold`; the
cycle pool refuses to pay the recognition token (a fail-loud 400 if
`gratitude.pool_token` is misconfigured); Admin → Ledger reconciliation
shows conservation at zero for every token.

## Integrations

- Hypha (DHO config): set `hypha.org_url` (v3 S13) — every governance
  surface deep-links from this one value; blank hides all Hypha buttons.
  Confirm the four derived links resolve against your own DHO
  (governance `/`, proposals `/agreements`, treasury `/treasury`, members
  `/members`); override individually only if your DHO differs. The
  boundary is absolute: this platform READS and DISPLAYS what Hypha
  governs and never mints, moves, or prices it.
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

## Turning modules on

Everything ships OFF. To open them all at once (dependency order handled,
each surface verified afterwards):

```bash
node scripts/enable-all-modules.mjs --base https://your-village.example --email founder@example.com --password '…'
```

`--dry` reports what would change without changing it; `--preview` opens
them admin-only first. Funds-bearing modules (stays, exchange) refuse while
a shared password is the only admin credential — bootstrap per-admin
identities first.

## Smoke test after provisioning

**Automated (47 checks across every module):**

```bash
node scripts/smoke-all-modules.mjs --base https://your-village.example --email founder@example.com --password '…'
```

It registers throwaway members and walks the real loop: quest claim →
submit → consent → gratitude → forum → feed heart → tools → badges (incl.
the earned engine) → library intake/loan/settle with escrow reconciliation
→ stays pricing/purchase/activation/nightly posting → exchange firewalls,
pricing, stocking → health regen + sparse-data honesty → automation
ingestion + the honest 503 without an API key → exit enumeration → the
command centre → and finishes by asserting per-token conservation. Run it
against a fresh deployment; every line should be a ✓.

**The loop, by hand:** `/health` → ok (and reports the build marker);
register → claim → submit → consent (admin) → gratitude send → wall shows
it; `/api/season` shows the seeded season; admin Modules tab lists
everything OFF.

**The postures** (each one is a thing that has silently broken before):

- `GET /api/platform/info` returns your project name, version and enabled
  modules — the interop handshake, and proof no path hardcodes a brand.
- Blank `hypha.org_url` → every Hypha button is gone, not dead.
- Without `STRIPE_SECRET_KEY` → card checkout answers an honest 503 and the
  manual payment path still grants credits.
- Boot log shows `[ledger] invariants hold` and, once the library module is
  on, escrow reconciliation green in Admin → Library.
- The exit policy renders at `/exit-policy` (placeholder banner until your
  community writes its terms).
- `node scripts/check-brand-refs.mjs` passes with YOUR village's terms
  added to its banned list.
- The `db-backup` workflow runs green against your `PROD_DATABASE_URL` —
  it restores the dump and asserts counts, so green means restorable.

## Extraction preconditions (who does what)

The platform is fork-ready; these steps need a human with accounts:

| Step | Who | Note |
|---|---|---|
| New GitHub repo / org for the fork | Village operator | The platform is pulled, not copied by hand |
| Railway project + MySQL + volume at `/app/data` | Village operator | See Provisioning |
| Resend sender-domain DNS (SPF + DKIM) | Whoever controls the domain | Unverified = silent email death |
| Stripe account, keys, ONE webhook endpoint | Village operator | See the two `STRIPE_*` rows |
| Hypha DHO + its URL | Village governance | Blank hides the surfaces cleanly |
| Token names (Gate D) | Village admins | Recognition token + per-module tokens |
| Exit-policy terms (F12) | The community | The flow ships; the terms are theirs |

## Language

The platform ships English-only. Every module's copy lives in its own page
components rather than a locale layer, so translation is a fork-level
decision, not a platform dependency — nothing in the server or the shared
registries assumes a language. If a fork needs another language, the work
is a locale layer over the client pages plus the seeds; the game rules,
variables and invariants are language-free by construction.
