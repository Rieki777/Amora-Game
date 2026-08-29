/**
 * THE TOKENS TAB, AND WHAT A MEMBER SEES AFTERWARDS.
 *
 * Everything an admin does to a token in Admin, The Game, Tokens ends up in
 * somebody's hands, so this file drives the admin surface over HTTP against
 * the BUILT `dist/index.js` and then reads the member's own pages back.
 *
 * Run `pnpm build` first or you are testing stale code. Skips loudly without
 * TEST_DATABASE_URL.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { E2E_BOOT_DEADLINE_MS, provisionTestDb, testDbConfigured, type TestDb } from "./db/testDb";

const DB_CONFIGURED = testDbConfigured();
if (!DB_CONFIGURED) {
  // eslint-disable-next-line no-console
  console.warn("[adminTokens] TEST_DATABASE_URL not set — DB-backed tests SKIPPED.");
}

const DIST = path.resolve(process.cwd(), "dist/index.js");

/**
 * A window PROVABLY clear of every other suite that boots a server.
 *
 * RE-GREP BEFORE TRUSTING THIS. `grep -rn "process.pid %" server/` is the
 * survey; the number is only its result on the date named. Surveyed
 * 2026-08-29: the highest any other suite reaches is 16599
 * (16200 + pid % 400, `meterRevocation.e2e.test.ts`), so a base at 16700
 * cannot collide for ANY process id. 400 wide, ending at 17099.
 */
const PORT = 16700 + (process.pid % 400);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = "AdminTokens123!";
const PASSWORD = "OraTokens123!";
/** A slug nothing seeds, so every assertion here is about a token this file made. */
const SLUG = "qa-needle";

let child: ChildProcess | null = null;
let testDb: TestDb | undefined;
let dataDir = "";
const logs: string[] = [];

let founderToken = "";
let oraToken = "";
let oraId = "";

interface Answer { status: number; json: any; text: string }

async function call(method: string, route: string, body?: unknown, token?: string | null): Promise<Answer> {
  const res = await fetch(BASE + route, { // module-review-ok: the test client dialling the built server on localhost, as every e2e suite does
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON stays visible through text */ }
  return { status: res.status, json, text };
}

describe.skipIf(!DB_CONFIGURED)("the tokens tab, and what a member sees afterwards", () => {
  beforeAll(async () => {
    if (!fs.existsSync(DIST)) {
      throw new Error(`${DIST} is missing. Run \`pnpm build\` before this drive.`);
    }
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "village-admin-tokens-"));
    testDb = await provisionTestDb();

    child = spawn(process.execPath, [DIST], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(PORT),
        DATA_DIR: dataDir,
        DATABASE_URL: testDb.url,
        ADMIN_PASSWORD: ADMIN,
        AUTH_TOKEN_SECRET: "admin-tokens-token-secret", // module-review-ok: a fixture signing secret for a throwaway server on a scratch schema, same as every e2e suite
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
        throw new Error(`server did not start in ${E2E_BOOT_DEADLINE_MS / 1000}s:\n${logs.join("")}`);
      }
      try {
        if ((await fetch(`${BASE}/health`)).ok) break; // module-review-ok: the boot poll against the local test server
      } catch { /* not up yet */ }
      await new Promise((r) => setTimeout(r, 400));
    }

    const boot = await call("POST", "/api/admin/bootstrap", {
      password: ADMIN, email: `founder-${PORT}@example.test`, name: "Tokens Founder",
    }, null);
    const claim = decodeURIComponent(String(boot.json?.claimUrl ?? "").match(/token=([^&]+)/)?.[1] ?? "");
    const setPw = await call("POST", "/api/auth/set-password", { token: claim, password: ADMIN }, null);
    founderToken = String(setPw.json?.token ?? "");
    expect(founderToken, "the founder must hold a session").toBeTruthy();

    const reg = await call("POST", "/api/auth/register", {
      name: "Ora", email: `ora-${PORT}@example.test`, password: PASSWORD, paths: ["resident"],
    }, null);
    expect(reg.status, "Ora must register").toBe(200);
    oraToken = String(reg.json?.token ?? "");
    oraId = String(reg.json?.user?.id ?? "");
    expect(oraId, "Ora must have an id").toBeTruthy();

    // The wallet page reads `/api/exchange`, which is behind the module gate.
    const ex = await call("PUT", "/api/admin/modules/exchange/lifecycle", { lifecycle: "public" }, founderToken);
    expect(ex.status, `exchange must turn on: ${ex.text.slice(0, 200)}`).toBe(200);
  }, 180_000);

  afterAll(async () => {
    child?.kill();
    await testDb?.drop();
    if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
  });

  /**
   * QA3-M4. The operator's sentence was "I renamed our currency to Seeds and
   * my wallet still calls it qa3needle."
   *
   * The rename saves correctly. What went wrong is downstream: both pages a
   * member opens to read what they hold were keyed on the SLUG and rendered
   * the slug as though it were the name. The slug is history's identity and
   * deliberately never changes, so it can never be the village's word for its
   * own currency.
   *
   * The control matters as much as the assertion: the name is read before the
   * rename too, so a pass proves the pages follow the registry rather than
   * proving they happen to show a string.
   */
  it("renames a token, and the member's wallet follows on both surfaces", async () => {
    const made = await call("POST", "/api/admin/tokens", {
      slug: SLUG, name: "Needle", kind: "credit",
    }, founderToken);
    expect(made.status, `create: ${made.text.slice(0, 200)}`).toBe(200);

    const minted = await call("POST", `/api/admin/tokens/${SLUG}/mint`, {
      toUserId: oraId, amount: 25, reason: "so she holds some of it",
    }, founderToken);
    expect(minted.status, `mint: ${minted.text.slice(0, 200)}`).toBe(200);

    // CONTROL, before the rename: both pages carry the name it was created
    // with, so what follows is a measurement of the rename and not of a
    // hard-coded string.
    const walletBefore = await call("GET", "/api/wallet", undefined, oraToken);
    expect(walletBefore.status).toBe(200);
    expect(walletBefore.json?.ledger?.[SLUG]).toBe(25);
    expect(walletBefore.json?.tokenNames?.[SLUG]).toBe("Needle");

    const renamed = await call("PUT", `/api/admin/tokens/${SLUG}`, { name: "Seeds" }, founderToken);
    expect(renamed.status, `rename: ${renamed.text.slice(0, 200)}`).toBe(200);
    expect(renamed.json?.token?.name).toBe("Seeds");

    // The wallet section on the member's own profile.
    const wallet = await call("GET", "/api/wallet", undefined, oraToken);
    expect(wallet.status).toBe(200);
    expect(wallet.json?.ledger?.[SLUG], "the balance is untouched by a rename").toBe(25);
    expect(wallet.json?.tokenNames?.[SLUG], "and the village's word for it follows").toBe("Seeds");

    // The Exchange page, which is the one the operator was looking at.
    const exchange = await call("GET", "/api/exchange", undefined, oraToken);
    expect(exchange.status).toBe(200);
    expect(exchange.json?.mine?.balances?.[SLUG]).toBe(25);
    expect(exchange.json?.mine?.tokenNames?.[SLUG], "the Exchange follows too").toBe("Seeds");

    // The slug is history's identity and a rename must never move it. If this
    // ever fails, every ledger row written before the rename has been orphaned.
    expect(Object.keys(wallet.json?.ledger ?? {})).toContain(SLUG);
  });
});
