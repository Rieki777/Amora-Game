/**
 * node --check every inline <script> block in the artifact.
 *
 * A 4 MB single file has no build step to catch a stray brace, and the browser
 * reports it as one silent dead script rather than an error you can find. This
 * parses each block on its own so a failure names the block and the line.
 */
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const file = process.argv[2] ?? "grounds-v0.html";
const src = readFileSync(file, "utf8");

const blocks = [];
const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m;
while ((m = re.exec(src))) {
  blocks.push({ code: m[1], start: src.slice(0, m.index).split("\n").length });
}

let bad = 0;
blocks.forEach((b, i) => {
  const tmp = path.join(tmpdir(), `blk-${i}.mjs`);
  writeFileSync(tmp, b.code);
  try {
    execFileSync(process.execPath, ["--check", tmp], { stdio: "pipe" });
    console.log(`  block ${i + 1} (line ${b.start}): ok  ${b.code.length} chars`);
  } catch (e) {
    bad++;
    console.error(`  block ${i + 1} (line ${b.start}): FAILED`);
    console.error(String(e.stderr || e).split("\n").slice(0, 6).join("\n"));
  } finally {
    try { unlinkSync(tmp); } catch {}
  }
});

console.log(bad ? `\n${bad} block(s) failed` : `\nall ${blocks.length} script block(s) parse`);
process.exit(bad ? 1 : 0);
