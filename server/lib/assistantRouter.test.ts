/**
 * The cheap roads (S78, Lane K1).
 *
 * Two properties here are worth more than the routing table itself. The
 * registry is the source of truth, so a reader that lands without patterns or
 * without a template fails a test here instead of routing to the expensive
 * road forever with nobody noticing. And a renderer never throws: it returns
 * null on anything it does not recognise, because the route calls it on live
 * data and a template that dies takes the answer with it.
 */
import { describe, expect, it } from "vitest";
import { READER_KEYS } from "./villageReaders";
import { ROUTED_READERS, routeQuestion, unroutedReaders } from "./assistantRouter";
import { RENDERED_READERS, RENDERERS } from "./assistantTemplates";

/** An admin with every module on sees the whole registry. */
const ALL = [...READER_KEYS];

describe("the registry is the source of truth", () => {
  it("scores every reader that ships", () => {
    // Derived from READER_KEYS, never a list typed out here. A hardcoded copy
    // passes forever while the thing it describes moves underneath it.
    expect(unroutedReaders()).toEqual([]);
  });

  it("has a template for every reader that ships", () => {
    expect(READER_KEYS.filter((k) => !RENDERED_READERS.includes(k))).toEqual([]);
  });

  it("scores nothing the registry does not have", () => {
    expect(ROUTED_READERS.filter((k) => !READER_KEYS.includes(k))).toEqual([]);
  });
});

describe("the ten questions that were measured", () => {
  // Every one of these opened a reader through the two-POST loop and paid for
  // a model to narrate rows. All ten resolve without one now.
  const table: [string, string][] = [
    ["what roles do we have", "roles.all"],
    ["which seats are vacant", "seats.vacant"],
    ["what circles do we have", "circles.all"],
    ["how many members do we have", "members.summary"],
    ["what quests are in the library", "quests.library"],
    ["what badges do we issue", "badges.all"],
    ["what questions could the concierge not answer", "concierge.gaps"],
    ["what decisions have we recorded", "record.decisions"],
    ["show me our decision log", "record.decisions"],
    ["what have we decided", "record.decisions"],
  ];

  for (const [question, reader] of table) {
    it(`answers "${question}" from ${reader} with no model`, () => {
      const road = routeQuestion(question, ALL);
      expect(road.kind).toBe("deterministic");
      if (road.kind !== "deterministic") return;
      expect(road.reader).toBe(reader);
      // The decision carries the renderer, so the route never looks one up and
      // never has to handle a key with no template behind it.
      expect(typeof road.renderer).toBe("function");
    });
  }
});

describe("what it refuses to be sure about", () => {
  it("sends an ambiguous word to the loop", () => {
    // "gaps" is unfilled seats and unanswered questions at the same time, so
    // it is worth almost nothing to either and this stays expensive.
    expect(routeQuestion("what gaps do we have", ALL).kind).toBe("loop");
  });

  it("sends a follow-up with no subject in it to the loop", () => {
    expect(routeQuestion("and which of those is most urgent", ALL).kind).toBe("loop");
  });

  it("sends an empty question to the loop", () => {
    expect(routeQuestion("", ALL).kind).toBe("loop");
    expect(routeQuestion("   ", ALL).kind).toBe("loop");
  });

  it("sends a question about the shelves to the loop", () => {
    // The shared corpus answers this, and no reader does.
    expect(routeQuestion("how do we handle tax as a land trust", ALL).kind).toBe("loop");
  });

  it("keeps two close readers on the expensive road", () => {
    // Both readers are strongly implicated and neither leads, so the model
    // picks, which is what it is for.
    const road = routeQuestion("list the roles and the circles", ALL);
    expect(road.kind).toBe("loop");
  });
});

describe("questions that are not about this village", () => {
  it("offers no readers for a definitional question", () => {
    expect(routeQuestion("what is consent vs consensus", ALL).kind).toBe("no-tools");
  });

  it("offers no readers for a comparison of two practices", () => {
    expect(routeQuestion("what is the difference between sociocracy and holacracy", ALL).kind)
      .toBe("no-tools");
  });

  it("treats one possessive word as enough to mean this village", () => {
    // "what are the roles" and "what are our roles" differ by one word and
    // only one of them has an answer in the database. Any deixis at all and
    // this is never treated as general knowledge.
    expect(routeQuestion("what is our decision log", ALL).kind).toBe("deterministic");
  });

  it("never answers a definitional question from a reader it half-recognises", () => {
    // A topic word present means the question might be about this village, so
    // the general road is off the table even though the shape looks general.
    expect(routeQuestion("what is a badge", ALL).kind).not.toBe("no-tools");
  });
});

describe("questions that want a judgement", () => {
  it("prefetches the reader instead of answering from a template", () => {
    const road = routeQuestion("which seat should we fill first", ALL);
    expect(road.kind).toBe("prefetch");
    if (road.kind !== "prefetch") return;
    expect(road.readers).toEqual(["seats.vacant"]);
    expect(road.reason).toBe("advisory");
  });

  it("reads advisory shape ahead of lookup shape", () => {
    // "which" is a lookup word and "should" outranks it: the model writes this
    // reply, and it writes it with the rows already in front of it.
    const road = routeQuestion("which of our roles should we recruit for", ALL);
    expect(road.kind).toBe("prefetch");
  });
});

