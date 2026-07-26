/**
 * The notification spine (S16). The RULES are ported from regen-civics; the
 * code is not — this is a fresh implementation that deliberately avoids the
 * warts its own author documented:
 *
 *  - dedupe_key is NOT NULL with a real unique index; a duplicate insert is
 *    detected by the unique violation, never by driver-specific affectedRows
 *    sniffing;
 *  - delivery (email now, push when VAPID keys exist) is an EXPLICIT dispatch
 *    step after a fresh insert, not a side effect buried inside it;
 *  - preferences are ONE typed model, validated field-by-field from the
 *    member's prefs JSON — no split-brain parsing.
 *
 * Ported rules, verbatim where they were sound:
 *  - dedupe grammar: one stable key per (event, recipient) — a retried
 *    producer inserts exactly once, forever;
 *  - DAILY_EMAIL_CAP = 20 per user per rolling 24h (counted via emailed_at) —
 *    over the cap the in-app row still exists, only the email drops;
 *  - per-type cadence with 'never' as the global kill switch: quest and role
 *    events default IMMEDIATE, gratitude and stage default DAILY (a digest),
 *    unknown types are in-app only;
 *  - precedence (mention > direct reply > follow) ships with the forum in
 *    Block 5 — the spine carries the alreadyNotified pattern's home, not a
 *    speculative implementation of surfaces that don't exist yet.
 */
import type { Pool, RowDataPacket } from "mysql2/promise";

export const DAILY_EMAIL_CAP = 20;
/** Digest looks back this many days for unread, un-emailed rows. */
export const DIGEST_LOOKBACK_DAYS = 3;

export interface NotifyInput {
  userId: string;
  type: string;
  title: string;
  body?: string | null;
  link?: string | null;
  actorUserId?: string | null;
  dedupeKey: string;
}

export interface NotifyPrefs {
  /** Global email kill switch. */
  emailsOff: boolean;
  gratitudeEmail: "daily" | "off";
  questsEmail: "immediate" | "daily" | "off";
  rolesEmail: "immediate" | "daily" | "off";
  /** Forum (S24): the regen defaults — mentions and replies immediate. */
  mentionsEmail: "immediate" | "daily" | "off";
  repliesEmail: "immediate" | "daily" | "off";
}

/** Junk-tolerant, field-by-field: a malformed blob degrades to defaults. */
export function resolveNotifyPrefs(prefs: any): NotifyPrefs {
  const n = prefs?.notify ?? {};
  const pick = <T extends string>(v: unknown, allowed: T[], fallback: T): T =>
    allowed.includes(v as T) ? (v as T) : fallback;
  return {
    emailsOff: n.emailsOff === true,
    gratitudeEmail: pick(n.gratitudeEmail, ["daily", "off"], "daily"),
    questsEmail: pick(n.questsEmail, ["immediate", "daily", "off"], "immediate"),
    rolesEmail: pick(n.rolesEmail, ["immediate", "daily", "off"], "immediate"),
    mentionsEmail: pick(n.mentionsEmail, ["immediate", "daily", "off"], "immediate"),
    repliesEmail: pick(n.repliesEmail, ["immediate", "daily", "off"], "immediate"),
  };
}

/** Which email cadence a type resolves to. Unknown types: in-app only. */
export function emailCadenceFor(type: string, p: NotifyPrefs): "immediate" | "daily" | "off" {
  if (p.emailsOff) return "off";
  switch (type) {
    case "gratitude":
      return p.gratitudeEmail;
    case "quest_consented":
    case "quest_declined":
      return p.questsEmail;
    case "role_appointed":
      return p.rolesEmail;
    case "mention":
      return p.mentionsEmail;
    case "forum_reply":
      return p.repliesEmail;
    case "thread_activity":
      return "off"; // in-app only by design — follows are ambient, never urgent
    case "contact_request":
      return "off"; // the relay already sent its own email with Reply-To
    case "stage_advanced":
      return "daily"; // fixed: celebratory, never urgent
    default:
      return "off";
  }
}

