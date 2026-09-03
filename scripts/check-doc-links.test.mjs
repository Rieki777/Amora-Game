/**
 * The guard's own guard.
 *
 * check-doc-links.mjs spent months holding a hand-written list of six
 * documents while the tree grew past a hundred markdown files, and the single
 * document appended to that list in all that time arrived carrying three dead
 * references of its own. Two of them named `data/brand.json`, a file no code
 * in this tree reads, which is the trap the founder guide now spends a section
 * on. Coverage that narrow fails quietly: the gate is green every run, and the
 * green says nothing about the ninety documents it never opened.
 *
 * So the thing worth testing is not only that the guard catches a dead link.
 * It is that the guard is LOOKING. A checker that passes because it scanned
 * nothing prints the same cheerful line as one that scanned everything, and
 * the count in that line is the only thing separating them. Every assertion
 * below therefore pins a number as well as an exit code.
 *
 * This spawns the real script against scratch fixture trees, never against
 * this repository's own files, so the numbers stay stable as the docs change.
 *
 * Run: node scripts/check-doc-links.test.mjs
 */
import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT = fileURLToPath(new URL("./check-doc-links.mjs", import.meta.url));

let run = 0;
const check = (name, fn) => {
  fn();
  run += 1;
  console.log(`  PASS  ${name}`);
};

/** A throwaway tree with the real script inside it, so its ROOT is the fixture. */
function tree(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "doclinks-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, ...rel.split("/"));
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);
  }
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(root, "scripts", "check-doc-links.mjs"));
  return root;
}

function guard(files) {
  const root = tree(files);
  const r = spawnSync(process.execPath, [path.join(root, "scripts", "check-doc-links.mjs")], {
    encoding: "utf8",
  });
  const out = `${r.stdout}${r.stderr}`;
  const summary = out.match(/(\d+) reference\(s\) across (\d+) document\(s\)/);
  fs.rmSync(root, { recursive: true, force: true });
  return {
    code: r.status,
    out,
    refs: summary ? Number(summary[1]) : null,
    docs: summary ? Number(summary[2]) : null,
  };
}

/** A tree whose every reference resolves, used as the baseline to move. */
const CLEAN = {
  "server/real.ts": "export const x = 1;\n",
  "docs/LIVE.md": "Read `server/real.ts` before starting.\n",
};

check("a clean tree passes, and says how much it looked at", () => {
  const r = guard(CLEAN);
  assert.equal(r.code, 0, r.out);
  assert.equal(r.refs, 1, `expected 1 reference, got ${r.refs}\n${r.out}`);
  assert.equal(r.docs, 1, `expected 1 document, got ${r.docs}\n${r.out}`);
});

check("a dead reference fails the build and names doc, line and token", () => {
  const r = guard({ ...CLEAN, "docs/LIVE.md": "Read `server/ghost.ts` before starting.\n" });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /docs\/LIVE\.md:1\s+server\/ghost\.ts\s+<-- NO SUCH PATH/);
});

check("a NEW document is covered with no edit to the script", () => {
  const before = guard(CLEAN);
  const after = guard({ ...CLEAN, "docs/ADDED_TODAY.md": "See `server/real.ts`.\n" });
  assert.equal(after.docs, before.docs + 1, `document count did not rise\n${after.out}`);
  assert.equal(after.refs, before.refs + 1, `reference count did not rise\n${after.out}`);

  const rotten = guard({ ...CLEAN, "docs/ADDED_TODAY.md": "See `server/ghost.ts`.\n" });
  assert.equal(rotten.code, 1, `a new document's dead link went unseen\n${rotten.out}`);
});

check("a nested document under docs/ is covered", () => {
  const r = guard({ ...CLEAN, "docs/deep/nested/SPEC.md": "See `server/ghost.ts`.\n" });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /docs\/deep\/nested\/SPEC\.md/);
});

check("a repository-root document is covered", () => {
  const r = guard({ ...CLEAN, "README.md": "See `server/ghost.ts`.\n" });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /README\.md:1\s+server\/ghost\.ts/);
});

check("a SKIPPED directory prefix is not opened", () => {
  const r = guard({ ...CLEAN, "docs/prototypes/ROUND_C.md": "See `server/ghost.ts`.\n" });
  assert.equal(r.code, 0, `docs/prototypes/ was checked after all\n${r.out}`);
  assert.equal(r.docs, 1, `docs/prototypes/ was counted\n${r.out}`);
});

check("a SKIPPED exact path is not opened", () => {
  const r = guard({ ...CLEAN, "docs/modules/badges.md": "See `server/ghost.ts`.\n" });
  assert.equal(r.code, 0, `a skipped module spec was checked\n${r.out}`);
  assert.equal(r.docs, 1, `a skipped module spec was counted\n${r.out}`);
});

check("a citation resolves to the file it cites", () => {
  const r = guard({
    ...CLEAN,
    "docs/LIVE.md": "Line `server/real.ts:216`, range `server/real.ts:1-9`, symbol `server/real.ts:parse`.\n",
  });
  assert.equal(r.code, 0, `a cited line was reported as a dead path\n${r.out}`);
  assert.equal(r.refs, 3, `expected 3 references, got ${r.refs}\n${r.out}`);
});

check("a citation on a file that does not exist still fails", () => {
  const r = guard({ ...CLEAN, "docs/LIVE.md": "See `server/ghost.ts:216`.\n" });
  assert.equal(r.code, 1, `dropping the suffix opened a hole\n${r.out}`);
  assert.match(r.out, /server\/ghost\.ts:216\s+<-- NO SUCH PATH/);
});

check("a bare basename resolves anywhere in the tree, and only if it is there", () => {
  const ok = guard({ ...CLEAN, "docs/LIVE.md": "The page is `real.ts`.\n" });
  assert.equal(ok.code, 0, `a known basename was called dead\n${ok.out}`);

  const bad = guard({ ...CLEAN, "docs/LIVE.md": "The page is `Ghost.tsx`.\n" });
  assert.equal(bad.code, 1, `a basename that exists nowhere passed\n${bad.out}`);
});

check("routes, shapes and fenced blocks are left alone", () => {
  const r = guard({
    ...CLEAN,
    "docs/LIVE.md": [
      "Served at `/api/public/org.json` and `/.well-known/village.json`.",
      "Shapes: `server/lib/*`, `docs/modules/<id>.md`, `off|preview|members`.",
      "Build output `dist/index.js` is absent on a fresh clone.",
      "",
      "```",
      "See docs/EXAMPLE_IN_A_FENCE.md",
      "```",
      "",
      "Real: `server/real.ts`.",
    ].join("\n"),
  });
  assert.equal(r.code, 0, r.out);
  assert.equal(r.refs, 1, `expected only the real path to be checked, got ${r.refs}\n${r.out}`);
});

console.log(`\ncheck-doc-links.test.mjs: ${run} checks passed`);
