/**
 * THE SHARED DRY RUN'S CONTRACT: plain data, and nothing that can reach a
 * database.
 *
 * ── WHY THIS FILE LIVES IN shared/ ─────────────────────────────────────────
 *
 * Section 22 of the governance prompt made the dry run shared between two
 * builds. The governance session owns the engine and the model of what a
 * ballot does to power; the economics session owns the model of what a cycle
 * does to balances. Both import these types, the client imports them to
 * render a preview, and the server imports them to take the snapshot. A type
 * that four callers share has to sit where all four can reach it, and
 * `shared/` is that place.
 *
 * ── THE CARDINAL RULE, AND WHY IT IS STRUCTURAL ────────────────────────────
 *
 * A preview that can write is a way to change the world by asking a question.
 * The rule that stops it is not a promise in a comment, it is the import
 * graph: nothing in `shared/dryRun/` imports anything under `server/`, and
 * `shared/dryRun/simulate.test.ts` walks the graph and fails if that ever
 * stops being true. Every type here is therefore plain data. The snapshot is
 * read ONCE by a governance-owned reader that opens a read-only connection,
 * and from that instant on the simulation holds objects and never a handle.
 *
 * ── MINOR UNITS, AND WHY BALANCES ARE bigint ───────────────────────────────
 *
 * `TokenDef.decimals` says how many places a token DISPLAYS, and the ledger
 * stores integers only. So every amount in here is in minor units, and every
 * amount is a `bigint`: a simulation that runs twenty cycles of compounding
 * mint rules through IEEE doubles produces a number that is close, and a
 * preview of somebody's money that is close is worse than no preview. Use
 * `BigInt("...")` to write one, never a `123n` literal, because the build
 * target refuses those (CLAUDE.md, House traps).
 */
import type { ClockMode, ProposalTiming } from "../cycleClock";
import type { ChangeItemKind } from "../ballotSubjects";
import type { ModuleLifecycle } from "../modules";

/** A module's openness, spelled the one way `shared/modules.ts` spells it. */
export type Lifecycle = ModuleLifecycle;

/** Which clock the village keeps time by, and the zone its dates render in. */
export interface CycleClockSpec {
  /** `lunar` or `calendar`, read from `cycle.mode`. */
  mode: ClockMode;
  /** The village's IANA zone. The arithmetic is UTC; this is for rendering. */
  timezone: string;
}

/** One token as the simulation needs it, copied from the ledger's registry. */
export interface TokenSpec {
  /** The ledger's identifier for this token. */
  slug: string;
  /** The levers taxonomy: recognition, equity, voice or credit. */
  kind: string;
  /** How many places it displays. Every amount here is in minor units. */
  decimals: number;
  /** The account this token is issued from, when it has one. */
  faucet: string | null;
  /** The accounts this token drains into, such as dues and burns. */
  sinks: string[];
}

/** One minting rule as the simulation needs it, copied from `mint_rules`. */
export interface MintRuleSpec {
  /** The row's id, which is what a `mint:<id>:<field>` change key names. */
  id: string;
  /** What fires it, such as `quest.completed`, in the dotted spelling. */
  trigger: string;
  /** Which token it mints. */
  tokenSlug: string;
  /** Who receives the mint. */
  recipient: string;
  /** How much, in minor units, or null when the amount rides on the source. */
  amount: bigint | null;
  /** The most it may mint in one cycle, in minor units, or null for no cap. */
  ceiling: bigint | null;
  /** Whether it fires at all. */
  enabled: boolean;
}

/** One member of the roll, as the governance model counts them. */
export interface MemberSpec {
  /** The member's user id. */
  id: string;
  /** The ledger account their balances are keyed by, which is `mem:<id>`. */
  accountId: string;
  /** How far along the member's journey is, such as `resident`. */
  stage: string;
  /** The seat ids this member holds. */
  seats: string[];
  /** True when this member votes on somebody else's behalf. */
  isRepresentative?: boolean;
  /** The seat they represent, when they represent one. */
  representsSeatId?: string;
  /**
   * The custom-mode allocation, read only when `governance.weight_mode` is
   * `custom`. Absent is zero, which is how `weightsFor` already fails closed:
   * nobody holds power an admin never assigned.
   */
  weight?: number;
  /**
   * True when this member cannot answer a ballot opened today, because they
   * have died, left or simply stopped playing. The reachability flag counts
   * these out of the weight that can vote, which is the arithmetic behind the
   * stalemate the founder stopped at 97 to avoid.
   */
  absent?: boolean;
}

/** The village, read once and then held as plain data for the whole run. */
export interface VillageSnapshot {
  /** The instant the snapshot was taken, which is where cycle 1 begins. */
  atIso: string;
  /** The clock the village keeps time by. */
  clock: CycleClockSpec;
  /** Every token in the village's registry. */
  tokens: TokenSpec[];
  /** Every balance, in minor units: account id, then token slug. */
  balances: Record<string, Record<string, bigint>>;
  /** Every minting rule, enabled or not. */
  mintRules: MintRuleSpec[];
  /** Every game variable that has a value, as the text the registry stores. */
  variables: Record<string, string>;
  /** Everybody who holds a voice today. */
  members: MemberSpec[];
  /** Each module's openness, keyed by module id. */
  modules: Record<string, Lifecycle>;
}

