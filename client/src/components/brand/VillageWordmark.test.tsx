// @vitest-environment jsdom
/**
 * The wordmark is the default for the two MARK slots, `logo` and
 * `heartLogo`, where generated artwork is the wrong answer (VillageWordmark
 * .tsx carries the reasoning). Three things worth pinning:
 *
 *   1. It renders the name as REAL TEXT. An image of a name cannot be
 *      selected, translated, or scaled by a reader's own font setting, and
 *      the whole reason to prefer a wordmark over a glyph is that it says
 *      something true in a form everyone can read.
 *   2. It renders nothing when there is no name. The header and footer both
 *      already reserve their box, so an absent mark costs no layout shift,
 *      and a placeholder word would be a name the village did not choose.
 *   3. It survives founder input. A village name has no length cap anywhere
 *      in this platform, so a long one has to wrap rather than push the
 *      navigation off the side of the page.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VillageWordmark } from "./VillageWordmark";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve(null) } as unknown as Response)),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VillageWordmark", () => {
  it("renders the village name as text a reader can select and translate", () => {
    render(<VillageWordmark villageName="Riverbend" />);
    expect(screen.getByText("Riverbend")).toBeInTheDocument();
  });

  it("trims what the founder typed", () => {
    const { container } = render(<VillageWordmark villageName="  Two Rivers  " />);
    expect(container.textContent).toBe("Two Rivers");
  });

  it("renders nothing when the village has no name yet", () => {
    for (const name of ["", "   "]) {
      const { container } = render(<VillageWordmark villageName={name} />);
      expect(container.firstChild).toBeNull();
    }
  });

  it("wraps a long name instead of pushing the navigation sideways", () => {
    const { container } = render(
      <VillageWordmark villageName="The Very Long Regenerative Village Of Somewhere Far Away" />,
    );
    expect(container.firstElementChild?.getAttribute("class")).toContain("break-words");
  });

  it("takes its size and colour from the caller", () => {
    // The header sits on a coloured bar at 64px and the footer at 90px, so
    // this component sets family and weight and leaves the rest alone. A
    // caller class must survive rather than be overridden.
    const { container } = render(<VillageWordmark villageName="Riverbend" className="text-2xl text-white" />);
    const cls = container.firstElementChild?.getAttribute("class") ?? "";
    expect(cls).toContain("text-2xl");
    expect(cls).toContain("text-white");
    expect(cls).toContain("font-display");
  });
});
