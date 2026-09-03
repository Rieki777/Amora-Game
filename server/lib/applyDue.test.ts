/**
 * The landing path, proven against a real MySQL (the S5 harness).
 *
 * What is pinned here is every rule the 2026-09-03 ruling turned on:
 *
 *  - a token send chosen at_acceptance EXECUTES at the close, and a seated
 *    steward's no vote FAILS it there with the steward named;
 *  - a token send chosen next_moon is stamped, waits, and can be vetoed;
 *  - a Game change never executes at close, and lands at its instant;
 *  - under steward_council one steward's no does not stop a change and a
 *    majority's does;
 *  - a veto inside the window stops it and records name, reason and time;
 *  - a veto after lands_at is refused naming the instant;
 *  - two concurrent applyDueGovernance calls on one due row produce exactly one
 *    set of writes;
 *  - a row lands through the job and through the press and never twice;
 *  - the brake marks a row stalled and reopens its window when applying resumes;
 *  - "nothing due" and "did not run" are different answers.
 *
 * No TEST_DATABASE_URL: the database cases skip, the run fails on the way out
 * (house rule). Nothing here passes hollowly.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { provisionTestDb, testDbConfigured, type TestDb } from "../db/testDb";
import { castVote, closeBallot, openBallot, type BallotRow, type OpenBallotInput } from "./ballots";
import {
  applyDueGovernance,
  autoSettleExpired,
  claimDue,
  landingOf,
  landingRow,
  recordVeto,
  routeOutcome,
  stampLanding,
  stewardNoVote,
  unfinishedLandings,
  type CloseRouting,
  type LandingDeps,
  type SubjectCloser,
} from "./applyDue";
import { STEWARD_VETO } from "./stewardship";

const configured = testDbConfigured();
let db: TestDb;
let pool: mysql.Pool;
let n = 0;

const HOUR = 60 * 60 * 1000;

/** A far new moon, so the 72 hours is never the later of the two. */
const FAR_MOON_DAYS = 20;

/** What the executors did, so a test can count writes rather than guess. */
let writes: string[] = [];
let council = false;
let brakeOff = true;
let throwOnExecute = false;

const deps = (over: Partial<LandingDeps> = {}): LandingDeps => ({
  pool,
  vetoHours: () => 72,
  autoApplyEnabled: () => brakeOff,
  stewardCouncil: () => council,
  nextNewMoonAfter: (after: Date) => new Date(after.getTime() + FAR_MOON_DAYS * 24 * HOUR),
  cycleNumberAt: () => 1,
  closerFor: (subjectType: string) => CLOSERS[subjectType],
  notify: async () => {},
  endedUnclosedCycle: async () => false,
  waitsForCycleClose: () => false,
  ...over,
});

/**
 * Two subjects and nothing else: one that changes the Game and one that sends
 * tokens. Both record what they wrote into `writes`, so "exactly one set of
 * writes" is a count and not a belief.
 */
const CLOSERS: Record<string, SubjectCloser> = {
  mechanics: {
    settle: async () => ({ applied: [], held: null, proposerTold: null }) as CloseRouting,
    execute: async (b) => {
      if (throwOnExecute) throw new Error("the executor fell over");
      writes.push(`landed:${b.id}`);
      return { applied: ["a.dial"], held: null, proposerTold: null };
    },
  },
  token_send: {
    settle: async () => ({ applied: [], held: null, proposerTold: null }) as CloseRouting,
    execute: async (b) => {
      writes.push(`paid:${b.id}`);
      return { applied: ["payout"], held: null, proposerTold: null };
    },
  },
  // A minting rule is cycle-timed by definition, which is the case the
  // ended-unclosed-cycle refusal exists for.
  mint_rule: {
    settle: async () => ({ applied: [], held: null, proposerTold: null }) as CloseRouting,
    execute: async (b) => {
      writes.push(`queued:${b.id}`);
      return { applied: [], held: "queued for the next moon", proposerTold: null };
    },
  },
};

