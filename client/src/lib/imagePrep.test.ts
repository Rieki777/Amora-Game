/**
 * The value of client-side image prep is entirely in when it REFUSES.
 *
 * Shrinking a photo is the easy half and the half that cannot silently go
 * wrong: either the canvas draws or it throws. What can go wrong quietly is
 * handing the server a file that is not what it claims to be, or flattening an
 * animation, or rasterising a vector, or spending quality to make a file
 * bigger. So this suite tests the decisions and leaves the pixels alone.
 *
 * NO PIXELS ARE CHECKED HERE ON PURPOSE. vitest.config.ts runs the `node`
 * environment, there is no jsdom and no canvas implementation, so a test that
 * claimed to verify encoded output would be verifying a stub. What IS real,
 * and is what actually breaks in the field, is the branch taken: the suite
 * drives `prepareImageForUpload` through a fake `document` whose canvas
 * behaves like old Safari (asked for WebP, hands back PNG) and proves the
 * original file comes back untouched.
 */
import { afterEach, describe, expect, it } from "vitest";
import {
  canEncodeWebp,
  encodedIsBetter,
  fitWithin,
  prepareImageForUpload,
  resetWebpProbeForTests,
  skipReason,
  webpName,
} from "./imagePrep";

/** A canvas stub whose toBlob returns whatever type we tell it to. */
function fakeDocument(blobType: string | null, encodedBytes = 10) {
  return {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({ drawImage: () => {} }),
      toBlob: (cb: (b: Blob | null) => void) => {
        cb(blobType ? new Blob([new Uint8Array(encodedBytes)], { type: blobType }) : null);
      },
    }),
  };
}

function withDocument(doc: unknown, fn: () => Promise<void>) {
  const prev = (globalThis as any).document;
  (globalThis as any).document = doc;
  return fn().finally(() => {
    if (prev === undefined) delete (globalThis as any).document;
    else (globalThis as any).document = prev;
  });
}

afterEach(() => resetWebpProbeForTests());

describe("skipReason", () => {
  const big = 5 * 1024 * 1024;

  it("leaves a vector alone, by mime and by extension", () => {
    expect(skipReason({ type: "image/svg+xml", size: big, name: "mark.svg" })).toBe("svg");
    expect(skipReason({ type: "", size: big, name: "mark.SVG" })).toBe("svg");
  });

  it("leaves a gif alone, because a canvas would keep only frame one", () => {
    expect(skipReason({ type: "image/gif", size: big, name: "loop.gif" })).toBe("animated");
    expect(skipReason({ type: "", size: big, name: "loop.GIF" })).toBe("animated");
  });

  it("refuses anything that is not an image", () => {
    expect(skipReason({ type: "application/pdf", size: big, name: "deck.pdf" })).toBe("not-an-image");
  });

  it("leaves a file that is already cheap", () => {
    expect(skipReason({ type: "image/jpeg", size: 40 * 1024, name: "small.jpg" })).toBe("small-enough");
  });

  it("proceeds on a large photo", () => {
    expect(skipReason({ type: "image/jpeg", size: big, name: "photo.jpg" })).toBeNull();
    expect(skipReason({ type: "image/png", size: big, name: "shot.png" })).toBeNull();
    expect(skipReason({ type: "image/webp", size: big, name: "already.webp" })).toBeNull();
  });

  it("takes the threshold from the caller", () => {
    expect(skipReason({ type: "image/jpeg", size: 50 * 1024, name: "a.jpg" }, 10 * 1024)).toBeNull();
  });
});

describe("fitWithin", () => {
  it("never enlarges", () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });

  it("fits the long edge and keeps the ratio", () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
    expect(fitWithin(3000, 4000, 2000)).toEqual({ width: 1500, height: 2000 });
  });

  it("never rounds a dimension to zero", () => {
    expect(fitWithin(4000, 3, 100)).toEqual({ width: 100, height: 1 });
  });

  it("survives a degenerate image", () => {
    expect(fitWithin(0, 0, 2000)).toEqual({ width: 0, height: 0 });
  });
});

describe("encodedIsBetter", () => {
  it("only accepts a strictly smaller result", () => {
    expect(encodedIsBetter(1000, 900)).toBe(true);
    expect(encodedIsBetter(1000, 1000)).toBe(false);
    expect(encodedIsBetter(1000, 1200)).toBe(false);
    expect(encodedIsBetter(1000, 0)).toBe(false);
  });
});

describe("webpName", () => {
  it("swaps the extension so the name matches the bytes", () => {
    expect(webpName("holiday.JPG")).toBe("holiday.webp");
    expect(webpName("no-extension")).toBe("no-extension.webp");
    expect(webpName("two.dots.png")).toBe("two.dots.webp");
  });
});

describe("canEncodeWebp", () => {
  it("is false where there is no document at all", async () => {
    await withDocument(undefined, async () => {
      expect(await canEncodeWebp()).toBe(false);
    });
  });

  it("is false when the canvas ignores the format and returns png", async () => {
    await withDocument(fakeDocument("image/png"), async () => {
      expect(await canEncodeWebp()).toBe(false);
    });
  });

  it("is true only when the blob really comes back as webp", async () => {
    await withDocument(fakeDocument("image/webp"), async () => {
      expect(await canEncodeWebp()).toBe(true);
    });
  });
});

describe("prepareImageForUpload falls back to the original", () => {
  const photo = () => new File([new Uint8Array(3 * 1024 * 1024)], "photo.jpg", { type: "image/jpeg" });

  it("hands back the untouched file when the browser cannot encode webp", async () => {
    await withDocument(fakeDocument("image/png"), async () => {
      const file = photo();
      const out = await prepareImageForUpload(file, { maxEdge: 2000 });
      expect(out.changed).toBe(false);
      expect(out.reason).toBe("no-webp-encoder");
      expect(out.file).toBe(file);
      expect(out.bytes).toBe(file.size);
    });
  });

  it("hands back the untouched file when toBlob yields nothing", async () => {
    await withDocument(fakeDocument(null), async () => {
      const file = photo();
      const out = await prepareImageForUpload(file, { maxEdge: 2000 });
      expect(out.changed).toBe(false);
      expect(out.file).toBe(file);
    });
  });

  it("hands back a vector untouched without ever reaching the canvas", async () => {
    await withDocument(fakeDocument("image/webp"), async () => {
      const file = new File([new Uint8Array(2 * 1024 * 1024)], "mark.svg", { type: "image/svg+xml" });
      const out = await prepareImageForUpload(file, { maxEdge: 2000 });
      expect(out.reason).toBe("svg");
      expect(out.file).toBe(file);
    });
  });

  it("hands back an animation untouched", async () => {
    await withDocument(fakeDocument("image/webp"), async () => {
      const file = new File([new Uint8Array(2 * 1024 * 1024)], "loop.gif", { type: "image/gif" });
      const out = await prepareImageForUpload(file, { maxEdge: 2000 });
      expect(out.reason).toBe("animated");
      expect(out.file).toBe(file);
    });
  });

  it("reports the original size on every refusal, so a caller can log honestly", async () => {
    await withDocument(fakeDocument("image/png"), async () => {
      const file = photo();
      const out = await prepareImageForUpload(file, { maxEdge: 2000 });
      expect(out.originalBytes).toBe(file.size);
      expect(out.bytes).toBe(file.size);
    });
  });
});
