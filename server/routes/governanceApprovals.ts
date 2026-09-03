/**
 * The steward's decision on a proposal the village already passed.
 *
 *   POST /api/governance/ballots/:id/approve   let it take effect
 *   POST /api/governance/ballots/:id/refuse    stop it, and say why
 *   GET  /api/governance/stewardship           who holds the seat, and what waits
 *
 * ── WHAT THESE ROUTES DO AND DO NOT DO ─────────────────────────────────────
 *
 * They write the DECISION and nothing else. Re-entering the closer so an
 * approved proposal actually applies is the close dispatcher's half, and it
 * lives with `SUBJECT_CLOSERS` in server/index.ts where every other answer to
 * "what does closing do" lives. Two copies of that rule would disagree
 * eventually, and the disagreement would land on somebody who thinks they
 * approved something.
 *
 * So the contract is: this module owns `ballot_approvals`, the dispatcher owns
 * what happens next, and `server/lib/stewardship.ts` is the seam between them.
 * `approvalFor(pool, ballotId)` returning null IS the queue.
 *
 * ── THE THREE REFUSALS, AND WHY EACH ONE IS A DIFFERENT ANSWER ─────────────
 *
 * 404  no such ballot
 * 409  the ballot did not pass, so there is nothing to approve, or somebody
 *      has already decided it and the standing decision comes back with the
 *      refusal so the caller can render who decided and why
 * 400  a refusal with no reason. The founder ruled that a veto carries a
 *      reason; a blank one is how that requirement gets met without being met.
 *
 * ── AN EMPTY SEAT IS NOT AN ERROR ──────────────────────────────────────────
 *
 * `GET /api/governance/stewardship` is readable by any member and says three
 * different true things about an empty seat: nobody has ever held it, somebody
 * held it and their term ran out, or nobody holds it and nothing asks for one.
 * The last is the healthy end state the founder described, and it is never
 * rendered as a warning. `vacancyState` writes the sentence; this route serves
 * it verbatim so the wording lives in one place.
 *
 * MOUNTED BEHIND requireModule("governance"), which server/index.ts installs
 * on the /api/governance prefix before this module's register() is called.
 * Nothing here re-checks that: one place decides, and it is upstream.
 */
import type { Express } from "express";
import type { AppDeps } from "../lib/appDeps";
import { ballotById } from "../lib/ballots";
import {
  approvalFor,
  autoExecutes,
  needsSteward,
  recordApproval,
  recordRefusal,
  refusalReasonProblem,
  subjectTypesSeen,
  vacancyState,
  STEWARD_APPROVE,
  STEWARD_SUBJECTS_KEY,
  AUTO_EXECUTE_SUBJECTS_KEY,
} from "../lib/stewardship";
import { stringVar } from "../lib/variables";

type Deps = Pick<AppDeps, "authedUser" | "mayAct" | "getPool" | "members" | "firstName" | "notify">;

