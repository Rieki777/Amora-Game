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
import { Award, Clock } from "lucide-react";
import { authToken } from "@/lib/gameApi";

type Chip = { id: string; name: string; kind: string; expiresAt?: string | null };

// A granted badge can carry an end date, and the route drops the award the
// moment it passes, so one that says nothing until it disappears reads as
// permanent right up to the day it goes. A time-limited badge always wears
// the clock; inside this window it also turns amber and counts down. The
// seeded steward badge is lent for a year, so a countdown-only treatment
// would have shown nothing at all for the first ten months.
const LAPSE_SOON_DAYS = 45;
const daysLeft = (iso?: string | null): number | null => {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  return Number.isNaN(ms) ? null : Math.ceil(ms / 86400000);
};

const cache = new Map<string, Chip[]>();
const inflight = new Map<string, Promise<Chip[]>>();

function fetchChips(userId: string): Promise<Chip[]> {
  if (cache.has(userId)) return Promise.resolve(cache.get(userId)!);
  if (inflight.has(userId)) return inflight.get(userId)!;
  // The badges module is usually `members`, not `public`, so an unauthenticated
  // request 404s and every chip silently vanishes for signed-in members —
  // which looked exactly like "nobody has pinned any badges".
  const t = authToken();
  const p = fetch(`/api/badges/of/${encodeURIComponent(userId)}`, {
    headers: t ? { Authorization: `Bearer ${t}` } : {},
  })
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
      {chips.map((c) => {
        const left = daysLeft(c.expiresAt);
        const timed = left != null;
        const lapsing = left != null && left <= LAPSE_SOON_DAYS;
        return (
          <span
            key={c.id}
            title={timed ? `${c.name}, held until ${new Date(c.expiresAt!).toLocaleDateString()}` : c.name}
            className={`inline-flex items-center gap-0.5 text-[10px] font-medium rounded-full px-1.5 py-px border ${
              lapsing
                ? "text-amber-700 bg-amber-50 border-amber-200"
                : "text-teal-deep bg-teal-deep/10 border-teal-deep/20"
            }`}
          >
            {timed ? <Clock className="w-2.5 h-2.5" /> : <Award className="w-2.5 h-2.5" />}
            {c.name}
            {lapsing && <span className="opacity-70">{left <= 0 ? ", ends today" : `, ${left}d`}</span>}
          </span>
        );
      })}
    </span>
  );
}
