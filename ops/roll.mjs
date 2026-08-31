#!/usr/bin/env node
/**
 * The fleet roller: walks the villages in ops/fleet.json ring by ring and
 * halts the whole run at the first one that does not come back healthy.
 *
 * WHY STOP THEN START, NEVER BLUE OR GREEN. server/repos/store-db.ts documents
 * that its write-through caches are only sound because exactly one process
 * writes per deployment: "One process per deployment (Railway) is what makes
 * the cache sound." A blue or green overlap, where an old and a new process
 * both serve one village for even a few seconds, breaks that invariant and
 * can corrupt the cache. So this script never asks a platform for a rolling
 * or zero downtime deploy. For every village it runs an explicit stop
 * command, waits for that command to exit, and only then runs an explicit
 * start command. If a platform's own "redeploy" primitive does not block
 * until the previous process has fully exited, it is the wrong primitive to
 * put in stopCommand; see ops/README.md.
 *
 * WHY A HEALTH CHECK MUST FAIL LOUD. The one job of this script is to keep a
 * bad release from reaching all 13 villages. That guarantee is worth exactly
 * as much as the health probe it is built on. A probe that reads "no error"
 * as "healthy" will happily wave a broken release through the moment a
 * request times out for an unrelated reason. So every code path in
 * waitForHealthy() below returns either a positive match (the reported build
 * SHA equals the one we just shipped) or a specific, named failure reason.
 * There is no path that returns healthy from the mere absence of an error.
 *
 * WHY THE MANIFEST HAS NO SECRETS. deploy.stopCommand and deploy.startCommand
 * are shell strings run with the operator's own environment already in
 * scope, so they can reference "$RAILWAY_TOKEN" the normal shell way. Nothing
 * in fleet.json ever holds a literal credential, which is what lets the real
 * file be safe to commit next to fleet.json.example.
 *
 * Usage:
 *   node ops/roll.mjs plan  --tag <imageTag> --sha <gitSha> [--manifest path]
 *   node ops/roll.mjs apply --tag <imageTag> --sha <gitSha> [--only villageId]
 *                            [--timeout-ms N] [--interval-ms N]
 *   node ops/roll.mjs check --url <healthUrl> --sha <gitSha>
 *                     (or)   --id <villageId> --sha <gitSha>
 *                            [--timeout-ms N] [--interval-ms N]
 *
 * With no subcommand, "plan" runs. Plan never redeploys anything and never
 * runs a stop or start command; it only reads. Apply is the only subcommand
 * that changes anything, and it requires the word "apply" to be typed.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_REQUEST_TIMEOUT_MS = 8000;

// ─── argv ──────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        out[key] = next;
        i++;
      } else {
        out[key] = true;
      }
    } else {
      out._.push(a);
    }
  }
  return out;
}

// ─── manifest ──────────────────────────────────────────────────────────────

function loadManifest(manifestPath) {
  let raw;
  try {
    raw = fs.readFileSync(manifestPath, "utf8");
  } catch (err) {
    fail(`Could not read manifest at ${manifestPath}: ${err.message}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch (err) {
    fail(`Manifest at ${manifestPath} is not valid JSON: ${err.message}`);
  }
  const errors = validateManifest(manifest);
  if (errors.length > 0) {
    console.error(`Manifest at ${manifestPath} failed validation:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(2);
  }
  return manifest;
}

/** Every problem found, not just the first. A human fixing a manifest wants the whole list at once. */
function validateManifest(m) {
  const errors = [];
  const isNonEmptyString = (v) => typeof v === "string" && v.length > 0;

  if (!m || typeof m !== "object") return ["top level value is not an object"];
  if (!isNonEmptyString(m.image)) errors.push('top level "image" must be a non empty string');
  if (typeof m.maxPinDays !== "number" || m.maxPinDays <= 0) {
    errors.push('top level "maxPinDays" must be a positive number');
  }
  if (!Array.isArray(m.rings) || m.rings.length === 0) {
    errors.push('top level "rings" must be a non empty array');
  }
  const ringNames = new Set();
  for (const r of m.rings || []) {
    if (!isNonEmptyString(r?.name)) { errors.push("a ring is missing a name"); continue; }
    if (ringNames.has(r.name)) errors.push(`ring "${r.name}" is declared more than once`);
    ringNames.add(r.name);
    if (typeof r.order !== "number") errors.push(`ring "${r.name}" is missing a numeric order`);
  }

  if (!Array.isArray(m.villages) || m.villages.length === 0) {
    errors.push('top level "villages" must be a non empty array');
  }
  const ids = new Set();
  for (const v of m.villages || []) {
    const label = v?.id ?? "(no id)";
    if (!isNonEmptyString(v?.id)) { errors.push("a village is missing an id"); continue; }
    if (ids.has(v.id)) errors.push(`village id "${v.id}" is used more than once`);
    ids.add(v.id);
    if (!isNonEmptyString(v.name)) errors.push(`village "${label}" is missing a name`);
    if (v.hosting !== "regen" && v.hosting !== "self") {
      errors.push(`village "${label}" has hosting "${v.hosting}", must be "regen" or "self"`);
    }
    if (!isNonEmptyString(v.healthUrl)) {
      errors.push(`village "${label}" is missing healthUrl`);
    } else {
      try { new URL(v.healthUrl); } catch { errors.push(`village "${label}" healthUrl is not a valid URL`); }
    }
    if (!v.steward || !isNonEmptyString(v.steward.name) || !isNonEmptyString(v.steward.contact)) {
      errors.push(`village "${label}" is missing steward.name or steward.contact`);
    }
    if (v.hosting === "regen") {
      if (!isNonEmptyString(v.ring) || !ringNames.has(v.ring)) {
        errors.push(`village "${label}" is regen-hosted and must set "ring" to a declared ring name`);
      }
      if (!v.deploy || !isNonEmptyString(v.deploy.stopCommand) || !isNonEmptyString(v.deploy.startCommand)) {
        errors.push(`village "${label}" is regen-hosted and must set deploy.stopCommand and deploy.startCommand`);
      }
    } else if (v.hosting === "self") {
      if (v.ring !== null && v.ring !== undefined && !ringNames.has(v.ring)) {
        errors.push(`village "${label}" is self-hosted and its ring, if set, must be a declared ring name`);
      }
      if (!v.notify || !isNonEmptyString(v.notify.method) || !isNonEmptyString(v.notify.target)) {
        errors.push(`village "${label}" is self-hosted and must set notify.method and notify.target`);
      }
    }
    if (v.pin !== null && v.pin !== undefined) {
      const p = v.pin;
      if (!isNonEmptyString(p.version) || !isNonEmptyString(p.reason) || !isNonEmptyString(p.pinnedAt) || !isNonEmptyString(p.expiresAt)) {
        errors.push(`village "${label}" pin must set version, reason, pinnedAt and expiresAt`);
      } else {
        const pinnedAt = Date.parse(p.pinnedAt);
        const expiresAt = Date.parse(p.expiresAt);
        if (Number.isNaN(pinnedAt) || Number.isNaN(expiresAt)) {
          errors.push(`village "${label}" pin has an unparseable pinnedAt or expiresAt`);
        } else {
          const windowDays = (expiresAt - pinnedAt) / 86400000;
          const maxDays = typeof m.maxPinDays === "number" ? m.maxPinDays : 30;
          if (windowDays > maxDays) {
            errors.push(
              `village "${label}" pin runs ${windowDays.toFixed(1)} days, over the ${maxDays} day cap. ` +
              "A pin this long is exactly the accumulated-migration jump the fleet rules forbid. " +
              "Split it into shorter pins, each re-affirmed with its own reason.",
            );
          }
          if (windowDays < 0) errors.push(`village "${label}" pin expiresAt is before its pinnedAt`);
        }
      }
    }
  }
  return errors;
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

// ─── ordering ──────────────────────────────────────────────────────────────

function orderedVillages(manifest, { only } = {}) {
  const ringOrder = new Map(manifest.rings.map((r) => [r.name, r.order]));
  const withIndex = manifest.villages.map((v, i) => ({ v, i }));
  withIndex.sort((a, b) => {
    const ra = a.v.ring != null ? ringOrder.get(a.v.ring) : Infinity;
    const rb = b.v.ring != null ? ringOrder.get(b.v.ring) : Infinity;
    if (ra !== rb) return ra - rb;
    return a.i - b.i; // stable within a ring: manifest order is the roll order
  });
  const villages = withIndex.map((x) => x.v);
  return only ? villages.filter((v) => v.id === only) : villages;
}

function stalePins(manifest) {
  const now = Date.now();
  const stale = [];
  for (const v of manifest.villages) {
    if (!v.pin) continue;
    const expiresAt = Date.parse(v.pin.expiresAt);
    if (!Number.isNaN(expiresAt) && expiresAt < now) {
      stale.push({ village: v, daysExpired: (now - expiresAt) / 86400000 });
    }
  }
  return stale;
}

/**
 * A pin holds a village until a human removes it, full stop. expiresAt is a
 * deadline for a human to look, not a timer that lifts the pin on its own:
 * an expired pin still holds (see stalePins above and the warning it feeds),
 * because auto-lifting it is exactly the accumulated-migration jump the pin
 * cap exists to prevent. This function only ever asks "is there a pin".
 */
function isPinned(v) {
  return !!v.pin;
}

// ─── health probing (never returns healthy without a positive SHA match) ──

/**
 * Pulls the git SHA out of a build marker string like "2026-07-28-wave1-a1b2c3d".
 * The human-readable label can itself contain hyphens, so the SHA is always
 * the LAST hyphen-delimited segment (server/index.ts builds BUILD_MARKER the
 * same way: `${BUILD_LABEL}-${sha || "dev"}`). Anything that is not exactly
 * "dev" or 7 lowercase hex characters is refused rather than guessed at.
 */
function extractSha(buildMarker) {
  if (typeof buildMarker !== "string" || buildMarker.length === 0) return null;
  const idx = buildMarker.lastIndexOf("-");
  if (idx === -1) return null;
  const candidate = buildMarker.slice(idx + 1).toLowerCase();
  if (candidate === "dev") return "dev";
  return /^[0-9a-f]{7}$/.test(candidate) ? candidate : null;
}

/** One GET, one verdict. Never throws; every branch returns an explicit ok flag and reason. */
async function probeOnce(healthUrl, requestTimeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const res = await fetch(healthUrl, { signal: controller.signal });
    if (!res.ok) return { ok: false, reason: "http_status", detail: `HTTP ${res.status}` };
    let body;
    try {
      body = await res.json();
    } catch (err) {
      return { ok: false, reason: "bad_json", detail: `response body was not JSON: ${err.message}` };
    }
    if (!body || typeof body !== "object") {
      return { ok: false, reason: "bad_json", detail: "response was not a JSON object" };
    }
    if (body.status !== "ok") {
      return { ok: false, reason: "unhealthy_status", detail: `status field read ${JSON.stringify(body.status)}` };
    }
    if (typeof body.build !== "string" || body.build.length === 0) {
      return { ok: false, reason: "missing_build", detail: "response had status ok but no build field" };
    }
    return { ok: true, build: body.build };
  } catch (err) {
    const reason = err && err.name === "AbortError" ? "request_timeout" : "unreachable";
    return { ok: false, reason, detail: String((err && err.message) || err) };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Polls until the reported build SHA equals expectedSha, or gives up at
 * timeoutMs and returns a failure. The ONLY return path with ok:true is an
 * exact SHA match on a status:"ok" response; every other path, including
 * every kind of network failure, malformed response, and mismatched SHA,
 * returns ok:false with a specific reason. That asymmetry is the whole
 * safety property this file exists to provide: a check that never ran, or
 * ran and hit an error, must never read the same as a check that passed.
 */
async function waitForHealthy(healthUrl, expectedShaRaw, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;
  const requestTimeoutMs = opts.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
  const onAttempt = opts.onAttempt ?? (() => {});
  const expectedSha = String(expectedShaRaw).slice(0, 7).toLowerCase();

  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  let last = { ok: false, reason: "never_probed", detail: "no attempt has completed yet" };

  while (true) {
    attempt += 1;
    const probe = await probeOnce(healthUrl, requestTimeoutMs);
    if (probe.ok) {
      const gotSha = extractSha(probe.build);
      if (gotSha === null) {
        last = { ok: false, reason: "unparseable_build", detail: `build "${probe.build}" did not end in a recognizable SHA` };
      } else if (gotSha === expectedSha) {
        onAttempt(attempt, { ok: true, build: probe.build });
        return { ok: true, attempts: attempt, build: probe.build };
      } else {
        last = { ok: false, reason: "sha_mismatch", detail: `got ${gotSha}, want ${expectedSha}`, build: probe.build };
      }
    } else {
      last = probe;
    }
    onAttempt(attempt, last);
    if (Date.now() >= deadline) {
      return { ok: false, attempts: attempt, ...last };
    }
    await sleep(Math.min(intervalMs, Math.max(0, deadline - Date.now())));
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── commands (the only place that runs shell commands or posts webhooks) ─

function substitute(template, vars) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (key in vars ? String(vars[key]) : `{{${key}}}`));
}

function runCommand(template, vars, label) {
  const command = substitute(template, vars);
  console.log(`  $ ${command}`);
  const result = spawnSync(command, { shell: true, stdio: "inherit", cwd: ROOT, env: process.env });
  if (result.error) {
    return { status: 1, error: String(result.error.message || result.error) };
  }
  return { status: result.status ?? 1 };
}

async function postJson(url, payload) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));
  } catch (err) {
    console.error(`  (paging webhook failed, this does not change the halt: ${err.message})`);
  }
}

