/**
 * Delegation, proven against a real MySQL (S5 harness) and, where the rule is
 * arithmetic, proven with no database at all.
 *
 * The rules pinned here are the ones the whole feature turns on:
 *
 *  - A cycle is refused AT CREATION, walking the chain. A to B to C to A never
 *    reaches the table, because with transitive chains a cycle is an infinite
 *    loop in the routine that counts a season's votes.
 *  - Resolution is TRANSITIVE, and the delegator sees who they ACTUALLY
 *    followed: A named B, C decided, A reads C.
 *  - The delegator's row carries the delegate's CHOICE and `followed_user_id`,
 *    and the weight never moves.
 *  - A member who votes for themselves OVERRIDES and keeps their own row, both
 *    before and after the delegate votes.
 *  - A delegate who does not vote leaves the delegator's vote UNCAST. No row,
 *    counted as not voted, never an abstain.
 *  - Changing or revoking a delegation while a ballot is open RE-DERIVES that
 *    member's row from the new chain, and everybody downstream of them.
 *  - The concentration counts SUM to the roster, which is what makes the
 *    shares readable as a share of anything.
 *
 * No TEST_DATABASE_URL: the database cases skip loudly, never pass hollowly
 * (house rule). The pure cases run either way.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { provisionTestDb, testDbConfigured, type TestDb } from "../db/testDb";
import { awaitingVote, castVote, openBallot, talliesFor, voteCount, voteOf, votesFor, type OpenBallotInput } from "./ballots";
import {
  applyDelegatedVotes,
  applyDelegatedVotesEverywhere,
  concentrationOver,
  delegationOf,
  delegationProblem,
  effectiveConcentration,
  liveDelegationOf,
  resolveDelegate,
  resolveFinal,
  revokeDelegation,
  setDelegation,
  votesFollowedBy,
} from "./delegation";

const configured = testDbConfigured();

let db: TestDb;
let pool: mysql.Pool;
let n = 0;

const mapOf = (pairs: [string, string][]) => new Map<string, string>(pairs);

/** A fresh subject ref per ballot, so open_key never collides between cases. */
const openOne = async (over: Partial<OpenBallotInput> = {}) => {
  const result = await openBallot(pool, {
    subjectType: "mechanics",
    subjectRef: `delegation-test-${++n}`,
    title: `Ballot ${n}`,
    docMarkdown: "# The document as checked",
    method: "custom",
    weightMode: "equal",
    unityPct: 80,
    quorumPct: 20,
    durationDays: 7,
    openedBy: "u-proposer",
    electorate: [
      { userId: "u-a", weight: 1 },
      { userId: "u-b", weight: 1 },
      { userId: "u-c", weight: 1 },
    ],
    ...over,
  });
  if (!result.ok) throw new Error(`ballot refused to open: ${result.error}`);
  return result.ballot;
};

/** Clear every delegation, so one case never reads another's chain. */
const clearDelegations = async () => {
  await pool.query("DELETE FROM delegations WHERE delegator_id LIKE 'u-%'"); // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
};

