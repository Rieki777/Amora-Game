/**
 * Interop foundations (S67): federation between villages, built as ONE
 * generic frame so many collaboration features can ride it.
 *
 * The shape: each instance PUBLISHES items (a public, unauthenticated JSON
 * endpoint — published means public), and each instance chooses which peers
 * it READS (admin-added URLs, SSRF-guarded, synced on a schedule into a
 * local cache). No central server, no shared database, no login between
 * villages: the same posture as RSS, because the same posture as RSS is
 * exactly how much trust two independently-run deployments should need.
 *
 * v1 ships two item types — 'need' and 'offer' — and the allowlist below is
 * the extension point: co-hiring, shared events and resource pooling are
 * each a new type plus a renderer, not a new protocol. Anything
 * person-shaped (a people directory) adds a per-member consent row BEFORE
 * its type lands here; the publish surface itself carries no member fields.
 *
 * Identity discipline: a peer's instanceId is learned from its handshake
 * when added and RE-VERIFIED every sync. A different identity answering at
 * a known URL pauses the peer and says so — domains change hands; uuids
 * don't.
 *
 * That check is copyable, though: a uuid read off a public document costs
 * nothing to claim. So the peer's SIGNING KEY is pinned alongside it (0057)
 * and every later sweep verifies the discovery document's proof against the
 * pinned key. A stranger who has cloned every visible field cannot produce
 * that signature, which is the difference between a peer that says who it is
 * and a peer that shows it.
 */
import { randomUUID } from "crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { guardedFetchJson, guardOutboundUrl } from "./toolcheck";
import { pemFromRawPublicKey, verifyDocument } from "./villageExport";

export const SHARED_ITEM_TYPES = ["need", "offer"] as const;
export type SharedItemType = (typeof SHARED_ITEM_TYPES)[number];

/**
 * Every outbound call to a peer goes through the PINNED dialer, never bare
 * fetch. Bare fetch follows redirects with a fresh resolution per hop, so a
 * peer URL that passes the range check can redirect the request to
 * 169.254.169.254 and the answer lands in this village's peer cache — where
 * members read it. guardedFetchJson re-resolves and re-range-checks every
 * hop against the address actually dialled, and bounds the body.
 */
async function fetchJson(url: string, timeoutMs = 10_000): Promise<any> {
  return guardedFetchJson(url, timeoutMs);
}

/** What a handshake tells us, whichever document answered it. */
export interface PeerIdentity {
  instanceId: string;
  name: string | null;
  version: string | null;
  /** "village/1" if the discovery document answered, "platform/0" if not. */
  protocol: "village/1" | "platform/0";
  /** Capability names the peer claims. Empty for a v0 peer, which claims none. */
  supports: string[];
  /**
   * The raw ed25519 public key the document published, base64url, and NULL
   * unless its proof verified against that key. An unproven key is worth
   * nothing here, so it is never carried: pinning a key the answerer has not
   * shown it can sign with would pin whatever the last stranger said.
   */
  publicKey: string | null;
}

/**
 * What a pinned key says about the document that just answered (0057).
 *
 * A published key proves nothing on its own, because a public key is public:
 * an impostor copies the block verbatim out of the real village's document.
 * The pin is worth something because the proof is verified against the PINNED
 * key, and that is a signature only the real village can produce.
 *
 * - `ok`          the answerer signed with the key we pinned.
 * - `unpinned`    nothing pinned yet, so nothing to check. `pin` is the key to
 *                 store if there is one: trust-on-first-use, the same posture
 *                 `instanceId` has had since this module shipped.
 * - `lost`        we pinned a key and this document proves no key at all. A
 *                 rollback to a pre-signing build looks exactly like a
 *                 downgrade attack, which is the attack pinning exists to
 *                 resist, so this refuses to be talked out of the check.
 * - `changed`     a different key answered. A rotation and an impostor look
 *                 identical from here, so this village does not guess.
 */
export type PeerKeyVerdict =
  | { state: "ok" }
  | { state: "unpinned"; pin: string | null }
  | { state: "lost"; detail: string }
  | { state: "changed"; detail: string };

export function checkPinnedKey(pinned: string | null, info: PeerIdentity): PeerKeyVerdict {
  if (!pinned) return { state: "unpinned", pin: info.publicKey };
  if (!info.publicKey) {
    return {
      state: "lost",
      detail: "signing key no longer proved: a rollback to a pre-signing build and a downgrade attack look the same from here, so accept & resume once you know which",
    };
  }
  if (info.publicKey !== pinned) {
    return {
      state: "changed",
      detail: "signing key changed: a rotation and an impostor look the same from here, so accept & resume to pin the new one",
    };
  }
  return { state: "ok" };
}

