/**
 * THE TWO BARS, drawn.
 *
 * One bar for agreement among those who voted, one bar for participation
 * against the whole electorate, and never a third bar that merges them. The
 * arithmetic and the wording live in voteBars.ts, tested; this file is the
 * drawing, and its only job is to keep the two apart on the page as firmly as
 * they are kept apart in the module.
 *
 * WHY THE QUORUM BAR IS ALWAYS GREY. It is tempting to turn it green when it
 * clears, and that is the bug: green on this page means "this is carrying",
 * and a met quorum means only that enough people showed up for the question to
 * be answerable. Its met state is carried by the check mark and the sentence,
 * which is what the accessibility rule asks for anyway.
 *
 * WHY THESE ARE BARS AND NOT MOONS. `MoonProgress` is the platform's one
 * progress vocabulary and the contract gives it "any completion display"
 * (docs/modules/natural-interface.md). Neither of these is a completion
 * display. Each is a value read against a THRESHOLD, and the threshold is the
 * information: 62% means nothing here until you can see where 80% sits. A disc
 * has nowhere to put that line, and two discs side by side would lose the one
 * fact this widget exists to carry. Where this module does show completion it
 * uses the moon, on the Decisions page's turnout card.
 *
 * ACCESSIBILITY. Each bar is a `progressbar` with aria-valuenow and an
 * accessible name that already contains the number and the verdict, so a
 * screen reader never has to infer anything from a colour or a shape. The
 * threshold notch is drawn AND named. The fill transition is dropped for
 * anyone who asked for less motion.
 */
import { Check, Minus, X } from "lucide-react";
import type { BallotMethod, BallotTallies } from "@shared/governanceEngine";
import { useReducedMotion } from "@/components/natural";
import InfoTip from "@/components/InfoTip";
import { pctText, quorumBar, spoken, unityBar, weightText, type BarReading } from "./voteBars";

const MARK_ICON = { met: Check, short: X, none: Minus } as const;

/** The fill colours. Grey is a value here, not an absence of one. */
const FILL = {
  unity: { met: "bg-sage", short: "bg-coral", none: "bg-stone-300" },
  quorum: { met: "bg-stone-500", short: "bg-stone-400", none: "bg-stone-300" },
} as const;

const MARK_TONE = { met: "text-sage", short: "text-coral", none: "text-stone-500" } as const;

