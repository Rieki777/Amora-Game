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
| `ANTHROPIC_API_KEY` | Maia guided proposals (`/api/assistant/*`), the launch guide, the map concierge tie-break, and call synthesis (S54). **S63: settable from Admin → Integrations instead** — an admin-typed key beats this env var; reads are masked (last4 only). | Assistant hides; forms still work; call synthesis refuses with an honest 503 while ingestion, transcripts and publishing keep working |
| `ANTHROPIC_BASE_URL` | (optional, dev/CI) points the assistant at a stub instead of api.anthropic.com | Defaults to the real API |
| `PLATFORM_ASSISTANT_KEY` | (S76, optional) A ReGen-provisioned key this deployment may BORROW until the village adds its own. Set at provisioning by whoever has deploy access, deliberately never an admin toggle: a screen that lets a deployment start spending someone else's money is a screen that eventually does. The village's own key (Admin → Integrations, or `ANTHROPIC_API_KEY`) always wins the moment it exists, with no restart. A borrowed key must not survive handoff, since the village loses Maia the day it rotates. | No borrowing: the assistant is simply unavailable until the village adds a key |
| `PLATFORM_ASSISTANT_DAILY_CAP` | (S76, optional) Calls per day allowed against the borrowed key, counted separately from every per-mode budget so a demo fork cannot spend a production village's headroom. `0` means zero, never unlimited. | 100 |
| `RESEND_API_KEY` | Transactional email. **S63: settable from Admin → Integrations instead** — admin-typed beats env, masked on read. | Emails silently skipped (logged) |
| ↳ *sender domain* | **Every fork must verify its sender domain in Resend (resend.com/domains: SPF + DKIM records in the domain's DNS).** Resend returns 200 on unverified domains and delivers NOTHING — email death is silent. **Amora handoff item (Rye, 2026-07-26): `amora.cr` is unverified and only its team can add the DNS records — verify it during handoff.** | Claim links & notifications never arrive |
| `EMAIL_FROM` | The `From:` address every village email leaves under — `name@example.org` or `Village Name <name@example.org>`. **Settable from Admin → Email config instead** (admin-typed beats this env var, and a malformed value there is refused at the door). Must be on the domain verified in Resend, or the send 200s and delivers nothing. **Set this during any fork's provisioning** — otherwise mail goes out under the platform's fallback sender, which is the first village's domain. | Falls back to the platform's own sender address |
| `FRONTEND_URL` | CORS origin | Cross-origin API calls fail |
| `STRIPE_SECRET_KEY` | (S32) Stripe API key (`sk_live_…`) — powers card checkout for every fiat module (stays, exchange). **S63: settable from Admin → Integrations instead — no Railway access needed.** **Amora handoff item (Rye, 2026-07-26): the Amora team creates its own Stripe account and connects it during handoff** — until then card checkout answers an honest 503 and manual payments carry stays. | Card checkout disabled (503); manual payment path still works |
| `STRIPE_WEBHOOK_SECRET` | (S32) Signing secret (`whsec_…`) for the ONE webhook endpoint `POST /api/webhooks/stripe`. **S63: settable from Admin → Integrations, which also displays the exact URL to paste into Stripe.** Create the endpoint in the Stripe dashboard (Developers → Webhooks) pointing at `https://<your-domain>/api/webhooks/stripe`, subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `charge.refunded`, `charge.dispute.created`, then copy its signing secret here. **All five matter**: `invoice.paid` is how every recurring product renews (without it a subscription charges the member forever and delivers only the first period), and `checkout.session.async_payment_succeeded` is how delayed-notification methods — SEPA debit, ACH, Boleto — confirm days later (without it those purchases never settle at all, because `completed` arrives `unpaid` and is correctly ignored). **Amora handoff item (Rye, 2026-07-26): create the endpoint + set this secret together with `STRIPE_SECRET_KEY` — a missing secret means unsigned events are processed only in dev shapes; a wrong one rejects every settlement with `sig_fail` alerts to admins.** Test with `stripe listen --forward-to` before go-live. | Settlements unverified or rejected; orders never credit |
| `RIVERSIDE_WEBHOOK_SECRET` | Shared secret for `POST /api/webhooks/riverside` (automation module). **Settable from Admin → Integrations instead** — admin-typed beats env, masked on read. The webhook **fails closed**: without a configured secret, or without a matching `x-riverside-secret` header on the delivery, every payload is discarded with an inert 200 (the automation admin card shows a warning while unset). Configure Riverside to send the same value as the `x-riverside-secret` header. | Riverside deliveries are silently discarded until the secret is set |
| `GOVERNANCE_HUB_SECRET` | Shared secret for `POST /api/webhooks/mechanics-governance` — how a Hypha vote's outcome comes home. **Settable from Admin → Integrations instead** (admin-typed beats env, masked on read). The ReGen hub runs ONE Alchemy listener on Base for every fork; when a proposal carrying a `[gm:…]` marker executes on-chain, the hub POSTs the outcome here with this secret as the `x-governance-hub-secret` header. **Fails closed**: unset or mismatched = every delivery discarded with an inert 200. Until your fork is registered with the hub, outcomes are reported by the proposer and applied by an admin ("Verify & apply"). | Verified outcomes never arrive; the human verify-and-apply path still works |
| `BASESCAN_API_KEY` | (optional) Etherscan/Basescan API key for **Admin → Game Mechanics → Integrate DAO**: after the founder issues themselves a token on Hypha, the token's contract address on Base is discovered from the founder's account history (`hypha.founder_base_address`) by the token's exact on-chain name. **Settable from Admin → Integrations instead** (admin-typed beats env, masked on read). One free key from etherscan.io serves Base via the V2 API. | The find-token lookup answers 409 with guidance; contract addresses can still be pasted by hand from basescan.org |
| `FEEDBACK_HUB_URL` | (S66, optional) **must be `https://` and publicly resolvable** — the relay now dials through the pinned-IP guard, which refuses plain http and any private/loopback/CGNAT address. A self-hosted hub on a VPC-internal or `http://` address will simply never receive anything (rows stay queued locally, no data is lost, one log line per attempt). Where the feedback relay POSTs — defaults to the ReGen Civics hub. The relay is ON by default (`platform.feedback_relay` game variable), sends CONTENT only (never who submitted), queues locally and retries while the hub is unreachable; turning it off keeps everything in Admin → Feedback, local-only. | Default hub endpoint used |
| `ERROR_WEBHOOK_URL` | (optional, PY6) an HTTPS endpoint that receives a JSON POST when something crashes — a Slack or Discord incoming webhook, a Sentry store URL, or your own collector. Admins are ALWAYS notified in-app regardless; this puts the same alert where your team actually looks. Deduped to one alert per distinct failure per hour, and dialled through the pinned-IP guard like every other outbound call. | Crashes are still logged and still alert admins in-app, but nothing reaches an external channel |
| `TRUSTED_PROXY_HOPS` | (optional, default `1`) how many proxies sit in front of this process. `X-Forwarded-For` grows left to right, so the client's real address is the Nth entry from the RIGHT, where N is this number — and everything to its left is caller-supplied and forgeable. Every rate limit (checkout attempts, sign-in throttling, the assistant's cost cap, the abuse guard) keys on the result. `1` is correct on Railway, Fly and Render; raise it if the fork puts its own CDN or load balancer in front; `0` means no proxy and the socket address is used directly. | A value too LOW trusts a forged header and lets one caller bypass every rate limit; too HIGH buckets unrelated visitors together and throttles innocents |
| `PLATFORM_SUPPORT_URL` | (module library, optional) Where a village is sent when the PLATFORM is the supporting party: every Included module, and every Managed listing. Whoever operates this deployment is its own support desk, so platform code carries no address and this is where the fork puts one. It appears in the 503 body a lapsed Managed listing answers with. | The lapse body still says "this one is on us" and still says what keeps working; it just gives nowhere to write |
| `PLATFORM_SUPPORT_EMAIL` | (module library, optional) The same, as an address. Used when `PLATFORM_SUPPORT_URL` is unset. | As above |
| *a Managed listing's key* | (module library, per listing) Each Managed listing names its own env var in `vendor.managedEnvKey` in `shared/modules.ts`. The key is the PLATFORM's, is read from env at call time, is never added to `SECRET_KEYS`, and is never returned to a village by any route, not even masked (hub ADR-49). Set it at provisioning by whoever has deploy access; there is deliberately no admin screen for it, exactly as with `PLATFORM_ASSISTANT_KEY`. | That listing answers 503 with "this one is on us" and its Integrations card reads "Not on your plan". Everything else keeps working |
| *a Connected listing's key* | (module library, per listing) Each Connected listing names its slots in `vendor.secretKeys`. They join `SECRET_KEYS` automatically, so they are settable from **Admin → Integrations** with source and last4 shown, and this env var (the slot name uppercased, e.g. `example_api_key` → `EXAMPLE_API_KEY`) is the fallback. The village holds its own account and can rotate the key unaided. | That listing answers 503 naming the vendor and their support link. Everything else keeps working |
| `TEST_DATABASE_URL` | (dev/CI only, local .env) scratch-schema MySQL for DB-backed tests — the harness DROPs/CREATEs `village_test`; never point it at the app schema | DB suites skip loudly |

