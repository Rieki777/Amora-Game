import { describe, expect, it } from "vitest";
import { chooseLanding, LANDING_SWITCH_VISIT } from "./landing";

describe("where a returning member lands", () => {
  it("shows the welcome page to a first-time visitor", () => {
    expect(chooseLanding({ visits: 1, preference: null, mapAvailable: true })).toBe("home");
  });

  it("shows the welcome page twice before switching", () => {
    expect(chooseLanding({ visits: 2, preference: null, mapAvailable: true })).toBe("home");
  });

  it("lands on the map from the third visit", () => {
    expect(chooseLanding({ visits: LANDING_SWITCH_VISIT, preference: null, mapAvailable: true })).toBe("map");
    expect(chooseLanding({ visits: 50, preference: null, mapAvailable: true })).toBe("map");
  });

  it("never routes into a map the viewer cannot see", () => {
    // The map is an optional module. A village without it, or a visitor below
    // its lifecycle rank, must not be bounced into a page that refuses them.
    expect(chooseLanding({ visits: 50, preference: null, mapAvailable: false })).toBe("home");
    expect(chooseLanding({ visits: 50, preference: "map", mapAvailable: false })).toBe("home");
  });

  it("honours an explicit 'home' choice forever", () => {
    expect(chooseLanding({ visits: 500, preference: "home", mapAvailable: true })).toBe("home");
  });

  it("honours an explicit 'map' choice before the automatic switch", () => {
    expect(chooseLanding({ visits: 1, preference: "map", mapAvailable: true })).toBe("map");
  });
});
