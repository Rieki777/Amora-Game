/**
 * One cycle, one name.
 *
 * Two formatters used to write different strings into the same `cycle_id`
 * column: the acknowledgement flow wrote `lunar-000329` and the Hearts economy
 * wrote `moon-329`. They were the same lunation and neither knew about the
 * other, so a member's spending was counted twice against two allowances that
 * could not see each other, and the settlement read half the rows it was
 * settling over.
 *
 * These tests hold both ends of that shut. They are written against the engine
 * and the service rather than over HTTP, because the rule is the thing under
 * test: a route can refuse for its own reasons and prove nothing about the
 * ledger underneath it.
 */
import { describe, expect, it, beforeAll, afterAll } from "vitest";
import mysql from "mysql2/promise";
import { cycleWindow, ensureVoiceToken, give, villageId } from "./lib/economy";
import { budgetFor, sendGratitude, type GratitudeDeps } from "./lib/gratitude";
import { cycleIdFor } from "./lib/gratitude-cycles";
import { loadTokenRegistry, memberAccount } from "./lib/ledger";
import { loadVariables } from "./lib/variables";
import { seedEconomy } from "./lib/economySeed";
import { gratitudeLogRepo } from "./repos/gratitude";
import type { UsersRepo } from "./repos/users";
import { provisionTestDb, testDbConfigured, type TestDb } from "./db/testDb";

const configured = testDbConfigured();

let db: TestDb;
let pool: mysql.Pool;

async function makeMember(id: string): Promise<string> {
  await pool.query(
    "INSERT INTO `users` (`id`, `name`, `email`, `password_hash`) VALUES (?,?,?,'x') " +
      "ON DUPLICATE KEY UPDATE `name` = VALUES(`name`)",
    [id, id, `${id}@village.test`],
  );
  await pool.query(
    "INSERT IGNORE INTO `ledger_accounts` (`id`, `kind`, `user_id`, `label`, `faucet`) VALUES (?,?,?,?,0)",
    [memberAccount(id), "member", id, id],
  );
  return id;
}

/** The users repo the gratitude service needs, over the scratch pool. */
function usersOver(pool: mysql.Pool): UsersRepo {
  const load = async (where: string, v: string) => {
    const [rows] = await pool.query<any[]>(`SELECT * FROM \`users\` WHERE ${where} = ? LIMIT 1`, [v]);
    return rows[0] ?? null;
  };
  return {
    async all() {
      const [rows] = await pool.query<any[]>("SELECT * FROM `users`");
      return rows as any;
    },
    byId: (id: string) => load("`id`", id),
    byEmail: (email: string) => load("`email`", email),
    async update() {
      /* the recipient's cached balance is not what these tests measure */
    },
  } as unknown as UsersRepo;
}

function depsOver(pool: mysql.Pool): GratitudeDeps {
  return {
    pool,
    log: gratitudeLogRepo(pool),
    members: usersOver(pool),
    stageMultiplierFor: async () => 1,
  };
}

/** Both allowances read a member's own spending out of the same table. */
async function spentByFormat(fromId: string) {
  const [rows] = await pool.query<any[]>(
    "SELECT `cycle_id`, SUM(`amount`) AS s FROM `gratitude_log` WHERE `from_id` = ? GROUP BY `cycle_id`",
    [fromId],
  );
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.cycle_id)] = Number(r.s);
  return out;
}

describe.skipIf(!configured)("one cycle, one name", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 6 });
    await loadTokenRegistry(pool);
    await loadVariables(pool);
    await ensureVoiceToken(pool, "Village Voice");
    await loadTokenRegistry(pool);
    // `give` is inert until the village's rules are seeded.
    await seedEconomy(pool, villageId());
  }, 240_000);

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  /**
   * QA2-01, held shut. Today's dials are 30 through the Hearts economy and 100
   * through the acknowledgement flow. Whichever of those the founder keeps,
   * one member must not be able to move 130 by using both doors.
   */
  it("counts a member's spending once, whichever door they came through", async () => {
    const giver = await makeMember("cyc-giver");
    const people = [];
    for (let i = 0; i < 7; i++) people.push(await makeMember(`cyc-friend-${i}`));

    // Door one: the Hearts economy. 30 a moon, at most 10 to any one person.
    for (let i = 0; i < 3; i++) {
      const out = await give(pool, { fromUserId: giver, toUserId: people[i], amount: 10, clientNonce: `n-${i}` });
      expect(out.ok).toBe(true);
    }
    const drained = await give(pool, { fromUserId: giver, toUserId: people[3], amount: 1, clientNonce: "n-drained" });
    expect(drained.ok).toBe(false);

    // Door two: the acknowledgement flow. Its budget must already see the 30.
    const budget = await budgetFor(depsOver(pool), { id: giver, name: giver });
    expect(budget.spent).toBe(30);
    expect(budget.remaining).toBe(70);

    // And it must stop at its own total rather than at its own half of the table.
    let accepted = 0;
    for (let i = 3; i < 7; i++) {
      const out = await sendGratitude(depsOver(pool), {
        fromUser: { id: giver, name: giver },
        toId: people[i],
        amount: 25,
        message: "thank you",
      });
      if (out.ok) accepted += 25;
    }
    expect(accepted).toBe(70);

    const byFormat = await spentByFormat(giver);
    // One name for one lunation. Nothing under any other key.
    expect(Object.keys(byFormat)).toEqual([cycleIdFor()]);
    expect(Object.values(byFormat).reduce((a, b) => a + b, 0)).toBe(100);
  });

  /** The engine's own window key is the same string the log carries. */
  it("the economy's cycle key and the gratitude cycle id are one string", () => {
    expect(cycleWindow().key).toBe(cycleIdFor());
  });
});
