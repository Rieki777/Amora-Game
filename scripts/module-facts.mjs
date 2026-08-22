#!/usr/bin/env node
/**
 * The current truth about the module framework, printed.
 *
 * This is the first command a module builder runs. Its whole job is to stop
 * the starting document from rotting: every number and every list below is
 * READ FROM THE SOURCE at the moment you run it, so a guide can say "run this"
 * instead of restating a field list that goes stale the week after it is
 * written.
 *
 * Nothing here is hardcoded. The field list comes from the `ModuleDef`
 * interface, the tier and data-class and lifecycle vocabularies come from
 * their type aliases, the capability count comes from `ALL_CAPABILITIES`, the
 * gate commands come from `.github/workflows/ci.yml`, and the contract version
 * comes from the contract document. When one of those changes, this output
 * changes with it and no human has to remember to edit anything.
 *
 * WHY THE COMPILER AND NOT A REGEX. `scripts/validate-module.mjs` transpiles
 * the real registry and calls the real function rather than re-implementing
 * its rules, for the stated reason that a second opinion drifts from the
 * first. Same principle here, with one addition: the things this script
 * reports are mostly TYPES, and types erase during transpilation. So values
 * (the module list, the contract constant, the capability list) come from
 * transpiling and importing, and vocabularies (tier, data class, lifecycle,
 * the field list) come from parsing the declaration with the TypeScript
 * compiler's own parser. Neither is a guess at the file.
 *
 * A MISSING SOURCE IS A FAILURE, NEVER A SKIP. If any file below cannot be
 * read, this exits non-zero and says which one. A facts command that silently
 * omits a section teaches the reader a shorter truth than the real one, which
 * is the exact failure `validate-module.mjs` exists to avoid.
 *
 * Usage:
 *   node scripts/module-facts.mjs
 *   node scripts/module-facts.mjs --json
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"),
  "..",
);

const asJson = process.argv.includes("--json");
const missing = [];

/**
 * Read a required source, named with forward slashes so the path this prints
 * is the path a reader can paste back on any platform.
 */
function required(relPath) {
  try {
    return fs.readFileSync(path.join(ROOT, ...relPath.split("/")), "utf8");
  } catch {
    // Deduped: `shared/modules.ts` is read twice, once for values and once for
    // types, and one absent file should be reported as one absent file.
    if (!missing.includes(relPath)) missing.push(relPath);
    return null;
  }
}

// ── Values: transpile and import, the way validate-module.mjs does ───────────

/**
 * Transpile `shared/<entry>.ts` into a scratch directory and import it.
 * Relative specifiers gain an extension because Node's ESM resolver requires
 * one. Type-only imports erase, so each file below comes out self-contained.
 */
async function loadShared(entry) {
  const src = required(`shared/${entry}.ts`);
  if (src === null) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "module-facts-"));
  try {
    const js = ts
      .transpileModule(src, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      })
      .outputText.replace(/(from\s+")(\.\/[A-Za-z0-9_-]+)(")/g, "$1$2.mjs$3");
    fs.writeFileSync(path.join(dir, `${entry}.mjs`), js, "utf8");
    return await import(new URL(`file://${path.join(dir, `${entry}.mjs`)}`).href);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── Vocabularies: parse the declarations, because types do not survive ───────

/** Parse a shared source once so several readers can walk the same tree. */
function parseShared(entry) {
  const src = required(`shared/${entry}.ts`);
  if (src === null) return null;
  return ts.createSourceFile(`${entry}.ts`, src, ts.ScriptTarget.ES2022, true);
}

/**
 * The members of an interface, with their optionality and declared type.
 * Reported in declaration order, which is the order a builder reads them in.
 */
function interfaceFields(sourceFile, interfaceName) {
  if (!sourceFile) return null;
  for (const stmt of sourceFile.statements) {
    if (!ts.isInterfaceDeclaration(stmt) || stmt.name.text !== interfaceName) continue;
    return stmt.members.filter(ts.isPropertySignature).map((m) => ({
      name: m.name.getText(sourceFile),
      optional: !!m.questionToken,
      type: m.type ? m.type.getText(sourceFile).replace(/\s+/g, " ") : "unknown",
    }));
  }
  return null;
}

/**
 * The string members of a union type alias. Returns null when the alias is
 * absent and an empty list when it exists and is not a union of strings, so a
 * renamed type reads differently from a restructured one.
 */
