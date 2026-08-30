/**
 * One assistant engine (S76).
 *
 * Five call sites each grew their own copy of the same eight steps: check for a
 * key, check the per-IP burst limit, check the global daily cap, validate the
 * message list, build a system prompt, POST to Anthropic, dig a JSON object out
 * of the reply, and map a failure onto a status code. They had already drifted
 * in their limits, their fallback sentences and their error shapes, and every
 * new mode copied whichever one was nearest.
 *
 * This file is that shared half. A mode is a row in a table plus a system
 * prompt, so adding one is a decision about what she may see, never ninety
 * lines of plumbing.
 *
 * Two things this fixes beyond the duplication:
 *
 * ONE POOL BECOMES SEVEN BUDGETS. Every path shared a single 600-per-day cap,
 * so a founder in a long setup session could starve the public proposal guide
 * for the rest of the day, and the person it failed for was a stranger trying
 * to offer the village something. Budgets are per mode and the public surface
 * keeps its own.
 *
 * THE BORROWED KEY (Rye, 2026-08-03). A village runs on its own Anthropic key.
 * Until it has one, a deployment MAY fall back to a platform key, and that
 * fallback is an env var set at provisioning, never an admin toggle: a screen
 * that lets a deployment start spending someone else's money is a screen that
 * eventually does. Borrowed usage carries its own smaller allowance so a demo
 * fork cannot spend a production village's headroom.
 */

export type AssistantMode =
  | "proposal"
  | "concierge"
  | "member"
  | "launch"
  | "organize"
  | "studio"
  | "synthesize";

export interface ModeSpec {
  audience: "public" | "member" | "admin";
  /** Calls per day for THIS mode. The sum is the deployment's real ceiling. */
  dailyBudget: number;
  /** Reply cap. A mode that drafts needs more room than one that asks. */
  maxTokens: number;
  /** How many reader calls one turn may make before she must answer. */
  toolCalls: number;
}

/**
 * The public surface gets the largest budget on purpose: it is the one a
 * stranger meets, and the one whose failure costs the village something it
 * cannot see. Admin modes are used by a handful of named people who can be
 * told why they ran out.
 */
export const ASSISTANT_MODES: Record<AssistantMode, ModeSpec> = {
  proposal: { audience: "public", dailyBudget: 250, maxTokens: 800, toolCalls: 0 },
  concierge: { audience: "member", dailyBudget: 100, maxTokens: 400, toolCalls: 0 },
  member: { audience: "member", dailyBudget: 100, maxTokens: 700, toolCalls: 2 },
  launch: { audience: "admin", dailyBudget: 50, maxTokens: 700, toolCalls: 0 },
  organize: { audience: "admin", dailyBudget: 50, maxTokens: 800, toolCalls: 2 },
  studio: { audience: "admin", dailyBudget: 150, maxTokens: 1600, toolCalls: 4 },
  synthesize: { audience: "admin", dailyBudget: 25, maxTokens: 2000, toolCalls: 0 },
};

/** Conversation limits, shared so no mode can quietly widen them. */
export const MAX_TURNS = 40;
export const MAX_MESSAGE_CHARS = 4000;

/**
 * One place for the model id, which was pasted into five call sites and would
 * have drifted the first time anyone changed one of them. Per-mode overrides
 * belong in ASSISTANT_MODES when someone picks them against the current
 * lineup: drafting a role description from a brief and collecting proposal
 * fields are different jobs and should not be forced onto one tier forever.
 */
export const DEFAULT_ASSISTANT_MODEL = "claude-haiku-4-5-20251001";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// ── Injected deps, so this file needs none of the server's globals ───────────

export interface AssistantDeps {
  /** The village's OWN key, from the secrets store. Empty when unset. */
  villageKey(): string;
  /** True when this bucket has already had `max` hits inside the window. */
  rateLimited(bucket: string, max: number, windowMs: number): Promise<boolean>;
  /** Injected for tests. Defaults to the real Anthropic endpoint. */
  fetchImpl?: typeof fetch;
}

let deps: AssistantDeps = {
  villageKey: () => "",
  rateLimited: async () => false,
};

export function wireAssistant(d: AssistantDeps): void {
  deps = d;
}

// ── The key ──────────────────────────────────────────────────────────────────

export type KeySource = "village" | "platform";

export interface ResolvedKey {
  key: string;
  source: KeySource;
}

/**
 * The village's own key always wins, with no admin action and no restart: the
 * moment a founder saves theirs, borrowing stops.
 *
 * The platform key is read from the environment at call time and is never
 * written to app_config, never returned by the secrets route (not even masked,
 * since it is not the village's secret to see), and never present in /health,
 * the platform handshake, or the launch checklist.
 */
export function resolveKey(env: NodeJS.ProcessEnv = process.env): ResolvedKey | null {
  const own = (deps.villageKey() ?? "").trim();
  if (own) return { key: own, source: "village" };
  const platform = (env.PLATFORM_ASSISTANT_KEY ?? "").trim();
  if (platform) return { key: platform, source: "platform" };
  return null;
}

/**
 * Borrowed usage has its own, smaller allowance.
 *
 * ABSENT and ZERO are different answers and must not be conflated: `Number("")`
 * is 0, so reading the unset variable as a number made "nobody configured an
 * allowance" mean "allow nothing", and borrowing would have looked broken with
 * no message explaining why. Absent means the default; an explicit 0 still
 * means zero, the way every other cap in this platform fails closed.
 */
