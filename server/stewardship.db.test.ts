/**
 * The steward, against the real tables.
 *
 * Every rule here was written red first, because each one is a promise the
 * founder made and none of them had a row to stand on before 0133 and 0134:
 *
 *  - a catalyst inherits the seat at the Birthing, with a term;
 *  - seating twice is one row, because a close can be retried;
 *  - an empty refusal reason is refused;
 *  - a refusal records who, why, and which ballot;
 *  - a lapsed term takes the powers with it, on the plane that carries them;
 *  - an empty seat with nothing waiting on it is HEALTHY and never a warning.
 *
 * The suite drives `server/lib/stewardship.ts` against a scratch schema rather
 * than over HTTP, because these are the functions the close dispatcher and the
 * approval routes both call. The HTTP half is one thin layer over exactly
 * these calls; what is worth pinning is the rule, not the JSON.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import type { Pool } from "mysql2/promise";
import { provisionTestDb, testDbConfigured, type TestDb } from "./db/testDb";
import { loadVariables, setVariable } from "./lib/variables";
import {
  approvalFor,
  ballotsWaitingForASteward,
  expiringHoldings,
  holdingHasLapsed,
  recordApproval,
  recordRefusal,
  runTermWatch,
  seatCatalystsAsStewards,
  stewardsSeated,
  subjectTypesSeen,
  vacancyState,
  AUTO_EXECUTE_SUBJECTS_KEY,
  STEWARD_APPROVE,
  STEWARD_ROLE_ID,
  STEWARD_SUBJECTS_KEY,
} from "./lib/stewardship";

const configured = testDbConfigured();
let db: TestDb;
let pool: Pool;

const LAUNCH_BALLOT = "bal-birthing";

async function member(id: string, name: string, role: string): Promise<void> {
  await pool.query( // module-review-ok: fixture SQL against the S5 scratch schema
    "INSERT INTO users (id, name, email, password_hash, role) VALUES (?,?,?,?,?)",
    [id, name, `${id}@example.invalid`, "x", role],
  );
}

async function ballot(id: string, subjectType: string, status: string, openedBy: string): Promise<void> {
  await pool.query( // module-review-ok: fixture SQL against the S5 scratch schema
    "INSERT INTO ballots (id, subject_type, subject_ref, open_key, title, doc_markdown, method, weight_mode, " +
      "unity_pct, quorum_pct, total_weight, electorate_count, opened_by, opens_at, closes_at, status) " +
      "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW(),?)",
    [id, subjectType, "ref", `${subjectType}:${id}`, `Decision ${id}`, "body", "custom", "equal",
      80, 20, 3, 3, openedBy, status],
  );
}

/** The permission gate's own predicate, run over the rows the gate reads. */
async function capabilitiesOf(userId: string): Promise<string[]> {
  const [holders]: any = await pool.query(
    "SELECT role_id, term_ends_at FROM role_holders WHERE user_id = ?",
    [userId],
  );
  const live = holders.filter((h: any) => !holdingHasLapsed({ termEndsAt: h.term_ends_at }));
  if (live.length === 0) return [];
  const [roles]: any = await pool.query(
    `SELECT capabilities FROM roles WHERE id IN (${live.map(() => "?").join(",")})`,
    live.map((h: any) => h.role_id),
  );
  const out = new Set<string>();
  for (const r of roles) {
    const caps = typeof r.capabilities === "string" ? JSON.parse(r.capabilities) : r.capabilities;
    for (const c of caps ?? []) out.add(String(c));
  }
  return Array.from(out);
}

