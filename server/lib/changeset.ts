/**
 * EXECUTING A TYPED CHANGE SET, IN TWO PHASES, THROUGH THE EXISTING WRITERS.
 *
 * ── WHAT THIS REPLACES ─────────────────────────────────────────────────────
 *
 * `applyMechanicsProposal` lived inside `server/index.ts` and walked a change
 * set writing as it went: refuse this key, set that one, refuse the next,
 * stamp `applied` if anything at all went through. An element it could not
 * type was SKIPPED, the proposal was still marked applied, the proposer was
 * still told it went through, and the admin route answered 207 partial. So a
 * village could pass six changes, have four land, and read a page that said
 * yes.
 *
 * ── TWO PHASES, AND WHY NOT A TRANSACTION ──────────────────────────────────
 *
 * The obvious fix is one transaction. It is unimplementable through the writers
 * this platform actually has, and pretending otherwise would be worse than the
 * bug:
 *
 *   setVariable          mutates a module-level overrides object
 *   setWeight            opens its own connection and commits
 *   setModuleLifecycle   mutates a settings map and reconciles a graph
 *   the collection writers write through a cache
 *
 * A rollback would leave the process serving values the database denies until
 * somebody restarts it. So atomicity comes from PRE-VALIDATION:
 *
 *   Phase 1  Validate every element. Every existing refusal runs here. Nothing
 *            is written. One failure and the whole set is refused, naming the
 *            element by its index and its own words.
 *   Phase 2  Apply, irreversible writes LAST, one `governance_element_ledger`
 *            row per write, then reload every written-through cache from the
 *            database so no cache is serving a value the tables disagree with.
 *
 * `docs/GOVERNANCE.md` says this out loud, because a member reading "applied
 * atomically" and a contributor reading this file have to be told the same
 * thing.
 *
 * ── WHAT ORDERING "IRREVERSIBLE LAST" MEANS HERE ───────────────────────────
 *
 * A dial can be set back by another vote. A weight allocation can be set back.
 * A module lifecycle can be moved back. A queued minting rule can be re-queued.
 * None of those are irreversible in the strong sense, and this platform's one
 * genuinely irreversible act (posting to the ledger) is not reachable from a
 * change set at all today. So the ordering rule is honoured by RANK and the
 * ranks are written down: the further down `WRITE_ORDER`, the harder the write
 * is to undo, and a set applies in that order so a failure halfway leaves the
 * cheapest half standing rather than the dearest.
 *
 * ── WHAT A CHANGE SET MAY NEVER DO ─────────────────────────────────────────
 *
 * Switch the governance module off. A change set that turned governance off
 * would strand every open ballot behind a 404 while the landing job kept
 * running, and the vote that turned it back on could not be held. The module id
 * is on `NEVER_BY_CHANGESET` and the refusal names it.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import { VARIABLES_BY_KEY, applyTimingOf, ringOf } from "../../shared/gameVariables";
import { isMintRuleKey } from "../../shared/mintRuleKeys";
import { asChangeItem, type ChangeInput, type ChangeItem } from "./mechanics";
import { kindOfItem, kindOfSet, type GovernanceKind } from "../../shared/governanceKinds";
import { setVariable, type SetResult } from "./variables";
import { applyMintRuleChanges } from "./economy";
import { setWeight, weightChangeProblem, weightTokenProblem } from "./governanceWeights";
import { effectiveLifecycle, setModuleLifecycle } from "./modules";
import { MODULES_BY_ID, type ModuleLifecycle } from "../../shared/modules";

/**
 * Modules whose lifecycle a change set may never move, whatever the vote said.
 * One entry, and it is the module the vote itself runs on.
 */
export const NEVER_BY_CHANGESET: ReadonlySet<string> = new Set(["governance"]);

/**
 * The kinds this build can actually carry out, in the order they are applied.
 * Earlier is cheaper to undo. This list and `EXECUTABLE_ITEM_KINDS` in
 * `server/lib/mechanics.ts` hold the same set: that one is what the validator
 * refuses at proposal time, this one is the ORDER, which is a property of the
 * executor and belongs beside it. A kind absent from here throws before the
 * first write rather than being skipped.
 */
