#!/usr/bin/env node
/**
 * The builder documents point at real files.
 *
 * The starting guide's whole job is ROUTING: it tells a newcomer which files to
 * read and which commands to run, and it deliberately links instead of
 * restating so it cannot drift from the code. That design has exactly one
 * failure mode, and it is this one: a file gets renamed or moved, every link to
 * it rots silently, and the first person to find out is the newcomer the
 * document exists to help. A routing document with a dead route is worse than
 * no document, because it spends somebody's first hour before it fails.
 *
 * So every relative path these documents name is resolved on disk, and a
 * missing one fails the build.
 *
 * WHAT COUNTS AS A PATH. Conservative on purpose. These documents are full of
 * backticked things that look path-shaped and are not: `yourmodule.*`,
 * `module_settings.config`, `off|preview|members|public`, `vendor.secretKeys`.
 * A token is only checked when it either contains a slash or ends in an
 * extension this repository actually uses, and it is skipped outright when it
 * carries a glob or a placeholder (`server/lib/*`, `docs/modules/<id>.md`),
 * because those name a shape and never a file. The bias is toward missing a
 * real link over inventing a false failure, since a gate that cries wolf gets
 * switched off.
 *
 * Both resolutions are tried: repo-root-relative (how these documents mostly
 * write paths) and document-relative (how a markdown link usually works). One
 * of the two existing is enough.
 *
 * Usage:
 *   node scripts/check-doc-links.mjs
 *   node scripts/check-doc-links.mjs --list     print every reference it checked
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(
  path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, "$1"),
  "..",
);

/**
 * The documents whose links are load-bearing. Each one routes a person
 * somewhere: the first two are what a newcomer reads, the third is what a
 * reviewer pastes into a pull request, the fourth is what a maintainer runs a
 * diligence pass with, and the last is the contract a builder is held to.
 *
 * Adding a document to this family is one line here. A listed document that
 * cannot be read is a failure and never a skip, for the same reason a missing
 * source fails `scripts/module-facts.mjs`.
 */
const DOCS = [
  "docs/modules/START_HERE.md",
  "docs/modules/HOW_TO_START_A_SESSION.md",
  "docs/modules/BUILDING_A_MODULE.md",
  "docs/modules/REVIEW_CHECKLIST.md",
  "docs/modules/DD_ASSISTANT.md",
  "docs/MODULE_LIBRARY_CONTRACT.md",
  "docs/FOUNDER_AGENT_GUIDE.md",
];

/** Extensions that make a slash-free token worth resolving (`CLAUDE.md`). */
const EXTENSIONS = /\.(md|ts|tsx|js|jsx|mjs|json|yml|yaml|sql|css|html)$/i;

/** A shape rather than a file: globs and angle-bracket placeholders. */
const IS_SHAPE = /[*<>{}|$]/;

/** Protocol links and bare anchors are somebody else's problem. */
const IS_EXTERNAL = /^(https?:|mailto:|#|tel:)/i;

/**
 * Build outputs, skipped because their existence says nothing about the
 * document. `dist/index.js` and `dist/public` are named in the guide as
 * artifacts the gates produce, and on a clean checkout they are absent until
 * `pnpm build` runs. This guard sits BEFORE the build in CI so it fails in
 * seconds, so resolving them would turn a correct document into a red gate on
 * every fresh runner. The rot this guard exists to catch lives in source paths,
 * which are present the moment the repository is cloned.
 */
const IS_GENERATED = /^(dist|node_modules|coverage|build)\//;

/**
 * The repository's own top-level entries, read from disk.
 *
 * A slash does not make something a path: `Rieki777/village-os` is a GitHub
 * repository slug and `provider/model` is a name. So a slashed token is only
 * resolved when its FIRST SEGMENT is really a top-level entry here, or when it
 * carries a file extension. Reading the roots from disk instead of listing them
 * means a new top-level directory is covered the day it appears, with no edit
 * to this file, which is the same rot this guard exists to prevent.
 */
const ROOT_ENTRIES = new Set(fs.readdirSync(ROOT));

const listOnly = process.argv.includes("--list");

/**
 * Every candidate path in a document, with the line it sits on.
 *
 * Two sources: markdown link targets, and inline code spans. Fenced code blocks
 * are skipped, because a fence holds example source and a path inside one is
 * illustrative (`docs/modules/<id>.md` in a template, a registry snippet naming
 * a URL) rather than a route the reader is asked to follow.
 */
function references(body) {
  const out = [];
  let fenced = false;

  body.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*```/.test(line)) {
      fenced = !fenced;
      return;
    }
    if (fenced) return;

    const add = (raw) => {
      if (!raw) return;
      // Drop anchors and trailing punctuation a sentence leaves behind.
      const token = raw.split("#")[0].replace(/[.,;:)]+$/, "").trim();
      if (!token || IS_EXTERNAL.test(token) || IS_SHAPE.test(token)) return;
      if (IS_GENERATED.test(token) || /\s/.test(token)) return;
      const rooted = token.includes("/") && ROOT_ENTRIES.has(token.split("/")[0]);
      if (!rooted && !EXTENSIONS.test(token)) return;
      out.push({ token, line: i + 1 });
    };

    for (const m of line.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) add(m[1]);
    for (const m of line.matchAll(/`([^`]+)`/g)) add(m[1]);
  });

  return out;
}

/** Repo-root first, then relative to the document that named it. */
function resolves(token, docRelPath) {
  const fromRoot = path.join(ROOT, ...token.split("/"));
  if (fs.existsSync(fromRoot)) return true;
  const docDir = path.dirname(path.join(ROOT, ...docRelPath.split("/")));
  return fs.existsSync(path.resolve(docDir, ...token.split("/")));
}

let checked = 0;
let broken = 0;
const unreadable = [];

for (const doc of DOCS) {
  let body;
  try {
    body = fs.readFileSync(path.join(ROOT, ...doc.split("/")), "utf8");
  } catch {
    unreadable.push(doc);
    continue;
  }

  const refs = references(body);
  const seen = new Set();
  for (const { token, line } of refs) {
    const key = `${token}`;
    if (seen.has(key)) continue;
    seen.add(key);
    checked++;
    const good = resolves(token, doc);
    if (!good) {
      broken++;
      console.log(`  ${doc}:${line}  ${token}  <-- NO SUCH PATH`);
    } else if (listOnly) {
      console.log(`  ${doc}:${line}  ${token}  OK`);
    }
  }
}

for (const doc of unreadable) console.log(`  ${doc}  <-- LISTED DOCUMENT IS MISSING`);

if (broken || unreadable.length) {
  console.log(
    `\nDoc link guard FAILED. ${broken} dead reference(s), ${unreadable.length} missing document(s), ` +
      `across ${DOCS.length - unreadable.length} document(s).`,
  );
  console.log("Fix the link, or if the file genuinely moved, fix every document that named it.");
  process.exit(1);
}

console.log(
  `Doc link guard passed. ${checked} reference(s) across ${DOCS.length} document(s) all resolve.`,
);
