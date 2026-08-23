/**
 * A JPEG that really is geotagged, built in code.
 *
 * ── WHY THIS IS A MODULE AND NOT THREE COPIES IN THREE SUITES ────────────
 *
 * Three suites now prove that this platform strips location data: the
 * place-photo encoder, the place-photo routes, and the one door every upload
 * comes through. Each one began with its own copy of this builder, and a
 * fixture builder that exists three times is one that stops agreeing with
 * itself the first time somebody fixes a byte offset in two of them.
 *
 * ── WHY THE FIXTURE IS BUILT AND NOT COMMITTED ───────────────────────────
 *
 * A binary fixture in the repo is bytes nobody can read at review time, and
 * the reviewer has to take on faith that the file carries what the test says
 * it carries. This is a TIFF/EXIF block anybody can follow: IFD0 holds a
 * camera make and tag 0x8825, the GPS IFD pointer, and behind that pointer
 * are the latitude and longitude as rationals. That is what a phone writes,
 * in miniature.
 *
 * ── AND WHY EVERY SUITE ASSERTS THE FIXTURE FIRST ────────────────────────
 *
 * A fixture that quietly stopped being geotagged would make every "the output
 * carries no GPS" assertion pass while proving nothing at all. So each suite
 * parses the GPS IFD back out of the fixture before it tests anything else,
 * and `exifBlockHasGps` in `./uploads` is the same function the PDF scanner
 * uses, so the proof and the product read the block the same way.
 */

/** The camera name written into IFD0. Searched for in output bytes as a tracer. */
export const FIXTURE_CAMERA = "FieldProbeCam";

/** Somewhere real, and deliberately not any village's actual coordinates. */
export const FIXTURE_LAT = 9.944;
export const FIXTURE_LON = -84.1408;

/**
 * Splice a little-endian TIFF/EXIF block carrying a GPS IFD into a JPEG's
 * APP1 segment. `base` must be a JPEG (it is spliced straight after the SOI).
 */
export function buildGeotaggedJpeg(base: Buffer, lat = FIXTURE_LAT, lon = FIXTURE_LON): Buffer {
  const rat = (n: number, d: number) => {
    const b = Buffer.alloc(8);
    b.writeUInt32LE(n, 0);
    b.writeUInt32LE(d, 4);
    return b;
  };
  const dms = (v: number) => {
    const a = Math.abs(v);
    const deg = Math.floor(a);
    const min = Math.floor((a - deg) * 60);
    const sec = Math.round(((a - deg) * 60 - min) * 6000);
    return Buffer.concat([rat(deg, 1), rat(min, 1), rat(sec, 100)]);
  };
  const make = Buffer.from(`${FIXTURE_CAMERA}\0`, "ascii");
  const latB = dms(lat);
  const lonB = dms(lon);
  const IFD0 = 8;
  const GPS = IFD0 + 30; // 2 entry count + 2 * 12 entries + 4 next-IFD
  const DATA = GPS + 66; // 2 entry count + 5 * 12 entries + 4 next-IFD
  const offMake = DATA;
  const offLat = offMake + make.length;
  const offLon = offLat + latB.length;
  const t = Buffer.alloc(offLon + lonB.length);
  t.write("II", 0, "ascii");
  t.writeUInt16LE(42, 2);
  t.writeUInt32LE(IFD0, 4);
  let p = IFD0;
  t.writeUInt16LE(2, p);
  p += 2;
  const entry = (tag: number, type: number, count: number, value: Buffer | number) => {
    t.writeUInt16LE(tag, p);
    t.writeUInt16LE(type, p + 2);
    t.writeUInt32LE(count, p + 4);
    if (Buffer.isBuffer(value)) value.copy(t, p + 8);
    else t.writeUInt32LE(value, p + 8);
    p += 12;
  };
  entry(0x010f, 2, make.length, offMake); // Make
  entry(0x8825, 4, 1, GPS); // GPSInfoIFDPointer: this tag is what "geotagged" means
  t.writeUInt32LE(0, p);
  p = GPS;
  t.writeUInt16LE(5, p);
  p += 2;
  entry(0x0000, 1, 4, Buffer.from([2, 3, 0, 0])); // GPSVersionID
  entry(0x0001, 2, 2, Buffer.from(`${lat >= 0 ? "N" : "S"}\0`, "ascii"));
  entry(0x0002, 5, 3, offLat);
  entry(0x0003, 2, 2, Buffer.from(`${lon >= 0 ? "E" : "W"}\0`, "ascii"));
  entry(0x0004, 5, 3, offLon);
  t.writeUInt32LE(0, p);
  make.copy(t, offMake);
  latB.copy(t, offLat);
  lonB.copy(t, offLon);

  const payload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), t]);
  const app1 = Buffer.alloc(4);
  app1.writeUInt16BE(0xffe1, 0);
  app1.writeUInt16BE(payload.length + 2, 2);
  return Buffer.concat([base.subarray(0, 2), app1, payload, base.subarray(2)]);
}

/**
 * A minimal PDF carrying `jpeg` verbatim in a DCTDecode stream.
 *
 * This is how EVERY PDF embeds a JPEG: the encoder does not re-compress it,
 * it stores the original file as the stream body and names DCTDecode as the
 * filter. So the photograph's APP1 segment, and the GPS coordinates in it,
 * ride into the document unchanged. That is the whole reason the PDF path
 * needs a scan rather than a shrug.
 */
export function buildPdfEmbedding(jpeg: Buffer): Buffer {
  const head = Buffer.from(
    "%PDF-1.4\n" +
      "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
      "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
      "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 150]/Resources<</XObject<</Im0 4 0 R>>>>>>endobj\n" +
      `4 0 obj<</Type/XObject/Subtype/Image/Width 240/Height 180/ColorSpace/DeviceRGB/BitsPerComponent 8/Filter/DCTDecode/Length ${jpeg.length}>>stream\n`,
    "binary",
  );
  const tail = Buffer.from("\nendstream endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n", "binary");
  return Buffer.concat([head, jpeg, tail]);
}
