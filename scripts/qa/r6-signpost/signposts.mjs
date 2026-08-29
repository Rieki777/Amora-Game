/**
 * Pass 2. Same anchors as signposts.mjs, but keep only the sites that render
 * a SENTENCE a reader can see, and print that sentence, so each can be
 * classified. A `disabled={x.length === 0}` or a `join(", ")` fallback is an
 * emptiness test, not a signpost, and is dropped here with a count.
 */
import fs from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "client/src");

const files = [];
(function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) files.push(p);
  }
})(SRC);

const EMPTY_GUARD = [
  /\.length\s*===\s*0/, /\.length\s*>\s*0\s*\?/, /\.length\s*\?/,
  /!\w+(\?)?\.length/, /!\w+\.\w+(\?)?\.length/, /\blength\s*<\s*1\b/,
  /\(\)\.length\s*===\s*0/,
];
const GATE = /<(ModuleGate|ModuleOff|SignInToSee|SignInDoors)\b/;

// a sentence a reader sees: >= 4 words, has a lowercase run, not a class list
function sentences(win) {
  const out = new Set();
  for (const rx of [/"([^"\\]{16,})"/g, /`([^`\\{}]{16,})`/g, />([^<>{}]{16,})</g, /'([^'\\]{16,})'/g]) {
    for (const m of win.matchAll(rx)) {
      const s = m[1].replace(/\s+/g, " ").trim();
      if (s.split(" ").length < 4) continue;
      if (!/[a-z]{3}/.test(s)) continue;
      if (/(text-|bg-|border-|rounded|flex|grid-|px-|py-|mt-|mb-|w-\d|h-\d|hover:|focus|sm:|md:|lg:)/.test(s)) continue;
      if (/^[A-Za-z0-9_.]+ [A-Za-z0-9_.]+ [A-Za-z0-9_.]+$/.test(s) && !/ [a-z]+ [a-z]+/.test(s)) continue;
      out.add(s);
    }
  }
  return [...out];
}

let sitesRaw = 0, dropped = 0;
const kept = [];
for (const f of files) {
  const rel = path.relative(SRC, f).split(path.sep).join("/");
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) return;
    let kind = GATE.test(ln) ? "GATE" : EMPTY_GUARD.some((rx) => rx.test(ln)) ? "EMPTY" : null;
    if (!kind) return;
    sitesRaw++;
    const win = lines.slice(i, i + 16).join("\n");
    const ss = kind === "GATE" ? [t] : sentences(win);
    if (!ss.length) { dropped++; return; }
    kept.push({ rel, line: i + 1, kind, code: t.slice(0, 120), ss });
  });
}

console.log(`TSX FILES: ${files.length}`);
console.log(`EMPTINESS/GATE SITES: ${sitesRaw}`);
console.log(`  dropped, render no sentence (arithmetic, disabled=, aria, join fallback): ${dropped}`);
console.log(`SIGNPOSTS (site that renders a sentence): ${kept.length}`);
console.log(`  GATE ${kept.filter(k=>k.kind==="GATE").length}   EMPTY ${kept.filter(k=>k.kind==="EMPTY").length}`);
console.log(`FILES: ${new Set(kept.map(k=>k.rel)).size}`);
if (process.argv[2] === "--dump") {
  let n = 0;
  const byFile = new Map();
  for (const k of kept) { if (!byFile.has(k.rel)) byFile.set(k.rel, []); byFile.get(k.rel).push(k); }
  for (const [file, ks] of [...byFile].sort()) {
    console.log(`\n##### ${file}`);
    for (const k of ks) {
      console.log(`[${String(++n).padStart(3, "0")}] ${k.line} ${k.kind}`);
      for (const s of k.ss.slice(0, 6)) console.log(`      | ${s.slice(0, 170)}`);
    }
  }
}
