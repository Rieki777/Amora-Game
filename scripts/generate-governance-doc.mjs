/**
 * NO SHEBANG, and it has to stay that way.
 *
 * This file is imported by a Vitest suite (server/db/governanceDoc.test.ts),
 * so it goes through Vite's transform as well as node. A SHEBANG AND CRLF LINE
 * ENDINGS TOGETHER make that transform throw `SyntaxError: Invalid or
 * unexpected token`; either one alone is fine. `core.autocrlf` is true on the
 * Windows checkouts this repository is developed on, so the failure appears
 * the first time a rebase hands the file back with carriage returns.
 * scripts/generate-token-doc.mjs carries the same note for the same reason,
 * having found it the same way. The self-test asserts the line is still gone.
 */
/**
 * docs/GOVERNANCE.md, written from the code instead of about it.
 *
 * WHY THIS IS A GENERATOR. A hand-written governance document is wrong within
 * a month and nothing says so, and it is wrong in the most expensive
 * direction: it describes the system somebody intended. So this file reads the
 * subject registry, the close dispatcher, the engine's arithmetic, the dials,
 * the capability tables, the module definition, the clock and the route
 * registrations, works out the facts, and emits the document.
 * `scripts/check-governance-doc.mjs` regenerates it and fails the build when
 * the emitted text and the committed text differ. The check is what makes the
 * document worth trusting. Without it this is a beautiful thing that lies.
 *
 * WHAT IT DESCRIBES. A FRESH village: what a village standing up a new
 * instance holds on the first boot. A village that has been running has its
 * own history on top of it.
 *
 * IT DESCRIBES WHAT IS TRUE, INCLUDING WHAT IS BROKEN. A subject type with no
 * executor is named as one. A rule that lives in two places that could
 * disagree names both. A ruling nobody has built yet says "not built" in those
 * words and carries a guard so it cannot go on saying that after somebody
 * builds it.
 *
 * EVERY READER IS ANCHORED AND FAILS LOUD. Anchors are exported symbols and
 * syntax, never line numbers: `server/index.ts` lost about 2,500 lines to
 * route extractions in the hours while this document was being specified, and
 * a reader anchored on a line would have gone quietly wrong. If the shape a
 * reader expects is gone, it throws with the file and the text it could not
 * read, and the build stops. A reader that silently returns nothing when the
 * code moves is worse than no reader, because the document keeps rendering and
 * loses a fact.
 *
 * THE SOURCES ARE MOVING UNDER THIS FILE ON PURPOSE. Other lanes are building
 * the steward, the criticality tiers, the changeset and the clock seam. When
 * their work lands, this guard goes red and the document is regenerated. That
 * is the design and not a defect.
 *
 * Usage:
 *   node scripts/generate-governance-doc.mjs            write docs/GOVERNANCE.md
 *   node scripts/generate-governance-doc.mjs --stdout   print it, write nothing
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

export const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"),
  "..",
);

export const DOC_PATH = path.join(ROOT, "docs", "GOVERNANCE.md");

/**
 * Every file this document is derived from. Existence is checked before
 * anything is parsed, so a rename fails with the path it wanted instead of
 * with a parse error twenty frames deep.
 */
export const SOURCES = [
  "shared/governanceEngine.ts",
  "shared/ballotSubjects.ts",
  "shared/gameVariables.ts",
  "shared/capabilities.ts",
  "shared/modules.ts",
  "shared/lunar.ts",
  "server/index.ts",
  "server/lib/ballots.ts",
  "server/lib/governanceWeights.ts",
  "server/lib/gameStart.ts",
  "server/lib/mechanics.ts",
  "server/lib/proposalDrafts.ts",
  "server/lib/gratitude-cycles.ts",
  "server/routes/governanceWizard.ts",
  "server/routes/governanceWeights.ts",
  "client/src/components/governance/wizardConfig.ts",
];

class ReadError extends Error {}

function fail(message) {
  throw new ReadError(`governance-doc: ${message}`);
}

// ── TypeScript: anchored reads of the code that decides how a village decides ─

const sourceCache = new Map();

function sourceFile(abs) {
  if (!sourceCache.has(abs)) {
    if (!fs.existsSync(abs)) fail(`${abs} is gone; the generator reads it`);
    sourceCache.set(abs, ts.createSourceFile(abs, fs.readFileSync(abs, "utf8"), ts.ScriptTarget.Latest, true));
  }
  return sourceCache.get(abs);
}

const absOf = (root, rel) => path.join(root, ...rel.split("/"));

function eachChild(node, fn) {
  node.forEachChild((child) => { fn(child); eachChild(child, fn); });
}

/**
 * `const NAME = ...` ANYWHERE in a file, not only at the top level.
 *
 * `SUBJECT_CLOSERS` lives inside `registerRoutes()` and not at module scope,
 * so a top-level-only lookup (which is all the token generator needs) would
 * report the dispatcher as missing and the document would lose the one table
 * that says what a passed vote does.
 */
function constAnywhere(abs, name) {
  const sf = sourceFile(abs);
  let found;
  eachChild(sf, (node) => {
    if (found) return;
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === name && node.initializer) {
      found = node.initializer;
    }
  });
  return found;
}

/** Where an imported name comes from, as an absolute path. */
function importSource(abs, name) {
  const sf = sourceFile(abs);
  for (const stmt of sf.statements) {
    if (!ts.isImportDeclaration(stmt) || !stmt.importClause?.namedBindings) continue;
    const bindings = stmt.importClause.namedBindings;
    if (!ts.isNamedImports(bindings)) continue;
    for (const el of bindings.elements) {
      if (el.name.text !== name) continue;
      const spec = stmt.moduleSpecifier.text;
      if (!spec.startsWith(".")) fail(`${name} is imported from "${spec}", which this reader cannot follow`);
      return { abs: path.resolve(path.dirname(abs), spec) + ".ts", exported: el.propertyName?.text ?? el.name.text };
    }
  }
  return null;
}

/**
 * A literal, or a name that resolves to one, following relative imports.
 *
 * `env` binds names to expressions the caller already resolved, which is how a
 * function's parameters reach its body when a call is inlined. It is empty for
 * every read that starts at a top-level constant.
 */
export function literalOf(node, abs, env = null) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.MinusToken) {
    return -literalOf(node.operand, abs, env);
  }
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression?.(node)) {
    return literalOf(node.expression, abs, env);
  }
  if (ts.isIdentifier(node)) {
    const bound = env?.get(node.text);
    if (bound) return literalOf(bound.node, bound.abs, bound.env ?? null);
    const local = constAnywhere(abs, node.text);
    if (local) return literalOf(local, abs);
    const imported = importSource(abs, node.text);
    if (imported) {
      const init = constAnywhere(imported.abs, imported.exported);
      if (!init) {
        fail(`${node.text} is imported into ${path.basename(abs)} but is not a const in ${path.basename(imported.abs)}`);
      }
      return literalOf(init, imported.abs);
    }
    fail(`cannot resolve the constant ${node.text} in ${path.basename(abs)}`);
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const bound = bindingOf(node, abs, env);
    return literalOf(bound.node, bound.abs, bound.env ?? null);
  }
  if (
    ts.isCallExpression(node)
    && ts.isIdentifier(node.expression)
    && node.expression.text === "String"
    && node.arguments.length === 1
  ) {
    return String(literalOf(node.arguments[0], abs, env));
  }
  fail(`${path.basename(abs)} holds a value this reader cannot read: ${node.getText().slice(0, 80)}`);
}

/**
 * The expression a name or a member access finally stands for, with the file
 * that expression lives in, so a later read resolves the next name against the
 * right imports.
 *
 * This exists because a setting's floor is written as the place the number
 * already lives (`TIER_FLOORS.structural.unityPct`,
 * `SUBJECT_THRESHOLDS[MINT_RULE].minQuorumPct`) instead of the number retyped
 * beside it. A reader that could not follow the member access would have to be
 * told those numbers by hand, which is the one thing this generator exists to
 * avoid: the document would then agree with itself and disagree with the code.
 */
function bindingOf(node, abs, env = null) {
  if (ts.isAsExpression(node) || ts.isParenthesizedExpression(node) || ts.isSatisfiesExpression?.(node)) {
    return bindingOf(node.expression, abs, env);
  }
  if (ts.isIdentifier(node)) {
    const bound = env?.get(node.text);
    if (bound) return bindingOf(bound.node, bound.abs, bound.env ?? null);
    const local = constAnywhere(abs, node.text);
    if (local) return bindingOf(local, abs);
    const imported = importSource(abs, node.text);
    if (imported) {
      const init = constAnywhere(imported.abs, imported.exported);
      if (!init) {
        fail(`${node.text} is imported into ${path.basename(abs)} but is not a const in ${path.basename(imported.abs)}`);
      }
      return bindingOf(init, imported.abs);
    }
    fail(`cannot resolve the constant ${node.text} in ${path.basename(abs)}`);
  }
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const key = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : String(literalOf(node.argumentExpression, abs, env));
    const holder = bindingOf(node.expression, abs, env);
    if (!ts.isObjectLiteralExpression(holder.node)) {
      fail(`${node.expression.getText().slice(0, 60)} in ${path.basename(abs)} is not an object this reader can index`);
    }
    for (const p of holder.node.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      if (propertyName(p.name, holder.abs) !== key) continue;
      return bindingOf(p.initializer, holder.abs, holder.env ?? null);
    }
    fail(`${path.basename(holder.abs)} declares no ${key} on ${node.expression.getText().slice(0, 60)}`);
  }
  return { node, abs, env };
}

/** `function NAME(...)` in a file, wherever it sits. */
function functionAnywhere(abs, name) {
  const sf = sourceFile(abs);
  let found;
  eachChild(sf, (node) => {
    if (found) return;
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
  });
  return found;
}

/**
 * The object a call to a small local helper returns, worked out from that
 * helper's own body with its parameters bound to the arguments at the call.
 *
 * This exists for `...tierFloors("constitutional")`. A spread is the one shape
 * `objectOf` used to walk past in silence, and it cost the subject table a row
 * reading `undefined%` on the day the tier floors landed. Nothing here guesses
 * what a function does: it inlines a body of `const` declarations followed by
 * one `return` of an object literal, and refuses any other shape, so a helper
 * that grows a branch stops the build instead of being assumed.
 */
function callObject(call, abs) {
  if (!ts.isIdentifier(call.expression)) {
    fail(`${path.basename(abs)} spreads a call this reader cannot follow: ${call.getText().slice(0, 60)}`);
  }
  const name = call.expression.text;
  let home = abs;
  let fn = functionAnywhere(abs, name);
  if (!fn) {
    const imported = importSource(abs, name);
    if (imported) {
      home = imported.abs;
      fn = functionAnywhere(home, imported.exported);
    }
  }
  if (!fn) fail(`${name}() is spread in ${path.basename(abs)} and this reader cannot find where it is declared`);

  const env = new Map();
  fn.parameters.forEach((param, i) => {
    if (!ts.isIdentifier(param.name)) fail(`${name}() takes a destructured parameter this reader cannot bind`);
    const arg = call.arguments[i];
    if (!arg) fail(`${name}() is called in ${path.basename(abs)} with fewer arguments than it declares`);
    env.set(param.name.text, { node: arg, abs, env: null });
  });

  const body = fn.body?.statements ?? [];
  let result;
  for (const stmt of body) {
    if (ts.isVariableStatement(stmt)) {
      for (const d of stmt.declarationList.declarations) {
        if (!ts.isIdentifier(d.name) || !d.initializer) fail(`${name}() declares a local this reader cannot bind`);
        env.set(d.name.text, { node: d.initializer, abs: home, env: new Map(env) });
      }
      continue;
    }
    if (ts.isReturnStatement(stmt)) {
      if (!stmt.expression) fail(`${name}() returns nothing, and a spread of it would contribute nothing`);
      result = stmt.expression;
      break;
    }
    fail(`${name}() does more than declare and return, so this reader will not guess what a spread of it means`);
  }
  if (!result) fail(`${name}() has no return this reader can read`);
  const shape = bindingOf(result, home, env);
  if (!ts.isObjectLiteralExpression(shape.node)) fail(`${name}() does not return an object literal, so it cannot be spread`);
  return objectOf(shape.node, shape.abs, shape.env ?? env);
}

/** A property name, including a `[CONSTANT]:` computed key resolved to a string. */
function propertyName(name, abs) {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  if (ts.isComputedPropertyName(name)) return String(literalOf(name.expression, abs));
  return null;
}

function objectOf(node, abs, env = null) {
  if (!ts.isObjectLiteralExpression(node)) fail(`expected an object literal in ${path.basename(abs)}`);
  const out = {};
  for (const p of node.properties) {
    // A spread is resolved or refused, and never skipped. Skipping one is how
    // `...tierFloors("constitutional")` dropped two floors out of a subject
    // and put `undefined%` in the table this document ships.
    if (ts.isSpreadAssignment(p)) {
      const source = ts.isCallExpression(p.expression)
        ? callObject(p.expression, abs)
        : (() => {
            const bound = bindingOf(p.expression, abs, env);
            if (!ts.isObjectLiteralExpression(bound.node)) {
              fail(`${path.basename(abs)} spreads something that is not an object: ${p.getText().slice(0, 60)}`);
            }
            return objectOf(bound.node, bound.abs, bound.env ?? null);
          })();
      Object.assign(out, source);
      continue;
    }
    if (!ts.isPropertyAssignment(p)) continue;
    const key = propertyName(p.name, abs);
    if (key === null) continue;
    out[key] = literalOf(p.initializer, abs, env);
  }
  return out;
}

/** `const NAME = [...]`, or a `new Set([...])`, read as a list of literals. */
function listConst(root, rel, name) {
  const abs = absOf(root, rel);
  const init = constAnywhere(abs, name);
  if (!init) fail(`${rel} no longer declares ${name}`);
  let arr = ts.isArrayLiteralExpression(init) ? init : undefined;
  if (!arr) eachChild(init, (n) => { if (!arr && ts.isArrayLiteralExpression(n)) arr = n; });
  if (!arr) fail(`${name} in ${rel} is not built from an array literal`);
  return arr.elements.map((e) => literalOf(e, abs));
}

