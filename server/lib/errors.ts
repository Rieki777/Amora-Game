/**
 * Where a crash goes (PY6).
 *
 * Until now an unhandled error printed to stdout and vanished with the next
 * deploy. That is survivable for a website. It is not survivable for a
 * platform that moves money: a settle handler throwing at 3am, a scheduler job
 * dying silently, a boot invariant tripping on a fork nobody is watching — all
 * of it landed in a log stream nobody reads, and the first anyone heard was a
 * member saying "I paid and nothing happened".
 *
 * Deliberately NOT an SDK. A third-party error service is one more vendor,
 * one more key, one more thing that can be down, and — since exception
 * payloads carry request context — one more place village data ends up. The
 * shape here is a plain HTTPS POST that any of them accepts, plus two sinks
 * that need no vendor at all:
 *
 *   1. ALWAYS: an admin notification, so a crash is visible inside the app to
 *      the people responsible for it, whether or not anything else is set up.
 *   2. OPTIONAL: a webhook (`ERROR_WEBHOOK_URL`) — Sentry's store endpoint, a
 *      Slack incoming webhook, Discord, or a fork's own collector.
 *
 * Deduped by a fingerprint of the message and top frame, because the failure
 * mode of every alerting system is the same one: a loop that fires ten
 * thousand identical alerts and teaches everyone to mute the channel.
 */
import { guardedFetchJson } from "./toolcheck";

export interface ErrorContext {
  /** Where it happened, in words a steward can act on: "stripe webhook". */
  where: string;
  /** Anything safe to attach. NEVER tokens, bodies, or member PII. */
  detail?: Record<string, string | number | boolean | null>;
}

type Reporter = (title: string, dedupeKey: string) => Promise<void>;

/**
 * WHAT THE ALARM ACTUALLY DID, said out loud.
 *
 * An alerting call that returns `void` cannot be distinguished from an
 * alerting call that reached nobody, and the second is the normal state of a
 * fresh village: `ERROR_WEBHOOK_URL` is unset until an operator sets it, and
 * the admin sink needs a database that a boot failure has often just proved
 * unreachable. A caller that is about to exit the process needs to be able to
 * print whether anything left the building, so the log line at least names the
 * silence instead of implying delivery.
 */
export interface ErrorDelivery {
  /** Reported before, inside the dedupe window: the log has it, no sink was called. */
  suppressed: boolean;
  admins: "sent" | "failed" | "not wired";
  webhook: "sent" | "failed" | "not configured";
}

/** True when this report reached at least one place a person can look. */
export function reachedSomebody(d: ErrorDelivery): boolean {
  return d.admins === "sent" || d.webhook === "sent";
}

let notifyAdmins: Reporter | null = null;
let instanceLabel = "village";

/** Wired once at boot, so this module needs no import from index.ts. */
export function wireErrorReporting(opts: { notifyAdmins: Reporter; instanceLabel: string }): void {
  notifyAdmins = opts.notifyAdmins;
  instanceLabel = opts.instanceLabel;
}

/**
 * One line per distinct failure per window. The window is deliberately long:
 * the second identical crash tells you nothing the first did not, and the
 * cost of a noisy channel is that the loud one gets ignored too.
 */
const WINDOW_MS = 60 * 60 * 1000;
const lastSeen = new Map<string, number>();

/** Message + top stack frame. Stable across repeats, distinct across causes. */
function fingerprint(err: unknown, where: string): string {
  const e = err as any;
  const msg = String(e?.message ?? e ?? "unknown");
  const frame = String(e?.stack ?? "").split("\n")[1]?.trim() ?? "";
  return `${where}|${msg.slice(0, 120)}|${frame.slice(0, 120)}`;
}

