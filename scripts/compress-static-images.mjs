/**
 * Re-encode the brand marks in client/public/assets/images to WebP.
 *
 * Why this exists: that directory is served one-year-immutable and Vite does
 * NOT content-hash passthrough files, so every byte in it is both shipped to
 * every fork and unreplaceable for a year once cached. It held 1.7 MB of
 * logos - a single 449 KB PNG for a wordmark - because the source files came
 * straight out of a design tool at full resolution and nothing ever measured
 * them. A first pass squeezed the PNGs in place to 193 KB. This pass takes
 * the format itself.
 *
 * TWO THINGS WERE LEFT ON THE TABLE BY THE IN-PLACE PASS, and both are worth
 * more than the palette re-encode was:
 *
 * 1. FORMAT. WebP is the house standard for raster art. On flat brand marks
 *    with alpha it beats a palette PNG by roughly 70% at visually identical
 *    quality, and `scripts/check-image-budget.mjs` now enforces it.
 * 2. SIZE. These are 1000 px on the long edge. The header mark draws at 64 px
 *    tall (client/src/components/Layout.tsx) and the footer mark at 90 px, so
 *    even a 3x phone asks for 270 px. Everything above that is bytes nobody
 *    can see.
 *
 * RENAMING USED TO BE UNSAFE AND NOW IS NOT. The earlier version of this file
 * said so in a comment: the brand overlay lets an admin type an image path by
 * hand, so a live `brand` document may point at `<name>.png` and changing the
 * extension would 404 the village's own logo in its own header. That is still
 * true of the DATA. What changed is the SERVER: `/assets/images/<name>.png`
 * now falls back to `<name>.webp` when the PNG is gone (server/index.ts), so
 * a hand-typed path keeps resolving and the bytes only exist once.
 *
 * THE FAVICON STAYS PNG, and it is the one exception. It is served as
 * `apple-touch-icon` (client/src/App.tsx) and as the sole PWA manifest icon
 * (server/index.ts), and neither surface is a place to be clever: Safari's
 * touch icon has no dependable WebP support, and the manifest's own `type`
 * field is chosen by an `endsWith(".svg")` ternary that would label a WebP as
 * `image/png`. It is resized instead, which is where its bytes were anyway.
 *
 * The favicon is identified by ASKING THE CONFIG, never by filename. This
 * script sits in the brand ratchet's zone (scripts/), so it carries no
 * village's name; `shared/gameConfig.ts` is the declared home for that, and
 * this reads the answer from there.
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

/**
 * Brand marks draw at 90 px tall at the largest (the footer mark). 320 leaves
 * room for a 3x display with headroom to spare, and a fork that wants a
 * bigger hero mark uploads one to the volume, where images are hashed and
 * swappable.
 */
const MAX_EDGE = 320;
/** A launcher icon is asked for at 512 at most; below that it gets scaled up. */
const ICON_EDGE = 512;

/** Which file the config calls the favicon, read from its declared home. */
function faviconName() {
  const src = fs.readFileSync(path.join(root, "shared", "gameConfig.ts"), "utf8");
  const m = src.match(/favicon:\s*"([^"]+)"/);
  return m ? path.basename(m[1]) : "";
}

const icon = faviconName();
const sharp = (await import("sharp")).default;
const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();

let before = 0;
let after = 0;
const renames = [];

for (const name of files) {
  const file = path.join(dir, name);
  const original = fs.statSync(file).size;
  const meta = await sharp(file).metadata();
  const isIcon = name === icon;

  const pipeline = sharp(file).resize({
    width: isIcon ? ICON_EDGE : MAX_EDGE,
    height: isIcon ? ICON_EDGE : MAX_EDGE,
    fit: "inside",
    withoutEnlargement: true,
  });

  // The icon keeps its format and its filename; everything else becomes WebP.
  // `nearLossless` on flat marks holds the hard edges a palette PNG holds,
  // which is what a logo is made of, at a fraction of the bytes.
  const out = isIcon
    ? await pipeline.png({ compressionLevel: 9, palette: true, quality: 90, effort: 10 }).toBuffer()
    : await pipeline.webp({ nearLossless: true, quality: 80, effort: 6 }).toBuffer();

  const target = isIcon ? name : name.replace(/\.(png|jpe?g)$/i, ".webp");
  before += original;
  // Never make a file bigger. If the re-encode loses, keep what we had.
  const improved = out.length < original;
  after += improved ? out.length : original;

  const pct = Math.round((1 - out.length / original) * 100);
  console.log(
    `${improved ? "  " : "! "}${name.padEnd(26)} ${String(Math.round(original / 1024)).padStart(4)} KB ` +
      `${meta.width}x${meta.height}  ->  ${target.padEnd(26)} ${String(Math.round(out.length / 1024)).padStart(4)} KB  (${pct}%)`,
  );

  if (write && improved) {
    fs.writeFileSync(path.join(dir, target), out);
    if (target !== name) {
      fs.rmSync(file);
      renames.push([name, target]);
    }
  }
}

console.log(
  `\n${write ? "Rewrote" : "Would rewrite"} ${files.length} files: ` +
    `${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`,
);
if (renames.length) {
  console.log(`Renamed ${renames.length}: update any path that names them.`);
  for (const [from, to] of renames) console.log(`  ${from} -> ${to}`);
}
if (!write) console.log("Dry run. Pass --write to apply.");
