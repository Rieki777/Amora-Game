/**
 * The housing rules that three other lanes are implementing against (0077).
 *
 * These run WITHOUT a database on purpose. The behaviour worth pinning here is
 * decision logic, not SQL: which hamlets count as set, how `open` is derived,
 * and who wins when a founder's typed number and a live reservation count
 * disagree. A fake pool makes those provable on any machine, including a
 * worktree with no .env, where every DB-backed suite skips.
 */
import { describe, it, expect } from "vitest";
import {
  allHomeTypes,
  allRows,
  exceedsTotal,
  homeFeatureLines,
  HOME_TYPES,
  isHomeType,
  openHomes,
  publicEntries,
  publicHomeTypes,
  readAvailabilityPatch,
  readHomeTypePatch,
  reservationStatusNotice,
  setAvailability,
  setHomeType,
} from "./housing";

/**
 * A pool stub that answers the two queries this module makes, keyed on a
 * fragment of the SQL. Deliberately dumb: it asserts nothing about the query
 * text beyond which table it reads, so a harmless rewording of the SQL does
 * not fail these tests, while reading a table that does not exist here does.
 */
function fakePool(availability: any[], reservations: any[] = []) {
  return {
    async query(sql: string) {
      if (sql.includes("FROM housing_reservations")) {
        const counts = new Map<string, number>();
        for (const r of reservations) {
          if (r.status === "reserved" && r.structure_key != null) {
            counts.set(r.structure_key, (counts.get(r.structure_key) ?? 0) + 1);
          }
        }
        return [[...counts].map(([structure_key, n]) => ({ structure_key, n })), []];
      }
      if (sql.includes("FROM housing_availability")) return [availability, []];
      throw new Error(`unexpected query: ${sql}`);
    },
  } as any;
}

const row = (over: Record<string, unknown> = {}) => ({
  structure_key: "ridgeA",
  label: null,
  homes_total: 5,
  homes_taken: 2,
  taken_source: "founder",
  updated_by: null,
  updated_at: "2026-08-14 00:00:00",
  ...over,
});

describe("open homes", () => {
  it("derives open from total and taken", () => {
    expect(openHomes(5, 2)).toBe(3);
  });

  it("clamps to zero when a founder types more taken than total", () => {
    // Fail-closed. A negative would render as nonsense and a large positive
    // would read as more homes than the hamlet has.
    expect(openHomes(2, 5)).toBe(0);
  });
});

/*
 * THE SEAM. `allRows` feeds the founder panel and `publicEntries` feeds every
 * visitor surface, and until 2026-08-16 nothing compared them. They disagreed on
 * exactly one row shape, and it was the shape the whole authority-flip feature is
 * about: total typed, homes_taken never typed, source flipped to `reservations`.
 *
 * The founder saw a green badge reading "4 open of 6" beside an EMPTY taken box,
 * while every visitor read "Example numbers. The founder has not set this hamlet
 * yet." Both photographed at the same moment. 1349 green tests never saw it,
 * because no test tied the two functions together. This one does.
 */
describe("the founder panel and the public list agree about what is set", () => {
  const SHAPES = [
    { name: "both typed", over: {}, set: true },
    { name: "neither typed", over: { homes_total: null, homes_taken: null }, set: false },
    { name: "total typed, taken never typed", over: { homes_taken: null }, set: false },
    { name: "taken typed, total never typed", over: { homes_total: null }, set: false },
    { name: "both typed as zero", over: { homes_total: 0, homes_taken: 0 }, set: true },
    // The row the seam split. A live count is a number even when it is zero, so
    // `open` is a number here and the panel used to read that as "set".
    {
      name: "flipped to reservations with a taken nobody typed",
      over: { homes_taken: null, taken_source: "reservations" },
      set: false,
    },
  ];

  for (const shape of SHAPES) {
    it(`agrees on: ${shape.name}`, async () => {
      const r = row(shape.over);
      const [panel] = await allRows(fakePool([r]));
      const entries = await publicEntries(fakePool([r]));
      const publicSaysSet = entries.some((e) => e.structureKey === panel.structureKey);

      expect(panel.isSet).toBe(shape.set);
      expect(publicSaysSet).toBe(shape.set);
      // The assertion that would have caught it: the two must never disagree,
      // whatever the right answer is.
      expect(panel.isSet).toBe(publicSaysSet);
    });
  }

  it("does not let `open` stand in for the predicate", async () => {
    // The exact substitution that shipped the defect: `open` is a NUMBER on a
    // row the public list calls an example.
    const r = row({ homes_total: 6, homes_taken: null, taken_source: "reservations" });
    const [panel] = await allRows(fakePool([r]));
    expect(panel.open).not.toBeNull();
    expect(panel.isSet).toBe(false);
  });
});

