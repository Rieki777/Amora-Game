// @vitest-environment jsdom
/**
 * THE THREE READOUTS, DRAWN, because the whole point of the change is what a
 * founder's eye lands on and nothing but a render can check that.
 *
 * `setupProgress.test.ts` proves the states are computed correctly. That is
 * not the same claim. The states were already computed correctly for the two
 * measured rows on 2026-09-02, and a live village still showed a wizard that
 * looked finished, because the SCREEN drew a ticked box and a counted row the
 * same way. So this file asserts the three cases are visibly different:
 *
 *   counted     a number, and the check only when the number is complete
 *   declared    the founder's own words, and never the check
 *   unknown     no number at all, because "0 of 9" is a reading and this is not
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SetupSection from "./SetupSection";
import { measureSetup, type SetupObservations, type BrandLike } from "./setupProgress";

function draw(
  brand: BrandLike | null | undefined,
  id: "identity" | "numbers",
  observed: SetupObservations = {},
  onToggleStep = vi.fn(),
) {
  const rows = measureSetup(brand, observed);
  render(
    <SetupSection
      id={id}
      n={1}
      title="A step"
      subtitle="What it sets"
      rows={rows}
      setup={brand?.setup as Record<string, unknown> | null | undefined}
      onToggleStep={onToggleStep}
    >
      <p>the step body</p>
    </SetupSection>,
  );
  return { onToggleStep };
}

/** A brand document that arrived carrying nothing. Not the same as no document. */
const EMPTY: BrandLike = { project: {}, images: {}, setup: {} };

describe("a counted step", () => {
  it("shows the count, and no check while fields are still empty", () => {
    draw(EMPTY, "identity");
    expect(screen.getByText(/0 of 5 filled in/)).toBeTruthy();
    expect(screen.queryByText(/You marked this done/)).toBeNull();
    expect(screen.queryByText(/Not counted/)).toBeNull();
  });

  it("shows the count with a check once every field has a value", () => {
    const brand: BrandLike = {
      project: {
        name: "a name",
        tagline: "a tagline",
        memberName: "a member",
        location: "a location",
        footerBlurb: "a blurb",
      },
      images: {},
      setup: {},
    };
    draw(brand, "identity");
    const readout = screen.getByText(/5 of 5 filled in/);
    expect(readout.className).toContain("emerald");
  });
});

describe("a step nobody has looked at", () => {
  it("says so, and never prints a zero", () => {
    draw(EMPTY, "numbers");
    expect(screen.getByText("Not counted")).toBeTruthy();
    expect(screen.queryByText(/filled in/)).toBeNull();
    expect(screen.queryByText(/0 of/)).toBeNull();
  });

  it("says so for a brand document that never arrived, on a counted step too", () => {
    // The silent zero, at the surface: before this, an unread record drew
    // "0 of 5 filled in" on the identity row.
    draw(null, "identity");
    expect(screen.getByText("Not counted")).toBeTruthy();
    expect(screen.queryByText(/filled in/)).toBeNull();
  });

  it("still offers the box, because a founder's own note is worth having", async () => {
    const { onToggleStep } = draw(EMPTY, "numbers");
    const box = screen.getByRole("checkbox");
    expect((box as HTMLInputElement).checked).toBe(false);
    await userEvent.click(box);
    expect(onToggleStep).toHaveBeenCalledWith("numbers");
  });
});

describe("a step a founder ticked", () => {
  it("says whose word it is, in its own colour, with no check", () => {
    draw({ ...EMPTY, setup: { numbers: true } }, "numbers");
    const label = screen.getByText("You marked this done").closest("label");
    expect(label).toBeTruthy();
    expect((label as HTMLElement).className).toContain("amber");
    expect((label as HTMLElement).className).not.toContain("emerald");
    expect(screen.queryByText(/filled in/)).toBeNull();
  });

  it("keeps the box tickable, so the note can be taken back", async () => {
    const { onToggleStep } = draw({ ...EMPTY, setup: { numbers: true } }, "numbers");
    const box = screen.getByRole("checkbox") as HTMLInputElement;
    expect(box.checked).toBe(true);
    await userEvent.click(box);
    expect(onToggleStep).toHaveBeenCalledWith("numbers");
  });

  it("is overruled by a reading that says done, which draws as a reading", () => {
    draw({ ...EMPTY, setup: { numbers: true } }, "numbers", {
      numbers: { state: "done", filled: 4, total: 4 },
    });
    expect(screen.getByText(/4 of 4 filled in/)).toBeTruthy();
    expect(screen.queryByText(/You marked this done/)).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
  });

  it("still carries a step whose reading says unfinished, and shows both", () => {
    // The deliberate blank: a village states its own land figures or states
    // none. The founder's word carries the step, the count stays on screen as
    // it stands, and the check never appears beside a zero.
    draw({ ...EMPTY, setup: { numbers: true } }, "numbers", {
      numbers: { state: "todo", filled: 0, total: 7 },
    });
    expect(screen.getByText("You marked this done")).toBeTruthy();
    const count = screen.getByText(/0/).closest("span") as HTMLElement;
    expect(count.textContent).toContain("of");
    expect(count.className).not.toContain("emerald");
    expect(count.querySelector("svg")).toBeNull();
  });
});