/** An object const, as a plain object of literals. */
function recordConst(root, rel, name) {
  const abs = absOf(root, rel);
  const init = constAnywhere(abs, name);
  if (!init) fail(`${rel} no longer declares ${name}`);
  return objectOf(init, abs);
}

/** The members of a string-union type alias, by name. */
function unionOf(root, rel, name) {
  const abs = absOf(root, rel);
  const sf = sourceFile(abs);
  let found;
  eachChild(sf, (node) => {
    if (found || !ts.isTypeAliasDeclaration(node) || node.name.text !== name) return;
    if (!ts.isUnionTypeNode(node.type)) return;
    found = node.type.types.map((t) => {
      if (!ts.isLiteralTypeNode(t) || !ts.isStringLiteral(t.literal)) {
        fail(`${name} in ${rel} is no longer a union of string literals`);
      }
      return t.literal.text;
    });
  });
  if (!found) fail(`${rel} no longer declares a string union type ${name}`);
  return found;
}

// ── The readers ─────────────────────────────────────────────────────────────

/**
 * THE CLOSE DISPATCHER: which subject types execute anything when they pass.
 *
 * Read as the object literal assigned to `SUBJECT_CLOSERS`, plus every later
 * `SUBJECT_CLOSERS[X] = SUBJECT_CLOSERS.Y` alias, because the minting subject
 * reaches its executor that way and a reader of the literal alone would report
 * a binding vote as advisory. Absence from this table is the engine's
 * fail-safe direction: a subject type that is not a key conducts a real
 * decision and executes nothing.
 */
export function dispatcherKeys(root = ROOT) {
  const abs = absOf(root, "server/index.ts");
  const init = constAnywhere(abs, "SUBJECT_CLOSERS");
  if (!init) fail("server/index.ts no longer declares SUBJECT_CLOSERS; the close dispatcher is where a passed vote's effect is decided");
  if (!ts.isObjectLiteralExpression(init)) fail("SUBJECT_CLOSERS is no longer an object literal; this reader cannot follow it");
  const direct = [];
  const bodies = {};
  for (const p of init.properties) {
    if (!ts.isPropertyAssignment(p) && !ts.isMethodDeclaration(p) && !ts.isShorthandPropertyAssignment(p)) continue;
    const key = propertyName(p.name, abs);
    if (key === null) fail(`SUBJECT_CLOSERS holds a key this reader cannot read: ${p.getText().slice(0, 60)}`);
    direct.push(key);
    bodies[key] = p.getText();
  }
  if (!direct.length) fail("SUBJECT_CLOSERS is empty; a village where nothing executes is not a shape this document can describe");

  const aliases = [];
  const sf = sourceFile(abs);
  eachChild(sf, (node) => {
    if (!ts.isBinaryExpression(node) || node.operatorToken.kind !== ts.SyntaxKind.EqualsToken) return;
    if (!ts.isElementAccessExpression(node.left)) return;
    if (!ts.isIdentifier(node.left.expression) || node.left.expression.text !== "SUBJECT_CLOSERS") return;
    const key = String(literalOf(node.left.argumentExpression, abs));
    const right = node.right;
    let target = null;
    if (ts.isPropertyAccessExpression(right) && ts.isIdentifier(right.expression) && right.expression.text === "SUBJECT_CLOSERS") {
      target = right.name.text;
    } else if (ts.isElementAccessExpression(right) && ts.isIdentifier(right.expression) && right.expression.text === "SUBJECT_CLOSERS") {
      target = String(literalOf(right.argumentExpression, abs));
    }
    if (!target) fail(`SUBJECT_CLOSERS[${key}] is assigned something this reader cannot follow`);
    aliases.push({ key, sameAs: target });
  });
  for (const a of aliases) bodies[a.key] = bodies[a.sameAs] ?? "";
  return { direct, aliases, bodies, all: [...direct, ...aliases.map((a) => a.key)] };
}

/** What each kind of decision asks: the per-subject floors, as code holds them. */
export function subjectFloors(root = ROOT) {
  const abs = absOf(root, "shared/ballotSubjects.ts");
  const init = constAnywhere(abs, "SUBJECT_THRESHOLDS");
  if (!init) fail("shared/ballotSubjects.ts no longer declares SUBJECT_THRESHOLDS");
  if (!ts.isObjectLiteralExpression(init)) fail("SUBJECT_THRESHOLDS is no longer an object literal");
  const out = [];
  for (const p of init.properties) {
    if (!ts.isPropertyAssignment(p)) continue;
    const key = propertyName(p.name, abs);
    if (key === null) fail(`SUBJECT_THRESHOLDS holds a key this reader cannot read: ${p.getText().slice(0, 60)}`);
    out.push({ subject: key, ...objectOf(p.initializer, abs) });
  }
  if (!out.length) fail("SUBJECT_THRESHOLDS is empty; the launch floor is the one rule this document cannot render without");
  return out;
}

/** The engine's arithmetic: methods, choices, and what each method fixes. */
export function engineFacts(root = ROOT) {
  const rel = "shared/governanceEngine.ts";
  const abs = absOf(root, rel);
  const methods = listConst(root, rel, "BALLOT_METHODS");
  const choices = listConst(root, rel, "VOTE_CHOICES");
  const outcomes = unionOf(root, rel, "BallotOutcome");

  const sf = sourceFile(abs);
  let fn;
  eachChild(sf, (n) => { if (ts.isFunctionDeclaration(n) && n.name?.text === "dialsForMethod") fn = n; });
  if (!fn) fail(`${rel} no longer declares dialsForMethod(); the method presets are read from its switch`);
  let sw;
  eachChild(fn, (n) => { if (!sw && ts.isSwitchStatement(n)) sw = n; });
  if (!sw) fail("dialsForMethod() is no longer a switch; this reader cannot follow it");
  const presets = {};
  let sawDefault = false;
  for (const clause of sw.caseBlock.clauses) {
    const ret = clause.statements.find((s) => ts.isReturnStatement(s));
    if (!ret?.expression) fail("a dialsForMethod case does not return an object; this reader cannot follow it");
    const shape = ts.isObjectLiteralExpression(ret.expression) ? ret.expression : null;
    if (!shape) fail("a dialsForMethod case returns something other than an object literal");
    const unity = shape.properties.find((q) => ts.isPropertyAssignment(q) && propertyName(q.name, abs) === "unityPct");
    if (!unity) fail("a dialsForMethod case no longer returns unityPct");
    const stamped = ts.isNumericLiteral(unity.initializer) ? Number(unity.initializer.text) : null;
    if (ts.isDefaultClause(clause)) {
      sawDefault = true;
      if (stamped !== null) fail(`dialsForMethod's default stamps unity ${stamped}; the document assumes it takes the village's own`);
      continue;
    }
    presets[String(literalOf(clause.expression, abs))] = stamped;
  }
  if (!sawDefault) fail("dialsForMethod has no default clause, so no method takes the village's own unity");
  /*
   * A method the switch does not name falls to the default and takes the
   * village's own number. That is written out as an explicit null rather than
   * left absent: JSON.stringify drops an undefined value, so the machine
   * readable block would have carried nothing at all for the shipped default
   * method and a parser would have read the omission as "no such method".
   */
  for (const m of methods) if (!(m in presets)) presets[m] = null;
  return { methods, choices, outcomes, presets };
}

/** The ballot's own state machine, from the row shape the engine writes. */
export function ballotStatuses(root = ROOT) {
  const rel = "server/lib/ballots.ts";
  const abs = absOf(root, rel);
  const sf = sourceFile(abs);
  let found;
  eachChild(sf, (node) => {
    if (found || !ts.isInterfaceDeclaration(node) || node.name.text !== "BallotRow") return;
    const member = node.members.find((m) => ts.isPropertySignature(m) && ts.isIdentifier(m.name) && m.name.text === "status");
    if (!member?.type || !ts.isUnionTypeNode(member.type)) fail(`${rel}: BallotRow.status is no longer a union of string literals`);
    found = member.type.types.map((t) => {
      if (!ts.isLiteralTypeNode(t) || !ts.isStringLiteral(t.literal)) fail(`${rel}: BallotRow.status holds a member this reader cannot read`);
      return t.literal.text;
    });
  });
  if (!found) fail(`${rel} no longer declares interface BallotRow with a status field`);
  return found;
}

/** The dials, with the ring and the apply timing the platform resolves for each. */
export function governanceDials(root = ROOT) {
  const rel = "shared/gameVariables.ts";
  const abs = absOf(root, rel);
  const sf = sourceFile(abs);
  const founderKeys = new Set(listConst(root, rel, "FOUNDER_KEYS"));
  const founderCategories = new Set(listConst(root, rel, "FOUNDER_CATEGORIES"));
  const cycleKeys = listConst(root, rel, "CYCLE_APPLY_KEYS");

  const defs = [];
  eachChild(sf, (node) => {
    if (!ts.isObjectLiteralExpression(node)) return;
    const props = new Map();
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const key = propertyName(p.name, abs);
      if (key !== null) props.set(key, p.initializer);
    }
    if (!props.has("key") || !props.has("category") || !props.has("label") || !props.has("type")) return;
    const keyNode = props.get("key");
    if (!ts.isStringLiteral(keyNode)) return;
    const def = { key: keyNode.text };
    for (const field of ["category", "label", "type", "default", "unit", "ring", "applyTiming"]) {
      if (props.has(field)) def[field] = literalOf(props.get(field), abs);
    }
    for (const field of ["min", "max"]) {
      if (props.has(field)) def[field] = literalOf(props.get(field), abs);
    }
    /*
     * A `choices` list is written inline for most dials and hoisted into its
     * own const for one of them. Resolving the identifier matters: reading
     * only inline arrays reported that dial's bounds as its type, which told
     * a founder nothing about what they could set it to.
     */
    if (props.has("choices")) {
      let arr = props.get("choices");
      // `CHOICES.map((c) => ({ ...c }))` copies a hoisted list; the list is
      // what the document reports, so the copy is stepped through to it.
      if (
        ts.isCallExpression(arr) &&
        ts.isPropertyAccessExpression(arr.expression) &&
        arr.expression.name.text === "map"
      ) {
        arr = arr.expression.expression;
      }
      if (ts.isIdentifier(arr)) {
        const resolved = constAnywhere(abs, arr.text);
        if (!resolved) fail(`${rel}: the dial "${def.key}" takes its choices from ${arr.text}, which is not a const in this file`);
        arr = resolved;
      }
      if (ts.isAsExpression(arr)) arr = arr.expression;
      if (!ts.isArrayLiteralExpression(arr)) fail(`${rel}: the dial "${def.key}" has choices this reader cannot read`);
      def.choices = arr.elements.map((e) => objectOf(e, abs));
    }
    defs.push(def);
  });
  if (!defs.length) fail(`${rel} no longer holds any variable definitions this reader can see`);

  const ringOf = (def) => {
    if (def.ring) return def.ring;
    if (founderKeys.has(def.key)) return "founder";
    if (founderCategories.has(def.category)) return "founder";
    return "open";
  };
  const applyTimingOf = (def) => def.applyTiming ?? (cycleKeys.includes(def.key) ? "cycle-close" : "instant");

  const governance = defs
    .filter((d) => d.category === "Governance")
    .map((d) => ({ ...d, ring: ringOf(d), applyTiming: applyTimingOf(d) }));
  if (!governance.length) fail(`${rel} no longer holds a Governance category; the dials table is read from it`);

  /*
   * The stage multipliers carry an explicit `applyTiming: "cycle-close"`
   * instead of sitting in CYCLE_APPLY_KEYS, because they are generated per
   * rung from the ladder. Reading the Set alone would have the document report
   * ten cycle-timed dials when there are ten plus one per stage, so the
   * override is read as its own fact and its absence is a refusal.
   */
  const multipliers = constAnywhere(abs, "STAGE_MULTIPLIER_DEFS");
  if (!multipliers) fail(`${rel} no longer declares STAGE_MULTIPLIER_DEFS; the cycle-timed list reads its apply timing`);
  const multiplierTiming = /applyTiming:\s*"cycle-close"/.test(multipliers.getText());

  return {
    governance,
    allKeys: defs.map((d) => d.key),
    cycleApplyKeys: cycleKeys,
    stageMultipliersAreCycleTimed: multiplierTiming,
  };
}

/** Who may do what: the capability table, and which powers can be taken away. */
export function capabilityFacts(root = ROOT) {
  const rel = "shared/capabilities.ts";
  const all = listConst(root, rel, "ALL_CAPABILITIES");
  const labels = recordConst(root, rel, "CAPABILITY_LABELS");
  const deniable = recordConst(root, rel, "DENIABLE");
  const unlocks = recordConst(root, rel, "STAGE_UNLOCKS");
  const transferable = recordConst(root, rel, "TRANSFERABLE");
  for (const cap of all) {
    if (!(cap in labels)) fail(`${rel}: the capability "${cap}" has no entry in CAPABILITY_LABELS`);
    if (!(cap in deniable)) fail(`${rel}: the capability "${cap}" has no entry in DENIABLE`);
  }
  return { all, labels, deniable, unlocks, transferable };
}

