/**
 * THE PUBLIC GAME MECHANICS PAGE (Game Mechanics initiative, 2026-07-31).
 *
 * Everything the game runs on, visible to everyone — and, since the
 * propose-on-the-page phase, the place any member changes it from:
 *
 *   1. The constitution — the laws no vote can change, in plain language.
 *   2. The dials — every mechanic of every running module. Community-ring
 *      dials are EDITABLE in place for signed-in members: adjusting one
 *      stages a change, staged changes become a proposal with a title and a
 *      rationale, and the proposal walks the village's own path — sensing
 *      support in-game, then Hypha for the binding vote, then the amendment
 *      ledger when it applies.
 *   3. Open proposals — support, sponsor a draft, copy the canonical
 *      document for Hypha, report a pass, and (admins) apply a verified one.
 *      A proposal here may have BEEN to a vote and come back: a missed quorum
 *      and a called-off ballot both send it to `open` holding its ballot id,
 *      and both settle nothing. The card says which, in the bell's own words,
 *      and links to the vote (BALLOT_RETURN below).
 *   4. The amendment history.
 *
 * The page RENDERS the server's answers and computes no rule of its own:
 * eligibility comes from /standing (the same function the routes enforce
 * with), validation problems come back from the server, and the proposal
 * document is fetched, never rebuilt here — what is voted on is what was
 * checked.
 */
import Layout from "@/components/Layout";
import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Scale,
  SlidersHorizontal,
  ScrollText,
  ChevronDown,
  Lock,
  Users,
  Megaphone,
  Copy,
  X,
} from "lucide-react";
import { Link } from "wouter";
import InfoTip from "@/components/InfoTip";
import { useGameConfig, authToken } from "@/lib/gameApi";
import { useAuth } from "@/contexts/AuthContext";
import { useFocusTarget } from "@/lib/useFocusTarget";

interface MechanicsVariable {
  key: string;
  category: string;
  label: string;
  description: string;
  type: string;
  unit: string | null;
  min: number | null;
  max: number | null;
  choices: Array<{ value: string; label: string; hint?: string }> | null;
  default: string;
  value: string;
  parsed: number | boolean | string;
  isDefault: boolean;
  ring: "open" | "founder";
  applyTiming: "instant" | "cycle-close";
}

interface MechanicsSnapshot {
  constitution: Array<{ title: string; plain: string; enforcedBy: string }>;
  variables: MechanicsVariable[];
  modules: Array<{ id: string; name: string; core: boolean }>;
}

interface Amendment {
  id: string;
  key: string;
  label: string;
  from: string | null;
  fromWasDefault: boolean;
  to: string | null;
  toIsDefault: boolean;
  by: string | null;
  source: string;
  proposalRef: string | null;
  note: string | null;
  at: string;
}

interface ProposalChange {
  key: string;
  label: string;
  from: string;
  fromDisplay: string;
  to: string;
  toDisplay: string;
  applyTiming: string;
  currentValue: string | null;
}

/** Every value `mechanics_proposals.status` can hold (0089 widened the enum to
 *  ten and this list carried eight; see STATUS_COPY). */
type ProposalStatus =
  | "draft"
  | "open"
  | "withdrawn"
  | "to_hypha"
  | "onsite_vote"
  | "passed_claimed"
  | "passed_verified"
  | "passed_onsite"
  | "failed"
  | "applied";

/** How the last ballot on a proposal ended (`ballots.status`). */
type BallotStatus = "open" | "passed" | "failed" | "no_quorum" | "withdrawn";

interface Proposal {
  id: string;
  title: string;
  rationale: string;
  status: ProposalStatus;
  /** The vote this proposal last went to, null if it has never been to one. */
  ballotId: string | null;
  /** How that vote ended. Null while it is still open, and null with no vote. */
  lastBallotStatus: BallotStatus | null;
  hyphaRef: string | null;
  hyphaProposalId: string | null;
  hyphaProposalUrl: string | null;
  hubLinkSynced: boolean;
  createdAt: string;
  proposer: string;
  supports: number;
  sponsors: number;
  changes: ProposalChange[];
}

interface Standing {
  qualified: boolean;
  mayDraft: boolean;
  denied: boolean;
  recognitionRequired: number;
  recognitionHeld: number;
  supportThreshold: number;
  backed: Array<{ proposalId: string; kind: string }>;
}

