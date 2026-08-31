/**
 * The three things every admin surface needs before it can talk to the server.
 *
 * They lived at the top of client/src/pages/Admin.tsx, which meant a tab could
 * only use them by living in that file too. That is most of why the file
 * reached 11,419 lines: the cost of leaving was rewriting the plumbing, so
 * nobody left. Moving the plumbing here makes leaving free, and every panel
 * already extracted into this directory can stop hand-rolling its own.
 *
 * Nothing here is new. The three definitions and their reasoning are moved
 * verbatim from Admin.tsx.
 */

/** Every admin route is mounted under this prefix by server/index.ts. */
export const API_BASE = "/api";

export function authHeaders(password: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${password}`, ...extra };
}

/**
 * A refusal, in English.
 *
 * Server refusal bodies are being unified to `{error, message}`, where `error`
 * is the machine code and `message` is the sentence a person should read. A
 * toast that prints the code hands a founder `auth_required` and calls it an
 * explanation. Both shapes are in flight, so this prefers the sentence, falls
 * back to the code, then to whatever the call site already knew to say.
 *
 * Every admin surface reads refusals through this one function. It was four
 * call sites in the module store first; the other twenty-four were the same
 * `d.error ||` by hand, and one of them dropping back to `d.error` later is
 * exactly the kind of thing nobody notices from a toast.
 */
export function refusal(d: any, fallback: string): string {
  // Falsy-skipping, not nullish-coalescing: every call site this replaced was
  // `d.error || "..."`, so a body carrying an empty string fell through to the
  // words the call site chose. `??` would have shown a founder a blank toast
  // and called that an improvement.
  for (const value of [d?.message, d?.error]) {
    const text = value == null ? "" : String(value).trim();
    if (text) return text;
  }
  return fallback;
}
