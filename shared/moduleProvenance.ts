/**
 * PROVENANCE AND THE USAGE REPORT: the wire format, and the authority on it.
 *
 * THIS FILE IS THE CONTRACT, not a document about one. A counter reads this
 * shape; a village writes it. Where prose anywhere disagrees with the types
 * below, the types are right.
 *
 * ── WHY THIS EXISTS AT ALL (R72, the third clause) ──────────────────────────
 *
 * Rye: "we need to build this all out so that when we fork this code all
 * future games come with this ability to track module use and provenance
 * across the ecosystem."
 *
 * The arrangement that clause rules out is the one that was here: a counter
 * keeps its own hand-maintained list of who built what, and asks one village
 * it already knows about for a manifest. Both halves break on a fork. A fork
 * is not on anybody's list, and a module written inside a fork was never in
 * the upstream registry to be listed. So the list has to stop being a list:
 *
 *   WHO BUILT IT travels with the module, in the registry entry, and the
 *   village republishes it in every report. A counter that has never heard of
 *   this deployment learns the credits from the report itself.
 *
 *   WHO USED IT is a count the village keeps for itself, in a shape any
 *   counter can read and check. The village names no counter and needs none.
 *
 * R64 is the reason both halves are shaped this way: "these tools and currency
 * aren't the governance domain of a single organisation, but very quickly to
 * form a network of them." Nothing here names ReGen Civics, points at it, or
 * needs it to be running. A fork counts itself the day it boots.
 *
 * ── THE IDENTIFIER, DECIDED ON PURPOSE ──────────────────────────────────────
 *
 * A builder is identified by a HANDLE plus the NAMESPACE that asserts it, and
 * never by a wallet address.
 *
 * An address in a registry file is asserted by whoever edits the file, in a
 * public repository, for a payment somebody else receives. A pull request
 * could redirect it and the diff would look like a typo fix. A handle is
 * asserted by the person being paid: they hold an account, they link their own
 * address inside their own profile, and the counter reads the address off the
 * profile at the moment it writes a statement. That was already the rule for
 * `builtByAccount` and it does not change.
 *
 * The NAMESPACE is what a fork adds to it, and it is load-bearing rather than
 * decorative. A bare handle only resolves if everybody shares one account
 * system, which is the assumption R64 refuses. Two counters exist the moment a
 * second organisation runs this code, and "alice" on one of them is a
 * different person from "alice" on the other. A report that says only "alice"
 * is a report that pays the wrong person as soon as the network it was written
 * for is more than one node wide. So a handle carries the name of the system
 * that asserts it, the pair travels with the module, and a counter that cannot
 * resolve the namespace holds the share instead of guessing.
 *
 * There is no default namespace, deliberately. Defaulting it to this
 * platform's own would weld one organisation into every fork, which is the
 * exact thing `scripts/check-brand-refs.mjs` exists to stop, and it would make
 * a fork's own builder silently claim an account on somebody else's system.
 *
 * ── WHAT THE SEAL MEANS, AND WHY NOTHING HERE WEAKENS IT ────────────────────
 *
 * After a cycle closes the per-member marks are deleted and only aggregates
 * survive, so the platform cannot say afterwards which member opened which
 * module. Everything below is built from counts. There is no field for a
 * member, no field that could hold one, and no way to add reporting detail
 * without changing this file, which is the point of the shape being here.
 *
 * ── WHAT A COUNTER MAY AND MAY NOT CONCLUDE ─────────────────────────────────
 *
 * `moduleUsageReportProblems` is the check a counter runs on a report it did
 * not build. It catches every lie that is internally visible: a reach above
 * the cap, a module reaching more people than were active, a denominator that
 * disagrees with itself, a sealed report with no seal time, a payout handle
 * with nowhere to resolve it, an address where a handle goes.
 *
 * It cannot catch a village that simply invents an honest-looking number, and
 * nothing running inside a village ever could. What limits that is the CAP: a
 * village contributes at most 1.0 to any module, so inflating members inflates
 * the denominator just as fast, and the most a dishonest village can win is
 * one village's worth of weight. The attack that is left is sybil VILLAGES,
 * and only a counter can answer it, by deciding which instances it counts.
 * `instanceId` and `activeMembers` are in the report so it has something to
 * decide about. Saying that plainly is worth more than a check that pretends.
 */
