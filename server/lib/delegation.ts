/**
 * Vote delegation: you hand your voice to someone you choose.
 *
 * The word is already in this village's vocabulary. `shared/power.ts` glosses
 * the `delegated` way of deciding as "You hand your voice to someone you
 * choose", and until this file there was nothing behind it.
 *
 * THE ONE DECISION THE WHOLE FEATURE TURNS ON: COPY THE CHOICE, NEVER MOVE
 * THE WEIGHT. A delegated vote is a row for the DELEGATOR carrying the
 * delegate's choice, with `followed_user_id` recording who decided it. The
 * delegate's own weight is untouched. Three things follow, and each one is a
 * problem this design does not have:
 *
 *  - The participation arithmetic stays honest. "9 of 12 people voted" counts
 *    nine rows whoever decided them, so the people-and-weight sentence keeps
 *    meaning what it says.
 *  - The frozen electorate keeps meaning what it says. Who may vote and how
 *    much each vote weighs froze at open. Delegation changes only WHAT a vote
 *    says.
 *  - "Change it at any time" stops colliding with the snapshot law. Changing a
 *    delegation mid-ballot is the same class of act as changing your own vote,
 *    which an open ballot already allows, so it re-derives one row and touches
 *    no frozen column.
 *
 * CHAINS ARE TRANSITIVE, by the founder's ruling: A delegates to B, B
 * delegates to C, and A follows C. He accepted the concentration that creates
 * on the same terms he has accepted every other concentration: the protection
 * is transparency. So three things here are load-bearing rather than nice to
 * have.
 *
 *  1. CYCLES ARE REFUSED AT CREATION, never at tally time. Without
 *     transitivity a cycle is a curiosity. With it, a cycle is an infinite
 *     loop in the routine that counts a season's votes. `delegationProblem`
 *     walks the chain before any write and refuses the delegation that would
 *     close the loop, and every walker in this file carries a visited set too,
 *     so a row written by hand around the route stops a walk instead of
 *     hanging it.
 *  2. A DELEGATOR SEES WHO THEY ACTUALLY FOLLOWED. `followed_user_id` holds
 *     the FINAL decider, never the member the delegator named. If A named B
 *     and C decided four hops away, A reads C. A reading B is the
 *     concentration becoming invisible again.
 *  3. EFFECTIVE CONCENTRATION IS THE NUMBER THAT MATTERS. How many
 *     delegations somebody holds directly stops being interesting the moment
 *     chains exist. `effectiveConcentration` answers the real question: how
 *     many votes does this member decide, counting everyone who reaches them
 *     through anybody, and what share of the electorate is that.
 *
 * A DELEGATE WHO DOES NOT VOTE LEAVES THE DELEGATOR'S VOTE UNCAST. There is
 * no row, so quorum counts that member as not having voted. It is never an
 * abstain, because an abstain is a choice somebody made. That is the same
 * empty-versus-zero rule this codebase has paid for several times.
 *
 * ONE ROUTINE DERIVES EVERY DELEGATED ROW. `applyDelegatedVotes` is called
 * from both places a delegated row can become stale: after a vote is cast or
 * changed, and after a delegation is given, changed or revoked. Deriving the
 * whole ballot each time rather than patching the members who look affected
 * is deliberate, because a delegation change moves everyone downstream of the
 * member who changed it, and a routine that tried to work out who those were
 * would be a second copy of the resolution rule.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";
import type { VoteChoice } from "../../shared/governanceEngine";

export interface DelegationRow {
  delegatorId: string;
  delegateId: string;
  createdAt: string;
  revokedAt: string | null;
}

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));

/**
 * Every live delegation, as delegator to delegate.
 *
 * One read, then every walk in this file is pure arithmetic over the map. The
 * tally path needs to resolve a whole electorate, and doing that with one
 * query per hop would make a chain's depth a database cost.
 */
