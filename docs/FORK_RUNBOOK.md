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

### The Living Map artifact (`/map`)

`/map` serves `docs/prototypes/grounds-v0.html` straight from that path: the
server routes `/grounds/index.html` and `/grounds/manifest.json` to it
(`server/index.ts`), and the vite dev plugin does the same for `pnpm dev`.

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
/api/admin/map/vocabulary`.

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
