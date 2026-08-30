/**
 * THE BUTTON THAT STOPPED MARKING AND STARTED ASKING (R74), driven over HTTP.
 *
 * The founder's ruling: "the 'mark the village launched' button actually
 * generates the first proposal that requires 100% unity and 100% quorum to
 * launch and a minimum of 3 people." R67 says what the vote is FOR: "a game
 * needs 3 people minimum to play (to actually issue tokens) so they can do
 * everything else to set up the game on their own."
 *
 * The harm metric for this file is one sentence, and every clause of it is
 * driven against the built server:
 *
 *   A village sets its whole Game up alone and can issue nothing; three
 *   members vote unanimously; issuance opens; and a vote one person did not
 *   answer never carries.
 *
 * THE CASES RUN IN ORDER. One village walks the whole path: too few people,
 * then a vote that missed, then a vote that was answered no, then the one that
 * carried. Run the whole file, never a `-t` slice.
 *
 * Boots the BUILT `dist/index.js` against a throwaway schema, so run
 * `pnpm build` first or you are testing stale code. Skips loudly without
 * TEST_DATABASE_URL.
 */
import fs from "fs";
import os from "os";
import path from "path";
import mysql from "mysql2/promise";
import { spawn, type ChildProcess } from "child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionTestDb, testDbConfigured, type TestDb, E2E_BOOT_DEADLINE_MS } from "./db/testDb";

const DB_CONFIGURED = testDbConfigured();
if (!DB_CONFIGURED) {
  console.warn("[launchVote.routes] TEST_DATABASE_URL not set - DB-backed tests SKIPPED.");
}

const DIST = path.resolve(process.cwd(), "dist/index.js");

/**
 * A window PROVABLY clear of every other suite that boots a server.
 *
 * RE-GREP BEFORE TRUSTING THIS. `grep -rn "process.pid %" server/` is the
 * survey; the table is only its result on the date named. Surveyed
 * 2026-08-29: the highest band any other suite can reach is 17099
 * (16700 + pid % 400, tokenSinks.routes), so a base at 17200 cannot collide
 * with any of them for ANY process id. 400 wide, ending at 17599, well below
 * the ephemeral range Windows hands out (49152+).
 */
const PORT = 17200 + (process.pid % 400);
const BASE = `http://localhost:${PORT}`;
const ADMIN = "launchvote-admin";
const PASSWORD = "LaunchVoteTest123!";

let child: ChildProcess | undefined;
let testDb: TestDb | undefined;
let dataDir = "";
let pool: mysql.Pool;
const logs: string[] = [];

let founderToken = "";
let founderId = "";
let wrenToken = "";
let wrenId = "";
let idaToken = "";
let idaId = "";

interface Answer { status: number; json: any }

