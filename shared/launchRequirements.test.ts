/**
 * The launch checklist's recognition-token row, pinned in both directions.
 *
 * The bug this exists to stop coming back: the resolver read
 * `brand.currency.name` while `mergedConfig()` took the displayed name from
 * the token registry. So the item was red for a founder who renamed correctly
 * and green for one who typed into a box that changed nothing. Both halves get
 * a case here, plus the link, because the row was wrong in both directions and
 * fixing one half would have left the other reading exactly as before.
 */
import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "./gameConfig";
import { LAUNCH_REQUIREMENTS, recognitionNameCheck } from "./launchRequirements";

const DEFAULT_WORD = GAME_CONFIG.currency.name;

describe("recognitionNameCheck", () => {
  it("passes when the registry carries the village's own word", () => {
    const r = recognitionNameCheck("Thanks", DEFAULT_WORD);
    expect(r.state).toBe("ok");
    expect(r.detail).toContain("Thanks");
  });

  it("stays open while the registry still carries the platform's word", () => {
    const r = recognitionNameCheck(DEFAULT_WORD, DEFAULT_WORD);
    expect(r.state).toBe("missing");
    expect(r.detail).toContain(DEFAULT_WORD);
  });

  it("ignores case and surrounding space, because a chip reads the same either way", () => {
    expect(recognitionNameCheck(`  ${DEFAULT_WORD.toLowerCase()} `, DEFAULT_WORD).state).toBe("missing");
  });

  it("says so plainly when the registry has no row to read", () => {
    for (const missing of [undefined, null, "", "   "]) {
      const r = recognitionNameCheck(missing, DEFAULT_WORD);
      expect(r.state).toBe("missing");
      expect(r.detail).toMatch(/no name in this village's registry/);
    }
  });

  it("never quotes an empty name at the founder", () => {
    // `Recognition still carries the platform's own word, “”` is the shape
    // this branch exists to avoid.
    expect(recognitionNameCheck("", DEFAULT_WORD).detail).not.toContain("“”");
  });
});

describe("the recognition-token requirement", () => {
  const item = LAUNCH_REQUIREMENTS.find((r) => r.id === "brand-token-names")!;

  it("sends a founder to the registry, which is the only surface that can change it", () => {
    expect(item).toBeDefined();
    expect(item.fixAt).toBe("/admin?tab=tokens");
    // The Setup Wizard's two currency boxes were the old destination and could
    // never win against the registry. They are gone; this must not point back.
    expect(item.fixAt).not.toContain("tab=setup");
  });
});