// ─── reporting ─────────────────────────────────────────────────────────────

function haltBanner(village, reason, detail) {
  console.error("");
  console.error("============================== RING HALTED ==============================");
  console.error(`village   ${village.id}  (${village.name})`);
  console.error(`domain    ${village.domain ?? "unknown"}`);
  console.error(`reason    ${reason}`);
  console.error(`detail    ${typeof detail === "string" ? detail : JSON.stringify(detail)}`);
  console.error(`steward   ${village.steward?.name ?? "unknown"} <${village.steward?.contact ?? "no contact on file"}>`);
  console.error("No further village will be touched by this run.");
  console.error("===========================================================================");
  console.error("");
}

async function page(manifest, village, reason, detail) {
  haltBanner(village, reason, detail);
  const webhookUrl = process.env.ROLL_PAGE_WEBHOOK || manifest.paging?.webhookUrl;
  if (webhookUrl) {
    console.error(`  paging ${webhookUrl}`);
    await postJson(webhookUrl, {
      event: "fleet_roll_halted",
      village: village.id,
      domain: village.domain ?? null,
      reason,
      detail,
      steward: village.steward ?? null,
      at: new Date().toISOString(),
    });
  } else {
    console.error("  no paging.webhookUrl configured and ROLL_PAGE_WEBHOOK is unset.");
    console.error("  a human reading this run's output is the paging mechanism right now.");
  }
}

