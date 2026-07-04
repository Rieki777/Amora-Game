import { useEffect, useState } from "react";
import { Activity, Heart, Sparkles, UserPlus, Sun, TrendingUp } from "lucide-react";

interface PulseEvent {
  id: string;
  type: string;
  text: string;
  at: string;
}

const TYPE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  join: UserPlus,
  quest: Sparkles,
  gratitude: Heart,
  stage: TrendingUp,
  season: Sun,
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function VillagePulse() {
  const [events, setEvents] = useState<PulseEvent[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/game/pulse")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => { if (alive) { setEvents(Array.isArray(d) ? d : []); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  if (!loaded || events.length === 0) return null;

  return (
    <section className="bg-white py-16 border-t border-stone-100">
      <div className="container max-w-2xl mx-auto px-4">
        <div className="text-center mb-8">
          <span className="inline-flex items-center gap-2 text-xs tracking-widest uppercase text-teal-deep font-semibold mb-2">
            <Activity className="w-4 h-4" /> Village Pulse
          </span>
          <h2 className="font-display text-2xl md:text-3xl font-bold text-teal-deep">
            The village is alive
          </h2>
        </div>
        <ul className="space-y-2">
          {events.slice(0, 8).map((e) => {
            const Icon = TYPE_ICON[e.type] ?? Sparkles;
            return (
              <li
                key={e.id}
                className="flex items-center gap-3 bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5"
              >
                <span className="shrink-0 w-8 h-8 rounded-full bg-teal-deep/10 text-teal-deep flex items-center justify-center">
                  <Icon className="w-4 h-4" />
                </span>
                <span className="flex-1 text-sm text-stone-700">{e.text}</span>
                <span className="shrink-0 text-xs text-stone-400">{timeAgo(e.at)}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
