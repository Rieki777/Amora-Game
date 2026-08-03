# Amora Site — Readability & Visual UI Audit 2026-08-03

Full readability/contrast/visual audit of the live site (amora.regencivics.earth), triggered by a screenshot showing the Circles page's "Key Focus Areas" pills rendering as nearly-invisible white text. That bug was fully root-caused and turns out to be one instance of a repeating pattern across the site. This document explains what's actually happening and where else it shows up. See `FIXES_TO_MAKE_2026-08-03.md` for the actionable task list.

Scope: all public-facing pages reachable from the main nav and footer, the underlying `client/src/index.css` design-token system, the CMS content APIs (`/api/content/circles`, `/api/content/roles`), and a source sweep of the remaining ~45 page/component files. Internal tools (Admin, Forum, Wallet, etc.) were spot-checked but not exhaustively walked page-by-page.

Method: live browser screenshots against the production site (logged in as Rye), cross-referenced against the actual source on your machine (`C:\Users\taren\Desktop\Amora\game-amora`), plus direct API calls to see exactly what content data ships. Every "broken" finding below was visually confirmed on the live site, not just inferred from source code.

---

## The headline bug, fully explained

Your screenshot showed the Community Circle's "Key Focus Areas" pills (Events & Hospitality, Campground & Stays, Governance & Team Health) as barely-visible white-on-white text. Here's exactly why.

`client/src/index.css` defines a fixed set of brand color utility classes: `bg-teal-deep`, `bg-teal`, `bg-teal-light`, `bg-aqua`, `bg-aqua-light`, `bg-cream`, `bg-amber`, `bg-gold`, `bg-coral`, `bg-sage`, `bg-forest`, `bg-cyan-brand` (plus matching `text-*` versions). That's the complete list — nothing else exists.

`Circles.tsx` and `Roles.tsx` both render a small icon swatch and a row of "pill" badges whose background color is whatever string is stored in that circle/role's `color` field, fetched live from `/api/content/circles` and `/api/content/roles`:

```tsx
// Circles.tsx line 73 (icon swatch) and line 125 (focus-area pills)
<div className={`w-12 h-12 ${color} rounded-lg ...`}><Icon className="w-6 h-6 text-white" /></div>
...
<span className={`px-3 py-1 rounded-full text-xs font-medium ${color} text-white shadow-sm`}>{area}</span>
```

I pulled the live content API directly:

```
curl -s https://amora.regencivics.earth/api/content/circles
```

"Community Circle" has `"color": "bg-sage-light"`. That class was never defined anywhere — not in the current CSS, not in the older/legacy version of the site I also checked. Tailwind can't generate styling for a class name it's never been told about, so `bg-sage-light` silently applies **no background at all**. The icon and the pill text are both hardcoded to `text-white`, so you end up with white text/icon on whatever's behind it (white card, or a very pale `bg-muted/30` panel) — i.e., invisible.

Screenshot comparison, live site, `/circles`, collapsed card row:

- **Outreach & Growth Circle** (`color: "bg-gold"`, a real class) → clean brown-gold square with a clearly visible white icon.
- **Community Circle** (`color: "bg-sage-light"`, not a real class) → the icon swatch is blank; you can just barely make out a ghost of the white icon against the white card.

Same root cause, same live API check, found this affects exactly **4 content records**: 2 circles ("Community Circle", "Community Life Council") and 2 roles ("Social Media Steward", "Community Engagement Steward"), all sharing the identical typo'd value `bg-sage-light`.

### It's not just the CMS-driven pages — it's a repeated typo across hand-written pages too

The same "-light" naming assumption (as if every brand color automatically has a lighter variant class) shows up hardcoded directly in page source, not just CMS data:

- **`CoCreatorsGuide.tsx`, "The Four Spaces" section** — this is the biggest hit, because it's hardcoded and hits **100% of visitors**, not a subset of CMS records. Of the 4 space cards, 3 use undefined classes as their *entire card background*: `bg-sage-light` (Resident Space), `bg-amber-light` (Prosperity Space), `bg-green-light` (Land Stewardship Space). Only "Village Steward Space" (`bg-teal-light`, a real class) renders with its intended tinted card. I confirmed this live: the teal card looks correct, and the other three render as plain white boxes sitting directly on the page background — visually broken and inconsistent on every page load.
- **`CoCreatorsGuide.tsx` line 571** — a "Regenerative Loop" pill also uses `bg-sage-light`, rendering with no background next to three sibling pills that render correctly.
- **`Home.tsx` line 393** — the 6th "Who Comes to Amora?" persona card, "Costa Rican & LatAm Professional," uses `bg-sage-light/40` for its icon swatch. I confirmed this live: 5 of 6 persona cards show a colored icon background (blue, green, peach, teal, teal); the 6th shows a bare globe icon floating with no swatch at all.
- **`GoodNeighbor.tsx` line 95** — criterion 5 of 8 ("Respect for Land, Nature, and All Beings") uses the same `bg-sage-light/40` pattern for its icon swatch.

### Two more undefined-class instances, different root word

- **`HowWeCreate.tsx` line 461** — the "Learn More" CTA box uses `bg-cream-dark`, also never defined. Text stays dark and readable here (lower severity than the white-on-nothing cases above), but the box loses its intended background tint.
- **`InvestorJourney.tsx`** (5 separate places: lines 594, 602, 612, 811, 873) — several CTA buttons use `hover:bg-teal-deep-dark`, which doesn't exist. These buttons simply don't change on hover — no visual bug at rest, but no feedback either, on the page whose whole job is converting investors.

