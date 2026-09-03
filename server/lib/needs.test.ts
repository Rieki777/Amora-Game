/**
 * The needs scope, against a real schema.
 *
 * WHY A DATABASE AND NOT A STUB POOL. Four of the things worth proving here
 * are properties of the SCHEMA and not of this file's TypeScript: that the
 * unique key makes a second tick of the same box an update, that retiring
 * leaves `need_links` alone, that the derived reads join to `org_roles` and
 * `org_role_assignments` the way the settlement does, and that migration 0149
 * applied twice does nothing the second time. A stub pool would prove the
 * stub.
 *
 * THE DECK IS QUOTED IN THE ASSERTIONS. The taxonomy in shared/needs.ts is a
 * transcription of a slide, and a transcription is exactly the kind of thing
 * that drifts one word at a time. Every row asserted below carries the deck's
 * own line beside it in a comment, from `PART 2 NEEDS`, second pass.
 */
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { applyPending } from "../db/migrate";
import { provisionTestDb, testDbConfigured, type TestDb } from "../db/testDb";
import {
  CUSTOM_NEED_PREFIX,
  HUMAN_NEEDS,
  HUMAN_NEEDS_BY_ID,
  NEED_DEPTHS,
  NEED_DEPTH_LABELS,
  customNeedKey,
  depthAtLeast,
  expressionsLine,
  isPlatformNeedKey,
  needKeyProblem,
  needLabelFor,
} from "../../shared/needs";
import {
  coverageReport,
  linkNeed,
  linksForNeed,
  linksForSubject,
  needSeatings,
  needsCoverage,
  readScope,
  retireNeed,
  reviveNeed,
  scopeProblem,
  scopeSummary,
  unlinkNeed,
  unlinkSubject,
  upsertScopeNeed,
} from "./needs";

/* ========================================================================== *
 * The taxonomy. No database needed, so these run everywhere.
 * ========================================================================== */

/**
 * The deck's own table, second pass, transcribed here and nowhere else in the
 * test. Each row is `[id, label, expressions line]` and the third field is the
 * slide's cell CHARACTER FOR CHARACTER, trailing "etc" included.
 */
const DECK: Array<[string, string, string]> = [
  ["vitality", "Vitality & Survival Needs", "Clean Air, Organic Food, Living Water, Exercise, Natural Shelter, etc"],
  ["significance", "Significance", "Self-Expression, Meaning, Validation, Feeling Wanted, Purpose, etc"],
  [
    "love",
    "Love",
    "Connection, Communication, Intimacy, Interdependence, Authentic Community, Family, etc",
  ],
  ["growth", "Growth", "Physical, Emotional, Intellectual and Spiritual Development, etc"],
  [
    "contribution",
    "Contribution",
    "Effectiveness, To Give, Care, and Serve an Idea Greater Than Myself, etc",
  ],
  ["routine", "Routine", "Consistency, Stability, Grounding, etc"],
  ["diversity", "Diversity", "Variety, Adventure, Challenge, Surprise, etc"],
  ["autonomy", "Autonomy", "Freedom, Space, Independence, etc"],
  ["play", "Play", "Joy, Humor, Passion, Creativity, etc"],
  ["honesty", "Honesty", "Authenticity, Integrity, Presence, etc"],
];

