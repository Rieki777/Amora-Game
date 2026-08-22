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
  // `quest.propose` was here and is retired (0090). It named an act nobody
  // ever needed permission for: suggesting a quest goes through
  // `/api/forms/submit`, the house pattern for anonymous public intake, which
  // takes a stranger's suggestion by design and turns it into an inbox row
  // rather than a quest. Only an admin creates a quest. So the key gated
  // nothing anywhere in the product, while the ladder announced it as newly
  // unlocked at contributor and the admin explainer reported it as held.
  // Gating the intake route was the alternative and it is incoherent: it
  // would either shut strangers out of the suggestion box or hold members to
  // a higher bar than strangers.
  | "quest.consent" // release value on someone's quest (also admin/role gated)
  | "forum.post" // start a thread
  | "forum.moderate" // hide, resolve reports, act on the community's behalf
  | "proposal.open" // open a governance decision
  | "proposal.decide" // record a decision's outcome
  | "map.viewPeople" // see WHO holds seats on the village map (not just counts)
  | "map.contact" // reach a role holder through the contact relay
  | "map.edit" // enter build mode and keep a draft of the land
  | "map.publish" // push a draft onto the live map everyone sees
  | "feed.announce" // post announcements to the village feed (role-only)
  | "stay.member_rate" // book accommodation at the member price, not the guest one
  | "exchange.buy" // buy listed tokens for fiat
  | "exchange.swap" // trade one village token for another at posted prices
  | "exchange.manage" // list tokens, post prices, stock the treasury (role-only)
  | "health.record" // log the land's own measurements (trees, water, hectares)
  | "message.send" // start a conversation and post to one (reading is membership)
  | "mechanics.propose" // propose a change to the game's own rules (Game Mechanics)
  | "event.rsvp" // say you are coming to a gathering
  | "event.manage" // put a gathering on the village calendar, edit or cancel it
  | "org.declare" // declare how the village and its circles hold power (0083)
  | "ballot.vote" // cast a vote on an on-site ballot (round 5 governance engine)
  | "member.vouch"; // vouch for an applicant at the membrane (round 5)

/**
 * The canonical list, as a VALUE: badge validation and unlock diffs iterate
 * it. Adding a capability to the union above without adding it here makes
 * it ungrantable by badges — keep them in lockstep.
 */
export const ALL_CAPABILITIES: Capability[] = [
  "quest.consent",
  "forum.post",
  "forum.moderate",
  "proposal.open",
  "proposal.decide",
  "map.viewPeople",
  "map.contact",
  "map.edit",
  "map.publish",
  "feed.announce",
  "stay.member_rate",
  "exchange.buy",
  "exchange.swap",
  "exchange.manage",
  "health.record",
  "message.send",
  "mechanics.propose",
  "event.rsvp",
  "event.manage",
  "org.declare",
  "ballot.vote",
  "member.vouch",
];

/**
 * WHAT EACH KEY MEANS, in words a member reads.
 *
 * The union above already carries these phrases as trailing comments, and a
 * comment is invisible at runtime, so every surface that showed a member
 * their own capabilities showed them `forum.post,message.send` instead. A
 * stage advance is the moment that hurts most: the whole point of crossing a
 * rung is learning what opened, and a raw dotted key does not say.
 *
 * Phrased as the completion of "You can now", so the list reads as an
 * invitation on the surfaces that use it that way and still reads correctly
 * as a plain label on the ones that do not.
 *
 * KEEP IN LOCKSTEP with the union and with ALL_CAPABILITIES.
 * `capabilities.test.ts` asserts the three agree, so a new key without a
 * label fails there rather than shipping as machine text on a member's
 * profile.
 */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  "quest.consent": "Release value on someone else's quest",
  "forum.post": "Start a thread in the forum",
  "forum.moderate": "Act on the community's behalf in the forum",
  "proposal.open": "Open a governance decision",
  "proposal.decide": "Record a decision's outcome",
  "map.viewPeople": "See who holds seats on the village map",
  "map.contact": "Reach a role holder through the contact relay",
  "map.edit": "Draft changes to the land in build mode",
  "map.publish": "Publish a draft onto the live map",
  "feed.announce": "Post announcements to the village feed",
  "stay.member_rate": "Book a stay at the member price",
  "exchange.buy": "Buy listed tokens",
  "exchange.swap": "Swap one village token for another",
  "exchange.manage": "List tokens, post prices, and stock the treasury",
  "health.record": "Log the land's own measurements",
  "message.send": "Start a conversation and post to one",
  "mechanics.propose": "Propose a change to the game's rules",
  "event.rsvp": "Say you are coming to a gathering",
  "event.manage": "Put a gathering on the village calendar",
  "org.declare": "Declare how the village holds power",
  "ballot.vote": "Cast a vote on a ballot",
  "member.vouch": "Vouch for an applicant",
};

/**
 * One capability in words, falling back to the key itself.
 *
 * The fallback is the honest one: a key with no label is a bug in the table
 * above, and printing the key says so out loud instead of dropping the row
 * and telling a member less than they held.
 */
export function capabilityLabel(cap: string): string {
  return CAPABILITY_LABELS[cap as Capability] ?? cap;
}

/**
 * Stage that unlocks each capability by progression alone, referencing the
 * stage ids in gameConfig.ts (visitor, guest, immersant, participant, member,
 * contributor, quest-seeker, initiate, co-creator, role-holder, guide, sage).
 * A capability absent here is never granted by stage, only by a role.
 */
export const STAGE_UNLOCKS: Partial<Record<Capability, string>> = {
  "forum.post": "member", // you can talk once you have joined
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
  // Anyone with an account can say they are coming. A gathering people have
  // to earn their way into is a different product, and a village that wants
  // one moves this rung. `event.manage` is deliberately absent: putting
  // something on the village calendar is an appointment, granted by a role or
  // a badge, never reached by climbing.
  "event.rsvp": "guest",
  // Voting opens where talking opens: membership is the electorate. The
  // ballot electorate builder reads this THROUGH the one gate, so a warning
  // badge's deny suspends voting (Gate E order preserved) and a role or
  // badge can still grant it below the rung.
  "ballot.vote": "member",
  // Vouching is vouching FROM standing: a member who has contributed speaks
  // for an applicant with something behind the word.
  "member.vouch": "contributor",
  // `map.edit` and `map.publish` are deliberately absent for the same reason,
  // and the second one matters more than the first. The map is the village's
  // front door: a stage rung would hand the land's shape to everyone who
  // climbed far enough, on a surface where one careless drag is visible to
  // every visitor at once. Both are appointments. A founder grants them with
  // the Cartographer badge (0063) or a role.
  //
  // They are TWO keys on purpose. One key would mean anyone trusted to
  // propose a change to the land is also trusted to overwrite it live. Split,
  // they buy the useful middle: a member drafts, a cartographer publishes.
  //
  // `org.declare` is deliberately absent too (0083, P10). Declaring how the
  // village holds power is an appointment a founder makes, granted by a role
  // or a badge, never reached by climbing. The third path to declaring, a
  // live holder of a seat flagged represents_circle, is scoped to that one
  // circle and lives in orgChart.mayDeclare, not here: the one narrow bridge
  // from the seat plane, recorded in
  // docs/ADR_2026-08_REPRESENTS_CIRCLE_DECLARES.md.
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