## Account recovery

Members can reset their own password: **"Forgot your password?"** on `/login` →
`/forgot-password` → a one-hour, single-use link. The route answers the same
200 for every address, known or not, so it cannot be used to discover who is a
member — which also means a fork with an unverified sender domain shows the
same success page while nothing is delivered. **Verify the sender domain
before launch** (see `RESEND_API_KEY` above); recovery depends on it.

Two admin levers sit beside it, for the member whose address on file is wrong:
`POST /api/admin/users/:id/send-password-link` (emails a link, never returns
it; a plain admin may not target a founder) and the existing
`POST /api/admin/users/:id/revoke-sessions`.

Note the session semantics, because members notice: `tokenVersion` is the only
revocation lever there is, so **signing out, or setting a new password, ends
every session on every device**. Per-session sign-out would need a sessions
table.

## Game mechanics: rings, the public snapshot, the amendment ledger

Every mechanic lives in the variables registry (`shared/gameVariables.ts`) —
the single source of truth. Each variable carries a **ring**: `open` dials are
the community-governable surface (the coming Hypha proposal loop operates only
on these); `founder` dials (infrastructure, legal posture, privacy windows,
abuse guards) stay admin-held. The **constitution** (`shared/constitution.ts`)
is the plain-language list of what no vote can change — shown at the top of
the public page; edits there change copy, never enforcement.

Two public, unauthenticated endpoints serve the whole story:
`GET /api/game/mechanics` (constitution + every variable of every running
module, with ring, bounds, default, current value, and when a change takes
effect) and `GET /api/game/mechanics/history` (the amendment ledger: every
change with actor first-name, source, and — once the governance loop lands —
the Hypha proposal reference). Everything is deliberately visible: rule sets
are how future players compare forks.

The per-stage mechanics (`progression.multiplier.*`, `progression.quests_for.*`,
`progression.unlock.*`) are generated from your stage ladder in
`shared/gameConfig.ts` — edit the ladder and the registry follows at next
deploy, with your config values as the defaults.

**Members change the rules from the page.** Community dials are editable in
place on `/game-mechanics`: staged changes become a proposal (title +
rationale), which gathers in-game support, goes to your Hypha for the binding
vote (the copy carries a `[gm:…]` marker — keep it in the Hypha proposal
title), and is applied by an admin after verifying the pass ("Verify & apply"
on the proposal card; automated on-chain verification is the next phase).
Who may propose is yours to tune: the base is ANY MEMBER
(`progression.unlock.mechanics.propose`, default member); raise the rung, set
it to role/badge-only, require earned recognition
(`governance.hypha_threshold`), demand in-game supporters before the vote
(`governance.proposal_support_threshold`), cool changed dials down
(`governance.change_cooldown_days`), and cap proposals per member per cycle
(`governance.proposals_per_member_per_cycle`). Members below the bar can
always draft; a qualified member's sponsorship opens the draft.

