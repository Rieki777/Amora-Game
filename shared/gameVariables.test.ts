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
  parseVariable,
  ringOf,
  validateVariable,
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
    // The waning dials carry their timing on the DEF rather than in
    // CYCLE_APPLY_KEYS, which two sessions edit at once, and a def-level
    // override cannot be lost in a merge.
    expect(applyTimingOf(VARIABLES_BY_KEY["economy.voice_decay_pct"])).toBe("cycle-close");
    expect(applyTimingOf(VARIABLES_BY_KEY["economy.voice_decay_basis"])).toBe("cycle-close");
  });
});

describe("the waning dials (R3, R15)", () => {
  const pct = VARIABLES_BY_KEY["economy.voice_decay_pct"];
  const basis = VARIABLES_BY_KEY["economy.voice_decay_basis"];

  it("starts at 1 percent a cycle, and any village may set any percent", () => {
    // The ruling, as data. 1 by default, 0 turns it off, 100 is the ceiling.
    expect(pct.default).toBe("1");
    expect(pct.type).toBe("percentage");
    expect(pct.min).toBe(0);
    expect(pct.max).toBe(100);
    expect(parseVariable(pct, undefined)).toBe(1);
    expect(parseVariable(pct, "0")).toBe(0);
    expect(validateVariable(pct, "0")).toBeNull();
    expect(validateVariable(pct, "0.5")).toBeNull();
    expect(validateVariable(pct, "101")).toMatch(/at most 100/);
    expect(validateVariable(pct, "-1")).toMatch(/at least 0/);
  });

  it("lives under The Mint, where every other economy dial lives", () => {
    // There is no Economy category in this registry, and a fifth `economy.*`
    // key anywhere else would split one admin panel across two headings.
    expect(pct.category).toBe("The Mint");
    expect(basis.category).toBe("The Mint");
    // Ring 2, derived. Any village may govern its own rate, which is the
    // ruling: "it can be any %".
    expect(ringOf(pct)).toBe("open");
    expect(ringOf(basis)).toBe("open");
  });

  it("offers one basis, and refuses the one it does not ship", () => {
    // A member's balance already IS their unspent Voice, so `unspent` has no
    // second number to mean. The key exists so a village that later gains
    // another way to spend Voice gets a real option without a rename.
    expect(basis.choices?.map((c) => c.value)).toEqual(["all"]);
    expect(basis.default).toBe("all");
    expect(validateVariable(basis, "all")).toBeNull();
    expect(validateVariable(basis, "unspent")).toMatch(/Must be one of: all/);
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

describe("a dial states its effect, and never its number", () => {
  /*
   * R79. `platform.feedback_relay` was typed `integer` with a range of 0 to 1
   * and a unit of "on/off", so Admin drew it as a number box and a founder
   * read a bare "0". The description then spent its first two sentences
   * translating that number back into English. Every reader already treated
   * the dial as a switch, so the type was the only thing that was lying.
   *
   * THE NO-MIGRATION DECISION RESTS ON THE TWO PARSE ASSERTIONS BELOW. The
   * live village stores the string "0" for this key (measured on the public
   * mechanics route, 2026-08-29, the one non-default row besides the RPC
   * URL). If the boolean parser ever stops reading "0" as false, that village
   * gets the relay switched back on by a deploy it did not ask for, and
   * members' words start leaving it. So this is pinned rather than reasoned.
   */
  const relay = VARIABLES_BY_KEY["platform.feedback_relay"];

  it("the feedback relay is a switch, with no bounds and no unit to decode", () => {
    expect(relay.type).toBe("boolean");
    expect(relay.default).toBe("true");
    expect(relay.min).toBeUndefined();
    expect(relay.max).toBeUndefined();
    expect(relay.unit).toBeUndefined();
  });

  it("a value stored in the old integer spelling still reads the same", () => {
    expect(parseVariable(relay, "0")).toBe(false); // what the live village holds
    expect(parseVariable(relay, "1")).toBe(true);
    expect(parseVariable(relay, "false")).toBe(false);
    expect(parseVariable(relay, "true")).toBe(true);
    expect(parseVariable(relay, undefined)).toBe(true); // untouched village
  });

  it("a value stored in the old integer spelling still validates", () => {
    for (const stored of ["0", "1", "true", "false"]) {
      expect(validateVariable(relay, stored), stored).toBeNull();
    }
  });

  /*
   * THE SHAPE OF THE DEFECT, so a future dial cannot wear the same clothes.
   * A dial that only accepts 0 or 1 is a switch, and typing it as a number
   * forces its description to explain what each number means. Both guards are
   * exact: at the ref this was written, `platform.feedback_relay` was the only
   * def in the whole registry matching either one.
   */
  it("no dial is a number whose only two values are 0 and 1", () => {
    const twoValued = VARIABLES.filter(
      (v) => v.type !== "boolean" && v.min === 0 && v.max === 1,
    ).map((v) => `${v.key} (${v.type})`);
    expect(twoValued).toEqual([]);
  });

  it("no dial carries an on/off unit unless it is a boolean", () => {
    const onOff = VARIABLES.filter(
      (v) => (v.unit ?? "").replace(/[^a-z]/gi, "").toLowerCase() === "onoff" && v.type !== "boolean",
    ).map((v) => `${v.key} (${v.type})`);
    expect(onOff).toEqual([]);
  });

  it("a boolean has no bounds to show, because it has no range", () => {
    const bounded = VARIABLES.filter(
      (v) => v.type === "boolean" && (v.min !== undefined || v.max !== undefined),
    ).map((v) => v.key);
    expect(bounded).toEqual([]);
  });
});

describe("governance.hub_url: https-only, no loopback exemption (bridges lane)", () => {
  const def = VARIABLES_BY_KEY["governance.hub_url"];

  it("exists, defaults to the platform hub, and is founder-held", () => {
    expect(def).toBeTruthy();
    expect(def.default).toBe("https://regencivics.earth"); // brand-ok: platform service, not a village's name
    expect(ringOf(def)).toBe("founder");
  });

  it("accepts a real https URL", () => {
    expect(validateVariable(def, "https://hub.example.org")).toBeNull();
  });

  it("accepts blank (unconfigured)", () => {
    expect(validateVariable(def, "")).toBeNull();
  });

  it("refuses plain http, unlike the generic _url rule this key would otherwise inherit", () => {
    expect(validateVariable(def, "http://hub.example.org")).toMatch(/https URL/);
  });

  it("refuses a loopback http address - the ONE thing that makes this key's rule stricter than the generic _url rule", () => {
    // The generic rule (proven true for another founder-held *_url variable
    // below) exempts 127.0.0.1/localhost for local RPC nodes. That exemption
    // must NOT reach this key: this URL carries the shared governance secret
    // as a header on every request that uses it (server/index.ts's
    // link-hypha route), and a loopback exemption on a secret-bearing URL is
    // exactly the internal-address SSRF surface this platform's own guarded
    // dialer (toolcheck.ts) exists to close everywhere else.
    expect(validateVariable(def, "http://127.0.0.1:8080")).toMatch(/https URL/);
    expect(validateVariable(def, "http://localhost:8080")).toMatch(/https URL/);
  });

  it("refuses a non-http(s) scheme", () => {
    expect(validateVariable(def, "javascript:alert(1)")).toMatch(/https URL/);
    expect(validateVariable(def, "ftp://hub.example.org")).toMatch(/https URL/);
  });

  it("the generic _url rule DOES exempt loopback for an ordinary infrastructure URL (control case)", () => {
    // Proves the two rules are genuinely different, not that the test
    // regex is loose: this is the same assertion shape as the refusal
    // above, run against a key the stricter branch does not touch.
    const rpcDef = VARIABLES_BY_KEY["tokens.base_rpc_url"];
    expect(rpcDef).toBeTruthy();
    expect(validateVariable(rpcDef, "http://127.0.0.1:8545")).toBeNull();
    expect(validateVariable(rpcDef, "http://some-other-host:8545")).toMatch(/https URL/);
  });
});
