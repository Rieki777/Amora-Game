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

vi.mock("@/components/Layout", () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/lib/gameApi", () => ({
  useBrandImages: () => useBrandImagesMock(),
  useVillageLinks: () => ({ siteUrl: "", eventsUrl: "", contactEmail: "", mailTo: () => "" }),
  useVillageSettings: () => ({}),
  statedFacts: () => [],
  altOr: (value: string | undefined, fallback: string) =>
    typeof value === "string" ? value : fallback,
}));
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
  beforeEach(() => useBrandImagesMock.mockReset());

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
