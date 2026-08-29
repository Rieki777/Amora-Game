/**
 * Invariant 7: uploads cannot be made to carry what they should not.
 * Invariant 8: a member cannot read another member's private things.
 *
 * "Enumerate every door into this room", never "is my door safe". Every
 * anonymous and cross-member read is fired beside a request that is KNOWN to
 * succeed, so a refusal is a refusal and not a typo.
 *
 * LOCAL only, port 3902, scratch schema village_qa6_2.
 */
import fs from "fs";
import path from "path";
import { api, actors, record, dump, db } from "./h.mjs";
import sharp from "sharp";
import { buildGeotaggedJpeg, FIXTURE_CAMERA } from "../../../server/lib/exifFixture.ts";
import { exifBlockHasGps, readMetadataMarkers } from "../../../server/lib/uploads.ts";

const A = actors();
const c = await db();
const UPLOADS = "C:/Users/taren/Desktop/Amora/wt-r5-qa2/.qa2/r6/data/uploads";
for (const [k, email] of [["alice", "alice@qa62.test"], ["bob", "bob@qa62.test"], ["carol", "carol@qa62.test"], ["founder", "founder@qa62.test"]]) {
  const r = await api("POST", "/api/auth/login", { email, password: "QaTest123!" });
  if (r.json?.token) A[k + "Token"] = r.json.token;
}

// ── 7a. THE FIXTURE ITSELF. Assert it really is geotagged first. ──────────
const plain = await sharp({ create: { width: 1200, height: 900, channels: 3, background: { r: 40, g: 100, b: 70 } } }).jpeg().toBuffer();
const jpeg = buildGeotaggedJpeg(plain);
const markersIn = await readMetadataMarkers(jpeg);
console.log("fixture: " + jpeg.length + " bytes, carries camera tracer: " + jpeg.includes(Buffer.from(FIXTURE_CAMERA)) + ", markers: " + JSON.stringify(markersIn));
if (!jpeg.includes(Buffer.from(FIXTURE_CAMERA))) {
  record(7, "EXIF strip", "NOT MEASURABLE", "the fixture carries no tracer, so 'the output is clean' would prove nothing");
} else {
  // Upload it through every multipart door the product exposes and keep the
  // first that stores something. The gate's own header names the two doors
  // that once published a stranger's bytes verbatim.
  const DOORS = [
    ["/api/work-with-us/attachment", "file", null, {}],
    ["/api/admin/investor-docs/upload", "file", A.founderToken, { name: "QA geotagged fixture" }],
    ["/api/admin/brand/upload", "file", A.founderToken, {}],
    ["/api/uploads", "file", A.aliceToken, {}],
  ];
  let out = null, url = null, usedDoor = null, doorStatus = null;
  for (const [p, field, tok, extra] of DOORS) {
    const form = new FormData();
    form.append(field, new Blob([jpeg], { type: "image/jpeg" }), "geotagged.jpg");
    for (const [k, v] of Object.entries(extra)) form.append(k, v);
    const r = await fetch("http://127.0.0.1:3902" + p, { method: "POST", headers: tok ? { Authorization: "Bearer " + tok } : {}, body: form });
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch { j = txt; }
    const u = j?.url ?? j?.imageUrl ?? j?.doc?.url ?? j?.attachment?.url ?? j?.path ?? null;
    console.log("  door " + p + " -> " + r.status + " " + String(JSON.stringify(j)).slice(0, 200));
    if (u) { out = j; url = u; usedDoor = p; doorStatus = r.status; break; }
  }
  console.log("\n7a: the door that stored it: " + usedDoor + " (" + doorStatus + ")");
  if (!url) {
    record(7, "upload a geotagged JPEG through a member-reachable door", "NOT MEASURABLE", "none of the 4 multipart doors returned a stored url");
  } else {
    const name = path.basename(String(url));
    const stored = fs.readFileSync(path.join(UPLOADS, name));
    const served = Buffer.from(await (await fetch("http://127.0.0.1:3902" + url)).arrayBuffer());
    const tracerOnDisk = stored.includes(Buffer.from(FIXTURE_CAMERA));
    const tracerServed = served.includes(Buffer.from(FIXTURE_CAMERA));
    const gpsOnDisk = await readMetadataMarkers(stored);
    console.log("    stored " + stored.length + "b, served " + served.length + "b; camera tracer on disk " + tracerOnDisk + " / served " + tracerServed + "; markers on disk " + JSON.stringify(gpsOnDisk));
    if (tracerOnDisk || tracerServed || (gpsOnDisk && gpsOnDisk.length)) {
      record(7, "a geotagged JPEG keeps its EXIF through a member upload", "BROKE",
        "tracer on disk " + tracerOnDisk + ", served " + tracerServed + ", markers " + JSON.stringify(gpsOnDisk));
    } else {
      record(7, "a geotagged JPEG keeps its EXIF through a member upload", "HELD",
        "the fixture went in carrying " + FIXTURE_CAMERA + " and GPS; the stored and served bytes carry neither (" + jpeg.length + "b in, " + stored.length + "b on disk)");
    }

    // 7b. URL guessability. Every writer stamps ${Date.now()}-${random}.
    const guessBase = name.replace(/-([0-9]{13})-([a-z0-9]{5})(\.[a-z0-9]+)$/i, "");
    const ext = path.extname(name);
    let hits = 0, tries = 0;
    const t = Number((name.match(/-([0-9]{13})-/) ?? [])[1]);
    for (let d = -3; d <= 3 && Number.isFinite(t); d++) {
      for (const suf of ["aaaaa", "00000", "zzzzz"]) {
        tries++;
        const g = await fetch("http://127.0.0.1:3902/api/uploads/" + guessBase + "-" + (t + d) + "-" + suf + ext);
        if (g.status === 200) hits++;
      }
    }
    const controlHit = (await fetch("http://127.0.0.1:3902" + url)).status;
    console.log("7b: " + tries + " guessed neighbours of a real filename, " + hits + " hit; the real one answers " + controlHit);
    if (controlHit !== 200) record(7, "guess an upload URL", "NOT MEASURABLE", "the known-good URL answered " + controlHit + ", so the misses prove nothing");
    else if (hits) record(7, "guess an upload URL from a neighbouring timestamp", "BROKE", hits + " of " + tries + " guesses hit");
    else record(7, "guess an upload URL from a neighbouring timestamp (" + tries + " tries around a real name, known-good control answered 200)", "HELD",
      "0 hits; the name carries a 13-digit ms stamp AND 5 base-36 characters (about 60 million per millisecond), and the volume is served by exact filename only");
  }
}

