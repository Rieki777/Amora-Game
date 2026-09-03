import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { diffOf, initialState, orderedModels, simulate } from "./simulate";
import type { DomainModel, Flag, ProposedChange, SimState, VillageSnapshot, Violation } from "./types";

const HERE = path.dirname(fileURLToPath(import.meta.url));

const snapshot = (over: Partial<VillageSnapshot> = {}): VillageSnapshot => ({
  atIso: "2026-09-03T00:00:00.000Z",
  clock: { mode: "lunar", timezone: "UTC" },
  tokens: [{ slug: "voice", kind: "voice", decimals: 0, faucet: "sys:faucet", sinks: [] }],
  balances: {
    "mem:ada": { voice: BigInt(100) },
    "mem:bo": { voice: BigInt(300) },
  },
  mintRules: [
    { id: "rule-quest-voice", trigger: "quest.completed", tokenSlug: "voice", recipient: "member", amount: BigInt(5), ceiling: null, enabled: true },
  ],
  variables: { "governance.quorum_pct": "50", "governance.unity_pct": "80" },
  members: [
    { id: "ada", accountId: "mem:ada", stage: "resident", seats: [] },
    { id: "bo", accountId: "mem:bo", stage: "resident", seats: [] },
  ],
  modules: { quests: "public" },
  ...over,
});

/** A model that does nothing, so a test can say what it is testing. */
const inert = (name: DomainModel["name"] = "economics"): DomainModel => ({
  name,
  step: (state) => state,
  flags: () => [],
  invariants: () => [],
});

/** A model that spends the generator, so determinism is actually exercised. */
const spender = (): DomainModel => ({
  name: "economics",
  step: (state, _cycle, rng) => {
    const account = { ...(state.balances["mem:ada"] ?? {}) };
    account.voice = (account.voice ?? BigInt(0)) + BigInt(rng.int(1000));
    return { ...state, balances: { ...state.balances, "mem:ada": account } };
  },
  flags: () => [],
  invariants: () => [],
});

/** A model that writes one variable at one cycle. */
const writesAt = (cycle: number, key: string, value: string): DomainModel => ({
  name: "economics",
  step: (state, at) => (at === cycle ? { ...state, variables: { ...state.variables, [key]: value } } : state),
  flags: () => [],
  invariants: () => [],
});

/** A model that reports a violation once the run reaches a cycle. */
const breaksAt = (cycle: number): DomainModel => ({
  name: "economics",
  step: (state) => state,
  flags: () => [],
  invariants: (state: SimState): Violation[] =>
    state.cycle >= cycle ? [{ invariant: "economics.conservation", cycle: 0, detail: "the pool went short" }] : [],
});

const stringify = (value: unknown): string =>
  JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? `${v}n` : v));

const codes = (flags: Flag[]): string[] => flags.map((f) => f.code);