function printStaleWarnings(manifest) {
  const stale = stalePins(manifest);
  if (stale.length === 0) return;
  console.log("");
  console.log(`WARNING: ${stale.length} pin(s) have passed their expiry and are still held:`);
  for (const { village, daysExpired } of stale) {
    console.log(
      `  - ${village.id}: pinned to ${village.pin.version} for "${village.pin.reason}", ` +
      `expired ${daysExpired.toFixed(1)} day(s) ago. Still held, not auto-rolled. ` +
      "Re-pin with a fresh reason and expiry, or clear the pin and run this village through `check` " +
      "before letting it back into a ring; it is likely several releases behind.",
    );
  }
  console.log("");
}

// ─── subcommands ───────────────────────────────────────────────────────────

async function cmdPlan(manifest, { tag, sha }) {
  console.log(`PLAN  image=${manifest.image}  tag=${tag}  expected sha=${String(sha).slice(0, 7)}`);
  console.log("This is a dry run. No stop or start command will be executed, no village will be touched.");
  printStaleWarnings(manifest);

  const villages = orderedVillages(manifest);
  let ring = null;
  for (const v of villages) {
    if (v.ring !== ring) {
      ring = v.ring;
      console.log(`-- ring: ${ring ?? "(unassigned, self-hosted, notified last)"} --`);
    }
    if (v.hosting === "self") {
      console.log(`  NOTIFY  ${v.id}  self-hosted, never redeployed by this tool (${v.notify.method} -> ${v.notify.target})`);
      continue;
    }
    if (isPinned(v)) {
      console.log(`  SKIP    ${v.id}  pinned to ${v.pin.version} until ${v.pin.expiresAt} (${v.pin.reason})`);
      continue;
    }
    const probe = await probeOnce(v.healthUrl, DEFAULT_REQUEST_TIMEOUT_MS);
    const currently = probe.ok ? `currently healthy at ${probe.build}` : `currently unreadable (${probe.reason}: ${probe.detail})`;
    console.log(`  WOULD REDEPLOY  ${v.id} -> ${tag}  (${currently})`);
  }
  return 0;
}