async function call(
  method: string,
  route: string,
  opts: { body?: unknown; token?: string | null } = {},
): Promise<Answer> {
  const token = opts.token === undefined ? founderToken : opts.token;
  const res = await fetch(BASE + route, { // module-review-ok: the test client dialling the built server on localhost, as every e2e suite does
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

async function register(name: string, slug: string): Promise<{ token: string; id: string }> {
  const r = await call("POST", "/api/auth/register", {
    token: "",
    body: { name, email: `${slug}-${PORT}@example.test`, password: PASSWORD, paths: ["resident"] },
  });
  expect(r.status, `${name} must register`).toBe(200);
  return { token: String(r.json?.token ?? ""), id: String(r.json?.user?.id ?? "") };
}

/** Push a ballot's window into the past: the clock, never a status change. */
const expire = async (ballotId: string) => {
  await pool.query("UPDATE ballots SET closes_at = DATE_SUB(NOW(), INTERVAL 1 HOUR) WHERE id = ?", [ballotId]); // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
};

/** Every launch ballot this village has, read raw and never off a payload. */
const launchBallots = async (): Promise<Array<{ id: string; status: string; unity: string; quorum: string; roll: number }>> => {
  const [rows] = await pool.query<any[]>( // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
    "SELECT id, status, unity_pct, quorum_pct, electorate_count FROM ballots WHERE subject_type = 'village_launch' ORDER BY created_at, id",
  );
  return rows.map((r) => ({
    id: String(r.id),
    status: String(r.status),
    unity: String(r.unity_pct),
    quorum: String(r.quorum_pct),
    roll: Number(r.electorate_count),
  }));
};

/** The game-start document exactly as it stands, read raw. */
const gameStartRow = async (): Promise<any | null> => {
  const [rows] = await pool.query<any[]>( // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
    "SELECT value FROM app_config WHERE config_key = 'game-start'",
  );
  if (!rows[0]) return null;
  return typeof rows[0].value === "string" ? JSON.parse(rows[0].value) : rows[0].value;
};

/** Ask the founder to hand-mint. The simplest issuance a route can be told to do. */
const tryToIssue = (reason: string) =>
  call("POST", "/api/admin/tokens/gratitude/mint", {
    body: { toUserId: wrenId, amount: 5, reason },
  });

async function vote(ballotId: string, token: string, choice: string): Promise<Answer> {
  return await call("POST", `/api/governance/ballots/${ballotId}/vote`, { token, body: { choice } });
}

beforeAll(async () => {
  if (!DB_CONFIGURED) return;
  if (!fs.existsSync(DIST)) {
    throw new Error(`${DIST} is missing. Run \`pnpm build\` before the launch vote route test.`);
  }
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "village-launchvote-"));
  /*
   * A village that has NOT started its Game, which is the whole premise. Every
   * other DB-backed suite gets the harness default, which is a village mid-life.
   */
  testDb = await provisionTestDb({ gameStarted: false });
  pool = mysql.createPool({ uri: testDb.url, timezone: "Z", connectionLimit: 4 }); // module-review-ok: the suite's own pool onto the scratch schema it provisioned

  child = spawn(process.execPath, [DIST], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      DATA_DIR: dataDir,
      DATABASE_URL: testDb.url,
      ADMIN_PASSWORD: ADMIN,
      AUTH_TOKEN_SECRET: "launchvote-token-secret", // module-review-ok: a fixture signing secret for a throwaway server on a scratch schema, same as every e2e suite
      RESEND_API_KEY: "",
      ANTHROPIC_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => logs.push(String(d)));
  child.stderr?.on("data", (d) => logs.push(String(d)));

  const deadline = Date.now() + E2E_BOOT_DEADLINE_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`server did not start in ${E2E_BOOT_DEADLINE_MS / 1000}s:\n${logs.join("")}`);
    try {
      if ((await fetch(`${BASE}/health`)).ok) break; // module-review-ok: the boot poll against the local test server
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 400));
  }

  const boot = await call("POST", "/api/admin/bootstrap", {
    token: "",
    body: { password: ADMIN, email: `founder-${PORT}@example.test`, name: "Launch Founder" },
  });
  const claim = decodeURIComponent(String(boot.json?.claimUrl ?? "").match(/token=([^&]+)/)?.[1] ?? "");
  const setPw = await call("POST", "/api/auth/set-password", { token: "", body: { token: claim, password: PASSWORD } });
  founderToken = String(setPw.json?.token ?? "");
  founderId = String(setPw.json?.user?.id ?? "");
  expect(founderToken, "founder must hold a session").toBeTruthy();

  const on = await call("PUT", "/api/admin/modules/governance/lifecycle", {
    body: { lifecycle: "members", examples: false },
  });
  expect(on.status, "governance must be on for this suite").toBe(200);

  const wren = await register("Wren Ashby", "wren");
  wrenToken = wren.token; wrenId = wren.id;

  // Everybody reaches member, which is the rung `ballot.vote` unlocks at, so
  // the roll is real. The founder is on it too: this vote asks EVERYONE.
  for (const id of [founderId, wrenId]) {
    const r = await call("PUT", `/api/admin/players/${id}/stage`, { body: { stageId: "member" } });
    expect(r.status, `${id} reaches member`).toBe(200);
  }

  /*
   * THE JOURNEY, CLEARED. These are the blocking items a fresh village of this
   * shape still holds, and clearing them is exactly the founder's solitary
   * setup that R67 says comes before the vote.
   */
  const brand = await call("PUT", "/api/admin/brand", {
    body: { project: { name: "Larksfield", tagline: "A village on the fen", location: "Norfolk" } },
  });
  expect(brand.status, JSON.stringify(brand.json)).toBe(200);

  const policy = await call("PUT", "/api/admin/exit-policy", {
    body: {
      placeholder: false,
      voluntary: {
        noticePeriodDays: 21,
        valuationMethod: "Larksfield pays out a leaving member at the value the last cycle settled, in full, within one lunation.",
        unwindSteps: [
          "Bring back anything borrowed from the barn",
          "Finish or hand on the work you are holding",
          "The stewards settle what is owed and write it down",
        ],
      },
      involuntary: {
        decidingDomainId: "",
        appealDomainId: "",
        process: "Two stewards sit with the person first. Nothing formal begins until that conversation has happened.",
      },
      restorative: {
        intakeContactRole: "",
        steps: [
          "Somebody who was not involved hears both people",
          "The village agrees what would put it right",
          "Whoever asked for this says whether it did",
        ],
      },
    },
  });
  expect(policy.status, JSON.stringify(policy.json)).toBe(200);

  const backups = await call("POST", "/api/admin/launch/confirm", {
    body: { id: "backups-drilled", done: true },
  });
  expect(backups.status, JSON.stringify(backups.json)).toBe(200);
}, 240_000);

