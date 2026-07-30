All paths below are relative to `R = C:/Users/taren/Desktop/Amora/game-amora`.

The 72 contain 8 duplicate pairs (library.ts:308 ×2, index.ts:1883 ×2, /api/roles ×2, /api/network/published ×2, pool.ts:32 ×2, Quests.tsx:200 ×2, no-password-recovery ×2, plus two pairs that share a location but not a fix: VillageMap.tsx:305, ModuleProvider.tsx). Real distinct edits: **64**, in **15 batches**.

**Standing rule for the sitting:** `server/index.ts` takes ~30 edits. Apply every edit to a given file in **descending line order** so earlier edits never move later anchors. Rebuild (`dist/index.js`) before any loop e2e run; never filter it with `-t`.

---

## B1 — Boot must never half-start (own gate run, first)
Root cause: `startServer()` rejection is caught and discarded while the scheduler timer is already armed.

| file | line | edit |
|---|---|---|
| server/index.ts | 10212 | `startServer().catch(e => { console.error("[startup] refusing to serve:", e); setTimeout(() => process.exit(1), 2000).unref(); })` |
| server/index.ts | 2286 | move `startScheduler(getPool())` to immediately before `server.listen` (10207) |

Gate: own run. Verify a deliberately failing boot exits 1 within 2s (< scheduler's 15s first tick) and that Railway's `restartPolicyMaxRetries = 3` is the accepted new failure mode.
**Decision:** operator-visible change — three bad boots now stop the deployment instead of leaving a zombie. Intended; confirm with Rye.

## B2 — Library escrow: no orphan loans, no unclearable boot refusal (own gate run)
Root cause: loan row commits in one transaction, escrow leg in another, with compensation only on the `!r.ok` path.

| file | line | edit |
|---|---|---|
| server/lib/library.ts | 308–327 | wrap in try/catch running the same compensating DELETE loan / item→`available` as 323–324, then **rethrow** |
| server/lib/library.ts | 414 (settleLoan) | `const deposited = await ledgerEntryExists(pool, \`loan:${input.loanId}:escrow\`)`; use `deposited ? loan.escrowCredits : 0` as the ceiling for fee and release |
| server/lib/library.ts | 538 (assertLibraryInvariants) | before the assert: for each unsettled live loan with `escrow_credits>0` whose exact escrow key is absent → `status='cancelled', escrow_credits=0, settled_at=NOW()`, item→`available`, `console.error` + `recordEvent` |

**Decisions:** (a) the repair cancels a member's reservation and reshelves the item — must be loud (event + admin notify), never silent; (b) `ledgerEntryExists` must be exact-key, not LIKE, or a genuinely drained escrow gets normalised away — that is the one thing library.ts:20-22 forbids; (c) a settle now releases 0 where it used to release N — member-visible number change inside the "re-settle only repairs" invariant.
No migration.

## B3 — Whole-table rewrites lose writes (lands with B2's gate run)
Root cause: `all()` snapshot → mutate → `replaceAll()` across awaits; the second concurrent handler deletes the first's row.

| file | line | edit |
|---|---|---|
server/index.ts | 1303 | `stageEventsRepo.insert(event)`; delete the `.all()` read at 1283 and the `.slice(-2000)` cap |
server/index.ts | 2933, 2943, 2944 | replace all three with one `await submissionsRepo.insert(entry)` |
server/index.ts | 9945–9971 | module-level promise chain around snapshot→mutate→`replaceAll` only; move `addActivity` (9956) and `notify` (9957) **after** the write, capturing the dedupeKey id before handing the array over |
server/index.ts | 1757–1758 | same lock wrapper (second role_holders writer) |

Note: stage_events stops discarding progression history past 2000 rows — that is the harm being fixed. The remaining `replaceAll` sites on submissions (1678, 1755, 3009, 3030, 8735) still race each other; do **not** record the table as race-free.

## B4 — Cached balances written without a ledger post (own gate run — economy)
Root cause: `recognitionBalance` assigned from something other than a successful `postTransfer`.

| file | line | edit |
|---|---|---|
server/index.ts | 1874–1883 | `applyAcceptReward`: when `amount > 0`, `postTransfer(RECOGNITION_FAUCET → memberAccount(match.id), source:"proposal_accepted", idempotencyKey:\`proposal_accepted:${entry.id}\`)`; return false if `!credit.ok`; line 1883 becomes `u.recognitionBalance = credit.toBalance`. Keep the contribution row unconditional |
server/index.ts | 9273 | quest consent: 400 when `granted <= 0` before anything is written |
server/index.ts | 9323 | wrap the cache write in `if (credit.ok)`; otherwise log and return an error, not 200 |
server/lib/library.ts | 562 | `supplyVsBacking`: `outstanding = shelfBacked + max(0, -balanceOf(MINT_FAUCET, LIBRARY_CREDIT) - balanceOf(TREASURY, LIBRARY_CREDIT))`; return `shelfBacked`/`sold` as extra fields |
server/lib/exchange.ts | 646 | `swappableBalance`: add `token_ledger` rows with `to_account = memberAccount(user)`, `source='product_grant'`, `at > NOW() - INTERVAL ? DAY` to `held`, and fold their `MAX(at)` into `clearsAt`. Keep the `Pool | PoolConnection` signature |
server/index.ts | 9556–9594 + server/repos/gratitude.ts:162-164 | cycle close: persist the whole split first, post from the persisted `credited`; drop `credited`/`received*`/`distinct_senders` from the ON DUPLICATE UPDATE list so a retry converges instead of re-splitting |

**Decisions (all four are member-visible):**
- Members credited by the buggy accept path lose the phantom amount at the next recompute.
- Card token-pack buyers start hitting `RECENT_PURCHASE_HOLD` for 45 days; a monthly token subscription becomes permanently partly held.
- Villages that already opened L9 and sold credits flip the admin backing panel red on unchanged data.
- Consenting a quest at 0 stops being possible (400). Confirm no village uses that as "acknowledged, no recognition".
- Cycle close: rows now exist for an unclosed cycle — either write them in the same step that marks it closed, or add the `closed` filter to `server/lib/badges.ts:286`'s `MAX(distinct_senders)` query. Non-optional.

## B5 — Unauthenticated reads leak member identity and content (lands together, one gate run)
Root cause: handlers bound `_req` and were never gated; preview/members lifecycles tested with `!== "off"` instead of a rank test.

| file | line | edit |
|---|---|---|
server/index.ts | 9437 | gratitude wall: `log.filter(g => g.kind !== "heart").slice(-60)` — filter **before** slice |
server/index.ts | 3764 | pulse text: for `kind === 'post'` emit `\`${firstName(user.name)} posted in the feed\``; keep actorUserId/entityType/entityRef |
server/index.ts | 6916 | `/api/badges/match`: require admin OR `hasCapability("quest.consent", await capabilityCtx(viewer))`; 401 anon / 403 member; line 6934 emits `firstName(r.name)` |
server/index.ts | 9869, 9882 | `/api/roles`: take `req`; `holders: viewPeople ? [...] : []` where `viewPeople = isAdmin \|\| hasCapability("map.viewPeople", ctx)`; add additive `holderCount`. **Also** add `headers: authHeaders(password)` to client/src/pages/Admin.tsx:2701, 2989, 3172, 4813 or the admin role panels render every seat vacant |
server/index.ts | 5059 | `/api/platform/info`: filter `m.core \|\| LIFECYCLE_RANK[effectiveLifecycle(m.id)] >= LIFECYCLE_RANK.members` |
server/index.ts | 5483 | `/api/network/published`: same rank test, keep the `{error:"Not found"}` body |
server/index.ts | after 4065 | `app.use("/api/assistant/coordinate", requireModule("map"))` — exact path, not the `/api/assistant` prefix |

Also in this batch: `scripts/smoke-all-modules.mjs:167-179` must be tightened to rank ≥ members or the smoke run goes red on any preview module.
**Decisions:** hearts disappear from `/gratitude` (matches the documented `feed.hearts_on_wall:false` default); a village peering at `preview` stops answering peers and the peer logs a 404 every 6h; already-written `health_events` keep leaked micropost snippets — forward-only unless a redaction UPDATE is run.

## B6 — Abuse guards (lands with B5; **Riverside gets its own gate run**)
Root cause: unthrottled public writers; one webhook with no authentication at all.

| file | line | edit |
|---|---|---|
server/index.ts | 3116 | register: `overLimit(\`register:${clientIp(req)}\`, 10, 3600_000)` as the first statement, before the exists-by-email check, so it bounds the enumeration oracle too |
server/index.ts | 8722 | investor-docs request: `overLimit(\`investor-docs:${clientIp(req)}\`, 3, 3600_000)` before the submissions write |
server/index.ts | 1983 + 3148 | split `overLimit` into check-only + `recordHit`; pre-check `login-ip:` (30/15min) and new `login-acct:<normalized email>` (10/15min); record hits **only** on credential failure |
server/index.ts | after 5842 | Riverside webhook: timing-safe compare `x-riverside-secret` against a new `riverside_webhook_secret` in server/lib/secrets.ts; fail closed with the inert `200 {received:true, discarded:...}`; reuse the Stripe per-IP bucket pattern (2857) for 429 |

**Decisions:** the login change must land as one unit (raising the IP cap without the per-account bucket loosens brute-force); email must be normalized exactly as `members.byEmail` does. Riverside fail-closed **silently stops ingestion** on any deployment with a live webhook until a founder pastes the secret — surface it on the automation admin card like `webhookSecretConfigured()`, and update `server/loop.e2e.test.ts:2443-2447` to send the header in the same commit.

## B7 — Account recovery does not exist (own gate run; needs a product decision first)
Root cause: three auth routes, one token minter reachable only through break-glass bootstrap, no reset, no change, no real logout.

| file | line | edit |
|---|---|---|
server/index.ts | 932, 3219, 3249, 3291-3296 | `makeSetPasswordToken(userId, currentPasswordHash)` includes `sha256(hash \|\| "")`; set-password rejects 401 on fingerprint mismatch; bump `u.tokenVersion` in the same update at 3294 and encode the session at 3296 from the bumped value |
server/index.ts | before 3281 | new `POST /api/auth/forgot-password`: rate-limited, always the same 200 body, mints + emails `${origin()}/set-password?token=…`, logs a send failure loudly |
server/index.ts | beside 3301 | new admin route: mint + **email only** (never return `claimUrl`), refuse a founder target unless the actor is a founder, write a `kind:"audit"` health_event |
server/index.ts | beside 3300 | `POST /api/auth/logout`: `authedUser` required, bumps only the caller's tokenVersion |
client/src/contexts/AuthContext.tsx | 106 | `await` the logout call before clearing localStorage |
client/src/pages/Login.tsx | after 118 | "Forgot password?" link |
client/src/pages/SetPassword.tsx | 35 | non-admins → `/profile`, not `/admin` |

**Decisions, all three needed before coding:**
1. Fingerprinting invalidates claim links already in flight — "link invalid" for anyone mid-claim; recovery is re-running break-glass.
2. `tokenVersion` is all-sessions-or-nothing: **every logout becomes a global sign-out** (logging out on a tablet signs her out on her phone). Accept that, or ship it as a separate "Sign out everywhere" control. Per-session revocation = schema change.
3. Reset makes email deliverability load-bearing for recovery. On a fork with an unverified Resend domain the send fails after a 200 — copy must stay honest ("if an account exists, a link is on its way"). Depends on B12's `EMAIL_FROM` work; land B12's sender edit first or the reset mail is unbrandable.
Add a loop-test step asserting a replayed post-logout token 401s.

## B8 — Abandoned pending rows wedge exits and module shutdown (lands with B7's gate run)
Root cause: a pending fiat row is inserted before the provider call and nothing ever cancels it; only `exchange_orders` has a reaper.

| file | line | edit |
|---|---|---|
server/lib/stays.ts / server/index.ts | 2106 | `releaseAbandonedStayPurchases(pool, hours)`: `provider='stripe' AND status='pending' AND created_at < NOW() - INTERVAL ? HOUR`, skipping (and reporting) rows where `ledgerEntryExists(\`ord:${id}:leg1\`)`; call it from stay-nightly **before** the `effectiveLifecycle("stays")==="off"` early return |
server/index.ts | after 2317 | hourly commerce reaper: `product_purchases SET status='cancelled' WHERE status='pending' AND created_at < NOW() - INTERVAL ? HOUR`, skipping rows with a `fiat_charges` entry for `<id>#%`; scope to `provider='stripe'` |

No migration — `'cancelled'` exists in both enums. The 25-hour floor (`ORDER_EXPIRY_FLOOR_HOURS`) is load-bearing and must live in code, not a game variable: Stripe sessions stay payable ~24h.

## B9 — MySQL session time zone is never pinned (own gate run)
Root cause: driver pinned to `Z`, session zone left at server default, so `NOW()` and bound `Date`s live in different frames.

| file | line | edit |
|---|---|---|
server/db/pool.ts | after createPool (~32) | `_pool.on("connection", c => { c.query("SET time_zone = '+00:00'"); })` — numeric offset, never `'UTC'` |
server/db/migrate.ts | 45 | same statement after connect |
server/db/testDb.ts | 48, 56 | same |
server/db/harness.test.ts | 59-69 | assert `SELECT @@session.time_zone`, or compare a MySQL `NOW()` row against `Date.now()` |

**Decision:** no-op on Railway (UTC). On a non-UTC fork this un-breaks `overLimit` (currently always false) and job cadence (hourly jobs currently firing every tick) — a large, correct, visible behaviour change there. App-written TIMESTAMPs (`badge_awards.expires_at`, `wallet_challenges.expires_at`) read back shifted once; check `payments_log.handled_at` (DATETIME, does not self-normalise) before shipping.

## B10 — A partial migration bricks the deployment forever (own gate run; **needs a migration**)
Root cause: `_migrations_applied` records whole files only, so a file that fails mid-way replays already-applied DDL on every boot.

| file | line | edit |
|---|---|---|
server/db/migrate.ts | before 66 | idempotent `ALTER` adding `statements_done int NOT NULL DEFAULT 0`, guarded by an `information_schema.columns` check (the `CREATE TABLE IF NOT EXISTS` at 60-65 will not add it to existing deployments) |
server/db/migrate.ts | 79 | loop over `parts.slice(statementsDone)`, upsert the counter after each statement; file complete only at `parts.length` |
server/db/schema.ts | 216 · server/db/testDb.ts | 57 · migrationStatus 94-108 | add the column so drizzle types and the scratch harness do not drift |

**Decision:** this promotes "a shipped migration file is never edited" from convention to hard invariant — a reordered file resumes at the wrong offset. State it in the file header and in the ARCHITECTURE.md migration-trap list. Keep the fail-loud throw at index.ts:2069 unchanged.

## B11 — Client renders "empty" when it means "failed" (lands together, client-only gate)
Root cause: `r.ok ? r.json() : null` / bare `.catch(() => {})` collapse failure into the zero state.

| file | line | edit |
|---|---|---|
client/src/contexts/AuthContext.tsx | 61-68 | wipe the token only on 401/403; delete the `removeItem`/`setToken(null)` pair from the catch (keep `console.error`) |
client/src/contexts/AuthContext.tsx | 40 | `useState(() => localStorage.getItem("amora-auth-token"))` — synchronous init |
client/src/modules/ModuleProvider.tsx | 58 | on failure retry 1s/2s/4s and leave `loaded` **false**; cap retries; guard setState after unmount |
client/src/modules/ModuleProvider.tsx | 61 | `useAuth()` and `useEffect(refresh, [token])` so login/register/logout refetch the manifest |
client/src/pages/Wallet.tsx | 32-37, 87, 107 | three-way `"loading" \| "ready" \| "failed"`; throw on `!r.ok`; reserve "Nothing yet" for `ready` + zero balances; same check on the listings empty state |
client/src/pages/GratitudeWall.tsx | 19, 85-91, 131 | widen state to `undefined`; show the "unlocks as you progress" caption only when `budget && budget.total <= 0`, else "couldn't load your budget"; drop `!budget` from the disable predicate |
client/src/components/NotifyPrefsPanel.tsx | 156, 165, ~170 | throw on `!r.ok`; set a real error in the catch; render `error` outside the `confirming` branch and clear it when `setConfirming(true)` runs |

**Decisions:** AuthContext creates a transient token-present/user-null window — pages gated on `user` render signed-out while `gameFetch` still sends the header; ship a "couldn't reach the village, retry" state rather than the logged-out view. ModuleProvider must stay nested inside AuthProvider (it is). New copy on Wallet and the core gratitude page. Enabling Send with an unknown budget is only acceptable **paired with** the explicit "couldn't load" caption.

## B12 — White-label leaks (own gate run — brand ratchet + docs)
Root cause: the shell, the HTML head, the sender address and two currency reads bypass the brand overlay.

| file | line | edit |
|---|---|---|
server/index.ts | 335, 1940, ~8291 | `sender` in `DEFAULT_EMAIL_CONFIG`; `from: opts.from ?? cfg.sender?.trim() \|\| process.env.EMAIL_FROM \|\| "Amora Site <notifications@amora.cr>"` with shape validation; whitelist `sender` in the admin email-config PUT |
server/index.ts | 9746, 9647 | `mergedConfig().currency.name` / `.nameLower` instead of `GAME_CONFIG` |
server/index.ts | 4133-4134 | circle slug: `.slice(0,64) \|\| \`circle-${Date.now().toString(36)}\``; guard reduced to a blank-name check (fixes non-Latin names **and** the varchar(64) PK overflow) |
client/index.html | 20, 31, 34, 35 | repoint favicon/apple-touch/OG image at new local files under client/public/assets/images (files must land in the same commit) |
client/index.html | 13, 54-71 | delete the canonical link and the JSON-LD Organization block; neutralize static title/description/og:site_name |
server/index.ts 425-433 + client/src/components/Layout.tsx 57, 237, 383, 408, 411, 542, 552, 562, 581 + AmoraLogo.tsx 52, 79 | add `images.logo/heartLogo` and `project.siteUrl` to `DEFAULT_BRAND`; drive logo src+alt, tagline, copyright from `fetchConfigCached()`; render outbound links only when `siteUrl` is set; thread the name into AmoraLogo's `alt` |

Docs in the same session (CLAUDE.md requires it): `docs/FORK_RUNBOOK.md` env table (`EMAIL_FROM` + "set your sender address"), `PLATFORM_FOUNDATION.md:49`. Then `node scripts/check-brand-refs.mjs --update-baseline`.
**Decisions:** (a) the async logo needs a reserved 64px/90px placeholder box or every page shifts on first paint — CLS regression on the most-seen surface; (b) Amora's own overlay must be seeded with its current asset paths and amora.cr URLs in the same change or tenant one loses its logo and Main Site button; (c) dropping the canonical link costs Amora a correct SEO signal until its fork re-adds it; (d) `scripts/check-brand-refs.mjs`'s `stripComments` treats `https://` as a comment — until that is fixed the guard cannot see brand refs in any href. Separate ticket, but the baseline is untrustworthy until then.

## B13 — Accessibility: names, roles, announcements (lands together, client-only)
Root cause: interactive and status nodes with no accessible name, no live region, and one container role that prunes its own children.

| file | line | edit |
|---|---|---|
client/src/pages/GratitudeWall.tsx | 102-109 | `aria-label={\`Amount of ${currency.toLowerCase()} to send\`}` — derived from the `currency` state, not hardcoded |
client/src/components/SwapCard.tsx | 164-165, 171 | `role="status"` on the receipt, `role="alert"` on the error |
Wallet.tsx 78-79 · Library.tsx 74-75 · Stay.tsx 99-100 · Badges.tsx 73 | same one-attribute change (notice→status, failure→alert) |
client/src/pages/VillageMap.tsx | 114 | `role="img"` → `role="group"`, keep the aria-label |
client/src/components/Layout.tsx | 81, 87 | `type="button"`, `onClick={() => setPathsOpen(v => !v)}`, `aria-expanded`, `aria-haspopup`, `aria-controls="paths-menu"`; `id="paths-menu"` on the motion.div |
client/src/pages/VillageMap.tsx | 305, 306, 309, 312 | `role="dialog" aria-modal="true" aria-labelledby` + `tabIndex={-1}`/ref on the panel; one `useEffect` saving/restoring `document.activeElement`; Escape handler on the overlay; `aria-label="Close"` on the icon button |

Scope discipline: this is 12 sites, **not** the 117-control or 107-tint sweeps. Those burn down behind a jsx-a11y baseline ratchet (`docs/AUDIT_2026-07-30_IMPROVEMENTS.md:102`).
Notes: `role="alert"` is assertive — keep it on request-completion messages only. The focus-move-on-open is load-bearing: without it Escape is dead. Minimal fix still does not contain Tab; only the Radix route does. The map dropdown click-toggle means a mouse user who clicks while hover-open gets a menu that stays closed until the pointer leaves and re-enters — pair with Escape-to-close.

## B14 — Mobile layout and contrast (lands with B13; contrast half needs brand sign-off)
Root cause: hand-copied layout constants and a de-emphasis system built on opacity over a mid-tone brand teal.

| file | line | edit |
|---|---|---|
client/src/pages/VillageMap.tsx | 305, 306 | `z-50` → `z-[70]`; `pb-[calc(1.5rem+4rem+env(safe-area-inset-bottom,0px))] md:pb-6`; update the layering-ladder comment in MobileFab.tsx:24 |
client/src/pages/Quests.tsx | 200 | `top-[64px]` → `top-24` (nav is 96px) |
client/src/pages/Quests.tsx | 332 | branch the empty state on `quests.length === 0` — and do not assert "the village posted nothing" while the fetch failure at 116 is still swallowed |
client/src/index.css | 503 | `@media (max-width: 767px)` → `@media (pointer: coarse) and (hover: none)` |
client/src/components/Layout.tsx | the `text-white/50\|60\|70` sites in the header, drawer and footer | solid `text-white` + `hover:underline`; drop `hover:text-amber` (2.53:1) |
client/src/pages/Register.tsx 218 · Login.tsx 126 | `border-teal-deep bg-white text-teal-deep hover:bg-teal-deep/5`. Do **not** use `text-gold` — index.css:323 aliases it to amber |

**Decisions:** nav/footer lose their intentional hierarchy (all links equal weight) and the two auth pages lose their only amber accent — **brand sign-off, not a silent edit**. Solid white clears AA by 0.31, so `--color-teal-deep` becomes effectively frozen; a fork with a lighter primary re-breaks it. `pointer: coarse` also catches touchscreen laptops — hence `and (hover: none)`. `top-24` stays a hand-copied mirror of the nav height; a shared `--nav-h` token is the durable version.

## B15 — Authority and admin surfaces (own gate run — capability gate)
Root cause: capabilities granted and reported but enforced nowhere; appointment guard checks identity, not privilege.

| file | line | edit |
|---|---|---|
server/index.ts | 9222, 9230 | widen to admin OR `hasCapability("quest.consent", ctx)`; add a **no-self-consent** guard; thread the non-admin actor through the declines branch (9232-9250), the notification `actorUserId`, and an explicit audit `recordEvent` (the 2886 spine only attributes `isAdmin` actors) |
server/index.ts | 9901, 9912 | hoist the ctx; refuse unless every capability in the target role is one the actor holds via `hasCapability` |
server/index.ts | 7031 | 409 when `merged.kind !== existing.kind` and `badge_awards` exist; add a `kind:"audit"` recordEvent for definition edits |
server/index.ts | 6377, 6381 | write `def.unit` unconditionally; remove the Unit input (Admin.tsx:4757-4759) and the field from state/body (4658, 4678) |
server/index.ts | 4780 | attach `activeStays` + `overCapacity` per accommodation; render in Admin.tsx:3512, 3566 — **and** add a capacity input to the add-room form (3545-3551, currently hardcoded 1) or the flag is permanently lit and worse than nothing |
client/src/pages/Admin.tsx | 4183, 4379, 4382 | award form gains a "Days" input → `expiresAt` ISO; server already parses it |
client/src/pages/Admin.tsx | 15-22, 225, 5999, 6708 | new `QuestsTab` (GET /api/quests + POST/PUT/DELETE /api/admin/quests); repoint the wizard row with honest copy |
client/src/components/Layout.tsx | after 37, 496, 533 | `useModule("commerce")`/`useModule("network")`; footer entries for `/exit-policy` (ungated), `/network` and `/contribute` (module-gated). **Footer, not header** — the nav is already ~1250px wide |

**Decisions:** every steward-circle appointee becomes a Gratitude faucet operator — the self-consent guard is load-bearing, not optional. Quest DELETE is unguarded against outstanding claims: refuse or warn while claims are `claimed`/`submitted`, per the "settle first" invariant. Badge reclassification now requires revoking awards first. The dormant badge-expiry sweep starts firing real "restrictions lifted" notifications. Regen unit needs a one-shot backfill UPDATE for historical rows or `MAX(unit)` keeps mislabelling. Reconcile `PLATFORM_FOUNDATION.md:49` and `docs/FORK_RUNBOOK.md:39` in the same session.

## B16 — Cheap hygiene (land anywhere; no gate of its own)
| file | line | edit |
|---|---|---|
client/src/pages/Forum.tsx | 4, 114, 158, 235, 240, 248, 378 | fix mojibake **with the Edit tool only** — never PowerShell/Set-Content (the file has a UTF-8 BOM and a whole-file rewrite re-corrupts it). Three distinct characters (em dash, ellipsis, left arrow) — one blind find-replace is not enough; drop the trailing U+0090. Same at scripts/smoke-all-modules.mjs:43, 187 |
server/index.ts | 3059, 3070 | `csvCell` helper neutralising leading `= + - @ \t \r` with a `'` prefix **outside** the quote-doubling; apply to headers too (they currently do not even double quotes) |
server/index.ts | 1737 | scrub the denormalized text, not just the attribution: `SET actor_user_id=NULL, title='A message from a departed member', body=NULL`; update the docstring at ~1716 |
server/index.ts | 1678 | before `replaceAll(keep)`, unlink dropped rows' attachments via `path.join(UPLOADS_DIR, path.basename(...))`, each in its own try/catch, skipping any filename a kept row still references |

**Decision:** the notification scrub destroys a steward's only working copy of an open restorative intake at resolve time — acceptable under the deletion right, but the exit flow should settle intakes before resolving. No backfill is possible after the fact (actor_user_id is already NULL), which is why it matters now. The retention unlink is irreversible with no grace window, and `path.basename` is mandatory — brand images and investor docs share `UPLOADS_DIR`. It leaves the identical gap on `anonymizeMember` (1743-1755), which is the member-initiated path.

## B17 — Outbound calls bypassing the pinned dialer (own gate run)
| file | line | edit |
|---|---|---|
server/lib/base-reads.ts | 52-56, 84 | make `rpcClient()` async; `await guardOutboundUrl(url)` for every host except the literal loopback exemption; pass `fetchOptions: { redirect: "error" }` |
server/lib/feedback.ts | 107 | `await guardedFetchJson(hubUrl, 10_000, { method:"POST", body: payload })`, dropping the AbortController scaffolding |

**Decisions:** the loopback exemption must survive or `server/loop.e2e.test.ts:2087` and local anvil break — do **not** route base-reads through `guardedFetchJson` (https-only). The feedback change breaks self-hosted `http://` or VPC-internal hubs silently (rows stay queued, no data loss) — needs a FORK_RUNBOOK line that `FEEDBACK_HUB_URL` must be https and publicly resolvable. Residual DNS-rebinding window stays accepted per toolcheck.ts:249-254.

## B18 — Performance (own gate run — new dependency + live ALTER)
| file | line | edit |
|---|---|---|
server/index.ts | before 10146 | `app.use(compression())`; then `app.use("/assets", express.static(path.join(staticPath,"assets"), { maxAge:"1y", immutable:true }))` **as a separate mount** |
server/repos/gratitude.ts | 45 | add `spentInCycle(fromId, cycleId)` (SUM, all kinds, no kind filter) and `countPair(fromId,toId,cycleId,kind)` (COUNT, kind-filtered) |
server/lib/gratitude.ts | 42, 100 | call them; leave `all()` to the wall/journal/export routes |
drizzle | new file | `ALTER TABLE gratitude_log ADD KEY gratitude_context_idx (context_ref, kind)` |

**Traps:** never put `maxAge`/`immutable` on the bare `express.static(staticPath)` — it also serves `/` and would pin members to a dead bundle hash (the white screen the comment at 10155-10175 exists to prevent). The SUM must keep the current semantics exactly (all kinds) while the count keeps its kind filter, or every member's budget changes silently. Refusal strings at gratitude.ts:90-119 are asserted byte-for-byte by the order-dependent loop e2e — build first. Adding `compression` re-triggers the blocking `pnpm audit --prod --audit-level high` gate, and compression drops Content-Length in favour of chunked transfer.

---

## Landing groups

| gate run | batches | why grouped |
|---|---|---|
| 1 | B1 | boot semantics; must be proven alone |
| 2 | B2 + B3 | library escrow + write-path serialization, both DB-write correctness, no overlapping files |
| 3 | B4 | economy/ledger; needs its own reconciliation check |
| 4 | B5 + B6 (minus Riverside) | route gating + throttles, all in server/index.ts, all covered by loop e2e |
| 5 | B6-Riverside | edits a test assertion and can silently stop a live integration |
| 6 | B7 + B8 | auth/session surface + pending-row reapers |
| 7 | B9 | time zone: touches every timestamp comparison |
| 8 | B10 | migration ledger schema |
| 9 | B11 + B13 + B14 | client-only; typecheck + build + a manual pass on /wallet, /gratitude, /map, /quests |
| 10 | B12 | brand ratchet + `--update-baseline` + docs |
| 11 | B15 | capability gate |
| 12 | B16 + B17 + B18 | hygiene, dialer, perf |

## Needs a decision, not an edit
- **Migration:** B10 (`statements_done` column). Nothing else in this plan needs one; every other status/enum value already exists.
- **Member-visible:** B2 (cancelled reservations, released=0), B4 (phantom balances drop, 45-day hold on pack buyers, no consent-at-0), B5 (hearts leave the wall, peers 404 at preview), B7 (global sign-out on logout, in-flight claim links die), B11 (new wallet/gratitude copy), B13/B14 (nav and auth-page look, brand sign-off), B15 (steward faucet authority, badge reclassification blocked).
- **Stated invariants:** B2 (single-terminal settle; exact-key ledger existence), B4 (balance recomputed never assigned; per-cycle sticky split vs. badges.ts:286), B10 ("a shipped migration file is never edited" becomes hard), B15 (one capability gate — use `hasCapability`, never a parallel path), B5 (module code emits activity only through `moduleActivity` — change the string, not the emission path).

## Not fixing now
1. **The 107 `text-white/*` tints and 117 unlabelled controls.** Each needs its own background or wrapper checked; a sweep that size is unreviewable. Burn down behind a jsx-a11y baseline ratchet.
2. **The remaining ~155 `text-amber` sites and the token collapse.** Already scoped at `docs/AUDIT_2026-07-30_IMPROVEMENTS.md:104`.
3. **The other 25 `r.ok ? r.json() : null` client fetches.** B11 fixes the five that produce a false statement to the member; the rest are a pattern change, not a defect each.
4. **True per-session revocation.** Needs a sessions table. `tokenVersion` is the honest ceiling today.
5. **Founders-circle sock puppets by an existing founder.** B15 blocks privilege escalation, not equal-power collusion; that is the second-signoff/decisionRef work parked at `docs/AUDIT_2026-07-30_IMPROVEMENTS.md:106`.
6. **Registration as a membership oracle.** B6 bounds it per IP. Eliminating it means identical responses for taken and fresh addresses plus a notify-the-existing-account email — a UX decision, not a patch.
7. **Backfilling already-leaked pulse text and already-unbacked recognition balances.** Forward-only fixes; a redaction UPDATE and a balance resync are separate, auditable one-shots.
8. **Radix-izing the map NodeCard for real Tab containment**, and remaining `replaceAll` races on `submissions` (1678, 1755, 3009, 3030, 8735). Larger refactors; B13/B3 close the reachable harm.
9. **`scripts/check-brand-refs.mjs` `stripComments` bug.** Own ticket — fixing it raises the baseline, so it must be re-derived deliberately rather than masked by CI.
10. **Pinned-dialer parity for viem** (custom `fetchFn`). Range check plus `redirect:"error"` is the accepted position; full pinning is a bigger change than the defect warrants.