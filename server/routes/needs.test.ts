/**
 * The needs routes: the refusals without a database, the round trip with one.
 *
 * TWO HALVES, ON PURPOSE. What the handlers decide (who may write, what a bad
 * body earns, that a PUT retires nothing) is decision logic and runs against a
 * stub pool, fast and everywhere. What the store does under a real schema is
 * proved in server/lib/needs.test.ts; the round trip below is the seam between
 * the two, so it takes a scratch schema and exercises the actual SQL through
 * the actual handlers.
 *
 * `register` is called against a fake Express that records handlers by method
 * and path, the shape server/routes/land.test.ts uses, so what runs is the
 * real registration and the real handler bodies.
 *
 * THE LAST TWO CASES ASSERT WITH THE GATES THEMSELVES rather than restating
 * their numbers. A test that hardcoded "under 2000 lines" would keep passing
 * on the day somebody raised the cap.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import mysql from "mysql2/promise";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { provisionTestDb, testDbConfigured, type TestDb } from "../db/testDb";
import { register } from "./needs";

type Handler = (req: any, res: any) => Promise<unknown> | unknown;

/** A fake Express that keeps the handlers `register` hands it. */
function collect(): { app: any; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const record = (method: string) => (p: string, handler: Handler) => {
    handlers.set(`${method} ${p}`, handler);
  };
  return {
    app: { get: record("GET"), post: record("POST"), put: record("PUT"), delete: record("DELETE") },
    handlers,
  };
}

/** Captures what a handler answered. */
function makeRes() {
  const out: { status: number; body: any } = { status: 200, body: undefined };
  const res: any = {
    status(code: number) {
      out.status = code;
      return res;
    },
    json(body: unknown) {
      out.body = body;
      return res;
    },
  };
  return { res, out };
}

const call = async (handlers: Map<string, Handler>, key: string, req: any = {}) => {
  const handler = handlers.get(key);
  if (!handler) throw new Error(`no handler registered for ${key}`);
  const { res, out } = makeRes();
  await handler({ params: {}, body: {}, ...req }, res);
  return out;
};

/** A pool that answers nothing, for the cases that refuse before touching it. */
function deadPool() {
  const queries: string[] = [];
  return {
    queries,
    pool: {
      async query(sql: string) {
        queries.push(sql);
        return [[], []];
      },
    } as any,
  };
}

const ADMIN_WRITES = [
  "PUT /api/admin/needs/scope",
  "POST /api/admin/needs/retire",
  "POST /api/admin/needs/links",
  "DELETE /api/admin/needs/links/:id",
];

const MEMBER_READS = ["GET /api/needs/scope", "GET /api/needs/coverage"];

describe("who may reach the needs routes", () => {
  it("registers exactly the six doors, and no more", () => {
    const { app, handlers } = collect();
    const { pool } = deadPool();
    register(app, { isAdmin: async () => true, authedUser: async () => ({ id: "u" }), getPool: () => pool } as any);
    expect([...handlers.keys()].sort()).toEqual([...ADMIN_WRITES, ...MEMBER_READS].sort());
  });

  it.each(ADMIN_WRITES)("refuses a member on %s, and never touches the database", async (key) => {
    const { app, handlers } = collect();
    const { pool, queries } = deadPool();
    register(app, {
      // A signed-in member who is not admin or founder. `isAdmin` is the one
      // gate these four writes ask, so this is the whole refusal.
      isAdmin: async () => false,
      authedUser: async () => ({ id: "member-1", role: "member" }),
      getPool: () => pool,
    } as any);
    const out = await call(handlers, key, { params: { id: "nlink-1" }, body: { needs: [] } });
    expect(out.status).toBe(401);
    expect(out.body).toEqual({ error: "auth_required" });
    expect(queries, "a refused write must not reach the pool").toEqual([]);
  });

  it.each(MEMBER_READS)("refuses a stranger on %s", async (key) => {
    const { app, handlers } = collect();
    const { pool, queries } = deadPool();
    register(app, { isAdmin: async () => false, authedUser: async () => null, getPool: () => pool } as any);
    const out = await call(handlers, key);
    expect(out.status).toBe(401);
    expect(queries).toEqual([]);
  });
});