describe("the example predicate: what reaches the public entries list", () => {
  it("lists a hamlet whose counts are both set", async () => {
    const entries = await publicEntries(fakePool([row()]));
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ structureKey: "ridgeA", total: 5, taken: 2, open: 3 });
  });

  it("treats zero homes as SET, never as an example", async () => {
    // total 0 / taken 0 is a real answer: this hamlet has no homes. The
    // caps-fail-closed invariant says 0 is zero and never unlimited, and a
    // surface must not call it an example.
    const entries = await publicEntries(fakePool([row({ homes_total: 0, homes_taken: 0 })]));
    expect(entries).toHaveLength(1);
    expect(entries[0].open).toBe(0);
  });

  it("drops a row with total set and taken unset", async () => {
    const entries = await publicEntries(fakePool([row({ homes_taken: null })]));
    expect(entries).toEqual([]);
  });

  it("drops a row with taken set and total unset", async () => {
    const entries = await publicEntries(fakePool([row({ homes_total: null })]));
    expect(entries).toEqual([]);
  });

  it("drops a row a founder named but never numbered", async () => {
    // Builder mode inserts on NAMING a hamlet, so this row shape is ordinary
    // and is the reason a row existing cannot mean the hamlet is set.
    const entries = await publicEntries(
      fakePool([row({ homes_total: null, homes_taken: null, label: "Ridge Hamlet North" })]),
    );
    expect(entries).toEqual([]);
  });

  it("carries no identity fields, because this rides an uncredentialed route", async () => {
    const entries = await publicEntries(fakePool([row({ updated_by: "user-123" })]));
    const keys = Object.keys(entries[0]);
    expect(keys).not.toContain("updatedBy");
    expect(keys).not.toContain("updatedAt");
    expect(JSON.stringify(entries)).not.toContain("user-123");
  });
});

describe("taken_source decides who wins", () => {
  it("keeps the founder's typed number even when reservations exist", async () => {
    // Homes spoken for before this platform existed are the whole reason
    // taken is stored at all, so a live count must not silently override it.
    const entries = await publicEntries(
      fakePool(
        [row({ homes_taken: 4, taken_source: "founder" })],
        [
          { structure_key: "ridgeA", status: "reserved" },
          { structure_key: "ridgeA", status: "reserved" },
        ],
      ),
    );
    expect(entries[0].taken).toBe(4);
    expect(entries[0].open).toBe(1);
  });

  it("uses the live reserved count once a hamlet is flipped over", async () => {
    const entries = await publicEntries(
      fakePool(
        [row({ homes_taken: 4, taken_source: "reservations" })],
        [
          { structure_key: "ridgeA", status: "reserved" },
          { structure_key: "ridgeA", status: "reserved" },
        ],
      ),
    );
    expect(entries[0].taken).toBe(2);
    expect(entries[0].open).toBe(3);
  });

  it("counts only reserved rows, so an unanswered enquiry takes no home", async () => {
    const entries = await publicEntries(
      fakePool(
        [row({ homes_taken: 0, taken_source: "reservations" })],
        [
          { structure_key: "ridgeA", status: "new" },
          { structure_key: "ridgeA", status: "contacted" },
          { structure_key: "ridgeA", status: "withdrawn" },
        ],
      ),
    );
    expect(entries[0].taken).toBe(0);
    expect(entries[0].open).toBe(5);
  });

  it("keeps a flipped hamlet visible when its live count is zero", async () => {
    // The founder TYPED a number here (the fixture's homes_taken is 2), so
    // the hamlet is set and does not fall back to reading as an example the
    // moment it flips over. The live count being zero is not the same fact as
    // the column being unset, and the case below is the difference.
    const entries = await publicEntries(fakePool([row({ taken_source: "reservations" })], []));
    expect(entries).toHaveLength(1);
    expect(entries[0].taken).toBe(0);
  });

  it("does NOT publish a flipped hamlet whose homes_taken column was never typed", async () => {
    /*
     * The predicate is about the COLUMNS and nothing else: the contract says
     * `row missing OR homes_total IS NULL OR homes_taken IS NULL`.
     *
     * The implementation filtered on the EFFECTIVE taken instead, and the two
     * agree everywhere except here. `effectiveTaken` on a reservations-sourced
     * row returns the live count, and a live count is a number even when it is
     * zero, so `homes_taken IS NULL` never survived to be tested and the row
     * published as configured carrying `taken: 0`.
     *
     * THREE ORDINARY ONE-FIELD SAVES REACH IT, all of them things the Admin
     * panel does with single clicks: add the hamlet, set the total, flip the
     * authority to reservations. Nobody has to do anything strange.
     *
     * What it costs: the three surfaces that read `entries` decide whether to
     * label numbers an example purely by whether their structure key is in the
     * list. A key that appears is a promise that a founder set these numbers.
     * This published a number no founder ever typed as exactly that promise.
     */
    const entries = await publicEntries(
      fakePool([row({ homes_total: 5, homes_taken: null, taken_source: "reservations" })], []),
    );
    expect(entries, "an untyped homes_taken is unset, whatever the authority").toEqual([]);

    // With reservations actually on the books, so the live count is non-zero
    // and the row still must not publish: it is the COLUMN that decides.
    const withLive = await publicEntries(
      fakePool(
        [row({ homes_total: 5, homes_taken: null, taken_source: "reservations" })],
        [{ structure_key: "ridgeA", status: "reserved" }],
      ),
    );
    expect(withLive, "a live count is not a founder typing a number").toEqual([]);

    // The control. Type the number and it publishes, counted the flipped way.
    const typed = await publicEntries(
      fakePool(
        [row({ homes_total: 5, homes_taken: 0, taken_source: "reservations" })],
        [{ structure_key: "ridgeA", status: "reserved" }],
      ),
    );
    expect(typed).toHaveLength(1);
    expect(typed[0]).toMatchObject({ total: 5, taken: 1, open: 4 });
  });
});

