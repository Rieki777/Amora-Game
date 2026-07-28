import { describe, it, expect } from "vitest";
import { holdCancelled, swipeIntent, HOLD_SLOP_PX, SWIPE_MIN_PX } from "./gestures";

describe("hold, for asking an icon its name", () => {
  it("survives the wobble of a finger trying to stay still", () => {
    expect(holdCancelled(0, 0)).toBe(false);
    expect(holdCancelled(4, -6)).toBe(false);
    expect(holdCancelled(HOLD_SLOP_PX, HOLD_SLOP_PX)).toBe(false);
  });

  it("dies the moment the finger sets off somewhere", () => {
    expect(holdCancelled(HOLD_SLOP_PX + 1, 0)).toBe(true);   // starting a swipe
    expect(holdCancelled(0, -40)).toBe(true);                 // scrolling the rail
    expect(holdCancelled(-25, 25)).toBe(true);
  });
});

describe("swipe, for sliding the whole menu out", () => {
  it("opens on a real rightward drag and closes on a leftward one", () => {
    expect(swipeIntent(SWIPE_MIN_PX, 0)).toBe("open");
    expect(swipeIntent(120, 15)).toBe("open");
    expect(swipeIntent(-SWIPE_MIN_PX, 0)).toBe("close");
    expect(swipeIntent(-90, -10)).toBe("close");
  });

  it("ignores anything short of the threshold", () => {
    expect(swipeIntent(0, 0)).toBe(null);
    expect(swipeIntent(SWIPE_MIN_PX - 1, 0)).toBe(null);
    expect(swipeIntent(-39, 2)).toBe(null);
  });

  it("gives ties and diagonals to scrolling, not to the menu", () => {
    // The rail is a tall scrolling list; a thumb dragging down it drifts
    // sideways constantly. Reading that as "open the menu" would make the
    // list unscrollable.
    expect(swipeIntent(60, 200)).toBe(null);   // mostly vertical
    expect(swipeIntent(60, 60)).toBe(null);    // exactly diagonal
    expect(swipeIntent(-70, 90)).toBe(null);
    expect(swipeIntent(60, 59)).toBe("open");  // horizontal by a hair, but horizontal
  });
});
