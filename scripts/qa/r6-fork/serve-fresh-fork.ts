/**
 * Boot the built server against a brand-new empty schema and LEAVE IT UP, so a
 * human (or a browser) can look at what a fork publishes on day one.
 *
 * This is the R55 question in the brief, and it cannot be answered from a
 * payload: at zero people and zero milestones, does /team read as young or as
 * broken? Three headings over an empty grid passes every assertion about what
 * a village does not publish and still looks like a broken page.
 *
 * Ctrl-C drops the schema. Prints the URL and the schema name on the way up.
 *
 * Run: npx tsx -r dotenv/config scripts/qa/r6-fork/serve-fresh-fork.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { provisionTestDb, testDbConfigured, E2E_BOOT_DEADLINE_MS } from "../../../server/db/testDb";

const DIST = path.resolve(process.cwd(), "dist/index.js");
const PORT = Number(process.env.FORK_PREVIEW_PORT ?? 6750);
const BASE = `http://localhost:${PORT}`;

async function main() {
  if (!testDbConfigured()) throw new Error("TEST_DATABASE_URL is not set");
  if (!fs.existsSync(DIST)) throw new Error("dist/index.js missing; pnpm build first");
  const db = await provisionTestDb();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fork-preview-"));
  let child: ChildProcess | undefined;
  const shutdown = async () => {
    child?.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
    await db.drop().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  child = spawn(process.execPath, [DIST], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      DATA_DIR: dataDir,
      DATABASE_URL: db.url,
      ADMIN_PASSWORD: "fork-preview-admin",
      AUTH_TOKEN_SECRET: "fork-preview-secret",
      RESEND_API_KEY: "",
      ANTHROPIC_API_KEY: "",
    },
    stdio: ["ignore", "inherit", "inherit"],
  });

  const deadline = Date.now() + E2E_BOOT_DEADLINE_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error("no boot in time");
    try {
      if ((await fetch(`${BASE}/health`)).ok) break;
    } catch {
      /* not up */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  console.log(`\nA fresh fork is serving at ${BASE}`);
  console.log(`Schema: ${new URL(db.url).pathname.slice(1)}. Ctrl-C drops it.\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