const openOne = async (over: Partial<OpenBallotInput> = {}): Promise<BallotRow> => {
  const result = await openBallot(pool, {
    subjectType: "mechanics",
    subjectRef: `landing-test-${++n}`,
    title: `Ballot ${n}`,
    docMarkdown: "# The document as checked",
    method: "custom",
    weightMode: "equal",
    unityPct: 60,
    quorumPct: 20,
    durationDays: 7,
    openedBy: "u-proposer",
    electorate: [
      { userId: "u-a", weight: 1 },
      { userId: "u-b", weight: 1 },
      { userId: "u-steward", weight: 1 },
      { userId: "u-steward2", weight: 1 },
      { userId: "u-steward3", weight: 1 },
    ],
    ...over,
  });
  if (!result.ok) throw new Error(`ballot refused to open: ${result.error}`);
  return result.ballot;
};

/** Move a ballot's frozen window into the past so it can be closed honestly. */
const expire = async (b: BallotRow, agoMs = 60_000) => {
  const at = new Date(Date.now() - agoMs);
  await pool.query("UPDATE ballots SET closes_at = ? WHERE id = ?", [at, b.id]);
  return (await reload(b.id))!;
};

const reload = async (id: string): Promise<BallotRow | null> => {
  const { ballotById } = await import("./ballots");
  return ballotById(pool, id);
};

/** Carry a ballot: three yes votes, window expired, closed by the engine. */
const carry = async (b: BallotRow, votes: Array<[string, "yes" | "no", string?]> = [["u-a", "yes"], ["u-b", "yes"]]) => {
  for (const [userId, choice, reason] of votes) {
    const r = await castVote(pool, b.id, userId, choice, reason);
    if (!r.ok) throw new Error(`vote refused: ${r.error}`);
  }
  const expired = await expire(b);
  const closed = await closeBallot(pool, {
    ballotId: expired.id,
    closedBy: "governance",
    outcomeNote: "The window ended and the engine read the result.",
    closerMayCloseEarly: false,
  });
  if (!closed.ok) throw new Error(`close refused: ${closed.error}`);
  return closed;
};

/** Seat somebody as a steward: a role carrying the capability, and a holding. */
const seatSteward = async (userId: string, termEndsAt: Date | null = null) => {
  await pool.query( // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
    "INSERT INTO roles (id, name, capabilities) VALUES ('steward','Steward',?) ON DUPLICATE KEY UPDATE capabilities = VALUES(capabilities)",
    [JSON.stringify([STEWARD_VETO])],
  );
  await pool.query( // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
    "INSERT INTO role_holders (id, role_id, user_id, granted_by, term_ends_at) VALUES (?,?,?,?,?) " +
      "ON DUPLICATE KEY UPDATE term_ends_at = VALUES(term_ends_at)",
    [`rh-${userId}`, "steward", userId, "test", termEndsAt],
  );
};

const unseatEveryone = async () => {
  await pool.query("DELETE FROM role_holders WHERE role_id = 'steward'"); // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
};

beforeAll(async () => {
  if (!configured) return;
  db = await provisionTestDb();
  // Same timezone discipline as the app pool. Without it a DATETIME comes
  // back parsed in the machine's own zone and every landing instant is hours out.
  pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 8 }); // module-review-ok: the S5 scratch-schema harness pool, the ballots.test.ts shape
}, 300000);

afterAll(async () => {
  if (pool) await pool.end();
  if (db) await db.drop();
});

beforeEach(async () => {
  if (!configured) return;
  writes = [];
  council = false;
  brakeOff = true;
  throwOnExecute = false;
  await unseatEveryone();
});