/** The governance module: what it turns on, and what a fresh village has. */
export function moduleFacts(root = ROOT) {
  const rel = "shared/modules.ts";
  const abs = absOf(root, rel);
  const sf = sourceFile(abs);
  const lifecycles = unionOf(root, rel, "ModuleLifecycle");
  let found;
  eachChild(sf, (node) => {
    if (found || !ts.isObjectLiteralExpression(node)) return;
    const idProp = node.properties.find(
      (p) => ts.isPropertyAssignment(p) && propertyName(p.name, abs) === "id" && ts.isStringLiteral(p.initializer) && p.initializer.text === "governance",
    );
    if (!idProp) return;
    /*
     * Two other object literals in this file carry `id: "governance"`: a forum
     * category and a tools-hub category, both of them a label and a sort
     * order. The module definition is the one that also declares the prefixes
     * its routes mount behind, so that is what tells them apart. A reader that
     * took the first match reported the module as having no prefixes and lost
     * the 404 fact, which is the first thing this document says about a fresh
     * village.
     */
    const hasPrefixes = node.properties.some((p) => ts.isPropertyAssignment(p) && propertyName(p.name, abs) === "apiPrefixes");
    if (!hasPrefixes) return;
    const out = { id: "governance" };
    for (const p of node.properties) {
      if (!ts.isPropertyAssignment(p)) continue;
      const key = propertyName(p.name, abs);
      if (!key || key === "id") continue;
      if (ts.isArrayLiteralExpression(p.initializer)) {
        out[key] = p.initializer.elements.map((e) => literalOf(e, abs));
        continue;
      }
      if (ts.isStringLiteral(p.initializer) || ts.isNumericLiteral(p.initializer)) out[key] = literalOf(p.initializer, abs);
    }
    found = out;
  });
  if (!found) fail(`${rel} no longer defines a module whose id is "governance"`);
  if (!Array.isArray(found.apiPrefixes) || !found.apiPrefixes.length) {
    fail(`${rel}: the governance module no longer declares apiPrefixes; the 404 fact is read from them`);
  }
  return { ...found, lifecycles };
}

/** The wizard's type lists, on both sides, so the drift between them is a fact. */
export function wizardTypes(root = ROOT) {
  const server = listConst(root, "server/lib/proposalDrafts.ts", "WIZARD_TYPES");
  const conductable = listConst(root, "server/lib/proposalDrafts.ts", "CONDUCTABLE_TYPES");
  const client = listConst(root, "client/src/components/governance/wizardConfig.ts", "WIZARD_TYPES");
  const advisory = server.filter((t) => !conductable.includes(t));
  for (const t of conductable) {
    if (!server.includes(t)) fail(`CONDUCTABLE_TYPES names "${t}", which WIZARD_TYPES does not; the wizard would offer a type it cannot draft`);
  }
  return { server, client, conductable, advisory };
}

/** Weight: the three modes, and the dials that choose between them. */
export function weightFacts(root = ROOT) {
  return { modes: unionOf(root, "server/lib/governanceWeights.ts", "WeightMode") };
}

/** What a change set may carry, from the one validator that prices it. */
export function changeSetFacts(root = ROOT) {
  const rel = "server/lib/mechanics.ts";
  const abs = absOf(root, rel);
  // The cap is read from the exported constant when there is one, because a
  // named export survives a refactor that a literal in a comparison does not.
  // The old inline shape is still accepted so this keeps answering for a tree
  // that has not named it yet, and the refusal fires only when both are gone.
  const named = constAnywhere(abs, "CHANGE_SET_CAP");
  if (named) {
    const cap = literalOf(named, abs);
    if (typeof cap !== "number") fail(`${rel} declares CHANGE_SET_CAP as something other than a number`);
    return { maxChanges: cap };
  }
  const text = fs.readFileSync(abs, "utf8");
  const m = /changes\.length\s*>\s*(\d+)/.exec(text);
  if (!m) {
    fail(`${rel} caps a change set neither with CHANGE_SET_CAP nor with "changes.length > N"; the dial ceiling is read from one of them`);
  }
  return { maxChanges: Number(m[1]) };
}

/** Starting the Game: the one row that says a village has, and what it refuses until then. */
export function launchFacts(root = ROOT) {
  const rel = "server/lib/gameStart.ts";
  const abs = absOf(root, rel);
  const sf = sourceFile(abs);
  const configKey = constAnywhere(abs, "CONFIG_KEY");
  if (!configKey) fail(`${rel} no longer declares CONFIG_KEY; the launch fact is stored under it`);
  let refusal;
  eachChild(sf, (node) => {
    if (refusal || !ts.isFunctionDeclaration(node) || node.name?.text !== "issuanceRefusal") return;
    const parts = [];
    eachChild(node, (n) => {
      if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) parts.push(n.text);
    });
    const joined = parts.join("").trim();
    if (!joined) fail(`${rel}: issuanceRefusal() no longer carries the sentence it returns`);
    refusal = joined;
  });
  if (!refusal) fail(`${rel} no longer declares issuanceRefusal(); the pre-launch rule is read from its sentence`);
  for (const name of ["readGameStart", "recordGameStart", "founderPowerStands"]) {
    let seen = false;
    eachChild(sf, (n) => { if (ts.isFunctionDeclaration(n) && n.name?.text === name) seen = true; });
    if (!seen) fail(`${rel} no longer declares ${name}()`);
  }
  return { configKey: literalOf(configKey, abs), issuanceRefusal: refusal };
}

