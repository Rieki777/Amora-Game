/**
 * Launch status resolver (S62): turns shared/launchRequirements.ts into live
 * per-item status, and holds the little state the registry itself refuses to
 * carry — manual confirmations and the launched flag.
 *
 * The registry declares WHAT must be true; this file observes WHETHER it is.
 * Checks arrive as closures from server/index.ts (LaunchDeps) because the
 * things being checked — brand overlay, email config, module lifecycles —
 * live in that file's boot-loaded caches, and importing them here would be a
 * cycle. A check the server cannot observe ("manual:*") is confirmed by a
 * named admin instead, and the confirmation records who and when: a human
 * saying "done" is evidence, anonymous state is not.
 *
 * "Launched" is a one-way founder act gated on every blocking requirement
 * reading ok. It is deliberately NOT auto-derived from the checks: going
 * live is a decision a person makes and owns, the same posture as module
 * enablement and the trading card. The flag's one consumer today is the
 * admin banner (it disappears); nothing else may branch on it.
 */
import type { Pool } from "mysql2/promise";
import {
  LAUNCH_REQUIREMENTS,
  type LaunchRequirement,
} from "../../shared/launchRequirements";

export type CheckState = "ok" | "missing" | "partial";

export interface LaunchCheckResult {
  state: CheckState;
  /** One sentence of live detail ("2 admins have their own login"). */
  detail: string;
}

/** Closures over server/index.ts's caches, injected at boot. */
export interface LaunchDeps {
  checks: Record<string, () => Promise<LaunchCheckResult> | LaunchCheckResult>;
  /** Effective lifecycle for appliesWhenModule gating. */
  moduleLifecycle: (id: string) => string;
}

export interface LaunchItemStatus extends LaunchRequirement {
  state: CheckState;
  detail: string;
  /** For manual items: who confirmed, when. */
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface LaunchStatus {
  items: LaunchItemStatus[];
  /** blocking items not yet ok — what stands between here and launched. */
  blockingOpen: number;
  recommendedOpen: number;
  readyToLaunch: boolean;
  launchedAt: string | null;
  launchedBy: string | null;
}

interface LaunchState {
  manualConfirms: Record<string, { by: string; at: string }>;
  launchedAt: string | null;
  launchedBy: string | null;
}

const EMPTY: LaunchState = { manualConfirms: {}, launchedAt: null, launchedBy: null };

async function readState(pool: Pool): Promise<LaunchState> {
  const [[row]] = await pool.query<any[]>(
    "SELECT value FROM app_config WHERE config_key = 'launch-state'",
  );
  if (!row) return { ...EMPTY, manualConfirms: {} };
  const doc = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
  return { ...EMPTY, ...doc, manualConfirms: doc?.manualConfirms ?? {} };
}

async function writeState(pool: Pool, state: LaunchState): Promise<void> {
  await pool.query(
    "INSERT INTO app_config (config_key, value) VALUES ('launch-state', ?) " +
      "ON DUPLICATE KEY UPDATE value = VALUES(value)",
    [JSON.stringify(state)],
  );
}

/** Resolve every applicable requirement into live status. */
export async function launchStatus(pool: Pool, deps: LaunchDeps): Promise<LaunchStatus> {
  const state = await readState(pool);
  const items: LaunchItemStatus[] = [];

  for (const req of LAUNCH_REQUIREMENTS) {
    // A requirement for a module this village does not run is not a
    // requirement — it is a distraction wearing a checkbox.
    // Required while ANY of the named modules is on: one piece of setup can
    // serve several modules, and it is needed if even one of them runs.
    if (req.appliesWhenModule) {
      const gatingModules = Array.isArray(req.appliesWhenModule) ? req.appliesWhenModule : [req.appliesWhenModule];
      if (gatingModules.every((m) => deps.moduleLifecycle(m) === "off")) continue;
    }

    if (req.checkKey.startsWith("manual:")) {
      const confirm = state.manualConfirms[req.id];
      items.push({
        ...req,
        state: confirm ? "ok" : "missing",
        detail: confirm ? `Confirmed by ${confirm.by}` : "Waiting on a human act the server cannot see — confirm it here once done",
        confirmedBy: confirm?.by,
        confirmedAt: confirm?.at,
      });
      continue;
    }

    const check = deps.checks[req.checkKey];
    if (!check) {
      // A registry entry without a resolver is a wiring bug. Fail VISIBLY on
      // the page rather than silently dropping the row — a checklist that
      // hides items reads as shorter than the truth.
      items.push({ ...req, state: "missing", detail: `No check wired for "${req.checkKey}" — this is a platform bug, report it` });
      continue;
    }
    try {
      const r = await check();
      items.push({ ...req, ...r });
    } catch (e: any) {
      items.push({ ...req, state: "missing", detail: `Check failed: ${String(e?.message ?? e).slice(0, 120)}` });
    }
  }

  const blockingOpen = items.filter((i) => i.severity === "blocking" && i.state !== "ok").length;
  const recommendedOpen = items.filter((i) => i.severity === "recommended" && i.state !== "ok").length;
  return {
    items,
    blockingOpen,
    recommendedOpen,
    readyToLaunch: blockingOpen === 0,
    launchedAt: state.launchedAt,
    launchedBy: state.launchedBy,
  };
}

/** Confirm (or retract) a manual requirement, attributed. */
export async function confirmManual(
  pool: Pool,
  reqId: string,
  by: string,
  done: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const req = LAUNCH_REQUIREMENTS.find((r) => r.id === reqId);
  if (!req) return { ok: false, error: `unknown requirement "${reqId}"` };
  if (!req.checkKey.startsWith("manual:")) {
    return { ok: false, error: `"${req.title}" is checked live by the server — it cannot be hand-confirmed` };
  }
  const state = await readState(pool);
  if (done) state.manualConfirms[reqId] = { by, at: new Date().toISOString() };
  else delete state.manualConfirms[reqId];
  await writeState(pool, state);
  return { ok: true };
}

/** The one-way founder act. Refuses while any blocking item is open. */
export async function markLaunched(
  pool: Pool,
  deps: LaunchDeps,
  by: string,
): Promise<{ ok: true } | { ok: false; error: string; open?: string[] }> {
  const status = await launchStatus(pool, deps);
  if (status.launchedAt) return { ok: false, error: "Already launched" };
  if (!status.readyToLaunch) {
    const open = status.items
      .filter((i) => i.severity === "blocking" && i.state !== "ok")
      .map((i) => i.title);
    return { ok: false, error: `Not yet — ${open.length} blocking item(s) remain`, open };
  }
  const state = await readState(pool);
  state.launchedAt = new Date().toISOString();
  state.launchedBy = by;
  await writeState(pool, state);
  return { ok: true };
}