describe("the founder view", () => {
  it("keeps unset rows and reports open as null for them", async () => {
    const rows = await allRows(fakePool([row({ homes_total: null, homes_taken: null })]));
    expect(rows).toHaveLength(1);
    expect(rows[0].total).toBeNull();
    expect(rows[0].open).toBeNull();
  });

  it("shows the live reserved count even while the founder's number wins", async () => {
    // So a founder can see what flipping the row over would do before doing it.
    const rows = await allRows(
      fakePool(
        [row({ homes_taken: 4, taken_source: "founder" })],
        [{ structure_key: "ridgeA", status: "reserved" }],
      ),
    );
    expect(rows[0].taken).toBe(4);
    expect(rows[0].reservedCount).toBe(1);
  });

  /*
   * The founder view carries the EFFECTIVE count for display and the TYPED
   * one for writing back, and the two differ exactly when a row counts by
   * reservations. A surface that round-trips the wrong one destroys the typed
   * number, which migration 0077 says survives the flip.
   */
  it("reports storedTaken as the typed number while taken shows the live count", async () => {
    const rows = await allRows(
      fakePool(
        [row({ homes_total: 10, homes_taken: 4, taken_source: "reservations" })],
        [
          { structure_key: "ridgeA", status: "reserved" },
          { structure_key: "ridgeA", status: "reserved" },
        ],
      ),
    );
    expect(rows[0].taken).toBe(2);
    expect(rows[0].storedTaken).toBe(4);
    // open follows the effective count, because that is what a visitor sees.
    expect(rows[0].open).toBe(8);
  });

  it("reports storedTaken null when the founder never typed one", async () => {
    const rows = await allRows(fakePool([row({ homes_taken: null })]));
    expect(rows[0].storedTaken).toBeNull();
  });

  it("has storedTaken equal taken while the founder's number is authoritative", async () => {
    const rows = await allRows(
      fakePool([row({ homes_taken: 4 })], [{ structure_key: "ridgeA", status: "reserved" }]),
    );
    expect(rows[0].taken).toBe(4);
    expect(rows[0].storedTaken).toBe(4);
  });
});

/**
 * A pool stub that records what was asked of it, for the write path.
 *
 * These assert the SQL and its parameters because the defect they pin is
 * invisible in the return value: `setAvailability` resolves the same either
 * way, and the damage is a column that got written when it should not have.
 */
function recordingPool() {
  const calls: { sql: string; params: any[] }[] = [];
  return {
    calls,
    pool: {
      async query(sql: string, params: any[]) {
        calls.push({ sql, params });
        return [{ affectedRows: 1 }, []];
      },
    } as any,
  };
}

/** The parameter bound to a named column in the INSERT above. */
const paramFor = (sql: string, params: any[], column: string) => {
  const cols = sql
    .slice(sql.indexOf("(") + 1, sql.indexOf(")"))
    .split(",")
    .map((c) => c.trim());
  const i = cols.indexOf(column);
  expect(i).toBeGreaterThanOrEqual(0);
  return params[i];
};