export interface NotifyDeps {
  pool: Pool;
  /** Load the recipient (email + prefs). Injected so the spine never imports the server. */
  memberById(id: string): Promise<any | null>;
  /** The one mailer. Never throws. */
  sendEmail(opts: { to: string[]; subject: string; html: string }): Promise<void>;
  /** Absolute origin for links in emails, e.g. https://amora.regencivics.earth */
  origin(): string;
  projectName(): string;
}

export interface NotifyResult {
  fresh: boolean;
  id?: string;
}

/**
 * Insert exactly once (the dedupe key decides), then explicitly dispatch
 * immediate email when the recipient's cadence says so. Never throws into
 * the producing mutation: a notification is a trace, not the deed.
 */
export async function insertNotification(deps: NotifyDeps, input: NotifyInput): Promise<NotifyResult> {
  const id = `ntf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  try {
    await deps.pool.query(
      "INSERT INTO notifications (id, user_id, type, title, body, link, actor_user_id, dedupe_key) VALUES (?,?,?,?,?,?,?,?)",
      [id, input.userId, input.type, input.title.slice(0, 255), input.body ?? null, input.link ?? null, input.actorUserId ?? null, input.dedupeKey],
    );
  } catch (e: any) {
    if (e?.code === "ER_DUP_ENTRY") return { fresh: false };
    console.error("[notify] insert failed (mutation unaffected)", e);
    return { fresh: false };
  }

  // Explicit dispatch — a failure here never un-inserts the row.
  try {
    await maybeEmailImmediate(deps, { ...input, id });
  } catch (e) {
    console.error("[notify] immediate email dispatch failed", e);
  }
  return { fresh: true, id };
}

async function underDailyCap(pool: Pool, userId: string): Promise<boolean> {
  const [[row]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND emailed_at >= (NOW() - INTERVAL 1 DAY)",
    [userId],
  );
  return Number(row?.n ?? 0) < DAILY_EMAIL_CAP;
}

function emailShell(projectName: string, inner: string): string {
  return `<!doctype html><html><body style="font-family:system-ui,-apple-system,sans-serif;background:#f9fafb;padding:24px;color:#1f2937"><div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb"><div style="background:#2D5A5A;color:#fff;padding:18px 24px"><div style="font-size:16px;font-weight:700">${projectName}</div></div><div style="padding:22px 24px;line-height:1.6">${inner}</div></div></body></html>`;
}

async function maybeEmailImmediate(deps: NotifyDeps, n: NotifyInput & { id: string }) {
  const user = await deps.memberById(n.userId);
  if (!user?.email || !user.passwordHash) return; // tombstones and claim-pending accounts get no email
  const prefs = resolveNotifyPrefs(user.prefs);
  if (emailCadenceFor(n.type, prefs) !== "immediate") return;
  if (!(await underDailyCap(deps.pool, n.userId))) return;

  const url = deps.origin() + (n.link ?? "/profile");
  await deps.sendEmail({
    to: [user.email],
    subject: n.title,
    html: emailShell(
      deps.projectName(),
      `<h2 style="margin:0 0 8px;font-size:17px">${escapeHtml(n.title)}</h2>` +
        (n.body ? `<p style="margin:0 0 14px;color:#4b5563;border-left:3px solid #2D5A5A;padding-left:10px">${escapeHtml(n.body)}</p>` : "") +
        `<p><a href="${escapeHtml(url)}" style="display:inline-block;background:#2D5A5A;color:#fff;border-radius:8px;padding:9px 16px;text-decoration:none;font-weight:600">See it on your profile</a></p>` +
        `<p style="color:#9ca3af;font-size:12px;margin-top:18px">Choose which emails you get on your profile page.</p>`,
    ),
  });
  // Stamped even when the provider quietly declined — a late retry email
  // surprises more than a missed one (regen's rule, kept deliberately).
  await deps.pool.query("UPDATE notifications SET emailed_at = CURRENT_TIMESTAMP WHERE id = ? AND emailed_at IS NULL", [n.id]);
}

