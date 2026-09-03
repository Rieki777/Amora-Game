/**
 * TWO CURRENCIES, TWO NAMES, AND THE WORDS NEITHER DEFAULT MAY CARRY.
 *
 * A village on this platform runs two things a member reads as "the currency",
 * and they are not the same thing:
 *
 *   RECOGNITION  `currency.name` here, `tokens`.`name` for the slug `gratitude`
 *                (server/lib/economy.ts, HEARTS). A signal with no financial
 *                value. Given, never spent. `/api/game/config` serves it as
 *                `currency.name`.
 *
 *   VALUE        `tokens`.`name` for whatever slug the `gratitude.pool_token`
 *                variable names, `credits` by default (drizzle/0007). The real
 *                pool the cycle distributes across recognition.
 *                `/api/game/config` serves it as `currency.value.name`
 *                (server/index.ts, the /api/game/config handler).
 *
 * Quests.tsx renders both in one paragraph: "each cycle the community sets
 * aside a real pool of {value} and shares it across everyone's {recognition}".
 * If the two ever default to the same word that sentence stops parsing, and a
 * member reading it cannot tell which number is theirs to spend.
 *
 * "GRATITUDE" IS THE PLATFORM DEFAULT, AND THAT WAS DECIDED. This file was
 * written on the opposite premise, that the word belonged to one village and
 * that every fork inheriting it repeated the tagline mistake. The premise was
 * wrong. 6ed6aa0 reverted the rename and recorded why: the founder had
 * reported that the Setup Wizard confused him about WHICH token he was
 * renaming, that symptom was read as a rename task, and asked directly he
 * named this one. The lunar-cycle allowance members give away is called
 * Gratitude, and that is the platform default.
 *
 * So the assertion this file once carried, that `currency.name` must not be
 * the recognition slug, is gone. It is described here instead of deleted in
 * silence, because the argument for it is a good one that reads as new every
 * time somebody meets it, and the next person to think of it should find the
 * answer here rather than re-deriving it.
 *
 * The slug stays `gratitude` forever either way, because a slug is history's
 * identity and every ledger row is keyed to it. Only the display name is the
 * village's own word.
 *
 * This is a pure test: no database, no server, no fixtures beyond the
 * migrations already in the tree.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { GAME_CONFIG } from "./gameConfig";

const DRIZZLE = fileURLToPath(new URL("../drizzle/", import.meta.url));

/** The recognition token's slug. Mirrors HEARTS in server/lib/economy.ts;
 *  restated rather than imported so this file pulls in no server module. */
const RECOGNITION_SLUG = "gratitude";

interface SeededToken {
  slug: string;
  name: string;
  file: string;
}

/**
 * Every (slug, name) the migrations seed into `tokens`, read as text.
 *
 * Text, not a database. These rows are what a BRAND NEW village's registry
 * holds on its first boot, before anybody has opened Admin, and that is the
 * state this test is about. Reading a live database would answer a different
 * question and would answer it differently on every machine.
 */
function seededTokens(): SeededToken[] {
  const out: SeededToken[] = [];
  for (const file of readdirSync(DRIZZLE).filter((f) => f.endsWith(".sql")).sort()) {
    const sql = readFileSync(path.join(DRIZZLE, file), "utf8");
    // Only files that actually insert into `tokens`; a tuple of the same shape
    // in some other table's seed is not a token name.
    if (!/INTO\s+`tokens`/i.test(sql)) continue;
    for (const line of sql.split("\n")) {
      const m = line.match(/^\s*\('([a-z0-9._-]+)',\s*'([^']+)'/i);
      if (m) out.push({ slug: m[1], name: m[2], file });
    }
  }
  return out;
}

describe("the migrations seed the token names this test reads", () => {
  /*
   * THE CONTROL. Every assertion below is of the form "X is not in this list",
   * and a parser that silently found nothing would pass all of them while
   * checking nothing at all. So first prove the list is real.
   */
  it("finds the seeded rows, so a 'no collision' pass means something", () => {
    const seeded = seededTokens();
    expect(seeded.length, "no token seeds parsed: the reader broke, or the seeds moved").toBeGreaterThanOrEqual(4);
    expect(seeded.map((t) => t.slug)).toContain(RECOGNITION_SLUG);
    // The value token the cycle pool pays by default (drizzle/0007). Named
    // here so a rename of it has to come through this file.
    expect(seeded.find((t) => t.slug === "credits")?.name).toBe("Village Credits");
  });
});

describe("the platform's default recognition currency name", () => {
  it("does not collide with any other token this platform seeds", () => {
    const others = seededTokens().filter((t) => t.slug !== RECOGNITION_SLUG);
    const wanted = GAME_CONFIG.currency.name.trim().toLowerCase();
    const clash = others.find((t) => t.name.trim().toLowerCase() === wanted);
    expect(
      clash ? `${clash.name} (${clash.slug}, seeded by ${clash.file})` : null,
      "two currencies sharing a name is a balance nobody can read: server/lib/ledger.ts refuses it at the rename route, and the platform default must not be the one case that slips past because nothing calls that route",
    ).toBeNull();
  });

  it("agrees with its own lowercase variant, because the server derives one from the other", () => {
    // mergedConfig() computes nameLower as name.toLowerCase() and only falls
    // back to this stored value when the name is empty. Two fields that must
    // agree are two fields that can drift; this pins them.
    expect(GAME_CONFIG.currency.nameLower).toBe(GAME_CONFIG.currency.name.toLowerCase());
  });
});

describe("the on-chain token display names", () => {
  it("stay distinct from each other and from every seeded token", () => {
    const names = [
      ["currency.name", GAME_CONFIG.currency.name],
      ["currency.equity.name", GAME_CONFIG.currency.equity.name],
      ["currency.voice.name", GAME_CONFIG.currency.voice.name],
      ...seededTokens().map((t) => [`tokens.${t.slug}`, t.name] as [string, string]),
    ] as [string, string][];
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const [where, name] of names) {
      const key = name.trim().toLowerCase();
      if (!key) continue;
      const first = seen.get(key);
      // The recognition currency and the `gratitude` row are the SAME token
      // named twice, so they are allowed to agree. Everything else is not.
      const samePair =
        first &&
        [first, where].sort().join("|") === ["currency.name", `tokens.${RECOGNITION_SLUG}`].join("|");
      if (first && !samePair) collisions.push(`${name}: ${first} and ${where}`);
      else if (!first) seen.set(key, where);
    }
    expect(collisions, "each of these is a name a member sees on a balance; two of them sharing a word makes the wallet unreadable").toEqual([]);
  });
});
