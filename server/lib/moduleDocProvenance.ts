/**
 * Who wrote a document on Maia's module shelf.
 *
 * `MODULE_DOCS` in server/lib/knowledge.ts is a deliberate ALLOWLIST and not a
 * directory glob, which is what stops her answering "should we turn on the
 * exchange?" by quoting a critique of its design back to a founder. That guard
 * is about WHICH files reach the shelf. This one is about WHOSE WORDS they are.
 *
 * `sectionCitation` renders every section as `Title > Heading`, which reads,
 * correctly today, as "sourced and shipped with the platform". Every document
 * on that shelf is written by the platform, so the citation is true. The first
 * time a listing's own contract joins the shelf it stops being true silently:
 * a village would receive a vendor's description of a vendor's product in the
 * same voice, in the same frame, as the platform's own contract for quests.
 *
 * So a document declares its provenance in its own text, and a document that
 * declares nothing cannot join the shelf. The marker is a plain visible line
 * directly under the title, deliberately readable rather than a hidden comment:
 * when Maia quotes the opening section, the reader sees whose words those are.
 *
 *     # Module design: village-map
 *     Provenance: platform
 *
 *     # Signals capture
 *     Provenance: vendor (Example Systems Ltd)
 *
 * WHAT REMAINS TO WIRE, AND IT IS ONE LINE. `sectionCitation` lives in
 * knowledge.ts, which another lane owns for the duration of this work, so the
 * citation still reads `Title > Heading` for every section. The change, when
 * that file is free:
 *
 *     return provenanceSuffix(<the doc's provenance>) + (s.heading ? … : …);
 *
 * Until then this file is the mechanism and the test beside it is the
 * enforcement: no document reaches the shelf without saying who wrote it, so
 * the day a vendor document is added the marker is already required.
 */
import fs from "fs";
import path from "path";

export type DocProvenance =
  | { source: "platform" }
  /** A document a listing wrote about its own service. `author` is their legal name. */
  | { source: "vendor"; author: string };

const MARKER = /^Provenance:\s*(platform|vendor\s*\(([^)]{1,120})\))\s*$/im;

/**
 * Read the marker out of a document. Only the opening of the file is examined,
 * so a later mention of the word in prose can never be mistaken for a claim
 * about who wrote it.
 */
export function readProvenance(body: string): DocProvenance | null {
  const head = body.split(/\r?\n/).slice(0, 12).join("\n");
  const m = head.match(MARKER);
  if (!m) return null;
  if (m[1].toLowerCase().startsWith("platform")) return { source: "platform" };
  const author = (m[2] ?? "").trim();
  return author ? { source: "vendor", author } : null;
}

/**
 * What a citation appends. Empty for the platform's own documents, so nothing
 * about today's shelf changes when this is wired in: silence means ours, which
 * is the same convention `included` uses in the catalog.
 */
export function provenanceSuffix(p: DocProvenance | null): string {
  if (!p || p.source === "platform") return "";
  return ` (written by ${p.author})`;
}

/**
 * Every shelf document must declare a provenance. Returns one sentence per
 * problem, so the test beside this file names the file rather than counting.
 */
export function moduleDocProvenanceProblems(
  modulesDir: string,
  docs: Readonly<Record<string, string>>,
): string[] {
  const problems: string[] = [];
  for (const [moduleId, file] of Object.entries(docs)) {
    const full = path.join(modulesDir, file);
    if (!fs.existsSync(full)) {
      problems.push(`${file} (module ${moduleId}) is on the shelf and missing from disk`);
      continue;
    }
    const p = readProvenance(fs.readFileSync(full, "utf8"));
    if (!p) {
      problems.push(
        `${file} (module ${moduleId}) declares no provenance. Add "Provenance: platform" or "Provenance: vendor (Legal Name)" under its title`,
      );
    }
  }
  return problems;
}
