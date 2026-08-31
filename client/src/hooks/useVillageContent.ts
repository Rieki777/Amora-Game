import { useEffect, useState } from "react";

/**
 * Reads one section of the runtime content document (server/repos/store.ts
 * DOCUMENTS, exposed read-only at GET /api/content/:section, writable by an
 * admin at PUT /api/admin/content/:section: no new server route needed for
 * a new section key, since both routes already key on whatever string is in
 * the URL).
 *
 * Built for the jurisdiction-specific pages (Land Share tax treatment,
 * residency law, the membership entity's tax status): a fresh instance has
 * never written this section, so the fetch 404s. That is read as
 * `isPlaceholder`, not an error. The honest state for a village that has
 * not published its own legal or tax claims yet is "nothing here", never a
 * fallback copied from wherever this platform instance was forked from.
 * Callers must render their own neutral, non-committal placeholder in that
 * state rather than any jurisdiction's specific law. See WhyCostaRica.tsx
 * for the fullest example.
 */
export function useVillageContent<T extends Record<string, any>>(
  section: string,
): { content: T | null; loading: boolean; isPlaceholder: boolean } {
  const [content, setContent] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/content/${section}`)
      .then(async (r) => {
        // The route 404s with {error: "Section not found"} when nothing has
        // been saved for this key yet: the expected state for a fresh
        // instance, not a fetch failure.
        if (!r.ok) return null;
        const body = await r.json().catch(() => null);
        if (!body || typeof body !== "object" || Array.isArray(body)) return null;
        return body as T;
      })
      .catch(() => null)
      .then((body) => {
        if (!alive) return;
        setContent(body);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [section]);

  return { content, loading, isPlaceholder: !loading && !content };
}
