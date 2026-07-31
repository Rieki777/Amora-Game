/**
 * THE PUBLIC GAME MECHANICS PAGE (Game Mechanics initiative, 2026-07-31).
 *
 * Everything the game runs on, visible to everyone — members, visitors, and
 * people deciding which village's rules they want to live under. Three
 * layers, in reading order:
 *
 *   1. The constitution — the laws no vote can change, in plain language.
 *      Publishing what CANNOT move is what makes the dials below credible.
 *   2. The dials — every mechanic of every running module: current value,
 *      the platform default, the bounds governance must stay within, whether
 *      the community may govern it (ring), and when a change takes effect.
 *   3. The amendment history — every change ever made, by whom, under what
 *      authority. Behind a button; the record, not the headline.
 *
 * This page RENDERS /api/game/mechanics; it computes nothing and hardcodes
 * no rule, so it can never drift from the engine. The propose-a-change flow
 * (auto-crafted Hypha proposals) lands on top of this in the bridge phase.
 */
import Layout from "@/components/Layout";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Scale, SlidersHorizontal, ScrollText, ChevronDown, Lock, Users } from "lucide-react";
import { useGameConfig } from "@/lib/gameApi";

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

/** A stored value, shown the way a villager reads it, not the way it is stored. */
function displayValue(v: MechanicsVariable, raw: string): string {
  if (v.type === "boolean") return raw === "true" || raw === "1" ? "On" : "Off";
  if (v.type === "choice") {
    const c = v.choices?.find((c) => c.value === raw);
    return c?.label ?? raw;
  }
  if (raw === "" || raw == null) return "not set";
  return v.unit ? `${raw} ${v.unit}` : raw;
}

export default function GameMechanics() {
  const cfg = useGameConfig();
  const [snapshot, setSnapshot] = useState<MechanicsSnapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [history, setHistory] = useState<Amendment[] | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/game/mechanics")
      .then((r) => {
        if (!r.ok) throw new Error(`mechanics ${r.status}`);
        return r.json();
      })
      .then(setSnapshot)
      .catch(() => setFailed(true));
  }, []);

  const openHistory = () => {
    setHistoryOpen((v) => !v);
    if (history === null) {
      fetch("/api/game/mechanics/history")
        .then((r) => (r.ok ? r.json() : []))
        .then((d) => setHistory(Array.isArray(d) ? d : []))
        .catch(() => setHistory([]));
    }
  };

  const villageName = cfg?.project?.name ?? "";
  // Array.from, not spread: the build target predates Set iteration.
  const categories = snapshot
    ? Array.from(new Set(snapshot.variables.map((v) => v.category)))
    : [];

  return (
    <Layout>
      <section className="bg-teal-deep text-white py-16">
        <div className="container max-w-3xl mx-auto px-4 text-center">
          <Scale className="w-8 h-8 text-amber mx-auto mb-3" />
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-3">Game Mechanics</h1>
          <p className="text-white/80 max-w-2xl mx-auto">
            Every rule this game runs on, in the open: the laws that never change, the dials the
            village can tune, and the record of every change ever made.
            {villageName ? ` This is how ${villageName} plays.` : ""}
          </p>
        </div>
      </section>

      <section className="bg-stone-50 py-14">
        <div className="container max-w-3xl mx-auto px-4 space-y-12">
          {failed && (
            <p role="alert" className="text-center text-muted-foreground">
              The mechanics couldn't be loaded just now — reload to try again.
            </p>
          )}
          {!snapshot && !failed && (
            <p className="text-center text-muted-foreground">Loading the rules of the game…</p>
          )}

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

              {/* 2 — The dials */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <SlidersHorizontal className="w-5 h-5 text-teal-deep" />
                  <h2 className="font-display text-2xl font-bold text-teal-deep">The Dials</h2>
                </div>
                <p className="text-sm text-stone-600 mb-2 max-w-2xl">
                  Every tunable rule, grouped by the part of the game it shapes.{" "}
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2 py-0.5 text-xs align-middle">
                    <Users className="w-3 h-3" /> community
                  </span>{" "}
                  dials are the village's to govern together;{" "}
                  <span className="inline-flex items-center gap-1 rounded-full bg-stone-100 text-stone-600 px-2 py-0.5 text-xs align-middle">
                    <Lock className="w-3 h-3" /> founder-held
                  </span>{" "}
                  dials (infrastructure, legal posture, safety limits) stay with the founders. Each
                  dial can only ever move within the bounds shown — the bounds themselves are part
                  of the constitution.
                </p>
                <p className="text-xs text-stone-500 mb-5">
                  A value marked <span className="font-medium text-teal-deep">village-tuned</span>{" "}
                  differs from the platform default this game shipped with.
                </p>
                <div className="space-y-3">
                  {categories.map((cat) => {
                    const vars = snapshot.variables.filter((v) => v.category === cat);
                    const open = !!openCategories[cat];
                    const tuned = vars.filter((v) => !v.isDefault).length;
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
                            </span>
                          </span>
                          <ChevronDown
                            className={`w-4 h-4 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`}
                          />
                        </button>
                        {open && (
                          <ul className="divide-y divide-stone-100">
                            {vars.map((v) => (
                              <li key={v.key} className="px-4 py-3">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                                  <span className="font-medium text-stone-900">{v.label}</span>
                                  <span className="text-teal-deep font-semibold">
                                    {displayValue(v, v.value)}
                                    {!v.isDefault && (
                                      <span className="ml-2 text-[11px] font-normal text-teal-deep/70 align-middle">
                                        village-tuned · default {displayValue(v, v.default)}
                                      </span>
                                    )}
                                  </span>
                                </div>
                                <p className="text-sm text-stone-600 mt-1 leading-relaxed">{v.description}</p>
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
                                      bounds {v.min}–{v.max}
                                    </span>
                                  )}
                                  {v.applyTiming === "cycle-close" && <span>changes take effect at the next cycle close</span>}
                                  <span className="font-mono">{v.key}</span>
                                </p>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3 — The amendment history */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ScrollText className="w-5 h-5 text-teal-deep" />
                  <h2 className="font-display text-2xl font-bold text-teal-deep">Amendment History</h2>
                </div>
                <p className="text-sm text-stone-600 mb-4 max-w-2xl">
                  Every change to the rules is on the permanent record: what moved, from what to
                  what, by whom, and — once village governance runs through Hypha — under which
                  passed proposal.
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
                        No rules have been changed yet — this game still plays entirely by its
                        platform defaults.
                      </p>
                    ) : (
                      <ul className="divide-y divide-stone-100">
                        {history.map((h) => (
                          <li key={h.id} className="px-4 py-3">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                              <span className="font-medium text-stone-900">{h.label}</span>
                              <span className="text-xs text-stone-400">
                                {new Date(h.at).toLocaleDateString(undefined, {
                                  year: "numeric",
                                  month: "short",
                                  day: "numeric",
                                })}
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
    </Layout>
  );
}