describe("the write path keeps what it was not told to change", () => {
  it("leaves taken_source alone when the caller did not send one", async () => {
    // A rename sends the counts and the label and has no opinion about
    // authority. Writing the default instead flipped a hamlet counted by
    // reservations back to counting a typed number, silently.
    const { calls, pool } = recordingPool();
    await setAvailability(pool, {
      structureKey: "ridgeA",
      total: 10,
      taken: 4,
      label: "Ridge Hamlet North",
      updatedBy: "user-1",
    });
    expect(calls).toHaveLength(1);
    const update = calls[0].sql.slice(calls[0].sql.indexOf("ON DUPLICATE KEY UPDATE"));
    expect(update).not.toContain("taken_source");
    // The other three columns are still written unconditionally, because null
    // on a count is a value a founder can mean.
    expect(update).toContain("homes_total = VALUES(homes_total)");
    expect(update).toContain("homes_taken = VALUES(homes_taken)");
    expect(update).toContain("label = VALUES(label)");
    // A brand new row still has to start somewhere, and that is 'founder'.
    expect(paramFor(calls[0].sql, calls[0].params, "taken_source")).toBe("founder");
  });

  it("writes taken_source when the caller did send one", async () => {
    const { calls, pool } = recordingPool();
    await setAvailability(pool, {
      structureKey: "ridgeA",
      total: 10,
      taken: 4,
      takenSource: "reservations",
      updatedBy: "user-1",
    });
    const update = calls[0].sql.slice(calls[0].sql.indexOf("ON DUPLICATE KEY UPDATE"));
    expect(update).toContain("taken_source = VALUES(taken_source)");
    expect(paramFor(calls[0].sql, calls[0].params, "taken_source")).toBe("reservations");
  });

  it("survives the round trip a founder surface makes: read, edit a name, write", async () => {
    /*
     * The whole defect in one test. A hamlet counted by reservations with two
     * live and four typed. A surface reads the row, changes only the label,
     * and writes back what it read. Sending `storedTaken` keeps the 4;
     * sending `taken` would store the 2 and the typed number would be gone
     * with nothing able to say it ever existed.
     */
    const rows = await allRows(
      fakePool(
        [row({ homes_total: 10, homes_taken: 4, taken_source: "reservations" })],
        [
          { structure_key: "ridgeA", status: "reserved" },
          { structure_key: "ridgeA", status: "reserved" },
        ],
      ),
    );
    const r = rows[0];
    const { calls, pool } = recordingPool();
    await setAvailability(pool, {
      structureKey: r.structureKey,
      total: r.total,
      taken: r.storedTaken,
      label: "Ridge Hamlet North",
      takenSource: r.takenSource,
      updatedBy: "user-1",
    });
    expect(paramFor(calls[0].sql, calls[0].params, "homes_taken")).toBe(4);
    expect(paramFor(calls[0].sql, calls[0].params, "taken_source")).toBe("reservations");
  });

  it("hands exceedsTotal the row the ROUTE hands it, and the rename still lands", async () => {
    /*
     * The lockout, run rather than described. Five homes, six live
     * reservations, three typed. The effective count is 6, and 6 > 5 is the
     * 400 that made the row un-editable through the only surface that edits
     * it. The typed number is 3 and passes.
     *
     * ── WHY THIS CASE IS BUILT THIS WAY, WHICH IS THE WHOLE POINT ─────────
     * The version of this test that shipped asserted `rows[0].taken >
     * rows[0].total` and `rows[0].storedTaken > rows[0].total`: it proved the
     * two numbers were TELLABLE APART and never called the function that has
     * to tell them apart. `exceedsTotal` was reading `before.taken` at the
     * time, live in the tree, and this case was green about it.
     *
     * The block below it made the same mistake from the other side: its
     * `before` helper builds a bare `{ total, storedTaken }` literal, which
     * is the one shape that CANNOT express the defect, because a fixture with
     * no `taken` key makes the buggy line read undefined and answer false.
     * A poisoner that plants nothing reports what a passing test reports.
     *
     * So this composes the real call graph instead: `allRows()`, then
     * `.find()`, then `exceedsTotal(patch, before)`, exactly as the PUT route
     * does it. The before-state carries BOTH numbers, and only one of them is
     * the right answer.
     */
    const rows = await allRows(
      fakePool(
        [row({ homes_total: 5, homes_taken: 3, taken_source: "reservations" })],
        Array.from({ length: 6 }, () => ({ structure_key: "ridgeA", status: "reserved" })),
      ),
    );
    const before = rows.find((r) => r.structureKey === "ridgeA")!;
    expect(before.taken, "the effective count really is above the total").toBe(6);
    expect(before.storedTaken, "and the typed number really is below it").toBe(3);

    // THE ASSERTION. A rename touches no count, so it must pass against a row
    // whose live count has run past its total.
    expect(exceedsTotal({ label: "Pond Homes" }, before), "a rename on a flipped row").toBe(false);
    // And so must correcting the typed number to something the total allows.
    expect(exceedsTotal({ taken: 4 }, before), "a legal correction to the typed number").toBe(false);
    // The rule itself still bites, so the two passes above are not a function
    // that answers false to everything.
    expect(exceedsTotal({ taken: 6 }, before), "a typed number above the total").toBe(true);
  });
});

/**
 * The one absence rule, from the data layer's side.
 *
 * Absent used to mean three different things across these four columns, and
 * one of them destroyed data: a missing count was refused by the route, a
 * missing takenSource was left alone, and a missing label was written as NULL,
 * so a caller sending only the number it meant to change wiped the founder's
 * hamlet name and nothing anywhere said that would happen. These pin the one
 * sentence that replaced all three: absent leaves it, null clears it.
 */
