/**
 * Share cards and crew access, proven over HTTP against the BUILT server.
 *
 * A typecheck proves nothing here. The whole point of a share card is the
 * bytes a crawler receives, and a crawler runs no JavaScript: whatever the
 * React app would have painted in later is invisible to it. So these cases
 * fetch like a scraper does and read the response.
 *
 * The failure this guards against is specific and quiet. client/index.html is
 * neutral by construction and carries `og:title` of "Village" for every page
 * of every deployment. If the per-request injection stops running, or appends
 * instead of replacing, every shared quest link silently goes back to
 * unfurling as a generic card, and nothing else in the suite notices.
 *
 * Skips loudly without TEST_DATABASE_URL, like every DB-backed suite here.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { spawn, type ChildProcess } from "child_process";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionTestDb, testDbConfigured, type TestDb } from "./db/testDb";

const DB_CONFIGURED = testDbConfigured();
if (!DB_CONFIGURED) {
  // eslint-disable-next-line no-console
  console.warn("[quest-share] TEST_DATABASE_URL not set — DB-backed tests SKIPPED.");
}

const DIST = path.resolve(process.cwd(), "dist/index.js");
// Its own port range: this suite can share a vitest run with the other two.
const PORT = 6800 + (process.pid % 900);
const BASE = `http://localhost:${PORT}`;
const ADMIN = "quest-share-admin";
// Seeded by server/seeds/quests-seed.json on a fresh village.
const QUEST_ID = "q-welcome-ambassador";

let child: ChildProcess | undefined;
let testDb: TestDb | undefined;
let dataDir = "";

const countOf = (html: string, re: RegExp) => (html.match(re) ?? []).length;

beforeAll(async () => {
  if (!DB_CONFIGURED) return;
  if (!fs.existsSync(DIST)) {
    throw new Error(`${DIST} is missing. Run \`pnpm build\` before the quest share test.`);
  }
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "village-share-"));
  testDb = await provisionTestDb();

  child = spawn(process.execPath, [DIST], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      DATA_DIR: dataDir,
      DATABASE_URL: testDb.url,
      ADMIN_PASSWORD: ADMIN,
      AUTH_TOKEN_SECRET: "quest-share-token-secret",
      RESEND_API_KEY: "",
      ANTHROPIC_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const logs: string[] = [];
  child.stdout?.on("data", (d) => logs.push(String(d)));
  child.stderr?.on("data", (d) => logs.push(String(d)));

  const deadline = Date.now() + 120_000;
  for (;;) {
    if (Date.now() > deadline) {
      throw new Error(`server did not start in 120s. Output:\n${logs.join("")}`);
    }
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
}, 300_000);

afterAll(async () => {
  child?.kill();
  await testDb?.drop();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

describe.skipIf(!DB_CONFIGURED)("a shared quest link", () => {
  it("carries the quest's own title, not the neutral shell's", async () => {
    const html = await (await fetch(`${BASE}/quests/${QUEST_ID}`)).text();
    expect(html).toContain('property="og:title"');
    expect(html).toMatch(/og:title" content="Welcome Ambassador at /);
    // The neutral value must be GONE, not merely outnumbered.
    expect(html).not.toMatch(/og:title" content="Village"/);
  });

  it("carries exactly one of each tag a crawler reads", async () => {
    const html = await (await fetch(`${BASE}/quests/${QUEST_ID}`)).text();
    expect(countOf(html, /property="og:title"/g)).toBe(1);
    expect(countOf(html, /property="og:description"/g)).toBe(1);
    expect(countOf(html, /<title>/g)).toBe(1);
    expect(countOf(html, /name="description"/g)).toBe(1);
  });

  it("points at its own share image, and at itself", async () => {
    const html = await (await fetch(`${BASE}/quests/${QUEST_ID}`)).text();
    expect(html).toMatch(new RegExp(`og:image" content="[^"]*/api/og/quest/${QUEST_ID}"`));
    expect(html).toContain('name="twitter:card" content="summary_large_image"');
    expect(html).toMatch(new RegExp(`rel="canonical" href="[^"]*/quests/${QUEST_ID}"`));
  });

  it("still serves the app, so the page works for a person too", async () => {
    const res = await fetch(`${BASE}/quests/${QUEST_ID}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain('<div id="root">');
    // A stale shell is a white screen, so this one is never cached hard.
    expect(res.headers.get("cache-control")).toContain("no-cache");
  });

  it("describes the board itself at /quests", async () => {
    const html = await (await fetch(`${BASE}/quests`)).text();
    expect(html).toMatch(/og:title" content="Quests at /);
  });

  it("falls through to the app for a quest that is not there", async () => {
    const res = await fetch(`${BASE}/quests/q-was-retired-long-ago`);
    expect(res.status).toBe(200);
    const html = await res.text();
    // No invented card for a quest that does not exist: the app says it.
    expect(html).not.toMatch(/og:title" content="q-was-retired/);
  });
});

describe.skipIf(!DB_CONFIGURED)("the share image", () => {
  it("is a real JPEG at the size unfurlers crop to", async () => {
    const res = await fetch(`${BASE}/api/og/quest/${QUEST_ID}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("image/jpeg");
    const bytes = Buffer.from(await res.arrayBuffer());
    // JPEG SOI marker, then the real dimensions read back out of the bytes.
    expect(bytes.subarray(0, 3).toString("hex")).toBe("ffd8ff");
    const meta = await sharp(bytes).metadata();
    expect(meta.width).toBe(1200);
    expect(meta.height).toBe(630);
  });

  it("stays under the per-image budget the rest of the platform keeps", async () => {
    // The same card is 1278 KB as a PNG. CI caps any single shipped image at
    // 400 KB, and a generated one has no excuse to be the exception.
    const res = await fetch(`${BASE}/api/og/quest/${QUEST_ID}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.length).toBeLessThan(400 * 1024);
  });

  it("serves a cached card with the right type on the second ask", async () => {
    // The cache branch returns early, so it sets its own content type and can
    // drift from the one the renderer sets.
    await fetch(`${BASE}/api/og/quest/${QUEST_ID}`);
    const res = await fetch(`${BASE}/api/og/quest/${QUEST_ID}`);
    expect(res.headers.get("content-type")).toContain("image/jpeg");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 3).toString("hex")).toBe("ffd8ff");
  });

  it("renders for a quest with no poster of its own", async () => {
    // Every seeded quest carries a poster path, and on a fresh village the
    // FILES are not there, so this is also the fallback-to-scene path.
    const res = await fetch(`${BASE}/api/og/quest/q-circle-scribe`);
    expect(res.status).toBe(200);
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.subarray(0, 3).toString("hex")).toBe("ffd8ff");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("refuses a quest that does not exist", async () => {
    const res = await fetch(`${BASE}/api/og/quest/q-nope`);
    expect(res.status).toBe(404);
  });
});

describe.skipIf(!DB_CONFIGURED)("crew privacy", () => {
  it("never tells a signed-out reader who is walking with whom", async () => {
    const res = await fetch(`${BASE}/api/quests/${QUEST_ID}/crews`);
    expect(res.status).toBe(401);
  });

  it("refuses to open a crew without a member behind it", async () => {
    const res = await fetch(`${BASE}/api/quests/${QUEST_ID}/crews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Uninvited" }),
    });
    expect(res.status).toBe(401);
  });

  it("refuses an invite nobody minted", async () => {
    const res = await fetch(`${BASE}/api/crews/join/not-a-real-code`, { method: "POST" });
    expect(res.status).toBe(401);
  });
});
