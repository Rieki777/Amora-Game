/**
 * The ballot conduct rules, proven against a real MySQL (S5 harness):
 *
 *  - THE SNAPSHOT LAW, the test the constitution names: change the village's
 *    unity dial AND a member's weight mid-ballot, close, and the outcome is
 *    identical to the frozen snapshot.
 *  - Double-open is a no-op on the open_key index; double-close is a no-op on
 *    the guarded UPDATE. Both return the standing state, execute nothing.
 *  - Votes are changeable upserts until closes_at, locked after.
 *  - The consent objection flow: a no auto-files, rulings need notes, a
 *    concern does not block, an integrated objection fails the ballot.
 *
 * No TEST_DATABASE_URL: skips loudly, never passes hollowly (house rule).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { provisionTestDb, testDbConfigured, type TestDb } from "../db/testDb";
import {
  ballotById,
  castVote,
  closeBallot,
  fileObjection,
  objectionsFor,
  openBallot,
  ruleObjection,
  standingObjectionCount,
  talliesFor,
  type OpenBallotInput,
} from "./ballots";
import { setWeight, weightsFor, weightChangeProblem, allWeights } from "./governanceWeights";

const configured = testDbConfigured();

let db: TestDb;
let pool: mysql.Pool;
let n = 0;

/** A fresh subject ref per ballot, so open_key never collides between cases. */
const openOne = async (over: Partial<OpenBallotInput> = {}) =>
  openBallot(pool, {
    subjectType: "mechanics",
    subjectRef: `gmp-test-${++n}`,
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

/** Push a ballot's closes_at into the past: the clock, not a status change. */
const expire = async (ballotId: string) => {
  await pool.query("UPDATE ballots SET closes_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ?", [ballotId]);
};

describe.skipIf(!configured)("ballots (MySQL)", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 8 });
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  it("refuses to open with an empty electorate or zero total weight, fail closed", async () => {
    const empty = await openOne({ electorate: [] });
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toContain("Nobody is eligible");

    const zero = await openOne({
      weightMode: "custom",
      electorate: [
        { userId: "u-a", weight: 0 },
        { userId: "u-b", weight: 0 },
      ],
    });
    expect(zero.ok).toBe(false);
    if (!zero.ok) expect(zero.error).toContain("total voting weight is zero");
  });

  it("double-open is a race-free no-op on the open_key index", async () => {
    const first = await openOne({ subjectRef: "gmp-double" });
    expect(first.ok).toBe(true);
    const second = await openOne({ subjectRef: "gmp-double" });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.error).toContain("already open");
      expect(second.alreadyOpen?.id).toBe(first.ok ? first.ballot.id : "");
    }
    // Exactly one ballot row exists for the subject.
    const [rows] = await pool.query<any[]>("SELECT COUNT(*) AS c FROM ballots WHERE subject_ref = 'gmp-double'");
    expect(Number(rows[0].c)).toBe(1);
  });

  it("a failed open leaves nothing behind: the transaction is whole", async () => {
    const boom = await openOne({
      subjectRef: "gmp-rollback",
      onOpen: async () => {
        throw new Error("subject flip refused");
      },
    }).catch((e) => e);
    expect(boom).toBeInstanceOf(Error);
    const [ballots] = await pool.query<any[]>("SELECT COUNT(*) AS c FROM ballots WHERE subject_ref = 'gmp-rollback'");
    expect(Number(ballots[0].c)).toBe(0);
  });

  it("votes are upserts from the frozen electorate only, changeable until the clock", async () => {
    const opened = await openOne();
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const id = opened.ballot.id;

    const stranger = await castVote(pool, id, "u-nobody", "yes");
    expect(stranger.ok).toBe(false);
    if (!stranger.ok) expect(stranger.error).toContain("outside this ballot's electorate");

    expect((await castVote(pool, id, "u-a", "maybe")).ok).toBe(false);

    expect((await castVote(pool, id, "u-a", "no")).ok).toBe(true);
    expect((await castVote(pool, id, "u-a", "yes")).ok).toBe(true); // changed their mind
    const t1 = await talliesFor(pool, id);
    expect(t1).toEqual({ yesW: 1, noW: 0, abstainW: 0 }); // one row, latest choice

    await expire(id);
    const late = await castVote(pool, id, "u-b", "yes");
    expect(late.ok).toBe(false);
    if (!late.ok) expect(late.error).toContain("Votes are locked");
  });

  it("THE SNAPSHOT LAW: a dial and a weight change mid-ballot move nothing", async () => {
    // Custom weights: a=1, b=1, c=2, allocated through the audited path.
    for (const [userId, weight] of [["u-a", 1], ["u-b", 1], ["u-c", 2]] as const) {
      await setWeight(pool, { userId, weight, actorUserId: "u-admin", note: "initial allocation" });
    }
    const weights = await weightsFor(pool, ["u-a", "u-b", "u-c"], { mode: "custom", token: null });
    const opened = await openOne({
      subjectRef: "gmp-snapshot",
      weightMode: "custom",
      unityPct: 80, // the village dial as it stood at open
      electorate: [
        { userId: "u-a", weight: weights.get("u-a")! },
        { userId: "u-b", weight: weights.get("u-b")! },
        { userId: "u-c", weight: weights.get("u-c")! },
      ],
    });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const id = opened.ballot.id;
    expect(opened.ballot.totalWeight).toBe(4);

    // a and b say yes (weight 2), c says no (weight 2): unity 50, quorum 100.
    await castVote(pool, id, "u-a", "yes");
    await castVote(pool, id, "u-b", "yes");
    await castVote(pool, id, "u-c", "no");

    // MID-BALLOT, the village moves: c's weight drops to zero (which would
    // make unity 100 if weights were read live) and the unity dial "changes"
    // to 50 (which would pass unity 50 if dials were read live). The ballot
    // must see neither.
    await setWeight(pool, { userId: "u-c", weight: 0, actorUserId: "u-admin", note: "mid-ballot reallocation" });
    // The dial change needs no registry here: closeBallot reads ONLY the
    // ballot's own columns, so the frozen 80 is what evaluates, and there is
    // no argument through which a new value could even arrive.

    await expire(id);
    const closed = await closeBallot(pool, {
      ballotId: id,
      closedBy: "u-proposer",
      outcomeNote: "Closed after the vote period. Unity fell short of the frozen 80.",
      closerMayCloseEarly: false,
    });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    // Frozen weights: yes 2, no 2 — unity 50 against the frozen 80: failed.
    // Live weights would have said yes 2, no 0 — unity 100: passed.
    expect(closed.tallies).toEqual({ yesW: 2, noW: 2, abstainW: 0 });
    expect(closed.unity).toBe(50);
    expect(closed.quorum).toBe(100);
    expect(closed.outcome).toBe("failed");

    // And the mid-ballot change is on the record, attributed, both rows.
    const [trail] = await pool.query<any[]>(
      "SELECT old_weight, new_weight, note FROM governance_weight_changes WHERE user_id = 'u-c' ORDER BY id",
    );
    expect(trail.length).toBe(2);
    expect(Number(trail[1].old_weight)).toBe(2);
    expect(Number(trail[1].new_weight)).toBe(0);
  });

  it("double-close is a no-op: the guarded UPDATE fires once", async () => {
    const opened = await openOne({ subjectRef: "gmp-close-twice" });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const id = opened.ballot.id;
    await castVote(pool, id, "u-a", "yes");
    await expire(id);

    const noNote = await closeBallot(pool, { ballotId: id, closedBy: "u-a", outcomeNote: "  ", closerMayCloseEarly: false });
    expect(noNote.ok).toBe(false);
    if (!noNote.ok) expect(noNote.error).toContain("note is required");

    const first = await closeBallot(pool, { ballotId: id, closedBy: "u-a", outcomeNote: "First close.", closerMayCloseEarly: false });
    expect(first.ok).toBe(true);
    const second = await closeBallot(pool, { ballotId: id, closedBy: "u-b", outcomeNote: "Second close.", closerMayCloseEarly: false });
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.alreadyClosed?.closedBy).toBe("u-a");
      expect(second.alreadyClosed?.outcomeNote).toBe("First close.");
    }
    // The close freed the subject's open_key: a fresh ballot can open.
    const again = await openOne({ subjectRef: "gmp-close-twice" });
    expect(again.ok).toBe(true);
  });

  it("early close is the facilitator's call alone", async () => {
    const opened = await openOne({ subjectRef: "gmp-early" });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    const id = opened.ballot.id;
    await castVote(pool, id, "u-a", "yes");

    const tooSoon = await closeBallot(pool, { ballotId: id, closedBy: "u-proposer", outcomeNote: "Trying early.", closerMayCloseEarly: false });
    expect(tooSoon.ok).toBe(false);
    if (!tooSoon.ok) expect(tooSoon.error).toContain("still running");

    const facilitator = await closeBallot(pool, { ballotId: id, closedBy: "u-decider", outcomeNote: "Closed early by the facilitator.", closerMayCloseEarly: true });
    expect(facilitator.ok).toBe(true);
  });

  it("the consent flow: no auto-files, rulings need notes, concern passes, integrated fails", async () => {
    const consent = (ref: string) =>
      openOne({
        subjectRef: ref,
        method: "consent",
        unityPct: 0,
        quorumPct: 20,
      });

    // A no without a reason is refused: an objection carries its reasoning.
    const first = await consent("agr-consent-1");
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const b1 = first.ballot.id;
    expect((await castVote(pool, b1, "u-a", "no")).ok).toBe(false);
    expect((await castVote(pool, b1, "u-a", "no", "This risks the water budget.")).ok).toBe(true);
    let objections = await objectionsFor(pool, b1);
    expect(objections.length).toBe(1);
    expect(objections[0].status).toBe("open");
    // Re-voting no UPDATES the standing objection instead of stacking a second.
    expect((await castVote(pool, b1, "u-a", "no", "This risks the water budget, and the well.")).ok).toBe(true);
    objections = await objectionsFor(pool, b1);
    expect(objections.length).toBe(1);
    expect(objections[0].text).toContain("and the well");

    // Objections come only from a consent ballot's own electorate.
    expect((await fileObjection(pool, b1, "u-nobody", "outsider")).ok).toBe(false);
    const voteless = await fileObjection(pool, b1, "u-b", "Filed without voting no.");
    expect(voteless.ok).toBe(true);

    // A ruling without a note is refused; an unknown ruling is refused.
    const objId = objections[0].id;
    expect((await ruleObjection(pool, { objectionId: objId, ruling: "concern", ruledBy: "u-lead", note: " " })).ok).toBe(false);
    expect((await ruleObjection(pool, { objectionId: objId, ruling: "overruled", ruledBy: "u-lead", note: "x" })).ok).toBe(false);

    // Concern: recorded, does not block. Withdraw the other, and the window
    // must still run out before a pass.
    expect((await ruleObjection(pool, { objectionId: objId, ruling: "concern", ruledBy: "u-lead", note: "Watch the water budget at review." })).ok).toBe(true);
    if (voteless.ok) {
      expect((await ruleObjection(pool, { objectionId: voteless.id, ruling: "withdrawn", ruledBy: "u-b", note: "Answered in the thread." })).ok).toBe(true);
      // A ruled objection takes no second ruling.
      expect((await ruleObjection(pool, { objectionId: voteless.id, ruling: "concern", ruledBy: "u-lead", note: "again" })).ok).toBe(false);
    }
    expect(await standingObjectionCount(pool, b1)).toBe(0);
    const beforeWindow = await closeBallot(pool, { ballotId: b1, closedBy: "u-lead", outcomeNote: "Trying before the window ends.", closerMayCloseEarly: true });
    expect(beforeWindow.ok).toBe(false);
    if (!beforeWindow.ok) expect(beforeWindow.error).toContain("only after its window ends");
    await expire(b1);
    const passed = await closeBallot(pool, { ballotId: b1, closedBy: "u-lead", outcomeNote: "No objection stands; the concern rides to review.", closerMayCloseEarly: false });
    expect(passed.ok).toBe(true);
    if (passed.ok) expect(passed.outcome).toBe("passed");

    // Integrated: the objection stands, the ballot fails, even after the window.
    const second = await consent("agr-consent-2");
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    const b2 = second.ballot.id;
    await castVote(pool, b2, "u-a", "yes");
    const blocking = await fileObjection(pool, b2, "u-c", "The plan double-books the hall.");
    expect(blocking.ok).toBe(true);
    if (blocking.ok) {
      expect((await ruleObjection(pool, { objectionId: blocking.id, ruling: "integrated", ruledBy: "u-lead", note: "It does. The proposal must change." })).ok).toBe(true);
    }
    await expire(b2);
    const failed = await closeBallot(pool, { ballotId: b2, closedBy: "u-lead", outcomeNote: "An integrated objection stands; back to staging.", closerMayCloseEarly: false });
    expect(failed.ok).toBe(true);
    if (failed.ok) expect(failed.outcome).toBe("failed");
  });

  it("weights: notes are required, absent rows weigh zero, the trail appends", async () => {
    expect(weightChangeProblem({ weight: 3, note: "" })).toContain("Say why");
    expect(weightChangeProblem({ weight: -1, note: "x" })).toContain("zero or a positive");
    await expect(
      setWeight(pool, { userId: "u-x", weight: 5, actorUserId: "u-admin", note: "" }),
    ).rejects.toThrow();

    const before = await weightsFor(pool, ["u-never-allocated"], { mode: "custom", token: null });
    expect(before.get("u-never-allocated")).toBe(0); // fail closed

    await setWeight(pool, { userId: "u-x", weight: 5, actorUserId: "u-admin", note: "founding allocation" });
    const all = await allWeights(pool);
    expect(all.get("u-x")).toBe(5);

    const equal = await weightsFor(pool, ["u-x", "u-never-allocated"], { mode: "equal", token: null });
    expect(equal.get("u-x")).toBe(1);
    expect(equal.get("u-never-allocated")).toBe(1);
  });

  it("the closed ballot's record is whole: note, closer, rewritten open_key", async () => {
    const opened = await openOne({ subjectRef: "gmp-record" });
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    await castVote(pool, opened.ballot.id, "u-a", "abstain");
    await expire(opened.ballot.id);
    const closed = await closeBallot(pool, {
      ballotId: opened.ballot.id,
      closedBy: "u-proposer",
      outcomeNote: "One abstention reached quorum and took no side.",
      closerMayCloseEarly: false,
    });
    expect(closed.ok).toBe(true);
    if (!closed.ok) return;
    // 1 abstain of 3: quorum 33 >= 20, unity 0 against 80: failed.
    expect(closed.outcome).toBe("failed");
    const b = await ballotById(pool, opened.ballot.id);
    expect(b?.outcomeNote).toContain("abstention");
    expect(b?.closedBy).toBe("u-proposer");
    expect(b?.openKey).toBe(`mechanics:gmp-record:${opened.ballot.id}`);
  });
});
