#!/usr/bin/env node
/**
 * THE SAVE HONESTY GUARD: a control that says a change landed read the answer.
 *
 * A sweep of all 434 `fetch` calls in `client/src`, 187 of them mutating,
 * found seventeen sites reporting success without asking the server. Six were
 * outright lies. `ContentEditorTab`'s button read "Saved!" on any answer at
 * all, and that route sits behind `story.tell`: a village holding that power
 * answers with the 409 the break-glass turns into a question, so an operator
 * who read that question and chose "Leave it" was shown "Saved!" for the
 * change they had just declined. Four delete handlers toasted "Deleted" out
 * of a `catch` that only ever fired on a dead network.
 *
 * Every one of those six shares one syntactic property, and it is the only
 * one this script looks for: THE RESPONSE WAS THROWN AWAY. Not misread, not
 * read and mishandled. Never held at all. That is cheap to see from the
 * syntax tree alone, and it needs no types, no dataflow and no runtime.
 *
 *   `await fetch(url, { method: "DELETE" });`   as a statement of its own
 *   `fetch(url, { method: "POST" }).then((r) => r.json())`   with no `.ok`
 *
 * Both leave the browser holding a body, or nothing, and no status. Whatever
 * the control says next, it says without evidence.
 *
 * ── WHAT THIS CANNOT SEE, MEASURED AND NOT GUESSED ────────────────────────
 *
 * Written down here so nobody rebuilds a bigger version of it in the belief
 * that the bigger version was never tried. Of the seventeen sites, this
 * shape catches the six and misses the other eleven, on purpose:
 *
 *   A HELPER THAT CHECKS THE STATUS AND LIES IN ITS RETURN VALUE. It was the
 *   worst of the seventeen: `SeasonPatternsTab`'s `call` read `res.ok` and
 *   then returned the ERROR BODY on a refusal where its ten siblings in that
 *   file return null. An object is truthy, so `setPlan(await call(...))` drew
 *   a season plan out of an error. Catching that needs value-flow across a
 *   helper boundary, which is a type-checker's job and not a syntax walk's.
 *
 *   THE OPTIMISTIC WRITE. This passes the moment `if (res.ok)` exists
 *   anywhere in the chain, so it is blind to all eight sites where the defect
 *   was what the caller DID with the answer: both admin lists and all six
 *   writes on the founders' tracker rolled the screen back inside a `catch`,
 *   and `fetch` resolves on a 401 exactly the way it resolves on a 200.
 *
 *   THE SILENCE. Three admin writes let a list refresh stand in for an
 *   answer, and `GuideChat` did nothing at all. Proving that a failure path
 *   reaches a RENDERED NODE is a render-tree question. Nothing static and
 *   cheap answers it.
 *
 *   "LANDS WHERE NOTHING READS IT". That is a server-side reachability
 *   question and it belongs to `check-repo-payloads.mjs` and
 *   `check-admin-reach.mjs`, which already ask it from the other end.
 *
 * One more, smaller: a chain is treated as honest when it mentions `.ok` or
 * `.status` anywhere inside it, and this cannot tell `res.status` from a
 * `status` field on a parsed body. That direction was chosen deliberately.
 * A gate whose false positives cost a waiver on honest code gets waived
 * everywhere, and then it guards nothing.
 *
 * ── THE WAIVER ────────────────────────────────────────────────────────────
 *
 * Some writes really are best-effort, and the sweep found seven that are
 * deliberate and documented: sign-out must finish whether or not the server
 * hears, the notification badge recovers on the next poll, the map speaks its
 * failure off the body shape, and three local-first preferences are honest
 * about which side is the source. Those take an inline `save-ok: <reason>`
 * anywhere inside the statement being waived. Waivers are counted and printed
 * so they stay honest.
 *
 * ── WATCHED RED BEFORE IT WAS WIRED ──────────────────────────────────────
 *
 * Against the REAL pre-fix tree and not a mock, because a red on a mock only
 * proves the mock was written to fail. The three files `e238103` repaired,
 * read back out of `e238103^` and scanned as they stood: exit 1, sixteen
 * sites named with file and line, `PUT /admin/content` and the submissions
 * DELETE among them.
 *
 * The same run is the evidence for the blind spots above, which is the more
 * useful half. `GuideChat.tsx` was one of the three files and reports ZERO,
 * because its defect was silence. `SeasonPatternsTab`'s helper is not in the
 * list either. Neither of those is a hole discovered later; both are stated
 * up there, and this run is what turns the statement into a measurement.
 *
 * ── AUDITING THE ONE BLIND SPOT THAT IS NOT A DESIGN CHOICE ───────────────
 *
 * `--unread` prints the calls whose method the syntax does not state, because
 * a count says "there are seven" and only a list lets somebody check that
 * none of the seven is a save. At this ref all seven either hold the Response
 * in a variable or return it to a caller, and one of them is `gameFetch`
 * itself, so the shape this gate hunts is not hiding in any of them.
 *
 * Usage: node scripts/check-save-honesty.mjs [--json] [--unread] [path ...]
 */
