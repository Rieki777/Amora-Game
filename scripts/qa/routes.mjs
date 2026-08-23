// The route list, DERIVED from client/src/App.tsx rather than written down.
//
// A checked-in routes.txt goes stale the first time somebody adds a page, and a QA sweep
// that silently misses a route reports it as clean. Reading the router is the only version
// of this that stays true.
//
// Usage:
//   node scripts/qa/routes.mjs              # print every concrete route, one per line
//   import { routes } from "./routes.mjs"   # from the other scripts here
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.join(HERE, "..", "..", "client", "src", "App.tsx");

/**
 * Every `path="..."` in the router.
 *
 * Parameterised routes (`/forum/:id`) are returned separately: a sweep needs them, but it
 * has to substitute a real id or it measures an empty state and calls it a page. Callers
 * decide what to substitute, because only they know what exists.
 */
export function routes() {
  if (!fs.existsSync(APP)) {
    throw new Error(`Cannot find the router at ${APP}. Run this from the repo.`);
  }
  const src = fs.readFileSync(APP, "utf8");
  const all = [...src.matchAll(/path="([^"]+)"/g)].map((m) => m[1]);
  const concrete = [...new Set(all.filter((p) => !p.includes(":") && p !== "/404"))].sort();
  const parameterised = [...new Set(all.filter((p) => p.includes(":")))].sort();
  return { concrete, parameterised, total: all.length };
}

// Run directly, or imported? The hand-rolled comparison this used to make never
// matched on Windows (`file://` + `C:/...` is two slashes short of the `file:///C:/`
// that import.meta.url actually carries), so it leaned on a filename fallback that
// fired for any importer whose own name happened to END in "routes.mjs", which
// scripts/check-map-routes.mjs does. That importer got 61 stray lines of route list
// printed into the middle of its own output. pathToFileURL is the comparison both
// clauses were reaching for, and it is exact on both platforms.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = routes();
  for (const p of r.concrete) console.log(p);
  if (process.argv.includes("--verbose")) {
    console.error(`\n  ${r.concrete.length} concrete, ${r.parameterised.length} parameterised:`);
    for (const p of r.parameterised) console.error(`    ${p}  (substitute a real id before sweeping)`);
  }
}
