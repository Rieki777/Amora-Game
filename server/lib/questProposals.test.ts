/**
 * A quest proposal cannot become a live quest without a human typing a reward
 * (0128).
 *
 * THE FIRST TEST IN THIS FILE IS THE LOAD-BEARING ONE and it is not about a
 * refusal at all. It reads the SCHEMA. The five columns a machine must never
 * write are absent from `quest_proposals` rather than present and guarded, so
 * there is no write to refuse and no future route that can forget to refuse
 * it. A guard can be removed by somebody who does not know why it is there; a
 * column that does not exist cannot be written by accident.
 *
 * The rest prove the other half: a quest reaches the board only through
 * `questsRepo.add`, with what a person typed on it.
 *
 * No TEST_DATABASE_URL and the suite skips loudly (harness rule).
 */
import { describe, expect, it, beforeAll, afterAll, beforeEach } from "vitest";
import mysql from "mysql2/promise";
import { parseRewardRange } from "../../shared/questRewards";
import { provisionTestDb, testDbConfigured, type TestDb } from "../db/testDb";
import { questsRepo as makeQuestsRepo } from "../repos/quests";
import {
  acceptQuestProposal,
  proposeQuest,
  questBatchCap,
  questProposalQueue,
  rewardProblem,
} from "./questProposals";

const configured = testDbConfigured();

let db: TestDb;
let pool: mysql.Pool;
let quests: ReturnType<typeof makeQuestsRepo>;

const propose = (over: Record<string, unknown> = {}) => ({
  villageId: "v1",
  moduleId: "saberra",
  batchId: "b1",
  prose: { title: "Clear the north swale", description: "Two hours with a mattock." },
  batchCap: 10,
  ...over,
});