async function cmdApply(manifest, { tag, sha, only, timeoutMs, intervalMs }) {
  console.log(`APPLY image=${manifest.image}  tag=${tag}  expected sha=${String(sha).slice(0, 7)}`);
  printStaleWarnings(manifest);

  const villages = orderedVillages(manifest, { only });
  if (villages.length === 0) {
    fail(only ? `No village with id "${only}" in the manifest.` : "No villages to roll.");
  }

  let ring = null;
  for (const v of villages) {
    if (v.ring !== ring) {
      ring = v.ring;
      console.log(`-- ring: ${ring ?? "(unassigned, self-hosted)"} --`);
    }

    if (v.hosting === "self") {
      console.log(`NOTIFY  ${v.id}  self-hosted, sending notice instead of redeploying`);
      if (v.notify.method === "webhook") await postJson(v.notify.target, { event: "fleet_release", tag });
      continue;
    }

    if (isPinned(v)) {
      console.log(`SKIP    ${v.id}  pinned to ${v.pin.version} until ${v.pin.expiresAt}`);
      continue;
    }

    console.log(`STOP    ${v.id}`);
    const stopResult = runCommand(v.deploy.stopCommand, { TAG: tag });
    if (stopResult.status !== 0) {
      await page(manifest, v, "stop_command_failed", stopResult.error ?? `exit code ${stopResult.status}`);
      return 1;
    }

    console.log(`START   ${v.id} -> ${tag}`);
    const startResult = runCommand(v.deploy.startCommand, { TAG: tag });
    if (startResult.status !== 0) {
      await page(manifest, v, "start_command_failed", startResult.error ?? `exit code ${startResult.status}`);
      return 1;
    }

    console.log(`WAIT    ${v.id}  polling ${v.healthUrl} for sha ${String(sha).slice(0, 7)}`);
    const result = await waitForHealthy(v.healthUrl, sha, {
      timeoutMs,
      intervalMs,
      onAttempt: (n, r) => console.log(`  attempt ${n}: ${r.ok ? `matched ${r.build}` : `${r.reason} (${r.detail ?? ""})`}`),
    });
    if (!result.ok) {
      await page(manifest, v, "did_not_become_healthy", { reason: result.reason, detail: result.detail, attempts: result.attempts });
      return 1;
    }
    console.log(`OK      ${v.id}  healthy at ${result.build} after ${result.attempts} check(s)`);
  }

  console.log("");
  console.log("Rollout complete. Every village this run touched is healthy at the target build.");
  return 0;
}