describe("simulate", () => {
  it("gives byte-equal results for the same input twice", () => {
    const input = { snapshot: snapshot(), changes: [], cycles: 4, seed: 2026 };
    const first = simulate(input, [inert("governance"), spender()]);
    const second = simulate(input, [inert("governance"), spender()]);
    expect(stringify(first)).toBe(stringify(second));
    // And the seed is the one that was asked for, printed in the answer.
    expect(first.seed).toBe(2026);
  });

  it("gives a different run for a different seed", () => {
    const base = { snapshot: snapshot(), changes: [], cycles: 4 };
    const a = simulate({ ...base, seed: 1 }, [spender()]);
    const b = simulate({ ...base, seed: 2 }, [spender()]);
    expect(stringify(a.baseline)).not.toBe(stringify(b.baseline));
  });

  it("leaves the caller's snapshot exactly where it found it", () => {
    const snap = snapshot();
    const changes: ProposedChange[] = [
      { kind: "dial", key: "governance.quorum_pct", from: "50", to: "60", timing: "at_acceptance" },
    ];
    simulate({ snapshot: snap, changes, cycles: 3, seed: 1 }, [spender()]);
    expect(snap.variables["governance.quorum_pct"]).toBe("50");
    expect(snap.balances["mem:ada"].voice).toBe(BigInt(100));
  });

  it("diffs one variable change against a baseline of the same snapshot", () => {
    const changes: ProposedChange[] = [
      { kind: "dial", key: "governance.quorum_pct", from: "50", to: "60", timing: "at_acceptance" },
    ];
    const out = simulate({ snapshot: snapshot(), changes, cycles: 3, seed: 7 }, [inert("governance")]);
    expect(out.diff).toHaveLength(1);
    expect(out.diff[0].path).toBe("variables/governance.quorum_pct");
    expect(out.diff[0].baseline).toBe("50");
    expect(out.diff[0].proposed).toBe("60");
    expect(out.diff[0].sentence).toContain("After 3 cycles");
    expect(out.violations).toEqual([]);
  });

  it("lands next_moon at cycle 1 and at_acceptance before it", () => {
    const later: ProposedChange[] = [
      { kind: "dial", key: "governance.unity_pct", from: "80", to: "90", timing: "next_moon" },
    ];
    const out = simulate({ snapshot: snapshot(), changes: later, cycles: 2, seed: 1 }, [inert("governance")]);
    // In force for the whole of cycle 1 either way, which is what the two
    // doors have in common; the diff is the same and the landing record is not.
    expect(out.proposed[0].state.variables["governance.unity_pct"]).toBe("90");
    expect(out.proposed[0].state.governance.landedPaths).toEqual(["variables/governance.unity_pct"]);
    expect(out.baseline[0].state.variables["governance.unity_pct"]).toBe("80");
  });

  it("reverts a term to the captured previous value", () => {
    const changes: ProposedChange[] = [
      { kind: "dial", key: "governance.quorum_pct", from: "50", to: "60", timing: "at_acceptance", expiresAfterCycles: 2 },
    ];
    const out = simulate({ snapshot: snapshot(), changes, cycles: 4, seed: 1 }, [inert("governance")]);
    expect(out.proposed[0].state.variables["governance.quorum_pct"]).toBe("60");
    expect(out.proposed[1].state.variables["governance.quorum_pct"]).toBe("60");
    expect(out.proposed[2].state.variables["governance.quorum_pct"]).toBe("50");
    expect(codes(out.flags)).toContain("term_reverted");
    // Back where it started, so there is nothing left to say about it.
    expect(out.diff).toEqual([]);
  });

  it("declines the reversion when something else has changed the value since", () => {
    const changes: ProposedChange[] = [
      { kind: "dial", key: "governance.quorum_pct", from: "50", to: "60", timing: "at_acceptance", expiresAfterCycles: 2 },
    ];
    const out = simulate({ snapshot: snapshot(), changes, cycles: 4, seed: 1 }, [
      inert("governance"),
      writesAt(2, "governance.quorum_pct", "70"),
    ]);
    expect(out.proposed[2].state.variables["governance.quorum_pct"]).toBe("70");
    expect(codes(out.flags)).toContain("term_reversion_declined");
    expect(codes(out.flags)).not.toContain("term_reverted");
  });

  it("stops the proposed pass at the first violation and names the cycle", () => {
    const out = simulate({ snapshot: snapshot(), changes: [], cycles: 6, seed: 1 }, [
      inert("governance"),
      breaksAt(3),
    ]);
    expect(out.proposed).toHaveLength(3);
    expect(out.proposed[2].cycle).toBe(3);
    expect(out.violations).toHaveLength(1);
    expect(out.violations[0].cycle).toBe(3);
    expect(out.violations[0].invariant).toBe("economics.conservation");
    // The baseline broke on the same cycle and stopped too, which is why the
    // diff over the two final states is still a comparison of like with like.
    expect(out.baseline).toHaveLength(3);
  });

  it("says out loud when it holds no copy of what a change writes", () => {
    const changes: ProposedChange[] = [
      { kind: "brand_field", key: "village.name", from: "a", to: "b", timing: "at_acceptance" },
    ];
    const out = simulate({ snapshot: snapshot(), changes, cycles: 2, seed: 1 }, [inert("governance")]);
    expect(codes(out.flags)).toContain("change_not_previewed");
    expect(out.diff).toEqual([]);
  });

  it("applies a mint rule change through the mint: key spelling", () => {
    const changes: ProposedChange[] = [
      { kind: "mint_rule", key: "mint:rule-quest-voice:amount", from: "5", to: "9", timing: "at_acceptance" },
    ];
    const out = simulate({ snapshot: snapshot(), changes, cycles: 1, seed: 1 }, [inert("governance")]);
    expect(out.proposed[0].state.mintRules[0].amount).toBe(BigInt(9));
    expect(out.baseline[0].state.mintRules[0].amount).toBe(BigInt(5));
  });

  it("diffs balances a model moved, in minor units", () => {
    const moves: DomainModel = {
      name: "economics",
      step: (state, cycle) =>
        cycle === 1 && state.variables["governance.quorum_pct"] === "60"
          ? { ...state, balances: { ...state.balances, "mem:bo": { voice: BigInt(999) } } }
          : state,
      flags: () => [],
      invariants: () => [],
    };
    const changes: ProposedChange[] = [
      { kind: "dial", key: "governance.quorum_pct", from: "50", to: "60", timing: "at_acceptance" },
    ];
    const out = simulate({ snapshot: snapshot(), changes, cycles: 2, seed: 1 }, [inert("governance"), moves]);
    const balance = out.diff.find((d) => d.path === "balances/mem:bo/voice");
    expect(balance).toBeDefined();
    expect(balance?.baseline).toBe("300");
    expect(balance?.proposed).toBe("999");
    expect(balance?.sentence).toContain("in minor units");
  });

  it("refuses a snapshot whose instant does not parse, and simulates nothing", () => {
    const out = simulate({ snapshot: snapshot({ atIso: "not a date" }), changes: [], cycles: 3, seed: 5 }, [inert()]);
    expect(out.baseline).toEqual([]);
    expect(out.proposed).toEqual([]);
    expect(out.violations[0].invariant).toBe("snapshot.readable");
    expect(out.seed).toBe(5);
  });

  it("runs no cycles for a run of no cycles", () => {
    const out = simulate({ snapshot: snapshot(), changes: [], cycles: 0, seed: 1 }, [inert()]);
    expect(out.baseline).toEqual([]);
    expect(out.diff).toEqual([]);
  });

  it("advances the instant one cycle boundary per cycle", () => {
    const out = simulate({ snapshot: snapshot(), changes: [], cycles: 3, seed: 1 }, [inert()]);
    const instants = out.baseline.map((c) => c.atIso);
    expect(instants[0]).toBe("2026-09-03T00:00:00.000Z");
    expect(new Date(instants[1]).getTime()).toBeGreaterThan(new Date(instants[0]).getTime());
    expect(new Date(instants[2]).getTime()).toBeGreaterThan(new Date(instants[1]).getTime());
  });

  it("keeps each recorded cycle as it was, so a later cycle cannot rewrite it", () => {
    const out = simulate({ snapshot: snapshot(), changes: [], cycles: 3, seed: 4 }, [spender()]);
    const first = out.baseline[0].state.balances["mem:ada"].voice;
    const last = out.baseline[2].state.balances["mem:ada"].voice;
    expect(last).toBeGreaterThan(first);
  });
});

