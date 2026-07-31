/**
 * The feedback spine (S66): bugs and ideas from any village, captured
 * locally ALWAYS, relayed to the platform hub only while the village keeps
 * the relay on.
 *
 * The design honors two people at once. The village admin always has the
 * full local queue — turning the relay off changes nothing about their own
 * view, it only stops the copy flowing upstream. And the platform team,
 * when the relay is on, sees CONTENT and not people: the payload carries
 * the instance's identity (which village, which build) and the item's text,
 * never who submitted it. A member's name stays inside their village.
 *
 * Relay mechanics are queue-and-forget: items relay on a scheduler sweep,
 * `relayed_at` is set only on a 2xx, and any failure just leaves the rows
 * for the next sweep. A fork must never break — or even slow down — because
 * the hub is down; the hub is a listener, not a dependency.
 *
 * The fingerprint (sha256 prefix over kind + normalized text) lets the hub
 * collapse forty villages hitting one crash into one item with a count,
 * without needing any identity to do it.
 */
import { createHash, randomUUID } from "crypto";
import type { Pool, RowDataPacket } from "mysql2/promise";
import { guardedFetchJson } from "./toolcheck";

export interface FeedbackInput {
  kind: "bug" | "idea";
  title: string;
  detail: string;
  pageUrl?: string | null;
  submittedBy?: string | null;
}

export function feedbackFingerprint(kind: string, title: string, detail: string): string {
  const normalized = `${kind}\n${title}\n${detail}`.toLowerCase().replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 40);
}

export async function recordFeedback(
  pool: Pool,
  input: FeedbackInput,
  /** The relay state AT CAPTURE — the promise the form made to this person. */
  mayRelay: boolean,
): Promise<{ id: string }> {
  const id = `fb-${Date.now()}-${randomUUID().slice(0, 8)}`;
  await pool.query(
    "INSERT INTO feedback_items (id, kind, title, detail, page_url, submitted_by, fingerprint, may_relay) VALUES (?,?,?,?,?,?,?,?)",
    [
      id,
      input.kind,
      input.title.slice(0, 200),
      input.detail.slice(0, 8000),
      input.pageUrl ? String(input.pageUrl).slice(0, 500) : null,
      input.submittedBy ?? null,
      feedbackFingerprint(input.kind, input.title, input.detail),
      mayRelay ? 1 : 0,
    ],
  );
  return { id };
}

export interface RelayIdentity {
  instanceId: string;
  version: string;
  build: string;
  /** The village's public name — brand overlay, so the hub can say who. */
  name: string;
}

/**
 * One sweep: send every unrelayed item, oldest first, in one batch. Returns
 * how many were acknowledged. Throws nothing outward — a relay problem is a
 * log line and a retry, never a village's problem.
 */
export async function relayFeedback(
  pool: Pool,
  hubUrl: string,
  identity: RelayIdentity,
): Promise<{ sent: number }> {
  const [rows] = await pool.query<RowDataPacket[]>(
    // may_relay = 1 is the consent recorded when the item was CAPTURED.
    // Anything submitted while the relay was off stays home forever, even
    // if the relay is switched on later — the form promised that, and a
    // setting changing afterwards does not un-promise it.
    "SELECT id, kind, title, detail, page_url, fingerprint, created_at FROM feedback_items " +
      "WHERE relayed_at IS NULL AND may_relay = 1 ORDER BY created_at ASC LIMIT 50",
  );
  if (rows.length === 0) return { sent: 0 };

  const payload = {
    instance: identity,
    items: rows.map((r) => ({
      // The village-local id lets a future hub answer "this one is fixed in
      // build X" back to the right row. No member field exists to leak.
      localId: String(r.id),
      kind: String(r.kind),
      title: String(r.title),
      detail: String(r.detail),
      pageUrl: r.page_url ? String(r.page_url) : null,
      fingerprint: String(r.fingerprint),
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    })),
  };

  try {
    // Through the PINNED dialer, not bare fetch. FEEDBACK_HUB_URL is read
    // straight from the environment with no scheme or range validation, and
    // this payload carries up to 8000 characters of member-written detail
    // per item — the one outbound call in the tree that both trusts an
    // operator-set address and ships village content to it. guardedFetchJson
    // is https-only, refuses private/loopback/CGNAT ranges, and re-guards
    // every redirect hop against the address actually dialled.
    await guardedFetchJson(hubUrl, 10_000, { method: "POST", body: payload });
    await pool.query(
      `UPDATE feedback_items SET relayed_at = NOW() WHERE id IN (${rows.map(() => "?").join(",")})`,
      rows.map((r) => r.id),
    );
    return { sent: rows.length };
  } catch (e: any) {
    // Unreachable hub is EXPECTED sometimes, and so is a refused URL. Either
    // way: quiet log, rows stay queued, natural retry. The hub is a listener,
    // never a dependency — nothing here may escape into the caller.
    console.error(`[feedback] relay skipped: ${String(e?.message ?? e).slice(0, 120)} — ${rows.length} item(s) stay queued`);
    return { sent: 0 };
  }
}