export function platformDailyCap(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.PLATFORM_ASSISTANT_DAILY_CAP;
  if (raw === undefined || String(raw).trim() === "") return 100;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 100;
}

// ── Validation ───────────────────────────────────────────────────────────────

export type Sanitized = { ok: true; messages: ChatMessage[] } | { ok: false; error: string };

/**
 * One validator for every mode. Roles other than user and assistant are
 * dropped, each message is capped, the conversation is bounded, and the last
 * message must be from the person: a request that ends on an assistant turn is
 * either a bug or someone trying to put words in her mouth.
 */
export function sanitizeMessages(incoming: unknown): Sanitized {
  if (!Array.isArray(incoming)) return { ok: false, error: "messages required" };
  if (incoming.length > MAX_TURNS) return { ok: false, error: "conversation too long" };
  const messages = incoming
    .filter((m: any) => (m?.role === "user" || m?.role === "assistant") && typeof m.content === "string")
    .map((m: any) => ({ role: m.role as "user" | "assistant", content: String(m.content).slice(0, MAX_MESSAGE_CHARS) }));
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return { ok: false, error: "last message must be from the user" };
  }
  return { ok: true, messages };
}

/**
 * Dig the JSON object out of a reply.
 *
 * Every mode instructs the model to answer with one JSON object and every mode
 * had its own brace-slicing copy. A model that wraps the object in prose, or
 * fences it, still has its answer read; a model that returns nothing usable
 * falls back to the caller's sentence instead of showing a member a stack.
 */
export function parseJsonReply<T = any>(text: string, fallback: T): T {
  const trimmed = String(text ?? "").trim();
  if (!trimmed) return fallback;
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  try {
    return JSON.parse(start >= 0 && end > start ? trimmed.slice(start, end + 1) : trimmed) as T;
  } catch {
    return fallback;
  }
}

// ── The call ─────────────────────────────────────────────────────────────────

export interface AssistantRequest {
  mode: AssistantMode;
  system: string;
  messages: ChatMessage[];
  /** Per-call override. Defaults to the mode's cap. */
  maxTokens?: number;
  model: string;
  /** For the per-IP burst guard. */
  clientIp: string;
}

export type AssistantResult =
  | { ok: true; text: string; keySource: KeySource }
  | { ok: false; status: number; error: string };

/**
 * The endpoint, honouring ANTHROPIC_BASE_URL.
 *
 * That variable is load-bearing and predates this file: the loop test points it
 * at a local stub so the acceptance run never spends real tokens, and a
 * deployment behind a gateway needs it too. Hardcoding the real URL here would
 * have silently escaped both.
 */
function anthropicUrl(env: NodeJS.ProcessEnv = process.env): string {
  const base = (env.ANTHROPIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  return `${base || "https://api.anthropic.com"}/v1/messages`;
}

/**
 * Every guard, in the order that costs least to check first, then the call.
 *
 * The per-IP burst limit runs before the budget so a single abusive caller
 * cannot spend a mode's day on rejections, and the budget check runs before
 * the key resolution so an exhausted mode never touches a credential.
 */
export async function callAssistant(req: AssistantRequest): Promise<AssistantResult> {
  const spec = ASSISTANT_MODES[req.mode];
  if (!spec) return { ok: false, status: 400, error: `unknown assistant mode: ${String(req.mode)}` };

  if (await deps.rateLimited(`assist:${req.clientIp}`, 30, 60 * 60 * 1000)) {
    return { ok: false, status: 429, error: "Slow down a moment, then keep going." };
  }

  const today = new Date().toISOString().slice(0, 10);
  if (await deps.rateLimited(`assistant-day:${req.mode}:${today}`, spec.dailyBudget, 24 * 60 * 60 * 1000)) {
    return { ok: false, status: 503, error: "assistant-unavailable" };
  }

  const resolved = resolveKey();
  if (!resolved) return { ok: false, status: 503, error: "assistant-unavailable" };

  // A borrowed key spends someone else's allowance, so it carries a second,
  // smaller ceiling on top of the mode's own.
  if (resolved.source === "platform") {
    const cap = platformDailyCap();
    if (cap === 0 || (await deps.rateLimited(`assistant-platform-day:${today}`, cap, 24 * 60 * 60 * 1000))) {
      return { ok: false, status: 503, error: "assistant-unavailable" };
    }
  }

  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const r = await doFetch(anthropicUrl(), {
      method: "POST",
      headers: {
        "x-api-key": resolved.key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: req.model,
        max_tokens: req.maxTokens ?? spec.maxTokens,
        system: req.system,
        messages: req.messages,
      }),
    });
    if (!r.ok) {
      // The key never reaches a log line, whoever it belongs to.
      console.error(`[assistant:${req.mode}] Anthropic error`, r.status, (await r.text()).slice(0, 300));
      return { ok: false, status: 502, error: "assistant-error" };
    }
    const data: any = await r.json();
    const text = (data?.content ?? [])
      .filter((b: any) => b?.type === "text")
      .map((b: any) => b.text)
      .join("")
      .trim();
    return { ok: true, text, keySource: resolved.source };
  } catch (err) {
    console.error(`[assistant:${req.mode}]`, err);
    return { ok: false, status: 502, error: "assistant-error" };
  }
}

/** Whether this deployment is currently spending the platform's key. */
export function borrowingPlatformKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveKey(env)?.source === "platform";
}
