#!/usr/bin/env node
/**
 * Turn every module on, in dependency order, and verify each surface answers.
 *
 * Modules ship OFF by design — this is the deliberate act that opens them.
 * Order matters: the feed is a lens over the forum, so the forum goes first;
 * funds-bearing modules (stays, exchange) refuse to enable while a shared
 * password is the only admin credential, so the deployment needs per-admin
 * identities already bootstrapped.
 *
 * Usage:
 *   node scripts/enable-all-modules.mjs --base https://your-village.example \
 *        --email founder@example.com --password '…'
 *   node scripts/enable-all-modules.mjs --base http://localhost:3001 --token <bearer>
 *
 *   --dry     report what WOULD change, change nothing
 *   --preview enable to 'preview' (admins only) instead of the target posture
 */
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]?.startsWith("--") || arr[i + 1] === undefined ? true : arr[i + 1]]);
    return acc;
  }, []),
);

const BASE = String(args.base || "http://localhost:3001").replace(/\/$/, "");
const DRY = !!args.dry;
const FORCE_PREVIEW = !!args.preview;

/**
 * Target postures. Public = anyone may read; members = sign-in required;
 * automation is an admin-facing pipeline, so it never needs to go public.
 */
const TARGETS = [
  ["map", "public"],
  ["forum", "public"],
  ["feed", "public"],
  ["tools", "public"],
  ["badges", "public"],
  ["library", "public"],
  ["health", "public"],
  ["stays", "public"],
  ["exchange", "public"],
  ["commerce", "public"],
  ["network", "public"],
  ["events", "public"],
  ["messaging", "members"],
  ["automation", "members"],
];

/** A public probe per module: what a signed-out visitor should be able to reach. */
const PROBES = {
  map: "/api/map",
  forum: "/api/forum/categories",
  feed: "/api/feed",
  tools: "/api/tools",
  badges: "/api/badges",
  library: "/api/library",
  health: "/api/health/summary",
  stays: "/api/stays",
  exchange: "/api/exchange",
  commerce: "/api/products",
  network: "/api/network/published",
  events: "/api/events",
};

async function api(method, path, body, token) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