export async function loadDelegationMap(pool: Pool): Promise<Map<string, string>> {
  const [rows] = await pool.query<RowDataPacket[]>( // module-review-ok: the delegations table's one enumerable home (the ballots.ts pattern; no cache sits above it)
    "SELECT delegator_id, delegate_id FROM delegations WHERE revoked_at IS NULL",
  );
  const map = new Map<string, string>();
  for (const r of rows) map.set(String(r.delegator_id), String(r.delegate_id));
  return map;
}

export interface ResolvedChain {
  /** Who actually decides for this member. Themselves, when they delegate to nobody. */
  finalId: string;
  /** Every member walked through, starting with the caller. One entry means no delegation. */
  chain: string[];
  /** How many delegations were followed. Zero means this member decides for themselves. */
  hops: number;
  /**
   * True when the walk stopped because it met a member it had already seen.
   * `delegationProblem` makes this unreachable through the route, so a true
   * here means a row was written around it and the chain ends nowhere useful.
   */
  looped: boolean;
}

/**
 * Follow the chain to the member who actually decides.
 *
 * Pure, over a map the caller loaded once. The visited set is a second guard
 * behind the creation-time refusal: this function must terminate on any input,
 * including a cycle somebody wrote straight into the table, because it runs
 * inside the tally.
 */
export function resolveFinal(map: Map<string, string>, userId: string): ResolvedChain {
  const chain: string[] = [userId];
  const seen = new Set<string>([userId]);
  let current = userId;
  for (;;) {
    const next = map.get(current);
    if (next === undefined) return { finalId: current, chain, hops: chain.length - 1, looped: false };
    if (seen.has(next)) return { finalId: current, chain, hops: chain.length - 1, looped: true };
    seen.add(next);
    chain.push(next);
    current = next;
  }
}

/** `resolveFinal` for one member, loading the map for you. One read. */
export async function resolveDelegate(pool: Pool, userId: string): Promise<ResolvedChain> {
  return resolveFinal(await loadDelegationMap(pool), userId);
}

/**
 * WHY THIS DELEGATION CANNOT BE GIVEN, in the sentence the member reads, or
 * null when it can.
 *
 * Pure and exported so the refusal can be proven without a database, and so
 * the route and the writer below cannot drift into two different rules.
 */
export function delegationProblem(
  map: Map<string, string>,
  delegatorId: string,
  delegateId: string,
): string | null {
  if (!delegatorId || !delegateId) return "A delegation names the member you are handing your voice to";
  if (delegatorId === delegateId) {
    return "You already decide for yourself. A delegation hands your voice to somebody else";
  }
  // The delegate's own chain, walked as it stands. If the delegator is
  // anywhere along it, adding this edge closes a loop and the votes at the end
  // of it would have nobody deciding them.
  const onward = resolveFinal(map, delegateId);
  // Where the delegator sits on the delegate's chain says which sentence is
  // true. Position 1 is the delegate following the delegator directly, which
  // is the swap somebody tries first. Anything further along is a chain that
  // comes back, which the member cannot see and has to be told about.
  const meetsAt = onward.chain.indexOf(delegatorId);
  if (meetsAt >= 0) {
    return meetsAt === 1
      ? "That member has delegated their voice to you, so this would send your voice in a circle. One of you has to decide"
      : "That member's voice already follows a chain that comes back to you, so this would send both voices in a circle. One of you has to decide";
  }
  return null;
}

export type SetDelegationResult =
  | { ok: true; delegation: DelegationRow; chain: ResolvedChain }
  | { ok: false; error: string };

/**
 * Give a delegation, or move one that already stands.
 *
 * One row per member, ever: the primary key is the delegator alone, so this is
 * an upsert that also clears `revoked_at`. Handing your voice to somebody new
 * is one act, never a revocation followed by a gift, and a member who reads
 * their delegation between the two halves of that pair should never see a
 * moment where they had none.
 */
