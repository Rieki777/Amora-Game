import { describe, expect, it } from "vitest";
import { hasFailedToDecode, isInitiallyVisible } from "./imageState";

describe("image visibility at mount", () => {
  it("shows a cached, decoded image immediately", () => {
    // THE BUG THIS FILE EXISTS FOR. Uploads are served immutable for a year,
    // so on a second visit the image is decoded before React attaches onLoad.
    // Waiting for an event that has already fired leaves it at opacity 0.
    expect(isInitiallyVisible({ complete: true, naturalWidth: 1000 })).toBe(true);
  });

  it("does not show an image that has not arrived yet", () => {
    expect(isInitiallyVisible({ complete: false, naturalWidth: 0 })).toBe(false);
  });

  it("does not treat a FAILED image as loaded", () => {
    // `complete` is true for failure too. A 404'd upload would otherwise fade
    // in an empty box instead of showing the "no art yet" placeholder — a
    // village that looks broken rather than one that looks unfinished.
    expect(isInitiallyVisible({ complete: true, naturalWidth: 0 })).toBe(false);
  });

  it("skips the fade entirely for priority images", () => {
    // Above the fold: a fade on the hero is a flicker on the thing the
    // visitor came to see. True even before the element exists.
    expect(isInitiallyVisible(null, true)).toBe(true);
    expect(isInitiallyVisible({ complete: false, naturalWidth: 0 }, true)).toBe(true);
  });

  it("treats a missing element as not yet loaded", () => {
    expect(isInitiallyVisible(null)).toBe(false);
    expect(isInitiallyVisible(undefined)).toBe(false);
  });
});

describe("decode failure detection", () => {
  it("flags a completed image with no pixels", () => {
    expect(hasFailedToDecode({ complete: true, naturalWidth: 0 })).toBe(true);
  });

  it("does not flag an image still in flight", () => {
    // The distinction that keeps the placeholder from flashing over an image
    // that is simply slow on a 50 KB/s link.
    expect(hasFailedToDecode({ complete: false, naturalWidth: 0 })).toBe(false);
  });

  it("does not flag a decoded image", () => {
    expect(hasFailedToDecode({ complete: true, naturalWidth: 800 })).toBe(false);
  });

  it("treats a missing element as not failed", () => {
    expect(hasFailedToDecode(null)).toBe(false);
  });
});