function Bar({
  kind,
  title,
  tip,
  bar,
  detail,
}: {
  kind: "unity" | "quorum";
  title: string;
  tip: string;
  bar: BarReading;
  /** The count under the bar, in the village's own numbers. */
  detail: string;
}) {
  const reduced = useReducedMotion();
  const Mark = MARK_ICON[bar.mark];
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 mb-1.5">
        <span className="text-sm font-semibold text-stone-800">
          {title}
          <InfoTip tip={tip} label={`What ${title.toLowerCase()} means`} />
        </span>
        <span className="flex items-center gap-1.5 text-sm font-bold tabular-nums text-stone-900">
          <Mark className={`w-4 h-4 ${MARK_TONE[bar.mark]}`} aria-hidden="true" />
          {pctText(bar.valuePct)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(bar.valuePct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${title}: ${pctText(bar.valuePct)}. ${bar.reading}`}
        className="relative h-3 rounded-full bg-stone-200 overflow-hidden"
      >
        <div
          className={`h-full rounded-full ${FILL[kind][bar.mark]}`}
          style={{ width: `${bar.valuePct}%`, transition: reduced ? "none" : "width 500ms ease-out" }}
        />
        {/* The notch: where this vote's own frozen threshold sits. Drawn as a
            line rather than as a colour change, so it survives greyscale. */}
        <div
          className="absolute inset-y-0 w-0.5 bg-stone-900/70"
          style={{ left: `calc(${bar.thresholdPct}% - 1px)` }}
          aria-hidden="true"
        />
      </div>
      <p className="mt-1.5 text-xs text-stone-600 leading-relaxed">
        {bar.reading}. <span className="text-stone-500">{detail}</span>
      </p>
    </div>
  );
}

export interface VoteResultProps {
  tallies: BallotTallies;
  totalWeight: number;
  unityPct: number;
  quorumPct: number;
  method: BallotMethod;
  electorateCount: number;
  votedCount: number;
}

export default function VoteResult({
  tallies,
  totalWeight,
  unityPct,
  quorumPct,
  method,
  electorateCount,
  votedCount,
}: VoteResultProps) {
  const unity = unityBar(tallies, unityPct, method);
  const quorum = quorumBar(tallies, totalWeight, quorumPct);
  const { spokenWeight } = spoken(tallies, totalWeight);
  const consent = method === "consent";

  return (
    <div className="space-y-5">
      {consent ? (
        // Consent conducts no unity at all, so drawing an agreement bar here
        // would invent a threshold this ballot does not have.
        <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
          <p className="text-sm font-semibold text-stone-800">
            Agreement
            <InfoTip
              tip="This is a consent decision. It does not count how many agree. It passes unless someone names a consequence the village should avoid."
              label="What agreement means here"
            />
          </p>
          <p className="mt-1 text-xs text-stone-600 leading-relaxed">
            Consent is not counted in percentages. What matters is whether an objection still stands.
          </p>
        </div>
      ) : (
        <Bar
          kind="unity"
          title="Agreement"
          tip="Of the weight that took a side, how much sided yes. People who abstained are left out of this number on purpose."
          bar={unity}
          detail={`${weightText(tallies.yesW)} yes, ${weightText(tallies.noW)} no.`}
        />
      )}

      <Bar
        kind="quorum"
        title="Participation"
        tip="How much of the frozen electorate has voted, counting abstentions. This is how many showed up, never how many agreed."
        bar={quorum}
        detail={`${weightText(spokenWeight)} of ${weightText(totalWeight)} weight has spoken, from ${votedCount} of ${electorateCount} ${electorateCount === 1 ? "member" : "members"}.`}
      />
    </div>
  );
}

/**
 * The card variant: the same two bars, small, for a list of decisions in
 * flight. Still two, still marked, still never merged.
 */
export function VoteResultMini({
  tallies,
  totalWeight,
  unityPct,
  quorumPct,
  method,
}: Omit<VoteResultProps, "electorateCount" | "votedCount">) {
  const unity = unityBar(tallies, unityPct, method);
  const quorum = quorumBar(tallies, totalWeight, quorumPct);
  const reduced = useReducedMotion();
  const rows: Array<{ kind: "unity" | "quorum"; label: string; bar: BarReading }> = [
    ...(method === "consent" ? [] : [{ kind: "unity" as const, label: "Agreement", bar: unity }]),
    { kind: "quorum" as const, label: "Participation", bar: quorum },
  ];
  return (
    <div className="space-y-2">
      {rows.map((row) => {
        const Mark = MARK_ICON[row.bar.mark];
        return (
          <div key={row.kind} className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-[11px] font-medium text-stone-600">{row.label}</span>
            <div
              role="progressbar"
              aria-valuenow={Math.round(row.bar.valuePct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${row.label}: ${pctText(row.bar.valuePct)}. ${row.bar.reading}`}
              className="relative h-2 flex-1 rounded-full bg-stone-200 overflow-hidden"
            >
              <div
                className={`h-full rounded-full ${FILL[row.kind][row.bar.mark]}`}
                style={{ width: `${row.bar.valuePct}%`, transition: reduced ? "none" : "width 500ms ease-out" }}
              />
              <div
                className="absolute inset-y-0 w-0.5 bg-stone-900/60"
                style={{ left: `calc(${row.bar.thresholdPct}% - 1px)` }}
                aria-hidden="true"
              />
            </div>
            <span className="flex w-14 shrink-0 items-center justify-end gap-1 text-[11px] font-bold tabular-nums text-stone-800">
              <Mark className={`w-3 h-3 ${MARK_TONE[row.bar.mark]}`} aria-hidden="true" />
              {pctText(row.bar.valuePct)}
            </span>
          </div>
        );
      })}
    </div>
  );
}
