#!/usr/bin/env node
/**
 * The listing lint: what a developer runs before submitting a module, and what
 * CI can run later against every entry in the registry.
 *
 * This is the seed of the stage 6 gate in the module library contract ("all
 * five driver methods demonstrated"). It implements the checks that are
 * STATICALLY checkable today and PRINTS the ones that are not, because a check
 * that quietly skips converts "unchecked" into "passed", which is the failure
 * this file exists to avoid. Everything under "cannot be checked here" is a
 * real obligation with a real reviewer behind it, and saying so out loud is the
 * only honest way to ship a partial gate.
 *
 * WHY IT LOADS THE REAL REGISTRY. `shared/modules.ts` already owns
 * `moduleListingProblems`, which boot asserts on and a unit test asserts on.
 * Re-implementing those rules here would create a second opinion about what a
 * valid listing is, and the two would drift. So this script transpiles the real
 * file and calls the real function, and adds only the checks that need to reach
 * OUTSIDE the registry: the docs shelf, the launch registry, and the server's
 * driver wiring.
 *
 * Usage:
 *   node scripts/validate-module.mjs             every listing in the registry
 *   node scripts/validate-module.mjs saberra     one module id
 *   node scripts/validate-module.mjs --all       every module, listings or not
 */
import fs from "fs";
import os from "os";
import path from "path";
import ts from "typescript";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"),
  "..",
);

let violations = 0;
let checks = 0;
const cannotCheck = [];

const ok = (line) => { checks++; console.log(`  ${line}  OK`); };
const bad = (line) => { checks++; violations++; console.log(`  ${line}  <-- VIOLATION`); };
const note = (line) => cannotCheck.push(line);

// ── Loading the real shared registries ───────────────────────────────────────

/**
 * Transpile `shared/*.ts` into a scratch directory and import it, so this
 * script reads the same objects the server does instead of a regex's guess at
 * them. Relative specifiers are rewritten to carry an extension because Node's
 * ESM resolver requires one; type-only imports erase during transpilation, so
 * `shared/modules.ts` and `shared/launchRequirements.ts` come out
 * self-contained apart from each other.
 */
