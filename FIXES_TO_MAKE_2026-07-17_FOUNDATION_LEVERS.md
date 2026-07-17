# Fixes to Make — 2026-07-17 — Foundation Levers

**Repo:** `game-amora` (the foundational fork — Amora is project #1 of many)
**Companion docs:** `PLATFORM_FOUNDATION.md` (architecture + swap points), `shared/gameConfig.ts` (the swap point)
**Status:** SPEC — nothing in this document is built yet.

---

## Who this document is for

The next Claude Code session, building the **foundation** that hundreds of land
projects will fork. Amora is the first tenant, not the only one. Every behaviour
described here must be a **lever with an evidence-based default**, not a hardcoded
opinion. If a project disagrees with the default, they change config — they don't
fork the code.

Read `PLATFORM_FOUNDATION.md` first for the existing architecture (brand overlay,
`/api/game/config` merge, admin Setup Wizard, data volume, seeds in `server/seeds/`).

---

## Why this exists — the evidence base

Five findings from the research drive nearly every item below. Build with these in
mind; they explain *why* the defaults are what they are.

1. **Paying for contribution destroys the motivation to contribute.** Deci,
   Koestner & Ryan's meta-analysis (128 experiments): expected, tangible,
   engagement-contingent rewards undermine intrinsic motivation at **d = −0.40**.
   Gneezy & Rustichini's daycare fine *increased* lateness and did not reverse when
   removed — "a fine is a price." Paying blood donors halved female supply.
2. **Peer-given, unexpected, symbolic recognition does the opposite.** Restivo &
   van de Rijt's Wikipedia barnstar experiment: **+60% productivity, persisting 90
   days**. Barnstars work *because they buy nothing*.
3. **Participation platforms die when input→outcome linkage is invisible.** Decide
   Madrid failed not on UX but because residents saw "their inputs are rarely acted
   on." Loomio's top complaint is notification overwhelm.
4. **Volunteer-run coordination decays; funded coordination survives.** Every
   collapsed time bank/LETS relied on enthusiasm. Sardex (~€50M/yr) pays ~12
   Community Trade Advisors and charges fees to fund them.
5. **Communities die of money ambiguity, burnout, and founder dynamics — not
   imperfect voting.** Auroville: 98% of residents voted to halt land deals; the
   board approved them anyway (~US$28M lost). Findhorn ceased operations in 2023 and
   survived only by *buying its land*.

**The uncomfortable part:** the current build contains both the good pattern (the
peer-to-peer Gratitude Wall — symbolic, message-required, amounts private) and the
bad one (quest cards printing "40–80 Gratitude" *before* the act, in a currency
pegged 1:1 to USD that offsets dues). They are in direct conflict. F1 and F2 resolve
this.

---

## Architectural principle

> **Every lever in this document is configuration with an evidence-based default.
> The default is what the research supports. The lever is what the project decides.**

Three tiers, already established in the codebase — keep using them:

| Tier | Where | For |
|---|---|---|
| **Code defaults** | `shared/gameConfig.ts` | Structural shape: currencies, progression mode, domain defaults |
| **Live overlay** | `data/brand.json` (Setup Wizard) | Identity, images — editable in-browser, no deploy |
| **Governed data** | `data/*.json` + admin editors | Domains, agreements, roles, variables — the community's own content |

**Non-negotiable invariants** (encode these so they cannot drift):
- Recognition currencies can **never** grant governance voice (F4).
- Financial stake is **never** auto-derived into voice (F11).
- Fiat-exchangeable token movement **requires ratification** (F9).

---

# Part 1 — The configuration model

This replaces the single-currency assumption in `shared/gameConfig.ts`.

### 1.1 Currencies (F2)

```ts
export type CurrencyKind = "recognition" | "compensation" | "voice";

export interface Currency {
  id: string;
  name: string;              // "Gratitude"
  nameLower: string;         // "gratitude"
  kind: CurrencyKind;
  /** Can it be exchanged for fiat / moved off-platform? Gates F9 ratification. */
  fiatExchangeable: boolean;
  /** Only people can issue it (true) vs the system can auto-issue (false). */
  peerGivenOnly: boolean;
  /** Does holding it confer governance weight? MUST be false for kind:"recognition". */
  grantsVoice: boolean;
  /** Recognition decay — see F3. */
  decay: { mode: "none" | "season" | "halflife"; halflifeDays?: number };
  /** Are per-person totals public? Default false: stories public, totals private. */
  publicTotals: boolean;
  /** Monthly issuing budget per member, multiplied by capability level. */
  monthlyBudget?: number;
  maxPerRecipientPerCycle?: number;
  requireMessage: boolean;
}
```

**Amora's default set:**

```ts
currencies: [
  {
    id: "gratitude", name: "Gratitude", nameLower: "gratitude",
    kind: "recognition",
    fiatExchangeable: false,   // <-- CHANGED. Symbolic. It buys nothing.
    peerGivenOnly: true,       // <-- the system never auto-issues it
    grantsVoice: false,        // <-- invariant
    decay: { mode: "season" },
    publicTotals: false,
    monthlyBudget: 100, maxPerRecipientPerCycle: 1, requireMessage: true,
  },
  {
    id: "seeds", name: "Seeds", nameLower: "seeds",
    kind: "compensation",
    fiatExchangeable: true,    // <-- gates F9 ratification
    peerGivenOnly: false,      // contracted work is issued on agreement
    grantsVoice: false,
    decay: { mode: "none" },
    publicTotals: false,
    requireMessage: false,
  },
  // "voice" kind is reserved — Amora holds Voice tokens on Hypha, not here (F9).
]
```

> **Rye's note, honoured:** *"Gratitude and voice tokens are separate by design.
> We'll keep it this way."* — encoded as the `grantsVoice` invariant + a startup
> assertion (F4).

**Migration:** `users.heartsBalance` (legacy name, predates the Gratitude rename)
becomes `users.balances: { [currencyId]: number }`. Write a one-time migration in
`ensureDataFiles()` that moves `heartsBalance` → `balances.gratitude` and leaves the
old field in place for one release.

### 1.2 Quest pricing (F1)

```ts
quests: {
  /** "unpriced" (default): reward is NOT shown before the act; recognition is
   *  retroactive and discretionary. "priced": show the amount up front.
   *  "range": show a band. */
  pricing: "unpriced" | "priced" | "range";
  /** Which currency a consented quest may credit, if any. */
  rewardCurrencyId: string | null;
}
```
**Default:** `{ pricing: "unpriced", rewardCurrencyId: "gratitude" }`.

> **Rye's note, honoured:** *"Yes unprice gratitude flows as default but let projects
> price if they want."*

### 1.3 Progression (F10)

```ts
progression: {
  /** "capabilities" (default): rights are earned PER DOMAIN.
   *  "ladder": the old global 12-stage rank.
   *  "both": ladder shown as narrative, capabilities carry the rights. */
  mode: "capabilities" | "ladder" | "both";
}
```
**Default:** `"both"` for Amora (keep the Path of Growth as *story*, move *rights*
to domains). New projects default to `"capabilities"`.

### 1.4 Governance

```ts
governance: {
  /** Consent requires a written reason (F6). */
  requireConsentReason: boolean;        // default true
  /** Objections must cite the domain's aim (F6). */
  requireObjectionCitesAim: boolean;    // default true
  /** Every agreement must carry a review date (F5). */
  requireReviewDate: boolean;           // default true
  defaultReviewDays: number;            // default 180
  /** Financial stake → voice mapping. NEVER auto-derived (F11). */
  stakeGrantsVoice: false;              // literal type — cannot be enabled in config
  /** Ratification provider for fiat-exchangeable movement (F9). */
  ratification: { provider: "none" | "manual" | "hypha"; hyphaDaoUrl?: string };
}
```

### 1.5 Land & tenure (F15)

```ts
land: {
  tenureModel: "spiritual-trust" | "clt" | "condominium" | "custom";
  tenureSummary: string;   // shown on the site; admin-editable
  /** Forward-looking: never hardcode a single site. */
  sites: [{ id: "amora", name: "Amora", area: "266 acres", location: "Dominicalito, CR" }];
}
```
**Amora default:** `tenureModel: "spiritual-trust"` —

> **Rye's model, honoured:** *"a church owns the land and it's held in spiritual
> trust forever, and the economic game we build on it is how we make decisions and
> coordinate resources on the land and across other lands."*

**Design constraint from that sentence:** *"and across other lands"* means the data
model must be **multi-site from day one**. Every domain, role, agreement, and
resource carries an optional `siteId`. Do not assume one place.

---

# Part 2 — Work items

---

## F1 — Un-price the quests (Critical)

**Status:** SPEC

**Symptom:** `data/quests-seed.json` / `data/quests.json` carry a `gratitude: "40–80"`
string rendered on every quest card *before* the person acts. `client/src/pages/Quests.tsx`
displays it next to a Heart icon.

**Root cause:** This is the exact engagement-contingent reward shown to undermine
intrinsic motivation (d = −0.40). It prices the swale. Once someone can compute
"clear the swale = 50 Gratitude," it's a transaction, and the daycare-fine result
says the damage doesn't reverse when you remove the price.

**Fix:**
- Add `quests.pricing` to `gameConfig.ts` (§1.2). Default `"unpriced"`.
- `Quests.tsx`: when `pricing === "unpriced"`, **do not render the amount**. Render
  the quest's *impact* line instead (already in the data: `quest.impact`).
- Keep the amount in the data — the team still uses it as guidance in the consent
  queue. It is admin-facing, not public.
- Admin Quest Claims: keep the amount field on consent (that's retroactive and
  discretionary — the good pattern).
- Add to the Setup Wizard "Numbers" step: a Quest pricing selector with a one-line
  explanation of the trade-off, so a project can opt into pricing knowingly.

**Files:** `shared/gameConfig.ts`, `client/src/pages/Quests.tsx`, `client/src/pages/Admin.tsx` (wizard + claims).

**Acceptance:**
- Default build: no Gratitude figure visible anywhere on `/quests` to a visitor.
- Setting `pricing: "priced"` restores the figure.
- The consent queue still shows and credits an amount.

---

## F2 — Split recognition from compensation (Critical)

**Status:** SPEC

**Symptom:** One instrument (`Gratitude`) is simultaneously a symbolic thank-you
(Wall), a quest reward, a dues offset, and pegged 1:1 to USD. It's a wage wearing a
thank-you costume.

**Root cause:** Fungibility is what triggers crowding-out. Barnstars work because
they buy nothing. The moment recognition converts to money, the full −0.40 applies.

**Fix:**
- Implement the `currencies[]` array (§1.1). Replace every `GAME_CONFIG.currency.*`
  read with a currency lookup by id.
- `users.balances: { [currencyId]: number }` + migration from `heartsBalance`.
- Gratitude becomes `fiatExchangeable: false`, `peerGivenOnly: true`. **Remove the
  "1 Gratitude = $1 USD" claim and the dues-offset language** from all copy
  (`CoCreatorsGuide.tsx`, `ResidentJourney.tsx` Village Dues section, `server`
  DEFAULT_WORK_WITH_US note). Dues offsets move to the compensation currency.
- Admin: a **Currencies** editor (list, add, edit; kind/decay/budget/flags), under
  Site Content. Guard: setting `grantsVoice: true` on a `recognition` currency is
  rejected server-side with a clear error (F4).
- The Work With Us reciprocity option "Tokens" maps to the compensation currency.

> **Rye's note, honoured:** *"Yes to having projects decide how many currencies they
> want and for what tasks."* — hence an array, not a pair.

**Files:** `shared/gameConfig.ts`, `server/index.ts`, `client/src/pages/Admin.tsx`,
`client/src/components/GameDashboard.tsx`, `client/src/pages/GratitudeWall.tsx`, copy files.

**Acceptance:**
- A project can define 1..N currencies; UI renders each by name.
- Gratitude cannot be configured to grant voice (server rejects).
- No "1 Gratitude = $1" copy remains.

---

## F3 — Season-scope recognition; stories public, totals private (High)

**Status:** SPEC

**Symptom:** `heartsBalance` only ever increases. It's a tenure counter, not a
reputation. Couchsurfing's references saturated to uniformly-positive noise and the
signal died.

**Fix:**
- Implement `currency.decay`. `mode: "season"` = balances reset (archived, not
  deleted) at season close; `halflife` = exponential decay by `halflifeDays`.
- Archive per-season totals to `data/recognition-history.json` so the story is kept.
- `publicTotals: false` (default): the Wall shows **messages and names, never
  amounts** (already true — keep it). Profile shows *"what people keep thanking you
  for"* as recurring themes, not a leaderboard number.
- **No public leaderboard.** Ever, by default. (Pre-award gaming + status anxiety.)

**Files:** `server/index.ts` (season close job), `client/src/components/GameDashboard.tsx`.

**Acceptance:** At season close, current-cycle recognition archives and resets; the
Wall's history is intact; no per-person total is publicly visible.

---

## F4 — Firewall recognition from voice (invariant) (Critical)

**Status:** SPEC

**Fix:** Not a feature — a **constraint**:
- Startup assertion in `ensureDataFiles()`/config load: any currency with
  `kind: "recognition" && grantsVoice: true` → log a fatal config error and refuse
  to boot. Same for `governance.stakeGrantsVoice !== false`.
- Server rejects PUTs that would violate it.
- Add a test: `server/invariants.test.ts`.

**Why:** DAO reality — 1.77% mean turnout, top holder ~35% of power, a 4%-supply
wallet vetoing a $1M grant. This is the one door that must be welded shut.

**Acceptance:** Config violating the invariant fails loudly at boot, not silently at runtime.

---

## F5 — Domains + review-dated agreements as first-class objects (Critical)

**Status:** SPEC

**Symptom:** The Command Centre is a flat timeline + a localStorage discussion tab.
There is no model of *who decides what, within what bounds, reviewed by when*.

**Root cause:** Domain ambiguity — not bad voting — is what most community
dysfunction actually is. Time-boxed agreements are what make "good enough for now"
honest instead of rhetorical.

**Fix:**

`data/domains.json`:
```ts
Domain {
  id, siteId?, name,            // "Land Circle"
  aim: string,                  // what it exists to do
  constraints: string[],        // what it may not do
  parentDomainId?: string,      // nested enterprises (Ostrom P8)
  stewardUserIds: string[],
  reviewOn: string,             // ISO — domains expire too
}
```

`data/agreements.json`:
```ts
Agreement {
  id, domainId, siteId?, title, body,
  authorId,                                  // for F13 authorship concentration
  status: "draft"|"sensing"|"proposed"|"consented"|"active"|"expired"|"amended"|"retired",
  reviewOn: string,                          // REQUIRED (governance.requireReviewDate)
  consents:   [{ userId, reason, at }],      // reason REQUIRED (F6)
  objections: [{ userId, reason, citesAim, at, resolvedAt? }],
  concerns:   [{ userId, text, at }],        // non-blocking, recorded (F6)
  outcome: { text, changedBy, cost?, at } | null,  // REQUIRED to close (F7)
  execution?: { kind: "variable_change"|"token_move"|"none", payload, ratificationId? }, // F8/F9
  createdAt,
}
```

Endpoints: full CRUD for domains (admin) + agreements (member, scoped by capability),
`POST /api/agreements/:id/consent`, `/objection`, `/concern`, `/outcome`.

UI: **the Steward home screen becomes a domain map**, not an inbox. Each domain card
shows aim, steward(s), active agreements, and **what's expiring soon**.

**Acceptance:** An agreement cannot reach `consented` without ≥1 consent-with-reason
and zero unresolved objections; cannot be created without a `reviewOn`; expiring
agreements surface automatically.

---

## F6 — Consent costs a sentence; objection is cheap; concerns are separate (High)

**Status:** SPEC

**Root cause:** The most damaging documented failure is *passive consent* — "subtle
pressure not to object," so decisions pass without real support. A silent click is
the software equivalent. Meanwhile unexpressed dissent doesn't evaporate — it exits
as departure or rupture.

**Fix:**
- Consent requires a **written reason** ("why is this safe enough to try?") when
  `governance.requireConsentReason` (default true). No one-click consent.
- Objection is **one click + a reason**, and must cite the domain's aim when
  `requireObjectionCitesAim`. Objecting must never be harder than consenting.
- **Concerns channel**: non-blocking, recorded, visible. This is the early-warning
  system for the conflicts that actually kill communities.
- **Async-first with a hard deadline.** Someone who couldn't attend must be able to
  object in-channel with equal weight inside the window. This neutralises
  time-privilege (the system otherwise favours whoever has free afternoons).
- Decisions have a **default outcome on deadline** — quorum failure is the norm;
  never let a proposal stall forever.

**Acceptance:** Silent consent is impossible; objection ≤ consent in effort;
concerns are queryable per domain.

---

## F7 — Close every input→outcome loop (High)

**Status:** SPEC

**Root cause:** Decide Madrid. Cobudget's own retrospective: they *"found it
difficult to get bucket proposers to report back."* Invisible consequence kills
participation.

**Fix:**
- `Agreement.outcome` is **required** before status can become `active`→closed.
  What changed, who did it, what it cost.
- Every proposal renders its downstream consequence in the UI.
- Nightly job: agreements consented >30 days ago with `outcome === null` surface to
  the domain steward as **overdue**.
- Same for `submissions`: an accepted Work With Us proposal should link to the
  agreement or quest it became.

**Acceptance:** No consented agreement can sit indefinitely without an outcome
without appearing on an overdue list.

---

## F8 — Rule-change executable in-app (High)

**Status:** SPEC — **port the ReGen Civics model**

> **Rye's note:** *"This is the case in regen civics and we should copy this model
> over into the custom game, 100%."*

**Root cause:** Ostrom Principle 3 (those affected can change the rules) is the
principle software violates most — rules are hardcoded by developers and the platform
becomes a dictatorship with a nice UI.

**Fix — port from ReGen Civics (see its `game_variables` / `governance_executions`
/ Evolution Engine, and `.ai/docs/DECISIONS.md` ADR-29):**
- `data/game-variables.json`: `{ key, value, min, max, unit, description }` — every
  tunable in this document (budgets, decay, accept amounts, review defaults, quest
  pricing) becomes a variable with **bounds**.
- Admin **Game Mechanics** page: fully data-driven, shows every variable, its bounds,
  and its description. No hardcoded help text.
- An agreement with `execution.kind === "variable_change"` that reaches `consented`
  applies the change **through a bounds-checked path**, attributed to a provisioned
  bot user, recorded **append-only** in `data/governance-executions.json` with
  before/after.
- **Bounds themselves are code-owned** for the invariants (F4) — the leash geometry
  is never governed. Everything else's bounds can be changed by a `bounds_change`
  agreement, so "propose a bounds change first" has a real door.
- Idempotency: one execution per agreement id (unique constraint).

**Acceptance:** A community can change a game variable end-to-end through consent,
within bounds, with an append-only record — no deploy. Invariant bounds are refused
at both layers.

---

## F9 — Ratification gates fiat-exchangeable movement (High)

**Status:** SPEC

> **Rye's note:** *"This is why we vote on blockchain (Hypha) and why those votes are
> required to move tokens that are exchangeable to fiat."*

**Root cause:** Auroville — a 98%-vs-board override cost ~US$28M. The vote-vs-outcome
divergence must be structurally impossible to hide, and money movement must be gated
on a vote that isn't ours to forge.

**Fix:**
- Any agreement whose `execution.kind === "token_move"` on a currency with
  `fiatExchangeable: true` **requires ratification** before it executes.
- Pluggable provider (`governance.ratification.provider`):
  - `"none"` — such moves are simply disallowed (safe default for a new fork).
  - `"manual"` — an admin records the off-platform outcome; stamped with who
    confirmed it and when (provenance: `relay: "admin"`).
  - `"hypha"` — the proposer pastes the Hypha proposal URL; the numeric proposal id
    lands on the agreement; a webhook applies the outcome (`relay: "webhook"`).
    Port ReGen's `applyRatificationOutcome` shape: **one shared function used by both
    the webhook and the admin fallback**, so status transitions/provenance can't drift.
- **Append-only decision log** with recorded divergence: if a ratified outcome
  contradicts the in-app consent, record it as a first-class `divergence` event and
  surface it. Never silently overwrite.

**Acceptance:** A fiat-exchangeable move cannot execute without a recorded
ratification; the log is append-only; divergence is a visible event, not a silent
overwrite.

---

## F10 — Stages → per-domain capabilities, not global rank (High)

**Status:** SPEC

**Symptom:** A global 12-stage ladder (Visitor→Sage) computed in `computeStage()`,
rendered as a rank on every profile.

**Root cause:** *A ladder converts a community into a hierarchy, and status ladders
factionalize communities.* Real cohousing practice earns rights **per domain by
demonstrated participation** — not by arrival date or capital.

**Fix:**
- `data/memberships.json`:
  ```ts
  Membership { userId, domainId, level: "observer"|"participant"|"consenting"|"steward",
               earnedAt, criteriaMet: string[], grantedBy?: string }
  ```
- **Rights are per-domain.** A Resident may hold `consenting` in the Kitchen circle
  while being `observer` in Land. Capability checks read this table — never the ladder.
- `progression.mode`:
  - `"both"` (Amora default): the Path of Growth stays as **narrative** on the
    profile (it's beautiful and it's their culture) — but it **confers nothing**.
  - `"capabilities"`: ladder hidden entirely.
- The recognition **budget multiplier** moves from stage → highest capability level.
- Keep the "governance training completed" gate as a **checkable, expiring credential**
  (real cohousing practice).

**Acceptance:** Removing the ladder entirely (`mode: "capabilities"`) changes no
permission anywhere. That's the test that rights truly moved.

---

## F11 — Separate financial stake from voice; make the mapping consentable (Critical)

**Status:** SPEC

**Root cause:** Called "the most consequential architectural choice you'll make."
Money buying immediate governance weight is the fastest known route to founder's-
syndrome dynamics with extra steps — and the Investor persona is exactly where it enters.

**Fix:**
- `users.financialStake` and voice/capability live in **separate tables**. No code
  path derives one from the other. `governance.stakeGrantsVoice` is the literal
  type `false` — not a boolean (F4 asserts it).
- If a community *wants* stake to influence anything, that mapping must be an
  **Agreement in a domain, with a review date** — i.e. it goes through F5/F8 like any
  other rule. It is never a config default.
- The Investor read-view shows **stake, milestones, and the living village** — never
  a governance lever.

**Acceptance:** Grep proves no code path reads `financialStake` to compute a
capability. The invariant test covers it.

---

## F12 — Design exit before it's needed (High)

**Status:** SPEC

> **Rye's note:** *"Yes we need an exit from the get-go!"*

**Root cause:** Sociocracy provides **no exit mechanism at all**. Communities
improvise it, badly, under maximum stress — and exit valuation with capital in the
ground is the highest-stakes decision the software will ever touch.

**Fix:**
- `data/exit-policy.json` (admin-editable, and itself an Agreement subject to review):
  ```ts
  {
    voluntary:  { noticePeriodDays, valuationMethod, unwindSteps: string[] },
    involuntary:{ decidingDomainId, appealDomainId, process: string[] },
    restorative:{ intakeContactRole, steps: string[] }
  }
  ```
- `data/exits.json`: `Exit { id, userId, kind: "voluntary"|"involuntary", status, openedAt, agreementId?, resolution? }`.
- **Restorative flow, hard rule:** never make a person the subject of a consent
  decision in a general forum. Private intake → facilitated repair → agreement with a
  review date. **Only the agreement and its status enter the ledger. The content never does.**
- Publish the exit policy on the site (a community that can't see its exit terms
  doesn't really have them).

**Acceptance:** A v1 fork ships with a documented, consented exit path for both
directions; interpersonal harm cannot be routed to a public thread.

---

## F13 — Community health metrics (Medium) — **INSTRUMENT NOW, DASHBOARD LATER**

**Status:** SPEC — *Rye: "Yes! but we'll wait on this."*

**Fix now (cheap, and the data is unrecoverable retroactively):** emit and store the
events. **Defer** the dashboard UI.
- Persist: agreement `authorId`, consent `reason` presence/length, objection author +
  target, per-person last-active, participation per domain.
- `data/health-events.json` (append-only).

**Later (the dashboard):** authorship concentration ("62% of Land proposals came from
one person this quarter"), silent-consent rate, objection-rate-against-author trending
to zero (*worse* than high), per-person engagement decline (the leading indicator of a
departure), domain accumulation per person.

**Acceptance:** The events exist and are queryable. No UI required this phase.

---

## F14 — Fund the broker; don't crowdsource coordination (High)

**Status:** SPEC

> **Rye's note:** *"Yes, for sure roles are central and paid!"*

**Root cause:** The clearest empirical divide in the whole review. Every collapsed
time bank/LETS relied on volunteer enthusiasm. Sardex works because it *pays* ~12
Community Trade Advisors and charges membership fees to fund them. "Decreasing
volunteer enthusiasm" is the named cause of death.

**Fix — port ReGen's seasons/roles/bands model (see `SEASONS_HISTORY.md`):**
- `data/roles.json`:
  ```ts
  Role { id, siteId?, domainId, seasonId, name, aim, band: 1..7,
         compensation: { currencyId, amount },
         holderUserId?, seed?: string, harvest?: string,
         ratings?: { scope, comp, impact } }   // self-rated at season close
  ```
- Roles are **seasonal, compensated, and rated at close** — the ratings feed the next
  season's bands (ReGen's cross-season tracking table).
- **Quest Steward / matchmaker is a funded role**, not a volunteer hope. Automate
  *around* the broker (surface unmatched quests, stale claims, unfilled roles) — never
  *instead of* them.
- Unfilled role → work routes to the domain's open board (ReGen's open-to-circle).
- Admin **Roles & Seasons** editor; public Roles page reads it (retire the hardcoded
  `Roles.tsx` content).

**Acceptance:** A season can be opened with N compensated roles, holders assigned,
work routed to holders (or the open board), and rated at close.

---

## F15 — Land, tenure, and multi-site (Medium)

**Status:** SPEC

> **Rye's model:** *"a church owns the land and it's held in spiritual trust forever,
> and the economic game we build on it is how we make decisions and coordinate
> resources on the land and across other lands."*

**Fix:**
- `land` config (§1.5) with `tenureModel: "spiritual-trust"` default for Amora;
  `tenureSummary` admin-editable and published on the site.
- **Multi-site from day one:** `sites[]`, and an optional `siteId` on Domain, Role,
  Agreement, and any resource. *"Across other lands"* is a stated requirement — do not
  build a single-site assumption we have to unpick later.
- **Two accounting regimes** (critical, and easy to get wrong): land/physical
  resources are **rivalrous → restraint-based** (booking, carrying capacity, stewardship
  limits). Contribution/knowledge is **non-rivalrous → stimulus-based** (recognition).
  One model for both silently rebuilds extraction.
- Findhorn's lesson: tenure *is* governance legitimacy. Whatever the model, make its
  terms **queryable objects**, not a PDF in Drive.

**Acceptance:** Tenure model is config; the site renders its own tenure story; no
code path assumes exactly one site.

---

## F16 — The smaller fixes (bake in) (Medium)

**Status:** SPEC

1. **Four read-views over one ledger — not one feed.** Four personas = four
   cold-start problems; Investors and Residents will never seed each other's feeds.
   One `agreements`/`activity` ledger, four scoped home views (Investor: stake +
   milestones + village life; Steward: domain map + expiring agreements; Resident:
   next step + neighbours; Creator: proposal pipeline + funded roles).
2. **The pulse must never read empty.** `VillagePulse` currently returns `null` when
   there are no events — better than showing "nothing," but an empty social feed is a
   *negative* signal that repels. When social activity is quiet, **fall back to land
   and season state** ("Dry season, week 3 · Site planning underway"). The village is
   never doing nothing.
3. **Notification budget.** One **weekly digest scoped to your domains**, per-item
   opt-in. Loomio's #1 complaint is "constant bombardment"; **52% of users who disable
   push eventually churn**. Notification design *is* governance design.
4. **Track commitments, not activity — and the member owns their record.** Hours
   pledged vs met beats engagement metrics. Communities with labour requirements *and*
   a tracking method report **higher morale and lower burnout** — but the tracked
   person must control the record. Visible mutual obligation reduces burnout;
   surveillance triggers revolt. The difference is who holds the pen.
5. **Retroactive over prospective.** Where a reward exists at all, prefer recognising
   what happened over advertising what will be paid. Prospective bounties manufacture
   mercenaries (Web3's "contributor extractable value").

---

# Part 3 — Priority order

| Phase | Items | Why this order |
|---|---|---|
| **1 — Stop the harm** | F1, F2, F4 | Cheap, and they prevent the failure modes hardest to reverse once a culture forms. Un-price before anyone learns the price. |
| **2 — The spine** | F5, F6, F7 | Domains + review-dated agreements + closed loops. Everything else hangs off this model. |
| **3 — Power & safety** | F10, F11, F12 | Rights per domain, stake≠voice, exit exists. |
| **4 — Self-governance** | F8, F9 | Port ReGen's Evolution Engine + Hypha ratification. Needs F5 first. |
| **5 — Sustain** | F14, F3, F15 | Paid roles + seasons + decay + tenure/multi-site. |
| **6 — Polish** | F16, F13 (instrument only) | Read-views, pulse, notifications, commitments. |

**Do not build phase 2+ before phase 1.** F1/F2 are a few hours; they're the ones
that change what the community *becomes*.

---

# Handoff Breakdown — Who Does What

### YOU (Rye) — things only you can do

| # | Task | Why only you | Command / Where |
|---|------|-------------|-----------------|
| 1 | Set `ANTHROPIC_API_KEY` + `RESEND_API_KEY` on the Amora service | Cross-project secret access is blocked for the agent; values live in the ReGen Civics project | `cd /c/Users/taren/Desktop/Amora/game-amora` then `railway variables --set "ANTHROPIC_API_KEY=<v>" --set "RESEND_API_KEY=<v>"` (auto-redeploys) |
| 2 | Connect Railway → GitHub for auto-deploy | One-time OAuth in browser | Railway → Amora Game → Settings → Source → Connect Repo |
| 3 | Set the 4 pathway notification emails | Browser login to admin | `/admin` → Notifications → Email Settings |
| 4 | Verify Resend sender domain `amora.cr` | DNS record on your host | resend.com → Domains |
| 5 | **Decide: does Gratitude keep any fiat peg?** (F2) | Economic policy, not an engineering call | Tell the next session: symbolic-only (recommended) or keep a peg |
| 6 | **Name the compensation currency** (F2) | Yours to name — spec assumes "Seeds" as a placeholder | Tell the next session |
| 7 | **Provide the initial domains/circles** (F5) | The community's real structure — aims + constraints per circle | Tell the next session, or seed via `/admin` once built |
| 8 | **Provide the exit policy terms** (F12) | Legal/community decision (valuation, notice, appeal) | Tell the next session |
| 9 | Confirm the Hypha DAO URL + webhook wiring (F9) | External account + on-chain setup | ReGen already has this — point the next session at the working config |

### CLAUDE CODE — can be done without you

| # | Task | Status |
|---|------|--------|
| F1 | Un-price quests + pricing lever | SPEC — ready to build |
| F2 | Multi-currency model + migration | SPEC — blocked on Rye #5/#6 for naming only; structure can land first |
| F3 | Recognition decay + season archive | SPEC |
| F4 | Invariant assertions + tests | SPEC — ready |
| F5 | Domains + agreements model, endpoints, domain-map UI | SPEC — ready (aims/constraints seed needs Rye #7) |
| F6 | Consent-with-reason, objections, concerns, deadlines | SPEC — ready |
| F7 | Outcome required + overdue job | SPEC — ready |
| F8 | Port game-variables + governance-executions from ReGen | SPEC — read ReGen's Evolution Engine first |
| F9 | Ratification provider (none/manual/hypha) + divergence log | SPEC — hypha mode needs Rye #9 |
| F10 | Per-domain capabilities; ladder → narrative | SPEC — ready |
| F11 | Stake/voice separation + invariant | SPEC — ready |
| F12 | Exit + restorative flow | SPEC — terms need Rye #8; structure can land first |
| F13 | Health event instrumentation (no dashboard) | SPEC — ready |
| F14 | Roles/seasons/bands port + funded broker | SPEC — ready |
| F15 | Land config + multi-site `siteId` | SPEC — ready |
| F16 | Read-views, pulse fallback, digest, commitments | SPEC — ready |
| — | Update `PLATFORM_FOUNDATION.md` with the new levers | SPEC |
| — | Deploy each phase via `railway up --ci` | Manual until Rye #2 |

### WAITING ON YOU before Claude Code can proceed

- **F2 naming + peg decision** (Rye #5, #6) — the structure can be built first, but the
  currency can't ship until named and the peg question is answered.
- **F5 domain seed** (Rye #7) — the model can ship with Amora's four existing circles as
  a placeholder; real aims/constraints need you.
- **F12 exit terms** (Rye #8) — flow can ship; the actual terms are a community decision.
- **F9 Hypha mode** (Rye #9) — `manual` provider ships now; `hypha` needs the DAO/webhook config.

---

## Notes for the next session

- **Read `PLATFORM_FOUNDATION.md` first.** The brand-overlay pattern
  (`gameConfig.ts` defaults ← `data/brand.json` overlay ← `/api/game/config` merge)
  is how every lever here should be exposed. Blank = inherit the default.
- **Seeds live in `server/seeds/`, never `data/`** — a mounted volume shadows anything
  the image had at `data/`. This bit us once already.
- **Deploys are manual** (`railway up --ci -m "..."`) until GitHub is connected.
- **Data volume** is mounted at `/app/data` — all runtime state lives there.
- Every item above should land as: config lever + evidence-based default + admin
  editor + acceptance test. If you find yourself hardcoding a community's opinion,
  stop — that's a lever you missed.
- **The invariants (F4, F11) are the only things that must NOT be configurable.**
  Everything else is the project's call.
