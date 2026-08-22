# The Natural Interface Kit

The design foundation the rest of the product draws from. It lives in
`client/src/components/natural/`, plus two utilities in `client/src/lib/`.

The ruling it exists to keep, from the founder:

> Across the whole Game feel use regenerative, organic, and natural elements,
> graphics and feels (so if there is a progress ring, maybe have it be a moon
> going through phases from new moon 0% to full moon 100%) if there are
> sounds, it's nature sounds, everything about our Game is meant to get people
> into the real world with real life, we want to emulate that effect in our
> Game here by honoring and displaying nature everywhere.

And, on the moon specifically:

> For the moon completion Icon it should have a graphical phase for at least
> each 12.5% illumination/completion.

## This is a unification, not an invention

The platform already ran a real lunar clock before this kit existed and it
stays the only one. `shared/lunar.ts` is the single source of lunar
arithmetic: cycle boundaries, `moonPhase`, `moonPhaseName`, `moonPhaseGlyph`.
`client/src/components/CycleClock.tsx` and
`client/src/components/calendar/YearWheel.tsx` already draw from it.

`moonGeometry.ts` adds exactly one thing shared/lunar has no opinion about:
the outline of the lit region at an arbitrary fraction. Phase NAMING is not
reimplemented, it is delegated, and
`client/src/components/natural/moonGeometry.test.ts` asserts that delegation
holds rather than asserting a copied table, so a change to shared/lunar's
thresholds moves this kit with it.

The craft bar is `client/src/components/crowdpool/PoolPieces.tsx`, which
carried the living map artifact's vocabulary into React: a gold ring that
fills, a lantern that brightens toward build day, sprites growing blueprint to
wip to painted, and a reduced-motion guard on every one of them.

## What each piece is for

| Piece | File | Use it for |
| --- | --- | --- |
| `MoonProgress` | `natural/MoonProgress.tsx` | Any completion display: a quest, a stage, a pool, a checklist |
| `Celebration` | `natural/Celebration.tsx` | Marking that something landed |
| `BreathingLoader` | `natural/BreathingLoader.tsx` | Waiting. It replaces a spinner |
| Tokens | `client/src/index.css` | Recolouring the whole vocabulary at once |
| `haptic()` | `client/src/lib/haptics.ts` | The one call into `navigator.vibrate` |
| `playSound()` / `useSound()` | `client/src/lib/sound.ts` | The audio layer |
| `useReducedMotion()` | `natural/useReducedMotion.ts` | Branching a composition, not just cancelling one |

Import from the barrel, `@/components/natural`, unless you want one component
and nothing else.

## The moon's design rules

**Progress waxes only.** `mode="progress"` (the default) maps 0 to 1 onto new
through full, lit on the right limb, and never goes past full. A waning moon
reads as progress being lost, which is a lie about a quest at 80%. Use
`mode="lunation"` only where the thing being drawn really is cyclical, the
gratitude cycle among them; that mode takes the phase `shared/lunar`'s
`moonPhase()` returns and is the only mode that lights the left limb.

**A reading always travels with it.** The accessible name is always
`"<percent> percent, <phase name>"`, optionally prefixed with a `label`, so a
screen reader hears "Path of Growth: 62 percent, waxing gibbous". `showNumber`
prints the same percent beside the disc and defaults on. Turn it off only
where the surrounding copy already states the same progress in words or in a
number. A shape is not a readout, and the ruling that nothing conveys meaning
by colour alone applies to shape too.

**Nine states, and they are tested.** The lit outline is one SVG path built
from two arcs: the limb, and a terminator half-ellipse whose horizontal radius
is `r * |1 - 2f|`, subtracted below `f = 0.5` and added above it, with the arc
sweep flag flipping at the half. The derivation is in the file header. The
area identity falls out exactly: the drawn region is lit in the proportion the
number claims, at every value. The nine 12.5% steps are asserted pairwise
distinct, the terminator radii are pinned to
`[34, 25.5, 17, 8.5, 0, 8.5, 17, 25.5, 34]` at r=34, and the lit width across
the equator is asserted to rise monotonically as `2 * r * f`. String
inequality alone would pass on a rounding wobble; the three checks together do
not.

Cross-checked against `shared/lunar.ts`, the nine steps name themselves: new
moon, waxing crescent, waxing crescent, waxing crescent, first quarter, waxing
gibbous, waxing gibbous, waxing gibbous, full moon. Three crescents and three
gibbouses share a name and none of them share a shape, which is the point of
the ruling.

**Sizes.** One 100-unit viewBox, so everything scales with `size`. Below 24px
the horizon ring and the printed number are dropped automatically, because at
that size they are noise; the accessible name still carries both.

