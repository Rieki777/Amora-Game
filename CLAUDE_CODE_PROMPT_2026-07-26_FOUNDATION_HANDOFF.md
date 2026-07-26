# Handoff: Amora foundation, what shipped and what is left

**From:** the session of 2026-07-26 that built the loop test, roles, lunar cycles, the
variables layer, the ledger, and the repository cutover.
**To:** the session continuing the build.
**Read first:** `AMORA_FOUNDATION_UPGRADE_PLAN.md` (revisions 2 and 3 hold the locked
decisions and the port audit). This document is the delta plus the traps.

---

## 1. What this project actually is

Not "improve Amora." `CUSTOM_GAMES_MASTER_PLAN.md` in regen-civics defines
`Custom-Game-Foundation` as *"a copy of game-amora with B1 + B2 applied"*, with Amora
as downstream consumer #1. That repo does not exist yet, **so this work IS the
extraction.** Everything built here is what a $20,000 custom game inherits.

Practical consequence, and the thing most easily forgotten: **no village's brand may
live in platform code.** Names, currencies, categories and copy come from
`shared/gameConfig.ts` (identity) and `shared/gameVariables.ts` (behaviour). If you
find yourself typing "Amora" or "Gratitude" anywhere else, that is a bug.

---

## 2. Shipped this session (all live on production)

| Commit | What |
|---|---|
| `8c7a42f` | The loop test, and `DATA_DIR` made overridable so the server is testable at all |
| `53ed4f3` | Consent may only follow a submission |
| `8b98151` | Lunar cycles, cycle close, roles as data, real stage gates |
| `ae2a58e` | Variables layer, stage events, quest reward ranges |
| `10d9b5d` | Token ledger; `hearts_balance` becomes `recognition_balance` |
| `35c96e4` | Members behind a repository |
| `3b7d981` | Every domain behind a repository, zero direct file access |
| `2ec9099` `88319b2` `bd46e6a` `e9d073e` | Plan revisions 2 and 3 |

Migrations `0001` through `0006` are applied to the live MySQL. **53 tests across 4
files**, 0 type errors.

### The pieces and why they are shaped that way

**`server/loop.e2e.test.ts` is the acceptance criterion for the product**, not a unit
test. It boots `dist/index.js` against a throwaway `DATA_DIR` and walks the whole loop:
register, declare a path, claim, submit, refuse-unsubmitted-consent, admin consent,
Gratitude lands, send to a peer, wall, pulse, progression, guard rails. **If a change
breaks this, the change is wrong, whatever the unit tests say.**

**`shared/lunar.ts` is a VERBATIM port** of regen-civics `shared/lunar.ts`. Do not
"improve" the constants. Both products distribute on lunar cycles and the cycle number
is a natural key in distribution records; if the two disagree by even a few hours they
silently disagree about which lunation an acknowledgment belongs to. Note regen also
has a **dead** `server/lib/lunar.ts` with a different epoch (2025-01-29) that is
6.79 hours off. Never port that one.

**`shared/gameVariables.ts` + `server/lib/variables.ts` is the customization
foundation.** Fifteen tunables with types, bounds, plain-language descriptions and
validation, at `GET/PUT /api/admin/variables` and `GET /api/game/rules`. Two deliberate
differences from regen's `game_variables`, which the port audit told us to refuse:
regen's **fails soft** (a missing key silently becomes a code default, so a typo yields
a plausible economy with no error) and has five duplicated readers. Ours **throws on an
unknown key**, has one reader, and stores only CHANGED values so platform defaults stay
inheritable rather than frozen at launch day.

**`server/lib/ledger.ts` is the single writer of value.** Two disciplines, both
non-negotiable: **recompute, never increment** (the balance column is a cache of
SUM(entries), so it is self-healing) and **every write carries an idempotency key** (a
retry credits once because the write fails, not because a flag was checked; a flag can
be lost while the money stays). It **refuses** to credit hypha-governed tokens: if this
platform could mint equity it would quietly become the source of truth for the cap
table, which decision 5 says it must never be.