describe.skipIf(!configured)("the two clocks, at the close", () => {
  it("executes a token send chosen at_acceptance the moment the vote closes", async () => {
    const b = await openOne({ subjectType: "token_send", timing: "at_acceptance", subjectRef: `ts-${++n}` });
    const closed = await carry(b);
    expect(closed.outcome).toBe("passed");
    const routing = await routeOutcome(deps(), closed.ballot!, "passed", "carried", "u-a");
    expect(writes).toEqual([`paid:${b.id}`]);
    expect(routing.outcome).toBe("passed");
    const row = await landingRow(pool, b.id);
    expect(row?.landsAt).toBeNull();
    expect(row?.landingStatus).toBe("applied");
  });

  it("never executes a Game change at the close, and stamps the instant instead", async () => {
    const b = await openOne();
    const closed = await carry(b);
    const routing = await routeOutcome(deps(), closed.ballot!, "passed", "carried", "u-a");
    expect(writes).toEqual([]);
    expect(routing.held).toContain("lands at");
    const row = await landingRow(pool, b.id);
    expect(row?.landingStatus).toBe("pending");
    // The frozen closes_at plus the moon, never the moment of the press.
    const expected = new Date(new Date(closed.ballot!.closesAt).getTime() + FAR_MOON_DAYS * 24 * HOUR);
    expect(Math.abs((row!.landsAt!.getTime() - expected.getTime())) / 1000).toBeLessThan(2);
  });

  it("derives the landing from the ballot's frozen close and not from the press", async () => {
    const b = await openOne();
    const closed = await carry(b, [["u-a", "yes"], ["u-b", "yes"]]);
    const landing = landingOf(deps(), { ballot: closed.ballot! });
    const fromClose = new Date(new Date(closed.ballot!.closesAt).getTime() + FAR_MOON_DAYS * 24 * HOUR);
    expect(landing.landsAt!.toISOString()).toBe(fromClose.toISOString());
  });
});

describe.skipIf(!configured)("a seated steward's no vote", () => {
  it("fails a token send at the close, with the steward named and the reason recorded", async () => {
    await seatSteward("u-steward");
    const b = await openOne({ subjectType: "token_send", timing: "at_acceptance", subjectRef: `ts-${++n}` });
    const closed = await carry(b, [["u-a", "yes"], ["u-b", "yes"], ["u-steward", "no", "This pays one household twice."]]);
    const routing = await routeOutcome(deps(), closed.ballot!, closed.outcome!, "carried", "u-a");
    expect(routing.outcome).toBe("failed");
    expect(writes).toEqual([]);
    const row = await landingRow(pool, b.id);
    expect(row?.status).toBe("failed");
    expect(row?.vetoedBy).toBe("u-steward");
    expect(row?.vetoReason).toContain("one household twice");
    expect(row?.vetoedAt).not.toBeNull();
  });

  it("counts nothing from a steward whose term has ended", async () => {
    await seatSteward("u-steward", new Date(Date.now() - 24 * HOUR));
    const b = await openOne();
    await carry(b, [["u-a", "yes"], ["u-b", "yes"], ["u-steward", "no", "gone"]]);
    expect(await stewardNoVote(deps(), (await reload(b.id))!)).toBeNull();
  });

  it("under steward_council needs a majority, so one no does not stop a change", async () => {
    await seatSteward("u-steward");
    await seatSteward("u-steward2");
    await seatSteward("u-steward3");
    council = true;
    const one = await openOne();
    await carry(one, [["u-a", "yes"], ["u-b", "yes"], ["u-steward", "no", "not this"]]);
    expect(await stewardNoVote(deps(), (await reload(one.id))!)).toBeNull();

    const two = await openOne();
    await carry(two, [
      ["u-a", "yes"],
      ["u-steward", "no", "not this"],
      ["u-steward2", "no", "nor this"],
    ]);
    const veto = await stewardNoVote(deps(), (await reload(two.id))!);
    expect(veto?.stewardIds.length).toBe(2);
    expect(veto?.seated).toBe(3);
  });

  it("with the council off lets any single steward's no stop it", async () => {
    await seatSteward("u-steward");
    await seatSteward("u-steward2");
    const b = await openOne();
    await carry(b, [["u-a", "yes"], ["u-b", "yes"], ["u-steward", "no", "one is enough"]]);
    const veto = await stewardNoVote(deps(), (await reload(b.id))!);
    expect(veto?.stewardIds).toEqual(["u-steward"]);
  });
});

