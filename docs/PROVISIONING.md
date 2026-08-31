# Provisioning a new instance

This is the walkthrough for standing up one running village on this platform,
from nothing to a working instance with your own name on it. It is distilled
from `docs/FORK_RUNBOOK.md`, which is the long-form reference. If a step here
seems thin, that document has the reasoning behind it.

Two paths exist and both end at the same running platform:

- **Self-host.** You (or your own technical helper) hold the Railway account,
  the domain, and every key. ReGen Civics supports the code; you run it.
- **ReGen-hosted.** ReGen Civics holds the Railway account and runs the
  instance for you, for a fee. You still hold your own Resend and Stripe
  accounts if you use them, because those are your relationships with your
  members, not ReGen's.

Every instance runs the same code from the same repository. Nobody creates a
copy or a fork of it (`docs/ARCHITECTURE.md`: "a fork inherits the platform
by pulling, not by find-and-replace"). What makes your instance yours is its
own database, its own domain, and its own environment variables, set in the
steps below. Your village's name, tagline, colours and logo are not part of
any of that: they live in the database and you set them in step 7, after your
first login.

If you are a founder working through this with your own Claude session,
paste `docs/FOUNDER_SETUP_PROMPT.md` into that session instead of reading the
steps below by hand. It walks the same path and does the typing for you.

## Before you start

You need, or need to get during this walkthrough:

- A Railway account (self-host) or a confirmed arrangement with ReGen Civics
  (ReGen-hosted).
- A domain you control, or a plan to get one. You can start without one and
  add it later; some steps below note what waits on it.
- A Resend account, free tier is fine, for sending email.
- A Stripe account, only if this village will ever sell anything with a
  card. Skip it for now if you are not sure yet; nothing below depends on it
  until you reach the payments step.

## The human-only steps, named up front

Three things in this walkthrough cannot be done by any script, by Claude, or
by ReGen Civics on your behalf, because they require proving you control
something outside this platform:

1. **DNS.** Pointing your domain at Railway happens in whatever service
   manages your domain's records (your registrar, Cloudflare, wherever you
   bought it). Nobody else can do this for you.
2. **Resend sender-domain verification.** Proving you own your sending
   domain by adding SPF and DKIM records, at resend.com/domains. Same
   reason: it is your domain.
3. **Creating your own Stripe account**, if you take payments. Stripe
   requires the account holder to verify their own identity and banking
   details directly with Stripe.

Everything else below, a founder's own Claude session can do end to end.

## 1. Get Railway access

**Self-host:** create a Railway account if you do not have one, then create
a new project. Because nobody forks this repository, your project deploys
from the same GitHub repository every instance runs from; ask ReGen Civics
to add you as a collaborator so Railway can build from it on your behalf.

**ReGen-hosted:** ReGen Civics creates the Railway project for you. Confirm
with them that it exists before continuing, then skip to step 3; they hold
the deploy settings in step 2.

## 2. Add MySQL and a volume

In your Railway project: add a MySQL database service, and add a volume to
your app service mounted at `/app/data` (this is where member uploads live;
`server/seeds/` in the repository is never touched at deploy time). Connect
the app service to MySQL so `DATABASE_URL` is filled in for you
automatically as a service reference; you do not type this one by hand.

## 3. Generate your environment variables

Run this from a working checkout of the repository (your Claude session can
clone it if it does not already have one):

```
node scripts/fork-init.mjs --village-name "Your Village Name" \
     --admin-email you@example.org --domain your-domain.example.org
```

Leave off `--domain` if you do not have one yet; you can fill `FRONTEND_URL`
in by hand once you do. This writes a local `.env` file and prints:

- Every value it generated for you (real random secrets; it never reuses one
  across villages).
- Your one-time bootstrap password, shown once. Save it now.
- A list of every variable it could not fill in, each with the one-line
  reason from `.env.example`. That list is not a failure. It is the rest of
  this walkthrough.

