import { fetchGameMe, GameMe } from "@/lib/gameApi";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Circle, Compass, Heart, Sparkles } from "lucide-react";

const CLAIM_STATUS: Record<string, { label: string; cls: string }> = {
  claimed: { label: "In progress", cls: "bg-amber-100 text-amber-800" },
  submitted: { label: "Awaiting consent", cls: "bg-blue-100 text-blue-700" },
  consented: { label: "Completed", cls: "bg-emerald-100 text-emerald-700" },
  declined: { label: "Not accepted", cls: "bg-stone-100 text-stone-500" },
};

export default function GameDashboard() {
  const [me, setMe] = useState<GameMe | null>(null);
  const [currency, setCurrency] = useState("Gratitude");

  useEffect(() => {
    fetchGameMe().then(setMe);
    fetch("/api/game/config")
      .then((r) => r.json())
      .then((c) => setCurrency(c?.currency?.name ?? "Gratitude"))
      .catch(() => { /* silent */ });
  }, []);

  if (!me) return null;

  const activeQuests = me.quests.filter((q) => q.status === "claimed" || q.status === "submitted");
  const doneQuests = me.quests.filter((q) => q.status === "consented");

  return (
    <div className="space-y-6">
      {/* Next best action */}
      <Link
        href={me.nextAction.href}
        className="flex items-center justify-between gap-4 bg-teal-deep text-white rounded-2xl px-6 py-5 shadow-md hover:bg-teal transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Compass className="w-6 h-6 text-amber shrink-0" />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-white/60 font-semibold">Your next step</p>
            <p className="font-display text-lg font-semibold truncate">{me.nextAction.label}</p>
          </div>
        </div>
        <ArrowRight className="w-5 h-5 shrink-0" />
      </Link>

      {/* Path of Growth */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display text-xl font-bold text-teal-deep">Path of Growth</h3>
          <span className="text-sm font-semibold text-teal-deep bg-teal-deep/10 px-3 py-1 rounded-full">
            {me.stage.name}
          </span>
        </div>
        <p className="text-sm text-stone-500 mb-5">{me.stage.description}</p>
        <ol className="flex flex-wrap gap-y-3">
          {me.stages.map((s, i) => {
            const reached = i <= me.stageIndex;
            const current = i === me.stageIndex;
            return (
              <li key={s.id} className="flex items-center" title={`${s.name}: ${s.description}`}>
                <span
                  className={`flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${
                    current
                      ? "bg-teal-deep text-white"
                      : reached
                      ? "text-teal-deep"
                      : "text-stone-400"
                  }`}
                >
                  {reached ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                  {s.name}
                </span>
                {i < me.stages.length - 1 && <span className="mx-0.5 text-stone-300">·</span>}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Gratitude + quests */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="w-5 h-5 text-coral" />
            <h3 className="font-display text-lg font-bold text-teal-deep">{currency}</h3>
          </div>
          <p className="text-3xl font-display font-bold text-teal-deep mb-1">{me.gratitude.balance}</p>
          <p className="text-sm text-stone-500 mb-4">earned so far</p>
          {me.gratitude.budget.total > 0 && (
            <p className="text-sm text-stone-600 mb-4">
              Sending budget: <span className="font-semibold">{me.gratitude.budget.remaining}</span> of{" "}
              {me.gratitude.budget.total} left this cycle
            </p>
          )}
          <Link href="/gratitude" className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-deep hover:text-teal transition-colors">
            Visit the {currency} Wall <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-gold" />
            <h3 className="font-display text-lg font-bold text-teal-deep">Quests</h3>
          </div>
          {me.quests.length === 0 ? (
            <p className="text-sm text-stone-500 mb-4">You haven't claimed a quest yet.</p>
          ) : (
            <ul className="space-y-2 mb-4">
              {[...activeQuests, ...doneQuests].slice(0, 4).map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-stone-700 truncate">{q.questTitle}</span>
                  <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${CLAIM_STATUS[q.status]?.cls ?? ""}`}>
                    {CLAIM_STATUS[q.status]?.label ?? q.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link href="/quests" className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-deep hover:text-teal transition-colors">
            Browse open quests <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
