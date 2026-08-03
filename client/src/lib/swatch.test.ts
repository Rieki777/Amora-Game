import { describe, expect, it } from "vitest";
import { swatchFor, SWATCH_CHOICES, SWATCH_FALLBACK } from "./swatch";

describe("resolving an admin-chosen colour with legible ink", () => {
  it("keeps a dark colour and writes on it in white", () => {
    expect(swatchFor("bg-teal-deep")).toEqual({ bg: "bg-teal-deep", ink: "text-white" });
    expect(swatchFor("bg-sage")).toEqual({ bg: "bg-sage", ink: "text-white" });
    expect(swatchFor("bg-forest")).toEqual({ bg: "bg-forest", ink: "text-white" });
    expect(swatchFor("bg-coral")).toEqual({ bg: "bg-coral", ink: "text-white" });
    expect(swatchFor("bg-gold")).toEqual({ bg: "bg-gold", ink: "text-white" });
  });

  it("keeps a light colour and flips the ink dark instead of dropping the colour", () => {
    // The old code hardcoded white here, which is why bg-amber and friends
    // were unreadable. The editor's choice survives; the ink moves.
    expect(swatchFor("bg-amber")).toEqual({ bg: "bg-amber", ink: "text-foreground" });
    expect(swatchFor("bg-teal")).toEqual({ bg: "bg-teal", ink: "text-foreground" });
    expect(swatchFor("bg-cream")).toEqual({ bg: "bg-cream", ink: "text-foreground" });
    expect(swatchFor("bg-aqua-light")).toEqual({ bg: "bg-aqua-light", ink: "text-foreground" });
    expect(swatchFor("bg-sage-light")).toEqual({ bg: "bg-sage-light", ink: "text-foreground" });
  });

  it("falls back when the class does not exist", () => {
    // Four live records carried bg-sage-light while it was undefined; the
    // swatch painted nothing and white pills sat on white card. Now the class
    // is real, but a typo still has to land somewhere safe.
    expect(swatchFor("bg-sage-lite").bg).toBe(SWATCH_FALLBACK);
    expect(swatchFor("bg-mauve-ish").bg).toBe(SWATCH_FALLBACK);
    expect(swatchFor("").bg).toBe(SWATCH_FALLBACK);
    expect(swatchFor(undefined).bg).toBe(SWATCH_FALLBACK);
    expect(swatchFor(null).bg).toBe(SWATCH_FALLBACK);
  });

  it("falls back on a mid-tone no ink survives", () => {
    // bg-teal-light is 3.44:1 against white and 3.58:1 against the dark
    // foreground, so neither foreground clears AA on it.
    expect(swatchFor("bg-teal-light").bg).toBe(SWATCH_FALLBACK);
  });

  it("rejects an opacity suffix rather than trusting it", () => {
    // Fading the panel is what lets the text disappear into the card.
    expect(swatchFor("bg-sage/40").bg).toBe(SWATCH_FALLBACK);
    expect(swatchFor("bg-teal-deep/10").bg).toBe(SWATCH_FALLBACK);
  });

  it("tolerates the whitespace an editor leaves behind", () => {
    expect(swatchFor("  bg-sage  ")).toEqual({ bg: "bg-sage", ink: "text-white" });
  });

  it("honours an explicit fallback", () => {
    expect(swatchFor("nonsense", "bg-teal-deep")).toEqual({ bg: "bg-teal-deep", ink: "text-white" });
  });

  it("always returns ink, even if the fallback is itself unknown", () => {
    expect(swatchFor("nonsense", "bg-not-a-thing").ink).toBe("text-white");
  });

  it("offers only choices it would accept back unchanged", () => {
    for (const choice of SWATCH_CHOICES) expect(swatchFor(choice).bg).toBe(choice);
  });
});