/**
 * The public key a discovery document has PROVED it holds, or null.
 *
 * Two things have to be true before a key is worth pinning. The document must
 * publish one, and its proof must verify against that key: a document that
 * publishes somebody else's key cannot sign for it, and this is where that
 * shows. The PEM is rebuilt from the raw bytes rather than read from the
 * document, so publishing the real village's `publicKeyBase64url` beside an
 * impostor's `publicKeyPem` fails instead of passing twice.
 *
 * An unsigned document is not a failure. A hand-written static file answering
 * the shape correctly is exactly the peer the discovery handshake exists to
 * admit; it simply never pins a key and keeps the trust-on-first-use posture
 * every peer had before 0057.
 */
function provenKey(doc: any): string | null {
  const b64 = doc?.publicKey?.publicKeyBase64url;
  if (typeof b64 !== "string" || !b64) return null;
  const pem = pemFromRawPublicKey(b64.slice(0, 100));
  if (!pem) return null;
  return verifyDocument(doc, pem) ? b64.slice(0, 100) : null;
}

/**
 * Shake hands, discovery document FIRST.
 *
 * This is the line between a protocol and a product feature. `addPeer` used to
 * fetch `/api/platform/info` and refuse anything whose `platform` string was
 * not the literal `custom-game-foundation`, so only forks of THIS repo could
 * ever federate: a Peerdom organisation, a bioregional council or a
 * hand-written static file could not join a network of villages no matter how
 * correctly it answered.
 *
 * `/.well-known/village.json` is the v1 root and needs no shared codebase, only
 * a shape. `/api/platform/info` keeps answering forever as the v0 fallback,
 * because a peer that learned to read it must never break when a newer document
 * appears. A v0 peer costs one extra request per sweep, six-hourly; recording
 * which one answered would need a column and is not worth one yet.
 *
 * Branch on `supports`, never on version ordering. A village that turned a
 * module off is not older, it is differently shaped.
 */
export async function discoverPeer(baseUrl: string): Promise<PeerIdentity | null> {
  /*
   * BOUNDS. Every field below is now written by a stranger.
   *
   * Before this, `version` and `instanceId` came from a peer running this exact
   * platform: a short semver and a uuid. A village document can carry any
   * string, and `version` is varchar(20) while `instance_id` is varchar(64), so
   * under STRICT_TRANS_TABLES a peer publishing "2.1.0+build.2026-08-04.a91f3c"
   * would make the admin's add-peer request fail with a truncation error. Cap
   * here, once, so every caller gets values the columns can hold.
   */
  const cap = (v: unknown, n: number): string | null => {
    const s = v === null || v === undefined ? "" : String(v);
    return s ? s.slice(0, n) : null;
  };

  /*
   * A guard refusal is not a 404, and the operator needs to know which.
   *
   * `guardedFetchJson` throws a bare numeric status for an HTTP miss and a
   * sentence for everything else ("resolves to a private address", "too many
   * redirects", "https only"). Swallowing both would record a peer that had
   * started redirecting into a private range as having simply "gone dark",
   * which is the one failure an operator most needs to see. So an HTTP miss
   * falls through quietly and anything else is remembered and rethrown if no
   * document ends up answering.
   */
  let refusal: unknown = null;
  const isHttpStatus = (e: unknown) => /^\d{3}(\s|$)/.test(String((e as any)?.message ?? e));

  try {
    const doc = await fetchJson(`${baseUrl}/.well-known/village.json`);
    if (doc?.instanceId && String(doc?.protocol ?? "").startsWith("village/")) {
      return {
        instanceId: cap(doc.instanceId, 64)!,
        name: cap(doc.name, 120),
        version: cap(doc?.platform?.version, 20),
        protocol: "village/1",
        // Capped in count AND in length. `items` has been capped at 100 since
        // this module shipped; this is peer-controlled text landing in the same
        // cache row and deserves the same treatment.
        supports: Array.isArray(doc.supports)
          ? doc.supports.slice(0, 32).map((c: unknown) => String(c).slice(0, 64))
          : [],
        publicKey: provenKey(doc),
      };
    }
  } catch (e) {
    if (!isHttpStatus(e)) refusal = e;
    // Otherwise: no discovery root here. Fall through, because an older village
    // is not a broken one.
  }

  try {
    const info = await fetchJson(`${baseUrl}/api/platform/info`);
    // The v0 document carries no protocol field, so the platform string is the
    // only thing that identifies it. Kept EXACTLY as strict as it was: this
    // branch is the legacy path and must not become a second, looser front door.
    if (info?.instanceId && info?.platform === "custom-game-foundation") {
      return {
        instanceId: cap(info.instanceId, 64)!,
        name: cap(info.name, 120),
        version: cap(info.version, 20),
        protocol: "platform/0",
        supports: [],
        // The v0 document is unsigned and always was. A v0 peer therefore
        // never pins a key and keeps exactly the posture it has today.
        publicKey: null,
      };
    }
  } catch (e) {
    if (!isHttpStatus(e)) refusal = refusal ?? e;
  }

  if (refusal) throw refusal instanceof Error ? refusal : new Error(String(refusal));
  return null;
}

