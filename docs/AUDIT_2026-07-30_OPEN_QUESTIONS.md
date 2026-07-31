# Open questions from the audit execution session (2026-07-31)

> **STATUS: ANSWERED.** Rye answered all thirteen the same day; the decisions
> and what was done with each are recorded inline below, marked **DECIDED**.
> The one question still genuinely open is Q1 (the contrast work), parked by
> Rye's own choice until the post-Amora fork-foundation work.

Batches B1–B18 landed on branch `audit-2026-07-30-batches-b1-b18`
(commit `da6d0d0`). What follows is everything that was **deliberately not
decided**, plus the settings that were made tunable and the ones that are
still literals in code and might not want to be.

## Decisions log (Rye, 2026-07-31)

| # | Decision | Done |
|---|---|---|
| 1 | **Parked.** Contrast work waits for the post-Amora fork/palette work. | Nothing shipped; still `text-white/70` etc. |
| 2 | **Ship it.** Overlay carries Amora; play.amora.cr SEO loss accepted (the game lives at amora.regencivics.earth). | Shipped: neutral `client/index.html`, config-driven shell, Amora defaults in `gameConfig.ts`. |
| 3 | **Confirmed** — forks never carry Amora elements. | Logo / tab icon / site URLs / footer copy now Setup-Wizard fields; `AmoraLogo.tsx` deleted. |
| 4 | `quest.allow_zero_consent` stays default off. | No change. |
| 5 | Login per-account cap 10/15min is comfortable. | No change. |
| 6 | Set-password TTL stays 60 min in code. | No change. |
| 7 | Session length → tunable. | `auth.session_days` (default 30), read at validation time. |
| 8 | Email cap → tunable. | `notify.daily_email_cap` (default 20). |
| 9 | **Confirmed** — three failed boots stop the deployment. | Already shipped in B1. |
| 10 | Solo-founder self-consent window. | `quest.self_consent_until_members` (default 6): an ADMIN may self-consent while the village has fewer members than this; each use leaves an audit row. Stewards never may. |
| 11 | Say "sign out everywhere". | Header + drawer copy renamed. |
| 12 | In-flight claim links dying on deploy: accepted. | — |
| 13 | Badge kind change → warn-and-proceed. | 409 names the stakes; a retry with `confirmKindChange: true` proceeds, with an audit row. (No admin UI edits kind today, so the contract is API-level.) |

Also shipped on the same answers: the **Riverside setup card** on the Calls
admin tab (the webhook URL to paste into Riverside, copy button, header name,
secret state — plus `riversideWebhookUrl` in the integrations payload).

The house rule for this list: anything a village could reasonably want
different belongs in Admin, not in a constant. Where that was obviously true
it was done and is listed under "Now tunable". Where it needs Rye's judgement
it is a question below.

---

## 1. Deferred: needs brand sign-off before it can ship

