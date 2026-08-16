#!/usr/bin/env node
/**
 * The image gate: format, per-file size, and a total that may only fall.
 *
 * WHAT WAS ALREADY WATCHED, AND WHAT WAS NOT. `.github/workflows/ci.yml` caps
 * any single file in `dist/public` at 400 KB and the whole directory at 6 MB,
 * and `scripts/check-artifact-budget.mjs` watches the living map. Between them
 * they miss the two things that actually decide what a phone downloads:
 *
 *   FORMAT. Nothing stopped a PNG landing in `client/public`. WebP is the
 *   house standard for raster art and it was a convention, which is to say it
 *   held until someone was in a hurry.
 *   DIRECTION. The bundle budget is a CEILING (6600 KB on dist/public since
 *   R33; the tree sat at 6136 KB when that was set), so images can still grow
 *   by several hundred KB and stay green. A ceiling tells you about a
 *   catastrophe; it says nothing about a year of quiet accumulation.
 *
 * So this is a RATCHET on the total, the same discipline as
 * `scripts/brand-refs-baseline.json`: the number in
 * `scripts/image-budget-baseline.json` may only ever go DOWN, and
 * `--update-baseline` refuses to raise it. Art that genuinely needs to grow
 * goes in the uploads volume, which is hashed, cached correctly, swappable,
 * and outside this budget by design.
 *
 * WHY IT RUNS BEFORE THE BUILD. It reads files in the repo, so a wrong format
 * fails in a second instead of after `pnpm build` and `pnpm test`. Same reason
 * the artifact budget sits where it does.
 *
 * THE NON-WEBP ALLOWLIST IS A RULE, NOT A LIST OF NAMES. Two reasons. A list
 * of filenames would be a list of one village's brand assets living in
 * `scripts/`, which the brand ratchet correctly refuses; and a fork with its
 * own icon would have to edit this file to stay green. So the exempt files are
 * DERIVED: whatever `shared/gameConfig.ts` calls the favicon, and whatever
 * `client/index.html` hands to a browser or a link preview as an icon or a
 * social card. Those surfaces have no dependable WebP support, and the PWA
 * manifest additionally labels any non-SVG icon `image/png` from an
 * `endsWith(".svg")` ternary in server/index.ts. Everything else is WebP.
 *
 * Usage:
 *   node scripts/check-image-budget.mjs                    # the gate
 *   node scripts/check-image-budget.mjs --json             # machine readable
 *   node scripts/check-image-budget.mjs --update-baseline  # only ever downward
 *
 * Read the exit code. A passing run prints a total; a failing one prints
 * ::error:: lines, and neither is reliably the last line on the terminal.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOT = path.join(ROOT, "client", "public");
const BASELINE_PATH = path.join(ROOT, "scripts", "image-budget-baseline.json");

/** Matches the per-file cap CI already applies to dist/public. */
const MAX_SINGLE_BYTES = 400 * 1024;

const RASTER = /\.(png|jpe?g|gif|bmp|tiff?|avif|webp)$/i;
const MODERN = /\.(webp|avif)$/i;

const kb = (n) => `${Math.round(n / 1024)} KB`;

/**
 * The files a browser or a crawler is allowed to receive as something other
 * than WebP, mapped to the reason they are exempt. Derived, never typed.
 */
