/**
 * Where a `pick` field's options come from.
 *
 * The wizard config names a source ("seats", "badges", …) and never a URL, so
 * a proposal type is declared in one place and the plumbing lives in one
 * other. That separation is what makes the config readable by somebody who
 * does not know this codebase.
 *
 * EVERY SOURCE DEGRADES TO AN EMPTY LIST. A village with no badges module on,
 * or no seats declared yet, gets a picker that says there is nothing to pick
 * rather than a spinner that never resolves or an error card in the middle of
 * a wizard. The step still renders and the member can still go back.
 *
 * Members are a SEARCH rather than a list: the platform has no route that
 * hands out every member, on purpose, and building one for a picker would be
 * the wrong trade.
 */
import { authToken } from "@/lib/gameApi";
import type { PickSource } from "./wizardConfig";

export interface PickOption {
  value: string;
  label: string;
  /** A second line under the label. Optional everywhere. */
  hint?: string;
}

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { headers: headers() });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/** The whole list for a source, or an empty list when it cannot be had. */
export async function loadPickOptions(source: PickSource): Promise<PickOption[]> {
  switch (source) {
    case "seats": {
      const org = await getJson<any>("/api/org");
      return (org?.roles ?? [])
        .filter((r: any) => !r.isExample)
        .map((r: any) => ({
          value: String(r.id),
          label: String(r.title ?? r.name ?? r.id),
          hint: r.recruiting ? "recruiting" : r.circleName ? String(r.circleName) : undefined,
        }));
    }
    case "circles": {
      const org = await getJson<any>("/api/org");
      return (org?.circles ?? [])
        .filter((c: any) => !c.isExample && c.status !== "retired")
        .map((c: any) => ({ value: String(c.id), label: String(c.name), hint: c.purpose ?? undefined }));
    }
    case "badges": {
      const badges = await getJson<any>("/api/badges");
      const list = Array.isArray(badges) ? badges : (badges?.badges ?? []);
      return list
        .filter((b: any) => !b.isExample && b.active !== false)
        .map((b: any) => ({ value: String(b.id), label: String(b.name), hint: b.kind ?? undefined }));
    }
    case "quests": {
      const quests = await getJson<any>("/api/quests");
      const list = Array.isArray(quests) ? quests : (quests?.quests ?? []);
      return list
        .filter((q: any) => !q.isExample)
        .map((q: any) => ({ value: String(q.id), label: String(q.title ?? q.name ?? q.id), hint: q.status ?? undefined }));
    }
    case "tokens": {
      const exchange = await getJson<any>("/api/exchange");
      return (exchange?.listings ?? [])
        .filter((t: any) => !t.isExample)
        .map((t: any) => ({ value: String(t.slug), label: String(t.name), hint: t.kind ?? undefined }));
    }
    case "members":
      // Searched, never listed. See searchMembers below.
      return [];
    default:
      return [];
  }
}

/** True when this source is searched rather than listed. */
export const isSearchSource = (source: PickSource): boolean => source === "members";

/** Member search: the platform's own two-character minimum, ten at a time. */
export async function searchMembers(query: string): Promise<PickOption[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const people = await getJson<any[]>(`/api/messages/people?q=${encodeURIComponent(q)}`);
  return (people ?? []).map((p) => ({
    value: String(p.userId),
    label: String(p.name),
    hint: p.handle ? `@${p.handle}` : undefined,
  }));
}

/** What the review step prints for a picked value it has an option list for. */
export const labelFor = (options: PickOption[], value: unknown): string =>
  options.find((o) => o.value === String(value ?? ""))?.label ?? String(value ?? "");
