import { describe, expect, it } from "vitest";
import {
  ART_HEIGHT,
  ART_WIDTH,
  VILLAGE_ART_SLOTS,
  artHash,
  artRandom,
  artSeed,
  buildVillageArt,
  normalizeVillageName,
} from "./villageArt";

/**
 * WHAT THESE TESTS ARE FOR, AND WHAT THEY CANNOT DO.
 *
 * A test proves a behaviour is intended, never that it is correct. Nothing
 * here can tell anyone whether the artwork looks good; that was judged by
 * rendering it under the real scrims in both themes, and the finding is
 * written down in docs/DEFAULT_VILLAGE_ARTWORK.md.
 *
 * What these DO hold is the one property the artwork cannot survive losing:
 * a village's picture must be the same picture tomorrow. Every failure mode
 * of a generated image is a silent one, so each is pinned rather than
 * described.
 *
 *   1. EXACT OUTPUT, not ranges. The generator draws from a seeded sequence,
 *      so swapping two lines inside `buildVillageArt` changes every village's
 *      artwork while every "is it between 0 and 1" assertion still passes.
 *      Only a literal pin catches that, so one full band path is written out
 *      here character for character.
 *   2. THE HASH ITSELF, against FNV-1a's published offset basis. `Math.imul`
 *      is what keeps the multiply in 32 bit integer space; a plain `*` still
 *      returns plausible numbers and quietly drops low bits, which would
 *      shift artwork between engines with nothing to see in review.
 *   3. THE INK CEILING, across every band count the generator can produce.
 *      Bands overlap, so their alphas compound, and the band count is seeded.
 *      This is the assertion that would have caught the first version, where
 *      a five band village and an eight band village got visibly different
 *      artwork weights from the same design.
 */

describe("normalizeVillageName", () => {
  it("treats one village that typed its name three ways as one village", () => {
    expect(normalizeVillageName("Riverbend")).toBe("riverbend");
    expect(normalizeVillageName("  RIVERBEND  ")).toBe("riverbend");
    expect(normalizeVillageName("Two   Rivers")).toBe("two rivers");
  });

  it("keeps genuinely different names different", () => {
    expect(normalizeVillageName("Riverbend")).not.toBe(normalizeVillageName("Rivermend"));
  });
});

describe("artHash", () => {
  it("starts from FNV-1a's published 32 bit offset basis", () => {
    // The empty string returns the basis untouched, which is the one value
    // in the algorithm that can be checked against the specification rather
    // than against this implementation's own output.
    expect(artHash("")).toBe(2166136261);
  });

  it("stays inside unsigned 32 bit range for long input", () => {
    const h = artHash("a village with a very long name ".repeat(40));
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThanOrEqual(0xffffffff);
  });

  it("separates inputs that differ by one character", () => {
    expect(artHash("riverbend|hero")).not.toBe(artHash("riverbend|hera"));
  });
});

describe("artSeed", () => {
  it("ignores case and surrounding whitespace", () => {
    expect(artSeed("  RIVERBEND  ", "hero")).toBe(artSeed("Riverbend", "hero"));
  });

  it("gives one village a different seed per slot", () => {
    const seeds = VILLAGE_ART_SLOTS.map((slot) => artSeed("Riverbend", slot));
    expect(new Set(seeds).size).toBe(VILLAGE_ART_SLOTS.length);
  });

  it("gives different villages different seeds in the same slot", () => {
    const names = ["Riverbend", "Willowmere", "Two Rivers", "Stonefield", "Larkmeadow", "Highfen"];
    const seeds = names.map((n) => artSeed(n, "hero"));
    expect(new Set(seeds).size).toBe(names.length);
  });
});

