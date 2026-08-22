/**
 * THE EXIF PROOF.
 *
 * "sharp usually drops metadata" is a claim about a dependency. This file
 * turns it into a claim about this product, and it does it the only way that
 * means anything: with a picture that genuinely carries GPS coordinates.
 *
 * The fixture is built here, in code, for two reasons. A committed binary
 * fixture would be bytes in the repo that nothing can read at review time, and
 * a fixture that silently stopped carrying GPS would make every assertion
 * below pass while proving nothing. So the first test proves the FIXTURE is
 * geotagged by parsing the GPS IFD back out of it, and every later test is
 * only meaningful because that one passed.
 */
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  stripAndEncode,
  readMetadataMarkers,
  writePhoto,
  LocationDataSurvived,
  isSuppressedUpload,
  suppressUploads,
  unsuppressUploads,
  loadSuppressed,
  resetSuppressedForTests,
  basenameOf,
  isPhotoFile,
} from "./placePhotos";

/** Somewhere real, and deliberately not the village's actual coordinates. */
const LAT = 9.944;
const LON = -84.1408;
const CAMERA = "FixtureProbeCam";

/**
 * A little-endian TIFF/EXIF block with a real GPS IFD, spliced into a JPEG's
 * APP1 segment. This is what a phone writes, in miniature: IFD0 carries the
 * camera make and a pointer at tag 0x8825, and the GPS IFD behind that pointer
 * carries the latitude and longitude as rationals.
 */
function buildGeotaggedJpeg(base: Buffer, lat: number, lon: number): Buffer {
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
  const make = Buffer.from(`${CAMERA}\0`, "ascii");
  const latB = dms(lat);
  const lonB = dms(lon);
  const IFD0 = 8;
  const GPS = IFD0 + 30; // 2 + 2*12 + 4
  const DATA = GPS + 66; // 2 + 5*12 + 4
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
  entry(0x8825, 4, 1, GPS); // GPSInfoIFDPointer
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

/** Read the tag ids out of IFD0 and the GPS IFD an EXIF blob points at. */
function exifTags(blob: Buffer): { ifd0: number[]; gps: number[] } {
  const off = blob.subarray(0, 4).toString("ascii") === "Exif" ? 6 : 0;
  const le = blob.subarray(off, off + 2).toString("ascii") === "II";
  const u16 = (q: number) => (le ? blob.readUInt16LE(q) : blob.readUInt16BE(q));
  const u32 = (q: number) => (le ? blob.readUInt32LE(q) : blob.readUInt32BE(q));
  const out: { ifd0: number[]; gps: number[] } = { ifd0: [], gps: [] };
  let gpsOffset = 0;
  const readIfd = (start: number, sink: number[]) => {
    const n = u16(start);
    for (let i = 0; i < n; i++) {
      const e = start + 2 + i * 12;
      const tag = u16(e);
      sink.push(tag);
      if (tag === 0x8825) gpsOffset = off + u32(e + 8);
    }
  };
  readIfd(off + u32(off + 4), out.ifd0);
  if (gpsOffset) readIfd(gpsOffset, out.gps);
  return out;
}

async function geotaggedFixture(): Promise<Buffer> {
  const plain = await sharp({
    create: { width: 320, height: 240, channels: 3, background: { r: 30, g: 90, b: 60 } },
  })
    .jpeg()
    .toBuffer();
  return buildGeotaggedJpeg(plain, LAT, LON);
}

describe("the fixture really is geotagged", () => {
  it("carries a GPS IFD that sharp can read back out of the file", async () => {
    const geo = await geotaggedFixture();
    const meta = await sharp(geo).metadata();
    expect(meta.exif, "the fixture has no EXIF at all, so every test below proves nothing").toBeTruthy();
    const tags = exifTags(meta.exif as Buffer);
    // 0x8825 is the GPS IFD pointer. Its presence in IFD0 is what makes this a
    // geotagged photograph and not merely a photograph with a camera name.
    expect(tags.ifd0).toContain(0x8825);
    // Latitude ref, latitude, longitude ref, longitude.
    expect(tags.gps).toEqual(expect.arrayContaining([0x0001, 0x0002, 0x0003, 0x0004]));
  });

  it("carries the camera make as readable bytes", async () => {
    const geo = await geotaggedFixture();
    expect(geo.includes(Buffer.from(CAMERA))).toBe(true);
  });
});

describe("stripAndEncode removes the location data", () => {
  it("leaves no metadata markers of any kind", async () => {
    const geo = await geotaggedFixture();
    const out = await stripAndEncode(geo);
    expect(await readMetadataMarkers(out.bytes)).toEqual([]);
  });

  it("leaves no EXIF blob sharp can parse", async () => {
    const geo = await geotaggedFixture();
    const out = await stripAndEncode(geo);
    const meta = await sharp(out.bytes).metadata();
    expect(meta.exif).toBeFalsy();
  });

  it("leaves no trace of the camera or the EXIF container in the raw bytes", async () => {
    const geo = await geotaggedFixture();
    const out = await stripAndEncode(geo);
    // Read the BYTES, never a parser's opinion of them. A chunk a parser has
    // no field for is exactly the case a metadata query would miss.
    expect(out.bytes.includes(Buffer.from(CAMERA))).toBe(false);
    expect(out.bytes.includes(Buffer.from("Exif"))).toBe(false);
    expect(out.bytes.includes(Buffer.from("EXIF"))).toBe(false);
    expect(out.bytes.includes(Buffer.from("http://ns.adobe.com/xap"))).toBe(false);
  });

  it("keeps the picture: a real image comes out the far side", async () => {
    const geo = await geotaggedFixture();
    const out = await stripAndEncode(geo);
    const meta = await sharp(out.bytes).metadata();
    expect(meta.format).toBe("webp");
    expect(out.width).toBe(320);
    expect(out.height).toBe(240);
  });

  it("resizes down to the longest edge and never enlarges", async () => {
    const big = await sharp({ create: { width: 4032, height: 3024, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .jpeg()
      .toBuffer();
    const out = await stripAndEncode(big);
    expect(out.width).toBe(2000);
    const small = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 1, g: 2, b: 3 } } })
      .jpeg()
      .toBuffer();
    const tiny = await stripAndEncode(small);
    expect(tiny.width).toBe(40);
  });
});