import { poolStatus } from "./modulePool";
import { isBuilderNamespace, type ModuleDef } from "./modules";

/**
 * The report format, versioned the way `village/1` is.
 *
 * A consumer branches on this string and never on a platform version number.
 * A fork that turned a module off is not an older fork, it is a differently
 * shaped one, and semver cannot say that.
 */
export const MODULE_USAGE_PROTOCOL = "module-usage/1";

/**
 * A handle, checked for shape and nothing else.
 *
 * Copied character for character from `isBuilderHandle` in `modulePool.ts`,
 * which copied it from the hub's own rule, so a handle one accepts and another
 * cannot store never exists. Lowercase letters, digits and hyphens, never
 * starting or ending on a hyphen.
 */
const HANDLE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;

/** Who wrote a module, as it travels. Derived, never stored. */
export interface ModuleProvenance {
  moduleId: string;
  /** The credit line a reader sees. Null when the platform wrote it. */
  builtBy: string | null;
  /** The account a share is settled against. Null when nobody is owed. */
  builderHandle: string | null;
  /** The system that asserts the handle. Null exactly when the handle is. */
  builderNamespace: string | null;
  /**
   * Nobody outside the platform is credited, so the share is owed to nobody
   * and returns to the pool (R59). Core modules are platform built too: they
   * are the game the platform is born playing.
   */
  platformBuilt: boolean;
  /**
   * Where an eligible module's share goes, from `poolStatus`. Carried so the
   * RECYCLING is visible in what a village publishes rather than only on its
   * own page, which is what R59 asks for: an author or a village should see
   * the platform's share going back in.
   */
  disposition: "paid" | "recycled" | "none";
}

/**
 * Read a module's provenance off its registry entry.
 *
 * The registry entry is the single source of truth for who built a module, and
 * this is the only function that reads it. A fork inherits the entry by
 * pulling the code, so provenance travels with the module by construction and
 * there is no second place for it to drift.
 */
export function moduleProvenance(def: ModuleDef): ModuleProvenance {
  const builtBy = def.builtBy?.trim() || null;
  const builderHandle = def.builtByAccount?.trim() || null;
  return {
    moduleId: def.id,
    builtBy,
    builderHandle,
    builderNamespace: builderHandle ? def.builtByNamespace?.trim() || null : null,
    platformBuilt: builtBy === null,
    disposition: poolStatus(def).disposition,
  };
}

/** One module's line in a cycle's report. */
export interface ModuleUsageEntry extends ModuleProvenance {
  /** Distinct members who opened this module in this cycle. */
  membersReached: number;
  /**
   * Distinct members who opened ANY module in this cycle: the denominator.
   *
   * Repeated on every line, and it is the same number as the report's own
   * `activeMembers`. A line that carries its own denominator is a line a
   * counter can check without holding the rest of the report, which is what
   * `drizzle/0101_module_usage.sql` says about the column it comes from.
   */
  activeMembers: number;
  /**
   * `membersReached / activeMembers`, capped at 1.
   *
   * Pre-divided so a counter is never handed a numerator it could combine with
   * anything else, and capped because one village, one vote is the whole
   * anti-inflation argument.
   */
  reach: number;
}

/**
 * What a village publishes about one cycle, and the only shape usage leaves a
 * deployment in.
 *
 * `proof` is attached by the route, not by this file, and a consumer that
 * cannot verify signatures may ignore it: the numbers are the same either way.
 */
export interface ModuleUsageReport {
  protocol: string;
  /** Which deployment is claiming this. A counter decides whether it counts. */
  instanceId: string;
  cycleId: string;
  /** False while the cycle is open and the numbers are still moving. */
  sealed: boolean;
  /** When the marks were aggregated and dropped. Null while open. */
  sealedAt: string | null;
  activeMembers: number;
  modules: ModuleUsageEntry[];
}

/**
 * One village's contribution to one module's weight, as a fraction in [0,1].
 *
 * ONE implementation, called everywhere the fraction is needed, because the
 * CLAMP is the whole anti-inflation argument and a second copy of it is a
 * second place for it to go missing. A partial re-seal, or a numerator and a
 * denominator read a moment apart, can put the raw division above one, and a
 * cap that holds by habit is the kind that stops holding without anybody
 * noticing.
 */
