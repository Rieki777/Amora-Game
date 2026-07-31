/**
 * Integration secrets (S63): third-party keys a village sets from its own
 * admin panel — masked on every read, resolved admin-first-then-env.
 *
 * The posture this replaces was the worst of both worlds: Stripe keys were
 * env-only (a founder without Railway access could not launch payments at
 * all, and NOTHING anywhere reported whether the webhook secret was even
 * set), while Resend/Anthropic keys were admin-settable but echoed back to
 * the browser in plaintext on every settings load. This store fixes both
 * ends with one rule: **a secret is write-only.** Reads return
 * {configured, last4, source, setBy, setAt} and never the value; the value
 * leaves this module only toward the service it belongs to.
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

export const SECRET_KEYS = [
  "stripe_secret_key",
  "stripe_webhook_secret",
  "resend_api_key",
  "assistant_api_key",
  "riverside_webhook_secret",
] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];

/** Env fallback per key — the names FORK_RUNBOOK.md has always documented. */
const ENV_FALLBACK: Record<SecretKey, string> = {
  stripe_secret_key: "STRIPE_SECRET_KEY",
  stripe_webhook_secret: "STRIPE_WEBHOOK_SECRET",
  resend_api_key: "RESEND_API_KEY",
  assistant_api_key: "ANTHROPIC_API_KEY",
  riverside_webhook_secret: "RIVERSIDE_WEBHOOK_SECRET",
};

interface StoredSecret {
  value: string;
  setBy: string;
  setAt: string;
}

type SecretsDoc = Partial<Record<SecretKey, StoredSecret>>;

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
  return process.env[ENV_FALLBACK[key]] ?? "";
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
  const env = process.env[ENV_FALLBACK[key]] ?? "";
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
