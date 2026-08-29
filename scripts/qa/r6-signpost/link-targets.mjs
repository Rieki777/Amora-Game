import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "client/src");

// ---- 1. routes from App.tsx -------------------------------------------------
const app = fs.readFileSync(path.join(SRC, "App.tsx"), "utf8");
const routes = [];
for (const m of app.matchAll(/<Route\s+path="([^"]+)"\s+component=\{?(\w+)\}?/g)) {
  routes.push({ path: m[1], component: m[2] });
}
const compFile = new Map();
for (const m of app.matchAll(/const\s+(\w+)\s*=\s*lazy(?:Page)?\(\(\)\s*=>\s*import\("([^"]+)"\)\)/g)) {
  compFile.set(m[1], m[2]);
}
for (const m of app.matchAll(/^import\s+(\w+)\s+from\s+"([^"]+)";/gm)) {
  compFile.set(m[1], m[2]);
}
// LandingRoute is a local wrapper; find what it renders.
compFile.set("LandingRoute", "./pages/Home");
const routesByFile = new Map();
const unmapped = [];
for (const r of routes) {
  const f = compFile.get(r.component);
  if (!f) { unmapped.push(r); continue; }
  const key = f.replace(/^@\//, "").replace(/^\.\//, "") + ".tsx";
  if (!routesByFile.has(key)) routesByFile.set(key, []);
  routesByFile.get(key).push(r.path);
}

const routePaths = routes.map((r) => r.path);
function routeExists(target) {
  const clean = target.split("?")[0].split("#")[0].replace(/\/$/, "") || "/";
  for (const rp of routePaths) {
    if (rp === clean) return rp;
    const rx = new RegExp("^" + rp.replace(/:[^/]+/g, "[^/]+") + "$");
    if (rx.test(clean)) return rp;
  }
  return null;
}

// ---- 2. walk client/src -----------------------------------------------------
const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(e.name) && !/\.test\.(tsx|ts)$/.test(e.name)) files.push(p);
  }
})(SRC);

const SEP = new RegExp("\\\\", "g");
const rows = [];
for (const f of files) {
  const rel = path.relative(SRC, f).split(path.sep).join("/");
  const text = fs.readFileSync(f, "utf8");
  const lines = text.split(/\r?\n/);
  const ownRoutes = routesByFile.get(rel) ?? [];
  lines.forEach((ln, i) => {
    const pats = [
      /href="(\/[^"]*)"/g,
      /href=\{`(\/[^`${]*)`\}/g,
      /navigate\("(\/[^"]*)"\)/g,
      /setLocation\("(\/[^"]*)"\)/g,
    ];
    for (const rx of pats) {
      for (const m of ln.matchAll(rx)) {
        const target = m[1];
        if (target.startsWith("/api/")) continue;
        const hit = routeExists(target);
        const selfBase = target.split("?")[0].split("#")[0];
        const self = ownRoutes.includes(selfBase);
        rows.push({ file: rel, line: i + 1, target, resolves: !!hit, self, ownRoutes, code: ln.trim().slice(0, 150) });
      }
    }
  });
}

const bad = rows.filter((r) => !r.resolves);
const selfies = rows.filter((r) => r.self);
console.log(`ROUTES declared: ${routes.length}  (unmapped components: ${unmapped.length})`);
console.log(`FILES scanned: ${files.length}`);
console.log(`ROUTE-OWNING FILES resolved: ${routesByFile.size}`);
console.log(`INTERNAL LINK TARGETS found: ${rows.length}`);
console.log(`  resolve to a router route: ${rows.length - bad.length}`);
console.log(`  DO NOT resolve: ${bad.length}`);
console.log(`  point at the linking page's OWN route: ${selfies.length}`);
console.log("\n=== DO NOT RESOLVE ===");
for (const r of bad) console.log(`${r.file}:${r.line}  ${r.target}\n     ${r.code}`);
console.log("\n=== SELF-POINTING ===");
for (const r of selfies) console.log(`${r.file}:${r.line}  ${r.target}  (own: ${r.ownRoutes.join(", ")})\n     ${r.code}`);
if (unmapped.length) {
  console.log("\n=== ROUTES WHOSE COMPONENT FILE COULD NOT BE RESOLVED ===");
  for (const r of unmapped) console.log(`  ${r.path} -> ${r.component}`);
}
