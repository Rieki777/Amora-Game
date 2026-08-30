/**
 * The meter's storage (lane METER). Raw SQL lives here and nowhere else, which
 * is the module-intake rule, and it is all hand-written for a reason:
 * `dbCollection` loads a whole table into memory and rewrites it on change,
 * which is right for a settings table and wrong for a counter that a village
 * writes to all cycle and reads once.
 *
 * Every function here takes the pool as an argument and holds no state. The
 * cycle logic, the in-memory short circuit and the decision about WHEN to seal
 * belong to `server/lib/moduleUsage.ts`, which is the file to read first.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export interface ModuleCycleUsage {
  moduleId: string;
  /** Distinct members who opened this module in this cycle. */
  membersReached: number;
  /** Distinct members who opened ANY module in this cycle. The denominator. */
  activeMembers: number;
}

export interface CycleUsage {
  cycleId: string;
  activeMembers: number;
  modules: ModuleCycleUsage[];
  /** False while the cycle is open and the numbers are still moving. */
  sealed: boolean;
  /**
   * When the marks were aggregated and dropped, ISO, or null while open.
   *
   * The column has been NOT NULL in `module_usage_cycles` since 0101 and
   * nothing ever read it. It is the counter's evidence that these numbers
   * stopped moving: a settlement is made against a sealed cycle, and a sealed
   * cycle with no date on it is a payment nobody can place afterwards.
   */
  sealedAt: string | null;
}

/**
 * Record that this member opened this module in this cycle, once.
 *
 * `INSERT IGNORE` because the second mark is the expected case and not an
 * error: two processes behind a load balancer will race on the same member's
 * first request of the cycle, and the primary key is the whole dedupe. All
 * three key columns are NOT NULL, so the key actually binds (a nullable column
 * in a MySQL unique index admits infinite duplicates).
 */
export async function markUse(
  pool: Pool,
  cycleId: string,
  moduleId: string,
  userId: string,
): Promise<void> {
  await pool.query(
    "INSERT IGNORE INTO module_usage_marks (cycle_id, module_id, user_id) VALUES (?,?,?)",
    [cycleId.slice(0, 24), moduleId.slice(0, 64), userId.slice(0, 64)],
  );
}

/**
 * The live counts for a cycle that is still open, read from the marks.
 *
 * `COUNT(*)` per module IS the distinct-member count, because the primary key
 * is (cycle, module, member) and a member can hold at most one mark per module
 * per cycle. Counting rows and counting people are the same number here by
 * construction, which is the point of a saturating unit.
 */
export async function openCycleUsage(pool: Pool, cycleId: string): Promise<CycleUsage> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT module_id, COUNT(*) AS reached FROM module_usage_marks WHERE cycle_id = ? GROUP BY module_id",
    [cycleId],
  );
  const [[active]] = await pool.query<RowDataPacket[]>(
    "SELECT COUNT(DISTINCT user_id) AS n FROM module_usage_marks WHERE cycle_id = ?",
    [cycleId],
  );
  const activeMembers = Number(active?.n ?? 0);
  return {
    cycleId,
    activeMembers,
    sealed: false,
    sealedAt: null,
    modules: rows.map((r) => ({
      moduleId: String(r.module_id),
      membersReached: Number(r.reached ?? 0),
      activeMembers,
    })),
  };
}

/**
 * A timestamp column as ISO, or null when it is absent or unreadable.
 *
 * mysql2 hands back a Date for a `timestamp` column and a string when the
 * driver is configured otherwise, and either can be an Invalid Date if the row
 * holds a zero date. A report that carried "Invalid Date" as its seal time
 * would fail the wire check downstream with a message about the wrong thing,
 * so it is refused here instead and the seal reads as absent.
 */
function isoOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** The sealed, final counts for a cycle. Empty when that cycle was never sealed. */
export async function sealedCycleUsage(pool: Pool, cycleId: string): Promise<CycleUsage> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT module_id, members_reached, active_members, sealed_at FROM module_usage_cycles WHERE cycle_id = ?",
    [cycleId],
  );
  /*
   * THE DENOMINATOR IS THE CYCLE'S, NEVER ONE ROW'S.
   *
   * This used to read `rows[0].active_members` under a comment saying every row
   * for a cycle carries the same denominator. `sealCycle` now makes that true,
   * and this is the second half of the same defence: taking the largest cannot
   * be decided by which row the database happened to hand back first, and it
   * can never be smaller than the number of members some module in this cycle
   * was already measured against.
   *
   * What it cost while it was `rows[0]`: a straggler sealing a module nothing
   * had recorded yet wrote that row against a denominator of one, and if the
   * new module's id sorted first, the whole cycle reported a denominator of
   * one. Every module's reach then divided by one, which the clamp holds at
   * 1.0 without ever noticing that a module a quarter of the village opened is
   * being paid as though everybody had.
   */
  const activeMembers = rows.reduce((n, r) => Math.max(n, Number(r.active_members ?? 0)), 0);
  return {
    cycleId,
    activeMembers,
    sealed: rows.length > 0,
    // The latest seal, for the same reason: a re-seal writes NOW() onto the
    // rows it touched and leaves the rest, so the cycle's seal time is the most
    // recent one and never whichever row sorted first.
    sealedAt: rows.reduce<string | null>((latest, r) => {
      const at = isoOrNull(r.sealed_at);
      return at && (!latest || at > latest) ? at : latest;
    }, null),
    modules: rows.map((r) => ({
      moduleId: String(r.module_id),
      membersReached: Number(r.members_reached ?? 0),
      // The cycle's denominator, not the row's. A row written by a later seal
      // carries what that pass could see, which is less than the cycle held.
      activeMembers,
    })),
  };
}

