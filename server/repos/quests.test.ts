/**
 * Tests for the quests + claims repositories, story layer included (0068).
 *
 * The story layer shipped with the write path widened from 18 columns to 25
 * and with two new aggregate queries behind the public life-signs endpoint,
 * and none of it had a test. A miscounted placeholder, a column written out of
 * order, or an example row leaking into a public count would all have passed
 * every gate, because nothing exercised this code.
 *
 * The round-trip cases below are deliberately written from the COLUMN LIST
 * rather than from the code that writes it: each one asserts a field survives
 * insert, select, and a mutation of some other field.
 *
 * Runs against the S5 harness: a scratch schema with every real migration
 * applied. No TEST_DATABASE_URL → the suite skips loudly (harness rule).
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mysql from "mysql2/promise";
import { claimsRepo, questsRepo, type ClaimsRepo, type QuestRecord, type QuestsRepo } from "./quests";
import { usersRepo, type UsersRepo } from "./users";
import { provisionTestDb, testDbConfigured, type TestDb } from "../db/testDb";

const configured = testDbConfigured();

let db: TestDb;
let pool: mysql.Pool;
let quests: QuestsRepo;
let claims: ClaimsRepo;
let users: UsersRepo;

const quest = (over: Partial<QuestRecord> = {}): QuestRecord => ({
  id: "q-test",
  title: "A test quest",
  gratitude: "50-100",
  status: "Open",
  tags: [],
  order: 1,
  ...over,
});

const storied = (id: string): QuestRecord =>
  quest({
    id,
    title: "Welcome the newcomers",
    subtitle: "Be the first hello somebody remembers.",
    description: "Greet arrivals and help them find their feet.",
    impact: "A welcomed visitor often becomes a member.",
    story: "Most people decide how they feel about a place in the first hour.",
    firstStep: "Introduce yourself to one person you have never met.",
    steps: ["Arrive early", "Learn three names", "Walk them to the kitchen"],
    deliverable: "A few words about who you welcomed.",
    tips: ["Ask what brought them", "Water first, questions later"],
    imageUrl: "/api/uploads/quest-01.webp",
    duration: "2 hours",
    difficulty: "Beginner",
    circle: "Community Development",
    icon: "Users",
    roleRequired: "A warm face",
    minStage: "member",
    requiresRole: "greeter",
    stayCreditReward: 2,
    tags: ["welcome", "people"],
    order: 3,
  });

describe.skipIf(!configured)("questsRepo story layer (MySQL)", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 4 });
    quests = questsRepo(pool);
    claims = claimsRepo(pool);
    users = usersRepo(pool);
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  it("round-trips every column the write path carries", async () => {
    await quests.add(storied("q-round"));
    const q = await quests.byId("q-round");
    expect(q).not.toBeNull();
    expect(q!.title).toBe("Welcome the newcomers");
    expect(q!.subtitle).toBe("Be the first hello somebody remembers.");
    expect(q!.description).toBe("Greet arrivals and help them find their feet.");
    expect(q!.impact).toBe("A welcomed visitor often becomes a member.");
    expect(q!.story).toContain("first hour");
    expect(q!.firstStep).toContain("never met");
    expect(q!.steps).toEqual(["Arrive early", "Learn three names", "Walk them to the kitchen"]);
    expect(q!.deliverable).toBe("A few words about who you welcomed.");
    expect(q!.tips).toEqual(["Ask what brought them", "Water first, questions later"]);
    expect(q!.imageUrl).toBe("/api/uploads/quest-01.webp");
    expect(q!.gratitude).toBe("50-100");
    expect(q!.duration).toBe("2 hours");
    expect(q!.difficulty).toBe("Beginner");
    expect(q!.circle).toBe("Community Development");
    expect(q!.icon).toBe("Users");
    expect(q!.roleRequired).toBe("A warm face");
    expect(q!.minStage).toBe("member");
    expect(q!.requiresRole).toBe("greeter");
    expect(q!.stayCreditReward).toBe(2);
    expect(q!.tags).toEqual(["welcome", "people"]);
    expect(q!.order).toBe(3);
  });

  it("a mutation of one field leaves the whole story layer standing", async () => {
    await quests.add(storied("q-mutate"));
    await quests.update("q-mutate", (q) => {
      q.title = "Renamed";
    });
    const q = await quests.byId("q-mutate");
    expect(q!.title).toBe("Renamed");
    // The UPDATE writes all 24 non-id columns from the record it just read, so
    // an off-by-one in that list would blank or shuffle these.
    expect(q!.subtitle).toBe("Be the first hello somebody remembers.");
    expect(q!.story).toContain("first hour");
    expect(q!.firstStep).toContain("never met");
    expect(q!.steps).toHaveLength(3);
    expect(q!.tips).toHaveLength(2);
    expect(q!.deliverable).toBe("A few words about who you welcomed.");
    expect(q!.imageUrl).toBe("/api/uploads/quest-01.webp");
    expect(q!.minStage).toBe("member");
    expect(q!.requiresRole).toBe("greeter");
    expect(q!.stayCreditReward).toBe(2);
    expect(q!.tags).toEqual(["welcome", "people"]);
  });

  it("keeps the advertised label and its enforced bounds in agreement", async () => {
    await quests.add(storied("q-bounds"));
    const [rows] = await pool.query<any[]>(
      "SELECT gratitude, gratitude_min, gratitude_max FROM quests WHERE id = ?",
      ["q-bounds"],
    );
    expect(rows[0].gratitude).toBe("50-100");
    expect(Number(rows[0].gratitude_min)).toBe(50);
    expect(Number(rows[0].gratitude_max)).toBe(100);
  });

  it("an empty list column stores NULL and still reads back as a list", async () => {
    await quests.add(quest({ id: "q-empty", steps: [], tips: [] }));
    const [rows] = await pool.query<any[]>(
      "SELECT steps, tips FROM quests WHERE id = ?",
      ["q-empty"],
    );
    expect(rows[0].steps).toBeNull();
    expect(rows[0].tips).toBeNull();
    const q = await quests.byId("q-empty");
    expect(q!.steps).toEqual([]);
    expect(q!.tips).toEqual([]);
  });

  it("a quest written with no story layer at all still reads", async () => {
    await quests.add(quest({ id: "q-bare" }));
    const q = await quests.byId("q-bare");
    expect(q!.subtitle).toBeNull();
    expect(q!.story).toBeNull();
    expect(q!.firstStep).toBeNull();
    expect(q!.deliverable).toBeNull();
    expect(q!.imageUrl).toBeNull();
    expect(q!.steps).toEqual([]);
    expect(q!.tips).toEqual([]);
  });
});

describe.skipIf(!configured)("life signs aggregates (MySQL)", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 4 });
    quests = questsRepo(pool);
    claims = claimsRepo(pool);
    users = usersRepo(pool);

    await quests.add(quest({ id: "q-real", title: "Real quest" }));
    await quests.add(quest({ id: "q-demo", title: "Demo quest" }));
    // is_example is not on the repo's write path, so the seeder sets it.
    await pool.query("UPDATE quests SET is_example = 1 WHERE id = ?", ["q-demo"]);

    await users.add({ id: "u-real", email: "real@example.test", name: "Ada Wren", recognitionBalance: 0 } as any);
    await users.add({
      id: "u-demo",
      email: "demo@example.test",
      name: "Demo Person",
      recognitionBalance: 0,
      isExample: true,
    } as any);

    const claim = (
      id: string,
      questId: string,
      userId: string,
      userName: string,
      status: any,
      consented?: string,
    ) =>
      claims.add({
        id,
        questId,
        questTitle: questId,
        userId,
        userName,
        status,
        claimedAt: "2026-01-01T00:00:00.000Z",
        resolvedAt: consented ?? null,
      });

    await claim("c-1", "q-real", "u-real", "Ada Wren", "claimed");
    await claim("c-2", "q-real", "u-real", "Ada Wren", "submitted");
    await claim("c-3", "q-real", "u-real", "Ada Wren", "consented", "2026-02-01T00:00:00.000Z");
    await claim("c-4", "q-real", "u-real", "Ada Wren", "consented", "2026-03-01T00:00:00.000Z");
    await claim("c-5", "q-real", "u-real", "Ada Wren", "declined");
    // Neither of these may ever reach a public count.
    await claim("c-6", "q-demo", "u-real", "Ada Wren", "consented", "2026-04-01T00:00:00.000Z");
    await claim("c-7", "q-real", "u-demo", "Demo Person", "consented", "2026-05-01T00:00:00.000Z");
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  it("counts held work and finished work apart, and ignores declined", async () => {
    const counts = await claims.fieldCounts();
    // claimed + submitted are both live work; the two consented are finished;
    // the declined one is neither.
    expect(counts.get("q-real")).toEqual({ active: 2, done: 2 });
  });

  it("never counts an example quest or an example member", async () => {
    const counts = await claims.fieldCounts();
    expect(counts.has("q-demo")).toBe(false);
    // u-demo's consented claim on the real quest is excluded, so done stays 2.
    expect(counts.get("q-real")!.done).toBe(2);
  });

  it("lists the newest completions first, examples excluded", async () => {
    const recent = await claims.recentConsented(8);
    expect(recent.map((r) => r.questId)).toEqual(["q-real", "q-real"]);
    expect(recent[0].when!.startsWith("2026-03-01")).toBe(true);
    expect(recent.every((r) => r.userName === "Ada Wren")).toBe(true);
  });

  it("honours the cap", async () => {
    expect(await claims.recentConsented(1)).toHaveLength(1);
  });
});
