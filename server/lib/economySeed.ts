/**
 * What a village is born knowing: five classes, and a starting set of rules.
 *
 * Two different idempotency rules here, and the difference is the whole point.
 *
 *   Archetypes UPSERT by natural key. They are vocabulary, and a platform
 *   improvement to the copy should reach every village on the next deploy.
 *
 *   Mint rules INSERT IF ABSENT and are never updated. They are money. Once a
 *   village has looked at its rules and decided its own amounts, a redeploy
 *   that "restored the defaults" would silently undo a governance decision, and
 *   nobody would see it happen until the next settlement paid the wrong number.
 *
 * Neither is a genesis grant. Re-running this seeds nothing twice and grants
 * nobody anything: value only ever enters through the engine.
 */
import type { Pool } from "mysql2/promise";
import { ensureVoiceToken, HEARTS, VILLAGE_VOICE } from "./economy";

/**
 * The five archetypal contributions, as classes.
 *
 * Copy carried over from the platform's own archetype list so the two products
 * describe the same five things in the same words. The class NAMES are the
 * village's vocabulary and renameable; these are the defaults a fork starts on.
 */
const ARCHETYPES = [
  {
    key: "building",
    name: "The Builder",
    subtitle: "Building & Developing",
    blurb: "Creating tools, systems, and infrastructure that serve the regenerative movement.",
    examples: [
      "Building out the village platform",
      "Creating infrastructure for the land",
      "Developing governance tools",
      "Building dashboards and tracking systems",
    ],
    sigil: "hammer",
  },
  {
    key: "researching",
    name: "The Architect",
    subtitle: "Researching & Architecting",
    blurb: "Designing frameworks, exploring possibilities, and mapping the path forward.",
    examples: [
      "Designing tokenomics models",
      "Researching regenerative land practices",
      "Creating organizational frameworks",
      "Mapping ecosystem relationships",
    ],
    sigil: "lens",
  },
  {
    key: "facilitating",
    name: "The Spaceholder",
    subtitle: "Facilitating & Space Holding",
    blurb: "Creating containers for collaboration, learning, and community growth.",
    examples: [
      "Facilitating community sessions",
      "Hosting season incubators",
      "Running onboarding calls",
      "Holding space for conflict resolution",
    ],
    sigil: "circle",
  },
  {
    key: "catalyzing",
    name: "The Catalyst",
    subtitle: "Catalyzing & Connecting",
    blurb: "Weaving relationships, building bridges, and sparking new possibilities.",
    examples: [
      "Helping onboard new land projects",
      "Making key introductions",
      "Connecting people with projects",
      "Building partnership networks",
    ],
    sigil: "thread",
  },
  {
    key: "storytelling",
    name: "The Storyteller",
    subtitle: "Storytelling & Communicating",
    blurb: "Sharing the vision, documenting the journey, and drawing others in.",
    examples: [
      "Telling the story of the land",
      "Creating content that carries the work",
      "Documenting the journey",
      "Keeping the outside world in the loop",
    ],
    sigil: "book",
  },
];

/**
 * The starting rules.
 *
 * Hearts on quest.completed are deliberately ABSENT: the consent route has
 * minted recognition since S7 with its own range, cap and multiplier, and a
 * rule here would pay a second time for the same work.
 *
 * Every ceiling is a real number. A from_source rule with no ceiling is an open
 * faucet with a form in front of it.
 */
const RULES = [
  { trigger: "quest.completed", token: VILLAGE_VOICE, amount: 0.1, ceiling: 1, recipient: "claimant" },
  { trigger: "role.cycle", token: HEARTS, amount: 20, ceiling: 100, recipient: "holder" },
  { trigger: "role.cycle", token: VILLAGE_VOICE, amount: 0.5, ceiling: 2, recipient: "holder" },
];

export interface SeedReport {
  archetypes: number;
  rulesAdded: number;
  rulesLeftAlone: number;
}

export async function seedEconomy(
  pool: Pool,
  villageId: string,
  opts: { dryRun?: boolean; voiceName?: string } = {},
): Promise<SeedReport> {
  const report: SeedReport = { archetypes: 0, rulesAdded: 0, rulesLeftAlone: 0 };

  if (!opts.dryRun) await ensureVoiceToken(pool, opts.voiceName);

  for (const a of ARCHETYPES) {
    report.archetypes += 1;
    if (opts.dryRun) continue;
    await pool.query(
      "INSERT INTO `archetypes` (`village_id`, `key`, `name`, `subtitle`, `blurb`, `examples`, `sigil`, `sort_order`) " +
        "VALUES (?,?,?,?,?,?,?,?) " +
        // Vocabulary, so platform copy improvements travel. A village that has
        // renamed a class keeps its own name: `name` is the one column an
        // admin edits, and it is restored from the row rather than the seed
        // once `renamed` is set. Until that editor ships, a rename is an admin
        // act on the row and this line would undo it, which is why the admin
        // surface is part of the same build.
        "ON DUPLICATE KEY UPDATE `subtitle` = VALUES(`subtitle`), `blurb` = VALUES(`blurb`), " +
        "`examples` = VALUES(`examples`), `sigil` = VALUES(`sigil`), `sort_order` = VALUES(`sort_order`)",
      [
        villageId,
        a.key,
        a.name,
        a.subtitle,
        a.blurb,
        JSON.stringify(a.examples),
        a.sigil,
        ARCHETYPES.indexOf(a),
      ],
    );
  }

  for (const r of RULES) {
    // INSERT IGNORE against the natural key, so an amount a village has edited
    // is never restored to the platform default by a redeploy.
    if (opts.dryRun) {
      const [existing]: any = await pool.query(
        "SELECT 1 FROM `mint_rules` WHERE `village_id` = ? AND `trigger` = ? AND `token_slug` = ? LIMIT 1",
        [villageId, r.trigger, r.token],
      );
      if (existing.length) report.rulesLeftAlone += 1;
      else report.rulesAdded += 1;
      continue;
    }
    const [res]: any = await pool.query(
      "INSERT IGNORE INTO `mint_rules` " +
        "(`id`, `village_id`, `trigger`, `token_slug`, `amount`, `ceiling`, `recipient`, `enabled`) " +
        "VALUES (?,?,?,?,?,?,?,1)",
      [
        `rule-${r.trigger}-${r.token}`,
        villageId,
        r.trigger,
        r.token,
        r.amount,
        r.ceiling,
        r.recipient,
      ],
    );
    if (Number(res?.affectedRows ?? 0) > 0) report.rulesAdded += 1;
    else report.rulesLeftAlone += 1;
  }

  return report;
}
