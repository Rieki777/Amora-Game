# Fixes to Make 2026-08-03 — implementation result

Companion to `FIXES_TO_MAKE_2026-08-03.md`. Every task in that document was
verified against the live site at both 390x844 (mobile) and 1440x900 (desktop)
before being touched, and re-verified against a local build afterwards. All six
tasks are coded. Three of them were implemented differently from the way the
document prescribed, because the prescription was measured and did not hold.

Branch: `voice-sweep-2026-08-01`. See "Where this has to land" at the bottom.

## Verification method

The earlier session could not produce a trustworthy narrow-viewport capture, so
its mobile findings were unverified. Window-resize through the browser tooling
silently keeps the desktop viewport (`innerWidth` stayed 1707 after a resize to
390). Playwright with a real mobile context does work, and that is what produced
the before and after evidence here. Contrast numbers below are computed from
rendered pixels: the painted background is composed by walking ancestors, and
CSS colours are normalized through a canvas first, because Chrome reports theme
colours as `oklab(...)` and a regex over that string yields nonsense.

## Confirmed before fixing

| Finding | Evidence |
|---|---|
| A: `bg-sage-light` / `bg-amber-light` / `bg-green-light` undefined | `background-color: rgba(0,0,0,0)` on every instance, both viewports |
| A: Circles "Key Focus Areas" pills invisible | white text on transparent, on a white card |
| A: three of four "Four Spaces" cards had no panel | screenshot: only Village Steward drew a background |
| B: `bg-cream-dark` undefined | CTA box transparent on `#f2f2f2` |
| B: `hover:bg-teal-deep-dark` undefined | no hover rule emitted |
| D: faded white on `bg-teal-deep` | 241 failing nodes across 7 pages |
| E: `alt=""` on content photos | confirmed in source; `Image` requires alt, so these were deliberate-looking |
| F: legacy alias block | confirmed dead, but see below, the document's reasoning was wrong |

## Where this differs from the prescription

### Task A: the suggested hex values fail, and one token cannot serve both uses

The document proposed `--color-sage-light: #6b9c78`, `--color-amber-light:
#f0c98a`, `--color-green-light: #7fae74`, checked against white text. Measured:

- `#6b9c78` is 3.16:1 against white, so the `text-white` `text-xs` pills that
  started this whole report would still have failed AA.
- The same three classes are also used on CoCreatorsGuide's Four Spaces cards,
  which carry *dark* headings. `#6b9c78` against its own `text-sage` partner is
  1.89:1; `#f0c98a` against `text-amber` is 1.22:1; `#7fae74` against
  `text-green-600` is 1.29:1. Shipping those values would have replaced
  "invisible white on nothing" with "invisible dark on mid-tone".

One class name was being asked to be dark (for white pills) and light (for dark
card text) at once. Resolved by splitting the two jobs:

- The `-light` tokens are now genuine light tints, matching what
  `--color-aqua-light` already meant: `#dcebe0`, `#fdf1de`, `#dcecd6`. Each is
  measured against the text that actually sits on it.
- The white-text case moved to Task C, where the colour and its ink are resolved
  together.

Two follow-on changes were required rather than optional. The Four Spaces
headings had to move off `text-amber` and `text-green-600`, which are light
accents that vanish on a light panel. And Village Steward, the card the
document held up as the reference the others should match, was itself at
1.40:1 (`bg-teal-light` `#3a9896` under `text-teal-deep`); it only looked
correct because its three siblings had no background at all. It now uses
`bg-aqua-light`.

### Task C: the suggested allowlist reproduces the bug

The proposed allowlist included `bg-cream`, `bg-amber`, `bg-aqua-light` and the
new `-light` tints, while the pills hardcoded `text-white`. `bg-cream` under
white text is 1.22:1. An allowlist of "classes that exist" would have waved
through the same unreadable pill with a different value.

It also would not have worked mechanically: Tailwind only emits a utility for a
class it can see in the source, and these values arrive from the database, so
several allowed names would not have existed in the stylesheet at all.

Implemented instead as `client/src/lib/swatch.ts`: a colour resolves to a
`{ bg, ink }` pair, where the ink is whichever foreground clears 4.5:1 on that
background. An editor who picks amber keeps amber, drawn with dark text, rather
than having their choice silently replaced with sage. `bg-teal-light` is the one
brand colour absent from the table: at 3.44:1 against white and 3.58:1 against
the dark foreground, neither ink clears AA, so it falls back. Locked by
`client/src/lib/swatch.test.ts` (9 tests).

### Task D: "bump to /80 or higher" cannot reach the stated target

`--color-teal-deep` is `#157f7d`. Solid white on it is 4.81:1, so every step of
opacity below 100% puts normal-size text under AA:

```
white/45  2.18:1   white/70  3.20:1   white/85  3.95:1
white/50  2.35:1   white/80  3.67:1   white/90  4.22:1
white/60  2.75:1                      white     4.81:1
```

The acceptance criterion ("all should clear 4.5:1") is unreachable by the
prescribed method. Small text on teal-deep is now solid white; hierarchy comes
from size and weight instead of lightness. Where a fade carried meaning it was
replaced by something that costs no contrast: InvestorSummary's pending values
stay italic, and header and footer links use an underline on hover.

Measuring also showed the document's file list was the smaller half of the
problem. The site-wide header and footer were not listed and accounted for about
230 of the 241 failures, on every page: nav and footer links at
`text-white/70 text-sm` (3.32:1) and the copyright line at `text-white/50`
(2.41:1). The footer's existing `hover:text-amber` is 2.53:1, so it was not
reused as the hover state.

Result: 241 failing nodes to 0 across the seven pages sampled.

### Task F: the reasoning was wrong, the conclusion was right

The document states that Tailwind's generated utilities win over the legacy
aliases "wherever these classes are actually used bare". Probed on the live
site, bare `bg-coral` resolved to `rgb(21,127,125)`, teal, so the alias was
winning, not losing. The real mechanism is that no utility is generated for
`bg-coral` because nothing uses it bare, which is the same fact the document
used to justify the cleanup. The block is dead either way and the aliases now
point at their own variables, so bare `bg-coral` and `bg-coral/10` finally
agree.

## Gates

`pnpm check`, `pnpm build`, `check-brand-refs` (63/63 baseline, unchanged),
`check-voice` (clean, 261 files) all pass.

## Where this has to land

Production is not serving this branch. During this session the live `/circles`
and `/roles` pages changed under test: they stopped rendering the CMS `color`
value at all, while `/api/content/circles` still returns `bg-sage-light` for
Community Circle and Community Life Council. That deploy came from the
`amora-roles` worktree on `wt/roles-model`, which has moved ahead independently.

`wt/roles-model` still contains every bug fixed here: `bg-sage-light` and
friends in CoCreatorsGuide, Home and GoodNeighbor, `bg-cream-dark` in
HowWeCreate, five dead hovers in InvestorJourney, and an `index.css` with none
of the new tokens. `/co-creators-guide` and `/how-we-create` are still broken
live right now.

These fixes need to be merged into whichever branch ships, or applied there
directly. They were not applied to the other worktree from here because it
belongs to a concurrent session.

## Optional data cleanup, now genuinely optional

The four records holding `bg-sage-light` render correctly either way: the class
is real, and `swatchFor` pairs it with dark ink. Changing them is a design
preference, not a fix.