async function cmdCheck(args) {
  const sha = args.sha;
  if (!sha) fail("check requires --sha <expected sha>");
  let healthUrl = args.url;
  let label = "adhoc";
  if (!healthUrl) {
    if (!args.id) fail("check requires either --url <healthUrl> or --id <villageId with --manifest>");
    const manifest = loadManifest(resolveManifestPath(args));
    const v = manifest.villages.find((x) => x.id === args.id);
    if (!v) fail(`No village with id "${args.id}" in the manifest.`);
    healthUrl = v.healthUrl;
    label = v.id;
  }
  const timeoutMs = args["timeout-ms"] ? Number(args["timeout-ms"]) : DEFAULT_TIMEOUT_MS;
  const intervalMs = args["interval-ms"] ? Number(args["interval-ms"]) : DEFAULT_INTERVAL_MS;
  console.log(`CHECK   ${label}  ${healthUrl}  expecting sha ${String(sha).slice(0, 7)}  timeout ${timeoutMs}ms  interval ${intervalMs}ms`);
  const result = await waitForHealthy(healthUrl, sha, {
    timeoutMs,
    intervalMs,
    onAttempt: (n, r) => console.log(`  attempt ${n}: ${r.ok ? `matched ${r.build}` : `${r.reason} (${r.detail ?? ""})`}`),
  });
  if (result.ok) {
    console.log(`GREEN   ${label}  healthy at ${result.build} after ${result.attempts} check(s)`);
    return 0;
  }
  console.error(`RED     ${label}  never became healthy at the expected sha: ${result.reason} (${result.detail ?? ""}), ${result.attempts} attempt(s)`);
  return 1;
}

