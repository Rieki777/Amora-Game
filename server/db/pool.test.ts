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

  it("and the control: an UNPINNED connection to the same server is where that arithmetic goes wrong", async () => {
    /*
     * Every suite in this repo builds its own pool with `timezone: "Z"` and no
     * session pin, which is the regime this connection reproduces. On a UTC
     * server the drift is zero and this test asserts nothing beyond the
     * pinned one; on a server in any other zone it is that zone's offset, and
     * the assertion below is what tells the reader the pinned result above was
     * not a coincidence.
     */
    const loose = await mysql.createConnection({ uri: db.url, timezone: "Z" });
    try {
      const [[row]] = await loose.query<any[]>("SELECT @@session.time_zone AS tz, NOW() AS n, UNIX_TIMESTAMP(NOW()) AS u");
      const trueSkew = Math.abs(Number(row.u) * 1000 - Date.now());
      const apparentDrift = Math.abs(Date.now() - new Date(row.n).getTime());
      // The server's clock really is right. Only the reading is shifted.
      expect(trueSkew).toBeLessThan(60_000);
      if (String(row.tz) !== "+00:00") {
        expect(apparentDrift).toBeGreaterThan(60_000);
      } else {
        expect(apparentDrift).toBeLessThan(2_000);
      }
    } finally {
      await loose.end();
    }
  });
});
