/**
 * Standing examples: the refusals and the retirement triggers, over HTTP.
 *
 * `server/lib/examples.test.ts` proves the LIBRARY — seeding, retirement,
 * scoping, cache reload — by calling it directly. That leaves the part a
 * village actually meets untested: the ~20 route guards and the ~17
 * retirement triggers that live in `server/index.ts`. An adversarial review
 * (docs/STANDING_EXAMPLES_REVIEW_2026-08-01.md) put numbers on the gap:
 * twelve guards could be deleted with every gate still green, because
 * nothing exercised them.
 *
 * That is what this file closes. It boots the BUILT server against a
 * throwaway schema exactly like `loop.e2e.test.ts` does, seeds every
 * module's examples, and then tries to do the things the four rules say
 * cannot be done. A guard that gets reordered below its own side effect, or
 * deleted outright, fails here.
 *
 * Unlike the loop test this file is NOT one ordered journey: each case is
 * independent, so a failure names exactly one broken guard.
 *
 * Skips loudly without TEST_DATABASE_URL, like every DB-backed suite here.
 */
import fs from "fs";
import os from "os";
import path from "path";
import mysql from "mysql2/promise";
import { spawn, type ChildProcess } from "child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionTestDb, testDbConfigured, type TestDb } from "./db/testDb";

const DB_CONFIGURED = testDbConfigured();
if (!DB_CONFIGURED) {
  // eslint-disable-next-line no-console
  console.warn("[examples.routes] TEST_DATABASE_URL not set — DB-backed tests SKIPPED.");
}

const DIST = path.resolve(process.cwd(), "dist/index.js");
// Deliberately far from the loop test's port range: the two suites can run in
// the same vitest invocation.
const PORT = 6100 + (process.pid % 1500);
const BASE = `http://localhost:${PORT}`;
const ADMIN = "examples-routes-admin";

let child: ChildProcess | undefined;
let testDb: TestDb | undefined;
let dataDir = "";
let pool: mysql.Pool;
let founderToken = "";
let founderId = "";

/** One authenticated call. Returns status AND body: a guard is only correct
 *  if it refuses with the shared shape, not merely with some error. */
async function call(
  method: string,
  route: string,
  body?: unknown,
  token = founderToken,
): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

/** The contract every refusal shares (server/lib/examples.ts EXAMPLE_REFUSAL_BODY). */
function expectRefused(r: { status: number; json: any }, what: string): void {
  expect(r.status, `${what} must be refused with 409`).toBe(409);
  expect(r.json?.code, `${what} must carry the shared refusal code`).toBe("example_immutable");
}

/** Ids the seed writes, asserted present so a rename fails loudly here rather
 *  than turning every guard case into a silent pass against a missing row. */
async function exampleId(table: string, like = "ex-%"): Promise<string> {
  const [rows] = await pool.query<any[]>(
    `SELECT id FROM \`${table}\` WHERE is_example = 1 AND id LIKE ? ORDER BY id LIMIT 1`,
    [like],
  );
  const id = rows[0]?.id;
  expect(id, `an example row must exist in ${table} (seeding changed?)`).toBeTruthy();
  return String(id);
}

