/**
 * Handing your voice to somebody, taking it back, and seeing where every
 * voice in the village ended up.
 *
 * Four routes:
 *
 *   GET    /api/governance/delegation      mine: who I named, who actually
 *                                          decides for me, and per vote who I
 *                                          followed
 *   PUT    /api/governance/delegation      give it, or move it to somebody else
 *   DELETE /api/governance/delegation      take it back
 *   GET    /api/governance/concentration   who decides how much of this village
 *
 * ALL FOUR MOUNT BEHIND requireModule("governance"), installed on the
 * /api/governance prefix in server/index.ts before this register() runs. The
 * module ships OFF, and while it is off every path here is a 404.
 *
 * CONCENTRATION IS VISIBLE TO EVERY PLAYER, by the transparency ruling. The
 * founder settled that a member may hold most of the voice as long as everyone
 * can see it, and delegation is weight concentration by another route, so it
 * gets the same treatment. A member holding twenty delegations quietly is
 * exactly the state that ruling exists to prevent. It takes a signed-in
 * member, because the answer is a list of people and their standing, and that
 * is a village-facing fact rather than a public one.
 *
 * NO NEW CAPABILITY KEY. Giving a delegation is a member acting on their own
 * voice, so the gate is the one that already decides whether they have a voice
 * to give: `ballot.vote`. `capabilityCtx` rather than `guardCapability`, the
 * same call server/routes/governanceWizard.ts makes and for the same reason,
 * because this asks a member about themselves and carries no break-glass.
 *
 * WHAT THIS FILE DOES NOT DECIDE. Whether a delegation may be given at all
 * (cycles, self-delegation), how a chain resolves, and what a change does to
 * an open ballot all live in server/lib/delegation.ts. This file reads the
 * gate, names the people, and reports what the library did.
 */
import type { Express } from "express";
import type { AppDeps } from "../lib/appDeps";
import { hasCapability } from "../../shared/capabilities";
import {
  applyDelegatedVotesEverywhere,
  effectiveConcentration,
  liveDelegationOf,
  resolveDelegate,
  revokeDelegation,
  setDelegation,
  votesFollowedBy,
} from "../lib/delegation";

type Deps = Pick<AppDeps, "authedUser" | "getPool" | "capabilityCtx" | "members" | "firstName">;

