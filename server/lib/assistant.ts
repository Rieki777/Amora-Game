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

import { fenceForPrompt, toolNameToKey } from "./villageReaders";

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

/**
 * What one answer cost upstream.
 *
 * All four fields, never a subset. `inputTokens` is the UNCACHED remainder
 * only, so a caller that sums it alone under-reports the moment anyone turns
 * prompt caching on, and the under-report looks exactly like a saving.
 */
export interface AssistantUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

/** One tool as the wire wants it. Readers take no arguments, so the schema is empty. */
export interface AssistantTool {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown> };
}

/**
 * The wire's message shape, which is NOT `ChatMessage`.
 *
 * A tool turn carries content blocks, and `sanitizeMessages` filters on
 * `typeof m.content === "string"`, so feeding these back through the validator
 * would silently drop every one of them. Internal on purpose: the loop builds
 * this from sanitized ChatMessages and nothing outside constructs one.
 */
type WireMessage = { role: "user" | "assistant"; content: string | any[] };

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
  /**
   * Who is asking, for the usage row. Null on the public surfaces.
   * `user_id` cannot be backfilled once rows exist, so it goes in from the
   * first row even though nothing enforces a per-user ceiling yet.
   */
  userId?: string | null;
  /**
   * The tools this VIEWER may call, already filtered by the reader catalog.
   * On the request and not on the deps: the reader ctx is per-viewer, and a
   * module-level dep would make one caller's catalog everybody's.
   */
  tools?: AssistantTool[];
  /** Runs one tool by its WIRE name and hands back the reader's own result. */
  runTool?(name: string): Promise<{ ok: true; key: string; data: unknown } | { ok: false; error: string }>;
}

/**
 * What a REFUSED answer already cost (Lane Q).
 *
 * A tool loop that exhausts the day budget on its second iteration refuses
 * with 503 and no text, which is the honest end of that turn. The first
 * iteration still happened: real tokens were bought upstream and the reply is
 * in the wire history. The usage writer used to be reachable only through the
 * ok-guard at each call site, so that spend was recorded NOWHERE, and the only
 * measurement anyone has of what the assistant costs quietly under-counted
 * exactly the conversations that ran long enough to be expensive.
 *
 * Present only when at least one upstream call completed. A refusal before the
 * first POST (unknown mode, burst limit, no key, budget already spent at i=0)
 * carries nothing, because nothing was bought.
 */
export interface AssistantSpend {
  /** Summed across the iterations that COMPLETED before the refusal. */
  usage: AssistantUsage;
  /** Upstream POSTs that completed. Always >= 1 when this is present. */
  iterations: number;
  keySource: KeySource;
  stopReason: string | null;
}

export type AssistantResult =
  | {
      ok: true;
      text: string;
      keySource: KeySource;
      /** Summed across every iteration, so one answer reports one cost. */
      usage: AssistantUsage;
      stopReason: string | null;
      /** Upstream POSTs behind this answer. */
      iterations: number;
      /** Reader keys actually called, in order, for the transparency line. */
      toolsUsed: string[];
    }
  | { ok: false; status: number; error: string; spent?: AssistantSpend };

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