/** The clock: one lunation table, one id format, and the frozen past. */
export function clockFacts(root = ROOT) {
  const lunarRel = "shared/lunar.ts";
  const lunarAbs = absOf(root, lunarRel);
  const synodic = constAnywhere(lunarAbs, "SYNODIC_MONTH_DAYS");
  if (!synodic) fail(`${lunarRel} no longer declares SYNODIC_MONTH_DAYS`);
  const trueFrom = constAnywhere(lunarAbs, "TRUE_CLOCK_FROM_CYCLE");
  if (!trueFrom) fail(`${lunarRel} no longer declares TRUE_CLOCK_FROM_CYCLE; the frozen past is read from it`);

  const cyclesRel = "server/lib/gratitude-cycles.ts";
  const cyclesAbs = absOf(root, cyclesRel);
  const cyclesText = fs.readFileSync(cyclesAbs, "utf8");
  const pad = /padStart\((\d+),\s*"0"\)/.exec(cyclesText);
  const prefix = /`(lunar-)\$\{/.exec(cyclesText);
  if (!pad || !prefix) fail(`${cyclesRel}: formatCycleId no longer builds a zero-padded "lunar-" id; the cycle id format is read from it`);
  if (!new RegExp(`\\^${prefix[1]}`).test(cyclesText)) {
    fail(`${cyclesRel}: parseCycleId no longer anchors on "${prefix[1]}", so an id this document describes would not parse back`);
  }

  const table = constAnywhere(lunarAbs, "LUNAR_TABLE_YEARS");
  if (!table) fail(`${lunarRel} no longer declares LUNAR_TABLE_YEARS`);
  const yearsText = table.getText();
  const years = /fromYear[\s\S]*?toYear/.test(yearsText) ? "read from shared/lunarTable.json" : null;
  if (!years) fail(`${lunarRel}: LUNAR_TABLE_YEARS no longer reads its range from the checked-in table`);

  return {
    synodicMonthDays: literalOf(synodic, lunarAbs),
    trueClockFromCycle: literalOf(trueFrom, lunarAbs),
    idPrefix: prefix[1],
    idDigits: Number(pad[1]),
    idExample: `${prefix[1]}${String(literalOf(trueFrom, lunarAbs)).padStart(Number(pad[1]), "0")}`,
  };
}

/**
 * WHAT A VILLAGE PUBLISHES, read from the route registrations themselves.
 *
 * Every `app.get|post|put|patch|delete("/api/governance...")` and
 * `"/api/game/mechanics..."` in `server/index.ts` and in the two governance
 * route modules, with the door each one keeps. The door is CLASSIFIED, never
 * guessed: a handler whose body matches none of the shapes below is reported
 * as "could not derive" and rendered that way in the document, because a route
 * this reader was wrong about is worse than a route it admits it cannot read.
 *
 * The shapes, in the order they are tested. The order is the order the code
 * itself refuses in: an administrator check outranks a capability check, and a
 * capability check outranks a sign-in check.
 */
const AUTH_SHAPES = [
  { name: "administrator", test: (b) => /\bisAdmin\s*\(\s*req\b/.test(b) || /requireAdmin\b/.test(b) },
  {
    name: "capability",
    test: (b) => /\bmayAct\s*\(\s*req\s*,\s*"([\w.]+)"/.test(b) || /\bguardCapability\s*\(\s*req\s*,\s*"([\w.]+)"/.test(b),
    key: (b) => (/\bmayAct\s*\(\s*req\s*,\s*"([\w.]+)"/.exec(b) ?? /\bguardCapability\s*\(\s*req\s*,\s*"([\w.]+)"/.exec(b))[1],
  },
  {
    name: "signed in",
    test: (b) => /if\s*\(\s*!\s*(?:user|viewer|actor)\s*\)\s*\{?\s*return\s+res\s*\.\s*status\(401\)/.test(b),
  },
  { name: "anyone, including a stranger", test: (b) => /\bauthedUser\s*\(\s*req\b/.test(b) },
];

/**
 * Anything in a handler that could be reading who is asking.
 *
 * A handler that mentions none of these has no door at all and answers a
 * stranger, which is a fact this reader can state. A handler that DOES mention
 * one and matches none of the shapes above is a door this reader cannot
 * classify, and the document says "could not derive" for it. The two cases
 * look the same from a distance and mean opposite things, so they are split
 * here instead of collapsed into one guess.
 */
const AUTH_MENTION = /\b(authedUser|isAdmin|mayAct|guardCapability|requireAdmin|capabilityCtx|hasCapability|capabilityDecision)\b|\breq\.user\b/;

const HTTP_METHODS = new Set(["get", "post", "put", "patch", "delete"]);

/**
 * The door a handler keeps, from its own text. Pure, so the self-test can put
 * fixtures through the same function the document is rendered from.
 */
export function classifyDoor(body, params = "req, res") {
  for (const shape of AUTH_SHAPES) {
    if (!shape.test(body, params)) continue;
    return { door: shape.name, capability: shape.key ? shape.key(body) : null };
  }
  if (!AUTH_MENTION.test(body)) return { door: "anyone, including a stranger", capability: null };
  return { door: "could not derive", capability: null };
}

function routesIn(root, rel, prefixes) {
  const abs = absOf(root, rel);
  const sf = sourceFile(abs);
  const out = [];
  eachChild(sf, (node) => {
    if (!ts.isCallExpression(node)) return;
    const callee = node.expression;
    if (!ts.isPropertyAccessExpression(callee) || !ts.isIdentifier(callee.expression) || callee.expression.text !== "app") return;
    const method = callee.name.text;
    if (!HTTP_METHODS.has(method)) return;
    const first = node.arguments[0];
    if (!first || !ts.isStringLiteral(first)) return;
    const routePath = first.text;
    if (!prefixes.some((p) => routePath === p || routePath.startsWith(`${p}/`))) return;
    const handler = node.arguments[node.arguments.length - 1];
    const body = handler ? handler.getText() : "";
    const params =
      handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler))
        ? handler.parameters.map((p) => p.name.getText()).join(", ")
        : "";
    const { door, capability } = classifyDoor(body, params);
    out.push({ method: method.toUpperCase(), path: routePath, file: rel, door, capability });
  });
  return out;
}

export function routeFacts(root = ROOT) {
  const files = [
    "server/index.ts",
    "server/routes/governanceWizard.ts",
    "server/routes/governanceWeights.ts",
  ];
  const rows = [];
  for (const rel of files) rows.push(...routesIn(root, rel, ["/api/governance", "/api/game/mechanics"]));
  if (!rows.length) {
    fail("no route under /api/governance or /api/game/mechanics was found; the reader walks app.get/post/put/patch/delete calls and something has moved");
  }
  rows.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  const governancePrefixed = rows.filter((r) => r.path.startsWith("/api/governance"));
  const mechanics = rows.filter((r) => r.path.startsWith("/api/game/mechanics"));
  return {
    rows,
    total: rows.length,
    governanceCount: governancePrefixed.length,
    mechanicsCount: mechanics.length,
    anonymous: rows.filter((r) => r.door === "anyone, including a stranger"),
    undeclared: rows.filter((r) => r.door === "could not derive"),
    withCapability: rows.filter((r) => r.capability),
  };
}

/**
 * THE COMMIT THESE SOURCES WERE LAST CHANGED IN.
 *
 * The document names the commit it describes, which section 0 of the brief
 * asks of anything generated here. It cannot be `HEAD`: HEAD moves the moment
 * the document is committed, and the guard's byte comparison would go red on
 * the commit that landed it. So it is the last commit that touched any file in
 * SOURCES, which is stable for as long as the sources are, and moves only when
 * the facts move.
 *
 * ONE CONSEQUENCE, SAID HERE SO NOBODY HAS TO WORK IT OUT FROM A RED GATE. A
 * commit that changes a source AND regenerates this document in the same
 * commit writes the PREVIOUS commit's id, because the new one did not exist
 * when the generator ran. Regenerating once more after that commit lands fixes
 * it, and the guard's own failure message says so. Regenerating AFTER a merge,
 * which is what the merge agent does, converges in one pass.
 *
 * It fails loud when git cannot answer. A checkout with no history cannot tell
 * this document what it is describing, and a document that guessed would be
 * making up the one fact a reader uses to check everything else.
 */
const commitCache = new Map();

export function sourceCommit(root = ROOT) {
  /*
   * ONE GIT CALL PER PROCESS, PER ROOT.
   *
   * The self-test renders the document half a dozen times, and on Windows a
   * repeated `spawnSync` of the same executable inside one process
   * intermittently comes back `UNKNOWN` with nothing wrong: the generator ran
   * green for a dozen renders and then failed on the seventh in the same
   * second. The commit cannot change while this process runs, so caching it
   * removes the flake and the repeated cost together.
   */
  if (commitCache.has(root)) return commitCache.get(root);
  let out;
  try {
    out = execFileSync("git", ["log", "-1", "--format=%H", "--", ...SOURCES], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    fail(
      "git could not say which commit last changed the sources " +
        `(${String(err?.message ?? err).split("\n")[0]}). This document names the commit it describes, ` +
        "and a checkout with no history cannot answer that.",
    );
  }
  const sha = String(out).trim();
  if (!/^[0-9a-f]{40}$/.test(sha)) {
    fail(`git answered "${sha.slice(0, 60)}" for the last commit touching the sources, which is not a commit id`);
  }
  commitCache.set(root, sha);
  return sha;
}

// ── The prose. Written by a person, kept here so the file stays generated ───

/**
 * Every sentence in this document that a person wrote.
 *
 * MARKED WHERE IT APPEARS. `docs/TOKENS.md` promises that its written lines
 * are marked and only half keeps it: the rulings section is marked and the
 * per-token sentences are not, so a reader of one of those sentences has no
 * way to tell it from a fact read out of the code. Here every entry renders
 * behind an HTML comment carrying its key, so the source of the document says
 * which lines are somebody's words and the rendered page stays clean.
 * `proseCoverageProblem` refuses in both directions, so a paragraph cannot
 * ship unmarked and a key cannot outlive the paragraph it described.
 *
 * NO VILLAGE'S NAME LIVES HERE. `scripts/` is a ratchet zone for the brand
 * guard, and this document is read by people standing up villages that are not
 * the one this repository was born in.
 */
const PROSE = {
  purpose:
    "How a village decides: what a decision is, how a vote is counted, what each kind of decision asks of the village, " +
    "what happens when one carries, and which of the rulings behind all of that are built today.",
  scope:
    "This describes a FRESH village: what a village standing up a new instance holds after the migrations run and the " +
    "server starts for the first time. A village that has been running has its own history on top of it.",
  generated:
    "This file is generated. `scripts/generate-governance-doc.mjs` reads the engine, the subject registry, the dials, " +
    "the capability tables, the module definition, the clock and the route registrations, works out the facts, and " +
    "writes the whole document. `scripts/check-governance-doc.mjs` regenerates it and fails the build when the " +
    "committed text and the code have come apart.",
  editing: "Editing this file by hand does not hold. Change the code, then run:",
  twoKinds: "Two kinds of line live here, and the difference matters:",
  readFromCode:
    "**Read from the code.** Every table, every number, every key, every route, and the JSON block at the end. If one " +
    "of these is wrong, the code is what is wrong.",
  writtenByPerson:
    "**Written by a person.** The explanations, and the rulings. They are stored inside the generator so this whole " +
    "file stays generated, and each one is marked in the source of this file with a comment naming the entry it came " +
    "from. The founder's own words are quoted verbatim and marked the same way.",
  noTimestamp:
    "There is no timestamp and no author line, on purpose. Both would change on every run and turn an honest diff " +
    "into noise. The commit named above is the commit whose sources this describes, and git history is the record of " +
    "when it changed.",
  constitutionOpening:
    "The long tables come after this. These are the rules that do not move, kept short on purpose so a village can " +
    "read the whole of what binds it in one screen.",
  ringZero:
    "**Ring 0 is the constitution.** Some rules are published and tunable by nobody: the capability gate order, the " +
    "append-only ledger, the fact that a ballot freezes its own terms when it opens. A dial's minimum and maximum are " +
    "Ring 0 too, so a village moves a value inside its bounds and never moves the bounds. Ring 1 is the dials the " +
    "village's catalysts hold. Ring 2 is the dials the whole village governs by proposal.",
  ringZeroFreeze:
    "The freeze is the one to read twice. Method, dials, electorate and weights are written into the ballot's own row " +
    "inside the transaction that opens it, and every later evaluation reads that row. Changing a village setting can " +
    "never rewrite a vote that is already running, and it can never rewrite one that has closed.",
  birthingRule:
    "**The Birthing.** A village's first vote is the one that starts its Game, and it asks for everybody. Token " +
    "issuance is refused until it carries, so nothing a member holds exists before it. The floors below are code and " +
    "not settings, and a village cannot lower them.",
  criticality:
    "**Criticality, and the ceiling of 97.** Nothing is un-votable. The more critical a change is, the more of the " +
    "village has to show up and agree before it lands, and the recommended ceiling is 97 percent of quorum and 97 " +
    "percent of unity. Above that a village is warned in words: as the bar approaches 100, one player dying or " +
    "drifting away can freeze a Game a large majority wants to continue. The Birthing stays at 100 and 100 because " +
    "it is the one vote where everyone is present by definition.",
  criticalityToday:
    "Criticality tiers are built. Every setting carries a tier, the tier sets the quorum and the unity a change to it " +
    "needs, and the tiers and the subject floors are themselves settings a village may raise and may never lower. What " +
    "is still staged is the rule that a threshold changes at its own current bar.",
  decisionIs:
    "A decision is a ballot: one question, one frozen electorate, one document, and one outcome recorded by a person. " +
    "The document a ballot carries is the document that was checked when it opened, stored on the ballot's own row, " +
    "so what was voted on is what was read.",
  closingIsHuman:
    "Closing is a human act. When the voting window ends nothing executes: votes lock, the ballot waits, and a person " +
    "closes it with a note that becomes the sentence the village keeps. One mechanism runs on a clock, and it is " +
    "named in the cycle section below.",
  oneOpenBallot:
    "One open ballot per subject, held on a unique index and never on an application check. Closing frees the " +
    "subject the same second, so a vote that missed its participation can be asked again the same hour, and the " +
    "ballot that missed stays closed with its own frozen roll.",
  votesChangeable:
    "A vote is one row per member per ballot, changeable until the ballot leaves the open state or the clock passes " +
    "the closing instant. Changing a vote overwrites the row, so a member has one answer on the record at a time.",
  countingIntro:
    "Everything the engine counts is weight. Quorum is checked first, for every method, so a decision too few people " +
    "answered reads as no quorum and never as a rejection.",
  abstainRule:
    "An abstention counts toward quorum and takes no side on unity. It is the instrument for helping a decision reach " +
    "the room while holding no position in it. One subject overrides that, and the subject table below says which: on " +
    "the Birthing an abstention answers nothing at all, so it counts toward neither the quorum nor the unity and the " +
    "vote closes for want of quorum, which can be asked again.",
  peopleAndWeight:
    "Every sentence this platform generates about a vote states people AND weight together. One of three people " +
    "voting, holding all of the frozen weight, is a true sentence about a vote; a bare participation percentage is " +
    "not, whatever sits beside it.",
  dialsIntro:
    "The dials a village holds, with the ring that says who may move each one and the moment a passed change takes " +
    "effect. `open` dials are the village's by proposal. `founder` dials are held by the village's catalysts and are " +
    "refused to a proposal, and the platform ceiling runs one way: a catalyst can close an open dial to the " +
    "community, and nothing can open a `founder` one to it. The stored role value for a catalyst is `founder`, " +
    "which is the same word the ring is named after and the reason both read that way here.",
  dialsStorage:
    "Only CHANGED values are stored. An absent row means the platform default in the table above, so a fresh village " +
    "starts with every one of these and no rows at all.",
  subjectsIntro:
    "What each kind of decision asks. A subject declares MINIMUMS and the village's own dials still decide: the " +
    "ballot freezes whichever number is higher, so a village that asked for more keeps what it asked for. A subject " +
    "absent from this table keeps the village's dials with no floor, which is the safe direction.",
  closingIntro:
    "What closing a decision DOES, per subject type, and the one place that question is answered. A subject type that " +
    "is not in this table conducts a real decision on the real engine, with the real frozen roll and the real " +
    "weights, and executes nothing. Absence is the fail-safe direction, so a subject a later lane adds cannot execute " +
    "something by accident.",
  practiceVotes:
    "The wizard offers types the executors have not reached. Those open as practice votes: the village holds a real " +
    "decision, reads the real answer, and nothing moves. It is a ladder and never a scorecard.",
  launchIntro:
    "A village is built before it is started. Its catalysts set the modules, the dials, the quests and the seasons, " +
    "and then hand the one act that is not theirs to everybody: starting the Game. The founder ruled that this " +
    "moment is called the Birthing, that the proposal reveals the Game, and that after it the catalysts become " +
    "players like everyone else.",
  launchStored:
    "Starting is one row, written once. There is deliberately no function that un-starts a Game: members hold " +
    "balances the moment issuance runs once, and a switch that could turn that off is a power over everybody's " +
    "holdings that nobody voted to create.",
  launchEnds:
    "What ends at the Birthing is every power the stored `founder` role carries beyond an administrator's. What " +
    "deliberately does not end is the admin panel, because a village may choose never to seat a steward and must " +
    "still work completely.",
  weightIntro:
    "Three modes, one dial, and a rule that never moves: a change of mode changes only how votes are COUNTED. " +
    "Nothing deletes or rewrites a balance, an allocation or its trail, so a village can move between modes in " +
    "either direction and every holding survives the trip.",
  weightToken:
    "In token mode the weight token has to be one this platform itself governs. A token governed elsewhere is " +
    "refused, and so is a token listed on the exchange: a token money can buy is not a token that weighs a vote.",
  weightTrail:
    "Custom allocations are append-only. Every change carries a required reason and lands in a trail every player can " +
    "read, which is the whole of the protection the founder named: concentration is allowed and invisibility is not.",
  whoIntro:
    "Powers are keys, not job titles. A member holds one by climbing to the rung that grants it, by holding a role " +
    "that carries it, or by a badge. Two of them can never be taken away by a badge, and that is a ruling: a voice in " +
    "a decision the village makes is not something any other party gets to suspend.",
  stewardThree:
    "The word steward means three different things in this platform, and they are named apart here so nobody reads " +
    "one of them as another.",
  stewardQuest:
    "**The steward who consents to work.** In quest copy, the person who confirms that a contribution actually " +
    "happened and releases its value. This one is shipped and works today.",
  stewardPersona:
    "**The Village Steward persona.** One of the paths a new member can pick on the way in, part of the identity " +
    "plane and carrying no power of its own.",
  stewardApprover:
    "**The steward the founder ruled for.** A seat, held by a village's catalysts at the Birthing and re-voted each " +
    "term, whose holder can stop a decision the village has already carried, inside the window before it lands, and " +
    "has to say why. It approves nothing: a carried decision lands whether or not anybody holds this seat.",
  publishIntro:
    "What a village publishes, read from the route registrations. The door on each route is classified from the " +
    "code, and a route whose door this reader cannot classify says so instead of guessing.",
  publishModule:
    "Read the module state first. While the governance module is off, every path under its prefixes answers 404 to " +
    "everybody, signed in or not. The mechanics routes are never module-gated, so they answer under every lifecycle.",
  cycleIntro:
    "One clock. A cycle is a lunation, and the same rhythm carries the recognition economy, the pool and this " +
    "document's talk of what lands when. The past is frozen: cycles below the boundary keep the instants the mean " +
    "formula always gave them, so no settled cycle ever moves.",
  cycleClose:
    "A cycle turns on its own and the Game notices when an administrator closes it. So today, at the new moon means " +
    "at the next close, which can lag by days and can settle several lunations at once. One exception runs on a " +
    "timer: a minting rule stamped for a coming cycle is promoted by the hourly job at the true boundary. The " +
    "founder's ruling is that the new moon itself becomes the rule and both callers reach one routine; that is " +
    "staged.",
  bridgeIntro:
    "A village can carry its formal decisions to Hypha on Base instead of deciding them here, and it can report its " +
    "outcomes to a governance hub. Both are optional and both ship dark.",
  bridgeHonest:
    "Stated honestly, because a bridge that half works is worse than one that is off: nothing leaves a village " +
    "unless both the hub URL and a shared secret are configured; the round trip has never been proven end to end in " +
    "both directions; and four displays about it are false today. A Hypha-decided ballot is counted by Hypha, so a " +
    "village's own weight mode does not reach it.",
  brokenIntro:
    "What is broken today, by name. A document that only described the parts that work would be the same kind of " +
    "check this repository has spent weeks removing: green about the wrong thing.",
  stagedIntro:
    "What is staged: ruled by the founder, described here, and absent from the code. Nothing in this list exists. " +
    "Each one carries a guard in the generator, so the day somebody builds it the guard goes red and this section has " +
    "to be updated before the build passes.",
  rulingsIntro:
    "The founder's own words, verbatim, with the date he said them and whether the code does it yet. Where the code " +
    "can answer, the status is computed and says so. Where it cannot, the status is a person's reading and says that " +
    "too. Nothing marked staged exists today, and no reader should plan as though it does.",
  rulingsQuoteNote:
    "The quotes are reproduced exactly, including the spelling and the punctuation, because a ruling paraphrased is a " +
    "ruling somebody can argue about later. They are the one text in this file the house writing rules do not touch.",
  machineIntro:
    "The same facts, for anything that would sooner parse than read. Regenerated with the rest of the file, so it " +
    "cannot drift from the prose above it.",
  madeFromIntro: "The generator reads these and fails loudly if any of them moves:",
  madeFromReaders:
    "Every reader is anchored on an exported symbol or a syntactic shape, never on a line number. The file holding " +
    "the close dispatcher lost about 2,500 lines to route extractions in the hours while this document was being " +
    "specified, and a reader anchored on a line would have gone quietly wrong.",
  madeFromTest:
    "`server/db/governanceDoc.test.ts` calls the real engine against a real database and asserts that the numbers " +
    "this document states are the numbers those functions produce. The generator being wrong is a red test and not a " +
    "quiet paragraph.",
  madeFromCommit:
    "The commit named at the top is the last commit that changed any source in this list. A commit that changes a " +
    "source and regenerates this file at the same time writes the previous commit's id, because the new one does not " +
    "exist yet; regenerating once more after it lands settles it.",
};

/**
 * What each executing subject type CHANGES, in a member's words.
 *
 * Keyed by the `subject_type` the close dispatcher answers to, so a subject a
 * later lane adds cannot render as a row with a blank meaning.
 * `subjectCoverageProblem` refuses in both directions, which is the same guard
 * the sibling generator puts on its per-token sentences and for the same
 * reason: a decision nobody can describe in one line is a decision nobody can
 * explain to the village voting on it.
 */
const SUBJECT_WORDS = {
  mechanics: "Moves the village's own dials, through the one amendment ledger that records every move.",
  mint_rule: "Changes what the village mints and on what terms. It shares the dial executor and carries a higher quorum floor.",
  power_transfer: "Moves a power from the admin panel to a role the village names.",
  power_grant: "Gives a role a power it does not carry yet.",
  power_return: "Hands a power the village was holding back to the admin panel.",
  role_declare: "Writes a role into being: its name and what it is for.",
  role_seat: "Puts a named member into a seat.",
  role_unseat: "Takes a named member out of a seat.",
  village_launch: "Starts the Game. Token issuance turns on and does not turn off.",
};

/**
 * Every executing subject type has a sentence, and every sentence has a
 * subject type, or this returns the refusal that stops the build.
 */
export function subjectCoverageProblem(keys, words = SUBJECT_WORDS) {
  for (const key of keys) {
    if (words[key]) continue;
    return (
      `governance-doc: the close dispatcher executes "${key}" and nothing here says what that changes. ` +
      `Add a line to SUBJECT_WORDS in scripts/generate-governance-doc.mjs under the key "${key}". ` +
      "A decision nobody can describe in one line is a decision nobody can explain to the village voting on it."
    );
  }
  for (const key of Object.keys(words)) {
    if (keys.includes(key)) continue;
    return (
      `governance-doc: SUBJECT_WORDS describes "${key}", which the close dispatcher no longer executes. ` +
      "Delete the sentence, or fix the key."
    );
  }
  return null;
}

/**
 * THE GOVERNANCE DIALS THIS DOCUMENT HAS BEEN WRITTEN AGAINST.
 *
 * A dial appearing in the Governance category that is not in this list stops
 * the build, and that is deliberate rather than tidy. Half the rulings in this
 * document are staged, and most of them arrive as a dial: a criticality tier,
 * a rhythm setting, a secrecy setting, a steward flag. A new key is therefore
 * the most likely first sign that a status line here has gone stale, and the
 * cheapest moment to catch it is the moment it appears.
 *
 * Adding a dial is two lines: the key here, and whichever ruling it builds.
 */
const KNOWN_DIALS = [
  "governance.voice_weighting",
  "governance.hypha_threshold",
  "governance.sensing_days",
  "governance.proposals_per_member_per_cycle",
  "governance.proposal_support_threshold",
  "governance.hub_url",
  "governance.auto_apply_enabled",
  "governance.steward_subjects",
  "governance.steward_council",
  "governance.change_cooldown_days",
  "governance.weight_mode",
  "governance.weight_token",
  "governance.unity_pct",
  "governance.quorum_pct",
  "governance.vote_days",
  "governance.consent_window_days",
  "governance.default_method",
  "governance.tier_routine_quorum_pct",
  "governance.tier_routine_unity_pct",
  "governance.tier_structural_quorum_pct",
  "governance.tier_structural_unity_pct",
  "governance.tier_constitutional_quorum_pct",
  "governance.tier_constitutional_unity_pct",
  "governance.subject_mint_rule_quorum_pct",
  "governance.subject_mint_rule_unity_pct",
  "membership.vouch_threshold",
];

export function dialCoverageProblem(keys, known = KNOWN_DIALS) {
  for (const key of keys) {
    if (known.includes(key)) continue;
    return (
      `governance-doc: "${key}" is a Governance dial this document has never been written against. ` +
      "If it builds one of the staged rulings, update that ruling's status and note. Then add the key to " +
      "KNOWN_DIALS in scripts/generate-governance-doc.mjs."
    );
  }
  for (const key of known) {
    if (keys.includes(key)) continue;
    return (
      `governance-doc: KNOWN_DIALS names "${key}" and the Governance category no longer holds it. ` +
      "A dial this document described has gone; delete the key and check what the document says about it."
    );
  }
  return null;
}

/**
 * Every entry in PROSE renders, and every marker in the document names an
 * entry, or this returns the refusal that stops the build.
 *
 * BOTH DIRECTIONS, for the reason the sibling generator gives: a missing
 * paragraph ships a document with a hole in it, and an orphan entry is the
 * quieter failure, where a section is rewritten and its old explanation stays
 * behind in the generator looking maintained.
 */
export function proseCoverageProblem(text, prose = PROSE, rulingIds = RULINGS.map((r) => r.id)) {
  const known = new Set([...Object.keys(prose), ...rulingIds.map((id) => `ruling-${id}`)]);
  for (const key of known) {
    if (text.includes(`<!-- written by a person: ${key} -->`)) continue;
    return (
      `governance-doc: the written entry "${key}" renders nowhere. ` +
      "Render it, or delete it: an explanation nobody reads is an explanation nobody maintains."
    );
  }
  for (const m of text.matchAll(/<!-- written by a person: ([\w.-]+) -->/g)) {
    if (known.has(m[1])) continue;
    return (
      `governance-doc: the document marks "${m[1]}" as written by a person and nothing in PROSE or RULINGS ` +
      "carries that key. Fix the key or add the entry."
    );
  }
  return null;
}

/**
 * THE FOUNDER'S RULINGS, in his words.
 *
 * Every quote in sections 3, 4, 5, 12 and 19 of `docs/GOVERNANCE_EVOLUTION_PROMPT.md`
 * is carried here verbatim with the date it was said. The steward ruling was
 * stated twice, on 2026-08-31 and again on 2026-09-02, and is carried once
 * with both dates: a duplicate would read as two rulings that happen to agree.
 *
 * `status` is a function of the facts wherever the code can answer, and a
 * fixed string where it cannot. Which of the two a ruling got is DERIVED from
 * the function's own arity rather than declared beside it: a hand-typed
 * "computed" flag on a status that ignores the facts is exactly the kind of
 * claim this document exists to stop, and it would be invisible in review.
 * A computed status cannot go stale quietly; a stated one is somebody's
 * reading and says so on the page.
 */
const statusIsStated = (ruling) => ruling.status.length === 0;
const RULINGS = [
  {
    id: 1,
    title: "A steward approves a passed proposal before it takes effect, and auto-execute is the maturity path",
    dates: ["2026-08-31", "2026-09-02"],
    quotes: [
      "having it default that the steward (by default the founder(s) are granted a steward role after Game launch) needs to approve a proposal to change the game before it actually goes through is a great addition, but also there's another stage of maturity where the founder gives up this power and then auto-execute takes over. Stewards have the power to approve anything in the Game that needs approval - they're the 'training wheels' for the Game until it matures enough that they can give more and more power to the Game to auto-execute decisions.",
    ],
    status: (f) => (f.staged.steward ? "**Staged.** Not built." : "**Half built.**"),
    note: (f) =>
      `The seat exists, and the approval gate this ruling describes is WITHDRAWN by the founder's 2026-09-03 words. ` +
      `A \`steward.veto\` capability gates a veto route, an early no-objection route and a redaction route; one row per ` +
      `steward per ballot records who acted, on what, and why; and one setting says which kinds of decision the seat may ` +
      `stop. Nothing waits: a Game change lands at the later of the next new moon and the close of its window, on its own, ` +
      `whether or not anybody holds the seat, and a token send executes when its ballot closes unless a steward voted no ` +
      `while it was open. What is still missing is the landing instant itself, which the close dispatcher owns. The other ` +
      `hold that exists is \`governance.auto_apply_enabled\`, a ` +
      `${f.dials.autoApply.ring}-ring dial defaulting to \`${f.dials.autoApply.default}\`, which covers the mechanics closer alone and hands a ` +
      `held proposal to an administrator to apply by hand.`,
  },
  {
    id: 2,
    title: "Catalysts inherit the steward seat at the Birthing, and the seat is re-voted every season",
    dates: ["2026-08-31"],
    quotes: [
      "I want to override the optionally vote in that role to where the founders automatically inherit it, but just like every role resets every season - this role too needs to be voted back in to be maintained.",
    ],
    status: (f) => (f.staged.launchSeatsSteward ? "**Staged.** Not built." : "**Built.**"),
    note: () =>
      "The closer that runs when the Birthing carries writes the launch facts and nothing else: no role, no seat, no grant. " +
      "Catalysts inherit nothing at the Birthing today.",
  },
  {
    id: 3,
    title: "Giving up the steward power is reversible, and only the village can fill the seat again",
    dates: ["2026-08-31"],
    quotes: ["Yes giving up the power is reversible but the village would need to vote in another steward."],
    status: () => "**Staged.** Not built.",
    note: () =>
      "There is no seat to step back from. The design this ruling settles is worth keeping in view while it is built: it " +
      "makes relinquishment automatic, so a catalyst never has to decide they are ready to give up power. They have to be " +
      "re-granted it.",
  },
  {
    id: 4,
    title: "The veto is the point of the role, and it carries a reason",
    dates: ["2026-08-31"],
    quotes: [
      "Yes stewards have the ability to veto through non approval. This is primarily to protect against harm they see that the village wasn't able to (which is why they voted them to be stewards to begin with).",
      "Yes a steward veto absolutely should carry a reason",
    ],
    status: (f) => (f.staged.steward ? "**Staged.** Not built." : "**Built.**"),
    note: () =>
      "A veto is a first-class act now. The veto route stores who acted, which ballot, and the reason, and it refuses " +
      "an empty or whitespace-only reason at the door, so a decision the village carried can never die silently. The " +
      "reason is plain text capped at 2000 characters, rendered escaped, and redactable: the words can be blanked later " +
      "while the act, its author and its time stay on the record. An early no-objection may be recorded and it changes " +
      "no timing. What the record still waits on is the surface that shows it to the proposer.",
  },
  {
    id: 5,
    title: "Terms end when they end",
    dates: ["2026-08-31"],
    quotes: [
      "No terms should definitely end when they end not with a polite warning! If they're not voted back in then they expire when they expire!",
    ],
    status: () => "**Half built.**",
    note: () =>
      "Terms and powers live on two planes that share only a word, and the ruling now holds on the plane that matters. A " +
      "permission role carries a term and a season beside the holder, and the capability lookup drops a holding whose term " +
      "has passed, so the powers end on the day the term does with no warning and no grace. A term left empty never lapses, " +
      "which is what let the column land on villages that had never heard of a term. The record of who held the seat " +
      "outlives the mandate on purpose: history is kept and the powers are taken. Org-chart seats are the other plane and " +
      "are unchanged, so a season turn there still reopens a seat without touching anybody's powers. What remains is the " +
      "vote that puts a holder back in, and a vacancy loud enough to see on every screen that depends on it.",
  },
  {
    id: 6,
    title: "Governance week is a default pattern and never a permission check",
    dates: ["2026-08-31"],
    quotes: [
      "As a default pattern the week before a season ends is the 'governance week' where all the players who want a role in the next season put up proposals for their roles - they play out for the season.",
      "Players can make proposal at anytime and it's a cultural pattern when and how people will actually show up to vote. So that's for every village to decide but as a default pattern we offer the above.",
    ],
    status: (f) => (f.staged.governanceWeek ? "**Staged.** Not built." : "**Built.**"),
    note: () =>
      "No governance dial names a week. The shape the ruling asks for is a pattern that is visible, skippable and named as " +
      "a default the village can change, and a product that never refuses an action because it is the wrong week. A village " +
      "running its governance differently should never see a screen implying it is doing it wrong.",
  },
  {
    id: 7,
    title: "Delegation copies the choice, chains are transitive, and concentration is visible",
    dates: ["2026-08-31"],
    quotes: [
      "One more requirement we need to build in is to delegate your vote to another member (where it just copies whatever they do as long as they have your delegation and you can remove and change a vote on an open proposal at anytime. So full rights to the individual but for those who don't want to vote can give their voice to someone they trust.",
      "I want transitive to start - that's okay but as you say concentration must be visible so we'll just show what's going on",
      "A delegate would puncture because you always see on a proposal a vote you made. So since your vote was cast following another's you were able to see what that other member did because you can see what you did.",
    ],
    status: (f) => (f.staged.delegation ? "**Staged.** Not built." : "**Built.**"),
    note: () =>
      "A delegated vote is a row for the DELEGATOR carrying the delegate's choice, stamped with the member who finally " +
      "decided it, so participation arithmetic stays honest and the frozen electorate keeps meaning what it says. Weight " +
      "never moves. The choice alone is copied and the words beside a no are never attributed to somebody who did not " +
      "write them. Chains resolve to the member at the end, a cycle is refused at the moment a delegation is given and " +
      "never at tally time, and a member who votes for themselves takes their row back whatever their delegate does. A " +
      "delegate who stays silent leaves the delegator uncast, counted as not voted and never as an abstention. Concentration " +
      "is served to every player: how many votes each member effectively decides, what share of the village that is, and the " +
      "direct count beside it. What is missing is the surface, so today all of it answers through the API alone.",
  },
  {
    id: 8,
    title: "Transparency is the protection, so concentration is allowed and invisibility is not",
    dates: ["2026-08-31"],
    quotes: [
      "The first exploit isn't a concern because proposals should also say how many people voted on it! We can have a settings where it would be public who's voting or secret (defaulted to secret).",
      "Founders can self-grant themselves voice. Their ability to do this is fine, our protection is in the transparency of it, showing what % of total voice every player is holding.",
    ],
    status: (f) => (f.staged.secrecy ? "**Half built.**" : "**Built.**"),
    note: () =>
      "Built: a catalyst may allocate weight to themselves, every allocation lands in an append-only trail with a required " +
      "reason, and the hand-mint route refuses a self-grant at any amount. Staged: the share of total voice each player " +
      "holds is shown nowhere, and the vote sentence that states people and weight together is generated in some places " +
      "and not in others. The identity half of this ruling was answered again in 2026-09-02's question 12 and is carried " +
      "there.",
  },
  {
    id: 9,
    title: "One source of truth for governance, human readable and machine readable",
    dates: ["2026-09-02"],
    quotes: [
      "Your task is going to be setting up the sole source of truth for governance and our game creating a document that is based off of truth that's human readable and beautiful, and also machine readable that sits in our repo so that everyone including bots can understand how the governance system works.",
      "This isn't a full story and for you to fill out the whole story and create version 1.0 of this document for us to go back-and-forth on to ensure that we have the right vision.",
    ],
    status: () => "**Built.**",
    note: () =>
      "This file, generated from the code, with a machine-readable block at the end, a guard that fails the build when it " +
      "and the code come apart, a self-test on the generator, and a database test that proves the numbers against the real " +
      "engine. It is version 1.0 and it is written to be argued with.",
  },
  {
    id: 10,
    title: "One to three catalysts start a village, and Voice is the only token they may issue before the Game starts",
    dates: ["2026-09-02"],
    quotes: [
      "Every village starts off with 1 to 3 founders putting the initial conditions in place and the only tokens they can issue at this point is Voice tokens.",
      "Love them all",
    ],
    status: (f) => (f.launch.issuanceRefusal ? "**Staged, and the code currently says the opposite.**" : "**Built.**"),
    note: (f) =>
      `Nothing is issuable before the Birthing, Voice included: every faucet posting is refused with the sentence "${f.launch.issuanceRefusal}" ` +
      "Nothing enforces a count of one to three catalysts either. The only pre-Birthing weight a catalyst can hand out is " +
      "the custom allocation table, which is a number and never a token, and which the founder's ruling renames the " +
      "founding allocation. His second quote here is his answer to the question of which token is Voice: the platform's " +
      "own Voice is THE Voice, and the Base mirror is Voice claimed across.",
  },
  {
    id: 11,
    title: "The Birthing: at least three parties, 100 percent quorum, 100 percent unity, and the proposal reveals the Game",
    dates: ["2026-09-02"],
    quotes: [
      "then at some point when the game is mature enough and the founders deem it ready that they're ready to start the game then it starts with an initial proposal that needs a minimum of three votes three different parties voting and it has to get 100% quorum and 100% unity so every player of the game needs to show up to the start the game proposal. This proposal will also show the current distribution of Voice as that's the only token that had been issued at that time and give a brief overview of how the game is structured and the conditions that the game is at.",
      "No we need 100% saying yes as a collective 'Birthing' moment where you reveal the game, it's at LEAST 3 but could be many more people who then activate a new game before they all switch to being 'players' instead of just the catalysts (we say Catalyst instead of founder for those who play the game this way.",
    ],
    status: () => "**Half built.**",
    note: (f) =>
      `Built: the floors are code at ${f.launchFloor.minUnityPct} unity, ${f.launchFloor.minQuorumPct} quorum and ` +
      `${f.launchFloor.minElectorate} on the roll, with every seat required to carry weight above zero, which is what makes ` +
      "100 percent of weight also mean 100 percent of people. Built since 2026-09-02: an abstention on the Birthing " +
      "answers nothing, counting toward neither the quorum nor the unity, and the subject asks for a yes from every seat " +
      "on the roll by head as well as by weight. One yes and two abstentions now closes for want of quorum, which can be " +
      "asked again the same hour on a fresh roll. Staged: the proposal shows the head count, the dials and an abstention " +
      "sentence, and carries no Voice distribution, no overview of the structure and no statement of the conditions.",
  },
  {
    id: 12,
    title: "The Game Mechanics section is public, always, and after the Birthing every control becomes a proposal",
    dates: ["2026-09-02"],
    quotes: [
      "after this point all members can see the admin section and all of the controls for the entire game so the admin panel that's available just for founders at the beginning becomes available for everyone to see and they can go through and just like a founder can make all these edits but the edits as they're making them just become a change log that will then turn into a proposal and if the proposal passes then changes the game at the start of the next lunar cycle",
      "yes, no PII exposed, but all the admin sections I'm able to see now as I'm making the Game. So truly there's no reason to ever hide these behind admin. Instead name them the 'Game Mechanics' section that's always public.",
    ],
    status: () => "**Staged.** Not built.",
    note: () =>
      "The admin panel stays administrator-only today, before and after the Birthing, and no administrator read consults " +
      "launch state. Two of its write routes have a proposal path. The ruling asks for the game tabs renamed the Game " +
      "Mechanics section and public always, with every write still gated, every control rendering as propose this change " +
      "once the Game has started, and the edits collecting into one change log that becomes one proposal. Personal data " +
      "and operator matters stay where they are.",
  },
  {
    id: 13,
    title: "Lunar by default, and the cycle is a setting",
    dates: ["2026-09-02"],
    quotes: [
      "so that we're following lunar cycle periods for every lunar cycle. A new game structure can take place this lunar cycle is also a setting that it could be changed to any calendar cycle or any other cycle but we default to lunar cycles where a new cycle start and end at the new moon just like with the gratitude cycle",
      "Yes the cycle structure can be changed.",
    ],
    status: (f) => (f.staged.cycleSetting ? "**Staged.** Not built." : "**Built.**"),
    note: () =>
      "There is one clock and no dial chooses it. A rhythm dial used to exist and was retired in 2026-08-29 at the " +
      "founder's own instruction, because the panel offered a choice the engine did not honour. Bringing it back means a " +
      "clock seam every consumer reads through first, a calendar implementation with its own id prefix, past cycles frozen " +
      "with the ids they closed under, and the switch itself timed to a boundary.",
  },
  {
    id: 14,
    title: "The vote mode switches both ways, holdings survive, and the village votes the switch",
    dates: ["2026-09-02"],
    quotes: [
      "within governance, we have some elements where you can have one person one vote or one token one vote where members can hold multiple voice tokens, and their vote is stronger. This should be able to go back-and-forth where you can change from one person one vote to one token one vote and vice versa and when we're making these changes, it doesn't delete the voice token holdings so if you have voice tokens, and you switch over to one person, one vote and just changes the overall governance that way, and then allows the community to go back to one token one vote and maintain the current token holdings",
      "yes",
    ],
    status: (f) => (f.dials.weightMode.ring === "founder" && f.staged.governanceModeSubject ? "**Half built.**" : "**Built.**"),
    note: (f) =>
      `Built: \`${f.dials.weightMode.key}\` carries ${f.dials.weightMode.choices.length} choices, nothing refuses a change in ` +
      "either direction, and switching reads or ignores holdings and deletes none of them. So the code already behaves the " +
      `way this ruling describes. Staged: the village's own vote on it. The dial is ${f.dials.weightMode.ring} ring, refused to a ` +
      "change set and to anybody who reaches the admin route through a capability, so a switch is an administrator's act " +
      "today. His second quote is his answer to whether it should leave that ring, and the answer is yes, through a " +
      "subject type of its own with a launch-grade floor.",
  },
  {
    id: 15,
    title: "A proposal carries more than one element, priced at its hardest part, and applies all or nothing",
    dates: ["2026-09-02"],
    quotes: [
      "for example, on that proposal, the proposal could also contain a clause where they're distributing a bunch of new Voice tokens out to different members if maybe there is unfair voice token holding that elicited their desire to go back to one person one vote but realize they actually just needed a fair distribution so that's why proposals need to contain more than one element because they might be connected.",
      "explain",
    ],
    status: () => "**Half built.**",
    note: (f) =>
      `Built: a change set carries up to ${f.changeSet.maxChanges} entries and passes or fails as one. Staged: the set must be all ` +
      "dials or all minting rules and never both, community-governable keys only, and a Voice distribution is not a change " +
      "set entry at all. So the founder's own example, switch the mode and distribute Voice, is refused twice today and " +
      "half of it cannot be balloted. His answers to the two questions inside this one: a bundle takes the HIGHEST floor " +
      "among its elements, so nobody can smuggle a big change under a small one; and when one element fails at apply time " +
      "nothing applies, and the proposal names the element that blocked it.",
  },
  {
    id: 16,
    title: "Vote it down, say what to fix, withdraw, edit, resubmit",
    dates: ["2026-09-02"],
    quotes: [
      "During the proposal process proposal comes up and people can vote it down and put their objections and what they would like fixed then a proposer can withdraw and edit their proposal and make those suggested changes and put it back up for vote to try to reach the required quorum and unity required.",
    ],
    status: (f) => (f.statuses.includes("withdrawn") ? "**Half built.**" : "**Staged.** Not built."),
    note: () =>
      "Built: withdrawal exists at both layers, a no vote may carry a free-text reason on every method, and a consent " +
      "objection carries text and a ruling and links to the ballot it led to. Staged: objections with text exist under the " +
      "consent method only, and the default method is not consent, so under the shipped defaults a member cannot record " +
      "what they would like fixed. A stored reason on a no vote is shown to nobody. There is no edit route on a proposal " +
      "and no pointer from a resubmission back to what it replaces.",
  },
  {
    id: 17,
    title: "A village with no steward and self-executing agreements is healthy",
    dates: ["2026-09-02"],
    quotes: [
      "Sure and it's perfectly fine to have no stewards and for the game to have self/executing agreements - Stewards are like the 'training wheels' to the game to help them start - not a desirable endstate. Except one where we're all stewards in our own way.",
    ],
    status: () => "**Staged.** Not built.",
    note: () =>
      "An empty steward seat is never a warning, and nothing queues behind it. A village with nobody on the seat is a " +
      "village nobody can veto: its carried decisions land at their landing time exactly as they would with the seat " +
      "filled. The vacancy read says that in one sentence and never as a fault report.",
  },
  {
    id: 18,
    title: "Voice for other beings, and clans, at 144 players",
    dates: ["2026-09-02"],
    quotes: [
      "part of step 2 is to encourage to name non-human governance roles in your Game (other beings who live on the land) to be part of governance. - For example giving voice to nature (a mountain your project is on a river it borders, the trees and fauna and flora that shares that piece of earth with us) - this creates another idea where a governance function of 'clans' (which groups can name whatever they like and change this name in admin) but groups within the village that anchor on living beings. The water group would tend to the waters the earth group to the land the air group to the air, etc the wolf group would tend to restoring this apex predator - which requires restoring the whole pyramid underneath the beaver clan, etc. etc all clans are namable in admin as well. But these other actors can be given voice - though this is considered a mature feature to build into the Game once you hit 144+ people.",
    ],
    status: (f) => (f.staged.clans ? "**Staged.** Not built." : "**Built.**"),
    note: () =>
      "Clans are a governance object nothing in the code knows about yet: groups within a village, each anchored on a " +
      "living being or an element, each tending what it is named for, every name editable in the Game Mechanics section. " +
      "Giving those actors Voice is a MATURE feature and unlocks at 144 or more players. The founding step should invite " +
      "the catalysts to name non-human governance roles: a mountain, a river, the trees, the fauna and flora that share " +
      "the land.",
  },
  {
    id: 19,
    title: "A passed change lands at the new moon itself",
    dates: ["2026-09-02"],
    quotes: ["I don't understand this fully."],
    status: (f) => (f.cycleApplyKeys.length > 0 ? "**Half built.**" : "**Staged.** Not built."),
    note: (f) =>
      `Built: ${f.cycleApplyKeys.length} dials wait for the next cycle close instead of applying at the close of the vote, and a ` +
      "minting rule stamped for a coming cycle is promoted on its own by the hourly job at the true boundary. Staged: a " +
      "passed proposal carries no record of the cycle it lands in, the held state is a status plus a live check against a " +
      "code list that can change between the vote and the close, and a member is never told which moon their proposal " +
      "lands on. The ruling: the new moon itself. One routine applies everything due, both the hourly job and the human " +
      "close call it, whichever runs first applies and the other finds nothing left to do, and the proposal says which " +
      "cycle it lands in from the moment it passes.",
  },
  {
    id: 20,
    title: "A late approval rolls to the following new moon",
    dates: ["2026-09-02"],
    quotes: ["explain?"],
    status: () => "**Staged.** Not built.",
    note: () =>
      "The case: a proposal passes on the 20th of the moon, the steward is away, and the approval lands after the new moon " +
      "has come and gone. The ruling is that it waits for the NEXT new moon after the approval, so the promise that " +
      "changes land at cycle starts holds and the page shows the new landing date. It does not take effect mid-moon on " +
      "approval, and it does not expire because a steward missed a boundary.",
  },
  {
    id: 21,
    title: "Nothing is un-votable, criticality raises the bar, and 97 is the recommended ceiling",
    dates: ["2026-09-02"],
    quotes: [
      "Everything can be! But the more critical it is, the higher percentage of quorum you need (hard to get quorum) such that changing the most critical things would require a max high of 97% quorum where only 3% of the whole network would be able to not be informed and have 97% approval (max heights - we don't recommend more than those though they can exceed them (if they do we warn them) because the closer you get to 100% the chances of you getting a stalemate increase where the Game breaks even though a massive majority want to continue they can't because someone died suddenly or stopped playing the Game, etc.",
    ],
    status: (f) => (f.staged.criticality ? "**Staged.** Not built." : "**Built.**"),
    note: (f) =>
      `Every setting carries a criticality tier now, defaulting to routine, and the tier sets both the quorum and the unity ` +
      `a change to it needs: routine asks nothing beyond the village's own dials, structural asks 80 unity and 50 quorum, ` +
      `and constitutional asks 97 and 97, which is the founder's own number. The tiers are themselves eight settings, and ` +
      `the ${f.subjects.length} subject floors that used to live only in code are settings too. All ten are raise-only: the shipped number ` +
      "is a floor and a village may go above it and never below, because a village that can lower the bar for changing the " +
      "bar has no bar. Any dial typed above 97 shows the stalemate warning in words while it is being typed, and the " +
      "Birthing is the one subject exempt from it because it stays at 100 and 100 by rule. Still open: the founder's " +
      "2026-09-02 ruling that a threshold changes at its own current bar, which is a later lane.",
  },
  {
    id: 22,
    title: "Who voted is visible, how they voted is hidden, and names appear after half",
    dates: ["2026-09-02"],
    quotes: [
      "How about the name who participates is visible but by default we hide how they voted (and we only expose faces once 50% of the required vote count happens (so you can't really tell who voted what) but we don't say what they voted by default - but in settings this can be changed to public voting.",
    ],
    status: (f) => (f.staged.secrecy ? "**Staged, and the code currently says the opposite.**" : "**Built.**"),
    note: () =>
      "Votes are named on purpose today: the decision page says this village does not run secret ballots, and the roll " +
      "serves each voter's name, choice and frozen weight. No secrecy setting exists. The ruling supersedes the earlier " +
      "one that closed this question in the other direction. Counts and shares of weight stay visible under every setting, " +
      "so the people-and-weight sentence is unaffected.",
  },
  {
    id: 23,
    title: "How this document gets built and proven",
    dates: ["2026-09-02"],
    quotes: [
      "your role now is to respond to my ideas for improvement with a final execution plan. Then you're going to oversee Agents who are running on Opus or lower for what you need and only you are the Fable model as the swarm coordinator to oversee building this whole plan. You'll only complete once you've done a QA test as a fake account going through all governance actions and interacting with the site. You'll continue with QA passes building in a better Game and experience as they 'Play the Game'.",
    ],
    status: () => "**Half built.**",
    note: () =>
      "The document, its guard, its self-test and its database test are here. The walk this ruling asks for, a fresh " +
      "account driven through every governance action on a running site, is what the rest of the work is measured by, and " +
      "it has not been done yet.",
  },
];

