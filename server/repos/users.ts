/**
 * The members repository: the only place that reads or writes member records.
 *
 * Before this, 29 call sites in server/index.ts each did their own
 * read-modify-write against users.json: `readJson`, then `findIndex`, then mutate
 * the array element, then `writeJson` the whole thing back. That pattern is the
 * race: two requests overlapping means the second read happens before the first
 * write, and one member's change vanishes with no error anywhere.
 *
 * `update()` exists to make that impossible to write by accident. Callers pass a
 * mutator and the repository owns the read, the mutate and the write, so there is
 * exactly one place where the sequence lives and exactly one place to add locking
 * or a transaction when this moves to MySQL.
 *
 * Deliberately synchronous while the backing store is a file. Converting to async
 * cascades through every sync helper (`computeStage`, `gratitudeBudget`,
 * `userCan`) and every route, and doing that in the same change that introduces
 * the repository would make a mechanical refactor unreviewable. The MySQL swap
 * happens behind THIS interface, one domain at a time, with the loop test as the
 * gate. See AMORA_FOUNDATION_UPGRADE_PLAN.md revision 3, build order step 1.
 */
import fs from "fs";

/** Loose on purpose: the record's shape is still owned by server/index.ts. */
export type MemberRecord = Record<string, any> & { id: string; email: string };

interface UsersDoc {
  users: MemberRecord[];
}

export interface UsersRepo {
  all(): MemberRecord[];
  byId(id: string): MemberRecord | null;
  byEmail(email: string): MemberRecord | null;
  existsByEmail(email: string): boolean;
  count(): number;
  add(member: MemberRecord): MemberRecord;
  /**
   * Read, mutate, write, as one operation. Returns the updated record, or null if
   * the member is gone. The mutator receives the live object and may change it in
   * place; returning a value is unnecessary.
   */
  update(id: string, mutate: (member: MemberRecord) => void): MemberRecord | null;
  remove(id: string): MemberRecord | null;
  /**
   * Read-only view. Paired with `saveDoc` this is the honest shape of the
   * existing handlers, and keeping every access inside this module is the point:
   * a repository that only covers the tidy cases leaves the awkward ones reading
   * the file directly, and then there are two places to change when MySQL
   * arrives, which is the "two sources of truth" trap.
   */
  readDoc(): MemberRecord[];
  /**
   * Persist a list the caller already loaded (via readDoc) and mutated in place.
   *
   * This is the honest shape of the existing code: a handler loads every member,
   * edits one, and writes the lot back. Note what it does NOT do: it cannot merge
   * with a concurrent change, because the caller's array is already stale by the
   * time it arrives. That is the pre-existing race, now visible in one signature
   * instead of spread across 29 call sites, and it is what a transaction fixes
   * when this moves to MySQL. Prefer `update()` for single-member edits.
   */
  saveDoc(members: MemberRecord[]): void;
}

function load(file: string): UsersDoc {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    if (parsed && Array.isArray(parsed.users)) return parsed as UsersDoc;
    // A bare array is tolerated: some early fixtures wrote one.
    if (Array.isArray(parsed)) return { users: parsed as MemberRecord[] };
    return { users: [] };
  } catch {
    // Matches readJson's behaviour in server/index.ts: a corrupt file reads as
    // empty rather than throwing. Worth knowing that this means a damaged
    // users.json presents as "no members" rather than as an error.
    return { users: [] };
  }
}

function save(file: string, doc: UsersDoc) {
  fs.writeFileSync(file, JSON.stringify(doc, null, 2));
}

const sameEmail = (a: unknown, b: unknown) =>
  String(a ?? "").toLowerCase() === String(b ?? "").toLowerCase();

export function usersRepo(file: string): UsersRepo {
  return {
    all() {
      return load(file).users;
    },

    byId(id) {
      return load(file).users.find((u) => u.id === id) ?? null;
    },

    byEmail(email) {
      return load(file).users.find((u) => sameEmail(u.email, email)) ?? null;
    },

    existsByEmail(email) {
      return load(file).users.some((u) => sameEmail(u.email, email));
    },

    count() {
      return load(file).users.length;
    },

    add(member) {
      const doc = load(file);
      doc.users.push(member);
      save(file, doc);
      return member;
    },

    update(id, mutate) {
      const doc = load(file);
      const idx = doc.users.findIndex((u) => u.id === id);
      if (idx === -1) return null;
      mutate(doc.users[idx]);
      save(file, doc);
      return doc.users[idx];
    },

    remove(id) {
      const doc = load(file);
      const idx = doc.users.findIndex((u) => u.id === id);
      if (idx === -1) return null;
      const [removed] = doc.users.splice(idx, 1);
      save(file, doc);
      return removed;
    },

    readDoc() {
      return load(file).users;
    },

    saveDoc(list) {
      save(file, { users: list });
    },
  };
}