describe.skipIf(!configured)("the steward seat, seated at the Birthing", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 6 });
    await loadVariables(pool);
    await member("cat-1", "Wren Alder", "founder");
    await member("cat-2", "Iris Fenn", "founder");
    await member("mem-1", "Rook Salt", "member");
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  it("finds nobody on the seat before the Birthing, and says so without calling it a fault", async () => {
    const state = await vacancyState(pool);
    expect(state.seated).toBe(false);
    expect(state.holdings).toEqual([]);
    // The default setting still asks for a steward, so this empty seat is a
    // queue rather than a village that has grown out of the seat.
    expect(state.stillAsked).toBe(true);
    expect(state.healthy).toBe(false);
    expect(state.sentence).toBe("No steward holds the seat; proposals wait.");
  });

  it("seats every catalyst, creates the role, and grants the one power", async () => {
    const r = await seatCatalystsAsStewards(pool, LAUNCH_BALLOT, {
      currentSeasonId: "rooting-2026",
      nextTurnAt: "2026-12-01T00:00:00.000Z",
    });
    expect(r.ok).toBe(true);
    expect(r.roleCreated).toBe(true);
    expect(r.capabilityGranted).toBe(true);
    expect(r.seated.sort()).toEqual(["cat-1", "cat-2"]);
    expect(r.alreadySeated).toEqual([]);

    const [roles]: any = await pool.query("SELECT capabilities FROM roles WHERE id = ?", [STEWARD_ROLE_ID]);
    const caps = typeof roles[0].capabilities === "string" ? JSON.parse(roles[0].capabilities) : roles[0].capabilities;
    expect(caps).toContain(STEWARD_APPROVE);
  });

  it("writes the term and the season, and names the ballot as the grantor", async () => {
    // The founder's rule that makes relinquishment automatic: the seat has to
    // be re-granted, so it has to end on a date somebody can read.
    const [rows]: any = await pool.query(
      "SELECT term_ends_at, season_id, granted_by FROM role_holders WHERE role_id = ? AND user_id = ?",
      [STEWARD_ROLE_ID, "cat-1"],
    );
    expect(rows[0].term_ends_at, "the seat ends on a date").toBeTruthy();
    expect(rows[0].season_id).toBe("rooting-2026");
    expect(rows[0].granted_by, "the village put them here, not an administrator").toBe(LAUNCH_BALLOT);
  });

  it("gives a catalyst the approval power, and gives an ordinary member none", async () => {
    expect(await capabilitiesOf("cat-1")).toContain(STEWARD_APPROVE);
    expect(await capabilitiesOf("mem-1")).toEqual([]);
  });

  it("seats nobody twice: a retried close is one row per catalyst", async () => {
    const again = await seatCatalystsAsStewards(pool, LAUNCH_BALLOT, {
      currentSeasonId: "rooting-2026",
      nextTurnAt: "2026-12-01T00:00:00.000Z",
    });
    expect(again.seated, "nothing to do, and that is different from a failure").toEqual([]);
    expect(again.alreadySeated.sort()).toEqual(["cat-1", "cat-2"]);
    expect(again.roleCreated).toBe(false);
    expect(again.capabilityGranted).toBe(false);

    const [count]: any = await pool.query(
      "SELECT COUNT(*) AS n FROM role_holders WHERE role_id = ?",
      [STEWARD_ROLE_ID],
    );
    expect(Number(count[0].n)).toBe(2);
  });

  it("reads the seat as held, by two people, either of whom can approve", async () => {
    const state = await vacancyState(pool);
    expect(state.seated).toBe(true);
    expect(state.holdings).toHaveLength(2);
    expect(state.lapsed).toEqual([]);
    expect(state.sentence).toContain("any one of them can approve");
  });
});

describe.skipIf(!configured)("the decision on a passed ballot", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 6 });
    await loadVariables(pool);
    await member("st-1", "Wren Alder", "founder");
    await member("pr-1", "Rook Salt", "member");
    await ballot("bal-approve", "mechanics", "passed", "pr-1");
    await ballot("bal-refuse", "mechanics", "passed", "pr-1");
    await ballot("bal-waiting", "mechanics", "passed", "pr-1");
    await ballot("bal-advisory", "advisory", "passed", "pr-1");
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  it("has no decision on a passed ballot until somebody makes one, and null is the queue", async () => {
    expect(await approvalFor(pool, "bal-approve")).toBeNull();
  });

  it("refuses an empty refusal reason and writes nothing", async () => {
    const r = await recordRefusal(pool, { ballotId: "bal-refuse", decidedBy: "st-1", reason: "   " });
    expect(r.ok).toBe(false);
    expect(await approvalFor(pool, "bal-refuse"), "a rejected refusal leaves no row").toBeNull();
  });

  it("records a refusal with the person, the reason and the ballot", async () => {
    const reason = "This turns the mint on before the ledger is settled.";
    const r = await recordRefusal(pool, { ballotId: "bal-refuse", decidedBy: "st-1", reason });
    expect(r.ok).toBe(true);

    const row = await approvalFor(pool, "bal-refuse");
    expect(row).toBeTruthy();
    expect(row!.ballotId).toBe("bal-refuse");
    expect(row!.decidedBy).toBe("st-1");
    expect(row!.decision).toBe("refused");
    expect(row!.reason).toBe(reason);
    expect(row!.decidedAt).toBeTruthy();
  });

  it("keeps the first decision when a second one arrives, rather than overwriting it", async () => {
    // The route answers 409 off this. A veto that a second call could quietly
    // turn into an approval would be a record nobody can trust.
    const second = await recordApproval(pool, { ballotId: "bal-refuse", decidedBy: "st-1", reason: "" });
    expect(second.ok).toBe(true);
    expect(second.ok && second.fresh, "nothing new was written").toBe(false);
    expect((await approvalFor(pool, "bal-refuse"))!.decision).toBe("refused");
  });

  it("records an approval, which may carry no words at all", async () => {
    const r = await recordApproval(pool, { ballotId: "bal-approve", decidedBy: "st-1", reason: "" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.fresh).toBe(true);
    const row = await approvalFor(pool, "bal-approve");
    expect(row!.decision).toBe("approved");
    // Stored as an empty string, never NULL: "no reason given" and "the column
    // was never written" stay different facts.
    expect(row!.reason).toBe("");
  });

  it("counts only undecided passed ballots as waiting, and never an advisory one", async () => {
    const waiting = (await ballotsWaitingForASteward(pool)).map((b) => b.id).sort();
    expect(waiting).toEqual(["bal-waiting"]);
  });

  it("stops asking for a steward on a subject the village told to carry itself", async () => {
    await setVariable(pool, AUTO_EXECUTE_SUBJECTS_KEY, "mechanics");
    expect(await ballotsWaitingForASteward(pool)).toEqual([]);
    await setVariable(pool, AUTO_EXECUTE_SUBJECTS_KEY, "none");
    expect(await ballotsWaitingForASteward(pool)).toHaveLength(1);
  });

  it("shows the per-subject map over the kinds of decision this village has actually held", async () => {
    const seen = await subjectTypesSeen(pool);
    expect(seen).toContain("mechanics");
    expect(seen).toContain("advisory");
  });
});

