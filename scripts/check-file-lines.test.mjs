/**
 * The guard's own guard.
 *
 * check-file-lines.mjs makes one promise that is worth more than the gate
 * itself: the baseline only ever turns down. A ratchet whose refusal is
 * untested is a ratchet that quietly becomes a rubber stamp the first time
 * somebody runs `--update-baseline` on a tree that grew, and nobody would
 * notice, because the command exits 0 and prints a cheerful sentence either
 * way. So the refusal is the thing this file pins hardest.
 *
 * Every case spawns the REAL script against a scratch fixture tree via
 * FILE_LINES_ROOT, never against this repository's own files, so a case can
 * plant a 1200-line file without anybody having to write 1200 lines of
 * anything into the repo.
 *
 * Run: node scripts/check-file-lines.test.mjs
 */
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = fileURLToPath(new URL("./check-file-lines.mjs", import.meta.url));
let run = 0;
const check = (name, fn) => {
  fn();
  run += 1;
  console.log(`  PASS  ${name}`);
};

/** A scratch repo root with a client/src tree and a scripts/ dir. */
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "file-lines-"));
  fs.mkdirSync(path.join(root, "client", "src", "pages"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  return root;
}

/** A .tsx file of exactly `lines` lines, each one distinct so nothing dedupes. */
function plant(root, relPath, lines) {
  const full = path.join(root, relPath.split("/").join(path.sep));
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Array.from({ length: lines }, (_, i) => `// line ${i + 1}`).join("\n") + "\n");
}

function writeBaseline(root, files) {
  const totalLines = Object.values(files).reduce((n, v) => n + v, 0);
  fs.writeFileSync(
    path.join(root, "scripts", "file-lines-baseline.json"),
    `${JSON.stringify({ threshold: 1000, totalLines, files }, null, 2)}\n`,
  );
}

const readBaseline = (root) =>
  JSON.parse(fs.readFileSync(path.join(root, "scripts", "file-lines-baseline.json"), "utf8"));

const run1 = (root, ...args) =>
  spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
    env: { ...process.env, FILE_LINES_ROOT: root },
  });

console.log("check-file-lines.mjs");

check("a file under the threshold is not tracked and cannot fail", () => {
  const root = fixture();
  plant(root, "client/src/pages/Small.tsx", 999);
  writeBaseline(root, {});
  const r = run1(root);
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.match(r.stdout, /0 tracked file\(s\)/);
});

check("a NEW file born over the threshold fails, with no baseline entry to hide behind", () => {
  const root = fixture();
  plant(root, "client/src/pages/Born.tsx", 1000);
  writeBaseline(root, {});
  const r = run1(root);
  assert.equal(r.status, 1, "a brand-new monolith must fail on the day it lands");
  assert.match(r.stderr, /not in the baseline/);
  assert.match(r.stderr, /client\/src\/pages\/Born\.tsx/);
});

check("a tracked file that GREW fails the gate", () => {
  const root = fixture();
  plant(root, "client/src/pages/Big.tsx", 1200);
  writeBaseline(root, { "client/src/pages/Big.tsx": 1100 });
  const r = run1(root);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /1200 lines, baseline allows 1100/);
});

check("a tracked file that SHRANK passes the gate without touching the baseline", () => {
  const root = fixture();
  plant(root, "client/src/pages/Big.tsx", 1050);
  writeBaseline(root, { "client/src/pages/Big.tsx": 1100 });
  const r = run1(root);
  assert.equal(r.status, 0, r.stderr);
});

check("a file that shrank BELOW the threshold leaves the tracked set and still passes", () => {
  const root = fixture();
  plant(root, "client/src/pages/Big.tsx", 400);
  writeBaseline(root, { "client/src/pages/Big.tsx": 1100 });
  const r = run1(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /0 tracked file\(s\)/);
});

check("--update-baseline REFUSES to raise a tracked file, and leaves the file on disk untouched", () => {
  const root = fixture();
  plant(root, "client/src/pages/Big.tsx", 1300);
  writeBaseline(root, { "client/src/pages/Big.tsx": 1100 });
  const before = readBaseline(root);
  const r = run1(root, "--update-baseline");
  assert.equal(r.status, 1, "the ratchet must refuse, not record");
  assert.match(r.stderr, /refusing to raise the file-lines baseline/);
  assert.match(r.stderr, /1300 lines, baseline holds 1100/);
  assert.deepEqual(readBaseline(root), before, "a refused update must not write anything");
});

