#!/usr/bin/env node
/**
 * A HAND-KEPT MAP OF SERVER VALUES, TYPED SO LOOSELY THE COMPILER CANNOT HELP.
 *
 * ── THE CLASS THIS EXISTS FOR ────────────────────────────────────────────
 * The client keeps small lookup tables beside the union types the server
 * actually sends: a hint per module lifecycle, a label per ballot outcome, an
 * icon per domain. Written as `Record<string, T>` they are a promise nobody
 * checks. Add a member to the union in `shared/` and every one of those maps
 * silently stops covering it, and the page renders NOTHING where a sentence
 * belonged. No error, no console line, no failing test: an empty paragraph.
 *
 * `Admin.tsx` did exactly that. `LIFECYCLE_HINT` was `Record<string, string>`
 * and `LIFECYCLE_HINT[m.lifecycle]` rendered the who-can-see-this sentence for
 * every module. Typed `Record<ModuleLifecycle, string>` the compiler checks the
 * whole thing for free, and a lifecycle added tomorrow is a build error rather
 * than a blank line on a founder's screen.
 *
 * ── WHAT IT SUGGESTS, AND WHY IT CANNOT COST ANYTHING ────────────────────
 * One rule. A map is flagged when ALL THREE hold:
 *
 *   1. it is annotated `Record<string, T>` or `{ [k: string]: T }`;
 *   2. its initialiser is an object literal whose keys are all string literals;
 *   3. that key set is EXACTLY the member set of a string-literal union type
 *      exported from `shared/`.
 *
 * Rule 3 is exact on purpose, and the exactness is the whole safety argument.
 * `Record<Union, T>` REQUIRES every member of the union, so suggesting it for a
 * map that covers only some of them would hand somebody a build error dressed
 * as a fix. Exact means the annotation compiles today, changes no runtime
 * behaviour and is strictly stronger tomorrow. A partial map is counted and
 * shown under `--table`, never demanded: the honest suggestion there is
 * `Partial<Record<Union, T>>`, and that one DOES change every read site, so it
 * is a judgement call rather than a gate.
 *
 * ── TWO THINGS THIS DELIBERATELY IS NOT ──────────────────────────────────
 * A sweep of `client/src` found 114 non-literal indexes into hand-kept maps,
 * and the two obvious ways to chase all of them were both measured and both
 * rejected. Recording that here so nobody spends the day again:
 *
 *   - `noUncheckedIndexedAccess` IS THE WRONG TOOL. It raises 282 errors
 *     repo-wide, and it does NOT flag `Record<Union, T>[keyTypedAsUnion]`,
 *     which is the exact shape of both crashes that shipped. Maximum cost,
 *     misses the defect.
 *
 *   - A FULL `check-mirror-index.mjs` IS NOT WORTH ITS WAIVER LIST. Of 78
 *     map-and-file pairs, 28 are safe by construction and only about 8 of those
 *     are recognisable to a static rule, so the rest would need a baseline
 *     ratchet that a reader stops reading. Worse: six of nine real fixes were
 *     ALREADY syntactically guarded, and the guard was stating something FALSE.
 *     No static rule tells an honest fallback from an invented one, and a gate
 *     that cannot tell the difference would have passed all six.
 *
 * This script is the half that survives that argument: it never judges a read,
 * so it never has to decide whether a fallback is honest. It only ever says
 * "the compiler could be doing this for you", and it says it about a type.
 *
 * ── ITS OWN BLIND SPOTS ──────────────────────────────────────────────────
 *   - IT READS DECLARATIONS, NEVER INDEXES. A map correctly typed
 *     `Record<Union, T>` and then read with a `string` key is invisible here,
 *     and so is `const m = MAP[x]` on one line with `m.icon` on the next. That
 *     second shape is a crash, it is the one a first-pass classifier
 *     under-counts by looking only at the immediate parent, and NOTHING here
 *     looks at it. The annotation is what makes the compiler able to see it;
 *     seeing it is the compiler's job after that.
 *
 *   - A UNION BUILT ANY OTHER WAY IS INVISIBLE. `typeof ARRAY[number]`,
 *     `keyof typeof OBJECT` and unions of unions are not read. Only a plain
 *     `export type X = "a" | "b"` in `shared/` counts.
 *
 *   - TWO UNIONS WITH THE SAME MEMBERS ARE INDISTINGUISHABLE. `ShapeId` and
 *     `PowerShape` hold the same seven strings, so a map matching one matches
 *     both. Every match is named and the human picks; guessing would be worse.
 *
 *   - A MAP BUILT FROM A SPREAD OR A COMPUTED KEY IS SKIPPED, and each skip is
 *     printed with its file and line rather than folded into the green.
 *
 * Usage:
 *   node scripts/check-mirror-annotations.mjs
 *   node scripts/check-mirror-annotations.mjs --table
 *   node scripts/check-mirror-annotations.mjs --json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHARED = path.join(ROOT, "shared");
const CLIENT = path.join(ROOT, "client", "src");

/**
 * A union of two members matches too much by accident: `{ north, south }`,
 * `{ admin, member }` and `{ open, founder }` are three different ideas that a
 * two-key map could hold for reasons of its own. Three is where a match starts
 * being evidence rather than coincidence.
 */
