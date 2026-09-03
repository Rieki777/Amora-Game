// @vitest-environment jsdom
/**
 * The master plan hero, held to the same rule as the homepage hero.
 *
 * This page carried the defect in its most visible form. Image's placeholder
 * mark is centred in the box it fills, and here that box is the full-bleed
 * hero (measured 1264x489 at a 1272px viewport), so the 32px picture frame
 * landed at the middle of the section: inside the headline's own rectangle,
 * in the leading between "The Unnamed Village" and "Master Plan". It reads as
 * a broken image stamped on the title.
 *
 * Worth recording precisely, because the audit brief described it as sitting
 * ON TOP of the headline and that part is not what the browser does: the h1
 * wins the hit test at the glyph's centre, so the mark paints BEHIND the
 * letters. The content already sits at z-10 over a z-0 background and always
 * did. The defect was never the stacking order. It was a 32px mark centred in
 * a box that happens to be the same box the title sits in, and drawing
 * nothing is what removes it.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
// framer-motion's `whileInView` reaches for IntersectionObserver, which jsdom
// does not implement. A stub that never fires is right here: these tests ask
// what the hero renders, not what it animates on scroll.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}
vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);

import { fireEvent, render, screen } from "@testing-library/react";
import { Router } from "wouter";
import type { ReactNode } from "react";

const useBrandImagesMock = vi.fn();
/*
 * The village's own settings, swapped per test. `statedFacts` and `altOr` are
 * the REAL implementations rather than stubs: the tile row is built by the two
 * of them together, so a stub for either would leave the thing under test
 * unexercised. Only the two hooks that reach for the network are replaced.
 */
const useVillageSettingsMock = vi.fn<() => Record<string, unknown> | null>(() => ({}));

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/gameApi", async () => {
  const actual = await vi.importActual<typeof import("@/lib/gameApi")>("@/lib/gameApi");
  return {
    useBrandImages: () => useBrandImagesMock(),
    useVillageLinks: () => ({ siteUrl: "", eventsUrl: "", contactEmail: "", mailTo: () => "" }),
    useVillageSettings: () => useVillageSettingsMock(),
    statedFacts: actual.statedFacts,
    altOr: actual.altOr,
  };
});
vi.mock("@/hooks/useVillageName", () => ({ useVillageName: () => "Willowbrook" }));

import MasterPlan from "./MasterPlan";

const renderPlan = () =>
  render(
    <Router>
      <MasterPlan />
    </Router>,
  );

const hero = () => document.querySelector("section") as HTMLElement;

describe("the master plan hero", () => {
  beforeEach(() => {
    useBrandImagesMock.mockReset();
    useVillageSettingsMock.mockReturnValue({});
  });

  it("draws no picture and no placeholder mark when the village has added no art", () => {
    useBrandImagesMock.mockReturnValue({ masterPlanHero: "" });

    renderPlan();

    expect(hero().querySelector("img")).toBeNull();
    expect(hero().querySelector('[role="img"]')).toBeNull();
  });

  it("leaves the headline as the only thing in the middle of the hero", () => {
    // The concrete symptom, stated as an assertion: nothing decorative is
    // drawn inside the headline's box any more, so the title reads as a
    // title.
    useBrandImagesMock.mockReturnValue({ masterPlanHero: "" });

    renderPlan();
    const heading = screen.getByRole("heading", { level: 1 });

    expect(heading).toHaveTextContent("The Willowbrook Master Plan");
    expect(hero().querySelectorAll('[role="img"]')).toHaveLength(0);
  });

  it("paints the copy on its own opaque band", () => {
    useBrandImagesMock.mockReturnValue({ masterPlanHero: "" });

    renderPlan();
    const band = hero().querySelector(".rounded-3xl.bg-teal-band");

    expect(band).toBeTruthy();
    expect(band).toHaveAttribute("aria-hidden", "true");
  });

  it("draws the picture when there is one, and keeps its name when it fails", () => {
    useBrandImagesMock.mockReturnValue({
      masterPlanHero: "/uploads/plan.jpg",
      masterPlanHeroAlt: "The site plan drawing",
    });

    renderPlan();
    const img = hero().querySelector("img") as HTMLImageElement;
    expect(img).toHaveAttribute("src", "/uploads/plan.jpg");
    expect(img).toHaveAttribute("alt", "The site plan drawing");

    fireEvent.error(img);

    const mark = hero().querySelector('[role="img"]');
    expect(mark).toBeTruthy();
    expect(mark).toHaveAttribute("aria-label", "The site plan drawing");
  });
});