describe("orderedModels", () => {
  it("puts governance first and keeps everybody else in the order given", () => {
    const a = { ...inert(), name: "economics" as const };
    const g = { ...inert(), name: "governance" as const };
    expect(orderedModels([a, g]).map((m) => m.name)).toEqual(["governance", "economics"]);
    expect(orderedModels([g, a]).map((m) => m.name)).toEqual(["governance", "economics"]);
  });
});

describe("diffOf", () => {
  it("sorts by path, so two runs of one preview read the same", () => {
    const a = initialState(snapshot());
    const b = initialState(snapshot({ variables: { "governance.quorum_pct": "60", "governance.unity_pct": "90", "a.key": "1" } }));
    const out = diffOf(a, b, 2);
    expect(out.map((d) => d.path)).toEqual([
      "variables/a.key",
      "variables/governance.quorum_pct",
      "variables/governance.unity_pct",
    ]);
  });
});

/**
 * THE CARDINAL RULE, PROVEN FROM DISK.
 *
 * `simulate` may not be able to reach a connection. That is the whole reason
 * the engine takes plain data, and a comment saying so is worth nothing the
 * first time somebody adds an import to fetch one more field. So this walks
 * the real import graph out of the real source files and fails on anything
 * under `server/db`, `server/repos` or the `mysql2` package.
 *
 * It walks the WHOLE graph, transitively, because the risk is never the
 * import somebody writes in this file. It is the third file down.
 */
