/**
 * THE SIX REFUSALS, DRIVEN THROUGH THE DOOR A FOUNDER ACTUALLY USES (R4).
 *
 * `server/lib/exitPolicy.test.ts` proves `exitLeverProblem` in isolation, with
 * every fact injected. That is a claim about a function. This file is the claim
 * about the PRODUCT: an admin holding a session PUTs an incoherent exit lever
 * at `/api/admin/variables/:key` against the BUILT server, and meets the
 * sentence, and the value is not stored.
 *
 * WHY THE PAIR IS NEEDED AND NEITHER HALF WOULD DO. The unit tests would go
 * green with the route never calling the guard at all, which is exactly the
 * defect a lane adding a refusal is most likely to ship. This file would go
 * green with a guard that refused the right things for the wrong reasons, and
 * it cannot reach the burn case without registering a token first. So: the
 * function is proven by cases, the WIRING is proven here.
 *
 * THE ONE CASE THAT LOOKS LIKE A PASS AND IS THE POINT. The withdrawal window
 * saves. A full credit keep with no vote is a policy a village may genuinely
 * mean, so the route answers 200 and the value is stored; the sentence about it
 * belongs to the test run. A guard that refused it would be the platform
 * deciding a village's exit terms for it.
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
import { provisionTestDb, testDbConfigured, type TestDb, E2E_BOOT_DEADLINE_MS, waitForPortFree } from "./db/testDb";

const DB_CONFIGURED = testDbConfigured();
if (!DB_CONFIGURED) {
  console.warn("[exitLevers.routes] TEST_DATABASE_URL not set - DB-backed tests SKIPPED. A skip is not a pass.");
}

const DIST = path.resolve(process.cwd(), "dist/index.js");

/**
 * This suite's port window, checked by `scripts/check-e2e-ports.mjs` rather
 * than surveyed by hand. It sits above every window that existed when this
 * file landed and clear of the 32768+ ephemeral range; change the number and
 * the script will tell you whether it still is.
 */
const PORT = 30402 + (process.pid % 400);
const BASE = `http://localhost:${PORT}`;
const ADMIN = "exitlevers-admin";
const PASSWORD = "ExitLevers123!";

let child: ChildProcess | undefined;
let testDb: TestDb | undefined;
let dataDir = "";
let pool: mysql.Pool;
const logs: string[] = [];
let founderToken = "";

interface Answer { status: number; json: any }

async function call(method: string, route: string, opts: { body?: unknown; token?: string | null } = {}): Promise<Answer> {
  const token = opts.token === undefined ? founderToken : opts.token;
  const res = await fetch(BASE + route, { // module-review-ok: the test client dialling the built server on localhost, as every e2e suite does
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const setDial = (key: string, value: string) => call("PUT", `/api/admin/variables/${key}`, { body: { value } });

/** What the database actually holds for one key. An absent row IS the default. */
const storedValue = async (key: string): Promise<string | null> => {
  const [rows] = await pool.query<any[]>( // module-review-ok: fixture SQL against the S5 scratch schema, never a production table
    "SELECT `value` FROM `game_variables` WHERE `config_key` = ?",
    [key],
  );
  return rows[0] ? String(rows[0].value) : null;
};

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

beforeAll(async () => {
  if (!DB_CONFIGURED) return;
  if (!fs.existsSync(DIST)) {
    throw new Error(`${DIST} is missing. Run \`pnpm build\` before the exit levers route test.`);
  }
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "village-exitlevers-"));
  testDb = await provisionTestDb();
  pool = mysql.createPool({ uri: testDb.url, timezone: "Z", connectionLimit: 4 }); // module-review-ok: the suite's own pool onto the scratch schema it provisioned

  await waitForPortFree(PORT);
  child = spawn(process.execPath, [DIST], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      // No background scheduler, for the reason every e2e suite gives: the
      // first tick runs every job with no scheduled_jobs row against the
      // schema this suite is asserting on.
      SCHEDULER_ENABLED: "0",
      DATA_DIR: dataDir,
      DATABASE_URL: testDb.url,
      ADMIN_PASSWORD: ADMIN,
      AUTH_TOKEN_SECRET: "exitlevers-token-secret", // module-review-ok: a fixture signing secret for a throwaway server on a scratch schema, same as every e2e suite
      RESEND_API_KEY: "",
      ANTHROPIC_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => logs.push(String(d)));
  child.stderr?.on("data", (d) => logs.push(String(d)));

  const deadline = Date.now() + E2E_BOOT_DEADLINE_MS;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(`server did not start in ${E2E_BOOT_DEADLINE_MS / 1000}s. Output:\n${logs.join("")}`);
    }
    try {
      if ((await fetch(`${BASE}/health`)).ok) break; // module-review-ok: the boot poll against the local test server
    } catch { /* not up yet */ }
    await settle(400);
  }

  const boot = await call("POST", "/api/admin/bootstrap", {
    token: null,
    body: { password: ADMIN, email: `founder-${PORT}@example.test`, name: "Exit Founder" },
  });
  const claim = decodeURIComponent(String(boot.json?.claimUrl ?? "").match(/token=([^&]+)/)?.[1] ?? "");
  expect(claim, "bootstrap must return a claim link").toBeTruthy();
  const setPw = await call("POST", "/api/auth/set-password", { token: null, body: { token: claim, password: PASSWORD } });
  founderToken = String(setPw.json?.token ?? "");
  expect(founderToken, "founder must hold a session").toBeTruthy();
});

