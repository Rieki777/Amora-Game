#!/usr/bin/env node
/**
 * The living map is the largest thing this site sends to a phone, and until now
 * nothing watched it.
 *
 * The bundle budget in ci.yml measures `dist/public`. `docs/prototypes/grounds-v0.html`
 * is served straight from the repo and never copied into `dist`, so all three of its
 * thresholds (main JS 700 KB, total dist 6000 KB, per image 400 KB) look straight past
 * a file thirteen times the size of the main JS bundle. That is the blind spot the
 * bundle budget's own comment describes: "a gate that cannot see the thing you are
 * adding is not a gate".
 *
 * MEASURED 2026-08-11 against the live site, not estimated:
 *
 *     uncompressed            5 459 166 bytes
 *     gzipped, on the wire    3 945 816 bytes   (gzip saves only 28%)
 *     Cache-Control           public, max-age=31536000, immutable
 *
 * Gzip barely helps because most of the payload is base64 PNG, which is already
 * compressed. The immutable cache means one download per version, which is the right
 * thing and does nothing for the visit that matters: the first one, on a phone.
 *
 *     3.76 MiB at 12 Mbps LTE     ~2.6 s
 *                at  4 Mbps        ~7.9 s
 *                at  1 Mbps       ~31.6 s
 *
 * A RATCHET, NOT A CAP. The artifact grows for good reasons and a hard freeze would
 * be wrong: round F added a part-built sprite for all thirty families, which is worth
 * paying for. What is not worth paying for is silent doubling. The same round would
 * have added 2.7 MB at generated weight and nothing would have stopped it; quantizing
 * to 256 colours brought it to 668 KB with no visible difference, and that was a lane
 * choosing to measure rather than a gate catching anything.
 *
 * So this number is raised DELIBERATELY, in a commit, by someone who has looked at
 * what the growth buys. Same shape as scripts/brand-refs-baseline.json.
 *
 * Usage: node scripts/check-artifact-budget.mjs [--json]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = path.join(ROOT, "docs", "prototypes", "grounds-v0.html");

/**
 * Raise these in a commit, with a sentence about what the growth bought.
 *
 * HEADROOM IS DELIBERATE AND THE FIRST DRAFT HAD IT WRONG. Set just above the current
 * size, the gate sat at 91% of budget and the very next art round would have red-ed
 * `main` for all eleven lanes: round F alone added 668 KB. A gate that fires on normal
 * work gets raised reflexively without anyone reading it, which is worse than no gate.
 *
 * So these sit about 1.5 MB above today's artifact: room for two more rounds the size
 * of round F, and loud well before a doubling. The thing being caught is the 2.7 MB
 * that a single unquantized sprite set would have added, not a round of art.
 *
 * At 2026-08-11: 5.21 MiB on disk, 3.74 MiB gzipped.
 */
const MAX_RAW_BYTES = 7_000_000;   // ~6.68 MiB on disk
const MAX_WIRE_BYTES = 5_000_000;  // ~4.77 MiB gzipped, which is what a phone pays

if (!fs.existsSync(ARTIFACT)) {
  // A fork that has removed the prototype map should not fail this gate.
  console.log("no docs/prototypes/grounds-v0.html; nothing to measure");
  process.exit(0);
}

const raw = fs.readFileSync(ARTIFACT);
// Level 6 is what a server negotiates by default; measuring at 9 would flatter us.
const wire = zlib.gzipSync(raw, { level: 6 }).length;
const mib = (n) => (n / 1048576).toFixed(2);
const pct = (n, max) => Math.round((100 * n) / max);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ raw: raw.length, wire, MAX_RAW_BYTES, MAX_WIRE_BYTES }));
}

console.log(`living map artifact: ${mib(raw.length)} MiB on disk, ${mib(wire)} MiB gzipped`);
console.log(`  disk ${pct(raw.length, MAX_RAW_BYTES)}% of budget, wire ${pct(wire, MAX_WIRE_BYTES)}% of budget`);

let failed = false;
if (raw.length > MAX_RAW_BYTES) {
  console.error(
    `::error::grounds-v0.html is ${mib(raw.length)} MiB, over the ${mib(MAX_RAW_BYTES)} MiB budget. ` +
    `Compress the art before raising this: optimize_wip_sprites.py took a sprite set from 2.0 MB to 500 KB ` +
    `at 256 colours with no visible difference. Raise the number only when the growth is worth it on a phone.`);
  failed = true;
}
if (wire > MAX_WIRE_BYTES) {
  console.error(
    `::error::grounds-v0.html is ${mib(wire)} MiB gzipped, over the ${mib(MAX_WIRE_BYTES)} MiB wire budget. ` +
    `This is what a first visit downloads: about ${(wire * 8 / 4e6).toFixed(0)}s on a 4 Mbps connection. ` +
    `Gzip saves little here because the payload is base64 PNG, so the fix is smaller images, not better compression.`);
  failed = true;
}

process.exit(failed ? 1 : 0);
