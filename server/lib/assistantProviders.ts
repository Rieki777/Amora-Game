/**
 * The provider seam (round 4, lane L6).
 *
 * `callAssistant` spoke the Anthropic wire format directly: the request body,
 * the content blocks in the reply, the `tool_use` stop reason and the
 * `tool_result` user turn were all written inline. A member who brings their
 * own key may bring an OpenAI-compatible one (OpenRouter, Ollama, most gateways),
 * so the loop needs one seam that says: build the request, read the reply,
 * shape the two tool turns. Two adapters, and the Anthropic one is today's body
 * moved, not rewritten.
 *
 * The seam is deliberately small. Everything about budgets, guards, fencing and
 * usage rows stays in `assistant.ts`; an adapter knows only how to talk to one
 * kind of endpoint. Nothing here logs a key.
 */
import type { AssistantTool, AssistantUsage } from "./assistant";

export type ProviderId = "anthropic" | "openai_compatible";

/** The wire's message shape. `content` is provider-specific past the first turn. */
export type WireMessage = { role: "user" | "assistant" | "system" | "tool"; content: unknown; [k: string]: unknown };

export interface ProviderRequestInput {
  key: string;
  /** Only the OpenAI-compatible adapter reads it. */
  baseUrl?: string | null;
  model: string;
  maxTokens: number;
  system: string;
  messages: WireMessage[];
  tools?: AssistantTool[];
  /** Undefined when the request carries no tools. */
  toolChoice?: "auto" | "none";
}

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

export interface ToolCall {
  id: string;
  name: string;
}

export interface ProviderReply {
  text: string;
  /** Normalised: `tool_use` when the model wants a tool, else the wire's own word. */
  stopReason: string | null;
  usage: AssistantUsage;
  calls: ToolCall[];
  /** The assistant turn to push back, raw, so tool ids survive. */
  assistantTurn: WireMessage;
}

export interface ToolResult {
  id: string;
  content: string;
  isError?: boolean;
}

export interface Provider {
  id: ProviderId;
  request(input: ProviderRequestInput): ProviderRequest;
  parse(data: any): ProviderReply;
  /** The turn(s) that carry tool results back. */
  toolResults(results: ToolResult[]): WireMessage[];
}

/** Whole non-negative counts. A reply with no usage lands as 0, never NaN. */
function count(v: unknown): number {
  const n = Math.round(Number(v ?? 0));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * The endpoint, honouring ANTHROPIC_BASE_URL. That variable is load-bearing:
 * the loop test points it at a local stub so the acceptance run never spends
 * real tokens, and a deployment behind a gateway needs it too.
 */
export function anthropicUrl(env: NodeJS.ProcessEnv = process.env): string {
  const base = (env.ANTHROPIC_BASE_URL ?? "").trim().replace(/\/+$/, "");
  return `${base || "https://api.anthropic.com"}/v1/messages`;
}

export const anthropicProvider: Provider = {
  id: "anthropic",
  request(input) {
    const body: Record<string, unknown> = {
      model: input.model,
      max_tokens: input.maxTokens,
      system: input.system,
      messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
    };
    if (input.tools?.length) {
      body.tools = input.tools;
      // The final turn still SHOWS the tools, so the model can read back the
      // results it already has, and is told it may not call another. Without
      // this the last reply can be one more tool request with no text in it.
      body.tool_choice = input.toolChoice === "none"
        ? { type: "none" }
        : { type: "auto", disable_parallel_tool_use: true };
    }
    return {
      url: anthropicUrl(),
      headers: {
        "x-api-key": input.key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body,
    };
  },
  parse(data) {
    const u = data?.usage ?? {};
    const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
    const text = blocks.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("").trim();
    const calls = blocks
      .filter((b: any) => b?.type === "tool_use")
      .map((b: any) => ({ id: String(b.id ?? ""), name: String(b.name ?? "") }));
    return {
      text,
      stopReason: data?.stop_reason ?? null,
      usage: {
        inputTokens: count(u?.input_tokens),
        outputTokens: count(u?.output_tokens),
        cacheCreationInputTokens: count(u?.cache_creation_input_tokens),
        cacheReadInputTokens: count(u?.cache_read_input_tokens),
      },
      calls,
      // The assistant turn goes back RAW. Joining it to text loses the tool_use
      // ids, and the next request 400s on results that answer nothing.
      assistantTurn: { role: "assistant", content: blocks },
    };
  },
  toolResults(results) {
    return [{
      role: "user",
      content: results.map((r) => ({
        type: "tool_result",
        tool_use_id: r.id,
        content: r.content,
        ...(r.isError ? { is_error: true } : {}),
      })),
    }];
  },
};

/**
 * OpenAI-compatible: `${baseUrl}/v1/chat/completions`, the system prompt as
 * the first message, `function` tools, and tool results as `role: "tool"`
 * messages, one per call. Usage from `prompt_tokens` and `completion_tokens`;
 * a cached prompt count lands in cacheRead when the endpoint reports one.
 *
 * A base URL that already ends in `/v1` is not doubled: OpenRouter's is
 * `https://openrouter.ai/api/v1`, Ollama's is `https://host:11434/v1`, and a
 * member typing either should not have to know this file exists.
 */
export function openAiCompatibleUrl(baseUrl: string): string {
  const base = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  return /\/v1$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

export const openAiCompatibleProvider: Provider = {
  id: "openai_compatible",
  request(input) {
    const messages: WireMessage[] = [{ role: "system", content: input.system }, ...input.messages];
    const body: Record<string, unknown> = {
      model: input.model,
      max_tokens: input.maxTokens,
      messages,
    };
    if (input.tools?.length) {
      body.tools = input.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.input_schema },
      }));
      body.tool_choice = input.toolChoice === "none" ? "none" : "auto";
      body.parallel_tool_calls = false;
    }
    return {
      url: openAiCompatibleUrl(input.baseUrl ?? ""),
      headers: {
        authorization: `Bearer ${input.key}`,
        "content-type": "application/json",
      },
      body,
    };
  },
  parse(data) {
    const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
    const message = choice?.message ?? {};
    const rawCalls: any[] = Array.isArray(message.tool_calls) ? message.tool_calls : [];
    const calls = rawCalls.map((c: any) => ({ id: String(c.id ?? ""), name: String(c?.function?.name ?? "") }));
    const finish = choice?.finish_reason ?? null;
    const u = data?.usage ?? {};
    return {
      text: typeof message.content === "string" ? message.content.trim() : "",
      stopReason: calls.length > 0 || finish === "tool_calls" ? "tool_use" : finish,
      usage: {
        inputTokens: count(u?.prompt_tokens),
        outputTokens: count(u?.completion_tokens),
        cacheCreationInputTokens: 0,
        cacheReadInputTokens: count(u?.prompt_tokens_details?.cached_tokens),
      },
      calls,
      assistantTurn: {
        role: "assistant",
        content: typeof message.content === "string" ? message.content : null,
        ...(rawCalls.length ? { tool_calls: rawCalls } : {}),
      },
    };
  },
  toolResults(results) {
    return results.map((r) => ({ role: "tool", tool_call_id: r.id, content: r.content }));
  },
};

export const PROVIDERS: Record<ProviderId, Provider> = {
  anthropic: anthropicProvider,
  openai_compatible: openAiCompatibleProvider,
};

export function providerFor(id: ProviderId | undefined | null): Provider {
  return PROVIDERS[id ?? "anthropic"] ?? anthropicProvider;
}
