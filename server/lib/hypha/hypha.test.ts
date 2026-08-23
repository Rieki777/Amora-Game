/**
 * The Hypha Bridge module's decisions, tested where they are decisions.
 *
 * Everything here is pure: the listener posture, the switchover rule, the space
 * check and the outcome matcher all take their inputs as arguments, so every
 * branch is reachable without a database and without a chain. The chain reads
 * and the store are driven for real in `server/hypha.test.ts`.
 */
import { describe, expect, it } from "vitest";
import { alchemyEndpoint, discoverySourceProblem } from "./discovery";
import { isDedicatedRpc, listenerHeadline, listenerPosture } from "./listener";
import { checkSpace, matchOutcome, readInboundOutcome } from "./outcomes";
import { switchoverPreflight } from "./switchover";

const ALCHEMY = "https://base-mainnet.g.alchemy.com/v2/somekey";
const PUBLIC = "https://mainnet.base.org";

describe("who runs the listener (R58a)", () => {
  it("a village the hub carries is on the hub's listener, and pays nothing extra for it", () => {
    const p = listenerPosture({ hubUrl: "https://hub.example", hubSecretConfigured: true, rpcUrl: PUBLIC });
    expect(p.mode).toBe("hub");
    expect(p.todo).toBe("");
    expect(p.cost.toLowerCase()).toContain("hub pays");
  });

  it("a hub URL with no secret is NOT the hosted posture: the credential is the relationship", () => {
    // The hub URL carries a platform default, so every fork has one. If the URL
    // alone decided, every unhosted fork would read itself as covered by a
    // listener nobody is paying for.
    const p = listenerPosture({ hubUrl: "https://hub.example", hubSecretConfigured: false, rpcUrl: ALCHEMY });
    expect(p.mode).toBe("self");
  });

  it("self hosting needs a dedicated endpoint, and the inherited public default is not one", () => {
    expect(isDedicatedRpc(PUBLIC)).toBe(false);
    expect(isDedicatedRpc(`${PUBLIC}/`)).toBe(false);
    expect(isDedicatedRpc("")).toBe(false);
    expect(isDedicatedRpc(ALCHEMY)).toBe(true);

    const p = listenerPosture({ hubUrl: "", hubSecretConfigured: false, rpcUrl: PUBLIC });
    expect(p.mode).toBe("none");
    expect(p.todo).not.toBe("");
  });

  it("every posture says who pays and answers the listing headline", () => {
    for (const input of [
      { hubUrl: "https://hub.example", hubSecretConfigured: true, rpcUrl: PUBLIC },
      { hubUrl: "", hubSecretConfigured: false, rpcUrl: ALCHEMY },
      { hubUrl: "", hubSecretConfigured: false, rpcUrl: "" },
    ]) {
      const p = listenerPosture(input);
      expect(p.summary.length).toBeGreaterThan(20);
      expect(p.cost.length).toBeGreaterThan(20);
      expect(listenerHeadline(p).length).toBeGreaterThan(20);
    }
  });
});

describe("discovery has to have something to look with", () => {
  it("an Alchemy RPC is its own lookup source, so no second key is needed", () => {
    expect(alchemyEndpoint(ALCHEMY)).toBe(ALCHEMY);
    expect(alchemyEndpoint(PUBLIC)).toBeNull();
    expect(discoverySourceProblem(ALCHEMY, false)).toBeNull();
  });

  it("the public default with no Basescan key refuses, and names all three doors", () => {
    const problem = discoverySourceProblem(PUBLIC, false);
    expect(problem).toBeTruthy();
    expect(problem).toContain("Alchemy");
    expect(problem).toContain("Basescan");
    expect(problem).toContain("by hand");
    // A Basescan key alone is a lookup source, with any RPC.
    expect(discoverySourceProblem(PUBLIC, true)).toBeNull();
  });
});

describe("the space check (R58 upgrade 6)", () => {
  it("no configured space id checks nothing and claims nothing", () => {
    expect(checkSpace("", { spaceId: "42" })).toEqual({ verdict: "unconfigured" });
    expect(checkSpace("   ", {})).toEqual({ verdict: "unconfigured" });
  });

  it("a matching space passes, on any of the three field spellings", () => {
    expect(checkSpace("42", { spaceId: "42" }).verdict).toBe("match");
    expect(checkSpace("42", { space_id: "42" }).verdict).toBe("match");
    expect(checkSpace("42", { space: " 42 " }).verdict).toBe("match");
  });

  it("a delivery naming a DIFFERENT space is a mismatch, which the webhook refuses", () => {
    const out = checkSpace("42", { spaceId: "43" });
    expect(out.verdict).toBe("mismatch");
    expect(out).toHaveProperty("claimed", "43");
  });

  it("a delivery naming NO space is unstated, never a silent pass", () => {
    // The distinction is the whole point of the field existing. A check that
    // cannot run must not report the same verdict as one that ran and passed.
    expect(checkSpace("42", { outcome: "passed" }).verdict).toBe("unstated");
    expect(checkSpace("42", { spaceId: "" }).verdict).toBe("unstated");
  });

  it("ids are compared as strings, so 007 is not 7", () => {
    expect(checkSpace("7", { spaceId: "007" }).verdict).toBe("mismatch");
  });
});