## Tunable abuse guards

The throttles are game variables (Admin → Game Mechanics → *Abuse guards*), so
a village can loosen or tighten them without a deploy: registrations per IP
per hour, failed sign-ins per IP and **per account** per 15 minutes (successful
sign-ins never count against either), password-reset requests per IP per hour,
and investor-packet requests per IP per hour. Every bucket is per-IP unless it
says per-account, so **one shared village connection is one bucket** — set them
above the size of a gathering, not to the size of one person's usage.

- Messaging adds two more (visible once the `messaging` module is on): `messaging.sends_per_minute` (default 20) is per MEMBER across every conversation, with a looser per-IP bucket beside it so one stolen token cannot spray the village; `messaging.max_members` (default 50) caps a group conversation and is therefore also the size of the loudest single send anyone can make. The module needs no env var, no seed, and no provisioning step: it ships OFF like every non-core module, and enabling it is the whole setup.

## Seeds & per-deployment data

- `server/seeds/content-seed.json`, `quests-seed.json` — page copy + quest
  library (self-heals via `seedIfMissingOrEmpty`).
- `server/seeds/examples-seed.json` — STANDING EXAMPLES: platform-authored
  worked content revealed when a module is first enabled, so a founder meets a
  working module instead of "No items yet." Inert (every mutation refused) and
  retired permanently by the first real item that module receives. Seeds AFTER
  the real seeds above, so it never displaces your starter content. Clear early
  with `POST /api/admin/modules/:id/examples/clear`; prove inertness with
  `node scripts/check-examples.mjs`. See `docs/STANDING_EXAMPLES.md`.
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
  name, main-site / events URLs, footer introduction) → Pictures (uploaded,
  sharp-compressed, never hotlinked — including the header logo, footer mark
  and browser tab icon, all live with no deploy) → Numbers (dues, budgets —
  these write game variables) → Content (page copy, FAQs) → Map & styling →
  Go live.
- **Map & styling (step 5)** writes `brand.skin`, which is the Living Map's
  OWN export format, field for field (`shared/mapSkin.ts`). Style the land
  inside the map, export, and the JSON drops straight in. Blank keeps the
  map's own look. Served to the map at `GET /api/map/skin`, which inherits
  the `map` module's gate. `painterly.brush` / `painterly.palette` are stored
  and round-trip through export, and the map does not re-apply them on load
  yet, so they change nothing on screen today.
- **The shell is overlay-driven.** The header logo, tab icon, footer mark,
  footer introduction, "Main Site"/"Events" links and copyright name all come
  from the brand config; a blank `siteUrl` renders NO outside links rather
  than a dead one. `client/index.html` is deliberately NEUTRAL — no village
  name, no canonical URL, no og:image — because it is served byte-for-byte
  to every deployment; the client repaints title and favicon from live
  config. A fork that wants crawler-visible metadata (og:image, canonical)
  adds it in its own fork where those values are actually true.
- **Fonts:** the platform self-hosts an all-OFL catalogue (@fontsource, latin
  subset, bundled with content hashes — no request ever leaves the origin for
  a typeface; offerings in `shared/fontCatalog.ts`). Admin → Make This Yours →
  Typography picks heading/body/accent faces with live previews, or uploads
  the village's own font file (.woff2 best; magic-byte-verified, stored in the
  uploads volume, served immutable) behind a **web-embedding licence
  acknowledgment** that gates the server and is recorded with who/when —
  "free to download" almost never includes web embedding, and the village
  that chooses a font carries its licence. Power path: set
  `brand.theme.fontImportUrl` to a hosted CSS file carrying `@font-face`.
  `/api/brand/theme.css` emits everything, sanitised; blank fields = neutral
  defaults; changes apply live with no deploy.
- **NOT overlayable** (code-level edits, deliberately): the stage ladder and
  its ids, the path definitions, season cadence semantics. Those are game
  DESIGN; changing them is a fork of the game, not a re-skin.
- **The guard:** `node scripts/check-brand-refs.mjs` runs in CI. Platform
  zones (`server/lib/**`, `shared/**` except `gameConfig.ts`) must contain
  no village's brand at all; the app shell, client pages, applied
  migrations and test fixtures are ratcheted — their counts may only fall.
  Forks extend the banned-terms list in that script with their own names.
- **Images are WebP, and CI enforces it.**
  `node scripts/check-image-budget.mjs` walks `client/public` and fails on any
  raster that is not WebP or AVIF, on any single file over 400 KB, and on a
  total above `scripts/image-budget-baseline.json`. That total is a RATCHET:
  `--update-baseline` writes the new number only when it is lower, so the
  figure falls and never climbs.
  **What a fork needs to know.** Your own art goes in
  `client/public/assets/images` as WebP —
  `node scripts/compress-static-images.mjs --write` converts and right-sizes a
  directory of PNGs in one pass. Two kinds of file are exempt and you never
  edit the guard to say so: whatever `shared/gameConfig.ts` names as
  `images.favicon`, and whatever `client/index.html` declares as an icon or a
  social card. Those stay PNG because Safari's touch icon and link-preview
  crawlers have no dependable WebP support, and because the PWA manifest
  labels any non-SVG icon `image/png` regardless of what it really is.
  **A renamed brand file keeps working.** `/assets/images/<name>.png` falls
  back to `<name>.webp` when the PNG is gone (`server/index.ts`), so a path a
  wizard typed into `brand.json` two years ago still resolves after the
  conversion. No database migration is needed.
  **Large art belongs in the uploads volume**, not in `client/public`. The
  volume is content-addressed, cached correctly and swappable;
  `client/public` is served one-year-immutable and cannot be replaced for a
  year once a browser has it.