describe("what a bad body earns", () => {
  const mount = () => {
    const { app, handlers } = collect();
    const { pool, queries } = deadPool();
    register(app, { isAdmin: async () => true, authedUser: async () => ({ id: "founder" }), getPool: () => pool } as any);
    return { handlers, queries };
  };

  it("asks for a needs array", async () => {
    const { handlers } = mount();
    const out = await call(handlers, "PUT /api/admin/needs/scope", { body: { needs: "play" } });
    expect(out.status).toBe(400);
    expect(out.body.error).toContain("needs");
  });

  it("refuses a rung that is not one of the five, by name", async () => {
    const { handlers } = mount();
    const out = await call(handlers, "PUT /api/admin/needs/scope", {
      body: { needs: [{ needKey: "play", depthTarget: "flourishing" }] },
    });
    expect(out.status).toBe(400);
    expect(out.body.error).toContain("Thriving");
  });

  it("refuses the whole save when one row is bad, so a half scope never lands", async () => {
    const { handlers, queries } = mount();
    const out = await call(handlers, "PUT /api/admin/needs/scope", {
      body: { needs: [{ needKey: "play" }, { needKey: "custom:love", label: "Love" }] },
    });
    expect(out.status).toBe(400);
    expect(out.body.error).toContain("one of the ten needs");
    // Not one INSERT ran: validation finishes before any write starts.
    expect(queries.filter((q) => /INSERT/i.test(q))).toEqual([]);
  });

  it("refuses a subject kind it does not know", async () => {
    const { handlers } = mount();
    const out = await call(handlers, "POST /api/admin/needs/links", {
      body: { needKey: "play", subjectType: "vibe", subjectRef: "x" },
    });
    expect(out.status).toBe(400);
    expect(out.body.error).toContain("quest");
  });

  it("asks the retire route to name a need", async () => {
    const { handlers } = mount();
    const out = await call(handlers, "POST /api/admin/needs/retire", { body: {} });
    expect(out.status).toBe(400);
  });
});

/* ========================================================================== *
 * The round trip, against a scratch schema.
 * ========================================================================== */

const configured = testDbConfigured();

