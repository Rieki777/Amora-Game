/**
 * The Game Mechanics foundation, pinned.
 *
 * Three properties the whole initiative stands on:
 *  1. Generated defs mirror the ladder — every stage gets its multiplier
 *     variable (and quest-threshold / unlock variables where applicable)
 *     whose DEFAULT equals the previously-hardcoded config value, so an
 *     untouched village is byte-identical to the pre-registry game.
 *  2. Ring resolution is deterministic and safe-by-default: infrastructure
 *     and abuse guards are founder-held, game rules are open.
 *  3. The one gate honors per-village unlock overrides WITHOUT changing its
 *     order of authority — including "none", which closes the stage path
 *     while roles still grant.
 */
import { describe, expect, it } from "vitest";
import {
  applyTimingOf,
  ringOf,
  VARIABLES,
  VARIABLES_BY_KEY,
} from "./gameVariables";
import { GAME_CONFIG } from "./gameConfig";
import { hasCapability, STAGE_UNLOCKS, type Capability } from "./capabilities";

const stageIndexOf = (id: string) => GAME_CONFIG.stages.findIndex((s) => s.id === id);

describe("generated progression defs", () => {
  it("every stage has a multiplier variable defaulting to its config value", () => {
    for (const s of GAME_CONFIG.stages) {
      const def = VARIABLES_BY_KEY[`progression.multiplier.${s.id}`];
      expect(def, `missing multiplier def for stage ${s.id}`).toBeTruthy();
      expect(Number(def.default)).toBe(s.gratitudeMultiplier);
    }
  });

  it("every quests-rule stage has a threshold variable defaulting to its config min", () => {
    for (const s of GAME_CONFIG.stages) {
      if (s.rule.type !== "quests") continue;
      const def = VARIABLES_BY_KEY[`progression.quests_for.${s.id}`];
      expect(def, `missing quests_for def for stage ${s.id}`).toBeTruthy();
      expect(Number(def.default)).toBe(s.rule.min);
    }
  });

  it("every platform stage-unlock has an override variable defaulting to the platform stage, with a 'none' escape", () => {
    for (const [cap, stage] of Object.entries(STAGE_UNLOCKS)) {
      const def = VARIABLES_BY_KEY[`progression.unlock.${cap}`];
      expect(def, `missing unlock def for ${cap}`).toBeTruthy();
      expect(def.default).toBe(stage);
      expect(def.choices?.some((c) => c.value === "none")).toBe(true);
      // Every choice is a real stage id or "none" — a typo'd stage in a
      // choice list would make the gate silently never match.
      for (const c of def.choices ?? []) {
        expect(c.value === "none" || stageIndexOf(c.value) >= 0).toBe(true);
      }
    }
  });

  it("the registry has no duplicate keys (the import-time guard's invariant)", () => {
    expect(Object.keys(VARIABLES_BY_KEY).length).toBe(VARIABLES.length);
  });
});

describe("ring resolution", () => {
  it("game rules are open, infrastructure and guards are founder-held", () => {
    expect(ringOf(VARIABLES_BY_KEY["gratitude.base_budget"])).toBe("open");
    expect(ringOf(VARIABLES_BY_KEY["quest.consent_cap_mode"])).toBe("open");
    expect(ringOf(VARIABLES_BY_KEY["progression.multiplier.guest"])).toBe("open");
    expect(ringOf(VARIABLES_BY_KEY["abuse.register_per_ip_hourly"])).toBe("founder");
    expect(ringOf(VARIABLES_BY_KEY["tokens.base_rpc_url"])).toBe("founder");
    expect(ringOf(VARIABLES_BY_KEY["hypha.org_url"])).toBe("founder");
    expect(ringOf(VARIABLES_BY_KEY["auth.session_days"])).toBe("founder");
  });

  it("settlement-basis variables apply at cycle close; the rest instantly", () => {
    expect(applyTimingOf(VARIABLES_BY_KEY["gratitude.pool_per_cycle"])).toBe("cycle-close");
    expect(applyTimingOf(VARIABLES_BY_KEY["progression.multiplier.member"])).toBe("cycle-close");
    expect(applyTimingOf(VARIABLES_BY_KEY["quest.consent_cap_mode"])).toBe("instant");
  });
});

describe("the gate with per-village unlock overrides", () => {
  const baseCtx = {
    stageIndexOf,
    roleCapabilities: [] as string[],
  };
  const memberIdx = stageIndexOf("member");

  it("absent overrides = platform behaviour, exactly", () => {
    expect(hasCapability("forum.post", { ...baseCtx, stageIndex: memberIdx })).toBe(true);
    expect(hasCapability("forum.post", { ...baseCtx, stageIndex: stageIndexOf("guest") })).toBe(false);
  });

  it("an override moves the rung", () => {
    const stageUnlockOverrides: Partial<Record<Capability, string>> = { "forum.post": "guest" };
    expect(
      hasCapability("forum.post", { ...baseCtx, stageIndex: stageIndexOf("guest"), stageUnlockOverrides }),
    ).toBe(true);
  });

  it('"none" closes the stage path while a role still grants', () => {
    const stageUnlockOverrides: Partial<Record<Capability, string>> = { "forum.post": "none" };
    expect(
      hasCapability("forum.post", { ...baseCtx, stageIndex: stageIndexOf("sage"), stageUnlockOverrides }),
    ).toBe(false);
    expect(
      hasCapability("forum.post", {
        ...baseCtx,
        stageIndex: stageIndexOf("sage"),
        roleCapabilities: ["forum.post"],
        stageUnlockOverrides,
      }),
    ).toBe(true);
  });

  it("a badge deny still beats an override-granted stage unlock (order of authority unchanged)", () => {
    const stageUnlockOverrides: Partial<Record<Capability, string>> = { "forum.post": "guest" };
    expect(
      hasCapability("forum.post", {
        ...baseCtx,
        stageIndex: stageIndexOf("sage"),
        badgeDenies: ["forum.post"],
        stageUnlockOverrides,
      }),
    ).toBe(false);
  });
});