import fs from "fs";
import path from "path";
import ts from "typescript";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"),
  "..",
);

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "build", "coverage", ".vite"]);

/** The browser is where a control says "saved", so it is the whole scope. */
const SCAN_ROOTS = ["client/src"];

/** The two ways this client reaches the server. */
const FETCHERS = new Set(["fetch", "gameFetch"]);

/** A GET cannot lie about a save. */
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const isTest = (rel) => /\.(test|spec)\.tsx?$/.test(rel) || rel.includes("__tests__");

function walkFiles(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walkFiles(path.join(dir, entry.name), out);
    } else if (/\.tsx?$/.test(entry.name)) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

/**
 * The method this call sends, or null when the syntax does not say.
 *
 * Null is not "GET". A caller passing an options variable, or a method held
 * in one, is a call this script cannot read, and those are COUNTED and
 * printed instead of being quietly assumed harmless. Staying silent on what
 * it cannot read whole is what lets it be a hard gate.
 */
function methodOf(call) {
  const init = call.arguments[1];
  if (!init) return "GET";
  if (!ts.isObjectLiteralExpression(init)) return null;
  let spread = false;
  for (const prop of init.properties) {
    if (ts.isSpreadAssignment(prop)) { spread = true; continue; }
    if (!ts.isPropertyAssignment(prop)) continue;
    const key = prop.name && prop.name.getText().replace(/['"]/g, "");
    if (key !== "method") continue;
    const v = prop.initializer;
    if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) return v.text.toUpperCase();
    return null;
  }
  // `fetch(url, { ...opts, headers })` can carry `method` inside the spread,
  // and calling that a GET would hide a mutating call behind a shape the
  // script simply cannot see. Unread is the honest answer, and unread is
  // printed on every run.
  return spread ? null : "GET";
}

/**
 * The outermost expression this call's value is still flowing through.
 *
 * Climbing `.then().catch()`, `await`, `void`, parentheses and casts, so the
 * question "was the Response held" is asked of the whole chain and never of
 * one link in it.
 */
function chainTop(call) {
  let node = call;
  for (;;) {
    const p = node.parent;
    if (!p) return node;
    const climbs =
      (ts.isPropertyAccessExpression(p) && p.expression === node) ||
      (ts.isCallExpression(p) && p.expression === node) ||
      ts.isAwaitExpression(p) ||
      ts.isVoidExpression(p) ||
      ts.isParenthesizedExpression(p) ||
      ts.isNonNullExpression(p) ||
      ts.isAsExpression(p);
    if (!climbs) return node;
    node = p;
  }
}

/** Does anything in this chain read the Response's status? */
function readsStatus(top) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isPropertyAccessExpression(n) && (n.name.text === "ok" || n.name.text === "status")) {
      found = true;
      return;
    }
    ts.forEachChild(n, visit);
  };
  visit(top);
  return found;
}

/**
 * Does this chain hand the whole Response to a named function?
 *
 * This is the difference between "thrown away" and "read somewhere else", and
 * getting it wrong is what makes a gate useless. Fourteen honest sites in this
 * client pass the Response straight on: seven through `readRefusal(r)` in
 * `ExampleRefusal.tsx`, and `YourAgentPanel`'s `.then(json<any>)`, which
 * returns `{ ok, status, data }`. Both read the status a function call away,
 * and a syntax walk that called them liars would have earned fourteen waivers
 * on correct code before it ever caught a defect.
 *
 * Two ways the Response leaves this chain intact: `.then(namedFunction)`, or
 * a callback that passes its own parameter on as an argument. Whichever
 * function receives it is where the reading now happens, and whether that
 * function is honest is the blind spot this file's header opens with.
 */