describe.skipIf(!configured)("the scope round trips through the routes", () => {
  let db: TestDb;
  let pool: mysql.Pool;
  let handlers: Map<string, Handler>;

  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 4 });
    const { app, handlers: h } = collect();
    register(app, {
      isAdmin: async () => true,
      authedUser: async () => ({ id: "founder-1" }),
      getPool: () => pool,
    } as any);
    handlers = h;
  }, 180_000);

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  beforeEach(async () => {
    await pool.query("DELETE FROM `need_links`");
    await pool.query("DELETE FROM `village_needs`");
    await pool.query("DELETE FROM `org_role_assignments`");
    await pool.query("DELETE FROM `org_roles`");
  });

  it("an unanswered village reads as unanswered, and carries the ten to choose from", async () => {
    const out = await call(handlers, "GET /api/needs/scope");
    expect(out.status).toBe(200);
    expect(out.body.scope).toEqual([]);
    expect(out.body.summary.answered).toBe(false);
    expect(out.body.needs).toHaveLength(10);
    expect(out.body.depths).toEqual(["deprived", "unmet", "alive", "satisfied", "thriving"]);
  });

  it("saves a scope, reads it back, and reports what nothing meets", async () => {
    const saved = await call(handlers, "PUT /api/admin/needs/scope", {
      body: {
        needs: [
          { needKey: "vitality", depthTarget: "thriving" },
          { needKey: "play" },
          { needKey: "custom:childcare", label: "Childcare", breadthTargetPct: 30 },
        ],
      },
    });
    expect(saved.status).toBe(200);
    expect(saved.body.saved).toHaveLength(3);

    const read = await call(handlers, "GET /api/needs/scope");
    expect(read.body.scope.map((r: any) => r.needKey)).toEqual(["vitality", "play", "custom:childcare"]);
    expect(read.body.summary.adopted).toBe(3);
    expect(read.body.summary.customAdopted).toBe(1);

    await call(handlers, "POST /api/admin/needs/links", {
      body: { needKey: "vitality", subjectType: "quest", subjectRef: "q-well" },
    });
    const coverage = await call(handlers, "GET /api/needs/coverage");
    expect(coverage.body.answered).toBe(true);
    expect(coverage.body.uncovered).toEqual(["play", "custom:childcare"]);
  });

  it("a PUT retires nothing, so a half-loaded screen is not an act of policy", async () => {
    await call(handlers, "PUT /api/admin/needs/scope", {
      body: { needs: [{ needKey: "vitality" }, { needKey: "play" }] },
    });
    // A second save carrying only one of them leaves the other in scope.
    await call(handlers, "PUT /api/admin/needs/scope", { body: { needs: [{ needKey: "vitality" }] } });
    const read = await call(handlers, "GET /api/needs/scope");
    expect(read.body.summary.adopted).toBe(2);
  });

  it("retiring through the route keeps the links, and says so the second time", async () => {
    await call(handlers, "PUT /api/admin/needs/scope", { body: { needs: [{ needKey: "play" }] } });
    const link = await call(handlers, "POST /api/admin/needs/links", {
      body: { needKey: "play", subjectType: "quest", subjectRef: "q-solstice" },
    });
    expect(link.status).toBe(200);

    const first = await call(handlers, "POST /api/admin/needs/retire", { body: { needKey: "play" } });
    expect(first.body.changed).toBe(true);
    const second = await call(handlers, "POST /api/admin/needs/retire", { body: { needKey: "play" } });
    expect(second.status).toBe(200);
    expect(second.body.changed).toBe(false);

    const [rows] = await pool.query<any[]>("SELECT COUNT(*) AS n FROM `need_links`");
    expect(Number(rows[0].n), "a retired need keeps its links").toBe(1);
  });

  it("names a seat the scope leans on that nobody is in", async () => {
    await call(handlers, "PUT /api/admin/needs/scope", { body: { needs: [{ needKey: "vitality" }] } });
    await pool.query("INSERT INTO `org_roles` (`id`, `name`, `seats`, `active`) VALUES ('r-water','Water Steward',1,1)");
    await call(handlers, "POST /api/admin/needs/links", {
      body: { needKey: "vitality", subjectType: "role", subjectRef: "r-water" },
    });
    const coverage = await call(handlers, "GET /api/needs/coverage");
    const seating = coverage.body.seatings.find((s: any) => s.needKey === "vitality");
    expect(seating.seatsNeeded).toBe(1);
    expect(seating.seatsFilled).toBe(0);
    expect(seating.rolesWithNobodyInThem.map((r: any) => r.name)).toEqual(["Water Steward"]);
  });

  it("takes a link off again", async () => {
    await call(handlers, "PUT /api/admin/needs/scope", { body: { needs: [{ needKey: "play" }] } });
    const made = await call(handlers, "POST /api/admin/needs/links", {
      body: { needKey: "play", subjectType: "quest", subjectRef: "q-solstice" },
    });
    const gone = await call(handlers, "DELETE /api/admin/needs/links/:id", { params: { id: made.body.link.id } });
    expect(gone.status).toBe(200);
    const missing = await call(handlers, "DELETE /api/admin/needs/links/:id", { params: { id: "nope" } });
    expect(missing.status).toBe(404);
  });
});

/* ========================================================================== *
 * The two ratchets this lane promised to leave alone.
 * ========================================================================== */

describe("the module pays its own way in server/index.ts", () => {
  const root = path.resolve(__dirname, "..", "..");
  // `--json` prints the machine line FIRST and then goes on to print its own
  // human summary, so only the first line is JSON. Parsing the whole thing
  // fails on the second line, which is what the guard is for.
  const measured = () =>
    JSON.parse(
      execFileSync(process.execPath, [path.join(root, "scripts", "check-server-index-size.mjs"), "--json"], {
        cwd: root,
        encoding: "utf8",
      }).split("\n")[0],
    );

  it("is under the route-module cap the guard itself declares", () => {
    const m = measured();
    expect(m.routeFiles["server/routes/needs.ts"]).toBeLessThanOrEqual(m.cap);
  });

  it("leaves server/index.ts no longer than the ratchet already allows", () => {
    // The import line and the register call are both exempt, so registering a
    // module costs the monolith nothing. This asserts the measured number, not
    // `wc -l`, which is the number the guard reads.
    const m = measured();
    expect(m.current.lines).toBeLessThanOrEqual(m.baseline.lines);
    expect(m.current.routes).toBeLessThanOrEqual(m.baseline.routes);
  });
});
