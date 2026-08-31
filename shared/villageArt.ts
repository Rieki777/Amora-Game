/**
 * DEFAULT HERO ARTWORK, GENERATED FROM THE VILLAGE'S OWN NAME.
 *
 * THE PROBLEM THIS SOLVES. Six hero slots in shared/gameConfig.ts ship empty,
 * for a good reason recorded there: they used to hold six URLs on one
 * village's WordPress site, so every fork of this platform inherited that
 * village's photographs as its own default. Thirteen founders stand up their
 * own instance in three weeks. None of them may ship wearing another
 * village's face, which rules out a stock photograph of a farm just as firmly
 * as it ruled out the original six URLs: a shared photograph is still one
 * picture worn by thirteen villages, and a photograph of land makes a claim
 * about land the village may not have.
 *
 * THE ANSWER. Artwork computed from the village's name. Every village gets
 * something distinctive, no village gets somebody else's, and the whole thing
 * costs zero shipped image bytes because there is no file: the geometry is a
 * few hundred bytes of code that emits SVG path strings at render time. No
 * `client/public/images/defaults/` directory was created, and that absence is
 * the point rather than an omission: a directory named for defaults is an
 * invitation to drop a photograph into it, which is the mistake this module
 * exists to make unnecessary.
 *
 * WHAT THE ARTWORK IS. One family of forms, parameterised: banded ridges
 * receding to a horizon, with a single disc above it. One family on purpose.
 * Thirteen villages running this platform should read as siblings with
 * different faces, and thirteen unrelated design languages would say the
 * opposite. The forms stay LOW FREQUENCY because every consumer draws them
 * under a scrim (measured: Home.tsx puts black at 70% to 0% over the hero,
 * MasterPlan.tsx black at 80% to 40%, and the four journey pages lay the page
 * background at 100% to 60% over theirs). Fine detail under a 60% wash is
 * detail nobody sees, so the shapes are large and the contrast is structural.
 *
 * WHAT IT IS NOT. It is not a depiction. Bands and a disc read as pattern, so
 * the artwork never tells a visitor the village has a ridge, a sunset, or a
 * view. That abstraction is load-bearing, the same way the empty slots are.
 *
 * DETERMINISM IS THE WHOLE CONTRACT. Same name and same slot always produce
 * the same numbers, on any engine, forever. A village whose hero reshuffled
 * on every reload would be worse than no artwork at all. So the hash and the
 * generator are both written out here in integer arithmetic rather than
 * reaching for Math.random or a date, and villageArt.test.ts pins the exact
 * output of both against literal values.
 *
 * COLOUR LIVES IN THE COMPONENT, NEVER HERE. This module emits geometry and
 * opacities only. client/src/components/brand/VillageArt.tsx paints it with
 * `var(--tone-brand-soft, currentColor)`, so a village's seed colour reaches
 * the artwork and a village with no seed gets the platform's neutral
 * greyscale honestly. A hex code in this file would be a colour no founder
 * could ever change.
 */

/** The six slots that get generated artwork. `logo`, `heartLogo` and
 *  `favicon` are absent on purpose: see docs/DEFAULT_VILLAGE_ARTWORK.md for
 *  why a generated glyph is the wrong answer for a mark. */
export const VILLAGE_ART_SLOTS = [
  "hero",
  "investorHero",
  "residentHero",
  "stewardHero",
  "prosperityHero",
  "masterPlanHero",
] as const;

export type VillageArtSlot = (typeof VILLAGE_ART_SLOTS)[number];

/** The drawing surface. Consumers scale it with preserveAspectRatio, so these
 *  are ratio units and never pixels. */
export const ART_WIDTH = 160;
export const ART_HEIGHT = 90;

export interface VillageArtBand {
  /** An SVG path `d`, closed below the bottom edge so the fill has no seam. */
  d: string;
  /** 0 to 1, applied to `currentColor` by the component. */
  opacity: number;
}