describe.skipIf(!configured)("the veto inside and outside the window", () => {
  const carriedAndStamped = async (over: Partial<OpenBallotInput> = {}) => {
    const b = await openOne(over);
    const closed = await carry(b);
    await routeOutcome(deps(), closed.ballot!, "passed", "carried", "u-a");
    return (await reload(b.id))!;
  };

  it("stops a decision inside its window and records the name, the reason and the time", async () => {
    await seatSteward("u-steward");
    const b = await carriedAndStamped();
    const out = await recordVeto({ pool }, { ballotId: b.id, stewardId: "u-steward", reason: "This moves the bar the same week we set it." });
    expect(out.ok).toBe(true);
    const row = await landingRow(pool, b.id);
    expect(row?.landingStatus).toBe("vetoed");
    expect(row?.vetoedBy).toBe("u-steward");
    expect(row?.vetoReason).toContain("same week");
    expect(row?.vetoedAt).not.toBeNull();
  });

  it("refuses a veto with no reason", async () => {
    const b = await carriedAndStamped();
    const out = await recordVeto({ pool }, { ballotId: b.id, stewardId: "u-steward", reason: "   " });
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toContain("carries a reason");
  });

  it("refuses a veto after the instant, naming it", async () => {
    const b = await carriedAndStamped();
    const row = await landingRow(pool, b.id);
    const after = new Date(row!.landsAt!.getTime() + 1000);
    const out = await recordVeto({ pool, now: () => after }, { ballotId: b.id, stewardId: "u-steward", reason: "too late" });
    expect(out.ok).toBe(false);
    expect(out.ok === false && out.error).toContain(row!.landsAt!.toISOString());
  });

  it("stops the landing job from applying a vetoed row", async () => {
    await seatSteward("u-steward");
    const b = await carriedAndStamped();
    await recordVeto({ pool }, { ballotId: b.id, stewardId: "u-steward", reason: "not yet" });
    await pool.query("UPDATE ballots SET lands_at = ? WHERE id = ?", [new Date(Date.now() - HOUR), b.id]);
    const report = await applyDueGovernance(deps());
    expect(report.ran).toBe(true);
    expect(report.ran === true && report.landed).toBe(0);
    expect(writes).toEqual([]);
  });

  it("refuses a veto on an override, and lets it land", async () => {
    await seatSteward("u-steward");
    // The original, stopped by a steward.
    const first = await openOne({ subjectRef: "gmp-vetoed-1" });
    const closedFirst = await carry(first);
    await routeOutcome(deps(), closedFirst.ballot!, "passed", "carried", "u-a");
    await pool.query( // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
      "INSERT INTO mechanics_proposals (id, title, rationale, change_set, proposer_user_id, status, vetoed_at) " +
        "VALUES ('gmp-vetoed-1','The first ask','because','[]','u-proposer','vetoed', NOW())",
    );
    // The resubmission, pointing at it, passed again at the highest bar.
    const again = await openOne({ subjectRef: "gmp-override-1" });
    await pool.query( // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
      "INSERT INTO mechanics_proposals (id, title, rationale, change_set, proposer_user_id, status, supersedes_proposal_id) " +
        "VALUES ('gmp-override-1','The same ask, again','because','[]','u-proposer','onsite_vote','gmp-vetoed-1')",
    );
    const closedAgain = await carry(again);
    await routeOutcome(deps(), closedAgain.ballot!, "passed", "carried", "u-a");

    const stopped = await recordVeto({ pool }, { ballotId: again.id, stewardId: "u-steward", reason: "still no" });
    expect(stopped.ok).toBe(false);
    expect(stopped.ok === false && stopped.error).toContain("highest bar");

    await pool.query("UPDATE ballots SET lands_at = ? WHERE id = ?", [new Date(Date.now() - HOUR), again.id]);
    await applyDueGovernance(deps());
    expect(writes).toContain(`landed:${again.id}`);
  });

  it("refuses a veto on something that took effect the moment it carried", async () => {
    const b = await openOne({ subjectType: "token_send", timing: "at_acceptance", subjectRef: `ts-${++n}` });
    const closed = await carry(b);
    await routeOutcome(deps(), closed.ballot!, "passed", "carried", "u-a");
    const out = await recordVeto({ pool }, { ballotId: b.id, stewardId: "u-steward", reason: "undo it" });
    expect(out.ok).toBe(false);
  });
});

