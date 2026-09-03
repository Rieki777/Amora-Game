/**
 * The identity-pack door, exercised over real HTTP against a real volume.
 *
 * WHY THIS BOOTS A SERVER AND land.test.ts DOES NOT. What is worth testing
 * here is mostly multer's doing: the fileFilter runs inside the middleware, the
 * buffer only exists after it has parsed a multipart body, and the sniff that
 * decides which of the two paths a file takes reads that buffer. A fake `req`
 * with a hand-built `file` on it would test a handler that never sees a real
 * upload, which is the shape of test that passes while the door refuses
 * everything.
 *
 * So: the real `register()`, a real Express, a real multipart POST, and a real
 * temp directory that gets read back off disk. The port is bound at 0 and read
 * back, so this file allocates no window and can never collide with an e2e
 * suite (see scripts/check-e2e-ports.mjs, which asks for exactly this).
 *
 * THE ASSERTION THAT MATTERS MOST is that a refusal is TELLABLE from an
 * outage. The picture path answers 503 when sharp is missing. If a refused
 * file came back looking like that, a founder would go and check a dependency
 * over a file this door simply does not store. Every refusal case below
 * asserts the status AND that the volume gained nothing, so a check that did
 * not run cannot read as a check that passed.
 */
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import express from "express";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ACCEPTED_UPLOAD_TYPES, documentExtFor, isUtf8Text, register, safeOriginalName } from "./brandUploads";

let uploadsDir = "";
let server: http.Server;
let base = "";
let adminAnswer = true;

beforeAll(async () => {
  uploadsDir = fs.mkdtempSync(path.join(os.tmpdir(), "brand-uploads-"));
  const app = express();
  register(app, { isAdmin: async () => adminAnswer, uploadsDir });
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("the test server did not report a port");
  base = `http://127.0.0.1:${addr.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  fs.rmSync(uploadsDir, { recursive: true, force: true });
});

beforeEach(() => {
  adminAnswer = true;
});

const volume = () => fs.readdirSync(uploadsDir);

async function post(
  bytes: Buffer | string,
  filename: string,
  type: string,
): Promise<{ status: number; body: any }> {
  const form = new FormData();
  form.append("file", new Blob([typeof bytes === "string" ? Buffer.from(bytes, "utf8") : bytes], { type }), filename);
  const res = await fetch(`${base}/api/admin/brand/image`, { method: "POST", body: form });
  return { status: res.status, body: await res.json().catch(() => undefined) };
}

const jpeg = async (w = 900, h = 600): Promise<Buffer> => {
  const sharp = (await import("sharp")).default;
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 40, g: 90, b: 80 } } })
    .jpeg()
    .toBuffer();
};

const STYLE_GUIDE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Amora style guide</title></head>
<body><h1>Palette</h1><p>Deep teal #0f766e, warm sand #e7dccb.</p></body></html>
`;

/** A one-page PDF, hand-built, because sharp does not write one. */
const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n%%EOF\n",
  "latin1",
);

describe("the pure readings the door makes", () => {
  it("names a document from its extension, its mime type, or neither", () => {
    expect(documentExtFor("guide.html", "text/html")).toBe(".html");
    // The extension is the first reading, so a browser sending nothing useful
    // for a .md file (which is every browser on Windows) still lands right.
    expect(documentExtFor("notes.md", "application/octet-stream")).toBe(".md");
    expect(documentExtFor("notes.markdown", "")).toBe(".md");
    expect(documentExtFor("guide.htm", "")).toBe(".html");
    // No extension worth reading: fall through to the mime type.
    expect(documentExtFor("guide", "text/css")).toBe(".css");
    // Neither says anything we store.
    expect(documentExtFor("payload.exe", "application/x-msdownload")).toBeNull();
    expect(documentExtFor("", "")).toBeNull();
  });

  it("tells UTF-8 text from bytes wearing a text file's name", () => {
    // CONTROL: the thing that must pass, in the same block as the things that
    // must fail, so a check that answers false to everything is visible.
    expect(isUtf8Text(Buffer.from(STYLE_GUIDE, "utf8"))).toBe(true);
    expect(isUtf8Text(Buffer.from("colour: teal;\n", "utf8"))).toBe(true);
    expect(isUtf8Text(Buffer.from("héllo wörld", "utf8"))).toBe(true);

    expect(isUtf8Text(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x41])), "a zip carries NULs").toBe(false);
    expect(isUtf8Text(Buffer.from([0xff, 0xfe, 0x41, 0x00])), "UTF-16 carries NULs").toBe(false);
    expect(isUtf8Text(Buffer.from([0xc3, 0x28])), "not valid UTF-8").toBe(false);
    expect(isUtf8Text(Buffer.alloc(0)), "an empty file is not a style guide").toBe(false);
  });

  it("keeps the uploader's filename readable and harmless", () => {
    expect(safeOriginalName("style-guide.html")).toBe("style-guide.html");
    // A run of separators collapses to ONE space, so the segments stay legible.
    expect(safeOriginalName("../../etc/passwd")).toBe(".. .. etc passwd");
    expect(safeOriginalName("C:\\Users\\rye\\guide.html")).toBe("C: Users rye guide.html");
    expect(safeOriginalName(`two${String.fromCharCode(10)}lines.html`)).toBe("twolines.html");
    expect(safeOriginalName(`nul${String.fromCharCode(0)}.html`)).toBe("nul.html");
    expect(safeOriginalName("x".repeat(400)).length).toBe(120);
    expect(safeOriginalName(undefined)).toBe("");
  });
});

