# Default village artwork

What a brand new village looks like before its founder has uploaded a single
picture, and why it looks like that.

Code: `shared/villageArt.ts` (geometry),
`client/src/components/brand/VillageArt.tsx` (the hero default),
`client/src/components/brand/VillageWordmark.tsx` (the mark default).
Tests: `shared/villageArt.test.ts`,
`client/src/components/brand/VillageArt.test.tsx`,
`client/src/components/brand/VillageWordmark.test.tsx`.

## The constraint

Thirteen community founders each stand up their own instance of this platform.
The nine identity slots in `shared/gameConfig.ts` ship empty because they used
to ship one village's photographs, hosted on that village's own domain, to
every fork. The comment in `gameConfig.ts` records both halves of that: the
URLs now 404, and even working they would have handed a fork somebody else's
private domain as the source of its own artwork.

A stock photograph of a farm fails the same test. It is still one picture worn
by thirteen villages, and a photograph of land makes a claim about land the
village may not have.

So the default has to be generated from something the village already owns.
The only thing a brand new village owns is its name.

No `client/public/images/defaults/` directory exists, and that absence is the
point. A directory named for defaults is an invitation to drop a photograph
into it, which is the mistake this work exists to make unnecessary. The
shipped-image total is untouched as a result.

## What the nine slots actually get

Nine slots exist. They do three different jobs, so they get three different
answers.

| Slot | Default | Why |
|---|---|---|
| `hero` | Generated artwork | Full-bleed background behind a heading |
| `investorHero` | Generated artwork | Same |
| `residentHero` | Generated artwork | Same |
| `stewardHero` | Generated artwork | Same |
| `prosperityHero` | Generated artwork | Same |
| `masterPlanHero` | Generated artwork | Same |
| `logo` | Wordmark, the village name in the display face | A glyph in the logo position is a claim about identity nobody made |
| `heartLogo` | Wordmark | Same |
| `favicon` | Nothing to do, already solved | See below |

### The favicon already has a default, and it shipped some time ago

`client/index.html` serves `/assets/images/platform-favicon.svg` as both the
icon and the apple-touch-icon, `/manifest.webmanifest` falls back to it, and
`App.tsx` swaps in the village's own once `/api/game/config` answers. The
comment at `shared/gameConfig.ts` around the `favicon` field says so directly:
blank there is what makes that fallback engage rather than being permanently
shadowed by a non-empty default.

One inconsistency is worth recording without acting on it. That mark is a seed
in a circle painted `#157f7d`, a teal, while the platform's shipped default
palette is neutral greyscale (`--tone-brand` defaults to `#404040`). So an
unbranded village's browser tab is the one surface in the whole product
wearing a colour. It is a platform mark rather than a village's, so it breaks
no white-label rule, and `scripts/check-image-budget.mjs` derives its
non-WebP allowlist from that filename, so the file is load-bearing. Changing
it is a deliberate decision for whoever owns `client/index.html`, not a
drive-by.

### Why the two mark slots get a wordmark and not a glyph

The header currently renders a 64px empty spacer when `logo` is blank
(`Layout.tsx`), so a brand new village has no visible identity in its own
navigation bar at all. That is a real hole. A generated glyph would fill it
and cause a worse problem.

An abstract hero reads as pattern. A glyph in the logo position reads as a
logo, which is a claim about identity that nobody in the village made, and
thirteen founders would each have to notice it was not theirs and remove it.
An over-designed default that every village then deletes is worse than a quiet
one.

The village's name is a fact the founder typed. Setting it in the display face
is the strongest identity available without inventing one, it costs no bytes,
it selects and translates and scales with a reader's own font size, and a
village that later uploads a real mark replaces it with nothing left over.

## The artwork

One family of forms, parameterised: banded ridges receding to a horizon, with
a single disc above it. Seeded from `normalizeVillageName(name) + "|" + slot`
through FNV-1a, then drawn with mulberry32.

One family on purpose. Thirteen villages running this platform should read as
siblings with different faces. Thirteen unrelated design languages would say
the opposite thing about what this platform is.

Three properties the code holds by construction, each with a test that fails
when it is broken:

- **Deterministic.** Same name and slot, same picture, on any engine, forever.
  `Math.imul` keeps the hash in 32 bit integer space so it cannot drift.
- **Bounded ink.** The bands overlap, so their alphas compound, and the band
  count is seeded from five to eight. The opacities are solved rather than
  chosen, so the darkest point of the picture is 0.42 for every village
  whatever its band count.
- **Crop safe.** Consumers render it `preserveAspectRatio="xMidYMid slice"`,
  which crops. The disc is fitted into the band that survives a 3.2 aspect
  container, clear of the ridge and both side edges.