/** One element of a change set, as the preview reads it. */
export interface ProposedChange {
  /** Which vocabulary the key belongs to. */
  kind: ChangeItemKind;
  /** What it addresses: a variable key, a `mint:<id>:<field>`, a module id. */
  key?: string;
  /** What it holds today, for the sentence a member reads. */
  from?: unknown;
  /** What it would hold. */
  to?: unknown;
  /** `at_acceptance` lands before cycle 1; `next_moon` lands at cycle 1. */
  timing: ProposalTiming;
  /**
   * How many cycles the change stands for before it reverts. Absent means it
   * stands until something else changes it. A reversion restores the captured
   * previous value ONLY while the current value still equals what this change
   * wrote, so a later decision on the same key is never quietly undone.
   */
  expiresAfterCycles?: number;
}

/** Everything `simulate` needs, and it needs nothing else. */
export interface SimInput {
  /** The village, already read. */
  snapshot: VillageSnapshot;
  /** The change set being previewed. Empty is the baseline. */
  changes: ProposedChange[];
  /** How many cycles to run. */
  cycles: number;
  /** The seed, which is part of the input and is printed in the output. */
  seed: number;
  /** How many proposals a model should assume run beside this one. */
  concurrency?: number;
}

/** What the governance model keeps between cycles. */
export interface GovernanceState {
  /** How many cycles the governance model has stepped through. */
  cyclesElapsed: number;
  /** The paths a change has written, in the order they landed. */
  landedPaths: string[];
  /** The paths a term ran out on and the engine restored. */
  revertedPaths: string[];
}

/**
 * THE STATE EVERY MODEL READS AND RETURNS.
 *
 * It is the snapshot's own fields plus the two things a run accumulates: the
 * instant, which advances one cycle boundary per cycle, and the governance
 * sub-state. A model returns a NEW state and mutates nothing it was handed,
 * which is what makes the baseline pass and the proposed pass comparable.
 */
export interface SimState {
  /** The instant this cycle begins. */
  atIso: string;
  /** Which cycle the state is at. Zero is before the first step. */
  cycle: number;
  /** The clock, carried so a model can ask what a boundary means. */
  clock: CycleClockSpec;
  /** The token registry, unchanged by any model in this build. */
  tokens: TokenSpec[];
  /** Every balance in minor units. The economics model owns every change. */
  balances: Record<string, Record<string, bigint>>;
  /** The minting rules, which a change set may retune. */
  mintRules: MintRuleSpec[];
  /** The game variables, as text. */
  variables: Record<string, string>;
  /** The roll. */
  members: MemberSpec[];
  /** Each module's openness. */
  modules: Record<string, Lifecycle>;
  /** What the governance model keeps between cycles. */
  governance: GovernanceState;
}

/** How loud a flag is. */
export type FlagSeverity = "notice" | "warning" | "danger";

/** Something the run noticed, said in the words a member reads. */
export interface Flag {
  /** A stable identifier, so a surface can key off it without parsing prose. */
  code: string;
  /** How loud it is. */
  severity: FlagSeverity;
  /** Which cycle it was raised in. Zero means before the first step. */
  cycle: number;
  /** What happened, in one plain sentence. */
  sentence: string;
  /** What the village could do about it, or null when it is only news. */
  actionable: string | null;
}

/** A rule the run broke. The proposed pass stops at the first one. */
export interface Violation {
  /** Which rule broke, named the way the build names it. */
  invariant: string;
  /** The cycle it broke in. The engine stamps this; a model may leave it 0. */
  cycle: number;
  /** The numbers behind it, so a reader can check the arithmetic. */
  detail: string;
}

/** One difference between the baseline's final state and the proposed one. */
export interface Diff {
  /** Where it is, such as `variables/governance.quorum_pct`. */
  path: string;
  /** What the value would be if nothing were decided. */
  baseline: string;
  /** What it would be if this change set carried. */
  proposed: string;
  /** The difference in one plain sentence. */
  sentence: string;
}

/** One cycle of a pass, kept whole so a surface can scrub through the run. */
export interface CycleResult {
  /** Which cycle this is, counting from one. */
  cycle: number;
  /** The instant it began. */
  atIso: string;
  /** The state at the end of it. */
  state: SimState;
  /** What the models said about it. */
  flags: Flag[];
  /** What the models found broken at the end of it. */
  violations: Violation[];
}

/**
 * The seeded generator. Two methods only, because a model that reaches for a
 * distribution the engine does not supply is a model whose randomness the
 * engine cannot reproduce.
 */
export interface Rng {
  /** The next value in [0, 1). */
  next(): number;
  /** The next whole number in [0, n). Zero when n is zero or less. */
  int(n: number): number;
}

/**
 * WHAT A DOMAIN MODEL IS. The economics session implements one of these and
 * the governance build implements the other.
 *
 * `step` is pure: it reads the state it is handed, mutates nothing, and
 * returns a new state. `flags` says what a member should know about the cycle
 * that just ran. `invariants` says what is broken, and one non-empty answer
 * stops the proposed pass at that cycle.
 */
export interface DomainModel {
  /** Which half of the village this model speaks for. */
  name: "governance" | "economics";
  /** One cycle. Pure, and it returns a new state. */
  step(state: SimState, cycle: number, rng: Rng): SimState;
  /** What is worth saying about this cycle, in plain language. */
  flags(state: SimState, cycle: number): Flag[];
  /** What is broken. Empty means the state holds together. */
  invariants(state: SimState): Violation[];
}

/** What a run answers with. */
export interface SimResult {
  /** The same snapshot run forward with nothing decided. */
  baseline: CycleResult[];
  /** The same snapshot run forward with the change set applied. */
  proposed: CycleResult[];
  /** Where the two final states differ. */
  diff: Diff[];
  /** Every flag from the proposed pass, in the order they were raised. */
  flags: Flag[];
  /** Every violation from the proposed pass. The first one stopped it. */
  violations: Violation[];
  /** The seed this run used, so anybody can run it again and get this. */
  seed: number;
}
