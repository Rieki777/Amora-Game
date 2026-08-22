/**
 * Photographs of a place, against the built server (0093).
 *
 * What this suite holds that a unit test cannot:
 *
 *  - THE EXIF PROOF ON THE VOLUME. A genuinely geotagged JPEG goes up through
 *    the real route, and the bytes are then read back off the uploads
 *    directory the server wrote them to. `server/lib/placePhotos.test.ts`
 *    proves the encoder strips; this proves the PRODUCT does, end to end.
 *  - THE SUBJECT'S RIGHT, including the half that a hidden row does not give
 *    you: after a subject request, `/api/uploads/<file>` stops answering. A
 *    row that leaves the gallery while the bytes stay fetchable by anyone
 *    holding the address is exactly what the person was asking to stop.
 *  - A REPORT REACHING A HUMAN. The queue is read by a curator who is NOT an
 *    admin, holding the capability through a badge, and closing a card
 *    notifies the member who raised it.
 *  - The gate: a member without `map.curatePhotos` cannot take down somebody
 *    else's photograph, and can always take down their own.
 *  - The dials: per-place and per-member limits refuse, and 0 means zero.
 *
 * Skips loudly without TEST_DATABASE_URL, like every DB-backed suite here.
 */
import fs from "fs";
import os from "os";
import path from "path";
import mysql from "mysql2/promise";
import sharp from "sharp";
import { spawn, type ChildProcess } from "child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionTestDb, testDbConfigured, type TestDb, E2E_BOOT_DEADLINE_MS } from "./db/testDb";

const DB_CONFIGURED = testDbConfigured();
if (!DB_CONFIGURED) {
  console.warn("[placePhotos.routes] TEST_DATABASE_URL not set — DB-backed tests SKIPPED.");
}

const DIST = path.resolve(process.cwd(), "dist/index.js");
// Its own port range: 11900-12299, clear of every other suite's band.
const PORT = 11900 + (process.pid % 400);
const BASE = `http://localhost:${PORT}`;
const ADMIN = "places-admin";
const PLACE = "community-kitchen";
const CAMERA = "FieldProbeCam";

let child: ChildProcess | undefined;
let testDb: TestDb | undefined;
let dataDir = "";
let pool: mysql.Pool;
let founderToken = "";

let solToken = "";
let solId = "";
let wrenToken = "";
let wrenId = "";
let talToken = "";
let talId = "";

