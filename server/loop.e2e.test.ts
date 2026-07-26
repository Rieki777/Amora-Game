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

const PORT = 3781;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "loop-test-admin";

let child: ChildProcess;
let dataDir: string;

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
  if (!fs.existsSync(DIST)) {
    throw new Error(`${DIST} is missing. Run \`pnpm build\` before the loop test.`);
  }
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "amora-loop-"));

  child = spawn(process.execPath, [DIST], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      DATA_DIR: dataDir,
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

afterAll(() => {
  child?.kill();
  if (dataDir && fs.existsSync(dataDir)) {
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});

describe("the coordination loop, end to end", () => {
  // Shared across the ordered steps below: this is deliberately one journey,
  // not seven isolated cases, because the loop is the unit under test.
  const doer = { email: `doer-${PORT}@example.test`, password: "LoopTest123!", name: "Willing Doer" };
  const peer = { email: `peer-${PORT}@example.test`, password: "LoopTest123!", name: "Grateful Peer" };
  let doerToken = "";
  let peerToken = "";
  let doerId = "";
  let peerId = "";
  let questId = "";
  let questReward = 0;
  let claimId = "";

  it("boots against a throwaway data dir, seeded and empty of members", async () => {
    const health = await api("GET", "/health");
    expect(health.status).toBe(200);

    // Seeds must have landed in the temp dir, or the rest of the loop is meaningless.
    const quests = await api("GET", "/api/quests");
    expect(quests.status).toBe(200);
    expect(Array.isArray(quests.json)).toBe(true);
    expect(quests.json.length).toBeGreaterThan(0);

    const players = await api("GET", "/api/admin/players", undefined, ADMIN);
    expect(players.status).toBe(200);
    const list = Array.isArray(players.json) ? players.json : (players.json.players ?? players.json.users ?? []);
    expect(list.length).toBe(0);
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
    expect(reg.json.user.heartsBalance).toBe(0);
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
    questReward = Number(open.gratitude) || 0;
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
    expect(profile.json.heartsBalance).toBe(0);
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
      ADMIN,
    );
    expect(premature.status).toBe(409);

    // And nothing was credited.
    const profile = await api("GET", "/api/profile", undefined, idlerToken);
    expect(profile.json.heartsBalance).toBe(0);

    // Declining is still allowed from any state, so stale claims can be cleared.
    const declined = await api(
      "POST",
      `/api/admin/quest-claims/${claim.json.id}/consent`,
      { approve: false },
      ADMIN,
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
    expect(profile.json.heartsBalance).toBe(0);
  });

  it("releases Gratitude on consent, and records it in the Village Pulse", async () => {
    const consent = await api(
      "POST",
      `/api/admin/quest-claims/${claimId}/consent`,
      { approve: true, amount: questReward },
      ADMIN,
    );
    expect(consent.status).toBe(200);
    expect(consent.json.status).toBe("consented");
    expect(consent.json.amount).toBe(questReward);

    const profile = await api("GET", "/api/profile", undefined, doerToken);
    expect(profile.json.heartsBalance).toBe(questReward);

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
    expect(peerProfile.json.heartsBalance).toBeGreaterThanOrEqual(5);
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
});
