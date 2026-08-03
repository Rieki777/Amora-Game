/**
 * The guard's own guard.
 *
 * Two bugs made check-brand-refs report a different answer for the same
 * commit depending on the machine it ran on, and both were invisible because
 * the script only ever printed a number nobody could check:
 *
 *   1. CRLF. JavaScript's dot excludes the carriage return, so an anchored
 *      line-comment rule never reached the end of a line on a Windows
 *      checkout and NO comment was stripped. Every comment naming the
 *      village counted as code, and the baseline could never match its tree.
 *   2. Protocols. A URL contains a double slash, so the old rule cut the
 *      line there and any name after it became invisible. 41 real
 *      references hid behind that.
 *
 * The fixtures use a placeholder token, never a real village name: these
 * functions are about telling code from commentary and know nothing about
 * which words are banned. This file also lives in a ratchet zone, where a
 * new file's allowance is zero.
 *
 * Run: node scripts/check-brand-refs.test.mjs
 */
import assert from "node:assert";
import { cutLineComment, stripComments } from "./brand-strip.mjs";

/** Stands in for whatever a fork puts in BANNED. */
const TOKEN = /\bvillagename/i;
let run = 0;
const check = (name, fn) => { fn(); run += 1; console.log(`  PASS  ${name}`); };

console.log("\ncheck-brand-refs: telling code from commentary\n");

check("strips a line comment", () => {
  assert.strictEqual(cutLineComment("const a = 1; // villagename"), "const a = 1; ");
});

check("KEEPS a URL that merely contains a double slash", () => {
  const line = 'const u = "https://villagename.example/x";';
  assert.strictEqual(cutLineComment(line), line);
  assert.ok(TOKEN.test(stripComments(line, ".ts")), "a name inside a URL must stay visible");
});

check("strips a comment that FOLLOWS a URL", () => {
  const line = 'const u = "https://example.test/x"; // villagename lives here';
  assert.strictEqual(cutLineComment(line), 'const u = "https://example.test/x"; ');
});

check("survives CRLF: the comment is still stripped", () => {
  const line = '  | "brand" // the overlay that renames a fork, villagename\r';
  assert.ok(!TOKEN.test(stripComments(line, ".ts")), "a CRLF comment must not count as code");
});

check("survives CRLF: a string is still COUNTED", () => {
  const line = '  const name = "villagename";\r';
  assert.ok(TOKEN.test(stripComments(line, ".ts")), "a CRLF code line must still count");
});

check("respects quotes of every flavour", () => {
  assert.strictEqual(cutLineComment("const a = '// not a comment';"), "const a = '// not a comment';");
  assert.strictEqual(cutLineComment("const a = `// not a comment`;"), "const a = `// not a comment`;");
});

check("handles an escaped quote inside a string", () => {
  const line = 'const a = "she said \\"//\\" out loud"; // villagename';
  assert.strictEqual(cutLineComment(line), 'const a = "she said \\"//\\" out loud"; ');
});

check("strips SQL comments, and only in SQL", () => {
  assert.ok(!TOKEN.test(stripComments("SELECT 1; -- villagename", ".sql")));
  assert.ok(TOKEN.test(stripComments("const a = 'x'; -- villagename", ".ts")), "a double dash is not a comment in TypeScript");
});

check("treats a JSDoc continuation as commentary", () => {
  assert.strictEqual(stripComments(" * built for villagename", ".ts"), "");
});

console.log(`\n${run} check(s) passed\n`);