async function call(method: string, route: string, body?: unknown, token = founderToken) {
  const res = await fetch(BASE + route, { // module-review-ok: the test client dialling the built server on localhost, as every e2e suite does
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON stays visible through text */
  }
  return { status: res.status, json, text };
}

/** The bytes of an uploads address, and the status the route answered. */
async function fetchUpload(address: string, token = ""): Promise<{ status: number; bytes: Buffer }> {
  const res = await fetch(BASE + address, { // module-review-ok: the test client dialling the built server on localhost
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const buf = Buffer.from(await res.arrayBuffer());
  return { status: res.status, bytes: buf };
}

/**
 * A JPEG with a real GPS IFD, built here so the fixture can be READ at review
 * time and so a fixture that stopped being geotagged could not make these
 * tests pass vacuously. The same builder as server/lib/placePhotos.test.ts,
 * which proves the fixture carries what it claims to.
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
  const GPS = IFD0 + 30;
  const DATA = GPS + 66;
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
  entry(0x010f, 2, make.length, offMake);
  entry(0x8825, 4, 1, GPS);
  t.writeUInt32LE(0, p);
  p = GPS;
  t.writeUInt16LE(5, p);
  p += 2;
  entry(0x0000, 1, 4, Buffer.from([2, 3, 0, 0]));
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

async function geotagged(tint: number): Promise<Buffer> {
  const plain = await sharp({
    create: { width: 240, height: 180, channels: 3, background: { r: tint, g: 90, b: 60 } },
  })
    .jpeg()
    .toBuffer();
  return buildGeotaggedJpeg(plain, 9.944, -84.1408);
}

async function upload(
  token: string,
  bytes: Buffer,
  fields: { altText: string; caption?: string; takenOn?: string },
  place = PLACE,
) {
  const form = new FormData();
  form.append("photo", new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }), "wall.jpg");
  form.append("altText", fields.altText);
  if (fields.caption) form.append("caption", fields.caption);
  if (fields.takenOn) form.append("takenOn", fields.takenOn);
  const res = await fetch(`${BASE}/api/places/${encodeURIComponent(place)}/photos`, { // module-review-ok: the test client dialling the built server on localhost
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON stays visible through text */
  }
  return { status: res.status, json, text };
}

async function register(name: string, slug: string): Promise<{ token: string; id: string }> {
  const r = await call(
    "POST",
    "/api/auth/register",
    { name, email: `${slug}-${PORT}@example.test`, password: "PlacesTest123!", paths: ["resident"] },
    "",
  );
  expect(r.status, `${name} must register`).toBe(200);
  return { token: String(r.json?.token ?? ""), id: String(r.json?.user?.id ?? "") };
}

beforeAll(async () => {
  if (!DB_CONFIGURED) return;
  if (!fs.existsSync(DIST)) {
    throw new Error(`${DIST} is missing. Run \`pnpm build\` before the place photo route test.`);
  }
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "village-places-"));
  testDb = await provisionTestDb();
  pool = mysql.createPool({ uri: testDb.url, timezone: "Z", connectionLimit: 4 }); // module-review-ok: the suite's own pool onto the scratch schema it provisioned

  child = spawn(process.execPath, [DIST], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      DATA_DIR: dataDir,
      DATABASE_URL: testDb.url,
      ADMIN_PASSWORD: ADMIN,
      AUTH_TOKEN_SECRET: "places-token-secret", // module-review-ok: a fixture signing secret for a throwaway server on a scratch schema, same as every e2e suite
      RESEND_API_KEY: "",
      ANTHROPIC_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs: string[] = [];
  child.stdout?.on("data", (d) => logs.push(String(d)));
  child.stderr?.on("data", (d) => logs.push(String(d)));

  const deadline = Date.now() + E2E_BOOT_DEADLINE_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`server did not start in ${E2E_BOOT_DEADLINE_MS / 1000}s:\n${logs.join("")}`);
    try {
      if ((await fetch(`${BASE}/health`)).ok) break; // module-review-ok: the boot poll against the local test server
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const boot = await call("POST", "/api/admin/bootstrap", {
    password: ADMIN, email: `founder-${PORT}@example.test`, name: "Places Founder",
  }, "");
  const claim = decodeURIComponent(String(boot.json?.claimUrl ?? "").match(/token=([^&]+)/)?.[1] ?? "");
  const setPw = await call("POST", "/api/auth/set-password", { token: claim, password: "PlacesTest123!" }, "");
  founderToken = String(setPw.json?.token ?? "");
  expect(founderToken, "founder must hold a session").toBeTruthy();

  // The map and badges modules both on: the map serves the routes, badges is
  // how a member who is not an admin comes to hold `map.curatePhotos`.
  for (const m of (await call("GET", "/api/admin/modules")).json?.modules ?? []) {
    if (m.core) continue;
    await call("PUT", `/api/admin/modules/${m.id}/lifecycle`, { lifecycle: "public" });
  }

  const sol = await register("Sol Vega", "sol");
  solToken = sol.token;
  solId = sol.id;
  const wren = await register("Wren Ash", "wren");
  wrenToken = wren.token;
  wrenId = wren.id;
  const tal = await register("Tal Ferro", "tal");
  talToken = tal.token;
  talId = tal.id;

  for (const id of [solId, wrenId, talId]) {
    expect((await call("PUT", `/api/admin/players/${id}/stage`, { stageId: "member" })).status).toBe(200);
  }

  // Tal curates, and holds NOTHING else: a granted badge, no admin role, no
  // password. This is the R54 claim under test.
  const badge = (await call("POST", "/api/admin/badges", {
    name: "Keeper of the Record", kind: "granted", capabilities: ["map.curatePhotos"],
  })).json?.badge;
  expect(badge?.id, "the curator badge must exist").toBeTruthy();
  expect((await call("POST", `/api/admin/badges/${badge.id}/award`, { userId: talId, note: "Keeps the village's pictures" })).status).toBe(200);
});

afterAll(async () => {
  child?.kill();
  await pool?.end();
  await testDb?.drop();
  try {
    fs.rmSync(dataDir, { recursive: true, force: true });
  } catch {
    /* gone */
  }
});

