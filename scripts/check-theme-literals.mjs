#!/usr/bin/env node
/**
 * The theme-literal guard: a village's brand colour should reach every
 * surface a member looks at. It cannot reach a colour baked into the
 * compiled bundle as a literal.
 *
 * THE MECHANISM THIS PROTECTS. shared/brandTokens.ts derives a full palette
 * from a founder's seed colour; server/lib/themeCss.ts emits it as a
 * `:root:root { --tone-brand: ...; --primary: ...; ... }` stylesheet that
 * beats the platform defaults in client/src/index.css regardless of load
 * order (docs/DESIGN_TOKENS_SPEC.md §6.4). Any `--tone-*` or `--color-*`
 * reference — `var(--tone-brand, #157f7d)`, or a Tailwind utility generated
 * from one of index.css's `@theme inline` entries such as `bg-teal-deep` —
 * picks up that override for free. A hex code, or an rgb()/hsl()/oklch()
 * call with literal numbers, written directly into a className or a style
 * value, cannot: it is baked into the compiled bundle at build time and a
 * founder's colour never reaches it.
 *
 * WHAT COUNTS AS SAFE. `var(--anything, #fallback)` is the platform's own
 * established pattern (CircleScene.tsx, MoonGlyph.tsx, YearWheel.tsx,
 * MobileFab.tsx all do this deliberately) — the literal there is a FALLBACK
 * for a village that has not picked a seed colour yet, not a value the theme
 * can never reach. This guard strips every `var(...)` span (fallback and
 * all, one level of nested parens allowed for a nested function like
 * `var(--x, rgba(0,0,0,0))`) before it looks for literals, so that pattern
 * costs nothing.
 *
 * WHAT DOES NOT COUNT. shared/**, server/**, and every non-.tsx file: the
 * harm here is specifically compiled-in client colour that a browser paints
 * without ever asking the server for a theme. index.css itself is the
 * token layer, not a bypass of it, and is out of this lane's ownership besides.
 *
 * THE RATCHET, same discipline as scripts/check-image-budget.mjs: the
 * baseline in scripts/theme-literals-baseline.json is a per-file count that
 * may only ever fall, `--update-baseline` REFUSES to write a total higher
 * than the one already committed (check-brand-refs.mjs's baseline does not
 * refuse this; this one must), and a brand-new file starts at zero so it is
 * born clean.
 *
 * A genuine false positive (an id, a non-colour string that happens to look
 * like a hex triplet) gets an inline `theme-ok: <reason>` on the line, same
 * spelling convention as check-brand-refs.mjs's `brand-ok:`.
 *
 * Usage:
 *   node scripts/check-theme-literals.mjs                    # the gate
 *   node scripts/check-theme-literals.mjs --json              # machine readable
 *   node scripts/check-theme-literals.mjs --update-baseline   # only ever downward
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { stripComments } from "./brand-strip.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOT = path.join(ROOT, "client", "src");
const BASELINE_PATH = path.join(ROOT, "scripts", "theme-literals-baseline.json");

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, out);
    } else if (entry.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Remove every `var(...)` span from a line, fallback literal and all, before
 * hex/rgb/hsl/oklch matching runs. Written as a scanner rather than a regex
 * because a fallback can itself be a function call — `var(--nat-dawn-high,
 * rgba(246,201,138,0))` (client/src/components/natural/Celebration.tsx) — and
 * a naive `var\([^)]*\)` stops at the FIRST close-paren, which is the inner
 * call's, leaving `))` and a truncated dangling fragment behind that a
 * regex-only pass would then need a second special case to not mis-scan.
 */
function stripVarCalls(line) {
  let out = "";
  let i = 0;
  while (i < line.length) {
    if (line.startsWith("var(", i)) {
      let depth = 1;
      let j = i + 4;
      while (j < line.length && depth > 0) {
        if (line[j] === "(") depth += 1;
        else if (line[j] === ")") depth -= 1;
        j += 1;
      }
      i = j; // skip the whole var(...) span, however deep it nested
      continue;
    }
    out += line[i];
    i += 1;
  }
  return out;
}

/** Hex triplets/sextuplets, and rgb()/rgba()/hsl()/hsla()/oklch() calls that
 *  open on a literal number rather than a var() reference (already stripped
 *  above). `\b` on the hex form so a 7+ char token (an id, a hash) doesn't
 *  false-positive on its first six characters. */