describe.skipIf(!configured)("a term that runs out, and the vacancy it leaves", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 6 });
    await loadVariables(pool);
    await member("lapse-1", "Wren Alder", "founder");
    await member("roll-1", "Rook Salt", "member");
    await seatCatalystsAsStewards(pool, LAUNCH_BALLOT, {
      currentSeasonId: "rooting-2026",
      nextTurnAt: "2026-12-01T00:00:00.000Z",
    });
    await ballot("bal-held", "mechanics", "passed", "roll-1");
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  it("holds the powers while the term is running", async () => {
    expect(await capabilitiesOf("lapse-1")).toContain(STEWARD_APPROVE);
    const state = await vacancyState(pool);
    expect(state.seated).toBe(true);
  });

  it("TAKES THE POWERS when the term date passes, which is the rule that replaced the old one", async () => {
    await pool.query( // module-review-ok: fixture SQL against the S5 scratch schema
      "UPDATE role_holders SET term_ends_at = ? WHERE user_id = ?",
      [new Date("2020-01-01T00:00:00Z"), "lapse-1"],
    );
    expect(await capabilitiesOf("lapse-1"), "the seat expired, and the power with it").toEqual([]);
  });

  it("still shows who held it, marked lapsed, so the seat does not read as never filled", async () => {
    const held = await stewardsSeated(pool);
    expect(held).toHaveLength(1);
    expect(held[0].userId).toBe("lapse-1");
    expect(held[0].lapsed).toBe(true);
  });

  it("reads as vacant, with the waiting sentence, because a decision is queued", async () => {
    const state = await vacancyState(pool);
    expect(state.seated).toBe(false);
    expect(state.lapsed).toHaveLength(1);
    expect(state.sentence).toBe("No steward holds the seat; proposals wait.");
    expect(state.healthy, "not healthy: something is still waiting on the seat").toBe(false);
  });

  it("calls the same empty seat HEALTHY once the village asks nobody for anything", async () => {
    // The founder: "it's perfectly fine to have no stewards and for the game
    // to have self/executing agreements." The words change with the village's
    // own setting, and neither wording is a warning.
    await setVariable(pool, STEWARD_SUBJECTS_KEY, "none");
    const state = await vacancyState(pool);
    expect(state.seated).toBe(false);
    expect(state.healthy).toBe(true);
    expect(state.sentence).toContain("agreements carry themselves");
    await setVariable(pool, STEWARD_SUBJECTS_KEY, "all");
  });

  it("puts the lapsed holding on the term watch's list, ended rather than expiring", async () => {
    const rows = await expiringHoldings(pool);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("lapse-1");
    expect(rows[0].ended).toBe(true);
  });

  it("tells the holder the powers ended, and tells the roll the decision is waiting", async () => {
    const told: Array<{ userId: string; body: string; key: string }> = [];
    const rolls: string[] = [];
    const r = await runTermWatch({
      pool,
      seatings: [],
      notify: async (n) => {
        told.push({ userId: n.userId, body: String(n.body ?? ""), key: n.dedupeKey });
        return { fresh: true };
      },
      notifyRoll: async (b, input) => {
        rolls.push(`${b.id}:${input.type}:${input.body}`);
        return 1;
      },
    });

    expect(r.ok).toBe(true);
    expect(r.holdersTold).toBe(1);
    expect(told[0].userId).toBe("lapse-1");
    expect(told[0].body, "the copy says the powers went with the seat").toContain("the powers that came with it");
    expect(told[0].key).toContain("perm-term-ended");

    expect(r.waiting, "one carried decision with nobody able to decide it").toBe(1);
    expect(r.rollsTold).toBe(1);
    expect(rolls[0]).toContain("bal-held:ballot_awaiting_steward");
    expect(rolls[0], "and the vacancy sentence travels with it").toContain("No steward holds the seat");
  });

  it("rings the roll about nothing while somebody holds the seat", async () => {
    await pool.query( // module-review-ok: fixture SQL against the S5 scratch schema
      "UPDATE role_holders SET term_ends_at = NULL WHERE user_id = ?",
      ["lapse-1"],
    );
    const rolls: string[] = [];
    const r = await runTermWatch({
      pool,
      seatings: [],
      notify: async () => ({ fresh: true }),
      notifyRoll: async (b) => {
        rolls.push(b.id);
        return 1;
      },
    });
    expect(r.waiting, "the decision is still waiting").toBe(1);
    expect(r.rollsTold, "and nobody is told, because somebody can act on it").toBe(0);
    expect(rolls).toEqual([]);
  });
});