// ── Facts ───────────────────────────────────────────────────────────────────

/**
 * The staleness guards for everything this document calls staged.
 *
 * Copying the sibling generator's lesson exactly, including the part that
 * cost it a rewrite: THE PATTERNS ARE NARROW. A loose match over every dial
 * key is how a document cheerfully announces a setting that does not exist.
 * Each pattern below is scoped to the surface the ruling would actually land
 * on, so a key about something else cannot trip it.
 *
 * Each returns true while the thing is still absent. The refusals live in
 * `stalenessProblem` beside them, so the message that stops the build names
 * the ruling whose status went stale.
 */
function stagedFlags(dialKeys, governanceKeys, caps, dispatcher, routes, launchSubject) {
  const anyKey = (re) => governanceKeys.some((k) => re.test(k));
  const launchBody = dispatcher.bodies[launchSubject] ?? "";
  return {
    steward:
      !caps.some((c) => /steward/i.test(c)) &&
      !anyKey(/steward/i) &&
      !dispatcher.all.some((k) => /steward|approval/i.test(k)),
    launchSeatsSteward: !/steward/i.test(launchBody),
    governanceWeek: !anyKey(/week/i),
    delegation: !anyKey(/delegat/i) && !routes.rows.some((r) => /delegat/i.test(r.path)),
    cycleSetting: !dialKeys.some((k) => /^cycle\./i.test(k) || /(cycle_mode|cycle_kind|rhythm)/i.test(k)),
    clans: !dialKeys.some((k) => /\bclan/i.test(k)),
    // The tiers landed as `governance.tier_<tier>_<dial>_pct` settings, and the
    // word criticality itself lives on a VariableDef property where no key can
    // carry it. A pattern watching for "critical" alone therefore stayed quiet
    // through the whole landing, which is the failure mode this guard exists to
    // prevent, so the tier keys are what it watches now.
    criticality: !anyKey(/critical/i) && !anyKey(/\.tier_/i),
    secrecy: !anyKey(/(secret|anonym|voter_identity|public_votes|ballot_privacy)/i),
    governanceModeSubject: !dispatcher.all.some((k) => /governance_mode/i.test(k)),
  };
}

