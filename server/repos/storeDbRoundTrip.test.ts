/**
 * `replaceAll` preserves what it was not told to preserve.
 *
 * This is the trap the whole `dbCollection` shape carries: `replaceAll` is a
 * DELETE-all plus a re-INSERT of exactly the columns in the spec, so a column
 * LEFT OUT is not left alone, it is re-defaulted. `circles.created_at` is
 * `NOT NULL DEFAULT CURRENT_TIMESTAMP`, and it was absent from the spec, so
 * every admin circle edit reset every circle's birth date to the moment of
 * that edit.
 *
 * `defaultNow` existed on `ColumnSpec` and no collection used it, which is why
 * the mechanism was there and the bug was too.
 *
 * These tests exercise the coercion directly rather than through MySQL: the
 * question is what value the writer HANDS the database, and that is decided in
 * `toDb` before any connection is involved.
 */
import { describe, expect, it } from "vitest";
import { __testing } from "./store-db";

const { toDb, fromDb } = __testing;

describe("a timestamp column that must survive replaceAll", () => {
  const spec = { js: "createdAt", db: "created_at", kind: "time" as const, defaultNow: true };

  it("carries an existing birth date through the round trip unchanged", () => {
    // The actual defect: this used to come back as `now` on every save.
    const born = new Date("2026-03-01T09:15:00.000Z");
    const roundTripped = toDb(spec, fromDb(spec, born));
    expect(roundTripped).toBeInstanceOf(Date);
    expect((roundTripped as Date).toISOString()).toBe("2026-03-01T09:15:00.000Z");
  });

  it("stamps now only when a row genuinely has no date", () => {
    // A circle created through the admin form has no createdAt in hand, and
    // the column is NOT NULL, so writing NULL would be a constraint violation.
    const before = Date.now();
    const v = toDb(spec, undefined);
    expect(v).toBeInstanceOf(Date);
    expect((v as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("writes NULL for an absent timestamp that has NO defaultNow", () => {
    // The flag has to be what decides it, or every nullable timestamp in the
    // schema would start stamping itself.
    expect(toDb({ js: "endedAt", db: "ended_at", kind: "time" }, undefined)).toBeNull();
  });

  it("reads a MySQL string date as an ISO string", () => {
    // mysql2 hands dates back as Date on some configs and strings on others.
    expect(fromDb(spec, "2026-03-01 09:15:00")).toContain("2026-03-01");
  });

  it("refuses to turn an unparseable date into an invalid Date", () => {
    // Writing `Invalid Date` produces a MySQL error at the far end of a
    // transaction, which is the worst place to learn about it.
    expect(toDb(spec, "not a date")).toBeNull();
  });
});
