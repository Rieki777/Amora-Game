/**
 * HOW MUCH YOU WEIGH, AND WHY.
 *
 * Custom mode is the sharp case: weight is allocated by a steward, one member
 * at a time, and allocated power that a member cannot see is exactly the thing
 * the constitution's new law was written against ("Voting weight is on the
 * record"). The engine keeps an append-only trail of every change with its
 * author and its reason. This card is where a member reads their own row of
 * it, in their own words, without hunting for their first name in a
 * village-wide table.
 *
 * The other two modes get the same card because the QUESTION is the same one,
 * and a member should not have to know which mode their village runs to find
 * out what their vote is worth. Equal mode answers "one person, one vote" and
 * is a short card. That shortness is the point: an honest surface for a simple
 * rule looks simple.
 *
 * A zero is stated, never left blank. In custom mode an absent allocation is
 * zero weight by design (fail closed), and a member holding zero has a real
 * grievance the interface should hand them rather than hide.
 */
import { History, Scale } from "lucide-react";
import InfoTip from "@/components/InfoTip";
import { weightText } from "./voteBars";
import type { Standing } from "./governanceApi";

const MODE_LABEL: Record<Standing["mode"], string> = {
  equal: "One person, one vote",
  token: "Weighted by token",
  custom: "Weights allocated by the stewards",
};

export default function MyStanding({ standing }: { standing: Standing }) {
  const zero = standing.eligible && standing.weight === 0;

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-base font-bold text-stone-900">
        <Scale className="w-4 h-4 text-teal-deep" aria-hidden="true" />
        Your weight
        <InfoTip
          tip="Weight is how much a vote counts. It is read when a ballot opens and frozen there, so a later change never rewrites a vote in flight."
          label="What voting weight is"
        />
      </h3>

      {!standing.eligible ? (
        <p className="mt-2 text-sm text-stone-600 leading-relaxed">
          You cannot vote in this village yet. Voting opens at the member stage, and a warning badge suspends it for as
          long as it stands.
        </p>
      ) : (
        <>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums text-stone-900">{weightText(standing.weight)}</span>
            <span className="text-sm text-stone-600">{MODE_LABEL[standing.mode]}</span>
          </p>
          <p className="mt-1.5 text-sm text-stone-600 leading-relaxed">{standing.why}</p>

          {zero && (
            <p className="mt-3 rounded-lg bg-amber-light px-3 py-2 text-sm text-gold leading-relaxed">
              You hold no weight, so a vote from you would count for nothing. That is a decision somebody made, and it
              has a reason on the record. Ask a steward for it.
            </p>
          )}
        </>
      )}

      {standing.mode === "custom" && standing.history.length > 0 && (
        <div className="mt-4 border-t border-stone-100 pt-3">
          <h4 className="flex items-center gap-1.5 text-sm font-semibold text-stone-800">
            <History className="w-3.5 h-3.5 text-stone-500" aria-hidden="true" />
            Every change to it
          </h4>
          <ul className="mt-2 space-y-2.5">
            {standing.history.map((h) => (
              <li key={h.id} className="text-sm">
                <span className="font-medium tabular-nums text-stone-900">
                  {h.oldWeight === null ? "set to" : `${weightText(h.oldWeight)} to`} {weightText(h.newWeight)}
                </span>
                <span className="text-stone-500">
                  {" "}
                  on {new Date(h.at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </span>
                <p className="text-stone-600 leading-relaxed">{h.note}</p>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-stone-500 leading-relaxed">
            This trail is append-only. Nothing on it can be edited or removed, by anyone.
          </p>
        </div>
      )}

      {standing.mode === "custom" && standing.history.length === 0 && standing.eligible && (
        <p className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-500 leading-relaxed">
          Nobody has changed your weight. When someone does, it appears here with their name and their reason.
        </p>
      )}
    </section>
  );
}
