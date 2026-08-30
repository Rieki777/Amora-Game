/**
 * THE TWO THINGS THE MODULE DOOR HAS TO GET RIGHT.
 *
 *  1. A MEMBER WHO CANNOT OPEN A VOTE IS NEVER OFFERED ONE. The advisory
 *     route answers 403 to anybody without `proposal.open`, so a door drawn
 *     for them is a walk that ends in a refusal after they have written their
 *     reasons out. The decision has to withhold the door on the way in.
 *
 *  2. A SECOND ASK FINDS THE FIRST. Two members wanting the same module must
 *     not ring the whole roll twice about one switch. The match is on the
 *     canonical question, which is why the question is built rather than
 *     typed.
 *
 * Everything here is pure: `askDoor` reads its inputs and returns a shape, so
 * these run in the node environment with no DOM and no server.
 */
import { describe, expect, it } from "vitest";
import {
  ASK_TITLE_MAX,
  askDoor,
  askQuestion,
  askedModuleId,
  type AskDoorBallot,
  type AskDoorModule,
} from "./askDoor";

const OFF: AskDoorModule = { id: "tools", name: "Tool Library", core: false, on: false, withdrawn: null };

const base = {
  module: OFF,
  signedIn: true,
  governanceOn: true,
  mayOpen: true,
  ballots: [] as AskDoorBallot[] | null,
};

/** A ballot card as the list route serves one, cut to what the door reads. */
const ballot = (over: Partial<AskDoorBallot>): AskDoorBallot => ({
  id: "b1",
  subjectType: "advisory",
  title: askQuestion("Tool Library"),
  status: "open",
  ...over,
});

describe("the question the village is asked", () => {
  it("names the module and asks one answerable thing", () => {
    expect(askQuestion("Tool Library")).toBe("Should this village turn on Tool Library?");
  });

  it("is the same sentence every time, which is what makes a second ask findable", () => {
    expect(askQuestion("Tool Library")).toBe(askQuestion(" Tool Library "));
  });

  it("stays inside the length the server stores, so the stored title still matches", () => {
    const long = askQuestion("N".repeat(400));
    expect(long.length).toBe(ASK_TITLE_MAX);
    expect(long.endsWith("?")).toBe(true);
  });
});

describe("a member who cannot open a vote is not shown a door that refuses them", () => {
  it("withholds the door", () => {
    expect(askDoor({ ...base, mayOpen: false })).toEqual({ kind: "cannotOpen" });
  });

  it("still tells them the village is already deciding it", () => {
    // Knowing an ask is running is a LOOK. Only opening one is gated, so the
    // running ask is reported before the permission is read.
    const answer = askDoor({ ...base, mayOpen: false, ballots: [ballot({ id: "b7" })] });
    expect(answer).toEqual({ kind: "running", ballotId: "b7", question: askQuestion("Tool Library") });
  });

  it("offers the door to a member who can open one", () => {
    expect(askDoor(base)).toEqual({ kind: "ask", question: askQuestion("Tool Library"), prior: null });
  });
});

describe("a second ask for the same module finds the first", () => {
  it("points at the open ask instead of offering to make another", () => {
    const answer = askDoor({ ...base, ballots: [ballot({ id: "already" })] });
    expect(answer.kind).toBe("running");
    expect(answer.kind === "running" && answer.ballotId).toBe("already");
  });

  it("finds it among a village's other decisions", () => {
    const answer = askDoor({
      ...base,
      ballots: [
        ballot({ id: "other-kind", subjectType: "mechanics", title: askQuestion("Tool Library") }),
        ballot({ id: "other-module", title: askQuestion("Village Map") }),
        ballot({ id: "the-one" }),
      ],
    });
    expect(answer.kind === "running" && answer.ballotId).toBe("the-one");
  });

  it("does not mistake another module's ask for this one", () => {
    const answer = askDoor({ ...base, ballots: [ballot({ id: "map", title: askQuestion("Village Map") })] });
    expect(answer).toEqual({ kind: "ask", question: askQuestion("Tool Library"), prior: null });
  });

  it("does not mistake a closed ask for a running one, and names it as prior", () => {
    const answer = askDoor({ ...base, ballots: [ballot({ id: "old", status: "failed" })] });
    expect(answer).toEqual({
      kind: "ask",
      question: askQuestion("Tool Library"),
      prior: { id: "old", status: "failed" },
    });
  });

  it("prefers the running ask over an answered one", () => {
    const answer = askDoor({
      ...base,
      ballots: [ballot({ id: "closed", status: "passed" }), ballot({ id: "live", status: "open" })],
    });
    expect(answer.kind === "running" && answer.ballotId).toBe("live");
  });
});

describe("when the door has nothing to offer, it says which silence it is", () => {
  const why = (over: Partial<typeof base>) => {
    const answer = askDoor({ ...base, ...over });
    return answer.kind === "quiet" ? answer.why : answer.kind;
  };

  it("stays quiet on a core module, which is always on", () => {
    expect(why({ module: { ...OFF, core: true } })).toBe("core");
  });

  it("stays quiet on a module this village already runs", () => {
    expect(why({ module: { ...OFF, on: true } })).toBe("already-on");
  });

  it("stays quiet on a withdrawn module, before it reads anything about the viewer", () => {
    // Asking the whole roll for a module the platform stopped offering would
    // spend a village's attention on a switch nobody is going to throw.
    expect(why({ module: { ...OFF, withdrawn: { since: "2026-01-01" } }, mayOpen: false })).toBe("withdrawn");
  });

  it("stays quiet for a reader with no account", () => {
    expect(why({ signedIn: false })).toBe("signed-out");
  });

  it("stays quiet where the village has not turned governance on", () => {
    expect(why({ governanceOn: false })).toBe("no-governance");
  });

  it("stays quiet while the decisions are still loading, rather than guessing", () => {
    // A door drawn before the list arrives is a door that says "nobody has
    // asked" without having looked.
    expect(why({ ballots: null })).toBe("loading");
  });
});

describe("the module a /propose link is asking about", () => {
  it("reads the id off the query string", () => {
    expect(askedModuleId("?module=tools")).toBe("tools");
  });

  it("finds it beside other parameters, in either order", () => {
    expect(askedModuleId("?next=%2Fmodules&module=tools")).toBe("tools");
    expect(askedModuleId("?module=tools&next=%2Fmodules")).toBe("tools");
  });

  it("is null on a plain /propose, so the wizard opens as it always did", () => {
    expect(askedModuleId("")).toBeNull();
    expect(askedModuleId("?")).toBeNull();
    expect(askedModuleId("?next=%2Fdecisions")).toBeNull();
  });

  it("treats an empty or blank value as no ask rather than as a module", () => {
    expect(askedModuleId("?module=")).toBeNull();
    expect(askedModuleId("?module=%20%20")).toBeNull();
  });
});
