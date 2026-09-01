/**
 * A spawned test server must never inherit the developer's real database.
 *
 * `vitest.config.ts` loads `.env` into every test process through `setupFiles`,
 * and the built server calls `import "dotenv/config"` itself. So a child spawned
 * with `env: { ...process.env }` and no explicit `DATABASE_URL` would connect to
 * whatever DATABASE_URL that .env names, which on a contributor's machine is
 * their real village and on the founder's machine is production's neighbour.
 *
 * All 41 spawning suites do pass `DATABASE_URL: testDb.url` today. Nothing
 * enforced it. That is a convention held across 41 hand-written files, and the
 * 42nd that forgets the line does not fail: it passes, against a real database,
 * writing as it goes. This is the one convention in this area whose failure
 * writes to a village, so it gets a guard rather than a comment.
 *
 * The check is deliberately blunt: if a file spawns `dist/index.js`, then the
 * env object of that spawn must name DATABASE_URL. It does not try to prove the
 * value is a scratch schema, because the value is a variable; provisionTestDb
 * is the only thing in this tree that produces one.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
// `--dir <path>` lets the self-test beside this file point the guard at a
// fixture tree. Without it a guard can only be proven by editing the real
// one, which is how guards end up never having been seen to refuse.
const dirArg = process.argv.indexOf("--dir");
const DIR = dirArg !== -1 && process.argv[dirArg + 1]
  ? path.resolve(process.argv[dirArg + 1])
  : path.join(ROOT, "server");

const problems = [];
let spawning = 0;
let spawns = 0;

for (const f of fs.readdirSync(DIR).filter((n) => /\.test\.ts$/.test(n)).sort()) {
  const src = fs.readFileSync(path.join(DIR, f), "utf8");
  if (!src.includes("spawn(process.execPath")) continue;
  spawning += 1;
  const lines = src.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (!/spawn\(process\.execPath/.test(lines[i])) continue;
    spawns += 1;
    // The spawn's own options object: from this line to the first line that
    // closes it at the same indentation.
    const indent = (lines[i].match(/^\s*/) ?? [""])[0];
    let body = "";
    for (let j = i; j < Math.min(i + 60, lines.length); j++) {
      body += `${lines[j]}\n`;
      if (j > i && lines[j].startsWith(`${indent}})`)) break;
    }
    if (!/\bDATABASE_URL\s*:/.test(body)) {
      problems.push(
        `${f}:${i + 1} spawns the built server without naming DATABASE_URL in its env. ` +
          `The child inherits process.env and the bundle loads dotenv itself, so it would ` +
          `connect to the DATABASE_URL in .env: a real village, written to by a test.`,
      );
    }
  }
}

if (spawning === 0) {
  console.error(
    "FAIL -- no suite was found spawning dist/index.js. Either the spawn shape changed or this " +
      "guard is looking in the wrong place; both are failures, not a clean run.",
  );
  process.exit(1);
}

if (problems.length > 0) {
  console.error(`FAIL -- ${problems.length} spawned server(s) with no scratch database:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(
  `E2E database isolation guard passed. ${spawns} spawn(s) of the built server across ` +
    `${spawning} file(s), every one of them pointed at its own scratch schema.`,
);
