/**
 * The three sinks, driven over HTTP against the BUILT dist (0092).
 *
 * WHY THIS FILE EXISTS. The cycle pool paid real value in `gratitude.pool_token`
 * and nothing spent it: `git grep "from: memberAccount"` returned eight
 * postings, four of them clawbacks, and none of the four member-facing ones
 * took the pool's token. A member did the work, somebody thanked them, a moon
 * later a settlement split the pool, they received a number, and there the loop
 * ended. Gratitude itself is a ROUTING SIGNAL and is correct as it stands; the
 * defect was that the token it routes had nowhere to go.
 *
 * So this drives all three new doors through the real server, and re-proves
 * conservation after every one, because that is the property that must never
 * break:
 *
 *   1. a night booked and burned in the village's own credits
 *   2. a seat fee taken, refunded, and the refund RETRIED
 *   3. one member sending credits to another, and failing to overspend
 *
 * Plus the guard that stops the dead end coming back: the launch requirement
 * that refuses to call a fork ready while its pool token buys nothing.
 *
 * Boots the BUILT `dist/index.js` against a throwaway schema, like
 * `loop.e2e.test.ts` and `housing.routes.e2e.test.ts`. Run `pnpm build` first
 * or you are testing stale code. Skips loudly without TEST_DATABASE_URL.
 *
 * The cases run IN ORDER: modules are turned on and tokens are priced as the
 * file goes, which is itself under test. Run the whole file, never a `-t`
 * slice.
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
  // eslint-disable-next-line no-console
  console.warn("[tokenSinks.routes] TEST_DATABASE_URL not set — DB-backed tests SKIPPED.");
}

const DIST = path.resolve(process.cwd(), "dist/index.js");

/**
 * A window PROVABLY clear of every other suite that boots a server.
 *
 * RE-GREP BEFORE TRUSTING THIS. `grep -rn "process.pid %" server/` is the
 * survey; the table is only its result on the date named. Surveyed 2026-08-22,
 * the highest port any other suite can reach is 11799 (11300 + pid % 500), so a
 * base at 11800 cannot collide with any of them for ANY process id. 400 wide,
 * ending at 12199, well below the ephemeral range Windows hands out (49152+).
 */
const PORT = 11800 + (process.pid % 400);
const BASE = `http://localhost:${PORT}`;
const ADMIN = "token-sinks-admin";
/** The token 0007 seeds on every fresh fork, and `gratitude.pool_token`'s default. */
const CREDITS = "credits";

let child: ChildProcess | undefined;
let testDb: TestDb | undefined;
let dataDir = "";
let pool: mysql.Pool;
const logs: string[] = [];

let founderToken = "";
let founderId = "";
let annaToken = "";
let annaId = "";
let benToken = "";
let benId = "";
const annaEmail = () => `anna-${PORT}@example.test`;
const benEmail = () => `ben-${PORT}@example.test`;

interface Answer { status: number; json: any }

