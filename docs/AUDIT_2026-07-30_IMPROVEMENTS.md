# What to build next — 78 proposals triaged to 29

Deduplicated (28 proposals collapsed into 12 merged items), dropped 9 as generic, already-shipped, or subsumed. Ranked within each group. Sizes are after merging.

---

## DO NEXT — this lunation

**1. A delivery-checked `reverseTransfer()` primitive, and no member account driven negative by a clawback** *(small)*
Verified: `server/index.ts:2618` (stays) and `:2667` (exchange) both post a clawback from `memberAccount(user)` with `allowNegative: true` and **no check that the delivery leg ever landed** — only commerce open-codes the check at `:2549`. A member whose exchange settle threw out-of-stock, then refunded, ends up with a negative token balance for tokens they never received while the treasury gains stock it never sent. Add `reverseTransfer(pool, {originalKey})` that reads the original row, refuses when absent, and derives amount and accounts from it; route all three handlers through it and add a registry-walking test so a fourth fiat module inherits the rule.

**2. Quarantine the failing module, not the village** *(medium — merges the money and reliability versions)*
Today one interrupted library reservation (`library.ts:538`) or one half-swap (`exchange.ts:684`) throws out of `startServer()` into `.catch(console.error)`, so quests, gratitude, stays and profiles stop serving forever while the scheduler keeps moving tokens. Split the tiers: per-module reconciliation mismatches demote that module to `off`, write a `health_events` row naming the exact loans/orders, and let the rest serve; move `startScheduler` after every assertion. Amora's forks are run by people who cannot SSH anywhere — a stack trace in a Railway log is not an explanation.

**3. A credential-free crawl assertion in the gates** *(small — the cheap first slice of the privacy-tier work)*
Before refactoring anything, hit every registered GET with no token in CI and fail the suite if a seeded member's name or email appears in a response body. This turns four separate audit findings (`/api/roles`, `/api/badges/match`, `/api/game/cycle/distributions`, `/api/game/pulse`) into a printed list, and it is the mechanism that stops route #264 from re-opening them.

**4. Give the Pulse a members tier and stop putting member prose in event text** *(small)*
Widen the events audience to `public | members | admin`, stamp `members` when the emitting module's lifecycle is `members`, and pass `entityType`/`entityRef` instead of quoting authors. A micropost has no title, so today the **body** of the shortest, rawest post in a members-only forum is what an anonymous caller reads — the leak is widest exactly where it hurts most.

**5. A fork doctor at boot, and stop phoning home** *(medium — merges the fork-doctor and third-party-asset items)*
Verified: `FRONTEND_URL` falls back to `https://amora.regencivics.earth` at `server/index.ts:1533, 2805, 2846, 8614`, so a fork's notification emails send its members to Amora's login page and nobody finds out for weeks. Add launch-requirement-style checks (own domain, own Resend `from`, own images, own canonical) that fail loud, self-host the four Google fonts and the favicon currently fetched from Amora's WordPress host, and add the headers middleware (CSP report-only, HSTS, `Referrer-Policy`, `X-Content-Type-Options`, `frame-ancestors`) in the same pass.

**6. Ship the inherited legal pages as placeholders, the way `/exit-policy` already does** *(small — the urgent slice of a large item)*
`ResidentRights.tsx` tells members their Land Share Agreement is "transferable to your children tax-free" and `WhyCostaRica.tsx` cites Costa Rican Horizontal Condominium law and Pensionado income thresholds. A fork in Portugal publishes those as its own residents' rights on day one, to people deciding whether to move their family and money onto shared land. Placeholder the six pages that make legal or tax claims now; the other fourteen become editable page documents later.

**7. Restorative intake: send a pointer, not the payload** *(small)*
Suppress the body from outbound email for `restorative_intake` (and `contact_request`), keep the words in the notifications row behind a small in-app inbox for the role, and drop the discloser's name from the subject. This is the one flow where someone is describing a rupture and often naming another member, and it is currently the flow that leaves the village's control fastest — into a mailbox the role-holder may share with a partner or read on a lock screen.