export interface VillageArtSpec {
  /** The 32 bit seed the geometry came from. Exposed for tests and for a
   *  React key, never for display. */
  seed: number;
  bands: VillageArtBand[];
  /** The disc above the horizon: the one element the component tints with the
   *  village's brand colour. */
  disc: { cx: number; cy: number; r: number; opacity: number };
  width: number;
  height: number;
}

/**
 * The name, reduced to what actually identifies it.
 *
 * "Amora", "amora" and "  Amora  " are one village that typed its name three
 * ways, and giving them three different pictures would make the artwork look
 * random to the one person who notices. Case and surrounding whitespace go;
 * internal runs of whitespace collapse to one space. Nothing else is touched,
 * so two genuinely different names stay different.
 */
export function normalizeVillageName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * FNV-1a, 32 bit, written out rather than imported.
 *
 * Chosen because it is four lines, has no dependencies, and produces the same
 * number on every JavaScript engine for the same input. `Math.imul` does the
 * multiply in 32 bit integer space, which is the detail that makes that true:
 * a plain `*` on the FNV prime overflows into float territory above 2^53 and
 * starts losing low bits, and the artwork would drift between engines in a
 * way no test on one engine would catch.
 */
export function artHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** The seed for one village's one slot. Salting with the slot name is what
 *  gives a village six related pictures instead of the same one six times. */
export function artSeed(villageName: string, slot: string): number {
  return artHash(`${normalizeVillageName(villageName)}|${slot}`);
}

/**
 * mulberry32: a small deterministic generator, returning 0 to 1.
 *
 * Returned as a closure so the geometry below reads as a sequence of draws.
 * The order those draws happen in is part of the contract: reordering two
 * lines in `buildVillageArt` changes every village's artwork, which is why
 * the test pins whole output rather than ranges.
 */
export function artRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One decimal place. Path strings are built on every render, so trimming the
 *  precision keeps them short, and a tenth of a unit on a 160 wide viewBox is
 *  far below anything a screen can resolve. */
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Three decimal places, for opacities. Binary floating point turns an
 *  innocent `0.07 + 1 * 0.29` into `0.11800000000000001`, which then reaches
 *  the DOM as an attribute that long and makes a snapshot test unreadable. */
const r3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * THE TOTAL DARKNESS AT THE BOTTOM OF THE PICTURE, FIXED.
 *
 * Every band fills from its own curve down past the bottom edge, so the bands
 * OVERLAP, and where they overlap their alphas compound. Handing each band a
 * hand-picked opacity looked right at seven bands and was wrong everywhere
 * else: the band count is seeded, so it varies from five to eight, and
 * compounding eight alphas lands somewhere much darker than compounding five.
 * Villages would have got visibly different artwork WEIGHTS from the same
 * design, which reads as a bug rather than as variety.
 *
 * So the opacities are solved for instead of chosen. Compositing n layers
 * leaves `1 - product(1 - o_i)` of ink at the bottom. Setting
 * `o_i = 1 - (1 - MAX)^(w_i)` with weights that sum to exactly 1 makes that
 * product `(1 - MAX)` no matter how many bands there are, so the darkest
 * point in the picture is MAX for every village. The weights still ramp, so
 * near bands carry more of the total than far ones and the depth cue
 * survives.
 *
 * MAX stays low because this is BACKGROUND. Measured on the consumers: the
 * hero sits under a scrim that reaches full transparency at the right edge,
 * where a heading in white sits on top of whatever the artwork left there.
 */
const MAX_INK = 0.42;

/**
 * A smooth ridge across the full width, closed into a fillable shape.
 *
 * The curve is `baseY + amp * sin(k*x + phase)`, sampled at five points and
 * joined with cubic segments whose control points come from the sine's own
 * DERIVATIVE at each sample. That is a Hermite to Bezier conversion, and it
 * matters: control points placed by eye (a third of the way along, at the
 * neighbour's height) flatten the peaks visibly at these amplitudes, and the
 * bands stop looking like curves and start looking like folded paper.
 *
 * The shape closes below the bottom edge rather than on it, so a fill never
 * shows a hairline seam against the next band on a fractional device pixel.
 */
