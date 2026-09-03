/**
 * THE VETO, THE COUNTDOWN, AND THE DRY RUN.
 *
 *   POST /api/governance/ballots/:id/veto        stop a carried change, and say why
 *   GET  /api/governance/ballots/:id/landing     when it lands, and what it will write
 *   POST /api/game/mechanics/proposals/dry-run   what a change set would do
 *
 * ── WHY A VETO AND NOT A REFUSAL ───────────────────────────────────────────
 *
 * `server/routes/governanceApprovals.ts` shipped an approve-and-refuse pair
 * built for the model of 2026-09-02, where a passed change WAITED for a
 * steward. The ruling of 2026-09-03 deleted the wait: a Game change lands by
 * itself at an instant, and the steward's act is to STOP it inside a window.
 * So the act this route performs is a veto, it is refused after the instant
 * with the instant named, and an approval is a courtesy that closes nothing
 * sooner.
 *
 * The steward-veto lane owns the rename of the capability and of the approvals
 * routes. This module calls through the names that exist today
 * (`STEWARD_APPROVE`, which is the key `steward.approve`), so a rename is one
 * import to follow rather than a second permission model to reconcile.
 *
 * ── THE DRY RUN SHARES THE EXECUTOR'S VALIDATOR ────────────────────────────
 *
 * `dryRunProposal` calls the same phase 1 `applyChangeSet` calls. A preview
 * with its own reading of the rules would let a village vote on a yes and get a
 * no three days later with the vote already spent. Nothing here writes: the
 * ledger writer and the cache reload handed to the validator are no-ops,
 * because phase 1 never calls them and a dry run that could is a way to change
 * the world by asking a question.
 *
 * MOUNTED BEHIND requireModule("governance") for the /api/governance prefix,
 * which server/index.ts installs before this module's register() is called.
 */
import type { Express } from "express";
import type { AppDeps } from "../lib/appDeps";
import { cycleBoundsFor } from "../../shared/lunar";
import { numberVar, boolVar } from "../lib/variables";
import { landingRow, recordVeto } from "../lib/applyDue";
import { dryRunProposal } from "../lib/proposalDryRun";
import { elementsFor, type ChangesetDeps } from "../lib/changeset";
import { CHANGE_SET_CAP } from "../lib/mechanics";
import { STEWARD_APPROVE, stewardsSeated } from "../lib/stewardship";
import { vetoHoursFrom } from "../../shared/governanceKinds";

type Deps = Pick<AppDeps, "authedUser" | "mayAct" | "getPool" | "members" | "firstName" | "notify">;

export function register(app: Express, deps: Deps): void {
  const { authedUser, mayAct, getPool, members, firstName, notify } = deps;

  /** Phase 1 needs a pool and nothing else. The rest are honestly inert here. */
  const previewDeps = (): ChangesetDeps => ({
    pool: getPool(),
    recordMechanicsChange: async () => {},
    reloadCaches: async () => {},
    sharedPasswordPosture: () => false,
  });

  app.post("/api/governance/ballots/:id/veto", async (req, res) => {
    const user = await authedUser(req);
    if (!user) return res.status(401).json({ error: "auth_required" });
    const verdict = await mayAct(req, STEWARD_APPROVE);
    if (!verdict.ok) {
      return res.status(403).json({
        error: "Stopping a carried decision is the steward's act, and this account does not hold the seat.",
      });
    }
    // The seat has to be a LIVE holding. A lapsed one is returned by
    // stewardsSeated so a page can say who held it until when, and a term that
    // ran out is exactly the case the founder refused to soften.
    const seated = (await stewardsSeated(getPool())).filter((h) => !h.lapsed && h.userId === user.id);
    if (seated.length === 0) {
      return res.status(403).json({ error: "This seat's term has ended, so the door to stop a decision has closed with it." });
    }
    const result = await recordVeto(
      { pool: getPool() },
      { ballotId: req.params.id, stewardId: user.id, reason: String(req.body?.reason ?? "") },
    );
    if (!result.ok) return res.status(409).json({ error: result.error });

    const row = await landingRow(getPool(), req.params.id);
    const me = await members.byId(user.id);
    const name = me ? firstName(me.name) : "A steward";
    // The proposer hears it first and in their own words. The roll's line is
    // the close route's job and it already went out when the vote carried.
    if (row) {
      await notify({
        userId: row.subjectRef && row.subjectType === "mechanics" ? await proposerOf(getPool(), row.subjectRef) : row.subjectRef,
        type: "governance",
        title: `${name} stopped this one before it landed`,
        body: `${String(req.body?.reason ?? "").trim()}\n\nIt is back with you, holding every supporter it had. Passing it again at the village's highest bar lands it whatever any steward says.`,
        link: `/governance/ballots/${req.params.id}`,
        dedupeKey: `bal:${req.params.id}:vetoed:proposer`,
      }).catch(() => {});
    }
    res.json({ success: true, vetoedBy: name, landedAt: result.landsAt });
  });

  /**
   * The countdown, and the trail. One read, so a page never has to ask four
   * tables what one decision did.
   */
  app.get("/api/governance/ballots/:id/landing", async (req, res) => {
    const row = await landingRow(getPool(), req.params.id);
    if (!row) return res.status(404).json({ error: "Not found" });
    const seated = (await stewardsSeated(getPool())).filter((h) => !h.lapsed);
    res.json({
      landsAt: row.landsAt ? row.landsAt.toISOString() : null,
      vetoClosesAt: row.landsAt ? row.landsAt.toISOString() : null,
      landingStatus: row.landingStatus,
      timing: row.timing,
      vetoedAt: row.vetoedAt ? row.vetoedAt.toISOString() : null,
      vetoedBy: row.vetoedBy,
      vetoReason: row.vetoReason,
      /** People and weight are shown together everywhere; here it is people. */
      stewardsSeated: seated.length,
      vetoHours: vetoHoursFrom(numberVar("governance.veto_hours")),
      stewardCouncil: boolVar("governance.steward_council"),
      elements: await elementsFor(getPool(), req.params.id),
    });
  });

  app.post("/api/game/mechanics/proposals/dry-run", async (req, res) => {
    const user = await authedUser(req);
    if (!user) return res.status(401).json({ error: "auth_required" });
    const changes = Array.isArray(req.body?.changeSet) ? req.body.changeSet : [];
    if (changes.length === 0) return res.status(400).json({ error: "A dry run needs at least one change to read" });
    if (changes.length > CHANGE_SET_CAP) {
      return res.status(400).json({ error: `A proposal carries at most ${CHANGE_SET_CAP} changes` });
    }
    const days = Math.max(1, Math.min(90, Number(numberVar("governance.vote_days")) || 7));
    const closesAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    const out = await dryRunProposal(previewDeps(), {
      changes,
      timing: req.body?.timing,
      closesAt,
      vetoHours: vetoHoursFrom(numberVar("governance.veto_hours")),
      nextNewMoonAfter: (after: Date) => cycleBoundsFor(after).endsAt,
    });
    res.json({ ...out, closesAt: closesAt.toISOString(), preview: true });
  });
}

/** The proposer of a mechanics proposal, or the string itself when there is none. */
async function proposerOf(pool: ReturnType<AppDeps["getPool"]>, proposalId: string): Promise<string> {
  const [rows] = await pool.query<any[]>("SELECT proposer_user_id FROM mechanics_proposals WHERE id = ?", [proposalId]);
  return String(rows[0]?.proposer_user_id ?? "");
}
