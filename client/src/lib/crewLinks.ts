/**
 * Crew invite links, kept as plain functions so they can be tested without
 * mounting anything. Same rule questBoard.ts follows.
 */

/** The invite link a member sends to somebody they want beside them. */
export function inviteUrl(origin: string, questId: string, code: string): string {
  return `${origin}/quests/${encodeURIComponent(questId)}?crew=${encodeURIComponent(code)}`;
}

/**
 * The ?crew= code on a URL, if any. Returns "" for anything it cannot read,
 * so a malformed link is a page without an invite rather than a crash.
 */
export function crewCodeFrom(search: string): string {
  const m = /[?&]crew=([^&#]+)/.exec(String(search ?? ""));
  if (!m) return "";
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return "";
  }
}