/** Add a peer: guard the URL, shake its hand, learn who it is. */
export async function addPeer(
  pool: Pool,
  input: { baseUrl: string; addedBy: string; selfInstanceId: string },
): Promise<{ ok: true; peer: any } | { ok: false; error: string }> {
  const baseUrl = String(input.baseUrl).replace(/\/+$/, "");
  const guard = await guardOutboundUrl(baseUrl);
  if (!guard.ok) return { ok: false, error: `refused: ${guard.refused}` };

  let info: PeerIdentity | null;
  try {
    info = await discoverPeer(baseUrl);
  } catch (e: any) {
    // A refusal, not a miss: the address resolved somewhere it should not, or
    // redirected too many times. Say which, so the admin can act on it.
    return { ok: false, error: `refused: ${String(e?.message ?? e).slice(0, 120)}` };
  }
  if (!info) {
    return {
      ok: false,
      error: "nothing at that address answered a village handshake (no /.well-known/village.json, and no platform info)",
    };
  }
  if (info.instanceId === input.selfInstanceId) {
    return { ok: false, error: "that is this village; a village cannot peer with itself" };
  }

  const id = `peer-${Date.now()}-${randomUUID().slice(0, 6)}`;
  try {
    await pool.query(
      // The key is pinned HERE, at the one moment an admin is looking at the
      // address they typed and deciding they mean it (0057). Everything after
      // this is checked against it.
      "INSERT INTO peer_instances (id, instance_id, base_url, name, version, public_key, added_by) VALUES (?,?,?,?,?,?,?)",
      [id, info.instanceId, baseUrl, String(info.name ?? baseUrl).slice(0, 120), info.version, info.publicKey, input.addedBy],
    );
  } catch (e: any) {
    // TWO unique keys, two different problems. Both used to report "already
    // peered with that village", so an operator whose new peer collided on URL
    // with a DIFFERENT village went and looked for a village that was not
    // there. Ask which one it was instead of guessing.
    if (e?.code === "ER_DUP_ENTRY") {
      const [[byId]] = await pool.query<RowDataPacket[]>(
        "SELECT base_url FROM peer_instances WHERE instance_id = ?", [info.instanceId],
      );
      if (byId) {
        return {
          ok: false,
          error: String(byId.base_url) === baseUrl
            ? "already peered with that village"
            : `already peered with that village, at ${byId.base_url}`,
        };
      }
      return { ok: false, error: "another village is already registered at that address" };
    }
    throw e;
  }
  return {
    ok: true,
    peer: {
      id, instanceId: info.instanceId, baseUrl, name: info.name,
      version: info.version, protocol: info.protocol,
      // So the admin can see whether this peer is bound to a key or resting on
      // the instance id alone. A village cannot fix what it cannot see.
      keyPinned: !!info.publicKey,
    },
  };
}

/**
 * One sync sweep: refresh every active peer's published items into the
 * cache. Per-peer failures are recorded on the peer row and never abort the
 * sweep — one village going dark must not silence the rest of the network.
 */
