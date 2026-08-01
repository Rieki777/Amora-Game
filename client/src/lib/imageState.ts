/**
 * When is an image already showable at the moment React first sees it?
 *
 * This exists because of a bug that would have been invisible in review and
 * obvious to every returning member. `<Image>` fades in on the `onLoad` event,
 * but a cached image can finish decoding BEFORE React attaches that handler —
 * the event fires into nothing, the fade never runs, and the image sits at
 * opacity 0: present, correct, and unseen.
 *
 * That is not an edge case on this platform. Uploads are served
 * `max-age=31536000, immutable`, so for every returning member the cache hit
 * is the normal path. The bug reads as "the pictures disappear on the second
 * visit".
 *
 * The subtlety worth a test: `complete` is ALSO true for an image that
 * finished by FAILING. A 404'd upload is complete with `naturalWidth === 0`.
 * Treating that as loaded would fade in an empty box instead of showing the
 * "no art yet" placeholder — which is the difference between a village that
 * looks unfinished and one that looks broken.
 */
export interface ImageElementState {
  /** The browser's `HTMLImageElement.complete`. True for success AND failure. */
  complete: boolean;
  /** `HTMLImageElement.naturalWidth`. 0 when the image did not decode. */
  naturalWidth: number;
}

/**
 * Should the image be treated as loaded at mount, skipping the fade?
 *
 * `priority` images opt out of the fade entirely: they are above the fold and
 * usually arriving immediately, so a fade only adds a flicker to the thing the
 * visitor came to see.
 */
export function isInitiallyVisible(el: ImageElementState | null | undefined, priority = false): boolean {
  if (priority) return true;
  if (!el) return false;
  return el.complete && el.naturalWidth > 0;
}

/**
 * Did this image finish by failing? Distinguishes a genuine decode failure
 * from an image that simply has not arrived yet, so the placeholder shows only
 * when there is really nothing to show.
 */
export function hasFailedToDecode(el: ImageElementState | null | undefined): boolean {
  if (!el) return false;
  return el.complete && el.naturalWidth === 0;
}
