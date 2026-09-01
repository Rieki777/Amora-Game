/**
 * Two e2e suites may never be able to pick the same port.
 *
 * WHAT WENT WRONG. Every suite that boots the built server picks a port by
 * hand, as `BASE + (process.pid % WIDTH)`. Nothing checked the arithmetic, and
 * it had drifted badly:
 *
 *   - `server/modulePool.e2e.test.ts` used a FIXED port, 8127, the only one of
 *     48 declarations that did not derive from the pid. Two other suites'
 *     windows contained it. Reproduced by standing an ordinary server on 8127
 *     and running the suite: it fails with `founder must hold a session:
 *     expected '' to be truthy`, byte-identical to the flake nobody could name.
 *   - Five base numbers were used by eleven files. `fileParallelism: false`
 *     means one worker pid for the whole run, so two files sharing a base
 *     resolve to the SAME port in every run, back to back, while afterAll's
 *     `child?.kill()` has already returned without waiting for the socket.
 *   - Several suites also stand up STUB servers on ports named something other
 *     than PORT (GOOGLE_PORT, BARE_PORT, STUB_PORT, RPC_STUB_PORT). Every
 *     hand-written survey of this tree, including the ones quoted in the test
 *     files' own comments, grepped for `process.pid %` and missed the derived
 *     ones entirely.
 *   - `server/governance.routes.e2e.test.ts` carried a comment claiming its
 *     window was "PROVABLY clear of every other suite" and telling the reader
 *     to re-grep before trusting it. Nobody had since 2026-08-22, and by then
 *     `uploadStrip` overlapped it by 300 ports.
 *
 * A survey in a comment is a survey that goes stale. This is the same survey,
 * executable, so it cannot.
 *
 * THE RULE: windows must be DISJOINT, not merely unequal for the current pid.
 * Two overlapping windows are safe inside one run (shared pid, constant offset)
 * and unsafe between two concurrent runs, which is this project's normal
 * working mode. Disjoint windows cost nothing and remove that whole class.
 *
 * Two windows in the SAME file are allowed to overlap, and one pair does:
 * loop.e2e's stub ports are `PORT + 1` and `PORT + 2`, inside PORT's own
 * 2,000-wide window. Within a run the pid is fixed, so those are three
 * different ports; between two concurrent runs of the same file they can
 * collide, and no hand-allocated scheme can prevent that. Binding port 0 and
 * reading the assigned port back would. That is the next step, not this one.
 *
 * Ports stay below 32768 on purpose: Linux hands out 32768-60999 as ephemeral
 * source ports, so a suite binding up there can lose to an ordinary outbound
 * connection on CI and nowhere else.
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

/** Linux's default ephemeral range starts here; a bound test port must stay below it. */
const EPHEMERAL_FLOOR = 32768;

const NAME = "[A-Z][A-Z_0-9]*";
const isPort = (n) => n.includes("PORT");
const RE_BASE = new RegExp(
  `const\\s+(${NAME})\\s*=\\s*(\\d+)\\s*\\+\\s*\\(process\\.pid\\s*%\\s*(\\d+)\\)\\s*;`,
  "g",
);
const RE_FIXED = new RegExp(`const\\s+(${NAME})\\s*=\\s*(\\d+)\\s*;`, "g");
const RE_DERIVED = new RegExp(`const\\s+(${NAME})\\s*=\\s*(${NAME})\\s*\\+\\s*(\\d+)\\s*;`, "g");

const windows = [];
const fixed = [];
const problems = [];

for (const f of fs.readdirSync(DIR).filter((n) => /\.test\.ts$/.test(n)).sort()) {
  const src = fs.readFileSync(path.join(DIR, f), "utf8");
  const own = [];
  let m;
  RE_BASE.lastIndex = 0;
  while ((m = RE_BASE.exec(src))) if (isPort(m[1])) own.push({ name: m[1], lo: +m[2], hi: +m[2] + +m[3] - 1 });
  RE_DERIVED.lastIndex = 0;
  const derived = [];
  while ((m = RE_DERIVED.exec(src))) if (isPort(m[1])) derived.push({ name: m[1], from: m[2], offset: +m[3] });
  RE_FIXED.lastIndex = 0;
  while ((m = RE_FIXED.exec(src))) {
    if (!isPort(m[1])) continue;
    if (own.some((d) => d.name === m[1]) || derived.some((d) => d.name === m[1])) continue;
    fixed.push({ file: f, name: m[1], port: +m[2] });
    own.push({ name: m[1], lo: +m[2], hi: +m[2] });
  }
  for (const d of derived) {
    const base = own.find((o) => o.name === d.from);
    if (!base) {
      problems.push(`${f}: ${d.name} is derived from ${d.from}, which this guard cannot find.`);
      continue;
    }
    own.push({ name: d.name, lo: base.lo + d.offset, hi: base.hi + d.offset });
  }
  for (const d of own) windows.push({ file: f, ...d });
}

if (windows.length === 0) {
  problems.push(
    "no e2e port windows found at all. Either the declarations changed shape or this guard is " +
      "looking in the wrong place; both are failures, not a clean run.",
  );
}

for (const f of fixed) {
  problems.push(
    `${f.file}: \`const ${f.name} = ${f.port};\` is a FIXED port. Every other suite derives one ` +
      `from the pid, so this is the one declaration that is identical in two concurrent runs. ` +
      `Write it as \`BASE + (process.pid % 400)\` in a window no other suite uses.`,
  );
}

for (const w of windows) {
  if (w.hi >= EPHEMERAL_FLOOR) {
    problems.push(
      `${w.file}: ${w.name} reaches ${w.hi}, inside Linux's ephemeral source-port range ` +
        `(${EPHEMERAL_FLOOR}+). It can lose the bind to an ordinary outbound connection on CI ` +
        `and never once on a developer's machine.`,
    );
  }
}

for (let i = 0; i < windows.length; i++) {
  for (let j = i + 1; j < windows.length; j++) {
    const a = windows[i];
    const b = windows[j];
    if (a.file === b.file) continue;
    if (a.hi < b.lo || b.hi < a.lo) continue;
    problems.push(
      `overlapping windows: ${a.file}:${a.name} [${a.lo}-${a.hi}] and ${b.file}:${b.name} ` +
        `[${b.lo}-${b.hi}]. Give one of them a window of its own.`,
    );
  }
}

if (problems.length > 0) {
  console.error(`FAIL -- ${problems.length} e2e port problem(s):`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

const lo = Math.min(...windows.map((w) => w.lo));
const hi = Math.max(...windows.map((w) => w.hi));
console.log(
  `e2e port guard passed. ${windows.length} window(s) across ` +
    `${new Set(windows.map((w) => w.file)).size} file(s), disjoint between files, ${lo}-${hi}, ` +
    `clear of the ${EPHEMERAL_FLOOR}+ ephemeral range.`,
);
