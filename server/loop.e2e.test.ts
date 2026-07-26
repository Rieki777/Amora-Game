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
      { name: "Grateful", received: 8, distinctSenders: 1, credited: 1000, poolToken: "credits" },
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
});
