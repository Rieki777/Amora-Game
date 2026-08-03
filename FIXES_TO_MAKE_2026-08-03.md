# Fixes to Make — 2026-08-03

This document continues from `FIXES_TO_MAKE_2026-08-02_ROLE_MODEL.md`. Full narrative context and screenshots-in-words are in `SITE_AUDIT_2026-08-03.md` — read that first if a task below is confusing on its own.

Triggered by: a screenshot of the Circles page showing "Key Focus Areas" pills as near-invisible white-on-white text. Root-caused to an undefined CSS class (`bg-sage-light`) used with no fallback, which turned out to repeat across several other pages with a few different missing-class names. All tasks below are pure front-end fixes — none require `DATABASE_URL` or a Railway redeploy of anything beyond the normal `git push`.

---

## Task A — Undefined "-light" color classes render invisible/missing backgrounds (Critical)

**Status:** NOT CODED

### The problem

`client/src/index.css` only defines these background utility classes: `bg-teal-deep`, `bg-teal`, `bg-teal-light`, `bg-aqua`, `bg-aqua-light`, `bg-cream`, `bg-amber`, `bg-gold`, `bg-coral`, `bg-sage`, `bg-forest`, `bg-cyan-brand`. Several places in the code assume additional "-light" variants exist that were never added: `bg-sage-light`, `bg-amber-light`, `bg-green-light`. Since Tailwind can't style a class it's never been told about, these render with **zero background** — leaving white icons/text/pills invisible against whatever's behind them.

### Fix — add the missing tokens to `client/src/index.css`

Add alongside the existing brand tokens in the `@theme inline` block (near line 93-106), matching the WCAG-AA-vs-white-text care already taken for `--color-gold`/`--color-coral`/`--color-sage`:

```css
/* Add inside the existing @theme inline block, after --color-sage / --color-forest */
--color-sage-light: #6b9c78;    /* lighter tint of --color-sage (#3d6e4a), ~3.4:1 vs white — pair with dark text if used for text-on-light, fine for white icon/pill use at this size */
--color-amber-light: #f0c98a;   /* lighter tint of --color-amber (#ecb163) */
--color-green-light: #7fae74;   /* distinct "land/forest" light green, sits between --color-sage and --color-forest */
```

Then add matching utility classes in `@layer components` next to the existing `.bg-sage` / `.bg-coral` block (~line 316):

```css
.bg-sage-light {
  background-color: var(--color-sage-light);
}

.bg-amber-light {
  background-color: var(--color-amber-light);
}

.bg-green-light {
  background-color: var(--color-green-light);
}
```

**Important:** run each new color through the same contrast check the CSS comments describe for the existing tokens (white icon/text at the sizes actually used: ~24px icons and text-xs pill labels) before shipping — the hex values above are a reasonable starting point, not verified against every use site.

### Where this fixes things automatically, no other code changes needed

- `client/src/pages/Circles.tsx` — Community Circle, Community Life Council (both `bg-sage-light`, from live CMS data)
- `client/src/pages/Roles.tsx` — Social Media Steward, Community Engagement Steward (both `bg-sage-light`, from live CMS data)
- `client/src/pages/CoCreatorsGuide.tsx` — "The Four Spaces" section: Resident Space (`bg-sage-light`), Prosperity Space (`bg-amber-light`), Land Stewardship Space (`bg-green-light`) card backgrounds, plus the "Regenerative Loop" pill at line 571 (`bg-sage-light`)
- `client/src/pages/Home.tsx:393` — "Costa Rican & LatAm Professional" persona card icon swatch (`bg-sage-light/40`)
- `client/src/pages/GoodNeighbor.tsx:95` — criterion 5 icon swatch (`bg-sage-light/40`)

**Acceptance criteria:** visit `/circles`, expand "Community Circle" — icon swatch and all three focus-area pills show a visible tinted background with legible white text. Visit `/co-creators-guide`, scroll to "The Four Spaces" — all four cards show a tinted background matching "Village Steward Space." Visit `/` (Home), scroll to "Who Comes to Amora?" — all six persona cards show a colored icon swatch.

---

## Task B — Two more undefined classes, different words (Medium)

**Status:** NOT CODED

