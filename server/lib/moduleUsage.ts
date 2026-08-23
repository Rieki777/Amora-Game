/**
 * THE METER: what "a village used this module" means, decided on purpose.
 *
 * R58c, the founder: "let's leave it all $ReGen awards to all modules based on
 * usage and making them all free to use for any villages as a default." Nothing
 * in the platform measured usage, so the ruling had no arithmetic under it.
 * This file is that arithmetic's input, and every choice in it is a choice
 * about what the pool rewards, so they are all written down.
 *
 * ── THE UNIT: ONE MEMBER, ONE MODULE, ONE CYCLE ─────────────────────────────
 *
 * A member who opens a module during a lunar cycle counts 1 for that module,
 * that cycle. Opening it again counts 0. Writing in it counts 0. Writing in it
 * two hundred times counts 0. The count SATURATES, and that single property is
 * what makes the measure hard to game.
 *
 * ── THE THREE MEASURES THIS REJECTS, AND WHY ────────────────────────────────
 *
 * 1. PAGE VIEWS or requests. Rewards noise. A module with an auto-refreshing
 *    panel, or one that splits its screen into six tabs, out-earns a module a
 *    village opens once a month and trusts completely. The busiest module is
 *    not the most useful one, and a measure that cannot tell them apart pays
 *    for restlessness. It is also the most expensive thing to collect: a
 *    counter written on every request is the write amplification problem.
 *
 * 2. WRITES. Rewards nagging. A module that asks every member how they feel
 *    each morning out-earns the module holding the village's land agreements,
 *    which is used four times a year and matters more than anything else on the
 *    list. Any module can also multiply its own score by splitting one action
 *    into six rows, and nothing outside that module can tell that apart from
 *    six real actions.
 *
 * 3. WHETHER THE VILLAGE HAS IT ON. Rewards installation. Shelfware earns
 *    exactly as much as a module the village lives inside, an admin turning on
 *    twelve modules to look at them pays all twelve, and the number a builder
 *    optimises becomes catalog presence. It also cannot distinguish the two
 *    states anybody actually cares about: on and loved, on and forgotten.
 *
 * (A fourth, dwell time, was rejected before it was written down: it needs
 * client beacons, it is the easiest of all to fabricate, and it measures how
 * long a module detained somebody.)
 *
 * The saturating member-cycle defeats 1 and 2 in one stroke, because extra
 * views and extra writes both add zero, and it defeats 3 because an unopened
 * module scores nothing however proudly it is enabled. The only way to move the
 * number is to be opened by MORE DIFFERENT PEOPLE, which is the one thing a
 * module cannot manufacture without being wanted.
 *
 * ── PER VILLAGE OR PER MEMBER: BOTH ─────────────────────────────────────────
 *
 * The founder's own example is the test: "A module used by three people in a
 * village of four is doing better than one used by three in a village of four
 * hundred." So a village's contribution to a module's weight is a FRACTION,
 * `membersReached / activeMembers`, which is 0.75 in the first village and
 * 0.0075 in the second. Each village contributes at most 1.0 to any module, so
 * a large village cannot outvote a small one and the hub is summing comparable
 * things.
 *
 * The denominator is ACTIVE members and never registered members: members who
 * opened at least one module in that cycle. A village of four hundred where
 * four people show up is measured against the four who were there. Otherwise a
 * quiet village drags every module it runs toward zero, and builders would be
 * paid for their villages' liveliness instead of for their own work.
 *
 * ── WHAT A FORK IS TRUSTED WITH, WHICH IS AS LITTLE AS POSSIBLE ─────────────
 *
 * The hub reads what forks report, and a fork runs its own code on its own
 * database. It can print any number it likes. Nothing here changes that and
 * nothing here pretends to.
 *
 * What is trusted: nothing about magnitude. What makes it survivable is the
 * CAP. Because a village's contribution is a fraction of its own active
 * members, it can never exceed 1.0 for a module however many members it invents
 * or however often they are made to click. Inflating members inflates the
 * denominator as fast as the numerator. So the most a dishonest village can
 * win for its favourite module is one village's worth of weight, which is what
 * an honest village that loves that module already gets.
 *
 * That leaves exactly one real attack, and it is worth naming plainly because
 * this file cannot close it: SYBIL VILLAGES. Standing up fifty deployments that
 * each report 1.0 for your module is fifty times the weight, and no code in a
 * village can detect that a different village is fake. Only the hub can, by
 * deciding which instances it counts. The report carries the deployment's
 * instance identity (S62) precisely so the hub has something to decide about,
 * and it carries `activeMembers` so the hub can weigh a claim against what it
 * knows about that village's size. The defence is a hub membership decision,
 * and calling it anything else here would be a green that means nothing.
 *
 * ── PRIVACY: AGGREGATE AT THE POINT OF WRITING ──────────────────────────────
 *
 * Usage counts must not become a way to see what an individual member did.
 * Distinct-counting has to know who, so identity exists only while a cycle is
 * open, in `module_usage_marks`, and the seal deletes it. What survives is
 * `(module, cycle, members_reached, active_members)` and no person at all.
 *
 * Nothing that leaves this deployment ever carries a member id, and nothing a
 * surface renders is per-member. 0101's header states exactly what an operator
 * can and cannot see, and why a salted hash was considered and dropped.
 *
 * ── COST: A PRESENCE BIT, NOT A COUNTER ─────────────────────────────────────
 *
 * `shared/modulePool.ts` kept itself ignorant of village state deliberately,
 * and its reasoning still holds: it stays a pure function of the registry and
 * learns nothing from here. What that header could not answer is how to measure
 * usage without a write on every request, and the saturating unit is the
 * answer. A bit that is written once and then never again does not need a
 * counter: `seen` below holds the marks this process has already written, so a
 * member's second and every later request costs zero writes and zero queries.
 *
 * The ceiling is `activeMembers x modules` inserts per lunar cycle. Four
 * hundred members across twenty-three modules is about nine thousand inserts a
 * month, which is less than this platform writes for notifications in a day.
 */
