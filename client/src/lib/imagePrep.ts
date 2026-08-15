/**
 * Shrink an image in the browser before it is uploaded.
 *
 * A member picks a photo straight off a phone and it is 4000 px wide and 8 MB.
 * The server already re-encodes brand images to WebP at 2000 px, so the bytes
 * are fine ONCE THEY ARRIVE; the cost nobody was paying attention to is the
 * arrival. This platform is built for links around 50 KB/s, where 8 MB is
 * about three minutes of upload that can fail at 95% and start again. The same
 * picture prepared here is a few hundred KB.
 *
 * WHY THE CANVAS AND NOT A LIBRARY. The house rule is no new runtime
 * dependency, and none is needed: every browser that can run this app can draw
 * an image to a canvas and encode it. The whole implementation is the platform
 * API plus the care to know when it will not work.
 *
 * WHEN IT DOES NOT WORK IT HANDS BACK THE ORIGINAL. That is the load-bearing
 * behaviour and the reason the decision logic below is separated from the
 * pixels: a helper that silently ships a broken file is worse than no helper.
 * Four cases hand the original back untouched:
 *
 *   SVG          - a vector rasterised to a canvas stops being a vector.
 *   GIF          - canvas keeps frame one, so an animation would lose its
 *                  animation without saying so.
 *   already small - re-encoding a 40 KB image to make it 38 KB spends quality
 *                  on nothing.
 *   no encoder   - older Safari ignores the WebP mime and returns PNG. That is
 *                  detected by READING THE BLOB'S TYPE, never by sniffing the
 *                  user agent, and a PNG re-encode of a photo is usually
 *                  bigger than the JPEG it came from, so we stop.
 *
 * And one more after the work is done: if the encoded result is not smaller
 * than the original, the original wins. There is no case where this helper is
 * allowed to make an upload worse.
 */

/** What the caller gets back. `changed` is false when the original is returned. */
export type PreparedImage = {
  file: File;
  changed: boolean;
  /** Machine-readable note on what happened, for logs and tests. */
  reason: string;
  originalBytes: number;
  bytes: number;
};

export type PrepOptions = {
  /**
   * Longest edge to keep. Pick it from what the RECEIVER needs, never a round
   * number that felt right: brand and reference art is re-encoded server-side
   * at 2000, so 2000 here means the server's resize is a no-op and the picture
   * is only ever resampled once.
   */
  maxEdge: number;
  /** WebP quality. 82 is what the server uses for the same material. */
  quality?: number;
  /** Files at or under this are already cheap enough to leave alone. */
  skipUnderBytes?: number;
};

const DEFAULTS = { quality: 82, skipUnderBytes: 120 * 1024 };

/**
 * Should this file be left exactly as it is? Returns the reason, or null to
 * proceed. Pure, and deliberately takes only the three fields it reads so a
 * test can call it without constructing a File.
 */
export function skipReason(
  file: { type: string; size: number; name: string },
  skipUnderBytes: number = DEFAULTS.skipUnderBytes,
): string | null {
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  if (!type.startsWith("image/") && !/\.(jpe?g|png|webp|avif|gif|svg)$/.test(name)) return "not-an-image";
  if (type === "image/svg+xml" || name.endsWith(".svg")) return "svg";
  if (type === "image/gif" || name.endsWith(".gif")) return "animated";
  if (file.size <= skipUnderBytes) return "small-enough";
  return null;
}

/**
 * Fit within a square of `maxEdge` without ever enlarging. Pure, and rounded
 * the way a canvas needs (integers, never zero).
 */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Did the re-encode earn its place? Pure. Anything that is not strictly
 * smaller loses, so a "compression" that grows a file can never ship.
 */
export function encodedIsBetter(originalBytes: number, encodedBytes: number): boolean {
  return encodedBytes > 0 && encodedBytes < originalBytes;
}

/**
 * Can this browser really encode WebP from a canvas?
 *
 * The honest test is to encode one pixel and READ THE TYPE BACK. A browser
 * that does not know the format ignores the argument and hands over a PNG
 * with a cheerful 200-shaped success, which is exactly the failure that would
 * otherwise reach the server as a mislabelled file. Cached after the first
 * call: it cannot change inside a session.
 */
let webpSupport: Promise<boolean> | null = null;
export function canEncodeWebp(): Promise<boolean> {
  if (webpSupport) return webpSupport;
  webpSupport = new Promise<boolean>((resolve) => {
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      if (typeof canvas.toBlob !== "function") return resolve(false);
      canvas.toBlob((blob) => resolve(!!blob && blob.type === "image/webp"), "image/webp", 0.8);
    } catch {
      resolve(false);
    }
  });
  return webpSupport;
}

/** Reset the cached probe. Tests only. */
export function resetWebpProbeForTests(): void {
  webpSupport = null;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Swap the extension so the uploaded name matches the bytes inside it. */
export function webpName(name: string): string {
  return name.replace(/\.[^.]+$/, "") + ".webp";
}

/**
 * Prepare a chosen file for upload. Never throws: every failure path returns
 * the original file with a reason, because the upload matters more than the
 * optimisation.
 */
export async function prepareImageForUpload(file: File, opts: PrepOptions): Promise<PreparedImage> {
  const quality = opts.quality ?? DEFAULTS.quality;
  const skipUnder = opts.skipUnderBytes ?? DEFAULTS.skipUnderBytes;
  const untouched = (reason: string): PreparedImage => ({
    file, changed: false, reason, originalBytes: file.size, bytes: file.size,
  });

  const skip = skipReason(file, skipUnder);
  if (skip) return untouched(skip);
  if (!(await canEncodeWebp())) return untouched("no-webp-encoder");

  try {
    const img = await loadImage(file);
    const { width, height } = fitWithin(img.naturalWidth || img.width, img.naturalHeight || img.height, opts.maxEdge);
    if (!width || !height) return untouched("no-dimensions");

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return untouched("no-2d-context");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await toBlob(canvas, "image/webp", quality / 100);
    if (!blob || blob.type !== "image/webp") return untouched("no-webp-encoder");
    if (!encodedIsBetter(file.size, blob.size)) return untouched("encoded-larger");

    return {
      file: new File([blob], webpName(file.name), { type: "image/webp", lastModified: Date.now() }),
      changed: true,
      reason: "webp",
      originalBytes: file.size,
      bytes: blob.size,
    };
  } catch {
    return untouched("prepare-failed");
  }
}