export async function syncPeers(pool: Pool): Promise<{ synced: number; failed: number }> {
  const [peers] = await pool.query<RowDataPacket[]>(
    // Example peers are never dialled: the seeded one points at example.org,
    // and a six-hourly job that sends requests to a domain the village does
    // not control — then writes last_error back onto the example row — is a
    // scheduled job mutating example state, which the inert rule forbids.
    "SELECT * FROM peer_instances WHERE status = 'active' AND is_example = 0",
  );
  let synced = 0;
  let failed = 0;
  for (const p of peers) {
    try {
      // Re-guard every sweep: DNS may have moved somewhere private since.
      const guard = await guardOutboundUrl(String(p.base_url));
      if (!guard.ok) throw new Error(`url refused: ${guard.refused}`);

      // Discovery-first here too, so a peer that upgrades between sweeps keeps
      // being recognised instead of looking like it went dark.
      const info = await discoverPeer(String(p.base_url));
      // Nothing answered a handshake: dark, not stolen. It lands in the catch
      // below as `last_error` and the peer stays active, so a village that was
      // simply mid-deploy recovers on the next sweep without an admin clicking
      // anything. The PAUSE below is reserved for the case it was written for,
      // a DIFFERENT identity answering at a known address. Either way the
      // throw precedes the published fetch, so nothing from an address that
      // failed the handshake ever reaches the cache.
      if (!info) throw new Error("no village handshake at that address any more");
      if (info.instanceId !== String(p.instance_id)) {
        // The address answers, but it is not the village we agreed to hear.
        await pool.query(
          "UPDATE peer_instances SET status = 'paused', last_error = ? WHERE id = ?",
          [`identity changed: expected ${p.instance_id}, got ${info?.instanceId ?? "none"}; re-add to accept the new one`, p.id],
        );
        failed += 1;
        continue;
      }

      /*
       * The instanceId check above is the copyable half. It asks whether the
       * answerer CLAIMS to be the village we agreed to hear, and a uuid read
       * off a public document is as easy to claim as the platform string it
       * replaced. The key check below is the half that cannot be copied: the
       * proof has to be produced with a private key, so a stranger who has
       * cloned every visible field still fails here.
       *
       * A pause is the same act an identity change already triggers, with the
       * same way out: "accept & resume" re-reads the handshake and pins
       * whatever answers, which is a human agreeing to a rotation.
       */
      const verdict = checkPinnedKey(p.public_key ? String(p.public_key) : null, info);
      if (verdict.state === "changed" || verdict.state === "lost") {
        await pool.query(
          "UPDATE peer_instances SET status = 'paused', last_error = ? WHERE id = ?",
          [verdict.detail.slice(0, 300), p.id],
        );
        failed += 1;
        continue;
      }
      if (verdict.state === "unpinned" && verdict.pin) {
        // Trust on first use, one sweep late: a peer added before 0057, or one
        // that only just learned to sign. The window is the same window the
        // instanceId pin has always had, and closing it retroactively would
        // mean asking every existing village to re-add every peer.
        await pool.query("UPDATE peer_instances SET public_key = ? WHERE id = ?", [verdict.pin, p.id]);
      }
      // Fetched unconditionally, NOT gated on `supports`. No village advertises
      // a shared-items capability yet, so branching on one would silently stop
      // syncing every peer that already works. `supports` is recorded instead,
      // which is what a reader needs to know a peer publishes its org chart.
      const published = await fetchJson(`${p.base_url}/api/network/published`);
      const items = Array.isArray(published?.items) ? published.items.slice(0, 100) : [];
      await pool.query(
        "INSERT INTO peer_shared_cache (peer_id, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)",
        // The payload column is JSON, so what a peer can do rides along without
        // a migration.
        [p.id, JSON.stringify({
          items, name: info.name, version: info.version,
          protocol: info.protocol, supports: info.supports,
        })],
      );
      await pool.query(
        "UPDATE peer_instances SET last_sync_at = NOW(), last_error = NULL, name = ?, version = ? WHERE id = ?",
        [String(info.name ?? p.name).slice(0, 120), info.version ?? null, p.id],
      );
      synced += 1;
    } catch (e: any) {
      failed += 1;
      await pool.query(
        "UPDATE peer_instances SET last_error = ? WHERE id = ?",
        [String(e?.message ?? e).slice(0, 300), p.id],
      );
    }
  }
  return { synced, failed };
}

/** Everything peers have shared, from cache, grouped by village. */
export async function peerSharedItems(pool: Pool): Promise<any[]> {
  const [rows] = await pool.query<RowDataPacket[]>(
    // p.is_example: the example peer is a fixture with a hand-built cache
    // payload, and adding a real peer is not a retirement trigger — so a
    // fictional village and a real one sit in this list together, under one
    // banner claiming everything on the page is an example.
    // p.version: recorded on every add and every sweep since the network
    // shipped, and never handed to the page, so nothing showed which build a
    // village was running.
    "SELECT p.id, p.name, p.base_url, p.version, p.last_sync_at, p.status, p.last_error, p.is_example, c.payload, c.fetched_at " +
      "FROM peer_instances p LEFT JOIN peer_shared_cache c ON c.peer_id = p.id ORDER BY p.name",
  );
  return rows.map((r) => {
    const payload = r.payload ? (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload) : null;
    return {
      peerId: String(r.id),
      village: String(payload?.name ?? r.name),
      baseUrl: String(r.base_url),
      status: String(r.status),
      isExample: Number(r.is_example ?? 0) === 1,
      version: payload?.version ?? r.version ?? null,
      lastSyncAt: r.last_sync_at ? new Date(r.last_sync_at).toISOString() : null,
      lastError: r.last_error ?? null,
      items: payload?.items ?? [],
      // What this peer speaks, learned at the last sync. A v0 peer, or one that
      // has never synced, reports "platform/0" and claims nothing, which is
      // exactly what it was doing before any of this existed.
      protocol: String(payload?.protocol ?? "platform/0"),
      supports: Array.isArray(payload?.supports) ? payload.supports.map(String) : [],
      // Only when the peer says it publishes one. A link built from a
      // capability the peer never claimed is a 404 with extra steps.
      orgUrl: Array.isArray(payload?.supports) && payload.supports.includes("org/1")
        ? `${String(r.base_url)}/org/index.md`
        : null,
    };
  });
}