describe.skipIf(!configured)("a proposed quest and the reward a human types", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 4 }); // module-review-ok: the suite's own pool onto the scratch schema it provisioned
    quests = makeQuestsRepo(pool);
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM quest_proposals"); // module-review-ok: resetting the scratch schema this suite provisioned, between cases
    await pool.query("DELETE FROM quests"); // module-review-ok: same
  });

  // ── THE STRUCTURAL HALF ──────────────────────────────────────────────────

  it("has no column a machine could set a reward or a gate in", async () => {
    const [cols] = await pool.query<any[]>( // module-review-ok: reading the scratch schema this suite provisioned
      "SELECT COLUMN_NAME AS c FROM information_schema.COLUMNS " +
        "WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'quest_proposals'",
    );
    const names = new Set(cols.map((r) => String(r.c)));
    for (const forbidden of [
      "gratitude",
      "gratitude_min",
      "gratitude_max",
      "stay_credit_reward",
      "min_stage",
      "requires_role",
    ]) {
      expect(names.has(forbidden), `quest_proposals must not carry ${forbidden}`).toBe(false);
    }
    // And the prose layer IS there, so the absence above is a line drawn on
    // purpose and not a table that was never finished.
    for (const allowed of ["title", "description", "story", "steps", "tips", "role_required"]) {
      expect(names.has(allowed), `quest_proposals should carry ${allowed}`).toBe(true);
    }
  });

  // ── THE REFUSAL ──────────────────────────────────────────────────────────

  it("refuses to put a quest on the board with no reward typed", async () => {
    const p = await proposeQuest(pool, propose());
    expect(p.ok).toBe(true);

    const r = await acceptQuestProposal(pool, quests, {
      id: p.ok ? p.id : "",
      decidedBy: "u1",
      reward: { gratitude: "   " },
    });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("Nobody else can set that");
    expect(await quests.all()).toHaveLength(0);
    // The proposal is untouched and still waiting, so a refusal never loses it.
    expect(await questProposalQueue(pool)).toHaveLength(1);
  });

  it("refuses a reward this village could not read as an amount", async () => {
    expect(rewardProblem({ gratitude: "" })).toContain("Nobody else can set that");
    expect(rewardProblem({ gratitude: "some hearts" })).toContain("could not read");
    expect(rewardProblem({ gratitude: "50-100" })).toBeNull();
    expect(rewardProblem({ gratitude: "75" })).toBeNull();
    expect(rewardProblem({ gratitude: "50", stayCreditReward: -2 })).toContain("whole number");
    // A deliberate zero is allowed. Caps fail closed in this platform, zero
    // means zero, and a quest may pay stay credits alone.
    expect(rewardProblem({ gratitude: "0", stayCreditReward: 2 })).toBeNull();
  });

  it("records the parser defect this gate exists to cover", () => {
    // NOT A TEST OF MY CODE. `parseRewardRange` documents itself as returning
    // valid:false for anything unparseable, and for a label with no digits it
    // returns valid TRUE with zeros: the label strips to "", Number("") is 0,
    // and 0 is finite. Pinned here so that whoever fixes shared/questRewards.ts
    // sees this line go red and knows the digit test above can then come out.
    const parsed = parseRewardRange("some hearts");
    expect(parsed.valid).toBe(true);
    expect(parsed.max).toBe(0);
  });

  // ── THE ACCEPT ───────────────────────────────────────────────────────────

  it("creates the quest through the repository, carrying what the person typed", async () => {
    const p = await proposeQuest(pool, propose());
    const r = await acceptQuestProposal(pool, quests, {
      id: p.ok ? p.id : "",
      decidedBy: "u1",
      reward: { gratitude: "50-100", stayCreditReward: 2, minStage: "contributor", requiresRole: null },
    });
    expect(r.ok).toBe(true);

    const [q] = await quests.all();
    expect(q.title).toBe("Clear the north swale");
    expect(q.gratitude).toBe("50-100");
    expect(q.stayCreditReward).toBe(2);
    expect(q.minStage).toBe("contributor");
    expect(q.status).toBe("Open");
    expect(q.isExample).toBe(false);

    // gratitude_min and gratitude_max are DERIVED by the repository's own save
    // path from the label, and are authored by nobody, admin included. This is
    // the invariant that comes for free by calling questsRepo.add instead of
    // writing a second insert.
    const [[row]] = await pool.query<any[]>( // module-review-ok: reading back the scratch schema this suite provisioned
      "SELECT gratitude_min, gratitude_max FROM quests WHERE id = ?",
      [r.ok ? r.questId : ""],
    );
    expect(Number(row.gratitude_min)).toBe(50);
    expect(Number(row.gratitude_max)).toBe(100);
  });

  it("writes the steward's edits and not the version that arrived", async () => {
    // Editing before accepting is the only path by which a proposal naming a
    // person can be redacted before it lands, so the edited text is what
    // reaches the board AND what is kept on the proposal row.
    const p = await proposeQuest(pool, propose());
    const r = await acceptQuestProposal(pool, quests, {
      id: p.ok ? p.id : "",
      decidedBy: "u1",
      reward: { gratitude: "50" },
      edits: { title: "Clear the north swale, with Ada", description: "Redacted by a steward." },
    });
    expect(r.ok).toBe(true);
    expect((await quests.all())[0].description).toBe("Redacted by a steward.");

    const [[stored]] = await pool.query<any[]>( // module-review-ok: same
      "SELECT description, status, created_ref FROM quest_proposals WHERE id = ?",
      [p.ok ? p.id : ""],
    );
    expect(stored.description).toBe("Redacted by a steward.");
    expect(stored.status).toBe("accepted");
    expect(stored.created_ref).toBe(r.ok ? r.questId : "");
  });

  it("refuses an accept that still carries an email address", async () => {
    const p = await proposeQuest(pool, propose());
    const r = await acceptQuestProposal(pool, quests, {
      id: p.ok ? p.id : "",
      decidedBy: "u1",
      reward: { gratitude: "50" },
      edits: { description: "ask ada@example.org" },
    });
    expect(r.ok).toBe(false);
    expect(await quests.all()).toHaveLength(0);
  });

  it("decides once: a second accept on the same proposal refuses", async () => {
    const p = await proposeQuest(pool, propose());
    const id = p.ok ? p.id : "";
    expect((await acceptQuestProposal(pool, quests, { id, decidedBy: "u1", reward: { gratitude: "50" } })).ok).toBe(true);
    const again = await acceptQuestProposal(pool, quests, { id, decidedBy: "u1", reward: { gratitude: "9999" } });
    expect(again.ok).toBe(false);
    expect(!again.ok && again.status).toBe(409);
    expect(await quests.all()).toHaveLength(1);
  });

  // ── THE VOLUME CAP ───────────────────────────────────────────────────────

  it("caps how many quests one batch may propose, and says so", async () => {
    // Seeding aspirational structure is on the platform's never-build list,
    // and a meeting extractor emitting quests per meeting is that machine.
    expect(questBatchCap(0)).toBe(3);
    expect(questBatchCap(12)).toBe(12);

    for (let i = 0; i < 3; i += 1) {
      const r = await proposeQuest(pool, propose({ batchCap: 3, prose: { title: `Quest ${i}` } }));
      expect(r.ok).toBe(true);
    }
    const over = await proposeQuest(pool, propose({ batchCap: 3, prose: { title: "One too many" } }));
    expect(over.ok).toBe(false);
    expect(!over.ok && over.error).toContain("cap of 3");
    expect(await questProposalQueue(pool)).toHaveLength(3);
  });

  it("is a no-op on a redelivery of the same proposed quest", async () => {
    const first = await proposeQuest(pool, propose());
    const again = await proposeQuest(pool, propose());
    expect(again.ok && again.outcome).toBe("duplicate");
    expect(again.ok && again.id).toBe(first.ok ? first.id : "");
    expect(await questProposalQueue(pool)).toHaveLength(1);
  });

  it("clips over-long prose instead of losing the proposal", async () => {
    // Same class as the external proposal inbox: strict MySQL refuses an
    // over-long string, so an unclipped vendor field is a lost record.
    const r = await proposeQuest(pool, propose({
      prose: {
        title: "T".repeat(400),
        subtitle: "S".repeat(900),
        duration: "D".repeat(300),
        circle: "C".repeat(400),
        description: "x".repeat(20_000),
      },
    }));
    expect(r.ok, !r.ok ? r.error : "").toBe(true);
    // Clipped to the width on `quests`, which is NARROWER than the one on
    // `quest_proposals` for four of these. Clipping to the table in front of
    // you lands the proposal and then throws at accept, which is the worst
    // place for it to happen. This test caught exactly that.
    const [row] = await questProposalQueue(pool);
    expect(row.prose.title.length).toBe(200);
    expect(row.prose.subtitle!.length).toBe(160);
    expect(row.prose.duration!.length).toBe(64);
    expect(row.prose.circle!.length).toBe(64);
  });

  it("clips again at ACCEPT, because a steward's edit never passes propose", async () => {
    const p = await proposeQuest(pool, propose());
    const r = await acceptQuestProposal(pool, quests, {
      id: p.ok ? p.id : "",
      decidedBy: "u1",
      reward: { gratitude: "50" },
      edits: { subtitle: "S".repeat(900), circle: "C".repeat(400) },
    });
    expect(r.ok, !r.ok ? r.error : "").toBe(true);
    const [q] = await quests.all();
    expect(q.subtitle!.length).toBe(160);
    expect(q.circle!.length).toBe(64);
  });

  it("REFUSES an over-long identifier rather than merging two batches", async () => {
    const r = await proposeQuest(pool, propose({ batchId: "b".repeat(70) }));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toContain("longer than 64 characters");
    expect(await questProposalQueue(pool)).toHaveLength(0);
  });

  it("drops a proposal carrying an email address before it is stored", async () => {
    const r = await proposeQuest(pool, propose({ prose: { title: "Ask ada@example.org about the swale" } }));
    expect(r.ok).toBe(false);
    expect(await questProposalQueue(pool)).toHaveLength(0);
  });
});
