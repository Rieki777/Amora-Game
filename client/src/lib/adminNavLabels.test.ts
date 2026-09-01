import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Copy that sends somebody to a tab must name the tab that exists.
 *
 * The Module Library tab was once called "Modules On/Off", and the words
 * "Module Library" belonged to the public /modules page. Rye could not find the
 * admin one, so the tab was renamed and its own comment records why.
 *
 * The pointers were not renamed with it. Five places across four files kept
 * telling a founder to look under "Modules On/Off", a label that no longer
 * exists anywhere in the product. The rename fixed the findability problem and
 * the stale pointers recreated it pointing the other way.
 *
 * This test reads the real files rather than a fixture, because a fixture would
 * have passed happily through the whole episode.
 */

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SRC = path.join(ROOT, "client", "src");

/** Labels removed from the product. Copy must not send anyone to them. */
const RETIRED_LABELS = ["Modules On/Off"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      sourceFiles(p, out);
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

describe("admin nav labels", () => {
  const files = sourceFiles(SRC);

  it("reads a real, non-trivial set of source files", () => {
    // Control. Without this the sweep below could pass by finding nothing at
    // all, which is the same output as finding nothing wrong.
    expect(files.length).toBeGreaterThan(100);
  });

  it("names no retired tab label anywhere in the product", () => {
    const offenders: string[] = [];
    for (const f of files) {
      const s = fs.readFileSync(f, "utf8");
      for (const label of RETIRED_LABELS) {
        if (s.includes(label)) offenders.push(`${path.relative(ROOT, f)} names "${label}"`);
      }
    }
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  it("still has the label the copy was pointed at", () => {
    // The other half. Banning the old name is only correct while the new one
    // exists; if both vanish, the copy points at nothing and this test would
    // otherwise stay green.
    const nav = fs.readFileSync(path.join(SRC, "components", "admin", "adminNavGroups.ts"), "utf8");
    expect(nav).toContain('label: "Module Library"');
  });
});
