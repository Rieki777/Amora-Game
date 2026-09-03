/**
 * WHAT THE ECONOMICS MODEL HAD TO ASSUME, WRITTEN DOWN WHERE A FOUNDER CAN
 * READ IT.
 *
 * A cycle of this village's economy is decided by facts the snapshot does not
 * carry. How many quests get confirmed. How much of an allowance anybody
 * actually gives away. Whether the credits people hold get spent on anything.
 * Whether an administrator presses the button that releases the cycle pool.
 * None of those is in `mint_rules`, in the variables registry or in the
 * ledger, so a simulation either guesses them or refuses to run.
 *
 * This file is the guess, made explicit, typed, defaulted, and printable.
 * `describeAssumptions` returns one plain sentence per assumption so a preview
 * can print them beside the seed, and a founder reading a number can see what
 * the number rests on. An assumption nobody printed is a lie the tool tells
 * quietly.
 *
 * ── WHY THE DEFAULTS ARE THE CAUTIOUS ONES ─────────────────────────────────
 *
 * Giving defaults to zero, spending defaults to zero, and the recognition a
 * confirmed quest pays defaults to zero. Every one of those numbers is a
 * behaviour of PEOPLE, and a model that invented a lively village would
 * produce a preview that looks healthy because the model decided it should.
 * The one place the default is non-zero is the quest count, because the whole
 * question a founder asks of a preview is "what happens when work gets done",
 * and one confirmed quest per member per cycle is the smallest answer that
 * makes anything happen at all.
 *
 * ── WHERE THIS PLUGS INTO THE ENGINE ───────────────────────────────────────
 *
 * The governance session's `SimInput` will carry `assumptions.economics` as
 * `unknown`, and `SimState` will carry it forward. When it lands, the wiring
 * is one call: `economicsModel(parseEconomicsAssumptions(input.assumptions
 * ?.economics))`. `parseEconomicsAssumptions` already takes `unknown` and is
 * total over every input, so nothing here has to change to accept it.
 */

/** How the economics model fills in what the snapshot cannot tell it. */
export interface EconomicsAssumptions {
  /**
   * Confirmed quests per member per cycle. A fraction is honest: 0.5 means
   * half the roll finishes a quest, and the model resolves the fractional
   * part with the engine's seeded generator so the same seed answers the same
   * thing.
   */
  questsConfirmedPerMemberPerCycle: number;
  /**
   * How much of a member's cycle allowance actually gets given away, from 0
   * for a silent village to 1 for one that spends every point of it.
   */
  gratitudeAllowanceGivenShare: number;
  /**
   * What one member spends into a sink each cycle, in minor units of the pool
   * token. Bounded by what they hold, the way the ledger bounds it.
   */
  sinkSpendPerMemberPerCycle: bigint;
  /**
   * The recognition one confirmed quest pays, in minor units.
   *
   * Zero by default and that is a measurement. The consent route mints
   * recognition from the range the quest itself advertises in
   * `quests.gratitude`, and `VillageSnapshot` holds no copy of any quest, so
   * the model has nothing to read. A village that knows its own typical
   * reward sets this and gets a truer preview.
   */
  gratitudePerConfirmedQuest: bigint;
  /**
   * Whether an administrator closes the gratitude cycle each cycle, which is
   * what releases the value pool. Nothing in this build does it on a timer:
   * `POST /api/admin/cycles/close` is a human act, and a village that never
   * presses it never distributes a single token of its pool.
   */
  poolClosedEachCycle: boolean;
  /**
   * Whether this village may issue at all. Every posting out of a faucet is
   * refused until the launch vote carries (`issuanceRefusal`,
   * server/lib/gameStart.ts), and the snapshot carries no copy of that fact,
   * so it is an assumption and it defaults to open.
   */
  issuanceOpen: boolean;
}

/** The cautious village. See the header for why each default is what it is. */
export const DEFAULT_ECONOMICS_ASSUMPTIONS: EconomicsAssumptions = {
  questsConfirmedPerMemberPerCycle: 1,
  gratitudeAllowanceGivenShare: 0,
  sinkSpendPerMemberPerCycle: BigInt(0),
  gratitudePerConfirmedQuest: BigInt(0),
  poolClosedEachCycle: true,
  issuanceOpen: true,
};

