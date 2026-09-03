// @vitest-environment jsdom
/**
 * A village's word for its own tokens reaches the page, and nothing else moves.
 *
 * THE DEFECT THIS PINS. Admin then Tokens renames a token, `/api/game/config`
 * answers with the new name, and 93 places across 29 client files went on
 * printing the literal the page was written with. A member on a village that
 * renamed its recognition token to Seeds read "Claim Your Gratitude" on the
 * guide, "Gratitude" in the menu bar, and "Gratitude Balance" on their own
 * profile.
 *
 * THREE THINGS ARE PROVED HERE, and the third is the one a careless fix
 * breaks:
 *
 *   1. A renamed village reads its own word.
 *   2. A village whose config has not answered reads a generic noun, never an
 *      empty string, never "undefined", and never the platform's own default
 *      word (which would be indistinguishable from a village that chose it).
 *   3. Routes, hrefs and component names do NOT move when a token is renamed.
 *      Every existing link, bookmark and notification points at /gratitude,
 *      and a rename that changed the path would break all of them silently.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, renderHook, screen } from "@testing-library/react";
import { Router } from "wouter";

const useGameConfigMock = vi.fn();

vi.mock("@/lib/gameApi", () => ({
  useGameConfig: () => useGameConfigMock(),
}));

import { useTokenName, useTokenNameLower, useValueTokenName } from "./useTokenNames";
import MobileTabBar from "@/components/mobile/MobileTabBar";
import { TAB_SLOTS } from "@/config/mobileNav";
import { NAV, isGroup, type NavLink } from "@/config/nav";

/** A village that renamed both tokens. Deliberately nothing like the platform
 *  defaults, so a test that passes cannot be passing on a stale literal. */
const RENAMED = {
  project: { name: "Willowbrook", tagline: "", memberName: "", location: "", adminPath: "/admin" },
  currency: {
    name: "Seeds",
    nameLower: "seeds",
    value: { slug: "credits", name: "Harvest Shares" },
  },
  images: {},
};

beforeEach(() => {
  useGameConfigMock.mockReset();
});

describe("a village that renamed its tokens", () => {
  it("reads its own word for the recognition token, in both cases", () => {
    useGameConfigMock.mockReturnValue(RENAMED);
    expect(renderHook(() => useTokenName()).result.current).toBe("Seeds");
    expect(renderHook(() => useTokenNameLower()).result.current).toBe("seeds");
  });

  it("reads its own word for the value token", () => {
    useGameConfigMock.mockReturnValue(RENAMED);
    expect(renderHook(() => useValueTokenName()).result.current).toBe("Harvest Shares");
  });

  it("overrides the caller's fallback, which is only for the loading window", () => {
    useGameConfigMock.mockReturnValue(RENAMED);
    expect(renderHook(() => useTokenName("tokens")).result.current).toBe("Seeds");
    expect(renderHook(() => useValueTokenName("village tokens")).result.current).toBe("Harvest Shares");
  });
});

/**
 * The honest-absence rule. `?? "Gratitude"` was the old pattern in four files
 * and it fails exactly this: a village that renamed to Seeds painted the word
 * Gratitude first, which a member cannot tell apart from a village that chose
 * it. A generic noun can only be read as "not loaded".
 */
describe("a village whose config has not answered", () => {
  const empty = [
    ["null config", null],
    ["no currency block", { project: { name: "Willowbrook" }, images: {} }],
    ["blank names", { currency: { name: "", nameLower: "", value: { slug: "credits", name: "" } } }],
    ["whitespace names", { currency: { name: "   ", nameLower: "  ", value: { slug: "credits", name: " " } } }],
  ] as const;

  for (const [label, config] of empty) {
    it(`falls back to a generic noun rather than an empty string (${label})`, () => {
      useGameConfigMock.mockReturnValue(config);
      for (const value of [
        renderHook(() => useTokenName()).result.current,
        renderHook(() => useTokenNameLower()).result.current,
        renderHook(() => useValueTokenName()).result.current,
      ]) {
        expect(value.trim().length).toBeGreaterThan(0);
        expect(value).not.toBe("undefined");
        expect(value).not.toContain("undefined");
        // Never the platform's own default word: that reads as a choice.
        expect(value.toLowerCase()).not.toContain("gratitude");
      }
    });
  }

  it("uses the caller's own fallback where the sentence needs one", () => {
    useGameConfigMock.mockReturnValue(null);
    expect(renderHook(() => useTokenName("tokens")).result.current).toBe("tokens");
    expect(renderHook(() => useValueTokenName("village tokens")).result.current).toBe("village tokens");
  });
});

/**
 * The bottom bar is the smallest surface that carries a token label and its
 * route in the same object, which makes it the cheapest place to prove that
 * one moves and the other does not.
 */
describe("the bottom tab bar", () => {
  const bar = () =>
    render(
      <Router>
        <MobileTabBar />
      </Router>,
    );

  it("labels the token slot with the village's word", () => {
    useGameConfigMock.mockReturnValue(RENAMED);
    bar();
    expect(screen.getByLabelText("Seeds")).toBeTruthy();
    expect(screen.queryByLabelText("Gratitude")).toBeNull();
  });

  it("labels it with a generic noun before the config answers", () => {
    useGameConfigMock.mockReturnValue(null);
    bar();
    expect(screen.queryByLabelText("Gratitude")).toBeNull();
    expect(screen.getByLabelText("Recognition")).toBeTruthy();
  });

  it("keeps the route at /gratitude through a rename", () => {
    useGameConfigMock.mockReturnValue(RENAMED);
    bar();
    expect(screen.getByLabelText("Seeds").getAttribute("href")).toBe("/gratitude");
  });
});

/**
 * The other half of rule 3, asserted against the config modules themselves so
 * it holds for every consumer rather than for the one component above.
 */
describe("what a rename must never touch", () => {
  it("leaves the tab slot's path alone", () => {
    const slot = TAB_SLOTS.find((s) => s.token === "recognition");
    expect(slot?.path).toBe("/gratitude");
  });

  it("leaves the menu entry's href alone", () => {
    const links: NavLink[] = NAV.flatMap((e) => (isGroup(e) ? [...e.items] : [e]));
    const entry = links.find((l) => l.token === "recognition");
    expect(entry?.href).toBe("/gratitude");
  });

  it("marks exactly one entry per config as token-named, so nothing else drifts", () => {
    const links: NavLink[] = NAV.flatMap((e) => (isGroup(e) ? [...e.items] : [e]));
    expect(links.filter((l) => l.token).length).toBe(1);
    expect(TAB_SLOTS.filter((s) => s.token).length).toBe(1);
  });
});
