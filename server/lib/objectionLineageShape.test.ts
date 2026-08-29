/**
 * LINEAGE, NOT CREDIT: THE LINE THIS FEATURE MAY NEVER CROSS (0102).
 *
 * `ballot_objections.led_to_ballot_id` records that a proposal changed after
 * somebody objected. That is a fact about a decision. One careless afternoon
 * turns it into a fact about a person: count the column by member, sort it,
 * call the top of the list the most helpful objector, hang a badge on it. The
 * idea arrived named "objection credit", "credit" is a scoring word, and R55
 * forbids the comparison between members a count manufactures.
 *
 * So the rule is enforced rather than written down:
 *
 *   1. No SQL anywhere in `server/**` that touches `ballot_objections` groups
 *      its rows, by member or by anything else.
 *   2. No SQL anywhere in `server/**` that touches `ballot_objections` counts
 *      rows while naming a member.
 *   3. The lineage route's own query names no member at all.
 *   4. The lineage shape is confined to the governance components. It never
 *      reaches a profile.
 *   5. No scoreboard vocabulary anywhere in the client or the server.
 *   6. `EARNED_METRICS` gains no objection metric. A badge is a public
 *      artefact and an objection is a contribution to one decision.
 *
 * AND ONE PIN IN THE OTHER DIRECTION, because the trap here is an inversion
 * as much as a scoreboard. `standingObjectionCount` counts `open` and
 * `integrated` as BLOCKING: `integrated` means the objection STANDS and the
 * proposal must change, which is the inverse of the everyday reading of the
 * word. The next person to read this code will see "integrated" as "resolved"
 * and helpfully take it out of the blocking set, and consent would then carry
 * decisions the village had objected to. The behavioural proof of that lives
 * in objectionLineage.test.ts against a real database. This is the cheap pin
 * that runs everywhere, with no database and no build.
 *
 * HOW IT READS THE TREE. Comments are stripped first, then every `.query(...)`
 * call is taken whole by balancing its parentheses. Any mention of the table
 * this cannot place inside such a call is REPORTED and fails the test, because
 * a rule that silently skips what it cannot parse is a rule that stops being
 * true without saying so.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EARNED_METRICS } from "./badges";

const ROOT = path.resolve(__dirname, "..", "..");
const TABLE = "ballot_objections";
/* Assembled from pieces so this file's own text can never trip its own rule. */
const GROUPING = new RegExp("GROUP" + "\\s+" + "BY", "i");
const COUNTING = /COUNT\s*\(/i;
const MEMBER = /user_id|userId/i;
const SELF = "server/lib/objectionLineageShape.test.ts";

function walk(dir: string, ext: RegExp, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, ext, out);
    else if (ext.test(entry)) out.push(full);
  }
  return out;
}

const rel = (full: string) => path.relative(ROOT, full).replace(/\\/g, "/");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/**
 * Every `.query(...)` call in a file, taken whole by balancing parentheses.
 *
 * The type argument has to be stepped over, and it is the whole reason the
 * first draft of this reader was wrong: most of the calls in this codebase are
 * `pool.query<RowDataPacket[]>(...)`, so a reader looking for the literal
 * `.query(` found two of the six queries in ballots.ts and reported a clean
 * scan of everything it had failed to open. The unplaced-mentions test above
 * is what caught it, which is the only reason it is safe to trust this now.
 */
