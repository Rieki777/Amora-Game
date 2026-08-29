/**
 * Proposal drafts, proven against a real MySQL (S5 harness).
 *
 * The claim this file exists to hold is the harvest's one flagged upgrade over
 * Hypha's wizard: a draft SURVIVES THE BROWSER. There is no browser here, so
 * the honest proof is the same one at the storage layer: work written by one
 * session is read back whole, at the step it stopped, by a later read that
 * shares nothing with the write but a user id.
 *
 * Also proven: drafts are private in the SQL rather than by a caller's check,
 * the cap refuses the new draft instead of evicting an old one, and an update
 * against a draft that no longer exists keeps the typing rather than losing it.
 *
 * No TEST_DATABASE_URL: skips loudly, never passes hollowly (house rule).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { provisionTestDb, testDbConfigured, type TestDb } from "../db/testDb";
import { ALL_CAPABILITIES, DENIABLE } from "../../shared/capabilities";
import {
  CONDUCTABLE_TYPES,
  DRAFT_CAP,
  TYPE_CAPABILITY_REFUSALS,
  WIZARD_TYPES,
  deleteDraft,
  draftFor,
  draftProblem,
  draftsOf,
  saveDraft,
  typeRefusesCapability,
} from "./proposalDrafts";
import { ALL_CAPABILITIES } from "../../shared/capabilities";

const configured = testDbConfigured();

let db: TestDb;
let pool: mysql.Pool;
let n = 0;

/** A fresh member per case, so one case's cap never bites the next. */
const someone = () => `u-draft-${++n}`;

describe("draftProblem (pure)", () => {
  it("refuses a type the village does not know", () => {
    expect(draftProblem({ wizardType: "coup", payload: {}, stepIndex: 0 })).toContain("not a proposal type");
    expect(draftProblem({ wizardType: "mechanics", payload: {}, stepIndex: 0 })).toBeNull();
  });

  it("accepts every type the wizard config offers", () => {
    for (const t of WIZARD_TYPES) {
      expect(draftProblem({ wizardType: t, payload: {}, stepIndex: 0 }), t).toBeNull();
    }
  });

  it("refuses a payload that is not a set of fields", () => {
    expect(draftProblem({ wizardType: "mechanics", payload: "a string", stepIndex: 0 })).toBeTruthy();
    expect(draftProblem({ wizardType: "mechanics", payload: ["a", "list"], stepIndex: 0 })).toBeTruthy();
    expect(draftProblem({ wizardType: "mechanics", payload: null, stepIndex: 0 })).toBeTruthy();
  });

  it("refuses a step index that could not be a step", () => {
    expect(draftProblem({ wizardType: "mechanics", payload: {}, stepIndex: -1 })).toBeTruthy();
    expect(draftProblem({ wizardType: "mechanics", payload: {}, stepIndex: 1.5 })).toBeTruthy();
    expect(draftProblem({ wizardType: "mechanics", payload: {}, stepIndex: "two" })).toBeTruthy();
  });

  it("refuses a payload that has outgrown the wizard", () => {
    const huge = { body: "x".repeat(70_000) };
    expect(draftProblem({ wizardType: "agreement", payload: huge, stepIndex: 0 })).toContain("outgrown");
  });
});

/**
 * RULING 2 OF THE HANDOVER SPEC, PINNED.
 *
 * The badge review asked that `badge_grant` refuse `ballot.vote` and
 * `member.vouch`, arguing that "an electorate that can vote to hand
 * ballot.vote to chosen people is an electorate that can vote to enlarge
 * itself, one ballot at a time." R54 makes the ARGUMENT wrong and leaves the
 * CONCLUSION right, and getting that backwards in either direction breaks
 * something real:
 *
 *  - Put the refusal on the transfer type too, and the handover freezes.
 *    `ballot.vote` and `member.vouch` are exactly the powers a village most
 *    wants to hold, and a village that may never ask for them has been told
 *    its own electorate is not its business.
 *  - Take the refusal off `badge_grant`, and three named individuals can be
 *    handed the vote by one ballot, which is capture wearing the village's
 *    clothes: a small group choosing who else gets a say.
 *
 * The distinction is people versus powers, and this suite is where it is
 * held, because it is a two-line change to get it wrong and nothing else in
 * the tree would notice.
 */
