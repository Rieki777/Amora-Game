/**
 * THE ADMIN DOOR AND THE TWO CROSS-KEY WINDOW RULES (19E, 20.10, 20.11).
 *
 * `windowSettingProblem` holds the two rules the variables registry cannot see
 * from one value on its own: a governance window no longer than
 * `governance.vote_days` refuses every opening of that kind forever, and a
 * steward's window longer than one cycle outruns the landing it counts to.
 * Both are meant to be refused when the value is SET.
 *
 * The audit of 2026-09-04 found only ONE of the two doors calling it.
 * `validateChangeSet` in server/lib/mechanics.ts did; `PUT
 * /api/admin/variables/:key` wrote straight through `setVariable`. So anybody
 * holding `dial.set`, before or after the Birthing (only the weight keys are
 * fenced there), could store `governance.window_changeset` at
 * `last_days_of_cycle:3` against a `vote_days` of 7. The registry's grammar
 * check says yes, the value lands, and from that moment every changeset
 * opening is refused because its vote would close outside the window.
 * Governance by proposal is shut and nothing says so.
 *
 * The same door stored `governance.veto_hours` at its registry maximum of 720
 * against a lunar cycle of about 708, and the landing path read it through
 * `vetoHoursFrom`, which applies the floor and no cap, so the exported
 * `cappedVetoHours` ran nowhere and a Game change chosen for the new moon
 * landed a moon late.
 *
 * Two pins, one per half:
 *
 *   1. The route's own source calls `windowSettingProblem` before it calls
 *      `setVariable`. Source-reading because the handler is registered inside
 *      `startServer` in a 28,000-line file and no test can import it; the
 *      order matters, so a call placed after the write would be no refusal at
 *      all.
 *   2. `landingOf` routes the village's stored hours through
 *      `cappedVetoHours`, measured on the ballot's own close instant, so a
 *      stored 720 lands at one cycle and an ordinary 96 is untouched.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LUNAR_CLOCK } from "../../shared/cycleClock";
import { cycleHoursAt } from "./governanceWindows";
import { landingOf, type LandingDeps } from "./applyDue";
import type { BallotRow } from "./ballots";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const INDEX = readFileSync(path.join(ROOT, "server", "index.ts"), "utf8");

const HOUR = 3_600_000;

/**
 * The body of the one handler, from its registration to the next registration
 * at the same indentation. Slicing rather than reading the whole file, because
 * `windowSettingProblem` appears elsewhere in the tree and a whole-file search
 * would pass on somebody else's call.
 */
function adminVariablePutBody(): string {
  const start = INDEX.indexOf('app.put("/api/admin/variables/:key"');
  expect(start).toBeGreaterThan(-1);
  const rest = INDEX.slice(start + 1);
  const end = rest.search(/\n {2}app\.(get|post|put|patch|delete)\(/);
  return rest.slice(0, end === -1 ? rest.length : end);
}

describe("PUT /api/admin/variables/:key runs the cross-key window rules", () => {
  it("calls windowSettingProblem, and calls it before the write", () => {
    const body = adminVariablePutBody();
    const guard = body.indexOf("windowSettingProblem(");
    const write = body.indexOf("setVariable(");
    expect(write).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(write);
  });

  it("imports the rule from the module that owns it, never a second copy", () => {
    expect(INDEX).toMatch(/import \{[^}]*windowSettingProblem[^}]*\} from "\.\/lib\/governanceWindows";/);
  });
});

/** A ballot that carries a Game change asking for the earliest legal instant. */
const CLOSE = new Date("2026-11-10T00:00:00Z");
const FAR = new Date("2027-06-01T00:00:00Z");

const ballot = {
  id: "b-window",
  subjectType: "mechanics",
  closesAt: CLOSE.toISOString(),
  timing: "at_acceptance",
} as unknown as BallotRow;

const depsWith = (hours: number) =>
  ({ vetoHours: () => hours, nextBoundaryAfter: () => FAR }) as unknown as LandingDeps;

describe("landingOf caps a steward's window at one cycle", () => {
  const cycleHours = cycleHoursAt(CLOSE, LUNAR_CLOCK);

  it("holds a stored 720 to the cycle the ballot closed in", () => {
    // 720 is the registry maximum and a lunar cycle is shorter than it, so an
    // uncapped read pushes the landing past the boundary it was timed to.
    expect(cycleHours).toBeLessThan(720);
    const landing = landingOf(depsWith(720), { ballot });
    expect(landing.landsAt).not.toBeNull();
    expect(landing.landsAt!.getTime() - CLOSE.getTime()).toBe(cycleHours * HOUR);
  });

  it("leaves an ordinary window alone, and keeps the 72-hour floor", () => {
    const ordinary = landingOf(depsWith(96), { ballot });
    expect(ordinary.landsAt!.getTime() - CLOSE.getTime()).toBe(96 * HOUR);
    const tiny = landingOf(depsWith(1), { ballot });
    expect(tiny.landsAt!.getTime() - CLOSE.getTime()).toBe(72 * HOUR);
  });
});