export function register(app: Express, deps: Deps): void {
  const { authedUser, mayAct, getPool, members, firstName, notify } = deps;

  /**
   * One gate for both decisions, so approve and refuse can never drift apart
   * on who is allowed to make them or on what a passed ballot means.
   *
   * `mayAct` rather than `hasCapability`, per docs/ARCHITECTURE.md: this is an
   * act, so it needs the break-glass door and the public record that comes
   * with it. A village that has taken this power off the admin panel can still
   * be reached past in an emergency, and the reach is recorded.
   */
  async function gate(
    req: any,
    res: any,
  ): Promise<{ user: any; ballot: NonNullable<Awaited<ReturnType<typeof ballotById>>> } | null> {
    const user = await authedUser(req);
    if (!user) {
      res.status(401).json({ error: "auth_required" });
      return null;
    }
    const verdict = await mayAct(req, STEWARD_APPROVE);
    if (!verdict.ok) {
      res.status(verdict.needsOverride ? 409 : 403).json({
        error: verdict.message,
        holder: verdict.holderName,
        needsOverride: verdict.needsOverride,
      });
      return null;
    }
    const ballot = await ballotById(getPool(), String(req.params.id));
    if (!ballot) {
      res.status(404).json({ error: "No such decision" });
      return null;
    }
    if (ballot.status !== "passed") {
      res.status(409).json({
        error:
          ballot.status === "open"
            ? "This decision is still open. A steward decides after the village has."
            : `This decision did not carry, so there is nothing to approve. It reads as ${ballot.status.replace("_", " ")}.`,
        status: ballot.status,
      });
      return null;
    }
    return { user, ballot };
  }

  /** The decision as the wire carries it, with the decider named. */
  async function decisionPayload(ballotId: string) {
    const row = await approvalFor(getPool(), ballotId);
    if (!row) return null;
    const who = await members.byId(row.decidedBy);
    return {
      decision: row.decision,
      reason: row.reason,
      decidedAt: row.decidedAt,
      decidedBy: who ? firstName(who.name) : "A departed member",
      decidedByUserId: row.decidedBy,
    };
  }

  /**
   * THE STEWARD IS NAMED, and that is a ruling rather than an implementation
   * choice. Voter identity defaults to secret and this does not, because the
   * founder's answer every time has been that transparency is the protection:
   * a proposal the village passed stopping without anybody being told who
   * stopped it, or why, is the defect the reason requirement exists to close.
   */
  app.post("/api/governance/ballots/:id/approve", async (req, res) => {
    const ok = await gate(req, res);
    if (!ok) return;
    const { user, ballot } = ok;

    const standing = await approvalFor(getPool(), ballot.id);
    if (standing) {
      return res.status(409).json({
        error: `This decision has already been ${standing.decision}.`,
        approval: await decisionPayload(ballot.id),
      });
    }

    const reason = String(req.body?.reason ?? "").trim();
    const result = await recordApproval(getPool(), { ballotId: ballot.id, decidedBy: user.id, reason });
    if (!result.ok) return res.status(400).json({ error: result.error });

    // The proposer hears it from the person, not from a status change. One
    // stable key per (event, recipient), so a retried approval rings once.
    if (ballot.openedBy && ballot.openedBy !== user.id) {
      await notify({
        userId: ballot.openedBy,
        type: "ballot_approved",
        title: `A steward approved ${ballot.title}`,
        body: reason || "It carries as the village decided.",
        link: `/decisions/${ballot.id}`,
        dedupeKey: `bal:${ballot.id}:approved`,
      });
    }

    res.json({
      success: true,
      ballotId: ballot.id,
      status: ballot.status,
      approval: await decisionPayload(ballot.id),
    });
  });

  /**
   * The veto. It exists to catch harm the village could not see, which is why
   * it carries a reason and why the reason is a required field rather than a
   * nicety: a proposal dying quietly is the thing this route is built to stop.
   */
  app.post("/api/governance/ballots/:id/refuse", async (req, res) => {
    const ok = await gate(req, res);
    if (!ok) return;
    const { user, ballot } = ok;

    const reason = String(req.body?.reason ?? "").trim();
    const problem = refusalReasonProblem(reason);
    if (problem) return res.status(400).json({ error: problem });

    const standing = await approvalFor(getPool(), ballot.id);
    if (standing) {
      return res.status(409).json({
        error: `This decision has already been ${standing.decision}.`,
        approval: await decisionPayload(ballot.id),
      });
    }

    const result = await recordRefusal(getPool(), { ballotId: ballot.id, decidedBy: user.id, reason });
    if (!result.ok) return res.status(400).json({ error: result.error });

    if (ballot.openedBy && ballot.openedBy !== user.id) {
      await notify({
        userId: ballot.openedBy,
        type: "ballot_refused",
        title: `A steward refused ${ballot.title}`,
        body: reason,
        link: `/decisions/${ballot.id}`,
        dedupeKey: `bal:${ballot.id}:refused`,
      });
    }

    res.json({
      success: true,
      ballotId: ballot.id,
      status: ballot.status,
      approval: await decisionPayload(ballot.id),
    });
  });

  /**
   * Who holds the seat, for how long, and what this village asks of it.
   *
   * A member read, not an admin one. The whole point of naming the steward is
   * that the village can see who is holding its last word.
   */
  app.get("/api/governance/stewardship", async (req, res) => {
    const user = await authedUser(req);
    if (!user) return res.status(401).json({ error: "auth_required" });

    const pool = getPool();
    const state = await vacancyState(pool);
    const subjects = await subjectTypesSeen(pool);

    const named = await Promise.all(
      state.holdings.map(async (h) => {
        const who = await members.byId(h.userId);
        return {
          member: who ? firstName(who.name) : "A departed member",
          userId: h.userId,
          roleId: h.roleId,
          roleName: h.roleName,
          seatedAt: h.grantedAt,
          termEndsAt: h.termEndsAt,
          seasonId: h.seasonId,
          lapsed: h.lapsed,
        };
      }),
    );

    res.json({
      seated: state.seated,
      healthy: state.healthy,
      stillAsked: state.stillAsked,
      sentence: state.sentence,
      holders: named,
      // The per-subject map, and the two raw settings it was computed from, so
      // a reader can tell an empty list ("this village has held no votes yet")
      // apart from a village that has switched every subject off.
      settings: {
        stewardSubjects: stringVar(STEWARD_SUBJECTS_KEY),
        autoExecuteSubjects: stringVar(AUTO_EXECUTE_SUBJECTS_KEY),
      },
      subjects: subjects.map((s) => ({
        subjectType: s,
        needsSteward: needsSteward(s),
        autoExecutes: autoExecutes(s),
      })),
    });
  });
}
