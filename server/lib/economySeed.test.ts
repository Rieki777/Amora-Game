/**
 * What a fresh village is born paying.
 *
 * Rye, 2026-08-30: the defaults are Village Voice and Village Credits, and
 * Gratitude is "a change they can add not the defaults we're going to ship
 * with". Thirteen founders stand up an instance in three weeks and none of
 * them will read `economySeed.ts`, so what the seed produces is what those
 * villages ARE, and it needs a test that fails when somebody changes it by
 * accident.
 *
 * The test that matters most here is the last one. A default that omits a
 * token must not be a capability that refuses it, and in this build the
 * difference is not rhetorical: there is no route that CREATES a mint rule.
 * `PATCH /api/admin/economy/rules/:id` edits an existing row and the governed
 * path after launch edits the same rows, so a deleted rule is a payout the
 * village can never make again. The gratitude rule therefore has to still be
 * there, and it has to be off.
 */
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionTestDb, testDbConfigured, type TestDb } from "../db/testDb";
import { balanceOf, loadTokenRegistry, memberAccount } from "./ledger";
import {
  CREDITS,
  economyEpoch,
  HEARTS,
  ruleCannotPay,
  runSettlement,
  VILLAGE_VOICE,
  villageId,
} from "./economy";
import { seedEconomy } from "./economySeed";

const configured = testDbConfigured();
/**
 * The engine's own village id, not a name of this test's choosing.
 * `runSettlement` and `economyReady` both read `villageId()`, so a suite that
 * seeded somewhere else would prove the seed and never reach the settlement.
 */
const VILLAGE = villageId();

let db: TestDb;
let pool: mysql.Pool;

interface RuleRow {
  id: string;
  trigger: string;
  token_slug: string;
  amount: number;
  ceiling: number;
  recipient: string;
  enabled: number;
}

/**
 * The scale a token actually carries, read off the `tokens` table.
 *
 * NOT off `toLedgerUnits`: an assertion that calls the conversion under test
 * can only ever agree with it, and the three balances below are exactly the
 * numbers that conversion decides. `tokens.decimals` is what the flip migration
 * will move, so a suite reading it is a suite that stays true across the flip
 * instead of restating today's scale as a literal.
 */
async function scaleOf(slug: string): Promise<number> {
  const [rows] = await pool.query<any[]>(
    "SELECT `decimals` FROM `tokens` WHERE `slug` = ?",
    [slug],
  );
  return 10 ** Number(rows[0]?.decimals ?? 0);
}

async function rules(): Promise<RuleRow[]> {
  const [rows] = await pool.query<any[]>(
    "SELECT `id`, `trigger`, `token_slug`, `amount`, `ceiling`, `recipient`, `enabled` " +
      "FROM `mint_rules` WHERE `village_id` = ? ORDER BY `trigger`, `token_slug`",
    [VILLAGE],
  );
  return rows as RuleRow[];
}

const find = (rs: RuleRow[], trigger: string, token: string) =>
  rs.find((r) => r.trigger === trigger && r.token_slug === token);