async function loadShared(entry, alsoNeeds = []) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "validate-module-"));
  try {
    for (const name of [entry, ...alsoNeeds]) {
      const src = fs.readFileSync(path.join(ROOT, "shared", `${name}.ts`), "utf8");
      const js = ts.transpileModule(src, {
        compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
      }).outputText.replace(/(from\s+")(\.\/[A-Za-z0-9_-]+)(")/g, "$1$2.mjs$3");
      fs.writeFileSync(path.join(dir, `${name}.mjs`), js, "utf8");
    }
    return await import(new URL(`file://${path.join(dir, `${entry}.mjs`)}`).href);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// ── Reading things that live outside the registry ────────────────────────────

/**
 * The documentation shelf allowlist, parsed out of `server/lib/knowledge.ts`.
 *
 * A failure to parse is a VIOLATION and never a skip: the whole point of this
 * script is that an unchecked thing must not read as a passed thing, and
 * `scripts/check-examples.mjs` sets the house precedent for exactly this shape
 * when it cannot read `shared/capabilities.ts`.
 */
function readModuleDocs() {
  let src = "";
  try {
    src = fs.readFileSync(path.join(ROOT, "server", "lib", "knowledge.ts"), "utf8");
  } catch {
    return null;
  }
  const block = /export const MODULE_DOCS[^=]*=\s*\{([\s\S]*?)\n\};/.exec(src);
  if (!block) return null;
  const out = {};
  for (const m of block[1].matchAll(/([A-Za-z0-9_]+)\s*:\s*"([^"]+)"/g)) out[m[1]] = m[2];
  return out;
}

/** Every module id some server file registers a member driver for. */
function registeredDriverIds() {
  const found = new Set();
  const walk = (dir) => {
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) continue;
      let body = "";
      try { body = fs.readFileSync(full, "utf8"); } catch { continue; }
      for (const m of body.matchAll(/registerMemberDriver\(\s*["'`]([^"'`]+)["'`]/g)) found.add(m[1]);
    }
  };
  walk(path.join(ROOT, "server"));
  return found;
}

const PROVENANCE = /^Provenance:\s*(platform|vendor\s*\(([^)]{1,120})\))\s*$/im;

// ── Run ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const wantAll = args.includes("--all");
const wanted = args.filter((a) => !a.startsWith("--"));

const registry = await loadShared("modules");
const launch = await loadShared("launchRequirements", ["modules"]);

const { MODULES, moduleListingProblems, priceLine } = registry;
const byId = new Map(MODULES.map((m) => [m.id, m]));

for (const id of wanted) {
  if (!byId.has(id)) {
    console.log(`Unknown module id "${id}". Known ids: ${MODULES.map((m) => m.id).join(", ")}`);
    process.exit(2);
  }
}

const targets = wanted.length
  ? wanted.map((id) => byId.get(id))
  : MODULES.filter((m) => wantAll || m.tier !== "included");

console.log(`Validating ${targets.length} module(s) against the registry at shared/modules.ts\n`);

if (!targets.length) {
  console.log("  no listings in the registry yet (every module is `included`).");
  console.log("  Pass --all to lint the platform's own modules, or a module id to lint one.\n");
}

// ── 1. Registry shape, from the one function that already owns the rules ─────

console.log("Registry shape (shared/modules.ts:moduleListingProblems)");
{
  // Run against the WHOLE registry, because the managed cap and the
  // replaced-by resolution are properties of the set and not of one entry.
  const all = moduleListingProblems();
  const ids = new Set(targets.map((m) => m.id));
  const mine = all.filter((p) => Array.from(ids).some((id) => p.includes(`"${id}"`)));
  const others = all.length - mine.length;
  if (mine.length) {
    for (const p of mine) console.log(`    ${p}`);
    bad(`listing shape problems for the selected module(s): ${mine.length}`);
  } else {
    ok("listing shape problems for the selected module(s): 0");
  }
  if (others > 0) {
    console.log(`    (${others} further problem(s) elsewhere in the registry, not attributed to a selected id)`);
  }
}

// ── 2. Per listing ───────────────────────────────────────────────────────────

const docs = readModuleDocs();
const drivers = registeredDriverIds();

if (docs === null) {
  bad("read MODULE_DOCS from server/lib/knowledge.ts: COULD NOT PARSE");
} else {
  ok(`read MODULE_DOCS from server/lib/knowledge.ts (${Object.keys(docs).length} entries)`);
}

for (const m of targets) {
  console.log(`\n${m.id}  (tier ${m.tier}, dataClass ${m.dataClass}${m.withdrawn ? ", withdrawn" : ""})`);

  // 2a. Vendor record, the fields moduleListingProblems does not reach.
  if (m.tier !== "included") {
    const v = m.vendor;
    if (!v) {
      bad("vendor record present");
    } else {
      ok("vendor record present");
      const both = !!v.supportUrl && !!v.supportEmail;
      both ? ok("support URL and support email both set") : bad("support URL and support email both set");
      if (v.setupSteps?.length) {
        console.log(`    ${v.setupSteps.length} setup step(s): each one is a permanent per village human cost`);
      }
    }
  }

  // 2b. Pricing, beyond the shape rules.
  if (m.pricing) {
    console.log(`    price: ${priceLine(m.pricing)}`);
    if (m.pricing.amount > 0) {
      const slot = m.pricing.licenceKey;
      const slots = m.vendor?.secretKeys ?? [];
      slot && slots.includes(slot)
        ? ok(`priced listing names a licence slot it owns ("${slot}")`)
        : bad("priced listing names a licence slot it owns");
    }
  } else if (m.tier !== "included") {
    console.log("    price: none declared, so this listing adds no charge of its own");
  }

  // 2c. dataClass sanity: member-pii means somebody outside can be asked to forget.
  if (m.dataClass === "member-pii" && m.tier !== "included") {
    drivers.has(m.id)
      ? ok("member-pii listing registers a member driver somewhere under server/")
      : bad("member-pii listing registers a member driver somewhere under server/");
    note(
      `${m.id}: whether that driver actually CONFIRMS a deletion by reading back and getting nothing. ` +
        "Contract stage 4 proves it live against a sandbox tenant; no static check can.",
    );
  }

  // 2d. Docs file, shelf entry, provenance marker.
  //
  // A LISTING must carry all three: a village enabling somebody else's
  // connector deserves a document saying what it does and whose words those
  // are. For the platform's own `included` modules a missing contract doc is a
  // standing gap that predates this lint, so it reports rather than fails.
  // Failing on it would make `--all` permanently red for a reason no listing
  // author caused, which is how a gate gets ignored.
  if (docs !== null) {
    const file = docs[m.id];
    const required = m.tier !== "included";
    if (!file) {
      if (required) bad(`MODULE_DOCS carries an entry for "${m.id}"`);
      else note(`${m.id}: no MODULE_DOCS entry, so it has no contract doc on the shelf. A standing gap, not a listing defect.`);
    } else {
      ok(`MODULE_DOCS carries an entry for "${m.id}" (${file})`);
      const full = path.join(ROOT, "docs", "modules", file);
      if (!fs.existsSync(full)) {
        bad(`docs/modules/${file} exists`);
      } else {
        ok(`docs/modules/${file} exists`);
        const head = fs.readFileSync(full, "utf8").split(/\r?\n/).slice(0, 12).join("\n");
        const marker = PROVENANCE.exec(head);
        if (!marker) {
          bad(`docs/modules/${file} declares a provenance marker in its opening lines`);
        } else {
          ok(`docs/modules/${file} declares provenance: ${marker[1].toLowerCase().startsWith("platform") ? "platform" : `vendor (${marker[2]})`}`);
          if (m.tier !== "included" && marker[1].toLowerCase().startsWith("platform")) {
            note(
              `${m.id}: its contract doc claims platform provenance while the listing names an outside counterparty. ` +
                "That may be right (the platform wrote the connector doc) and it may be a vendor's words in the platform's voice. A human decides.",
            );
          }
        }
      }
    }
  }

  // 2e. A launch requirement, so the listing asks the village for what it needs.
  if (m.tier !== "included") {
    const mine = launch.LAUNCH_REQUIREMENTS.filter((r) => {
      const applies = r.appliesWhenModule;
      return Array.isArray(applies) ? applies.includes(m.id) : applies === m.id;
    });
    mine.length
      ? ok(`launch requirement(s) generated: ${mine.map((r) => r.id).join(", ")}`)
      : bad("at least one launch requirement applies to this listing");
    for (const r of mine) {
      const wired = !r.checkKey.startsWith("manual:");
      if (wired) {
        note(
          `${m.id}: requirement "${r.id}" resolves server-side on checkKey "${r.checkKey}". ` +
            "Whether a resolver is wired for it is only observable at runtime; an unwired one renders as a platform bug on the journey page.",
        );
      }
    }
  }

  // 2f. Withdrawal, where it applies.
  if (m.withdrawn) {
    console.log(`    withdrawn since ${m.withdrawn.since}${m.withdrawn.replacedBy ? `, replaced by ${m.withdrawn.replacedBy}` : ""}`);
    note(`${m.id}: whether the ninety days' notice and the data return actually happened. Those are commitments, not fields.`);
  }
}

// ── 3. What this script cannot check ─────────────────────────────────────────

console.log("\nCannot be checked here (a reviewer owns each of these):");
const STANDING = [
  "Contract clause 1: jurisdiction and a named human are not registry fields, so a shared support@ inbox passes every check above.",
  "Contract clause 2: `read`, `write` and `health` have no interface anywhere yet, so only two of the five driver methods are checkable at all.",
  "Contract clause 4: a present credential in front of a dead service passes every presence check. There is no circuit breaker.",
  "Contract clause 5: no DPA record, sub-processor list, retention period or hard-delete turnaround exists as data.",
  "Contract clause 7: no interface-version field and no breaking-change notice record.",
  "Contract clause 9: nothing checks that the support URL and email actually resolve.",
  "Contract clause 12: the liveness probe does not exist, so a declared window is a promise nothing measures.",
  "Whether the support addresses are answered by a person who can act.",
];
for (const line of [...STANDING, ...cannotCheck]) console.log(`  - ${line}`);

console.log(
  violations === 0
    ? `\nPASS  ${checks} check(s), 0 violations. ${STANDING.length + cannotCheck.length} thing(s) above are NOT checked.`
    : `\nFAIL  ${checks} check(s), ${violations} violation(s).`,
);
process.exit(violations === 0 ? 0 : 1);
