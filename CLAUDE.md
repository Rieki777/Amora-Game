# CLAUDE.md

**game-amora** is a white-label village-coordination platform: React 19 + Vite + wouter client
in `client/src`, one large Express server (`server/index.ts` + `server/lib/*`), MySQL with
hand-written SQL migrations in `drizzle/` that a custom runner applies **at boot, fail-loud**
(`server/db/migrate.ts`). Villages fork this repo; "Amora" is only the first tenant. Platform
code carries no village's brand — that rule is enforced mechanically (see Gates).

## Reading order

1. `docs/ARCHITECTURE.md` — the system map. Read it before touching anything.
2. `docs/modules/` — the contract for whichever module you are changing. Filenames do not
   follow module ids: map → `village-map.md`, exchange → `internal-exchange.md`, feed →
   `gratitude-feed.md`, library → `material-library.md`, health → `health-dashboard.md`,
   tools → `tools-hub.md`; some modules have no doc.
3. `docs/FORK_RUNBOOK.md` — provisioning, env vars, seeds. **Any session that adds an env var,
   seed, or provisioning step appends one line there, same session.**
4. `docs/FEEDBACK_HUB_CONTRACT.md` — only when touching the feedback relay.

`MODULES_MASTER_PLAN.md` Part 1 is known-stale; never trust it over code. The repo skill lives
in `.claude/skills/`.

## Gates — all five before calling anything done

```
pnpm check                          # tsc --noEmit
pnpm build                          # vite client + esbuild server -> dist/
pnpm test                           # vitest run — see loop-test rules first
node scripts/check-brand-refs.mjs   # brand ratchet
node scripts/check-voice.mjs        # house writing rules on shipped copy
```

The build marker is stamped from the git SHA by `scripts/build-server.mjs` — never hand-edit
it. Only `BUILD_LABEL` in `server/index.ts` is human-written; the SHA is appended at build
time so `/health` cannot report a build that isn't running.

## Loop-test rules

- `server/loop.e2e.test.ts` is the acceptance criterion for the whole product. It boots the
  **built** `dist/index.js` as a subprocess — run `pnpm build` first or you test stale code.
- It is **order-dependent**. Never filter with `vitest -t`; run whole files or the whole suite.
- DB-backed suites need `TEST_DATABASE_URL` in the local `.env` (the S5 harness in
  `server/db/testDb.ts` drops/recreates a scratch schema — never point it at the app schema).
  Without it they skip loudly rather than pass hollowly.
- Unit anchors: `server/ledger.test.ts`, `server/swap.test.ts`, `server/payments.test.ts`.

## Non-negotiable invariants

**Economy** (`server/lib/exchange.ts`, `server/lib/ledger.ts`):
- Fiat flows IN only; tokens are never sold for fiat. The exchange is BUY-ONLY.
- Recognition-kind tokens are never purchasable or swappable. Hypha-governed tokens never
  trade — read-only display.
- Faucet-issued tokens are never swappable. The test is destination-based: faucet →
  `sys:treasury` is stocking; faucet → anything else is issuance and taints the token.
- Caps fail closed: 0 means zero, never unlimited.
- Trading is per-deployment opt-in behind a version-stamped legal card; a stale ack
  (`legalAckVersion !== cardVersion`) closes swapping.

**Ledger** (`server/lib/ledger.ts`):
- Per token, SUM(balance) over all accounts ≡ 0. Boot invariants enforce this with a loud
  failure, not a comment.
- `token_balances` is a cache: **recompute, never increment**.
- Only faucet accounts go negative. Non-faucet exceptions exist only via
  `ALLOW_NEGATIVE_SOURCES` (`stay_night`, `payment_reversal`) with `allowNegative` set.
- All movement goes through `postTransfer` / `postTransferPair` (+ `PairGuard`). No raw
  ledger writes, ever.

**Modules & access**:
- Every NON-CORE module ships OFF (absent `module_settings` row = off); the four core modules
  (quests, gratitude, progression, profiles) are always public and cannot be disabled.
  Lifecycle is
  `off|preview|members|public` (`shared/modules.ts`); routes mount behind `requireModule()`
  (`server/lib/modules.ts`); missing dependencies demote a module to off at boot;
  `openStateCheck` refuses `off` while value is outstanding (settle first).
- ONE capability gate (`shared/capabilities.ts`): **admin → badgeDenies → role →
  badgeCapabilities → stage**. A badge deny beats role and stage; only admin outranks it.
  Never gate anywhere else.

## Five config planes — know which one before adding any knob