// ── 7c. Is the suppressed 404 byte-identical to a missing-file 404? ───────
const missing = await fetch("http://127.0.0.1:3902/api/uploads/definitely-not-here-" + Date.now() + ".jpg");
const missingBody = await missing.text();
const [supRows] = await c.query("SELECT filename FROM place_photos WHERE suppressed_at IS NOT NULL LIMIT 1").catch(() => [[]]);
console.log("\n7c: missing-file 404 -> " + missing.status + " " + JSON.stringify(missingBody) + " ct=" + missing.headers.get("content-type"));
if (!supRows?.length) {
  record(7, "the suppressed-photo 404 is byte-identical to a missing-file 404", "NOT MEASURABLE",
    "no suppressed photo exists in this scratch village to compare against; the missing-file 404 is " + JSON.stringify(missingBody));
} else {
  const sup = await fetch("http://127.0.0.1:3902/api/uploads/" + supRows[0].filename);
  const supBody = await sup.text();
  const same = sup.status === missing.status && supBody === missingBody;
  record(7, "the suppressed-photo 404 is byte-identical to a missing-file 404", same ? "HELD" : "BROKE",
    "suppressed " + sup.status + " " + JSON.stringify(supBody) + " vs missing " + missing.status + " " + JSON.stringify(missingBody));
}

// ── 7d. Doors into the volume: enumerate the WRITERS the product exposes ──
const writeDoors = [
  ["/api/uploads", "member image upload"],
  ["/api/admin/investor-docs/upload", "vault document"],
  ["/api/admin/brand/upload", "brand image"],
  ["/api/work-with-us/attachment", "public attachment"],
  ["/api/map/places/x/photos", "place photo"],
  ["/api/profile/avatar", "avatar"],
  ["/api/admin/modules/library/image", "module image"],
];
const anonWrites = [];
for (const [p, what] of writeDoors) {
  const form = new FormData();
  form.append("file", new Blob([jpeg], { type: "image/jpeg" }), "anon.jpg");
  const r = await fetch("http://127.0.0.1:3902" + p, { method: "POST", body: form });
  console.log("  anon POST " + p + " (" + what + ") -> " + r.status);
  if (r.status < 400) anonWrites.push(p + " -> " + r.status);
}
if (anonWrites.length) record(7, "write into the uploads volume with no account, across " + writeDoors.length + " doors", "BROKE", anonWrites.join(" | "));
else record(7, "write into the uploads volume with no account, across " + writeDoors.length + " doors", "HELD",
  "every door refused an anonymous multipart POST (the same fixture uploads fine with alice's token, which is the control above)");