describe.skipIf(!configured)("the election, and landing exactly once", () => {
  const due = async () => {
    const b = await openOne();
    const closed = await carry(b);
    await routeOutcome(deps(), closed.ballot!, "passed", "carried", "u-a");
    await pool.query("UPDATE ballots SET lands_at = ? WHERE id = ?", [new Date(Date.now() - HOUR), b.id]);
    return b;
  };

  it("lets exactly one of two concurrent claims through", async () => {
    const b = await due();
    const at = new Date();
    const [one, two] = await Promise.all([claimDue(pool, b.id, at), claimDue(pool, b.id, at)]);
    expect([one, two].filter(Boolean).length).toBe(1);
  });

  it("produces exactly one set of writes from two concurrent runs on one due row", async () => {
    const b = await due();
    const [a, c] = await Promise.all([applyDueGovernance(deps()), applyDueGovernance(deps())]);
    expect(writes).toEqual([`landed:${b.id}`]);
    const landedTotal = (a.ran ? a.landed : 0) + (c.ran ? c.landed : 0);
    expect(landedTotal).toBe(1);
    expect((await landingRow(pool, b.id))?.landingStatus).toBe("applied");
  });

  it("never lands the same row twice across the job and a second press", async () => {
    const b = await due();
    await applyDueGovernance(deps());
    await applyDueGovernance(deps());
    expect(writes).toEqual([`landed:${b.id}`]);
  });

  it("leaves the executor-pending row behind when the executor throws", async () => {
    const b = await due();
    throwOnExecute = true;
    const report = await applyDueGovernance(deps());
    expect(report.ran === true && report.failed).toBe(1);
    const [rows] = await pool.query<any[]>("SELECT * FROM governance_executor_pending WHERE ballot_id = ?", [b.id]);
    expect(rows.length).toBe(1);
    expect(rows[0].cleared_at).toBeNull();
    expect(String(rows[0].last_error)).toContain("fell over");
    // Back to pending, so the next tick tries again rather than losing it.
    expect((await landingRow(pool, b.id))?.landingStatus).toBe("pending");
    expect(await unfinishedLandings(pool, 0)).toContain(b.id);
    // And the retry lands it, once.
    throwOnExecute = false;
    await applyDueGovernance(deps());
    expect(writes).toEqual([`landed:${b.id}`]);
  });
});

