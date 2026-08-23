/**
 * The handle on the break-glass, tested where it is testable.
 *
 * This repo's client tests are pure logic and there is no jsdom, so the
 * reading of a refusal and the sentences it turns into are the whole surface
 * here. The wrapper itself, the dialog and the replay carrying the header are
 * driven for real by `server/glassHandle.routes.e2e.test.ts` and by a browser
 * on a booted server, because a fake `fetch` asserting that a fake header was
 * set proves nothing about either.
 */
import { describe, expect, it } from "vitest";
import { breakGlassCopy, readOverrideRefusal, OVERRIDE_HEADER } from "./breakGlass";

const REFUSAL = {
  error: "This village holds this one. Steward Circle looks after it now, and you are not seated there.",
  capability: "forum.moderate",
  villageHolds: true,
  requiresOverride: true,
  holder: "Steward Circle",
  title: "The forum",
  consequence: "hide posts and act on reports for the whole community",
};

describe("reading the one refusal that has a way through", () => {
  it("reads the facts off a village-held 409", () => {
    const ask = readOverrideRefusal(409, REFUSAL);
    expect(ask).toEqual({
      capability: "forum.moderate",
      title: "The forum",
      holder: "Steward Circle",
      consequence: "hide posts and act on reports for the whole community",
    });
  });

  it("ignores every other 409 in the product", () => {
    // The escalation confirm, the already-open ask, the closed ballot. Each
    // one is a real 409 with its own control, and offering to break glass on
    // any of them would be an answer to a question nobody asked.
    expect(readOverrideRefusal(409, { error: "nope", requiresConfirmation: true })).toBeNull();
    expect(readOverrideRefusal(409, { error: "You already have this ask open" })).toBeNull();
    expect(readOverrideRefusal(409, { requiresOverride: false, capability: "forum.moderate" })).toBeNull();
  });

  it("ignores every other status, including a 403 that carries the flag", () => {
    expect(readOverrideRefusal(403, REFUSAL)).toBeNull();
    expect(readOverrideRefusal(200, REFUSAL)).toBeNull();
    expect(readOverrideRefusal(401, REFUSAL)).toBeNull();
  });

  it("refuses a body that is not an object, and an array", () => {
    expect(readOverrideRefusal(409, null)).toBeNull();
    expect(readOverrideRefusal(409, "requiresOverride")).toBeNull();
    expect(readOverrideRefusal(409, [REFUSAL])).toBeNull();
  });

  it("needs a capability, because the whole dialog is about one power", () => {
    expect(readOverrideRefusal(409, { requiresOverride: true })).toBeNull();
    expect(readOverrideRefusal(409, { requiresOverride: true, capability: "" })).toBeNull();
    expect(readOverrideRefusal(409, { requiresOverride: true, capability: 7 })).toBeNull();
  });

  it("prints the key when the registry has no title for it", () => {
    // The honest fallback, and the same one `capabilityLabel` makes on the
    // server: a missing title is a missing row, and saying the key out loud
    // is how somebody finds out.
    const ask = readOverrideRefusal(409, { requiresOverride: true, capability: "dial.set" });
    expect(ask?.title).toBe("dial.set");
  });

  it("keeps a missing holder and a missing consequence missing", () => {
    const ask = readOverrideRefusal(409, {
      requiresOverride: true,
      capability: "dial.set",
      holder: "",
      consequence: null,
    });
    expect(ask?.holder).toBeNull();
    expect(ask?.consequence).toBeNull();
  });
});

describe("the sentences an operator reads before deciding", () => {
  it("names the power, what it does, and who looks after it", () => {
    const copy = breakGlassCopy(readOverrideRefusal(409, REFUSAL)!);
    expect(copy.power).toBe(
      "The forum. Whoever holds it can hide posts and act on reports for the whole community.",
    );
    expect(copy.holder).toBe("Steward Circle looks after it now, and you are not seated there.");
  });

  it("says the record without inventing a holder or a consequence", () => {
    const copy = breakGlassCopy({
      capability: "dial.set",
      title: "dial.set",
      holder: null,
      consequence: null,
    });
    expect(copy.power).toBe("dial.set.");
    expect(copy.holder).toContain("The village looks after it now");
    expect(copy.holder).not.toContain("null");
    expect(copy.power).not.toContain("undefined");
  });

  it("states the consequence as a fact and never as an argument", () => {
    /*
     * R56 is what this case pins. The line says what happens and stops. It
     * does not ask whether somebody is sure, does not call anything
     * dangerous, and carries no exclamation, because an operator with a good
     * reason should not be talked out of a thing they are allowed to do.
     */
    const copy = breakGlassCopy(readOverrideRefusal(409, REFUSAL)!);
    expect(copy.record).toBe(
      "If the act goes through, the village's own feed carries a line naming you and this power, " +
        "and whoever holds it is told.",
    );
    expect(copy.record).not.toMatch(/!|sure\?|danger|warning|careful|irreversible/i);
    expect(copy.heading).not.toMatch(/\?/);
    expect(copy.confirm).toBe("Act anyway");
    expect(copy.dismiss).toBe("Leave it");
  });

  it("spells the header the way the server reads it", () => {
    expect(OVERRIDE_HEADER).toBe("x-capability-override");
  });
});