function queryCalls(src: string): string[] {
  const out: string[] = [];
  const marker = ".query";
  let at = src.indexOf(marker);
  while (at !== -1) {
    let i = at + marker.length;
    while (i < src.length && /\s/.test(src[i])) i += 1;
    if (src[i] === "<") {
      let angle = 0;
      for (; i < src.length; i += 1) {
        if (src[i] === "<") angle += 1;
        else if (src[i] === ">") {
          angle -= 1;
          if (angle === 0) {
            i += 1;
            break;
          }
        }
      }
      while (i < src.length && /\s/.test(src[i])) i += 1;
    }
    if (src[i] !== "(") {
      at = src.indexOf(marker, at + marker.length);
      continue;
    }
    let depth = 0;
    for (; i < src.length; i += 1) {
      if (src[i] === "(") depth += 1;
      else if (src[i] === ")") {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(src.slice(at, i + 1));
    at = src.indexOf(marker, i + 1);
  }
  return out;
}

const serverFiles = walk(path.join(ROOT, "server"), /\.tsx?$/);
const clientFiles = walk(path.join(ROOT, "client", "src"), /\.tsx?$/);

/** Every query in server/** that touches the objections table, with its file. */
const objectionQueries: Array<{ file: string; sql: string }> = [];
/** Mentions of the table this scan could not place inside a query call. */
const unplaced: Array<{ file: string; count: number }> = [];

for (const full of serverFiles) {
  if (rel(full) === SELF) continue;
  const clean = stripComments(readFileSync(full, "utf8"));
  if (!clean.includes(TABLE)) continue;
  const calls = queryCalls(clean).filter((c) => c.includes(TABLE));
  for (const sql of calls) objectionQueries.push({ file: rel(full), sql });
  const inCalls = calls.join("\n").split(TABLE).length - 1;
  const inFile = clean.split(TABLE).length - 1;
  if (inFile > inCalls) unplaced.push({ file: rel(full), count: inFile - inCalls });
}

describe("the scan can see what it claims to police", () => {
  it("reads the whole server tree and finds the objection queries in it", () => {
    expect(serverFiles.length, "server/** must yield files to scan").toBeGreaterThan(100);
    expect(clientFiles.length, "client/src must yield files to scan").toBeGreaterThan(100);
    // eslint-disable-next-line no-console
    console.log(
      `[objection-lineage] ${objectionQueries.length} quer(ies) touch ${TABLE} across ` +
        `${new Set(objectionQueries.map((q) => q.file)).size} file(s); ` +
        `${serverFiles.length} server and ${clientFiles.length} client file(s) scanned`,
    );
    expect(objectionQueries.length).toBeGreaterThanOrEqual(5);
  });

  it("finds the two queries this rule is written around, so a broken reader fails first", () => {
    const all = objectionQueries.map((q) => q.sql).join("\n");
    // standingObjectionCount's blocking set. If the extractor breaks, this
    // control goes red before any clean-looking green can be believed.
    expect(all).toContain("'open','integrated'");
    // The lineage edge, the column this whole file is written around.
    expect(all).toContain("led_to_ballot_id");
  });

  it("places every mention of the table inside a query it can read", () => {
    expect(unplaced, JSON.stringify(unplaced, null, 2)).toEqual([]);
  });
});

describe("no query turns an objection into a score against a member", () => {
  it("groups the objections table by nothing at all", () => {
    const bad = objectionQueries.filter((q) => GROUPING.test(q.sql));
    expect(bad.map((b) => `${b.file}: ${b.sql.slice(0, 240)}`)).toEqual([]);
  });

  it("never counts objection rows while naming a member", () => {
    const bad = objectionQueries.filter((q) => COUNTING.test(q.sql) && MEMBER.test(q.sql));
    expect(bad.map((b) => `${b.file}: ${b.sql.slice(0, 240)}`)).toEqual([]);
  });

  it("serves the lineage without naming anyone", () => {
    const lineage = objectionQueries.filter((q) => q.sql.includes("led_to_ballot_id"));
    expect(lineage.length).toBeGreaterThanOrEqual(2);
    const reads = lineage.filter((q) => /SELECT/i.test(q.sql));
    expect(reads.length).toBeGreaterThanOrEqual(1);
    for (const q of reads) expect(q.sql, `${q.file} must not name a member`).not.toMatch(MEMBER);
  });
});

describe("no surface turns an objection into a score against a member", () => {
  it("keeps the lineage shape inside the governance components", () => {
    const strayed = clientFiles
      .filter((f) => {
        const src = readFileSync(f, "utf8");
        return (
          src.includes("ObjectionLineage") || src.includes("led_to_ballot_id") || src.includes("ledToBallotId")
        );
      })
      .map(rel)
      .filter((r) => !r.startsWith("client/src/components/governance/"));
    expect(strayed, "objection lineage belongs to the decision, never to a person's page").toEqual([]);
  });

  it("carries no scoreboard vocabulary in the client or the server", () => {
    const banned = [
      "objectionCount",
      "objectionsBy",
      "objectionsPerMember",
      "objectionLeaderboard",
      "objectionScore",
      "mostHelpfulObjector",
      "helpfulObjector",
      "topObjector",
    ];
    const hits: string[] = [];
    for (const full of [...serverFiles, ...clientFiles]) {
      if (rel(full) === SELF) continue;
      const src = readFileSync(full, "utf8");
      for (const word of banned) if (src.includes(word)) hits.push(`${rel(full)}: ${word}`);
    }
    expect(hits).toEqual([]);
  });

  it("adds no objection metric to the earned badges", () => {
    for (const metric of EARNED_METRICS) {
      expect(String(metric)).not.toMatch(/object/i);
    }
  });
});

describe("integrated still means the objection STANDS", () => {
  it("keeps integrated inside the blocking set of standingObjectionCount", () => {
    const src = readFileSync(path.join(ROOT, "server", "lib", "ballots.ts"), "utf8");
    const fn = src.slice(src.indexOf("export async function standingObjectionCount"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body, "standingObjectionCount must still count integrated as blocking").toContain(
      "'open','integrated'",
    );
  });
});