- `client/src/pages/HowWeCreate.tsx:461` — `bg-cream-dark` is undefined. Either add a `--color-cream-dark` token + `.bg-cream-dark` class (a slightly deeper shade of `--color-cream` #efe8d7), or simplest: just change the class to the existing `bg-cream`.
- `client/src/pages/InvestorJourney.tsx` (lines 594, 602, 612, 811, 873) — `hover:bg-teal-deep-dark` is undefined, so five CTA buttons have no hover feedback. Either add a `--color-teal-deep-dark` token, or simplest: change to the existing `hover:bg-teal` (already used as the standard hover state for `bg-teal-deep` elsewhere, e.g. `.btn-amora:hover` in index.css).

**Acceptance criteria:** the HowWeCreate CTA box shows a visible background tint; hovering any of the five flagged Investor Journey buttons visibly darkens/changes the background.

---

## Task C — Defensive fallback for CMS-driven `color` field (High — prevents recurrence)

**Status:** NOT CODED

Task A fixes today's instances, but `Circles.tsx` and `Roles.tsx` render whatever string is stored in admin-editable content with no validation — the next typo entered through the Admin panel will reproduce this exact bug. `client/src/pages/VillageMap.tsx` already solves this correctly elsewhere in the same codebase (a `TONE` lookup resolving to a CSS variable with a safe fallback) — copy that pattern.

**`client/src/pages/Circles.tsx`** (`CircleCard`, ~line 53-54) and **`client/src/pages/Roles.tsx`** (`RoleCard`, ~line 92, `role.color || "bg-sage"`) — add an allowlist and fall back to a known-good class instead of trusting the raw value:

```tsx
const VALID_COLORS = new Set([
  "bg-teal-deep", "bg-teal", "bg-teal-light", "bg-aqua", "bg-aqua-light",
  "bg-cream", "bg-amber", "bg-amber-light", "bg-gold", "bg-coral",
  "bg-sage", "bg-sage-light", "bg-green-light", "bg-forest", "bg-cyan-brand",
]);
function safeColor(input?: string, fallback = "bg-sage") {
  if (!input) return fallback;
  const base = input.split("/")[0]; // strip any opacity suffix like "/40" before checking
  return VALID_COLORS.has(base) ? input : fallback;
}
```

Then use `safeColor(circle.color)` / `safeColor(role.color)` everywhere `circle.color` / `role.color` is currently interpolated directly.

**Acceptance criteria:** temporarily set a circle's `color` to a nonsense string via the Admin panel — icon swatch and pills should fall back to the sage color rather than disappearing.

---

## Task D — Low-contrast white text on `bg-teal-deep` (Medium — WCAG AA)

**Status:** NOT CODED

Small captions at `text-white/45` through `text-white/60` on `bg-teal-deep` (#157f7d) compute to roughly 2.2–2.8:1 contrast — below the 4.5:1 AA minimum for normal text. `bg-teal-deep` is a mid-tone, not dark enough to carry this much fade at small sizes (contrast this file's own carefully-chosen `--color-gold`/`--color-coral`/`--color-sage`, all deliberately dark enough for AA-safe white text — this is the same bar, just missed here).

Files/lines:

| File | Lines | Context |
|------|-------|---------|
| `components/SeasonBanner.tsx` | 24, 46, 51 | season-goal/days-left captions — renders on Home page |
| `components/GameDashboard.tsx` | 40 | "Your next step" label — renders on Profile page |
| `components/InvestorSummary.tsx` | 80, 84, 106 | field labels (`/60`), placeholder values (`/50`), **legal disclaimer text (`/45`)** |
| `pages/ProjectHistory.tsx` | 1695, 1703 | progress captions |
| `pages/JourneyToLaunch.tsx` | 282, 288 | progress captions |
| `pages/MasterPlan.tsx` | 113 | stat labels (`/70`, closest to passing but still under 3.7:1) |
| `pages/InvestorJourney.tsx` | 664 | phase-unit caption |
| `pages/CoCreatorsGuide.tsx` | 266 | hero sub-caption |

**Fix:** bump every instance under `text-sm` to `/80` or higher, or replace with a dedicated solid light color (e.g. a new `--color-mist-on-teal` token) rather than an opacity fade. Prioritize `InvestorSummary.tsx`'s disclaimer text — that's the one place where illegibility is a real liability, not just a UX nit.

**Acceptance criteria:** re-check contrast on the above with a contrast checker at the actual rendered opacity; all should clear 4.5:1 (or 3:1 if the text genuinely qualifies as "large text" per WCAG).

---

## Task E — `alt=""` on meaningful user-generated images (Medium — accessibility)

**Status:** NOT CODED

Three pages mark real content photos as decorative (`alt=""`), even though a usable label is already in scope on the same line:

- `client/src/pages/Feed.tsx:211` — use `item.title` as alt text instead of `""`
- `client/src/pages/Stay.tsx:144` — use `a.name` as alt text instead of `""`
- `client/src/pages/Forum.tsx:313` — use `thread.title` as alt text instead of `""`

Low priority, skip for now: `components/IdentityPackPanel.tsx:100` (admin-only tool, no per-image name field exists).

**Acceptance criteria:** screen reader on Feed/Stay/Forum announces the photo's title/name instead of skipping it silently.

---

## Task F — Legacy CSS alias block is misleading dead code (Low — cleanup only, no live bug)

**Status:** NOT CODED

`client/src/index.css` lines 311-345 define `.bg-coral { background-color: var(--color-teal-deep); }` and `.text-gold { color: var(--color-amber); }` — i.e., "coral" resolves to teal, and "gold" (as `text-gold`) resolves to amber, even though distinct `--color-coral` and `--color-gold` variables are defined a few lines above and are clearly meant to be different colors. Verified this doesn't currently cause a live bug — Tailwind's auto-generated utilities from the `@theme inline` block win in the cascade wherever these classes are actually used bare — but it's a trap for the next person who edits this file expecting the alias to take effect. Recommend deleting the block or fixing it to reference `--color-coral`/`--color-gold` directly.

**Acceptance criteria:** no visual change (this is currently dead code); grep confirms no bare `bg-coral` usage anywhere before removing.

---

## Not a fix — flag for a product/design decision (informational only)

- **Nav has 17 top-level items** (Home, Your Path, Circles, Roles, Quests, Feed, Stay, Wallet, Badges, Library, Health, Forum, Map, Tools, Work With Us, How We Create, Launch Plan) plus notification bell, account menu, and "Main Site" button, all flat in the desktop header. Not broken, just dense — worth a deliberate look at whether some of these (Wallet, Badges, Library, Health, Map, Tools) belong under a grouped dropdown. This is a call for whoever owns the IA, not something to change unilaterally.
- **Mobile/tablet rendering of the above nav is unverified.** The browser tooling available this session couldn't produce a trustworthy narrow-viewport screenshot (window-resize commands succeeded but the capture stayed desktop-sized). Recommend an actual phone check before assuming the mobile menu handles 17 items gracefully.

---

## Handoff Breakdown — Who Does What

### YOU (Rye) — things only you can do

| # | Task | Why only you | Command / Where |
|---|------|-------------|-----------------|
| 1 | Optional data cleanup: change the 4 CMS content records' `color` field from `bg-sage-light` to a valid value like `bg-sage` (2 circles: "Community Circle", "Community Life Council"; 2 roles: "Social Media Steward", "Community Engagement Steward") | Content lives in the database, edited through the Admin UI you're already logged into — Claude Code can't reach `DATABASE_URL` from this sandbox | Admin panel → Circles / Roles content editor. **Optional** — Task A's CSS fix makes these render correctly either way; this just cleans up the underlying data so it isn't a landmine for the next editor. |
| 2 | Judgment call on nav grouping (17 top-level items) | Information-architecture decision, not a bug fix | Discuss with Claude Code once you've decided which items should move under a dropdown |
| 3 | Check the site on an actual phone/tablet | This session's browser tooling couldn't produce a real narrow-viewport screenshot | Just open amora.regencivics.earth on your phone |
| 4 | `git add -A && git commit && git push` once Claude Code has made the code changes, and confirm the Railway deploy | Standard repo/deploy step per this project's existing workflow | Your terminal / Railway dashboard |

### CLAUDE CODE — can be done without you

| # | Task | Status |
|---|------|--------|
| A | Add missing `--color-sage-light` / `--color-amber-light` / `--color-green-light` tokens + utility classes to index.css | NOT CODED |
| B | Fix `bg-cream-dark` (HowWeCreate.tsx) and `hover:bg-teal-deep-dark` (InvestorJourney.tsx ×5) | NOT CODED |
| C | Add color-allowlist fallback to Circles.tsx/Roles.tsx (copy VillageMap.tsx's safe pattern) | NOT CODED |
| D | Bump low-contrast `text-white/45-60` instances to `/80`+ across 8 files | NOT CODED |
| E | Fix `alt=""` on Feed.tsx, Stay.tsx, Forum.tsx to use in-scope title/name | NOT CODED |
| F | Clean up misleading legacy CSS alias block | NOT CODED |

### WAITING ON YOU before Claude Code can proceed

None of the coded tasks (A, B, C, D, E, F) are blocked on you — all can be implemented and verified without database or Railway access. Only the optional data-cleanup item (#1 above) and the nav IA decision (#2) need your input.
