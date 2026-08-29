/**
 * THE PACKET STOPS SENDING EVERYTHING TO EVERYONE.
 *
 * `POST /api/investor-docs/request` is public and unauthenticated. It took
 * `{name, email, accredited}` from anybody and then read the WHOLE vault:
 *
 *     const docs: any[] = investorDocsRepo.all();
 *
 * Every row became a download link in an email sent to whatever address the
 * requester typed. There was no per-document gate anywhere in the path, and
 * the vault is where a founder keeps the cap table. `/api/uploads/<file>` has
 * no authentication of its own, so a link, once emailed, is a bearer
 * credential that never expires and can be forwarded.
 *
 * These tests drive the built server over HTTP, and the request itself is
 * made with no account and no session, because that is how the leak was
 * reachable.
 *
 * The oracle is the lead record rather than the email body. `sendResendEmail`
 * posts to a hardcoded `https://api.resend.com/emails` with no test seam, so
 * the outbound HTML is not observable from here. The route now writes the
 * packet it chose into the submission row, which is a founder-facing feature
 * in its own right (answering "what did this person actually receive" a year
 * later), and it is the same list the email is built from. Asserting on it
 * asserts on the product rather than on a mock.
 *
 * Skips loudly without TEST_DATABASE_URL, like every DB-backed suite here.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionTestDb, testDbConfigured, type TestDb, E2E_BOOT_DEADLINE_MS } from "./db/testDb";

const DB_CONFIGURED = testDbConfigured();
if (!DB_CONFIGURED) {
  console.warn("[investorPacket.routes] TEST_DATABASE_URL not set, DB-backed tests SKIPPED.");
}

const DIST = path.resolve(process.cwd(), "dist/index.js");
// Its own port range: 15500-15899, clear of every other band in this suite set.
const PORT = 15500 + (process.pid % 400);
const BASE = `http://localhost:${PORT}`;
const ADMIN = "packet-admin";

/**
 * The vault holds two documents for every test below. Only ever ONE of them
 * is put in the packet, so any assertion that the other one travelled is an
 * assertion that the leak is back.
 */
const CHOSEN = "Cap Table 2026";
const WITHHELD = "Board Minutes March";

let child: ChildProcess | undefined;
let testDb: TestDb | undefined;
let dataDir = "";
let founderToken = "";
let chosenId = "";
let withheldId = "";

async function call(method: string, route: string, body?: unknown, token = founderToken) {
  const res = await fetch(BASE + route, { // module-review-ok: the test client dialling the built server on localhost, as every e2e suite does
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* non-JSON stays visible through text */ }
  return { status: res.status, json, text };
}

/** Seed a vault document the way the product does, through the admin route. */
async function uploadDoc(title: string) {
  const form = new FormData();
  const bytes = Buffer.from(`${title}\nconfidential fixture body\n`, "utf8");
  form.append("file", new Blob([new Uint8Array(bytes)], { type: "text/plain" }), `${title}.txt`);
  form.append("name", title);
  const res = await fetch(`${BASE}/api/admin/investor-docs/upload`, { // module-review-ok: the test client dialling the built server on localhost
    method: "POST",
    headers: { Authorization: `Bearer ${founderToken}` },
    body: form,
  });
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* keep text */ }
  return { status: res.status, json, text };
}

/** The public form, with no account and no session. That is the point. */
async function requestPacket(name: string, email: string) {
  return call("POST", "/api/investor-docs/request", { name, email, accredited: true }, "");
}

/** The lead the route just captured, newest first. */
async function newestLead() {
  const res = await call("GET", "/api/admin/submissions?type=investor-doc-request");
  expect(res.status, res.text).toBe(200);
  expect(Array.isArray(res.json), res.text).toBe(true);
  return res.json[0];
}

