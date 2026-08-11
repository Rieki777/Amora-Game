/**
 * Capabilities: what a member is allowed to do, as data.
 *
 * Revision 2, step 3. Amora's twelve stages were computed and displayed but
 * gated nothing, so progression was decoration. A capability is a permission
 * key. A member holds a capability if EITHER:
 *
 *   - their computed stage is at or past the stage that unlocks it, OR
 *   - they hold a role whose `capabilities` list includes it.
 *
 * Two paths on purpose. Stage is the earned ladder everyone climbs; roles are
 * appointments a founder makes directly (a treasurer is a treasurer regardless
 * of how many quests they have done). Either grants the capability.
 *
 * The stage thresholds below are the platform defaults. They are intentionally
 * conservative: three real gates, not twelve, because the point is to make
 * progression MEAN something, not to lock the whole app behind tiers.
 */

/** The capability keys the platform knows about. */
export type Capability =
  | "quest.propose" // suggest a new quest for the village
  | "quest.consent" // release value on someone's quest (also admin/role gated)
  | "forum.post" // start a thread
  | "forum.moderate" // hide, resolve reports, act on the community's behalf
  | "proposal.open" // open a governance decision
  | "proposal.decide" // record a decision's outcome
  | "map.viewPeople" // see WHO holds seats on the village map (not just counts)
  | "map.contact" // reach a role holder through the contact relay
  | "feed.announce" // post announcements to the village feed (role-only)
  | "stay.member_rate" // book accommodation at the member price, not the guest one
  | "exchange.buy" // buy listed tokens for fiat
  | "exchange.swap" // trade one village token for another at posted prices
  | "exchange.manage" // list tokens, post prices, stock the treasury (role-only)
  | "health.record" // log the land's own measurements (trees, water, hectares)
  | "message.send" // start a conversation and post to one (reading is membership)
  | "mechanics.propose"; // propose a change to the game's own rules (Game Mechanics)

/**
 * The canonical list, as a VALUE: badge validation and unlock diffs iterate
 * it. Adding a capability to the union above without adding it here makes
 * it ungrantable by badges — keep them in lockstep.
 */
export const ALL_CAPABILITIES: Capability[] = [
  "quest.propose",
  "quest.consent",
  "forum.post",
  "forum.moderate",
  "proposal.open",
  "proposal.decide",
  "map.viewPeople",
  "map.contact",
  "feed.announce",
  "stay.member_rate",
  "exchange.buy",
  "exchange.swap",
  "exchange.manage",
  "health.record",
  "message.send",
  "mechanics.propose",
];

/**
 * Stage that unlocks each capability by progression alone, referencing the
 * stage ids in gameConfig.ts (visitor, guest, immersant, participant, member,
 * contributor, quest-seeker, initiate, co-creator, role-holder, guide, sage).
 * A capability absent here is never granted by stage, only by a role.
 */
export const STAGE_UNLOCKS: Partial<Record<Capability, string>> = {
  "forum.post": "member", // you can talk once you have joined
  "quest.propose": "contributor", // propose work once you have done some
  "proposal.open": "co-creator", // open a decision once you are co-creating
  "map.viewPeople": "guest", // any account sees who holds the village's seats
  "map.contact": "member", // reaching people through the relay starts at member
  "stay.member_rate": "member", // the member price comes with membership
  // Messaging opens where forum posting opens: once you have joined, you can
  // talk to the people you joined. A warning badge's deny suspends it, which
  // is the whole reason the deny path outranks role and stage.
  "message.send": "member",
  "exchange.buy": "member", // buying opens at member; exchange.manage is role-only
  // Parity with buying on purpose: the safety work is done by the
  // deployment-level trading switch and fail-closed caps, and a higher stage
  // floor would only show more members a door they cannot open.
  "exchange.swap": "member",
  // The base posture (Rye, 2026-07-31): ANY MEMBER may propose a change to
  // the game's rules. Founders narrow it by moving this rung (the generated
  // progression.unlock variable), setting it to "none" and granting through
  // roles or badges, or requiring earned recognition on top
  // (governance.hypha_threshold). A warning badge's deny suspends it — the
  // remedy for misuse that is short of anything harsher.
  "mechanics.propose": "member",
};

/**
 * THE ONE GATE (revised S36). Given a member's computed stage index, the
 * capabilities their roles grant, and the capabilities/denies their badges
 * carry, decide whether they hold a capability. Pure, so it is unit-testable
 * and runs identically on client and server.
 *
 * Order of authority — this ordering IS the policy (Gate E):
 *   1. isAdmin           -> true.  The operator can always act.
 *   2. badgeDenies       -> false. A warning badge's deny beats ROLE and
 *      stage grants too, not just badge grants: a warning that a role
 *      trivially overrides is not a warning. Only admin outranks it.
 *   3. roleCapabilities  -> true.  Appointments.
 *   4. badgeCapabilities -> true.  Earned/granted badges.
 *   5. stage unlock      -> true.  The ladder everyone climbs.
 *   6. otherwise false.
 */
export function hasCapability(
  cap: Capability,
  ctx: {
    stageIndex: number;
    stageIndexOf: (stageId: string) => number;
    roleCapabilities: readonly string[];
    /** Capabilities granted by the member's active badges. Default []. */
    badgeCapabilities?: readonly string[];
    /** Capabilities DENIED by active warning badges. Default []. */
    badgeDenies?: readonly string[];
    isAdmin?: boolean;
    /**
     * Per-village overrides of STAGE_UNLOCKS, sourced from the variables
     * registry (progression.unlock.*) — the Game Mechanics initiative made
     * the unlock table itself a mechanic. Absent key = platform default;
     * the value "none" disables the stage path for that capability (roles
     * and badges still grant it). The GATE's order of authority is
     * unchanged: this only parameterizes step 5.
     */
    stageUnlockOverrides?: Partial<Record<Capability, string>>;
  },
): boolean {
  if (ctx.isAdmin) return true;
  if ((ctx.badgeDenies ?? []).includes(cap)) return false;
  if (ctx.roleCapabilities.includes(cap)) return true;
  if ((ctx.badgeCapabilities ?? []).includes(cap)) return true;
  const unlockStage = ctx.stageUnlockOverrides?.[cap] ?? STAGE_UNLOCKS[cap];
  if (unlockStage && unlockStage !== "none") {
    const needed = ctx.stageIndexOf(unlockStage);
    if (needed >= 0 && ctx.stageIndex >= needed) return true;
  }
  return false;
}