async function call(
  method: string,
  route: string,
  opts: { body?: unknown; token?: string | null } = {},
): Promise<Answer> {
  const token = opts.token === undefined ? founderToken : opts.token;
  const res = await fetch(BASE + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function register(name: string, email: string): Promise<{ token: string; id: string }> {
  const r = await call("POST", "/api/auth/register", {
    body: { name, email, password: "TokenSinks123!", paths: ["resident"] },
    token: null,
  });
  expect(r.status, `${name} must register`).toBe(200);
  return { token: String(r.json?.token ?? ""), id: String(r.json?.user?.id ?? "") };
}

/** Credits into a member's hands, the way the cycle pool issues them. */
async function mint(userId: string, amount: number): Promise<void> {
  const r = await call("POST", `/api/admin/tokens/${CREDITS}/mint`, {
    body: { toUserId: userId, amount, reason: "test float" },
  });
  expect(r.status, `mint ${amount} to ${userId}`).toBe(200);
}

async function balance(token: string, slug = CREDITS): Promise<number> {
  const r = await call("GET", "/api/wallet", { token });
  expect(r.status).toBe(200);
  return Number(r.json?.ledger?.[slug] ?? 0);
}

/**
 * THE INVARIANT, read off the server's own reconciliation route rather than
 * computed here. Reading it from the same place an admin reads it is what makes
 * a green here mean the panel is green too.
 */
async function conserves(): Promise<void> {
  const r = await call("GET", "/api/admin/ledger/reconciliation");
  expect(r.status).toBe(200);
  expect(r.json?.invariants?.problems).toEqual([]);
  expect(r.json?.invariants?.ok).toBe(true);
}

/** One launch item by id, from the same route the Journey page reads. */
async function launchItem(id: string): Promise<any> {
  const r = await call("GET", "/api/admin/launch");
  expect(r.status).toBe(200);
  return (r.json?.items ?? []).find((i: any) => i.id === id) ?? null;
}

beforeAll(async () => {
  if (!DB_CONFIGURED) return;
  if (!fs.existsSync(DIST)) {
    throw new Error(`${DIST} is missing. Run \`pnpm build\` before the token-sinks route test.`);
  }
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "village-sinks-"));
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
      AUTH_TOKEN_SECRET: "token-sinks-secret",
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
      const res = await fetch(`${BASE}/health`);
      if (res.ok) break;
    } catch { /* not up yet */ }
    await settle(400);
  }

  const boot = await call("POST", "/api/admin/bootstrap", {
    body: { password: ADMIN, email: `founder-${PORT}@example.test`, name: "Sinks Founder" },
    token: null,
  });
  const claim = decodeURIComponent(String(boot.json?.claimUrl ?? "").match(/token=([^&]+)/)?.[1] ?? "");
  expect(claim, "bootstrap must return a claim link").toBeTruthy();
  const setPw = await call("POST", "/api/auth/set-password", {
    body: { token: claim, password: "TokenSinks123!" },
    token: null,
  });
  founderToken = String(setPw.json?.token ?? "");
  founderId = String(setPw.json?.user?.id ?? "");
  expect(founderToken, "founder must hold a session").toBeTruthy();

  const anna = await register("Anna Vale", annaEmail());
  annaToken = anna.token; annaId = anna.id;
  const ben = await register("Ben Orr", benEmail());
  benToken = ben.token; benId = ben.id;
});

afterAll(async () => {
  child?.kill();
  await pool?.end();
  if (dataDir && fs.existsSync(dataDir)) fs.rmSync(dataDir, { recursive: true, force: true });
  await testDb?.drop();
});