/**
 * The daily digest: unread, never-emailed rows from the last few days whose
 * type resolves to 'daily' for that member. One email per member per run.
 */
export async function runNotificationDigest(deps: NotifyDeps): Promise<{ users: number; rows: number }> {
  const [rows] = await deps.pool.query<RowDataPacket[]>(
    "SELECT id, user_id, type, title, link FROM notifications " +
      "WHERE emailed_at IS NULL AND is_read = 0 AND created_at >= (NOW() - INTERVAL ? DAY) " +
      "ORDER BY user_id, created_at",
    [DIGEST_LOOKBACK_DAYS],
  );
  const byUser = new Map<string, RowDataPacket[]>();
  for (const r of rows) {
    const list = byUser.get(String(r.user_id)) ?? [];
    list.push(r);
    byUser.set(String(r.user_id), list);
  }

  let sent = 0;
  let included = 0;
  for (const [userId, list] of Array.from(byUser.entries())) {
    const user = await deps.memberById(userId);
    if (!user?.email || !user.passwordHash) continue;
    const prefs = resolveNotifyPrefs(user.prefs);
    if (prefs.emailsOff) continue;
    const daily = list.filter((r) => emailCadenceFor(String(r.type), prefs) === "daily");
    if (!daily.length) continue;

    const subject = daily.length === 1 ? String(daily[0].title) : `${daily.length} things happened while you were away`;
    const items = daily
      .slice(0, 10)
      .map((r) => `<li style="margin:4px 0"><a href="${escapeHtml(deps.origin() + (r.link ?? "/profile"))}" style="color:#2D5A5A">${escapeHtml(String(r.title))}</a></li>`)
      .join("");
    const more = daily.length > 10 ? `<p style="color:#6b7280">…and ${daily.length - 10} more.</p>` : "";
    await deps.sendEmail({
      to: [user.email],
      subject,
      html: emailShell(deps.projectName(), `<h2 style="margin:0 0 10px;font-size:17px">While you were away</h2><ul style="padding-left:18px;margin:0 0 10px">${items}</ul>${more}<p><a href="${escapeHtml(deps.origin() + "/profile")}" style="color:#2D5A5A;font-weight:600">See everything</a></p>`),
    });
    await deps.pool.query(
      `UPDATE notifications SET emailed_at = CURRENT_TIMESTAMP WHERE id IN (${daily.map(() => "?").join(",")})`,
      daily.map((r) => r.id),
    );
    sent++;
    included += daily.length;
    // Be gentle with the mail provider's rate limits.
    await new Promise((r) => setTimeout(r, 300));
  }
  return { users: sent, rows: included };
}

// ── Reads ────────────────────────────────────────────────────────────────────

export async function notificationsFor(pool: Pool, userId: string, limit = 50) {
  const [rows] = await pool.query<RowDataPacket[]>(
    "SELECT id, type, title, body, link, is_read, actor_user_id, created_at FROM notifications " +
      "WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?",
    [userId, Math.max(1, Math.min(200, limit))],
  );
  const [[unread]] = await pool.query<any[]>(
    "SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND is_read = 0",
    [userId],
  );
  return {
    unreadCount: Number(unread?.n ?? 0),
    notifications: rows.map((r) => ({
      id: String(r.id),
      type: String(r.type),
      title: String(r.title),
      body: r.body ?? null,
      link: r.link ?? null,
      isRead: !!r.is_read,
      actorUserId: r.actor_user_id ?? null,
      at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    })),
  };
}

export async function markNotificationsRead(pool: Pool, userId: string, ids?: string[]): Promise<number> {
  if (ids?.length) {
    const [r]: any = await pool.query(
      `UPDATE notifications SET is_read = 1 WHERE user_id = ? AND id IN (${ids.map(() => "?").join(",")})`,
      [userId, ...ids],
    );
    return r.affectedRows ?? 0;
  }
  const [r]: any = await pool.query("UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0", [userId]);
  return r.affectedRows ?? 0;
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