beforeAll(async () => {
  if (!DB_CONFIGURED) return;
  if (!fs.existsSync(DIST)) {
    throw new Error(`${DIST} is missing. Run \`pnpm build\` before the investor packet test.`);
  }
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "village-packet-"));
  testDb = await provisionTestDb();

  child = spawn(process.execPath, [DIST], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      DATA_DIR: dataDir,
      DATABASE_URL: testDb.url,
      ADMIN_PASSWORD: ADMIN,
      AUTH_TOKEN_SECRET: "packet-token-secret", // module-review-ok: a fixture signing secret for a throwaway server on a scratch schema, same as every e2e suite
      RESEND_API_KEY: "",
      ANTHROPIC_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const logs: string[] = [];
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
    password: ADMIN, email: `founder-${PORT}@example.test`, name: "Packet Founder",
  }, "");
  const claim = decodeURIComponent(String(boot.json?.claimUrl ?? "").match(/token=([^&]+)/)?.[1] ?? "");
  const setPw = await call("POST", "/api/auth/set-password", { token: claim, password: "PacketTest123!" }, "");
  founderToken = String(setPw.json?.token ?? "");
  expect(founderToken, "founder must hold a session").toBeTruthy();

  const a = await uploadDoc(CHOSEN);
  expect(a.status, a.text).toBe(200);
  chosenId = String(a.json?.id ?? "");
  const b = await uploadDoc(WITHHELD);
  expect(b.status, b.text).toBe(200);
  withheldId = String(b.json?.id ?? "");
  expect(chosenId && withheldId, "both fixture documents must be in the vault").toBeTruthy();
});

afterAll(async () => {
  child?.kill();
  await testDb?.drop();
  try { fs.rmSync(dataDir, { recursive: true, force: true }); } catch { /* gone */ }
});

describe.skipIf(!DB_CONFIGURED)("the investor packet only sends what a person chose", () => {
  it("the fixtures really are in the vault, or nothing below means anything", async () => {
    const res = await call("GET", "/api/admin/investor-docs");
    expect(res.status, res.text).toBe(200);
    const titles = res.json.map((d: any) => d.title);
    expect(titles).toContain(CHOSEN);
    expect(titles).toContain(WITHHELD);
    // Nothing is in the packet until somebody says so.
    expect(res.json.every((d: any) => d.inPacket === false), res.text).toBe(true);
  });

  /*
   * THE REGRESSION THAT MATTERS MOST. Two documents sit in the vault and a
   * stranger asks for the packet. Before this fix both of them were emailed.
   */
  it("sends no documents at all when nobody has chosen any", async () => {
    const res = await requestPacket("Curious Stranger", "stranger@example.test");
    expect(res.status, res.text).toBe(200);

    /*
     * This assertion is FIRST on purpose. It is the one that means something
     * against the unfixed tree: there, with two unchosen documents sitting in
     * the vault, the route answers "Check your email for the documents." and
     * the documents really are on their way. Everything below it can only
     * report that a field or a route does not exist yet, which is a weaker
     * kind of red. The requester must never be told they were sent something
     * they were not sent.
     */
    expect(
      String(res.json?.message ?? "").toLowerCase(),
      "the route promised documents when nothing had been chosen",
    ).not.toContain("document");

    expect(res.json?.documentsSent, "a packet went out with nothing chosen").toBe(0);

    const lead = await newestLead();
    expect(lead?.data?.email).toBe("stranger@example.test");
    expect(lead?.data?.documentsSent, "the lead record must say what was sent").toEqual([]);
  });

  it("sends the chosen document and withholds the one nobody chose", async () => {
    const set = await call("PATCH", `/api/admin/investor-docs/${chosenId}`, { inPacket: true });
    expect(set.status, set.text).toBe(200);
    expect(set.json?.inPacket).toBe(true);

    const res = await requestPacket("Real Investor", "investor@example.test");
    expect(res.status, res.text).toBe(200);
    expect(res.json?.documentsSent).toBe(1);

    const lead = await newestLead();
    expect(lead?.data?.email).toBe("investor@example.test");
    const sent = (lead?.data?.documentsSent ?? []).map((d: any) => d.title);
    expect(sent, "the chosen document did not travel").toContain(CHOSEN);
    expect(sent, "an unchosen document travelled anyway").not.toContain(WITHHELD);
    expect(sent).toHaveLength(1);
  });

  it("keeps the choice behind the admin gate", async () => {
    const res = await call("PATCH", `/api/admin/investor-docs/${withheldId}`, { inPacket: true }, "");
    expect(res.status, res.text).toBe(401);

    const after = await call("GET", "/api/admin/investor-docs");
    const withheld = after.json.find((d: any) => d.id === withheldId);
    expect(withheld?.inPacket, "an anonymous caller moved a document into the packet").toBe(false);
  });
});
