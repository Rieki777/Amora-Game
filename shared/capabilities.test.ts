/**
 * The one gate's truth table (S36). hasCapability is the single permission
 * decision in the product; this table pins its order of authority so no
 * later contributor can quietly reorder it:
 *
 *   admin > deny > role > badge > stage > nothing
 *
 * Gate E, stated as a test: a warning badge's deny beats a ROLE grant (and
 * a badge grant, and a stage unlock). Only admin outranks a deny.
 */
import { describe, expect, it } from "vitest";
import { hasCapability, STAGE_UNLOCKS, type Capability } from "./capabilities";

const LADDER = ["visitor", "guest", "member", "co-creator"];
const stageIndexOf = (id: string) => LADDER.indexOf(id);

/** forum.post unlocks at 'member' (index 2) — the stage-driven fixture. */
const CAP: Capability = "forum.post";

function ctx(overrides: Partial<Parameters<typeof hasCapability>[1]> = {}) {
  return {
    stageIndex: 0, // visitor: below every unlock
    stageIndexOf,
    roleCapabilities: [] as string[],
    ...overrides,
  };
}

describe("hasCapability truth table", () => {
  it("row 0: nothing grants → false", () => {
    expect(hasCapability(CAP, ctx())).toBe(false);
  });

  it("row 1: stage alone grants", () => {
    expect(STAGE_UNLOCKS[CAP]).toBe("member"); // fixture assumption, pinned
    expect(hasCapability(CAP, ctx({ stageIndex: 2 }))).toBe(true);
    expect(hasCapability(CAP, ctx({ stageIndex: 1 }))).toBe(false); // one below
  });

  it("row 2: role alone grants, regardless of stage", () => {
    expect(hasCapability(CAP, ctx({ roleCapabilities: [CAP] }))).toBe(true);
  });

  it("row 3: badge alone grants, regardless of stage", () => {
    expect(hasCapability(CAP, ctx({ badgeCapabilities: [CAP] }))).toBe(true);
  });

  it("row 4: a capability with NO stage unlock is never granted by stage", () => {
    // forum.moderate has no STAGE_UNLOCKS entry: only role/badge/admin open it.
    expect(hasCapability("forum.moderate", ctx({ stageIndex: 99 }))).toBe(false);
    expect(hasCapability("forum.moderate", ctx({ badgeCapabilities: ["forum.moderate"] }))).toBe(true);
  });

  it("GATE E: deny beats the badge grant", () => {
    expect(hasCapability(CAP, ctx({ badgeCapabilities: [CAP], badgeDenies: [CAP] }))).toBe(false);
  });

  it("GATE E: deny beats the ROLE grant — a warning a role overrides is no warning", () => {
    expect(hasCapability(CAP, ctx({ roleCapabilities: [CAP], badgeDenies: [CAP] }))).toBe(false);
  });

  it("GATE E: deny beats the stage unlock", () => {
    expect(hasCapability(CAP, ctx({ stageIndex: 3, badgeDenies: [CAP] }))).toBe(false);
  });

  it("GATE E: deny beats every grant source COMBINED", () => {
    expect(
      hasCapability(CAP, ctx({ stageIndex: 3, roleCapabilities: [CAP], badgeCapabilities: [CAP], badgeDenies: [CAP] })),
    ).toBe(false);
  });

  it("admin outranks everything, including a deny", () => {
    expect(hasCapability(CAP, ctx({ isAdmin: true }))).toBe(true);
    expect(hasCapability(CAP, ctx({ isAdmin: true, badgeDenies: [CAP] }))).toBe(true);
  });

  it("a deny only blocks ITS capability, not the member's whole hand", () => {
    const c = ctx({ stageIndex: 3, badgeDenies: ["map.contact"] });
    expect(hasCapability("map.contact", c)).toBe(false);
    expect(hasCapability(CAP, c)).toBe(true); // untouched grant still works
  });

  it("absent badge fields behave exactly like empty lists (back-compat)", () => {
    const before = hasCapability(CAP, ctx({ stageIndex: 2 }));
    const after = hasCapability(CAP, ctx({ stageIndex: 2, badgeCapabilities: [], badgeDenies: [] }));
    expect(before).toBe(after);
  });
});

/**
 * The map's two keys (0063). The village's front door is an appointment, so
 * the interesting assertions here are about what does NOT grant them.
 */
describe("map.edit and map.publish are appointments", () => {
  const KEYS: Capability[] = ["map.edit", "map.publish"];

  it("no stage unlocks either, at any height on the ladder", () => {
    for (const key of KEYS) {
      expect(STAGE_UNLOCKS[key]).toBeUndefined();
      // Top of the ladder, nothing appointed: still closed.
      expect(hasCapability(key, ctx({ stageIndex: LADDER.length - 1 }))).toBe(false);
    }
  });

  it("both are grantable by role and by badge", () => {
    for (const key of KEYS) {
      expect(hasCapability(key, ctx({ roleCapabilities: [key] }))).toBe(true);
      expect(hasCapability(key, ctx({ badgeCapabilities: [key] }))).toBe(true);
    }
  });

  /*
   * The reason they are two keys and not one. A member who may draft must be
   * able to hold map.edit while map.publish stays shut, or the split buys
   * nothing.
   */
  it("drafting does not imply publishing", () => {
    const drafter = ctx({ badgeCapabilities: ["map.edit"] });
    expect(hasCapability("map.edit", drafter)).toBe(true);
    expect(hasCapability("map.publish", drafter)).toBe(false);
  });

  it("a warning badge suspends publishing while editing survives", () => {
    const c = ctx({ roleCapabilities: ["map.edit", "map.publish"], badgeDenies: ["map.publish"] });
    expect(hasCapability("map.publish", c)).toBe(false);
    expect(hasCapability("map.edit", c)).toBe(true);
  });
});