const HEX = /#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b/g;
const FUNC = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|color)\(\s*[-\d.]/g;

function countLiterals(line) {
  const stripped = stripVarCalls(line);
  const hexHits = stripped.match(HEX) ?? [];
  const funcHits = stripped.match(FUNC) ?? [];
  return hexHits.length + funcHits.length;
}

/**
 * `theme-ok:` waives a line the same way check-brand-refs.mjs's `brand-ok:`
 * does — but a colour hit is often a five-hex-wide generated Tailwind
 * arbitrary-selector string (client/src/components/ui/chart.tsx), where a
 * trailing same-line comment would make an already-unreadable line worse. So
 * the marker also arms across ONE line boundary: a comment-only line ending
 * in `theme-ok:` waives the next line that actually carries a literal, in
 * addition to the same-line case. Either way the reason must be written down,
 * not just the marker.
 */
function scanFile(file) {
  const ext = path.extname(file);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  let count = 0;
  let waived = 0;
  const hits = [];
  let inBlock = false;
  let pendingWaiver = false;
  lines.forEach((line, i) => {
    const opensBlock = /\/\*/.test(line) && !/\*\//.test(line);
    const closesBlock = /\*\//.test(line);
    const wasInBlock = inBlock;
    if (opensBlock) inBlock = true;
    if (closesBlock) inBlock = false;
    const hasMarker = /theme-ok:/.test(line);
    const code = wasInBlock ? "" : stripComments(line, ext);
    const n = countLiterals(code);
    const isBlankOrCommentOnly = code.trim() === "";

    if (hasMarker) {
      if (n > 0) { waived += 1; pendingWaiver = false; return; }
      // Comment-only marker line: arm the waiver and keep looking — a
      // multi-line comment (chart.tsx) can put several wrapped lines between
      // the marker and the literal it excuses.
      pendingWaiver = true;
      return;
    }
    if (isBlankOrCommentOnly) return; // continuation/blank line: leave pendingWaiver as-is
    if (n > 0 && pendingWaiver) {
      waived += 1;
      pendingWaiver = false;
      return;
    }
    pendingWaiver = false;
    if (n > 0) {
      count += n;
      hits.push({ line: i + 1, text: line.trim().slice(0, 140) });
    }
  });
  return { count, waived, hits };
}

const files = walk(SCAN_ROOT).sort();
const counts = {};
const details = {};
let totalWaivers = 0;
for (const file of files) {
  const r = rel(file);
  const { count, waived, hits } = scanFile(file);
  totalWaivers += waived;
  if (count > 0) { counts[r] = count; details[r] = hits; }
}
const total = Object.values(counts).reduce((n, v) => n + v, 0);

if (process.argv.includes("--update-baseline")) {
  const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) : null;
  const baselineTotal = baseline ? Object.values(baseline.files ?? baseline).reduce((n, v) => n + v, 0) : Infinity;
  if (total > baselineTotal) {
    console.error(
      `::error::refusing to raise the theme-literal baseline: ${total} is above the recorded ${baselineTotal}. ` +
      `This number only ever falls. Route the new colour through a --tone-* var or a token-backed Tailwind class ` +
      `(see client/src/index.css's @theme inline block), or wrap a genuine one-off in var(--something, #literal) so ` +
      `it is at least a fallback rather than a dead end.`);
    process.exit(1);
  }
  fs.writeFileSync(
    BASELINE_PATH,
    `${JSON.stringify({ totalLiterals: total, files: counts }, null, 2)}\n`,
  );
  console.log(`theme-literal baseline lowered to ${total} across ${Object.keys(counts).length} file(s).`);
  process.exit(0);
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ total, files: counts, waivers: totalWaivers }));
}

const baseline = fs.existsSync(BASELINE_PATH) ? JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8")) : { totalLiterals: 0, files: {} };
const baselineFiles = baseline.files ?? {};
const baselineTotal = baseline.totalLiterals ?? Object.values(baselineFiles).reduce((n, v) => n + v, 0);

const failures = [];
for (const [file, count] of Object.entries(counts)) {
  const allowed = baselineFiles[file] ?? 0;
  if (count > allowed) {
    failures.push({
      file,
      reason: `${count} theme-bypassing colour literal(s), baseline allows ${allowed} — the ratchet only turns down`,
      hits: details[file].slice(0, 5),
    });
  }
}
// A file dropping out of the baseline entirely, or every file combined
// coming in lower, is fine and expected — only a RISE anywhere fails. The
// per-file check above already catches a rise hidden inside a falling total
// (moving literals into a new file), so the total is reported, not re-gated.

if (failures.length) {
  console.error("\nTHEME-LITERAL GUARD FAILED — a founder's colour cannot reach a literal.\n");
  console.error("Route the colour through a --tone-* CSS var (see client/src/index.css) or a token-backed");
  console.error("Tailwind utility (e.g. teal-deep, teal-band, amber, cream — all @theme inline entries).\n");
  for (const f of failures) {
    console.error(`  ${f.file} — ${f.reason}`);
    for (const h of f.hits) console.error(`      ${f.file}:${h.line}: ${h.text}`);
  }
  console.error(`\nIf a hit is a genuine false positive (not a rendered colour), add \`theme-ok: <reason>\` on that line.`);
  console.error(`If you REMOVED literals, lower the baseline: node scripts/check-theme-literals.mjs --update-baseline\n`);
  process.exit(1);
}

console.log(
  `Theme-literal guard passed. ${total} theme-bypassing colour literal(s) across ${Object.keys(counts).length} file(s) ` +
  `(baseline ${baselineTotal}); ${totalWaivers} waiver(s) in force.`,
);
