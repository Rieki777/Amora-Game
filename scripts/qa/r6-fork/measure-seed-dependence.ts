/**
 * Lane FORK, brief section 3. THE measurement that decides the shape of the fix.
 *
 * Question: does a configured village's org chart come from the DATABASE, or
 * from `server/seeds/org-chart-2026-08.json` at boot or at request time?
 *
 * Two runs against ONE schema, so run B is literally the state run A left:
 *
 *   A  empty schema  -> boot -> read the signed-out surfaces. This is the fork.
 *   B  same schema, THE SEED FILES MOVED ASIDE -> boot again -> read the same
 *      surfaces. This is a village that was seeded once and has since been
 *      running, which is exactly Amora. If B still serves the chart, live does
 *      not depend on the files and they are example content.
 *
 * Run: npx tsx scripts/qa/r6-fork/measure-seed-dependence.ts
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { provisionTestDb, testDbConfigured, E2E_BOOT_DEADLINE_MS } from "../../../server/db/testDb";

const DIST = path.resolve(process.cwd(), "dist/index.js");
const PORT = 6710;
const BASE = `http://localhost:${PORT}`;
const SEEDS = path.resolve(process.cwd(), "server/seeds");
const MOVED = ["org-chart-2026-08.json", "org-chart-corrections-2026-08.json"];

async function boot(url: string, dataDir: string): Promise<{ child: ChildProcess; logs: string[] }> {
  const logs: string[] = [];
  const child = spawn(process.execPath, [DIST], {
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(PORT),
      DATA_DIR: dataDir,
      DATABASE_URL: url,
      ADMIN_PASSWORD: "fork-measure-admin",
      AUTH_TOKEN_SECRET: "fork-measure-secret",
      RESEND_API_KEY: "",
      ANTHROPIC_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (d) => logs.push(String(d)));
  child.stderr?.on("data", (d) => logs.push(String(d)));
  const deadline = Date.now() + E2E_BOOT_DEADLINE_MS;
  for (;;) {
    if (Date.now() > deadline) throw new Error(`no boot in time:\n${logs.join("")}`);
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) break;
    } catch {
      /* not up */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return { child, logs };
}

async function readSurfaces(label: string) {
  const org = await fetch(`${BASE}/api/org`).then((r) => r.json()).catch(() => null);
  const team = await fetch(`${BASE}/api/content/team`).then((r) => r.json()).catch(() => null);
  const roles = await fetch(`${BASE}/api/content/roles`).then((r) => r.json()).catch(() => null);
  const milestones = await fetch(`${BASE}/api/milestones`).then((r) => r.json()).catch(() => null);
  const holders: string[] = [];
  for (const r of org?.roles ?? []) for (const h of r.holders ?? []) holders.push(String(h.name ?? ""));
  const out = {
    label,
    circles: org?.circles?.length ?? 0,
    roles: org?.roles?.length ?? 0,
    holderCount: holders.length,
    holderNames: holders,
    peopleTier: org?.people ?? null,
    orgHolderKeys: Array.from(
      new Set((org?.roles ?? []).flatMap((r: any) => (r.holders ?? []).flatMap((h: any) => Object.keys(h)))),
    ),
    contentTeam: JSON.stringify(team ?? null).length,
    contentTeamRaw: team,
    contentRolesRaw: roles,
    milestoneCount: Array.isArray(milestones?.milestones) ? milestones.milestones.length : Array.isArray(milestones) ? milestones.length : -1,
  };
  return out;
}

async function main() {
  if (!testDbConfigured()) throw new Error("TEST_DATABASE_URL is not set");
  if (!fs.existsSync(DIST)) throw new Error("dist/index.js missing; pnpm build first");
  const db = await provisionTestDb();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "fork-measure-"));
  const results: any[] = [];
  let child: ChildProcess | undefined;
  try {
    // ── A: the fork. Empty schema, nothing configured, seeds present. ──
    ({ child } = await boot(db.url, dataDir));
    results.push(await readSurfaces("A_fresh_fork_seeds_present"));
    child.kill();
    await new Promise((r) => setTimeout(r, 1500));

    // ── B: the configured village. Same schema, seed files gone. ──
    for (const f of MOVED) fs.renameSync(path.join(SEEDS, f), path.join(SEEDS, f + ".moved"));
    try {
      ({ child } = await boot(db.url, dataDir));
      results.push(await readSurfaces("B_same_schema_seed_files_absent"));
      child.kill();
    } finally {
      for (const f of MOVED) {
        const moved = path.join(SEEDS, f + ".moved");
        if (fs.existsSync(moved)) fs.renameSync(moved, path.join(SEEDS, f));
      }
    }
    fs.writeFileSync(
      path.resolve(process.cwd(), "fork-measure-out.json"),
      JSON.stringify(results, null, 2),
    );
    for (const r of results) {
      console.log(
        `${r.label}: circles=${r.circles} roles=${r.roles} holders=${r.holderCount} ` +
          `contentTeamBytes=${r.contentTeam} milestones=${r.milestoneCount}`,
      );
      console.log(`   holder names: ${JSON.stringify(r.holderNames)}`);
      console.log(`   holder keys : ${JSON.stringify(r.orgHolderKeys)}`);
      console.log(`   people tier : ${JSON.stringify(r.peopleTier)}`);
    }
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