const MIN_UNION_MEMBERS = 3;

/** Floors. An empty read prints the same green as a clean tree unless it fails. */
const MIN_UNIONS = 8;
const MIN_MAPS = 30;

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

function files(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      files(p, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const parse = (file) =>
  ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);

const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;

// ── The unions the server speaks ─────────────────────────────────────────────

/** Every exported `type X = "a" | "b" | ...` under shared/, by member set. */
function readUnions() {
  const unions = [];
  const scanned = files(SHARED);
  for (const file of scanned) {
    const sf = parse(file);
    const visit = (node) => {
      if (
        ts.isTypeAliasDeclaration(node) &&
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) &&
        ts.isUnionTypeNode(node.type)
      ) {
        const members = [];
        for (const t of node.type.types) {
          if (ts.isLiteralTypeNode(t) && ts.isStringLiteral(t.literal)) members.push(t.literal.text);
          else return; // One non-literal member and this is not a key vocabulary.
        }
        if (members.length >= MIN_UNION_MEMBERS) {
          unions.push({ name: node.name.text, members, where: `${rel(file)}:${lineOf(sf, node)}` });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { unions, scanned: scanned.length };
}

// ── The hand-kept maps in the client ─────────────────────────────────────────

/** `Record<string, T>` or `{ [k: string]: T }`, as written. */
function looselyKeyed(typeNode) {
  if (!typeNode) return null;
  if (
    ts.isTypeReferenceNode(typeNode) &&
    ts.isIdentifier(typeNode.typeName) &&
    typeNode.typeName.text === "Record" &&
    typeNode.typeArguments?.length === 2 &&
    typeNode.typeArguments[0].kind === ts.SyntaxKind.StringKeyword
  ) {
    return { shape: "Record<string, …>", value: typeNode.typeArguments[1].getText() };
  }
  if (ts.isTypeLiteralNode(typeNode) && typeNode.members.length === 1) {
    const m = typeNode.members[0];
    if (ts.isIndexSignatureDeclaration(m) && m.parameters[0]?.type?.kind === ts.SyntaxKind.StringKeyword) {
      return { shape: "{ [k: string]: … }", value: m.type.getText() };
    }
  }
  return null;
}

/** The literal keys of an object literal, or why they could not be read. */
function keysOf(lit) {
  const keys = [];
  for (const p of lit.properties) {
    if (ts.isSpreadAssignment(p)) return { keys: null, why: "the literal carries a spread" };
    if (!p.name) return { keys: null, why: "a property has no readable name" };
    if (ts.isComputedPropertyName(p.name)) return { keys: null, why: "the literal carries a computed key" };
    if (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) keys.push(p.name.text);
    else return { keys: null, why: "a property name is not a plain string" };
  }
  return { keys, why: null };
}

function readMaps() {
  const maps = [];
  const skipped = [];
  const scanned = files(CLIENT);
  for (const file of scanned) {
    const sf = parse(file);
    const visit = (node) => {
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        // `const X: Record<string, T> = {…}` and `const X = {…} as Record<string, T>`
        let loose = looselyKeyed(node.type);
        let init = node.initializer;
        if (!loose && ts.isAsExpression(init)) {
          loose = looselyKeyed(init.type);
          init = init.expression;
        }
        if (loose && ts.isObjectLiteralExpression(init)) {
          const { keys, why } = keysOf(init);
          const where = `${rel(file)}:${lineOf(sf, node)}`;
          if (keys === null) skipped.push({ name: node.name.text, where, why });
          else maps.push({ name: node.name.text, where, keys, ...loose });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { maps, skipped, scanned: scanned.length };
}

// ── The comparison ───────────────────────────────────────────────────────────

const { unions, scanned: sharedFiles } = readUnions();
const { maps, skipped, scanned: clientFiles } = readMaps();

const sig = (list) => [...list].sort().join(" ");
const byMembers = new Map();
for (const u of unions) {
  const k = sig(u.members);
  if (!byMembers.has(k)) byMembers.set(k, []);
  byMembers.get(k).push(u);
}

const exact = [];
const partial = [];
for (const m of maps) {
  const hit = byMembers.get(sig(m.keys));
  if (hit) { exact.push({ ...m, unions: hit }); continue; }
  if (m.keys.length === 0) continue;
  const covers = unions.filter((u) => m.keys.every((k) => u.members.includes(k)) && m.keys.length < u.members.length);
  if (covers.length) partial.push({ ...m, unions: covers });
}

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({
    sharedFiles, clientFiles,
    unions: unions.map((u) => ({ name: u.name, members: u.members, where: u.where })),
    maps: maps.length,
    skipped,
    exact: exact.map((e) => ({ name: e.name, where: e.where, keys: e.keys, value: e.value, suggest: e.unions.map((u) => u.name) })),
    partial: partial.map((e) => ({ name: e.name, where: e.where, keys: e.keys, suggest: e.unions.map((u) => u.name) })),
  }, null, 2));
  process.exit(exact.length > 0 ? 1 : 0);
}

console.log(`  ${sharedFiles} file(s) under shared/ gave ${unions.length} exported string union(s) of ${MIN_UNION_MEMBERS}+ members`);
console.log(`  ${clientFiles} file(s) under client/src gave ${maps.length} loosely-keyed literal map(s), ${skipped.length} not readable statically`);
console.log(`  ${partial.length} map(s) cover PART of a union, which this gate reports and does not demand`);
for (const s of skipped) console.log(`    not checked  ${s.where}  ${s.name}: ${s.why}`);

if (process.argv.includes("--table")) {
  console.log("");
  for (const p of partial) {
    console.log(`  partial  ${p.where}  ${p.name}: ${p.keys.length} of ${p.unions[0].members.length} ${p.unions.map((u) => u.name).join(" / ")}`);
  }
  console.log("");
}

let broke = false;
if (unions.length < MIN_UNIONS) {
  console.error(`::error::read only ${unions.length} exported string union(s) from ${sharedFiles} file(s) under shared/, below the ${MIN_UNIONS} this repo has had for a long time. That is a broken read, and every map below it would be compared against nothing.`);
  broke = true;
}
if (maps.length < MIN_MAPS) {
  console.error(`::error::found only ${maps.length} loosely-keyed literal map(s) in ${clientFiles} client file(s), below the ${MIN_MAPS} this client has carried for a long time. A gate that matches zero maps prints exactly the same green as a gate that checked them all.`);
  broke = true;
}
if (broke) process.exit(1);

if (exact.length > 0) {
  console.error("");
  console.error(`::error::${exact.length} hand-kept map(s) hold exactly the members of a union the server speaks, and are typed so the compiler cannot check them. Annotating the key type costs one line, changes nothing at runtime, and turns a future blank on the page into a build error.`);
  for (const e of exact) {
    const names = e.unions.map((u) => `${u.name} (${u.where})`).join(" or ");
    console.error(`  ${e.where}  ${e.name}: ${e.shape} holding all ${e.keys.length} member(s) of ${names}`);
    console.error(`      write:  Record<${e.unions[0].name}, ${e.value}>`);
  }
  console.error("");
  console.error("  Import the type from shared/ and change the key. If the annotation then");
  console.error("  refuses a read, that read was indexing the map with a plain string and the");
  console.error("  compiler has just found the next one of these for you.");
  process.exit(1);
}

console.log(`  every hand-kept map whose keys are a union the server speaks is annotated with that union`);
