/**
 * Integration secrets (S63): third-party keys a village sets from its own
 * admin panel — masked on every read, resolved admin-first-then-env.
 *
 * The posture this replaces was the worst of both worlds: Stripe keys were
 * env-only (a founder without Railway access could not launch payments at
 * all, and NOTHING anywhere reported whether the webhook secret was even
 * set), while Resend/Anthropic keys were admin-settable but echoed back to
 * the browser in plaintext on every settings load. This store fixes both
 * ends with one rule: **a secret is write-only TO THE BROWSER, and read by
 * the server.** Reads through `secretStatus` return
 * {configured, last4, source, setBy, setAt} and never the value; the value
 * leaves this module through `secretValue` toward the service it belongs to.
 *
 * That distinction is load-bearing and the header used to say only
 * "write-only". A server caller CAN read a stored value back, which means
 * this store already holds an INBOUND signing secret perfectly well: the
 * webhook handler reads it to verify an HMAC, and only the browser ever sees
 * the mask. Anyone reading "write-only" and concluding otherwise would build
 * a second credential mechanism beside this one for no reason.
 *
 * WHAT MUST NEVER BE ADDED HERE. A managed listing's credential. That key is
 * the platform's, not the village's, and putting it here would show a fork
 * admin its source and last4 and let them clear it. It lives in env, is read
 * at call time, and is never returned by any route: the PLATFORM_ASSISTANT_KEY
 * posture, settled as policy in hub ADR-49. `moduleListingProblems` refuses a
 * managed listing that lists secret slots, and the derivation below skips the
 * managed tier a second time, because one guard for this is not enough.
 *
 * Env vars remain a full fallback so existing deployments change nothing:
 * resolution is admin-typed first, env second. `last4` is enough for a
 * founder to recognize which key is live without being enough to steal.
 *
 * Storage is plaintext JSON in app_config, same as the email config always
 * was — encryption-at-rest was offered and Rye chose masked-read without it
 * (2026-07-27); revisit if backups start leaving the deployment's trust
 * boundary. What changed today is that the browser stopped being a place
 * secrets visit.
 */
import type { Pool } from "mysql2/promise";
import { registrySecretKeys } from "../../shared/modules";

/** The platform's own seven. A literal union, so every call site still typechecks. */
const BASE_SECRET_KEYS = [
  "stripe_secret_key",
  "stripe_webhook_secret",
  "resend_api_key",
  "assistant_api_key",
  "riverside_webhook_secret",
  "governance_hub_secret",
  "basescan_api_key",
] as const;
export type BaseSecretKey = (typeof BASE_SECRET_KEYS)[number];

/**
 * A platform key, or a slot a listing contributed.
 *
 * `string & {}` keeps the seven literals in autocomplete and in every existing
 * call site's type check while admitting a registry-contributed slot. Before
 * this, adding one vendor credential meant editing a frozen union and a
 * hardcoded env map in platform code and shipping a release to every fork,
 * including the forks running nothing of the kind.
 */
export type SecretKey = BaseSecretKey | (string & {});

/**
 * Base keys union the registry's own. Computed once at module load, from a
 * pure data file with no clock and no database in it, so the order and the
 * contents are the same in every process.
 */
export const SECRET_KEYS: readonly SecretKey[] = [
  ...BASE_SECRET_KEYS,
  ...registrySecretKeys().filter((k) => !(BASE_SECRET_KEYS as readonly string[]).includes(k)),
];

/** Env fallback per platform key — the names FORK_RUNBOOK.md has always documented. */
const BASE_ENV_FALLBACK: Record<BaseSecretKey, string> = {
  stripe_secret_key: "STRIPE_SECRET_KEY",
  stripe_webhook_secret: "STRIPE_WEBHOOK_SECRET",
  resend_api_key: "RESEND_API_KEY",
  assistant_api_key: "ANTHROPIC_API_KEY",
  riverside_webhook_secret: "RIVERSIDE_WEBHOOK_SECRET",
  governance_hub_secret: "GOVERNANCE_HUB_SECRET",
  basescan_api_key: "BASESCAN_API_KEY",
};

/**
 * The env var a slot falls back to. The seven keep the exact names the runbook
 * documents; a registry slot takes its own name uppercased, which is a rule a
 * fork operator can apply without reading any code.
 */
export function envNameFor(key: SecretKey): string {
  return BASE_ENV_FALLBACK[key as BaseSecretKey] ?? String(key).toUpperCase();
}

interface StoredSecret {
  value: string;
  setBy: string;
  setAt: string;
}

type SecretsDoc = Record<string, StoredSecret | undefined>;

/** Boot-loaded cache, write-through — the store-db discipline. */
let cache: SecretsDoc | null = null;

export async function loadSecrets(pool: Pool): Promise<void> {
  const [[row]] = await pool.query<any[]>(
    "SELECT value FROM app_config WHERE config_key = 'integration-secrets'",
  );
  cache = row ? (typeof row.value === "string" ? JSON.parse(row.value) : row.value) : {};
}

function mustCache(): SecretsDoc {
  if (!cache) throw new Error("secrets read before boot loaded them");
  return cache;
}

/**
 * The ONE value read. Callers are the outbound integrations (Stripe call,
 * Resend call, Anthropic call) — never a route serializing JSON to a browser.
 */
export function secretValue(key: SecretKey): string {
  const stored = mustCache()[key]?.value;
  if (stored) return stored;
  return process.env[envNameFor(key)] ?? "";
}

export function secretConfigured(key: SecretKey): boolean {
  return !!secretValue(key);
}

export interface SecretStatus {
  key: SecretKey;
  configured: boolean;
  /** Where the live value comes from: the admin panel beats the host env. */
  source: "admin" | "env" | "none";
  /** Enough to recognize a key, not enough to use one. */
  last4: string | null;
  setBy: string | null;
  setAt: string | null;
}

/** Masked status for the admin UI. NEVER includes a value. */
export function secretStatus(key: SecretKey): SecretStatus {
  const stored = mustCache()[key];
  if (stored?.value) {
    return {
      key,
      configured: true,
      source: "admin",
      last4: stored.value.slice(-4),
      setBy: stored.setBy,
      setAt: stored.setAt,
    };
  }
  const env = process.env[envNameFor(key)] ?? "";
  return {
    key,
    configured: !!env,
    source: env ? "env" : "none",
    last4: env ? env.slice(-4) : null,
    setBy: null,
    setAt: null,
  };
}

export function allSecretStatuses(): SecretStatus[] {
  return SECRET_KEYS.map(secretStatus);
}

/**
 * True when this key is one the store may hold at all.
 *
 * `setAt` on the status above is when somebody TYPED a key. It is not, and can
 * never become, evidence that the key works: that answer lives in
 * server/lib/integrations.ts, written by the driver wrapper on real calls.
 */
export function isSecretKey(key: string): key is SecretKey {
  return SECRET_KEYS.includes(key);
}

/** Set (or with "" clear) one secret, attributed. Write-through. */
export async function putSecret(
  pool: Pool,
  key: SecretKey,
  value: string,
  by: string,
): Promise<void> {
  const doc = { ...mustCache() };
  const trimmed = value.trim();
  if (trimmed) doc[key] = { value: trimmed, setBy: by, setAt: new Date().toISOString() };
  else delete doc[key];
  await pool.query(
    "INSERT INTO app_config (config_key, value) VALUES ('integration-secrets', ?) " +
      "ON DUPLICATE KEY UPDATE value = VALUES(value)",
    [JSON.stringify(doc)],
  );
  cache = doc;
}