import type { Pool } from "mysql2/promise";
import { cycleIdFor } from "./gratitude-cycles";
import { instanceIdentity } from "./identity";
import { registerJob } from "./scheduler";
import {
  cyclesAwaitingSeal,
  markUse,
  openCycleUsage,
  sealCycle,
  sealedCycleUsage,
  type CycleUsage,
} from "../repos/moduleUsage";

let pool: Pool | null = null;

/**
 * Marks this process has already written, as `cycle|module|member`.
 *
 * Per process and never shared, which is correct: a mark another process wrote
 * is already in the database, and `INSERT IGNORE` makes a duplicate attempt a
 * no-op rather than a conflict. The set is only ever an optimisation, so losing
 * it on restart costs one redundant insert per member per module and nothing
 * else. It is cleared when the cycle turns so it cannot grow without bound.
 */
let seen = new Set<string>();
let seenCycle = "";

export function initModuleUsage(p: Pool): void {
  pool = p;
  registerJob("module-usage-seal", 60 * 60 * 1000, async () => {
    if (!pool) return;
    const open = cycleIdFor();
    const due = await cyclesAwaitingSeal(pool, open);
    if (!due.length) return;
    let dropped = 0;
    for (const cycleId of due) dropped += await sealCycle(pool, cycleId);
    return `sealed ${due.length} cycle(s), ${dropped} marks aggregated and dropped`;
  });
}

/**
 * Record that a member opened a module. Never throws into the caller.
 *
 * This sits on the request path of every module route in the platform, so it
 * has one job and one posture: be free when the mark already exists, and never
 * cost a member their page when it does not. A meter that can 500 a village's
 * library is worse than no meter.
 *
 * Deliberately not awaited by `requireModule`. The mark describes a request
 * that is already being served, so nothing about the response depends on it,
 * and making the gate wait on a write would put the meter in front of every
 * module page in the product.
 */