**Motion.** The terminator and the ring ease between values. Under
`prefers-reduced-motion` the transition classes are not applied and the value
still lands.

## Celebration intensity: what earns a moment

Two intensities, and the split is a budget rather than a volume knob.

`moment` is RARE. Reserve it for events a village would talk about:

- a stage advance on the Path of Growth
- a quest consented
- a ballot carrying
- a need delivered on a crowdpool

Everything else gets a `whisper`: a gratitude sent, a claim made, a form
accepted, a row saved.

The reason is not taste. A celebration on every action becomes wallpaper
within a session, and once it is wallpaper the rare event has nothing left to
say with. A whisper stays under 1.5 seconds and a moment stays under 3.5, both
asserted in `celebrationPlan.test.ts`, so nothing ever holds up a page.

Five kinds, none of them confetti: `seeds`, `blossom`, `fireflies`, `dawn`,
`ripples`.

**Every kind has a still form.** The global `prefers-reduced-motion` block in
`index.css` sets `animation-duration: 1ms !important` across the whole
product. For a loader that is exactly right. For a celebration made of "rise
and fade" it means an empty box, so each kind reads the preference in
JavaScript and renders a settled composition instead: seeds resting where the
wind set them down, the blossom already open, fireflies holding their light,
full daylight, still rings on the water. The CSS rule stays as the floor under
everything else.

**It is never the only signal.** The drawing is `aria-hidden`. Pass `message`
and the same news goes out through a live region.

## Design tokens

In `client/src/index.css`, beside the platform's other custom properties, as
`:root` plus a `.dark` block. Every component reads them as
`var(--nat-x, #fallback)` so a stylesheet that never loaded still draws.

They are deliberately NOT in `@theme`: nothing here needs a Tailwind utility,
these are fill and stroke values inside SVG, and a generated `.bg-nat-leaf`
would be dead bytes in every build.

`--nat-moon-edge` carries the accessibility. A moon's lit limb touches the
page directly, so that stroke is the boundary WCAG 1.4.11 measures, and it
inverts between themes: `#2f4f52` on light, `rgba(206, 228, 228, .6)` on dark,
because a dark outline on a dark page is no outline.

Motion tokens: `--nat-breath-dur` (4s, near a calm human breath),
`--nat-ease-organic`, `--nat-settle`.

`nat-breathe` is a SECOND breath keyframe, not a replacement for the existing
`breathe`. That one is the character-select idle, scale 1 to 1.015 with a 4px
lift, tuned to read as a still portrait that happens to be alive. A loader has
to read as motion from across a room. Both stay; they are one gesture at two
amplitudes, and collapsing them would spoil whichever lost.

## Haptics

`client/src/lib/haptics.ts` is the one place the product calls
`navigator.vibrate`. The pattern came from `MobileFab`, which was the only
caller, and its behaviour is carried over unchanged: `press` is the 10ms it
used for the trigger and `tick` is the 6ms it used for a row, so the FAB feels
exactly as it did.

Five intensities: `tick` 6ms, `tap` 8ms, `press` 10ms, `confirm` 18ms,
`arrive` `[12, 40, 12]`. Nothing above 30ms per pulse, because on Android that
reads as an error buzz whatever it was meant to mean.

Muting sound mutes haptics. A member asking for quiet means the device, and a
phone buzzing at every tap is not quiet. iOS Safari has no `navigator.vibrate`
at all, which is fine: nothing here is ever the only feedback, so a device
without a motor loses a flourish and no information.

## The audio layer

`client/src/lib/sound.ts`. **Mechanism only. No audio file is committed.**

### Why no files

A licence is a human check and a fabricated one is worse than silence: every
fork inherits the obligation and violates it without ever being told. This is
the same reasoning the brand ratchet runs on.

- **CC0 ONLY.** A CC-BY sample creates an attribution obligation that every
  fork inherits and silently breaks.
- **The BBC sound effects library is NOT usable here.** Its terms are
  personal, educational and research use. This is a commercial product.
- Suggested CC0 sources, each to be verified per asset because a library's
  overall licence is not a given file's licence: Freesound (filter to CC0 and
  check the individual page), OpenGameArt, 99Sounds.

### The manifest

The brief handed to whoever sources the audio, and the budget the result has
to fit. It lives as `SOUND_MANIFEST` in `client/src/lib/sound.ts`, so the
budget is a value tests read rather than a paragraph someone remembers.

Format for all five: OGG Vorbis primary with an MP3 fallback for Safari, mono,
44.1kHz, normalised to about -16 LUFS so one moment is not twice the loudness
of another.

