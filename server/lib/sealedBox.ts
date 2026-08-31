/**
 * The platform's ONE at-rest sealing primitive.
 *
 * AES-256-GCM under a 32-byte key carried as 64 hex characters in an
 * environment variable. Two stores use it and they use it identically:
 * `memberSecrets.ts` for a member's own LLM key under `MEMBER_SECRETS_KEY`,
 * and `secrets.ts` for the village's integration credentials under
 * `VILLAGE_SECRETS_KEY`. The functions take the key as an argument so the
 * two never have to share one, and so neither has to grow its own copy of
 * the cipher.
 *
 * This file was extracted from memberSecrets.ts unchanged, algorithm, encoding
 * and all, at the moment the second caller appeared. A second copy of a cipher
 * is how two stores end up with two different iv lengths and one of them wrong.
 *
 * There is deliberately no default key and no per-process fallback. A random
 * key would let a deployment store a credential it can never read again after
 * its next restart, while every panel kept reporting the credential as set.
 * Callers check for a key first and refuse in their own words.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export interface Sealed {
  ciphertext: string;
  iv: string;
  tag: string;
}

/**
 * The 32 bytes behind `name`, or null. Read at call time, never cached at
 * import, so a test can set and unset it and so a deployment that adds the
 * variable and restarts is not surprised by a stale read.
 *
 * Anything that is not exactly 64 hex characters is null rather than an
 * error: a half-typed key and an absent key are the same condition to every
 * caller, and both must refuse.
 */
export function keyFromEnv(name: string, env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = (env[name] ?? "").trim();
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) return null;
  return Buffer.from(raw, "hex");
}

/**
 * Seal a plaintext. Fresh 12-byte iv per call, so the same secret stored twice
 * produces two different rows and nothing about the plaintext leaks through
 * equality of ciphertexts.
 */
export function sealWith(key: Buffer, plaintext: string): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
  };
}

/**
 * Open a sealed value. Null on a wrong key or a tampered row, never a throw
 * into a caller: the tag check is the whole point, and a failed tag is
 * information the caller has to act on rather than a crash.
 */
export function openWith(key: Buffer, sealed: Sealed): string | null {
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64"));
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(sealed.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