**`server/repos/*` is the storage seam.** `readJson(X_FILE)` / `writeJson(X_FILE)`
appears **zero times** in `server/index.ts`, down from 160. `usersRepo` is bespoke
because member records are the contended ones; `collectionRepo` and `documentRepo`
cover the other 23 domains generically. Each document repo carries its REAL default, so
a missing file yields a working document.

---

## 3. The traps. Read this section twice.

These cost real time to find. Most are invisible until they bite.

### 3.1 Amora pays at SEND. ReGen pays at CLOSE. Never run both.

The single highest-risk collision in the whole port. Amora's gratitude send credits the
recipient immediately. ReGen's ADR-30 is the opposite: sending mints nothing and
recipients are paid pro-rata at cycle close from a fixed pool. **Adding the pool on top
of the existing send-time credit pays every acknowledgment twice** and the fixed pool
stops being fixed.

Resolved deliberately: Amora keeps pay-at-send, and `gratitude_cycles` +
`gratitude_distributions` are a **settlement audit** of each lunation. **Cycle close
credits nobody.** The obvious way to "finish the port" is to add a distribution. Do not.

### 3.2 A green test suite is not evidence about the code you changed

I broke five journey endpoints with a regex and **all 53 tests still passed**, because
no test covers journey state. Coverage is not the same as relevance. Before trusting
green, ask: *does anything actually exercise the lines I touched?* If not, drive them by
hand.

### 3.3 Tests that pass for the wrong reason

My e2e "retry a consent" test passed because the **status guard** refuses an
already-consented claim, so the request never reached the ledger. It proved defence in
depth, not idempotency. The real property lives in `server/ledger.test.ts` where the
same key really is used twice. **When you assert a refusal, check which guard fired.**

A blunter version: I once "verified" forged-token rejection using `$UID`, which is
**readonly in bash**, so the test silently used a nonexistent user id and would have
passed no matter what. Always include a control case that must SUCCEED.

### 3.4 Verifying a behaviour-preserving refactor by behaviour is impossible

After the repository cutover I probed production and it worked on the first try, which
proved nothing: the refactor is behaviour-preserving by design. If you need deploy-level
proof, bump the `/health` build marker first.

### 3.5 Row counts prove nothing about column fidelity

The importer verified only counts and passed while every one of the fourteen quests had
its reward stored as **0**. `quests.gratitude` is a RANGE string like `"50-100"`, not a
number, and `0001` declared it `int`. The importer now compares actual values. When you
add a domain to the importer, add its column checks too.

### 3.6 Quest rewards are ranges, parsed in exactly one place

`shared/questRewards.ts`. It accepts en dash, em dash, hyphen, "to", and bare numbers,
and reports invalid input rather than guessing zero. The client previously did
`parseInt(q.gratitude.split("–")[1])` in two places, splitting on an en dash
specifically, so a plain hyphen produced `NaN` in the UI.

### 3.7 Regex over nested braces will eat your closing brace

`readJson(JOURNEY_FILE) ?? { ... }` left fragments like `journeyRepo.get(), copy: {} };`
in five places. Use exact string replacements for anything with brace structure.

### 3.8 My own crawler produced four false "bugs"

Every one would have been a wrong fix:
- Two "thin pages" were password gates working correctly.
- `400 /api/journey/checkbox` is a **deliberate auth probe** (it sends `state: 99`; 400
  means the password passed). "Fixing" it breaks login.
- 4px horizontal overflow on two pages came from **off-screen scroll-reveal elements**
  sitting at their pre-animation `translateX(20px)`. `canScrollX` is 0, so no user can
  scroll horizontally. Not a defect.
- `/admin` "did not unlock" because my script clicked an empty button instead of
  "Enter".

**Before fixing anything a tool reports, confirm a user can actually experience it.**