function handedOff(top) {
  let held = false;
  const passesParamOn = (fn) => {
    const p = fn.parameters[0];
    if (!p || !ts.isIdentifier(p.name)) return false;
    const name = p.name.text;
    let passed = false;
    const seek = (n) => {
      if (passed) return;
      if (ts.isCallExpression(n)) {
        for (const a of n.arguments) if (ts.isIdentifier(a) && a.text === name) passed = true;
      }
      if (!passed) ts.forEachChild(n, seek);
    };
    seek(fn.body ?? fn);
    return passed;
  };
  const visit = (n) => {
    if (held) return;
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === "then"
    ) {
      for (const arg of n.arguments) {
        const isLiteralFn = ts.isArrowFunction(arg) || ts.isFunctionExpression(arg);
        if (!isLiteralFn || passesParamOn(arg)) { held = true; return; }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(top);
  return held;
}

/** Does this chain reach a `.then` at all? */
function hasThen(top) {
  let found = false;
  const visit = (n) => {
    if (found) return;
    if (ts.isPropertyAccessExpression(n) && n.name.text === "then") found = true;
    else ts.forEachChild(n, visit);
  };
  visit(top);
  return found;
}

const args = process.argv.slice(2);
const asJson = args.includes("--json");
/**
 * Print the calls whose method could not be read, so the blind spot can be
 * audited instead of merely counted. A number says "there are seven"; only
 * the list lets somebody check that none of the seven is a save.
 */
const showUnread = args.includes("--unread");
const roots = args.filter((a) => !a.startsWith("--"));

const files = [];
for (const r of (roots.length ? roots : SCAN_ROOTS)) {
  const abs = path.join(ROOT, r);
  if (!fs.existsSync(abs)) continue;
  if (fs.statSync(abs).isDirectory()) walkFiles(abs, files);
  else files.push(abs);
}

const findings = [];
let waived = 0;
const unreadSites = [];
let unread = 0;
let mutating = 0;

for (const file of files) {
  const rel = path.relative(ROOT, file).replace(/\\/g, "/");
  if (isTest(rel)) continue;
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(
    file, text, ts.ScriptTarget.Latest, true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const lines = text.split("\n");

  const visit = (node) => {
    ts.forEachChild(node, visit);
    if (!ts.isCallExpression(node)) return;
    if (!ts.isIdentifier(node.expression) || !FETCHERS.has(node.expression.text)) return;

    const method = methodOf(node);
    if (method === null) {
      unread++;
      const at = sf.getLineAndCharacterOfPosition(node.getStart()).line;
      unreadSites.push({ file: rel, line: at + 1, text: (lines[at] ?? "").trim().slice(0, 110) });
      return;
    }
    if (!MUTATING.has(method)) return;
    mutating++;

    const top = chainTop(node);
    if (readsStatus(top) || handedOff(top)) return;
    // Two shapes, one property: nothing is left holding the Response.
    const dropped = top.parent && ts.isExpressionStatement(top.parent);
    const jsonOnly = hasThen(top);
    if (!dropped && !jsonOnly) return;

    const start = sf.getLineAndCharacterOfPosition(top.getStart()).line;
    const end = sf.getLineAndCharacterOfPosition(top.getEnd()).line;
    for (let i = start; i <= end; i++) {
      if (/save-ok:/.test(lines[i] ?? "")) { waived++; return; }
    }
    findings.push({
      file: rel,
      line: start + 1,
      method,
      shape: dropped ? "discarded" : "body-only",
      text: (lines[start] ?? "").trim().slice(0, 120),
    });
  };
  visit(sf);
}

if (asJson) {
  console.log(JSON.stringify(findings, null, 0));
  process.exit(0);
}

if (showUnread) {
  console.log(`Calls whose method this cannot read: ${unreadSites.length}`);
  for (const u of unreadSites) console.log(`  ${u.file}:${u.line}  ${u.text}`);
  console.log("");
}

const scanned = `${mutating} mutating call(s) across ${files.length} file(s)`;
if (!findings.length) {
  console.log(`Save honesty: clean, ${scanned}.`);
  console.log(`  ${waived} waiver(s) via save-ok, ${unread} call(s) whose method this cannot read.`);
  process.exit(0);
}

const byFile = {};
for (const f of findings) (byFile[f.file] ||= []).push(f);

console.log(
  `Save honesty: ${findings.length} call(s) throw the Response away, ` +
  `in ${Object.keys(byFile).length} file(s). Scanned ${scanned}.\n`,
);
for (const [file, rows] of Object.entries(byFile).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`${file}  (${rows.length})`);
  for (const r of rows) {
    console.log(`  L${String(r.line).padEnd(6)}[${r.shape}] ${r.method}  ${r.text}`);
  }
}
console.log(`\n${waived} waiver(s) via save-ok, ${unread} call(s) whose method this cannot read.`);
console.log(
  "\ndiscarded: the call is a statement of its own, so nothing can read the answer." +
  "\nbody-only: the chain reaches .then() without ever touching .ok or .status." +
  "\nHold the Response and read its status, or write `save-ok: <reason>` inside the statement.",
);
process.exit(1);
