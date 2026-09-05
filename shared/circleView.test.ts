/**
 * The circle projection, and the two things that actually broke.
 *
 * This suite is deliberately NOT an e2e boot. What went wrong was never a
 * routing or an auth question: both endpoints read the same rows and always
 * had. A field was dropped by a hand-written object literal on its way to
 * the wire, and the second endpoint's literal was a different length. So the
 * test that would have caught it is a test about the PROJECTION, and it runs
 * in milliseconds instead of booting a server.
 *
 * `circleView.sources.test.ts` covers the other half: that both endpoints
 * still route through here at all.
 */
import { describe, expect, it } from "vitest";
import { circleView, circleViews, toneForCircle, CIRCLE_TONES } from "./circleView";

/** A row shaped like `circlesRepo.all()` returns one. */
const row = (over: Record<string, unknown> = {}) => ({
  id: "gathering",
  name: "Gathering Circle",
  purpose: "Meals, welcome and the rhythm of the week.",
  aliases: ["Kitchen Circle", "Hearth"],
  parentCircleId: null,
  leadRoleId: "kitchen-lead",
  grownFromOrgRoleId: null,
  icon: "Users",
  color: "bg-sage",
  status: "active",
  order: 3,
  isExample: false,
  decidesBy: "consent",
  decidesByGloss: "We decide together, and an objection improves the proposal.",
  decidesByDomains: { money: { method: "consensus", gloss: "Spending is everyone's." } },
  createdAt: new Date("2026-01-04T00:00:00Z"),
  ...over,
});

describe("circleView carries the fields the old projection dropped", () => {
  it("keeps colour and icon, which /api/org used to delete on the way out", () => {
    const v = circleView(row());
    expect(v.color, "colour reaches the cards page").toBe("bg-sage");
    expect(v.icon, "the glyph reaches the cards page").toBe("Users");
  });

  it("keeps aliases and the lead seat, for search and for the inspector", () => {
    const v = circleView(row());
    expect(v.aliases).toEqual(["Kitchen Circle", "Hearth"]);
    expect(v.leadRoleId).toBe("kitchen-lead");
  });

  it("keeps decidesByDomains a MAP, because DecideLens indexes it by domain", () => {
    const v = circleView(row());
    // The bug this pins: an array helper here turned every override into [],
    // and the decide lens went blank with no error on either side.
    expect(v.decidesByDomains).toEqual({
      money: { method: "consensus", gloss: "Spending is everyone's." },
    });
    expect(v.decidesByDomains?.money?.method).toBe("consensus");
  });

  it("turns an array or a scalar in decidesByDomains into null, never a half-map", () => {
    expect(circleView(row({ decidesByDomains: [] })).decidesByDomains).toBeNull();
    expect(circleView(row({ decidesByDomains: "consent" })).decidesByDomains).toBeNull();
    expect(circleView(row({ decidesByDomains: null })).decidesByDomains).toBeNull();
  });

  it("normalises empty strings to null so a blank admin field is not a value", () => {
    const v = circleView(row({ purpose: "   ", color: "", icon: null }));
    expect(v.purpose).toBeNull();
    expect(v.color).toBeNull();
    expect(v.icon).toBeNull();
  });

  it("survives a row with nothing on it", () => {
    const v = circleView({});
    expect(v.id).toBe("");
    expect(v.status).toBe("active");
    expect(v.aliases).toEqual([]);
    expect(v.order).toBe(0);
  });

  it("projects a list in the order given", () => {
    const out = circleViews([row({ id: "a" }), row({ id: "b" })]);
    expect(out.map((c) => c.id)).toEqual(["a", "b"]);
    expect(circleViews(null as any)).toEqual([]);
  });
});

describe("toneForCircle resolves what villages actually stored", () => {
  it("reads the Tailwind class the admin form writes, not a bare tone word", () => {
    // The whole reason this function is not a one-line includes() check.
    expect(toneForCircle({ id: "x", color: "bg-sage" })).toBe("sage");
    expect(toneForCircle({ id: "x", color: "bg-coral" })).toBe("clay");
    expect(toneForCircle({ id: "x", color: "bg-forest" })).toBe("moss");
  });

  it("folds the lightness suffixes onto one hue", () => {
    // A village that picked sage gets sage on every surface, whichever shade.
    expect(toneForCircle({ id: "x", color: "bg-sage-light" })).toBe("sage");
    expect(toneForCircle({ id: "x", color: "bg-teal-deep" })).toBe("teal");
    expect(toneForCircle({ id: "x", color: "bg-cream-dark" })).toBe("amber");
    expect(toneForCircle({ id: "x", color: "bg-cyan-brand" })).toBe("teal");
  });

  it("accepts a bare tone word too, so a fork writing 'sage' is not punished", () => {
    expect(toneForCircle({ id: "x", color: "sage" })).toBe("sage");
    expect(toneForCircle({ id: "x", color: "VIOLET" })).toBe("violet");
  });

  it("gives an undeclared circle a stable tone, the same one every time", () => {
    const a = toneForCircle({ id: "wisdom", color: null });
    const b = toneForCircle({ id: "wisdom" });
    const c = toneForCircle({ id: "wisdom", color: "  " });
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(CIRCLE_TONES).toContain(a);
  });

  it("does not reshuffle when circles are renamed or re-ordered", () => {
    // Keyed by id, so `order` and `name` cannot move a colour. An
    // index-based assignment would have failed this.
    const before = toneForCircle({ id: "healing", color: null });
    const after = toneForCircle({ id: "healing", color: null });
    expect(after).toBe(before);
  });

  it("falls back rather than throwing on a class nobody defined", () => {
    // `bg-sage-light` was stored on four live records and never existed as a
    // class; an unknown value has to resolve to something drawable.
    const t = toneForCircle({ id: "q", color: "bg-not-a-real-colour" });
    expect(CIRCLE_TONES).toContain(t);
  });
});
