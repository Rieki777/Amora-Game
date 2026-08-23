/**
 * Every gate says what is behind it, and the check is an ENUMERATION.
 *
 * The defect this guards is a page adding `<ModuleGate moduleId="x" />` for a
 * module `gateCopy.ts` has never heard of. Nothing breaks: the line is simply
 * omitted and the card goes back to being a heading and a grey sentence,
 * silently, on one surface, which is exactly the state this lane was opened
 * to end.
 *
 * It reads the real client tree instead of a list kept here, because a list
 * kept here is one more thing that can go stale. `git grep` was not used: a
 * caller list assembled by a pattern that matches nothing is indistinguishable
 * from a codebase with no callers, so the walk below asserts a FLOOR on how
 * many it found before it judges any of them.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GATE_LINES, PAGE_GATE_LINES, gateLine, nameList } from "./gateCopy";

const CLIENT_SRC = path.resolve(__dirname, "..", "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx$/.test(e.name)) out.push(p);
  }
  return out;
}

interface Caller {
  file: string;
  moduleId: string;
  ownLine: boolean;
}

/** Every `<ModuleGate .../>` and `<SignInToSee .../>` element in the client. */
function callers(): Caller[] {
  const found: Caller[] = [];
  for (const file of walk(CLIENT_SRC)) {
    const src = fs.readFileSync(file, "utf8");
    // The element and everything up to its closing bracket, so `behind` and
    // `moduleId` are read off the same tag whatever order they appear in.
    for (const m of src.matchAll(/<(?:ModuleGate|SignInToSee)\b([^>]*)\/?>/g)) {
      const attrs = m[1];
      const id = attrs.match(/moduleId=["']([a-z-]+)["']/)?.[1];
      if (!id) continue;
      found.push({
        file: path.relative(CLIENT_SRC, file).replace(/\\/g, "/"),
        moduleId: id,
        ownLine: /\bbehind=/.test(attrs),
      });
    }
  }
  return found;
}

describe("gateCopy", () => {
  const found = callers();

  it("finds the gate callers at all", () => {
    // The floor is the control. If the walk breaks, this fails loudly instead
    // of reporting a clean sweep over an empty set.
    expect(found.length).toBeGreaterThanOrEqual(20);
    expect(found.map((c) => c.file)).toContain("pages/Messages.tsx");
    expect(found.map((c) => c.moduleId)).toContain("forum");
  });

  it("gives every caller something true to say about what is behind it", () => {
    const mute = found.filter((c) => !c.ownLine && !gateLine(c.moduleId));
    expect(mute).toEqual([]);
  });

  it("keeps no line for a module no page gates", () => {
    // Dead copy is copy nobody proofreads. Every entry earns its place.
    const gated = new Set(found.filter((c) => !c.ownLine).map((c) => c.moduleId));
    expect(Object.keys(GATE_LINES).filter((id) => !gated.has(id))).toEqual([]);
  });

  it("holds every line to the house shape", () => {
    for (const [id, line] of [...Object.entries(GATE_LINES), ...Object.entries(PAGE_GATE_LINES)]) {
      expect(line, id).not.toMatch(/[–—]/); // no en or em dash
      expect(line, id).toMatch(/\.$/);
      expect(line.length, id).toBeLessThanOrEqual(140);
    }
  });

  it("builds a list the way the house writes one", () => {
    expect(nameList([])).toBe("");
    expect(nameList(["Quests"])).toBe("Quests");
    expect(nameList(["Quests", "Gratitude"])).toBe("Quests and Gratitude");
    expect(nameList(["Quests", "Gratitude", "Profiles"])).toBe("Quests, Gratitude and Profiles");
  });

  it("says nothing when it knows nothing", () => {
    expect(gateLine(undefined)).toBeNull();
    expect(gateLine("a-module-that-does-not-exist")).toBeNull();
  });
});