export function markModuleUse(moduleId: string, rawUserId: string | null): void {
  if (!pool || !rawUserId) return;
  // Truncated HERE and not only in the repo, so the key this process remembers
  // is the key the database stores. Two ids sharing a 64-character prefix would
  // otherwise collide in the row and stay distinct in memory, and the set would
  // keep re-issuing a write that can never land.
  const userId = rawUserId.slice(0, 64);
  const cycleId = cycleIdFor();
  if (cycleId !== seenCycle) {
    seen = new Set();
    seenCycle = cycleId;
  }
  const key = `${cycleId}|${moduleId}|${userId}`;
  if (seen.has(key)) return;
  seen.add(key);
  void markUse(pool, cycleId, moduleId, userId).catch((e) => {
    // The mark is lost and the member keeps their page. Drop the key so the
    // next request retries rather than trusting a write that did not land.
    seen.delete(key);
    console.error(`[moduleUsage] could not mark ${moduleId}`, e);
  });
}

/**
 * What one village contributes to each module's weight, as a fraction in [0,1].
 *
 * A module absent from the map contributed nothing, which is the same fact as
 * contributing zero and is stored as neither.
 */
export function reachWeights(usage: CycleUsage): Map<string, number> {
  const weights = new Map<string, number>();
  if (usage.activeMembers <= 0) return weights;
  for (const m of usage.modules) {
    // CLAMPED, and the clamp is load-bearing. The cap at one village, one vote
    // is the whole anti-inflation argument in this file's header, and until
    // this line nothing enforced it: it was a property of how the numerator and
    // denominator are normally computed, which is a different thing from a rule.
    // A partial re-seal, or a numerator and denominator read a moment apart,
    // can put reach above 1, and a claim that is true by habit is the kind that
    // stops being true without anybody noticing.
    weights.set(m.moduleId, Math.min(1, m.membersReached / usage.activeMembers));
  }
  return weights;
}

export interface VillageUsageReport {
  /** Which deployment is claiming this. The hub decides whether it counts. */
  instanceId: string;
  cycleId: string;
  sealed: boolean;
  activeMembers: number;
  modules: Array<{ moduleId: string; membersReached: number; reach: number }>;
}

/**
 * The report a hub reads, and the only shape usage leaves this deployment in.
 *
 * Carries no member id, by construction: it is built from counts. `reach` is
 * pre-divided so the hub is never handed a numerator it could combine with
 * anything else, and `sealed` is here because an open cycle's numbers are still
 * moving and must never be settled against.
 */
export async function villageUsageReport(cycleId?: string): Promise<VillageUsageReport> {
  const open = cycleIdFor();
  const id = cycleId ?? open;
  const usage = await cycleUsage(id);
  const weights = reachWeights(usage);
  return {
    instanceId: instanceIdentity().instanceId,
    cycleId: id,
    sealed: usage.sealed,
    activeMembers: usage.activeMembers,
    modules: usage.modules
      .map((m) => ({
        moduleId: m.moduleId,
        membersReached: m.membersReached,
        reach: weights.get(m.moduleId) ?? 0,
      }))
      .sort((a, b) => b.reach - a.reach || (a.moduleId < b.moduleId ? -1 : 1)),
  };
}

/**
 * A cycle's usage, sealed if it has been sealed and live if it is still open.
 *
 * Sealed is checked first so a cycle that has been sealed always reports its
 * final numbers, even in the moment before the marks are gone.
 */
export async function cycleUsage(cycleId: string): Promise<CycleUsage> {
  if (!pool) return { cycleId, activeMembers: 0, sealed: false, modules: [] };
  const sealed = await sealedCycleUsage(pool, cycleId);
  if (sealed.sealed) return sealed;
  return openCycleUsage(pool, cycleId);
}