`.env` is for local development only and is never deployed. Copy every value
it printed into Railway, your app service, the Variables tab, by hand or
through the Railway CLI. Production reads variables from Railway directly.

### The one generated value that decides whether Admin can hold your keys

Two of the generated values are sealing keys, and neither can be recovered
once anything has been stored under it: `MEMBER_SECRETS_KEY` and
`VILLAGE_SECRETS_KEY`. Set each once here and leave it alone.

`VILLAGE_SECRETS_KEY` is the one to check before you reach step 4 or step 8.
It encrypts your own third-party keys where this platform stores them: your
Stripe secret key, your Stripe and Riverside webhook secrets, your Resend
key, your Anthropic key. Every later step that says "or from Admin,
Integrations" depends on it. With it unset, that panel refuses every save
with "this deployment has no village-secrets key", and each of those keys has
to be set in Railway instead. Clearing a key from the panel keeps working
either way, so a value you need to remove is never stuck.

**Self-host:** you generate it in this step and you hold it. A copy of your
database carries none of your integration keys in a usable form.

**ReGen-hosted:** ReGen Civics sets it in the Railway project they hold. Ask
them to confirm it is set before you try to save a key from the panel.
Whoever holds the Railway project holds this key, so on this path ReGen can
read the keys you store through it. What it buys you is that a database
backup on its own carries nothing usable. Self-host if your village needs to
hold the key itself.

## 4. Set up email

Create a Resend account (or use your existing one), then verify your sending
domain at resend.com/domains: Resend gives you the exact SPF and DKIM
records to add wherever your domain's DNS lives. This step waits on DNS
access, which is human-only (see above).

**The trap:** Resend accepts mail through an unverified domain and answers
HTTP 200 as if it worked. Nothing arrives. There is no error, no bounce, no
warning anywhere in this platform. Verify the domain before you trust that
any email, including your own founder claim link in the next step, is
actually being delivered.

Once verified, set `RESEND_API_KEY` and `EMAIL_FROM` in Railway.
`RESEND_API_KEY` can also be set from Admin, Integrations, after you have
logged in, which needs no Railway access; that route needs
`VILLAGE_SECRETS_KEY` from step 3 and refuses the save without it.
`EMAIL_FROM` is a Railway variable only.

## 5. Deploy and run migrations

Connect the GitHub repository to your Railway service if it is not
connected already (Railway builds with nixpacks from `pnpm run build` and
starts with `node dist/index.js`; see `railway.toml`). Once the first deploy
finishes, run the database migrations against it:

```
npx tsx scripts/run-migration.ts --all
```

Point this at your Railway MySQL's connection string (Railway shows it in
the MySQL service's Connect tab; use the public proxy URL if you are running
this from outside Railway's own network). Confirm with:

```
npx tsx scripts/run-migration.ts --status
```

Then check `https://<your-domain>/health` answers `ok` and its `build` field
carries a real git SHA. A build marker that never changes means the deploy
has not actually landed yet.

## 6. Create your founder account

With `ADMIN_PASSWORD` set in Railway (from step 3) and the deploy live, call
the one-time bootstrap route:

```
curl -X POST https://<your-domain>/api/admin/bootstrap \
  -H "Content-Type: application/json" \
  -d '{"password":"<the ADMIN_PASSWORD you generated>","email":"you@example.org","name":"Your Name"}'
```

The response carries a `claimUrl`. If `RESEND_API_KEY` and `EMAIL_FROM` are
both set and your sender domain is verified, an email with that same link is
on its way to you. If either is missing, or if the response's `emailed`
field reads `false`, open `claimUrl` yourself; the response's `emailNote`
field says exactly why nothing was sent. Either way, this password now
stops working: it authenticates exactly once, for this one call.

## 7. Make it yours

Log in with the password you just set, go to Admin, Make This Yours, and
work through the wizard: your village's name, tagline, currency name, main
site and events links; your pictures (logo, hero images); your dues and
budgets; your page copy; your map styling. Every field left blank inherits
the platform's own default rather than showing something wrong, so you can
do this in one sitting or spread it over a week.