function unionStrings(sourceFile, aliasName) {
  if (!sourceFile) return null;
  for (const stmt of sourceFile.statements) {
    if (!ts.isTypeAliasDeclaration(stmt) || stmt.name.text !== aliasName) continue;
    const node = stmt.type;
    const parts = ts.isUnionTypeNode(node) ? node.types : [node];
    return parts
      .filter((p) => ts.isLiteralTypeNode(p) && ts.isStringLiteral(p.literal))
      .map((p) => p.literal.text);
  }
  return null;
}

// ── The gate commands, read from the workflow that actually decides ──────────

/**
 * The `verify` job's steps, as (name, command) pairs.
 *
 * Deliberately a targeted line scan and not a YAML dependency: this repository
 * refuses new dependencies, and the shape being read is two known keys at a
 * known indent rather than arbitrary YAML. A step whose `run` is a block
 * scalar is reported as a block, because reproducing a twenty-line shell
 * fragment in a facts listing would be noise. What a builder needs from such a
 * step is whether anything local reproduces it, so the block is scanned for a
 * `node scripts/*.mjs` call and that command is printed when one is there.
 */
function ciGates(yml) {
  if (yml === null) return null;
  const lines = yml.split(/\r?\n/);
  const steps = [];
  let nodeVersion = null;
  const budgets = {};
  let pending = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const nameMatch = /^\s{6}-\s+name:\s+(.+?)\s*$/.exec(line);
    if (nameMatch) {
      pending = nameMatch[1];
      continue;
    }

    const nv = /^\s+node-version:\s*(\S+)\s*$/.exec(line);
    if (nv) nodeVersion = nv[1].replace(/['"]/g, "");

    const budget = /^\s+(MAX_[A-Z_]+):\s*(\S+)\s*$/.exec(line);
    if (budget) budgets[budget[1]] = budget[2];

    const runBlock = /^\s{8}run:\s*\|\s*$/.exec(line);
    if (runBlock && pending) {
      /*
       * A block scalar used to be reported as unreproducible, full stop. That
       * became wrong the day the bundle budget grew a script: the block still
       * holds shell, and the shell now calls a gate a builder can run. So scan
       * forward through the indented body for `node scripts/<name>.mjs` and
       * report the first one as the local reproduction. Scanning stops at the
       * next step, so a later step's command cannot be attributed to this one.
       */
      let local = null;
      for (let j = i + 1; j < lines.length; j++) {
        if (/^\s{6}-\s+name:/.test(lines[j])) break;
        const call = /\b(node\s+scripts\/[\w.-]+\.mjs)/.exec(lines[j]);
        if (call) {
          local = call[1];
          break;
        }
      }
      steps.push({ name: pending, command: null, block: true, local });
      pending = null;
      continue;
    }

    const runOne = /^\s{8}run:\s+(.+?)\s*$/.exec(line);
    if (runOne && pending) {
      steps.push({ name: pending, command: runOne[1], block: false });
      pending = null;
    }
  }
  return { steps, nodeVersion, budgets };
}

// ── The contract version, from the document itself ───────────────────────────

const CONTRACT_PATH = "docs/MODULE_LIBRARY_CONTRACT.md";

/** The version the contract document states about itself. */
function contractVersion(body) {
  if (body === null) return null;
  const m = /\*\*Version\s+([0-9]+\.[0-9]+)\b/i.exec(body);
  return m ? m[1] : null;
}

// ── Gather ───────────────────────────────────────────────────────────────────

const modulesSrc = parseShared("modules");
const registry = await loadShared("modules");
const capabilities = await loadShared("capabilities");
const ciYml = required(".github/workflows/ci.yml");
const contractBody = required(CONTRACT_PATH);

const fields = interfaceFields(modulesSrc, "ModuleDef");
const tiers = unionStrings(modulesSrc, "ModuleTier");
const dataClasses = unionStrings(modulesSrc, "ModuleDataClass");
const lifecycles = unionStrings(modulesSrc, "ModuleLifecycle");
const gates = ciGates(ciYml);
const docVersion = contractVersion(contractBody);

let sha = null;
try {
  sha = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
} catch {
  sha = null;
}

const codeVersion = registry?.MODULE_LIBRARY_CONTRACT_VERSION ?? null;
const moduleCount = registry?.MODULES?.length ?? null;
const coreCount = registry?.MODULES?.filter((m) => m.core).length ?? null;
const listingCount = registry?.MODULES?.filter((m) => m.tier !== "included").length ?? null;
const capabilityCount = capabilities?.ALL_CAPABILITIES?.length ?? null;
const managedCap = registry?.MANAGED_LISTING_CAP ?? null;

// A vocabulary that cannot be read is as much a failure as a missing file:
// printing a short list would teach a shorter truth than the real one.
const unreadable = [];
if (fields === null) unreadable.push("the ModuleDef interface in shared/modules.ts");
if (tiers === null) unreadable.push("the ModuleTier type in shared/modules.ts");
if (dataClasses === null) unreadable.push("the ModuleDataClass type in shared/modules.ts");
if (lifecycles === null) unreadable.push("the ModuleLifecycle type in shared/modules.ts");
if (capabilityCount === null) unreadable.push("ALL_CAPABILITIES in shared/capabilities.ts");
if (gates === null || !gates.steps.length) unreadable.push("the verify job steps in .github/workflows/ci.yml");
if (docVersion === null) unreadable.push("the version line in " + CONTRACT_PATH);

// ── Report ───────────────────────────────────────────────────────────────────

if (asJson) {
  console.log(
    JSON.stringify(
      {
        sha,
        contract: { document: docVersion, registryConstant: codeVersion },
        modules: { total: moduleCount, core: coreCount, listings: listingCount, managedCap },
        moduleDefFields: fields,
        tiers,
        dataClasses,
        lifecycles,
        capabilityCount,
        ci: gates,
        missing,
        unreadable,
      },
      null,
      2,
    ),
  );
} else {
  console.log(`Module framework facts, read at ${sha ?? "an unknown commit"}\n`);

  console.log(`Registry: ${moduleCount} module(s), ${coreCount} core, ${listingCount} listing(s) above included.`);
  console.log(`Concurrent managed listings are capped at ${managedCap}.`);
  console.log(`Capability keys in the one gate: ${capabilityCount}.\n`);

  console.log("Contract version");
  console.log(`  ${CONTRACT_PATH} states: ${docVersion ?? "UNREADABLE"}`);
  console.log(`  shared/modules.ts constant: ${codeVersion ?? "UNREADABLE"}`);
  if (docVersion && codeVersion && docVersion !== codeVersion) {
    console.log("  THESE DISAGREE. A listing is stamped with the constant, so the document is the one that is wrong.");
  }
  console.log("");

  console.log("ModuleDef fields (shared/modules.ts, declaration order)");
  for (const f of fields ?? []) {
    console.log(`  ${f.optional ? " " : "*"} ${f.name.padEnd(16)} ${f.type.slice(0, 78)}`);
  }
  console.log("  (* marks a required field.)\n");

  console.log(`Tiers: ${(tiers ?? []).join(", ") || "UNREADABLE"}`);
  console.log(`Data classes: ${(dataClasses ?? []).join(", ") || "UNREADABLE"}`);
  console.log(`Lifecycle: ${(lifecycles ?? []).join(", ") || "UNREADABLE"}\n`);

  console.log(`Gates, in the order CI runs them (.github/workflows/ci.yml, Node ${gates?.nodeVersion ?? "?"})`);
  for (const s of gates?.steps ?? []) {
    if (s.block && s.local) console.log(`  ${s.name}: a shell block in the workflow, reproduced locally by \`${s.local}\``);
    else if (s.block) console.log(`  ${s.name}: a shell block in the workflow, no local command reproduces it`);
    else console.log(`  ${s.command}`);
  }
  const budgets = Object.entries(gates?.budgets ?? {});
  if (budgets.length) {
    console.log("\nBudgets CI enforces");
    for (const [k, v] of budgets) console.log(`  ${k} = ${v}`);
  }

  console.log("\nRun the listing lint before you open a pull request:");
  console.log("  node scripts/validate-module.mjs <your-module-id>");
}

// ── Exit ─────────────────────────────────────────────────────────────────────

if (missing.length || unreadable.length) {
  for (const m of missing) console.error(`MISSING SOURCE: ${m}`);
  for (const u of unreadable) console.error(`COULD NOT READ: ${u}`);
  console.error("\nThese facts are incomplete, so this exits non-zero rather than teaching a shorter truth.");
  process.exit(1);
}
