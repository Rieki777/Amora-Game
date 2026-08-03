/**
 * Re-encode the PNGs in client/public/assets/images in place.
 *
 * Why this exists: that directory is served one-year-immutable and Vite does
 * NOT content-hash passthrough files, so every byte in it is both shipped to
 * every fork and unreplaceable for a year once cached. It held 1.7 MB of
 * logos — a single 449 KB PNG for a wordmark — because the source files came
 * straight out of a design tool at full resolution and nothing ever measured
 * them. CI now caps any single image at 400 KB; this is what gets under it.
 *
 * In place, same filenames, same format. The brand overlay lets an admin type
 * an image path by hand and the live `brand` document may point at any of
 * these, so renaming or deleting is not safe from here — shrinking is.
 *
 *   node scripts/compress-static-images.mjs          # report only
 *   node scripts/compress-static-images.mjs --write  # actually rewrite
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "client", "public", "assets", "images");
const write = process.argv.includes("--write");

// Logos do not need to be bigger than the largest place they are drawn: the
// nav mark is ~40px and the largest hero use is a few hundred. 1000px on the
// long edge leaves generous room for 2x displays and still cuts the files by
// an order of magnitude.
const MAX_EDGE = 1000;

const sharp = (await import("sharp")).default;
const files = fs.readdirSync(dir).filter((f) => /\.png$/i.test(f));

let before = 0;
let after = 0;
for (const name of files) {
  const file = path.join(dir, name);
  const original = fs.statSync(file).size;
  const meta = await sharp(file).metadata();

  const out = await sharp(file)
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    // Logos are flat colour with hard edges: a palette re-encode is visually
    // lossless on this material and is where nearly all of the saving is.
    .png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 })
    .toBuffer();

  before += original;
  // Never make a file bigger. If the re-encode loses, keep what we had.
  const improved = out.length < original;
  after += improved ? out.length : original;

  const pct = Math.round((1 - out.length / original) * 100);
  console.log(
    `${improved ? "  " : "! "}${name.padEnd(24)} ${String(Math.round(original / 1024)).padStart(5)} KB ` +
      `-> ${String(Math.round(out.length / 1024)).padStart(4)} KB  (${pct}%)  ${meta.width}x${meta.height}`,
  );

  if (write && improved) fs.writeFileSync(file, out);
}

console.log(
  `\n${write ? "Rewrote" : "Would rewrite"} ${files.length} files: ` +
    `${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`,
);
if (!write) console.log("Dry run. Pass --write to apply.");