describe("the ten needs are the deck's ten needs", () => {
  it("has exactly ten, in the deck's order", () => {
    expect(HUMAN_NEEDS.map((n) => n.id)).toEqual(DECK.map((d) => d[0]));
  });

  it.each(DECK)("%s reads back as the deck wrote it", (id, label, line) => {
    const need = HUMAN_NEEDS_BY_ID[id];
    expect(need, `no need with id ${id}`).toBeTruthy();
    expect(need.label).toBe(label);
    // The array is the source; the line is derived from it. Asserting the
    // derived line is what makes this a word-for-word check rather than a
    // check that two transcriptions of the same slide agree with each other.
    expect(expressionsLine(need)).toBe(line);
  });

  it("keeps the deck's open-ended 'etc' on every row", () => {
    // The slide ends every expression list with it. Dropping it would turn an
    // open list into a closed one, which is a different claim about the need.
    for (const need of HUMAN_NEEDS) {
      expect(need.expressions.at(-1)).toBe("etc");
    }
  });

  it("gives every need its own id and its own hue", () => {
    expect(new Set(HUMAN_NEEDS.map((n) => n.id)).size).toBe(10);
    expect(new Set(HUMAN_NEEDS.map((n) => n.hue)).size).toBe(10);
  });

  it("runs the depth ladder lowest first, so an index comparison is the ordering", () => {
    // The deck prints it top to bottom, Thriving first. Reversed here on
    // purpose: "at the Satisfied level or better" is an index comparison.
    expect([...NEED_DEPTHS]).toEqual(["deprived", "unmet", "alive", "satisfied", "thriving"]);
    expect(depthAtLeast("thriving", "satisfied")).toBe(true);
    expect(depthAtLeast("satisfied", "satisfied")).toBe(true);
    expect(depthAtLeast("alive", "satisfied")).toBe(false);
    expect(Object.values(NEED_DEPTH_LABELS)).toEqual(["Deprived", "Unmet", "Alive", "Satisfied", "Thriving"]);
  });
});

describe("a custom need can never take a platform id", () => {
  it.each(HUMAN_NEEDS.map((n) => n.id))("refuses a bare platform id as a village's own need: %s", (id) => {
    // A bare platform id is legal as an ADOPTION of that need. What is refused
    // is the village claiming that id for a need of its own, which it would do
    // by sending it with a custom prefix or by sending an unprefixed word that
    // is not on the list.
    expect(needKeyProblem(id)).toBeNull();
    expect(needKeyProblem(`${CUSTOM_NEED_PREFIX}${id}`)).toContain("one of the ten needs");
  });

  it("refuses an unprefixed word that is not one of the ten", () => {
    expect(needKeyProblem("childcare")).toContain("not one of the ten needs");
  });

  it("slugs a typed name into the custom space, and never onto a platform id", () => {
    expect(customNeedKey("Childcare")).toBe("custom:childcare");
    expect(customNeedKey("  Elder Care!  ")).toBe("custom:elder-care");
    // The prefix carries a colon, which appears in no platform id, so the two
    // key spaces cannot collide however a village names its need.
    expect(customNeedKey("Love")).toBe("custom:love");
    expect(isPlatformNeedKey(customNeedKey("Love"))).toBe(false);
  });

  it("clips a very long name so the key fits varchar(64)", () => {
    const key = customNeedKey("a".repeat(200));
    expect(key.length).toBeLessThanOrEqual(64);
    expect(needKeyProblem(key)).toBeNull();
  });

  it("never produces an empty key", () => {
    expect(customNeedKey("!!!")).toBe("custom:unnamed");
  });

  it("copies the platform label at adoption, and takes the typed one for a custom need", () => {
    expect(needLabelFor("play")).toBe("Play");
    expect(needLabelFor("play", "Fun")).toBe("Fun");
    expect(needLabelFor("custom:childcare")).toBe("childcare");
    expect(needLabelFor("custom:childcare", "Childcare")).toBe("Childcare");
  });

  it("asks a custom need for a label of its own", () => {
    expect(scopeProblem({ needKey: "custom:childcare" })).toContain("label of its own");
    expect(scopeProblem({ needKey: "custom:childcare", label: "Childcare" })).toBeNull();
    expect(scopeProblem({ needKey: "play" })).toBeNull();
  });

  it("refuses a breadth outside 0 to 100 by name, and never rounds it quietly", () => {
    expect(scopeProblem({ needKey: "play", breadthTargetPct: 400 })).toContain("0 to 100");
    expect(scopeProblem({ needKey: "play", breadthTargetPct: -1 })).toContain("0 to 100");
    expect(scopeProblem({ needKey: "play", breadthTargetPct: 0 })).toBeNull();
  });
});

describe("an empty scope and a scope of zero are different facts", () => {
  it("says a village that has answered nothing has not answered", () => {
    const s = scopeSummary([]);
    expect(s.answered).toBe(false);
    expect(s.adopted).toBe(0);
    expect(s.deepestTarget).toBeNull();
  });

  it("says a village whose every need is retired HAS answered, and adopted none", () => {
    const s = scopeSummary([
      {
        id: "n1", needKey: "play", label: "Play", isCustom: false, depthTarget: "alive",
        breadthTargetPct: 100, note: null, sortOrder: 0, adoptedAt: new Date(),
        retiredAt: new Date(), active: false,
      },
    ]);
    expect(s.answered).toBe(true);
    expect(s.adopted).toBe(0);
    expect(s.retired).toBe(1);
  });
});