describe("delegation chains (no database)", () => {
  it("refuses to delegate to yourself", () => {
    expect(delegationProblem(mapOf([]), "u-a", "u-a")).toContain("already decide for yourself");
  });

  it("refuses a delegation that names nobody", () => {
    expect(delegationProblem(mapOf([]), "u-a", "")).toContain("names the member");
  });

  it("refuses the direct swap, A to B while B follows A", () => {
    const problem = delegationProblem(mapOf([["u-b", "u-a"]]), "u-a", "u-b");
    expect(problem).toContain("delegated their voice to you");
  });

  it("refuses the three-hop cycle at creation: A to B to C, then C to A", () => {
    // A follows B, B follows C. C asking to follow A closes the loop.
    const map = mapOf([
      ["u-a", "u-b"],
      ["u-b", "u-c"],
    ]);
    const problem = delegationProblem(map, "u-c", "u-a");
    expect(problem).toContain("comes back to you");
    // And every delegation that does NOT close a loop is still allowed.
    expect(delegationProblem(map, "u-d", "u-c")).toBeNull();
  });

  it("resolves transitively to the final decider", () => {
    const map = mapOf([
      ["u-a", "u-b"],
      ["u-b", "u-c"],
      ["u-c", "u-d"],
    ]);
    const walk = resolveFinal(map, "u-a");
    expect(walk.finalId).toBe("u-d");
    expect(walk.hops).toBe(3);
    expect(walk.chain).toEqual(["u-a", "u-b", "u-c", "u-d"]);
    expect(walk.looped).toBe(false);
    // A member who delegated to nobody decides for themselves.
    expect(resolveFinal(map, "u-d")).toMatchObject({ finalId: "u-d", hops: 0 });
  });

  it("terminates on a cycle written around the refusal, and says it looped", () => {
    const map = mapOf([
      ["u-a", "u-b"],
      ["u-b", "u-c"],
      ["u-c", "u-a"],
    ]);
    const walk = resolveFinal(map, "u-a");
    expect(walk.looped).toBe(true);
    expect(walk.chain).toEqual(["u-a", "u-b", "u-c"]);
  });

  it("concentration counts every vote once and the shares add to one", () => {
    // A and B follow C; D follows E; E and C decide for themselves.
    const map = mapOf([
      ["u-a", "u-c"],
      ["u-b", "u-c"],
      ["u-d", "u-e"],
    ]);
    const roster = ["u-a", "u-b", "u-c", "u-d", "u-e"];
    const rows = concentrationOver(map, roster);
    const by = new Map(rows.map((r) => [r.userId, r]));
    expect(by.get("u-c")!.effectiveVotes).toBe(3);
    expect(by.get("u-c")!.directDelegations).toBe(2);
    expect(by.get("u-c")!.shareOfElectorate).toBeCloseTo(0.6, 10);
    expect(by.get("u-e")!.effectiveVotes).toBe(2);
    expect(by.get("u-a")!.effectiveVotes).toBe(0);
    expect(by.get("u-a")!.decidedBy).toBe("u-c");
    expect(rows.reduce((sum, r) => sum + r.effectiveVotes, 0)).toBe(roster.length);
    expect(rows.reduce((sum, r) => sum + r.shareOfElectorate, 0)).toBeCloseTo(1, 10);
  });

  it("counts a chain through a member, so the effective number is not the direct one", () => {
    // A follows B, B follows C. C holds ONE direct delegation and decides three votes.
    const map = mapOf([
      ["u-a", "u-b"],
      ["u-b", "u-c"],
    ]);
    const rows = concentrationOver(map, ["u-a", "u-b", "u-c"]);
    const c = rows.find((r) => r.userId === "u-c")!;
    expect(c.directDelegations).toBe(1);
    expect(c.effectiveVotes).toBe(3);
    expect(rows.find((r) => r.userId === "u-a")!.hops).toBe(2);
  });

  it("keeps a decider who is off the roster in the arithmetic, marked as off it", () => {
    const rows = concentrationOver(mapOf([["u-a", "u-x"]]), ["u-a", "u-b"]);
    const x = rows.find((r) => r.userId === "u-x")!;
    expect(x.onRoster).toBe(false);
    expect(x.effectiveVotes).toBe(1);
    expect(rows.reduce((sum, r) => sum + r.effectiveVotes, 0)).toBe(2);
  });

  it("answers an empty roster with an empty list and no division by zero", () => {
    expect(concentrationOver(mapOf([["u-a", "u-b"]]), [])).toEqual([]);
  });
});

