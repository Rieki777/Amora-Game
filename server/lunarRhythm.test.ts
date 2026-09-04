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
 * ── AND THEN HE REOPENED IT, ON CONDITION ──────────────────────────────────
 *
 * 2026-09-02, answering "the cycle as a setting" with the 2026-08-29
 * retirement named to him in the same document: "Yes the cycle structure can
 * be changed." The reversal is informed and it is recorded in
 * `docs/GOVERNANCE_EVOLUTION_PROMPT.md` section 13.7, which put both rulings
 * side by side before he answered.
 *
 * It came with a condition, and the condition is what this file now enforces.
 * The defect `0108` deleted was never the dial. It was that about ten
 * consumers imported lunar arithmetic directly, so a setting could be shown
 * that nothing read. So: the dial may return ONLY behind a seam every consumer
 * reads through, and the seam must carry a guard that makes a rhythm setting
 * with no reader a BOOT FAILURE rather than a panel that lies.
 *
 * Which is why the scan below exempts exactly one path, `shared/cycleClock.ts`,
 * and immediately charges it a higher price than the scan it escaped: if that
 * file exists it MUST export `cycleSettingsProblem`. A seam without its reader
 * guard is `0108`'s defect wearing a seam's name, and that is the thing worth
 * failing on. Nothing else is exempt, and the exemption list is asserted to
 * hold only that one path, so it cannot quietly grow.
 *
 * The seam is absent from `main` as this is written, which makes the exemption
 * vacuous here and the scan exactly as strict as it was. It stops being
 * vacuous on the branch that lands the seam, which is where the second
 * assertion starts doing the work.
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
/**
 * The ONE path allowed to name the retired dial in live code: the seam that
 * implements its supervised return, per the 2026-09-02 ruling and the
 * condition attached to it. Repo-relative, forward slashes. Asserted to hold
 * exactly this below, so it cannot grow without somebody editing an assertion
 * that says out loud what it is for.
 */
const SEAM_EXEMPT = ["shared/cycleClock.ts"];

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

  it("names the retired key in no live code anywhere in the tree, outside the seam", () => {
    const hits = sources
      .filter((f) => RETIRED.test(code(f)))
      .map(rel)
      .filter((r) => !SEAM_EXEMPT.includes(r.split(path.sep).join("/")));
    expect(hits, `these files still carry the retired rhythm dial: ${hits.join(", ")}`).toEqual([]);
  });

  it("exempts the seam and nothing else", () => {
    // The exemption is the whole risk in this file, so it is asserted rather
    // than trusted. If this list ever grows, that is a ruling, not a patch.
    expect(SEAM_EXEMPT).toEqual(["shared/cycleClock.ts"]);
  });

  it("charges the seam its reader guard, if the seam exists at all", () => {
    // 0108's real defect was a setting nothing read. A seam that does not make
    // that a boot failure is the defect back under a better name, so the one
    // file allowed to say the retired words pays for it here.
    const seam = path.join(ROOT, "shared", "cycleClock.ts");
    if (!fs.existsSync(seam)) return; // absent on main; vacuous until the seam lands
    expect(
      code(seam),
      "shared/cycleClock.ts must export cycleSettingsProblem: a rhythm setting with no reader is 0108's defect returning",
    ).toMatch(/export function cycleSettingsProblem\b/);
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