const STATUS_COPY: Record<ProposalStatus, { label: string; cls: string }> = {
  draft: { label: "draft, needs a sponsor", cls: "bg-amber-50 text-amber-700" },
  open: { label: "open for support", cls: "bg-emerald-50 text-emerald-700" },
  withdrawn: { label: "withdrawn", cls: "bg-stone-100 text-stone-500" },
  to_hypha: { label: "at Hypha for the vote", cls: "bg-sky-50 text-sky-700" },
  onsite_vote: { label: "at the village vote", cls: "bg-sky-50 text-sky-700" },
  passed_claimed: { label: "passed, awaiting verification", cls: "bg-violet-50 text-violet-700" },
  passed_verified: { label: "verified on-chain, applying", cls: "bg-violet-50 text-violet-700" },
  passed_onsite: { label: "carried at the village vote, applying", cls: "bg-violet-50 text-violet-700" },
  failed: { label: "did not pass", cls: "bg-stone-100 text-stone-500" },
  applied: { label: "applied", cls: "bg-teal-deep/10 text-teal-deep" },
};

/**
 * The state chip, never undefined. `STATUS_COPY[p.status].cls` used to be read
 * straight, and the enum in the database is the authority for what arrives
 * here: 0089 added `onsite_vote` and `passed_onsite` and this map kept eight
 * keys, so the first proposal to reach the village's own vote threw a
 * TypeError inside the list and took the whole page down for everyone. A
 * status nobody has taught this page yet now reads as itself instead.
 */
function statusChip(status: ProposalStatus): { label: string; cls: string } {
  return STATUS_COPY[status] ?? { label: String(status).replace(/_/g, " "), cls: "bg-stone-100 text-stone-500" };
}

/**
 * WHY A PROPOSAL IS SITTING WHERE IT IS SITTING.
 *
 * A proposal back at `open` while holding a ballot id has BEEN to a vote and
 * come back, and until the close route was fixed there was no such thing: a
 * missed quorum wrote `failed` on the subject, so "too few of us were here"
 * went on the record as "the village rejected this". Two facts, and the second
 * one was false.
 *
 * Both ways back settle NOTHING, and the words have to carry that or the fix
 * only reached the database. The vocabulary is the bell's, deliberately:
 * `ballot_no_quorum` says too few of the roll answered and the question
 * stands, `ballot_withdrawn` says a vote was called off before it closed. One
 * event, one set of words, however a member meets it.
 *
 * `passed` and `failed` are here for the record only. The proposal's own
 * status already says what happened, so this adds the link and stays quiet.
 */
const BALLOT_RETURN: Record<BallotStatus, { chip: string | null; cls: string; line: string | null; tip: string | null }> = {
  open: { chip: null, cls: "", line: null, tip: null },
  passed: { chip: null, cls: "", line: null, tip: null },
  failed: { chip: null, cls: "", line: null, tip: null },
  no_quorum: {
    chip: "too few spoke",
    cls: "bg-stone-100 text-stone-600",
    line: "Too few of the village voted for that ballot to settle anything. This stands where it stood, holding its supporters and every word of it, and it can go to a vote again.",
    tip: "A vote settles something only when enough of the village answers it. Too few did, so that ballot decided nothing and this went back where it was. Going again means a new vote, frozen fresh on the day it opens.",
  },
  withdrawn: {
    chip: "its vote was called off",
    cls: "bg-stone-100 text-stone-600",
    line: "The vote on this was called off before it closed, so nothing was decided. It holds its supporters and every word of it, and the reason is on that vote's record.",
    tip: "Whoever opens a vote can call it off while nobody has answered it. Once even one vote stands, calling it off takes a proposal.decide holder or an admin, because cast votes belong to the people who cast them.",
  },
};

/**
 * The chip that says a proposal has been to a vote and come back, beside the
 * chip that says where it stands now. Two chips, because they answer two
 * questions and folding them into one is how "waiting" became "rejected".
 *
 * A proposal that has never been to a vote carries nothing here. Its status
 * chip is the whole of its state, and hanging a badge on it for a thing that
 * has not happened is the scorecard R55 rules out.
 */
