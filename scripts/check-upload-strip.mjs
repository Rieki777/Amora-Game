#!/usr/bin/env node
/**
 * THE NEXT DOOR, not this one.
 *
 * ── THE CLASS THIS EXISTS FOR ────────────────────────────────────────────
 *
 * `POST /api/work-with-us/attachment` was public, unauthenticated, and wrote
 * whatever a stranger sent straight onto the uploads volume with multer's
 * diskStorage. `/api/uploads/:filename` then served it inline, so a photograph
 * taken on the land published the land's GPS coordinates to anyone with the
 * link. `POST /api/admin/investor-docs/upload` did the same with no file
 * filter at all.
 *
 * Both are fixed. Neither was fixed by a check that failed: they were fixed
 * because somebody read the file. The place-photo path shipped a runtime
 * assertion a week earlier and it protected exactly the files it was written
 * for, because a guarantee attached to one route is a guarantee about one
 * route.
 *
 * So this gate asks the question that survives the next door being built:
 * DOES ANYTHING WRITE INTO THE UPLOADS VOLUME WITHOUT COMING THROUGH
 * `server/lib/uploads.ts`?
 *
 * ── WHAT IT LOOKS FOR, AND WHY EACH ONE ──────────────────────────────────
 *
 *  1. `multer.diskStorage`. This is the defect in one call. diskStorage
 *     streams a stranger's bytes to disk before any handler sees them, so
 *     there is no point at which the file can be inspected, and every route
 *     that used it published what it was given. memoryStorage plus
 *     `sanitiseForVolume` is the shape that works.
 *
 *  2. A write whose target is the uploads volume. `fs.writeFileSync`,
 *     `fs.writeFile`, `fs.appendFileSync`, `fs.createWriteStream` and sharp's
 *     `.toFile()`, wherever the path names `UPLOADS_DIR` or an identifier
 *     that is clearly the uploads directory. All of these belong in
 *     `server/lib/uploads.ts` and nowhere else.
 *
 * ── THE ALLOWLIST IS THE POINT ───────────────────────────────────────────
 *
 * A line here is a claim that one writer is deliberately outside the door,
 * with the reason a reviewer would accept. Adding a door with no strip is
 * still possible and now costs one line somebody reads. Silence is what this
 * ends.
 *
 * Usage: node scripts/check-upload-strip.mjs [--table] [--json]
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SERVER = path.join(ROOT, "server");

/** The one door. Everything inside it is the implementation, not a violation. */
const THE_DOOR = path.join("server", "lib", "uploads.ts");

/**
 * Writers deliberately outside the door, and why that is right.
 *
 * "I could not find a way" is not a reason. "This file is not an upload" is.
 */
const ALLOWED = {
  // Nothing here today. The four doors that existed all come through
  // server/lib/uploads.ts, and the fifth (place photos) calls writeToVolume.
};

const findings = [];
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "seeds") continue;
      walk(full);
      continue;
    }
    if (!entry.name.endsWith(".ts")) continue;
    // Tests build fixtures and read files back; they never serve anything.
    if (entry.name.endsWith(".test.ts")) continue;
    files.push(full);
  }
}
walk(SERVER);

const WRITE_CALLS = new Set(["writeFileSync", "writeFile", "appendFileSync", "appendFile", "createWriteStream", "toFile"]);
const UPLOADS_HINT = /UPLOADS_DIR|uploadsDir|uploadsDirectory|uploadDir/;

for (const file of files) {
  const rel = path.relative(ROOT, file);
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
  const isTheDoor = rel === THE_DOOR || rel.split(path.sep).join("/") === THE_DOOR.split(path.sep).join("/");

  const at = (node) => source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      const callee = node.expression;

      // 1. multer.diskStorage, wherever it appears.
      if (
        ts.isPropertyAccessExpression(callee) &&
        callee.name.text === "diskStorage" &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "multer"
      ) {
        findings.push({
          rel,
          line: at(node),
          kind: "multer.diskStorage",
          detail: "writes a stranger's bytes before any handler can inspect them",
        });
      }

      // 2. A write whose arguments name the uploads volume.
      if (ts.isPropertyAccessExpression(callee) && WRITE_CALLS.has(callee.name.text) && !isTheDoor) {
        const args = node.arguments.map((a) => a.getText(source)).join(", ");
        if (UPLOADS_HINT.test(args)) {
          findings.push({
            rel,
            line: at(node),
            kind: `${callee.name.text}() into the uploads volume`,
            detail: args.length > 90 ? `${args.slice(0, 90)}...` : args,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
}

const live = findings.filter((f) => !ALLOWED[`${f.rel}:${f.line}`] && !ALLOWED[f.rel]);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ findings, live, allowed: Object.keys(ALLOWED) }, null, 2));
  process.exit(live.length ? 1 : 0);
}

if (process.argv.includes("--table")) {
  console.log(`Scanned ${files.length} server file(s). The one door is ${THE_DOOR}.`);
  for (const f of findings) console.log(`  ${f.rel}:${f.line}  ${f.kind}  ${f.detail}`);
}

if (live.length) {
  console.error("UPLOAD STRIP GUARD FAILED: something writes into the uploads volume without coming through the one door.\n");
  for (const f of live) {
    console.error(`  ${f.rel}:${f.line}`);
    console.error(`      ${f.kind}: ${f.detail}`);
  }
  console.error(
    "\nEvery byte that reaches the volume goes through `sanitiseForVolume` and `writeToVolume`" +
      `\nin ${THE_DOOR}, which strips a picture's metadata and checks its own output.` +
      "\nIf this writer is genuinely not an upload, add it to ALLOWED in this script with the reason.",
  );
  process.exit(1);
}

console.log(
  `Upload strip guard: clean across ${files.length} server file(s). ` +
    `Every write into the uploads volume goes through ${THE_DOOR.split(path.sep).join("/")}.`,
);
