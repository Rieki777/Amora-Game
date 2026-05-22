import Layout from "@/components/Layout";
import { useState, useEffect, useCallback } from "react";
import {
  BookOpen,
  CheckCircle2,
  Circle,
  ExternalLink,
  Video,
  FileText,
  Hand,
  Users,
  Radio,
  GraduationCap,
} from "lucide-react";

interface TrainingModule {
  id: string;
  title: string;
  description: string;
  type: string;
  url: string;
  order: number;
}

const TYPE_META: Record<string, { icon: React.ComponentType<{ className?: string }>; color: string }> = {
  Video: { icon: Video, color: "bg-coral/15 text-coral" },
  Article: { icon: FileText, color: "bg-teal-deep/10 text-teal-deep" },
  Practice: { icon: Hand, color: "bg-sage/20 text-sage" },
  Workshop: { icon: Users, color: "bg-amber/20 text-amber-700" },
  "Live Session": { icon: Radio, color: "bg-gold/20 text-gold" },
};

const STORAGE_KEY = "amora-training-completed";

function loadCompleted(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCompleted(ids: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

export default function Training() {
  const [modules, setModules] = useState<TrainingModule[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/training-modules");
      const data = await res.json();
      setModules(Array.isArray(data) ? data : []);
    } catch {
      setModules([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    setCompleted(loadCompleted());
    load();
  }, [load]);

  const toggle = (id: string) => {
    const next = completed.includes(id)
      ? completed.filter((x) => x !== id)
      : [...completed, id];
    setCompleted(next);
    saveCompleted(next);
  };

  const total = modules.length;
  const done = modules.filter((m) => completed.includes(m.id)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <Layout>
      <div className="bg-teal-deep text-white py-16">
        <div className="container max-w-4xl">
          <div className="flex items-center gap-3 mb-3">
            <GraduationCap className="w-6 h-6 text-amber" />
            <span className="text-amber font-medium text-sm tracking-widest uppercase">
              Community Training
            </span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-3">
            Learn Together, Grow Together
          </h1>
          <p className="text-white/80 text-lg max-w-2xl">
            Practical training in nonviolent communication, authentic relating, and
            consent-based decision making — the practices that make community life
            actually work.
          </p>
        </div>
      </div>

      <div className="bg-stone-50 py-12">
        <div className="container max-w-4xl">
          {/* Progress bar */}
          <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 mb-8">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="font-display text-xl font-bold text-teal-deep">
                  Your Progress
                </h2>
                <p className="text-sm text-stone-500 mt-0.5">
                  {done} of {total} modules completed
                </p>
              </div>
              <span className="text-teal-deep font-bold text-2xl">{pct}%</span>
            </div>
            <div className="bg-stone-100 rounded-full h-2 overflow-hidden">
              <div
                className="bg-teal-deep h-2 rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Modules */}
          {loading ? (
            <div className="text-center py-16 text-stone-400">Loading modules...</div>
          ) : modules.length === 0 ? (
            <div className="text-center py-16 text-stone-400">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No training modules available yet. Check back soon.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {modules.map((m) => {
                const meta = TYPE_META[m.type] ?? TYPE_META.Article;
                const Icon = meta.icon;
                const isDone = completed.includes(m.id);
                return (
                  <div
                    key={m.id}
                    className={`bg-white rounded-2xl border ${
                      isDone ? "border-teal-deep/30 bg-teal-deep/[0.02]" : "border-stone-200"
                    } shadow-sm p-5 md:p-6 transition-colors`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${meta.color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <h3 className={`font-display text-lg font-semibold ${isDone ? "text-stone-500" : "text-teal-deep"}`}>
                            {m.title}
                          </h3>
                          <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${meta.color}`}>
                            {m.type}
                          </span>
                        </div>
                        <p className={`text-sm leading-relaxed mb-4 ${isDone ? "text-stone-400" : "text-stone-600"}`}>
                          {m.description}
                        </p>
                        <div className="flex flex-wrap items-center gap-3">
                          {m.url ? (
                            <a
                              href={m.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-deep hover:text-teal-deep/80 transition-colors"
                            >
                              Open <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          ) : (
                            <span className="text-sm text-stone-400 italic">Link coming soon</span>
                          )}
                          <button
                            onClick={() => toggle(m.id)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                              isDone
                                ? "bg-teal-deep/10 text-teal-deep hover:bg-teal-deep/15"
                                : "bg-stone-100 text-stone-600 hover:bg-stone-200"
                            }`}
                          >
                            {isDone ? (
                              <>
                                <CheckCircle2 className="w-4 h-4" /> Completed
                              </>
                            ) : (
                              <>
                                <Circle className="w-4 h-4" /> Mark Complete
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
