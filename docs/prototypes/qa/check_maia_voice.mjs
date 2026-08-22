#!/usr/bin/env node
/**
 * The voice guard, pointed at the one surface it cannot reach on its own.
 *
 * WHY THIS FILE EXISTS. Rye's rule for this round is that every line Maia says
 * passes scripts/check-voice.mjs. It does not, and it cannot, and neither fact
 * is visible from the outside:
 *
 *   SCAN_ROOTS is ["client/src", "server", "shared", "docs/knowledge"], so the
 *   only thing under docs/ that gate reads is docs/knowledge. docs/prototypes
 *   is not a root.
 *
 *   walkFiles() admits /\.(tsx?|json|md)$/ only, so even if docs/prototypes
 *   were added as a root, grounds-v0.html would still be skipped.
 *
 * Two independent reasons, so adding one root would not have fixed it, and a
 * green CI run has never once said anything about Maia's copy. Every sentence
 * she speaks ships through an unguarded surface.
 *
 * WHAT THIS DOES, AND WHAT IT DELIBERATELY DOES NOT DO. It does not restate
 * the house rules. It extracts Maia's authored copy out of the artifact,
 * writes it as a TypeScript file of string literals, and runs THE REAL
 * scripts/check-voice.mjs over that file as a child process. The rules live in
 * exactly one place, so when the house rules change this gate changes with
 * them and cannot drift.
 *
 * ONE ROW PER AUTHORED LITERAL, never a synthesised sentence. A line like
 *
 *     maiaSay('<b>' + escq(j.name) + '</b>. ' + n + ' stops, ...')
 *
 * is three authored fragments around two interpolations. Joining them would
 * manufacture text nobody wrote, and `not ${x}, but` would become a
 * contrast-frame that does not exist in the source. So each fragment is
 * checked on its own. The cost is honest and stated: a banned phrase split
 * ACROSS an interpolation is not caught. Every hard rule (dashes, AI words) is
 * per-fragment anyway, which is what this round's brief is about.
 *
 * THE SILENT-ZERO GUARD IS THE POINT OF THE BOTTOM HALF. A gate that extracts
 * nothing prints exactly what a gate that found nothing wrong prints. This one
 * refuses to pass on an empty or shrunken payload: it pins the number of
 * MAIA_STOPS entries, a floor on the number of copy rows, and three sentinel
 * phrases that must still be present. Rename MAIA_STOPS or maiaSay and this
 * goes red on the extraction, not green on the silence.
 *
 * PROVEN BY BREAKING IT: qa/break_maia_voice.py drives six mutations at it,
 * three that plant a real violation and three that attack the extractor
 * itself, and requires the named guard to go red for each. It then breaks the
 * one thing no artifact mutation can reach, the way this file CALLS
 * check-voice.mjs, and requires the canary below to catch that too. The first
 * draft of this file passed all three planted violations green, so none of
 * that paragraph is precautionary.
 *
 *   node qa/check_maia_voice.mjs [path-to-grounds-v0.html]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import ts from "typescript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ART = process.argv[2] || path.join(HERE, "..", "grounds-v0.html");
const VOICE = path.join(HERE, "..", "..", "..", "scripts", "check-voice.mjs");

/* ------------------------------------------------------------------ anchors
 * Exact counts and sentinels. Every one of these was read off the artifact,
 * not guessed, and each is a thing that breaks loudly when the shape changes.
 */
const EXPECT_STOPS = 8;          // MAIA_STOPS has one line per Welcome Walk place
const MIN_ROWS = 180;            // copy rows extracted from her call sites
const SENTINELS = [
  "I am Maia. I live up past the ponds.",
  "The Welcome Lodge. My first meal here was at that long table",
  "We never pay each other to care.",
];

/** Everything that puts words in front of a person through Maia's dock. */
const SAYERS = new Set(["maiaSay", "mvSpeak", "toast"]);

let bad = 0;
const die = (msg) => { console.log("FAIL  " + msg); bad++; };

/* ------------------------------------------------------------------ extract */
if (!fs.existsSync(ART)) { console.log(`FAIL  no artifact at ${ART}`); process.exit(1); }
const src = fs.readFileSync(ART, "utf8");