/** Whole non-negative counts. A reply with no `usage` object must land as 0, never NaN. */
function tokenCount(v: unknown): number {
  const n = Math.round(Number(v ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Every guard, then the call, then as many tool turns as the mode allows.
 *
 * The per-IP burst limit runs first and ONCE, because it is a guard about a
 * caller and not about spend: an admin surface where every founder shares one
 * office IP would otherwise throttle the village for its own use.
 *
 * The day budget and the borrowed-key ceiling moved INSIDE the loop, one of
 * each immediately before each POST. `overLimit` counts and inserts in the
 * same call, so leaving a copy outside would charge the bucket twice for one
 * answer. The consequence is deliberate and has to be said out loud: a
 * `dailyBudget` of 50 is 50 upstream calls, which is roughly 25 tool-using
 * conversations, and the number a single biller is billed against stays
 * honest.
 *
 * The iteration ceiling is a LOCAL INTEGER and not a bucket. `overLimit`
 * catches its own database errors and returns false, so a loop that asked the
 * rate limiter where to stop would be unbounded for as long as MySQL hiccups.
 */
export async function callAssistant(req: AssistantRequest): Promise<AssistantResult> {
  const spec = ASSISTANT_MODES[req.mode];
  if (!spec) return { ok: false, status: 400, error: `unknown assistant mode: ${String(req.mode)}` };

  if (await deps.rateLimited(`assist:${req.clientIp}`, 30, 60 * 60 * 1000)) {
    return { ok: false, status: 429, error: "Slow down a moment, then keep going." };
  }

  const resolved = resolveKey();
  if (!resolved) return { ok: false, status: 503, error: "assistant-unavailable" };

  const useTools = Boolean(req.tools?.length) && spec.toolCalls > 0;
  const wire: WireMessage[] = req.messages.map((m) => ({ role: m.role, content: m.content }));
  const usage: AssistantUsage = {
    inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0,
  };
  const toolsUsed: string[] = [];
  let iterations = 0;
  let stopReason: string | null = null;
  let text = "";

  const doFetch = deps.fetchImpl ?? fetch;

  // LANE Q: what a refusal from here on has already bought. Spreads to nothing
  // before the first completed POST, so every existing refusal shape is byte
  // for byte what it was.
  const spent = (): { spent?: AssistantSpend } =>
    iterations > 0 ? { spent: { usage, iterations, keySource: resolved.source, stopReason } } : {};

  for (let i = 0; i <= spec.toolCalls; i++) {
    const today = new Date().toISOString().slice(0, 10);
    if (await deps.rateLimited(`assistant-day:${req.mode}:${today}`, spec.dailyBudget, 24 * 60 * 60 * 1000)) {
      // Mid-loop this is not a partial answer, it is no answer: the last reply
      // was a tool request and carries no text. Refusing is the honest end.
      // Serving what we have would hand a caller their own fallback sentence
      // at HTTP 200 with nothing in the log.
      if (i > 0) console.warn(`[assistant:${req.mode}] day budget ran out mid-loop after ${iterations} call(s)`);
      return { ok: false, status: 503, error: "assistant-unavailable", ...spent() };
    }
    // A borrowed key spends someone else's allowance, so it carries a second,
    // smaller ceiling on top of the mode's own.
    if (resolved.source === "platform") {
      const cap = platformDailyCap();
      if (cap === 0 || (await deps.rateLimited(`assistant-platform-day:${today}`, cap, 24 * 60 * 60 * 1000))) {
        return { ok: false, status: 503, error: "assistant-unavailable", ...spent() };
      }
    }

    const payload: Record<string, unknown> = {
      model: req.model,
      max_tokens: req.maxTokens ?? spec.maxTokens,
      system: req.system,
      messages: wire,
    };
    if (useTools) {
      payload.tools = req.tools;
      // The final turn still SHOWS the tools, so the model can read back the
      // results it already has, and is told it may not call another. Without
      // this the last reply can be one more tool request with no text in it.
      payload.tool_choice = i === spec.toolCalls
        ? { type: "none" }
        : { type: "auto", disable_parallel_tool_use: true };
    }

    let data: any;
    try {
      const r = await doFetch(anthropicUrl(), {
        method: "POST",
        headers: {
          "x-api-key": resolved.key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        // The key never reaches a log line, whoever it belongs to.
        console.error(`[assistant:${req.mode}] Anthropic error`, r.status, (await r.text()).slice(0, 300));
        return { ok: false, status: 502, error: "assistant-error", ...spent() };
      }
      data = await r.json();
    } catch (err) {
      console.error(`[assistant:${req.mode}]`, err);
      return { ok: false, status: 502, error: "assistant-error", ...spent() };
    }

    iterations += 1;
    const u = data?.usage ?? {};
    usage.inputTokens += tokenCount(u?.input_tokens);
    usage.outputTokens += tokenCount(u?.output_tokens);
    usage.cacheCreationInputTokens += tokenCount(u?.cache_creation_input_tokens);
    usage.cacheReadInputTokens += tokenCount(u?.cache_read_input_tokens);
    stopReason = data?.stop_reason ?? null;
    const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
    text = blocks.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("").trim();

    if (stopReason !== "tool_use" || !useTools || !req.runTool) break;
    const calls = blocks.filter((b: any) => b?.type === "tool_use");
    if (calls.length === 0) break;

    // The assistant turn goes back RAW. Joining it to text loses the tool_use
    // ids, and the next request 400s on results that answer nothing.
    wire.push({ role: "assistant", content: blocks });
    const results: any[] = [];
    for (const b of calls) {
      const name = String(b?.name ?? "");
      const key = toolNameToKey(name);
      toolsUsed.push(key);
      try {
        const out = await req.runTool(name);
        // `callReader` applies capTokens and NOT the fence, so fencing here is
        // the loop's job. Every reader result is member-written text heading
        // into a prompt, which is the widest injection surface there is.
        results.push(out.ok
          ? { type: "tool_result", tool_use_id: b.id, content: fenceForPrompt(out.key, out.data) }
          : { type: "tool_result", tool_use_id: b.id, content: out.error, is_error: true });
      } catch (err) {
        console.error(`[assistant:${req.mode}] reader ${key} threw`, err);
        results.push({ type: "tool_result", tool_use_id: b.id, content: `${key} could not be read`, is_error: true });
      }
    }
    wire.push({ role: "user", content: results });
  }

  if (stopReason === "tool_use") {
    // The loop ended still wanting a tool, so `text` is empty and the caller's
    // parseJsonReply is about to serve its own fallback sentence at HTTP 200.
    // Nothing else would say so.
    console.warn(`[assistant:${req.mode}] loop ended on tool_use after ${iterations} call(s), reply is empty`);
  }
  return { ok: true, text, keySource: resolved.source, usage, stopReason, iterations, toolsUsed };
}

/** Whether this deployment is currently spending the platform's key. */
export function borrowingPlatformKey(env: NodeJS.ProcessEnv = process.env): boolean {
  return resolveKey(env)?.source === "platform";
}
