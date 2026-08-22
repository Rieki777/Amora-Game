/**
 * WHAT EVERYONE WEIGHS, AND WHO CHANGED IT.
 *
 * `MyStanding` two files over answers a member's own question. This answers
 * the village's: who holds voting weight, how much, and the reason behind
 * every change to it. `governance_weight_changes` is append-only and
 * `GET /api/governance/weights` serves it to any signed-in member, which is
 * deliberate. The constitution's line is "Voting weight is on the record...
 * Weight is power, and this game holds no hidden power", and a record only
 * an admin can read is not a record.
 *
 * It shows itself only where it says something. Under one-person-one-vote
 * with nothing ever allocated there is no record to read, and a card that
 * printed "nothing here" beside a live vote would be furniture.
 *
 * First names only, because that is what the route serves: the same names a
 * member already sees on a voter roll.
 */
import { useState } from "react";
import { History } from "lucide-react";
import InfoTip from "@/components/InfoTip";
import { weightText } from "./voteBars";
import type { WeightRecord as WeightRecordData } from "./governanceApi";

/** How many changes show before a member asks for the rest. */
const FIRST_PAGE = 5;

export default function WeightRecord({ record }: { record: WeightRecordData }) {
  const [showAll, setShowAll] = useState(false);

  const holding = record.allocations.filter((a) => a.weight > 0);
  if (record.mode !== "custom" && record.history.length === 0) return null;
  if (holding.length === 0 && record.history.length === 0) return null;

  const shown = showAll ? record.history : record.history.slice(0, FIRST_PAGE);

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-base font-bold text-stone-900">
        <History className="w-4 h-4 text-teal-deep" aria-hidden="true" />
        The weight record
        <InfoTip
          tip="Every change to anyone's voting weight is kept with its reason and its author, and every member can read it."
          label="What the weight record is"
        />
      </h3>
      <p className="mt-2 text-sm text-stone-600 leading-relaxed">
        {record.mode === "custom"
          ? `${holding.length} ${holding.length === 1 ? "member holds" : "members hold"} voting weight in this village.`
          : "This village does not allocate weight by hand today. What it did allocate is kept here."}
      </p>

      {holding.length > 0 && (
        <ul className="mt-3 space-y-1">
          {holding.map((a, i) => (
            <li key={`${a.member}-${i}`} className="flex items-baseline justify-between gap-3 text-sm">
              <span className="text-stone-800">{a.member}</span>
              <span className="font-medium tabular-nums text-stone-900">{weightText(a.weight)}</span>
            </li>
          ))}
        </ul>
      )}

      {record.history.length > 0 && (
        <div className="mt-4 border-t border-stone-100 pt-3">
          <h4 className="text-sm font-semibold text-stone-800">Every change</h4>
          <ul className="mt-2 space-y-2.5">
            {shown.map((h, i) => (
              <li key={`${h.at}-${i}`} className="text-sm">
                <span className="font-medium text-stone-900">{h.member}</span>
                <span className="tabular-nums text-stone-800">
                  {h.oldWeight === null ? " set to " : ` ${weightText(h.oldWeight)} to `}
                  {weightText(h.newWeight)}
                </span>
                <span className="text-stone-500">
                  {" by "}
                  {h.by} on{" "}
                  {new Date(h.at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                </span>
                <p className="text-stone-600 leading-relaxed">{h.note}</p>
              </li>
            ))}
          </ul>
          {record.history.length > FIRST_PAGE && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-2 inline-flex min-h-[44px] items-center text-sm font-semibold text-teal-deep hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep rounded-lg"
            >
              {showAll ? "Show fewer changes" : `Show all ${record.history.length} changes`}
            </button>
          )}
          <p className="mt-2 text-xs text-stone-500 leading-relaxed">
            Append-only. Nothing on this list can be edited or removed, by anyone.
          </p>
        </div>
      )}
    </section>
  );
}
