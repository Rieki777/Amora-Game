import { beforeEach, describe, expect, it } from "vitest";
import {
  clearMemberDrivers,
  erasureIncomplete,
  erasureSentence,
  exportMemberEverywhere,
  forgetMemberEverywhere,
  registerMemberDriver,
  registeredMemberDrivers,
} from "./lib/memberDrivers";
import { integrationHealth } from "./lib/integrations";

/**
 * The failure mode IS the design here, so most of this file is about refusal.
 * A member must never be told "deleted" about a store that did not answer, and
 * an export that could not read a store must say so in the document.
 */
beforeEach(() => clearMemberDrivers());

describe("with nothing registered", () => {
  it("asks nobody and says so plainly", async () => {
    const out = await forgetMemberEverywhere("u1");
    expect(out).toEqual({ asked: [], confirmed: [], unconfirmed: [] });
    expect(erasureIncomplete(out)).toBe(false);
    expect(erasureSentence(out)).toContain("Nothing outside it held a copy");
  });

  it("exports an empty set of outside stores", async () => {
    expect(await exportMemberEverywhere("u1")).toEqual({ stores: {}, unavailable: [] });
  });
});

describe("a driver that confirms", () => {
  it("is counted as confirmed and the sentence says so", async () => {
    let askedFor = "";
    registerMemberDriver("confirming", {
      forgetMember: async (id) => { askedFor = id; return { confirmed: true }; },
      exportMember: async () => ({ rows: 2 }),
    });
    const out = await forgetMemberEverywhere("u42");
    expect(askedFor).toBe("u42");
    expect(out.confirmed).toEqual(["confirming"]);
    expect(out.unconfirmed).toEqual([]);
    expect(erasureIncomplete(out)).toBe(false);
    expect(erasureSentence(out)).toContain("confirmed the same");
  });
});

describe("a driver that refuses", () => {
  it("produces a visible failure and never a silent success", async () => {
    registerMemberDriver("refusing", {
      forgetMember: async () => ({ confirmed: false, detail: "deletion is queued for review" }),
      exportMember: async () => ({}),
    });
    const out = await forgetMemberEverywhere("u1");
    expect(out.confirmed).toEqual([]);
    expect(out.unconfirmed).toHaveLength(1);
    expect(out.unconfirmed[0].module).toBe("refusing");
    expect(out.unconfirmed[0].detail).toContain("queued for review");
    expect(erasureIncomplete(out)).toBe(true);
  });

  it("says the village is not finished, and never uses the word deleted about it", async () => {
    registerMemberDriver("refusing", {
      forgetMember: async () => ({ confirmed: false, detail: "no" }),
      exportMember: async () => ({}),
    });
    const sentence = erasureSentence(await forgetMemberEverywhere("u1"));
    expect(sentence).toContain("not confirmed yet");
    expect(sentence).toContain("not finished on your behalf");
  });

  it("lands in the health record as a failure, with a correlation id", async () => {
    registerMemberDriver("recorded", {
      forgetMember: async () => ({ confirmed: false, detail: "not today" }),
      exportMember: async () => ({}),
    });
    await forgetMemberEverywhere("u1");
    const rec = integrationHealth("recorded", "forgetMember")!;
    expect(rec.lastFailureAt).toBeTruthy();
    expect(rec.lastSuccessAt).toBeNull();
    expect(rec.lastCorrelationId).toBeTruthy();
  });
});

describe("a driver that throws", () => {
  it("reads exactly the same as one that refused", async () => {
    registerMemberDriver("throwing", {
      forgetMember: async () => { throw new Error("connection reset"); },
      exportMember: async () => { throw new Error("connection reset"); },
    });
    const out = await forgetMemberEverywhere("u1");
    expect(out.unconfirmed[0].detail).toContain("connection reset");
    expect(erasureIncomplete(out)).toBe(true);
  });
});

describe("one driver refusing does not stop the others", () => {
  it("asks every registered store and reports each answer", async () => {
    registerMemberDriver("a-good", { forgetMember: async () => ({ confirmed: true }), exportMember: async () => 1 });
    registerMemberDriver("b-bad", {
      forgetMember: async () => { throw new Error("down"); },
      exportMember: async () => { throw new Error("down"); },
    });
    registerMemberDriver("c-good", { forgetMember: async () => ({ confirmed: true }), exportMember: async () => 3 });
    const out = await forgetMemberEverywhere("u1");
    expect(out.asked).toEqual(["a-good", "b-bad", "c-good"]);
    expect(out.confirmed).toEqual(["a-good", "c-good"]);
    expect(out.unconfirmed.map((u) => u.module)).toEqual(["b-bad"]);
  });
});

describe("the export", () => {
  it("names a store it could not read, so a partial file announces itself", async () => {
    registerMemberDriver("readable", { forgetMember: async () => ({ confirmed: true }), exportMember: async () => ({ notes: 4 }) });
    registerMemberDriver("unreadable", {
      forgetMember: async () => ({ confirmed: true }),
      exportMember: async () => { throw new Error("403 from the vendor"); },
    });
    const out = await exportMemberEverywhere("u1");
    expect(out.stores).toEqual({ readable: { notes: 4 } });
    expect(out.unavailable).toHaveLength(1);
    expect(out.unavailable[0].module).toBe("unreadable");
    expect(out.unavailable[0].detail).toContain("403");
  });
});

describe("the registry itself", () => {
  it("refuses a second driver for the same module", () => {
    const driver = { forgetMember: async () => ({ confirmed: true }), exportMember: async () => null };
    registerMemberDriver("only-one", driver);
    expect(() => registerMemberDriver("only-one", driver)).toThrow(/already registered/);
    expect(registeredMemberDrivers()).toEqual(["only-one"]);
  });
});