export async function setDelegation(
  pool: Pool,
  delegatorId: string,
  delegateId: string,
): Promise<SetDelegationResult> {
  const delegator = String(delegatorId ?? "").trim();
  const delegate = String(delegateId ?? "").trim();
  const map = await loadDelegationMap(pool);
  const problem = delegationProblem(map, delegator, delegate);
  if (problem) return { ok: false, error: problem };
  await pool.query( // module-review-ok: the delegations table's one enumerable home (the ballots.ts pattern; no cache sits above it)
    "INSERT INTO delegations (delegator_id, delegate_id, created_at, revoked_at) VALUES (?,?,NOW(),NULL) " +
      "ON DUPLICATE KEY UPDATE delegate_id = VALUES(delegate_id), created_at = NOW(), revoked_at = NULL",
    [delegator, delegate],
  );
  const row = await delegationOf(pool, delegator);
  if (!row) throw new Error(`delegation for ${delegator} vanished inside its own write`);
  map.set(delegator, delegate);
  return { ok: true, delegation: row, chain: resolveFinal(map, delegator) };
}

/**
 * Take a delegation back. Idempotent: a member with nothing live gets `false`
 * and no error, because "there was nothing to revoke" and "the revocation
 * failed" are different answers and only one of them is a problem.
 */
export async function revokeDelegation(pool: Pool, delegatorId: string): Promise<boolean> {
  const [result] = await pool.query<any>( // module-review-ok: the delegations table's one enumerable home (the ballots.ts pattern; no cache sits above it)
    "UPDATE delegations SET revoked_at = NOW() WHERE delegator_id = ? AND revoked_at IS NULL",
    [String(delegatorId ?? "")],
  );
  return Number(result.affectedRows) > 0;
}

/** The delegation this member gave, live or revoked, or null if they never gave one. */
export async function delegationOf(pool: Pool, delegatorId: string): Promise<DelegationRow | null> {
  const [rows] = await pool.query<RowDataPacket[]>( // module-review-ok: the delegations table's one enumerable home (the ballots.ts pattern; no cache sits above it)
    "SELECT delegator_id, delegate_id, created_at, revoked_at FROM delegations WHERE delegator_id = ?",
    [String(delegatorId ?? "")],
  );
  const r = rows[0];
  if (!r) return null;
  return {
    delegatorId: String(r.delegator_id),
    delegateId: String(r.delegate_id),
    createdAt: iso(r.created_at),
    revokedAt: r.revoked_at === null || r.revoked_at === undefined ? null : iso(r.revoked_at),
  };
}

/** The live delegation this member gave, or null. */
export async function liveDelegationOf(pool: Pool, delegatorId: string): Promise<DelegationRow | null> {
  const row = await delegationOf(pool, delegatorId);
  return row && row.revokedAt === null ? row : null;
}

export interface ConcentrationRow {
  userId: string;
  /**
   * How many votes this member effectively decides, counting themselves when
   * they decide for themselves and everyone who reaches them through anybody.
   * A member who delegated their own voice away decides zero.
   */
  effectiveVotes: number;
  /** How many members named this one directly. The less interesting number, kept because it is the one people expect. */
  directDelegations: number;
  /** `effectiveVotes` over the roster size, 0 to 1. */
  shareOfElectorate: number;
  /** Who decides for this member. Themselves when they delegate to nobody. */
  decidedBy: string;
  /** How many delegations lie between this member and the one who decides for them. */
  hops: number;
  /**
   * False for a member who is not on the roster and only appears here because
   * somebody on it follows them. Their own vote is not in the arithmetic.
   */
  onRoster: boolean;
}