export function reachOf(membersReached: number, activeMembers: number): number {
  if (activeMembers <= 0) return 0;
  return Math.min(1, membersReached / activeMembers);
}

/** Everything a report needs that is not provenance. */
export interface CycleCounts {
  cycleId: string;
  sealed: boolean;
  sealedAt: string | null;
  activeMembers: number;
  modules: Array<{ moduleId: string; membersReached: number }>;
}

/**
 * Build a report from counts and a registry, in one place so the server, the
 * tests and any fork agree on it.
 *
 * A module the registry does not know is DROPPED rather than reported with an
 * invented credit. That is a real case: a village keeps running a module that
 * upstream withdrew and deleted, and its marks outlive the entry. Reporting it
 * as platform built would credit the platform for somebody else's work, and a
 * fallback that invents a value is worse than the row not being there.
 */
export function buildModuleUsageReport(
  counts: CycleCounts,
  instanceId: string,
  defs: readonly ModuleDef[],
): ModuleUsageReport {
  const byId = new Map(defs.map((d) => [d.id, d]));
  const modules: ModuleUsageEntry[] = [];
  for (const m of counts.modules) {
    const def = byId.get(m.moduleId);
    if (!def) continue;
    modules.push({
      ...moduleProvenance(def),
      membersReached: m.membersReached,
      activeMembers: counts.activeMembers,
      reach: reachOf(m.membersReached, counts.activeMembers),
    });
  }
  modules.sort((a, b) => b.reach - a.reach || (a.moduleId < b.moduleId ? -1 : 1));
  return {
    protocol: MODULE_USAGE_PROTOCOL,
    instanceId,
    cycleId: counts.cycleId,
    sealed: counts.sealed,
    sealedAt: counts.sealedAt,
    activeMembers: counts.activeMembers,
    modules,
  };
}

/** Tolerance on the recomputed reach. A sender may round; it may not inflate. */
const REACH_EPSILON = 1e-9;

const whole = (n: unknown): boolean => Number.isSafeInteger(n) && (n as number) >= 0;

/**
 * Everything wrong with a report, as sentences, in the house style.
 *
 * Run it on a report you received before settling anything against it, and run
 * it on a report you built before serving it. Both callers exist: the village
 * refuses to serve a report that fails this, and a counter refuses to pay one.
 *
 * An empty list means the report is INTERNALLY consistent and says nothing
 * about whether the village told the truth. The file header says what limits
 * that and what does not.
 */
