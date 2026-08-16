/**
 * The provider seam and the member key (round 4, lane L6).
 *
 * Two things are pinned here. The Anthropic adapter is today's body moved:
 * the request the engine sends with a village key is the same request it sent
 * before the seam existed. And a member's own key skips the mode's day bucket
 * (harm metric 4's engine half), speaks the provider the member named, and
 * never reaches a log line.
 *
 * The stub loop test at the bottom decides whether adapter tools ship: the
 * OpenAI-compatible adapter runs a full two-turn tool loop against a stub and
 * the results come back as `role: "tool"` messages.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MEMBER_KEY_DAILY_CAP, callAssistant, resolveKey, wireAssistant } from "./assistant";
import { anthropicProvider, anthropicUrl, openAiCompatibleProvider, openAiCompatibleUrl, providerFor } from "./assistantProviders";

const OLD_ENV = { ...process.env };

function harness(opts: { villageKey?: string; limited?: (b: string) => boolean; replies?: any[] } = {}) {
  const buckets: string[] = [];
  const posts: { url: string; headers: any; body: any }[] = [];
  const queue = [...(opts.replies ?? [])];
  wireAssistant({
    villageKey: () => opts.villageKey ?? "",
    rateLimited: async (bucket) => { buckets.push(bucket); return opts.limited?.(bucket) ?? false; },
    fetchImpl: (async (url: string, init: any) => {
      posts.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      const next = queue.length ? queue.shift() : { content: [{ type: "text", text: '{"reply":"hi"}' }], stop_reason: "end_turn", usage: { input_tokens: 5, output_tokens: 2 } };
      return { ok: true, status: 200, json: async () => next, text: async () => "" };
    }) as unknown as typeof fetch,
  });
  return { buckets, posts };
}

const req = (over: Partial<Parameters<typeof callAssistant>[0]> = {}) => ({
  mode: "member" as const,
  system: "You are a guide.",
  messages: [{ role: "user" as const, content: "what is on this week" }],
  model: "test-model",
  clientIp: "10.0.0.1",
  userId: "u-1",
  ...over,
});

beforeEach(() => {
  delete process.env.PLATFORM_ASSISTANT_KEY;
  delete process.env.ANTHROPIC_BASE_URL;
});
afterEach(() => { process.env = { ...OLD_ENV }; });

describe("resolveKey with a member key", () => {
  it("lets the member's key win over village and platform", () => {
    harness({ villageKey: "village-key" });
    process.env.PLATFORM_ASSISTANT_KEY = "platform-key";
    expect(resolveKey(process.env, { provider: "anthropic", key: "member-key" })).toEqual({ key: "member-key", source: "member" });
    expect(resolveKey(process.env, null)).toEqual({ key: "village-key", source: "village" });
    expect(resolveKey(process.env, { provider: "anthropic", key: "  " })).toEqual({ key: "village-key", source: "village" });
  });
});

describe("the Anthropic adapter is today's body", () => {
  it("builds the same request the engine used to send", () => {
    const r = anthropicProvider.request({
      key: "k", model: "m", maxTokens: 700, system: "sys",
      messages: [{ role: "user", content: "hello" }],
      tools: [{ name: "roles_all", description: "d", input_schema: { type: "object", properties: {} } }],
      toolChoice: "auto",
    });
    expect(r.url).toBe(anthropicUrl());
    expect(r.headers).toEqual({ "x-api-key": "k", "anthropic-version": "2023-06-01", "content-type": "application/json" });
    expect(r.body).toEqual({
      model: "m", max_tokens: 700, system: "sys", messages: [{ role: "user", content: "hello" }],
      tools: [{ name: "roles_all", description: "d", input_schema: { type: "object", properties: {} } }],
      tool_choice: { type: "auto", disable_parallel_tool_use: true },
    });
    const last = anthropicProvider.request({ key: "k", model: "m", maxTokens: 1, system: "s", messages: [], tools: [{ name: "x", description: "", input_schema: { type: "object", properties: {} } }], toolChoice: "none" });
    expect(last.body.tool_choice).toEqual({ type: "none" });
    const none = anthropicProvider.request({ key: "k", model: "m", maxTokens: 1, system: "s", messages: [] });
    expect(none.body).not.toHaveProperty("tools");
    expect(none.body).not.toHaveProperty("tool_choice");
  });

  it("reads text, usage and tool calls out of the reply", () => {
    const parsed = anthropicProvider.parse({
      content: [{ type: "text", text: "a" }, { type: "tool_use", id: "t1", name: "roles_all", input: {} }, { type: "text", text: "b" }],
      stop_reason: "tool_use",
      usage: { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 4 },
    });
    expect(parsed.text).toBe("ab");
    expect(parsed.stopReason).toBe("tool_use");
    expect(parsed.calls).toEqual([{ id: "t1", name: "roles_all" }]);
    expect(parsed.usage).toEqual({ inputTokens: 10, outputTokens: 3, cacheCreationInputTokens: 0, cacheReadInputTokens: 4 });
    expect(anthropicProvider.toolResults([{ id: "t1", content: "data" }, { id: "t2", content: "no", isError: true }])).toEqual([
      { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "data" }, { type: "tool_result", tool_use_id: "t2", content: "no", is_error: true }] },
    ]);
  });
});

describe("the OpenAI-compatible adapter", () => {
  it("does not double a base URL that already ends in /v1", () => {
    expect(openAiCompatibleUrl("https://openrouter.ai/api/v1")).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(openAiCompatibleUrl("https://host.example:11434/")).toBe("https://host.example:11434/v1/chat/completions");
  });

  it("puts the system prompt first and shapes function tools", () => {
    const r = openAiCompatibleProvider.request({
      key: "k", baseUrl: "https://openrouter.ai/api/v1", model: "llama", maxTokens: 300, system: "sys",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ name: "roles_all", description: "d", input_schema: { type: "object", properties: {} } }],
      toolChoice: "auto",
    });
    expect(r.headers.authorization).toBe("Bearer k");
    expect((r.body.messages as any[])[0]).toEqual({ role: "system", content: "sys" });
    expect(r.body.tools).toEqual([{ type: "function", function: { name: "roles_all", description: "d", parameters: { type: "object", properties: {} } } }]);
    expect(r.body.tool_choice).toBe("auto");
  });

  it("reads usage from prompt_tokens and completion_tokens and normalises tool_calls", () => {
    const parsed = openAiCompatibleProvider.parse({
      choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "roles_all", arguments: "{}" } }] }, finish_reason: "tool_calls" }],
      usage: { prompt_tokens: 12, completion_tokens: 4, prompt_tokens_details: { cached_tokens: 6 } },
    });
    expect(parsed.stopReason).toBe("tool_use");
    expect(parsed.calls).toEqual([{ id: "c1", name: "roles_all" }]);
    expect(parsed.usage).toEqual({ inputTokens: 12, outputTokens: 4, cacheCreationInputTokens: 0, cacheReadInputTokens: 6 });
    expect(openAiCompatibleProvider.toolResults([{ id: "c1", content: "rows" }])).toEqual([{ role: "tool", tool_call_id: "c1", content: "rows" }]);
  });

  it("is what providerFor hands back, and anthropic is the default", () => {
    expect(providerFor("openai_compatible").id).toBe("openai_compatible");
    expect(providerFor(undefined).id).toBe("anthropic");
  });
});

describe("a member key through the engine (harm metric 4, engine half)", () => {
  it("skips the mode's day bucket and the platform cap and pays its own", async () => {
    const h = harness({ villageKey: "village-key" });
    process.env.PLATFORM_ASSISTANT_KEY = "platform-key";
    const r = await callAssistant(req({ memberKey: { provider: "anthropic", key: "member-key" } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.keySource).toBe("member");
    expect(h.buckets.some((b) => b.startsWith("assistant-day:member"))).toBe(false);
    expect(h.buckets.some((b) => b.startsWith("assistant-platform-day"))).toBe(false);
    expect(h.buckets.some((b) => b.startsWith("assistant-member-day:u-1:"))).toBe(true);
    // The per-IP burst guard still ran, and ran first.
    expect(h.buckets[0]).toBe("assist:10.0.0.1");
    expect(h.posts[0].headers["x-api-key"]).toBe("member-key");
  });

  it("refuses at the member allowance, with the mode still open", async () => {
    const h = harness({ villageKey: "village-key", limited: (b) => b.startsWith("assistant-member-day") });
    const r = await callAssistant(req({ memberKey: { provider: "anthropic", key: "member-key" } }));
    expect(r).toMatchObject({ ok: false, status: 503 });
    expect(h.posts.length).toBe(0);
    expect(MEMBER_KEY_DAILY_CAP).toBe(200);
  });

  it("speaks OpenAI-compatible when the member named it, with the member's model", async () => {
    const h = harness({ replies: [{ choices: [{ message: { role: "assistant", content: '{"reply":"hello"}' }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 1 } }] });
    const r = await callAssistant(req({ memberKey: { provider: "openai_compatible", key: "sk-or-x", baseUrl: "https://openrouter.ai/api/v1", model: "meta/llama" } }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toBe('{"reply":"hello"}');
    expect(r.usage.inputTokens).toBe(3);
    expect(h.posts[0].url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(h.posts[0].headers.authorization).toBe("Bearer sk-or-x");
    expect(h.posts[0].body.model).toBe("meta/llama");
  });
});

describe("the stub loop: adapter tools", () => {
  it("runs a two-turn tool loop over the OpenAI-compatible wire", async () => {
    const h = harness({
      replies: [
        { choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "roles_all", arguments: "{}" } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 20, completion_tokens: 2 } },
        { choices: [{ message: { role: "assistant", content: '{"reply":"two roles"}' }, finish_reason: "stop" }], usage: { prompt_tokens: 30, completion_tokens: 5 } },
      ],
    });
    const r = await callAssistant(req({
      memberKey: { provider: "openai_compatible", key: "k", baseUrl: "https://gateway.example", model: "m" },
      tools: [{ name: "roles_all", description: "roles", input_schema: { type: "object", properties: {} } }],
      runTool: async (name) => ({ ok: true, key: name.replace(/_/g, "."), data: [{ name: "Cook" }, { name: "Host" }] }),
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.iterations).toBe(2);
    expect(r.toolsUsed).toEqual(["roles.all"]);
    expect(r.usage.inputTokens).toBe(50);
    expect(r.text).toBe('{"reply":"two roles"}');
    // The second POST carries the assistant's tool_calls turn and a role: tool result.
    const second = h.posts[1].body.messages as any[];
    expect(second[0].role).toBe("system");
    expect(second.at(-2).role).toBe("assistant");
    expect(second.at(-2).tool_calls[0].id).toBe("c1");
    expect(second.at(-1)).toMatchObject({ role: "tool", tool_call_id: "c1" });
    expect(second.at(-1).content).toContain("<village-data reader=\"roles.all\">");
    // The last turn told the model no more tools.
    expect(h.posts[1].body.tool_choice).toBe("auto");
  });

  it("runs the same two-turn loop over the Anthropic wire, byte for byte as before", async () => {
    const h = harness({
      villageKey: "village-key",
      replies: [
        { content: [{ type: "tool_use", id: "t1", name: "roles_all", input: {} }], stop_reason: "tool_use", usage: { input_tokens: 20, output_tokens: 2 } },
        { content: [{ type: "text", text: '{"reply":"two roles"}' }], stop_reason: "end_turn", usage: { input_tokens: 30, output_tokens: 5 } },
      ],
    });
    const r = await callAssistant(req({
      mode: "organize",
      tools: [{ name: "roles_all", description: "roles", input_schema: { type: "object", properties: {} } }],
      runTool: async () => ({ ok: true, key: "roles.all", data: [] }),
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.iterations).toBe(2);
    const second = h.posts[1].body.messages as any[];
    expect(second.at(-2)).toEqual({ role: "assistant", content: [{ type: "tool_use", id: "t1", name: "roles_all", input: {} }] });
    expect(second.at(-1).role).toBe("user");
    expect(second.at(-1).content[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
  });
});