/**
 * WHO DECIDES HOW MUCH OF THIS VILLAGE, for the roster handed in.
 *
 * The roster comes from the caller rather than from a query here, because
 * "every member" means something different to a route serving the village and
 * to a ballot serving its frozen roll, and a function that guessed would be
 * right for one of them.
 *
 * THE SUM IS THE PROPERTY THAT MAKES THE SHARES READABLE. Every roster member
 * is decided by exactly one member, themselves when they delegated to nobody,
 * so `effectiveVotes` over every row returned adds up to the roster size. A
 * test asserts it.
 *
 * That is why a member OFF the roster who decides for somebody on it gets a
 * row too, marked `onRoster: false`. Dropping them would lose their votes out
 * of the total and make the shares add to less than one, and resolving the
 * chain only as far as the roster would be a second copy of the resolution
 * rule that `applyDelegatedVotes` already holds. One rule: the chain runs to
 * its end, wherever that lands.
 */
export function concentrationOver(map: Map<string, string>, roster: string[]): ConcentrationRow[] {
  const onRoster = new Set(roster);
  const decidedBy = new Map<string, ResolvedChain>();
  const effective = new Map<string, number>();
  const direct = new Map<string, number>();
  for (const member of roster) {
    const walk = resolveFinal(map, member);
    decidedBy.set(member, walk);
    effective.set(walk.finalId, (effective.get(walk.finalId) ?? 0) + 1);
    const named = map.get(member);
    if (named !== undefined) direct.set(named, (direct.get(named) ?? 0) + 1);
  }
  const ids = [...roster];
  // `forEach` rather than iterating the keys: tsconfig.json leaves `target` at
  // its ES5 default, and a `for...of` over a Map iterator is TS2802 there.
  effective.forEach((_count, id) => {
    if (!onRoster.has(id)) ids.push(id);
  });
  const total = roster.length;
  return ids.map((member) => {
    const walk = decidedBy.get(member);
    const votes = effective.get(member) ?? 0;
    return {
      userId: member,
      effectiveVotes: votes,
      directDelegations: direct.get(member) ?? 0,
      shareOfElectorate: total > 0 ? votes / total : 0,
      decidedBy: walk ? walk.finalId : member,
      hops: walk ? walk.hops : 0,
      onRoster: onRoster.has(member),
    };
  });
}

/** `concentrationOver` with the live map loaded for you. One read. */
export async function effectiveConcentration(pool: Pool, roster: string[]): Promise<ConcentrationRow[]> {
  return concentrationOver(await loadDelegationMap(pool), roster);
}

export interface DerivationCounts {
  /** Rows written for a member who had none. */
  added: number;
  /** Rows rewritten because the choice or the decider changed. */
  changed: number;
  /** Rows deleted because nobody decides for that member any more. */
  removed: number;
  /**
   * False when the ballot is not taking votes, so the caller can tell "nothing
   * needed doing" from "this ballot was never eligible".
   */
  eligible: boolean;
}

const NOTHING: DerivationCounts = { added: 0, changed: 0, removed: 0, eligible: false };

/**
 * DERIVE EVERY DELEGATED ROW ON ONE BALLOT from the delegations that stand
 * right now, and the votes members cast for themselves.
 *
 * The rule, in one pass over the frozen roll:
 *
 *  - A member who voted for themselves is never touched. `followed_user_id IS
 *    NULL` is what "I decided this" means, and the individual keeps full
 *    rights over their own row, which is the founder's own condition on the
 *    whole feature.
 *  - Otherwise the chain is walked. If the member at the end of it cast their
 *    own vote here, this member gets a row carrying that choice, stamped with
 *    that member's id.
 *  - Otherwise there is no row. A delegate who has not voted leaves the
 *    delegator's vote UNCAST, so quorum counts them as not having voted. An
 *    abstain would be a lie about a choice nobody made.
 *
 * THE REASON IS NEVER COPIED. A `no` may carry the words the voter wrote, and
 * those words belong to the person who wrote them. Copying them into somebody
 * else's row would attribute a sentence to a member who never said it, so a
 * delegated row carries the choice alone.
 *
 * A DELEGATED `no` FILES NO OBJECTION under the consent method, for the same
 * reason: an objection is reasoning, and it belongs to whoever reasoned. The
 * delegate's own objection already stands on the ballot.
 *
 * Refuses quietly on a ballot that is not taking votes, so a caller may hand
 * it any ballot id without checking the clock first.
 */
