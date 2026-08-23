#!/usr/bin/env node
/**
 * The living map keeps its OWN list of the site's routes, and a door pointing at
 * a route that is not on that list silently does nothing.
 *
 * `docs/prototypes/grounds-v0.html` carries `SITE_PAGES`, an allowlist of the
 * routes the app serves. `realRoute()` returns `''` for anything not on it, so a
 * founder who places a door on a route the list has not caught gets a door that
 * renders, carries an href, takes a click and does not navigate. No error, no
 * console line, nothing a test can see. The allowlist fails safe in the security
 * sense (no unapproved route becomes reachable) and fails silent in every other
 * sense, which is why it rotted unwatched.
 *
 * IT HAS DRIFTED, AND THREE OF THE FOUR WERE ALREADY SHIPPED. On 2026-08-22 the
 * array was four routes behind the router: /campaigns, /decisions, /propose and
 * /places. Only one of those was fresh; the other three had shipped as dead doors
 * and nobody noticed, because the array is derived output that nothing re-derived.
 * It rotted at exactly the speed pages were added.
 *
 * BOTH HALVES OF THIS COMPARISON ALREADY EXISTED, in two scripts that never met.
 * `scripts/qa/routes.mjs` derives the route list from `client/src/App.tsx`. The
 * regex read of the array back out of the artifact is what
 * `docs/prototypes/patch_g1_04_routes_rederive.py` does. Neither ran in CI. This
 * puts the two halves together, and it needs no browser and no build: it reads two
 * files and compares two lists, in milliseconds, so it is cheap enough to run on
 * every push, which is the entire point. A gate that costs a browser gets run at
 * the end of a round, and the drift lands before that.
 *
 * WHICH SCRIPT OWNS THE ARRAY, because there are two and only one is the answer.
 * `patch_g1_01_doors.py` wrote SITE_PAGES originally, but from a literal list of its
 * own that it merely ASSERTS against the deriver; that literal is itself stale today
 * (it predates the five newest routes), so running it now aborts on its own guard.
 * `patch_g1_04_routes_rederive.py` writes exactly what the deriver emits and nothing
 * else, which is why it is the command named below and the one to reach for.
 *
 * TWO DIRECTIONS, BOTH FAIL, AND THE MESSAGE SAYS WHICH. They are different
 * defects with different fixes, so a gate that collapsed them into one number would
 * hand the reader the wrong instruction half the time.
 *
 *  - A route the router serves that SITE_PAGES does not carry is a dead door
 *    waiting to happen. Nothing is broken the instant it drifts; it breaks the
 *    first time a founder places a door there, and it breaks silently. This is the
 *    direction that shipped three times. The fix is mechanical: re-derive.
 *
 *  - A route in SITE_PAGES that the router no longer serves is a door pointing at
 *    nothing. Doors already placed still resolve, and now land a visitor on the 404
 *    page. This one CANNOT be fixed by re-deriving: the re-derive script refuses to
 *    shrink the array (`assert not removed`) precisely because deleting the entry
 *    retires a door a founder may already have placed. So it needs a human, and
 *    the message says so instead of naming a command that would abort.
 *
 * ORDER AND DUPLICATES. `realRoute()` looks the route up with `indexOf`, so the
 * order of the array cannot change what a door does; a set comparison is what
 * decides pass or fail. Order is still REPORTED on every run rather than ignored,
 * because the re-derive script writes the deriver's order and a difference means
 * somebody hand-edited derived output. It is reported as "not compared" while the
 * two lists hold different routes, so it cannot read as a second, separate defect
 * on top of the drift that caused it. A duplicate entry is the same evidence of a
 * hand edit and DOES fail, because the deriver cannot emit one.
 *
 * This script never writes to grounds-v0.html. It reads it. Every write to that
 * file goes through a guarded patch script in the lane that owns it.
 *
 * Usage:
 *   node scripts/check-map-routes.mjs
 *   node scripts/check-map-routes.mjs --json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { routes } from "./qa/routes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = path.join(ROOT, "docs", "prototypes", "grounds-v0.html");

/** The command that owns writing this array. Named in the failure message. */
const REDERIVE = "cd docs/prototypes && python patch_g1_04_routes_rederive.py";

/**
 * The deriver has to be reading a real router. `patch_g1_04_routes_rederive.py`
 * carries the same floor for the same reason: if App.tsx moved or its `path=`
 * spelling changed, the deriver returns a short list and a naive comparison would
 * then report the whole site as drift, or worse, shrink the allowlist to match a
 * misread. A short list is a broken read, not a finding.
 */
const MIN_PLAUSIBLE_ROUTES = 40;

if (!fs.existsSync(ARTIFACT)) {
  // Same call as scripts/check-artifact-budget.mjs: a fork that has removed the
  // prototype map has no list to drift, and should not inherit a red gate.
  console.log("no docs/prototypes/grounds-v0.html; no SITE_PAGES to compare");
  process.exit(0);
}

const src = fs.readFileSync(ARTIFACT, "utf8");
const artifactBytes = Buffer.byteLength(src, "utf8");

// The same read patch_g1_04_routes_rederive.py performs, so the two agree on what
// the array IS before they can disagree about what is in it.
const matches = [...src.matchAll(/SITE_PAGES=\[(.*?)\];/gs)];

