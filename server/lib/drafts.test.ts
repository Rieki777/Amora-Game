/**
 * The draft gate (S75).
 *
 * These tests are the security property of this whole feature. `roles.capabilities`
 * is a JSON column and roles are the platform's appointment mechanism, so
 * "write me a role for the water steward" is a plausible path to forum.moderate
 * and proposal.decide unless every one of these holds.
 */
import { describe, expect, it } from "vitest";
import { ALL_CAPABILITIES } from "../../shared/capabilities";
import { CAPABILITY_CONSEQUENCE, DRAFT_KINDS, validateDraftPayload } from "../../shared/draftKinds";
import {
  applyEscalationChoices,
  capabilityCeiling,
  checkDraft,
  computeEscalations,
  roleBatchCap,
} from "./drafts";

const rolePayload = (over: Record<string, unknown> = {}) => ({
  name: "Water Steward",
  description: "Holds the water lines, the well, and the seasonal irrigation plan for the whole land.",
  capabilities: [] as string[],
  ...over,
});

describe("escalation is the real gate", () => {
  it("flags capabilities no existing role already grants", () => {
    const esc = computeEscalations(["forum.post", "exchange.manage"], ["forum.post", "quest.propose"]);
    expect(esc.map((e) => e.capability)).toEqual(["exchange.manage"]);
  });

  it("says what the capability lets a holder DO, never the key", () => {
    // An admin reads this one line and decides. "exchange.manage" tells a
    // founder nothing; the consequence tells them everything.
    const esc = computeEscalations(["exchange.manage"], []);
    expect(esc[0].consequence).toBe("list tokens, post prices, and stock the treasury");
    expect(esc[0].consequence).not.toContain("exchange.manage");
  });

  it("treats an ordinary appointment as no escalation at all", () => {
    expect(computeEscalations(["forum.post"], ["forum.post", "forum.moderate"])).toEqual([]);
  });

  it("ignores capabilities the platform does not have", () => {
    expect(computeEscalations(["admin.everything", "forum.post"], [])).toEqual([
      { capability: "forum.post", consequence: CAPABILITY_CONSEQUENCE["forum.post"] },
    ]);
  });

  it("gives every platform capability a consequence sentence", () => {
    for (const cap of ALL_CAPABILITIES) {
      expect(CAPABILITY_CONSEQUENCE[cap], `missing consequence for ${cap}`).toBeTruthy();
    }
  });
});

describe("accepting strips what was not ticked", () => {
  it("removes an escalated capability the human left unchecked", () => {
    const requested = ["forum.post", "exchange.manage"];
    const esc = computeEscalations(requested, ["forum.post"]);
    expect(applyEscalationChoices(requested, esc, { grantedEscalations: [] })).toEqual(["forum.post"]);
  });

  it("keeps an escalated capability the human ticked", () => {
    const requested = ["forum.post", "exchange.manage"];
    const esc = computeEscalations(requested, ["forum.post"]);
    expect(applyEscalationChoices(requested, esc, { grantedEscalations: ["exchange.manage"] })).toEqual(requested);
  });

  it("treats silence as refusal when the escalation list changed underneath", () => {
    // The reviewer saw one escalation and ticked it. By accept time a second
    // capability had become an escalation too. It must not ride along.
    const requested = ["forum.post", "exchange.manage", "proposal.decide"];
    const escAtAccept = computeEscalations(requested, []);
    const granted = applyEscalationChoices(requested, escAtAccept, { grantedEscalations: ["forum.post"] });
    expect(granted).toEqual(["forum.post"]);
  });

  it("never invents a capability that was not requested", () => {
    const esc = computeEscalations(["forum.post"], []);
    expect(applyEscalationChoices(["forum.post"], esc, { grantedEscalations: ALL_CAPABILITIES })).toEqual(["forum.post"]);
  });
});

describe("a draft cannot exceed its author", () => {
  it("refuses capabilities the proposer does not hold", () => {
    const r = checkDraft({
      kind: "role",
      payload: rolePayload({ capabilities: ["forum.moderate", "exchange.manage"] }),
      proposerHolds: ["forum.post"],
    });
    expect(r).toEqual({ ok: false, error: expect.stringContaining("does not hold") });
  });

  it("allows what the proposer does hold", () => {
    expect(
      checkDraft({
        kind: "role",
        payload: rolePayload({ capabilities: ["forum.post"] }),
        proposerHolds: ["forum.post", "quest.propose"],
      }),
    ).toEqual({ ok: true });
  });

  it("bounds the ceiling by the platform's own list", () => {
    expect(capabilityCeiling(["forum.post", "admin.everything"])).toEqual(["forum.post"]);
  });
});

describe("payload validation", () => {
  it("refuses an unknown kind", () => {
    expect(checkDraft({ kind: "ledger_entry", payload: {}, proposerHolds: [] })).toEqual({
      ok: false,
      error: "unknown draft kind: ledger_entry",
    });
  });

  it("only allows the kinds this phase ships", () => {
    expect(DRAFT_KINDS).toEqual(["role", "circle"]);
  });

  it("refuses fields the payload should not carry", () => {
    // A model that invents a field must be told, and a future column must not
    // be writable by a payload that predates the review UI.
    expect(validateDraftPayload("role", rolePayload({ isAdmin: true }))).toContain("unexpected field(s): isAdmin");
  });

  it("refuses a capability the platform does not have", () => {
    expect(validateDraftPayload("role", rolePayload({ capabilities: ["admin.everything"] }))).toContain(
      "unknown capabilit",
    );
  });

  it("refuses a repeated capability", () => {
    expect(validateDraftPayload("role", rolePayload({ capabilities: ["forum.post", "forum.post"] }))).toContain(
      "must not repeat",
    );
  });

  it("insists a role explains itself", () => {
    expect(validateDraftPayload("role", rolePayload({ description: "water" }))).toContain("description must be at least");
  });

  it("accepts a well formed circle", () => {
    expect(
      validateDraftPayload("circle", {
        name: "Water Council",
        purpose: "Holds every decision about the well, the lines, and seasonal irrigation.",
        status: "forming",
      }),
    ).toBeNull();
  });

  it("refuses a circle status the schema does not have", () => {
    expect(
      validateDraftPayload("circle", { name: "Water", purpose: "x".repeat(30), status: "archived" }),
    ).toContain("active, forming, or dormant");
  });

  it("refuses a payload that is not an object", () => {
    expect(validateDraftPayload("role", "Water Steward")).toBe("payload must be an object");
    expect(validateDraftPayload("role", [rolePayload()])).toBe("payload must be an object");
  });
});

describe("restraint", () => {
  it("caps a batch at the number of people who could hold a seat", () => {
    // Twenty-four seats over eight people is a chart nobody maintains, and
    // "seeding aspirational structure" is on the platform's never-build list.
    expect(roleBatchCap(8)).toBe(8);
    expect(roleBatchCap(24)).toBe(24);
  });

  it("still gives a village of one somewhere to start", () => {
    expect(roleBatchCap(0)).toBe(3);
    expect(roleBatchCap(1)).toBe(3);
  });
});