describe.skipIf(!configured)("nothing due, did not run, and the brake", () => {
  it("says nothing was due, distinctly from not having run", async () => {
    const report = await applyDueGovernance(deps());
    expect(report.ran).toBe(true);
    expect(report.ran === true && report.due).toBe(0);
    expect(report.ran === true && report.notes[0]).toContain("Nothing was due");
  });

  it("marks a row stalled while applying is off, and reopens its window when it comes back", async () => {
    const b = await openOne();
    const closed = await carry(b);
    await routeOutcome(deps(), closed.ballot!, "passed", "carried", "u-a");
    await pool.query("UPDATE ballots SET lands_at = ? WHERE id = ?", [new Date(Date.now() - HOUR), b.id]);

    brakeOff = false;
    const held = await applyDueGovernance(deps());
    expect(held.ran === true && held.stalled).toBe(1);
    expect(writes).toEqual([]);
    expect((await landingRow(pool, b.id))?.landingStatus).toBe("stalled");

    brakeOff = true;
    const resumed = await applyDueGovernance(deps());
    // The window reopens rather than the backlog landing in one sweep.
    expect(resumed.ran === true && resumed.stalled).toBe(1);
    expect(writes).toEqual([]);
    const row = await landingRow(pool, b.id);
    expect(row?.landingStatus).toBe("pending");
    expect(row!.landsAt!.getTime()).toBeGreaterThan(Date.now() + 71 * HOUR);
  });

  it("holds a cycle-timed decision back while a moon that ended is unclosed", async () => {
    const b = await openOne({ subjectType: "mint_rule", subjectRef: `mr-${++n}` });
    const closed = await carry(b);
    await routeOutcome(deps(), closed.ballot!, "passed", "carried", "u-a");
    await pool.query("UPDATE ballots SET lands_at = ? WHERE id = ?", [new Date(Date.now() - HOUR), b.id]);
    const report = await applyDueGovernance(
      deps({ endedUnclosedCycle: async () => true, waitsForCycleClose: () => true }),
    );
    expect(report.ran === true && report.deferred).toBe(1);
    expect(writes).toEqual([]);
  });
});

describe.skipIf(!configured)("closing on the clock", () => {
  it("refuses an early close on a custom-method ballot, so nobody picks the steward's days", async () => {
    const b = await openOne();
    await castVote(pool, b.id, "u-a", "yes");
    await castVote(pool, b.id, "u-b", "yes");
    const early = await closeBallot(pool, {
      ballotId: b.id,
      closedBy: "u-facilitator",
      outcomeNote: "closing it now",
      closerMayCloseEarly: true,
    });
    expect(early.ok).toBe(false);
    expect(early.ok === false && early.error).toContain("window ends");
  });

  it("closes an expired ballot through the settlement path and stamps its landing", async () => {
    const b = await openOne();
    await castVote(pool, b.id, "u-a", "yes");
    await castVote(pool, b.id, "u-b", "yes");
    await expire(b);
    const report = await autoSettleExpired(deps(), closeBallot as any);
    expect(report.closed).toBeGreaterThanOrEqual(1);
    const row = await landingRow(pool, b.id);
    expect(row?.status).toBe("passed");
    expect(row?.landingStatus).toBe("pending");
    expect(row?.landsAt).not.toBeNull();
  });

  it("says so when no ballot's window had ended", async () => {
    const report = await autoSettleExpired(deps(), closeBallot as any);
    expect(report.ran).toBe(true);
    expect(report.notes.join(" ")).toContain("No ballot");
  });
});

describe.skipIf(!configured)("stamping is idempotent and honest about what never lands", () => {
  it("marks a failed vote as never landing rather than as waiting", async () => {
    const b = await openOne();
    const closed = await carry(b, [["u-a", "no"], ["u-b", "no"]]);
    expect(closed.outcome).toBe("failed");
    await routeOutcome(deps(), closed.ballot!, closed.outcome!, "did not pass", "u-a");
    expect((await landingRow(pool, b.id))?.landingStatus).toBe("not_applicable");
  });

  it("writes the same instant to the ballot twice without moving it", async () => {
    const b = await openOne();
    const closed = await carry(b);
    const landing = landingOf(deps(), { ballot: closed.ballot! });
    await stampLanding(deps(), closed.ballot!, landing);
    const first = (await landingRow(pool, b.id))!.landsAt!.toISOString();
    await stampLanding(deps(), closed.ballot!, landing);
    expect((await landingRow(pool, b.id))!.landsAt!.toISOString()).toBe(first);
  });
});