export async function applyDelegatedVotes(pool: Pool, ballotId: string): Promise<DerivationCounts> {
  const [ballotRows] = await pool.query<RowDataPacket[]>( // module-review-ok: a read of the ballot's own clock, beside the derivation it gates (the ballots.ts pattern)
    "SELECT status, closes_at FROM ballots WHERE id = ?",
    [ballotId],
  );
  const ballot = ballotRows[0];
  if (!ballot || String(ballot.status) !== "open") return { ...NOTHING };
  // One clock, the same subtraction castVote makes: `closes_at` was written
  // from a process clock, so this holds on a database in any zone.
  if (Date.parse(iso(ballot.closes_at)) <= Date.now()) return { ...NOTHING };

  const map = await loadDelegationMap(pool);
  if (map.size === 0) {
    // NO DELEGATIONS AT ALL, which is every village until somebody gives one,
    // and this is the path a vote takes on the way in. Reading the roll and
    // walking it would answer the same question the slow way: with nothing
    // live, every delegated row on this ballot is stale by definition, and
    // deleting them is exactly what the loop below would decide one at a time.
    const [swept] = await pool.query<any>( // module-review-ok: the ballot tables' one enumerable home (the ballots.ts pattern; no cache sits above them)
      "DELETE FROM ballot_votes WHERE ballot_id = ? AND followed_user_id IS NOT NULL",
      [ballotId],
    );
    return { added: 0, changed: 0, removed: Number(swept.affectedRows), eligible: true };
  }

  const [rollRows] = await pool.query<RowDataPacket[]>( // module-review-ok: the ballot tables' one enumerable home (the ballots.ts pattern; no cache sits above them)
    "SELECT user_id FROM ballot_electorate WHERE ballot_id = ?",
    [ballotId],
  );
  const [voteRows] = await pool.query<RowDataPacket[]>( // module-review-ok: the ballot tables' one enumerable home (the ballots.ts pattern; no cache sits above them)
    "SELECT user_id, choice, followed_user_id FROM ballot_votes WHERE ballot_id = ?",
    [ballotId],
  );

  const own = new Map<string, VoteChoice>();
  const delegated = new Map<string, { choice: VoteChoice; followed: string }>();
  for (const r of voteRows) {
    const uid = String(r.user_id);
    const choice = String(r.choice) as VoteChoice;
    if (r.followed_user_id === null || r.followed_user_id === undefined) own.set(uid, choice);
    else delegated.set(uid, { choice, followed: String(r.followed_user_id) });
  }

  const counts: DerivationCounts = { added: 0, changed: 0, removed: 0, eligible: true };

  for (const r of rollRows) {
    const member = String(r.user_id);
    if (own.has(member)) continue;
    const { finalId } = resolveFinal(map, member);
    const decidedChoice = finalId === member ? undefined : own.get(finalId);
    const standing = delegated.get(member);

    if (decidedChoice === undefined) {
      if (!standing) continue;
      await pool.query( // module-review-ok: the ballot tables' one enumerable home (the ballots.ts pattern; no cache sits above them)
        "DELETE FROM ballot_votes WHERE ballot_id = ? AND user_id = ? AND followed_user_id IS NOT NULL",
        [ballotId, member],
      );
      counts.removed += 1;
      continue;
    }

    if (!standing) {
      // `ON DUPLICATE KEY UPDATE choice = choice` is a deliberate no-op: a
      // member who cast their own vote between the read above and this write
      // keeps it, and `affectedRows` is 1 only when a row was really inserted,
      // so the count below reports what happened rather than what was tried.
      const [inserted] = await pool.query<any>( // module-review-ok: the ballot tables' one enumerable home (the ballots.ts pattern; no cache sits above them)
        "INSERT INTO ballot_votes (ballot_id, user_id, choice, reason, followed_user_id) VALUES (?,?,?,NULL,?) " +
          "ON DUPLICATE KEY UPDATE choice = choice",
        [ballotId, member, decidedChoice, finalId],
      );
      if (Number(inserted.affectedRows) > 0) counts.added += 1;
      continue;
    }

    if (standing.choice === decidedChoice && standing.followed === finalId) continue;
    // Guarded on `followed_user_id IS NOT NULL`, so a member who cast their own
    // vote between the read above and this write keeps it.
    await pool.query( // module-review-ok: the ballot tables' one enumerable home (the ballots.ts pattern; no cache sits above them)
      "UPDATE ballot_votes SET choice = ?, followed_user_id = ?, reason = NULL " +
        "WHERE ballot_id = ? AND user_id = ? AND followed_user_id IS NOT NULL",
      [decidedChoice, finalId, ballotId, member],
    );
    counts.changed += 1;
  }
  return counts;
}