/**
 * The size of the land, and the unit the village measures it in.
 *
 * The tile label was the literal string "Total Acres" over a free-text number
 * the village types in Settings. Settings asks for the unit in the box beside
 * that number and the tile threw it away, so a village entering 40 hectares
 * published "40 / Total Acres" on the page it shows investors: its land, at
 * 40% of its real size, produced by filling the screen in the way the screen
 * asked. The first village on this platform measures in hectares.
 *
 * Both directions are asserted, because a test that only ever sees the case it
 * was written for is not a test. The hectares village must not get a page
 * saying acres, AND the village that typed a bare number back when acres was
 * the only thing this tile could say must render exactly as it does today.
 */
describe("the size of the land", () => {
  beforeEach(() => {
    useBrandImagesMock.mockReset();
    useBrandImagesMock.mockReturnValue({ masterPlanHero: "" });
  });

  // `section.bg-teal-deep` alone also matches the closing call to action, which
  // renders whether or not the village has stated a figure. The band under test
  // is the py-12 one.
  const statsBand = () =>
    document.querySelector("section.py-12.bg-teal-deep") as HTMLElement | null;

  it("states the unit the village measures in", () => {
    useVillageSettingsMock.mockReturnValue({
      landFacts: { acres: { value: "40", note: "hectares" } },
    });

    renderPlan();
    const band = statsBand();

    expect(band).toBeTruthy();
    expect(band).toHaveTextContent("40");
    expect(band).toHaveTextContent("Total hectares");
    // The whole page, not just the tile: nothing anywhere may call this land
    // acres when the village said hectares.
    expect(document.body.textContent ?? "").not.toMatch(/acre/i);
  });

  it("converts nothing, so the number on the page is the number that was typed", () => {
    // 40 hectares is 98.8 acres. Publishing 98.8 would put a figure on an
    // investor page that nobody at the village ever wrote, which is a worse
    // thing to ship than the bug this replaces.
    useVillageSettingsMock.mockReturnValue({
      landFacts: { acres: { value: "40", note: "hectares" } },
    });

    renderPlan();

    // Scoped to the band a converted figure would land in, so unrelated copy
    // elsewhere on the page cannot fail this for the wrong reason.
    expect(statsBand()).toHaveTextContent("40");
    expect(statsBand()?.textContent ?? "").not.toContain("98");
  });

  it("keeps the page a village with a bare number already has", () => {
    // No unit stated: the same payload that renders "40 / Total Acres" today,
    // rendering "40 / Total Acres" after the fix. Nobody's live page moves.
    useVillageSettingsMock.mockReturnValue({
      landFacts: { acres: { value: "40", note: "" } },
    });

    renderPlan();
    const band = statsBand();

    expect(band).toHaveTextContent("40");
    expect(band).toHaveTextContent("Total Acres");
  });

  it("carries a unit it has never heard of", () => {
    // Costa Rica measures in manzanas as well as hectares, and a closed list
    // of units is how the next village gets told its own land is unspeakable.
    // Free text, published verbatim.
    useVillageSettingsMock.mockReturnValue({
      landFacts: { acres: { value: "6", note: "manzanas" } },
    });

    renderPlan();

    expect(statsBand()).toHaveTextContent("Total manzanas");
  });

  it("leaves the other tiles' labels alone", () => {
    useVillageSettingsMock.mockReturnValue({
      landFacts: {
        acres: { value: "40", note: "hectares" },
        plannedHomes: { value: "150", note: "" },
        guestRooms: { value: "120", note: "" },
      },
    });

    renderPlan();
    const band = statsBand();

    expect(band).toHaveTextContent("Planned Homes");
    expect(band).toHaveTextContent("Retreat Keys");
  });

  it("shows no band at all when the village has stated nothing", () => {
    useVillageSettingsMock.mockReturnValue({ landFacts: { acres: { value: "", note: "hectares" } } });

    renderPlan();

    expect(statsBand()).toBeNull();
  });
});