function BallotReturnChip({ proposal }: { proposal: Proposal }) {
  const back = proposal.lastBallotStatus ? BALLOT_RETURN[proposal.lastBallotStatus] : null;
  if (!proposal.ballotId || !back?.chip) return null;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full ${back.cls}`}>
      {back.chip}
      {back.tip && <InfoTip tip={back.tip} label={`What ${back.chip} means`} />}
    </span>
  );
}

/**
 * What the vote left behind, in the card body, and the way to the vote itself.
 * The link is the point of the sentence: the ballot holds the frozen roll, the
 * tallies and the reason it was called off, so a member can read the thing
 * being described instead of taking this page's word for it.
 */
function BallotReturnNote({ proposal }: { proposal: Proposal }) {
  if (!proposal.ballotId) return null;
  const back = proposal.lastBallotStatus ? BALLOT_RETURN[proposal.lastBallotStatus] : null;
  const live = proposal.lastBallotStatus === "open";
  return (
    <div className="mb-3 rounded-lg bg-stone-50 border border-stone-200 px-3 py-2">
      {back?.line && <p className="text-sm text-stone-600 leading-relaxed">{back.line}</p>}
      <Link
        href={`/decisions/${proposal.ballotId}`}
        className={`text-sm text-teal-deep font-medium hover:underline ${back?.line ? "mt-1 inline-block" : ""}`}
      >
        {live ? "See the vote" : "See that vote"}
      </Link>
    </div>
  );
}

function displayValue(v: MechanicsVariable, raw: string): string {
  if (v.type === "boolean") return raw === "true" || raw === "1" ? "On" : "Off";
  if (v.type === "choice") {
    const c = v.choices?.find((c) => c.value === raw);
    return c?.label ?? raw;
  }
  if (raw === "" || raw == null) return "not set";
  return v.unit ? `${raw} ${v.unit}` : raw;
}

const authHeaders = (): Record<string, string> => {
  const t = authToken();
  return t
    ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" }
    : { "Content-Type": "application/json" };
};

/** The per-dial editor: the input a member adjusts to stage a change. */
function DialEditor({
  v,
  staged,
  onStage,
}: {
  v: MechanicsVariable;
  staged: string | undefined;
  onStage: (key: string, value: string | undefined) => void;
}) {
  const current = staged ?? v.value;
  const cls = "border border-stone-200 rounded-lg px-2 py-1 text-sm w-full max-w-[220px]";
  if (v.type === "boolean") {
    return (
      <select
        aria-label={`Proposed value for ${v.label}`}
        value={current === "true" || current === "1" ? "true" : "false"}
        onChange={(e) => onStage(v.key, e.target.value === v.value ? undefined : e.target.value)}
        className={cls}
      >
        <option value="true">On</option>
        <option value="false">Off</option>
      </select>
    );
  }
  if (v.type === "choice") {
    return (
      <select
        aria-label={`Proposed value for ${v.label}`}
        value={current}
        onChange={(e) => onStage(v.key, e.target.value === v.value ? undefined : e.target.value)}
        className={cls}
      >
        {(v.choices ?? []).map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}
          </option>
        ))}
      </select>
    );
  }
  if (v.type === "text") {
    return (
      <input
        aria-label={`Proposed value for ${v.label}`}
        value={current}
        onChange={(e) => onStage(v.key, e.target.value === v.value ? undefined : e.target.value)}
        className={cls}
      />
    );
  }
  return (
    <input
      type="number"
      aria-label={`Proposed value for ${v.label}`}
      min={v.min ?? undefined}
      max={v.max ?? undefined}
      step={v.type === "integer" ? 1 : "any"}
      value={current}
      onChange={(e) => onStage(v.key, e.target.value === v.value ? undefined : e.target.value)}
      className={cls}
    />
  );
}

export default function GameMechanics() {
  const cfg = useGameConfig();
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<MechanicsSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [history, setHistory] = useState<Amendment[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [standing, setStanding] = useState<Standing | null>(null);
  const [staged, setStaged] = useState<Record<string, string>>({});
  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [rationale, setRationale] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [problems, setProblems] = useState<Array<{ key: string; problem: string }>>([]);

  // A notification about a proposal lands ON the proposal. The dependency is
  // the list length because the target arrives with the fetch, not with the
  // first paint.
  useFocusTarget([proposals.length]);

  const loadProposals = useCallback(() => {
    fetch("/api/game/mechanics/proposals")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setProposals(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  const loadStanding = useCallback(() => {
    if (!authToken()) return;
    fetch("/api/game/mechanics/standing", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setStanding)
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/game/mechanics")
      .then((r) => {
        if (!r.ok) throw new Error(`mechanics ${r.status}`);
        return r.json();
      })
      .then(setSnapshot)
      .catch(() => setFailed(true));
    loadProposals();
  }, [loadProposals]);

  useEffect(() => {
    loadStanding();
  }, [user, loadStanding]);

  const openHistory = () => {
    setHistoryOpen((v) => !v);
    if (history === null) {
      fetch("/api/game/mechanics/history")
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setHistory(Array.isArray(d) ? d : []))
        .catch(() => setHistory([]));
    }
  };

  const stage = (key: string, value: string | undefined) => {
    setStaged((s) => {
      const next = { ...s };
      if (value === undefined) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const stagedCount = Object.keys(staged).length;

  const submitProposal = async () => {
    setSubmitting(true);
    setFeedback(null);
    setProblems([]);
    try {
      const res = await fetch("/api/game/mechanics/proposals", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          title,
          rationale,
          changes: Object.entries(staged).map(([key, to]) => ({ key, to })),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setProblems(Array.isArray(d.problems) ? d.problems : []);
        setFeedback({ ok: false, text: d.message ?? d.error ?? "Something went wrong" });
      } else {
        setFeedback({ ok: true, text: d.message ?? "Proposed." });
        setStaged({});
        setTitle("");
        setRationale("");
        setComposerOpen(false);
        loadProposals();
      }
    } catch {
      setFeedback({ ok: false, text: "Something went wrong. Try again." });
    }
    setSubmitting(false);
  };

  const act = async (path: string, body?: unknown) => {
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: authHeaders(),
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setFeedback({ ok: false, text: d?.message ?? d?.error ?? "That did not work" });
        return null;
      }
      loadProposals();
      loadStanding();
      return d;
    } catch {
      setFeedback({ ok: false, text: "That did not work. Try again." });
      return null;
    }
  };

  const copyDocument = async (id: string) => {
    try {
      const res = await fetch(`/api/game/mechanics/proposals/${id}/document`);
      const d = await res.json();
      await navigator.clipboard.writeText(d.markdown);
      setFeedback({ ok: true, text: "Proposal document copied. Paste it into the Hypha proposal, and keep the [gm:…] marker in the title." });
    } catch {
      setFeedback({ ok: false, text: "Couldn't copy. Open the document and copy it by hand." });
    }
  };

  /** Copy ALWAYS, then open Hypha when the village has one configured — the
   *  clipboard is the fallback for create pages that don't read prefill
   *  params yet, and the [gm:] marker in the title is the thread home. */
  const continueToHypha = async (id: string) => {
    try {
      const res = await fetch(`/api/game/mechanics/proposals/${id}/handoff`);
      const d = await res.json();
      await navigator.clipboard.writeText(d.markdown).catch(() => {});
      if (d.configured && d.url) {
        window.open(d.url, "_blank", "noopener,noreferrer");
        setFeedback({
          ok: true,
          text: `Hypha opened and the document is on your clipboard. Keep ${d.title.slice(0, 24)}… in the title, and when the proposal exists, paste its URL back here with "Link the on-chain proposal". The chain reports outcomes by number, and that link is how the result finds its way home.`,
        });
      } else {
        setFeedback({
          ok: true,
          text: "Document copied. This village has no Hypha configured yet. A founder sets it under Admin → Game Mechanics → Hypha.",
        });
      }
    } catch {
      setFeedback({ ok: false, text: "Couldn't prepare the handoff. Try again." });
    }
  };

  const villageName = cfg?.project?.name ?? "";
  const categories = snapshot ? Array.from(new Set(snapshot.variables.map((v) => v.category))) : [];
  const backedIds = new Set((standing?.backed ?? []).filter((b) => b.kind === "support").map((b) => b.proposalId));
  const isAdminViewer = user?.role === "admin" || user?.role === "founder";
  const activeProposals = proposals.filter(
    (p) => p.status !== "withdrawn" && p.status !== "applied" && p.status !== "failed",
  );
  const settledProposals = proposals.filter(
    (p) => p.status === "withdrawn" || p.status === "applied" || p.status === "failed",
  );

  return (
    <Layout>
      <section className="bg-teal-deep text-white py-16">
        <div className="container max-w-3xl mx-auto px-4 text-center">
          <Scale className="w-8 h-8 text-amber mx-auto mb-3" />
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-3">Game Mechanics</h1>
          <p className="text-white/80 max-w-2xl mx-auto">
            Every rule this Game runs on, in the open, and yours to change. Adjust a dial to
            start a proposal; the village senses it here, the vote binds on Hypha, and every
            change lands on the permanent record.
            {villageName ? ` This is how ${villageName} plays.` : ""}
          </p>
        </div>
      </section>

      <section className="bg-stone-50 py-14">
        <div className="container max-w-3xl mx-auto px-4 space-y-12">
          {feedback && (
            <p
              role={feedback.ok ? "status" : "alert"}
              className={`text-sm rounded-lg px-4 py-2.5 ${feedback.ok ? "text-teal-deep bg-teal-deep/10" : "text-red-600 bg-red-50"}`}
            >
              {feedback.text}
            </p>
          )}
          {failed && (
            <p role="alert" className="text-center text-muted-foreground">
              The mechanics couldn't be loaded just now. Reload to try again.
            </p>
          )}
          {!snapshot && !failed && <p className="text-center text-muted-foreground">Loading the rules of the Game…</p>}

          {snapshot && (
            <>
              {/* 1 — The constitution */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Lock className="w-5 h-5 text-teal-deep" />
                  <h2 className="font-display text-2xl font-bold text-teal-deep">The Constitution</h2>
                </div>
                <p className="text-sm text-stone-600 mb-5 max-w-2xl">
                  These are enforced by the platform itself and cannot be changed by any vote,
                  admin, or founder. Everything below them is tunable <em>because</em> these are not.
                </p>
                <div className="grid sm:grid-cols-2 gap-3">
                  {snapshot.constitution.map((law) => (
                    <motion.div
                      key={law.title}
                      initial={{ opacity: 0, y: 8 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      className="bg-white rounded-xl border border-stone-200 p-4"
                    >
                      <h3 className="font-semibold text-stone-900 mb-1.5">{law.title}</h3>
                      <p className="text-sm text-stone-600 leading-relaxed">{law.plain}</p>
                      <p className="text-[11px] text-stone-400 mt-2 font-mono">{law.enforcedBy}</p>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* 2 — The dials, now editable */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <SlidersHorizontal className="w-5 h-5 text-teal-deep" />
                  <h2 className="font-display text-2xl font-bold text-teal-deep">The Dials</h2>
                </div>
                <p className="text-sm text-stone-600 mb-2 max-w-2xl">
                  Every tunable rule, grouped by the part of the Game it shapes.{" "}
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs align-middle">
                    <Users className="w-3 h-3" /> community
                  </span>{" "}
                  dials can be changed by proposal. Adjust one below to begin.{" "}
                  <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 text-stone-600 px-2 py-0.5 text-xs align-middle">
                    <Lock className="w-3 h-3" /> founder-held
                  </span>{" "}
                  dials stay with the founders. Every dial only ever moves within the bounds shown.
                </p>
                {!user && (
                  <p className="text-xs text-stone-500 mb-5">
                    Sign in to stage changes and propose. Reading is open to everyone.
                  </p>
                )}
                {standing?.denied && (
                  <p role="alert" className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5 inline-block">
                    A standing warning currently suspends your proposal rights. Talk to a steward.
                  </p>
                )}
                {standing && !standing.denied && !standing.qualified && (
                  <p className="text-xs text-stone-500 mb-5">
                    You can draft proposals; a qualified member's sponsorship opens them.
                    {standing.recognitionRequired > 0 &&
                      ` Full standing takes ${standing.recognitionRequired} earned recognition (you have ${standing.recognitionHeld}).`}
                  </p>
                )}
                <div className="space-y-3">
                  {categories.map((cat) => {
                    const vars = snapshot.variables.filter((v) => v.category === cat);
                    const open = !!openCategories[cat];
                    const tuned = vars.filter((v) => !v.isDefault).length;
                    const stagedHere = vars.filter((v) => staged[v.key] !== undefined).length;
                    return (
                      <div key={cat} className="bg-white rounded-xl border border-stone-200 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setOpenCategories((s) => ({ ...s, [cat]: !open }))}
                          aria-expanded={open}
                          className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-stone-50"
                        >
                          <span className="font-semibold text-stone-900">
                            {cat}
                            <span className="ml-2 text-xs font-normal text-stone-400">
                              {vars.length} dial{vars.length === 1 ? "" : "s"}
                              {tuned > 0 ? ` · ${tuned} village-tuned` : ""}
                              {stagedHere > 0 ? ` · ${stagedHere} staged` : ""}
                            </span>
                          </span>
                          <ChevronDown className={`w-4 h-4 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} />
                        </button>
                        {open && (
                          <ul className="divide-y divide-stone-100">
                            {vars.map((v) => {
                              const stagedValue = staged[v.key];
                              const editable = !!user && v.ring === "open" && !standing?.denied;
                              return (
                                <li key={v.key} className={`px-4 py-3 ${stagedValue !== undefined ? "bg-amber-50/40" : ""}`}>
                                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                    <span className="font-medium text-stone-900">{v.label}</span>
                                    <span className="text-teal-deep font-semibold">
                                      {displayValue(v, v.value)}
                                      {stagedValue !== undefined && (
                                        <span className="ml-2 text-amber-700 font-semibold">→ {displayValue(v, stagedValue)}</span>
                                      )}
                                      {!v.isDefault && stagedValue === undefined && (
                                        <span className="ml-2 text-[11px] font-normal text-teal-deep/70 align-middle">
                                          village-tuned · default {displayValue(v, v.default)}
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <p className="text-sm text-stone-600 mt-1 leading-relaxed">{v.description}</p>
                                  {editable && (
                                    <div className="mt-2 flex items-center gap-2">
                                      <DialEditor v={v} staged={stagedValue} onStage={stage} />
                                      {stagedValue !== undefined && (
                                        <button
                                          type="button"
                                          onClick={() => stage(v.key, undefined)}
                                          aria-label={`Unstage change to ${v.label}`}
                                          className="text-stone-400 hover:text-stone-600"
                                        >
                                          <X className="w-4 h-4" />
                                        </button>
                                      )}
                                    </div>
                                  )}
                                  <p className="text-[11px] text-stone-400 mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                    {v.ring === "open" ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-700">
                                        <Users className="w-3 h-3" /> community dial
                                      </span>
                                    ) : (
                                      <span className="inline-flex items-center gap-1">
                                        <Lock className="w-3 h-3" /> founder-held
                                      </span>
                                    )}
                                    {v.min != null && v.max != null && (
                                      <span>
                                        bounds {v.min}-{v.max}
                                      </span>
                                    )}
                                    {v.applyTiming === "cycle-close" && <span>changes take effect at the next cycle close</span>}
                                    <span className="font-mono">{v.key}</span>
                                  </p>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3 — Open proposals */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Megaphone className="w-5 h-5 text-teal-deep" />
                  <h2 className="font-display text-2xl font-bold text-teal-deep">Proposals</h2>
                </div>
                <p className="text-sm text-stone-600 mb-5 max-w-2xl">
                  Rule changes the village is weighing. Support gathers here
                  {standing && standing.supportThreshold > 0
                    ? ` (${standing.supportThreshold} supporter${standing.supportThreshold === 1 ? "" : "s"} sends one to the vote)`
                    : ""}
                  ; the binding vote happens on the village's Hypha, and a passed proposal is
                  applied and recorded on the amendment ledger.
                </p>
                {activeProposals.length === 0 && (
                  <p className="text-sm text-stone-500">
                    Nothing is being proposed right now. Adjust a community dial above to start.
                  </p>
                )}
                <div className="space-y-3">
                  {activeProposals.map((p) => {
                    // Proposer-only actions render for every signed-in member;
                    // the server answers an honest 403 for anyone else.
                    const status = statusChip(p.status);
                    return (
                      <div
                        key={p.id}
                        // The anchor a notification lands on. `scroll-mt-24`
                        // keeps it out from under the sticky header, which is
                        // SC 2.4.11 and not a preference.
                        id={`proposal-${p.id}`}
                        className="bg-white rounded-xl border border-stone-200 p-4 scroll-mt-24 focus:outline-none"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                          <h3 className="font-semibold text-stone-900">{p.title}</h3>
                          <span className="flex flex-wrap items-center gap-1.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
                            <BallotReturnChip proposal={p} />
                          </span>
                        </div>
                        <p className="text-xs text-stone-400 mb-2">
                          by {p.proposer} · {new Date(p.createdAt).toLocaleDateString()} · {p.supports} supporter
                          {p.supports === 1 ? "" : "s"}
                          {p.sponsors > 0 ? ` · sponsored` : ""}
                        </p>
                        <p className="text-sm text-stone-600 mb-3 leading-relaxed">{p.rationale}</p>
                        <BallotReturnNote proposal={p} />
                        <ul className="text-sm space-y-1 mb-3">
                          {p.changes.map((c) => (
                            <li key={c.key}>
                              <span className="text-stone-700">{c.label}:</span>{" "}
                              <span className="line-through text-stone-400">{c.fromDisplay}</span> →{" "}
                              <span className="font-semibold text-teal-deep">{c.toDisplay}</span>
                              {c.applyTiming === "cycle-close" && (
                                <span className="text-[11px] text-stone-400"> (at next cycle close)</span>
                              )}
                              {c.currentValue !== null && c.currentValue !== c.from && (
                                <span className="text-[11px] text-amber-700"> · baseline has since moved to {c.currentValue}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                        <div className="flex flex-wrap items-center gap-2">
                          {user && p.status === "open" && !backedIds.has(p.id) && (
                            <button
                              type="button"
                              onClick={() => act(`/api/game/mechanics/proposals/${p.id}/support`)}
                              className="text-sm bg-teal-deep text-white rounded-lg px-3 py-1.5 font-medium hover:bg-teal"
                            >
                              Support
                            </button>
                          )}
                          {user && p.status === "open" && backedIds.has(p.id) && (
                            <span className="text-xs text-emerald-700">You support this</span>
                          )}
                          {user && p.status === "draft" && standing?.qualified && (
                            <button
                              type="button"
                              onClick={() => act(`/api/game/mechanics/proposals/${p.id}/sponsor`)}
                              className="text-sm bg-teal-deep text-white rounded-lg px-3 py-1.5 font-medium hover:bg-teal"
                            >
                              Sponsor this draft
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => copyDocument(p.id)}
                            className="inline-flex items-center gap-1.5 text-sm text-teal-deep font-medium hover:underline"
                          >
                            <Copy className="w-3.5 h-3.5" /> Copy for Hypha
                          </button>
                          {(p.status === "open" || p.status === "to_hypha") && (
                            <button
                              type="button"
                              onClick={() => continueToHypha(p.id)}
                              className="inline-flex items-center gap-1.5 text-sm text-teal-deep font-medium hover:underline"
                            >
                              Continue to Hypha ↗
                            </button>
                          )}
                          {user && p.status === "open" && (
                            <button
                              type="button"
                              onClick={() => act(`/api/game/mechanics/proposals/${p.id}/to-hypha`)}
                              className="text-sm text-stone-600 hover:text-stone-900 hover:underline"
                              title="Proposer only: marks this as taken to Hypha for the binding vote"
                            >
                              I've taken it to Hypha
                            </button>
                          )}
                          {user && (p.status === "to_hypha" || p.status === "passed_claimed") && (
                            <button
                              type="button"
                              onClick={() => {
                                const url = window.prompt(
                                  p.hyphaProposalId
                                    ? `Linked to on-chain proposal #${p.hyphaProposalId}. Paste a corrected Hypha proposal URL to re-link:`
                                    : "Paste the Hypha proposal's URL (from your browser after creating it) so the on-chain vote can find this proposal:",
                                  p.hyphaProposalUrl ?? "",
                                );
                                if (url) act(`/api/game/mechanics/proposals/${p.id}/link-hypha`, { url });
                              }}
                              className={`text-sm font-medium hover:underline ${p.hyphaProposalId ? "text-emerald-700" : "text-amber-700"}`}
                              title="The chain reports outcomes by proposal number, not by title. This link is how the verified result finds its way home"
                            >
                              {p.hyphaProposalId
                                ? `On-chain #${p.hyphaProposalId} linked${p.hubLinkSynced ? " ✓" : " (hub sync pending, click to retry)"}`
                                : "Link the on-chain proposal"}
                            </button>
                          )}
                          {user && p.status === "to_hypha" && (
                            <button
                              type="button"
                              onClick={() => {
                                const ref = window.prompt(
                                  "It passed? Paste the Hypha proposal link (or id) so a steward can verify and apply:",
                                );
                                if (ref) act(`/api/game/mechanics/proposals/${p.id}/passed`, { ref });
                              }}
                              className="text-sm text-stone-600 hover:text-stone-900 hover:underline"
                            >
                              It passed on Hypha
                            </button>
                          )}
                          {isAdminViewer && (p.status === "to_hypha" || p.status === "passed_claimed" || p.status === "passed_verified") && (
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Apply "${p.title}" now? Verify it actually passed on Hypha first${p.hyphaRef ? ` (${p.hyphaRef})` : ""}. Every change lands on the public ledger under this proposal's reference.`,
                                  )
                                )
                                  act(`/api/admin/mechanics/proposals/${p.id}/apply`);
                              }}
                              className="text-sm bg-amber text-foreground rounded-lg px-3 py-1.5 font-medium"
                            >
                              Verify & apply
                            </button>
                          )}
                          {user && (p.status === "open" || p.status === "draft") && (
                            <button
                              type="button"
                              onClick={() => act(`/api/game/mechanics/proposals/${p.id}/withdraw`)}
                              className="text-sm text-stone-400 hover:text-red-600 hover:underline"
                              title="Proposer or admin only"
                            >
                              Withdraw
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {settledProposals.length > 0 && (
                  <details className="mt-4">
                    <summary className="text-sm text-stone-500 cursor-pointer">
                      {settledProposals.length} settled proposal{settledProposals.length === 1 ? "" : "s"} (applied,
                      withdrawn, or did not pass)
                    </summary>
                    <ul className="mt-2 space-y-1.5">
                      {settledProposals.map((p) => (
                        <li key={p.id} className="text-sm text-stone-500">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full mr-2 ${statusChip(p.status).cls}`}>
                            {statusChip(p.status).label}
                          </span>
                          {p.title} · by {p.proposer}
                          {p.ballotId && (
                            <>
                              {" · "}
                              <Link href={`/decisions/${p.ballotId}`} className="text-teal-deep hover:underline">
                                see its vote
                              </Link>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>

              {/* 4 — The amendment history */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ScrollText className="w-5 h-5 text-teal-deep" />
                  <h2 className="font-display text-2xl font-bold text-teal-deep">Amendment History</h2>
                </div>
                <p className="text-sm text-stone-600 mb-4 max-w-2xl">
                  Every change to the rules is on the permanent record: what moved, from what to
                  what, by whom, and under which passed proposal.
                </p>
                <button
                  type="button"
                  onClick={openHistory}
                  aria-expanded={historyOpen}
                  className="inline-flex items-center gap-2 bg-teal-deep text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-teal transition-colors"
                >
                  <ScrollText className="w-4 h-4" />
                  {historyOpen ? "Hide the history" : "Explore the history"}
                </button>
                {historyOpen && (
                  <div className="mt-4 bg-white rounded-xl border border-stone-200 overflow-hidden">
                    {history === null ? (
                      <p className="px-4 py-6 text-sm text-stone-500">Loading the record…</p>
                    ) : history.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-stone-500">
                        No rules have been changed yet. This Game still plays entirely by its platform defaults.
                      </p>
                    ) : (
                      <ul className="divide-y divide-stone-100">
                        {history.map((h) => (
                          <li key={h.id} className="px-4 py-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <span className="font-medium text-stone-900">{h.label}</span>
                              <span className="text-xs text-stone-400">
                                {new Date(h.at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                              </span>
                            </div>
                            <p className="text-sm text-stone-600 mt-0.5">
                              <span className="line-through text-stone-400">
                                {h.from ?? "default"}
                                {h.fromWasDefault ? " (default)" : ""}
                              </span>{" "}
                              → <span className="font-semibold text-teal-deep">{h.to ?? "default"}</span>
                              {h.toIsDefault ? " (back to default)" : ""}
                              {h.by ? ` · by ${h.by}` : ""}
                              {h.source === "governance" ? " · by passed proposal" : ""}
                              {h.source === "platform" ? " · platform migration" : ""}
                            </p>
                            {h.proposalRef && (
                              <p className="text-[11px] text-stone-400 mt-0.5 font-mono">proposal: {h.proposalRef}</p>
                            )}
                            {h.note && <p className="text-[11px] text-stone-400 mt-0.5">{h.note}</p>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* The proposal basket: staged changes become a proposal. Sticky above
          the mobile tab bar (z-[70] modal ladder, bar is z-50). */}
      {stagedCount > 0 && (
        <div className="fixed bottom-0 inset-x-0 z-[70] bg-white border-t border-stone-200 shadow-lg pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
          <div className="container max-w-3xl mx-auto px-4 pt-3">
            {!composerOpen ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm text-stone-700">
                  <span className="font-semibold">{stagedCount}</span> change{stagedCount === 1 ? "" : "s"} staged
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStaged({})}
                    className="text-sm text-stone-500 hover:text-stone-700 hover:underline"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={() => setComposerOpen(true)}
                    className="text-sm bg-teal-deep text-white rounded-lg px-4 py-2 font-medium hover:bg-teal"
                  >
                    Write the proposal
                  </button>
                </div>
              </div>
            ) : (
              <div className="pb-2">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-stone-900">Propose these changes</h3>
                  <button type="button" onClick={() => setComposerOpen(false)} aria-label="Collapse the composer">
                    <ChevronDown className="w-4 h-4 text-stone-400" />
                  </button>
                </div>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="A title the village will recognize it by"
                  aria-label="Proposal title"
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm mb-2"
                />
                <textarea
                  value={rationale}
                  onChange={(e) => setRationale(e.target.value)}
                  placeholder="Why this change matters. The village votes on reasons, not numbers."
                  aria-label="Proposal rationale"
                  rows={3}
                  className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm mb-2 resize-y"
                />
                {problems.length > 0 && (
                  <ul role="alert" className="text-xs text-red-600 mb-2 space-y-0.5">
                    {problems.map((p) => (
                      <li key={p.key}>
                        <span className="font-mono">{p.key}</span>: {p.problem}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={submitting || !title.trim() || !rationale.trim()}
                    onClick={submitProposal}
                    className="text-sm bg-teal-deep text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50"
                  >
                    {submitting ? "Proposing…" : standing?.qualified ? "Open the proposal" : "Save as draft"}
                  </button>
                  <span className="text-[11px] text-stone-400">
                    {standing?.qualified
                      ? "Opens for village support immediately."
                      : "A qualified member's sponsorship opens it."}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
