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
 */
import { randomUUID } from "crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { guardOutboundUrl } from "./toolcheck";

export const SHARED_ITEM_TYPES = ["need", "offer"] as const;
export type SharedItemType = (typeof SHARED_ITEM_TYPES)[number];

async function fetchJson(url: string, timeoutMs = 10_000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Add a peer: guard the URL, shake its hand, learn who it is. */
export async function addPeer(
  pool: Pool,
  input: { baseUrl: string; addedBy: string; selfInstanceId: string },
): Promise<{ ok: true; peer: any } | { ok: false; error: string }> {
  const baseUrl = String(input.baseUrl).replace(/\/+$/, "");
  const guard = await guardOutboundUrl(baseUrl);
  if (!guard.ok) return { ok: false, error: `refused: ${guard.refused}` };

  let info: any;
  try {
    info = await fetchJson(`${baseUrl}/api/platform/info`);
  } catch (e: any) {
    return { ok: false, error: `no platform handshake at that address (${String(e?.message ?? e).slice(0, 60)})` };
  }
  if (!info?.instanceId || info?.platform !== "custom-game-foundation") {
    return { ok: false, error: "that deployment does not speak this platform's handshake (it may need upgrading)" };
  }
  if (String(info.instanceId) === input.selfInstanceId) {
    return { ok: false, error: "that is this village — a village cannot peer with itself" };
  }

  const id = `peer-${Date.now()}-${randomUUID().slice(0, 6)}`;
  try {
    await pool.query(
      "INSERT INTO peer_instances (id, instance_id, base_url, name, version, added_by) VALUES (?,?,?,?,?,?)",
      [id, String(info.instanceId), baseUrl, String(info.name ?? baseUrl).slice(0, 120), info.version ?? null, input.addedBy],
    );
  } catch (e: any) {
    if (e?.code === "ER_DUP_ENTRY") return { ok: false, error: "already peered with that village" };
    throw e;
  }
  return { ok: true, peer: { id, instanceId: info.instanceId, baseUrl, name: info.name, version: info.version } };
}

/**
 * One sync sweep: refresh every active peer's published items into the
 * cache. Per-peer failures are recorded on the peer row and never abort the
 * sweep — one village going dark must not silence the rest of the network.
 */
export async function syncPeers(pool: Pool): Promise<{ synced: number; failed: number }> {
  const [peers] = await pool.query<RowDataPacket[]>(
    "SELECT * FROM peer_instances WHERE status = 'active'",
  );
  let synced = 0;
  let failed = 0;
  for (const p of peers) {
    try {
      // Re-guard every sweep: DNS may have moved somewhere private since.
      const guard = await guardOutboundUrl(String(p.base_url));
      if (!guard.ok) throw new Error(`url refused: ${guard.refused}`);

      const info = await fetchJson(`${p.base_url}/api/platform/info`);
      if (String(info?.instanceId ?? "") !== String(p.instance_id)) {
        // The address answers, but it is not the village we agreed to hear.
        await pool.query(
          "UPDATE peer_instances SET status = 'paused', last_error = ? WHERE id = ?",
          [`identity changed: expected ${p.instance_id}, got ${info?.instanceId ?? "none"} — re-add to accept the new one`, p.id],
        );
        failed += 1;
        continue;
      }
      const published = await fetchJson(`${p.base_url}/api/network/published`);
      const items = Array.isArray(published?.items) ? published.items.slice(0, 100) : [];
      await pool.query(
        "INSERT INTO peer_shared_cache (peer_id, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)",
        [p.id, JSON.stringify({ items, name: info.name, version: info.version })],
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
    "SELECT p.id, p.name, p.base_url, p.last_sync_at, p.status, p.last_error, c.payload, c.fetched_at " +
      "FROM peer_instances p LEFT JOIN peer_shared_cache c ON c.peer_id = p.id ORDER BY p.name",
  );
  return rows.map((r) => {
    const payload = r.payload ? (typeof r.payload === "string" ? JSON.parse(r.payload) : r.payload) : null;
    return {
      peerId: String(r.id),
      village: String(payload?.name ?? r.name),
      baseUrl: String(r.base_url),
      status: String(r.status),
      lastSyncAt: r.last_sync_at ? new Date(r.last_sync_at).toISOString() : null,
      lastError: r.last_error ?? null,
      items: payload?.items ?? [],
    };
  });
}
