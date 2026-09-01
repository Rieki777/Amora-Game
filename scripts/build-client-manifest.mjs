/**
 * Record what `dist/public` was built from, immediately after vite builds it.
 *
 * This is the client half of the freshness receipt described in
 * `server/db/distFreshness.ts`. It is a SEPARATE step from the server half on
 * purpose: `scripts/build-server.mjs` is routinely run on its own during an
 * inner loop (it takes seconds where a full `pnpm build` takes two minutes),
 * and if it also stamped the client inputs it would certify a client bundle it
 * had not rebuilt. A receipt that can be signed by someone who did not do the
 * work is not a receipt.
 *
 * Unlike the server half there is no bundler graph to read here, because vite
 * runs in its own process. This walks `client/src` and `shared` instead, which
 * over-approximates: a client source file nobody imports still counts. That
 * direction is the safe one for a check whose failure mode is "you forgot to
 * rebuild".
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "dist", ".build-inputs.client.json");

const SKIP_DIR = new Set(["node_modules", "dist", "__snapshots__"]);
const IS_TEST = /\.test\.[cm]?[jt]sx?$/;

function walk(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (e.name.startsWith(".") || SKIP_DIR.has(e.name)) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      walk(full, out);
      continue;
    }
    if (IS_TEST.test(e.name)) continue;
    out.push(full);
  }
  return out;
}

const files = [
  ...walk(path.join(ROOT, "client", "src")),
  ...walk(path.join(ROOT, "shared")),
  path.join(ROOT, "client", "index.html"),
  path.join(ROOT, "vite.config.ts"),
].filter((p) => fs.existsSync(p));

const client = {};
for (const abs of files) {
  const rel = path.relative(ROOT, abs).split(path.sep).join("/");
  client[rel] = crypto.createHash("sha256").update(fs.readFileSync(abs)).digest("hex").slice(0, 16);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, `${JSON.stringify({ builtAt: Date.now(), client }, null, 0)}\n`);
console.log(`  dist/public receipt written from ${Object.keys(client).length} client inputs`);