export const WRITE_ORDER: readonly string[] = [
  "dial",
  "module_lifecycle",
  "mint_rule",
  "weight_allocation",
  "mode_switch",
];

const rankOf = (kind: string): number => {
  const i = WRITE_ORDER.indexOf(kind);
  return i === -1 ? WRITE_ORDER.length : i;
};

/** Thrown before any write when a set holds an element this build cannot type. */
export class UntypedElementError extends Error {
  constructor(
    readonly index: number,
    readonly kind: string,
    message: string,
  ) {
    super(message);
    this.name = "UntypedElementError";
  }
}

export interface ChangesetDeps {
  pool: Pool;
  /** The amendment ledger writer. Never throws into its caller, by contract. */
  recordMechanicsChange: (
    key: string,
    result: { value?: string; previous?: string | null },
    actor: string | null,
    source: string,
    proposalRef: string,
    note: string | null,
  ) => Promise<void>;
  /** Reload every written-through cache from the database. */
  reloadCaches: () => Promise<void>;
  /** The lifecycle guard `setModuleLifecycle` asks for. */
  sharedPasswordPosture: () => boolean;
}

export interface ValidatedElement {
  index: number;
  item: ChangeItem;
  kind: GovernanceKind;
  /** The value in force right now, for the ledger's `old_value`. */
  oldValue: string | null;
  /** What the element would write. */
  newValue: string;
  /** The human sentence the ledger row carries. */
  sentence: string;
}

export type ValidationResult =
  | { ok: true; elements: ValidatedElement[]; kind: GovernanceKind }
  | { ok: false; index: number; itemKind: string; problem: string; sentence: string };

/**
 * PHASE 1. Every refusal this platform already has, run against every element,
 * writing nothing.
 *
 * The index is part of the answer and not a nicety: a member told "item four of
 * seven could not be applied and here is why" can fix it, and a member told
 * "the proposal could not be applied" cannot.
 */
export async function validateElements(
  deps: ChangesetDeps,
  changes: readonly ChangeInput[],
): Promise<ValidationResult> {
  const elements: ValidatedElement[] = [];
  const refuse = (index: number, itemKind: string, problem: string): ValidationResult => ({
    ok: false,
    index,
    itemKind,
    problem,
    sentence: `Item ${index + 1} of ${changes.length} (${itemKind}) could not be applied: ${problem}`,
  });

  for (let index = 0; index < changes.length; index += 1) {
    const raw = changes[index];
    let item: ChangeItem;
    try {
      item = asChangeItem(raw);
    } catch {
      return refuse(index, "unknown", "this build cannot read that as a change");
    }
    const kind = kindOfItem(item.kind);

    if (item.kind === "dial") {
      const def = VARIABLES_BY_KEY[item.key];
      if (!def) return refuse(index, item.kind, "this dial no longer exists in the registry");
      if (ringOf(def) !== "open") return refuse(index, item.kind, "this dial is no longer community-governable");
      const previous = await currentDialValue(deps, item.key);
      elements.push({
        index,
        item,
        kind,
        oldValue: previous,
        newValue: String(item.to),
        sentence: `${item.key} moves from ${previous ?? "its default"} to ${item.to}`,
      });
      continue;
    }

    if (item.kind === "mint_rule") {
      if (!isMintRuleKey(item.key)) {
        return refuse(index, item.kind, "this build cannot read that as one of the village's minting rules");
      }
      elements.push({
        index,
        item,
        kind,
        oldValue: (raw as { from?: string }).from ?? null,
        newValue: String(item.to),
        sentence: `${item.key} is queued to become ${item.to} at the next moon`,
      });
      continue;
    }

    if (item.kind === "weight_allocation") {
      const problem = weightChangeProblem({ weight: item.to, note: item.note });
      if (problem) return refuse(index, item.kind, problem.toLowerCase());
      const before = await currentWeight(deps, item.userId);
      elements.push({
        index,
        item,
        kind,
        oldValue: before === null ? null : String(before),
        newValue: String(item.to),
        sentence: `the allocation for ${item.userId} moves from ${before ?? "nothing"} to ${item.to}`,
      });
      continue;
    }

    if (item.kind === "mode_switch") {
      const def = VARIABLES_BY_KEY["governance.weight_mode"];
      const choices = (def?.choices ?? []).map((c) => c.value);
      if (!choices.includes(String(item.to))) {
        return refuse(index, item.kind, `${item.to} is not one of the ways this platform assigns weight`);
      }
      /*
       * A TOKEN MONEY CAN BUY IS NOT WHAT WEIGHS A VOTE, and this is the one
       * door that could have walked past that rule. `weightTokenProblem`
       * refuses at every ballot open, so a village that switched into token
       * mode on a purchasable token would find no ballot would open at all and
       * nothing would say why until somebody read the source.
       */
      if (String(item.to) === "token") {
        const token = String(item.weightToken ?? "").trim() || (await currentDialValue(deps, "governance.weight_token")) || "";
        const problem = weightTokenProblem(token);
        if (problem) return refuse(index, item.kind, problem.toLowerCase());
      }
      const previous = await currentDialValue(deps, "governance.weight_mode");
      elements.push({
        index,
        item,
        kind,
        oldValue: previous,
        newValue: String(item.to),
        sentence: `how voting weight is assigned moves from ${previous ?? "equal"} to ${item.to}`,
      });
      continue;
    }

    if (item.kind === "module_lifecycle") {
      const def = MODULES_BY_ID[item.moduleId];
      if (!def) return refuse(index, item.kind, `there is no part of the Game called ${item.moduleId}`);
      if (NEVER_BY_CHANGESET.has(item.moduleId)) {
        return refuse(
          index,
          item.kind,
          "the part of the Game that holds the vote cannot be switched by a vote. Open ballots would have nowhere to live and the vote to switch it back could not be held",
        );
      }
      const before = effectiveLifecycle(item.moduleId);
      elements.push({
        index,
        item,
        kind,
        oldValue: before,
        newValue: String(item.to),
        sentence: `${def.name} moves from ${before} to ${item.to}`,
      });
      continue;
    }

    return refuse(index, item.kind, "this build cannot carry out a change of that kind yet");
  }

  elements.sort((a, b) => rankOf(a.item.kind) - rankOf(b.item.kind) || a.index - b.index);
  return { ok: true, elements, kind: kindOfSet(elements.map((e) => e.item.kind)) };
}