describe("absent leaves a column alone, null clears it", () => {
  /** The columns named in the UPDATE branch of the upsert, in order. */
  const updated = (sql: string) =>
    sql
      .slice(sql.indexOf("ON DUPLICATE KEY UPDATE"))
      .replace("ON DUPLICATE KEY UPDATE", "")
      .split(",")
      .map((s) => s.trim().split(" ")[0])
      .filter(Boolean);

  it("writes ONLY the label when only the label was sent", async () => {
    // A rename. It has no opinion about either count or about the authority,
    // and it must not be able to revert one it was never told about.
    const { calls, pool } = recordingPool();
    await setAvailability(pool, {
      structureKey: "ridgeA",
      label: "Ridge Hamlet North",
      updatedBy: "user-1",
    });
    expect(updated(calls[0].sql)).toEqual(["label", "updated_by"]);
  });

  it("LEAVES THE LABEL ALONE when a numeric edit does not mention it", async () => {
    /*
     * The defect this whole describe block exists for. A surface following
     * the old contract literally, sending the one count it changed, had the
     * founder's hamlet name written to NULL underneath it.
     */
    const { calls, pool } = recordingPool();
    await setAvailability(pool, { structureKey: "ridgeA", total: 8, updatedBy: "user-1" });
    expect(updated(calls[0].sql)).toEqual(["homes_total", "updated_by"]);
    expect(updated(calls[0].sql)).not.toContain("label");
  });

  it("clears a count when the caller sends an explicit null", async () => {
    // Unset is how a founder undoes a typo without deleting the hamlet, and
    // it has to stay expressible or the count can never come off again.
    const { calls, pool } = recordingPool();
    await setAvailability(pool, { structureKey: "ridgeA", taken: null, updatedBy: "user-1" });
    expect(updated(calls[0].sql)).toEqual(["homes_taken", "updated_by"]);
    expect(paramFor(calls[0].sql, calls[0].params, "homes_taken")).toBeNull();
  });

  it("clears the label when the caller sends an explicit null", async () => {
    const { calls, pool } = recordingPool();
    await setAvailability(pool, { structureKey: "ridgeA", label: null, updatedBy: "user-1" });
    expect(updated(calls[0].sql)).toEqual(["label", "updated_by"]);
    expect(paramFor(calls[0].sql, calls[0].params, "label")).toBeNull();
  });

  it("changes nothing at all on an existing row for an empty patch", async () => {
    /*
     * What "add a hamlet" sends. On a key that already exists this touches no
     * count, no name and no authority, which is what makes pressing Add on an
     * existing hamlet harmless. It used to send three explicit nulls and wipe
     * the row.
     */
    const { calls, pool } = recordingPool();
    await setAvailability(pool, { structureKey: "ridgeA", updatedBy: "user-1" });
    expect(updated(calls[0].sql)).toEqual(["updated_by"]);
  });

  it("starts a brand new row unset and counted by the founder", async () => {
    // On INSERT there is nothing to leave alone, so an absent count is NULL,
    // which is exactly the unset state a newly named hamlet should have.
    const { calls, pool } = recordingPool();
    await setAvailability(pool, { structureKey: "ridgeA", updatedBy: "user-1" });
    expect(paramFor(calls[0].sql, calls[0].params, "homes_total")).toBeNull();
    expect(paramFor(calls[0].sql, calls[0].params, "homes_taken")).toBeNull();
    expect(paramFor(calls[0].sql, calls[0].params, "label")).toBeNull();
    expect(paramFor(calls[0].sql, calls[0].params, "taken_source")).toBe("founder");
  });

  it("writes zero as zero, because zero homes is a real answer", async () => {
    const { calls, pool } = recordingPool();
    await setAvailability(pool, { structureKey: "ridgeA", total: 0, taken: 0, updatedBy: "user-1" });
    expect(paramFor(calls[0].sql, calls[0].params, "homes_total")).toBe(0);
    expect(paramFor(calls[0].sql, calls[0].params, "homes_taken")).toBe(0);
    expect(updated(calls[0].sql)).toEqual(["homes_total", "homes_taken", "updated_by"]);
  });
});

/**
 * The route's own reading of a founder surface's body.
 *
 * This logic used to sit inline in a 13,000 line route file, where nothing
 * could reach it, and that is exactly where three different meanings for an
 * absent field survived: a count refused the request, an authority was left
 * alone, and a label was destroyed. Every rule the contract states is
 * checkable from here now.
 */