describe("writePhoto", () => {
  it("writes a stripped full size and a stripped thumbnail, both on the volume", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "place-photos-"));
    try {
      const geo = await geotaggedFixture();
      const out = await writePhoto(geo, dir, "test1");
      expect(out.filename).toBe("place-test1.webp");
      expect(out.thumbFilename).toBe("place-test1.thumb.webp");
      for (const name of [out.filename, out.thumbFilename!]) {
        const bytes = fs.readFileSync(path.join(dir, name));
        // Read back off DISK, which is the only place the harm could happen.
        expect(await readMetadataMarkers(bytes)).toEqual([]);
        expect(bytes.includes(Buffer.from(CAMERA))).toBe(false);
      }
      const thumb = await sharp(fs.readFileSync(path.join(dir, out.thumbFilename!))).metadata();
      expect(thumb.width).toBe(320);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("refuses a file that is not an image and writes nothing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "place-photos-"));
    try {
      await expect(writePhoto(Buffer.from("this is not a picture"), dir, "test2")).rejects.toThrow();
      expect(fs.readdirSync(dir)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("LocationDataSurvived", () => {
  it("names what survived, so the failure says which door was left open", () => {
    const e = new LocationDataSurvived(["exif", "xmp-packet"]);
    expect(e.message).toContain("exif");
    expect(e.message).toContain("xmp-packet");
    expect(e.message).toContain("was not stored");
  });
});

describe("the suppression set", () => {
  it("refuses a hidden photograph's file by name, and lets it back on restore", () => {
    resetSuppressedForTests();
    expect(isSuppressedUpload("place-a.webp")).toBe(false);
    suppressUploads(["/api/uploads/place-a.webp", "/api/uploads/place-a.thumb.webp"]);
    expect(isSuppressedUpload("place-a.webp")).toBe(true);
    expect(isSuppressedUpload("place-a.thumb.webp")).toBe(true);
    unsuppressUploads(["/api/uploads/place-a.webp", "/api/uploads/place-a.thumb.webp"]);
    expect(isSuppressedUpload("place-a.webp")).toBe(false);
  });

  it("ignores nulls, because a photograph may have no thumbnail", () => {
    resetSuppressedForTests();
    suppressUploads(["/api/uploads/place-b.webp", null]);
    expect(isSuppressedUpload("place-b.webp")).toBe(true);
  });

  it("replaces the whole set on a boot load", () => {
    resetSuppressedForTests();
    suppressUploads(["/api/uploads/place-stale.webp"]);
    loadSuppressed(["place-fresh.webp"]);
    expect(isSuppressedUpload("place-stale.webp")).toBe(false);
    expect(isSuppressedUpload("place-fresh.webp")).toBe(true);
  });
});

describe("volume accounting", () => {
  it("recognises a photograph file by the prefix its writer stamps", () => {
    expect(isPhotoFile("place-123.webp")).toBe(true);
    expect(isPhotoFile("place-123.thumb.webp")).toBe(true);
    expect(isPhotoFile("brand-123.webp")).toBe(false);
    expect(isPhotoFile("proposal-123.pdf")).toBe(false);
  });

  it("reads a filename out of an uploads address", () => {
    expect(basenameOf("/api/uploads/place-1.webp")).toBe("place-1.webp");
    expect(basenameOf("place-1.webp")).toBe("place-1.webp");
  });
});
