/**
 * The one MySQL pool (S6). Every query in the app flows through here so the
 * two disciplines cannot drift:
 *
 *  - `timezone: 'Z'` (plan rule 2.3): the app machine may sit in any zone —
 *    this one is UTC-6 — and mysql2's 'local' default would shift every
 *    stored timestamp, including the lunar boundaries the whole economy
 *    settles on.
 *  - Fail loud, never fall back: a missing DATABASE_URL after the users
 *    domain moved to MySQL is a misconfiguration, not a signal to quietly
 *    reopen the JSON era. Two backends is how a member exists in one and
 *    not the other.
 */
import mysql from "mysql2/promise";

let _pool: mysql.Pool | null = null;

export function getPool(): mysql.Pool {
  if (_pool) return _pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. The users domain lives in MySQL (S6); on Railway it is a reference to the MySQL service, locally it belongs in .env.",
    );
  }
  _pool = mysql.createPool({
    uri: url,
    timezone: "Z",
    connectionLimit: 8,
    // Fail fast when the DB is unreachable rather than queueing forever.
    connectTimeout: 10_000,
  });
  /*
   * The driver half of the timezone discipline was never enough on its own.
   *
   * `timezone: 'Z'` above only tells mysql2 how to RENDER JS Dates and parse
   * DATETIME strings. `NOW()` and `CURRENT_TIMESTAMP` are evaluated by MySQL
   * in the SESSION zone, which stays at the server's default — so on any
   * deployment whose MySQL is not UTC, a bound Date and a NOW() lived in
   * different frames. Two load-bearing comparisons mixed them: the abuse
   * guard's window (`at > ?` against a JS Date, rows written with
   * CURRENT_TIMESTAMP) and the scheduler's dueness check. Both fail in the
   * unsafe direction — a rate limit that never triggers, hourly jobs firing
   * every tick.
   *
   * The numeric offset, never the name 'UTC': a server without the timezone
   * tables loaded throws on 'UTC', and a throwing init query takes the whole
   * pool down. On a UTC MySQL (Railway) this is a no-op.
   */
  _pool.on("connection", (c) => {
    c.query("SET time_zone = '+00:00'");
  });
  return _pool;
}

/** For tests and graceful shutdown. */
export async function closePool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}