describe("reading a patch off the wire", () => {
  const patchOf = (body: unknown) => {
    const r = readAvailabilityPatch(body);
    expect(r.ok).toBe(true);
    if (!r.ok) throw new Error(r.error);
    return r.patch;
  };

  it("carries only the keys the caller sent", () => {
    expect(Object.keys(patchOf({ label: "Ridge Hamlet North" }))).toEqual(["label"]);
    expect(Object.keys(patchOf({ total: 8 }))).toEqual(["total"]);
    expect(Object.keys(patchOf({ taken: 0 }))).toEqual(["taken"]);
    expect(Object.keys(patchOf({ takenSource: "reservations" }))).toEqual(["takenSource"]);
  });

  it("reads an EMPTY body as a patch that changes nothing", () => {
    // What "add a hamlet" sends. On an existing key this must touch no
    // count, no name and no authority.
    expect(patchOf({})).toEqual({});
    expect(patchOf(undefined)).toEqual({});
  });

  it("NEVER turns an absent label into a cleared one", () => {
    // The defect, stated at the layer that had it. A numeric edit that says
    // nothing about the name used to wipe the name.
    const patch = patchOf({ total: 8 });
    expect("label" in patch).toBe(false);
  });

  it("keeps an explicit null as a clear, for all three nullable fields", () => {
    expect(patchOf({ total: null })).toEqual({ total: null });
    expect(patchOf({ taken: null })).toEqual({ taken: null });
    expect(patchOf({ label: null })).toEqual({ label: null });
  });

  it("treats an emptied name box the same as a null", () => {
    expect(patchOf({ label: "   " })).toEqual({ label: null });
  });

  it("keeps zero, which is a real answer and not an empty box", () => {
    expect(patchOf({ total: 0, taken: 0 })).toEqual({ total: 0, taken: 0 });
  });

  it("refuses a count that is not a whole number in range", () => {
    // Refused and not coerced: coercing lands on null, and null is the one
    // value that destroys a founder's count.
    for (const bad of [{ total: "8" }, { total: 2.5 }, { total: -1 }, { total: 10001 }, { taken: NaN }]) {
      const r = readAvailabilityPatch(bad);
      expect(r.ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("refuses an authority it does not recognise", () => {
    expect(readAvailabilityPatch({ takenSource: "whoever" }).ok).toBe(false);
    // And null is not a clear here, because the column is NOT NULL.
    expect(readAvailabilityPatch({ takenSource: null }).ok).toBe(false);
  });

  it("trims a long label to what the column holds", () => {
    const patch = patchOf({ label: "x".repeat(400) });
    expect(String(patch.label).length).toBe(190);
  });
});

describe("taken against total, across a patch and the row it lands on", () => {
  const before = (total: number | null, storedTaken: number | null) => ({ total, storedTaken });

  it("refuses a lone taken that is above the row's stored total", () => {
    // The whole reason the row is read before the write. Checking only what
    // the body carries lets 9 land on a hamlet with five homes.
    expect(exceedsTotal({ taken: 9 }, before(5, 1))).toBe(true);
  });

  it("refuses a lone total that falls below the row's stored taken", () => {
    expect(exceedsTotal({ total: 2 }, before(10, 4))).toBe(true);
  });

  it("allows a pair that agrees", () => {
    expect(exceedsTotal({ total: 10, taken: 4 }, before(5, 5))).toBe(false);
  });

  it("allows a rename on a row whose live count has passed its total", () => {
    /*
     * The lockout this route has already been fixed for once. Five homes,
     * six live reservations, three typed. `before` carries the TYPED number,
     * so the rename passes; carrying the effective 6 would refuse every edit
     * to the row, the rename that is the only way to fix it included.
     */
    expect(exceedsTotal({ label: "Ridge Hamlet North" }, before(5, 3))).toBe(false);
  });

  it("allows anything against a row that does not exist yet", () => {
    expect(exceedsTotal({}, null)).toBe(false);
    expect(exceedsTotal({ taken: 4 }, null)).toBe(false);
  });

  it("says nothing about a pair where either side is unset", () => {
    expect(exceedsTotal({ taken: 4 }, before(null, null))).toBe(false);
    expect(exceedsTotal({ total: null }, before(10, 4))).toBe(false);
  });
});

/**
 * The letter the person who asked for a home receives when their request
 * moves. Pure, so the two judgements in it (which statuses speak, and in
 * whose vocabulary) are provable without a mail provider.
 */
describe("reservationStatusNotice", () => {
  const rowan = { name: "Rowan", homeType: "casita", hamlet: "Ridge Hamlet North" };

  it("says nothing about a founder's own filing", () => {
    expect(reservationStatusNotice("new", rowan)).toBeNull();
  });

  it("says nothing when a founder records a conversation they already had", () => {
    expect(reservationStatusNotice("contacted", rowan)).toBeNull();
  });

  it("tells somebody a home is being held, and where", () => {
    const notice = reservationStatusNotice("reserved", rowan)!;
    expect(notice).toBeTruthy();
    expect(notice.body.join(" ")).toContain("casita in Ridge Hamlet North");
    expect(notice.body.join(" ")).toContain("Rowan");
  });

  it("tells somebody their request is closed", () => {
    const notice = reservationStatusNotice("withdrawn", rowan)!;
    expect(notice.subject.toLowerCase()).toContain("closed");
    expect(notice.body.join(" ")).toContain("nothing is owed");
  });

  it("never says the founder's filing word at the person", () => {
    for (const status of ["reserved", "withdrawn"]) {
      const notice = reservationStatusNotice(status, rowan)!;
      const whole = `${notice.subject} ${notice.heading} ${notice.body.join(" ")}`.toLowerCase();
      expect(whole, `${status} leaked into the letter`).not.toContain(status);
    }
  });

  it("drops the hamlet clause when no hamlet was chosen", () => {
    const notice = reservationStatusNotice("reserved", { name: "Ivy", homeType: "villa", hamlet: null })!;
    expect(notice.body.join(" ")).toContain("a villa against your name");
  });

  it("refuses to speak for a status it does not know", () => {
    expect(reservationStatusNotice("maybe", rowan)).toBeNull();
  });
});

/* ── THE HOMES A VILLAGE OFFERS (0131) ──────────────────────────────────────
 *
 * The four tiers were a module constant in client/src/pages/Housing.tsx with
 * a second copy of their sizes in client/src/pages/ReserveHome.tsx, so every
 * fork published one American village's dollars and square footage under its
 * own name. These tests hold the two things that keeps from coming back: the
 * predicate that decides whether a village has published a home at all, and
 * the promise that whatever a founder typed is what publishes.
 *
 * BOTH DIRECTIONS, ALWAYS. A suite that only ever sees a filled-in village
 * proves nothing about the state this whole change exists to produce, which
 * is the empty one.
 */

/** A pool stub for the home-type queries. Unknown SQL still throws. */
function homePool(homeTypes: any[]) {
  return {
    async query(sql: string) {
      if (sql.includes("FROM housing_home_types")) return [homeTypes, []];
      throw new Error(`unexpected query: ${sql}`);
    },
  } as any;
}

const homeRow = (over: Record<string, unknown> = {}) => ({
  home_type: "casita",
  name: "Casita",
  size_text: "400 to 800 sq ft",
  price_text: "$150,000 to $250,000",
  description: null,
  features: null,
  updated_by: null,
  updated_at: "2026-09-02 00:00:00",
  ...over,
});

describe("a village that has published no homes", () => {
  it("publishes nothing at all when the table is empty", async () => {
    // THE STATE THIS CHANGE EXISTS TO PRODUCE. Every fork starts here, and
    // the live village lands here the moment 0131 applies. /housing draws no
    // tier section, /reserve says the homes are not listed yet.
    expect(await publicHomeTypes(homePool([]))).toEqual([]);
  });

  it("still gives the founder all four rows to type into", async () => {
    const rows = await allHomeTypes(homePool([]));
    expect(rows.map((r) => r.homeType)).toEqual(["tiny-home", "casita", "family-home", "villa"]);
    expect(rows.every((r) => r.isPublished)).toBe(false);
    expect(rows.every((r) => r.name === null && r.size === null && r.price === null)).toBe(true);
  });

  it("does not publish a home that has only a name", async () => {
    // A card with a heading and nothing under it is the empty scaffolding
    // this change removes. It is not a home a village has described.
    const pool = homePool([homeRow({ name: "Casita", size_text: null, price_text: null })]);
    expect(await publicHomeTypes(pool)).toEqual([]);
    expect((await allHomeTypes(pool)).find((r) => r.homeType === "casita")?.isPublished).toBe(false);
  });

  it("does not publish a size or a price with no name to attach it to", async () => {
    const sized = homePool([homeRow({ name: null, price_text: null })]);
    expect(await publicHomeTypes(sized)).toEqual([]);
    const priced = homePool([homeRow({ name: null, size_text: null })]);
    expect(await publicHomeTypes(priced)).toEqual([]);
  });

  it("reads an empty column as unset, never as a home called nothing", async () => {
    // Blank and absent are the same state. A column holding "" must never
    // publish a card with an empty heading.
    const pool = homePool([homeRow({ name: "   ", size_text: "", price_text: "" })]);
    expect(await publicHomeTypes(pool)).toEqual([]);
    expect((await allHomeTypes(pool))[1]!.name).toBeNull();
  });
});

describe("a village that HAS published its homes", () => {
  it("publishes a home with a name and a size", async () => {
    const pool = homePool([homeRow({ price_text: null })]);
    const [home] = await publicHomeTypes(pool);
    expect(home!.name).toBe("Casita");
    expect(home!.size).toBe("400 to 800 sq ft");
    // Not written, so nothing is drawn. Never a stand-in, never a zero.
    expect(home!.price).toBe("");
  });

  it("publishes a home with a name and a price and no size", async () => {
    const pool = homePool([homeRow({ size_text: null, price_text: "ask us" })]);
    const [home] = await publicHomeTypes(pool);
    expect(home!.price).toBe("ask us");
    expect(home!.size).toBe("");
  });

  it("prints a non-imperial size and a non-USD price exactly as typed", async () => {
    /*
     * THE POINT OF THE WHOLE CHANGE. The platform has no opinion about a
     * village's units or its currency. Nothing here converts, rounds,
     * reformats, or appends a symbol, and a sibling lane paid for the mirror
     * of this bug: a page asserting "Total Acres" over a figure a founder
     * meant as hectares.
     */
    const pool = homePool([
      homeRow({
        home_type: "tiny-home",
        name: "Cabina",
        size_text: "0,5 hectáreas",
        price_text: "₡45.000.000",
      }),
    ]);
    const [home] = await publicHomeTypes(pool);
    expect(home!.size).toBe("0,5 hectáreas");
    expect(home!.price).toBe("₡45.000.000");
    expect(home!.size).not.toContain("sq ft");
    expect(home!.price).not.toContain("$");
  });

  it("lists homes in platform order, not in the order the database returned them", async () => {
    // So the two pages agree, and so renaming a home does not reshuffle the
    // page under a visitor who is reading it.
    const pool = homePool([
      homeRow({ home_type: "villa", name: "Villa" }),
      homeRow({ home_type: "tiny-home", name: "Cabina" }),
      homeRow({ home_type: "casita", name: "Casita" }),
    ]);
    expect((await publicHomeTypes(pool)).map((h) => h.homeType)).toEqual([
      "tiny-home",
      "casita",
      "villa",
    ]);
  });

  it("carries no identity fields, because this rides an uncredentialed route", async () => {
    const [home] = await publicHomeTypes(homePool([homeRow()]));
    expect(Object.keys(home!).sort()).toEqual([
      "description",
      "features",
      "homeType",
      "name",
      "price",
      "size",
    ]);
  });

  it("carries updatedBy to the founder view, which is why that one is gated", async () => {
    const rows = await allHomeTypes(homePool([homeRow({ updated_by: "user-1" })]));
    expect(rows.find((r) => r.homeType === "casita")?.updatedBy).toBe("user-1");
  });
});

describe("features are a list because a founder typed one per line", () => {
  it("splits on newlines and nothing else", async () => {
    // A comma inside a feature is part of the feature. Splitting on commas
    // would cut "Kitchen, bathroom and a covered porch" into three.
    const pool = homePool([
      homeRow({ features: "Covered patio\nKitchen, bathroom and a covered porch\n\n  Solar ready  " }),
    ]);
    const [home] = await publicHomeTypes(pool);
    expect(home!.features).toEqual([
      "Covered patio",
      "Kitchen, bathroom and a covered porch",
      "Solar ready",
    ]);
  });

  it("is an empty list when the village wrote none, so no bullets are drawn", async () => {
    const [home] = await publicHomeTypes(homePool([homeRow({ features: null })]));
    expect(home!.features).toEqual([]);
    expect(homeFeatureLines(null)).toEqual([]);
    expect(homeFeatureLines("   ")).toEqual([]);
  });
});

describe("the home-type patch: absent leaves, null clears, nothing is converted", () => {
  it("reads only the fields it was sent", () => {
    const read = readHomeTypePatch({ price: "ask us" });
    expect(read.ok && read.patch).toEqual({ price: "ask us" });
  });

  it("clears on an explicit null and on an emptied box alike", () => {
    // The Admin boxes send "" when a founder empties one, and "the founder
    // cleared this" is the same state as "the founder never wrote this".
    const cleared = readHomeTypePatch({ name: null });
    expect(cleared.ok && cleared.patch).toEqual({ name: null });
    const emptied = readHomeTypePatch({ name: "   " });
    expect(emptied.ok && emptied.patch).toEqual({ name: null });
  });

  it("keeps a currency symbol, a unit and a range exactly as typed", () => {
    const read = readHomeTypePatch({
      size: "0,5 hectáreas",
      price: "₡45.000.000 a ₡60.000.000",
    });
    expect(read.ok && read.patch).toEqual({
      size: "0,5 hectáreas",
      price: "₡45.000.000 a ₡60.000.000",
    });
  });

  it("keeps the newlines inside features, because they ARE the list", () => {
    const read = readHomeTypePatch({ features: "  One\nTwo, with a comma\n  " });
    expect(read.ok && read.patch).toEqual({ features: "One\nTwo, with a comma" });
  });

  it("refuses a value that is not text rather than coercing it", () => {
    // A coercion here would turn a caller's mistake into a stored string that
    // reads like a founder's own words.
    expect(readHomeTypePatch({ price: 150000 }).ok).toBe(false);
    expect(readHomeTypePatch({ features: ["a", "b"] }).ok).toBe(false);
  });

  it("treats an empty body as a legal no-change patch", () => {
    const read = readHomeTypePatch({});
    expect(read.ok && read.patch).toEqual({});
  });
});

describe("the home-type write path keeps what it was not told to change", () => {
  it("writes only the column it was given", async () => {
    const { calls, pool } = recordingPool();
    await setHomeType(pool, { homeType: "casita", price: "ask us", updatedBy: "user-1" });
    const update = calls[0]!.sql.slice(calls[0]!.sql.indexOf("ON DUPLICATE KEY UPDATE"));
    expect(update).toContain("price_text = VALUES(price_text)");
    expect(update).not.toContain("name = VALUES(name)");
    expect(update).not.toContain("size_text = VALUES(size_text)");
    expect(update).not.toContain("description = VALUES(description)");
    expect(update).not.toContain("features = VALUES(features)");
    // Every call is a write, so this one is always stamped.
    expect(update).toContain("updated_by = VALUES(updated_by)");
  });

  it("writes a null when the founder cleared a box, which unpublishes the home", async () => {
    const { calls, pool } = recordingPool();
    await setHomeType(pool, { homeType: "villa", name: null, updatedBy: "user-1" });
    const update = calls[0]!.sql.slice(calls[0]!.sql.indexOf("ON DUPLICATE KEY UPDATE"));
    expect(update).toContain("name = VALUES(name)");
    expect(paramFor(calls[0]!.sql, calls[0]!.params, "name")).toBeNull();
  });

  it("creates an unfilled row on an empty patch and changes nothing else", async () => {
    const { calls, pool } = recordingPool();
    await setHomeType(pool, { homeType: "tiny-home", updatedBy: "user-1" });
    const update = calls[0]!.sql.slice(calls[0]!.sql.indexOf("ON DUPLICATE KEY UPDATE"));
    expect(update).toBe("ON DUPLICATE KEY UPDATE updated_by = VALUES(updated_by)");
    expect(paramFor(calls[0]!.sql, calls[0]!.params, "home_type")).toBe("tiny-home");
  });

  it("stores the founder's text with no symbol, unit or rounding added", async () => {
    const { calls, pool } = recordingPool();
    await setHomeType(pool, {
      homeType: "casita",
      size: "45 m2",
      price: "₡45.000.000",
      updatedBy: "user-1",
    });
    expect(paramFor(calls[0]!.sql, calls[0]!.params, "size_text")).toBe("45 m2");
    expect(paramFor(calls[0]!.sql, calls[0]!.params, "price_text")).toBe("₡45.000.000");
  });
});

describe("a home a founder can describe is a home a visitor can ask for", () => {
  it("keys home types on the same list the reservation route validates against", async () => {
    // Two lists would let a founder publish a home whose Reserve button the
    // POST refuses, and the person would meet a 400 on the last click.
    const rows = await allHomeTypes(homePool([]));
    for (const r of rows) expect(isHomeType(r.homeType)).toBe(true);
    expect(rows).toHaveLength(HOME_TYPES.length);
  });
});