/** The value in force for a dial right now, or null when it sits at its default. */
async function currentDialValue(deps: ChangesetDeps, key: string): Promise<string | null> {
  const [rows] = await deps.pool.query<RowDataPacket[]>(
    "SELECT value FROM game_variables WHERE config_key = ?",
    [key],
  );
  if (rows[0]) return String(rows[0].value);
  return VARIABLES_BY_KEY[key]?.default ?? null;
}

async function currentWeight(deps: ChangesetDeps, userId: string): Promise<number | null> {
  const [rows] = await deps.pool.query<RowDataPacket[]>(
    "SELECT weight FROM governance_weights WHERE user_id = ?",
    [userId],
  );
  return rows[0] ? Number(rows[0].weight) : null;
}

export interface ElementLedgerInput {
  ballotId: string;
  elementIndex: number;
  elementKind: string;
  sentence: string;
  wroteTable: string | null;
  wroteId: string | null;
  oldValue: string | null;
  newValue: string | null;
}

/**
 * One row per write. Never throws into the caller: a trail that failed must not
 * fail the deed it is a trail OF, and this one is written between two writes
 * that have already happened.
 */
export async function recordElement(pool: Pool, input: ElementLedgerInput): Promise<void> {
  try {
    await pool.query(
      "INSERT INTO governance_element_ledger " +
        "(ballot_id, element_index, element_kind, sentence, wrote_table, wrote_id, old_value, new_value) " +
        "VALUES (?,?,?,?,?,?,?,?)",
      [
        input.ballotId,
        input.elementIndex,
        input.elementKind,
        input.sentence.slice(0, 1000),
        input.wroteTable,
        input.wroteId,
        input.oldValue,
        input.newValue,
      ],
    );
  } catch (e) {
    console.error(`[governance] the element ledger refused a row for ballot ${input.ballotId} (the change stands)`, e);
  }
}

/** Every element ledger row for one decision, in the order the writes happened. */
export async function elementsFor(pool: Pool, ballotId: string): Promise<
  Array<{ index: number; kind: string; sentence: string; oldValue: string | null; newValue: string | null; appliedAt: string }>
> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT element_index, element_kind, sentence, old_value, new_value, applied_at " +
      "FROM governance_element_ledger WHERE ballot_id = ? ORDER BY id",
    [ballotId],
  );
  return rows.map((r) => ({
    index: Number(r.element_index),
    kind: String(r.element_kind),
    sentence: String(r.sentence),
    oldValue: r.old_value === null || r.old_value === undefined ? null : String(r.old_value),
    newValue: r.new_value === null || r.new_value === undefined ? null : String(r.new_value),
    appliedAt: r.applied_at instanceof Date ? r.applied_at.toISOString() : String(r.applied_at),
  }));
}

export interface ApplySetInput {
  /** The ballot the ledger rows are keyed on. */
  ballotId: string;
  /** The amendment ledger's proposal marker. */
  proposalRef: string;
  actor: string | null;
  changes: readonly ChangeInput[];
}

export interface ApplySetResult {
  ok: boolean;
  /** Dial and mode keys that now hold their new value. */
  applied: string[];
  /** Minting keys queued onto a rule for a future cycle. */
  queued: string[];
  /** The cycle a queued minting change lands on, or null. */
  landsAtCycle: number | null;
  /** Set when phase 1 refused the set. Nothing was written. */
  refusal: { index: number; itemKind: string; problem: string; sentence: string } | null;
  /** Anything phase 2 could not do despite validating. Should be empty. */
  failed: Array<{ key: string; problem: string }>;
}

/**
 * PHASE 1 THEN PHASE 2. The one door a change set goes through.
 *
 * `landsAtCycle` is passed INTO the minting writer rather than recomputed
 * there, because `queueRuleChange` used to work out its own landing cycle from
 * `new Date()` at the moment of apply. A change set that validated on the 3rd
 * and landed on the 5th promised the village one moon and queued another.
 */
