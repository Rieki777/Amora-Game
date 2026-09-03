/**
 * The identity-pack door: one upload route, lifted out of server/index.ts.
 *
 *   POST /api/admin/brand/image   a picture, or a reference document
 *
 * THE ROUTE KEEPS ITS OLD ADDRESS. Three client surfaces post to it
 * (IdentityPackPanel, the Admin brand fields, ModuleDetail), and renaming a
 * path inside a move is how a behaviour change hides in a diff.
 *
 * ── WHY IT TAKES MORE THAN PICTURES NOW ───────────────────────────────────
 *
 * Rye, 2026-09-02: "The identity pack should be able to handle all sorts of
 * file types. In this case I'm trying to upload an HTML that shows the whole
 * style guide." A village's visual identity arrives as whatever its designer
 * handed over, and that is regularly one HTML page with the palette, the type
 * scale and the spacing in it. A door that only takes JPEGs sends the founder
 * away to screenshot a web page, and a screenshot of a style guide is the one
 * form of it a later reader cannot extract anything from.
 *
 * So the door now takes pictures, HTML, CSS, SVG, PDF, plain text and
 * markdown. Everything else is still refused, by name.
 *
 * ── TWO PATHS, DECIDED BY THE BYTES ───────────────────────────────────────
 *
 * A raster picture goes down the path it always went down: resized to 2000px,
 * re-encoded to WebP, metadata asserted gone, plus a 400px thumbnail. That
 * half is unchanged, and the two e2e suites that cover it
 * (server/uploadStrip.routes.e2e.test.ts, server/uploadsSweep.routes.e2e.test.ts)
 * still describe it exactly.
 *
 * Everything else is a DOCUMENT: sanitised through server/lib/uploads.ts like
 * every other byte that reaches the volume, then stored under an extension
 * this file chose.
 *
 * `sniffKind` reads the magic numbers, so which path a file takes is decided
 * by what it IS. The browser's mime type and the uploader's filename are both
 * a stranger's assertion, and they are consulted only to NAME a document,
 * never to classify one.
 *
 * ── THE STORED EXTENSION IS THE SERVER'S CHOICE ───────────────────────────
 *
 * `/api/uploads/:filename` picks a Content-Type from the extension alone, so
 * the extension is a security decision and cannot be taken on trust. It comes
 * from the allowlists below, and the bytes are checked against it: a name
 * ending `.pdf` has to sniff as a PDF, and anything claiming to be text has to
 * decode as UTF-8 with no NUL in it. A file that satisfies neither is refused
 * with a sentence saying which check it failed.
 *
 * That refusal being READABLE is the point. The picture path answers 503 when
 * sharp is missing, and a refusal that came back looking like that outage
 * would send a founder to check a dependency over a file we simply do not
 * store. A check that reports the same thing when it did not run as when it
 * failed is worth nothing.
 *
 * ── HTML IS STORED, NOT SERVED ────────────────────────────────────────────
 *
 * Uploaded HTML rendered on this origin would be stored XSS behind one admin
 * account. It is not rendered: `INLINE_TYPES` in server/index.ts lists the
 * extensions that come back inline, and `.html`, `.css`, `.svg` and `.md` are
 * all absent from it, so they are served `application/octet-stream` with
 * `Content-Disposition: attachment` and `X-Content-Type-Options: nosniff`. A
 * browser downloads them. Nothing here changes that, and nothing here should:
 * the day one of those extensions is added to that map, this door becomes the
 * way in.
 */
import type { Express, Response } from "express";
import multer from "multer";
import path from "node:path";
import type { AppDeps } from "../lib/appDeps";
import {
  CarriesLocationData,
  LocationDataSurvived,
  readMetadataMarkers,
  sanitiseForVolume,
  sniffKind,
  stampedName,
  writeToVolume,
} from "../lib/uploads";

type Deps = Pick<AppDeps, "isAdmin" | "uploadsDir">;

/** Raster pictures. These take the resize-and-re-encode path. */
const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

/**
 * Reference documents, by the mime type a browser reports for them.
 *
 * The value is the extension the file will be STORED under. That choice
 * belongs to this file alone, for the reason spelled out at the top. `.htm`
 * collapses to `.html` and `.markdown` to `.md`, so the volume holds one
 * spelling of each.
 */
const DOCUMENT_TYPES: Record<string, string> = {
  "text/html": ".html",
  "text/css": ".css",
  "image/svg+xml": ".svg",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/markdown": ".md",
  "text/x-markdown": ".md",
};

