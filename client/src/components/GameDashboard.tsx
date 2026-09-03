import { fetchGameMe, GameMe } from "@/lib/gameApi";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, CheckCircle2, Circle, Compass, Heart, Sparkles } from "lucide-react";
import MoonProgress from "@/components/natural/MoonProgress";
import StageAdvanced from "@/components/StageAdvanced";
import { claimMoment } from "@/lib/celebrated";
import { formatTokenAmount } from "@/lib/tokenAmount";

const CLAIM_STATUS: Record<string, { label: string; cls: string }> = {
  claimed: { label: "In progress", cls: "bg-amber-100 text-amber-800" },
  submitted: { label: "Awaiting consent", cls: "bg-blue-100 text-blue-700" },
  consented: { label: "Completed", cls: "bg-emerald-100 text-emerald-700" },
  declined: { label: "Not accepted", cls: "bg-stone-100 text-stone-500" },
};

export default function GameDashboard() {
  const [me, setMe] = useState<GameMe | null>(null);
  const [currency, setCurrency] = useState("Gratitude");
  /**
   * The advance to celebrate, or null.
   *
   * Claimed the instant the data lands, and claiming is the check, so a
   * re-render cannot re-open it and a member who crossed this rung last month
   * sees the ladder without the fanfare. The key mirrors the server's own
   * notification dedupe key for the same event, `stage:<member>:<stage>`,
   * with the event's timestamp standing in for the member id because this
   * ledger is per browser.
   */
  const [advance, setAdvance] = useState<GameMe["lastAdvance"]>(null);

  useEffect(() => {
    fetchGameMe().then((next) => {
      setMe(next);
      const fresh = next?.lastAdvance;
      if (fresh && claimMoment(`stage:${fresh.toStage}:${fresh.at}`)) setAdvance(fresh);
    });
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
      {advance && (
        <StageAdvanced advance={advance} stages={me.stages} onClose={() => setAdvance(null)} />
      )}

      {/* Next best action */}
      <Link
        href={me.nextAction.href}
        className="flex items-center justify-between gap-4 bg-teal-deep text-white rounded-2xl px-6 py-5 shadow-md hover:bg-teal transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <Compass className="w-6 h-6 text-amber shrink-0" />
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-widest text-white font-semibold">Your next step</p>
            {/* `truncate` cut this banner's own headline: "Continue your community
                  training" needs 294px and the box is 241px at 393px, so a member
                  read "Continue your community tr...". At 320 barely half survived.
                  It is the ONE call to action on the page, so ellipsising it hides
                  the thing the banner exists to say. Two lines is cheaper than a
                  guess. */}
                <p className="font-display text-lg font-semibold leading-snug">{me.nextAction.label}</p>
          </div>
        </div>
        <ArrowRight className="w-5 h-5 shrink-0" />
      </Link>

      {/* Path of Growth */}
      <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-3">
            {/*
              The first surface to speak the natural kit's language: the rail's
              own position, drawn as a moon filling toward full. The stage
              chips below carry the same reading in words, so the moon adds a
              shape to something already stated and never replaces it.

              stageIndex over the last index, because the last stage is arrival
              and a member standing there is at a full moon rather than at
              seven eighths of one. One stage alone reads as full, which is the
              truthful answer when there is nowhere further to walk.
            */}
            <MoonProgress
              value={me.stages.length > 1 ? me.stageIndex / (me.stages.length - 1) : 1}
              size={40}
              label="Path of Growth"
              showNumber={false}
            />
            <h3 className="font-display text-xl font-bold text-teal-deep">Path of Growth</h3>
          </div>
          {/* sage, not teal-deep. The chip's own bg-teal-deep/10 composites over
              the white card to rgb(231,242,242), which drops teal from 4.81 on
              white to 4.21 and under the 4.5 floor. A tint you set on an element
              is a backdrop for the text ON that element, and the two are chosen
              together or not at all. sage measures 5.21 on the same backdrop. */}
          <span className="text-sm font-semibold text-sage bg-teal-deep/10 px-3 py-1 rounded-full">
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
          {/* Recognition carries decimals 0 today, so this number does not
              move. It divides anyway: this is the biggest number on the
              dashboard, and it is the one a member would quote back. See
              client/src/lib/tokenAmount.ts. */}
          <p className="text-3xl font-display font-bold text-teal-deep mb-1">
            {formatTokenAmount(Number(me.gratitude.balance ?? 0), Number(me.gratitude.decimals ?? 0))}
          </p>
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
                <li key={q.id}>
                  {/* Each row opens the quest's own page, the same door the
                      board opens. Submitting and the story both live there, so
                      a member reading their four quests here can reach the one
                      they want in a tap instead of walking back to the board.
                      quest_claims.quest_id is NOT NULL since 0001, so this
                      href always names a real quest. */}
                  <Link
                    href={`/quests/${q.questId}`}
                    className="flex items-center justify-between gap-2 text-sm group"
                  >
                    <span className="text-stone-700 truncate group-hover:text-teal-deep transition-colors">
                      {q.questTitle}
                    </span>
                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full ${CLAIM_STATUS[q.status]?.cls ?? ""}`}>
                      {CLAIM_STATUS[q.status]?.label ?? q.status}
                    </span>
                  </Link>
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
