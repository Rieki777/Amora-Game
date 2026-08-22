/**
 * Turning a member's photograph into something the village can publish.
 *
 * ── THE ONE THING HERE THAT HURTS SOMEBODY IF IT IS WRONG ────────────────
 *
 * A photograph taken on the land carries the coordinates of the land in its
 * EXIF. Several of these villages have good reasons not to be findable, and
 * publishing the exact position of a rural land project by accident is a harm
 * to real people who never chose it and cannot see it coming.
 *
 * The platform's existing image pipeline re-encodes through sharp, and sharp
 * drops metadata by default. "By default" is a property of a dependency, not a
 * guarantee of this product: a future sharp, a future `.withMetadata()` added
 * for a good reason two files away, or an encoder that passes a chunk through
 * would each turn a silent default into a live disclosure with nothing
 * raising.
 *
 * So the strip is asserted twice and neither assertion is a comment:
 *
 *   1. `readMetadataMarkers` runs on the encoded bytes BEFORE they are written
 *      to the volume, on every single upload. Anything it finds throws, the
 *      upload fails, and nothing reaches the uploads directory.
 *   2. `server/lib/placePhotos.test.ts` builds a JPEG with a real GPS IFD,
 *      proves the fixture carries it, runs THIS function, and asserts the
 *      output carries none. The fixture check is what stops the test passing
 *      vacuously if the fixture ever stops being geotagged.
 *
 * ── WHY THE VOLUME AND NOT THE BUNDLE ───────────────────────────────────
 *
 * Photographs live in the uploads volume and are served from there. Nothing
 * here ever writes to `client/public`, which is cached one-year-immutable and
 * counted against a CI budget in 4 KB blocks.
 */
import path from "node:path";
import fs from "node:fs";

/** Longest edge kept, matching the brand pipeline so a picture is resampled once. */
export const PHOTO_MAX_EDGE = 2000;
/** The thumbnail every gallery grid actually renders. */
export const PHOTO_THUMB_EDGE = 400;

export interface EncodedPhoto {
  filename: string;
  thumbFilename: string | null;
  width: number;
  height: number;
  bytes: number;
}

/**
 * What survived the encode, named. Empty means nothing did.
 *
 * Reports the categories a picture can carry a location in, and not only EXIF:
 * XMP holds `exif:GPSLatitude` in plain text and rides in its own chunk, and
 * IPTC carries a location sublocation. A guard that only knew about EXIF would
 * pass a file that says where it was taken in two other places.
 */
export async function readMetadataMarkers(bytes: Buffer): Promise<string[]> {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(bytes).metadata();
  const found: string[] = [];
  if (meta.exif && meta.exif.length) found.push("exif");
  if (meta.xmp && (meta.xmp as any).length) found.push("xmp");
  if ((meta as any).iptc && (meta as any).iptc.length) found.push("iptc");
  // The chunk names, straight off the wire. sharp parses what it knows; a
  // container chunk it has no field for would still be sitting in the bytes.
  const head = bytes.toString("binary");
  if (head.includes("EXIF")) found.push("exif-chunk");
  if (head.includes("http://ns.adobe.com/xap")) found.push("xmp-packet");
  return Array.from(new Set(found));
}

/** Thrown when the encoded bytes still carry metadata. The upload fails with it. */
export class LocationDataSurvived extends Error {
  constructor(public markers: string[]) {
    super(`The picture still carried ${markers.join(", ")} after re-encoding, so it was not stored.`);
    this.name = "LocationDataSurvived";
  }
}

/**
 * Re-encode a photograph to WebP with no metadata at all, and prove it.
 *
 * Returns the bytes. Kept separate from the file write so a test can call it
 * with nothing but a buffer, which is what makes the EXIF proof cheap enough
 * to run on every suite.
 */