/** Cycles holding marks that are no longer the open one, oldest first. */
export async function cyclesAwaitingSeal(pool: Pool, openCycleId: string): Promise<string[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT cycle_id FROM module_usage_marks WHERE cycle_id <> ? GROUP BY cycle_id ORDER BY cycle_id",
    [openCycleId],
  );
  return rows.map((r) => String(r.cycle_id));
}

/**
 * Turn a closed cycle's marks into its permanent aggregate, and drop the marks.
 *
 * The two statements are one transaction because the gap between them is the
 * only moment the village's usage record could be lost: aggregate written and
 * marks kept is a double count on the next seal, marks dropped and aggregate
 * unwritten is a cycle nobody was paid for. Neither is recoverable afterwards,
 * because the marks are the only copy.
 *
 * Deleting the marks IS the privacy design and not housekeeping. Once this
 * returns, the database can no longer say which member opened which module,
 * this cycle or ever. See 0101's header.
 *
 * A SECOND SEAL CAN ONLY EVER RAISE A COUNT, which is why the upsert takes
 * `GREATEST` and not the new value. Replacing was wrong in a way that is easy
 * to miss: if any mark landed between two seals, the second pass sees only that
 * mark, and a replacing upsert would overwrite a count of forty with a count of
 * one. The first pass already deleted the marks behind its forty, and the marks
 * are the only copy, so the correct number would be gone for good. Counts
 * inside a cycle only ever grow, so taking the larger is both safe and the true
 * answer. A cycle whose marks are already gone writes nothing at all.
 */
export async function sealCycle(pool: Pool, cycleId: string): Promise<number> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[active]] = await conn.query<RowDataPacket[]>(
      "SELECT COUNT(DISTINCT user_id) AS n FROM module_usage_marks WHERE cycle_id = ?",
      [cycleId],
    );
    const marked = Number(active?.n ?? 0);
    if (marked === 0) {
      await conn.commit();
      return 0;
    }
    /*
     * THE DENOMINATOR A RE-SEAL WRITES IS THE CYCLE'S, NEVER THIS PASS'S.
     *
     * `GREATEST` in the upsert below defends a row that already exists and can
     * do nothing for a row that does not. A straggler opening a module nothing
     * had recorded yet arrives in a pass that can see one member, because the
     * first pass already deleted the marks behind its own count and the marks
     * are the only copy. That new row would land against a denominator of one,
     * which is a reach of 1.0 for a module one person in forty opened.
     *
     * So the pass takes the larger of what it can see and what this cycle was
     * already measured against. It cannot recover the straggler themselves, who
     * is genuinely lost with the marks, and it does not pretend to: what it
     * guarantees is that every module in a cycle is divided by one number.
     */
    const [[recorded]] = await conn.query<RowDataPacket[]>(
      "SELECT MAX(active_members) AS n FROM module_usage_cycles WHERE cycle_id = ?",
      [cycleId],
    );
    const activeMembers = Math.max(marked, Number(recorded?.n ?? 0));
    await conn.query(
      "INSERT INTO module_usage_cycles (cycle_id, module_id, members_reached, active_members, sealed_at) " +
        "SELECT cycle_id, module_id, COUNT(*), ?, NOW() FROM module_usage_marks WHERE cycle_id = ? GROUP BY cycle_id, module_id " +
        "ON DUPLICATE KEY UPDATE members_reached = GREATEST(members_reached, VALUES(members_reached)), " +
        "active_members = GREATEST(active_members, VALUES(active_members)), sealed_at = VALUES(sealed_at)",
      [activeMembers, cycleId],
    );
    const [del]: any = await conn.query("DELETE FROM module_usage_marks WHERE cycle_id = ?", [cycleId]);
    await conn.commit();
    return Number(del?.affectedRows ?? 0);
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