### 3.9 Infrastructure gotchas

- **Pushing `main` deploys to production.** Push a `claude/*` branch to land work
  without deploying.
- **Another session edits this tree concurrently.** Never stage a shared file wholesale;
  assemble commits from a worktree cut off fresh `origin/main` and re-apply only your
  own edits.
- A fresh worktree has no `node_modules`: run `pnpm install --frozen-lockfile
  --prefer-offline`. **Do not junction `node_modules` from the main repo and then
  `rm -rf` it**; that can delete through the link into the real dependency tree.
- Use `py`, not `python3`, on this machine.
- Railway's `volume delete` and `add --database` need interactivity or a 2FA code and
  will report success while doing nothing. Verify, do not trust the exit code.
- `mysql2` pool must be `timezone: 'Z'`. `GAME_CONFIG.season.timezone` is
  `America/Costa_Rica` (UTC-6) and someone will helpfully point the pool at it, shifting
  every lunar boundary six hours.
- Ids are `varchar(64)` strings, not INT, so composite idempotency keys run long. The
  ledger's key column is 160 for that reason.

---

## 4. What is left, in dependency order

### 4.0 BLOCKING everything money-touching: admins are not real users

`0003` added `users.role`, `users.handle`, `users.wallet_address` and
`wallet_verified_at`, **but nothing uses them.** Admin auth is still a single shared
password compared with `secretEquals`. Consequences:

- Every audit row has nobody to name. `actorUserId` is unwritable.
- `docs/modules/CRITIQUE-architecture.md` flags this as **CRITICAL** for the module
  layer: "All money-touching admin surfaces (exchange, stays, library, registry mint)
  vs shared admin password."
- The forum needs `handle` or @mentions leak member email addresses.
- Equity must never display against an unverified wallet binding; `wallet_verified_at`
  exists to record a signed message and nothing writes it.

**Do this first.** It is cheap now and blocks correctness later.

### 4.1 The roles feature has no admin UI (my unfinished work)

`/api/admin/roles/:id/holders` works and is tested, but admin's "Roles" section is page
*copy*, not holder management. **A founder cannot appoint anyone to a role without
curl.** I shipped the mechanism and called it done; the surface is missing. Same for the
variables editor: it is reachable via the Command Centre's "Variables" tab on
`/journey-to-launch`, but not from `/admin`.

### 4.2 Async conversion, per domain

The repos are deliberately synchronous. MySQL is async, and converting cascades through
every sync helper (`computeStage`, `gratitudeBudget`, `userCan`) and every route. Do it
**one domain at a time behind the existing interface**, with the loop test as the gate.
Do not attempt it in the same change as anything else.

### 4.3 Split `server/index.ts`

Roughly 3,000 lines and 80+ routes. Split it during 4.2, not after.

### 4.4 Then, in this order

1. **Profiles** (progression, contributions, flows, balances). The endpoints exist:
   `/api/game/progression`, `/api/game/gratitude/flows`, `/api/game/ledger`. The page
   does not.
2. **Notification spine.** Prerequisite for the forum AND for role-targeted messaging.
   `activity` is free text with no actor or entity refs; it is not a notification system.
3. **Forum with the decision primitive.** Revision 2 supersedes revision 1's "minimal
   forum": without a decision primitive the product cannot demonstrate governance, which
   is a third of the sales pitch. Write fresh using regen as reference; its `forum.ts` is
   fused to bioregions, nine capitals and thread chains.
4. **Economics section** reading Base for Amora and Voice. **Equity decimals are a
   cap-table problem, not a rounding problem**: read `decimals()`, store fixed point, and
   return null on RPC failure rather than persisting a zero.
5. **Founder and investor command centre.** Note a Command Centre already exists at
   `/journey-to-launch` with Urgent / In Motion / Completed and a Variables tab. Extend
   it rather than building a second one.