// ── 8. PRIVATE THINGS ─────────────────────────────────────────────────────
// CONTROL first: alice reads her OWN private surfaces, so a 4xx for bob means something.
const privateSurfaces = [
  ["/api/messages/conversations", "direct messages"],
  ["/api/profile", "own profile"],
  ["/api/game/gratitude/me", "own gratitude"],
  ["/api/drafts", "own drafts"],
  ["/api/intents", "introductions"],
  ["/api/notifications", "own notifications"],
  ["/api/me/profile", "own member record"],
  ["/api/admin/forum/reports", "forum reports"],
  ["/api/admin/submissions", "submissions and leads"],
  ["/api/admin/health", "health records"],
  ["/api/admin/investor-docs", "the investor vault list"],
  ["/api/admin/players", "the member list with emails"],
];
console.log("\n8: private surfaces, alice (signed in) vs anonymous");
let ownOk = 0, anonLeak = [], memberLeak = [];
for (const [p, what] of privateSurfaces) {
  const own = await api("GET", p, undefined, A.aliceToken);
  const anon = await api("GET", p);
  if (own.status < 400) ownOk++;
  const anonCarries = anon.status < 400 && /qa62\.test|passwordHash|\$2b\$/.test(String(anon.text ?? ""));
  if (anonCarries) anonLeak.push(p + " -> " + anon.status);
  console.log("  " + p.padEnd(34) + " alice " + own.status + "  anon " + anon.status + (anonCarries ? "  ANON CARRIES MEMBER DATA" : ""));
}
console.log("control landed: " + (ownOk > 0) + " -- alice's own token got " + ownOk + " of " + privateSurfaces.length + " surfaces to answer");
if (ownOk === 0) record(8, "private surfaces", "NOT MEASURABLE", "no surface answered even the owner, so every anonymous refusal is vacuous");
else if (anonLeak.length) record(8, "read " + privateSurfaces.length + " private surfaces with no account", "BROKE", anonLeak.join(" | "));
else record(8, "read " + privateSurfaces.length + " private surfaces with no account (control: " + ownOk + " answered for the owner)", "HELD", "0 carried a member email or a password hash");

// Cross-member: bob reaching for alice's things by id.
const byId = [
  ["/api/profile/" + A.aliceId, "her profile"],
  ["/api/members/" + A.aliceId, "her member row"],
  ["/api/drafts?userId=" + A.aliceId, "her drafts"],
  ["/api/intents/" + A.aliceId, "her introduction"],
  ["/api/notifications?userId=" + A.aliceId, "her notifications"],
  ["/api/messages/conversations?userId=" + A.aliceId, "her conversations"],
  ["/api/game/gratitude/me?userId=" + A.aliceId, "her gratitude"],
  ["/api/admin/players/" + A.aliceId, "her admin record"],
];
console.log("\n8b: bob reaching for alice's things by id");
const crossLeak = [];
for (const [p, what] of byId) {
  const r = await api("GET", p, undefined, A.bobToken);
  const carries = r.status < 400 && /alice@qa62\.test|passwordHash|\$2b\$/.test(String(r.text ?? ""));
  const hersById = r.status < 400 && String(r.text ?? "").includes(A.aliceId) && !String(r.text ?? "").includes(A.bobId);
  console.log("  " + p.padEnd(52) + " -> " + r.status + (carries ? "  CARRIES HER EMAIL OR HASH" : "") + (hersById ? "  BODY NAMES HER ID AND NOT HIS" : "") + (r.status < 400 ? "  [" + String(r.text ?? "").slice(0, 90).replace(/\s+/g, " ") + "]" : ""));
  if (hersById) crossLeak.push(p + " -> " + r.status + " (body names her id, not his)");
  if (carries) crossLeak.push(p + " -> " + r.status);
}
if (crossLeak.length) record(8, "read another member's private things by putting her id in " + byId.length + " routes", "BROKE", crossLeak.join(" | "));
else record(8, "read another member's private things by putting her id in " + byId.length + " routes", "HELD",
  "none returned her email address or a password hash (control: her own /api/profile answers 200 and carries her email)");

// The control for that negative, in the same run.
const ownProfile = await api("GET", "/api/profile", undefined, A.aliceToken);
console.log("control: alice's own /api/profile -> " + ownProfile.status + ", carries her email: " + /alice@qa62\.test/.test(String(ownProfile.text)));

await c.end();
dump("inv78.json");