async function main() {
  let token = args.token && args.token !== true ? String(args.token) : null;
  if (!token) {
    if (!args.email || !args.password) {
      console.error("Need --token, or --email and --password for a founder/admin account.");
      process.exit(2);
    }
    const login = await api("POST", "/api/auth/login", { email: String(args.email), password: String(args.password) });
    if (login.status !== 200 || !login.json?.token) {
      console.error(`Login failed (${login.status}):`, login.json?.error ?? login.json);
      process.exit(1);
    }
    token = login.json.token;
    console.log(`Signed in as ${login.json.user?.name ?? args.email} (${login.json.user?.role ?? "?"}).`);
  }

  const before = await api("GET", "/api/admin/modules", undefined, token);
  if (before.status !== 200) {
    console.error(`Cannot read modules (${before.status}):`, before.json?.error ?? before.json);
    console.error("The token must belong to an account with the founder or admin role.");
    process.exit(1);
  }
  const stored = Object.fromEntries(before.json.modules.map((m) => [m.id, m]));

  // TARGETS is a hand-written list, and a hand-written list rots the moment
  // a module is added without touching this file — which already happened
  // once: `commerce` and `network` shipped and this script silently skipped
  // them while still printing "All modules enabled". Compare against what
  // the SERVER actually has and refuse to claim completeness while any
  // optional module is unaccounted for.
  const covered = new Set(TARGETS.map(([id]) => id));

  /*
   * Module library listings are EXCLUDED, deliberately, and the exclusion is
   * read from the server's own tier field so it can never go stale the way
   * TARGETS did.
   *
   * Turning a listing on without its credential probes a surface that cannot
   * answer: the route is mounted, requireVendor answers 503, and this script
   * would report a failure that is nobody's defect. Worse for a MANAGED
   * listing, where turning it on is the village accepting a support
   * arrangement and a stamped contract version, which is not a thing a
   * convenience script gets to do on somebody's behalf.
   *
   * A village that wants one enables it from the Modules tab, having read the
   * card, having set the key. That is the whole point of the tier being an
   * acceptance.
   */
  const listings = before.json.modules.filter((m) => m.tier && m.tier !== "included");
  const missing = before.json.modules
    .filter((m) => !m.core && !covered.has(m.id) && !listings.some((l) => l.id === m.id))
    .map((m) => m.id);
  if (missing.length) {
    console.error(
      `\nThis script does not know about ${missing.length} module(s) the server offers: ${missing.join(", ")}.\n` +
        `Add them to TARGETS (and PROBES) in scripts/enable-all-modules.mjs — refusing to report success while the list is stale.`,
    );
    process.exit(3);
  }
  if (listings.length) {
    console.log(
      `\nSkipping ${listings.length} module library listing(s): ${listings.map((m) => `${m.id} (${m.tier})`).join(", ")}.\n` +
        `Enable each one from Admin -> Modules after reading its card and setting its credential.`,
    );
  }

  console.log(`\n${DRY ? "DRY RUN — " : ""}Enabling ${TARGETS.length} module(s) on ${BASE}\n`);
  const results = [];
  for (const [id, target] of TARGETS) {
    const want = FORCE_PREVIEW ? "preview" : target;
    const now = stored[id]?.lifecycle ?? "off";
    if (now === want) { results.push({ id, action: "already", lifecycle: now }); continue; }
    if (DRY) { results.push({ id, action: "would-set", from: now, to: want }); continue; }
    const r = await api("PUT", `/api/admin/modules/${id}/lifecycle`, { lifecycle: want }, token);
    if (r.status === 200) results.push({ id, action: "set", from: now, to: want });
    else results.push({ id, action: "REFUSED", from: now, to: want, status: r.status, error: r.json?.error, detail: r.json?.missing ?? r.json?.dependents ?? r.json?.description });
  }

  for (const r of results) {
    const line = r.action === "REFUSED"
      ? `  ✗ ${r.id.padEnd(12)} ${r.status} ${r.error}${r.detail ? ` (${JSON.stringify(r.detail)})` : ""}`
      : `  ${r.action === "already" ? "·" : "✓"} ${r.id.padEnd(12)} ${r.action === "already" ? `already ${r.lifecycle}` : `${r.from} → ${r.to}`}`;
    console.log(line);
  }

  if (DRY) return;

  // Verify: what a signed-out visitor sees, module by module.
  console.log("\nVerifying public surfaces (as a signed-out visitor):\n");
  let bad = 0;
  for (const [id, path] of Object.entries(PROBES)) {
    const target = TARGETS.find(([m]) => m === id)?.[1];
    const r = await api("GET", path);
    const ok = target === "public" ? r.status === 200 : [401, 404].includes(r.status);
    if (!ok) bad += 1;
    console.log(`  ${ok ? "✓" : "✗"} ${path.padEnd(24)} ${r.status}${ok ? "" : "  ← unexpected"}`);
  }

  const after = await api("GET", "/api/admin/modules", undefined, token);
  const servedOff = after.json.modules.filter((m) => !m.core && m.served === "off" && m.lifecycle !== "off");
  if (servedOff.length) {
    console.log("\n  ! demoted (dependency unmet, serving OFF):");
    for (const m of servedOff) console.log(`    ${m.id}: needs ${JSON.stringify(m.demotedBecause)}`);
    bad += servedOff.length;
  }

  const info = await api("GET", "/api/platform/info");
  console.log(`\n${info.json?.name ?? "?"} — ${info.json?.modules?.length ?? 0} module(s) serving, build ${info.json?.build ?? "?"}`);
  console.log(bad === 0 ? "\nAll modules enabled and answering.\n" : `\n${bad} surface(s) need attention.\n`);
  process.exit(bad === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
