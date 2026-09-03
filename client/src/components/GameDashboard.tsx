import { fetchGameMe, GameMe } from "@/lib/gameApi";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, Compass, Heart, Sparkles } from "lucide-react";
import StageAdvanced from "@/components/StageAdvanced";
import { claimMoment } from "@/lib/celebrated";

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

      {/* The stage ladder used to stand here as "Path of Growth". It moved to
          `components/profile/MaturityLadder.tsx`, which the character sheet
          renders as its own Maturity section. The move IS the fix: the rungs a
          member had not reached were text-stone-400 at 2.52:1, the rung they
          stood on was signalled by background colour with no aria-current, and
          the separator between rungs was a literal middle dot that screen
          readers announce. Drawing it in two places would have meant fixing it
          in two places. */}

      {/* Gratitude + quests */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6">
          <div className="flex items-center gap-2 mb-3">
            <Heart className="w-5 h-5 text-coral" />
            <h2 className="font-display text-lg font-bold text-teal-deep">{currency}</h2>
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
            <h2 className="font-display text-lg font-bold text-teal-deep">Quests</h2>
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
