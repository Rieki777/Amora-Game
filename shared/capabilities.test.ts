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
import {
  ALL_CAPABILITIES,
  CAPABILITY_LABELS,
  capabilityDecision,
  capabilityLabel,
  hasCapability,
  isVillageHeld,
  STAGE_UNLOCKS,
  TRANSFERABLE,
  type Capability,
} from "./capabilities";

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

  /*
   * UPDATED, NEVER DELETED (0098). This test used to say "admin outranks
   * everything, including a deny" with no qualification, and that sentence
   * was the reason no power could ever leave the admin panel. It is still
   * true, and it is now true of a NAMED set: everything the village has not
   * taken on. A deleted test is an invariant nobody is watching, so the old
   * assertions are all still here and the new condition sits beside them.
   */
  it("admin outranks everything, including a deny, on a power the village does not hold", () => {
    expect(hasCapability(CAP, ctx({ isAdmin: true }))).toBe(true);
    expect(hasCapability(CAP, ctx({ isAdmin: true, badgeDenies: [CAP] }))).toBe(true);
    // Explicitly with holdings present but naming something else: the
    // short-circuit is scoped to the key, never to the request.
    expect(
      hasCapability(CAP, ctx({ isAdmin: true, badgeDenies: [CAP], villageHeld: ["library.keep"] })),
    ).toBe(true);
  });

  it("an UNTRANSFERRED key answers exactly as it did before, holdings or not", () => {
    // The whole safety argument for shipping this on live deployments: the
    // holding table is empty everywhere, so every existing village gets the
    // pre-0098 gate byte for byte.
    for (const held of [undefined, [] as string[], ["library.keep"]]) {
      expect(hasCapability(CAP, ctx({ isAdmin: true, villageHeld: held }))).toBe(true);
      expect(hasCapability(CAP, ctx({ roleCapabilities: [CAP], villageHeld: held }))).toBe(true);
      expect(hasCapability(CAP, ctx({ badgeDenies: [CAP], roleCapabilities: [CAP], villageHeld: held }))).toBe(false);
      expect(hasCapability(CAP, ctx({ villageHeld: held }))).toBe(false);
    }
  });

  describe("a TRANSFERRED key: the admin is judged like anybody else", () => {
    // A real transferable key, read off the map so this cannot drift.
    const MOVED: Capability = "library.keep";
    const held = { villageHeld: [MOVED as string] };

    it("is transferable in the first place, or the rest of this block proves nothing", () => {
      expect(TRANSFERABLE[MOVED]).toBe(true);
    });

    it("an admin holding it by nothing else is refused", () => {
      expect(hasCapability(MOVED, ctx({ isAdmin: true, ...held }))).toBe(false);
      expect(capabilityDecision(MOVED, ctx({ isAdmin: true, ...held })).source).toBe("not granted");
    });

    it("an admin who holds the ROLE passes, and passes AS the holder", () => {
      const d = capabilityDecision(MOVED, ctx({ isAdmin: true, roleCapabilities: [MOVED], ...held }));
      expect(d.allowed).toBe(true);
      expect(d.source).toBe("role");
      expect(d.reachedPastVillage).toBe(false);
    });

    it("a warning badge's deny now reaches an ADMIN, because steps 2-5 are what judges them", () => {
      const d = capabilityDecision(
        MOVED,
        ctx({ isAdmin: true, roleCapabilities: [MOVED], badgeDenies: [MOVED], ...held }),
      );
      expect(d.allowed).toBe(false);
      expect(d.source).toBe("denied by warning badge");
    });

    it("the break-glass passes and says it owes a record", () => {
      const d = capabilityDecision(MOVED, ctx({ isAdmin: true, adminOverride: true, ...held }));
      expect(d.allowed).toBe(true);
      expect(d.source).toBe("admin-override");
      expect(d.reachedPastVillage).toBe(true);
    });

    it("the break-glass is an ADMIN's affordance and grants a member nothing", () => {
      const d = capabilityDecision(MOVED, ctx({ adminOverride: true, ...held }));
      expect(d.allowed).toBe(false);
      expect(d.reachedPastVillage).toBe(false);
    });

    it("a member holding it by role is untouched by the transfer", () => {
      expect(hasCapability(MOVED, ctx({ roleCapabilities: [MOVED], ...held }))).toBe(true);
    });

    it("a holding row naming a NON-transferable key cannot close a door", () => {
      // The second lock, beside the boot assertion. A hand-written INSERT is
      // invisible to code review by definition.
      expect(TRANSFERABLE["message.send"]).toBe(false);
      const d = capabilityDecision("message.send", ctx({ isAdmin: true, villageHeld: ["message.send"] }));
      expect(d.allowed).toBe(true);
      expect(d.source).toBe("admin");
      expect(isVillageHeld("message.send", ["message.send"])).toBe(false);
    });
  });

  describe("the TRANSFERABLE map", () => {
    it("classifies every capability, and nothing else", () => {
      expect(Object.keys(TRANSFERABLE).sort()).toEqual([...ALL_CAPABILITIES].sort());
    });

    it("names at least one power, or the handover has no substrate", () => {
      expect(ALL_CAPABILITIES.filter((c) => TRANSFERABLE[c]).length).toBeGreaterThan(0);
    });

    it("never marks a personal act as a power that can move", () => {
      // A row saying the village holds "start a conversation" is a category
      // error with a lockout attached.
      for (const personal of ["forum.post", "message.send", "event.rsvp", "exchange.buy"] as Capability[]) {
        expect(TRANSFERABLE[personal], personal).toBe(false);
      }
    });
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

/**
 * The labels are what a member reads when a stage advance tells them what
 * opened. A key with no label renders as `forum.post`, which is the machine
 * text this table exists to replace, so the lockstep is a test and not a
 * comment asking nicely.
 */
describe("capability labels", () => {
  it("names every capability the platform knows about", () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(CAPABILITY_LABELS[cap], `no label for ${cap}`).toBeTruthy();
    }
  });

  it("names nothing that is not a capability", () => {
    expect(Object.keys(CAPABILITY_LABELS).sort()).toEqual([...ALL_CAPABILITIES].sort());
  });

  it("reads as the completion of 'You can now', so the list is an invitation", () => {
    for (const cap of ALL_CAPABILITIES) {
      const label = CAPABILITY_LABELS[cap];
      // A sentence-shaped label would read "You can now You may post."
      expect(label).not.toMatch(/^(You|Can|May|Able)\b/);
      expect(label).not.toMatch(/[.]$/);
      // Capitalised, because each one is a list item on its own line.
      expect(label[0]).toBe(label[0].toUpperCase());
    }
  });

  it("carries no dotted key through as its own label", () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(CAPABILITY_LABELS[cap]).not.toBe(cap);
    }
  });

  it("falls back to the key rather than dropping an unknown one", () => {
    // A key with no label is a bug in the table; saying so out loud beats
    // rendering an empty row and telling a member less than they hold.
    expect(capabilityLabel("nope.invented")).toBe("nope.invented");
    expect(capabilityLabel("forum.post")).toBe(CAPABILITY_LABELS["forum.post"]);
  });
});