describe("an outcome finding its way home (R58 upgrade 3)", () => {
  const found = (id: string) => ({
    byAgreementId: async () => id,
    proposalExists: async () => false,
  });
  const nothing = {
    byAgreementId: async () => null,
    proposalExists: async () => false,
  };

  it("reads the agreement id off any of the spellings a sender might use", () => {
    expect(readInboundOutcome({ agreementId: "991" }, "confirmed").agreementId).toBe("991");
    expect(readInboundOutcome({ agreement_id: "991" }, "confirmed").agreementId).toBe("991");
    expect(readInboundOutcome({ hyphaProposalId: "991" }, "confirmed").agreementId).toBe("991");
  });

  it("finds the marker in a title as well as in a field", () => {
    expect(readInboundOutcome({ title: "[gm:abc-1] Raise the cap" }, "confirmed").marker).toBe("abc-1");
    expect(readInboundOutcome({ marker: "[gm:abc-1]" }, "confirmed").marker).toBe("abc-1");
  });

  it("the AGREEMENT ID is the strong key, because the marker is a field a human can edit", async () => {
    const inbound = readInboundOutcome({ agreementId: "991", title: "[gm:p-1] x" }, "confirmed");
    const m = await matchOutcome(inbound, found("p-2"));
    expect(m.matchedBy).toBe("agreement");
    expect(m.proposalId).toBe("p-2");
  });

  it("falls back to the marker when no agreement id came with the delivery", async () => {
    const inbound = readInboundOutcome({ title: "[gm:p-1] x" }, "confirmed");
    const m = await matchOutcome(inbound, {
      byAgreementId: async () => null,
      proposalExists: async (id) => id === "p-1",
    });
    expect(m.matchedBy).toBe("marker");
    expect(m.proposalId).toBe("p-1");
  });

  it("reports a CONFLICT when the two keys name different proposals, and still trusts the chain's", async () => {
    const inbound = readInboundOutcome({ agreementId: "991", title: "[gm:p-1] x" }, "confirmed");
    const m = await matchOutcome(inbound, {
      byAgreementId: async () => "p-2",
      proposalExists: async (id) => id === "p-1",
    });
    expect(m.proposalId).toBe("p-2");
    expect(m.conflict).toBe(true);
  });

  it("a delivery matching neither is an ORPHAN, which is a state and never a drop", async () => {
    const inbound = readInboundOutcome({ agreementId: "404", title: "[gm:gone] x" }, "rejected");
    const m = await matchOutcome(inbound, nothing);
    expect(m.matchedBy).toBe("none");
    expect(m.proposalId).toBeNull();
  });

  it("a delivery id makes the dedupe key stable, and its absence composes one", () => {
    expect(readInboundOutcome({ deliveryId: "d-9", agreementId: "1" }, "confirmed").deliveryKey).toBe("d-9");
    expect(readInboundOutcome({ agreementId: "1", marker: "[gm:p]" }, "confirmed").deliveryKey).toBe("1:p:confirmed");
  });
});

describe("the switchover (R58 upgrade 4)", () => {
  it("names the direction and strands nothing when nothing is running", () => {
    const p = switchoverPreflight({ currentMethod: "custom", targetMethod: "hypha", byStatus: {} });
    expect(p.direction).toBe("to-hypha");
    expect(p.inFlight).toBe(0);
    expect(p.strands).toBe(false);
  });

  it("counts what is in flight and says what each group does", () => {
    const p = switchoverPreflight({
      currentMethod: "custom",
      targetMethod: "hypha",
      byStatus: { open: 2, onsite_vote: 1, to_hypha: 1, passed_claimed: 1 },
    });
    expect(p.inFlight).toBe(5);
    expect(p.effect).toContain("open ballot here");
    expect(p.effect).toContain("None of them is stranded");
    expect(p.strands).toBe(false);
  });

  it("strands nothing in EITHER direction, whatever is running", () => {
    // The claim is unconditional, so the test is too. `server/hypha.test.ts`
    // proves the mechanism behind it against a real ballot.
    for (const targetMethod of ["hypha", "custom", "consent", "majority"]) {
      for (const currentMethod of ["hypha", "custom"]) {
        const p = switchoverPreflight({
          currentMethod,
          targetMethod,
          byStatus: { open: 3, onsite_vote: 2, to_hypha: 1, passed_claimed: 4 },
        });
        expect(p.strands, `${currentMethod} to ${targetMethod}`).toBe(false);
        expect(p.rule).toContain("finish under the rules they opened with");
      }
    }
  });

  it("ignores statuses that are not in flight, so a landed decision is never counted", () => {
    const p = switchoverPreflight({
      currentMethod: "custom",
      targetMethod: "hypha",
      byStatus: { applied: 40, failed: 12, withdrawn: 3, draft: 7 },
    });
    expect(p.inFlight).toBe(0);
    expect(p.byStatus).toEqual({});
  });
});