/* ========================================================================== *
 * The store, against a scratch schema.
 * ========================================================================== */

const configured = testDbConfigured();

describe.skipIf(!configured)("the needs store", () => {
  let db: TestDb;
  let pool: mysql.Pool;

  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 4 });
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM `need_links`");
    await pool.query("DELETE FROM `village_needs`");
    await pool.query("DELETE FROM `org_role_assignments`");
    await pool.query("DELETE FROM `org_roles`");
  });

  /** A seat with `seats` places, the way org_roles declares one. */
  const seat = async (id: string, name: string, seats = 1) => {
    await pool.query("INSERT INTO `org_roles` (`id`, `name`, `seats`, `active`) VALUES (?,?,?,1)", [id, name, seats]);
  };

  /** A live seating. `ended_at IS NULL` is what the settlement calls held. */
  const seatedBy = async (roleId: string, holder: string) => {
    await pool.query(
      "INSERT INTO `org_role_assignments` (`id`, `org_role_id`, `holder_kind`, `display_name`, `holder_key`) " +
        "VALUES (?,?, 'documented', ?, ?)",
      [`asg-${roleId}-${holder}`, roleId, holder, `doc:${holder}`],
    );
  };

  describe("migration 0149 is safe to apply twice", () => {
    it("applies nothing the second time and leaves the schema alone", async () => {
      const schema = new URL(db.url).pathname.replace("/", "");
      const shapeOf = async () => {
        const [cols] = await db.conn.query<any[]>(
          "SELECT TABLE_NAME, ORDINAL_POSITION, COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_DEFAULT, EXTRA " +
            "FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('village_needs','need_links') " +
            "ORDER BY TABLE_NAME, ORDINAL_POSITION",
          [schema],
        );
        const [idx] = await db.conn.query<any[]>(
          "SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, SEQ_IN_INDEX, COLUMN_NAME " +
            "FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('village_needs','need_links') " +
            "ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX",
          [schema],
        );
        return { cols, idx };
      };

      const before = await shapeOf();
      // Both tables exist and carry the columns the store writes.
      expect(before.cols.map((c: any) => `${c.TABLE_NAME}.${c.COLUMN_NAME}`)).toContain("village_needs.retired_at");
      expect(before.cols.map((c: any) => `${c.TABLE_NAME}.${c.COLUMN_NAME}`)).toContain("need_links.subject_ref");
      // No `active` column: whether a need is in scope is derived from
      // retired_at, and two columns for one fact is how a row comes to be
      // active and retired at once.
      expect(before.cols.map((c: any) => `${c.TABLE_NAME}.${c.COLUMN_NAME}`)).not.toContain("village_needs.active");

      const again = await applyPending(db.conn);
      expect(again.failed).toBeNull();
      expect(again.applied, "a second run applies nothing").toEqual([]);
      expect(again.skipped).toContain("0149_a_village_says_what_it_is_for.sql");
      expect(await shapeOf()).toEqual(before);
    }, 120_000);

    it("has no foreign keys, the house norm for this schema", async () => {
      const schema = new URL(db.url).pathname.replace("/", "");
      const [fks] = await db.conn.query<any[]>(
        "SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS " +
          "WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('village_needs','need_links') AND CONSTRAINT_TYPE = 'FOREIGN KEY'",
        [schema],
      );
      expect(fks).toEqual([]);
    });
  });

  describe("taking on a need", () => {
    it("saves a platform need with the taxonomy's own label", async () => {
      const r = await upsertScopeNeed(pool, { needKey: "play" });
      expect(r.ok).toBe(true);
      const scope = await readScope(pool);
      expect(scope).toHaveLength(1);
      expect(scope[0].label).toBe("Play");
      expect(scope[0].isCustom).toBe(false);
      expect(scope[0].depthTarget).toBe("satisfied");
      expect(scope[0].breadthTargetPct).toBe(100);
      expect(scope[0].active).toBe(true);
    });

    it("ticking the same box twice is one row, not two", async () => {
      await upsertScopeNeed(pool, { needKey: "play", depthTarget: "alive" });
      await upsertScopeNeed(pool, { needKey: "play", depthTarget: "thriving" });
      const scope = await readScope(pool);
      expect(scope).toHaveLength(1);
      expect(scope[0].depthTarget).toBe("thriving");
    });

    it("keeps a village's own words for a custom need", async () => {
      const r = await upsertScopeNeed(pool, {
        needKey: customNeedKey("Childcare"),
        label: "Childcare",
        note: "The four families with children.",
        breadthTargetPct: 30,
      });
      expect(r.ok).toBe(true);
      const scope = await readScope(pool);
      expect(scope[0].needKey).toBe("custom:childcare");
      expect(scope[0].isCustom).toBe(true);
      expect(scope[0].breadthTargetPct).toBe(30);
      expect(scope[0].note).toBe("The four families with children.");
    });

    it("refuses a custom need that tries to be a platform need", async () => {
      const r = await upsertScopeNeed(pool, { needKey: "custom:love", label: "Love" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.problem).toContain("one of the ten needs");
      expect(await readScope(pool)).toEqual([]);
    });

    it("orders the ten in the deck's order without being told to", async () => {
      for (const id of ["honesty", "vitality", "play"]) await upsertScopeNeed(pool, { needKey: id });
      expect((await readScope(pool)).map((r) => r.needKey)).toEqual(["vitality", "play", "honesty"]);
    });
  });

  describe("retiring a need", () => {
    it("keeps its links, and keeps the row readable for a frozen snapshot", async () => {
      await upsertScopeNeed(pool, { needKey: "play" });
      await linkNeed(pool, { needKey: "play", subjectType: "quest", subjectRef: "q-solstice" });
      await linkNeed(pool, { needKey: "play", subjectType: "role", subjectRef: "r-festival" });

      const r = await retireNeed(pool, "play");
      expect(r.found).toBe(true);
      expect(r.changed).toBe(true);

      // Out of the live scope.
      expect(await readScope(pool)).toEqual([]);
      // Still readable, so a health snapshot keyed needs_met_play has a label
      // and a depth target to render against.
      const all = await readScope(pool, { includeRetired: true });
      expect(all).toHaveLength(1);
      expect(all[0].label).toBe("Play");
      expect(all[0].active).toBe(false);
      // AND ITS LINKS ARE STILL THERE.
      expect(await linksForNeed(pool, "play")).toHaveLength(2);
    });

    it("retiring twice never moves the timestamp", async () => {
      await upsertScopeNeed(pool, { needKey: "play" });
      const first = await retireNeed(pool, "play");
      const second = await retireNeed(pool, "play");
      expect(second.found).toBe(true);
      expect(second.changed).toBe(false);
      expect(second.row?.retiredAt?.getTime()).toBe(first.row?.retiredAt?.getTime());
    });

    it("ticking the box again brings it back with its links intact", async () => {
      await upsertScopeNeed(pool, { needKey: "play" });
      await linkNeed(pool, { needKey: "play", subjectType: "quest", subjectRef: "q-solstice" });
      await retireNeed(pool, "play");
      const back = await upsertScopeNeed(pool, { needKey: "play", depthTarget: "thriving" });
      expect(back.ok).toBe(true);
      const scope = await readScope(pool);
      expect(scope).toHaveLength(1);
      expect(scope[0].retiredAt).toBeNull();
      expect(await linksForNeed(pool, "play")).toHaveLength(1);
    });

    it("reviveNeed does the same thing without changing what was said", async () => {
      await upsertScopeNeed(pool, { needKey: "play", depthTarget: "alive", note: "Solstice." });
      await retireNeed(pool, "play");
      const row = await reviveNeed(pool, "play");
      expect(row?.active).toBe(true);
      expect(row?.depthTarget).toBe("alive");
      expect(row?.note).toBe("Solstice.");
    });

    it("refuses to retire a need this village never took on", async () => {
      expect((await retireNeed(pool, "play")).found).toBe(false);
    });
  });

  describe("tagging a thing as meeting a need", () => {
    it("lets one quest meet three needs", async () => {
      for (const id of ["vitality", "contribution", "play"]) await upsertScopeNeed(pool, { needKey: id });
      for (const id of ["vitality", "contribution", "play"]) {
        await linkNeed(pool, { needKey: id, subjectType: "quest", subjectRef: "q-food-forest" });
      }
      const met = await linksForSubject(pool, "quest", "q-food-forest");
      expect(met.map((m) => m.needKey)).toEqual(["vitality", "contribution", "play"]);
      expect(met.every((m) => m.needActive)).toBe(true);
    });

    it("tagging the same thing twice updates the weight and never doubles the count", async () => {
      await upsertScopeNeed(pool, { needKey: "play" });
      await linkNeed(pool, { needKey: "play", subjectType: "quest", subjectRef: "q-solstice" });
      await linkNeed(pool, { needKey: "play", subjectType: "quest", subjectRef: "q-solstice", weight: "partial" });
      const links = await linksForNeed(pool, "play");
      expect(links).toHaveLength(1);
      expect(links[0].weight).toBe("partial");
    });

    it("refuses a link onto a need this village has not taken on", async () => {
      const r = await linkNeed(pool, { needKey: "play", subjectType: "quest", subjectRef: "q-solstice" });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.problem).toContain("has not taken on");
    });

    it("clears every tag when the thing itself goes, which is the reconciler", async () => {
      for (const id of ["vitality", "play"]) await upsertScopeNeed(pool, { needKey: id });
      for (const id of ["vitality", "play"]) {
        await linkNeed(pool, { needKey: id, subjectType: "quest", subjectRef: "q-gone" });
      }
      expect(await unlinkSubject(pool, "quest", "q-gone")).toBe(2);
      expect(await linksForSubject(pool, "quest", "q-gone")).toEqual([]);
    });

    it("unlinking one tag leaves the others", async () => {
      await upsertScopeNeed(pool, { needKey: "play" });
      const a = await linkNeed(pool, { needKey: "play", subjectType: "quest", subjectRef: "q-a" });
      await linkNeed(pool, { needKey: "play", subjectType: "quest", subjectRef: "q-b" });
      expect(a.ok).toBe(true);
      if (a.ok) expect(await unlinkNeed(pool, a.row.id)).toBe(true);
      expect((await linksForNeed(pool, "play")).map((l) => l.subjectRef)).toEqual(["q-b"]);
      expect(await unlinkNeed(pool, "no-such-link")).toBe(false);
    });
  });

  describe("the coverage read names a need with nothing meeting it", () => {
    it("names Play and Honesty when only the others are tagged", async () => {
      for (const id of ["vitality", "play", "honesty"]) await upsertScopeNeed(pool, { needKey: id });
      await linkNeed(pool, { needKey: "vitality", subjectType: "quest", subjectRef: "q-well" });
      const rows = await needsCoverage(pool);
      expect(rows.map((r) => r.needKey)).toEqual(["vitality", "play", "honesty"]);
      expect(rows.filter((r) => r.uncovered).map((r) => r.needKey)).toEqual(["play", "honesty"]);
      const vitality = rows.find((r) => r.needKey === "vitality");
      expect(vitality?.counts.quest).toBe(1);
      expect(vitality?.counts.role).toBe(0);
      expect(vitality?.primaryCount).toBe(1);
    });

    it("a need met only by a partial tag is covered, and its primary count is zero", async () => {
      await upsertScopeNeed(pool, { needKey: "play" });
      await linkNeed(pool, { needKey: "play", subjectType: "stay", subjectRef: "s-1", weight: "partial" });
      const [row] = await needsCoverage(pool);
      expect(row.uncovered).toBe(false);
      expect(row.total).toBe(1);
      expect(row.primaryCount).toBe(0);
    });

    it("a retired need is not counted as uncovered, because it is not in scope", async () => {
      for (const id of ["play", "honesty"]) await upsertScopeNeed(pool, { needKey: id });
      await retireNeed(pool, "honesty");
      expect((await needsCoverage(pool)).map((r) => r.needKey)).toEqual(["play"]);
    });

    it("an unanswered village gets an empty report that says it is unanswered", async () => {
      const report = await coverageReport(pool);
      expect(report.answered).toBe(false);
      expect(report.coverage).toEqual([]);
      expect(report.uncovered).toEqual([]);
    });
  });

  describe("roles needed, of roles filled", () => {
    it("names a role the scope leans on that nobody is in", async () => {
      await upsertScopeNeed(pool, { needKey: "vitality" });
      await seat("r-water", "Water Steward", 1);
      await seat("r-compost", "Compost Steward", 2);
      await seatedBy("r-compost", "ada");
      await linkNeed(pool, { needKey: "vitality", subjectType: "role", subjectRef: "r-water" });
      await linkNeed(pool, { needKey: "vitality", subjectType: "role", subjectRef: "r-compost" });

      const [row] = await needSeatings(pool);
      expect(row.needKey).toBe("vitality");
      // Three seats across the two roles, one of them held.
      expect(row.seatsNeeded).toBe(3);
      expect(row.seatsFilled).toBe(1);
      expect(row.rolesWithNobodyInThem.map((r) => r.name)).toEqual(["Water Steward"]);
    });

    it("counts a seating as held on the same clause the settlement uses", async () => {
      await upsertScopeNeed(pool, { needKey: "vitality" });
      await seat("r-water", "Water Steward", 1);
      await seatedBy("r-water", "ada");
      await linkNeed(pool, { needKey: "vitality", subjectType: "role", subjectRef: "r-water" });
      expect((await needSeatings(pool))[0].seatsFilled).toBe(1);

      // The settlement calls a seating live while `ended_at IS NULL`. Ending
      // it must empty the seat here too, or a needs screen and a payout
      // disagree about what a held seat is.
      await pool.query("UPDATE `org_role_assignments` SET `ended_at` = NOW() WHERE `org_role_id` = 'r-water'");
      const [after] = await needSeatings(pool);
      expect(after.seatsFilled).toBe(0);
      expect(after.rolesWithNobodyInThem.map((r) => r.name)).toEqual(["Water Steward"]);
    });

    it("ignores a role the village has switched off", async () => {
      await upsertScopeNeed(pool, { needKey: "vitality" });
      await seat("r-old", "Retired Steward", 1);
      await pool.query("UPDATE `org_roles` SET `active` = 0 WHERE `id` = 'r-old'");
      await linkNeed(pool, { needKey: "vitality", subjectType: "role", subjectRef: "r-old" });
      const [row] = await needSeatings(pool);
      expect(row.seatsNeeded).toBe(0);
      expect(row.rolesWithNobodyInThem).toEqual([]);
    });

    it("a seat held by more people than it advertises still fills that seat once", async () => {
      await upsertScopeNeed(pool, { needKey: "vitality" });
      await seat("r-water", "Water Steward", 1);
      await seatedBy("r-water", "ada");
      await seatedBy("r-water", "bo");
      await linkNeed(pool, { needKey: "vitality", subjectType: "role", subjectRef: "r-water" });
      const [row] = await needSeatings(pool);
      expect(row.seatsNeeded).toBe(1);
      expect(row.seatsFilled).toBe(1);
    });

    it("a need with no role linked reports zero of zero and no vacancy", async () => {
      await upsertScopeNeed(pool, { needKey: "play" });
      await linkNeed(pool, { needKey: "play", subjectType: "quest", subjectRef: "q-solstice" });
      const [row] = await needSeatings(pool);
      expect(row.seatsNeeded).toBe(0);
      expect(row.seatsFilled).toBe(0);
      expect(row.rolesWithNobodyInThem).toEqual([]);
    });
  });

  describe("the whole report", () => {
    it("says what the summary screen says, and the honest half underneath", async () => {
      for (const id of ["vitality", "significance", "love", "growth", "contribution", "routine", "diversity"]) {
        await upsertScopeNeed(pool, { needKey: id, depthTarget: "satisfied" });
      }
      await upsertScopeNeed(pool, { needKey: "play", depthTarget: "thriving" });
      await upsertScopeNeed(pool, { needKey: "honesty" });
      await linkNeed(pool, { needKey: "vitality", subjectType: "quest", subjectRef: "q-well" });

      const report = await coverageReport(pool);
      expect(report.answered).toBe(true);
      expect(report.summary.adopted).toBe(9);
      expect(report.summary.customAdopted).toBe(0);
      expect(report.summary.deepestTarget).toBe("thriving");
      expect(report.uncovered).toContain("play");
      expect(report.uncovered).toContain("honesty");
      expect(report.uncovered).toHaveLength(8);
    });
  });
});
