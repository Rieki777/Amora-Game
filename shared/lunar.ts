/**
 * Deterministic lunar-cycle math for the Gratitude system.
 *
 * VERBATIM PORT of regen-civics `shared/lunar.ts`, on purpose. Both products
 * distribute Gratitude on lunar cycles, and the cycle number is a natural key
 * that appears in distribution records. If the two codebases computed new-moon
 * boundaries with even slightly different constants, they would silently
 * disagree about which lunation an acknowledgment belongs to, and that is the
 * kind of divergence you discover months later in a distribution dispute.
 * If regen-civics ever revises its algorithm, revise this file the same way.
 *
 * Uses the mean synodic month anchored to a reference new moon
 * (2000-01-06 18:14 UTC, Meeus). This drifts up to ~14 hours from the
 * true astronomical new moon in any given lunation, which is fine for
 * a ~29.5-day game cycle: boundaries are stable, monotonic, and every
 * environment computes the identical cycle number with no external
 * calls (deterministic-first).
 *
 * cycleNumber = whole lunations elapsed since the reference new moon.
 */

export const SYNODIC_MONTH_DAYS = 29.53058867;
export const SYNODIC_MONTH_MS = SYNODIC_MONTH_DAYS * 24 * 60 * 60 * 1000;

/** Reference new moon: 2000-01-06 18:14:00 UTC. */
export const REFERENCE_NEW_MOON_MS = Date.UTC(2000, 0, 6, 18, 14, 0);

/**
 * Moon phase as a fraction of the synodic month.
 * 0 = new moon, 0.25 = first quarter, 0.5 = full moon, 0.75 = last quarter.
 */
export function moonPhase(date: Date): number {
  const elapsed = date.getTime() - REFERENCE_NEW_MOON_MS;
  const phase = (elapsed % SYNODIC_MONTH_MS) / SYNODIC_MONTH_MS;
  return phase < 0 ? phase + 1 : phase;
}

/** Human name for a phase fraction, for UI copy. */
export function moonPhaseName(phase: number): string {
  if (phase < 0.033 || phase >= 0.967) return "New moon";
  if (phase < 0.217) return "Waxing crescent";
  if (phase < 0.283) return "First quarter";
  if (phase < 0.467) return "Waxing gibbous";
  if (phase < 0.533) return "Full moon";
  if (phase < 0.717) return "Waning gibbous";
  if (phase < 0.783) return "Last quarter";
  return "Waning crescent";
}

export interface LunarCycleBounds {
  /** Whole lunations since the reference new moon. */
  cycleNumber: number;
  startsAt: Date;
  endsAt: Date;
}

/** The lunation containing `date` (new moon to next new moon). */
export function cycleBoundsFor(date: Date): LunarCycleBounds {
  const elapsed = date.getTime() - REFERENCE_NEW_MOON_MS;
  const cycleNumber = Math.floor(elapsed / SYNODIC_MONTH_MS);
  return {
    cycleNumber,
    startsAt: new Date(REFERENCE_NEW_MOON_MS + cycleNumber * SYNODIC_MONTH_MS),
    endsAt: new Date(REFERENCE_NEW_MOON_MS + (cycleNumber + 1) * SYNODIC_MONTH_MS),
  };
}

/** The lunation with a specific cycle number. */
export function cycleBoundsByNumber(cycleNumber: number): LunarCycleBounds {
  return {
    cycleNumber,
    startsAt: new Date(REFERENCE_NEW_MOON_MS + cycleNumber * SYNODIC_MONTH_MS),
    endsAt: new Date(REFERENCE_NEW_MOON_MS + (cycleNumber + 1) * SYNODIC_MONTH_MS),
  };
}

/** Whole days until the cycle containing `date` ends (rounded up, min 0). */
export function daysRemainingInCycle(date: Date): number {
  const { endsAt } = cycleBoundsFor(date);
  return Math.max(0, Math.ceil((endsAt.getTime() - date.getTime()) / (24 * 60 * 60 * 1000)));
}