describe("which capability keys a proposal type may name", () => {
  it("badge_grant refuses the governance keys, because a badge names PEOPLE", () => {
    expect(typeRefusesCapability("badge_grant", "ballot.vote")).toBeTruthy();
    expect(typeRefusesCapability("badge_grant", "member.vouch")).toBeTruthy();
  });

  it("...and the transfer type permits both, because it names a POWER", () => {
    expect(typeRefusesCapability("power_transfer", "ballot.vote")).toBeNull();
    expect(typeRefusesCapability("power_transfer", "member.vouch")).toBeNull();
    // Nothing else is refused there either. The transfer type's list is empty
    // and that is the design, so a key added to it later is a deliberate act.
    for (const cap of ALL_CAPABILITIES) {
      expect(typeRefusesCapability("power_transfer", cap), cap).toBeNull();
    }
  });

  it("names only capabilities this platform has, so a typo cannot be a silent no-op", () => {
    for (const [type, entry] of Object.entries(TYPE_CAPABILITY_REFUSALS)) {
      for (const key of entry?.keys ?? []) {
        expect(ALL_CAPABILITIES, `${type} refuses ${key}`).toContain(key);
      }
    }
  });

  it("says WHY in the sentence it refuses with, and the reason travels with the keys", () => {
    const why = typeRefusesCapability("badge_grant", "ballot.vote") ?? "";
    // The sentence a member reads has to say what they CAN do instead, or a
    // refusal on a governance key reads as the platform closing a door R54
    // says is the destination.
    expect(why).toContain("power transfer");
    expect(why.length).toBeGreaterThan(60);
    // A type with no entry refuses nothing at all.
    expect(typeRefusesCapability("mechanics", "ballot.vote")).toBeNull();
    expect(typeRefusesCapability("not_a_type", "ballot.vote")).toBeNull();
  });

  it("keeps the transfer type conductable, so the wizard is not walking members at a wall", () => {
    // The badge_grant cautionary tale in one assertion: full client config,
    // working pickers, a SUBJECT_NOUN entry, and no route. A type that cannot
    // be published belongs in the advisory list and says so on its card.
    expect(CONDUCTABLE_TYPES).toContain("power_transfer");
    expect(CONDUCTABLE_TYPES).not.toContain("badge_grant");
  });
});