export async function stripAndEncode(input: Buffer, maxEdge = PHOTO_MAX_EDGE, quality = 82): Promise<{ bytes: Buffer; width: number; height: number }> {
  const sharp = (await import("sharp")).default;
  const out = await sharp(input)
    // Honour the orientation flag before resizing, then let it go with the
    // rest of the metadata. A picture that arrives sideways stays sideways
    // otherwise, because the flag that would have turned it is stripped.
    .rotate()
    .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });
  const markers = await readMetadataMarkers(out.data);
  if (markers.length) throw new LocationDataSurvived(markers);
  return { bytes: out.data, width: out.info.width, height: out.info.height };
}

/**
 * The whole write: full size, a thumbnail, both stripped, both on the volume.
 *
 * The thumbnail is not best-effort here, and that is a deliberate difference
 * from the brand pipeline. A gallery is a grid of pictures; serving forty
 * full-size images to a phone on a 50 KB/s link is a page that does not load.
 * If the thumbnail cannot be made, the full-size file is removed again and the
 * upload fails, so a half-written pair never reaches a row.
 */
export async function writePhoto(input: Buffer, uploadsDir: string, stamp: string): Promise<EncodedPhoto> {
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
  const filename = `place-${stamp}.webp`;
  const thumbFilename = `place-${stamp}.thumb.webp`;
  const full = await stripAndEncode(input, PHOTO_MAX_EDGE);
  fs.writeFileSync(path.join(uploadsDir, filename), full.bytes);
  try {
    const thumb = await stripAndEncode(input, PHOTO_THUMB_EDGE, 76);
    fs.writeFileSync(path.join(uploadsDir, thumbFilename), thumb.bytes);
  } catch (e) {
    try { fs.unlinkSync(path.join(uploadsDir, filename)); } catch { /* never written */ }
    throw e;
  }
  return { filename, thumbFilename, width: full.width, height: full.height, bytes: full.bytes.length };
}

/**
 * Filenames the uploads route must refuse, held in memory.
 *
 * Hiding a row takes a picture out of every gallery and does nothing to the
 * bytes: `/api/uploads/:filename` has no gate on it, serves one year immutable,
 * and answers anybody holding the address. For a photograph somebody has asked
 * to have taken down, that is the whole failure, so the serving route asks this
 * set first.
 *
 * A Set and not a query because the route is the hottest read on the server and
 * a village's suppressed list is tens of entries. Loaded once at boot, and
 * every write path that hides, restores or removes updates it in the same
 * function that writes the row.
 */
const suppressed = new Set<string>();

export function isSuppressedUpload(filename: string): boolean {
  return suppressed.has(filename);
}

export function suppressUploads(filenames: readonly (string | null)[]): void {
  for (const f of filenames) if (f) suppressed.add(basenameOf(f));
}

export function unsuppressUploads(filenames: readonly (string | null)[]): void {
  for (const f of filenames) if (f) suppressed.delete(basenameOf(f));
}

export function loadSuppressed(filenames: readonly string[]): void {
  suppressed.clear();
  for (const f of filenames) suppressed.add(basenameOf(f));
}

/** Tests only, so one suite's suppressions cannot leak into the next. */
export function resetSuppressedForTests(): void {
  suppressed.clear();
}

export function basenameOf(urlOrName: string): string {
  const s = String(urlOrName);
  return s.slice(s.lastIndexOf("/") + 1);
}

/**
 * How much of the uploads volume the village's photographs are using.
 *
 * Every writer into the volume stamps its own prefix (`brand-`, `proposal-`,
 * `place-`), so the split costs one comparison per entry inside a walk the
 * probe already does. It is on `/health` because community uploads are the
 * part of that volume that grows on its own: before this feature the volume
 * only moved when a founder pressed a button, and the whole point of the
 * gauge was that a full volume announces itself as every upload failing at
 * once. Reported, never reclaimed, exactly as the file count is.
 */
export const PHOTO_FILE_PREFIX = "place-";

export function isPhotoFile(filename: string): boolean {
  return filename.startsWith(PHOTO_FILE_PREFIX);
}