### The fix, in one sentence

None of this needs a database change to look right: since the *rendering* code trusts whatever class name it's given, defining the four missing tokens (`sage-light`, `amber-light`, `green-light`, `cream-dark`) once in `index.css` fixes every occurrence above in one shot — CMS-driven and hardcoded alike. See Task A in the fixes doc for the exact values (kept WCAG-AA safe against white text, matching the care already put into `--color-gold`/`--color-coral`/`--color-sage` elsewhere in that file). A second, smaller fix adds a safety net specifically to the CMS-driven components (Circles/Roles) so a future bad value entered through the admin panel degrades gracefully instead of going invisible again.

---

## Contrast risk: low-opacity white text on `bg-teal-deep`

Separate from the "undefined class" bug, there's a systemic pattern of small captions using heavily-faded white text (`text-white/45` through `text-white/60`) on top of `bg-teal-deep` (#157f7d) panels. That teal is a mid-tone color, not dark enough to carry 45-60%-opacity white text at small sizes — computed contrast lands around 2.2–2.8:1, below the WCAG AA minimum of 4.5:1 for normal text (and below 3:1 even under the "large text" allowance).

This shows up in:

- `SeasonBanner.tsx` (renders on the **Home page**, the highest-traffic surface) — season-goal and days-left captions at `text-white/60`.
- `GameDashboard.tsx` (Profile page) — "Your next step" label at `text-white/60`.
- `InvestorSummary.tsx` — field labels at `/60`, placeholder financial values at `/50`, and worst of all, the **legal disclaimer text at `/45`** — the least legible text in the whole component is the one carrying legal weight.
- `ProjectHistory.tsx`, `JourneyToLaunch.tsx` — progress captions at `/50`–`/60` on `bg-teal-deep` headers.
- `MasterPlan.tsx` — stat labels ("Total Acres," "Planned Homes," etc.) at `/70`, closer to passing but still under 3.7:1. I confirmed live that the numbers themselves (bold, full-opacity white) are perfectly readable — it's just the small labels underneath that fade too far.
- `InvestorJourney.tsx`, `CoCreatorsGuide.tsx` hero — similar `/60` captions.

Recommended fix: bump anything under `text-sm` to `/80` or higher opacity, or switch to a dedicated solid light color, since this particular teal isn't dark enough to support aggressive fades. See Task D.

---

## Accessibility: images marked decorative that aren't

Three pages set `alt=""` on user-generated content photos that a screen-reader user would otherwise get real information about, even though a usable label (title/name) is already in scope on the same line:

- `Feed.tsx:211` — a member's feed-post photo (title available)
- `Stay.tsx:144` — an accommodation listing photo (name available, used two lines later)
- `Forum.tsx:313` — a forum thread's attached image (title available)

Low-priority: `IdentityPackPanel.tsx:100`, admin-only moodboard thumbnails with no per-image name field — not worth engineering effort for an internal tool.

---

## What I checked and found clean

- **Heading hierarchy** — all 48 page files use exactly one `<h1>` with sane nesting underneath. No skipped levels.
- **Console errors** — no JS errors or exceptions on Home, Circles, or Co-Creators Guide page load.
- **Lorem ipsum / TODO / broken template literals** — none found anywhere.
- **Standard UI primitives** (`ui/tabs.tsx`, `ui/badge.tsx`, mobile bottom tab bar) — these use the design-system tokens correctly and have good contrast in every state. If "tabs" in your original note refers to a literal tabbed control rather than the focus-area pills, I couldn't find one with a contrast problem — the pills are the far more likely match to what you saw, and I've confirmed that's exactly the bug.
- **`VillageMap.tsx`** already does this the *right* way — it resolves circle colors through a `TONE` lookup with a safe CSS-variable fallback for anything unrecognized, instead of trusting a raw Tailwind class name. This is the pattern worth copying into Circles.tsx/Roles.tsx (Task H).
- Two pages (Team, Housing) that initially looked broken — content stuck at near-zero opacity — turned out to be Framer Motion scroll-triggered fade-ins that simply hadn't fired yet in my first screenshot; re-checked after a few seconds and both render fully. Not a bug, just animation timing. Worth knowing, though: the site's own CSS has a comment acknowledging this is a real risk class ("killing a transition outright can leave an element stuck at initial opacity: 0") — if you ever notice content that stays permanently faded/blank rather than just delayed, that's the mechanism to suspect.

---

## Two things I could not verify this session

1. **Mobile/tablet rendering.** The browser tooling available to me this session accepted window-resize commands without error, but the actual page capture stayed locked to a desktop viewport, so I couldn't get a trustworthy narrow-screen screenshot. The desktop nav bar has 17 top-level items (Home, Your Path, Circles, Roles, Quests, Feed, Stay, Wallet, Badges, Library, Health, Forum, Map, Tools, Work With Us, How We Create, Launch Plan) plus a notification bell, account menu, and "Main Site" button — tightly packed even at 1500px wide. I'd recommend an actual phone/tablet check of that nav before assuming it collapses cleanly.
2. **Whether 17 top-level nav items is intentional information architecture or has grown organically.** Not a bug, but worth a deliberate look — most sites this size group secondary items (Wallet, Badges, Library, Health, Map, Tools) under 1-2 dropdowns rather than flat in the primary bar. That's a product decision, not something I'd change unilaterally.

---

See `FIXES_TO_MAKE_2026-08-03.md` for the itemized task list with exact code and a Handoff Breakdown of what's yours vs. what Claude Code can do without you.
