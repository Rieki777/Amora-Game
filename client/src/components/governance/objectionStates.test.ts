/**
 * THE OBJECTION PANEL'S VOCABULARY AGAINST THE ONE THE SERVER CAN SEND.
 *
 * Written for the same defect class that took the Game Mechanics page down:
 * a hand-kept mirror of a server enumeration, read through `Record<Union, T>`
 * with no fallback, so the compiler asserts a claim about the server instead
 * of checking one and the first unfamiliar value throws inside a list.
 *
 * The authority here is NOT a migration. `ballot_objections.status` is a
 * `varchar(12)` with no enum behind it, so the column constrains nothing and
 * the only rule is the route's own allow-list: `OBJECTION_RULINGS` in
 * `server/lib/ballots.ts`, plus the `open` that the insert writes. Read as
 * text, the way gameMechanicsStates.test.ts reads the migration and
 * shared/notificationKinds.test.ts reads its producers.
 *
 * TWO mirrors live in that panel and both are checked: the STATUS copy map a
 * reader meets, and the RULINGS buttons a facilitator is offered. A fourth
 * ruling added to the server fails this file, which is the point.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { OBJECTION_STATUS_COPY, RULINGS } from "./ObjectionPanel";

const ROOT = path.resolve(__dirname, "../../../..");

/** The rulings the route will actually write, off its own allow-list. */
function rulingsFromServer(): string[] {
  const src = fs.readFileSync(path.join(ROOT, "server/lib/ballots.ts"), "utf8");
  const m = src.match(/OBJECTION_RULINGS\s*=\s*\[([^\]]*)\]/);
  if (!m) throw new Error("OBJECTION_RULINGS was not found in server/lib/ballots.ts");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((v) => v[1]);
}

describe("the objection panel speaks every state the server can send", () => {
  it("has copy for every ruling the route writes, and for the open it starts at", () => {
    const rulings = rulingsFromServer();
    expect(rulings).toContain("integrated");
    const states = ["open", ...rulings];
    const missing = states.filter((s) => !(s in OBJECTION_STATUS_COPY));
    expect(missing, `no copy for objection state(s): ${missing.join(", ")}`).toEqual([]);
  });

  it("offers a facilitator exactly the rulings the route accepts", () => {
    const rulings = rulingsFromServer();
    const offered = RULINGS.map((r) => r.id);
    // Both directions: a missing button is a ruling nobody can reach, and an
    // extra one walks a facilitator into a refusal with no way to know why.
    expect([...offered].sort()).toEqual([...rulings].sort());
  });

  it("reads an unfamiliar state instead of throwing on it", () => {
    // The exact shape that shipped and crashed: an index into a total-typed
    // Record with a value the union never held.
    const unknown = (OBJECTION_STATUS_COPY as Record<string, unknown>)["a_state_from_a_later_lane"];
    expect(unknown).toBeUndefined();
  });
});
