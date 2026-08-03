/**
 * The walk's pure half: which stops apply, and how far along a founder is.
 *
 * No DOM and no localStorage here on purpose. The storage accessors are
 * try/caught wrappers with nothing to prove; the filtering is the part that
 * would silently send a founder to a shelf their village never enabled.
 */
import { describe, it, expect } from "vitest";
import { WALK_STEPS, applicableSteps, walkProgress } from "./firstWalk";

describe("the first walk", () => {
  it("offers nothing when the village shows no examples", () => {
    expect(applicableSteps([])).toEqual([]);
    expect(walkProgress([], [])).toEqual({ done: 0, total: 0 });
  });

  it("offers only the stops whose modules are showing examples", () => {
    const steps = applicableSteps(["forum"]);
    expect(steps.length).toBeGreaterThan(0);
    for (const s of steps) expect(s.needs).toEqual(["forum"]);
    // A village with the forum on and the library off is never sent to a shelf.
    expect(steps.some((s) => s.href === "/library")).toBe(false);
  });

  it("counts progress against what applies, never against the full list", () => {
    // Ticking a step whose module has since retired must not report more done
    // than there are stops to take.
    const done = WALK_STEPS.map((s) => s.id);
    const progress = walkProgress(["forum"], done);
    expect(progress.total).toBe(applicableSteps(["forum"]).length);
    expect(progress.done).toBe(progress.total);
  });

  it("sends every stop somewhere that exists", () => {
    // /exchange is NOT a route in this app: the exchange lives on the wallet
    // page, and a walk step pointing at it would 404 the founder.
    for (const s of WALK_STEPS) {
      expect(s.href.startsWith("/"), `${s.id} needs an in-app path`).toBe(true);
      expect(s.href).not.toBe("/exchange");
    }
  });

  it("gives every stop a module to depend on", () => {
    // A stop with no `needs` would survive retirement and send a founder to
    // look at content the village has replaced.
    for (const s of WALK_STEPS) expect(s.needs.length).toBeGreaterThan(0);
  });
});