if (matches.length !== 1) {
  // Never a skip. A missing or doubled array means this gate is looking at
  // something it does not understand, and a silent pass there is the failure mode
  // this whole script exists to end.
  console.error(
    `::error::found ${matches.length} SITE_PAGES arrays in docs/prototypes/grounds-v0.html, expected exactly 1. ` +
    `The living map's route allowlist could not be read, so nothing was compared. ` +
    `SITE_PAGES is written by docs/prototypes/patch_g1_01_doors.py; if the array was renamed or split, ` +
    `this gate and patch_g1_04_routes_rederive.py both need updating together.`);
  process.exit(1);
}

const inMap = [...matches[0][1].matchAll(/'([^']*)'/g)].map((m) => m[1]);
const { concrete: inRouter } = routes();

if (inRouter.length < MIN_PLAUSIBLE_ROUTES) {
  console.error(
    `::error::scripts/qa/routes.mjs derived only ${inRouter.length} routes from client/src/App.tsx, ` +
    `below the ${MIN_PLAUSIBLE_ROUTES} this site has had for a long time. That is a broken read of the router, ` +
    `not a route list, and comparing against it would report the whole site as drift. Check that App.tsx ` +
    `still spells its routes path="/x" before trusting anything else here.`);
  process.exit(1);
}

const routerSet = new Set(inRouter);
const mapSet = new Set(inMap);
const missingFromMap = inRouter.filter((r) => !mapSet.has(r));
const missingFromRouter = [...new Set(inMap)].filter((r) => !routerSet.has(r));
const duplicates = [...new Set(inMap.filter((r, i) => inMap.indexOf(r) !== i))];
// Order is only a question once the two lists hold the SAME routes. Reporting it
// while they differ in membership adds a second complaint about the first one, and
// the reader has to work out that it is not a separate defect.
const sameMembers = missingFromMap.length === 0 && missingFromRouter.length === 0;
const orderNote = !sameMembers
  ? "order not compared (the two lists hold different routes)"
  : inMap.every((r, i) => r === inRouter[i])
    ? "order matches the deriver"
    : "order DIFFERS from the deriver (hand-edited, but no door is affected: realRoute uses indexOf)";

const drifted = missingFromMap.length + missingFromRouter.length + duplicates.length;

// --json emits JSON and NOTHING else, so a caller can pipe it straight into a
// parser. The first draft printed the prose first and the flag was unusable.
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(
    { artifact: artifactBytes, inRouter, inMap, missingFromMap, missingFromRouter, duplicates, order: orderNote },
    null, 2));
  process.exit(drifted > 0 ? 1 : 0);
}

// Provenance, printed on every run including the green one. Three map gates have
// been green about the wrong file, so the file, its size and both counts are on
// screen before any verdict is.
console.log(`  ${path.relative(ROOT, ARTIFACT).split(path.sep).join("/")} (${artifactBytes} bytes)`);
console.log(`  ${inRouter.length} route(s) derived from client/src/App.tsx by scripts/qa/routes.mjs`);
console.log(`  ${inMap.length} route(s) read from SITE_PAGES in the living map`);
console.log(`  ${orderNote}`);

let failed = false;

if (missingFromMap.length > 0) {
  failed = true;
  console.error("");
  console.error(
    `::error::${missingFromMap.length} route(s) the router serves are missing from SITE_PAGES in the living map. ` +
    `A door placed on one of these renders, carries an href, takes a click and does not navigate, with no error anywhere.`);
  console.error("  in client/src/App.tsx, NOT in SITE_PAGES:");
  for (const r of missingFromMap) console.error(`    ${r}`);
  console.error("");
  console.error("  SITE_PAGES is DERIVED output. Re-derive it, do not hand-edit it:");
  console.error(`    ${REDERIVE}`);
  console.error("  That script runs scripts/qa/routes.mjs itself and writes exactly what the deriver");
  console.error("  emits, so it cannot introduce a fifth spelling of the list. It prints a skip and");
  console.error("  writes nothing when the array already matches.");
}

if (missingFromRouter.length > 0) {
  failed = true;
  console.error("");
  console.error(
    `::error::${missingFromRouter.length} route(s) in SITE_PAGES are no longer served by the router. ` +
    `Doors already placed on them still resolve and now land a visitor on the 404 page.`);
  console.error("  in SITE_PAGES, NOT in client/src/App.tsx:");
  for (const r of missingFromRouter) console.error(`    ${r}`);
  console.error("");
  console.error("  Re-deriving will NOT fix this and the re-derive script refuses to try: removing an");
  console.error("  entry retires a door a founder may already have published, so it aborts on any");
  console.error("  removal rather than shrink the allowlist quietly. Either put the route back, or take");
  console.error("  it to the lane that owns docs/prototypes/grounds-v0.html and give it a LEGACY_ROUTES");
  console.error("  entry in patch_g1_01_doors.py naming the page it now means, the way /stays, /health,");
  console.error("  /products and /exchange were each handled.");
}

if (duplicates.length > 0) {
  failed = true;
  console.error("");
  console.error(
    `::error::SITE_PAGES lists ${duplicates.length} route(s) more than once: ${duplicates.join(", ")}. ` +
    `The deriver emits a deduplicated list, so a repeat is evidence the array was edited by hand rather than re-derived.`);
  console.error(`  Re-derive it: ${REDERIVE}`);
}

if (failed) process.exit(1);

console.log("  the living map's SITE_PAGES and the router agree, route for route");