function stalenessProblem(staged) {
  // Rulings 1, 4, 7 and 21 landed on 2026-09-02 in the governance build, so
  // their rows come out of this list and their notes now describe what shipped.
  // A row stays here only while the ruling's note still says "not built": the
  // guard's whole job is to stop the build once, on the day the code moves past
  // the prose, and it has done that job for these four.
  const complaints = [
    [!staged.governanceWeek, 6, "a governance week"],
    [!staged.cycleSetting, 13, "a cycle setting"],
    [!staged.clans, 18, "clans"],
    [!staged.secrecy, 22, "a voter-identity setting"],
    [!staged.governanceModeSubject, 14, "a governance_mode subject type"],
  ];
  for (const [built, ruling, what] of complaints) {
    if (!built) continue;
    return (
      `something in the code looks like ${what}, which ruling ${ruling} describes as staged. ` +
      `If it is, update ruling ${ruling}'s status and note in scripts/generate-governance-doc.mjs. ` +
      "If it is not, narrow the pattern beside this check in stagedFlags()."
    );
  }
  return null;
}

export function collectFacts(root = ROOT) {
  for (const rel of SOURCES) {
    if (!fs.existsSync(absOf(root, rel))) fail(`${rel} is gone; the generator reads it`);
  }

  const dispatcher = dispatcherKeys(root);
  const subjects = subjectFloors(root);
  const engine = engineFacts(root);
  const statuses = ballotStatuses(root);
  const dialFacts = governanceDials(root);
  const caps = capabilityFacts(root);
  const mod = moduleFacts(root);
  const wizard = wizardTypes(root);
  const weights = weightFacts(root);
  const changeSet = changeSetFacts(root);
  const launch = launchFacts(root);
  const clock = clockFacts(root);
  const routes = routeFacts(root);
  const commit = sourceCommit(root);

  const byKey = Object.fromEntries(dialFacts.governance.map((d) => [d.key, d]));
  const need = (key) => {
    const d = byKey[key];
    if (!d) fail(`shared/gameVariables.ts no longer defines the Governance dial "${key}"; this document states it by name`);
    return d;
  };

  const launchSubject = subjects.find((s) => s.everySeatWeighs && s.minUnityPct === 100 && s.minQuorumPct === 100);
  if (!launchSubject) {
    fail(
      "no subject in SUBJECT_THRESHOLDS asks 100 unity, 100 quorum and every seat weighing. " +
        "The Birthing rule is the one floor this document cannot render without.",
    );
  }

  const governanceKeys = dialFacts.governance.map((d) => d.key);
  const missingSubject = subjectCoverageProblem(dispatcher.all);
  if (missingSubject) fail(missingSubject.replace(/^governance-doc: /, ""));
  const missingDial = dialCoverageProblem(governanceKeys);
  if (missingDial) fail(missingDial.replace(/^governance-doc: /, ""));
  const staged = stagedFlags(dialFacts.allKeys, governanceKeys, caps.all, dispatcher, routes, launchSubject.subject);
  const stale = stalenessProblem(staged);
  if (stale) fail(stale);

  const executes = new Set(dispatcher.all);
  const subjectRows = subjects.map((s) => ({ ...s, executes: executes.has(s.subject) }));

  return {
    commit,
    dispatcher,
    subjects: subjectRows,
    launchFloor: launchSubject,
    engine,
    statuses,
    dials: {
      all: dialFacts.governance,
      unity: need("governance.unity_pct"),
      quorum: need("governance.quorum_pct"),
      voteDays: need("governance.vote_days"),
      consentDays: need("governance.consent_window_days"),
      method: need("governance.default_method"),
      weightMode: need("governance.weight_mode"),
      weightToken: need("governance.weight_token"),
      autoApply: need("governance.auto_apply_enabled"),
      hubUrl: need("governance.hub_url"),
      supportThreshold: need("governance.proposal_support_threshold"),
      perCycleCap: need("governance.proposals_per_member_per_cycle"),
    },
    cycleApplyKeys: dialFacts.cycleApplyKeys,
    stageMultipliersAreCycleTimed: dialFacts.stageMultipliersAreCycleTimed,
    capabilities: caps,
    module: mod,
    wizard,
    weights,
    changeSet,
    launch,
    clock,
    routes,
    staged,
  };
}

