import { describe, expect, it } from "vitest";
import { atContrast, CHARACTER_CARDS, contrastRatio, deriveTheme, hexToHsl, hslToHex } from "./brandTokens";

describe("the token layer", () => {
  it("emits NOTHING without a seed — the neutral fork", () => {
    // The white-label baseline: no seed means no output, so an untouched
    // fork renders pixel-identically to the platform's shipped CSS.
    expect(deriveTheme(undefined, undefined)).toBeNull();
    expect(deriveTheme("", "quiet")).toBeNull();
    expect(deriveTheme("not-a-colour", "quiet")).toBeNull();
  });

  it("round-trips colour math within a hair", () => {
    for (const hex of ["#157f7d", "#ecb163", "#3f4a44", "#0000ff"]) {
      const back = hslToHex(hexToHsl(hex)!);
      // channel drift ≤ 2 from float rounding
      const d = (a: string, b: string, i: number) =>
        Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16));
      expect(Math.max(d(hex, back, 1), d(hex, back, 3), d(hex, back, 5))).toBeLessThanOrEqual(2);
    }
  });

  it("derivation is deterministic", () => {
    const a = deriveTheme("#8a5a2b", "handmade")!;
    const b = deriveTheme("#8a5a2b", "handmade")!;
    expect(a.vars).toEqual(b.vars);
  });

  it("every card yields readable text from ANY seed — the A3 guarantee", () => {
    // The amendment's failure case: a dark muddy green that would have shipped
    // 1.2:1 body text under the refuted spec. Plus a neon, a pastel, black-ish
    // and white-ish seeds — the pathological corners.
    const seeds = ["#3f4a44", "#39ff14", "#ffe4ec", "#0a0a0a", "#fdfdfd", "#157f7d"];
    for (const card of CHARACTER_CARDS) {
      for (const seed of seeds) {
        const t = deriveTheme(seed, card.id)!;
        expect(contrastRatio("#ffffff", t.vars["--primary"])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.vars["--foreground"], t.vars["--background"])).toBeGreaterThanOrEqual(4.5);
        expect(contrastRatio(t.vars["--muted-foreground"], t.vars["--muted"])).toBeGreaterThanOrEqual(4.5);
        expect(t.contrast.status).not.toBe("fail");
      }
    }
  });

  it("reports 'adjusted', not 'ok', when the seed's lightness was overruled", () => {
    // A pastel seed cannot carry white text at its own lightness; enforce
    // darkens it. The report must SAY so — a silent fix is half a lie.
    const t = deriveTheme("#ffe4ec", "quiet")!;
    expect(t.contrast.status).toBe("adjusted");
  });

  it("keeps the seed's hue — the village's colour stays theirs", () => {
    const t = deriveTheme("#7b2d8b", "woven")!; // purple
    const brand = hexToHsl(t.vars["--primary"])!;
    const seed = hexToHsl("#7b2d8b")!;
    expect(Math.abs(brand.h - seed.h)).toBeLessThan(2);
  });

  it("cards shape radius and typography", () => {
    const civic = deriveTheme("#157f7d", "civic")!;
    const woven = deriveTheme("#157f7d", "woven")!;
    expect(civic.vars["--radius"]).toBe("0.25rem");
    expect(woven.vars["--radius"]).toBe("1rem");
    expect(civic.fonts.display).toContain("Marcellus");
    expect(woven.fonts.display).toContain("Cormorant Garamond");
  });

  it("atContrast changes lightness as little as necessary", () => {
    const seed = hexToHsl("#157f7d")!;
    const adjusted = atContrast(seed, "#ffffff", 4.5, true);
    expect(contrastRatio(hslToHex(adjusted), "#ffffff")).toBeGreaterThanOrEqual(4.5);
    // #157f7d already carries white at 4.5? If not, the adjustment is small.
    expect(Math.abs(adjusted.l - seed.l)).toBeLessThan(0.15);
  });
});