beforeAll(async () => {
  if (!DB_CONFIGURED) return;
  if (!fs.existsSync(DIST)) {
    throw new Error(`${DIST} is missing. Run \`pnpm build\` before the examples route test.`);
  }
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "village-examples-"));
  testDb = await provisionTestDb();
  pool = mysql.createPool({ uri: testDb.url, timezone: "Z", connectionLimit: 4 });

  child = spawn(process.execPath, [DIST], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      DATA_DIR: dataDir,
      DATABASE_URL: testDb.url,
      ADMIN_PASSWORD: ADMIN,
      AUTH_TOKEN_SECRET: "examples-routes-token-secret",
      RESEND_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      // Stripe stays unconfigured: the checkout guards must refuse the
      // EXAMPLE before they ever reach the "no Stripe" 503, which is
      // precisely the ordering the review found broken once.
      STRIPE_WEBHOOK_SECRET: "whsec_examplesroutes",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs: string[] = [];
  child.stdout?.on("data", (d) => logs.push(String(d)));
  child.stderr?.on("data", (d) => logs.push(String(d)));

  const deadline = Date.now() + 60_000;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(`server did not start in 60s. Output:\n${logs.join("")}`);
    }
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  // A founder, then every module on — examples seed on the enable, which is
  // the same path a real village walks.
  const boot = await call("POST", "/api/admin/bootstrap", {
    password: ADMIN,
    email: `founder-${PORT}@example.test`,
    name: "Examples Founder",
  }, "");
  const claim = decodeURIComponent(String(boot.json?.claimUrl ?? "").match(/token=([^&]+)/)?.[1] ?? "");
  expect(claim, "bootstrap must return a claim link").toBeTruthy();
  const setPw = await call("POST", "/api/auth/set-password", { token: claim, password: "ExamplesTest123!" }, "");
  founderToken = String(setPw.json?.token ?? "");
  expect(founderToken, "founder must hold a session").toBeTruthy();
  const [fRows] = await pool.query<any[]>(
    "SELECT id FROM users WHERE email = ? LIMIT 1", [`founder-${PORT}@example.test`],
  );
  founderId = String(fRows[0]?.id ?? "");
  expect(founderId, "the founder row must exist").toBeTruthy();

  const mods = await call("GET", "/api/admin/modules");
  for (const m of mods.json?.modules ?? []) {
    if (m.core) continue;
    await call("PUT", `/api/admin/modules/${m.id}/lifecycle`, { lifecycle: "public" });
  }
}, 180_000);