const blocks = [];
{
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(src))) blocks.push({ code: m[1], line0: src.slice(0, m.index).split("\n").length });
}
if (!blocks.length) { console.log("FAIL  the artifact has no inline <script> block"); process.exit(1); }

const rows = [];   // { origin, line, text }
let stopCount = 0;

const isLit = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);

for (const b of blocks) {
  const sf = ts.createSourceFile("block.ts", b.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const lineOf = (node) => b.line0 + b.code.slice(0, node.getStart(sf)).split("\n").length - 1;

  /* Each authored literal becomes its own row. Template expressions
     contribute head/middle/tail separately for the same reason. */
  const emit = (origin, node) => {
    const push = (t, at) => { if (t && t.trim()) rows.push({ origin, line: at, text: t }); };
    const walk = (x) => {
      if (isLit(x)) push(x.text, lineOf(x));
      else if (ts.isTemplateExpression(x)) {
        push(x.head.text, lineOf(x));
        for (const s of x.templateSpans) push(s.literal.text, lineOf(s.literal));
      } else if (ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        walk(x.left); walk(x.right);
      } else if (ts.isConditionalExpression(x)) { walk(x.whenTrue); walk(x.whenFalse); }
      else if (ts.isParenthesizedExpression(x)) walk(x.expression);
    };
    walk(node);
  };

  const visit = (n) => {
    if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && SAYERS.has(n.expression.text)) {
      /* arg 0 is what the dock renders, arg 2 is what she says out loud.
         Both are lines a person receives, so both are copy. */
      if (n.arguments[0]) emit(n.expression.text, n.arguments[0]);
      if (n.arguments[2]) emit(n.expression.text + ":spoken", n.arguments[2]);
    }
    /* Her resident lines: the const, and the window mirror if it is an object. */
    if (ts.isVariableDeclaration(n) && n.name.getText(sf) === "MAIA_STOPS" &&
        n.initializer && ts.isObjectLiteralExpression(n.initializer)) {
      for (const p of n.initializer.properties) {
        if (ts.isPropertyAssignment(p) && isLit(p.initializer)) {
          stopCount++;
          rows.push({ origin: "MAIA_STOPS." + p.name.getText(sf).replace(/['"]/g, ""),
                      line: lineOf(p), text: p.initializer.text });
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
}

/* Markup is machinery; the words between the tags are the copy. */
const strip = (t) => t
  .replace(/<[^>]*>/g, " ")
  .replace(/&nbsp;|&amp;|&lt;|&gt;|&quot;|&#\d+;/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const copy = rows
  .map((r) => ({ ...r, copy: strip(r.text) }))
  .filter((r) => /[a-z]{3}/i.test(r.copy) && r.copy.length > 3);

/* ------------------------------------------------- the silent-zero guard */
console.log(`extracted: ${copy.length} copy rows from ${blocks.length} script block(s), ` +
            `${stopCount} MAIA_STOPS entries`);

if (stopCount !== EXPECT_STOPS)
  die(`MAIA_STOPS has ${stopCount} entries, expected ${EXPECT_STOPS}. ` +
      `Either the Welcome Walk gained or lost a stop, in which case raise EXPECT_STOPS ` +
      `in this file on purpose, or her resident lines were renamed and this gate is no ` +
      `longer reading them at all.`);
if (copy.length < MIN_ROWS)
  die(`only ${copy.length} copy rows, expected at least ${MIN_ROWS}. ` +
      `Either a lot of her copy was deleted, or a call site was renamed and this gate ` +
      `has gone blind to it. Check which before lowering the floor.`);
for (const s of SENTINELS)
  if (!copy.some((r) => r.copy.includes(s)))
    die(`sentinel line missing from the extraction: "${s.slice(0, 48)}"`);

if (bad) {
  console.log(`\nMAIA VOICE: extraction failed ${bad} guard(s). Nothing was checked. ` +
              `This is a red, not an empty pass.`);
  process.exit(1);
}

/* --------------------------------------- hand it to the real voice guard
 *
 * TWO THINGS HERE ARE LOAD-BEARING AND NEITHER IS OBVIOUS.
 *
 * THE PATH MUST BE RELATIVE TO THE REPO ROOT. check-voice.mjs resolves every
 * argument with `path.join(ROOT, r)`. Hand it an absolute Windows path and it
 * builds `C:\...\wt-maia\C:\Users\...`, fails existsSync, `continue`s, scans
 * ZERO files, prints `[]` and exits 0. This gate shipped that way for one
 * draft and reported ALL GREEN over three deliberately planted violations.
 * break_maia_voice.py is the only reason that was ever seen.
 *
 * THE CANARY IS WHAT MAKES THE GREEN MEAN ANYTHING. `[]` from a guard that
 * scanned 203 clean lines and `[]` from a guard that scanned nothing are the
 * same eight bytes. So the generated file ends with a line that MUST be
 * flagged, and its finding must come back at its own line number. No canary,
 * no verdict: the run is reported as broken rather than clean. Any future
 * change to how check-voice.mjs is invoked gets caught by this and not by
 * whoever reads a green three months later.
 */
const OUTDIR = path.join(HERE, "..", ".qa-out");           // gitignored scratch
fs.mkdirSync(OUTDIR, { recursive: true });
const tmp = path.join(OUTDIR, `maia-voice-${process.pid}.ts`);
const ROOT = path.join(HERE, "..", "..", "..");
const relArg = path.relative(ROOT, tmp).split(path.sep).join("/");

/* One row per line, so a finding's line number is its index straight back. */
const body = copy.map((r, i) => `const l${i} = ${JSON.stringify(r.copy)};`);
const CANARY_LINE = body.length + 1;                        // 1-based, last line
body.push(`const canary = ${JSON.stringify("canary \u2014 this line must be flagged")};`);
fs.writeFileSync(tmp, body.join("\n") + "\n");

let out = "";
try {
  out = execFileSync(process.execPath, [VOICE, "--json", relArg], {
    encoding: "utf8", stdio: "pipe", cwd: ROOT,
  });
} catch (e) {
  out = String(e.stdout || "");
  if (!out.trim()) {
    console.log(`FAIL  could not run the voice guard at ${VOICE}: ${String(e.stderr || e).slice(0, 300)}`);
    fs.unlinkSync(tmp);
    process.exit(1);
  }
}
fs.unlinkSync(tmp);

/* --json prints a bare array and exits 0, so the exit code carries no verdict
   here and the array length is the only thing that does. */
let findings;
try { findings = JSON.parse(out); }
catch (_) { console.log("FAIL  the voice guard did not answer with JSON:\n" + out.slice(0, 400)); process.exit(1); }
if (!Array.isArray(findings)) { console.log("FAIL  the voice guard's --json shape changed: " + out.slice(0, 200)); process.exit(1); }

/* The canary, before a single finding is believed. */
if (!findings.some((f) => f.line === CANARY_LINE && f.kind === "em-dash")) {
  console.log(`FAIL  the canary on line ${CANARY_LINE} came back clean, so scripts/check-voice.mjs ` +
              `never read the ${copy.length} lines handed to it.`);
  console.log(`      It answered with ${findings.length} finding(s). A guard that CANNOT run reports ` +
              `what a guard that PASSED reports, so this is a red and not a green.`);
  process.exit(1);
}
findings = findings.filter((f) => f.line !== CANARY_LINE);
console.log(`canary: the voice guard is live (it flagged the planted line ${CANARY_LINE})`);

if (!findings.length) {
  console.log(`MAIA VOICE: ALL GREEN. ${copy.length} lines, every one clean against ` +
              `scripts/check-voice.mjs (${SENTINELS.length} sentinels present, ${stopCount} resident lines).`);
  process.exit(0);
}

console.log(`\n${findings.length} violation(s) in Maia's shipped copy:\n`);
for (const f of findings) {
  const r = copy[f.line - 1];
  const where = r ? `grounds-v0.html:${r.line}  ${r.origin}` : `(row ${f.line})`;
  console.log(`  ${where}`);
  console.log(`    [${f.kind}] ${f.hit}`);
  console.log(`    ${(r ? r.copy : f.text || "").slice(0, 150)}`);
}
console.log(`\nMAIA VOICE: ${findings.length} FAILURES`);
process.exit(1);
