/**
 * The one assertion about `getPool()` that about ten other comparisons rest on.
 *
 * `server/db/harness.test.ts` already proves the SCRATCH connection is pinned,
 * and `server/db/migrate.ts` pins its own. Nothing proved it of the pool the
 * application actually runs on, which is the only one that decides whether a
 * rate limit triggers, a job is due, a ballot has closed or a mint cap has been
 * reached. The pin is a fire-and-forget query inside an event handler; a typo,
 * a driver change, or a server refusing the offset would all leave it silent.
 *
 * The second case is the one worth having. It does not ask what the session
 * zone SAYS; it writes a row the way the application writes rows, reads it back
 * the way the application reads them, and subtracts. That is the arithmetic
 * every one of those comparisons performs, and if it ever stops coming out near
 * zero, all of them broke together.
 */
import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closePool, getPool } from "./pool";
import { provisionTestDb, testDbConfigured, type TestDb } from "./testDb";

const configured = testDbConfigured();
if (!configured) {
  // eslint-disable-next-line no-console
  console.warn("[pool.test] TEST_DATABASE_URL not set — the application pool's session pin is UNCHECKED here.");
}

describe.skipIf(!configured)("the application pool", () => {
  let db: TestDb;
  let previousUrl: string | undefined;

  beforeAll(async () => {
    db = await provisionTestDb();
    previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = db.url;
    await closePool();
  }, 120_000);

  afterAll(async () => {
    await closePool();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await db?.drop();
  });

  it("pins the MySQL session zone on the connections the app really uses", async () => {
    const pool = getPool();
    // Several at once, so this reads more than one pooled connection and a hook
    // that fired for the first only would show up.
    const seen = await Promise.all(
      [0, 1, 2, 3].map(async () => {
        const [rows] = await pool.query<any[]>("SELECT @@session.time_zone AS tz");
        return String(rows[0].tz);
      }),
    );
    expect(seen).toEqual(["+00:00", "+00:00", "+00:00", "+00:00"]);
  });

  it("a NOW()-written column read back through it agrees with this process's clock", async () => {
    const pool = getPool();
    await pool.query( // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
      "CREATE TABLE IF NOT EXISTS `_clock_probe` (`k` varchar(16) NOT NULL PRIMARY KEY, `at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP)",
    );
    try {
      await pool.query("REPLACE INTO `_clock_probe` (k, at) VALUES ('now', NOW())"); // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
      const [rows] = await pool.query<any[]>("SELECT at FROM `_clock_probe` WHERE k = 'now'"); // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
      const drift = Math.abs(Date.now() - new Date(rows[0].at).getTime());

      /*
       * Two seconds, and the slack is truncation and round trip, never a zone.
       * A zone error is at least fifteen minutes and usually a whole hour, so
       * there is no offset this tolerance could absorb. The freshness windows
       * downstream are sixty seconds.
       */
      expect(drift).toBeLessThan(2_000);
    } finally {
      await pool.query("DROP TABLE IF EXISTS `_clock_probe`"); // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
    }
  });

  it("and the control: an UNPINNED connection reads NOW() off by exactly the session's offset", async () => {
    /*
     * Every suite in this repo builds its own pool with `timezone: "Z"` and no
     * session pin, which is the regime this connection reproduces.
     *
     * THE OFFSET IS MEASURED, NEVER READ OFF THE NAME. The first version of
     * this test branched on whether `@@session.time_zone` was the string
     * "+00:00" and demanded a drift over a minute when it was not. It passed
     * here and went red in CI at 924 ms, because CI's MySQL reports `SYSTEM`
     * while its host runs UTC: the name says "not pinned" and the offset says
     * zero, and those are different questions. This machine's MariaDB reports
     * `SYSTEM` too, four hours from UTC. So ask the server what the offset IS.
     *
     * The assertion is a total one and holds on either engine: `NOW()` read
     * through an unpinned session comes back wrong by exactly that offset,
     * whether the offset is four hours or nothing at all.
     */
    const loose = await mysql.createConnection({ uri: db.url, timezone: "Z" });
    try {
      const [[row]] = await loose.query<any[]>(
        "SELECT @@session.time_zone AS tz, TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS offsetSeconds, " +
          "NOW() AS n, UNIX_TIMESTAMP(NOW()) AS u",
      );
      const offsetMs = Number(row.offsetSeconds) * 1000;
      // The server's clock really is right. Only the reading moves.
      expect(Math.abs(Number(row.u) * 1000 - Date.now())).toBeLessThan(60_000);
      // And it moves by the offset, in the direction the session leans.
      const apparentDrift = Date.now() - new Date(row.n).getTime();
      expect(Math.abs(apparentDrift + offsetMs)).toBeLessThan(5_000);
      // Whatever that offset is, the pinned pool above answered zero for it.
      const pinned = getPool();
      const [[p]] = await pinned.query<any[]>(
        "SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW()) AS offsetSeconds",
      );
      expect(Number(p.offsetSeconds)).toBe(0);
    } finally {
      await loose.end();
    }
  });
});
