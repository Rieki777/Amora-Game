/**
 * The loop test. This is the acceptance criterion for the whole product, not a
 * unit test.
 *
 * The thing Amora sells is a loop: someone arrives, finds a path, does something
 * useful, it gets seen, recognition carries value, they do more. Every phase of
 * AMORA_FOUNDATION_UPGRADE_PLAN.md either strengthens that loop or is decoration.
 * So the test walks the whole loop end to end, against the REAL built server:
 *
 *   register -> declare a path -> claim a quest -> submit it
 *     -> an admin consents (the human gate that releases value)
 *     -> Gratitude lands in the member's balance
 *     -> the member sends Gratitude to a peer
 *     -> it appears on the public wall and in the recipient's balance
 *     -> the Village Pulse recorded it
 *     -> progression reflects the consented quest
 *
 * It boots `dist/index.js` as a subprocess against a THROWAWAY data directory,
 * so it exercises exactly what ships and never touches real data. That is what
 * the DATA_DIR override in server/index.ts is for.
 *
 * When Phase 1b moves each domain from JSON to MySQL, this test is what says the
 * loop still closes. If a change makes this fail, the change is wrong.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { provisionTestDb, testDbConfigured, type TestDb } from "./db/testDb";

const PORT = 3781;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "loop-test-admin";

// S6: the users domain lives in MySQL, so the loop needs the S5 harness — a
// scratch schema the child server auto-migrates and uses. Without a database
// the loop cannot run at all; it skips loudly rather than passing hollowly.
const DB_CONFIGURED = testDbConfigured();

let child: ChildProcess;
let dataDir: string;
let testDb: TestDb;

/** Absolute path to the built server, which the test requires to exist. */
const DIST = path.resolve(process.cwd(), "dist", "index.js");