/**
 * The same list keyed by filename extension, because the mime type is not
 * always there to read.
 *
 * Browsers have no registered type for markdown and send `application/octet-stream`
 * or an empty string for a `.md` file depending on the platform, so a filter
 * that trusted the mime type alone would refuse the founder's notes on Windows
 * and accept them on a Mac. The extension is the second reading, and the byte
 * check below is what makes either of them safe to act on.
 */
const DOCUMENT_EXTS: Record<string, string> = {
  ".html": ".html",
  ".htm": ".html",
  ".css": ".css",
  ".svg": ".svg",
  ".pdf": ".pdf",
  ".txt": ".txt",
  ".md": ".md",
  ".markdown": ".md",
};

/** What we say we stored, keyed by what we stored it as. */
const MIME_FOR_EXT: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".txt": "text/plain",
  ".md": "text/markdown",
};

/** Said in the refusal and in the client's `accept`, so the two agree. */
export const ACCEPTED_UPLOAD_TYPES = "JPG, PNG, WebP, AVIF, SVG, HTML, CSS, PDF, TXT or MD";

/** 25 MB, the cap the picture door has always carried. A style guide with its images inlined fits. */
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const lowerExt = (name: string) => path.extname(String(name ?? "")).toLowerCase();

/** The extension a document should be stored under, or null when we cannot tell. */
export function documentExtFor(originalName: string, mimeType: string): string | null {
  return DOCUMENT_EXTS[lowerExt(originalName)] ?? DOCUMENT_TYPES[String(mimeType ?? "").toLowerCase()] ?? null;
}

/**
 * True when these bytes are text a person could read.
 *
 * Two readings, because either alone lets a binary through wearing a text
 * file's name. A NUL byte is the cheapest tell and catches UTF-16 and most
 * executables; the strict decode catches the rest, since `TextDecoder` in
 * fatal mode throws on any sequence that is not valid UTF-8 rather than
 * quietly substituting a replacement character the way `Buffer.toString` does.
 */
export function isUtf8Text(bytes: Buffer): boolean {
  if (bytes.length === 0) return false;
  if (bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * The uploader's filename, made safe to store and to show.
 *
 * Kept because the extractor that reads a brand guide has to be able to tell a
 * style guide from a colour swatch, and the stamped name on the volume says
 * nothing about either. Path separators go, because this string is written
 * into a document that other code reads addresses out of. Control characters
 * go, because a newline inside a filename is how one line of a log becomes
 * two. A length cap, because a filename is a field a person controls.
 */
export function safeOriginalName(name: unknown): string {
  return String(name ?? "")
    .replace(/[\\/]+/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120);
}

export function register(app: Express, deps: Deps): void {
  const { isAdmin, uploadsDir } = deps;

  // Hero photos come straight off phones at 3-8MB, which would make the site
  // slower than the pasted URLs it replaces. Pictures are resized and
  // re-encoded to WebP on the way in. Files land in the mounted volume, so
  // they survive redeploys, and are served by /api/uploads/:filename.
  const brandUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_UPLOAD_BYTES },
    fileFilter: (_req, file, cb) => {
      const ok =
        PICTURE_TYPES.includes(file.mimetype) || documentExtFor(file.originalname, file.mimetype) !== null;
      if (ok) cb(null, true);
      else cb(new Error(`Please upload one of: ${ACCEPTED_UPLOAD_TYPES}.`));
    },
  });

  app.post("/api/admin/brand/image", async (req, res) => {
    if (!(await isAdmin(req))) return res.status(401).json({ error: "auth_required" });
    brandUpload.single("file")(req, res, async (err: any) => {
      if (err) return res.status(400).json({ error: err.message || "Upload failed" });
      if (!req.file) return res.status(400).json({ error: "Missing file" });
      const file = req.file;
      const originalName = safeOriginalName(file.originalname);
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      // What it IS, from the magic numbers. The mime type is a claim about the
      // file; these bytes are the file.
      if (sniffKind(file.buffer) !== "image") {
        return storeDocument(res, file, originalName, uploadsDir);
      }

      try {
        const sharp = (await import("sharp")).default;
        const filename = `brand-${stamp}.webp`;
        /*
         * ASSERTED, not assumed. This pipeline dropped metadata because that
         * is sharp's default, and a guarantee that rests on a dependency's
         * default is a guarantee nobody checks: a `.withMetadata()` added two
         * files away for a good reason would turn it into a live disclosure
         * with nothing raising. Encode to a buffer, read the buffer back, and
         * only then write.
         */
        const encoded = await sharp(file.buffer)
          .rotate() // honour EXIF orientation before resizing
          .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 82 })
          .toBuffer({ resolveWithObject: true });
        const brandMarkers = await readMetadataMarkers(encoded.data);
        if (brandMarkers.length) throw new LocationDataSurvived(brandMarkers);
        const info = encoded.info;
        writeToVolume(uploadsDir, filename, encoded.data);

        // A card thumbnail served at 2000px is absurd, and it is what every
        // illustrated list would have done: the pipeline resized once and
        // stopped. One extra encode here saves the same bytes on every view
        // for the life of the image. Best-effort: a village with no thumb
        // gets the full image, which is slower but never broken.
        let thumbFilename: string | null = null;
        try {
          thumbFilename = `brand-${stamp}.thumb.webp`;
          const thumb = await sharp(file.buffer)
            .rotate()
            .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
            .webp({ quality: 76 })
            .toBuffer();
          const thumbMarkers = await readMetadataMarkers(thumb);
          if (thumbMarkers.length) throw new LocationDataSurvived(thumbMarkers);
          writeToVolume(uploadsDir, thumbFilename, thumb);
        } catch (thumbErr) {
          console.error("[BRAND IMAGE] thumbnail failed, full size only", thumbErr);
          thumbFilename = null;
        }

        return res.json({
          url: `/api/uploads/${filename}`,
          filename,
          thumbUrl: thumbFilename ? `/api/uploads/${thumbFilename}` : null,
          width: info.width,
          height: info.height,
          bytes: info.size,
          originalBytes: file.size,
          format: "webp",
          kind: "image",
          mimeType: "image/webp",
          originalName,
        });
      } catch (e) {
        // This used to write the ORIGINAL bytes, up to 25 MB straight off a
        // phone, and return a 200 indistinguishable from a successful
        // compression. The admin saw "uploaded", and every visitor thereafter
        // paid 25 MB on a link measured at 50 KB/s. A silent fallback that
        // makes the product worse than doing nothing is not a fallback; it is
        // a defect with good manners. Refuse, and say why.
        console.error("[BRAND IMAGE] compression unavailable, refusing upload", e);
        return res.status(503).json({
          error:
            "Image processing is unavailable on this server, so the image was not saved. " +
            "Storing it uncompressed would make every page slower for every member. " +
            "Check that the `sharp` dependency installed correctly for this platform.",
        });
      }
    });
  });
}

