/**
 * WHO MAY VOTE, and who has spoken.
 *
 * The engine freezes an electorate at open and stores each member's weight
 * beside their name. That roll is the answer to the question a member actually
 * has when they look at a live decision, which is not "what is the percentage"
 * but "who is this, and where do I sit in it".
 *
 * So this renders the WHOLE roll, not only the voters: everyone who has spoken
 * with what they said, then everyone the village is still waiting on. Hypha
 * ships a voter list (harvest section 2, `voter-list.vue`); the silent half is
 * ours, because a quorum bar that is short is a fact about specific people who
 * have not answered yet, and naming them is how a village chases a vote
 * instead of watching a bar.
 *
 * THIS VILLAGE DOES NOT RUN SECRET BALLOTS, and the card says so rather than
 * letting a member discover it after voting. Design section 9 names that as a
 * shipped limitation; a limitation nobody is told about is a trap.
 */
import { useState } from "react";
import { CircleCheck, CircleMinus, CircleX, Users } from "lucide-react";
import type { VoteChoice } from "@shared/governanceEngine";
import InfoTip from "@/components/InfoTip";
import { weightText } from "./voteBars";
import type { BallotSilent, BallotVote } from "./governanceApi";

const CHOICE_MARK: Record<VoteChoice, { icon: typeof CircleCheck; label: string; tone: string }> = {
  yes: { icon: CircleCheck, label: "Yes", tone: "text-sage" },
  abstain: { icon: CircleMinus, label: "Abstain", tone: "text-stone-600" },
  no: { icon: CircleX, label: "No", tone: "text-coral" },
};

const SHOWN_AT_FIRST = 8;

export default function VoterRoll({
  votes,
  silent,
  live,
}: {
  votes: BallotVote[];
  silent: BallotSilent[];
  /** An open ballot is still waiting; a closed one has finished waiting. */
  live: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const total = votes.length + silent.length;
  const shownVotes = expanded ? votes : votes.slice(0, SHOWN_AT_FIRST);
  const shownSilent = expanded ? silent : silent.slice(0, SHOWN_AT_FIRST);
  const hidden = total - shownVotes.length - shownSilent.length;

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <h3 className="flex items-center gap-2 text-base font-bold text-stone-900">
        <Users className="w-4 h-4 text-teal-deep" aria-hidden="true" />
        Who may vote
        <InfoTip
          tip="This roll froze when the ballot opened. Members who joined since are not on it, and members who left still are."
          label="How the roll is decided"
        />
      </h3>
      <p className="mt-1 text-sm text-stone-600">
        {total} {total === 1 ? "member" : "members"}, {votes.length} spoken, {silent.length} yet to.
      </p>

      {votes.length > 0 && (
        <ul className="mt-3 divide-y divide-stone-100">
          {shownVotes.map((v) => {
            const mark = CHOICE_MARK[v.choice];
            const Icon = mark.icon;
            return (
              <li key={`${v.name}-${v.castAt}`} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className={`w-4 h-4 shrink-0 ${mark.tone}`} aria-hidden="true" />
                  <span className="truncate text-sm text-stone-800">{v.name}</span>
                </span>
                <span className="shrink-0 text-xs text-stone-600">
                  <span className="font-medium text-stone-800">{mark.label}</span>
                  <span className="text-stone-400"> · </span>
                  weighs {weightText(v.weight)}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {silent.length > 0 && (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-stone-500">
            {live ? "Still to speak" : "Never spoke"}
          </p>
          <ul className="mt-1 divide-y divide-stone-100">
            {shownSilent.map((s) => (
              <li key={s.name} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    className="w-4 h-4 shrink-0 rounded-full border border-dashed border-stone-400"
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm text-stone-600">{s.name}</span>
                </span>
                <span className="shrink-0 text-xs text-stone-500">weighs {weightText(s.weight)}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-3 min-h-[44px] w-full rounded-lg border border-stone-300 px-4 text-sm font-medium text-stone-700 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep"
        >
          Show the other {hidden}
        </button>
      )}

      <p className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-500 leading-relaxed">
        Votes here are on the record with a name against them. This village does not run secret ballots.
      </p>
    </section>
  );
}
