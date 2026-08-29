/**
 * THE SECOND CLASS: a real ZERO drawn as an ABSENCE.
 *
 * `x.length === 0` is an honest emptiness test. What is not honest is a
 * NUMBER guarded on falsiness, because 0 and "no reading" then take the same
 * branch and the page says "none yet" about a measured zero. Lane G-D found
 * one of these in round 6: a mark function returned "none" for any value of
 * zero, so 0% agreement, which is the strongest disagreement the engine can
 * measure, was drawn as an absence.
 *
 * This starts from the ABSENCE SENTENCE and walks back to the guard that
 * produces it, rather than starting from a guard and guessing whether it is
 * numeric. It prints two numbers: how many absence literals exist, and how
 * many of those are produced by a bare falsiness test with no explicit
 * null-or-zero predicate. The second number is the list to read by hand.
 *
 *   node scripts/qa/r6-signpost/zero-as-absence.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOTS = ["client/src", "server", "shared"];

const ABSENCE = new RegExp(
  `["'\`]\s*(none( yet| given)?|nothing( yet)?|no reading( yet)?|not set( yet)?|not recorded` +
    `|nobody( yet)?|never( read| set)?|not yet|no data|unknown|n/a|no result)\s*[.!]?\s*["'\`]`,
  "i",
);
const FALSY = /(?:!\s*([A-Za-z_$][\w$.?[\]]*)\s*[?&|)]|([A-Za-z_$][\w$.?[\]]*)\s*\?\s|([A-Za-z_$][\w$.?[\]]*)\s*\|\|)/;
/** A guard that NAMES its predicate is telling 0 from absent on purpose. */
const EXPLICIT =
  /(===\s*null|!==\s*null|===\s*undefined|!==\s*undefined|==\s*null|!=\s*null|\.length|isFinite|isNaN|===\s*0|!==\s*0|>\s*0|<\s*0|>=\s*0|\?\?|\.trim\(\)|Array\.isArray)/;

const files = [];
for (const r of ROOTS) {
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") walk(p);
      } else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) files.push(p);
    }
  })(path.join(process.cwd(), r));
}

let absence = 0;
const risky = [];
for (const f of files) {
  const rel = path.relative(process.cwd(), f).split(path.sep).join("/");
  const lines = fs.readFileSync(f, "utf8").split(/\r?\n/);
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) return;
    if (!ABSENCE.test(t)) return;
    absence++;
    const expr = `${lines[i - 1] ?? ""} ${t}`;
    if (!FALSY.test(expr) || EXPLICIT.test(expr)) return;
    risky.push({ rel, line: i + 1, code: t.slice(0, 150) });
  });
}

console.log(`FILES: ${files.length}`);
console.log(`ABSENCE LITERALS: ${absence}`);
console.log(`  produced by a bare falsiness guard, read these by hand: ${risky.length}`);
for (const h of risky) console.log(`${h.rel}:${h.line}\n    ${h.code}`);