/**
 * The non-picture half. Declared at module scope, so the handler above reads
 * as two paths rather than one function with a second function inside it.
 */
async function storeDocument(
  res: Response,
  file: Express.Multer.File,
  originalName: string,
  uploadsDir: string,
): Promise<void> {
  const ext = documentExtFor(file.originalname, file.mimetype);
  if (!ext) {
    res.status(400).json({
      error:
        `We could not tell what kind of file "${originalName}" is, so it was not stored. ` +
        `Rename it with the right ending, or upload one of: ${ACCEPTED_UPLOAD_TYPES}.`,
    });
    return;
  }

  // The bytes have to back the name up. Each branch refuses for its own
  // reason, so a founder reading the message knows which check said no.
  const kind = sniffKind(file.buffer);
  if (ext === ".pdf" && kind !== "pdf") {
    res.status(400).json({
      error: `"${originalName}" is named as a PDF, and its contents are not a PDF, so it was not stored.`,
    });
    return;
  }
  if (ext !== ".pdf" && !isUtf8Text(file.buffer)) {
    res.status(400).json({
      error:
        `"${originalName}" should be readable text and its contents are not, so it was not stored. ` +
        "Save it as UTF-8 and upload it again.",
    });
    return;
  }

  try {
    // Every byte that reaches the volume goes through the one door, which
    // scans a PDF for embedded GPS and passes text through untouched.
    const clean = await sanitiseForVolume(file.buffer, `reference${ext}`);
    const filename = stampedName("brand", ext);
    writeToVolume(uploadsDir, filename, clean.bytes);
    res.json({
      url: `/api/uploads/${filename}`,
      filename,
      thumbUrl: null,
      width: null,
      height: null,
      bytes: clean.bytes.length,
      originalBytes: file.size,
      format: ext.slice(1),
      kind: "file",
      mimeType: MIME_FOR_EXT[ext] ?? "application/octet-stream",
      originalName,
    });
  } catch (e) {
    if (e instanceof CarriesLocationData) {
      res.status(400).json({ error: e.message });
      return;
    }
    if (e instanceof LocationDataSurvived) {
      console.error("[BRAND FILE] refused a reference whose metadata survived the strip", e.markers);
      res.status(500).json({ error: "That file kept its metadata through the re-encode, so it was not stored." });
      return;
    }
    console.error("[BRAND FILE] could not store a reference file", e);
    res.status(400).json({ error: `"${originalName}" could not be read, so it was not stored.` });
  }
}