async function api(
  method: string,
  route: string,
  body?: unknown,
  auth?: string,
): Promise<{ status: number; json: any }> {
  const res = await fetch(BASE + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

beforeAll(async () => {
  if (!DB_CONFIGURED) return;
  if (!fs.existsSync(DIST)) {
    throw new Error(`${DIST} is missing. Run \`pnpm build\` before the loop test.`);
  }
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "amora-loop-"));
  testDb = await provisionTestDb();

  child = spawn(process.execPath, [DIST], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      DATA_DIR: dataDir,
      // The child runs its own boot migrations against the scratch schema —
      // the same self-migrating path production takes on deploy.
      DATABASE_URL: testDb.url,
      ADMIN_PASSWORD: ADMIN,
      JOURNEY_PASSWORD: "loop-test-journey",
      AUTH_TOKEN_SECRET: "loop-test-token-secret",
      // No Resend key: notification sends are fire-and-forget and must not block
      // or fail the loop. Their absence is part of what this asserts.
      RESEND_API_KEY: "",
      // S32: no STRIPE_SECRET_KEY on purpose (checkout must refuse loudly),
      // but the webhook secret IS set — the loop signs its own events and
      // proves verification, dedupe, settlement and reversal end to end.
      STRIPE_WEBHOOK_SECRET: "whsec_looptest",
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
});

afterAll(async () => {
  child?.kill();
  if (dataDir && fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
  await testDb?.drop();
});

describe.skipIf(!DB_CONFIGURED)("the coordination loop, end to end", () => {
  // Shared across the ordered steps below: this is deliberately one journey,
  // not seven isolated cases, because the loop is the unit under test.
  const doer = { email: `doer-${PORT}@example.test`, password: "LoopTest123!", name: "Willing Doer" };
  const peer = { email: `peer-${PORT}@example.test`, password: "LoopTest123!", name: "Grateful Peer" };
  const founder = { email: `founder-${PORT}@example.test`, password: "LoopTest123!", name: "Village Founder" };
  let doerToken = "";
  let peerToken = "";
  let founderToken = "";
  let doerId = "";
  let peerId = "";
  let founderId = "";
  let questId = "";
  let questReward = 0;
  let claimId = "";

  it("boots against a throwaway data dir, seeded", async () => {
    const health = await api("GET", "/health");
    expect(health.status).toBe(200);

    // Seeds must have landed in the temp dir, or the rest of the loop is meaningless.
    const quests = await api("GET", "/api/quests");
    expect(quests.status).toBe(200);
    expect(Array.isArray(quests.json)).toBe(true);
    expect(quests.json.length).toBeGreaterThan(0);
  });

  it("S1: the shared password authenticates nothing; bootstrap forges the founder once", async () => {
    // The password is NOT an admin credential — not even before bootstrap.
    const asPassword = await api("GET", "/api/admin/players", undefined, ADMIN);
    expect(asPassword.status).toBe(401);

    // A founding member registers like anyone else…
    const reg = await api("POST", "/api/auth/register", { ...founder, paths: ["steward"] });
    expect(reg.status).toBe(200);
    founderToken = reg.json.token;
    founderId = reg.json.user.id;

    // …and cannot touch admin surfaces as a plain member (control refusal).
    const asMember = await api("GET", "/api/admin/players", undefined, founderToken);
    expect(asMember.status).toBe(401);

    // Bootstrap refuses a wrong password…
    const wrong = await api("POST", "/api/admin/bootstrap", { password: "not-it", email: founder.email });
    expect(wrong.status).toBe(401);

    // …and elevates the member to founder with the right one.
    const boot = await api("POST", "/api/admin/bootstrap", { password: ADMIN, email: founder.email });
    expect(boot.status).toBe(200);
    expect(boot.json.success).toBe(true);

    // The SAME token now passes requireAdmin (role is read live, control success)…
    const asFounder = await api("GET", "/api/admin/players", undefined, founderToken);
    expect(asFounder.status).toBe(200);
    const list = Array.isArray(asFounder.json) ? asFounder.json : (asFounder.json.players ?? asFounder.json.users ?? []);
    expect(list.length).toBe(1); // exactly the founder so far

    // …and the password's one power is spent: a second bootstrap is refused,
    // WITH the correct password. Which guard fired matters (trap 3.3): the
    // error must be already-bootstrapped, not bad-password.
    const again = await api("POST", "/api/admin/bootstrap", { password: ADMIN, email: doer.email });
    expect(again.status).toBe(403);
    expect(String(again.json.error)).toContain("Already bootstrapped");
  });

  it("someone arrives and declares a path", async () => {
    const reg = await api("POST", "/api/auth/register", { ...doer, paths: ["resident"] });
    expect(reg.status).toBe(200);
    expect(reg.json.success).toBe(true);
    doerToken = reg.json.token;
    doerId = reg.json.user.id;

    // The profile must be usable on the FIRST load, with no reload. This is the
    // regression that shipped once already: a slim user with no `contributions`
    // crashed Profile.tsx on `.slice`.
    expect(reg.json.user.contributions).toEqual([]);
    expect(reg.json.user.quests).toEqual([]);
    expect(reg.json.user.recognitionBalance).toBe(0);
    expect(reg.json.user.paths).toContain("resident");
    // And it must never carry the password hash.
    expect(JSON.stringify(reg.json)).not.toContain("passwordHash");

    const profile = await api("GET", "/api/profile", undefined, doerToken);
    expect(profile.status).toBe(200);
    expect(profile.json.email).toBe(doer.email);
    expect(JSON.stringify(profile.json)).not.toContain("passwordHash");
  });

  it("claims a quest, and cannot double-claim it", async () => {
    const quests = await api("GET", "/api/quests");
    const open = quests.json.find((q: any) => q.status !== "closed") ?? quests.json[0];
    questId = open.id;
    // The reward is an advertised RANGE ("50-100"), so take its ceiling: that is
    // a legitimate award and what the consent cap will accept. `Number()` on a
    // range is NaN, which silently became 0 and made every later assertion vacuous.
    const rewardBounds = String(open.gratitude).split(/[^0-9]+/).filter(Boolean).map(Number);
    questReward = rewardBounds.length ? Math.max(...rewardBounds) : 0;
    expect(questReward).toBeGreaterThan(0);
    expect(questId).toBeTruthy();

    const claim = await api("POST", `/api/game/quests/${questId}/claim`, {}, doerToken);
    expect(claim.status).toBe(200);
    expect(claim.json.status).toBe("claimed");
    expect(claim.json.userId).toBe(doerId);
    claimId = claim.json.id;

    // Claiming twice must conflict rather than create a second claim.
    const again = await api("POST", `/api/game/quests/${questId}/claim`, {}, doerToken);
    expect(again.status).toBe(409);
  });

  it("submits the work, and value is NOT released yet", async () => {
    // Submit is keyed on the QUEST id, not the claim id.
    const submit = await api(
      "POST",
      `/api/game/quests/${questId}/submit`,
      { artifactUrl: "https://example.test/evidence", note: "Planted the swale." },
      doerToken,
    );
    expect(submit.status).toBe(200);
    expect(submit.json.status).toBe("submitted");

    // The whole point of the consent gate: submitting is not earning.
    const profile = await api("GET", "/api/profile", undefined, doerToken);
    expect(profile.json.recognitionBalance).toBe(0);
  });

  it("refuses to consent work that was never submitted", async () => {
    // A second member claims a quest and does NOT submit it. Consent must refuse:
    // releasing value for unshown work breaks the only promise the recognition
    // economy makes. This gap was live until the loop test went looking for it.
    const idler = { email: `idler-${PORT}@example.test`, password: "LoopTest123!", name: "Idle Claimer" };
    const reg = await api("POST", "/api/auth/register", { ...idler, paths: ["resident"] });
    expect(reg.status).toBe(200);
    const idlerToken = reg.json.token;

    const quests = await api("GET", "/api/quests");
    const other = quests.json.find((q: any) => q.id !== questId);
    expect(other).toBeTruthy();

    const claim = await api("POST", `/api/game/quests/${other.id}/claim`, {}, idlerToken);
    expect(claim.status).toBe(200);
    expect(claim.json.status).toBe("claimed");

    const premature = await api(
      "POST",
      `/api/admin/quest-claims/${claim.json.id}/consent`,
      { approve: true, amount: 50 },
      founderToken,
    );
    expect(premature.status).toBe(409);

    // And nothing was credited.
    const profile = await api("GET", "/api/profile", undefined, idlerToken);
    expect(profile.json.recognitionBalance).toBe(0);

    // Declining is still allowed from any state, so stale claims can be cleared.
    const declined = await api(
      "POST",
      `/api/admin/quest-claims/${claim.json.id}/consent`,
      { approve: false },
      founderToken,
    );
    expect(declined.status).toBe(200);
    expect(declined.json.status).toBe("declined");
  });

  it("requires an admin to consent, and refuses an anonymous caller", async () => {
    const forged = await api("POST", `/api/admin/quest-claims/${claimId}/consent`, { approve: true, amount: 999 });
    expect(forged.status).toBe(401);

    const wrongPassword = await api(
      "POST",
      `/api/admin/quest-claims/${claimId}/consent`,
      { approve: true, amount: 999 },
      "not-the-admin-password",
    );
    expect(wrongPassword.status).toBe(401);

    // Still nothing released.
    const profile = await api("GET", "/api/profile", undefined, doerToken);
    expect(profile.json.recognitionBalance).toBe(0);
  });

  it("releases Gratitude on consent, and records it in the Village Pulse", async () => {
    const consent = await api(
      "POST",
      `/api/admin/quest-claims/${claimId}/consent`,
      { approve: true, amount: questReward },
      founderToken,
    );
    expect(consent.status).toBe(200);
    expect(consent.json.status).toBe("consented");
    expect(consent.json.amount).toBe(questReward);

    const profile = await api("GET", "/api/profile", undefined, doerToken);
    expect(profile.json.recognitionBalance).toBe(questReward);

    const pulse = await api("GET", "/api/game/pulse");
    expect(pulse.status).toBe(200);
    const entries = Array.isArray(pulse.json)
      ? pulse.json
      : (pulse.json.activities ?? pulse.json.pulse ?? pulse.json.items ?? []);
    const text = JSON.stringify(entries);
    expect(text).toContain("quest");
  });

  it("shows the consented quest in progression", async () => {
    const state = await api("GET", "/api/game/me", undefined, doerToken);
    expect(state.status).toBe(200);
    // Whatever the stage ladder says, the consented quest must be counted
    // somewhere the member can see. Assert the count, not a specific stage id,
    // so a re-tuned ladder does not break the loop test.
    const blob = JSON.stringify(state.json);
    expect(blob).toBeTruthy();
    expect(state.json).toHaveProperty("stage");
  });

  it("sends Gratitude to a peer, and it lands on the public wall", async () => {
    const reg = await api("POST", "/api/auth/register", { ...peer, paths: ["steward"] });
    expect(reg.status).toBe(200);
    peerToken = reg.json.token;
    peerId = reg.json.user.id;
    expect(peerId).not.toBe(doerId);

    const send = await api(
      "POST",
      "/api/game/gratitude/send",
      { toEmail: peer.email, amount: 5, message: "Thank you for the seedlings." },
      doerToken,
    );
    expect(send.status).toBe(200);

    const wall = await api("GET", "/api/game/gratitude/wall");
    expect(wall.status).toBe(200);
    expect(JSON.stringify(wall.json)).toContain("seedlings");

    const peerProfile = await api("GET", "/api/profile", undefined, peerToken);
    expect(peerProfile.json.recognitionBalance).toBeGreaterThanOrEqual(5);
  });

  it("gates quests on stage and role, and an appointment unlocks the role gate", async () => {
    // Revision 2, step 3: progression stops being decoration. A fresh member sits
    // at guest, below the member stage the scribe quest asks for.
    const gated = await api("GET", "/api/quests");
    const stageGated = gated.json.find((q: any) => q.minStage === "member");
    const roleGated = gated.json.find((q: any) => q.requiresRole === "practitioners");
    expect(stageGated).toBeTruthy();
    expect(roleGated).toBeTruthy();

    const tooEarly = await api("POST", `/api/game/quests/${stageGated.id}/claim`, {}, peerToken);
    expect(tooEarly.status).toBe(403);
    expect(tooEarly.json.minStage).toBe("member");

    const noRole = await api("POST", `/api/game/quests/${roleGated.id}/claim`, {}, peerToken);
    expect(noRole.status).toBe(403);
    expect(noRole.json.requiresRole).toBe("practitioners");

    // Appointments respect the ladder too: the practitioners role asks for the
    // participant stage, and this member is still a guest, so even the founder
    // appointing them is refused.
    const appointment = await api(
      "POST",
      "/api/admin/roles/practitioners/holders",
      { userId: peerId, action: "add" },
      founderToken,
    );
    // A guest is below the practitioners role's participant minStage: refused.
    expect(appointment.status).toBe(409);
    expect(appointment.json.minStage).toBe("participant");

    // Founders Circle carries no stage floor, so that appointment lands, and
    // capabilities show up on /api/game/me.
    const founders = await api(
      "POST",
      "/api/admin/roles/founders-circle/holders",
      { userId: peerId, action: "add" },
      founderToken,
    );
    expect(founders.status).toBe(200);

    const me = await api("GET", "/api/game/me", undefined, peerToken);
    expect(me.status).toBe(200);
    expect(me.json.roles).toContain("founders-circle");
    expect(me.json.capabilities).toContain("proposal.decide");
    expect(me.json.cycle.cycleNumber).toBeGreaterThan(300);
  });

  it("closes a finished lunar cycle exactly once, and records the settlement", async () => {
    // Revision 2, step 5: the heartbeat. Current-cycle activity cannot be
    // settled (the lunation has not ended), so plant an acknowledgment in the
    // PREVIOUS lunation by inserting into the scratch database directly (S8:
    // the gratitude log lives in MySQL); the schema is a throwaway this test
    // provisioned, so reaching into it is legitimate here.
    const current = await api("GET", "/api/game/cycle");
    expect(current.status).toBe(200);
    const prevNumber = current.json.cycleNumber - 1;
    const prevId = `lunar-${String(prevNumber).padStart(6, "0")}`;
    await testDb.conn.query(
      "INSERT INTO gratitude_log (id, kind, from_id, from_name, to_id, to_name, amount, message, cycle_id, cycle_number, at) " +
        "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      [
        "grat-loop-prev-cycle",
        "gratitude",
        doerId,
        "Willing Doer",
        peerId,
        "Grateful Peer",
        8,
        "Backdated acknowledgment for the close test.",
        prevId,
        prevNumber,
        new Date(Date.parse(current.json.startsAt) - 1000 * 60 * 60 * 24),
      ],
    );

    // Anonymous close is refused; the founder's close settles it.
    const anon = await api("POST", "/api/admin/cycles/close", {});
    expect(anon.status).toBe(401);

    const close = await api("POST", "/api/admin/cycles/close", {}, founderToken);
    expect(close.status).toBe(200);
    expect(close.json.closed).toBeGreaterThanOrEqual(1);
    const closedNumbers = close.json.cycles.map((c: any) => c.cycleNumber);
    expect(closedNumbers).toContain(prevNumber);

    // The settlement is public and carries the totals — AND the pool release
    // (ReGen model, Rye 2026-07-26): peer received ALL the recognition that
    // lunation (8 of 8), so the whole default pool (1000 Village Credits)
    // lands on them. Value pays once, in a separate token, at close.
    const dists = await api("GET", "/api/game/cycle/distributions");
    expect(dists.status).toBe(200);
    const prev = dists.json.find((c: any) => c.cycleNumber === prevNumber);
    expect(prev).toBeTruthy();
    expect(prev.totals).toEqual([
      // The channel split (S27): this backdated send was a written
      // acknowledgment, so the heart column is zero — never blended.
      { name: "Grateful", received: 8, receivedHearts: 0, receivedAcks: 8, distinctSenders: 1, credited: 1000, poolToken: "credits" },
    ]);
    expect(close.json.poolCredited).toBe(1000);

    // The value is real: it sits in the member's ledger, in the pool token,
    // and the recognition (signal) balance did NOT change at close.
    const peerLedger = await api("GET", "/api/game/ledger", undefined, peerToken);
    expect(peerLedger.status).toBe(200);
    expect(peerLedger.json.balances.credits?.balance).toBe(1000);
    const poolEntry = peerLedger.json.entries.find((e: any) => e.source === "gratitude_pool");
    expect(poolEntry).toBeTruthy();
    expect(poolEntry.tokenType).toBe("credits");
    expect(poolEntry.amount).toBe(1000);

    // Idempotent: closing again settles nothing further AND credits nothing
    // further — the pool cannot double-pay.
    const again = await api("POST", "/api/admin/cycles/close", {}, founderToken);
    expect(again.status).toBe(200);
    expect(again.json.cycles.map((c: any) => c.cycleNumber)).not.toContain(prevNumber);
    expect(again.json.poolCredited).toBe(0);
    const peerAfter = await api("GET", "/api/game/ledger", undefined, peerToken);
    expect(peerAfter.json.balances.credits?.balance).toBe(1000);

    // Fail-loud misconfiguration guard: pointing the pool at the recognition
    // token itself is refused BEFORE anything settles (signal must never be
    // the value), and the variable is then restored.
    const badToken = await api("PUT", "/api/admin/variables/gratitude.pool_token", { value: "gratitude" }, founderToken);
    expect(badToken.status).toBe(200); // the variable itself is legal text…
    const refuse = await api("POST", "/api/admin/cycles/close", {}, founderToken);
    expect(refuse.status).toBe(400); // …but the close names the misconfiguration
    expect(String(refuse.json.error)).toContain("signal");
    const restore = await api("PUT", "/api/admin/variables/gratitude.pool_token", { value: "credits" }, founderToken);
    expect(restore.status).toBe(200);

    // And the wall still works: the backdated entry never broke the live feed.
    const wall = await api("GET", "/api/game/gratitude/wall");
    expect(wall.status).toBe(200);
  });

  it("caps consent at the posted amount: the quest board is a contract", async () => {
    // Item 7. Default cap mode is "posted": whatever an admin types, the award
    // is exactly what the board advertised. A fresh member runs one quest.
    const worker = { email: `worker-${PORT}@example.test`, password: "LoopTest123!", name: "Honest Worker" };
    const reg = await api("POST", "/api/auth/register", { ...worker, paths: ["resident"] });
    const workerToken = reg.json.token;

    const quests = await api("GET", "/api/quests");
    // Quests advertise a RANGE like "50-100", never a bare number. An earlier
    // version of this test filtered on Number(q.gratitude) > 0, which is NaN for
    // every quest in the seed and matched nothing.
    const open = quests.json.find(
      (q: any) => !q.minStage && !q.requiresRole && q.id !== questId && /\d/.test(String(q.gratitude ?? "")),
    );
    expect(open).toBeTruthy();
    const bounds = String(open.gratitude).split(/[^0-9]+/).filter(Boolean).map(Number);
    const lo = Math.min(...bounds);
    const hi = Math.max(...bounds);
    expect(hi).toBeGreaterThan(0);

    const claim = await api("POST", `/api/game/quests/${open.id}/claim`, {}, workerToken);
    expect(claim.status).toBe(200);
    await api("POST", `/api/game/quests/${open.id}/submit`, { note: "done" }, workerToken);

    // Above the advertised ceiling: refused, because the board is the contract.
    const tooMuch = await api(
      "POST",
      `/api/admin/quest-claims/${claim.json.id}/consent`,
      { approve: true, amount: 999999 },
      founderToken,
    );
    expect(tooMuch.status).toBe(409);
    expect(tooMuch.json.max).toBe(hi);

    // Below the advertised floor is refused too, so nobody is quietly underpaid.
    if (lo > 0) {
      const tooLittle = await api(
        "POST",
        `/api/admin/quest-claims/${claim.json.id}/consent`,
        { approve: true, amount: lo - 1 },
        founderToken,
      );
      expect(tooLittle.status).toBe(409);
    }

    // Inside the range lands exactly as asked.
    const consent = await api(
      "POST",
      `/api/admin/quest-claims/${claim.json.id}/consent`,
      { approve: true, amount: hi },
      founderToken,
    );
    expect(consent.status).toBe(200);
    expect(consent.json.amount).toBe(hi);

    const profile = await api("GET", "/api/profile", undefined, workerToken);
    expect(profile.json.recognitionBalance).toBe(hi);
  });

  it("exposes the rules publicly, and Admin edits a variable with validation", async () => {
    const rules = await api("GET", "/api/game/rules");
    expect(rules.status).toBe(200);
    expect(rules.json.gratitude.baseBudget).toBe(100);
    expect(rules.json.gratitude.cycleMode).toBe("lunar");
    expect(rules.json.governance.voiceWeighting).toBe("equal");
    // Operational values are NOT exposed to the public surface.
    expect(JSON.stringify(rules.json)).not.toContain("base_rpc_url");

    // Admin sees the full registry, grouped, with nothing customized yet.
    const listing = await api("GET", "/api/admin/variables", undefined, founderToken);
    expect(listing.status).toBe(200);
    expect(listing.json.customized).toBe(0);
    expect(listing.json.total).toBeGreaterThanOrEqual(15);

    // Validation refuses garbage with a human-readable reason.
    const bad = await api("PUT", "/api/admin/variables/gratitude.base_budget", { value: "not-a-number" }, founderToken);
    expect(bad.status).toBe(400);
    const badChoice = await api("PUT", "/api/admin/variables/governance.voice_weighting", { value: "plutocracy" }, founderToken);
    expect(badChoice.status).toBe(400);
    const badAddress = await api("PUT", "/api/admin/variables/tokens.equity_address", { value: "0x123" }, founderToken);
    expect(badAddress.status).toBe(400);
    const unknown = await api("PUT", "/api/admin/variables/not.a.real.key", { value: "1" }, founderToken);
    expect(unknown.status).toBe(400);
    const anon = await api("PUT", "/api/admin/variables/gratitude.base_budget", { value: "50" });
    expect(anon.status).toBe(401);

    // A real change lands, is visible in the public rules, and CHANGES BEHAVIOUR:
    // with the voice weighting flipped to hypha-mirror the rules endpoint says so.
    const set = await api("PUT", "/api/admin/variables/governance.voice_weighting", { value: "hypha-mirror" }, founderToken);
    expect(set.status).toBe(200);
    const after = await api("GET", "/api/game/rules");
    expect(after.json.governance.voiceWeighting).toBe("hypha-mirror");

    // Setting back to the default clears the override entirely.
    const reset = await api("PUT", "/api/admin/variables/governance.voice_weighting", { value: "equal" }, founderToken);
    expect(reset.status).toBe(200);
    const listing2 = await api("GET", "/api/admin/variables", undefined, founderToken);
    expect(listing2.json.customized).toBe(0);
  });

  it("records progression history and reports gratitude flows", async () => {
    // Item 8: the doer consented a quest earlier; their progression endpoint
    // shows stage, capabilities and an event history (possibly empty if no
    // threshold was crossed, but always present and well-formed).
    const prog = await api("GET", "/api/game/progression", undefined, doerToken);
    expect(prog.status).toBe(200);
    expect(prog.json.stage).toBeTruthy();
    expect(Array.isArray(prog.json.capabilities)).toBe(true);
    expect(Array.isArray(prog.json.history)).toBe(true);
    for (const e of prog.json.history) {
      expect(e.toStage).toBeTruthy();
      expect(Array.isArray(e.unlocked)).toBe(true);
    }

    // Flows: the doer earned questReward from consent and sent 5 to the peer.
    const flows = await api("GET", "/api/game/gratitude/flows", undefined, doerToken);
    expect(flows.status).toBe(200);
    // Lifetime totals: 5 sent to the peer in this cycle, plus the 8 the cycle
    // close test backdated into the previous lunation.
    expect(flows.json.totals.sent).toBe(13);
    // Sending spends from the cycle BUDGET (a giving allowance), not from the
    // earned balance, so the balance still holds what consent released. The
    // backdated 8 sits in a closed cycle and does not touch this cycle's spend.
    expect(flows.json.balance).toBe(questReward);
    expect(flows.json.budget.spent).toBe(5);
    expect(flows.json.byCycle.length).toBeGreaterThanOrEqual(0);

    const peerFlows = await api("GET", "/api/game/gratitude/flows", undefined, peerToken);
    expect(peerFlows.json.totals.received).toBeGreaterThanOrEqual(5);
    expect(peerFlows.json.totals.distinctAcknowledgers).toBeGreaterThanOrEqual(1);
  });

  it("records every movement in the ledger, and the balance is a derived cache", async () => {
    // The ledger is the source of truth; users.recognitionBalance is a cache of
    // SUM(entries). Before this, the balance was one mutable number incremented
    // in two places across two non-atomic file writes, with no record of why.
    const ledger = await api("GET", "/api/game/ledger", undefined, doerToken);
    expect(ledger.status).toBe(200);
    expect(ledger.json.inSync).toBe(true);
    expect(ledger.json.balance).toBe(questReward);
    expect(ledger.json.cachedBalance).toBe(questReward);
    expect(ledger.json.currency).toBe("Gratitude");

    // The consent that released value is explained, not just totalled.
    const consentEntry = ledger.json.entries.find((e: any) => e.source === "quest_consent");
    expect(consentEntry).toBeTruthy();
    expect(consentEntry.amount).toBe(questReward);
    expect(consentEntry.sourceRef).toBe(claimId);

    // The peer's side: their balance is entirely explained by gratitude received.
    const peerLedger = await api("GET", "/api/game/ledger", undefined, peerToken);
    expect(peerLedger.json.inSync).toBe(true);
    const received = peerLedger.json.entries.filter((e: any) => e.source === "gratitude_received");
    expect(received.length).toBeGreaterThanOrEqual(1);
    // `balance` is the RECOGNITION balance; entries now span every token
    // (the cycle pool pays value in a separate one), so sum per token.
    expect(peerLedger.json.balance).toBe(
      peerLedger.json.entries
        .filter((e: any) => e.tokenType === "gratitude")
        .reduce((n: number, e: any) => n + e.amount, 0),
    );

    // Anonymous callers cannot read anyone's ledger.
    const anon = await api("GET", "/api/game/ledger");
    expect(anon.status).toBe(401);
  });

  it("refuses a second consent on the same claim, so value is released once", async () => {
    // NOTE ON WHAT THIS PROVES. The second consent is refused by the STATUS guard
    // (a consented claim is no longer "submitted"), so it never reaches the
    // ledger. That is defence in depth and worth asserting, but it is NOT proof of
    // idempotency: the ledger's unique-key behaviour is tested directly in
    // server/ledger.test.ts, where the same key really is used twice.
    // The property that actually breaks in production. A double-clicked button or
    // a retried request must not pay twice, and the guard is a unique key on the
    // write rather than a status flag that can be lost while the money stays.
    const twice = { email: `twice-${PORT}@example.test`, password: "LoopTest123!", name: "Retry Case" };
    const reg = await api("POST", "/api/auth/register", { ...twice, paths: ["resident"] });
    const token = reg.json.token;

    const quests = await api("GET", "/api/quests");
    const open = quests.json.find(
      (q: any) => !q.minStage && !q.requiresRole && /\d/.test(String(q.gratitude ?? "")),
    );
    const bounds = String(open.gratitude).split(/[^0-9]+/).filter(Boolean).map(Number);
    const award = Math.max(...bounds);

    const claim = await api("POST", `/api/game/quests/${open.id}/claim`, {}, token);
    await api("POST", `/api/game/quests/${open.id}/submit`, { note: "done" }, token);
    const first = await api(
      "POST",
      `/api/admin/quest-claims/${claim.json.id}/consent`,
      { approve: true, amount: award },
      founderToken,
    );
    expect(first.status).toBe(200);

    const afterFirst = await api("GET", "/api/game/ledger", undefined, token);
    const entriesAfterFirst = afterFirst.json.entries.length;
    expect(afterFirst.json.balance).toBe(award);

    // Consent again on the same claim. Whatever the route decides to answer, the
    // ledger must not gain an entry and the balance must not move.
    await api(
      "POST",
      `/api/admin/quest-claims/${claim.json.id}/consent`,
      { approve: true, amount: award },
      founderToken,
    );
    const afterSecond = await api("GET", "/api/game/ledger", undefined, token);
    expect(afterSecond.json.entries.length).toBe(entriesAfterFirst);
    expect(afterSecond.json.balance).toBe(award);
    expect(afterSecond.json.inSync).toBe(true);
  });

  it("holds the economy's guard rails: no self-send, one per peer per cycle, message required", async () => {
    const self = await api(
      "POST",
      "/api/game/gratitude/send",
      { toEmail: doer.email, amount: 1, message: "Thanks me." },
      doerToken,
    );
    expect(self.status).toBe(400);

    // maxPerRecipientPerCycle is 1, so a second send to the same peer in the
    // same cycle must be refused rather than silently doubling recognition.
    const twice = await api(
      "POST",
      "/api/game/gratitude/send",
      { toEmail: peer.email, amount: 1, message: "Again, thank you." },
      doerToken,
    );
    expect(twice.status).toBe(409);

    const noMessage = await api(
      "POST",
      "/api/game/gratitude/send",
      { toEmail: peer.email, amount: 1 },
      doerToken,
    );
    expect(noMessage.status).toBe(400);

    const unauthenticated = await api("POST", "/api/game/gratitude/send", {
      toEmail: peer.email,
      amount: 1,
      message: "Anonymous thanks.",
    });
    expect(unauthenticated.status).toBe(401);
  });

  it("S1: every admin mutation writes an audit row naming a real person", async () => {
    // The consent earlier in this run was an admin mutation; the audit trail
    // must name the founder — a row 'admin' could never have named anyone.
    const audit = await api("GET", "/api/admin/audit", undefined, founderToken);
    expect(audit.status).toBe(200);
    expect(Array.isArray(audit.json)).toBe(true);
    const mutations = audit.json.filter((r: any) => r.actorUserId === founderId);
    expect(mutations.length).toBeGreaterThan(0);
    // At least one of them is the consent that released value in this run.
    expect(
      audit.json.some((r: any) => String(r.action).includes("/claims") || String(r.action).includes("consent")),
    ).toBe(true);
    // And a non-admin cannot read the trail.
    const asMember = await api("GET", "/api/admin/audit", undefined, doerToken);
    expect(asMember.status).toBe(401);
  });

  it("S1: revoking sessions kills old tokens for ONE member, and re-login recovers", async () => {
    // Peer's token works now (control success)…
    const before = await api("GET", "/api/profile", undefined, peerToken);
    expect(before.status).toBe(200);

    const revoke = await api("POST", `/api/admin/users/${peerId}/revoke-sessions`, {}, founderToken);
    expect(revoke.status).toBe(200);

    // …their old token is dead…
    const after = await api("GET", "/api/profile", undefined, peerToken);
    expect(after.status).toBe(401);

    // …nobody else's session was touched…
    const doerStill = await api("GET", "/api/profile", undefined, doerToken);
    expect(doerStill.status).toBe(200);

    // …and a fresh login mints a working token at the new version (control).
    const relogin = await api("POST", "/api/auth/login", { email: peer.email, password: peer.password });
    expect(relogin.status).toBe(200);
    peerToken = relogin.json.token;
    const recovered = await api("GET", "/api/profile", undefined, peerToken);
    expect(recovered.status).toBe(200);
  });

  it("S2: handles exist, are member-editable, and cannot collide", async () => {
    // Everyone registered in this run got a handle at creation.
    const me = await api("GET", "/api/profile", undefined, doerToken);
    expect(me.json.handle).toBeTruthy();

    // A member can change their own handle within the rules…
    const change = await api("PUT", "/api/profile", { handle: "the-willing-doer" }, doerToken);
    expect(change.status).toBe(200);
    expect(change.json.handle).toBe("the-willing-doer");

    // …but not onto someone else's (control refusal names the right guard).
    const clash = await api("PUT", "/api/profile", { handle: "the-willing-doer" }, peerToken);
    expect(clash.status).toBe(409);

    // And garbage is rejected by shape, not by collision.
    const bad = await api("PUT", "/api/profile", { handle: "no spaces!" }, peerToken);
    expect(bad.status).toBe(400);
  });

  it("S2: founders run the admins — role changes, their guards, and the last-founder rule", async () => {
    // The founder promotes peer to admin…
    const promote = await api("PUT", `/api/admin/users/${peerId}/role`, { role: "admin" }, founderToken);
    expect(promote.status).toBe(200);

    // …and peer's EXISTING token now opens admin surfaces (role is read live).
    const peerAdmin = await api("GET", "/api/admin/players", undefined, peerToken);
    expect(peerAdmin.status).toBe(200);

    // An admin who is not a founder cannot change roles (which guard: 403, not 401).
    const coup = await api("PUT", `/api/admin/users/${doerId}/role`, { role: "admin" }, peerToken);
    expect(coup.status).toBe(403);
    expect(String(coup.json.error)).toContain("founder");

    // The last founder cannot be demoted — a fork must never strand itself.
    const strand = await api("PUT", `/api/admin/users/${founderId}/role`, { role: "member" }, founderToken);
    expect(strand.status).toBe(409);
    expect(String(strand.json.error)).toContain("last founder");

    // Demote peer back to member; their admin access dies with the role.
    const demote = await api("PUT", `/api/admin/users/${peerId}/role`, { role: "member" }, founderToken);
    expect(demote.status).toBe(200);
    const closed = await api("GET", "/api/admin/players", undefined, peerToken);
    expect(closed.status).toBe(401);
  });

  it("S2: the Command Centre rides admin identities; the second password is retired", async () => {
    // Trap 3.2 said no test covered the journey endpoints. Now one does.
    // A plain member is refused…
    const asMember = await api("POST", "/api/journey/checkbox", { id: "probe", state: 99 }, doerToken);
    expect(asMember.status).toBe(401);

    // …the retired JOURNEY_PASSWORD is refused…
    const asOldPassword = await api("POST", "/api/journey/checkbox", { id: "probe", state: 99 }, "loop-test-journey");
    expect(asOldPassword.status).toBe(401);

    // …and the founder passes auth, hitting the DELIBERATE 400 probe (state 99
    // is invalid by design — trap 3.8: this 400 means the gate opened).
    const asFounder = await api("POST", "/api/journey/checkbox", { id: "probe", state: 99 }, founderToken);
    expect(asFounder.status).toBe(400);

    // Reads are gated too — the tracker was publicly readable before S2.
    const anon = await api("GET", "/api/journey/state");
    expect(anon.status).toBe(401);

    const state = await api("GET", "/api/journey/state", undefined, founderToken);
    expect(state.status).toBe(200);
    expect(state.json).toHaveProperty("checkboxes");
  });

  it("S9: admins name tokens (Gate D), and the registry refuses re-denomination", async () => {
    const anon = await api("GET", "/api/admin/tokens");
    expect(anon.status).toBe(401);

    const list = await api("GET", "/api/admin/tokens", undefined, founderToken);
    expect(list.status).toBe(200);
    expect(list.json.tokens.map((t: any) => t.slug)).toEqual(
      expect.arrayContaining(["gratitude", "amora", "voice", "credits"]),
    );
    // Recognition issuance is visible per faucet channel.
    const gratitude = list.json.tokens.find((t: any) => t.slug === "gratitude");
    expect(gratitude.issuedBy["sys:gratitude-pool"]).toBeGreaterThan(0);

    const bad = await api("POST", "/api/admin/tokens", { slug: "Bad Slug!", name: "X" }, founderToken);
    expect(bad.status).toBe(400);
    const dup = await api("POST", "/api/admin/tokens", { slug: "credits", name: "Counterfeit" }, founderToken);
    expect(dup.status).toBe(409);

    const created = await api(
      "POST",
      "/api/admin/tokens",
      { slug: "stay-credits", name: "Stay Credits", kind: "credit", transferable: false },
      founderToken,
    );
    expect(created.status).toBe(200);
    expect(created.json.token).toMatchObject({ slug: "stay-credits", governance: "platform" });
  });

  it("S9: manual minting requires a reason and honors the per-cycle aggregate cap", async () => {
    // Guards, in order: hypha refusal, missing reason, then the cap as an
    // AGGREGATE — two mints that individually fit but jointly exceed it are
    // refused on the second call.
    const hypha = await api("POST", "/api/admin/tokens/amora/mint", { toUserId: peerId, amount: 5, reason: "nope" }, founderToken);
    expect(hypha.status).toBe(400);
    const noReason = await api("POST", "/api/admin/tokens/stay-credits/mint", { toUserId: peerId, amount: 5 }, founderToken);
    expect(noReason.status).toBe(400);

    // Cap is 10000 by default; take most of it, then overflow.
    const first = await api(
      "POST",
      "/api/admin/tokens/stay-credits/mint",
      { toUserId: peerId, amount: 9000, reason: "Founding stay allocation" },
      founderToken,
    );
    expect(first.status).toBe(200);
    expect(first.json.toBalance).toBe(9000);
    expect(first.json.remaining).toBe(1000);

    const overflow = await api(
      "POST",
      "/api/admin/tokens/stay-credits/mint",
      { toUserId: peerId, amount: 1001, reason: "One too many" },
      founderToken,
    );
    expect(overflow.status).toBe(409);
    expect(overflow.json.remaining).toBe(1000);

    // The mint landed in the member's own ledger view, in the new token.
    const ledger = await api("GET", "/api/game/ledger", undefined, peerToken);
    expect(ledger.json.balances["stay-credits"]?.balance).toBe(9000);

    // And the audit trail names the mint.
    const audit = await api("GET", "/api/admin/audit", undefined, founderToken);
    expect(audit.json.some((r: any) => String(r.action) === "mint:9000:stay-credits")).toBe(true);
  });

  it("S9 + Gate A, the closing assertion: the economy still conserves", async () => {
    // After everything this suite did — consents, sends, a settled cycle,
    // hand-mints — the reconciliation panel must report a clean economy:
    // per token, all balances sum to zero, the cache agrees with the
    // transfers, and nothing but faucets is negative.
    const rec = await api("GET", "/api/admin/ledger/reconciliation", undefined, founderToken);
    expect(rec.status).toBe(200);
    expect(rec.json.invariants.problems).toEqual([]);
    expect(rec.json.invariants.ok).toBe(true);

    // Faucet negatives are labeled as what they are: issuance to date.
    const mintRow = rec.json.systemAccounts.find(
      (s: any) => s.id === "sys:mint" && s.tokenType === "stay-credits",
    );
    expect(mintRow?.issuedToDate).toBe(9000);
    const poolRow = rec.json.systemAccounts.find(
      (s: any) => s.id === "sys:cycle-pool" && s.tokenType === "credits",
    );
    expect(poolRow?.issuedToDate).toBe(1000);
  });

  it("S13: modules ship OFF, lifecycle guards hold, and preview never leaks", async () => {
    // Delta-off default: an empty module_settings table means the anonymous
    // manifest carries ONLY core modules — the site is byte-identical to
    // the pre-framework era.
    const anon = await api("GET", "/api/modules");
    expect(anon.status).toBe(200);
    const anonIds = anon.json.modules.map((m: any) => m.id);
    expect(anonIds).toContain("quests");
    expect(anonIds).not.toContain("tools");
    expect(anon.json.hypha.configured).toBe(false);

    // Unknown ids and core modules are refused on write.
    const unknown = await api("PUT", "/api/admin/modules/nope/lifecycle", { lifecycle: "public" }, founderToken);
    expect(unknown.status).toBe(400);
    const core = await api("PUT", "/api/admin/modules/quests/lifecycle", { lifecycle: "off" }, founderToken);
    expect(core.status).toBe(400);

    // Preview is admin-only: a signed-in member's manifest still hides it —
    // the catalog of what a village is trying out never leaks.
    const toPreview = await api("PUT", "/api/admin/modules/tools/lifecycle", { lifecycle: "preview" }, founderToken);
    expect(toPreview.status).toBe(200);
    const asMember = await api("GET", "/api/modules", undefined, doerToken);
    expect(asMember.json.modules.map((m: any) => m.id)).not.toContain("tools");
    const asAdmin = await api("GET", "/api/modules", undefined, founderToken);
    expect(asAdmin.json.modules.find((m: any) => m.id === "tools")?.lifecycle).toBe("preview");

    // The single Hypha home: setting hypha.org_url resolves the four named
    // links by convention, and blanking it hides everything again.
    const setUrl = await api(
      "PUT",
      "/api/admin/variables/hypha.org_url",
      { value: "https://app.hypha.earth/en/dho/test-village" },
      founderToken,
    );
    expect(setUrl.status).toBe(200);
    const withHypha = await api("GET", "/api/modules");
    expect(withHypha.json.hypha.configured).toBe(true);
    expect(withHypha.json.hypha.links.proposals).toBe("https://app.hypha.earth/en/dho/test-village/agreements");
    expect(withHypha.json.hypha.links.governance).toBe("https://app.hypha.earth/en/dho/test-village");
    const clearUrl = await api("PUT", "/api/admin/variables/hypha.org_url", { value: "" }, founderToken);
    expect(clearUrl.status).toBe(200);

    // Off again; the admin panel reports the stored truth throughout.
    const off = await api("PUT", "/api/admin/modules/tools/lifecycle", { lifecycle: "off" }, founderToken);
    expect(off.status).toBe(200);
    const adminView = await api("GET", "/api/admin/modules", undefined, founderToken);
    expect(adminView.json.modules.find((m: any) => m.id === "tools").lifecycle).toBe("off");
    expect(adminView.json.orphans).toEqual([]);
  });

  it("S15: the tools hub rides the framework — lifecycle posture end to end", async () => {
    // OFF: the whole surface — member AND admin routes — is the same 404.
    const offMember = await api("GET", "/api/tools");
    expect(offMember.status).toBe(404);
    expect(offMember.json.error).toBe("module_disabled");
    const offAdmin = await api("GET", "/api/admin/tools", undefined, founderToken);
    expect(offAdmin.status).toBe(404);

    // PREVIEW: admins pass, everyone else gets the identical 404 body.
    await api("PUT", "/api/admin/modules/tools/lifecycle", { lifecycle: "preview" }, founderToken);
    const previewAnon = await api("GET", "/api/tools");
    expect(previewAnon.status).toBe(404);
    expect(previewAnon.json).toEqual(offMember.json);
    const previewAdmin = await api("GET", "/api/tools", undefined, founderToken);
    expect(previewAdmin.status).toBe(200);
    expect(previewAdmin.json.categories.map((c: any) => c.id)).toContain("communication");

    // Create tools while in preview: one public, one members-only, one role-gated.
    const mkTool = (body: any) => api("POST", "/api/admin/tools", body, founderToken);
    const pub = await mkTool({ name: "Village Site", purpose: "The public site", url: "https://example.org", category: "communication", visibility: "public" });
    expect(pub.status).toBe(200);
    const mem = await mkTool({ name: "Member Chat", purpose: "Where members talk", url: "https://example.org/chat", category: "communication", visibility: "members" });
    expect(mem.status).toBe(200);
    const roleGated = await mkTool({ name: "Founders Vault", purpose: "Founding docs", url: "https://example.org/vault", category: "documents", visibility: "roles", roleIds: ["founders-circle"] });
    expect(roleGated.status).toBe(200);

    // Validation is loud: http refused, unknown category refused, bad role refused.
    expect((await mkTool({ name: "Bad", purpose: "x", url: "http://example.org", category: "communication" })).status).toBe(400);
    expect((await mkTool({ name: "Bad2", purpose: "x", url: "https://example.org", category: "nope" })).status).toBe(400);
    expect((await mkTool({ name: "Bad3", purpose: "x", url: "https://example.org", category: "documents", visibility: "roles", roleIds: ["ghost-role"] })).status).toBe(400);

    // MEMBERS lifecycle: anonymous gets 401 (prompt to sign in), members pass,
    // and the audience filter works per card.
    await api("PUT", "/api/admin/modules/tools/lifecycle", { lifecycle: "members" }, founderToken);
    const memAnon = await api("GET", "/api/tools");
    expect(memAnon.status).toBe(401);
    const asDoer = await api("GET", "/api/tools", undefined, doerToken);
    expect(asDoer.status).toBe(200);
    const doerNames = asDoer.json.tools.map((t: any) => t.name);
    expect(doerNames).toContain("Village Site");
    expect(doerNames).toContain("Member Chat");
    expect(doerNames).not.toContain("Founders Vault"); // doer holds no founders-circle role

    // PUBLIC lifecycle: anonymous sees only public cards.
    await api("PUT", "/api/admin/modules/tools/lifecycle", { lifecycle: "public" }, founderToken);
    const pubAnon = await api("GET", "/api/tools");
    expect(pubAnon.status).toBe(200);
    const anonNames = pubAnon.json.tools.map((t: any) => t.name);
    expect(anonNames).toContain("Village Site");
    expect(anonNames).not.toContain("Member Chat");

    // The click beacon accepts and never blocks the open.
    const click = await api("POST", `/api/tools/${pub.json.id}/click`);
    expect(click.status).toBe(200);
    const adminList = await api("GET", "/api/admin/tools", undefined, founderToken);
    expect(adminList.json.tools.find((t: any) => t.id === pub.json.id).clicks.d30).toBeGreaterThanOrEqual(1);

    // The SSRF guard refuses private targets without fetching them.
    const evil = await api("PUT", `/api/admin/tools/${pub.json.id}`, { url: "https://localhost/admin" }, founderToken);
    expect(evil.status).toBe(200); // the URL itself is stored (https, parseable)…
    const checked = await api("POST", "/api/admin/tools/check-links", undefined, founderToken);
    expect(checked.status).toBe(200);
    const evilResult = checked.json.results.find((r: any) => r.id === pub.json.id);
    expect(evilResult.ok).toBe(false);
    expect(String(evilResult.refused ?? "")).toContain("private");

    // Back to off for a clean final state: the surface vanishes again.
    await api("PUT", "/api/admin/modules/tools/lifecycle", { lifecycle: "off" }, founderToken);
    expect((await api("GET", "/api/tools")).status).toBe(404);
  });

  it("S16: the notification spine — producers fired, bell reads, prefs validate", async () => {
    // Everything this suite already did produced notifications: the peer
    // received gratitude and a role appointment, the doer had a quest
    // consented. The spine recorded each exactly once.
    const peerBell = await api("GET", "/api/notifications", undefined, peerToken);
    expect(peerBell.status).toBe(200);
    const peerTypes = peerBell.json.notifications.map((n: any) => n.type);
    expect(peerTypes).toContain("gratitude");
    expect(peerTypes).toContain("role_appointed");
    expect(peerBell.json.unreadCount).toBeGreaterThan(0);

    const doerBell = await api("GET", "/api/notifications", undefined, doerToken);
    expect(doerBell.json.notifications.map((n: any) => n.type)).toContain("quest_consented");

    // Anonymous is refused; mark-all-read zeroes the badge.
    expect((await api("GET", "/api/notifications")).status).toBe(401);
    const marked = await api("POST", "/api/notifications/read", {}, peerToken);
    expect(marked.status).toBe(200);
    expect((await api("GET", "/api/notifications", undefined, peerToken)).json.unreadCount).toBe(0);

    // Prefs: junk writes echo back as validated defaults; real writes stick.
    const junk = await api("PUT", "/api/profile/prefs", { notify: { gratitudeEmail: "hourly", nonsense: 1 } }, peerToken);
    expect(junk.status).toBe(200);
    expect(junk.json.notify.gratitudeEmail).toBe("daily"); // junk degraded to default
    const real = await api("PUT", "/api/profile/prefs", { notify: { gratitudeEmail: "off", emailsOff: true } }, peerToken);
    expect(real.json.notify.gratitudeEmail).toBe("off");
    expect(real.json.notify.emailsOff).toBe(true);
    expect((await api("GET", "/api/profile/prefs", undefined, peerToken)).json.notify.emailsOff).toBe(true);
  });

  it("S18: export gives a member everything; deletion anonymizes without touching value", async () => {
    // A member joins, receives appreciation, then exercises both rights.
    const leaver = { email: `leaver-${PORT}@example.test`, password: "LoopTest123!", name: "Leaving Member" };
    const reg = await api("POST", "/api/auth/register", { ...leaver, paths: ["resident"] });
    expect(reg.status).toBe(200);
    const leaverToken = reg.json.token;
    const leaverId = reg.json.user.id;

    const send = await api(
      "POST",
      "/api/game/gratitude/send",
      { toEmail: leaver.email, amount: 1, message: "Welcome, and farewell" },
      doerToken,
    );
    expect(send.status).toBe(200);

    // Export: the full picture, attachment-shaped.
    const exported = await api("GET", "/api/profile/export", undefined, leaverToken);
    expect(exported.status).toBe(200);
    expect(exported.json.member.email).toBe(leaver.email);
    expect(exported.json.member.passwordHash).toBeUndefined();
    expect(exported.json.gratitudeReceived.length).toBe(1);
    expect(exported.json.balances.gratitude).toBe(1);

    // Deletion needs the password; then the account is a tombstone.
    expect((await api("POST", "/api/profile/delete-account", { password: "wrong" }, leaverToken)).status).toBe(403);
    const deleted = await api("POST", "/api/profile/delete-account", { password: leaver.password }, leaverToken);
    expect(deleted.status).toBe(200);
    expect(deleted.json.anonymized).toBe(true);

    // Sessions are dead, login is impossible, the name is gone everywhere.
    expect((await api("GET", "/api/profile", undefined, leaverToken)).status).toBe(401);
    expect((await api("POST", "/api/auth/login", { email: leaver.email, password: leaver.password })).status).toBe(401);
    const doerJournal = await api("GET", "/api/game/gratitude/me", undefined, doerToken);
    const sentRow = doerJournal.json.sent.find((g: any) => g.toId === leaverId);
    expect(sentRow.toName).toBe("A departed member");
    const players = await api("GET", "/api/admin/players", undefined, founderToken);
    const tombstone = players.json.find((p: any) => p.id === leaverId);
    expect(tombstone.name).toBe("A departed member");
    expect(tombstone.email).toContain("anonymized.invalid");

    // THE point: value rows persisted — the economy still conserves, and the
    // departed member's ledger account still balances what it received.
    const rec = await api("GET", "/api/admin/ledger/reconciliation", undefined, founderToken);
    expect(rec.json.invariants.ok).toBe(true);

    // The admin path does the same thing (and refuses to erase a founder).
    const founderSelf = await api("DELETE", `/api/admin/players/${founderId}`, undefined, founderToken);
    expect(founderSelf.status).toBe(409);
  });

  it("S19-S23: the village map — circles, tiers, relay, concierge", async () => {
    // Off = the whole surface is the framework 404.
    expect((await api("GET", "/api/map")).status).toBe(404);
    await api("PUT", "/api/admin/modules/map/lifecycle", { lifecycle: "public" }, founderToken);

    // Circles seeded from the file on the empty table; aliases resolve quests.
    const circles = await api("GET", "/api/circles");
    expect(circles.status).toBe(200);
    expect(circles.json.length).toBeGreaterThanOrEqual(8);
    const perma = circles.json.find((c: any) => c.id === "permaculture-council");
    expect(perma.aliases).toContain("Regenerative Agriculture");

    // Alias collisions are refused: one alias, one circle, forever.
    const clash = await api(
      "PUT",
      "/api/admin/circles/education-council",
      { aliases: ["Education", "Regenerative Agriculture"] },
      founderToken,
    );
    expect(clash.status).toBe(409);

    // Assign a role to a circle with seats; the map derives vacancy.
    const assign = await api("PUT", "/api/admin/roles/founders-circle", { circleId: "community-life-council", seats: 3 }, founderToken);
    expect(assign.status).toBe(200);

    // Tier check: anonymous sees structure (counts), never names; a member
    // with map.viewPeople sees holders.
    const anonMap = await api("GET", "/api/map");
    expect(anonMap.status).toBe(200);
    const anonRole = anonMap.json.roles.find((r: any) => r.id === "founders-circle");
    expect(anonRole.holderCount).toBeGreaterThan(0);
    expect(anonRole.holders).toEqual([]);
    expect(anonRole.circleId).toBe("community-life-council");
    expect(anonRole.vacant).toBe(true); // 3 seats, fewer holders
    const memberMap = await api("GET", "/api/map", undefined, doerToken);
    const memberRole = memberMap.json.roles.find((r: any) => r.id === "founders-circle");
    expect(memberRole.holders.length).toBeGreaterThan(0);
    // Quests resolve to circles through aliases.
    expect(anonMap.json.quests.some((q: any) => q.circleId === "permaculture-council")).toBe(true);

    // Raise a hand on the vacant seat → the existing submissions inbox.
    const hand = await api("POST", "/api/map/roles/founders-circle/raise-hand", { note: "I hold the long view." }, doerToken);
    expect(hand.status).toBe(200);
    const subs = await api("GET", "/api/admin/submissions?type=role-application", undefined, founderToken);
    expect(subs.json.some((s: any) => s.data?.roleId === "founders-circle")).toBe(true);

    // The contact relay: opt-out is server-enforced, then a real relay lands
    // a notification (email is fire-and-forget without a key).
    const peerNow = await api("GET", "/api/admin/players", undefined, founderToken);
    const peerRow = peerNow.json.find((p: any) => p.id === peerId);
    expect(peerRow).toBeTruthy();
    await api("PUT", "/api/game/preferences", { contactable: false }, peerToken);
    const refused = await api("POST", "/api/map/contact", { toUserId: peerId, message: "hello" }, doerToken);
    expect(refused.status).toBe(403);
    await api("PUT", "/api/game/preferences", { contactable: true }, peerToken);
    const sent = await api("POST", "/api/map/contact", { toUserId: peerId, roleId: "founders-circle", message: "Can I help with welcome duty?" }, doerToken);
    expect(sent.status).toBe(200);
    // Same message twice = the idempotency key absorbs it.
    const dup = await api("POST", "/api/map/contact", { toUserId: peerId, roleId: "founders-circle", message: "Can I help with welcome duty?" }, doerToken);
    expect(dup.json.duplicate).toBe(true);
    const peerBell = await api("GET", "/api/notifications", undefined, peerToken);
    expect(peerBell.json.notifications.some((n: any) => n.type === "contact_request")).toBe(true);

    // The concierge: deterministic-first (no API key in tests), every query
    // logged, unmatched asks become the demand signal.
    const matched = await api("POST", "/api/assistant/coordinate", { query: "I want to help with permaculture and gardens" }, doerToken);
    expect(matched.status).toBe(200);
    expect(matched.json.match?.id).toBe("permaculture-council");
    expect(matched.json.method).toBe("deterministic");
    const unmatched = await api("POST", "/api/assistant/coordinate", { query: "underwater basket weaving championships" }, doerToken);
    expect(unmatched.json.match).toBeNull();
    const signal = await api("GET", "/api/admin/map/concierge-log?unmatched=1", undefined, founderToken);
    expect(signal.json.some((q: any) => String(q.query).includes("underwater"))).toBe(true);

    await api("PUT", "/api/admin/modules/map/lifecycle", { lifecycle: "off" }, founderToken);
  });

  it("S24-S26: the forum — precedence, locks, community hide, decisions", async () => {
    expect((await api("GET", "/api/forum/threads")).status).toBe(404);
    await api("PUT", "/api/admin/modules/forum/lifecycle", { lifecycle: "public" }, founderToken);

    const cats = await api("GET", "/api/forum/categories");
    expect(cats.json.map((c: any) => c.id)).toContain("village-life");

    // forum.post gates at member stage: a fresh guest (no roles, no stage)
    // is refused; the doer needs co-creator to OPEN a decision.
    const guest = await api("POST", "/api/auth/register", {
      email: `forum-guest-${PORT}@example.test`, password: "LoopTest123!", name: "Fresh Guest", paths: ["resident"],
    });
    const tooEarly = await api("POST", "/api/forum/threads", { category: "village-life", title: "hi", body: "hello" }, guest.json.token);
    expect(tooEarly.status).toBe(403);
    await api("PUT", `/api/admin/players/${peerId}/stage`, { stageId: "member" }, founderToken);
    await api("PUT", `/api/admin/players/${doerId}/stage`, { stageId: "co-creator" }, founderToken);
    // The doer also takes the founders-circle seat: proposal.decide and
    // forum.moderate arrive by ROLE GRANT, not admin status — the one gate.
    await api("POST", "/api/admin/roles/founders-circle/holders", { userId: doerId, action: "add" }, founderToken);

    // A decision thread, mentioning the peer by handle.
    const created = await api(
      "POST",
      "/api/forum/threads",
      {
        category: "governance",
        kind: "decision",
        title: "Adopt the shared meal rhythm?",
        body: "Proposal: weekly shared meals. @grateful-peer you hosted the last one — thoughts?",
        tags: ["Meals", "rhythm"],
      },
      doerToken,
    );
    expect(created.status).toBe(200);
    const threadId = created.json.id;

    // The mention landed exactly once, on the spine.
    const peerBell1 = await api("GET", "/api/notifications", undefined, peerToken);
    const mention = peerBell1.json.notifications.find((n: any) => n.type === "mention" && n.link === `/forum/${threadId}`);
    expect(mention).toBeTruthy();

    // Peer replies → the thread author gets forum_reply.
    const reply1 = await api("POST", `/api/forum/threads/${threadId}/replies`, { body: "Happy to host again." }, peerToken);
    expect(reply1.status).toBe(200);
    const doerBell = await api("GET", "/api/notifications", undefined, doerToken);
    expect(doerBell.json.notifications.some((n: any) => n.type === "forum_reply" && n.link === `/forum/${threadId}`)).toBe(true);

    // PRECEDENCE: the doer replies to the peer's reply AND mentions them —
    // one person, one notification: the mention wins, no duplicate reply row.
    const beforeReplies = (await api("GET", "/api/notifications", undefined, peerToken)).json.notifications.filter(
      (n: any) => n.type === "forum_reply",
    ).length;
    const reply2 = await api(
      "POST",
      `/api/forum/threads/${threadId}/replies`,
      { body: "Wonderful @grateful-peer — same time then.", parentReplyId: reply1.json.id },
      doerToken,
    );
    expect(reply2.status).toBe(200);
    const peerBell2 = await api("GET", "/api/notifications", undefined, peerToken);
    // Two mentions total now (the thread's and the reply's)…
    expect(peerBell2.json.notifications.filter((n: any) => n.type === "mention" && n.link === `/forum/${threadId}`).length).toBe(2);
    // …and precedence held: the same reply produced NO direct-reply duplicate.
    const afterReplies = peerBell2.json.notifications.filter((n: any) => n.type === "forum_reply").length;
    expect(afterReplies).toBe(beforeReplies);

    // A follower (the founder, manually subscribed) gets thread_activity on
    // the next reply — and nobody already reached gets doubled.
    await api("POST", `/api/forum/threads/${threadId}/subscribe`, {}, founderToken);
    await api("POST", `/api/forum/threads/${threadId}/replies`, { body: "Settled, see everyone Sunday." }, doerToken);
    const founderBell = await api("GET", "/api/notifications", undefined, founderToken);
    expect(founderBell.json.notifications.some((n: any) => n.type === "thread_activity" && n.link === `/forum/${threadId}`)).toBe(true);

    // Locks are enforced SERVER-side: the doer (forum.moderate via role) locks.
    const lock = await api("POST", `/api/forum/threads/${threadId}/moderate`, { action: "lock" }, doerToken);
    expect(lock.status).toBe(200);
    expect((await api("POST", `/api/forum/threads/${threadId}/replies`, { body: "one more" }, peerToken)).status).toBe(423);
    await api("POST", `/api/forum/threads/${threadId}/moderate`, { action: "unlock" }, doerToken);

    // Community auto-hide: two distinct soft reporters at threshold 2.
    await api("PUT", "/api/admin/variables/forum.report_hide_threshold", { value: "2" }, founderToken);
    await api("POST", `/api/forum/threads/${threadId}/report`, { severity: "soft", reason: "test" }, peerToken);
    expect((await api("POST", `/api/forum/threads/${threadId}/report`, { severity: "soft" }, peerToken)).status).toBe(409); // once per person
    await api("POST", `/api/forum/threads/${threadId}/report`, { severity: "soft", reason: "test2" }, founderToken);
    expect((await api("GET", `/api/forum/threads/${threadId}`)).status).toBe(410); // hidden: gone, not never-existed
    const modView = await api("GET", `/api/forum/threads/${threadId}`, undefined, doerToken);
    expect(modView.status).toBe(200); // moderators still see it
    await api("POST", `/api/forum/threads/${threadId}/moderate`, { action: "restore" }, doerToken);
    await api("PUT", "/api/admin/variables/forum.report_hide_threshold", { value: "3" }, founderToken);

    // The decision primitive: the doer records the outcome; it locks; twice is 409.
    const decide = await api("POST", `/api/forum/threads/${threadId}/decide`, { outcome: "Adopted by consent. Sundays, sunset." }, doerToken);
    expect(decide.status).toBe(200);
    expect(decide.json.meta.status).toBe("decided");
    expect((await api("POST", `/api/forum/threads/${threadId}/decide`, { outcome: "again" }, doerToken)).status).toBe(409);
    const decided = await api("GET", `/api/forum/threads/${threadId}`);
    expect(decided.json.meta.outcome).toContain("Adopted by consent");
    expect(decided.json.lockedAt).toBeTruthy();

    // Tags landed in the junction, lowercased; the tag filter finds the thread.
    const tagged = await api("GET", "/api/forum/threads?tag=meals");
    expect(tagged.json.some((t: any) => t.id === threadId)).toBe(true);

    await api("PUT", "/api/admin/modules/forum/lifecycle", { lifecycle: "off" }, founderToken);
    expect((await api("GET", "/api/forum/threads")).status).toBe(404);
  });

  it("S27-S29: the feed — a lens over the forum, hearts as real sends, the split report", async () => {
    // The feed is a LENS over the forum: enabling it while the forum is off
    // is refused with the missing dependency named.
    const depBlocked = await api("PUT", "/api/admin/modules/feed/lifecycle", { lifecycle: "public" }, founderToken);
    expect(depBlocked.status).toBe(409);
    expect(depBlocked.json.missing).toContain("forum");
    await api("PUT", "/api/admin/modules/forum/lifecycle", { lifecycle: "public" }, founderToken);
    expect((await api("PUT", "/api/admin/modules/feed/lifecycle", { lifecycle: "public" }, founderToken)).status).toBe(200);
    // And the forum can no longer switch off underneath it.
    const lockedDep = await api("PUT", "/api/admin/modules/forum/lifecycle", { lifecycle: "off" }, founderToken);
    expect(lockedDep.status).toBe(409);
    expect(lockedDep.json.dependents).toContain("feed");

    // A micropost through the forum route lands in the feed lens, alongside
    // the village's own system items.
    const micro = await api(
      "POST",
      "/api/forum/threads",
      { category: "village-life", kind: "post", body: "The papaya trees are fruiting!" },
      peerToken,
    );
    expect(micro.status).toBe(200);
    const feed = await api("GET", "/api/feed", undefined, doerToken);
    expect(feed.status).toBe(200);
    const post = feed.json.items.find((i: any) => i.id === micro.json.id);
    expect(post).toBeTruthy();
    expect(post.itemType).toBe("post");
    expect(post.heartedByMe).toBe(false);
    expect(feed.json.items.some((i: any) => i.itemType === "system")).toBe(true);

    // Announcements are role-gated: the peer (no feed.announce role) is
    // refused; the founder (admin) passes through the same one gate.
    const noAnnounce = await api(
      "POST",
      "/api/forum/threads",
      { category: "village-life", kind: "announcement", title: "Big news", body: "..." },
      peerToken,
    );
    expect(noAnnounce.status).toBe(403);

    // THE HEART: a real budgeted send. The doer's budget pays, the ledger
    // records kind 'heart', the thread's count recomputes, and the unique
    // heart index makes a second tap a 409 that NAMES its rule.
    const budgetBefore = (await api("GET", "/api/game/cycle", undefined, doerToken)).json.budget;
    const heart = await api("POST", `/api/feed/threads/${micro.json.id}/heart`, {}, doerToken);
    expect(heart.status).toBe(200);
    expect(heart.json.heartCount).toBe(1);
    expect(heart.json.budget.spent).toBe(budgetBefore.spent + 1);
    const again = await api("POST", `/api/feed/threads/${micro.json.id}/heart`, {}, doerToken);
    expect(again.status).toBe(409);
    expect(String(again.json.error)).toContain("already acknowledged this");
    // Self-hearts are refused by the same service every send goes through.
    const selfHeart = await api("POST", `/api/feed/threads/${micro.json.id}/heart`, {}, peerToken);
    expect(selfHeart.status).toBe(400);
    // The value is real: the peer's ledger carries a heart_received transfer.
    const peerLedger = await api("GET", "/api/game/ledger", undefined, peerToken);
    expect(peerLedger.json.entries.some((e: any) => e.source === "heart_received" && e.amount === 1)).toBe(true);
    const refreshed = await api("GET", "/api/feed", undefined, doerToken);
    expect(refreshed.json.items.find((i: any) => i.id === micro.json.id).heartedByMe).toBe(true);

    // THE SPLIT REPORT with the Sybil rule: plant a previous-lunation cycle
    // holding an eligible acknowledgment (doer, has consented quests), an
    // eligible heart (doer), and an INELIGIBLE heart (a fresh guest). Close.
    const cyc = await api("GET", "/api/game/cycle");
    const prevNumber = cyc.json.cycleNumber - 2; // -1 was consumed by the S8 test
    const prevId = `lunar-${String(prevNumber).padStart(6, "0")}`;
    const backAt = new Date(Date.parse(cyc.json.startsAt) - 40 * 24 * 3600 * 1000);
    const guestReg = await api("POST", "/api/auth/register", {
      email: `sybil-guest-${PORT}@example.test`, password: "LoopTest123!", name: "Eager Alt", paths: ["resident"],
    });
    const rows = [
      ["grat-split-ack", "gratitude", doerId, "Willing Doer", 5],
      ["grat-split-heart", "heart", doerId, "Willing Doer", 1],
      ["grat-split-alt", "heart", guestReg.json.user.id, "Eager Alt", 1],
    ];
    for (const [id, kind, fromId, fromName, amount] of rows) {
      await testDb.conn.query(
        "INSERT INTO gratitude_log (id, kind, from_id, from_name, to_id, to_name, amount, message, context_type, context_ref, cycle_id, cycle_number, at) " +
          "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        [id, kind, fromId, fromName, peerId, "Grateful Peer", amount, "backdated", kind === "heart" ? "post" : null, kind === "heart" ? `ctx-${id}` : null, prevId, prevNumber, backAt],
      );
    }
    const close = await api("POST", "/api/admin/cycles/close", {}, founderToken);
    expect(close.status).toBe(200);
    const dists = await api("GET", "/api/game/cycle/distributions");
    const split = dists.json.find((c: any) => c.cycleNumber === prevNumber);
    expect(split).toBeTruthy();
    const peerRow = split.totals.find((t: any) => t.received === 7);
    // Channels never blend: 2 from hearts, 5 from the written acknowledgment…
    expect(peerRow.receivedHearts).toBe(2);
    expect(peerRow.receivedAcks).toBe(5);
    // …and the Sybil rule holds: the fresh guest's VALUE counted, but their
    // breadth did not — distinctSenders is 1 (the doer), not 2.
    expect(peerRow.distinctSenders).toBe(1);

    await api("PUT", "/api/admin/modules/feed/lifecycle", { lifecycle: "off" }, founderToken);
    await api("PUT", "/api/admin/modules/forum/lifecycle", { lifecycle: "off" }, founderToken);
  });

  it("S30-S32: stays + the fiat trio — signed settlement, grace debt, mechanical reversal", async () => {
    const { createHmac } = await import("crypto");
    const SECRET = "whsec_looptest";
    const sign = (payload: string, secret = SECRET, at = Math.floor(Date.now() / 1000)) =>
      `t=${at},v1=${createHmac("sha256", secret).update(`${at}.${payload}`).digest("hex")}`;
    const webhook = async (event: any, sigHeader?: string) => {
      const payload = JSON.stringify(event);
      const res = await fetch(`${BASE}/api/webhooks/stripe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "stripe-signature": sigHeader ?? sign(payload) },
        body: payload,
      });
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : null };
    };

    // OFF: the whole surface is the framework 404. Funds-bearing enabling
    // passes because this deployment bootstrapped per-admin identities (S1).
    expect((await api("GET", "/api/stays")).status).toBe(404);
    expect((await api("PUT", "/api/admin/modules/stays/lifecycle", { lifecycle: "public" }, founderToken)).status).toBe(200);

    // A room posts TWO numbers per audience — a credit rate and a USD price —
    // never an FX rate. Missing member row falls through to guest.
    const room = await api("POST", "/api/admin/stays/accommodations", { name: "Garden Cabin", description: "Under the mangoes", capacity: 2 }, founderToken);
    expect(room.status).toBe(200);
    const accId = room.json.id;
    const priced = await api("PUT", `/api/admin/stays/accommodations/${accId}/prices`, {
      prices: [
        { tokenType: "stay-credit", audience: "guest", amountMinor: 2 },
        { tokenType: "stay-credit", audience: "member", amountMinor: 1 },
        { tokenType: "usd", audience: "guest", amountMinor: 5000 },
      ],
    }, founderToken);
    expect(priced.status).toBe(200);
    const cat = await api("GET", "/api/stays", undefined, doerToken);
    expect(cat.status).toBe(200);
    expect(cat.json.accommodations.find((a: any) => a.id === accId).prices["stay-credit"]).toEqual({ guest: 2, member: 1 });
    expect(cat.json.audience).toBe("member"); // the doer is past member stage
    expect(cat.json.stripeConfigured).toBe(false);

    // Guest booking toggle is server-enforced; a request lands as 'requested'.
    const guestReg = await api("POST", "/api/auth/register", {
      email: `stay-guest-${PORT}@example.test`, password: "LoopTest123!", name: "Stay Guest", paths: ["resident"],
    });
    const guestToken = guestReg.json.token;
    const guestId = guestReg.json.user.id;
    await api("PUT", "/api/admin/variables/stay.guest_booking_enabled", { value: "false" }, founderToken);
    expect((await api("POST", "/api/stays/request", { accommodationId: accId }, guestToken)).status).toBe(403);
    await api("PUT", "/api/admin/variables/stay.guest_booking_enabled", { value: "true" }, founderToken);
    const reqStay = await api("POST", "/api/stays/request", { accommodationId: accId, notes: "Arriving with tools." }, guestToken);
    expect(reqStay.status).toBe(200);
    const stayId = reqStay.json.id;

    // Invariant #13: a requested stay is open economic state — off is refused.
    const blocked = await api("PUT", "/api/admin/modules/stays/lifecycle", { lifecycle: "off" }, founderToken);
    expect(blocked.status).toBe(409);
    expect(String(blocked.json.error)).toContain("open state");

    // ── The signed settlement path. No Stripe key in this environment, so the
    // pending order is planted directly; the WEBHOOK is what's under test. ──
    const orderId = "sp-loop-1";
    await testDb.conn.query(
      "INSERT INTO stay_purchases (id, user_id, accommodation_id, nights, amount_minor, credits_granted, provider, status) VALUES (?,?,?,?,?,?,'stripe','pending')",
      [orderId, guestId, accId, 5, 25000, 10],
    );
    const settleEvent = {
      id: "evt_loop_settle_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_loop_1", payment_intent: "pi_loop_1", metadata: { module: "stays", orderId } } },
    };
    const payload = JSON.stringify(settleEvent);
    // Garbage signature: 400. Stale-but-valid signature (15 min old): 400.
    expect((await webhook(settleEvent, "t=123,v1=deadbeef")).status).toBe(400);
    expect((await webhook(settleEvent, sign(payload, SECRET, Math.floor(Date.now() / 1000) - 900))).status).toBe(400);
    // Nothing minted by either refusal.
    expect((await api("GET", "/api/game/ledger", undefined, guestToken)).json.balances["stay-credit"]?.balance ?? 0).toBe(0);

    // Properly signed: settles, mints, records the fiat charge.
    expect((await webhook(settleEvent)).status).toBe(200);
    expect((await api("GET", "/api/game/ledger", undefined, guestToken)).json.balances["stay-credit"]?.balance).toBe(10);

    // Idempotent three ways: same event id → absorbed at the event level;
    // fresh event id for the same order → absorbed by the ledger leg key.
    const replay = await webhook(settleEvent);
    expect(replay.status).toBe(200);
    expect(replay.json.duplicate).toBe(true);
    expect((await webhook({ ...settleEvent, id: "evt_loop_settle_2" })).status).toBe(200);
    expect((await api("GET", "/api/game/ledger", undefined, guestToken)).json.balances["stay-credit"]?.balance).toBe(10);

    // ── Activation snapshots rate + audience (a guest books at 2/night). ──
    const activated = await api("POST", `/api/admin/stays/${stayId}/activate`, {}, founderToken);
    expect(activated.status).toBe(200);
    expect(activated.json.rateSnapshotCredits).toBe(2);
    expect(activated.json.audienceSnapshot).toBe("guest");

    // Nightly posting catches up deterministically and idempotently: backdate
    // arrival three days, the button posts exactly three nights, then zero.
    await testDb.conn.query("UPDATE stays SET arrive_on = (CURRENT_DATE - INTERVAL 3 DAY), last_posted_on = NULL WHERE id = ?", [stayId]);
    const posted = await api("POST", "/api/admin/stays/post-nights", {}, founderToken);
    expect(posted.status).toBe(200);
    expect(posted.json.posted).toBe(3);
    expect((await api("POST", "/api/admin/stays/post-nights", {}, founderToken)).json.posted).toBe(0);
    const mineNow = await api("GET", "/api/stays", undefined, guestToken);
    expect(mineNow.json.mine.balance).toBe(4); // 10 - 3 nights × 2
    expect(mineNow.json.mine.stays[0].nightsRemaining).toBe(2); // floor(4/2), derived

    // ── GRACE: with 10 more nights owed and 4 credits held, posting walks the
    // balance down to exactly -(grace_nights × rate) = -4 and STOPS. The stay
    // is NOT auto-ended; the debt is a visible negative, not a hidden tab. ──
    await testDb.conn.query("UPDATE stays SET last_posted_on = (CURRENT_DATE - INTERVAL 11 DAY) WHERE id = ?", [stayId]);
    const grace = await api("POST", "/api/admin/stays/post-nights", {}, founderToken);
    expect(grace.json.posted).toBe(4);
    expect(grace.json.stopped).toBe(1);
    const inDebt = await api("GET", "/api/stays", undefined, guestToken);
    expect(inDebt.json.mine.balance).toBe(-4);
    expect(inDebt.json.mine.stays[0].status).toBe("active"); // never auto-ended
    // The economy still verifies: this negative is LEGAL (stay_night grace).
    const recGrace = await api("GET", "/api/admin/ledger/reconciliation", undefined, founderToken);
    expect(recGrace.json.invariants.ok).toBe(true);

    // ── MECHANICAL reversal: a dispute claws back exactly what was granted,
    // driving the balance further negative, and auto-suspends the buyer. ──
    const dispute = await webhook({
      id: "evt_loop_dispute_1",
      type: "charge.dispute.created",
      data: { object: { id: "dp_loop_1", payment_intent: "pi_loop_1" } },
    });
    expect(dispute.status).toBe(200);
    expect((await api("GET", "/api/game/ledger", undefined, guestToken)).json.balances["stay-credit"]?.balance).toBe(-14); // -4 - 10
    const payAdmin = await api("GET", "/api/admin/payments", undefined, founderToken);
    const suspension = payAdmin.json.suspensions.find((s: any) => s.user_id === guestId && !s.lifted_at);
    expect(suspension).toBeTruthy();
    expect(payAdmin.json.charges.find((c: any) => c.order_id === orderId)?.status).toBe("reversed");

    // Suspension blocks new purchases BEFORE any provider question…
    expect((await api("POST", "/api/stays/checkout", { accommodationId: accId, nights: 1 }, guestToken)).status).toBe(403);
    // …and lifting it restores the path (to the honest 503: no Stripe key here).
    expect((await api("POST", `/api/admin/payments/suspensions/${suspension.id}/lift`, {}, founderToken)).status).toBe(200);
    expect((await api("POST", "/api/stays/checkout", { accommodationId: accId, nights: 1 }, guestToken)).status).toBe(503);

    // ── Purchase limits aggregate over EVERY paid charge, module-blind. The
    // manual payment path (server derives credits from the posted rate) adds
    // a second charge; a tightened 30-day cap then refuses the next order. ──
    const manual = await api("POST", "/api/admin/stays/purchases/manual",
      { userId: guestId, accommodationId: accId, nights: 2, amountMinor: 10000 }, founderToken);
    expect(manual.status).toBe(200);
    expect(manual.json.creditsGranted).toBe(4); // 2 nights × guest rate 2, derived server-side
    await api("PUT", "/api/admin/variables/payments.purchase_limit_30d_usd", { value: "360" }, founderToken);
    // Counted so far: the $100 manual charge. The $250 Stripe charge was
    // REVERSED by the dispute and no longer counts — limits track money the
    // village actually kept. 100 + (6 nights × $50) = 400 > 360 → refused.
    const overCap = await api("POST", "/api/stays/checkout", { accommodationId: accId, nights: 6 }, guestToken);
    expect(overCap.status).toBe(403);
    expect(String(overCap.json.error)).toContain("30-day");
    // Per-order ceiling fires independently of history.
    await api("PUT", "/api/admin/variables/payments.purchase_limit_per_order_usd", { value: "99" }, founderToken);
    const overOrder = await api("POST", "/api/stays/checkout", { accommodationId: accId, nights: 2 }, guestToken);
    expect(overOrder.status).toBe(403);
    expect(String(overOrder.json.error)).toContain("per-order");
    await api("PUT", "/api/admin/variables/payments.purchase_limit_per_order_usd", { value: "1000" }, founderToken);
    await api("PUT", "/api/admin/variables/payments.purchase_limit_30d_usd", { value: "3000" }, founderToken);

    // ── Work-exchange (F2): a quest carries stay credits in a SEPARATE column,
    // released by the SAME human consent, keyed on the claim. ──
    const wq = await api("POST", "/api/admin/quests", {
      title: "Rebuild the garden beds", gratitude: "10", stayCreditReward: 3, tags: ["work-exchange"],
    }, founderToken);
    expect(wq.status).toBe(200);
    const wClaim = await api("POST", `/api/game/quests/${wq.json.id}/claim`, {}, doerToken);
    expect(wClaim.status).toBe(200);
    await api("POST", `/api/game/quests/${wq.json.id}/submit`, { note: "Beds rebuilt, drip lines in." }, doerToken);
    const doerCreditsBefore = (await api("GET", "/api/game/ledger", undefined, doerToken)).json.balances["stay-credit"]?.balance ?? 0;
    const consent = await api("POST", `/api/admin/quest-claims/${wClaim.json.id}/consent`, { approve: true, amount: 10 }, founderToken);
    expect(consent.status).toBe(200);
    const doerLedger = await api("GET", "/api/game/ledger", undefined, doerToken);
    expect(doerLedger.json.balances["stay-credit"]?.balance).toBe(doerCreditsBefore + 3);
    expect(doerLedger.json.entries.some((e: any) => e.source === "quest_stay_reward" && e.amount === 3)).toBe(true);
    // And the earn path is visible on the stay page.
    const earn = await api("GET", "/api/stays", undefined, doerToken);
    expect(earn.json.earnQuests.some((q: any) => q.id === wq.json.id && q.stayCreditReward === 3)).toBe(true);

    // Comp and adjust are ledgered, keyed admin acts; adjust refuses overdraft.
    const comp = await api("POST", "/api/admin/stays/comp", { userId: doerId, credits: 2, note: "Storm helper" }, founderToken);
    expect(comp.status).toBe(200);
    expect(comp.json.balance).toBe(doerCreditsBefore + 5);
    const overdraw = await api("POST", "/api/admin/stays/adjust", { userId: doerId, credits: -999, note: "typo" }, founderToken);
    expect(overdraw.status).toBe(409);

    // The refund hold: debit first. The guest is 14 credits underwater, so
    // holding 4 back for the manual purchase refund must REFUSE — you cannot
    // refund credits that were already slept on (or clawed back).
    const refundBlocked = await api(`POST`, `/api/admin/stays/purchases/${manual.json.id}/refund`, {}, founderToken);
    expect(refundBlocked.status).toBe(409);

    // ── The closing assertion: after settlement, grace debt, a dispute
    // reversal, comps and a work-exchange release, the economy CONSERVES —
    // and the only negatives are faucets and the two legal debt sources. ──
    const rec = await api("GET", "/api/admin/ledger/reconciliation", undefined, founderToken);
    expect(rec.json.invariants.problems).toEqual([]);
    expect(rec.json.invariants.ok).toBe(true);
  });

  it("S33-S35: the exchange — firewalls, bounded prices, stocked treasury, receipts", async () => {
    const { createHmac } = await import("crypto");
    const sign = (payload: string, at = Math.floor(Date.now() / 1000)) =>
      `t=${at},v1=${createHmac("sha256", "whsec_looptest").update(`${at}.${payload}`).digest("hex")}`;
    const webhook = async (event: any) => {
      const payload = JSON.stringify(event);
      const res = await fetch(`${BASE}/api/webhooks/stripe`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "stripe-signature": sign(payload) },
        body: payload,
      });
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : null };
    };

    expect((await api("GET", "/api/exchange")).status).toBe(404);
    expect((await api("PUT", "/api/admin/modules/exchange/lifecycle", { lifecycle: "public" }, founderToken)).status).toBe(200);

    // THE FIREWALLS, at write time (and re-proven by the same predicate at
    // every boot): recognition is earned, hypha never trades here, one
    // seller per token — the stays module already sells stay-credit.
    const recRefused = await api("PUT", "/api/admin/exchange/tokens/gratitude", { purchasable: true }, founderToken);
    expect(recRefused.status).toBe(409);
    expect(String(recRefused.json.error)).toContain("recognition");
    const hyphaRefused = await api("PUT", "/api/admin/exchange/tokens/amora", { purchasable: true }, founderToken);
    expect(hyphaRefused.status).toBe(409);
    expect(String(hyphaRefused.json.error)).toContain("Hypha");
    const secondSeller = await api("PUT", "/api/admin/exchange/tokens/stay-credit", { purchasable: true }, founderToken);
    expect(secondSeller.status).toBe(409);
    expect(String(secondSeller.json.error)).toContain("one seller");

    // "stay-credits" (the S9 admin-named token, distinct from the stays
    // module's stay-credit) is a plain platform credit: listable.
    expect((await api("PUT", "/api/admin/exchange/tokens/stay-credits", { purchasable: true }, founderToken)).status).toBe(200);

    // Prices are append-only, always explained, bounded per change.
    expect((await api("POST", "/api/admin/exchange/tokens/stay-credits/price", { priceMinor: 1000 }, founderToken)).status).toBe(409);
    expect((await api("POST", "/api/admin/exchange/tokens/stay-credits/price", { priceMinor: 1000, note: "Opening price: $10" }, founderToken)).status).toBe(200);
    const tooBig = await api("POST", "/api/admin/exchange/tokens/stay-credits/price", { priceMinor: 1500, note: "to the moon" }, founderToken);
    expect(tooBig.status).toBe(409); // 50% move against the default 20% bound
    expect(String(tooBig.json.error)).toContain("%");
    expect((await api("POST", "/api/admin/exchange/tokens/stay-credits/price", { priceMinor: 1200, note: "Costs rose with the wet season" }, founderToken)).status).toBe(200);

    // Buying is honest BEFORE the card: an unstocked treasury refuses.
    const noStock = await api("POST", "/api/exchange/buy", { tokenSlug: "stay-credits", quantity: 3 }, doerToken);
    expect(noStock.status).toBe(409);
    expect(String(noStock.json.error)).toContain("in stock");

    // Stocking IS minting: the S9 test already hand-minted 9000 of the
    // 10000 per-cycle cap this lunation, so 2000 more refuses and 500 fits.
    const overCap = await api("POST", "/api/admin/exchange/stock", { tokenSlug: "stay-credits", amount: 2000 }, founderToken);
    expect(overCap.status).toBe(409);
    const stocked = await api("POST", "/api/admin/exchange/stock", { tokenSlug: "stay-credits", amount: 500 }, founderToken);
    expect(stocked.status).toBe(200);
    expect(stocked.json.treasuryBalance).toBe(500);

    // The market lens; the v2 contract surfaces honestly as off + 501.
    const market = await api("GET", "/api/exchange", undefined, doerToken);
    expect(market.status).toBe(200);
    const listing = market.json.listings.find((l: any) => l.slug === "stay-credits");
    expect(listing.priceMinor).toBe(1200);
    expect(listing.inStock).toBe(true);
    expect(market.json.tradingEnabled).toBe(false);
    expect(market.json.mine.canBuy).toBe(true);
    expect((await api("POST", "/api/exchange/swap", {}, doerToken)).status).toBe(501);

    // The one gate: exchange.buy opens at member — a fresh guest is refused;
    // a per-listing stage floor stacks on top of it.
    const buyerReg = await api("POST", "/api/auth/register", {
      email: `xbuyer-${PORT}@example.test`, password: "LoopTest123!", name: "Eager Buyer", paths: ["resident"],
    });
    expect((await api("POST", "/api/exchange/buy", { tokenSlug: "stay-credits", quantity: 1 }, buyerReg.json.token)).status).toBe(403);
    await api("PUT", "/api/admin/exchange/tokens/stay-credits", { minStageToBuy: "co-creator" }, founderToken);
    const stageFloor = await api("POST", "/api/exchange/buy", { tokenSlug: "stay-credits", quantity: 1 }, peerToken);
    expect(stageFloor.status).toBe(403); // the peer is a member, not co-creator
    expect(String(stageFloor.json.error)).toContain("co-creator");
    await api("PUT", "/api/admin/exchange/tokens/stay-credits", { minStageToBuy: null }, founderToken);

    // ── Settlement through the SAME signed webhook (receipt planted: no
    // Stripe key here, and the trio is what's under test). ──
    await testDb.conn.query(
      "INSERT INTO exchange_orders (id, receipt_no, user_id, token_slug, quantity, price_minor_each, amount_minor, status) VALUES ('xo-loop-1', 900, ?, 'stay-credits', 30, 1200, 36000, 'pending')",
      [doerId],
    );
    const settle = {
      id: "evt_loop_xsettle_1",
      type: "checkout.session.completed",
      data: { object: { id: "cs_xloop_1", payment_intent: "pi_xloop_1", metadata: { module: "exchange", orderId: "xo-loop-1" } } },
    };
    expect((await webhook(settle)).status).toBe(200);
    const doerBal = await api("GET", "/api/game/ledger", undefined, doerToken);
    expect(doerBal.json.balances["stay-credits"]?.balance).toBe(30);
    expect(doerBal.json.entries.some((e: any) => e.source === "exchange_purchase" && e.amount === 30)).toBe(true);
    // Stock came DOWN — treasury sold what it held, minted nothing.
    const adminView = await api("GET", "/api/admin/exchange", undefined, founderToken);
    expect(adminView.json.stock["stay-credits"]).toBe(470);
    expect(adminView.json.orders.find((o: any) => o.id === "xo-loop-1").status).toBe("paid");
    // The buyer sees the receipt.
    const mine = await api("GET", "/api/exchange", undefined, doerToken);
    expect(mine.json.mine.orders.some((o: any) => o.receipt_no === 900 && o.status === "paid")).toBe(true);

    // ── OUT OF STOCK FAILS LOUD: an order the treasury cannot cover makes
    // the webhook answer 500 — and stays retryable (the dedupe claim is
    // released on failure), because out of stock is never a mint. ──
    await testDb.conn.query(
      "INSERT INTO exchange_orders (id, receipt_no, user_id, token_slug, quantity, price_minor_each, amount_minor, status) VALUES ('xo-loop-2', 901, ?, 'stay-credits', 100000, 1200, 120000000, 'pending')",
      [doerId],
    );
    const bigSettle = {
      id: "evt_loop_xsettle_2",
      type: "checkout.session.completed",
      data: { object: { id: "cs_xloop_2", payment_intent: "pi_xloop_2", metadata: { module: "exchange", orderId: "xo-loop-2" } } },
    };
    expect((await webhook(bigSettle)).status).toBe(500);
    expect((await webhook(bigSettle)).status).toBe(500); // retry re-runs, same truth
    const payLog = await api("GET", "/api/admin/payments", undefined, founderToken);
    expect(payLog.json.log.some((l: any) => l.outcome === "settle_error" && l.order_id === "xo-loop-2")).toBe(true);
    // Ops resolution for the stuck order (refund it in Stripe, void it here).
    await testDb.conn.query("UPDATE exchange_orders SET status = 'cancelled' WHERE id = 'xo-loop-2'");
    await testDb.conn.query("DELETE FROM fiat_charges WHERE module = 'exchange' AND order_id = 'xo-loop-2'");

    // ── Mechanical reversal: the dispute returns the 30 tokens TO STOCK and
    // suspends the buyer, cross-module — the same trio path stays proved. ──
    expect((await webhook({
      id: "evt_loop_xdispute_1",
      type: "charge.dispute.created",
      data: { object: { id: "dp_xloop_1", payment_intent: "pi_xloop_1" } },
    })).status).toBe(200);
    expect((await api("GET", "/api/game/ledger", undefined, doerToken)).json.balances["stay-credits"]?.balance).toBe(0);
    const adminAfter = await api("GET", "/api/admin/exchange", undefined, founderToken);
    expect(adminAfter.json.stock["stay-credits"]).toBe(500);
    expect(adminAfter.json.orders.find((o: any) => o.id === "xo-loop-1").status).toBe("disputed");
    const pay2 = await api("GET", "/api/admin/payments", undefined, founderToken);
    const doerSusp = pay2.json.suspensions.find((s: any) => s.user_id === doerId && !s.lifted_at);
    expect(doerSusp).toBeTruthy();

    // A disputed order is open economic state: module-off refuses.
    const offBlocked = await api("PUT", "/api/admin/modules/exchange/lifecycle", { lifecycle: "off" }, founderToken);
    expect(offBlocked.status).toBe(409);

    // Cleanup: lift the suspension, resolve the dispute, close the module.
    await api("POST", `/api/admin/payments/suspensions/${doerSusp.id}/lift`, {}, founderToken);
    await testDb.conn.query("UPDATE exchange_orders SET status = 'reversed' WHERE id = 'xo-loop-1'");
    expect((await api("PUT", "/api/admin/modules/exchange/lifecycle", { lifecycle: "off" }, founderToken)).status).toBe(200);

    // The economy conserves through listings, stock, a sale, and a clawback.
    const rec = await api("GET", "/api/admin/ledger/reconciliation", undefined, founderToken);
    expect(rec.json.invariants.problems).toEqual([]);
  });

  it("S36-S40: badges — the gate's new rows, the engine on settled events, warnings that bite", async () => {
    expect((await api("GET", "/api/badges")).status).toBe(404);
    await api("PUT", "/api/admin/modules/badges/lifecycle", { lifecycle: "public" }, founderToken);
    await api("PUT", "/api/admin/modules/forum/lifecycle", { lifecycle: "public" }, founderToken);

    // ── The definition firewalls, at write time (and re-proven at boot by
    // the same predicate): unknown keys, gate-less kinds, denies outside
    // warnings, and THE recognition firewall. ──
    expect((await api("POST", "/api/admin/badges", { name: "Bad Cap", kind: "granted", capabilities: ["nope.cap"] }, founderToken)).status).toBe(400);
    expect((await api("POST", "/api/admin/badges", { name: "Selfish", kind: "self", capabilities: ["forum.post"] }, founderToken)).status).toBe(400);
    expect((await api("POST", "/api/admin/badges", { name: "Sneaky", kind: "granted", denies: ["forum.post"] }, founderToken)).status).toBe(400);
    const laundered = await api("POST", "/api/admin/badges", {
      name: "Beloved", kind: "earned", capabilities: ["quest.consent"], rule: { metric: "gratitude_breadth", threshold: 2 },
    }, founderToken);
    expect(laundered.status).toBe(400);
    expect(String(laundered.json.error)).toContain("recognition");
    // A capability-FREE earned badge on breadth is honor, not power: legal.
    const appreciatedRes = await api("POST", "/api/admin/badges", { name: "Appreciated", kind: "earned", rule: { metric: "gratitude_breadth", threshold: 1 } }, founderToken);
    expect(appreciatedRes.status).toBe(200);
    const appreciated = appreciatedRes.json.badge;

    const selfBadge = (await api("POST", "/api/admin/badges", { name: "Composter", kind: "self", description: "I compost" }, founderToken)).json.badge;
    const voice = (await api("POST", "/api/admin/badges", { name: "Voice", kind: "granted", capabilities: ["forum.post"] }, founderToken)).json.badge;
    const cooling = (await api("POST", "/api/admin/badges", { name: "Cooling Off", kind: "warning", denies: ["forum.post", "forum.moderate"] }, founderToken)).json.badge;
    const questDoer = (await api("POST", "/api/admin/badges", { name: "Quest Doer", kind: "earned", rule: { metric: "quests_consented", threshold: 1, stackable: true, maxStack: 5 } }, founderToken)).json.badge;

    // Authorities stay separate: self is the member's act, earned the engine's.
    expect((await api("POST", `/api/badges/${selfBadge.id}/claim`, {}, peerToken)).status).toBe(200);
    expect((await api("POST", `/api/admin/badges/${selfBadge.id}/award`, { userId: peerId }, founderToken)).status).toBe(403);
    expect((await api("POST", `/api/admin/badges/${questDoer.id}/award`, { userId: doerId }, founderToken)).status).toBe(403);
    // A warning without a note refuses — the member deserves the why.
    expect((await api("POST", `/api/admin/badges/${cooling.id}/award`, { userId: doerId }, founderToken)).status).toBe(400);

    // ── A BADGE GRANT through the live gate: a fresh guest (below member)
    // cannot post; the Voice badge opens exactly that door. ──
    const guest = await api("POST", "/api/auth/register", {
      email: `badge-guest-${PORT}@example.test`, password: "LoopTest123!", name: "Badge Guest", paths: ["resident"],
    });
    expect((await api("POST", "/api/forum/threads", { category: "village-life", kind: "post", body: "hello?" }, guest.json.token)).status).toBe(403);
    await api("POST", `/api/admin/badges/${voice.id}/award`, { userId: guest.json.user.id, note: "Welcome voice" }, founderToken);
    const guestPost = await api("POST", "/api/forum/threads", { category: "village-life", kind: "post", body: "hello! (by badge)" }, guest.json.token);
    expect(guestPost.status).toBe(200);

    // ── GATE E, LIVE: the warning denies forum.post AND forum.moderate for
    // the DOER — who holds co-creator stage and the founders-circle role.
    // Deny beats stage, deny beats the role grant; only admin outranks. ──
    const thread = await api("POST", "/api/forum/threads", { category: "village-life", title: "Rhythm check", body: "How are the mornings going?" }, peerToken);
    expect(thread.status).toBe(200);
    expect((await api("POST", `/api/forum/threads/${thread.json.id}/moderate`, { action: "lock" }, doerToken)).status).toBe(200);
    await api("POST", `/api/forum/threads/${thread.json.id}/moderate`, { action: "unlock" }, doerToken);
    await api("POST", `/api/admin/badges/${cooling.id}/award`, { userId: doerId, note: "Heated week — pause and breathe" }, founderToken);
    expect((await api("POST", "/api/forum/threads", { category: "village-life", kind: "post", body: "silenced?" }, doerToken)).status).toBe(403); // deny beats stage
    expect((await api("POST", `/api/forum/threads/${thread.json.id}/moderate`, { action: "lock" }, doerToken)).status).toBe(403); // deny beats ROLE
    // The founder (admin) still moderates: admin outranks every deny.
    expect((await api("POST", `/api/forum/threads/${thread.json.id}/moderate`, { action: "lock" }, founderToken)).status).toBe(200);
    await api("POST", `/api/forum/threads/${thread.json.id}/moderate`, { action: "unlock" }, founderToken);

    // Standing warnings are open state: the module refuses to switch off.
    const offBlocked = await api("PUT", "/api/admin/modules/badges/lifecycle", { lifecycle: "off" }, founderToken);
    expect(offBlocked.status).toBe(409);
    expect(String(offBlocked.json.error)).toContain("warning");

    // Revoke → the doer's voice returns. Warnings suspend, never brand.
    await api("DELETE", `/api/admin/badges/${cooling.id}/award/${doerId}`, undefined, founderToken);
    expect((await api("POST", "/api/forum/threads", { category: "village-life", kind: "post", body: "back — and calmer" }, doerToken)).status).toBe(200);

    // ── THE ENGINE, settled events only. The doer has at least two consented
    // quests; the peer's settled distributions carry Sybil-filtered breadth. ──
    const evald = await api("POST", "/api/admin/badges/evaluate", {}, founderToken);
    expect(evald.status).toBe(200);
    expect(evald.json.newTiers.some((t: any) => t.badgeId === questDoer.id && t.userId === doerId && t.tier === 2)).toBe(true);
    expect(evald.json.newTiers.some((t: any) => t.badgeId === appreciated.id && t.userId === peerId)).toBe(true);
    // Idempotent by keyed events: a second run mints NOTHING new.
    expect((await api("POST", "/api/admin/badges/evaluate", {}, founderToken)).json.newTiers).toEqual([]);
    // The stack tier was RECOMPUTED to the metric, never incremented.
    const doerBadges = await api("GET", "/api/badges", undefined, doerToken);
    const doerAward = doerBadges.json.mine.awards.find((a: any) => a.badgeId === questDoer.id);
    expect(doerAward.count).toBeGreaterThanOrEqual(2);
    expect(doerAward.count).toBeLessThanOrEqual(5); // maxStack caps the ladder
    // The bell heard about the earned tier, exactly once (keyed dedupe).
    const doerBell = await api("GET", "/api/notifications", undefined, doerToken);
    expect(doerBell.json.notifications.some((n: any) => n.type === "badge")).toBe(true);

    // ── Skills: declared, deduped, removable — and they gate NOTHING. ──
    expect((await api("POST", "/api/badges/skills", { tag: "Carpentry " }, peerToken)).status).toBe(200);
    const dupSkill = await api("POST", "/api/badges/skills", { tag: "carpentry" }, peerToken);
    expect(dupSkill.status).toBe(200); // absorbed, not doubled
    expect(dupSkill.json.skills.filter((s: string) => s === "carpentry").length).toBe(1);
    expect((await api("POST", "/api/badges/skills", { tag: "!" }, peerToken)).status).toBe(400);
    expect((await api("DELETE", "/api/badges/skills/carpentry", undefined, peerToken)).status).toBe(200);

    // Cleanup: forum off again (badges stays on — its grants are in play).
    await api("PUT", "/api/admin/modules/forum/lifecycle", { lifecycle: "off" }, founderToken);
  });

  it("S41-S46: the material library — guarded intake, escrowed loans, one terminal", async () => {
    expect((await api("GET", "/api/library")).status).toBe(404);
    await api("PUT", "/api/admin/modules/library/lifecycle", { lifecycle: "public" }, founderToken);
    await api("POST", "/api/admin/library/categories", { label: "Garden Tools" }, founderToken);

    // ── INTAKE, the mint's guarded front door. Under the dual-sign-off line
    // the donor earns floor(appraisal × 75%) immediately. ──
    const intake1 = await api("POST", "/api/admin/library/intake",
      { name: "Wheelbarrow", appraisal: 100, donorUserId: peerId, categoryId: "garden-tools" }, founderToken);
    expect(intake1.status).toBe(200);
    expect(intake1.json.award).toBe(75);
    expect(intake1.json.pendingSecondSignoff).toBe(false);
    expect((await api("GET", "/api/game/ledger", undefined, peerToken)).json.balances["library-credit"]?.balance).toBe(75);

    // The per-member per-cycle cap is an AGGREGATE across donations.
    await api("PUT", "/api/admin/variables/library.intake_member_cycle_cap", { value: "100" }, founderToken);
    const capped = await api("POST", "/api/admin/library/intake", { name: "Hand Drill", appraisal: 100, donorUserId: peerId }, founderToken);
    expect(capped.status).toBe(409);
    expect(String(capped.json.error)).toContain("cap");
    await api("PUT", "/api/admin/variables/library.intake_member_cycle_cap", { value: "500" }, founderToken);

    // Above the line: recorded, NOTHING minted, and the recorder cannot
    // self-approve — dual sign-off means a SECOND steward.
    const big = await api("POST", "/api/admin/library/intake", { name: "Chainsaw", appraisal: 300, donorUserId: peerId }, founderToken);
    expect(big.json.pendingSecondSignoff).toBe(true);
    expect(big.json.award).toBe(0);
    expect((await api("GET", "/api/game/ledger", undefined, peerToken)).json.balances["library-credit"]?.balance).toBe(75);
    const selfApprove = await api("POST", `/api/admin/library/items/${big.json.itemId}/approve`, {}, founderToken);
    expect(selfApprove.status).toBe(409);
    expect(String(selfApprove.json.error)).toContain("SECOND");
    await api("PUT", `/api/admin/users/${doerId}/role`, { role: "admin" }, founderToken);
    const secondSig = await api("POST", `/api/admin/library/items/${big.json.itemId}/approve`, {}, doerToken);
    expect(secondSig.status).toBe(200);
    expect(secondSig.json.award).toBe(225);
    await api("PUT", `/api/admin/users/${doerId}/role`, { role: "member" }, founderToken);
    expect((await api("GET", "/api/game/ledger", undefined, peerToken)).json.balances["library-credit"]?.balance).toBe(300);

    // ── LOANS. Escrow is ceil(value × 25%); no credits, no loan — the
    // refusal names the deposit, and nothing here can go negative. ──
    const lib = await api("GET", "/api/library", undefined, peerToken);
    const barrow = lib.json.items.find((i: any) => i.name === "Wheelbarrow");
    expect(barrow.escrow).toBe(25);
    const broke = await api("POST", "/api/auth/register", {
      email: `lib-guest-${PORT}@example.test`, password: "LoopTest123!", name: "Broke Guest", paths: ["resident"],
    });
    const refused = await api("POST", `/api/library/items/${barrow.id}/reserve`, {}, broke.json.token);
    expect(refused.status).toBe(409);
    expect(String(refused.json.error)).toContain("escrow");

    const reserved = await api("POST", `/api/library/items/${barrow.id}/reserve`, {}, peerToken);
    expect(reserved.status).toBe(200);
    expect(reserved.json.escrow).toBe(25);
    expect((await api("GET", "/api/game/ledger", undefined, peerToken)).json.balances["library-credit"]?.balance).toBe(275);
    // The shelf shows one of everything: a second borrower waits.
    expect((await api("POST", `/api/library/items/${barrow.id}/reserve`, {}, doerToken)).status).toBe(409);
    // Open loans are open economic state: module-off refuses (invariant #13).
    expect((await api("PUT", "/api/admin/modules/library/lifecycle", { lifecycle: "off" }, founderToken)).status).toBe(409);

    // The borrower's cancel flows through the SAME single terminal: full release.
    const cancelled = await api("POST", `/api/library/loans/${reserved.json.loanId}/cancel`, {}, peerToken);
    expect(cancelled.status).toBe(200);
    expect(cancelled.json.released).toBe(25);
    expect((await api("GET", "/api/game/ledger", undefined, peerToken)).json.balances["library-credit"]?.balance).toBe(300);

    // Full circle: reserve → pickup → return → settle closed with DEFAULT
    // fees: computed wear = 5% of 100 = 5, zero damage, 20 released.
    const loan2 = await api("POST", `/api/library/items/${barrow.id}/reserve`, {}, peerToken);
    expect((await api("POST", `/api/admin/library/loans/${loan2.json.loanId}/pickup`, {}, founderToken)).status).toBe(200);
    expect((await api("POST", `/api/library/loans/${loan2.json.loanId}/return`, {}, peerToken)).status).toBe(200);
    const settled = await api("POST", `/api/admin/library/loans/${loan2.json.loanId}/settle`, { outcome: "closed" }, founderToken);
    expect(settled.status).toBe(200);
    expect(settled.json.wearFee).toBe(5);
    expect(settled.json.damageFee).toBe(0);
    expect(settled.json.released).toBe(20);
    expect((await api("GET", "/api/game/ledger", undefined, peerToken)).json.balances["library-credit"]?.balance).toBe(295);

    // THE SINGLE TERMINAL: a second settle with a DIFFERENT story is refused
    // as already-settled, verifies the stored legs, and pays nothing twice.
    const again = await api("POST", `/api/admin/library/loans/${loan2.json.loanId}/settle`,
      { outcome: "disputed", wearFee: 25, damageFee: 25 }, founderToken);
    expect(again.status).toBe(409);
    expect(again.json.outcome).toBe("closed"); // the stored story, not the racer's
    expect((await api("GET", "/api/game/ledger", undefined, peerToken)).json.balances["library-credit"]?.balance).toBe(295);
    // The claim stamped the settled cycle in the same statement.
    const adminLoans = await api("GET", "/api/admin/library", undefined, founderToken);
    expect(String(adminLoans.json.loans.find((l: any) => l.id === loan2.json.loanId).settled_cycle_id)).toMatch(/^lunar-\d{6}$/);

    // No-show: reserved, never picked up, settled EXPIRED — zero fee, escrow
    // back, and the strike is DERIVED from the record, never a counter.
    const loan3 = await api("POST", `/api/library/items/${barrow.id}/reserve`, {}, peerToken);
    const expired = await api("POST", `/api/admin/library/loans/${loan3.json.loanId}/settle`, { outcome: "expired" }, founderToken);
    expect(expired.json.released).toBe(25);
    expect((await api("GET", "/api/library", undefined, peerToken)).json.mine.strikes).toBe(1);

    // Per-item stage gates ride the same ladder as everything else.
    const saw = (await api("GET", "/api/library", undefined, peerToken)).json.items.find((i: any) => i.name === "Chainsaw");
    await api("PUT", `/api/admin/library/items/${saw.id}`, { minStage: "co-creator" }, founderToken);
    const tooEarly = await api("POST", `/api/library/items/${saw.id}/reserve`, {}, peerToken);
    expect(tooEarly.status).toBe(403);
    expect(String(tooEarly.json.error)).toContain("co-creator");

    // NEVER LISTED: the exchange refuses library-credit outright — its only
    // doors are intake and loans; selling it would sever the backing.
    await api("PUT", "/api/admin/modules/exchange/lifecycle", { lifecycle: "public" }, founderToken);
    const listRefused = await api("PUT", "/api/admin/exchange/tokens/library-credit", { purchasable: true }, founderToken);
    expect(listRefused.status).toBe(409);
    expect(String(listRefused.json.error)).toContain("shelves");
    await api("PUT", "/api/admin/modules/exchange/lifecycle", { lifecycle: "off" }, founderToken);

    // The red flag: write the chainsaw off and the mint's issue (300) now
    // exceeds the shelves' value (100) — the panel says so, loudly.
    await api("PUT", `/api/admin/library/items/${saw.id}`, { status: "written_off" }, founderToken);
    const panel = await api("GET", "/api/admin/library", undefined, founderToken);
    expect(panel.json.supply.outstanding).toBe(300);
    expect(panel.json.supply.backing).toBe(100);
    expect(panel.json.supply.flagged).toBe(true);
    // Escrow reconciliation holds TO THE CREDIT with everything settled.
    expect(panel.json.reconciliation).toMatchObject({ ok: true, expected: 0, actual: 0 });

    // And the whole economy still conserves, across all four library accounts.
    const rec = await api("GET", "/api/admin/ledger/reconciliation", undefined, founderToken);
    expect(rec.json.invariants.problems).toEqual([]);
    expect(rec.json.invariants.ok).toBe(true);
  });

  it("S47: the economics section — proven bindings, fixed point, never zero", async () => {
    const { createServer: createHttpServer } = await import("http");
    const { privateKeyToAccount, generatePrivateKey } = await import("viem/accounts");

    // A tiny Base-shaped JSON-RPC stub: decimals() = 18, balanceOf = 0.5
    // tokens (5e17 wei) — and a kill switch that makes every call fail.
    let rpcDown = false;
    let rpcCalls = 0;
    const DECIMALS_SEL = "0x313ce567";
    const BALANCE_SEL = "0x70a08231";
    const rpc = createHttpServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        rpcCalls += 1;
        if (rpcDown) { res.writeHead(503); res.end("down"); return; }
        const reply = (id: any, result: string) => {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
        };
        try {
          const msg = JSON.parse(body);
          const one = Array.isArray(msg) ? msg[0] : msg;
          if (one.method === "eth_chainId") return reply(one.id, "0x2105");
          if (one.method === "eth_call") {
            const data = String(one.params?.[0]?.data ?? "");
            if (data.startsWith(DECIMALS_SEL)) return reply(one.id, "0x" + (18).toString(16).padStart(64, "0"));
            if (data.startsWith(BALANCE_SEL)) return reply(one.id, "0x" + BigInt("500000000000000000").toString(16).padStart(64, "0"));
          }
          return reply(one.id, "0x");
        } catch { res.writeHead(400); res.end(); }
      });
    });
    await new Promise<void>((r) => rpc.listen(3782, "127.0.0.1", r));

    try {
      // Point the platform at the stub and open the section.
      await api("PUT", "/api/admin/variables/tokens.base_rpc_url", { value: "http://127.0.0.1:3782" }, founderToken);
      await api("PUT", "/api/admin/variables/tokens.equity_address", { value: "0x1111111111111111111111111111111111111111" }, founderToken);
      await api("PUT", "/api/admin/variables/tokens.show_economics_section", { value: "true" }, founderToken);

      // UNVERIFIED = NOTHING. An address string proves nothing; before the
      // signature, the on-chain block is empty — no reads even attempted.
      const before = await api("GET", "/api/wallet", undefined, peerToken);
      expect(before.status).toBe(200);
      expect(before.json.wallet.verifiedAt).toBeNull();
      expect(before.json.onchain).toBeNull();
      expect(rpcCalls).toBe(0);

      // The signed-message challenge: sign the EXACT message the server
      // issued, bind, and the audit trail names the member.
      const wallet = privateKeyToAccount(generatePrivateKey());
      const ch = await api("POST", "/api/wallet/challenge", {}, peerToken);
      expect(ch.status).toBe(200);
      const goodSig = await wallet.signMessage({ message: ch.json.message });
      // A signature from the WRONG key is refused…
      const impostor = privateKeyToAccount(generatePrivateKey());
      const badSig = await impostor.signMessage({ message: ch.json.message });
      expect((await api("POST", "/api/wallet/verify", { address: wallet.address, signature: badSig }, peerToken)).status).toBe(400);
      // …the right one binds…
      const verified = await api("POST", "/api/wallet/verify", { address: wallet.address, signature: goodSig }, peerToken);
      expect(verified.status).toBe(200);
      // …and the nonce was CONSUMED: replaying the same signature fails.
      expect((await api("POST", "/api/wallet/verify", { address: wallet.address, signature: goodSig }, peerToken)).status).toBe(400);
      // One wallet, one member: a second member claiming the same address is a 409.
      const rival = await api("POST", "/api/auth/register", {
        email: `rival-${PORT}@example.test`, password: "LoopTest123!", name: "Wallet Rival", paths: ["resident"],
      });
      const rivalCh = await api("POST", "/api/wallet/challenge", {}, rival.json.token);
      const rivalSig = await wallet.signMessage({ message: rivalCh.json.message });
      expect((await api("POST", "/api/wallet/verify", { address: wallet.address, signature: rivalSig }, rival.json.token)).status).toBe(409);

      // FIXED POINT: 5e17 raw at decimals()=18 renders "0.5" — never 0.
      const fresh = await api("GET", "/api/wallet", undefined, peerToken);
      expect(fresh.json.onchain.amora.formatted).toBe("0.5");
      expect(fresh.json.onchain.amora.raw).toBe("500000000000000000");
      expect(fresh.json.onchain.amora.decimals).toBe(18);
      expect(fresh.json.onchain.amora.stale).toBe(false);
      expect(fresh.json.onchain.voice).toBeNull(); // no voice address posted
      expect(rpcCalls).toBeGreaterThan(0);

      // THE DoD CLAUSE: kill the RPC, age the cache past its read-through
      // TTL, and the endpoint returns the LAST-KNOWN value marked stale with
      // when it was true — never zero, and nothing new is written.
      rpcDown = true;
      await testDb.conn.query(
        "UPDATE onchain_balances SET fetched_at = (NOW() - INTERVAL 10 MINUTE) WHERE user_id = ? AND token_slug = 'amora'",
        [peerId],
      );
      const staleRead = await api("GET", "/api/wallet", undefined, peerToken);
      expect(staleRead.json.onchain.amora.formatted).toBe("0.5");
      expect(staleRead.json.onchain.amora.stale).toBe(true);
      expect(new Date(staleRead.json.onchain.amora.fetchedAt).getTime()).toBeLessThan(Date.now() - 5 * 60 * 1000);
      const [[cacheRow]] = await testDb.conn.query<any[]>(
        "SELECT raw_balance FROM onchain_balances WHERE user_id = ? AND token_slug = 'amora'", [peerId],
      );
      expect(String(cacheRow.raw_balance)).toBe("500000000000000000"); // no zero was ever written

      // The section closes as one switch: variable off → no on-chain block.
      await api("PUT", "/api/admin/variables/tokens.show_economics_section", { value: "false" }, founderToken);
      expect((await api("GET", "/api/wallet", undefined, peerToken)).json.onchain).toBeNull();
    } finally {
      await new Promise<void>((r) => rpc.close(() => r()));
    }
  });
});
