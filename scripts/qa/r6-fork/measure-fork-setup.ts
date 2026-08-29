/**
 * Lane FORK, coordinator addenda 1 and 2. The two setup steps a founder meets
 * before anything else, measured on the state a fork actually boots in.
 *
 *   1. POST /api/admin/bootstrap with NO email provider configured, which is
 *      every fresh install. What does it tell the operator about the founder's
 *      claim link, and is that true?
 *   2. scripts/enable-all-modules.mjs, the command docs/FORK_RUNBOOK.md tells a
 *      fork to run. Does it complete, and does the operator know what state
 *      their village is in afterwards?
 *
 * Run: npx tsx -r dotenv/config scripts/qa/r6-fork/measure-fork-setup.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { provisionTestDb, testDbConfigured, E2E_BOOT_DEADLINE_MS } from "../../../server/db/testDb";

const DIST = path.resolve(process.cwd(), "dist/index.js");
const PORT = 6720;
const BASE = `http://localhost:${PORT}`;
const ADMIN = "fork-setup-admin";

async function main() {
  if (!testDbConfigured()) throw new Error("TEST_DATABASE_URL is not set");
  if (!fs.existsSync(DIST)) throw new Error("dist/index.js missing; pnpm build first");
  const db = await provisionTestDb();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fork-setup-"));
  let child: ChildProcess | undefined;
  const logs: string[] = [];
  try {
    child = spawn(process.execPath, [DIST], {
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(PORT),
        DATA_DIR: dataDir,
        DATABASE_URL: db.url,
        ADMIN_PASSWORD: ADMIN,
        AUTH_TOKEN_SECRET: "fork-setup-secret",
        // The state every fork boots in: no mail provider, no sender.
        RESEND_API_KEY: "",
        EMAIL_FROM: "",
        ANTHROPIC_API_KEY: "",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout?.on("data", (d) => logs.push(String(d)));
    child.stderr?.on("data", (d) => logs.push(String(d)));
    const deadline = Date.now() + E2E_BOOT_DEADLINE_MS;
    for (;;) {
      if (Date.now() > deadline) throw new Error(`no boot:\n${logs.join("")}`);
      try {
        if ((await fetch(`${BASE}/health`)).ok) break;
      } catch {
        /* not up */
      }
      await new Promise((r) => setTimeout(r, 400));
    }

    // ── 1. the founder's claim link ──────────────────────────────────────
    const email = "founder@example.test";
    const boot = await fetch(`${BASE}/api/admin/bootstrap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: ADMIN, email, name: "Fork Founder" }),
    });
    const body: any = await boot.json();
    console.log("\n=== POST /api/admin/bootstrap, no email provider ===");
    console.log("  status   :", boot.status);
    console.log("  emailed  :", body.emailed);
    console.log("  emailNote:", body.emailNote ?? "(none)");
    console.log("  claimUrl :", body.claimUrl ? "returned" : "MISSING");
    const mailLog = logs.join("").match(/\[RESEND\][^\n]*/g) ?? [];
    console.log("  server log on the same request:", JSON.stringify(mailLog));

    const claim = decodeURIComponent(String(body.claimUrl ?? "").match(/token=([^&]+)/)?.[1] ?? "");
    const setPw = await fetch(`${BASE}/api/auth/set-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: claim, password: "ForkSetup123!" }),
    }).then((r) => r.json());
    console.log("  the link on screen actually works:", !!setPw?.token);

    // ── 2. the runbook's module step ─────────────────────────────────────
    console.log("\n=== node scripts/enable-all-modules.mjs ===");
    const run = spawnSync(
      process.execPath,
      [
        path.resolve(process.cwd(), "scripts/enable-all-modules.mjs"),
        "--base", BASE,
        "--email", email,
        "--password", "ForkSetup123!",
      ],
      { encoding: "utf-8" },
    );
    console.log(run.stdout);
    if (run.stderr) console.log("STDERR:", run.stderr);
    console.log("  exit code:", run.status);
  } finally {
    child?.kill();
    fs.rmSync(dataDir, { recursive: true, force: true });
    await db.drop();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