describe.skipIf(!configured)("the rules a village is seeded with", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 10 });
    await loadTokenRegistry(pool);
    await seedEconomy(pool, VILLAGE);
    await loadTokenRegistry(pool);
    await economyEpoch(pool);
  });

  /** A member holding one live seat, which is all a settlement looks for. */
  async function seatAMember(id: string): Promise<string> {
    await pool.query(
      "INSERT INTO `users` (`id`, `name`, `email`, `password_hash`) VALUES (?,?,?,'x') " +
        "ON DUPLICATE KEY UPDATE `name` = VALUES(`name`)",
      [id, id, `${id}@examples.invalid`],
    );
    await pool.query(
      "INSERT IGNORE INTO `ledger_accounts` (`id`, `kind`, `user_id`, `label`, `faucet`) VALUES (?,?,?,?,0)",
      [memberAccount(id), "member", id, id],
    );
    await pool.query(
      "INSERT IGNORE INTO `org_roles` (`id`, `name`, `is_example`) VALUES (?,?,0)",
      [`role-${id}`, `Seat for ${id}`],
    );
    await pool.query(
      "INSERT IGNORE INTO `org_role_assignments` " +
        "(`id`, `org_role_id`, `holder_kind`, `user_id`, `holder_key`, `is_example`) VALUES (?,?,'member',?,?,0)",
      [`seat-${id}`, `role-${id}`, id, id],
    );
    return id;
  }

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  /**
   * Renamed. This asserts on the RULE ROW, not on a payout, and under its old
   * name ("pays a confirmed quest in voice and credits") it read as proof that
   * a quest pays. It was green for the whole life of a bug that made every
   * village's first confirmed quest pay nothing but Gratitude. The payout
   * itself is proven in `economyEpoch.test.ts`, against balances.
   */
  it("seeds an enabled quest.completed rule for voice and credits, at 10 and 25", async () => {
    const rs = await rules();
    const voice = find(rs, "quest.completed", VILLAGE_VOICE);
    const credits = find(rs, "quest.completed", CREDITS);
    expect(voice?.enabled).toBe(1);
    expect(credits?.enabled).toBe(1);
    expect(Number(voice?.amount)).toBe(10);
    expect(Number(credits?.amount)).toBe(25);
  });

  it("pays a seat holder each moon in voice and credits", async () => {
    const rs = await rules();
    expect(find(rs, "role.cycle", VILLAGE_VOICE)?.enabled).toBe(1);
    expect(find(rs, "role.cycle", CREDITS)?.enabled).toBe(1);
    expect(Number(find(rs, "role.cycle", CREDITS)?.amount)).toBe(25);
  });

  it("does not pay gratitude for holding a seat", async () => {
    // The ruling. Gratitude stops being a default payout for work.
    expect(find(await rules(), "role.cycle", HEARTS)?.enabled).toBe(0);
  });

  it("keeps the gratitude rule on the books so a village can switch it on", async () => {
    // Off, not gone. There is no create-a-rule route in this build, so
    // deleting this row would remove the ability rather than the default, and
    // the ruling asked for the opposite.
    const rule = find(await rules(), "role.cycle", HEARTS);
    expect(rule).toBeDefined();
    expect(Number(rule?.amount)).toBe(20);
    // And it is a rule the engine could honour the moment somebody enables it:
    // a re-enablable rule that then cannot pay is the same trap in slow motion.
    expect(ruleCannotPay(HEARTS)).toBeNull();
  });

  it("seeds no gratitude rule for a confirmed quest, at all", async () => {
    // Not even disabled. The consent route has minted recognition for a
    // confirmed quest since S7 with its own range, cap and standing
    // multiplier. A disabled rule here would read as the obvious thing to
    // switch on and switching it on would pay twice for one piece of work.
    expect(find(await rules(), "quest.completed", HEARTS)).toBeUndefined();
  });

  it("seeds nothing the engine cannot pay", async () => {
    // The guard against this whole lane's original defect coming back through
    // the seed: every rule shipped enabled must be one the engine can honour.
    for (const r of await rules()) {
      if (!r.enabled) continue;
      expect(ruleCannotPay(r.token_slug), `${r.trigger} / ${r.token_slug}`).toBeNull();
    }
  });

  it("pays a seat holder in voice and credits, and not in gratitude", async () => {
    // The end-to-end proof, and the one the seed tests above cannot give: a
    // rule row that says "credits" is worth nothing if the engine cannot mint
    // the token, which is exactly the state this build was in.
    const u = await seatAMember("seed-seat-1");
    const out = await runSettlement(pool);
    expect(out.unpayable).toHaveLength(0);
    expect(out.stewardsThanked).toBe(1);
    // 25 credits and 50 voice are what the SEED promises; the ledger holds
    // each in its own token's minor units, and neither number below restates
    // a scale the registry owns. At decimals 0 these read 25 and 50; at 4 they
    // read 250000 and 500000; the assertion does not change either way.
    expect(await balanceOf(pool, memberAccount(u), CREDITS)).toBe(25 * (await scaleOf(CREDITS)));
    expect(await balanceOf(pool, memberAccount(u), VILLAGE_VOICE)).toBe(
      50 * (await scaleOf(VILLAGE_VOICE)),
    );
    // The ruling: gratitude is not a default payout for holding a seat.
    expect(await balanceOf(pool, memberAccount(u), HEARTS)).toBe(0);
  });

  it("settles the same moon twice without paying twice", async () => {
    const again = await runSettlement(pool);
    expect(again.alreadyRun).toBe(true);
    // The same 25 credits the first settlement left, and not 50: this reads the
    // balance the test above created, so it carries that test's scale too.
    expect(await balanceOf(pool, memberAccount("seed-seat-1"), CREDITS)).toBe(
      25 * (await scaleOf(CREDITS)),
    );
  });

  it("never restores a default a village has already changed", async () => {
    // Money rules are INSERT IF ABSENT and never updated. A redeploy that
    // "restored the defaults" would silently undo a governance decision and
    // nobody would see it until the next settlement paid the wrong number.
    await pool.query(
      "UPDATE `mint_rules` SET `amount` = 7, `enabled` = 1 WHERE `village_id` = ? AND `id` = ?",
      [VILLAGE, `rule-role.cycle-${HEARTS}`],
    );
    const report = await seedEconomy(pool, VILLAGE);
    expect(report.rulesAdded).toBe(0);
    const rule = find(await rules(), "role.cycle", HEARTS);
    expect(Number(rule?.amount)).toBe(7);
    expect(rule?.enabled).toBe(1);
  });
});