// ── Rendering ───────────────────────────────────────────────────────────────

function table(headers, rows) {
  const lines = [`| ${headers.join(" | ")} |`, `| ${headers.map(() => "---").join(" | ")} |`];
  for (const r of rows) lines.push(`| ${r.join(" | ")} |`);
  return lines.join("\n");
}

const code = (s) => `\`${s}\``;
const list = (xs) => xs.map(code).join(", ");

export function render(f) {
  const L = [];
  const p = (s = "") => L.push(s);
  /** A person's sentence, marked in the source of the document where it appears. */
  const say = (key) => {
    const text = PROSE[key];
    if (!text) fail(`render() asked for the prose entry "${key}", which PROSE does not hold`);
    p(`<!-- written by a person: ${key} -->`);
    p(text);
  };
  const quote = (text) => {
    p("<!-- the founder's own words -->");
    p(`> ${text.replace(/\n/g, " ")}`);
  };

  p("# Governance");
  p();
  say("purpose");
  p();
  say("scope");
  p();

  p("## How to read this file");
  p();
  say("generated");
  p();
  p(`It describes the code at commit \`${f.commit}\`.`);
  p();
  say("editing");
  p();
  p("```bash");
  p("node scripts/generate-governance-doc.mjs");
  p("```");
  p();
  say("twoKinds");
  p();
  say("readFromCode");
  p();
  say("writtenByPerson");
  p();
  say("noTimestamp");
  p();

  p("## The constitution in one screen");
  p();
  say("constitutionOpening");
  p();
  say("ringZero");
  p();
  say("ringZeroFreeze");
  p();
  say("birthingRule");
  p();
  p(
    table(
      ["The Birthing asks", "Number", "Where it lives"],
      [
        ["Unity, the share of the weight that took a side and agreed", `${f.launchFloor.minUnityPct}%`, "code, `shared/ballotSubjects.ts`"],
        ["Quorum, the share of the frozen weight that answered", `${f.launchFloor.minQuorumPct}%`, "code, `shared/ballotSubjects.ts`"],
        ["People on the roll before it may be asked", String(f.launchFloor.minElectorate), "code, `shared/ballotSubjects.ts`"],
        ["Every seat carrying weight above zero", f.launchFloor.everySeatWeighs ? "required" : "not required", "code, `shared/ballotSubjects.ts`"],
        ["Method", code(f.launchFloor.method ?? "the village's own"), "code, `shared/ballotSubjects.ts`"],
      ],
    ),
  );
  p();
  p(
    `With every seat above zero, ${f.launchFloor.minQuorumPct}% of the weight is reached only when every seat has answered, ` +
      "so the weight rule proves the people rule. A Birthing carries when all of the people on the frozen roll have voted " +
      "and all of the weight that took a side agrees.",
  );
  p();
  say("criticality");
  p();
  say("criticalityToday");
  p();
  say("publishModule");
  p();
  p(
    `The governance module ships **off**. Its lifecycles are ${list(f.module.lifecycles)}, an absent row means off, and its ` +
      `prefixes are ${list(f.module.apiPrefixes)}. It turns on ${list(f.module.capabilities)} and carries ${f.module.variableKeys.length} ` +
      "settings of its own.",
  );
  p();

  p("## What a decision is");
  p();
  say("decisionIs");
  p();
  p(`A ballot is in one of these states: ${list(f.statuses)}.`);
  p();
  say("oneOpenBallot");
  p();
  say("votesChangeable");
  p();
  say("closingIsHuman");
  p();

  p("## How a vote is counted");
  p();
  say("countingIntro");
  p();
  p("```");
  p("unity  = (yes + no > 0) ? yesWeight / (yesWeight + noWeight) : 0");
  p("quorum = totalWeight > 0 ? (yesWeight + noWeight + abstainWeight) / totalWeight : 0");
  p("passed = quorum >= quorumFrozen && unity >= unityFrozen");
  p("```");
  p();
  say("abstainRule");
  p();
  p(`A vote is one of ${list(f.engine.choices)}. An outcome is one of ${list(f.engine.outcomes)}.`);
  p();
  p(
    table(
      ["Method", "What it asks", "Unity it stamps at open"],
      f.engine.methods.map((m) => [
        code(m),
        {
          majority: "Unity strictly above 50. A tie fails.",
          custom: "Unity at or above the number the ballot froze.",
          consensus: "No weight voted no, and some weight voted yes.",
          consent: "No objection is standing. Unity is never read.",
        }[m] ?? "could not derive",
        f.engine.presets[m] === null || f.engine.presets[m] === undefined
          ? "the village's own"
          : String(f.engine.presets[m]),
      ]),
    ),
  );
  p();
  say("peopleAndWeight");
  p();

  p("## The dials a village holds");
  p();
  say("dialsIntro");
  p();
  p(
    table(
      ["Key", "What it decides", "Ring", "Default", "Bounds", "Applies"],
      f.dials.all.map((d) => [
        code(d.key),
        d.label,
        code(d.ring),
        d.default === undefined ? "none" : code(String(d.default)),
        d.min === undefined && d.max === undefined
          ? d.choices
            ? list(d.choices.map((c) => c.value))
            : d.type
          : `${d.min ?? "none"} to ${d.max ?? "none"}${d.unit ? ` ${d.unit}` : ""}`,
        d.applyTiming === "cycle-close" ? "at the next cycle close" : "when it is written",
      ]),
    ),
  );
  p();
  say("dialsStorage");
  p();
  p(
    `${f.cycleApplyKeys.length} settings across the whole registry wait for a cycle close instead of applying when they are ` +
      `written: ${list(f.cycleApplyKeys)}. ` +
      (f.stageMultipliersAreCycleTimed
        ? "The per-stage sending multipliers carry the same timing through their own override, one for each rung of the ladder. "
        : "") +
      `None of the ${f.dials.all.length} settings above is one of them, so every governance dial takes effect the moment it is written.`,
  );
  p();

  p("## What each kind of decision asks");
  p();
  say("subjectsIntro");
  p();
  p(
    table(
      ["Subject type", "Least unity", "Least quorum", "People on the roll", "Every seat weighs", "Method", "Executes at close"],
      f.subjects.map((s) => [
        code(s.subject),
        `${s.minUnityPct}%`,
        `${s.minQuorumPct}%`,
        String(s.minElectorate),
        s.everySeatWeighs ? "yes" : "no",
        s.method ? code(s.method) : "the village's own",
        s.executes ? "yes" : "no, it conducts a decision and executes nothing",
      ]),
    ),
  );
  p();
  for (const s of f.subjects) {
    p(`- ${code(s.subject)}: ${s.why}`);
  }
  p();
  p(
    `Every other subject type keeps the village's own dials: ${code(f.dials.unity.default + "% unity")} and ` +
      `${code(f.dials.quorum.default + "% quorum")} on a fresh village, with no floor of its own.`,
  );
  p();
  p(
    `A member drafts through the wizard, which knows ${f.wizard.server.length} types: ${list(f.wizard.server)}. ` +
      `${f.wizard.conductable.length} of them can be taken to a binding vote today (${list(f.wizard.conductable)}); ` +
      `the other ${f.wizard.advisory.length} open as practice votes (${list(f.wizard.advisory)}).`,
  );
  p();
  say("practiceVotes");
  p();
  p(
    f.wizard.server.join("|") === f.wizard.client.join("|")
      ? "The wizard's type list is held in two files, once on the server and once in the browser, and they agree today."
      : `**The wizard's two type lists disagree.** The server knows ${list(f.wizard.server)} and the browser knows ` +
        `${list(f.wizard.client)}. One of them is showing a member something the other cannot answer.`,
  );
  p();
  p(
    `A change set carries at most ${f.changeSet.maxChanges} entries, all game dials or all minting rules and never both, ` +
      "because a ballot carries one threshold priced by its subject and a set that is two subjects has no honest price.",
  );
  p();

  p("## What closing a decision does");
  p();
  say("closingIntro");
  p();
  p(
    table(
      ["Subject type", "What a passed vote changes", "How it reaches its executor"],
      [
        ...f.dispatcher.direct.map((k) => [code(k), SUBJECT_WORDS[k], "its own entry in the close dispatcher"]),
        ...f.dispatcher.aliases.map((a) => [
          code(a.key),
          SUBJECT_WORDS[a.key],
          `the same executor as ${code(a.sameAs)}, one executor and two subject types`,
        ]),
      ],
    ),
  );
  p();
  p(
    `${f.dispatcher.all.length} subject types execute something. Whether a member's vote BINDS is derived from this same ` +
      "table, so the word on the decision page and the behaviour at the close cannot come apart.",
  );
  p();

  p("## Starting the Game: the Birthing");
  p();
  say("launchIntro");
  p();
  p(`Until it carries, issuance is refused in these words: "${f.launch.issuanceRefusal}"`);
  p();
  say("launchStored");
  p();
  p(`The fact is one document in the village's own config, under the key ${code(f.launch.configKey)}.`);
  p();
  say("launchEnds");
  p();

  p("## Voting weight");
  p();
  say("weightIntro");
  p();
  p(
    table(
      ["Mode", "What a member's vote weighs"],
      [
        ["`equal`", "One. One person, one vote."],
        ["`token`", "Their balance of the weight token at the moment the ballot opened, floored at zero."],
        ["`custom`", "Their row in the allocation table. An absent row is zero, which fails closed."],
      ].filter((row) => f.weights.modes.includes(row[0].replace(/`/g, ""))),
    ),
  );
  p();
  p(
    `A fresh village runs ${code(f.dials.weightMode.default)} mode with the weight token set to ` +
      `${code(f.dials.weightToken.default)}. Both dials are ${code(f.dials.weightMode.ring)} ring.`,
  );
  p();
  say("weightToken");
  p();
  say("weightTrail");
  p();

  p("## Who may do what");
  p();
  say("whoIntro");
  p();
  p(
    table(
      ["Power", "What it lets a member do", "Rung that grants it", "A badge can take it away"],
      f.capabilities.all
        .filter((c) => /^(proposal|ballot|member|mechanics|org|dial)\./.test(c))
        .map((c) => [
          code(c),
          f.capabilities.labels[c],
          f.capabilities.unlocks[c] ? code(f.capabilities.unlocks[c]) : "never by rung; a role or a badge grants it",
          f.capabilities.deniable[c] ? "yes" : "**no**",
        ]),
    ),
  );
  p();

  p("## The word steward means three things");
  p();
  say("stewardThree");
  p();
  say("stewardQuest");
  p();
  say("stewardPersona");
  p();
  say("stewardApprover");
  p();

  p("## What a village publishes");
  p();
  say("publishIntro");
  p();
  p(
    table(
      ["Method", "Path", "Who gets an answer", "Power it asks for"],
      f.routes.rows.map((r) => [r.method, code(r.path), r.door, r.capability ? code(r.capability) : "none"]),
    ),
  );
  p();
  p(
    `${f.routes.total} routes: ${f.routes.governanceCount} under the governance prefix and ${f.routes.mechanicsCount} under the ` +
      `mechanics prefix. ${f.routes.anonymous.length} of them answer a stranger, ${f.routes.withCapability.length} ask for a named power, ` +
      `and ${f.routes.undeclared.length} could not be classified from the code by this reader.`,
  );
  p();
  if (f.routes.anonymous.length) {
    p(
      "The routes that answer a stranger are the village's public record. At the module's `public` lifecycle they serve " +
        "the ballot list, one decision in full and the objection lineage to anybody on the internet, which includes each " +
        "voter's first name, their choice and their frozen weight. Ruling 22 changes that and is staged.",
    );
    p();
  }

  p("## The cycle");
  p();
  say("cycleIntro");
  p();
  p(
    table(
      ["Fact", "Value"],
      [
        ["A cycle is", "one lunation"],
        ["Mean synodic month", `${f.clock.synodicMonthDays} days`],
        ["True instants from the checked-in table, from cycle", String(f.clock.trueClockFromCycle)],
        ["Cycle id", `${code(f.clock.idPrefix + "NNNNNN")}, zero padded to ${f.clock.idDigits} digits, for example ${code(f.clock.idExample)}`],
      ],
    ),
  );
  p();
  say("cycleClose");
  p();

  p("## The bridge to the hub");
  p();
  say("bridgeIntro");
  p();
  say("bridgeHonest");
  p();
  p(
    `The hub address is ${code(f.dials.hubUrl.key)}, a ${code(f.dials.hubUrl.ring)}-ring dial defaulting to ` +
      `${code(String(f.dials.hubUrl.default))}. Nothing is sent until a shared secret is configured beside it.`,
  );
  p();

  p("## What is broken today");
  p();
  say("brokenIntro");
  p();
  p(
    "- **A close and its executor still decide separately from the steward.** The seat, its capability, its record and " +
      "its two settings all exist, and the close dispatcher has no step that reads any of them, so a passed ballot runs " +
      "its executor at the close and an approval or a refusal changes no outcome today. Nothing seats a catalyst as a " +
      "steward yet either, so no village has one.",
  );
  p(
    "- **A close and its executor are not one transaction.** The ballot is closed by one guarded update and the executor " +
      "runs after it. An executor that throws leaves a ballot closed and passed with nothing applied, and only the " +
      "mechanics subject has a second door to apply by hand.",
  );
  p(
    `- **${f.routes.anonymous.filter((r) => r.path.startsWith("/api/governance")).length} reads under the governance prefix answer a ` +
      "stranger**, and at the module's `public` lifecycle that means the whole voter roll with names, choices and weights " +
      "is served to the internet.",
  );
  p(
    "- **A weight in token mode is displayed in ledger units.** A holding a member reads as 0.1 weighs 100 in the tally, " +
      "and the hand-mint form takes raw units with no hint, so typing 1 for a 3-decimal token mints a thousandth.",
  );
  p(
    "- **Two tokens are called Voice**, the platform's own and the mirror of what lives on Base, and only the first can " +
      "weigh a vote. The default weight token is neither of them.",
  );
  p(
    "- **A stored reason on a no vote is shown to nobody.** The widget invites a member to say why and the reader that " +
      "serves votes drops it.",
  );
  p(
    "- **The module lifecycle is edited by hand**, so a village turns its own governance on through the admin panel and " +
      "never through a vote.",
  );
  p(
    "- **Four displays about the hub bridge are false.** The sync flag is never set true so the card always says pending, " +
      "the space check idles on every delivery, an outcome's source is hardcoded, and the card credits a hub with issuing " +
      "a secret it does not issue.",
  );
  p(
    "- **Two schema comments have drifted.** The engine's own migration lists five subject types in the column " +
      `comment where the dispatcher now executes ${f.dispatcher.all.length}, and a later migration's header names the number of the ` +
      "one before it. Neither is edited, because a shipped migration file is never edited; both are stated here " +
      "instead.",
  );
  p();

  p("## What is staged");
  p();
  say("stagedIntro");
  p();
  for (const r of RULINGS) {
    const label = r.status(f);
    if (!/Staged/.test(label)) continue;
    p(`- **${r.title}** (ruling ${r.id})`);
  }
  p();

  p("## The founder's rulings");
  p();
  say("rulingsIntro");
  p();
  say("rulingsQuoteNote");
  p();
  for (const r of RULINGS) {
    p(`### ${r.id}. ${r.title}`);
    p();
    p(`${r.status(f)} ${statusIsStated(r) ? "Status stated by a person; the code cannot answer this one." : "Status computed from the code."} Said ${r.dates.join(" and ")}.`);
    p();
    for (const q of r.quotes) {
      quote(q);
      p();
    }
    p(`<!-- written by a person: ruling-${r.id} -->`);
    p(r.note(f));
    p();
  }

  p("## Machine-readable");
  p();
  say("machineIntro");
  p();
  p("```json");
  p(
    JSON.stringify(
      {
        commit: f.commit,
        module: {
          id: f.module.id,
          shipsAs: "off",
          lifecycles: f.module.lifecycles,
          apiPrefixes: f.module.apiPrefixes,
          capabilities: f.module.capabilities,
          variableKeys: f.module.variableKeys,
        },
        engine: {
          methods: f.engine.methods,
          voteChoices: f.engine.choices,
          outcomes: f.engine.outcomes,
          ballotStatuses: f.statuses,
          unityStampedByMethod: f.engine.presets,
          // The default, which a subject may override. Read the per-subject
          // `abstainPolicy` below before believing either of these about a
          // particular ballot.
          abstainCountsTowardQuorumByDefault: true,
          abstainCountsTowardUnityByDefault: false,
        },
        subjects: f.subjects.map((s) => ({
          subjectType: s.subject,
          // A floor of null means this subject states no floor of its own and
          // takes the one its criticality tier sets. JSON drops an undefined
          // value and would have dropped the key with it, which reads as a
          // subject that forgot to have a floor.
          minUnityPct: s.minUnityPct ?? null,
          minQuorumPct: s.minQuorumPct ?? null,
          minElectorate: s.minElectorate ?? null,
          everySeatWeighs: !!s.everySeatWeighs,
          method: s.method ?? null,
          criticality: s.criticality ?? null,
          abstainPolicy: s.abstainPolicy ?? null,
          minYesHeads: s.minYesHeads ?? null,
          executesAtClose: s.executes,
          why: s.why ?? null,
        })),
        executingSubjectTypes: f.dispatcher.all,
        dials: f.dials.all.map((d) => ({
          key: d.key,
          label: d.label,
          ring: d.ring,
          type: d.type,
          default: d.default ?? null,
          min: d.min ?? null,
          max: d.max ?? null,
          choices: d.choices ? d.choices.map((c) => c.value) : null,
          applyTiming: d.applyTiming,
        })),
        cycleApplyKeys: f.cycleApplyKeys,
        weightModes: f.weights.modes,
        changeSetMaxEntries: f.changeSet.maxChanges,
        wizard: {
          types: f.wizard.server,
          conductable: f.wizard.conductable,
          advisory: f.wizard.advisory,
          clientAgrees: f.wizard.server.join("|") === f.wizard.client.join("|"),
        },
        capabilities: f.capabilities.all
          .filter((c) => /^(proposal|ballot|member|mechanics|org|dial)\./.test(c))
          .map((c) => ({
            key: c,
            label: f.capabilities.labels[c],
            unlocksAtStage: f.capabilities.unlocks[c] ?? null,
            deniableByBadge: f.capabilities.deniable[c],
          })),
        routes: f.routes.rows.map((r) => ({
          method: r.method,
          path: r.path,
          door: r.door,
          capability: r.capability,
          file: r.file,
        })),
        cycle: {
          kind: "lunar",
          synodicMonthDays: f.clock.synodicMonthDays,
          trueClockFromCycle: f.clock.trueClockFromCycle,
          idFormat: `${f.clock.idPrefix}${"N".repeat(f.clock.idDigits)}`,
        },
        launch: { configKey: f.launch.configKey, issuanceRefusedUntilStarted: true },
        rulings: RULINGS.map((r) => ({
          id: r.id,
          title: r.title,
          dates: r.dates,
          status: r.status(f).replace(/\*/g, "").trim(),
          statusBasis: statusIsStated(r) ? "stated" : "computed",
        })),
      },
      null,
      2,
    ),
  );
  p("```");
  p();

  p("## What this file is made from");
  p();
  say("madeFromIntro");
  p();
  for (const rel of SOURCES) p(`- ${code(rel)}`);
  p();
  say("madeFromReaders");
  p();
  say("madeFromCommit");
  p();
  say("madeFromTest");
  p();

  const text = L.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
  const gap = proseCoverageProblem(text);
  if (gap) fail(gap.replace(/^governance-doc: /, ""));
  return text;
}

export function generate(root = ROOT) {
  return render(collectFacts(root));
}

/** The document and the facts behind it, for callers that report on both. */
export function generateDetailed(root = ROOT) {
  const facts = collectFacts(root);
  return { text: render(facts), facts };
}

export { PROSE, RULINGS, SUBJECT_WORDS, KNOWN_DIALS };

const invokedDirectly =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

if (invokedDirectly) {
  try {
    const text = generate();
    if (process.argv.includes("--stdout")) {
      process.stdout.write(text);
    } else {
      fs.mkdirSync(path.dirname(DOC_PATH), { recursive: true });
      fs.writeFileSync(DOC_PATH, text, "utf8");
      process.stdout.write(`wrote docs/GOVERNANCE.md (${text.split("\n").length} lines)\n`);
    }
  } catch (err) {
    process.stderr.write(`\n${err instanceof ReadError ? err.message : err?.stack ?? String(err)}\n\n`);
    process.exit(1);
  }
}