afterAll(async () => {
  child?.kill();
  await pool?.end();
  if (dataDir && fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
  await testDb?.drop();
});

describe.skipIf(!DB_CONFIGURED)("what the variables route refuses about a departure", () => {
  it("a coherent exit dial saves, so the guard is not simply refusing everything", async () => {
    // The control. Every refusal below means nothing without it.
    const ok = await setDial("exit.cooling_days", "14");
    expect(ok.status).toBe(200);
    expect(await storedValue("exit.cooling_days")).toBe("14");
    // Back to the platform default, which REMOVES the row rather than storing
    // a zero, so the cases below run on an inherited default.
    expect((await setDial("exit.cooling_days", "0")).status).toBe(200);
    expect(await storedValue("exit.cooling_days")).toBeNull();
  });

  it("a share of RECOGNITION is refused, and nothing is written", async () => {
    const r = await setDial("exit.keep_pct.recognition", "40");
    expect(r.status).toBe(400);
    expect(r.json?.error).toBe(
      "Recognition is a record of what happened, not a holding. It stays on the village's books either way, so a share of it is not a thing a leaver can keep.",
    );
    expect(await storedValue("exit.keep_pct.recognition")).toBeNull();
  });

  it("a share of EQUITY is refused, and nothing is written", async () => {
    const r = await setDial("exit.keep_pct.equity", "10");
    expect(r.status).toBe(400);
    expect(r.json?.error).toBe(
      "Equity is governed on Base under Hypha and this platform never moves it. What happens to it on departure is decided there.",
    );
    expect(await storedValue("exit.keep_pct.equity")).toBeNull();
  });

  it("BURN is allowed while every token this village issues has a faucet", async () => {
    /*
     * The order here is the argument. A seeded village's tokens all have a
     * faucet, so burn is a coherent answer and the route says so. The refusal
     * arrives only once the village mints something the engine has nowhere to
     * burn back to, which is the next case.
     */
    const r = await setDial("exit.remainder_account", "burn");
    expect(r.status).toBe(200);
    expect(await storedValue("exit.remainder_account")).toBe("burn");
    expect((await setDial("exit.remainder_account", "settlement")).status).toBe(200);
  });

  it("BURN is refused once the village mints a token with no faucet, and the refusal names it", async () => {
    // Created through the admin route and not by raw SQL, because the token
    // registry is an in-memory cache in the SERVER process: a row inserted
    // behind its back is a token the running server does not know about.
    const made = await call("POST", "/api/admin/tokens", {
      body: { slug: "harvest-credit", name: "Harvest Credit", kind: "credit", transferable: false },
    });
    expect(made.status, `token create: ${JSON.stringify(made.json)}`).toBe(200);

    const r = await setDial("exit.remainder_account", "burn");
    expect(r.status).toBe(400);
    expect(r.json?.error).toBe("Harvest Credit has no faucet, so there is nowhere to burn it back to.");
    expect(await storedValue("exit.remainder_account")).toBeNull();
  });

  it("CONVERT at a rate of zero is refused", async () => {
    const r = await setDial("exit.voice_on_exit", "convert");
    expect(r.status).toBe(400);
    expect(r.json?.error).toBe("A conversion at zero is a forfeit. Say forfeit, or set a rate.");
    expect(await storedValue("exit.voice_on_exit")).toBeNull();
  });

  it("CONVERT saves once a rate stands under it, which is the pair reading both dials", async () => {
    expect((await setDial("exit.voice_convert_rate", "2.5")).status).toBe(200);
    const r = await setDial("exit.voice_on_exit", "convert");
    expect(r.status).toBe(200);
    expect(await storedValue("exit.voice_on_exit")).toBe("convert");
    // And back, so the rest of the suite runs on the shipped answers.
    expect((await setDial("exit.voice_on_exit", "forfeit")).status).toBe(200);
    expect((await setDial("exit.voice_convert_rate", "0")).status).toBe(200);
  });

  it("KEEPING Voice is refused while a resolved exit anonymizes the account", async () => {
    const r = await setDial("exit.voice_on_exit", "keep");
    expect(r.status).toBe(400);
    expect(r.json?.error).toBe(
      "Keeping Voice needs an account that still exists after the departure, and a resolved exit makes the account a tombstone. This becomes available when a village can record a departure without one.",
    );
    expect(await storedValue("exit.voice_on_exit")).toBeNull();
  });

  it("a COOLING period longer than the published notice is refused, naming both numbers", async () => {
    // 30 is `DEFAULT_EXIT_POLICY.voluntary.noticePeriodDays`, which is what
    // this village publishes until it writes its own terms. The refusal reads
    // that document and not a constant, which the next case proves.
    const r = await setDial("exit.cooling_days", "45");
    expect(r.status).toBe(400);
    expect(r.json?.error).toBe(
      "Your published policy says 30 days of notice and this would hold balances for 45. Change the published term first.",
    );
    expect(await storedValue("exit.cooling_days")).toBeNull();
  });

  it("the same 45 days SAVES once the village publishes a longer notice", async () => {
    /*
     * The refusal is about the gap between the page and the engine, so closing
     * the gap has to open the dial. This also proves the guard reads the LIVE
     * policy document through `exitPolicyRepo.get()` and not the platform
     * constant it happens to equal on a fresh village.
     */
    // Three sections or the route refuses as incomplete, and `placeholder`
    // stays TRUE: clearing it while the terms are still word for word the
    // platform's is a 409 from a different guard in the same file, and this
    // case is about the notice period and not about that one.
    const published = await call("PUT", "/api/admin/exit-policy", {
      body: {
        placeholder: true,
        voluntary: { noticePeriodDays: 60 },
        involuntary: {},
        restorative: {},
      },
    });
    expect(published.status, `publish: ${JSON.stringify(published.json)}`).toBe(200);
    const r = await setDial("exit.cooling_days", "45");
    expect(r.status).toBe(200);
    expect(await storedValue("exit.cooling_days")).toBe("45");
    expect((await setDial("exit.cooling_days", "0")).status).toBe(200);
  });

  it("THE WITHDRAWAL WINDOW SAVES: it is a warning, and a village may mean it", async () => {
    /*
     * A full credit keep with no vote over any amount. On a token somebody can
     * buy this is a withdrawal window wearing an exit, and it is still the
     * village's call, so the route answers 200 and stores it. The sentence
     * about it is the test run's to print.
     */
    const r = await setDial("exit.keep_pct.credit", "100");
    expect(r.status).toBe(200);
    expect(r.json?.error).toBeUndefined();
    expect(await storedValue("exit.keep_pct.credit")).toBe("100");
    expect(await storedValue("exit.vote_over")).toBeNull(); // 0 by default: no departure asks anybody
    expect((await setDial("exit.keep_pct.credit", "0")).status).toBe(200);
  });

  it("a dial outside the Exit category is untouched by any of this", async () => {
    // The guard returns before reading anything for a key that is not an exit
    // lever, and this is the case that would catch it refusing one by accident.
    const r = await setDial("gratitude.base_budget", "250");
    expect(r.status).toBe(200);
    expect(await storedValue("gratitude.base_budget")).toBe("250");
  });
});