function asNumber(raw: unknown, fallback: number, min: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function asBigInt(raw: unknown, fallback: bigint): bigint {
  if (typeof raw === "bigint") return raw < BigInt(0) ? BigInt(0) : raw;
  if (typeof raw === "number") {
    if (!Number.isFinite(raw)) return fallback;
    const whole = Math.trunc(raw);
    return BigInt(whole < 0 ? 0 : whole);
  }
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!/^-?[0-9]+$/.test(text)) return fallback;
    const value = BigInt(text);
    return value < BigInt(0) ? BigInt(0) : value;
  }
  return fallback;
}

function asBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === "true" || raw === 1 || raw === "1") return true;
  if (raw === "false" || raw === 0 || raw === "0") return false;
  return fallback;
}

/**
 * Read assumptions out of whatever the engine was handed.
 *
 * Total over every input. A missing field, a string where a number belongs,
 * `null`, or a whole payload that is not an object all give the defaults,
 * because a preview that threw on a malformed assumption would be a preview a
 * village cannot open. Values are clamped to the range each one can mean.
 */
export function parseEconomicsAssumptions(raw: unknown): EconomicsAssumptions {
  const d = DEFAULT_ECONOMICS_ASSUMPTIONS;
  if (!raw || typeof raw !== "object") return { ...d };
  const o = raw as Record<string, unknown>;
  return {
    questsConfirmedPerMemberPerCycle: asNumber(
      o.questsConfirmedPerMemberPerCycle,
      d.questsConfirmedPerMemberPerCycle,
      0,
      1000,
    ),
    gratitudeAllowanceGivenShare: asNumber(o.gratitudeAllowanceGivenShare, d.gratitudeAllowanceGivenShare, 0, 1),
    sinkSpendPerMemberPerCycle: asBigInt(o.sinkSpendPerMemberPerCycle, d.sinkSpendPerMemberPerCycle),
    gratitudePerConfirmedQuest: asBigInt(o.gratitudePerConfirmedQuest, d.gratitudePerConfirmedQuest),
    poolClosedEachCycle: asBoolean(o.poolClosedEachCycle, d.poolClosedEachCycle),
    issuanceOpen: asBoolean(o.issuanceOpen, d.issuanceOpen),
  };
}

/**
 * The assumptions as sentences, for printing beside the seed.
 *
 * One sentence per assumption, every time, including the ones that are set to
 * zero. A list that hid its zeroes would let the most consequential assumption
 * in the set (nobody gives anything) go unread.
 */
export function describeAssumptions(a: EconomicsAssumptions): string[] {
  const quests = a.questsConfirmedPerMemberPerCycle;
  const share = Math.round(a.gratitudeAllowanceGivenShare * 100);
  return [
    quests === 0
      ? "No quest is confirmed in any cycle of this run, so nothing the quest rules promise gets paid."
      : `Each member has ${quests} quest confirmed per cycle, and the rules on quest.completed fire once for each.`,
    share === 0
      ? "Nobody gives any recognition in this run, so the whole allowance expires unused every cycle."
      : `Members give away ${share}% of their cycle allowance, spread across the people they can reach within the per-person share.`,
    a.sinkSpendPerMemberPerCycle === BigInt(0)
      ? "Nobody spends anything, so every token issued in this run stays in a member's hands."
      : `Each member spends ${String(a.sinkSpendPerMemberPerCycle)} minor units of the pool token each cycle, or as much of it as they hold.`,
    a.gratitudePerConfirmedQuest === BigInt(0)
      ? "A confirmed quest pays no recognition in this run. The real consent route pays whatever range the quest advertises, and the snapshot holds no copy of any quest, so this preview leaves it out and says so."
      : `A confirmed quest pays ${String(a.gratitudePerConfirmedQuest)} minor units of recognition, which is a figure this village supplied and not one read from any quest.`,
    a.poolClosedEachCycle
      ? "An administrator closes the gratitude cycle every cycle, which is what releases the value pool. Nothing in this build does it on a timer."
      : "Nobody closes the gratitude cycle in this run, so the value pool releases nothing at all.",
    a.issuanceOpen
      ? "This village has started its Game, so its faucets may issue."
      : "This village has not started its Game, so every posting out of a faucet is refused and nothing is issued.",
  ];
}