export async function reportError(err: unknown, ctx: ErrorContext): Promise<ErrorDelivery> {
  const e = err as any;
  const message = String(e?.message ?? e ?? "unknown error");
  const key = fingerprint(err, ctx.where);
  const now = Date.now();
  const seen = lastSeen.get(key) ?? 0;
  const repeat = now - seen < WINDOW_MS;
  lastSeen.set(key, now);
  // Bounded: a pathological loop with unique messages must not become a leak.
  if (lastSeen.size > 500) lastSeen.clear();

  // The log always gets it, repeat or not — that is what a log is for.
  console.error(`[error] ${ctx.where}: ${message}`, ctx.detail ?? {}, e?.stack ?? "");
  if (repeat) return { suppressed: true, admins: "not wired", webhook: "not configured" };

  const delivery: ErrorDelivery = { suppressed: false, admins: "not wired", webhook: "not configured" };

  if (notifyAdmins) {
    try {
      await notifyAdmins(
        `Something broke in ${ctx.where}: ${message.slice(0, 200)}`,
        `error:${key.slice(0, 120)}`,
      );
      delivery.admins = "sent";
    } catch {
      /* an alarm that fails must not become the crash */
      delivery.admins = "failed";
    }
  }

  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return delivery;
  try {
    // Through the pinned-IP dialer, like every other outbound call: an
    // admin-settable URL is exactly the shape SSRF lives in.
    await guardedFetchJson(url, 5000, {
      method: "POST",
      body: {
        // A shape Slack, Discord and generic collectors all accept, with the
        // structured fields underneath for anything that reads them.
        text: `[${instanceLabel}] ${ctx.where}: ${message}`,
        instance: instanceLabel,
        where: ctx.where,
        message,
        stack: String(e?.stack ?? "").slice(0, 4000),
        detail: ctx.detail ?? {},
        at: new Date().toISOString(),
      },
    });
    delivery.webhook = "sent";
  } catch (sendErr) {
    console.error("[error] could not reach ERROR_WEBHOOK_URL", sendErr);
    delivery.webhook = "failed";
  }
  return delivery;
}

/**
 * REPORT, THEN GIVE UP ON REPORTING. For callers that are about to exit.
 *
 * `reportError` awaits two sinks that can both hang for longer than a dying
 * process should wait. The admin sink is a database write, and the failure
 * that most needs reporting — a boot that could not reach MySQL — is exactly
 * the one where that write sits on a connect timeout. So the caller gets a
 * deadline and an answer either way: the webhook needs no database and no
 * schema, which is what makes it the sink that survives the interesting
 * failures.
 *
 * On timeout the in-flight report is NOT cancelled; it is abandoned. If it
 * lands a moment later, good, and if the process exits first, the log line
 * already said the alarm did not confirm.
 */
export async function reportErrorWithin(
  budgetMs: number,
  err: unknown,
  ctx: ErrorContext,
): Promise<ErrorDelivery | "timed out"> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race<ErrorDelivery | "timed out">([
      reportError(err, ctx).catch((reportErr) => {
        // reportError swallows its own sink failures; anything reaching here
        // is a bug in the reporter, and a bug in the reporter must not become
        // the reason nobody hears about the original crash.
        console.error("[error] the error reporter itself threw", reportErr);
        return { suppressed: false, admins: "failed", webhook: "failed" } as ErrorDelivery;
      }),
      new Promise<"timed out">((resolve) => {
        timer = setTimeout(() => resolve("timed out"), budgetMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * The last line of defence. Node's default for an unhandled rejection is to
 * crash the process; that is correct, but it must not happen QUIETLY.
 */
export function installCrashHandlers(): void {
  process.on("unhandledRejection", (reason) => {
    void reportError(reason, { where: "an unhandled promise" });
  });
  process.on("uncaughtException", (err) => {
    void reportError(err, { where: "an uncaught exception" });
    // Give the alert a moment to leave, then let the platform restart us. A
    // process that keeps running after an uncaught exception is in a state
    // nobody has reasoned about, and this one moves money.
    setTimeout(() => process.exit(1), 2000).unref();
  });
}