export async function applyChangeSet(deps: ChangesetDeps, input: ApplySetInput): Promise<ApplySetResult> {
  const validated = await validateElements(deps, input.changes);
  if (!validated.ok) {
    return {
      ok: false,
      applied: [],
      queued: [],
      landsAtCycle: null,
      refusal: { index: validated.index, itemKind: validated.itemKind, problem: validated.problem, sentence: validated.sentence },
      failed: [],
    };
  }

  const applied: string[] = [];
  const queued: string[] = [];
  const failed: Array<{ key: string; problem: string }> = [];
  let landsAtCycle: number | null = null;
  let touchedCaches = false;

  for (const el of validated.elements) {
    const item = el.item;

    if (item.kind === "dial" || item.kind === "mode_switch") {
      const key = item.kind === "dial" ? item.key : "governance.weight_mode";
      const r: SetResult = await setVariable(deps.pool, key, String(item.to));
      if (!r.ok) {
        failed.push({ key, problem: r.error ?? "refused" });
        continue;
      }
      await deps.recordMechanicsChange(
        key,
        r,
        input.actor,
        "governance",
        input.proposalRef,
        el.oldValue !== null && el.oldValue !== (r as { previous?: string | null }).previous
          ? `Baseline moved between proposal (${el.oldValue}) and apply (${(r as { previous?: string | null }).previous})`
          : null,
      );
      await recordElement(deps.pool, {
        ballotId: input.ballotId,
        elementIndex: el.index,
        elementKind: item.kind,
        sentence: el.sentence,
        wroteTable: "game_variables",
        wroteId: key,
        oldValue: el.oldValue,
        newValue: el.newValue,
      });
      applied.push(key);
      touchedCaches = true;
      // The weight token rides with the mode when the vote named one, because
      // switching into token mode without naming a token is a village that
      // weighs nothing.
      if (item.kind === "mode_switch" && item.weightToken) {
        const t = await setVariable(deps.pool, "governance.weight_token", String(item.weightToken));
        if (t.ok) {
          await deps.recordMechanicsChange("governance.weight_token", t, input.actor, "governance", input.proposalRef, null);
          applied.push("governance.weight_token");
        } else {
          failed.push({ key: "governance.weight_token", problem: t.error ?? "refused" });
        }
      }
      continue;
    }

    if (item.kind === "module_lifecycle") {
      const out = await setModuleLifecycle(item.moduleId, item.to as ModuleLifecycle, input.actor, {
        sharedPasswordPosture: deps.sharedPasswordPosture,
      });
      if (!out.ok) {
        failed.push({ key: `module:${item.moduleId}`, problem: out.error });
        continue;
      }
      await recordElement(deps.pool, {
        ballotId: input.ballotId,
        elementIndex: el.index,
        elementKind: item.kind,
        sentence: el.sentence,
        wroteTable: "module_settings",
        wroteId: item.moduleId,
        oldValue: el.oldValue,
        newValue: el.newValue,
      });
      applied.push(`module:${item.moduleId}`);
      touchedCaches = true;
      continue;
    }

    if (item.kind === "weight_allocation") {
      try {
        const out = await setWeight(deps.pool, {
          userId: item.userId,
          weight: Number(item.to),
          actorUserId: input.actor ?? "governance",
          note: item.note,
        });
        await recordElement(deps.pool, {
          ballotId: input.ballotId,
          elementIndex: el.index,
          elementKind: item.kind,
          sentence: el.sentence,
          wroteTable: "governance_weights",
          wroteId: out.changeId || item.userId,
          oldValue: el.oldValue,
          newValue: el.newValue,
        });
        applied.push(`weight:${item.userId}`);
      } catch (e) {
        failed.push({ key: `weight:${item.userId}`, problem: e instanceof Error ? e.message : "refused" });
      }
      continue;
    }
  }

  const mintItems = validated.elements.filter((e) => e.item.kind === "mint_rule");
  if (mintItems.length > 0) {
    const out = await applyMintRuleChanges(
      deps.pool,
      mintItems.map((e) => ({ key: (e.item as { key: string }).key, from: e.oldValue ?? "", to: e.newValue })),
      input.actor ?? "governance",
    );
    failed.push(...out.failed);
    for (const q of out.queued) {
      queued.push(q.key);
      landsAtCycle = q.fromCycle;
      const el = mintItems.find((e) => (e.item as { key: string }).key === q.key);
      await deps.recordMechanicsChange(
        q.key,
        { value: q.to, previous: q.from },
        input.actor,
        "governance",
        input.proposalRef,
        `Carried by the village and queued on the rule. It takes effect at cycle ${q.fromCycle}.`,
      );
      await recordElement(deps.pool, {
        ballotId: input.ballotId,
        elementIndex: el?.index ?? 0,
        elementKind: "mint_rule",
        sentence: `${q.key} is queued to become ${q.to} at cycle ${q.fromCycle}`,
        wroteTable: "mint_rules",
        wroteId: q.key,
        oldValue: q.from,
        newValue: q.to,
      });
    }
  }

  /*
   * THE CACHES COME BACK FROM THE DATABASE, ALWAYS, and never from what this
   * routine believes it just wrote. A module lifecycle change reconciles a
   * graph, a dial writes through a delta store, and a role write goes through a
   * repository cache. Re-deriving the in-process state from the tables is the
   * only way "the page and the database agree" survives a half-applied set.
   */
  if (touchedCaches || applied.length > 0) await deps.reloadCaches();

  return { ok: failed.length === 0, applied, queued, landsAtCycle, refusal: null, failed };
}

export interface LegacyProposal {
  id: string;
  title: string;
  changeSet: ChangeInput[];
  proposerUserId: string;
  hyphaRef: string | null;
  status: string;
  ballotId?: string | null;
}

/**
 * THE ONE APPLY, for a mechanics or minting proposal.
 *
 * Moved here from `server/index.ts` unchanged in what it means and changed in
 * two ways that matter:
 *
 *  1. It THROWS BEFORE ITS FIRST WRITE on any element it cannot type. It used
 *     to skip such an element and stamp the proposal applied anyway. The admin
 *     apply route turns the throw into a 409 naming the element; nothing
 *     answers 207 any more, because a partly-applied decision is a state the
 *     village cannot read.
 *  2. It goes through `applyChangeSet`, so validation happens before any write
 *     and every write leaves an element-ledger row.
 *
 * Idempotent: an already-applied proposal returns cleanly.
 */