/**
 * Derive every ballot that is still taking votes.
 *
 * What a delegation change calls, because a delegation is village-wide and a
 * member may be on several open rolls at once. Returns one entry per ballot it
 * touched, so a route can say what the change actually moved rather than
 * claiming it moved something.
 */
export async function applyDelegatedVotesEverywhere(
  pool: Pool,
): Promise<{ ballotId: string; counts: DerivationCounts }[]> {
  const [rows] = await pool.query<RowDataPacket[]>( // module-review-ok: the ballot tables' one enumerable home (the ballots.ts pattern; no cache sits above them)
    "SELECT id FROM ballots WHERE status = 'open'",
  );
  const out: { ballotId: string; counts: DerivationCounts }[] = [];
  for (const r of rows) {
    const ballotId = String(r.id);
    out.push({ ballotId, counts: await applyDelegatedVotes(pool, ballotId) });
  }
  return out;
}

export interface FollowedVote {
  ballotId: string;
  ballotTitle: string;
  ballotStatus: string;
  choice: VoteChoice;
  /** Null on a vote this member cast themselves. */
  followedUserId: string | null;
  castAt: string;
}

/**
 * EVERY VOTE THIS MEMBER HOLDS, AND WHO DECIDED IT.
 *
 * The secrecy question needs no new mechanism here, which is the second
 * reason the copy-the-choice shape is the right one. A member already sees
 * their own vote on a proposal, and a delegated vote IS their own vote sitting
 * in their own row. So a delegator learns what their delegate did by reading
 * what they themselves voted, and no disclosure rule has to be invented.
 */
export async function votesFollowedBy(pool: Pool, userId: string, limit = 50): Promise<FollowedVote[]> {
  const cap = Math.max(1, Math.min(200, Math.trunc(limit) || 50));
  const [rows] = await pool.query<RowDataPacket[]>( // module-review-ok: the ballot tables' one enumerable home (the ballots.ts pattern; no cache sits above them)
    "SELECT v.ballot_id, v.choice, v.followed_user_id, v.cast_at, b.title, b.status FROM ballot_votes v " +
      "JOIN ballots b ON b.id = v.ballot_id WHERE v.user_id = ? ORDER BY v.cast_at DESC, v.ballot_id DESC LIMIT ?",
    [String(userId ?? ""), cap],
  );
  return rows.map((r) => ({
    ballotId: String(r.ballot_id),
    ballotTitle: String(r.title),
    ballotStatus: String(r.status),
    choice: String(r.choice) as VoteChoice,
    followedUserId:
      r.followed_user_id === null || r.followed_user_id === undefined ? null : String(r.followed_user_id),
    castAt: iso(r.cast_at),
  }));
}