**8. One `useModuleData()` + `<PageState>`, and authored first-run states** *(medium — merges the mobile data-state and desktop empty-state items)*
Ten module pages hand-roll `fetch().then(r => r.ok ? r.json() : null).catch(() => {})` and then render "you hold nothing" on a dropped request. On rural mobile data a failed request is the ordinary case, so the platform's answer to bad signal is to confidently misstate a member's balance and claim the village has made zero decisions. One hook, one component, every empty branch gated on `data !== null`, plus authored copy naming whose move it is ("A steward adds the first quest in Admin → Quests") and a real "this module is off" page instead of a red 404 on a fresh install.

**9. The phone-and-body bundle** *(small, one PR)*
`grep prefers-reduced-motion` over `client/` returns zero hits against 341 motion props and 10+ `repeat: Infinity` loops — a WCAG 2.2.2 Level A failure that makes the quest board unusable for members with vestibular disorders. Same PR: accessible names on the notification bell (a static `aria-label` currently hides the unread count entirely), the GuideChat send button and transcript live region, `aria-pressed` on the quest/forum filter chips, `--header-h`/`--tabbar-h` tokens with a written z-index scale (the Co-Creators Guide's sticky bar currently paints over the hamburger, so a phone reader cannot navigate at all), and `useDraft()` on ProposeQuest's seven textareas.

---

## DO SOON — next lunation

**10. `viewerTier()` everywhere a member's name is served, defaulting to members, plus the "what a stranger sees" page** *(medium)*
The structural follow-up to #3: one `viewerTier(req)` and `personName(tier, user)` that the eight name-bearing reads must pass through (`/api/map` already does it correctly by hand), every route defaulting to `members`, and one admin tab that issues credential-free internal requests and renders the result in plain language. A non-technical steward cannot audit 263 routes by reading them, and flipping badges to "public" should name the legal names it just published.

**11. Quest consent through the ONE capability gate** *(medium)*
Verified: `server/index.ts:9098` is `isAdmin` only, while the seeded roles, the stage ladder and the member's own progression screen all promise stewards hold `quest.consent`. Every unit of recognition value in the village is currently released by whoever holds the founder password — if they are offline for a lunation, nobody's work is credited and no stage advances. Add `hasCapability("quest.consent")` with the appointment route's self-consent guard, plus a `quest.consent_signoffs` threshold reusing the library's proven `pendingSecondSignoff` shape.

**12. Index `gratitude_log` and delete `GratitudeLogRepo.all()`** *(medium)*
Verified: the table has `(from_id, cycle_id)` and `(to_id)` and nothing on `(context_type, context_ref)` or `cycle_number`, and the hot path materializes the whole table per heart tap. Recognition is the module that ships ON for everyone, so this degrades the platform's floor — and it will present to the village as "the internet is slow", getting worse every lunation.

**13. Make `users.recognition_balance` derived** *(medium)*
Delete the four writes, replace the four reads with `balanceOf(...)`, and `inSync` becomes unnecessary because drift becomes impossible. This column is the one place the codebase's own "recompute, never increment" rule is broken, and it is the number every member sees on their own profile — the single figure that has to be trustworthy for the recognition economy to mean anything.

**14. Every uploaded file gets an owning record; retention deletes the bytes** *(medium)*
`/api/uploads/:filename` (`index.ts:8577`) serves any file to anyone who knows the name, and `runRetentionSweep` purges the submission row while leaving the passport scan on disk forever. A village screening prospective residents makes a retention promise in `retention.submissions_days` that it currently keeps only for the database — and the orphan path grows unbounded on a volume with no quota.

**15. Admission and credentials** *(medium — merges four auth proposals)*
Throttle by account as well as IP (a whole ecovillage shares one uplink, so per-IP-only punishes the community for one person's typos while an attacker with many addresses guesses freely), add a fixed-cost delay on unknown emails, throttle registration with an `open | invite | approval` village setting, make `set-password` claims single-use with a `tokenVersion` bump, give members change/forgot/revoke-sessions, and audit every credential event. Today a founder account can be taken over by replaying a claim link and the village's audit log contains nothing — `/api/auth/set-password` sits outside the `/api/admin` audit middleware.

**16. Storage-layer concurrency: retire `replaceAll` on the hot tables, lock the migrator** *(medium — merges the two replaceAll items)*
`dbCollection.replaceAll` DELETEs the table and reinserts a caller-held snapshot, so the tools-link-check job (`index.ts:2105`) spends minutes on network I/O and then erases every role grant, submission triage and circle edit a steward made in the meantime — with a 200 to both people. Add per-row `upsert`/`remove`, a version guard that refuses a stale snapshot, the missing `created_at` on `roles`/`circles`, and `GET_LOCK('amora_migrate')` around the migration apply so two booting containers cannot interleave.

**17. One issuance figure per token per lunation, and an aggregate faucet ceiling** *(medium)*
`mintCapGuard` governs `sys:mint` only; `sys:gratitude-pool`, `sys:cycle-pool` and `sys:library-mint` issue under their own rule or none. Surface one number per token on the reconciliation endpoint and the command centre, and cap the aggregate. "How much of our currency did we print this month?" is the first question a fork's members ask when they suspect the founders — and it currently takes four queries no steward will ever run. *(See invariant note b: get the cap convention right or you will freeze a fresh fork's recognition.)*

**18. Derive the fiat-funded hold from the ledger** *(medium)*
Have each fiat module declare its grant `source` in the same registry as `registerPaymentHandlers`, compute the hold from `token_ledger`, and assert at boot that every module with a `settle` handler declared one. The hold currently protects the door it was written for and silently exempts the newer one; the boot assertion turns the next omission into a deploy failure instead of a chargeback the village absorbs.

---

## WORTH DOING

**19. A member home, and navigation that follows the module manifest** *(medium — merges three UX items)*
Login lands on `/profile` and `/` is a hero image with six buyer personas, so a resident of three years sees a recruitment page every visit. Add a `/village` home (next action, eligible quests, stage, open cycle and remaining send budget), feed `useModules()` into the header dropdown and the five hardcoded bottom tabs, and dim off modules in the admin rail. A slot pointing at a disabled module currently lands members on a 404, which reads as the platform being broken.

**20. Make power exercised over a member legible to that member** *(medium — merges three coordination items)*
Add a `subject` event audience so a member can read "what the stewards did about me" with the actor named, serve the capability explainer `/api/admin/members/:id/capabilities` already computes (so a vanished button says "suspended by the warning 'Timeout' until 12 Aug" instead of nothing), and give warning badges a member-written response plus a visible issue/response/reissue/lift timeline. A warning's deny outranks role and stage; it is issued by one person, reviewed by nobody, and today the file holds only the accuser's version.

**21. One village clock** *(medium)*
Seasons turn at village midnight, stay nights turn at UTC midnight (`stays.ts:260`), and timestamps render in each phone's zone. When people argue about who owes what for which night, the software has to be the one thing in the room that is not confused.

**22. Publish token-holding concentration to members** *(medium)*
`health.ts` already computes governance authorship concentration with an honest "too few to read" guard; add the money equivalent (top-holder and top-decile share of member-held balance, share held by system accounts, snapshotted per lunation) and put it on the **member-facing** dashboard. The ledger already knows; today only admins can add it up.

**23. Bound and surface every outbound call, and one "what leaves this village" page** *(medium — merges three items)*
Route Stripe, Resend, the four Anthropic calls, the YouTube poll and viem's dialer through one `outboundFetch` with a per-provider budget and last-success/last-failure, add a gate failing the build on any bare `fetch(` in `server/**`, and show one read-only page listing every destination and what it sends. Consent is what this platform is infrastructure for, and the feedback relay currently ships item titles and details to a hub the village has never seen named.

**24. Complete the erasure the exit flow promises** *(medium)*
`anonymizeMember` nulls `actor_user_id` but not names baked into `notifications.title`/`body` or restorative-intake bodies, and correspondence-bearing notifications never age out while unread. The person who left after a conflict keeps their name and their words in the inboxes of the people they left — and a village that cannot honestly complete an erasure should not promise one.

**25. The white-label onboarding kit** *(medium)*
No `README.md` and no `.env.example` exist; what a newcomer finds is nine handoff documents named after another village. Add a README pointing at FORK_RUNBOOK, `pnpm fork:init` writing `gameConfig.ts` / `index.html` / the brand seed / the guard's BANNED list in one pass, per-zone burn-down targets so the 425-reference ratchet actually turns, and a `--fork-report` listing the ten `amora.cr` URLs sitting in `content-seed.json`. Promote this to DO NEXT the day village #2 is real.

---

## DELIBERATELY NOT NOW

**Breadth-weighted cycle pool split.** The Sybil-filtered `receivedEligible` split shipped *today*. Changing how the money divides twice in two lunations is how you lose the village's trust in the number. Ship the concentration metric (#22) first, watch two or three cycles, then offer `pool_split_mode: breadth` as an opt-in variable — and it is a village governance decision, not a technical lead's.

**Promoting `/api/profile/contribution` into a real "work done" record** *(large)*. The best idea in the whole set — the night shifts, the pump nobody logged, the emotional labour of holding a conflict are exactly what a quest board cannot see. But it needs a consent queue design, cap discipline, and badge-metric wiring, and it will be done badly if squeezed in beside items 1–18. Schedule it as the next feature epic, not as backlog.

**The full i18n catalogue** *(large)*. Do the cheap half now inside another migration: add `message_key` + `params` to `notifications` and `health_events` and write them at insert, keeping the rendered string as the fallback. The catalogue and the render-time layer wait; the columns cannot, because prose frozen into history can never be retro-translated.

**Migrating all 117 unassociated labels to a `<Field>` primitive** *(large)*. Land the primitive and the `jsx-a11y` ratchet with a baseline counts file (the mechanism `check-brand-refs.mjs` already proves works here), then let the count burn down per PR. A 117-file sweep in one change is unreviewable and will regress.

**Flipping dark mode on.** The `.dark` palette exists and `grep 'dark:'` returns zero hits, so flipping `ThemeProvider` today ships a half-styled site to every phone set to dark. Do the token collapse first (retire `text-gray-*`, `text-white/60`, literal `#2D5A5A` in favour of the semantic tokens with AA-verified pairings) — that fixes the contrast failures in one place, which is the part that actually excludes people. Dark mode is the reward afterwards.

**Requiring a `decisionRef` on appointments.** Right idea, blocked by a coupling problem: the decision primitive lives in forum, and forum ships OFF. As written, a village without forum could not appoint anyone. Either move the decision primitive into progression or make the requirement conditional on forum being live — decide that first.

**Statement-level resumable migrations.** Take the advisory lock now (in #16); the per-statement progress table is real fork-survivability work but it is speculative until a fork actually times out a backfill. Revisit when the first one does.

---

## Invariant notes — read before implementing

- **The reversal handlers already bend "only faucet accounts go negative."** Both use `allowNegative: true` on a *member* account (`index.ts:2618, 2667`). Item #1 must not preserve that: clamp the clawback to the delivered amount, and when the member has already spent it, record a fiat debt against the order — never a negative member token balance.
- **The aggregate faucet cap must not use the swap "0 means zero" convention.** Fiat purchase caps in `assertCanPurchase` use the opposite convention deliberately; an issuance ceiling built fail-closed would make a fresh fork with an unset variable refuse *all* recognition issuance including cycle settlement. Also evaluate it at settlement-planning time, not per leg, or a cycle settle will fail half-way and leave a partially settled lunation.
- **Quarantine must not soften conservation.** Per-token `SUM(balance) ≡ 0` and hypha-row violations stay fatal: the quarantine server may serve an explanation and one authenticated repair route, and must mount no member-facing routes and start no scheduler. The reliability-lens version as written would downgrade a stated invariant.
- **All of #1's reads and writes go through `postTransfer` / the ledger transaction** — `ledgerEntryExists` belongs inside `server/lib/ledger.ts`, not as a route-level pre-check that can race.
- **Moving the session token to a cookie (in #15) requires CSRF protection**; `SameSite=Lax` still permits top-level POSTs, and settlement webhooks must stay exempt.
- Nothing else in the 78 violates an invariant. Deriving `recognition_balance` (#13) actively *restores* "recompute, never increment"; the breadth split preserves conservation.