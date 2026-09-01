/**
 * NOTHING APPLIES ITSELF (0083, P1, N2; lane harm metric 6).
 *
 * The vision feature's one rule: when every objective is met the platform
 * PROMPTS, and a human presses the existing publish button. This file pins
 * that rule to the code from four directions, so a refactor that quietly
 * wires progress to publication fails a named test instead of shipping:
 *
 *   1. `visionProgress` is synchronous, pure arithmetic: its compiled source
 *      contains no publishDraft, no query, no INSERT and no await, and it
 *      returns a plain object, never a promise.
 *   2. `setDraftVision` writes the vision COLUMN and nothing else: its
 *      compiled source never mentions publishDraft.
 *   3. `fxRates.ts` (the other new automated writer this round) has no path
 *      to drafts at all: its file text never mentions publishDraft or
 *      orgDrafts, and its only writes hit fx_rates.
 *   4. `publishDraft` has EXACTLY ONE call site across the server's route
 *      files, inside the admin publish route, and the client vision layer
 *      never fetches a publish URL: it links a human to Admin.
 */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { setDraftVision, visionProgress, type VisionBlock } from "./orgDrafts";

const ROOT = path.resolve(__dirname, "..", "..");
const read = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/**
 * Every file that mounts routes, not the one big file alone.
 *
 * Point 4 used to read `server/index.ts` by name. The admin publish route
 * then moved to `server/routes/org.ts`, and the assertion went from "exactly
 * one door" to "zero doors", which is the shape where a pin either goes red
 * for the wrong reason or, with a `toBeGreaterThan(0)` instead of a length
 * check, goes quiet and passes forever. Same fix as
 * server/lib/capabilityRegistry.test.ts and scripts/check-auth-fetch.mjs: the
 * source is a LIST, and a route module joins it by existing.
 */
function routeFiles(): string[] {
  const out = ["server/index.ts"];
  const walk = (rel: string) => {
    for (const entry of readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(child);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) out.push(child);
    }
  };
  walk("server/routes");
  return out;
}

const allDone: VisionBlock = {
  objectives: [
    { text: "Every kitchen seat held", metric: "seats_filled_in:kitchen", target: 1, current: null, source: "measured", done: false },
  ],
  trigger: { all_objectives_done: true },
};

describe("visionProgress cannot apply anything", () => {
  it("is synchronous pure arithmetic, even when everything is met", () => {
    const result = visionProgress(allDone, () => 5);
    expect(result.allDone).toBe(true);
    // A promise here would mean something async grew inside; refuse it.
    expect(typeof (result as any).then).toBe("undefined");
  });

  it("holds no publish, query or await in its compiled body", () => {
    const src = visionProgress.toString();
    for (const word of ["publishDraft", "query", "INSERT", "UPDATE", "await"]) {
      expect(src, `visionProgress must not contain "${word}"`).not.toContain(word);
    }
  });

  it("setDraftVision writes the column and never publishes", () => {
    expect(setDraftVision.toString()).not.toContain("publishDraft");
  });
});

describe("fxRates cannot reach the drafts", () => {
  it("never mentions publishDraft or the drafts module", () => {
    const src = read("server/lib/fxRates.ts");
    expect(src).not.toContain("publishDraft");
    expect(src).not.toContain("orgDrafts");
  });

  it("writes only fx_rates", () => {
    const src = read("server/lib/fxRates.ts");
    const writes = src.match(/INSERT INTO\s+`?(\w+)`?|UPDATE\s+`?(\w+)`?\s+SET/gi) ?? [];
    for (const w of writes) {
      expect(w.toLowerCase(), w).toContain("fx_rates");
    }
    expect(writes.length).toBeGreaterThan(0);
  });
});

describe("publishDraft keeps exactly one door", () => {
  it("is called once across the server's route files, in the admin publish route", () => {
    const sites: { file: string; src: string; at: number }[] = [];
    for (const file of routeFiles()) {
      const src = read(file);
      for (const m of src.matchAll(/publishDraft\(/g)) sites.push({ file, src, at: m.index });
    }
    expect(
      sites.map((s) => s.file),
      "publishDraft call sites across server/index.ts and server/routes/**",
    ).toHaveLength(1);
    const { src, at } = sites[0];
    const before = src.slice(Math.max(0, at - 400), at);
    expect(before).toContain('"/api/admin/org/drafts/:id/publish"');
  });

  it("the client vision layer links a human to Admin and fetches no publish URL", () => {
    const src = read("client/src/components/power/VisionLayer.tsx");
    expect(src).not.toContain("/publish");
    expect(src).toContain('href="/admin"');
  });
});

describe("settlement is untouched (lane harm metric 5)", () => {
  // The brief said payments.test.ts asserts the usd literal; measured in this
  // worktree it never did (the word appears nowhere in it), so the pin lives
  // here instead: the settlement file still defaults its currency to usd in
  // both places the lane brief measured, and no display-currency machinery
  // has grown into it. The other half of the metric, an empty diff against
  // origin/main for server/lib/payments.ts, is asserted at report time with
  // git; a test cannot see the diff, only the text.
  it("payments.ts still settles usd and knows nothing of display currencies", () => {
    const src = read("server/lib/payments.ts");
    expect(src).toContain('input.currency ?? "usd"');
    expect(src).toContain('c.currency ?? "usd"');
    for (const word of ["fxRates", "fx_rates", "displayCurrency", "shared/money", "crossRate", "convertMinor"]) {
      expect(src, `payments.ts must not contain "${word}"`).not.toContain(word);
    }
  });
});
