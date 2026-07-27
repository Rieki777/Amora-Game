/**
 * BylineChips (B10): the badges a member CHOSE to wear, beside their name.
 *
 * Consumes GET /api/badges/of/:userId (B9) and renders only `featured`
 * awards — self-presentation, opt-in, capped by badges.max_featured. When
 * the badges module is off the endpoint 404s and this renders nothing;
 * when a member features nothing, their byline stays clean. A single
 * module-level cache keeps a 30-reply thread from firing 30 fetches for
 * the same three authors.
 */
import { useEffect, useState } from "react";
import { Award } from "lucide-react";

type Chip = { id: string; name: string; kind: string };

const cache = new Map<string, Chip[]>();
const inflight = new Map<string, Promise<Chip[]>>();

function fetchChips(userId: string): Promise<Chip[]> {
  if (cache.has(userId)) return Promise.resolve(cache.get(userId)!);
  if (inflight.has(userId)) return inflight.get(userId)!;
  const p = fetch(`/api/badges/of/${encodeURIComponent(userId)}`)
    .then((r) => (r.ok ? r.json() : { badges: [] }))
    .then((d) => {
      const chips = (d.badges ?? []).filter((b: Chip & { featured?: boolean }) => (b as any).featured).slice(0, 3);
      cache.set(userId, chips);
      inflight.delete(userId);
      return chips;
    })
    .catch(() => {
      inflight.delete(userId);
      return [];
    });
  inflight.set(userId, p);
  return p;
}

export default function BylineChips({ userId }: { userId?: string | null }) {
  const [chips, setChips] = useState<Chip[]>([]);

  useEffect(() => {
    let alive = true;
    if (!userId) return;
    fetchChips(userId).then((c) => { if (alive) setChips(c); });
    return () => { alive = false; };
  }, [userId]);

  if (!chips.length) return null;
  return (
    <span className="inline-flex items-center gap-1 ml-1.5 align-middle">
      {chips.map((c) => (
        <span
          key={c.id}
          title={c.name}
          className="inline-flex items-center gap-0.5 text-[10px] font-medium text-teal-deep bg-teal-deep/10 border border-teal-deep/20 rounded-full px-1.5 py-px"
        >
          <Award className="w-2.5 h-2.5" />
          {c.name}
        </span>
      ))}
    </span>
  );
}