6. **Automation**: recordings to forum to role-targeted work. Framed correctly this is
   *"your weekly call becomes assigned work"*, not content distribution. Copy the
   evidence rule: every extracted task needs a verbatim quote and timestamp or it is
   dropped.
7. **Extract `Custom-Game-Foundation`.**

### 4.5 The Village OS module layer

`docs/modules/` holds a framework plus eleven module specs and two critiques, authored
by the parallel session. **Read `CRITIQUE-architecture.md` and `CRITIQUE-economy.md`
before building any of it.** They flag CRITICAL issues in ledger consistency,
cross-module value laundering between Material Library and Internal Exchange, and the
shared-admin-password problem in 4.0. The token registry (`0006`) is the first piece and
is already applied live.

---

## 5. State of the tree right now

`main` is clean and everything above is pushed. The parallel session has uncommitted
work in: `scripts/import-json-to-mysql.ts`, `server/db/schema.ts`,
`server/ledger.test.ts`, `server/lib/ledger.ts`, and `drizzle/0006_token_registry.sql`.
It extends the ledger with a **runtime token registry** replacing my closed enum, and
they were right to: a module layer that creates tokens at runtime would force a widening
migration per module. Coordinate rather than clobber.

Production: healthy, cycle 328, 14 quests, zero test data left behind. Backup of the
live volume at `Desktop/Amora/backups/amora-data-2026-07-26_000010.tar.gz`, and
`scripts/import-json-to-mysql.ts --dir <path>` can replay from it.

**Still needs a human:** two orphaned MySQL volumes, left over from my error retrying
`railway add`. **924MB each, roughly 1.85GB of billed storage between them.**

```
mysql-volume-PSJY   76ddbb9a-b771-437b-a9f1-25012b822348
mysql-volume-Jin7   c02d4ced-281f-46ac-9aa6-b62162728cad
```

**Why they are invisible, diagnosed.** `railway volume list --json` shows
`serviceName: null` for exactly these two, and non-null for the two live volumes. The
Railway dashboard canvas and Railway's own AI agent both enumerate volumes by walking
SERVICES, so a volume whose service was deleted is unreachable through that path: it
does not render on the canvas, and the agent searching by name reports "I don't see
mysql-volume-PSJY". It is not a caching bug and they are not in another environment.
Proof: the agent found `mysql-volume` with id `0b2bb3ae-2963-402e-aace-12aba26a1381`,
which matches the CLI exactly, so both tools are looking at the same project and
environment. The CLI queries volumes at the project level, which is why only it sees
all four.

**Do not trust `railway volume delete`.** It prints `Volume "..." deleted` and exits 0
while deleting nothing, verified four times across two sessions.

**How to actually remove them,** cheapest first:

1. Give Railway's own agent the volume IDs above rather than the names. It failed only
   because name search walks services; acting on an id should bypass that.
2. `railway volume attach -v 76ddbb9a-... ` to bind an orphan to a service so it becomes
   visible, then delete it from that service's UI. **Never attach one to MySQL or Amora
   Game**: their mount paths (`/var/lib/mysql`, `/app/data`) would collide with live
   data. Use a throwaway service.
3. The GraphQL API (`backboard.railway.com/graphql/v2`) with a real Railway API token.
   The CLI's stored `user.token` is NOT one; every auth variant returns 403.

Low urgency: they are inert and cost a few dollars a month. Worth clearing because they
exist only as an artifact of my mistake.

---

## 6. The definition of done

Not coverage. One end-to-end run, extending `server/loop.e2e.test.ts`:

register, declare a path, claim, submit, consent, Gratitude lands, send to a peer, cycle
closes, a stage advances **and unlocks a capability that was refused earlier in the same
run**, a role-targeted notification reaches one member and not another, and the
economics endpoint returns balances while returning last-known-with-staleness (never a
zero) when the RPC is stubbed to fail.

Every assertion in that list is a feature above. When it passes, the foundation is real.