- **Member uploads are shrunk in the browser** by
  `client/src/lib/imagePrep.ts`: it draws to a canvas, encodes WebP and
  returns the ORIGINAL file whenever it cannot do that safely (SVG, GIF, a
  file already small, a browser whose canvas ignores the WebP mime and hands
  back PNG). That turns an 8 MB phone photo into a few hundred KB before it
  reaches the wire, which is minutes on the links this platform is built for.
  The server still re-encodes what arrives, so the two are belt and braces.

## Token naming (Gate D)

Three layers, all admin-owned:

1. **The recognition token** (the village's own word for appreciation):
   rename in the `tokens` table row, in `shared/gameConfig.ts`, and in the
   brand overlay — all three, or the UI and the ledger disagree.
   The recognition token is a SIGNAL with no financial value — the public
   pages say so; keep any renamed copy honest about that.
1b. **The value token** (whatever token `gratitude.pool_token` names —
   `credits` by default): rename it once via Admin → Tokens → rename, and
   every surface follows — wallet, exchange, and the public pages, which
   read the name from `/api/game/config` (`currency.value`). This is the
   token the cycle pool distributes across recognition, and the one the
   "converts to cash or equity as the village matures" promise attaches to.
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

**Module library listings are skipped by that script, deliberately.** It reads
the tier from the server and leaves anything above `included` alone: turning a
listing on without its credential probes a surface that cannot answer, and for
a Managed listing, enabling it is the village accepting a support arrangement
and a stamped contract version, which is not a thing a convenience script gets
to do on somebody's behalf. Enable each one from Admin → Modules after reading
its card and setting its key. <a id="module-library"></a>

### The module library (tier, vendor, and the 503)

Some modules connect this village to an outside paid service. Every one of them
is first-party code in this repository: a connector written and maintained here
against somebody's API. No vendor code runs inside your server.

Each listing sits in one tier, and the tier answers the only two questions
anybody asks when something breaks: **who do I pay, and who do I call.**

| | Included | Connected | Managed |
|---|---|---|---|
| Billed by | the platform price | the vendor, direct to you | the platform |
| You call | the platform | the vendor for the service, the platform for the wiring | the platform |
| The credential | none, or your own upstream account | **yours**, set in Admin → Integrations, source and last4 visible | platform-held, env only, you never see it |
| You have an account with them | n/a | **yes** | no |

Included shows no badge in the catalog; Connected and Managed each show a pill
and a line saying who supports it.

**When a listing's key is missing or its service is down, its routes answer 503
and never 404.** A 404 means "this module is off" and is how a village hides
what it has not turned on. A paid, enabled module that answers 404 would tell
your members the feature was deleted. The 503 body carries a sentence your
pages already render: Connected names the vendor and their support link,
Managed says the platform is on it and never names anybody. Everything else in
the village keeps working either way.

**What a village agreed to is stored.** Enabling a listing writes the tier and
the library contract version into that module's `module_settings.config` and
appends a `module_events` row of kind `listing`. The registry tier is the
offer; that stamp is what you are on. A later tier change is therefore a
re-acceptance somebody reads, never a silent rewrite of your support
arrangement.

**Health is measured, never assumed.** A key being set is not a key that works.
Every outbound call is wrapped, carries an `x-correlation-id` header the vendor
is asked to log, and writes one `integration_health` row per (module,
operation) with the last success, the last failure and its status. With no
recorded success, Admin → Integrations says "never confirmed working", which is
the truthful answer and is not the same as broken.

**A price is data, and the credential is the licence.** A listing may carry a
price (amount, currency, period, a billing URL) and it renders in the catalog,
on the listing detail and on that listing's Integrations card. **The developer
bills you directly; this platform processes no payment and takes no cut.** What
a paid listing's paid features actually validate against is a licence key you
buy from the builder and hold in your own secrets store, where you see its
source and last4 and can clear it unaided. That is deliberate: you own this
repository and could delete any code gate in it, so a price can only honestly
rest on a credential the other party holds. While the licence is blank the
listing answers the same 503 as any other missing key and the rest of the
village carries on. A listing may never disable a village surface, lock an
admin screen, or touch your data when its licence lapses.

**`builtBy` is a credit line and never a tier.** It renders wherever a listing
does, at every tier including Included, so somebody who contributed a module
without becoming its counterparty is still named.

**A withdrawn listing is marked, never deleted.** Admin → Modules banners any
withdrawn listing you are running and shows the date. Withdrawn blocks a NEW
enable with a 409; it changes nothing already serving, so yours keeps running
and you can still move it between preview, members and public, or switch it
off. Switching it off is one way, because it cannot be turned back on. The
registry entry stays, which is what stops your `module_settings` row becoming
an orphan.

**A `member-pii` listing owes you a deletion driver.** Any Connected or Managed
listing whose data class is `member-pii` raises a **blocking** launch
requirement until it registers a `forgetMember` and `exportMember` driver.
Without one, erasing a member reaches only this village's own tables while an
outside service keeps its copy. It fails visibly on the launch journey and in
the admin banner, and it never blocks boot.

**Linting a listing.** `node scripts/validate-module.mjs [module-id]` checks the
registry shape, the vendor record, the pricing and licence slot, the member
driver, the contract doc and its provenance marker, and the launch requirement.
It then prints everything it cannot check, because a check that silently skips
turns "unchecked" into "passed". `docs/modules/BUILDING_A_MODULE.md` is the
guide for whoever is writing the module.

### The Living Map artifact (`/map`)

`/map` serves `docs/prototypes/grounds-v0.html` straight from that path: the
server routes `/grounds/index.html` and `/grounds/manifest.json` to it
(`server/index.ts`), and the vite dev plugin does the same for `pnpm dev`.

**Caching.** The artifact also answers on a content-hashed name,
`/grounds/grounds-<hash>.html`, served `immutable` for a year; the manifest
names the current one in its `url` field and is itself `no-store`. The shell
uses that url, so a 4 MB map is fetched once per version instead of
revalidated on every visit. The hash is memoised on (size, mtime), so swapping
the artifact is picked up without a restart, and a request for a stale hash
redirects to the current one rather than 404ing. `/grounds/index.html` still
works and revalidates. The probe contract (`present`, `bytes`) is unchanged;
`url` is additive.

**There is deliberately no second copy.** It was briefly staged into
`client/public/grounds/` at build time, which put 4 MB into `dist/public` and
took the total to 7.8 MB against the CI bundle budget's 6 MB ceiling. That gate
exists to catch exactly that, and the fix is to serve one copy rather than to
raise the number. Nothing to provision and no env var; the artifact simply
needs to be committed. A deployment without it builds and runs fine, `/map`
says the map is not installed, and the org view at `/map/circles` needs no
artifact at all.

### The map address plane (0060)

Additive, nullable columns that record WHERE a thing lives on the Living Map
and WHO SAID SO: `circles.home_structure_key`; `structure_key` +
`address_source` on `org_roles` and `quests`; `structure_keys` +
`address_source` on `forum_threads`. No provisioning, no env var, nothing to
turn on.

`address_source` is `creator`, `creator-board` or `resolver-guess`, enforced in
code (`shared/mapAddress.ts`) rather than by an enum, because the list is
expected to grow and a widening enum is an ALTER on four populated tables every
time. NULL means nobody has said anything yet, which is deliberately different
from `creator-board`: one is silence, the other is a person choosing the Board.

**The doctrine: a `creator` or `creator-board` row is never overwritten by
anything automated.** Only NULL and a stale `resolver-guess` may be replaced.
Every writer asks `mayOverwriteAddress()`; nothing reimplements the comparison.
The scene importer obeys it and prints what it left alone.

Four values travel, three are stored. A scene may carry `pool`, which is the
exporter's derived "no structure was set", and it lands as NULL. The artifact
publishes the whole contract in `map_scene.address_source_vocabulary` (values
plus the law), and the importer compares that list against its own on every
run: a scene declaring a source this platform cannot handle prints a NOTE
naming it, and those rows import unaddressed rather than silently vanishing.
One legacy spelling, `lexicon guess`, maps to `resolver-guess`; the map
normalises it at its own export boundary now, so only older scene files carry
it.

The founder's own words for roads, water and zones live in the
`map_vocabulary` document in `app_config`, served at `GET /api/map/vocabulary`
(behind the `map` module's gate) and written by `PUT
/api/admin/map/vocabulary`. The same document carries `media` (what flows along
a line, with the colour and glyph it is drawn in) and `phases` (what a build
phase is called, keyed by the number the scene stores).

### Promises made on the map (0062)

`quests.map_key` and `events.map_key`: varchar(190), nullable, UNIQUE. The name
the MAP uses for a row, stored exactly as it arrived and never computed here.
No provisioning, no env var, nothing to turn on.

A visitor can RSVP to a gathering and claim a quest from inside the map. When
they do, the map posts the only id it has: a scene event id (`e1`) or the key
it derived from a quest title once and then kept. `POST /api/map/promise`
(behind the `map` module's gate) turns that into a row and answers.

**Nothing here derives a key.** Two implementations of one slug rule must agree
forever, and the first title edit breaks them apart, which is the exact failure
this column ends: the map renamed three of its own seed quests in one afternoon
and every one stopped matching on title. The importer stamps the key on the
first pass, matching by title because that is all there is, and matches on the
key every pass after. A renamed quest keeps resolving.

The route always answers **200 with a body**, because the shell relays a
result and a bare status code leaves the map guessing. `reason` is one of
`anonymous` (401; `href` is the way in), `not-yet` (the capability gate or a
quest's stage and role rules; signing in again fixes nothing), `closed`,
`full`, `not-here`, `gone`, `error`.

**`not-here` and `gone` are different and `not-here` is the common one.** A
village that has never imported a scene has no row for ANY key the map sends,
which is the default state of a fresh fork. It is not a deletion and must not
read like one. The discriminator is whether the table holds any map keys at
all.

Withdrawing a claim removes it only while it is still `claimed`. Once it is
submitted or consented, work or recognition is attached and the route refuses
with `closed`.

### App mode, the Welcome Walk, and installing the map

`/map` renders with no site header and no page scroll: the frame is `100dvh`
(not `vh`, which on a phone measures the viewport with the browser chrome
hidden and leaves the last strip behind the address bar). Leaving happens two
ways that run the same code: the artifact's own exit posts `{type:'exit'}`,
and the browser Back button pops a marker history entry pushed on open.

`GET /api/map/config` returns `{skin, walk, vocabulary}` in one call, and the
shell pushes it as a single `{type:'config'}` message on `grounds-ready`. The
walk lives in a `map_walk` document keyed by language (`en` default);
**an absent or empty walk means the artifact runs its own seed**, which is why
the shell omits the key instead of sending `[]`. Edit it in Admin, Make This
Yours, step 5, which can preview a draft on a real map without saving.
`GET /api/admin/map/structures` feeds the step picker from addresses the
village has actually set (0060).

`/manifest.webmanifest` is generated from the brand overlay, so a fork gets
its own install prompt with no deploy, and `client/index.html` stays neutral.
`client/public/sw.js` caches ONLY the content-hashed map artifact and passes
everything else straight through; a broader worker is how a village ends up
served yesterday's build with no way to force a refresh.

### Importing a map scene

```bash
npx tsx scripts/import-map-scene.ts <amora-scene.json> --dry
```

`--dry` needs no database and writes nothing. Without it, set `DATABASE_URL`.
It refuses a scene whose version it does not know, matches rows by name and
title and **never creates** one, and prints three lists every run: what it
skipped, what it could not match, and what a person had already placed. Events
import as drafts.

### Events (0059)

Ships off like everything else. Turning it on mounts `/events` and the
calendar API. It holds no value, so its `openStateCheck` is guidance rather
than a money guard: it asks an admin to cancel or wait out gatherings still
on the calendar before switching the module off, so members are not sent to
a page that 404s. Putting something on the calendar needs `event.manage`,
which is role-granted and never reached by stage; answering one needs
`event.rsvp`, which any account has. No seeds, no env vars.

### Selling library credits (`library.creditSaleEnabled`) — opt-in, off forever by default

By default a library credit is backed by a physical item on the shelf and
can never be bought. Opening sales (Admin → Exchange, the L9 caution card)
makes it purchasable for fiat like any credit token — backed by money
instead of an item, indistinguishable from earned credits after the sale.
The card states the risk: oversell against the shelves and every credit's
promise weakens. Swapping stays sealed regardless — this card opens the
shop, never the market. The ledger keeps the two provenances separate
forever (`sys:library-mint` = shelf-backed intake, `sys:mint` = sold
stock), and revoking the card refuses the next sale, not the next deploy.
Prepaid credits can be a regulated product where you operate — ask a
lawyer first.

### Token-for-token swapping (`exchange.tradingEnabled`) — opt-in, off forever by default

Enabling the exchange module gives you a **shop**: members buy listed tokens
with a card. It does not give you a **market**. Letting members trade one
village token for another is a second, separate switch, and it stays off
until a named admin accepts a version-stamped caution card in Admin →
Exchange. The server records who accepted it and when, refuses an acceptance
of any card but the current one, and refuses to boot with trading on while a
shared password is your only admin credential.

Before you flip it, know what you are taking on:

| Property | What it means for your village |
|---|---|
| Regulated activity | Members trading tokens at posted prices can be a regulated activity where you operate. This is the point to ask a lawyer. |
| Fiat is one-way | Tokens never convert back to money. There is no path out and adding one is not a setting. |
| Faucet tokens can never swap | Anything a faucet has paid a member — recognition, quest rewards, hand-mints — is permanently unswappable, however it was earned. It can still be bought. |
| Swaps are final | No reversal, no dispute queue, no chargeback. The only way back is swapping again at the posted prices. |
| Caps are fail-closed | Every open token needs a per-cycle and a per-member-per-cycle cap. **0 means zero, not unlimited.** Set both before you announce anything. |
| Card-bought tokens are held | `exchange.swap_fiat_hold_days` (default 45) freezes recently purchased tokens from swapping so a chargeback still finds them unconverted. |
| Halt is one click | Any token can be paused instantly. Resuming requires a written sentence, recorded in the audit log. |

Practically: most villages should leave this off. It exists for deployments
that have two or more genuinely distinct credit tokens (say, a lodging credit
and a workshop credit) which members have a real reason to move between. If
fewer than two of your tokens pass the faucet firewall, there is nothing to
turn on — the Exchange admin tab will tell you which tokens are refused and
why.

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

**The loop, by hand:** `/health` → ok, and its `build` reads
`<label>-<git sha>` — the SHA is stamped at build time, so if it does not
match the commit you just pushed, the deploy has not landed yet (a marker
that never changes is the bug this replaced). Then:
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

- Seeds: `server/seeds/org-chart-2026-08.json` — the org-chart content (role cards, circle cards, team cards) applied once by the `org-chart-2026-08` runOnce into the `roles` / `circles` / `team` content sections; the public `/roles`, `/circles`, `/team` pages render those sections and the content admin editor owns them afterward. Forks replace this seed with their own structure (or just edit in admin).

## Org chart and seasons (0049, 0050)

- `drizzle/0049_org_roles.sql` creates `org_roles` and `org_role_assignments`
  and adds `circles.grown_from_org_role_id`. The `roles` table is untouched:
  it stays the permission-group carrier feeding the one capability gate.
- `drizzle/0050_season_patterns.sql` creates `season_patterns`,
  `season_pattern_members` and `season_roll_log`, and adds
  `badges.season_scope` and `badges.multiplier`.
- Seed: `server/seeds/org-chart-corrections-2026-08.json` is per-deployment
  data, applied once by the `org-roles-backfill-2026-08` runOnce when the
  card-shaped org chart becomes rows. A fork with its own cards keeps them;
  the corrections file only moves seats between circles and names holders.
- New game variable: `org.reassignment_cadence` (default `season_turn`).
- The public `/roles`, `/circles` and `/team` pages read `GET /api/org`. The
  Content card editors for those three sections no longer drive them; the
  editing surface is Admin, Org Chart.
- Seed refresh: the `examples-refresh-featured-awards-and-members-product`
  runOnce reapplies the `badges` and `commerce` example rows. It exists
  because no example award carried `featured` (bylines render featured awards
  only, so every example member's byline came back empty) and every example
  product was `public` (the members-only branch of the catalogue had nothing
  to show). A fresh instance picks both up from the seed and needs no refresh.

## Publishing your village (0051, no migration)

Three unauthenticated documents. Anyone, including an AI agent, can read your
whole org chart from one URL with no integration:

- `/.well-known/village.json` — discovery. **Always on.** It publishes what
  `/api/platform/info` already did, plus a public key and a `links` block.
- `/api/public/org.json` — the org chart as data.
- `/org/index.md`, `/org/circles/<id>.md`, `/org/roles/<id>.md` — the same
  chart as linked Markdown.

**The last two are dark until BOTH are true:** the `map` module is at `public`
lifecycle, and the `map.public_structure` variable is on (it defaults on). That
pair is already your answer to "may a stranger see our structure", so there is
no separate publish switch to find. Set `map` to `off`, `preview` or `members`
and the org documents 404 while discovery keeps answering with an empty
`supports` array.

**They never carry names.** Not full names, not first names, not the names of
documented holders, not focus strings or holder notes. Seat counts and how many
are filled, and nothing else. If you want a public people directory, that is a
different thing and it needs per-member consent first.

Every document is signed with an ed25519 key minted at your first boot and
stored in `app_config` under `village-signing-key`. The public half is in the
discovery document. **Back it up with your database.** Losing it loses no data,
and since 0057 it has a cost that is easy to miss: every village that peered
with you PINNED that key, so a new one pauses you on their side until one of
their admins presses "accept & resume". Restore the key with the database and
nothing happens; restore the database without it and every peer goes quiet at
once.

Check yours after provisioning:

```bash
curl -s https://<your-domain>/.well-known/village.json | jq '.supports, .publicKey.kid'
curl -s https://<your-domain>/org/index.md | head -20
```

## Peering with another village (0057)

`drizzle/0057_peer_public_key.sql` adds `peer_instances.public_key`. When you
add a peer, this village records the signing key their discovery document
proved it holds, and every six-hourly sweep checks the next document against
it. Nothing to configure.

What you will see:

- **A peer pauses with "signing key changed".** They rotated their key, or
  restored a database without it, or somebody else is answering at their
  address. Ask them, then press **accept & resume** on the Network page, which
  re-reads their handshake and pins whatever answers now.
- **A peer pauses with "signing key no longer proved".** They used to sign and
  have stopped, most likely a rollback to an older build. It reads the same as
  somebody stripping the check by serving the old unsigned document, so this
  village refuses either way. Same door out.
- **A peer that never signed keeps working.** A village running an older build,
  or a hand-written static file answering the discovery shape, pins nothing and
  is trusted exactly as much as it was before. It pins itself the first sweep
  it starts signing.

## Forgetting a documented holder

A member deletes their own account and everything of theirs goes, org seats
included. A **documented** holder is a real person with no account here, so
nothing joins their name to a user row and nothing scrubs it. If one asks to be
forgotten, an admin does it:

```bash
curl -X POST https://<your-domain>/api/admin/org/seatings/<seating-id>/forget \
  -H "Authorization: Bearer <admin-token>"
```

Every seat recorded under that name ends and loses the name and the note, past
seats included. The seats keep their history and their counts; only the person
goes.

## Characters and the economy (0069 to 0072)

Four migrations arrive together. Snapshot first, then boot: the runner applies
them fail-loud before the server serves.

Nothing here needs an env var. The two Hypha secrets the voice claim will need
are NOT wired yet and are named in the PR, not here, so nobody sets a variable
that nothing reads.

**Seeded at every boot**, beside `ensureStayToken` and `ensureLibraryToken`:

- the village voice token (`village-voice`), platform-governed so it can accrue
  here, at 3 decimals so a rule of 0.1 posts 100 thousandths rather than
  truncating to zero;
- the five classes (`archetypes`), which UPSERT, so an improvement to the copy
  reaches every village on the next deploy;
- the starting `mint_rules`, which INSERT ONLY WHEN ABSENT and are never
  updated. An amount your village has edited is never restored to the platform
  default by a redeploy. To change one, edit the row.

Re-running seeds nothing twice and grants nobody anything: value only ever
enters through the engine.

**One new scheduled job**, `moon-settlement`, hourly. Hourly is how often it
ASKS, not a payment cadence: every mint is keyed on cycle, seat and holder, so
twenty-four runs a day pay exactly what one does and an interrupted run
finishes on the next tick. It thanks seat holders at the amounts the rules
already promised. It does NOT close a gratitude cycle, which stays a human act.

**Two new variables**, both in Admin under Gratitude:

| key | default | what it counts |
|---|---|---|
| `economy.giving_allowance_per_moon` | 30 | Hearts a member may give each lunation |
| `economy.hearts_per_recipient_per_moon` | 10 | Hearts to any one person each lunation |

These are separate from `gratitude.base_budget` and
`gratitude.max_per_recipient_per_cycle`, which govern the older acknowledgement
flow and count SENDS rather than Hearts. Both pairs are live and both write
`gratitude_log`; the new pair is the stricter, so the overlap runs in the safe
direction. Retiring one is a decision, not a cleanup.

**Avatars.** `scripts/gen_avatars.py` needs `GEMINI_API_KEY` in the
environment, never committed, and is only ever run by hand. It keeps its 2K
masters in `scripts/avatar-bases/` (gitignored) and delivers 1024px webp, which
is what keeps 30 portraits inside the CI budget of 6000 KB for the whole of
`dist`. Re-running skips what exists.
## Who may shape the living map (0063)

Build mode edits a PRIVATE draft. Nothing a member drags is visible to anyone
else until they press Publish, and one member publishing never touches another
member's draft.

Two capability keys govern it, and neither is reachable by climbing the stage
ladder because both are appointments:

- `map.edit` opens build mode and keeps a draft.
- `map.publish` makes a draft the map every visitor sees.

Migration 0063 seeds a **Cartographer** badge carrying both. It is an ordinary
granted badge, so award it from the admin badge screen like any other. Admins
and founders pass every gate already and need no badge. To let someone draft
proposals without handing them the live land, make a role carrying only
`map.edit`.

The badge row is seeded with `INSERT IGNORE`, so a deployment that already made
its own `cartographer` badge keeps theirs untouched. While the badges module is
off the row simply exists and grants nothing.

Nothing to provision: no env var, no seed file, no extra step. A village that
has never published serves `scene: null` from `GET /api/map/config` and the map
draws its own seed, which is the correct state for a fresh fork.

- Seeds: `server/seeds/quests-seed.json` carries the story layer per quest (0068: `subtitle`, `story`, `firstStep`, `steps`, `deliverable`, `tips`, optional `imageUrl`). On an already-running village the `quest-story-2026-08-10` runOnce fills those fields from the seed ONLY where the live row is empty, so admin-written copy is never overwritten, and `quest-posters-2026-08-10` replays the same fill to pick up `imageUrl` on villages that ran the first one. Both throw when the seed file is missing or unreadable, so a broken deploy retries on the next boot instead of recording itself as applied. Look for `filled N quest(s)` or `found nothing to fill` in the boot log: those are different facts.
- Quest poster art: a quest's `imageUrl` must be a path under `/api/uploads/` (the API refuses anything else, the same rule the forum's image field follows), so posters are uploaded into the `data/uploads/` volume, never committed to `client/public`. That directory is served one-year-immutable and is not content-hashed, and CI caps `dist/public` at 6 MB total and 400 KB per image. A village with no poster files needs no action: each card paints a gradient scene from its circle, and a quest whose `imageUrl` points at a missing file falls back to the same scene rather than showing a broken image.
- Quest crews (0067, `quest_crews` + `quest_crew_members`): a small named group walking one quest, formed by any signed-in member and joined by invite link. Nothing about a crew touches value: members claim, submit and are consented to individually, so the consent gate never learns crews exist. Every crew route requires a signed-in member INCLUDING the read, because quest pages are public and who walks with whom is not for crawlers. Crews carry no conversation yet; `crewsRepo.attachConversation` is ready for the messaging module (`kind` 'crew', `context_type` 'quest', `context_id` the quest id) when it lands.
- Quest share cards: `/quests` and `/quests/:id` are rendered with per-request Open Graph tags (the static `client/index.html` stays brand-neutral, so the server splices identity in from its brand document and the request host). `GET /api/og/quest/:id` renders a 1200x630 JPEG from the quest's poster, or from its circle's gradient scene when there is no poster. No env var and no extra step.

## What the assistant costs, and the village's own record (0078)

**One new table**, `assistant_usage` (0078). Every call the assistant makes now
writes what it cost: all four token fields, the model, whether the key was the
village's own or the borrowed platform one, the member who asked, and the
number of upstream calls behind one answer. Nothing before this recorded a
token count, so "what does the assistant cost" was answered by guessing.
`rate_hits` counts events in a bucket and knows nothing about their size.

Nothing to provision: no env var, no seed file, no extra step. The table fills
itself the first time anyone uses any assistant surface, and a village that
never configures a key simply has no rows.

**One added column**, `path` (0081), which says which road produced the answer.
`loop` is the two-POST tool loop and the default, so every row written before
0081 reads as one truthfully. `prefetch` read the reader first and made one
call. `deterministic` answered straight from the village record with no model
at all, and those rows carry zeros in all four token fields and 0 in
`iterations`, because that is the honest count of upstream calls behind them.

The number worth watching is the ratio, not the average:

```sql
SELECT path, COUNT(*) AS answers, SUM(input_tokens + output_tokens) AS tokens
FROM assistant_usage WHERE created_at > NOW() - INTERVAL 30 DAY GROUP BY path;
```

A deterministic answer costs nothing and charges no daily budget, so a village
whose budget is spent, or which has no key configured at all, can still ask
what its own record holds. Questions the router is not sure about take the loop
exactly as before.

**One new scheduled job**, `record-derive`, daily. It reads decided forum
threads and files each one into `village_record` so members can be answered
about decisions made before they arrived. It early-returns while the forum
module is off. It is idempotent on `(source, source_ref)`, so re-running it
changes nothing, and it walks the backlog oldest first. Its result line reads
`N decided, N filed, N already there`; a trailing `N lost to a slug collision`
means two decisions carried the same title on the same day and the second one
could not be filed. That is a real loss and it is reported rather than hidden.
Give one of them a distinct title and the next run files it.

The record is fork-local. It is excluded by name from the feedback relay, the
peer publish surface and the platform handshake, and a test enforces that.

## Half-price call syntheses (`assistant.synthesis_batch`, 0082) — opt-in, off by default

Call synthesis is the most token-expensive thing the platform does: up to 400
transcript segments against a 2000-token reply cap. Anthropic's Message Batches
API charges **half** for every token in a batch. What you pay instead is time:
results usually arrive **within about an hour**, and are allowed to take up to
24. Not seconds.

That trade only makes sense when nobody is waiting, so the switch draws exactly
that line:

| Path | Behaviour |
| --- | --- |
| **Admin → Calls → Synthesize** | Unchanged. Synchronous, answers in seconds, full price. A person clicked it and is watching. This is true whether the setting is on or off. |
| **The `synthesis-batch-poll` job** | Only runs when the setting is on. It picks up recordings that have a transcript and no synthesis, submits them as one batch, and writes each synthesis when the results come back. |

**Two new tables** (0082), `synthesis_batches` and `synthesis_batch_items`.
Nothing to provision: no env var, no seed, no extra step. They stay empty on a
village that leaves the setting off.

**One new scheduled job**, `synthesis-batch-poll`, every 5 minutes. It polls
open batches first and then submits a new one, and it early-returns while the
automation module is off, while the setting is off, or with no assistant key
configured. Its result line reads `N open, N ended, N written, N unusable, N
errored, N expired, N canceled` plus what it submitted. It applies the same
three brakes the Synthesize button applies: the ready-queue backpressure
(`maxReadyQueue` in the automation module config), the global assistant daily
cap, and the key check.

Before turning it on, know what changes:

| Property | What it means for your village |
| --- | --- |
| Synthesis stops being a human act | Today a draft appears because an admin asked for one. On, drafts appear because recordings exist. Nothing publishes itself either way: publishing to the forum is still a human act, and so is accepting a task. |
| Standing examples are never touched | The seeded example recording is excluded by the query, so no tokens are ever spent drafting over a sample. |
| Retries are bounded at one | A request that errors, expires or is canceled is retried exactly once. The second failure marks it `failed` and leaves it for a person. |
| One synthesis per recording, still | Enforced by the database (`call_syntheses.recording_id` is unique), so a re-poll or a restart mid-read cannot produce a second draft. |
| Token counts are recorded, prices are not | `assistant_usage` records real token counts for batch calls the same as for synchronous ones. The 50% is a billing fact, so apply it in the rollup, not by halving the counts. |

Turn it off and any batch already in flight still lands: the poll keeps
draining open batches. Nothing new is submitted.