| Moment | When it fires | The sound wanted | Seconds | Max KB (OGG) |
| --- | --- | --- | --- | --- |
| `quest_complete` | A quest was consented and the work is done | A short wooden wind chime settling, three or four notes falling | 0.8 to 1.6 | 120 |
| `gratitude` | Gratitude was sent, and the same sound when it arrives | One soft water drop into a still pool, with a little room tail | 0.4 to 0.9 | 80 |
| `stage_advance` | A member moved a stage along the Path of Growth | Dawn birdsong opening, two or three birds, no traffic underneath | 1.2 to 2.5 | 150 |
| `notification` | Something arrived that was not asked for | A single low bamboo knock, dry and close | 0.2 to 0.5 | 60 |
| `ui_tick` | A control took an input | A leaf brushing a leaf, almost under hearing | 0.05 to 0.15 | 50 |

The MP3 fallback may run to about twice the OGG budget.

### Where the bytes live

**The uploads volume, served by `GET /api/uploads/:filename`. Never
`client/public`.**

That directory is cached one-year-immutable and Vite does not content-hash
passthrough files, so a sound placed there is both unreplaceable for a year
and charged against the `MAX_TOTAL_DIST_KB` budget in every fork. The uploads
volume is hashed, swappable and per-deployment, which is what a village asset
is. This is the same rule the image budget enforces on art.

`server/index.ts` now serves `.ogg` as `audio/ogg` and `.mp3` as `audio/mpeg`
from that route, with the same one-year immutable cache images and fonts get.
Without those two lines an uploaded one-shot came back as
`application/octet-stream` with an attachment disposition, which no `Audio`
element will play, so the layer would have shipped unable to make a sound.

### The admin path a village follows

1. Source five CC0 one-shots against the manifest above and keep the licence
   evidence with the deployment's records.
2. Encode to OGG Vorbis plus MP3, inside the size budgets.
3. Put them in the uploads volume with a stamped filename, the way every other
   writer into that directory does: `${Date.now()}-${random}-quest.ogg`. The
   stamp is what makes the immutable cache correct.
4. Call `configureSounds({ files: { quest_complete: { ogg: "...", mp3: "..." }, ... } })`
   once at boot with those filenames.

**Open, and named rather than hidden:** there is no admin upload endpoint for
audio yet. `POST /api/admin/brand/font` is the shape it should copy, magic-byte
check included, and the manifest belongs beside the theme fields in the brand
document so step 4 reads it instead of being hand-called. Until that lands, a
village supplies files by writing to the volume directly. Nothing breaks
meanwhile: an unconfigured moment is silent, which is the shipped default.

There is also no mute control in the UI yet. `useSound().toggleMute()` is the
API for one, and it belongs on whichever settings surface a later lane owns.

### The five rules the mechanism keeps

1. **Nothing autoplays.** No element is constructed until a moment is actually
   played, asserted in `sound.test.ts`.
2. **Mute is per member and honoured everywhere**, haptics included. It is
   stored in `localStorage` under `village.sound.muted:<memberId>`, the way
   the first walk's progress and the landing preference already are: per
   browser and per person, no server state, nothing to migrate. Call
   `setSoundMember(id)` at sign-in, and again with `""` at sign-out, so two
   people sharing a laptop do not share a mute.
3. **Silence under `prefers-reduced-motion`.** Someone managing sensory load
   is not asking for a soundtrack. This is checked separately from mute and
   does not overwrite the member's own preference.
4. **Nothing blocks.** Every call returns a promise that resolves and never
   rejects. `useSound().play()` swallows it, so a click handler is one line.
5. **A missing file fails silently and is remembered.** A blocked autoplay and
   a 404 look identical from here, and both mean the moment stays quiet. A
   village with three of the five files gets three sounds and a quiet console.
   `resetSounds()` clears that memory once the file is uploaded.

## The asset budget rule

CI enforces `MAX_MAIN_JS_KB` 700 and `MAX_TOTAL_DIST_KB` 6600 after
`pnpm build`, and recent builds sit near the total ceiling. This kit is
therefore all SVG drawn from arithmetic: no image, no font, no audio, no
animation library. Nothing it adds is a file.

The rule for anything later built on it: **large or swappable assets belong in
the uploads volume.** `client/public` is cached one-year-immutable, is not
content-hashed by Vite, counts against the dist budget in every fork, and
cannot be replaced without a redeploy. `scripts/check-image-budget.mjs` holds
that line for images. Sound follows the same line by policy, stated here,
because there is no gate that can see a file nobody committed.

## Where it is wired today

One demonstration, kept small and reversible: the dashboard's Path of Growth
rail (`client/src/components/GameDashboard.tsx`) shows the member's position
as a 40px moon beside the heading. The stage chips underneath carry the same
reading in words, so the moon adds a shape to something already stated.
`showNumber` is off there for that reason.

Adopting the kit on other surfaces is later lanes' work, not this one's.