describe("the import graph", () => {
  const RESOLVE_ORDER = [".ts", ".tsx", ".json", "/index.ts", "/index.tsx"];

  const resolve = (from: string, spec: string): string | null => {
    const base = path.resolve(path.dirname(from), spec);
    if (fs.existsSync(base) && fs.statSync(base).isFile()) return base;
    for (const ext of RESOLVE_ORDER) {
      const candidate = base + ext;
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return null;
  };

  const specifiersIn = (file: string): string[] => {
    const source = fs.readFileSync(file, "utf8");
    const found: string[] = [];
    const patterns = [
      /\bfrom\s+["']([^"']+)["']/g,
      /\bimport\s+["']([^"']+)["']/g,
      /\brequire\(\s*["']([^"']+)["']\s*\)/g,
      /\bimport\(\s*["']([^"']+)["']\s*\)/g,
    ];
    for (const pattern of patterns) {
      let match = pattern.exec(source);
      while (match) {
        found.push(match[1]);
        match = pattern.exec(source);
      }
    }
    return found;
  };

  const walk = (entry: string): { files: string[]; packages: string[] } => {
    const seen = new Set<string>();
    const packages = new Set<string>();
    const queue = [entry];
    while (queue.length > 0) {
      const file = queue.pop() as string;
      if (seen.has(file)) continue;
      seen.add(file);
      if (file.endsWith(".json")) continue;
      for (const spec of specifiersIn(file)) {
        if (!spec.startsWith(".")) {
          packages.add(spec);
          continue;
        }
        const target = resolve(file, spec);
        if (target) queue.push(target);
        else throw new Error(`${file} imports ${spec} and nothing on disk answers to it`);
      }
    }
    return { files: Array.from(seen), packages: Array.from(packages) };
  };

  it("reaches nothing under server/db, server/repos or mysql2", () => {
    const graph = walk(path.join(HERE, "simulate.ts"));
    const normalised = graph.files.map((f) => f.split(path.sep).join("/"));
    const forbidden = normalised.filter(
      (f) => /\/server\/db\//.test(f) || /\/server\/repos\//.test(f) || /\/server\//.test(f),
    );
    expect(forbidden).toEqual([]);
    const badPackages = graph.packages.filter((p) => p === "mysql2" || p.startsWith("mysql2/"));
    expect(badPackages).toEqual([]);
  });

  it("reaches nothing under server/ from the governance model either", () => {
    const graph = walk(path.join(HERE, "governanceModel.ts"));
    const normalised = graph.files.map((f) => f.split(path.sep).join("/"));
    expect(normalised.filter((f) => /\/server\//.test(f))).toEqual([]);
    expect(graph.packages.filter((p) => p === "mysql2" || p.startsWith("mysql2/"))).toEqual([]);
  });

  it("actually walked more than the entry file, so a green here means something", () => {
    const graph = walk(path.join(HERE, "simulate.ts"));
    expect(graph.files.length).toBeGreaterThan(3);
  });
});
