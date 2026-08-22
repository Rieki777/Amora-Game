/**
 * The exit policy's acknowledgement is a claim, and this is the check behind it.
 *
 * A village could tick "these terms were decided by the community", which
 * removes the caution card from /exit-policy, while the editor offered no field
 * for three of the five terms that page prints. The result was the platform's
 * boilerplate published as a village's own settled exit terms, on the
 * highest-stakes page on the site.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_EXIT_POLICY,
  blankTerms,
  normalizeExitPolicy,
  platformDefaultTerms,
} from "./exitPolicy";

/** A whole policy in the village's own words, as a starting point to spoil. */
const own = () => ({
  placeholder: false,
  voluntary: {
    noticePeriodDays: 30,
    valuationMethod: "Hours are honoured at the rate the circle agreed.",
    unwindSteps: ["Hand back the keys", "Walk the land"],
  },
  involuntary: { decidingDomainId: "", appealDomainId: "", process: "The care circle hears it first." },
  restorative: { intakeContactRole: "", steps: ["Tea", "A sit-down"] },
});

describe("the acknowledgement cannot be ticked over the platform's words", () => {
  it("names every rendered term still at the platform default", () => {
    const stale = platformDefaultTerms(normalizeExitPolicy(DEFAULT_EXIT_POLICY));
    expect(stale).toEqual([
      "How contributed value is honored",
      "The steps of a voluntary departure",
      "If the village asks someone to leave",
      "The restorative path",
    ]);
  });

  it("a policy written in the village's own words is clear", () => {
    expect(platformDefaultTerms(normalizeExitPolicy(own()))).toEqual([]);
  });

  it("names exactly the one term left untouched", () => {
    const half = { ...own(), restorative: { intakeContactRole: "", steps: [...DEFAULT_EXIT_POLICY.restorative.steps] } };
    expect(platformDefaultTerms(normalizeExitPolicy(half))).toEqual(["The restorative path"]);
  });

  it("whitespace and case are formatting, so retyping the default in caps does not count", () => {
    const cosmetic = {
      ...own(),
      voluntary: {
        ...own().voluntary,
        valuationMethod: `   ${DEFAULT_EXIT_POLICY.voluntary.valuationMethod.toUpperCase()}\n\n`,
      },
    };
    expect(platformDefaultTerms(normalizeExitPolicy(cosmetic))).toEqual(["How contributed value is honored"]);
  });

  it("a reordered step list is the village's own, and a shorter one is too", () => {
    const reordered = {
      ...own(),
      restorative: { intakeContactRole: "", steps: [...DEFAULT_EXIT_POLICY.restorative.steps].reverse() },
    };
    expect(platformDefaultTerms(normalizeExitPolicy(reordered))).toEqual([]);
    const shorter = {
      ...own(),
      voluntary: { ...own().voluntary, unwindSteps: DEFAULT_EXIT_POLICY.voluntary.unwindSteps.slice(0, 2) },
    };
    expect(platformDefaultTerms(normalizeExitPolicy(shorter))).toEqual([]);
  });

  it("the notice period is deliberately not a term: 30 days can be a real decision", () => {
    const sameNotice = { ...own(), voluntary: { ...own().voluntary, noticePeriodDays: 30 } };
    expect(platformDefaultTerms(normalizeExitPolicy(sameNotice))).toEqual([]);
  });
});

describe("normalizing an admin body", () => {
  it("merges per section, so a partial body cannot drop a published term", () => {
    // The old route spread the body over the defaults at the TOP level only, so
    // a `voluntary` without `unwindSteps` replaced the whole section.
    const partial = {
      placeholder: true,
      voluntary: { noticePeriodDays: 14 },
      involuntary: {},
      restorative: {},
    };
    const next = normalizeExitPolicy(partial);
    expect(next.voluntary.noticePeriodDays).toBe(14);
    expect(next.voluntary.unwindSteps).toEqual(DEFAULT_EXIT_POLICY.voluntary.unwindSteps);
    expect(next.voluntary.valuationMethod).toBe(DEFAULT_EXIT_POLICY.voluntary.valuationMethod);
  });

  it("drops blank steps and trims, and keeps the order typed", () => {
    const next = normalizeExitPolicy({
      ...own(),
      restorative: { intakeContactRole: "", steps: ["  first  ", "", "   ", "second"] },
    });
    expect(next.restorative.steps).toEqual(["first", "second"]);
  });

  it("refuses a negative or unreadable notice period by falling back to the default", () => {
    expect(normalizeExitPolicy({ ...own(), voluntary: { ...own().voluntary, noticePeriodDays: -3 } })
      .voluntary.noticePeriodDays).toBe(30);
    expect(normalizeExitPolicy({ ...own(), voluntary: { ...own().voluntary, noticePeriodDays: "soon" } })
      .voluntary.noticePeriodDays).toBe(30);
  });

  it("placeholder is only ever cleared by an explicit true, never by a truthy string", () => {
    expect(normalizeExitPolicy({ ...own(), placeholder: "yes" }).placeholder).toBe(false);
    expect(normalizeExitPolicy({ ...own(), placeholder: true }).placeholder).toBe(true);
  });
});

describe("a published policy cannot leave a term empty", () => {
  it("an emptied prose field falls back rather than publishing blank", () => {
    const emptied = normalizeExitPolicy({ ...own(), involuntary: { decidingDomainId: "", appealDomainId: "", process: "   " } });
    expect(emptied.involuntary.process).toBe(DEFAULT_EXIT_POLICY.involuntary.process);
    expect(blankTerms(emptied)).toEqual([]);
  });

  it("blankTerms names a term that somehow arrived empty", () => {
    const broken = { ...normalizeExitPolicy(own()), restorative: { intakeContactRole: "", steps: [] } };
    expect(blankTerms(broken)).toEqual(["The restorative path"]);
  });
});