export function register(app: Express, deps: Deps): void {
  const { authedUser, getPool, capabilityCtx, members, firstName } = deps;

  /** Names for a set of ids, so nobody reads a page of identifiers. One roster read. */
  const namesFor = async (ids: string[]): Promise<Map<string, string>> => {
    const wanted = new Set(ids.filter(Boolean));
    const out = new Map<string, string>();
    if (wanted.size === 0) return out;
    for (const m of await members.all()) {
      const id = String(m.id);
      if (wanted.has(id)) out.set(id, firstName(String(m.name ?? "")));
    }
    return out;
  };

  /**
   * MY DELEGATION, AND WHO I ACTUALLY FOLLOWED.
   *
   * Two different facts, and serving only the first would hide the whole
   * mechanism. `delegateTo` is the member I named. `decidedBy` is who my voice
   * reaches at the end of the chain, which is the one that matters once chains
   * are transitive: naming B and being decided by C four hops away is the
   * feature working, and it stops being visible the moment this route reports
   * B alone.
   *
   * The per-vote list needs no disclosure rule of its own. A member already
   * sees their own vote on a proposal, and a delegated vote IS their own vote
   * sitting in their own row, so reading what they voted is how a delegator
   * learns what their delegate did.
   */
  app.get("/api/governance/delegation", async (req, res) => {
    const user = await authedUser(req);
    if (!user) return res.status(401).json({ error: "auth_required" });
    const pool = getPool();
    const me = String(user.id);
    const mine = await liveDelegationOf(pool, me);
    const chain = await resolveDelegate(pool, me);
    const votes = await votesFollowedBy(pool, me, 50);
    const names = await namesFor([
      mine?.delegateId ?? "",
      chain.finalId,
      ...chain.chain,
      ...votes.map((v) => v.followedUserId ?? ""),
    ]);
    res.json({
      delegateTo: mine ? mine.delegateId : null,
      delegateToName: mine ? names.get(mine.delegateId) ?? null : null,
      since: mine ? mine.createdAt : null,
      // Null when I decide for myself, which is a different answer from "I
      // delegated to somebody who has not been resolved yet".
      decidedBy: chain.hops > 0 ? chain.finalId : null,
      decidedByName: chain.hops > 0 ? names.get(chain.finalId) ?? null : null,
      hops: chain.hops,
      chain: chain.chain.map((id) => ({ userId: id, name: names.get(id) ?? null })),
      votes: votes.map((v) => ({
        ...v,
        followedName: v.followedUserId ? names.get(v.followedUserId) ?? null : null,
      })),
    });
  });

  /**
   * Give a delegation, or move one that already stands.
   *
   * A cycle is refused here, at the moment the delegation is created, and
   * never at tally time: with transitive chains a cycle is an infinite loop in
   * the routine that counts a season's votes.
   *
   * Every ballot still taking votes is re-derived on the way out, because
   * changing a delegation mid-ballot is the same class of act as changing your
   * own vote, which an open ballot already allows. The counts come back so the
   * answer can say what actually moved.
   */
  app.put("/api/governance/delegation", async (req, res) => {
    const user = await authedUser(req);
    if (!user) return res.status(401).json({ error: "auth_required" });
    const ctx = await capabilityCtx(user);
    if (!hasCapability("ballot.vote", ctx)) {
      return res.status(403).json({
        error: "Voting is not open to your account at the moment, so there is no voice here to hand on yet",
      });
    }
    const delegateId = String(req.body?.delegateId ?? "").trim();
    if (!delegateId) return res.status(400).json({ error: "A delegation names the member you are handing your voice to" });
    const target = await members.byId(delegateId);
    if (!target) return res.status(404).json({ error: "No member here by that name" });
    const pool = getPool();
    const result = await setDelegation(pool, String(user.id), delegateId);
    if (!result.ok) return res.status(400).json({ error: result.error });
    const moved = await applyDelegatedVotesEverywhere(pool);
    const names = await namesFor([result.delegation.delegateId, result.chain.finalId]);
    res.json({
      success: true,
      delegateTo: result.delegation.delegateId,
      delegateToName: names.get(result.delegation.delegateId) ?? null,
      decidedBy: result.chain.finalId,
      decidedByName: names.get(result.chain.finalId) ?? null,
      hops: result.chain.hops,
      openBallotsTouched: moved.filter((b) => b.counts.added + b.counts.changed + b.counts.removed > 0).length,
      openBallotsChecked: moved.filter((b) => b.counts.eligible).length,
    });
  });

  /**
   * Take it back.
   *
   * Idempotent, and the answer says which of the two things happened, because
   * "you had nothing to revoke" and "the revocation failed" are different
   * answers and only one of them is a problem. Every open ballot is re-derived
   * the same way a change is: a member who takes their voice back before a
   * ballot closes has their row removed, and their vote is uncast again rather
   * than left carrying somebody else's choice.
   */
  app.delete("/api/governance/delegation", async (req, res) => {
    const user = await authedUser(req);
    if (!user) return res.status(401).json({ error: "auth_required" });
    const pool = getPool();
    const revoked = await revokeDelegation(pool, String(user.id));
    const moved = await applyDelegatedVotesEverywhere(pool);
    res.json({
      success: true,
      revoked,
      hadNone: !revoked,
      openBallotsTouched: moved.filter((b) => b.counts.added + b.counts.changed + b.counts.removed > 0).length,
      openBallotsChecked: moved.filter((b) => b.counts.eligible).length,
    });
  });

  /**
   * WHO DECIDES HOW MUCH OF THIS VILLAGE.
   *
   * How many delegations somebody holds DIRECTLY is not the interesting number
   * once chains exist, so both are served and the effective count leads: how
   * many votes this member decides, counting everyone who reaches them through
   * anybody, and what share of the village that is.
   *
   * The shares add to one because every member is decided by exactly one
   * member, themselves when they handed their voice to nobody.
   */
  app.get("/api/governance/concentration", async (req, res) => {
    const user = await authedUser(req);
    if (!user) return res.status(401).json({ error: "auth_required" });
    const roster = (await members.all()).map((m) => String(m.id));
    const rows = await effectiveConcentration(getPool(), roster);
    const names = await namesFor([...roster, ...rows.map((r) => r.decidedBy)]);
    res.json({
      memberCount: roster.length,
      rows: rows
        .map((r) => ({
          ...r,
          name: names.get(r.userId) ?? null,
          decidedByName: names.get(r.decidedBy) ?? null,
        }))
        .sort((a, b) => b.effectiveVotes - a.effectiveVotes || a.userId.localeCompare(b.userId)),
    });
  });
}