export async function applyMechanicsProposal(
  deps: ChangesetDeps,
  p: LegacyProposal,
  actor: string | null,
  hooks: {
    onApplied: (p: LegacyProposal, result: ApplySetResult) => Promise<void>;
  },
): Promise<ApplySetResult> {
  if (p.status === "applied") {
    return { ok: true, applied: [], queued: [], landsAtCycle: null, refusal: null, failed: [] };
  }

  // Typed before anything is touched. `EXECUTABLE_ITEM_KINDS` lives in
  // shared/ballotSubjects.ts and is widened as each executor lands; an element
  // outside it is a decision this build cannot carry out, and saying so loudly
  // is the only honest answer.
  for (let i = 0; i < p.changeSet.length; i += 1) {
    let kind: string;
    try {
      kind = asChangeItem(p.changeSet[i]).kind;
    } catch {
      throw new UntypedElementError(i, "unknown", `Item ${i + 1} of ${p.changeSet.length} is not a change this build can read.`);
    }
    if (!WRITE_ORDER.includes(kind)) {
      throw new UntypedElementError(
        i,
        kind,
        `Item ${i + 1} of ${p.changeSet.length} is a ${kind} change, and this build has no executor for it. Nothing was applied.`,
      );
    }
  }

  const proposalRef = `gm:${p.id}${p.hyphaRef ? ` ${p.hyphaRef}` : ""}${p.ballotId ? ` bal:${p.ballotId}` : ""}`.slice(0, 255);
  const result = await applyChangeSet(deps, {
    ballotId: p.ballotId ?? `gmp:${p.id}`,
    proposalRef,
    actor,
    changes: p.changeSet,
  });

  if (result.applied.length > 0 || result.queued.length > 0) {
    await deps.pool.query("UPDATE mechanics_proposals SET status = 'applied' WHERE id = ?", [p.id]);
    await hooks.onApplied(p, result);
  }
  return result;
}

/**
 * THE AMENDMENT LEDGER'S ONE WRITER.
 *
 * Every mechanics change lands here or it did not happen: an admin edit, a
 * routed legacy field, a platform migration, a passed proposal. Moved out of
 * `server/index.ts` by the dispatcher lane, unchanged, because it belongs
 * beside the executor that calls it and the file it left is the one the ratchet
 * exists to shrink.
 *
 * A no-op (the value did not move) writes nothing. It never throws into its
 * caller: like `recordEvent`, this is a trace of a change that already
 * happened, and a trace that failed must not fail the deed it is a trace OF.
 */
export async function recordMechanicsChangeRow(
  pool: Pool,
  key: string,
  result: { value?: string; previous?: string | null },
  actorUserId: string | null,
  source: "admin" | "governance" | "platform",
  proposalRef?: string | null,
  note?: string | null,
): Promise<void> {
  if (result.value === result.previous) return;
  try {
    const def = VARIABLES_BY_KEY[key];
    await pool.query(
      "INSERT INTO mechanics_changes (id, config_key, old_value, new_value, actor_user_id, source, proposal_ref, note) VALUES (?,?,?,?,?,?,?,?)",
      [
        `mech-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        key,
        // NULL means "the platform default at the time": the row records the
        // village's act, and not a snapshot of the platform's defaults.
        result.previous === def?.default ? null : result.previous ?? null,
        result.value === def?.default ? null : result.value ?? null,
        actorUserId,
        source,
        proposalRef ?? null,
        note ?? null,
      ],
    );
  } catch (e) {
    console.error(`[mechanics] amendment ledger write failed for ${key} (change stands)`, e);
  }
}

/**
 * A SET HOLDING ANY CYCLE-TIMED DIAL WAITS FOR THE BOUNDARY AS A WHOLE.
 *
 * Atomicity beats promptness: half a set landing now and half at the moon is a
 * decision the village never made. Moved out of `server/index.ts` beside the
 * executor that reads it.
 */
export const changeSetWaitsForCycleClose = (changeSet: readonly { key?: string }[]): boolean =>
  changeSet.some((c) => {
    const def = VARIABLES_BY_KEY[String(c?.key ?? "")];
    return def ? applyTimingOf(def) === "cycle-close" : false;
  });
