/**
 * Stage the Living Map artifact into the client's public directory.
 *
 * `docs/prototypes/grounds-v0.html` is a self-contained ~4 MB page (painted
 * plate, sprites and script inlined) owned by the map workstream. It is the
 * SOURCE; `client/public/grounds/index.html` is a derived copy that vite
 * lifts into `dist/public/` so Express serves it at `/grounds/index.html`.
 * The copy is gitignored for that reason — committing both would put two
 * four-megabyte blobs in history and invite someone to edit the wrong one.
 *
 * Never fork the artifact. Editing the copy means the next build silently
 * reverts the edit, which is the worst kind of bug: the file on disk is
 * right, the file being served is not. Changes belong upstream, in
 * docs/prototypes/.
 *
 * A missing source is NOT a build failure. The prototype is not on main yet,
 * and a fork that never adopts the Living Map should still build. `/map`
 * handles the absent artifact on its own (it renders a plain explanation
 * instead of an iframe pointed at a 404), so the honest thing here is to say
 * loudly what did not happen and exit 0.
 */
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "docs", "prototypes", "grounds-v0.html");
const destDir = path.join(root, "client", "public", "grounds");
const dest = path.join(destDir, "index.html");
/**
 * The presence probe. A GET for a missing /grounds/index.html does NOT 404:
 * it falls through the static handler to the SPA catch-all and returns the
 * app's own index.html, so an iframe pointed at it renders the site inside
 * itself. The shell cannot tell those apart by status code, and reading 4 MB
 * to find out is absurd, so the copy leaves a few bytes of JSON beside the
 * artifact. Absent artifact means the catch-all serves HTML here too, and
 * JSON.parse throwing IS the negative answer.
 */
const manifest = path.join(destDir, "manifest.json");

if (!existsSync(src)) {
  // A stale manifest from an earlier build would claim an artifact that is no
  // longer staged, so it goes when the source does.
  rmSync(manifest, { force: true });
  rmSync(dest, { force: true });
  console.log("  grounds: docs/prototypes/grounds-v0.html not present, /map will show the not-installed notice");
  process.exit(0);
}

const from = statSync(src);
// Size plus mtime, because a 4 MB byte-compare on every build is a real cost
// and the artifact is only ever replaced wholesale by its own workstream.
if (existsSync(dest) && existsSync(manifest)) {
  const to = statSync(dest);
  if (to.size === from.size && to.mtimeMs >= from.mtimeMs) {
    console.log(`  grounds: up to date (${(from.size / 1048576).toFixed(1)} MB)`);
    process.exit(0);
  }
}

mkdirSync(destDir, { recursive: true });
copyFileSync(src, dest);
writeFileSync(manifest, JSON.stringify({ present: true, bytes: from.size }) + "\n");
console.log(`  grounds: staged ${(from.size / 1048576).toFixed(1)} MB -> client/public/grounds/index.html`);