describe.skipIf(!configured)("proposal drafts (MySQL)", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 8 }); // module-review-ok: the S5 scratch-schema harness pool, the crews.test.ts shape
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  it("a draft written in one session is read back whole, at its step", async () => {
    const me = someone();
    const written = await saveDraft(pool, {
      userId: me,
      wizardType: "role_application",
      payload: { seatId: "seat-water", deliverables: "The spring runs clear by season's end.", commitmentPct: 40 },
      stepIndex: 2,
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    // Nothing survives between these two lines but the id and the user id:
    // this is the localStorage upgrade, proven where it actually lives.
    const later = await draftFor(pool, written.draft.id, me);
    expect(later).toBeTruthy();
    expect(later!.stepIndex).toBe(2);
    expect(later!.wizardType).toBe("role_application");
    expect(later!.payload.deliverables).toBe("The spring runs clear by season's end.");
    expect(later!.payload.commitmentPct).toBe(40);
  });

  it("a draft is private in the query, so another member's id finds nothing", async () => {
    const me = someone();
    const stranger = someone();
    const written = await saveDraft(pool, {
      userId: me,
      wizardType: "agreement",
      payload: { title: "Quiet hours" },
      stepIndex: 0,
    });
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    expect(await draftFor(pool, written.draft.id, stranger)).toBeNull();
    expect(await draftsOf(pool, stranger)).toHaveLength(0);
    // And a stranger's delete is a miss, not a deletion.
    expect(await deleteDraft(pool, written.draft.id, stranger)).toBe(false);
    expect(await draftFor(pool, written.draft.id, me)).toBeTruthy();
  });

  it("saving again updates the same row rather than making a second draft", async () => {
    const me = someone();
    const first = await saveDraft(pool, {
      userId: me,
      wizardType: "mechanics",
      payload: { title: "Longer sensing" },
      stepIndex: 0,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.created).toBe(true);

    const second = await saveDraft(pool, {
      id: first.draft.id,
      userId: me,
      wizardType: "mechanics",
      payload: { title: "Longer sensing", rationale: "More time to weigh in." },
      stepIndex: 3,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.created).toBe(false);
    expect(second.draft.id).toBe(first.draft.id);
    expect(second.draft.stepIndex).toBe(3);
    expect(await draftsOf(pool, me)).toHaveLength(1);
  });

  it("the cap refuses the new draft and keeps every old one", async () => {
    const me = someone();
    for (let i = 0; i < DRAFT_CAP; i++) {
      const r = await saveDraft(pool, { userId: me, wizardType: "mechanics", payload: { n: i }, stepIndex: 0 });
      expect(r.ok, `draft ${i}`).toBe(true);
    }
    const over = await saveDraft(pool, { userId: me, wizardType: "mechanics", payload: { n: 99 }, stepIndex: 0 });
    expect(over.ok).toBe(false);
    if (over.ok) return;
    expect(over.error).toContain("limit");
    // Nothing was evicted: the oldest draft is the one somebody meant to
    // come back to, so the cap refuses the new work, never the old.
    expect(await draftsOf(pool, me)).toHaveLength(DRAFT_CAP);
  });

  it("saving against a draft that is gone keeps the typing", async () => {
    const me = someone();
    const first = await saveDraft(pool, { userId: me, wizardType: "quest_payout", payload: { a: 1 }, stepIndex: 1 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(await deleteDraft(pool, first.draft.id, me)).toBe(true);

    const orphan = await saveDraft(pool, {
      id: first.draft.id,
      userId: me,
      wizardType: "quest_payout",
      payload: { a: 1, b: 2 },
      stepIndex: 2,
    });
    expect(orphan.ok).toBe(true);
    if (!orphan.ok) return;
    expect(orphan.created).toBe(true);
    expect(orphan.draft.payload.b).toBe(2);
  });

  it("my drafts come back newest-touched first", async () => {
    const me = someone();
    const a = await saveDraft(pool, { userId: me, wizardType: "mechanics", payload: { k: "a" }, stepIndex: 0 });
    const b = await saveDraft(pool, { userId: me, wizardType: "agreement", payload: { k: "b" }, stepIndex: 0 });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    // A second's worth of clock, because updated_at is datetime precision and
    // an ordering test that races the clock is a flake waiting to be filed.
    await pool.query("UPDATE proposal_drafts SET updated_at = DATE_ADD(NOW(), INTERVAL 5 SECOND) WHERE id = ?", [a.draft.id]); // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
    const mine = await draftsOf(pool, me);
    expect(mine.map((d) => d.id)).toEqual([a.draft.id, b.draft.id]);
  });

  it("a bad wizard type never reaches the table", async () => {
    const me = someone();
    const bad = await saveDraft(pool, { userId: me, wizardType: "coup", payload: {}, stepIndex: 0 });
    expect(bad.ok).toBe(false);
    expect(await draftsOf(pool, me)).toHaveLength(0);
  });
});

/**
 * THE TWO KEYS THAT MAKE AN ELECTORATE, SAID TWICE, PINNED ONCE.
 *
 * This file's `TYPE_CAPABILITY_REFUSALS` and `shared/capabilities.ts`'s
 * `DENIABLE` were written months apart, by different lanes, for different
 * reasons, and they arrived at the same pair. The runway refuses a badge
 * grant naming `ballot.vote` or `member.vouch` because handing a voice to
 * named individuals is a few members choosing who else gets a say. `DENIABLE`
 * refuses a warning badge TAKING either, because a voice that was earned is
 * never taken away (R65/R66, 0109). Two directions, one line.
 *
 * Two statements of one fact drift. Neither is wrong today, and a later lane
 * adding a third voice key to one of them would leave the other quietly
 * behind, so the agreement is asserted rather than admired.
 */
describe("the badge-grant refusal and the deny map name the same voice keys", () => {
  it("agrees key for key", () => {
    const refusedByTheRunway = [...(TYPE_CAPABILITY_REFUSALS.badge_grant?.keys ?? [])].sort();
    const notDeniable = ALL_CAPABILITIES.filter((c) => !DENIABLE[c]).sort();
    expect(refusedByTheRunway.length, "the runway refuses nothing, so this proves nothing").toBeGreaterThan(0);
    expect(notDeniable).toEqual(refusedByTheRunway);
  });

  it("and the pair really is the vote and the vouch", () => {
    // Named outright, so renaming a key cannot make the agreement above hold
    // over a pair nobody intended.
    expect([...(TYPE_CAPABILITY_REFUSALS.badge_grant?.keys ?? [])].sort()).toEqual([
      "ballot.vote",
      "member.vouch",
    ]);
  });
});
