/**
 * THE PAGE'S STATE VOCABULARY AGAINST THE ONE THE SERVER ACTUALLY SENDS.
 *
 * This exists because the drift it checks for shipped and was live. 0089 widened
 * `mechanics_proposals.status` from eight values to ten, adding `onsite_vote`
 * and `passed_onsite` for the village's own ballot. `GameMechanics.tsx` kept
 * eight and read `STATUS_COPY[p.status].cls` straight, so the first proposal
 * ever to reach the village's own vote returned `undefined` from that lookup
 * and threw inside the list. The whole page went to the error boundary, for
 * every member, signed in or not, and the crash was two hops from the ordinary
 * path: propose, gather support, open the ballot.
 *
 * NOTHING CAUGHT IT. `pnpm check` cannot: `Record<Union, T>` types the lookup
 * as total, so `STATUS_COPY[p.status]` is `T` and never `T | undefined`, and
 * the union was the thing that was wrong. The status arrives over HTTP as a
 * string, so the compiler is asserting a claim about the server rather than
 * checking one.
 *
 * So the check has to read the AUTHORITY and not the page's own belief:
 *   - proposal statuses come out of `drizzle/*.sql`, from the last migration
 *     to declare the column, because the database is what the route selects.
 *   - ballot statuses come out of `BallotRow` in `server/lib/ballots.ts`,
 *     because `ballots.status` is a varchar with a comment and that type is
 *     the only enumeration of it. Read as text, the way
 *     `shared/notificationKinds.test.ts` reads its producers out of source.
 *
 * A migration that adds an eleventh status fails this file, which is the point.
 */
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { STATUS_COPY, BALLOT_RETURN } from "./GameMechanics";

const ROOT = path.resolve(__dirname, "../../..");

/** The values the column can hold, off the LAST migration that declares it. */
function proposalStatusesFromMigrations(): string[] {
  const files = fs
    .readdirSync(path.join(ROOT, "drizzle"))
    .filter((f) => f.endsWith(".sql"))
    .sort();
  let last: string[] | null = null;
  let from = "";
  for (const f of files) {
    const sql = fs.readFileSync(path.join(ROOT, "drizzle", f), "utf8");
    // Both shapes that declare it: the CREATE TABLE body and every ALTER.
    const re = /mechanics_proposals[\s\S]{0,400}?`status`\s+enum\(([^)]*)\)|`status`\s+enum\(([^)]*)\)[\s\S]{0,80}?DEFAULT\s+'open'/gi;
    for (const m of sql.matchAll(re)) {
      const body = m[1] ?? m[2];
      if (!body || !/'draft'/.test(body)) continue;
      last = [...body.matchAll(/'([^']+)'/g)].map((v) => v[1]);
      from = f;
    }
  }
  if (!last) throw new Error("no mechanics_proposals status enum found in drizzle/");
  // eslint-disable-next-line no-console
  console.log(`[states] ${last.length} proposal status(es), last declared in ${from}`);
  return last;
}

/** The values `ballots.status` can hold, off the row type that enumerates it. */
function ballotStatusesFromSource(): string[] {
  const src = fs.readFileSync(path.join(ROOT, "server/lib/ballots.ts"), "utf8");
  const m = src.match(/status:\s*((?:"[a-z_]+"\s*\|\s*)+"[a-z_]+")\s*;/);
  if (!m) throw new Error("BallotRow's status union not found in server/lib/ballots.ts");
  return [...m[1].matchAll(/"([^"]+)"/g)].map((v) => v[1]);
}

describe("the mechanics page speaks every state the server can send", () => {
  it("has a chip for every proposal status the database column allows", () => {
    const statuses = proposalStatusesFromMigrations();
    // The shape that failed: ten in the column, and the page must hold ten.
    expect(statuses).toContain("onsite_vote");
    expect(statuses).toContain("passed_onsite");
    const missing = statuses.filter((s) => !(s in STATUS_COPY));
    expect(missing, `no STATUS_COPY entry for: ${missing.join(", ")}`).toEqual([]);
  });

  it("has a reading for every way a ballot can end", () => {
    const statuses = ballotStatusesFromSource();
    expect(statuses).toContain("no_quorum");
    expect(statuses).toContain("withdrawn");
    const missing = statuses.filter((s) => !(s in BALLOT_RETURN));
    expect(missing, `no BALLOT_RETURN entry for: ${missing.join(", ")}`).toEqual([]);
  });

  it("never calls a missed quorum or a called-off vote a loss", () => {
    // The whole reason the close route was fixed. Words that would put a
    // verdict on a ballot that reached none, checked on the copy itself.
    const verdict = /\b(reject|rejected|fail|failed|lost|lose|defeat|denied|turned down|did not pass|voted down)\b/i;
    for (const key of ["no_quorum", "withdrawn"] as const) {
      const entry = BALLOT_RETURN[key];
      for (const [field, text] of Object.entries(entry)) {
        if (typeof text !== "string" || field === "cls") continue;
        expect(verdict.test(text), `BALLOT_RETURN.${key}.${field} reads as a verdict: ${text}`).toBe(false);
      }
    }
  });

  it("borrows the bell's words instead of minting a second set", () => {
    // Two surfaces describing one event two ways is the defect this lane
    // exists to avoid, so the page's phrases are checked against the
    // notification kinds a member meets first.
    const kinds = fs.readFileSync(path.join(ROOT, "shared/notificationKinds.ts"), "utf8");
    const noQuorumBlurb = kinds.match(/ballot_no_quorum:\s*\{[^}]*blurb:\s*"([^"]+)"/)?.[1] ?? "";
    const withdrawnBlurb = kinds.match(/ballot_withdrawn:\s*\{[^}]*blurb:\s*"([^"]+)"/)?.[1] ?? "";
    expect(noQuorumBlurb).toMatch(/too few/i);
    expect(withdrawnBlurb).toMatch(/called off/i);
    expect(BALLOT_RETURN.no_quorum.chip).toMatch(/too few/i);
    expect(BALLOT_RETURN.no_quorum.line).toMatch(/too few/i);
    expect(BALLOT_RETURN.withdrawn.chip).toMatch(/called off/i);
    expect(BALLOT_RETURN.withdrawn.line).toMatch(/called off/i);
  });

  it("puts the withdrawal rule where a member meets it, before the refusal", () => {
    // An opener may call off a ballot nobody has answered; once a vote stands
    // it takes proposal.decide or an admin (withdrawBallot, server/lib/ballots.ts).
    const tip = BALLOT_RETURN.withdrawn.tip ?? "";
    expect(tip).toMatch(/proposal\.decide/);
    expect(tip).toMatch(/admin/i);
    expect(tip.toLowerCase()).toContain("nobody has answered");
  });
});