### Colour

Every fill is `var(--tone-brand-soft, currentColor)`.

A village that has set a seed colour in Admin gets `--tone-brand-soft` from
the server's theme stylesheet and its artwork carries its own hue. A village
with no seed resolves to `currentColor`, which the component sets to
`text-muted-foreground`: the platform's shipped neutral greyscale. No hex code
appears in either file, so a founder's colour can always reach the picture,
which is what `scripts/check-theme-literals.mjs` exists to protect.

`--tone-brand-soft` rather than `--tone-brand` for a specific reason. Neither
is redefined under `.dark`, so both are the same colour in both themes.
`--tone-brand` is the raw seed and can be near black or near white;
`--tone-brand-soft` is derived at a fixed lightness of 0.66
(`shared/brandTokens.ts`), which is legible against the light theme's `#f2f2f2`
and the dark theme's `oklch(0.18 0 0)` alike.

### Accessibility

The artwork is `aria-hidden`. `Image` already puts `role="img"` and
`aria-label={alt}` on the wrapper, so a hero's description survives an empty
slot, and a second name inside the fallback would announce the same hero
twice. `VillageArt.test.tsx` renders the whole composition and asserts exactly
one accessible name, matching the alt text; it also asserts that an
`alt=""` decorative hero stays silent. Reverting the component to carry its
own label turns three of those tests red.

## Judged against the quiet alternative

The brief that opened this work asked for an honest comparison against a plain
colour field, on the grounds that an over-designed default every village has
to remove is worse than a quiet one. Both were rendered under the real scrims
each consumer applies, in both themes.

**Where the artwork wins.** On the Home hero, six villages side by side are
visibly six villages. The plain field is the same rectangle thirteen times.
The artwork costs 2,096 bytes minified and no image files, so the win is
close to free.

**Where it barely registers, measured.** The four journey pages lay
`from-background via-background/90 to-background/60` over their hero. The left
two thirds are the page background at full opacity, so the artwork is
invisible there, and only the right edge shows anything at all. In dark mode
under the Home hero's `from-black/70` the picture is almost entirely erased.
Adopting the artwork on the four journey heroes is defensible because it is
free, and skipping them would cost almost nothing. Whoever adopts should know
that before spending review time on it.

**Where the quiet answer is the answer.** A village that has not typed its
name yet gets no artwork, and `Image` shows its own `bg-muted/40` field. There
is nothing to seed from, so any artwork would be the same artwork for every
unnamed village, which is the one thing this component exists to prevent.

## Byte cost, measured

| Budget | Before | After | Change |
|---|---|---|---|
| Shipped images (`scripts/check-image-budget.mjs`) | 2,167,856 bytes, 48 files | unchanged | none, no image files exist |
| Main JS (real bytes, cap 700 KB) | 503 KB | 503 KB until adopted, then about 505 KB | +2,096 bytes minified, +1,063 gzipped |
| Total `dist/public` (block charged, cap 6,600 KB) | 5,668 KB | unchanged | the code lands in an existing chunk |

The marginal figure was measured by bundling the three new modules against a
baseline entry that pulls the same shared dependencies (`clsx`,
`tailwind-merge`, `gameApi`), all of which the app already ships, and diffing.

## Adopting it

`Image` already offers a `fallback` prop, so nothing in the image plumbing
changes and no file this lane does not own has to be restructured.

> **The change an adopting lane makes.** In `client/src/pages/Home.tsx` and
> `client/src/pages/MasterPlan.tsx`, add
> `fallback={<VillageArt slot="hero" />}` and
> `fallback={<VillageArt slot="masterPlanHero" />}` to the existing `<Image>`
> that renders `brand.hero` and `brand.masterPlanHero`, importing `VillageArt`
> from `@/components/brand/VillageArt`. The component reads the village name
> from the live config itself, so no other prop and no new hook is needed at
> the call site. In `client/src/components/Layout.tsx`, replace the 64px
> `<span aria-hidden>` spacer in the header link and the omitted footer mark
> with `<VillageWordmark className="text-2xl text-white" />` and
> `<VillageWordmark className="text-xl text-white" />`, keeping the reserved
> `minHeight` boxes exactly as they are so nothing shifts. The four journey
> pages (`InvestorJourney.tsx`, `ResidentJourney.tsx`, `StewardJourney.tsx`,
> `ProsperityJourney.tsx`) each render `{brand.xHero ? <motion.img .../> :
> null}` rather than an `<Image>`, so adopting there means replacing that
> `null` with `<VillageArt slot="investorHero" />` and its three siblings
> inside the same positioned container. Nothing else changes, and reverting is
> deleting the prop.
