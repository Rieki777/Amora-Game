// @vitest-environment jsdom
/**
 * WHAT A DEFAULT PICTURE CAN BREAK, AND WHAT IS PINNED HERE.
 *
 * The geometry has its own tests in shared/villageArt.test.ts. These cover
 * the three things that can only go wrong once the geometry meets a page,
 * and every one of them is silent in review.
 *
 *   1. THE ACCESSIBLE NAME. `Image` puts `role="img"` and `aria-label={alt}`
 *      on the wrapper so a hero's description survives an empty slot. A
 *      fallback that carried its own name would announce the same hero twice,
 *      and a fallback that swallowed the wrapper's would take a blind
 *      visitor from a described hero back to silence. The brief for this work
 *      asked specifically for proof that a screen reader user is not
 *      regressed, so the assertion is on the WHOLE composition, not on this
 *      component alone: render it exactly as a page would, inside `Image`.
 *   2. WHETHER IT DRAWS AT ALL. A village with no name has nothing to seed
 *      from, so it must draw nothing rather than draw the one composition
 *      every unnamed village would share.
 *   3. STABILITY ACROSS RENDERS. The whole promise is that a village's
 *      picture is the same picture on the next reload. A component that
 *      reached for Math.random would pass every geometry test and still
 *      reshuffle on screen.
 *
 * `villageName` is passed explicitly throughout so nothing here depends on a
 * network answer. `fetch` is stubbed anyway, because `useGameConfig` fires on
 * mount whichever way the name arrives, and an unstubbed call would leave a
 * request in flight after the test ended.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { Image } from "@/components/Image";
import { VillageArt } from "./VillageArt";
import { VILLAGE_ART_SLOTS, buildVillageArt } from "@shared/villageArt";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve(null) } as unknown as Response)),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const paths = (root: HTMLElement) => Array.from(root.querySelectorAll("svg path"));

describe("VillageArt", () => {
  it("draws one band path per band the generator produced", () => {
    const { container } = render(<VillageArt slot="hero" villageName="Riverbend" />);
    const expected = buildVillageArt("Riverbend", "hero");
    expect(paths(container)).toHaveLength(expected.bands.length);
    expect(container.querySelectorAll("svg circle")).toHaveLength(1);
  });

  it("hides itself from assistive technology", () => {
    const { container } = render(<VillageArt slot="hero" villageName="Riverbend" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    // No second name anywhere in the subtree.
    expect(container.querySelector("[role='img']")).toBeNull();
    expect(container.querySelector("[aria-label]")).toBeNull();
  });

  it("leaves Image's accessible name as the only one on the page", () => {
    // The composition a page actually renders: an empty brand slot, real alt
    // text, this component as the fallback.
    render(
      <Image
        src=""
        alt="The village and the land around it"
        priority
        fallback={<VillageArt slot="hero" villageName="Riverbend" />}
      />,
    );
    const named = screen.getAllByRole("img");
    expect(named).toHaveLength(1);
    expect(named[0]).toHaveAccessibleName("The village and the land around it");
  });

  it("stays silent for a decorative image, the same as the mark it replaces", () => {
    // alt="" is a deliberate "this image is decorative", and Image drops
    // role/aria-label entirely for it. The fallback must not reintroduce one.
    const { container } = render(
      <Image src="" alt="" priority fallback={<VillageArt slot="hero" villageName="Riverbend" />} />,
    );
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    // The artwork still drew; only its announcement is absent.
    expect(paths(container).length).toBeGreaterThan(0);
  });

  it("draws nothing for a village with no name yet", () => {
    // Image then shows its own quiet field, which is the honest state: there
    // is nothing to seed from, and a shared unseeded composition would be the
    // one picture every unnamed village wore.
    for (const name of ["", "   "]) {
      const { container } = render(<VillageArt slot="hero" villageName={name} />);
      expect(container.querySelector("svg")).toBeNull();
    }
  });

  it("renders the same paths on a remount", () => {
    const first = render(<VillageArt slot="hero" villageName="Riverbend" />);
    const before = paths(first.container).map((p) => p.getAttribute("d"));
    first.unmount();
    const second = render(<VillageArt slot="hero" villageName="Riverbend" />);
    expect(paths(second.container).map((p) => p.getAttribute("d"))).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });

  it("gives two villages different paths in the same slot", () => {
    const a = render(<VillageArt slot="hero" villageName="Riverbend" />);
    const b = render(<VillageArt slot="hero" villageName="Willowmere" />);
    expect(paths(a.container).map((p) => p.getAttribute("d"))).not.toEqual(
      paths(b.container).map((p) => p.getAttribute("d")),
    );
  });

  it("gives one village different paths in each of the six slots", () => {
    const seen = new Set<string>();
    for (const slot of VILLAGE_ART_SLOTS) {
      const { container } = render(<VillageArt slot={slot} villageName="Riverbend" />);
      seen.add(paths(container).map((p) => p.getAttribute("d")).join("|"));
    }
    expect(seen.size).toBe(VILLAGE_ART_SLOTS.length);
  });

  it("routes every fill through the token layer, never a compiled-in colour", () => {
    // This is the mechanism that lets a founder's seed colour reach the
    // artwork at all, and the reason scripts/check-theme-literals.mjs exists.
    // A hex code here would be a colour no village could ever change.
    const { container } = render(<VillageArt slot="hero" villageName="Riverbend" />);
    const fills = Array.from(container.querySelectorAll("svg [fill]")).map((el) => el.getAttribute("fill"));
    expect(fills.length).toBeGreaterThan(1);
    for (const fill of fills) {
      expect(fill).toBe("var(--tone-brand-soft, currentColor)");
    }
    // And the neutral it falls back to comes from a theme token that flips
    // between light and dark, rather than from a fixed grey.
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-muted-foreground");
  });

  it("normalises the name, so one village that typed it three ways gets one picture", () => {
    const canonical = render(<VillageArt slot="hero" villageName="Riverbend" />);
    const expected = paths(canonical.container).map((p) => p.getAttribute("d"));
    for (const variant of ["  Riverbend  ", "RIVERBEND", "riverbend"]) {
      const { container } = render(<VillageArt slot="hero" villageName={variant} />);
      expect(paths(container).map((p) => p.getAttribute("d"))).toEqual(expected);
    }
  });
});
