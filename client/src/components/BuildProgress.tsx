import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Clock, Sparkles } from "lucide-react";

interface Milestone {
  id: string;
  phase: string;
  title: string;
  description: string;
  status: "complete" | "in-progress" | "upcoming" | "future";
  completedDate: string | null;
  updateNote: string;
  order: number;
}

const STATUS_META: Record<Milestone["status"], { label: string; badge: string; iconColor: string; ring: string; Icon: React.ComponentType<{ className?: string }> }> = {
  complete: { label: "Complete", badge: "bg-emerald-100 text-emerald-700 border-emerald-200", iconColor: "text-emerald-600 bg-emerald-50", ring: "border-emerald-300", Icon: CheckCircle2 },
  "in-progress": { label: "In Progress", badge: "bg-amber-100 text-amber-700 border-amber-200", iconColor: "text-amber-600 bg-amber-50 animate-pulse", ring: "border-amber-300", Icon: Clock },
  upcoming: { label: "Planned", badge: "bg-stone-100 text-stone-600 border-stone-200", iconColor: "text-stone-400 bg-stone-50", ring: "border-stone-200", Icon: Circle },
  future: { label: "Future", badge: "bg-stone-50 text-stone-400 border-stone-200", iconColor: "text-stone-300 bg-stone-50", ring: "border-stone-200", Icon: Sparkles },
};

export default function BuildProgress() {
  const [items, setItems] = useState<Milestone[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/milestones")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (alive) { setItems(Array.isArray(data) ? data : []); setLoaded(true); } })
      .catch(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, []);

  if (!loaded || items.length === 0) return null;

  // Group by phase
  const phases = items.reduce<Record<string, Milestone[]>>((acc, m) => {
    (acc[m.phase] ??= []).push(m);
    return acc;
  }, {});

  return (
    <section className="bg-stone-50 py-20">
      <div className="container max-w-4xl mx-auto px-4">
        <div className="text-center mb-12">
          <span className="inline-block text-xs tracking-widest uppercase text-teal-deep font-semibold mb-3">
            Build Progress
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-teal-deep mb-3">
            What's Built. What's Coming.
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Real-time milestones from the team. Updated as the village comes online.
          </p>
        </div>

        <div className="space-y-10">
          {Object.entries(phases).map(([phase, milestones]) => (
            <div key={phase}>
              <h3 className="font-display text-sm font-bold uppercase tracking-widest text-teal-deep/70 mb-4">
                {phase}
              </h3>
              <div className="space-y-3">
                {milestones.map((m) => {
                  const meta = STATUS_META[m.status] ?? STATUS_META.upcoming;
                  const Icon = meta.Icon;
                  return (
                    <div
                      key={m.id}
                      className={`bg-white rounded-2xl border ${meta.ring} shadow-sm p-5 flex gap-4`}
                    >
                      <div className={`shrink-0 w-11 h-11 rounded-full flex items-center justify-center ${meta.iconColor}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <h4 className="font-display text-lg font-semibold text-teal-deep">
                            {m.title}
                          </h4>
                          <span className={`shrink-0 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${meta.badge}`}>
                            {meta.label}
                          </span>
                        </div>
                        <p className="text-sm text-stone-600 leading-relaxed">{m.description}</p>
                        {m.completedDate && m.status === "complete" && (
                          <p className="text-xs text-stone-400 mt-2">Completed {m.completedDate}</p>
                        )}
                        {m.updateNote && (
                          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5 mt-2 inline-block">
                            {m.updateNote}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