function ridgePath(baseY: number, amp: number, k: number, phase: number): string {
  const samples = 4;
  const step = ART_WIDTH / samples;
  const y = (x: number) => baseY + amp * Math.sin(k * x + phase);
  const dy = (x: number) => amp * k * Math.cos(k * x + phase);

  let d = `M0,${r1(y(0))}`;
  for (let i = 0; i < samples; i++) {
    const x1 = i * step;
    const x2 = x1 + step;
    const c1x = x1 + step / 3;
    const c1y = y(x1) + (dy(x1) * step) / 3;
    const c2x = x2 - step / 3;
    const c2y = y(x2) - (dy(x2) * step) / 3;
    d += `C${r1(c1x)},${r1(c1y)} ${r1(c2x)},${r1(c2y)} ${r1(x2)},${r1(y(x2))}`;
  }
  const below = ART_HEIGHT * 1.1;
  return `${d}L${ART_WIDTH},${r1(below)}L0,${r1(below)}Z`;
}

/**
 * The artwork for one village in one slot.
 *
 * Pure. Same arguments in, byte-identical spec out, every time. An empty name
 * still returns a valid spec: the component decides that a village with no
 * name yet shows a plain field instead, because that decision needs to know
 * whether the config has loaded and this function does not.
 */
export function buildVillageArt(villageName: string, slot: string): VillageArtSpec {
  const seed = artSeed(villageName, slot);
  const rand = artRandom(seed);

  // Where the ground starts. Kept in the upper half so there is room for the
  // bands to recede, and away from dead centre so the composition has a bias.
  const horizonY = ART_HEIGHT * (0.34 + rand() * 0.24);

  // Five to eight bands. Fewer reads as empty, more turns into stripes.
  const bandCount = 5 + Math.floor(rand() * 4);

  // The ink each band gets, before it is normalised. Far bands start at 0.35
  // of a near band's share, so the stack still reads as receding.
  const shares: number[] = [];
  for (let i = 0; i < bandCount; i++) {
    const t = bandCount === 1 ? 1 : i / (bandCount - 1);
    shares.push(0.35 + 0.65 * t);
  }
  const shareTotal = shares.reduce((a, b) => a + b, 0);

  const bands: VillageArtBand[] = [];
  // The highest point the topmost ridge reaches, which is the floor of the
  // sky. Needed below, so it is recorded on the way past.
  let skyFloor = horizonY;
  for (let i = 0; i < bandCount; i++) {
    // 0 at the horizon, 1 at the bottom edge.
    const t = bandCount === 1 ? 1 : i / (bandCount - 1);
    const baseY = horizonY + t * (ART_HEIGHT * 1.02 - horizonY);
    // Near bands swing more than far ones, which is the only depth cue in a
    // flat drawing and the reason the stack reads as receding.
    const amp = (1.6 + rand() * 6.4) * (0.4 + 0.6 * t);
    // Under one and a half cycles across the width. Anything faster becomes
    // texture, and texture is what the scrims erase.
    const cycles = 0.55 + rand() * 0.95;
    const k = (cycles * Math.PI * 2) / ART_WIDTH;
    const phase = rand() * Math.PI * 2;
    if (i === 0) skyFloor = baseY - amp;
    bands.push({
      d: ridgePath(baseY, amp, k, phase),
      // Solved, never chosen. See MAX_INK above for why.
      opacity: r3(1 - Math.pow(1 - MAX_INK, shares[i] / shareTotal)),
    });
  }

  /*
   * THE DISC IS FITTED TO THE SKY, NEVER DROPPED AT A SEEDED POINT.
   *
   * A first version drew it at a fraction of the horizon height with a
   * radius of its own, and for most seeds that looked fine. For some it did
   * not: the seeded radius and the seeded height are independent, so their
   * sum could reach past the ridge. The bands paint over the disc, so the
   * result was not a visible collision. It was a disc with a bite out of it,
   * sitting in the noisiest part of the picture, reading as a smudge on the
   * horizon rather than as an element.
   *
   * Six villages happened not to hit it. The four names that replaced them
   * did, which is the whole argument for testing an invariant across a set
   * rather than eyeballing a handful of renders.
   *
   * So the sky is measured first (`skyFloor`, the topmost ridge's highest
   * reach, not the nominal horizon, because the ridge swings above it), the
   * radius is capped at a share of that space, and the centre is then placed
   * inside what is left. Every seed now clears the ridge by construction, so
   * the invariant holds without a retry loop.
   *
   * SAFE_TOP IS THE OTHER HALF OF THE SAME BUG, AND IT IS ABOUT CROPPING.
   * Consumers render this with `preserveAspectRatio="xMidYMid slice"`, which
   * is the SVG spelling of object-fit: cover, so a hero wider than the 16:9
   * viewBox loses the top and bottom of the drawing. A hero band at 1272 by
   * 400 is an aspect of 3.2, which keeps only the middle 56% of the height.
   * Anything the generator puts above 0.22 of the height is cut by the frame
   * there. Off frame entirely would be fine; a disc STRADDLING the cut is
   * what reads as a mistake, and that is what the first fitted version drew,
   * because it was free to place the disc a single radius from y = 0.
   *
   * Horizontal cropping on a narrow container is left alone deliberately. A
   * disc constrained to survive a phone's crop as well would sit within the
   * middle third of the width for every village, and the variety this
   * artwork exists to provide would go with it.
   */
  const safeTop = ART_HEIGHT * 0.22;
  // A unit of clearance at BOTH ends of the sky. Tangency looks pinched
  // rather than deliberate, and it also puts the invariant exactly on the
  // boundary, where rounding the emitted coordinates to one decimal place
  // decides whether the assertion passes. A margin makes the property true
  // by a visible amount instead of by a floating point hair.
  const clearance = 1;
  /*
   * No floor under either of these, on purpose. An earlier version clamped
   * `sky` up to 6 and `radius` up to 2.5 so a degenerate case could not
   * produce a negative range. Both clamps quietly broke the algebra they sat
   * inside: with `sky` clamped ABOVE the space actually available, the line
   * below can place the disc past the ridge again, and the property this
   * whole block exists to guarantee would have gone back to being a
   * coincidence of the current horizon and amplitude ranges rather than a
   * fact. It happened to hold with 0.6 of a unit to spare, which is the kind
   * of margin that disappears the first time somebody widens a range.
   *
   * Without them the arithmetic is closed: `cy` is at least
   * `safeTop + clearance + radius` and at most `safeTop + clearance + sky -
   * radius`, so the disc clears the crop line above and the ridge below for
   * every seed, at any horizon range anyone picks later. That the radius
   * stays big enough to see is a separate claim, and villageArt.test.ts
   * measures it across 300 names in all six slots rather than assuming it.
   */
  const sky = Math.max(skyFloor - safeTop - 2 * clearance, 0);
  const radius = Math.min(4.5 + rand() * 7, sky * 0.42);
  const disc = {
    // Its own radius clear of both side edges, so it never reads as a shape
    // the frame sliced at full width.
    cx: r1(radius + 2 + rand() * Math.max(0, ART_WIDTH - 2 * radius - 4)),
    cy: r1(safeTop + clearance + radius + rand() * Math.max(0, sky - 2 * radius)),
    r: r1(radius),
    opacity: 0.18,
  };

  return { seed, bands, disc, width: ART_WIDTH, height: ART_HEIGHT };
}