// ─── entry point ───────────────────────────────────────────────────────────

function resolveManifestPath(args) {
  return path.resolve(ROOT, args.manifest || "ops/fleet.json");
}

/**
 * Every exit below sets `process.exitCode` and returns, rather than calling
 * `process.exit()`. The difference is not stylistic.
 *
 * `process.exit()` tears the process down while libuv handles are still open,
 * and after this script has run several `fetch` calls there always are some:
 * undici keeps its sockets alive by design. MEASURED 2026-08-31 on Windows
 * with node v25.8.0, `plan` against a five village manifest printed its whole
 * correct report and then aborted with
 *
 *     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file
 *     src\win\async.c, line 76
 *
 * exiting 127, deterministically, three runs out of three. Reduced to twelve
 * lines containing none of this file: three fetches to three ports followed by
 * `process.exit(0)` aborts the same way, and one fetch does not. So it is the
 * runtime rather than this tool, and this repo pins node 22 (`.node-version`)
 * where it does not happen. It still had to be fixed here, because the exit
 * code is the whole interface: an operator who writes `roll.mjs plan &&
 * roll.mjs apply` reads 127 from a run that did its job perfectly, and a
 * rollout that stops for a reason nobody can find is worse than one that never
 * started.
 *
 * Setting `exitCode` and letting the event loop drain exits with the right
 * code and no abort, measured at no extra wall time. `fail()` above still
 * calls `process.exit()` on purpose: it is a control flow terminator its
 * callers rely on to not return, and it only ever runs before the first fetch.
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const subcommand = args._[0] || "plan";

  if (subcommand === "check") {
    process.exitCode = await cmdCheck(args);
    return;
  }

  if (subcommand !== "plan" && subcommand !== "apply") {
    fail(`Unknown subcommand "${subcommand}". Use plan, apply, or check.`);
  }
  if (!args.tag) fail(`${subcommand} requires --tag <imageTag>`);
  if (!args.sha) fail(`${subcommand} requires --sha <expectedSha>`);

  const manifestPath = resolveManifestPath(args);
  const manifest = loadManifest(manifestPath);

  if (subcommand === "plan") {
    process.exitCode = await cmdPlan(manifest, { tag: args.tag, sha: args.sha });
  } else {
    const timeoutMs = args["timeout-ms"] ? Number(args["timeout-ms"]) : DEFAULT_TIMEOUT_MS;
    const intervalMs = args["interval-ms"] ? Number(args["interval-ms"]) : DEFAULT_INTERVAL_MS;
    process.exitCode = await cmdApply(manifest, {
      tag: args.tag,
      sha: args.sha,
      only: args.only,
      timeoutMs,
      intervalMs,
    });
  }
}

main().catch((err) => {
  console.error(`roll.mjs crashed: ${err && err.stack ? err.stack : err}`);
  process.exitCode = 2;
});