describe("the picture path, which did not change", () => {
  it("resizes a photograph to WebP and writes a thumbnail beside it", async () => {
    const before = volume().length;
    const res = await post(await jpeg(), "hero.jpg", "image/jpeg");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.kind).toBe("image");
    expect(res.body.format).toBe("webp");
    expect(String(res.body.url)).toMatch(/^\/api\/uploads\/brand-[\w.-]+\.webp$/);
    expect(String(res.body.thumbUrl)).toMatch(/\.thumb\.webp$/);
    expect(res.body.originalName).toBe("hero.jpg");
    // Two files, the picture and its thumbnail, actually on the volume.
    expect(volume().length).toBe(before + 2);
    for (const url of [res.body.url, res.body.thumbUrl]) {
      expect(fs.existsSync(path.join(uploadsDir, path.basename(String(url))))).toBe(true);
    }
  });

  it("takes the picture path on the BYTES, whatever the name claims", async () => {
    // A JPEG named .md. The sniff decides, so this is still a picture.
    const res = await post(await jpeg(200, 200), "notes.md", "text/markdown");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.kind).toBe("image");
    expect(String(res.body.url)).toMatch(/\.webp$/);
  });
});

describe("the reference-document path, which is new", () => {
  it("stores an HTML style guide under .html and hands the bytes back unchanged", async () => {
    const res = await post(STYLE_GUIDE, "amora-style-guide.html", "text/html");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.kind).toBe("file");
    expect(res.body.mimeType).toBe("text/html");
    expect(res.body.thumbUrl).toBeNull();
    expect(res.body.originalName).toBe("amora-style-guide.html");
    const onDisk = fs.readFileSync(path.join(uploadsDir, path.basename(String(res.body.url))), "utf8");
    expect(onDisk).toBe(STYLE_GUIDE);
  });

  it("stores CSS, SVG, plain text and markdown", async () => {
    const cases: Array<[string, string, string, string]> = [
      ["body { color: #0f766e; }\n", "tokens.css", "text/css", ".css"],
      ['<svg xmlns="http://www.w3.org/2000/svg"><circle r="4"/></svg>', "mark.svg", "image/svg+xml", ".svg"],
      ["deep teal, warm sand, no glass towers\n", "palette.txt", "text/plain", ".txt"],
      ["# Voice\n\nDirect and grounded.\n", "voice.md", "application/octet-stream", ".md"],
    ];
    for (const [body, name, type, ext] of cases) {
      const res = await post(body, name, type);
      expect(res.status, `${name}: ${JSON.stringify(res.body)}`).toBe(200);
      expect(String(res.body.url).endsWith(ext), `${name} should be stored as ${ext}`).toBe(true);
      expect(res.body.kind).toBe("file");
    }
  });

  it("stores a PDF and scans it on the way past", async () => {
    const res = await post(MINIMAL_PDF, "brand-book.pdf", "application/pdf");
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(String(res.body.url)).toMatch(/\.pdf$/);
    expect(res.body.mimeType).toBe("application/pdf");
  });
});

describe("what it refuses, and how tellable the refusal is", () => {
  it("refuses a type it does not store, and names the ones it does", async () => {
    const before = volume().length;
    const res = await post(Buffer.from([0x4d, 0x5a, 0x90, 0x01]), "payload.exe", "application/x-msdownload");
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain(ACCEPTED_UPLOAD_TYPES);
    expect(volume().length, "nothing may reach the volume on a refusal").toBe(before);
  });

  it("refuses a file named .pdf whose bytes are not a PDF, and says so", async () => {
    const before = volume().length;
    const res = await post("this is not a pdf at all", "brand-book.pdf", "application/pdf");
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain("not a PDF");
    // The whole point: this is NOT the sharp-is-missing answer.
    expect(res.status).not.toBe(503);
    expect(String(res.body.error)).not.toContain("sharp");
    expect(volume().length).toBe(before);
  });

  it("refuses binary bytes wearing a .html name", async () => {
    const before = volume().length;
    const res = await post(Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04]), "guide.html", "text/html");
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toContain("readable text");
    expect(volume().length).toBe(before);
  });

  it("refuses an empty file rather than storing nothing under a real address", async () => {
    const before = volume().length;
    const res = await post(Buffer.alloc(0), "empty.html", "text/html");
    expect(res.status).toBe(400);
    expect(volume().length).toBe(before);
  });

  it("refuses anyone who is not an admin, before multer reads a byte", async () => {
    adminAnswer = false;
    const before = volume().length;
    const res = await post(STYLE_GUIDE, "amora-style-guide.html", "text/html");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("auth_required");
    expect(volume().length).toBe(before);
  });
});