describe.skipIf(!DB_CONFIGURED)("the pool token has somewhere to go", () => {
  it("BOOTS with the recognition token non-transferable, and refuses to open it", async () => {
    /*
     * 0006 seeded `gratitude` with transferable = 1 and nothing ever read the
     * column, so the wrong value sat there for eighty-five migrations. This
     * change reads it. The migration corrects the data and a boot invariant now
     * refuses to serve if it comes back, which is why the server being UP is
     * itself the first assertion.
     */
    const tokens = await call("GET", "/api/admin/tokens");
    expect(tokens.status).toBe(200);
    const gratitude = (tokens.json?.tokens ?? []).find((t: any) => t.slug === "gratitude");
    expect(gratitude?.transferable, "recognition is never sendable").toBeFalsy();

    // And the admin door refuses to reopen it, by KIND, with a sentence.
    const reopen = await call("PUT", "/api/admin/tokens/gratitude", { body: { transferable: true } });
    expect(reopen.status).toBe(409);
    expect(String(reopen.json?.error)).toMatch(/never sent between members/i);

    // The village's own credits ARE sendable out of the box: that is what
    // makes the loop close on a fresh fork with nobody configuring anything.
    const credits = (tokens.json?.tokens ?? []).find((t: any) => t.slug === CREDITS);
    expect(credits?.transferable).toBe(true);
    await conserves();
  });

  it("SENDS credits between two members, both sides, with a note", async () => {
    await mint(annaId, 100);
    expect(await balance(annaToken)).toBe(100);
    expect(await balance(benToken)).toBe(0);

    const sent = await call("POST", "/api/wallet/send", {
      token: annaToken,
      body: { toEmail: benEmail(), tokenType: CREDITS, amount: 30, note: "Two jars of honey", clientNonce: "n-1" },
    });
    expect(sent.status).toBe(200);
    expect(sent.json?.sent).toBe(30);
    expect(sent.json?.to).toBe("Ben Orr");

    expect(await balance(annaToken)).toBe(70);
    expect(await balance(benToken)).toBe(30);
    await conserves();

    // BOTH SIDES CAN SEE IT, and each names the OTHER person. The counterpart
    // is read off the ledger row, never off `source_ref`, which holds the same
    // id on both halves and would have told Ben he sent himself money.
    const annaLedger = await call("GET", "/api/game/ledger", { token: annaToken });
    const annaLine = (annaLedger.json?.entries ?? []).find((e: any) => e.source === "member_send");
    expect(annaLine.amount).toBe(-30);
    expect(annaLine.withName).toBe("Ben Orr");
    expect(annaLine.description).toBe("Two jars of honey");

    const benLedger = await call("GET", "/api/game/ledger", { token: benToken });
    const benLine = (benLedger.json?.entries ?? []).find((e: any) => e.source === "member_send");
    expect(benLine.amount).toBe(30);
    expect(benLine.withName).toBe("Anna Vale");
  });

  it("pays ONCE when the same send is retried on the same nonce", async () => {
    const again = await call("POST", "/api/wallet/send", {
      token: annaToken,
      body: { toEmail: benEmail(), tokenType: CREDITS, amount: 30, note: "Two jars of honey", clientNonce: "n-1" },
    });
    expect(again.status).toBe(200);
    expect(again.json?.duplicate).toBe(true);
    expect(await balance(annaToken)).toBe(70);
    expect(await balance(benToken)).toBe(30);
    await conserves();
  });

  it("REFUSES an overspend loudly, and moves nothing", async () => {
    // Only faucets go negative, and a member is not a faucet. The ledger
    // recomputes the sender's balance inside the transaction and rolls the
    // whole thing back.
    const over = await call("POST", "/api/wallet/send", {
      token: benToken,
      body: { toEmail: annaEmail(), tokenType: CREDITS, amount: 500, clientNonce: "n-over" },
    });
    expect(over.status).toBe(409);
    expect(String(over.json?.error)).toMatch(/insufficient credits/);
    expect(String(over.json?.error)).toMatch(/cannot overdraft/);
    expect(await balance(benToken)).toBe(30);
    expect(await balance(annaToken)).toBe(70);
    await conserves();
  });

  it("refuses to send recognition, a self-send, and a stranger's address", async () => {
    const recognition = await call("POST", "/api/wallet/send", {
      token: annaToken,
      body: { toEmail: benEmail(), tokenType: "gratitude", amount: 1 },
    });
    expect(recognition.status).toBe(400);
    expect(String(recognition.json?.error)).toMatch(/given, never handed over/);

    const self = await call("POST", "/api/wallet/send", {
      token: annaToken,
      body: { toEmail: annaEmail(), tokenType: CREDITS, amount: 1 },
    });
    expect(self.status).toBe(400);

    const nobody = await call("POST", "/api/wallet/send", {
      token: annaToken,
      body: { toEmail: `ghost-${PORT}@example.test`, tokenType: CREDITS, amount: 1 },
    });
    expect(nobody.status).toBe(404);

    const anon = await call("POST", "/api/wallet/send", {
      token: null,
      body: { toEmail: benEmail(), tokenType: CREDITS, amount: 1 },
    });
    expect(anon.status).toBe(401);
    await conserves();
  });

  it("BOOKS A NIGHT in village credits, and the balance moves", async () => {
    expect((await call("PUT", "/api/admin/modules/stays/lifecycle", { body: { lifecycle: "public" } })).status).toBe(200);
    const room = await call("POST", "/api/admin/stays/accommodations", {
      body: { name: `Credit Cabin ${PORT}`, description: "Priced in the village's own credits", capacity: 2 },
    });
    expect(room.status).toBe(200);
    const roomId = String(room.json?.id);

    // The room posts a nightly rate in credits. Before 0092 the route accepted
    // stay-credit and usd only, so this is the door itself under test.
    const priced = await call("PUT", `/api/admin/stays/accommodations/${roomId}/prices`, {
      body: { prices: [{ tokenType: CREDITS, audience: "guest", amountMinor: 8 }] },
    });
    expect(priced.status, "a room may post a rate in the village's credits").toBe(200);

    const req = await call("POST", "/api/stays/request", {
      token: annaToken,
      body: { accommodationId: roomId, arriveOn: new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 10) },
    });
    expect(req.status).toBe(200);
    const stayId = String(req.json?.id);

    // Activation is the snapshot moment: the rate AND the token freeze here.
    const active = await call("POST", `/api/admin/stays/${stayId}/activate`, {
      body: { tokenType: CREDITS, audience: "guest" },
    });
    expect(active.status).toBe(200);
    expect(active.json?.rateSnapshotCredits).toBe(8);
    expect(active.json?.rateSnapshotToken).toBe(CREDITS);

    const before = await balance(annaToken);
    const posted = await call("POST", "/api/admin/stays/post-nights");
    expect(posted.status).toBe(200);
    expect(posted.json?.posted, "two nights owed since arrival").toBeGreaterThanOrEqual(1);

    const after = await balance(annaToken);
    expect(after, "credits actually left her account").toBeLessThan(before);
    expect((before - after) % 8, "every night costs the snapshot rate").toBe(0);

    // The night appears, priced in the token it was activated in.
    const mine = await call("GET", "/api/stays", { token: annaToken });
    const row = (mine.json?.mine?.stays ?? []).find((s: any) => s.id === stayId);
    expect(row?.status).toBe("active");
    expect(row?.rateSnapshotToken).toBe(CREDITS);
    expect(row?.lastPostedOn).toBeTruthy();
    // Nights remaining is read against the SNAPSHOT token. Against stay
    // credits, which she holds none of, it would have said zero.
    expect(row?.nightsRemaining).toBe(Math.floor(after / 8));
    await conserves();
  });

  it("refuses to price a room in recognition, from the same door", async () => {
    const rooms = await call("GET", "/api/admin/stays");
    const roomId = String((rooms.json?.accommodations ?? []).find((a: any) => !a.isExample)?.id ?? "");
    expect(roomId).toBeTruthy();
    const bad = await call("PUT", `/api/admin/stays/accommodations/${roomId}/prices`, {
      body: { prices: [{ tokenType: "gratitude", audience: "guest", amountMinor: 5 }] },
    });
    expect(bad.status).toBe(400);
    expect(String(bad.json?.error)).toMatch(/can never be a price/);
  });

  it("RSVPs with credits, then refunds the exact amount, then a retry moves nothing", async () => {
    expect((await call("PUT", "/api/admin/modules/events/lifecycle", { body: { lifecycle: "public" } })).status).toBe(200);
    const made = await call("POST", "/api/admin/events", {
      body: {
        title: `Paid supper ${PORT}`,
        startsAt: new Date(Date.now() + 5 * 86_400_000).toISOString(),
        status: "scheduled",
        kind: "gathering",
        layer: "village",
        seatPrice: 12,
        seatToken: CREDITS,
      },
    });
    expect(made.status).toBe(200);
    const eventId = String(made.json?.event?.id ?? made.json?.id ?? "");
    expect(eventId).toBeTruthy();

    const before = await balance(annaToken);
    const going = await call("POST", `/api/events/${eventId}/rsvp`, {
      token: annaToken, body: { status: "going" },
    });
    expect(going.status).toBe(200);
    expect(going.json?.charged).toBe(12);
    expect(going.json?.tokenName).toBe("Village Credits");
    expect(await balance(annaToken)).toBe(before - 12);
    await conserves();

    // The price is on the card the member reads, not only in the charge.
    const listed = await call("GET", "/api/events", { token: annaToken });
    const card = (listed.json?.events ?? []).find((e: any) => e.id === eventId);
    expect(card?.seatPrice).toBe(12);
    expect(card?.seatTokenName).toBe("Village Credits");

    // CANCEL: the exact amount comes back.
    const cancelled = await call("DELETE", `/api/events/${eventId}/rsvp`, { token: annaToken });
    expect(cancelled.status).toBe(200);
    expect(cancelled.json?.refunded).toBe(12);
    expect(await balance(annaToken)).toBe(before);
    await conserves();

    // RETRY: nothing moves. The claim is already spent and the ledger key
    // already landed, so the second press is a no-op at both layers.
    const retry = await call("DELETE", `/api/events/${eventId}/rsvp`, { token: annaToken });
    expect(retry.status).toBe(200);
    expect(retry.json?.refunded).toBe(0);
    expect(await balance(annaToken)).toBe(before);
    await conserves();
  });

  it("refuses a seat nobody can pay for, and seats them nowhere", async () => {
    const listed = await call("GET", "/api/events", { token: benToken });
    const paid = (listed.json?.events ?? []).find((e: any) => (e.seatPrice ?? 0) > 0);
    expect(paid, "the priced gathering is on the calendar").toBeTruthy();

    // Ben holds 30 credits. Drain him to under the fee first, so the refusal
    // is about the balance and nothing else.
    const drain = await call("POST", "/api/wallet/send", {
      token: benToken,
      body: { toEmail: annaEmail(), tokenType: CREDITS, amount: 25, clientNonce: "n-drain" },
    });
    expect(drain.status).toBe(200);
    expect(await balance(benToken)).toBe(5);

    const refused = await call("POST", `/api/events/${paid.id}/rsvp`, {
      token: benToken, body: { status: "going" },
    });
    expect(refused.status).toBe(409);
    expect(refused.json?.reason).toBe("unpaid");
    expect(String(refused.json?.error)).toMatch(/12 Village Credits/);
    expect(await balance(benToken), "nothing was taken").toBe(5);

    const after = await call("GET", "/api/events", { token: benToken });
    const seat = (after.json?.events ?? []).find((e: any) => e.id === paid.id);
    expect(seat?.myRsvp ?? null, "and no seat was kept").toBeNull();
    await conserves();
  });

  it("REFUNDS everybody when the gathering is cancelled, and cancelling again refunds nobody", async () => {
    const listed = await call("GET", "/api/events", { token: annaToken });
    const paid = (listed.json?.events ?? []).find((e: any) => (e.seatPrice ?? 0) > 0);
    const before = await balance(annaToken);

    expect((await call("POST", `/api/events/${paid.id}/rsvp`, { token: annaToken, body: { status: "going" } })).status).toBe(200);
    expect(await balance(annaToken)).toBe(before - 12);

    const off = await call("PUT", `/api/admin/events/${paid.id}`, { body: { status: "cancelled" } });
    expect(off.status).toBe(200);
    expect(await balance(annaToken), "a gathering that will not happen keeps nobody's money").toBe(before);
    await conserves();

    const again = await call("PUT", `/api/admin/events/${paid.id}`, { body: { status: "cancelled" } });
    expect(again.status).toBe(200);
    expect(await balance(annaToken)).toBe(before);
    await conserves();
  });

  it("holds the LAUNCH CHECK open while the pool token buys nothing, and closes it when it does", async () => {
    /*
     * The guard that stops this returning. It reads LIVE ROWS, never module
     * lifecycles: "the stays module is on" proves nothing about whether one
     * room asks for this token, and a check written that way would report
     * healthy against the exact dead end it exists to catch.
     */
    const open = await launchItem("pool-token-spendable");
    expect(open, "the requirement is in the registry").toBeTruthy();
    expect(open.severity).toBe("blocking");
    expect(open.state, "sending is open on the village credits out of the box").toBe("ok");
    expect(String(open.detail)).toMatch(/Village Credits is spendable/);

    // Close every door and watch it go red. Sending is the last one, so
    // closing it is what takes the surface count to zero.
    const rooms = await call("GET", "/api/admin/stays");
    for (const a of rooms.json?.accommodations ?? []) {
      if (a.isExample) continue;
      await call("PUT", `/api/admin/stays/accommodations/${a.id}/prices`, { body: { prices: [] } });
    }
    const events = await call("GET", "/api/admin/events");
    for (const e of events.json?.events ?? []) {
      if ((e.seatPrice ?? 0) > 0) {
        await call("PUT", `/api/admin/events/${e.id}`, { body: { seatPrice: 0, seatToken: null } });
      }
    }
    expect((await call("PUT", `/api/admin/tokens/${CREDITS}`, { body: { transferable: false } })).status).toBe(200);

    const shut = await launchItem("pool-token-spendable");
    expect(shut.state, "a pool paying a token nothing accepts is not launch-ready").toBe("missing");
    expect(String(shut.detail)).toMatch(/nothing accepts it/);

    // And opening ONE door again is enough, which is the honest bar: a village
    // needs somewhere for the value to go, not every somewhere.
    expect((await call("PUT", `/api/admin/tokens/${CREDITS}`, { body: { transferable: true } })).status).toBe(200);
    const reopened = await launchItem("pool-token-spendable");
    expect(reopened.state).toBe("ok");
    await conserves();
  });

  it("says the pool is fine when the village turned distribution off", async () => {
    // A pool of zero is a village choosing to let recognition stay a signal on
    // its own. That is a decision, not a dead end, and the check says so.
    expect((await call("PUT", `/api/admin/tokens/${CREDITS}`, { body: { transferable: false } })).status).toBe(200);
    expect((await call("PUT", "/api/admin/variables/gratitude.pool_per_cycle", { body: { value: "0" } })).status).toBe(200);
    const zeroed = await launchItem("pool-token-spendable");
    expect(zeroed.state).toBe("ok");
    expect(String(zeroed.detail)).toMatch(/signal on its own/);

    // Put the village back the way a fork ships.
    expect((await call("PUT", "/api/admin/variables/gratitude.pool_per_cycle", { body: { value: "1000" } })).status).toBe(200);
    expect((await call("PUT", `/api/admin/tokens/${CREDITS}`, { body: { transferable: true } })).status).toBe(200);
    await conserves();
  });
});
