/**
 * What the Welcome Walk's log means.
 *
 * The map writes one row per step a newcomer reaches, and one more when the
 * walk ends: `complete` if they finished, `abandoned` if they left. This turns
 * those rows into the only question worth asking of them: WHERE DOES THE WALK
 * LOSE PEOPLE.
 *
 * Pure, so the answer can be tested without a database and computed the same
 * way wherever it is needed.
 */

/** Terminal markers the map writes in place of a step id. */
export const WALK_COMPLETE = "complete";
export const WALK_ABANDONED = "abandoned";

export interface WalkLogRow {
  sessionKey: string;
  step: string;
  atIndex: number;
  tsSeq: number;
}

export interface StepDropOff {
  step: string;
  atIndex: number;
  /** Runs that reached this step. */
  reached: number;
  /** Runs whose LAST step before abandoning was this one. */
  lost: number;
}

export interface WalkFunnel {
  runs: number;
  completed: number;
  abandoned: number;
  /** Runs with steps but no terminal row: still walking, or never finished. */
  unfinished: number;
  completionRate: number;
  /** Per step, in walk order. */
  steps: StepDropOff[];
  /** The step that lost the most people. Null when nobody has left one. */
  worstStep: StepDropOff | null;
}

const isTerminal = (s: string) => s === WALK_COMPLETE || s === WALK_ABANDONED;

/**
 * Fold rows into a funnel.
 *
 * Rows are grouped by session and ordered by `tsSeq`, so an import that
 * interleaves several runs still reads correctly. A run's LAST non-terminal
 * step is the one credited with losing it: that is the step a person was
 * looking at when they decided to stop, which is the step worth rewriting.
 *
 * A run with no terminal row is counted `unfinished` and is NOT counted as
 * abandoned. The difference matters: a walk still in progress and a walk
 * somebody quit are different facts, and merging them would make every
 * report look worse than the village is doing.
 */
export function walkFunnel(rows: readonly WalkLogRow[]): WalkFunnel {
  const bySession = new Map<string, WalkLogRow[]>();
  for (const r of rows) {
    const list = bySession.get(r.sessionKey);
    if (list) list.push(r);
    else bySession.set(r.sessionKey, [r]);
  }

  const reached = new Map<string, { atIndex: number; n: number }>();
  const lost = new Map<string, number>();
  let completed = 0, abandoned = 0, unfinished = 0;

  bySession.forEach((list) => {
    const ordered = list.slice().sort((a, b) => a.tsSeq - b.tsSeq);
    const steps = ordered.filter((r) => !isTerminal(r.step));
    // One credit per step per RUN: a newcomer who pans back and forth over the
    // same step is one person who saw it, not three.
    const seen = new Set<string>();
    for (const s of steps) {
      if (seen.has(s.step)) continue;
      seen.add(s.step);
      const cur = reached.get(s.step);
      if (cur) cur.n += 1;
      else reached.set(s.step, { atIndex: s.atIndex, n: 1 });
    }

    const terminal = ordered.filter((r) => isTerminal(r.step)).pop();
    if (!terminal) { unfinished += 1; return; }
    if (terminal.step === WALK_COMPLETE) { completed += 1; return; }
    abandoned += 1;
    const last = steps[steps.length - 1];
    if (last) lost.set(last.step, (lost.get(last.step) ?? 0) + 1);
  });

  const steps: StepDropOff[] = Array.from(reached.entries())
    .map(([step, v]) => ({ step, atIndex: v.atIndex, reached: v.n, lost: lost.get(step) ?? 0 }))
    .sort((a, b) => a.atIndex - b.atIndex || a.step.localeCompare(b.step));

  const runs = bySession.size;
  // Ties go to the EARLIER step: losing people at step two is worse than
  // losing the same number at step six, because everyone passes step two.
  const worstStep = steps.reduce<StepDropOff | null>(
    (worst, s) => (s.lost > 0 && (!worst || s.lost > worst.lost) ? s : worst),
    null,
  );

  return {
    runs,
    completed,
    abandoned,
    unfinished,
    completionRate: runs ? Math.round((completed / runs) * 100) : 0,
    steps,
    worstStep,
  };
}