describe("artRandom", () => {
  it("returns the same sequence for the same seed", () => {
    const a = artRandom(3337121254);
    const b = artRandom(3337121254);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it("stays inside 0 to 1", () => {
    const rand = artRandom(1);
    for (let i = 0; i < 500; i++) {
      const v = rand();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("buildVillageArt", () => {
  it("returns byte identical geometry on repeated calls", () => {
    expect(buildVillageArt("Riverbend", "hero")).toEqual(buildVillageArt("Riverbend", "hero"));
  });

  it("pins one whole band path, so reordering the seeded draws fails loudly", () => {
    const art = buildVillageArt("Riverbend", "hero");
    expect(art.seed).toBe(3337121254);
    expect(art.bands).toHaveLength(5);
    expect(art.bands[0].d).toBe(
      "M0,44.7C13.3,44.6 26.7,41.8 40,40.6C53.3,39.3 66.7,40.6 80,42.5C93.3,44.3 106.7,45.3 120,44C133.3,42.6 146.7,39.9 160,40L160,99L0,99Z",
    );
    expect(art.bands.map((b) => b.opacity)).toEqual([0.055, 0.079, 0.103, 0.126, 0.149]);
    expect(art.disc).toEqual({ cx: 83, cy: 27.5, r: 6, opacity: 0.18 });
  });

  it("holds the compounded ink at the bottom to 0.42 whatever the band count", () => {
    // Enough names to cover every band count the generator can pick. The set
    // of counts seen is asserted too: a run that happened to draw only sixes
    // would pass the ceiling check while testing nothing about the point of
    // it, which is that the ceiling holds ACROSS counts.
    const names = Array.from({ length: 60 }, (_, i) => `village ${i}`);
    const counts = new Set<number>();
    for (const name of names) {
      for (const slot of VILLAGE_ART_SLOTS) {
        const art = buildVillageArt(name, slot);
        counts.add(art.bands.length);
        const compounded = 1 - art.bands.reduce((p, b) => p * (1 - b.opacity), 1);
        // The tolerance is the three decimal rounding on each band's opacity,
        // nothing looser.
        expect(compounded).toBeGreaterThan(0.415);
        expect(compounded).toBeLessThan(0.425);
      }
    }
    expect([...counts].sort()).toEqual([5, 6, 7, 8]);
  });

  it("emits paths a renderer can parse, with no NaN anywhere", () => {
    for (const name of ["Riverbend", "A", "Two Rivers", "", "x".repeat(200), "Ærø", "村"]) {
      for (const slot of VILLAGE_ART_SLOTS) {
        const art = buildVillageArt(name, slot);
        expect(art.width).toBe(ART_WIDTH);
        expect(art.height).toBe(ART_HEIGHT);
        for (const band of art.bands) {
          expect(band.d.startsWith("M0,")).toBe(true);
          expect(band.d.endsWith("Z")).toBe(true);
          expect(band.d).not.toMatch(/NaN|Infinity|undefined/);
          const numbers = band.d.match(/-?\d+(\.\d+)?/g) ?? [];
          expect(numbers.length).toBeGreaterThan(20);
          for (const n of numbers) expect(Number.isFinite(Number(n))).toBe(true);
        }
        for (const v of [art.disc.cx, art.disc.cy, art.disc.r]) {
          expect(Number.isFinite(v)).toBe(true);
        }
        expect(art.disc.r).toBeGreaterThan(0);
      }
    }
  });

  it("keeps opacities short enough to read in a rendered attribute", () => {
    // Binary floating point turned an early version's 0.118 into
    // 0.11800000000000001, which reaches the DOM at that length.
    const art = buildVillageArt("Two Rivers", "masterPlanHero");
    for (const band of art.bands) {
      expect(String(band.opacity).replace(/^0\./, "").length).toBeLessThanOrEqual(3);
    }
  });

  it("clears the ridge and both edges for every seed, not just for a lucky handful", () => {
    /*
     * THE TEST THAT FOUND THE BUG IT NOW GUARDS.
     *
     * An earlier version placed the disc at a seeded fraction of the horizon
     * height with an independently seeded radius, and checked four names.
     * All four passed. Swapping those four names for four others failed
     * immediately: the two seeded numbers are independent, so for some seeds
     * their sum reaches past the ridge and the bands paint over the disc,
     * leaving a bitten shape in the busiest part of the picture.
     *
     * A handful of names cannot tell the difference between an invariant and
     * a coincidence, so this sweeps 300 of them across all six slots. The
     * comparison is against the ridge's HIGHEST point, taken from the path
     * itself, rather than against the nominal horizon: the topmost ridge
     * swings above the horizon, and the nominal figure would let a disc
     * touch it while the assertion still passed.
     */
    for (let i = 0; i < 300; i++) {
      const name = `village ${i} of the fleet`;
      for (const slot of VILLAGE_ART_SLOTS) {
        const art = buildVillageArt(name, slot);
        const where = `${name} / ${slot}`;

        expect(art.disc.cx - art.disc.r, `${where} left edge`).toBeGreaterThan(0);
        expect(art.disc.cx + art.disc.r, `${where} right edge`).toBeLessThan(ART_WIDTH);
        expect(art.disc.r, `${where} radius`).toBeGreaterThan(1);
        // Inside the band that survives `slice` cropping on a wide hero. A
        // 3.2 aspect container keeps the middle 56% of the height, so
        // anything above 0.22 of it is cut, and a disc straddling that cut
        // is what reads as a mistake.
        expect(art.disc.cy - art.disc.r, `${where} survives a wide crop`).toBeGreaterThanOrEqual(
          ART_HEIGHT * 0.22,
        );

        // Every y coordinate in the topmost band's path. Its smallest value
        // is the highest the ridge reaches on screen.
        const ys = (art.bands[0].d.match(/,(-?[\d.]+)/g) ?? []).map((m) => Number(m.slice(1)));
        expect(ys.length).toBeGreaterThan(5);
        expect(art.disc.cy + art.disc.r, `${where} clears the ridge`).toBeLessThan(Math.min(...ys));
      }
    }
  });

  it("gives every village in a fleet a visibly different composition", () => {
    // The thirteen founders standing up their own instance. Comparing whole
    // specs would pass on a one tenth of a unit difference nobody could see,
    // so this compares the band count and the disc together: two villages
    // sharing both would look alike at a glance.
    const fleet = [
      "Riverbend", "Willowmere", "Two Rivers", "Stonefield", "Larkmeadow", "Highfen",
      "Sunhollow", "Ninebridges", "Oxlea", "Marrowfield", "Coldspring", "Thornwick", "Elderwater",
    ];
    const signatures = fleet.map((n) => {
      const a = buildVillageArt(n, "hero");
      return `${a.bands.length}|${a.disc.cx}|${a.disc.cy}|${a.disc.r}`;
    });
    expect(new Set(signatures).size).toBe(fleet.length);
  });
});