### 1.1 The contrast half of B14
**Not done.** The nav, mobile drawer and footer use `text-white/50|60|70` on
`--color-teal-deep` (#157f7d), which fails WCAG AA; only solid white clears it
(4.81:1). The two auth pages use an amber accent at 1.60:1.

Fixing means the nav and footer lose their intentional visual hierarchy (every
link reads at equal weight, with `hover:underline` replacing the contrast
signal), and `/login` and `/register` lose their only amber accent and read
all-teal.

**Question 1.** Accept the flattened hierarchy, or design a replacement
de-emphasis that is not built on opacity (a smaller weight, a different
surface)? Note that solid white clears AA by only 0.31, so `--color-teal-deep`
becomes effectively frozen — a fork with a lighter primary re-breaks it. If
the palette is going to move anyway, this should wait for that work.

### 1.2 The logo and document-head half of B12
**Not done.** `client/index.html` hardcodes a favicon and apple-touch icon
pointing at `https://amora.cr/wp-content/...`, so **every deployment of the
platform fetches its tab icon from Amora's WordPress host**, plus a canonical
link and a JSON-LD Organization block a platform cannot know. `Layout.tsx`
hardcodes the logo, tagline, copyright name and five outbound links.

This is four coupled changes that must land together or tenant one visibly
breaks: neutral asset files committed, Amora's own overlay seeded with its
current asset paths and amora.cr URLs, a reserved placeholder box for the
now-async logo (or every page shifts on first paint — a CLS regression on the
most-seen surface), and the brand baseline re-derived.

**Question 2.** Ship it as one change with Amora's overlay seeded in the same
commit? And is Amora's team content to lose the canonical SEO signal for
play.amora.cr until its own fork re-adds it?

**Question 3.** Should `project.siteUrl`, `images.logo` and `images.heartLogo`
be part of the Setup Wizard's first screen (so a fork cannot go live still
wearing Amora's mark), or optional fields further in?

---

## 2. Now tunable from Admin (new game variables)

All six ship at the value that was previously hardcoded or that preserves
current behaviour, so no existing village changes on deploy.

| Variable | Default | What it governs |
|---|---|---|
| `abuse.register_per_ip_hourly` | 30 | Registrations per IP per hour. Also bounds email-enumeration probing. |
| `abuse.login_ip_per_quarter_hour` | 30 | **Failed** sign-ins per IP per 15 min. Successes never count. |
| `abuse.login_account_per_quarter_hour` | 10 | **Failed** sign-ins per ACCOUNT per 15 min — the bound an IP pool cannot dodge. |
| `abuse.password_reset_per_ip_hourly` | 10 | Reset requests per IP per hour. |
| `abuse.investor_docs_per_ip_hourly` | 3 | Investor-packet requests per IP per hour. |
| `quest.allow_zero_consent` | off | Whether a claim may be consented at 0 ("acknowledged, no recognition"). |

**Question 4.** `quest.allow_zero_consent` defaults to OFF, which means any
village currently consenting at 0 to mean "acknowledged" starts getting a 400.
The plan flagged this as needing confirmation that no village does that.
Confirm — and if Amora does, flip the default to on for that deployment
rather than platform-wide.

**Question 5.** The per-account login bucket is a targeted-DoS surface by
construction: anyone who knows an address can fail against it ten times and
lock that member out for fifteen minutes. 10/15min is the plan's number.
Comfortable, or raise it?

---

## 3. Still literals in code — should any become admin variables?

Each of these is currently a constant. None is obviously wrong, but a
"remixable" platform may want them tunable. Recommendation given for each.

| Constant | Value | Where | Recommendation |
|---|---|---|---|
| `ORDER_EXPIRY_FLOOR_HOURS` | 25h | `server/lib/exchange.ts` | **Keep in code.** A Stripe Checkout session stays payable ~24h; a village that lowered this would cancel orders while members are still on the payment page. The plan says the same. |
| `SET_PASSWORD_TTL_MS` | 60 min | `server/index.ts` | **Question 6.** A village where email is slow may want longer. Low risk either way (tokens are single-use now). |
| `TOKEN_TTL_MS` | 30 days | `server/index.ts` | **Question 7.** Session length is a real security/UX tradeoff and villages differ. Making it tunable is easy; note it only takes effect for tokens minted after the change. |
| `DAILY_EMAIL_CAP` | 20/24h | `server/lib/notify.ts` | **Question 8.** Probably should be tunable — a large village hits this sooner than a small one. |
| `WEBHOOK_MAX_PER_MIN` | 300 | `server/index.ts` | Keep in code. Operational, not a village choice. |
| `CLAIM_GRACE_MINUTES` | 10 | `server/lib/payments.ts` | Keep in code. Settlement-correctness timing. |
| `MAX_MAIN_JS_KB` | 1400 | CI | Keep in code. Now far under it (358 KB gzipped on the wire). |

---

## 4. Decisions taken this session that Rye should confirm

These were flagged in the fix plan as Rye's calls. Each was implemented the
way the plan described; each is reversible.

**Question 9 — B1, boot semantics.** A failed boot now exits 1 within 2
seconds, so Railway's `restartPolicyMaxRetries = 3` applies and **three bad
boots stop the deployment** instead of leaving a half-up container. That is a
visible outage in place of a silent zombie that could still move money.
Intended, but operator-visible. Confirm.

**Question 10 — self-consent, including for admins.** No one may consent to
their own quest claim, admins and founders included. A single-admin village
therefore cannot claim-and-consent its own work at all. That is the point (it
mints recognition), but it is a real constraint on a very small village.
Confirm, or exempt admins?

**Question 11 — logout is global.** `tokenVersion` is the only revocation
lever there is, so signing out on one device signs the member out everywhere,
and so does setting a new password. The alternative is a sessions table.
Confirm the semantics, and whether the UI should say "sign out everywhere"
plainly.

**Question 12 — in-flight claim links died on deploy.** Set-password tokens
now carry a password fingerprint, so any claim link minted before this deploy
is refused. Recovery is re-running break-glass bootstrap. If anyone is
mid-claim right now, tell them before merging.

**Question 13 — badge reclassification is blocked.** Changing a badge's
`kind` while awards exist now 409s; stewards must revoke the awards first or
create a new badge. Confirm that is the behaviour you want on the admin
screen rather than a warning-and-proceed.

---

## 5. Where the plan was wrong (corrected in the code)

- **B8 named a column that does not exist.** The plan says to skip commerce
  rows "with a `fiat_charges` entry for `<id>#%`" via a `period_key` column.
  `fiat_charges` has no such column; it keys on `(module, order_id)`, and
  commerce writes `order_id = '<purchaseId>#<periodKey>'`. The reaper matches
  on `module = 'commerce' AND order_id LIKE '<id>#%'`.

- **B10's design would have replayed the whole schema history.** The plan says
  to add `statements_done` to `_migrations_applied` and treat a file as
  complete only at `parts.length`. Every existing row would take the column's
  default of 0, so on the next boot every already-applied migration would read
  as zero-of-N done and re-run its DDL against a populated database. Shipped
  instead as a separate `_migrations_partial` table, which leaves the
  completion ledger's meaning ("a row means done") untouched and needs no
  backfill.

- **B5's `/api/roles` client note was already handled.** The plan says to add
  `authHeaders(password)` to four `Admin.tsx` fetches; all four already had
  them from the B5 commit.

---

## 6. New findings, not in the audit

- **Nested anchors put an empty focusable link at the top of every page.**
  `<Link href="/"><a>…</a></Link>` — wouter's `Link` already renders the
  anchor, so the browser closes the outer one early and leaves an unnamed
  empty link as the FIRST tab stop on every page in the app. Fixed in
  `Layout.tsx` (logo, profile, sign-in). **Nine more remain** in
  `Circles.tsx`, `CoCreatorsGuide.tsx` (×2), `GoodNeighbor.tsx`,
  `HowWeCreate.tsx`, `ProposeQuest.tsx` (×2) and `Quests.tsx` (×2). Left for
  a deliberate pass rather than swept in alongside everything else.

- **The sign-out button was labelled only by `title`.** That is the documented
  house trap (a phone has no hover). Given a real `aria-label`.

- **`applyAcceptReward` returned success without crediting.** Not new, but
  worth naming: the failure path now returns false and logs, so a failed
  ledger post can no longer be reported to the admin as an accepted proposal.
