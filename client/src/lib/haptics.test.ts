/**
 * The haptic util carries MobileFab's behaviour, so the test pins the two
 * things that behaviour depended on: it never throws where the API is absent,
 * and it never fires at all once a member has asked for quiet.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HAPTIC_MS, haptic, hapticsEnabled, hapticsSupported, setHapticsEnabled } from "./haptics";

const real = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function withNavigator(value: unknown) {
  Object.defineProperty(globalThis, "navigator", { value, configurable: true, writable: true });
}

beforeEach(() => setHapticsEnabled(true));

afterEach(() => {
  if (real) Object.defineProperty(globalThis, "navigator", real);
  else delete (globalThis as { navigator?: unknown }).navigator;
});

describe("the vocabulary", () => {
  it("names five intensities and keeps every single pulse short", () => {
    const names = Object.keys(HAPTIC_MS);
    expect(names).toEqual(["tick", "tap", "press", "confirm", "arrive"]);
    for (const value of Object.values(HAPTIC_MS)) {
      const pulses = Array.isArray(value) ? value.filter((_, i) => i % 2 === 0) : [value];
      for (const ms of pulses) expect(ms).toBeLessThanOrEqual(30);
    }
  });

  it("keeps MobileFab's two numbers, so its feel does not change", () => {
    expect(HAPTIC_MS.press).toBe(10);
    expect(HAPTIC_MS.tap).toBe(8);
  });

  it("rises in weight from tick to confirm", () => {
    expect(HAPTIC_MS.tick).toBeLessThan(HAPTIC_MS.tap as number);
    expect(HAPTIC_MS.tap).toBeLessThan(HAPTIC_MS.press as number);
    expect(HAPTIC_MS.press).toBeLessThan(HAPTIC_MS.confirm as number);
  });
});

describe("firing", () => {
  it("passes the named duration to the device", () => {
    const vibrate = vi.fn(() => true);
    withNavigator({ vibrate });
    expect(haptic("confirm")).toBe(true);
    expect(vibrate).toHaveBeenCalledWith(18);
    expect(haptic("arrive")).toBe(true);
    expect(vibrate).toHaveBeenLastCalledWith([12, 40, 12]);
  });

  it("defaults to a tap", () => {
    const vibrate = vi.fn(() => true);
    withNavigator({ vibrate });
    haptic();
    expect(vibrate).toHaveBeenCalledWith(8);
  });

  it("says no on a device with no motor, and does not throw", () => {
    withNavigator({});
    expect(hapticsSupported()).toBe(false);
    expect(haptic("tap")).toBe(false);
  });

  it("swallows a device that throws", () => {
    withNavigator({
      vibrate: () => {
        throw new Error("blocked by permissions policy");
      },
    });
    expect(haptic("tick")).toBe(false);
  });

  it("stays silent once quiet is asked for", () => {
    const vibrate = vi.fn(() => true);
    withNavigator({ vibrate });
    setHapticsEnabled(false);
    expect(hapticsEnabled()).toBe(false);
    expect(haptic("confirm")).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
    setHapticsEnabled(true);
    expect(haptic("confirm")).toBe(true);
  });
});