check("--update-baseline REFUSES a new file crossing the threshold, even though no entry rose", () => {
  const root = fixture();
  // Big.tsx falls, so no PER-FILE rise. New.tsx appears from nowhere and pushes
  // the total up. Without the total check this would be recorded as progress.
  plant(root, "client/src/pages/Big.tsx", 1050);
  plant(root, "client/src/pages/New.tsx", 1400);
  writeBaseline(root, { "client/src/pages/Big.tsx": 1100 });
  const before = readBaseline(root);
  const r = run1(root, "--update-baseline");
  assert.equal(r.status, 1);
  assert.match(r.stderr, /refusing to raise the file-lines baseline total/);
  assert.deepEqual(readBaseline(root), before);
});

check("--update-baseline accepts a genuine shrink and writes the lower number", () => {
  const root = fixture();
  plant(root, "client/src/pages/Big.tsx", 1050);
  writeBaseline(root, { "client/src/pages/Big.tsx": 1100 });
  const r = run1(root, "--update-baseline");
  assert.equal(r.status, 0, r.stderr);
  assert.equal(readBaseline(root).files["client/src/pages/Big.tsx"], 1050);
  assert.equal(readBaseline(root).totalLines, 1050);
});

check("EXTRACTION is allowed: a tracked file shrinks and the new component is not tracked", () => {
  const root = fixture();
  // The shape this guard exists to encourage. 300 lines leave Big.tsx for a
  // component of their own; the component is far under the threshold, so the
  // tracked total falls by the whole 300 and the ratchet records it.
  plant(root, "client/src/pages/Big.tsx", 1100);
  plant(root, "client/src/components/admin/Extracted.tsx", 300);
  writeBaseline(root, { "client/src/pages/Big.tsx": 1400 });
  const gate = run1(root);
  assert.equal(gate.status, 0, gate.stderr);
  const upd = run1(root, "--update-baseline");
  assert.equal(upd.status, 0, upd.stderr);
  assert.equal(readBaseline(root).totalLines, 1100);
  assert.equal(
    readBaseline(root).files["client/src/components/admin/Extracted.tsx"],
    undefined,
    "a component under the threshold must not enter the baseline at all",
  );
});

check("vendored client/src/components/ui/** is exempt however large it gets", () => {
  const root = fixture();
  plant(root, "client/src/components/ui/sidebar.tsx", 2000);
  writeBaseline(root, {});
  const r = run1(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /0 tracked file\(s\)/);
});

check("test files are exempt however large they get", () => {
  const root = fixture();
  plant(root, "client/src/lib/housingForm.test.ts", 3000);
  plant(root, "client/src/lib/thing.spec.tsx", 3000);
  writeBaseline(root, {});
  const r = run1(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /0 tracked file\(s\)/);
});

check("server/** is out of scope, which is a boundary and not an oversight", () => {
  const root = fixture();
  fs.mkdirSync(path.join(root, "server"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "server", "index.ts"),
    Array.from({ length: 5000 }, (_, i) => `// line ${i + 1}`).join("\n") + "\n",
  );
  writeBaseline(root, {});
  const r = run1(root);
  assert.equal(r.status, 0, r.stderr);
  assert.match(
    r.stdout,
    /0 tracked file\(s\)/,
    "if this ever fails, the walk widened to server/** and this test is the prompt to update the header, not a false alarm",
  );
});

check("a final line with no trailing newline is still counted", () => {
  const root = fixture();
  // Exactly the shape of the real client/src/pages/Admin.tsx, which ends in a
  // bare `}`. `wc -l` reports 999 for this file; the guard must see 1000.
  const body = Array.from({ length: 1000 }, (_, i) => `// line ${i + 1}`).join("\n");
  fs.writeFileSync(path.join(root, "client", "src", "pages", "NoEol.tsx"), body);
  writeBaseline(root, {});
  const r = run1(root);
  assert.equal(r.status, 1, "an unterminated last line must not let a file duck under the threshold");
  assert.match(r.stderr, /1000 lines/);
});

console.log(`\n  ${run} check(s) passed.`);
