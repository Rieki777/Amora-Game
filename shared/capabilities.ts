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
  | "feed.announce"; // post announcements to the village feed (role-only)

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
};

/**
 * Given a member's computed stage index and the capabilities their roles grant,
 * decide whether they hold a capability. Pure, so it is unit-testable and runs
 * identically on client and server.
 */
export function hasCapability(
  cap: Capability,
  ctx: {
    stageIndex: number;
    stageIndexOf: (stageId: string) => number;
    roleCapabilities: readonly string[];
    isAdmin?: boolean;
  },
): boolean {
  if (ctx.isAdmin) return true; // the operator can always act
  if (ctx.roleCapabilities.includes(cap)) return true;
  const unlockStage = STAGE_UNLOCKS[cap];
  if (unlockStage) {
    const needed = ctx.stageIndexOf(unlockStage);
    if (needed >= 0 && ctx.stageIndex >= needed) return true;
  }
  return false;
}