describe.skipIf(!DB_CONFIGURED)("photographs of a place", () => {
  let solPhotoId = "";
  let solPhotoUrl = "";
  let solThumbUrl = "";
  let wrenPhotoId = "";

  it("takes a member's photograph and gives it back with attribution", async () => {
    const up = await upload(solToken, await geotagged(200), {
      altText: "The north wall of the community kitchen, half built",
      caption: "First course of block up.",
      takenOn: "2026-03-14",
    });
    expect(up.status, up.text).toBe(200);
    solPhotoId = String(up.json?.photo?.id ?? "");
    solPhotoUrl = String(up.json?.photo?.url ?? "");
    solThumbUrl = String(up.json?.photo?.thumbUrl ?? "");
    expect(solPhotoId).toBeTruthy();
    expect(solPhotoUrl.startsWith("/api/uploads/")).toBe(true);
    expect(up.json.photo.contributorName).toBe("Sol Vega");
    expect(up.json.photo.takenOn).toBe("2026-03-14");
    expect(up.json.photo.altText).toBe("The north wall of the community kitchen, half built");
  });

  it("STRIPS THE LOCATION DATA: the bytes on the volume carry no GPS", async () => {
    const uploads = path.join(dataDir, "uploads");
    const names = [solPhotoUrl, solThumbUrl].map((u) => path.basename(u));
    expect(names.length).toBe(2);
    for (const name of names) {
      const file = path.join(uploads, name);
      expect(fs.existsSync(file), `${name} must be on the volume`).toBe(true);
      const bytes = fs.readFileSync(file);
      // The parser's opinion...
      const meta = await sharp(bytes).metadata();
      expect(meta.exif, `${name} still carries an EXIF blob`).toBeFalsy();
      // ...and the bytes themselves, which is where a chunk no parser knows
      // about would still be sitting.
      expect(bytes.includes(Buffer.from(CAMERA)), `${name} still names the camera`).toBe(false);
      expect(bytes.includes(Buffer.from("Exif")), `${name} still carries an EXIF container`).toBe(false);
      expect(bytes.includes(Buffer.from("GPS")), `${name} still carries a GPS marker`).toBe(false);
    }
  });

  it("serves the photograph over the uploads route", async () => {
    const got = await fetchUpload(solPhotoUrl);
    expect(got.status).toBe(200);
    expect((await sharp(got.bytes).metadata()).format).toBe("webp");
  });

  it("takes a second member's photograph of the same place, newest first", async () => {
    const up = await upload(wrenToken, await geotagged(40), { altText: "The same wall with the roof trusses up" });
    expect(up.status, up.text).toBe(200);
    wrenPhotoId = String(up.json?.photo?.id ?? "");
    const gallery = await call("GET", `/api/places/${PLACE}/photos`, undefined, solToken);
    expect(gallery.json.photos.map((p: any) => p.id)).toEqual([wrenPhotoId, solPhotoId]);
    expect(gallery.json.photos[1].contributorName).toBe("Sol Vega");
  });

  it("leads with the hero once a curator pins one, and a curator is not an admin", async () => {
    const pinned = await call("PUT", `/api/places/${PLACE}/hero`, { photoId: solPhotoId }, talToken);
    expect(pinned.status, pinned.text).toBe(200);
    const gallery = await call("GET", `/api/places/${PLACE}/photos`, undefined, solToken);
    expect(gallery.json.photos.map((p: any) => p.id)).toEqual([solPhotoId, wrenPhotoId]);
    // The shelf leads with the same picture the place does.
    const shelf = await call("GET", "/api/places", undefined, solToken);
    const place = shelf.json.places.find((p: any) => p.structureKey === PLACE);
    expect(place.coverUrl).toBe(solPhotoUrl);
    expect(place.photoCount).toBe(2);
  });

  it("refuses a photograph with no description of what is in it", async () => {
    const up = await upload(solToken, await geotagged(90), { altText: "  " });
    expect(up.status).toBe(400);
    expect(up.json.error).toContain("Describe the photograph");
  });

  it("refuses a member who does not hold the capability from taking down another's photograph", async () => {
    const refused = await call("DELETE", `/api/places/photo/${wrenPhotoId}`, undefined, solToken);
    expect(refused.status).toBe(403);
    const hide = await call("POST", `/api/places/photo/${wrenPhotoId}/hide`, {}, solToken);
    expect(hide.status).toBe(403);
  });

  it("carries a report to a queue a curator who is not an admin can read", async () => {
    const filed = await call("POST", `/api/places/photo/${solPhotoId}/report`, { reason: "That is my neighbour's gate in the corner." }, wrenToken);
    expect(filed.status, filed.text).toBe(200);
    expect(filed.json.fresh).toBe(true);

    // A member with no curate capability gets nothing from the queue.
    expect((await call("GET", "/api/places/reports", undefined, solToken)).status).toBe(403);

    const queue = await call("GET", "/api/places/reports?status=open", undefined, talToken);
    expect(queue.status, queue.text).toBe(200);
    const card = queue.json.reports.find((r: any) => r.photoId === solPhotoId);
    expect(card, "the report must be on the curator's queue").toBeTruthy();
    expect(card.kind).toBe("concern");
    expect(card.reporter).toBe("Wren Ash");
    expect(card.reason).toContain("neighbour's gate");
    // The card carries the picture, so the row is a decision and not an id.
    expect(card.photoUrl).toBe(solPhotoUrl);
    expect(card.photoAltText).toContain("north wall");
  });

  it("tells the member who reported that somebody looked", async () => {
    const queue = await call("GET", "/api/places/reports?status=open", undefined, talToken);
    const card = queue.json.reports.find((r: any) => r.photoId === solPhotoId);
    const closed = await call("PUT", `/api/places/reports/${card.id}`, { status: "resolved" }, talToken);
    expect(closed.status, closed.text).toBe(200);
    const bell = await call("GET", "/api/notifications", undefined, wrenToken);
    expect(bell.json.notifications.some((n: any) => n.type === "moderation" && n.link === "/places")).toBe(true);
    const handled = await call("GET", "/api/places/reports?status=resolved", undefined, talToken);
    expect(handled.json.reports.find((r: any) => r.id === card.id).resolvedBy).toBe("Tal Ferro");
  });

  it("hides a photograph the moment its subject asks, AND stops serving the bytes", async () => {
    const asked = await call("POST", `/api/places/photo/${solPhotoId}/subject-request`, { reason: "That is me on the ladder." }, wrenToken);
    expect(asked.status, asked.text).toBe(200);
    expect(asked.json.hidden).toBe(true);

    // Gone from the gallery for everyone who is not a curator.
    const gallery = await call("GET", `/api/places/${PLACE}/photos`, undefined, solToken);
    expect(gallery.json.photos.map((p: any) => p.id)).toEqual([wrenPhotoId]);

    // AND gone from the address. A hidden row whose file still answers is the
    // whole of what the person was asking to stop.
    expect((await fetchUpload(solPhotoUrl)).status).toBe(404);
    expect((await fetchUpload(solThumbUrl)).status).toBe(404);

    // The curator still sees it, because deciding means looking at it.
    const curatorView = await call("GET", `/api/places/${PLACE}/photos`, undefined, talToken);
    const hidden = curatorView.json.photos.find((p: any) => p.id === solPhotoId);
    expect(hidden.hiddenBy).toBe("subject");
  });

  it("shows the hidden bytes to a curator and to nobody else", async () => {
    // The one exception to the suppression, and the reason it exists: a report
    // card that cannot show the photograph is a card nobody can decide.
    const curator = await fetchUpload(solPhotoUrl, talToken);
    expect(curator.status, "a curator must be able to look at what they are judging").toBe(200);
    expect((await sharp(curator.bytes).metadata()).format).toBe("webp");
    // A member who is signed in but holds no curate capability gets the same
    // 404 a stranger gets. Signing in is not a way around a takedown.
    expect((await fetchUpload(solPhotoUrl, wrenToken)).status).toBe(404);
    expect((await fetchUpload(solPhotoUrl, solToken)).status).toBe(404);
  });

  it("carries the subject's request to the same queue, marked as what it is", async () => {
    const queue = await call("GET", "/api/places/reports?status=open", undefined, talToken);
    const card = queue.json.reports.find((r: any) => r.photoId === solPhotoId && r.kind === "subject");
    expect(card, "a subject request must reach the queue").toBeTruthy();
    expect(card.photoHidden).toBe(true);
  });

  it("lets a curator put it back, and the bytes answer again", async () => {
    expect((await call("POST", `/api/places/photo/${solPhotoId}/restore`, {}, talToken)).status).toBe(200);
    expect((await fetchUpload(solPhotoUrl)).status).toBe(200);
    // A restore does not un-file the request: the card stays for the curator
    // to close deliberately.
    const queue = await call("GET", "/api/places/reports?status=open", undefined, talToken);
    expect(queue.json.reports.some((r: any) => r.photoId === solPhotoId && r.kind === "subject")).toBe(true);
  });

  it("lets the person who took a photograph take it down, and the file goes with it", async () => {
    const uploads = path.join(dataDir, "uploads");
    const name = path.basename(solPhotoUrl);
    expect(fs.existsSync(path.join(uploads, name))).toBe(true);
    const gone = await call("DELETE", `/api/places/photo/${solPhotoId}`, undefined, solToken);
    expect(gone.status, gone.text).toBe(200);
    expect(gone.json.removed).toBe(true);
    expect(fs.existsSync(path.join(uploads, name)), "the file must leave the volume").toBe(false);
    expect((await fetchUpload(solPhotoUrl)).status).toBe(404);
    // A takedown answers every open report on the picture.
    const queue = await call("GET", "/api/places/reports?status=open", undefined, talToken);
    expect(queue.json.reports.some((r: any) => r.photoId === solPhotoId)).toBe(false);
  });

  it("keeps the record of the takedown so a closed report still names something", async () => {
    const handled = await call("GET", "/api/places/reports?status=resolved", undefined, talToken);
    const card = handled.json.reports.find((r: any) => r.photoId === solPhotoId && r.kind === "subject");
    expect(card, "the subject's request survives the takedown as a record").toBeTruthy();
    expect(card.photoRemoved).toBe(true);
    expect(card.photoUrl).toBeNull();
  });

  it("counts a place against the village's per-place dial, and 0 means zero", async () => {
    expect((await call("PUT", "/api/admin/variables/map.photos_per_place", { value: "1" })).status).toBe(200);
    const refused = await upload(wrenToken, await geotagged(10), { altText: "One more of the same wall" });
    expect(refused.status).toBe(409);
    expect(refused.json.error).toContain("the village's limit is 1");

    expect((await call("PUT", "/api/admin/variables/map.photos_per_place", { value: "0" })).status).toBe(200);
    const closed = await upload(wrenToken, await geotagged(11), { altText: "Anything at all" }, "another-place");
    expect(closed.status, "0 means zero, never unlimited").toBe(409);
    expect((await call("PUT", "/api/admin/variables/map.photos_per_place", { value: "60" })).status).toBe(200);
  });

  it("counts a member against the village's daily dial", async () => {
    expect((await call("PUT", "/api/admin/variables/map.photos_per_member_daily", { value: "0" })).status).toBe(200);
    const refused = await upload(wrenToken, await geotagged(12), { altText: "Anything at all" });
    expect(refused.status).toBe(429);
    expect((await call("PUT", "/api/admin/variables/map.photos_per_member_daily", { value: "12" })).status).toBe(200);
  });

  it("reports what the photographs are using on the volume", async () => {
    const health = await fetch(`${BASE}/health`); // module-review-ok: the test client dialling the built server on localhost
    const body: any = await health.json();
    expect(body.uploads).toBeTruthy();
    expect(typeof body.uploads.photoFiles).toBe("number");
    expect(body.uploads.photoFiles).toBeGreaterThan(0);
    expect(body.uploads.photoFiles).toBeLessThanOrEqual(body.uploads.files);
  });

  it("refuses a signed-out visitor everything that writes", async () => {
    expect((await call("POST", `/api/places/photo/${wrenPhotoId}/report`, {}, "")).status).toBe(401);
    expect((await call("POST", `/api/places/photo/${wrenPhotoId}/subject-request`, {}, "")).status).toBe(401);
    expect((await call("GET", "/api/places/reports", undefined, "")).status).toBe(401);
    const up = await upload("", await geotagged(13), { altText: "Anything at all" });
    expect(up.status).toBe(401);
  });
});