1. `shared/gameVariables.ts` — behaviour (how much, how often, which mode). DB stores
   **changed values only**; platform defaults inherit.
2. Brand overlay — identity (names, images, dues, personas) via the admin Setup Wizard →
   the `brand` database document in `app_config` (`dbDocument(getPool(), "brand", …)`,
   `server/index.ts`); the in-code identity home is `shared/gameConfig.ts`.
3. Module lifecycle + per-module config JSON — `module_settings` table.
4. `app_config` documents — keyed JSON (instance-identity, launch-state, email config…).
5. Integration secrets — `server/lib/secrets.ts` (S63): **write-only**, reads masked to
   last4, admin-typed value beats the env var.

## The spines

- Events: `recordEvent()` (`server/lib/events.ts`) is the ONE way into `health_events`.
- Notifications: `server/lib/notify.ts` — `dedupe_key` NOT NULL + unique index; one stable
  key per (event, recipient); a retried insert is a no-op.
- Scheduler: `registerJob()` (`server/lib/scheduler.ts`). Jobs never close gratitude
  cycles — settlement releases value and is a human act.
- Payments: `server/lib/payments.ts` — HMAC over the **raw** body, event-level dedupe on
  `stripe_event_id`, reversals are mechanical claw-backs via registered handlers.
- S62–S66: instance identity + `PLATFORM_VERSION` (`server/lib/identity.ts`; the
  `/api/platform/info` handshake), launch requirements as data
  (`shared/launchRequirements.ts`, checks in `server/lib/launch.ts` by `checkKey`),
  feedback relay (`server/lib/feedback.ts` — captured locally always, relays content only,
  queue-and-forget; the hub is a listener, not a dependency).

## House traps — each one cost a real session

- **Migration SQL**: the runner splits statements on line-final `;`
  (`splitStatements`, `server/db/migrate.ts`). A `--` comment ending in `;` once cut a
  statement in half (migration 0015). Comment lines are now stripped first, but keep `--`
  comments on their own lines and never end one with `;`.
- **A shipped migration file is never edited.** A part-applied file resumes at its
  recorded statement offset (`_migrations_partial`) instead of replaying DDL, so editing
  one that has run anywhere resumes at the wrong place. Fix forward with a new file.
- **PowerShell**: `Set-Content -Encoding utf8` double-encodes non-ASCII. Write files with
  the Write/Edit tools, never shell redirection.
- **MySQL UNIQUE indexes exempt NULLs** — a nullable column in a unique key admits infinite
  duplicates. Dedupe columns must be NOT NULL.
- **BigInt literals** (`123n`) break the build target. Use `BigInt("...")`.
- **`vitest -t`** breaks the order-dependent loop test. Run whole files.
- **A copy change can break a test by capitalization alone.** Assertions use `toContain`
  on a phrase; turning an em-dash into a period capitalizes the next word and the match
  dies. Grep test files CASE-SENSITIVELY before editing any string, and reach for a colon
  or a comma when the asserted phrase would otherwise start a new sentence.

## House voice

`scripts/check-voice.mjs` holds shipped language to the writing rules in
`second-brain/90 Voice Profile/Rye Voice Profile.md`: no em-dashes or en-dashes (hyphens are
fine), no contrast framing (`not X but Y`, `rather than`), no AI filler vocabulary, no
rhetorical-question openers used as filler, no passive inspiration.

It parses every file with the TypeScript compiler and reads ONLY real copy: JSX text and
string or template literals. Comments, identifiers, imports and className soup are invisible
to it, which is why it can be a hard gate instead of a warning. Attribute and property names
that carry machinery rather than prose (`className`, `href`, `slug`, `icon`, and the rest of
`NON_COPY_KEYS`) are skipped, and tests are exempt. `--json` emits a worklist.

A genuine false positive takes an inline `voice-ok: <reason>`; waivers are counted and
printed so they stay honest. New copy is born clean.

## White-label discipline

`scripts/check-brand-refs.mjs` (S56) has three zones: a RATCHET (`server/index.ts`, `client/`,
`drizzle/`, `vitest.config.ts`, `scripts/`, plus every `*.test.ts(x)` file — baseline-capped
against `scripts/brand-refs-baseline.json`, counts may only ever decrease), DECLARED HOMES
(exempt: `gameConfig.ts`, `server/seeds/`, `docs/`, markdown), and HARD-CLEAN — everything
else, where any brand hit fails. A genuine false positive takes an inline
`brand-ok: <reason>`. New code is born clean, everywhere.