export function moduleUsageReportProblems(report: unknown): string[] {
  const problems: string[] = [];
  const r = report as Partial<ModuleUsageReport> | null;
  if (!r || typeof r !== "object") return ["the report is not an object"];

  if (r.protocol !== MODULE_USAGE_PROTOCOL) {
    problems.push(`the report says it speaks "${String(r.protocol)}" and this reader speaks "${MODULE_USAGE_PROTOCOL}"`);
  }
  if (typeof r.instanceId !== "string" || !r.instanceId.trim()) {
    problems.push("the report names no deployment, so there is nothing to decide whether to count");
  }
  if (typeof r.cycleId !== "string" || !r.cycleId.trim()) {
    problems.push("the report names no cycle");
  }
  if (typeof r.sealed !== "boolean") {
    problems.push("the report does not say whether its cycle is sealed, and an open cycle's numbers are still moving");
  }
  // The seal time is the counter's evidence that these numbers stopped
  // changing. A sealed report without one is a settlement with no date on it.
  if (r.sealed === true && (typeof r.sealedAt !== "string" || Number.isNaN(Date.parse(r.sealedAt)))) {
    problems.push("the report says its cycle is sealed and gives no seal time");
  }
  if (r.sealed === false && r.sealedAt !== null && r.sealedAt !== undefined) {
    problems.push("the report says its cycle is open and carries a seal time, so one of the two is wrong");
  }
  if (!whole(r.activeMembers)) {
    problems.push(`the report gives ${String(r.activeMembers)} active members, which is not a count`);
  }
  if (!Array.isArray(r.modules)) return [...problems, "the report carries no module list"];

  const seen = new Set<string>();
  for (const m of r.modules as ModuleUsageEntry[]) {
    const id = typeof m?.moduleId === "string" ? m.moduleId : "";
    if (!id) {
      problems.push("a line in the report names no module");
      continue;
    }
    if (seen.has(id)) problems.push(`module "${id}" appears twice, so its reach would be counted twice`);
    seen.add(id);

    if (!whole(m.membersReached)) {
      problems.push(`module "${id}" reports ${String(m.membersReached)} members reached, which is not a count`);
      continue;
    }
    if (!whole(m.activeMembers)) {
      problems.push(`module "${id}" reports ${String(m.activeMembers)} active members, which is not a count`);
      continue;
    }
    if (m.activeMembers !== r.activeMembers) {
      problems.push(`module "${id}" measures itself against ${m.activeMembers} active members and the report says ${String(r.activeMembers)}`);
    }
    if (m.membersReached > m.activeMembers) {
      problems.push(`module "${id}" reached ${m.membersReached} members out of ${m.activeMembers} who were active, which cannot happen`);
    }
    // THE CAP, checked rather than assumed. One village contributes at most
    // one village's worth of weight to any module, and until this line it was
    // a property of how the numbers are normally computed instead of a rule a
    // reader enforces.
    if (typeof m.reach !== "number" || !Number.isFinite(m.reach) || m.reach < 0 || m.reach > 1 + REACH_EPSILON) {
      problems.push(`module "${id}" claims a reach of ${String(m.reach)}, and a village contributes between none and one`);
    } else {
      const expected = reachOf(m.membersReached, m.activeMembers);
      if (Math.abs(m.reach - expected) > REACH_EPSILON) {
        problems.push(`module "${id}" claims a reach of ${m.reach} and its own counts give ${expected}`);
      }
    }
    problems.push(...provenanceProblems(m, id));
  }
  return problems;
}

/**
 * The payout identity, checked on the wire.
 *
 * Every sentence here names a state a counter has to act on differently, which
 * is why none of them collapses into "bad handle". A missing handle accrues
 * and the statement says what is missing. A malformed one resolves to nobody
 * and would report the same "no account" as a builder who never opened one, so
 * the two states would be indistinguishable at exactly the moment somebody is
 * owed money.
 */
function provenanceProblems(m: ModuleUsageEntry, id: string): string[] {
  const out: string[] = [];
  if (typeof m.platformBuilt !== "boolean") {
    out.push(`module "${id}" does not say whether the platform built it, and that decides whether its share is owed to anybody`);
  } else if (m.platformBuilt !== (m.builtBy === null || m.builtBy === undefined)) {
    out.push(`module "${id}" credits ${m.builtBy ? `"${m.builtBy}"` : "nobody"} and says platformBuilt is ${String(m.platformBuilt)}, so one of the two is wrong`);
  }
  if (m.builderHandle === null || m.builderHandle === undefined) {
    if (m.builderNamespace) {
      out.push(`module "${id}" names a namespace and no handle, so there is nobody in it to pay`);
    }
    return out;
  }
  if (typeof m.builderHandle !== "string") {
    out.push(`module "${id}" gives a payout handle that is not text`);
    return out;
  }
  if (!m.builtBy) {
    out.push(`module "${id}" names a payout handle and credits nobody. A payment needs a builder to pay`);
  }
  if (/^0x/i.test(m.builderHandle)) {
    // Checked before the shape, and exclusive of it, so the one mistake a
    // person is actually likely to make gets the sentence that explains it.
    out.push(`module "${id}" puts what looks like a wallet address where the payout handle goes. A builder links their own address in their own profile and a counter reads it there`);
  } else if (!HANDLE.test(m.builderHandle)) {
    out.push(`module "${id}" gives "${m.builderHandle}" as a payout handle. A handle is lowercase letters, digits and hyphens, with no at sign and no address`);
  } else if (typeof m.builderNamespace !== "string" || !isBuilderNamespace(m.builderNamespace)) {
    out.push(`module "${id}" gives a payout handle and no account system that asserts it, so a counter has nowhere to resolve "${m.builderHandle}"`);
  }
  return out;
}
