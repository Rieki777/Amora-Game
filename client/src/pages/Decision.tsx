/**
 * ONE DECISION, live.
 *
 * This is the page a member lands on when the village is deciding something
 * and they want to know where it stands. Its order answers the questions in
 * the order people ask them:
 *
 *   WHAT is being decided       the title, the kind, and the document exactly
 *                               as it was snapshotted when the ballot opened.
 *                               What is voted on is what was checked.
 *   WHERE does it stand         the two bars, the weight that has spoken
 *                               against the weight that could, the clock.
 *   WHAT DO I DO                the vote widget, with the change permission
 *                               stated rather than implied.
 *   WHO ELSE                    the frozen roll: who has spoken, who has not.
 *   WHAT HAPPENS NEXT           who may close it, and the close beat itself.
 *
 * A closed decision replaces the first three with the outcome card, because a
 * decided question is not a live one and pretending otherwise is how a record
 * page becomes a scoreboard.
 *
 * Everything here re-reads from the server after any act, rather than patching
 * local state: the tallies, the objection statuses and the outcome are the
 * engine's to compute, and a page that guessed at them would eventually show a
 * member a number the close route did not agree with.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, FileText, Info } from "lucide-react";
import type { VoteChoice } from "@shared/governanceEngine";
import Layout from "@/components/Layout";
import ModuleGate from "@/components/modules/ModuleGate";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { useAuth } from "@/contexts/AuthContext";
import { BreathingLoader } from "@/components/natural";
import InfoTip from "@/components/InfoTip";
import CloseBeat from "@/components/governance/CloseBeat";
import DecisionOutcome from "@/components/governance/DecisionOutcome";
import MyStanding from "@/components/governance/MyStanding";
import ObjectionPanel from "@/components/governance/ObjectionPanel";
import VoteClock from "@/components/governance/VoteClock";
import VoteResult from "@/components/governance/VoteResult";
import VoteWidget from "@/components/governance/VoteWidget";
import VoterRoll from "@/components/governance/VoterRoll";
import { subjectNoun } from "@/components/governance/wizardConfig";
import { weightText } from "@/components/governance/voteBars";
import {
  castVote,
  closeBallot,
  fetchBallot,
  fetchStanding,
  fileObjection,
  ruleObjection,
  type Ballot,
  type CloseResult,
  type Standing,
} from "@/components/governance/governanceApi";

const METHOD_TIP: Record<string, string> = {
  majority: "More than half of the weight that took a side carries it.",
  consensus: "Everyone who takes a side has to agree. One no stops it.",
  consent: "Nobody has to agree. It carries unless somebody names a consequence the village should avoid.",
  custom: "The village set its own bar for agreement and for turnout, and this ballot froze both when it opened.",
};

const WEIGHT_MODE_TIP: Record<string, string> = {
  equal: "Every member on the roll weighs the same here.",
  token: "Weight came from token balances, read once when this ballot opened and frozen there.",
  custom: "Weight was allocated by the stewards, and every allocation is on the record.",
};

export default function Decision() {
  const params = useParams<{ id: string }>();
  const { user } = useAuth();
  const modules = useModules();
  const governance = useModule("governance");

  const [ballot, setBallot] = useState<Ballot | null>(null);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [justClosed, setJustClosed] = useState<CloseResult | null>(null);
  const [showDoc, setShowDoc] = useState(false);

  const load = useCallback(async () => {
    if (!params.id) return;
    const answer = await fetchBallot(params.id);
    if (answer.ok) setBallot(answer.data);
    else setMissing(true);
  }, [params.id]);

  useEffect(() => {
    if (!governance) return;
    void load();
    if (user) fetchStanding().then((s) => s.ok && setStanding(s.data));
  }, [governance, load, user]);

  const act = async (run: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(true);
    setProblem(null);
    const answer = await run();
    if (!answer.ok) setProblem(answer.error ?? "That did not work");
    await load();
    setBusy(false);
  };

  const onVote = async (choice: VoteChoice, reason?: string) => {
    await act(() => castVote(params.id!, choice, reason));
  };

  const onClose = async (outcomeNote: string) => {
    setBusy(true);
    setProblem(null);
    const answer = await closeBallot(params.id!, outcomeNote);
    if (answer.ok) {
      setJustClosed(answer.data);
      setBallot(answer.data.ballot);
      setClosing(false);
    } else {
      setProblem(answer.error);
      await load();
    }
    setBusy(false);
  };

  if (modules.loaded && !governance) return <ModuleGate moduleId="governance" name="Decisions" />;

  if (missing) {
    return (
      <Layout>
        <div className="container max-w-2xl px-4 py-16 text-center">
          <h1 className="font-display text-3xl font-bold text-stone-900">No such decision</h1>
          <p className="mt-2 text-stone-600">It may have been withdrawn, or the link may be wrong.</p>
          <Link
            href="/decisions"
            className="mt-6 inline-flex min-h-[44px] items-center rounded-lg bg-teal-deep px-5 font-semibold text-white hover:bg-teal-deep-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep focus-visible:ring-offset-2"
          >
            Everything the village is deciding
          </Link>
        </div>
      </Layout>
    );
  }

  if (!ballot) {
    return (
      <Layout>
        <div className="flex justify-center py-24">
          <BreathingLoader label="Opening the decision" />
        </div>
      </Layout>
    );
  }

  const open = ballot.status === "open";
  const expired = Date.parse(ballot.closesAt) <= Date.now();
  const inRoll = ballot.myWeight !== null;
  const votedCount = ballot.votes.length;

  return (
    <Layout>
      <div className="container max-w-6xl px-4 py-8">
        <Link
          href="/decisions"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-teal-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          Every decision
        </Link>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-700">
            {subjectNoun(ballot.subjectType)}
          </span>
          <span className="text-xs text-stone-600">
            Decided by {ballot.method}
            <InfoTip tip={METHOD_TIP[ballot.method] ?? METHOD_TIP.custom} label="What this method means" />
          </span>
          <span className="text-xs text-stone-600">
            {ballot.electorateCount} on the roll, {weightText(ballot.totalWeight)} weight between them
            <InfoTip tip={WEIGHT_MODE_TIP[ballot.weightMode] ?? WEIGHT_MODE_TIP.equal} label="How weight was decided" />
          </span>
        </div>

        <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-stone-900 sm:text-4xl">
          {ballot.title}
        </h1>

        {open && (
          <p className="mt-2">
            <VoteClock closesAt={ballot.closesAt} />
          </p>
        )}

        {problem && (
          <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-coral">
            {problem}
          </p>
        )}

        <div className="mt-6 lg:grid lg:grid-cols-[1fr_20rem] lg:gap-8">
          <div className="min-w-0 space-y-6">
            {!open && (
              <DecisionOutcome
                ballot={ballot}
                applied={justClosed?.applied}
                held={justClosed?.held}
                fresh={!!justClosed}
              />
            )}

            {open && (
              <section className="rounded-xl border border-stone-200 bg-white p-5">
                <h2 className="text-base font-bold text-stone-900">Where it stands</h2>
                <p className="mt-0.5 text-sm text-stone-600 leading-relaxed">
                  Two measurements, never one. How much of the village has spoken, and how those who spoke divided.
                </p>
                <div className="mt-4">
                  <VoteResult
                    tallies={ballot.tallies}
                    totalWeight={ballot.totalWeight}
                    unityPct={ballot.unityPct}
                    quorumPct={ballot.quorumPct}
                    method={ballot.method}
                    electorateCount={ballot.electorateCount}
                    votedCount={votedCount}
                  />
                </div>
              </section>
            )}

            {open && user && <VoteWidget ballot={ballot} onVote={onVote} busy={busy} />}

            {ballot.method === "consent" && (
              <ObjectionPanel
                objections={ballot.objections}
                canFile={open && !expired && inRoll}
                canRule={open && !!standing?.mayDecide}
                busy={busy}
                onFile={async (text) => {
                  await act(() => fileObjection(ballot.id, text));
                }}
                onRule={async (objectionId, ruling, note) => {
                  await act(() => ruleObjection(ballot.id, objectionId, ruling, note));
                }}
              />
            )}

            {/* THE CLOSE BEAT, offered to whoever could plausibly take it.
                Who may close is `facilitator || (expired && proposer)`, and
                the client can settle only half of that: `mayDecide` comes from
                standing, and whether this viewer proposed the subject does
                not. So before the period ends, where only a facilitator may
                close, the section is hidden from everyone else; once it ends,
                it is offered with the sentence naming who may, because the
                proposer is somebody and hiding it from them would leave the
                decision waiting forever. */}
            {open && user && !closing && (expired || !!standing?.mayDecide) && (
              <section className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                <h2 className="text-base font-bold text-stone-900">Closing this</h2>
                <p className="mt-1 text-sm text-stone-600 leading-relaxed">
                  {expired
                    ? "The voting period has ended and this is waiting for a person. Its proposer, anyone who may decide proposals, or an admin can close it."
                    : "The period is still running, and closing it early is yours to do as someone who decides proposals."}{" "}
                  Closing always means writing what the village decided.
                </p>
                <button
                  type="button"
                  onClick={() => setClosing(true)}
                  className="mt-3 min-h-[44px] rounded-lg border border-teal-deep px-5 text-sm font-semibold text-teal-deep hover:bg-teal-deep/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep focus-visible:ring-offset-2"
                >
                  Close this decision
                </button>
              </section>
            )}

            {open && closing && (
              <CloseBeat ballot={ballot} busy={busy} onClose={onClose} onCancel={() => setClosing(false)} />
            )}

            <VoterRoll votes={ballot.votes} silent={ballot.silent} live={open} />

            {/* The document, exactly as it was when the ballot opened. */}
            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="flex items-center gap-2 text-base font-bold text-stone-900">
                <FileText className="w-4 h-4 text-teal-deep" aria-hidden="true" />
                What is being voted on
                <InfoTip
                  tip="This document was snapshotted when the ballot opened and cannot change while it runs. What is voted on is what was checked."
                  label="Why the document is frozen"
                />
              </h2>
              <button
                type="button"
                aria-expanded={showDoc}
                onClick={() => setShowDoc((v) => !v)}
                className="mt-2 min-h-[44px] rounded-lg border border-stone-300 px-4 text-sm font-medium text-stone-700 hover:bg-stone-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-deep"
              >
                {showDoc ? "Hide the document" : "Read the document"}
              </button>
              {showDoc && (
                <pre className="mt-3 max-h-[28rem] overflow-auto whitespace-pre-wrap rounded-lg bg-stone-50 p-4 font-sans text-sm leading-relaxed text-stone-800">
                  {ballot.docMarkdown}
                </pre>
              )}
            </section>
          </div>

          <aside className="mt-8 space-y-6 lg:mt-0">
            {standing && <MyStanding standing={standing} />}
            <div className="rounded-xl border border-stone-200 bg-white p-4">
              <h3 className="flex items-center gap-2 text-base font-bold text-stone-900">
                <Info className="w-4 h-4 text-teal-deep" aria-hidden="true" />
                This vote's own rules
              </h3>
              <dl className="mt-2 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-600">Agreement needed</dt>
                  <dd className="font-semibold tabular-nums text-stone-900">
                    {ballot.method === "consent" ? "no objections" : `${ballot.unityPct}%`}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-600">Turnout needed</dt>
                  <dd className="font-semibold tabular-nums text-stone-900">{ballot.quorumPct}%</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-600">Opened</dt>
                  <dd className="text-stone-900">
                    {new Date(ballot.opensAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-stone-600">Period ends</dt>
                  <dd className="text-stone-900">
                    {new Date(ballot.closesAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 border-t border-stone-100 pt-3 text-xs text-stone-500 leading-relaxed">
                These numbers froze when this ballot opened. Changing the village's settings now does nothing to this
                vote, open or closed.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </Layout>
  );
}