describe.skipIf(!configured)("delegation (MySQL)", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 8 }); // module-review-ok: the S5 scratch-schema harness pool, the crews.test.ts shape
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  it("writes one live delegation per member, and moving it is one act", async () => {
    await clearDelegations();
    expect((await setDelegation(pool, "u-a", "u-b")).ok).toBe(true);
    expect((await liveDelegationOf(pool, "u-a"))?.delegateId).toBe("u-b");
    expect((await setDelegation(pool, "u-a", "u-c")).ok).toBe(true);
    const [rows] = await pool.query<any[]>("SELECT * FROM delegations WHERE delegator_id = 'u-a'"); // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
    expect(rows.length).toBe(1);
    expect((await liveDelegationOf(pool, "u-a"))?.delegateId).toBe("u-c");
  });

  it("revokes, says whether there was anything to revoke, and keeps the row readable", async () => {
    await clearDelegations();
    await setDelegation(pool, "u-a", "u-b");
    expect(await revokeDelegation(pool, "u-a")).toBe(true);
    // Nothing live, and the second call reports "there was nothing here"
    // rather than an error, which is a different answer from a failure.
    expect(await revokeDelegation(pool, "u-a")).toBe(false);
    expect(await liveDelegationOf(pool, "u-a")).toBeNull();
    expect((await delegationOf(pool, "u-a"))?.revokedAt).not.toBeNull();
    // A member who never gave one is told so, with no row invented.
    expect(await delegationOf(pool, "u-never")).toBeNull();
  });

  it("refuses the cycle against the stored chain, and stores nothing", async () => {
    await clearDelegations();
    expect((await setDelegation(pool, "u-a", "u-b")).ok).toBe(true);
    expect((await setDelegation(pool, "u-b", "u-c")).ok).toBe(true);
    const closing = await setDelegation(pool, "u-c", "u-a");
    expect(closing.ok).toBe(false);
    if (!closing.ok) expect(closing.error).toContain("comes back to you");
    expect(await liveDelegationOf(pool, "u-c")).toBeNull();
    // And the chain that does exist still resolves.
    expect((await resolveDelegate(pool, "u-a")).finalId).toBe("u-c");
  });

  it("carries the delegate's choice into the delegator's own row, with who decided it", async () => {
    await clearDelegations();
    const ballot = await openOne();
    // A follows B, B follows C. C is the final decider for all three.
    await setDelegation(pool, "u-a", "u-b");
    await setDelegation(pool, "u-b", "u-c");

    const cast = await castVote(pool, ballot.id, "u-c", "yes", "because it is time");
    expect(cast.ok).toBe(true);

    const a = await voteOf(pool, ballot.id, "u-a");
    const b = await voteOf(pool, ballot.id, "u-b");
    expect(a).toMatchObject({ choice: "yes", followedUserId: "u-c" });
    expect(b).toMatchObject({ choice: "yes", followedUserId: "u-c" });
    // The reason belongs to whoever wrote it and is never copied.
    expect(a?.reason).toBeNull();
    // C's own row says C decided it.
    expect(await voteOf(pool, ballot.id, "u-c")).toMatchObject({ choice: "yes", followedUserId: null });

    // THE WEIGHT NEVER MOVED. Three rows of weight 1, which is what makes
    // "3 of 3 people voted" true and keeps the frozen roll meaning what it says.
    expect(await voteCount(pool, ballot.id)).toBe(3);
    expect(await talliesFor(pool, ballot.id)).toEqual({ yesW: 3, noW: 0, abstainW: 0 });
    const weights = (await votesFor(pool, ballot.id)).map((v) => v.weight);
    expect(weights).toEqual([1, 1, 1]);
  });

  it("follows the delegate when they CHANGE their vote", async () => {
    await clearDelegations();
    const ballot = await openOne();
    await setDelegation(pool, "u-a", "u-b");
    await castVote(pool, ballot.id, "u-b", "yes");
    expect(await voteOf(pool, ballot.id, "u-a")).toMatchObject({ choice: "yes" });
    await castVote(pool, ballot.id, "u-b", "no");
    expect(await voteOf(pool, ballot.id, "u-a")).toMatchObject({ choice: "no", followedUserId: "u-b" });
  });

  it("a member who votes for themselves overrides, before and after the delegate", async () => {
    await clearDelegations();
    const ballot = await openOne();
    await setDelegation(pool, "u-a", "u-b");

    // A decides first. B voting the other way must not overwrite A's row.
    await castVote(pool, ballot.id, "u-a", "no", "my own words");
    await castVote(pool, ballot.id, "u-b", "yes");
    expect(await voteOf(pool, ballot.id, "u-a")).toMatchObject({
      choice: "no",
      reason: "my own words",
      followedUserId: null,
    });

    // And a member who was following takes their row back by voting.
    const second = await openOne();
    await castVote(pool, second.id, "u-b", "yes");
    expect(await voteOf(pool, second.id, "u-a")).toMatchObject({ choice: "yes", followedUserId: "u-b" });
    await castVote(pool, second.id, "u-a", "abstain");
    expect(await voteOf(pool, second.id, "u-a")).toMatchObject({ choice: "abstain", followedUserId: null });
    // The delegate voting again does not take it back off them.
    await castVote(pool, second.id, "u-b", "no");
    expect(await voteOf(pool, second.id, "u-a")).toMatchObject({ choice: "abstain", followedUserId: null });
  });

  it("a silent delegate leaves the vote UNCAST, never an abstain", async () => {
    await clearDelegations();
    const ballot = await openOne();
    await setDelegation(pool, "u-a", "u-b");
    await setDelegation(pool, "u-c", "u-b");
    // Nobody has voted. Deriving now must write nothing at all.
    const derived = await applyDelegatedVotes(pool, ballot.id);
    expect(derived).toMatchObject({ added: 0, changed: 0, removed: 0, eligible: true });
    expect(await voteOf(pool, ballot.id, "u-a")).toBeNull();
    expect(await voteCount(pool, ballot.id)).toBe(0);
    // Quorum counts them as not voted, and an abstain would have counted them
    // as having shown up. Three members are still awaited.
    expect((await awaitingVote(pool, ballot.id)).sort()).toEqual(["u-a", "u-b", "u-c"]);
    expect(await talliesFor(pool, ballot.id)).toEqual({ yesW: 0, noW: 0, abstainW: 0 });
  });

  it("revoking mid-ballot re-derives the row away, and the vote is uncast again", async () => {
    await clearDelegations();
    const ballot = await openOne();
    await setDelegation(pool, "u-a", "u-b");
    await castVote(pool, ballot.id, "u-b", "yes");
    expect(await voteOf(pool, ballot.id, "u-a")).toMatchObject({ choice: "yes" });

    await revokeDelegation(pool, "u-a");
    const moved = await applyDelegatedVotesEverywhere(pool);
    const mine = moved.find((m) => m.ballotId === ballot.id)!;
    expect(mine.counts).toMatchObject({ removed: 1, eligible: true });
    expect(await voteOf(pool, ballot.id, "u-a")).toBeNull();
    expect(await voteCount(pool, ballot.id)).toBe(1);
    expect(await awaitingVote(pool, ballot.id)).toContain("u-a");
  });

  it("moving a delegation mid-ballot re-derives to the new chain, downstream included", async () => {
    await clearDelegations();
    const ballot = await openOne();
    // A follows B; B follows C. C votes yes, so A and B both carry yes.
    await setDelegation(pool, "u-a", "u-b");
    await setDelegation(pool, "u-b", "u-c");
    await castVote(pool, ballot.id, "u-c", "yes");
    expect(await voteOf(pool, ballot.id, "u-a")).toMatchObject({ choice: "yes", followedUserId: "u-c" });

    // B moves their delegation to a member who voted the other way. A is
    // downstream of B and moves with them, which is the case a routine that
    // only patched the member who acted would get wrong.
    const other = await openOne({
      subjectRef: "delegation-test-move",
      electorate: [
        { userId: "u-a", weight: 1 },
        { userId: "u-b", weight: 1 },
        { userId: "u-c", weight: 1 },
        { userId: "u-d", weight: 1 },
      ],
    });
    await castVote(pool, other.id, "u-c", "yes");
    await castVote(pool, other.id, "u-d", "no");
    expect(await voteOf(pool, other.id, "u-a")).toMatchObject({ choice: "yes", followedUserId: "u-c" });
    expect((await setDelegation(pool, "u-b", "u-d")).ok).toBe(true);
    await applyDelegatedVotesEverywhere(pool);
    expect(await voteOf(pool, other.id, "u-b")).toMatchObject({ choice: "no", followedUserId: "u-d" });
    expect(await voteOf(pool, other.id, "u-a")).toMatchObject({ choice: "no", followedUserId: "u-d" });
  });

  it("says a closed ballot was never eligible, which is not the same as nothing to do", async () => {
    await clearDelegations();
    const ballot = await openOne();
    await pool.query("UPDATE ballots SET status = 'passed' WHERE id = ?", [ballot.id]); // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
    expect(await applyDelegatedVotes(pool, ballot.id)).toMatchObject({ eligible: false });
    expect(await applyDelegatedVotes(pool, "no-such-ballot")).toMatchObject({ eligible: false });
  });

  it("shows a delegator every vote they hold and who decided it", async () => {
    await clearDelegations();
    const ballot = await openOne();
    await setDelegation(pool, "u-a", "u-b");
    await castVote(pool, ballot.id, "u-b", "yes");
    const held = await votesFollowedBy(pool, "u-a", 10);
    const here = held.find((v) => v.ballotId === ballot.id)!;
    expect(here).toMatchObject({ choice: "yes", followedUserId: "u-b", ballotStatus: "open" });
    expect(here.ballotTitle).toBe(ballot.title);
  });

  it("reads concentration off the live table for a roster", async () => {
    await clearDelegations();
    await setDelegation(pool, "u-a", "u-b");
    await setDelegation(pool, "u-b", "u-c");
    const rows = await effectiveConcentration(pool, ["u-a", "u-b", "u-c"]);
    const c = rows.find((r) => r.userId === "u-c")!;
    expect(c.effectiveVotes).toBe(3);
    expect(c.shareOfElectorate).toBeCloseTo(1, 10);
    expect(rows.reduce((sum, r) => sum + r.effectiveVotes, 0)).toBe(3);
  });
});
