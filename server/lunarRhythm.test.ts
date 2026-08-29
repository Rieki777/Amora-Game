/**
 * ONE RHYTHM, AND IT IS THE MOON.
 *
 * `gratitude.cycle_mode` was a live dial in the admin panel offering "lunar"
 * or "month", reported to every client at `/api/game/rules` as `cycleMode`,
 * and read by exactly one line of code: a branch inside `currentCycleId()`
 * that had zero callers by that name anywhere else. A founder could switch the
 * village's whole gratitude rhythm to calendar months and nothing at all
 * changed. The product stated a rhythm it did not keep.
 *
 * Rye ruled it out rather than in, 2026-08-29: "leave it off and retire it.
 * let's just stick with lunar months all around, it's good to be on our own
 * rhythm." So the lunar cycle is the only rhythm this platform has, by
 * decision, and these tests are what stop a future reader from helpfully
 * adding calendar months back because they found a lunar-only economy with no
 * explanation in it.
 *
 * The scan reads the tree rather than trusting this paragraph, and it carries
 * a control in the same run: the sibling gratitude dials must still be found,
 * so a scan that has stopped seeing anything fails here before it can pass as
 * a clean sweep.
 *
 * COMMENTS ARE STRIPPED FIRST, so the rule is "name the retired key in a
 * comment, and nowhere else". Explaining the removal at the place it happened
 * is the whole point of the removal, and a scan that forbade the explanation
 * would push the next reader back to guessing.
 *
 * TESTS ARE SKIPPED FOR THE SAME REASON, and `check-voice.mjs` skips them on
 * its own version of it: a test is the place an absence gets asserted, so it
 * has to be able to say the name of the thing that is absent. A test file
 * cannot put a dial back in front of a founder either way. The control above
 * is what keeps the remaining scan worth reading.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VARIABLES, VARIABLES_BY_KEY } from "../shared/gameVariables";
import { cycleIdFor, unreadableCycleIds, unreadableCycleProblem } from "./lib/gratitude-cycles";

const ROOT = path.resolve(__dirname, "..");
const IS_TEST = /\.(test|spec)\.tsx?$/;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//g;
const LINE_COMMENT = /\/\/[^\n]*/g;
const RETIRED = /cycle_mode|cycleMode/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const full = path.join(dir, entry);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const rel = (full: string) => path.relative(ROOT, full);
const code = (full: string) =>
  fs.readFileSync(full, "utf8").replace(BLOCK_COMMENT, " ").replace(LINE_COMMENT, " ");

const sources = [
  ...walk(path.join(ROOT, "server")),
  ...walk(path.join(ROOT, "shared")),
  ...walk(path.join(ROOT, "client", "src")),
].filter((f) => !IS_TEST.test(path.basename(f)));

describe("the calendar-month dial is gone", () => {
  it("scans a tree it can actually see", () => {
    expect(sources.length, "the scan must find source files").toBeGreaterThan(200);
    // The control. These two gratitude dials stay, so a scan that has gone
    // blind cannot report the retired one as absent.
    const stillHere = sources.filter((f) => code(f).includes("gratitude.base_budget"));
    expect(stillHere.length, "the sibling gratitude dials must still be found").toBeGreaterThan(0);
  });

  it("offers no rhythm variable for a village to set", () => {
    expect(VARIABLES_BY_KEY["gratitude.cycle_mode"]).toBeUndefined();
    expect(VARIABLES.filter((v) => v.key.includes("cycle_mode"))).toEqual([]);
  });

  it("names the retired key in no live code anywhere in the tree", () => {
    const hits = sources.filter((f) => RETIRED.test(code(f))).map(rel);
    expect(hits, `these files still carry the retired rhythm dial: ${hits.join(", ")}`).toEqual([]);
  });

  it("stamps every new acknowledgement with a lunar id", () => {
    expect(cycleIdFor(new Date("2026-08-29T00:00:00Z"))).toMatch(/^lunar-\d{6}$/);
  });
});

describe("retiring the dial does not quietly reinterpret an old row", () => {
  /**
   * The decision migration 0105 recorded and this must not undo: legacy
   * "YYYY-MM" rows are NOT remapped, because there is no honest way to compute
   * a lunation from a calendar month. A village holding them meets a refusal
   * naming the ids rather than a silently wrong total, and that stays true now
   * that nobody can choose calendar months any more.
   */
  const legacy = [
    { id: "g1", fromId: "a", toId: "b", amount: 10, cycleId: "2026-07" },
    { id: "g2", fromId: "a", toId: "c", amount: 5, cycleId: cycleIdFor() },
  ];

  it("still cannot read a calendar-month id", () => {
    expect(unreadableCycleIds(legacy)).toEqual(["2026-07"]);
  });

  it("still refuses out loud, naming the id", () => {
    const problem = unreadableCycleProblem(legacy);
    expect(problem).toBeTruthy();
    expect(problem).toContain("2026-07");
  });
});