describe("a question that narrows into the list", () => {
  // The defect this caught: "what did we decide" and "what did we decide about
  // quiet hours" score identically and want different answers. A template
  // naming every decision in the record would answer the second confidently,
  // for free, and wrongly.
  const narrowed = [
    "what did we decide about quiet hours",
    "what did we agree about the aquaponics rig",
    "what decisions do we have regarding the land",
    "what roles do we have to do with the kitchen",
  ];

  for (const q of narrowed) {
    it(`hands "${q.slice(0, 44)}" to the model with the rows already read`, () => {
      const road = routeQuestion(q, ALL);
      expect(road.kind).toBe("prefetch");
      if (road.kind !== "prefetch") return;
      // Narrowed and not advisory: the caller uses this to decide whether an
      // empty reader is the complete answer.
      expect(road.reason).toBe("narrowed");
    });
  }

  it("still answers the unqualified form from a template", () => {
    expect(routeQuestion("what did we decide", ALL).kind).toBe("deterministic");
  });
});

describe("the viewer's own catalog", () => {
  it("never routes to a reader the viewer cannot call", () => {
    // The concierge reader needs a module and a game variable. A viewer
    // without it asks the same question and gets the expensive road, where
    // the model is shown the same restricted tool list it always was.
    const road = routeQuestion("what questions could the concierge not answer", ["roles.all"]);
    expect(road.kind).toBe("loop");
  });

  it("never names an out-of-catalog reader even when it would have won", () => {
    const road = routeQuestion("which seats are vacant", ALL.filter((k) => k !== "seats.vacant"));
    expect(road.kind).not.toBe("deterministic");
  });

  it("answers from a reader that IS in the catalog", () => {
    const road = routeQuestion("which seats are vacant", ["seats.vacant"]);
    expect(road.kind).toBe("deterministic");
  });

  it("routes nothing at all on an empty catalog", () => {
    expect(routeQuestion("what roles do we have", []).kind).toBe("loop");
  });
});

describe("the templates", () => {
  it("counts roles and names them", () => {
    const r = RENDERERS["roles.all"]([{ name: "Steward" }, { name: "Gardener" }]);
    expect(r?.reply).toContain("2 roles");
    expect(r?.reply).toContain("Steward, Gardener");
    // The citation line renders this, so the reader is named on the cheap road
    // exactly as it is on the expensive one.
    expect(r?.consulted.readers).toEqual(["roles.all"]);
    expect(r?.consulted.references).toEqual([]);
  });

  it("says one role in the singular", () => {
    expect(RENDERERS["roles.all"]([{ name: "Steward" }])?.reply).toContain("1 role defined");
  });

  it("says an empty village is empty", () => {
    expect(RENDERERS["roles.all"]([])?.reply).toBe("No roles are defined in this village yet.");
    expect(RENDERERS["circles.all"]([])?.reply).toBe("No circles are defined in this village yet.");
    expect(RENDERERS["quests.library"]([])?.reply).toBe("The quest library is empty.");
    expect(RENDERERS["badges.all"]([])?.reply).toBe("This village issues no badges yet.");
  });

  it("says an empty decision log the way the model said it", () => {
    // The measured run answered this question with exactly this sentence.
    expect(RENDERERS["record.decisions"]([])?.reply).toBe("Your decision log is empty.");
  });

  it("names vacant seats and only vacant seats", () => {
    const r = RENDERERS["seats.vacant"]([
      { role: "Treasurer", holders: 0 },
      { role: "Cook", holders: 0 },
      { role: "Steward", holders: 2 },
    ]);
    expect(r?.reply).toContain("2 roles have nobody holding them");
    expect(r?.reply).toContain("Treasurer, Cook");
    expect(r?.reply).not.toContain("Steward");
  });

  it("says so when every seat is held", () => {
    const r = RENDERERS["seats.vacant"]([{ role: "Steward", holders: 2 }]);
    expect(r?.reply).toBe("Every role in this village has someone holding it.");
  });

  it("counts members and role holders", () => {
    const r = RENDERERS["members.summary"]({ members: 12, holdingARole: 5 });
    expect(r?.reply).toContain("12 members");
    expect(r?.reply).toContain("5 of them hold at least one role");
  });

  it("dates a decision when the record has one", () => {
    const r = RENDERERS["record.decisions"]([{ title: "Buy the north field", decidedOn: "2026-05-02" }]);
    expect(r?.reply).toContain("Buy the north field (2026-05-02)");
  });

  it("counts the rows capTokens dropped instead of under-reporting", () => {
    // `capTokens` sheds from the end and reports how many it shed. A template
    // that counted only what survived would tell a large village it was small.
    const r = RENDERERS["quests.library"]({ items: [{ title: "Plant the swale" }], truncated: 40 });
    expect(r?.reply).toContain("41 quests");
    expect(r?.reply).toContain("and 40 more");
  });

  it("refuses to call a truncated list complete", () => {
    // No vacancies among the rows that survived proves nothing about the rows
    // that did not, so this falls through to a road with a model on it.
    expect(RENDERERS["seats.vacant"]({ items: [{ role: "Steward", holders: 1 }], truncated: 9 })).toBeNull();
  });

  it("refuses the over-budget shape", () => {
    const tooBig = { truncated: true, note: "this reader's answer was too large for the prompt" };
    expect(RENDERERS["members.summary"](tooBig)).toBeNull();
    expect(RENDERERS["roles.all"](tooBig)).toBeNull();
  });

  it("never throws, whatever it is handed", () => {
    const hostile: unknown[] = [
      null, undefined, 0, "", "a string", [], {}, [{}], [{ name: "" }],
      { items: "not an array" }, { members: "twelve" }, [{ name: null }],
      { items: [], truncated: "many" },
    ];
    for (const key of RENDERED_READERS) {
      for (const input of hostile) {
        expect(() => RENDERERS[key](input)).not.toThrow();
      }
    }
  });
});
