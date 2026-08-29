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
 * "Launched" WAS a one-way founder act gated on every blocking requirement
 * reading ok. R74 changed who takes it: the button now opens the village's
 * first ballot, at 100 unity and 100 quorum with three people on the roll, and
 * the flag is written by that ballot carrying. What the checklist gates is
 * unchanged, and it is the QUESTION: a village whose exit policy is still a
 * placeholder is not ready to be asked. It never gated the answer, and it
 * still does not.
 *
 * It is deliberately NOT auto-derived from the checks: starting the Game is a
 * decision people make and own, the same posture as module enablement and the
 * trading card.
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
  /**
   * Every blocking item reads done, so the launch VOTE may be opened. It was
   * named for a founder's own act and now names permission to ask the village
   * (R74); the checklist gates the question, never the answer.
   */
  readyToLaunch: boolean;
  launchedAt: string | null;
  launchedBy: string | null;
  /** The ballot that carried, on a village that launched by its own vote. */
  launchedByBallotId: string | null;
}

interface LaunchState {
  manualConfirms: Record<string, { by: string; at: string }>;
  launchedAt: string | null;
  launchedBy: string | null;
  launchedByBallotId?: string | null;
}

const EMPTY: LaunchState = { manualConfirms: {}, launchedAt: null, launchedBy: null, launchedByBallotId: null };

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
        detail: confirm ? `Confirmed by ${confirm.by}` : "Waiting on a human act the server cannot see. Confirm it here once done",
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
      items.push({ ...req, state: "missing", detail: `No check wired for "${req.checkKey}". This is a platform bug, report it` });
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
    launchedByBallotId: state.launchedByBallotId ?? null,
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
    return { ok: false, error: `"${req.title}" is checked live by the server, so it cannot be hand-confirmed` };
  }
  const state = await readState(pool);
  if (done) state.manualConfirms[reqId] = { by, at: new Date().toISOString() };
  else delete state.manualConfirms[reqId];
  await writeState(pool, state);
  return { ok: true };
}

/**
 * WHAT STANDS BETWEEN THIS VILLAGE AND OPENING ITS LAUNCH VOTE.
 *
 * R74 turned the founder's one-way act into a proposal, so this stopped being
 * "may I write the flag" and became "may I ask the village". The checklist
 * still gates it, and it gates the same thing it always did: whether the
 * question may be PUT, never whether the answer is yes. A village whose exit
 * policy is still a placeholder is not ready to be asked.
 *
 * Returns the refusal sentence and the open titles, or null when the vote may
 * open. Everything else about opening it (the roll's floor of three, the
 * thresholds, whether a vote is already running) belongs to the ballot engine
 * and is asked there.
 */
export async function launchVoteBlocked(
  pool: Pool,
  deps: LaunchDeps,
): Promise<{ error: string; open: string[] } | null> {
  const status = await launchStatus(pool, deps);
  if (status.launchedAt) {
    return { error: "This village has already started its Game.", open: [] };
  }
  if (!status.readyToLaunch) {
    const open = status.items
      .filter((i) => i.severity === "blocking" && i.state !== "ok")
      .map((i) => i.title);
    return {
      error: `${open.length} item(s) on the journey still block the launch vote.`,
      open,
    };
  }
  return null;
}

/**
 * The village's launch vote carried. Recorded once, with the ballot that did
 * it, so the record can never read as a founder's own decision.
 *
 * `launchedAt` keeps its meaning for the two surfaces that already read it
 * (the admin banner retires, the journey page becomes a record), and gains the
 * ballot id beside it. The SEPARATE fact that token issuance is open lives in
 * `server/lib/gameStart.ts`, because those two are the same event going
 * forwards and different events looking back: every village running today has
 * been issuing for months and none of them has ever held this vote.
 *
 * Idempotent on the first write. A close that somehow reached here twice finds
 * the launch already recorded and leaves the first instant standing.
 */
export async function recordLaunchCarried(
  pool: Pool,
  input: { ballotId: string; closedBy: string; at?: Date },
): Promise<{ alreadyRecorded: boolean; launchedAt: string }> {
  const state = await readState(pool);
  if (state.launchedAt) return { alreadyRecorded: true, launchedAt: state.launchedAt };
  state.launchedAt = (input.at ?? new Date()).toISOString();
  state.launchedBy = input.closedBy;
  state.launchedByBallotId = input.ballotId;
  await writeState(pool, state);
  return { alreadyRecorded: false, launchedAt: state.launchedAt };
}
