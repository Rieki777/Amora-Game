/**
 * ONE ORDER FOR EVERY MEMBER LIST, and the reason it has to exist.
 *
 * WHAT THE REPOSITORY ALREADY GUARANTEES. `usersRepo.all()` runs
 * `SELECT ... FROM users ORDER BY joined_at, id` and has since the MySQL
 * cutover. `id` is the primary key, so that order is TOTAL, and `joined_at`
 * is `timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP` with no `ON UPDATE`
 * clause, so a write cannot move a row. Stability at the source is settled.
 * Nothing here is trying to add it.
 *
 * WHAT WAS STILL MISSING. Join order is the order people signed up in, and a
 * person cannot search it. A founder opening a member picker on a village of
 * forty reads forty names in registration sequence with no way to find one,
 * and a roster that a founder scans row by row gives no clue why row nine sits
 * where it does. That is a PRESENTATION order, decided per surface, and it
 * has to be the same decision everywhere or admin ends up with two answers.
 *
 * WHY THE COMPARATOR LIVES HERE INSTEAD OF IN SQL. A SQL `ORDER BY name`
 * sorts by the column's collation, and this schema's collation is split: some
 * migrations pin a charset and the rest inherit the server default, so the
 * SQL answer differs between deployments. It also disagrees with
 * `localeCompare`, which is what the browser sorts with. Putting name order
 * in the query would leave admin holding TWO name orders that disagree on
 * case and on accents, which is worse than the one gap it closes. `name`
 * carries no index either, and most of the callers of `all()` are lookups
 * that throw the order away.
 *
 * WHY IT IS TOTAL. `localeCompare` answers 0 for two members who share a
 * name, and a comparator that returns 0 leaves the outcome to the sort's
 * stability and to whatever order the rows arrived in. Falling through to
 * `id` makes the result the same on every call regardless of input order, so
 * a table cannot reshuffle under a cursor between two reads.
 */

export interface NamedMember {
  id: string;
  name?: string | null;
}

/** Name first, then id, so two members sharing a name still order the same way every time. */
export function compareMembersByName(a: NamedMember, b: NamedMember): number {
  const byName = String(a?.name ?? "").localeCompare(String(b?.name ?? ""));
  if (byName !== 0) return byName;
  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
}

/** A sorted copy. The input is left alone, so a caller may hold the payload order too. */
export function sortMembersByName<T extends NamedMember>(list: readonly T[]): T[] {
  return [...list].sort(compareMembersByName);
}