afterAll(async () => {
  child?.kill();
  await pool?.end();
  if (dataDir && fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
  await testDb?.drop();
});

describe.skipIf(!DB_CONFIGURED)("a village sets itself up alone, and can issue nothing", () => {
  it("refuses every issuance before the vote, and says why in words a steward can read", async () => {
    const before = await tryToIssue("A hand-mint before the village has started its Game");
    expect(before.status).toBe(400);
    expect(String(before.json?.error)).toContain("has not started its Game");
    expect(String(before.json?.error)).toContain("launch vote carries");
    expect(await gameStartRow()).toBeNull();
  });

  it("tells every member the Game has not started, with no admin login", async () => {
    const anon = await call("GET", "/api/game/mechanics", { token: null });
    expect(anon.status).toBe(200);
    expect(anon.json?.gameStart?.started).toBe(false);
    expect(anon.json?.gameStart?.ballotId).toBeNull();
  });

  it("will not open the vote with two people on the roll, and says how many more", async () => {
    const status = await call("GET", "/api/admin/launch");
    expect(status.status).toBe(200);
    expect(status.json?.blockingOpen, JSON.stringify(status.json?.items?.filter((i: any) => i.severity === "blocking" && i.state !== "ok"))).toBe(0);
    expect(status.json?.vote?.onTheRoll).toBe(2);
    expect(String(status.json?.vote?.tooFew)).toContain("One more member");

    const early = await call("POST", "/api/admin/launch/propose");
    expect(early.status).toBe(409);
    expect(String(early.json?.error)).toContain("One more member");
    expect(early.json?.onTheRoll).toBe(2);
    expect(await launchBallots()).toEqual([]);
  });
});

describe.skipIf(!DB_CONFIGURED)("the third member arrives and the vote can be asked", () => {
  it("opens at 100 and 100, with the roll frozen at three", async () => {
    const ida = await register("Ida Kestrel", "ida");
    idaToken = ida.token; idaId = ida.id;
    const staged = await call("PUT", `/api/admin/players/${idaId}/stage`, { body: { stageId: "member" } });
    expect(staged.status).toBe(200);

    const asked = await call("POST", "/api/admin/launch/propose");
    expect(asked.status, JSON.stringify(asked.json)).toBe(200);

    const rows = await launchBallots();
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("open");
    expect(Number(rows[0].unity)).toBe(100);
    expect(Number(rows[0].quorum)).toBe(100);
    expect(rows[0].roll).toBe(3);
  });

  it("refuses a second one while the first is running", async () => {
    const again = await call("POST", "/api/admin/launch/propose");
    expect(again.status).toBe(409);
    expect(String(again.json?.error)).toContain("already voting");
    expect((await launchBallots()).length).toBe(1);
  });

  it("is a founder's act to open, and nobody else's", async () => {
    const notFounder = await call("POST", "/api/admin/launch/propose", { token: wrenToken });
    expect(notFounder.status).toBe(403);
  });
});

describe.skipIf(!DB_CONFIGURED)("a vote one person never answered does not carry", () => {
  it("closes as no_quorum, and nothing about the village changed", async () => {
    const [running] = await launchBallots();
    // Two of three answer. This is the whole engineering constraint of a 100%
    // quorum: silence is not a no, and it is not a yes either.
    expect((await vote(running.id, founderToken, "yes")).status).toBe(200);
    expect((await vote(running.id, wrenToken, "yes")).status).toBe(200);
    await expire(running.id);

    const closed = await call("POST", `/api/governance/ballots/${running.id}/close`, {
      body: { outcomeNote: "Ida was away and this one asks for everybody." },
    });
    expect(closed.status, JSON.stringify(closed.json)).toBe(200);
    expect(closed.json?.outcome).toBe("no_quorum");

    expect(await gameStartRow()).toBeNull();
    const status = await call("GET", "/api/admin/launch");
    expect(status.json?.launchedAt).toBeNull();
    const stillRefused = await tryToIssue("A hand-mint after a vote that missed");
    expect(stillRefused.status).toBe(400);
    expect(String(stillRefused.json?.error)).toContain("has not started its Game");
  });

  it("can be asked again the same hour, on a new freeze", async () => {
    const again = await call("POST", "/api/admin/launch/propose");
    expect(again.status, JSON.stringify(again.json)).toBe(200);
    const rows = await launchBallots();
    expect(rows.length).toBe(2);
    expect(rows[0].status).toBe("no_quorum");
    expect(rows[1].status).toBe("open");
    // The ballot that missed keeps its own frozen roll and its own dials.
    expect(rows[0].roll).toBe(3);
    expect(Number(rows[1].quorum)).toBe(100);

    // The journey page can say the village asked before.
    const status = await call("GET", "/api/admin/launch");
    expect(status.json?.vote?.past?.length).toBe(1);
    expect(status.json?.vote?.past?.[0]?.status).toBe("no_quorum");
    expect(status.json?.vote?.openBallot?.id).toBe(rows[1].id);
  });
});

describe.skipIf(!DB_CONFIGURED)("everybody answers and one says no", () => {
  it("does not carry, and the Game stays where it was", async () => {
    const rows = await launchBallots();
    const running = rows[rows.length - 1];
    expect((await vote(running.id, founderToken, "yes")).status).toBe(200);
    expect((await vote(running.id, wrenToken, "yes")).status).toBe(200);
    expect((await vote(running.id, idaToken, "no")).status).toBe(200);
    await expire(running.id);

    const closed = await call("POST", `/api/governance/ballots/${running.id}/close`, {
      body: { outcomeNote: "Ida wants the exit terms rewritten before we begin." },
    });
    expect(closed.status, JSON.stringify(closed.json)).toBe(200);
    expect(closed.json?.outcome).toBe("failed");
    expect(await gameStartRow()).toBeNull();
  });
});

describe.skipIf(!DB_CONFIGURED)("everybody answers and everybody agrees", () => {
  it("carries, and that is the moment token issuance opens", async () => {
    const opened = await call("POST", "/api/admin/launch/propose");
    expect(opened.status, JSON.stringify(opened.json)).toBe(200);
    const rows = await launchBallots();
    const running = rows[rows.length - 1];
    expect(running.status).toBe("open");

    for (const t of [founderToken, wrenToken, idaToken]) {
      expect((await vote(running.id, t, "yes")).status).toBe(200);
    }
    await expire(running.id);
    const closed = await call("POST", `/api/governance/ballots/${running.id}/close`, {
      body: { outcomeNote: "All three of us agreed. Larksfield starts today." },
    });
    expect(closed.status, JSON.stringify(closed.json)).toBe(200);
    expect(closed.json?.outcome).toBe("passed");

    // The two facts, written by the close and by nothing else.
    const started = await gameStartRow();
    expect(started?.ballotId).toBe(running.id);
    expect(String(started?.startedAt)).toBeTruthy();
    const status = await call("GET", "/api/admin/launch");
    expect(String(status.json?.launchedAt)).toBeTruthy();
    expect(status.json?.launchedByBallotId).toBe(running.id);
    expect(status.json?.gameStart?.started).toBe(true);

    // And the thing the whole vote was about.
    const now = await tryToIssue("The village started its Game, so this can land");
    expect(now.status, JSON.stringify(now.json)).toBe(200);
    expect(now.json?.toBalance).toBe(5);
  });

  it("says so to every member, with no admin login", async () => {
    const anon = await call("GET", "/api/game/mechanics", { token: null });
    expect(anon.json?.gameStart?.started).toBe(true);
    expect(String(anon.json?.gameStart?.ballotId)).toMatch(/^bal-/);
  });

  it("keeps the record when a manual checklist item is ticked afterwards", async () => {
    /*
     * The clobber this file exists to catch. Every other write to the
     * launch-state document reads it whole and puts it back whole, so an admin
     * ticking a checklist item after the vote carried would have erased the
     * launch if `recordLaunchCarried` wrote the same way. It writes the three
     * fields in place instead, and this drives the exact sequence.
     */
    const before = (await call("GET", "/api/admin/launch")).json;
    expect(String(before.launchedAt)).toBeTruthy();

    expect((await call("POST", "/api/admin/launch/confirm", { body: { id: "backups-drilled", done: false } })).status).toBe(200);
    expect((await call("POST", "/api/admin/launch/confirm", { body: { id: "backups-drilled", done: true } })).status).toBe(200);

    const after = (await call("GET", "/api/admin/launch")).json;
    expect(after.launchedAt).toBe(before.launchedAt);
    expect(after.launchedByBallotId).toBe(before.launchedByBallotId);
    expect(after.gameStart?.started).toBe(true);
  });

  it("cannot be started twice", async () => {
    const again = await call("POST", "/api/admin/launch/propose");
    expect(again.status).toBe(409);
    expect(String(again.json?.error)).toContain("already started its Game");
  });
});
