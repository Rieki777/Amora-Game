/**
 * `tokens`.`active` means MEMBER VISIBILITY and nothing else (Rye, 2026-08-14).
 *
 * Two halves, and the second matters as much as the first: hiding a token must
 * take it off the member-facing surfaces, and must leave the ledger exactly
 * where it was. A flag that quietly froze an economy would be the one change
 * here that could not be undone.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadStanding } from "../lib/profile";
import { publicRules, publicSupply } from "../lib/economy";
import { provisionTestDb, testDbConfigured, type TestDb } from "./testDb";

const configured = testDbConfigured();
if (!configured) {
  // eslint-disable-next-line no-console
  console.warn("[tokenVisibility.test] TEST_DATABASE_URL not set — DB-backed tests SKIPPED.");
}

const USER = "usr-visibility-test";
// `credits` and not `stay-credit`: a freshly migrated schema seeds exactly
// gratitude, amora, voice and credits (see harness.test.ts). Naming a token the
// registry does not have makes every JOIN drop the row, and then the
// "is it hidden?" assertions pass for the wrong reason — which is how this test
// first went green on its absence checks while proving nothing.
const SLUG = "credits";

describe.skipIf(!configured)("token visibility", () => {
  let db: TestDb;

  beforeAll(async () => {
    db = await provisionTestDb();
    // A balance the member holds, and a mint rule that pays it, so the token
    // has something to appear IN on every surface under test.
    await db.conn.query(
      "INSERT INTO `token_balances` (`account_id`, `token_type`, `balance`) VALUES (?,?,?) " +
        "ON DUPLICATE KEY UPDATE `balance` = VALUES(`balance`)",
      [`mem:${USER}`, SLUG, 42],
    );
    // An enabled rule paying this token, so publicRules has something to
    // include while shown and drop while hidden. Without it the feed
    // assertions are true of an empty list and prove nothing.
    await db.conn.query(
      "INSERT INTO `mint_rules` (`id`, `village_id`, `trigger`, `token_slug`, `amount`, `ceiling`, `recipient`, `enabled`) " +
        "VALUES (?,?,?,?,?,?,?,1) ON DUPLICATE KEY UPDATE `enabled` = 1",
      [`rule-visibility-${SLUG}`, "local", "quest.completed", SLUG, 5, 10, "claimant"],
    );
  }, 180_000);

  afterAll(async () => {
    await db?.drop();
  });

  const setActive = (active: boolean) =>
    db.conn.query("UPDATE `tokens` SET `active` = ? WHERE `slug` = ?", [active ? 1 : 0, SLUG]);

  const balanceRow = async () => {
    const [rows] = await db.conn.query<any[]>(
      "SELECT `balance` FROM `token_balances` WHERE `account_id` = ? AND `token_type` = ?",
      [`mem:${USER}`, SLUG],
    );
    return rows[0]?.balance ?? null;
  };

  it("shows the token on the member's standing while active", async () => {
    await setActive(true);
    const standing = await loadStanding(db.conn as any, USER);
    expect(standing.map((s) => s.token)).toContain(SLUG);
  });

  it("takes it off the member's standing once hidden", async () => {
    await setActive(false);
    const standing = await loadStanding(db.conn as any, USER);
    expect(standing.map((s) => s.token)).not.toContain(SLUG);
  });

  it("leaves the balance exactly where it was", async () => {
    // The whole point: hidden is not spent, not burned, not frozen.
    expect(Number(await balanceRow())).toBe(42);
  });

  it("carries the rule on the public feed while shown, and drops it while hidden", async () => {
    // publicRules reports the token by its DISPLAY NAME rather than its slug,
    // which makes this assertion do double duty: the feed follows the registry
    // name, so a rename reaches the public page too.
    await setActive(true);
    const shown = await publicRules(db.conn as any);
    expect(shown.map((r) => r.token)).toContain("Village Credits");

    await setActive(false);
    const hidden = await publicRules(db.conn as any);
    expect(hidden.map((r) => r.token)).not.toContain("Village Credits");
  });

  it("follows a rename through to the public feed", async () => {
    // A deliberately invented name, not any real village's word for its
    // currency: the brand guard holds platform code to "no village's brand in
    // platform code", and a test is platform code like any other.
    const RENAMED = "Harvest Tokens";
    await setActive(true);
    await db.conn.query("UPDATE `tokens` SET `name` = ? WHERE `slug` = ?", [RENAMED, SLUG]);
    const rules = await publicRules(db.conn as any);
    expect(rules.map((r) => r.token)).toContain(RENAMED);
    expect(rules.map((r) => r.token)).not.toContain("Village Credits");
    // And the sentence a member actually reads carries the new word.
    expect(rules.find((r) => r.token === RENAMED)?.says ?? "").toContain(RENAMED);
    await db.conn.query("UPDATE `tokens` SET `name` = ? WHERE `slug` = ?", ["Village Credits", SLUG]);
  });

  it("keeps it off the public supply feed while hidden", async () => {
    await setActive(false);
    const supply = await publicSupply(db.conn as any);
    expect(JSON.stringify(supply.tokens)).not.toContain(SLUG);
  });

  it("puts it back the moment it is shown again", async () => {
    await setActive(true);
    const standing = await loadStanding(db.conn as any, USER);
    expect(standing.map((s) => s.token)).toContain(SLUG);
    expect(Number(await balanceRow())).toBe(42);
  });
});
