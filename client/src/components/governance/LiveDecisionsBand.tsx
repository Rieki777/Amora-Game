/**
 * THE BAND THAT TURNS AN EXPLAINER INTO A DOORWAY.
 *
 * The review that commissioned this lane named the risk precisely: a beautiful
 * static page about how decisions get made, sitting where a member expects to
 * find the decisions. A page like that makes an engine's rigor read as
 * paperwork, and it is worse than no page, because it answers the question
 * badly enough that nobody asks it again.
 *
 * So the explainer keeps its principles and gains this: the actual open votes,
 * at the top, with their titles and their clocks, before a word of theory. If
 * the village is deciding three things right now, a member reads three titles
 * and can be inside one of them in a tap. If it is deciding nothing, the band
 * says so and offers the way to start something, which is also a true and
 * useful answer.
 *
 * It renders nothing at all when the module is off, so a fork that never turns
 * governance on keeps exactly the page it had.
 */
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { ArrowRight, PenLine } from "lucide-react";
import { useModule } from "@/modules/ModuleProvider";
import { useAuth } from "@/contexts/AuthContext";
import VoteClock from "./VoteClock";
import { VoteResultMini } from "./VoteResult";
import { subjectNoun } from "./wizardConfig";
import { fetchBallots, type BallotCard } from "./governanceApi";

const SHOWN = 3;

export default function LiveDecisionsBand() {
  const governance = useModule("governance");
  const { user } = useAuth();
  const [ballots, setBallots] = useState<BallotCard[] | null>(null);

  useEffect(() => {
    if (!governance || !user) return;
    let alive = true;
    fetchBallots().then((answer) => {
      if (alive && answer.ok) setBallots(answer.data);
    });
    return () => {
      alive = false;
    };
  }, [governance, user]);

  if (!governance) return null;

  const open = (ballots ?? []).filter((b) => b.status === "open");
  const shown = open.slice(0, SHOWN);

  return (
    <section className="border-b border-stone-200 bg-cream py-8">
      <div className="container mx-auto max-w-5xl px-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-bold text-teal-deep">What the village is deciding now</h2>
            <p className="mt-1 text-sm text-stone-700 leading-relaxed">
              {!user
                ? "Sign in to see the votes running today."
                : open.length === 0
                  ? "Nothing is at a vote today. When something is, it appears here with a clock on it."
                  : `${open.length} ${open.length === 1 ? "vote is" : "votes are"} running.`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/decisions"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-teal-deep px-4 text-sm font-semibold text-teal-deep hover:bg-teal-deep/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep focus-visible:ring-offset-2"
            >
              Every decision
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Link>
            <Link
              href="/propose"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-teal-deep px-4 text-sm font-semibold text-white hover:bg-teal-deep-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep focus-visible:ring-offset-2"
            >
              <PenLine className="w-4 h-4" aria-hidden="true" />
              Start a proposal
            </Link>
          </div>
        </div>

        {shown.length > 0 && (
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {shown.map((b) => (
              // The two pictures ride here as well as on the decision itself,
              // because "what is the village deciding" and "where has it got
              // to" are one glance for a member passing through. The link
              // wraps the title alone: a progressbar inside an anchor would be
              // read out as part of the link's own name.
              <li
                key={b.id}
                className="flex h-full flex-col rounded-xl border border-stone-200 bg-white p-4 focus-within:border-teal-deep hover:border-teal-deep"
              >
                <span className="text-xs font-medium text-stone-500">{subjectNoun(b.subjectType)}</span>
                <Link
                  href={`/decisions/${b.id}`}
                  className="mt-1 flex min-h-[44px] flex-1 items-start rounded-sm text-sm font-bold leading-snug text-stone-900 hover:text-teal-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep"
                >
                  {b.title}
                </Link>
                {/* The band is the doorway, so the one thing it must never
                    imply is that a practice vote decides something. */}
                {!b.binding && (
                  <span className="mt-1 text-xs text-stone-600 leading-relaxed">
                    Nothing changes by itself when this one closes.
                  </span>
                )}
                <span className="mt-2">
                  <VoteClock closesAt={b.closesAt} />
                </span>
                <div className="mt-3 border-t border-stone-100 pt-3">
                  <VoteResultMini
                    tallies={b.tallies}
                    totalWeight={b.totalWeight}
                    unityPct={b.unityPct}
                    quorumPct={b.quorumPct}
                    method={b.method}
                    standingObjections={b.standingObjections}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
