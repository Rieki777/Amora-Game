/**
 * The delegation routes, exercised as handlers against the real library and a
 * real MySQL (S5 harness).
 *
 * WHY NOT THE E2E HARNESS. What these four routes contain worth testing is the
 * shape of the answers and one refusal: that the reply names the member who
 * ACTUALLY decides rather than the one the caller named, that revoking says
 * whether there was anything to revoke, that concentration is served to any
 * signed-in member, and that a member with no voice is told so. None of that
 * needs a booted server, and the derivation underneath it is proven against
 * real rows in server/lib/delegation.test.ts.
 *
 * `register` is called against a fake Express that records handlers by method
 * and path, so what runs is the real registration and the real handler bodies,
 * over the real pool. The one thing this file cannot see is the module gate:
 * requireModule("governance") is mounted on the /api/governance prefix in
 * server/index.ts, above these handlers, so every path here is a 404 until a
 * founder turns the module on.
 *
 * No TEST_DATABASE_URL: skips loudly, never passes hollowly (house rule).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import mysql from "mysql2/promise";
import { provisionTestDb, testDbConfigured, type TestDb } from "../db/testDb";
import { castVote, openBallot } from "../lib/ballots";
import { setDelegation } from "../lib/delegation";
import { register } from "./delegation";

const configured = testDbConfigured();

let db: TestDb;
let pool: mysql.Pool;

type Handler = (req: any, res: any) => Promise<unknown> | unknown;

/** A fake Express that keeps the handlers `register` hands it. */
function collect(): { app: any; handlers: Map<string, Handler> } {
  const handlers = new Map<string, Handler>();
  const record = (method: string) => (path: string, handler: Handler) => {
    handlers.set(`${method} ${path}`, handler);
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

const ROSTER = [
  { id: "u-ann", name: "Ann Rivers" },
  { id: "u-ben", name: "Ben Oak" },
  { id: "u-cai", name: "Cai Stone" },
];

/**
 * The gate context, with `ballot.vote` present or absent.
 *
 * The absence is expressed through the STAGE step, because that is where a
 * member who has not arrived yet is actually refused. `ballot.vote` unlocks at
 * the member stage, so a context standing below whatever stage the gate asks
 * for is the honest shape of "this account cannot vote today". A role grant
 * would answer the other way and prove nothing about the refusal.
 */
const ctxWith = (mayVote: boolean) => ({
  stageIndex: mayVote ? 5 : 0,
  stageIndexOf: () => (mayVote ? 0 : 5),
  roleCapabilities: [] as string[],
});

function depsFor(user: { id: string } | null, mayVote = true) {
  return {
    authedUser: async () => user,
    getPool: () => pool,
    capabilityCtx: async () => ctxWith(mayVote) as any,
    members: {
      all: async () => ROSTER as any,
      byId: async (id: string) => (ROSTER.find((m) => m.id === id) as any) ?? null,
    } as any,
    firstName: (name: string) => String(name || "Someone").split(" ")[0]!,
  };
}

const handlersFor = (user: { id: string } | null, mayVote = true) => {
  const { app, handlers } = collect();
  register(app, depsFor(user, mayVote) as any);
  return handlers;
};

const call = async (handler: Handler, req: any = {}) => {
  const { res, out } = makeRes();
  await handler({ body: {}, params: {}, query: {}, ...req }, res);
  return out;
};

const clearDelegations = async () => {
  await pool.query("DELETE FROM delegations WHERE delegator_id LIKE 'u-%'"); // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
};

describe.skipIf(!configured)("delegation routes (MySQL)", () => {
  beforeAll(async () => {
    db = await provisionTestDb();
    pool = mysql.createPool({ uri: db.url, timezone: "Z", connectionLimit: 8 }); // module-review-ok: the S5 scratch-schema harness pool, the crews.test.ts shape
  });

  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });

  it("registers four routes on the paths server/index.ts mounts", () => {
    const handlers = handlersFor({ id: "u-ann" });
    expect([...handlers.keys()].sort()).toEqual([
      "DELETE /api/governance/delegation",
      "GET /api/governance/concentration",
      "GET /api/governance/delegation",
      "PUT /api/governance/delegation",
    ]);
  });

  it("refuses a stranger on every route", async () => {
    const handlers = handlersFor(null);
    for (const key of handlers.keys()) {
      const out = await call(handlers.get(key)!, { body: { delegateId: "u-ben" } });
      expect(out.status).toBe(401);
      expect(out.body).toEqual({ error: "auth_required" });
    }
  });

  it("tells a member with no voice that there is nothing here to hand on", async () => {
    await clearDelegations();
    const handlers = handlersFor({ id: "u-ann" }, false);
    const out = await call(handlers.get("PUT /api/governance/delegation")!, { body: { delegateId: "u-ben" } });
    expect(out.status).toBe(403);
    expect(String(out.body.error)).toContain("no voice here to hand on");
  });

  it("refuses a delegation to nobody, and to a member this village does not have", async () => {
    await clearDelegations();
    const handlers = handlersFor({ id: "u-ann" });
    const blank = await call(handlers.get("PUT /api/governance/delegation")!, { body: {} });
    expect(blank.status).toBe(400);
    const stranger = await call(handlers.get("PUT /api/governance/delegation")!, { body: { delegateId: "u-nobody" } });
    expect(stranger.status).toBe(404);
  });

  it("refuses the cycle with the sentence the member reads", async () => {
    await clearDelegations();
    await setDelegation(pool, "u-ben", "u-ann");
    const handlers = handlersFor({ id: "u-ann" });
    const out = await call(handlers.get("PUT /api/governance/delegation")!, { body: { delegateId: "u-ben" } });
    expect(out.status).toBe(400);
    expect(String(out.body.error)).toContain("in a circle");
  });

  it("names who actually decides, never only who was named", async () => {
    await clearDelegations();
    await setDelegation(pool, "u-ben", "u-cai");
    const handlers = handlersFor({ id: "u-ann" });
    const put = await call(handlers.get("PUT /api/governance/delegation")!, { body: { delegateId: "u-ben" } });
    expect(put.status).toBe(200);
    expect(put.body).toMatchObject({
      delegateTo: "u-ben",
      delegateToName: "Ben",
      decidedBy: "u-cai",
      decidedByName: "Cai",
      hops: 2,
    });

    const mine = await call(handlers.get("GET /api/governance/delegation")!);
    expect(mine.body).toMatchObject({ delegateTo: "u-ben", decidedBy: "u-cai", hops: 2 });
    expect(mine.body.chain.map((c: any) => c.userId)).toEqual(["u-ann", "u-ben", "u-cai"]);
  });

  it("reports a member who decides for themselves as following nobody", async () => {
    await clearDelegations();
    const mine = await call(handlersFor({ id: "u-ann" }).get("GET /api/governance/delegation")!);
    expect(mine.body).toMatchObject({ delegateTo: null, decidedBy: null, hops: 0, votes: [] });
  });

  it("carries a delegated vote onto an open ballot and shows who was followed", async () => {
    await clearDelegations();
    const opened = await openBallot(pool, {
      subjectType: "mechanics",
      subjectRef: "delegation-route-vote",
      title: "The route's own ballot",
      docMarkdown: "# As checked",
      method: "custom",
      weightMode: "equal",
      unityPct: 80,
      quorumPct: 20,
      durationDays: 7,
      openedBy: "u-cai",
      electorate: ROSTER.map((m) => ({ userId: m.id, weight: 1 })),
    });
    expect(opened.ok).toBe(true);
    const handlers = handlersFor({ id: "u-ann" });
    await call(handlers.get("PUT /api/governance/delegation")!, { body: { delegateId: "u-ben" } });
    await castVote(pool, opened.ok ? opened.ballot.id : "", "u-ben", "yes");

    const mine = await call(handlers.get("GET /api/governance/delegation")!);
    const here = mine.body.votes.find((v: any) => v.ballotId === (opened.ok ? opened.ballot.id : ""));
    expect(here).toMatchObject({ choice: "yes", followedUserId: "u-ben", followedName: "Ben" });

    // Taking it back says so, and says what it moved.
    const gone = await call(handlers.get("DELETE /api/governance/delegation")!);
    expect(gone.body).toMatchObject({ revoked: true, hadNone: false });
    expect(gone.body.openBallotsTouched).toBeGreaterThanOrEqual(1);
    const after = await call(handlers.get("GET /api/governance/delegation")!);
    expect(after.body.votes.find((v: any) => v.ballotId === (opened.ok ? opened.ballot.id : ""))).toBeUndefined();
  });

  it("says there was nothing to revoke without calling it a failure", async () => {
    await clearDelegations();
    const out = await call(handlersFor({ id: "u-cai" }).get("DELETE /api/governance/delegation")!);
    expect(out.body).toMatchObject({ success: true, revoked: false, hadNone: true });
  });

  it("serves concentration to any signed-in member, heaviest first, summing to the roster", async () => {
    await clearDelegations();
    await setDelegation(pool, "u-ann", "u-ben");
    await setDelegation(pool, "u-ben", "u-cai");
    const out = await call(handlersFor({ id: "u-ann" }).get("GET /api/governance/concentration")!);
    expect(out.status).toBe(200);
    expect(out.body.memberCount).toBe(3);
    expect(out.body.rows[0]).toMatchObject({ userId: "u-cai", name: "Cai", effectiveVotes: 3 });
    expect(out.body.rows.reduce((sum: number, r: any) => sum + r.effectiveVotes, 0)).toBe(3);
    expect(out.body.rows.find((r: any) => r.userId === "u-ann")).toMatchObject({
      effectiveVotes: 0,
      decidedBy: "u-cai",
      decidedByName: "Cai",
      hops: 2,
    });
  });
});