afterAll(async () => {
  child?.kill();
  await pool?.end();
  if (dataDir && fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
  await testDb?.drop();
});

describe.skipIf(!DB_CONFIGURED)("standing examples: every guard, over HTTP", () => {
  it("seeded examples exist to be guarded (a hollow pass would prove nothing)", async () => {
    const shown = await call("GET", "/api/examples");
    expect(Array.isArray(shown.json?.modules)).toBe(true);
    expect(shown.json.modules.length, "modules must be showing examples").toBeGreaterThan(3);
  });

  // ── Rule 1: examples never become economic state ────────────────────────

  it("refuses to reserve an example library item", async () => {
    const id = await exampleId("library_items");
    expectRefused(await call("POST", `/api/library/items/${id}/reserve`, {}), "library reserve");
  });

  it("refuses to request an example room", async () => {
    const id = await exampleId("accommodations");
    expectRefused(
      await call("POST", "/api/stays/request", { accommodationId: id, nights: 2 }),
      "stay request",
    );
  });

  it("refuses to CHECKOUT an example room — before any Stripe object exists", async () => {
    const id = await exampleId("accommodations");
    const r = await call("POST", "/api/stays/checkout", { accommodationId: id, nights: 2 });
    expectRefused(r, "stay checkout");
    // The refusal must precede the row, not follow it.
    const [rows] = await pool.query<any[]>("SELECT COUNT(*) n FROM stay_purchases");
    expect(Number(rows[0].n), "no stay_purchases row may exist for an example room").toBe(0);
  });

  it("refuses an ADMIN manual stay purchase against an example room", async () => {
    const id = await exampleId("accommodations");
    const r = await call("POST", "/api/admin/stays/purchases/manual", {
      userId: founderId, accommodationId: id, nights: 1, amountMinor: 1000,
    });
    expectRefused(r, "manual stay purchase");
    const [rows] = await pool.query<any[]>("SELECT COUNT(*) n FROM stay_purchases");
    expect(Number(rows[0].n)).toBe(0);
  });

  it("refuses to buy an example product", async () => {
    const id = await exampleId("payment_products");
    expectRefused(await call("POST", `/api/products/${id}/checkout`, {}), "product checkout");
  });

  it("refuses to heart an example feed post — hearts move real budget", async () => {
    const id = await exampleId("forum_threads", "ex-feed-%");
    expectRefused(await call("POST", `/api/feed/threads/${id}/heart`, {}), "feed heart");
  });

  /**
   * Quests is core and ships with a real starter board, so hasRealContent
   * correctly suppresses example quests on this instance — which would make
   * a seeded-row probe a silent pass. The guard still has to hold for the
   * forks whose board IS empty, so the row is written here directly, exactly
   * as the module would have seeded it.
   */
  it("refuses to claim an example quest, and mints nothing", async () => {
    await pool.query(
      `INSERT INTO quests (id, title, description, impact, gratitude, duration, difficulty,
         circle, status, icon, sort_order, is_example)
       VALUES ('ex-quest-probe','Example quest','For the guard test','Proves the refusal',
         '60-120','1 hour','easy','General','open','sparkles',999,1)
       ON DUPLICATE KEY UPDATE is_example = 1`,
    );
    try {
      expectRefused(await call("POST", "/api/game/quests/ex-quest-probe/claim", {}), "quest claim");
      const [rows] = await pool.query<any[]>(
        "SELECT COUNT(*) n FROM quest_claims WHERE quest_id = 'ex-quest-probe'",
      );
      expect(Number(rows[0].n), "no claim may exist against an example quest").toBe(0);

      // The submit guard exists for the claim that predates it: seed exactly
      // that state, because otherwise the route stops at "no active claim"
      // and the guard is never reached.
      await pool.query(
        "INSERT INTO quest_claims (id, quest_id, quest_title, user_id, user_name, status) " +
          "VALUES ('ex-claim-probe','ex-quest-probe','Example quest',?, 'Examples Founder','claimed')",
        [founderId],
      );
      expectRefused(
        await call("POST", "/api/game/quests/ex-quest-probe/submit", { note: "done" }),
        "quest submit on a pre-existing claim",
      );
      const [still] = await pool.query<any[]>(
        "SELECT status FROM quest_claims WHERE id = 'ex-claim-probe'",
      );
      expect(still[0]?.status, "the claim must not advance toward consent").toBe("claimed");
    } finally {
      await pool.query("DELETE FROM quest_claims WHERE id = 'ex-claim-probe'");
      await pool.query("DELETE FROM quests WHERE id = 'ex-quest-probe'");
    }
  });

  it("refuses to award an example badge", async () => {
    const id = await exampleId("badges");
    const r = await call("POST", `/api/admin/badges/${id}/award`, { userId: founderId });
    expectRefused(r, "badge award");
    // Seeded example awards exist by design; what the refusal must guarantee
    // is that no award of any kind reached the REAL member.
    const [rows] = await pool.query<any[]>(
      "SELECT COUNT(*) n FROM badge_awards WHERE user_id = ?", [founderId],
    );
    expect(Number(rows[0].n), "the founder holds nothing").toBe(0);
  });

  it("refuses to buy the example exchange listing", async () => {
    const [rows] = await pool.query<any[]>(
      "SELECT token_slug FROM token_exchange_settings WHERE is_example = 1 LIMIT 1",
    );
    if (!rows[0]) return; // exchange examples are optional per seed
    const r = await call("POST", "/api/exchange/buy", { tokenSlug: rows[0].token_slug, quantity: 1 });
    expectRefused(r, "exchange buy");
  });

  it("refuses gratitude sent TO an example identity", async () => {
    const [rows] = await pool.query<any[]>("SELECT email FROM users WHERE is_example = 1 LIMIT 1");
    if (!rows[0]?.email) return;
    const r = await call("POST", "/api/game/gratitude/send", {
      toEmail: rows[0].email, amount: 5, message: "for the test",
    });
    expect(r.status, "gratitude to an example identity must be refused").toBe(409);
    const [led] = await pool.query<any[]>(
      "SELECT COUNT(*) n FROM token_ledger WHERE source LIKE 'gratitude%'",
    );
    expect(Number(led[0].n), "no ledger row may be born from an example recipient").toBe(0);
  });

  // ── Rule 1, second half: no example may hold open economic state ────────

  it("leaves every economic table empty after all that refusing", async () => {
    for (const table of [
      "token_ledger", "library_loans", "stay_purchases", "product_purchases",
      "fiat_charges", "exchange_orders",
    ]) {
      const [rows] = await pool.query<any[]>(`SELECT COUNT(*) n FROM \`${table}\``);
      expect(Number(rows[0].n), `${table} must hold nothing`).toBe(0);
    }
    // badge_awards is allowed to hold EXAMPLE awards (seeded, held by example
    // identities). What must never exist is a real one, or an example one on
    // a real member.
    const [real] = await pool.query<any[]>(
      "SELECT COUNT(*) n FROM badge_awards WHERE is_example = 0",
    );
    expect(Number(real[0].n), "no real award may exist on this instance").toBe(0);
    const [leak] = await pool.query<any[]>(
      "SELECT COUNT(*) n FROM badge_awards a JOIN users u ON u.id = a.user_id " +
        "WHERE a.is_example = 1 AND u.is_example = 0",
    );
    expect(Number(leak[0].n), "no example award may touch a real user").toBe(0);
  });

  /**
   * The rule-1 corollary: an example must never leave open state behind that
   * traps the founder in the module it was demoing. A module that still has
   * DEPENDENTS is a different, legitimate 409 (feed requires forum), so the
   * refusal only counts as a failure when it names open state.
   */
  it("lets every module with examples still be turned off (no trapped open state)", async () => {
    const shown = await call("GET", "/api/examples");
    for (const id of shown.json?.modules ?? []) {
      if (["quests", "gratitude", "progression", "profiles"].includes(id)) continue;
      const off = await call("PUT", `/api/admin/modules/${id}/lifecycle`, { lifecycle: "off" });
      if (off.status !== 200) {
        expect(
          off.json?.dependents,
          `${id} refused to turn off for a reason other than dependents: ${JSON.stringify(off.json)}`,
        ).toBeTruthy();
        continue;
      }
      await call("PUT", `/api/admin/modules/${id}/lifecycle`, { lifecycle: "public" });
    }
  });

  // ── Rule 2: an example is never mistaken for real ───────────────────────

  it("refuses to reply to an example thread", async () => {
    const id = await exampleId("forum_threads", "ex-thread-%");
    expectRefused(await call("POST", `/api/forum/threads/${id}/replies`, { body: "hello" }), "forum reply");
  });

  it("refuses an admin EDIT of an example row", async () => {
    const id = await exampleId("library_items");
    const r = await call("PUT", `/api/admin/library/items/${id}`, { title: "renamed" });
    expectRefused(r, "library item edit");
  });

  it("refuses an admin EDIT of an example quest (editing one would launder it)", async () => {
    await pool.query(
      `INSERT INTO quests (id, title, description, impact, gratitude, duration, difficulty,
         circle, status, icon, sort_order, is_example)
       VALUES ('ex-quest-edit','Example quest','d','i','10','1 hour','easy','General','open','sparkles',998,1)
       ON DUPLICATE KEY UPDATE is_example = 1`,
    );
    try {
      expectRefused(
        await call("PUT", "/api/admin/quests/ex-quest-edit", { title: "Mine now" }),
        "admin quest edit",
      );
      const [rows] = await pool.query<any[]>("SELECT title FROM quests WHERE id = 'ex-quest-edit'");
      expect(rows[0]?.title, "the example keeps its own title").toBe("Example quest");
    } finally {
      await pool.query("DELETE FROM quests WHERE id = 'ex-quest-edit'");
    }
  });

  it("refuses acting on an example call task", async () => {
    const [rows] = await pool.query<any[]>(
      "SELECT id FROM call_tasks WHERE is_example = 1 LIMIT 1",
    );
    if (!rows[0]) return;
    expectRefused(
      await call("POST", `/api/admin/call-tasks/${rows[0].id}/accept`),
      "call task accept",
    );
    const [after] = await pool.query<any[]>(
      "SELECT status FROM call_tasks WHERE id = ?", [rows[0].id],
    );
    expect(after[0]?.status, "the example task keeps its status").toBe("suggested");
  });

  it("refuses rewriting an example synthesis body", async () => {
    const [rows] = await pool.query<any[]>(
      "SELECT id FROM call_syntheses WHERE is_example = 1 LIMIT 1",
    );
    if (!rows[0]) return;
    expectRefused(
      await call("PUT", `/api/admin/syntheses/${rows[0].id}/body`, { body: "rewritten" }),
      "synthesis body edit",
    );
  });

  it("refuses to bootstrap an example identity into a founder", async () => {
    const [rows] = await pool.query<any[]>("SELECT email FROM users WHERE is_example = 1 LIMIT 1");
    if (!rows[0]?.email) return;
    const r = await call("POST", "/api/admin/bootstrap", {
      password: ADMIN, email: rows[0].email, name: "Impostor",
    }, "");
    expect(r.status, "an example identity must never become a founder").toBeGreaterThanOrEqual(400);
    const [check] = await pool.query<any[]>(
      "SELECT role FROM users WHERE email = ? LIMIT 1", [rows[0].email],
    );
    expect(check[0]?.role, "the example identity keeps its role").not.toBe("founder");
  });

  // ── Rule 3: publishing something real retires that module, one way ──────

  it("retires a module when something real is published, and only that module", async () => {
    const before = await call("GET", "/api/examples");
    expect(before.json.modules, "tools must be showing examples first").toContain("tools");
    const otherBefore = (before.json.modules as string[]).filter((m) => m !== "tools");

    const made = await call("POST", "/api/admin/tools", {
      name: "A real tool", purpose: "Proving retirement", url: "https://example.invalid/t",
      category: "coordination", visibility: "public",
    });
    expect(made.status, `publishing a real tool must succeed: ${JSON.stringify(made.json)}`).toBeLessThan(400);

    // Retirement rides the create as fire-and-forget, and the tombstone is
    // stamped BEFORE the cache reload — so polling /api/examples would exit
    // while the served collection is still stale. Poll the collection itself,
    // which is what a member actually sees.
    let names: string[] = [];
    for (let i = 0; i < 60; i++) {
      const tools = await call("GET", "/api/tools");
      names = (tools.json?.tools ?? []).map((t: any) => t.name);
      if (names.length === 1) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    // The rows must leave the SERVED collection, not merely the table — the
    // cache bug this feature already paid for once.
    expect(names, "only the real tool remains").toEqual(["A real tool"]);

    const after = await call("GET", "/api/examples");
    expect(after.json.modules, "tools examples are gone").not.toContain("tools");
    for (const m of otherBefore) {
      expect(after.json.modules, `${m} must be untouched by tools retirement`).toContain(m);
    }
  });

  it("does not resurrect retired examples when the module is toggled off and on", async () => {
    await call("PUT", "/api/admin/modules/tools/lifecycle", { lifecycle: "off" });
    await call("PUT", "/api/admin/modules/tools/lifecycle", { lifecycle: "public" });
    const after = await call("GET", "/api/examples");
    expect(after.json.modules).not.toContain("tools");
    const [rows] = await pool.query<any[]>("SELECT COUNT(*) n FROM tools WHERE is_example = 1");
    expect(Number(rows[0].n), "a retired module stays retired").toBe(0);
  });

  it("clears examples on admin request, permanently", async () => {
    const before = await call("GET", "/api/examples");
    const target = (before.json.modules as string[]).find((m) => m !== "tools");
    if (!target) return;
    const cleared = await call("POST", `/api/admin/modules/${target}/examples/clear`);
    expect(cleared.status).toBeLessThan(400);
    const after = await call("GET", "/api/examples");
    expect(after.json.modules).not.toContain(target);
  });
});