function allowedNonWebp() {
  const allowed = new Map();
  const add = (ref, why) => {
    const clean = String(ref || "").split(/[?#]/)[0].trim();
    if (clean && !/^https?:/i.test(clean)) allowed.set(path.basename(clean), why);
  };

  const config = path.join(ROOT, "shared", "gameConfig.ts");
  if (fs.existsSync(config)) {
    const m = fs.readFileSync(config, "utf8").match(/favicon:\s*"([^"]+)"/);
    if (m) add(m[1], "the brand favicon, which is also the apple-touch-icon and the sole PWA manifest icon");
  }

  // Read each tag whole and pull its attributes out separately. Matching
  // `rel="..."` and `href="..."` in one pattern would quietly depend on the
  // author writing them in that order, and a fork whose icon tag reads
  // `href` first would find its own favicon failing this gate for a reason
  // the error message does not mention.
  const html = path.join(ROOT, "client", "index.html");
  if (fs.existsSync(html)) {
    const src = fs.readFileSync(html, "utf8");
    const attr = (tag, name) => (tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i")) || [])[1] || "";
    for (const [tag] of src.matchAll(/<link\b[^>]*>/gi)) {
      if (/\b(?:apple-touch-icon|mask-icon|icon)\b/i.test(attr(tag, "rel"))) {
        add(attr(tag, "href"), "a favicon declared in the shipped HTML");
      }
    }
    for (const [tag] of src.matchAll(/<meta\b[^>]*>/gi)) {
      const key = attr(tag, "property") || attr(tag, "name");
      if (/^(?:og:image|twitter:image)$/i.test(key)) {
        add(attr(tag, "content"), "a social card image, which link previews fetch without WebP support");
      }
    }
  }
  return allowed;
}

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile() && RASTER.test(entry.name)) out.push(full);
  }
  return out;
}

const allowed = allowedNonWebp();
const files = walk(SCAN_ROOT).sort();
const rel = (f) => path.relative(ROOT, f).split(path.sep).join("/");

let total = 0;
const wrongFormat = [];
const tooBig = [];
for (const file of files) {
  const size = fs.statSync(file).size;
  total += size;
  const name = path.basename(file);
  if (!MODERN.test(name) && !allowed.has(name)) wrongFormat.push({ file: rel(file), size });
  if (size > MAX_SINGLE_BYTES) tooBig.push({ file: rel(file), size });
}

const baseline = fs.existsSync(BASELINE_PATH)
  ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"))
  : { totalBytes: total, files: files.length };

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ total, files: files.length, baseline: baseline.totalBytes, wrongFormat, tooBig }));
}

if (process.argv.includes("--update-baseline")) {
  // Downward only. A gate whose baseline can be raised to clear a failure is a
  // logbook, and this one is meant to hold.
  if (total > baseline.totalBytes) {
    console.error(
      `::error::refusing to raise the image baseline: ${kb(total)} is above the recorded ${kb(baseline.totalBytes)}. ` +
      `This number only ever falls. Compress the art, or put it in the uploads volume where it is hashed and swappable.`);
    process.exit(1);
  }
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify({ totalBytes: total, files: files.length, maxSingleBytes: MAX_SINGLE_BYTES }, null, 2)}\n`,
  );
  console.log(`image baseline lowered to ${kb(total)} across ${files.length} files`);
  process.exit(0);
}

console.log(`shipped images: ${files.length} files, ${kb(total)} (baseline ${kb(baseline.totalBytes)})`);
console.log(`  ${files.filter((f) => MODERN.test(f)).length} WebP or AVIF, ${allowed.size} allowed exceptions, per-file cap ${kb(MAX_SINGLE_BYTES)}`);

let failed = false;
for (const { file, size } of wrongFormat) {
  console.error(
    `::error::${file} is ${kb(size)} and is not WebP. Convert it: ` +
    `node scripts/compress-static-images.mjs --write. An icon or social card that genuinely cannot be WebP ` +
    `is exempted by being declared in shared/gameConfig.ts or client/index.html, never by editing this script.`);
  failed = true;
}
for (const { file, size } of tooBig) {
  console.error(
    `::error::${file} is ${kb(size)}, over the ${kb(MAX_SINGLE_BYTES)} per-image cap. ` +
    `Serve it from the uploads volume rather than static assets: that path is content-addressed and swappable, ` +
    `while client/public is cached one-year-immutable and cannot be replaced.`);
  failed = true;
}
if (total > baseline.totalBytes) {
  console.error(
    `::error::shipped images total ${kb(total)}, over the ${kb(baseline.totalBytes)} baseline by ${kb(total - baseline.totalBytes)}. ` +
    `This is a ratchet: the number goes down, never up. New art belongs in the uploads volume. ` +
    `If you have genuinely made the total smaller, run --update-baseline.`);
  failed = true;
}

process.exit(failed ? 1 : 0);