This is the only place any of this gets set. Nothing in the repository, and
nothing this walkthrough has had you type into Railway, carries your
village's name or look.

## 8. Payments, if you are selling anything

Skip this section entirely if this village will not take card payments yet.

Create your own Stripe account (human-only, see above), then set
`STRIPE_SECRET_KEY` in Railway, or from Admin, Integrations if
`VILLAGE_SECRETS_KEY` is set (step 3). In your Stripe dashboard,
under Developers, Webhooks, create an endpoint at
`https://<your-domain>/api/webhooks/stripe` subscribed to
`checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`invoice.paid`, `charge.refunded` and `charge.dispute.created`, then set
`STRIPE_WEBHOOK_SECRET` to that endpoint's signing secret. All five events
matter: skipping `invoice.paid` means a subscription charges a member every
period and grants them nothing past the first one, and skipping
`checkout.session.async_payment_succeeded` means a delayed payment method
(bank debit, ACH) never confirms at all. Test with `stripe listen --forward-to`
before you tell anyone this is live.

## 9. Optional integrations

Everything else in `.env.example` past this point is optional, and the
platform tells you plainly when one is missing rather than failing
silently: the assistant hides without `ANTHROPIC_API_KEY`, the Hypha
governance surfaces hide without `hypha.org_url` (set from Admin, not an
environment variable), and so on. Add these when you actually want the
feature, not before. `docs/FORK_RUNBOOK.md`'s environment variable table has
the full reasoning for each one.

## 10. Confirm it actually works

Run the automated smoke test, which registers throwaway members and walks
the real product loop end to end:

```
node scripts/smoke-all-modules.mjs --base https://<your-domain> \
     --email you@example.org --password '<your real password now>'
```

Every line it prints should read as a pass. If your village publishes its
structure publicly (Admin, Org Chart, plus the `map` module), also check:

```
curl -s https://<your-domain>/.well-known/village.json | jq '.supports, .publicKey.kid'
```

## For developers testing locally

This walkthrough provisions a live instance; it does not cover running the
automated test suite. If you or a technical helper does run `pnpm test`
locally, know this first: without `TEST_DATABASE_URL` set in a local `.env`,
roughly a third of the suite (every database-backed test file) skips itself
and the run still exits 0, with nothing on screen calling that out except
the summary line's own skip count. A green `pnpm test` with that variable
unset is not a passing suite; it is an unrun third of one. Set it before
trusting any local test result, and read the actual pass and skip counts,
not just the exit code.

## Which version you are running, and how to hold still

The platform ships as numbered releases, each one a container image published
at `ghcr.io/rieki777/village-os`. The package is public, so a self-hosted
village can pull and run a named version with no account and no access token.

- `CHANGELOG.md` says what each release contains, in plain language. Its
  newest entry is the current release.
- `ops/RELEASES.md` covers the rest: the `:stable` and `:edge` channels, the
  `docker run` line for a self-hosted village, how to ask a running village
  which version it is, and how to pin a version so your village stays put
  while others move.

Deploying from the repository, as step 5 describes, keeps you on whatever is
newest. Naming a version in your deploy instead is what makes an instance
reproducible, and it is worth doing before you have members depending on it.

## Where each step's file lives

- `.env.example` names every variable this platform reads and what breaks
  without it.
- `scripts/fork-init.mjs` writes a filled-in `.env` for a new village.
- `docs/FORK_RUNBOOK.md` is the long-form reference this walkthrough was
  distilled from.
- `docs/FOUNDER_SETUP_PROMPT.md` is this same walkthrough, written for a
  founder to hand directly to their own Claude session.
- `CHANGELOG.md` is what shipped in each release, and which release is
  current.
- `ops/RELEASES.md` is how to pull a release, pin one, and read the version a
  running village reports.
