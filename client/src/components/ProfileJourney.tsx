import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Heart, ScrollText, ShieldCheck, Users } from "lucide-react";
import { authToken } from "@/lib/gameApi";

/**
 * S4: the member's journey in numbers, over three live endpoints that had no
 * page (/api/game/progression, /gratitude/flows, /ledger). Complements
 * GameDashboard (stage ladder, balance, next action) with the parts it does
 * not show: stage HISTORY, capabilities and roles held, recognition breadth,
 * per-cycle settlements, and the ledger provenance of every point of value.
 */

async function authedGet(path: string): Promise<any | null> {
  const token = authToken();
  if (!token) return null;
  try {
    const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

function prettySource(s: string): string {
  return String(s ?? "").replace(/[_:]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ProfileJourney() {
  const [prog, setProg] = useState<any | null>(null);
  const [flows, setFlows] = useState<any | null>(null);
  const [ledger, setLedger] = useState<any | null>(null);

  useEffect(() => {
    authedGet("/api/game/progression").then(setProg);
    authedGet("/api/game/gratitude/flows").then(setFlows);
    authedGet("/api/game/ledger").then(setLedger);
  }, []);

  if (!prog && !flows && !ledger) return null;

  return (
    <div className="space-y-8">
      {/* Progression: capabilities, roles, and the history of stage turns */}
      {prog && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-lg p-8"
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-5 h-5 text-teal-deep" />
            <h2 className="text-2xl font-display font-bold text-teal-deep">Your Progression</h2>
          </div>

          {(prog.capabilities?.length > 0 || prog.roles?.length > 0) && (
            <div className="flex flex-wrap gap-2 mb-5">
              {(prog.roles ?? []).map((r: string) => (
                <span key={r} className="inline-flex items-center gap-1 text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
                  <Users className="w-3 h-3" /> {prettySource(r)}
                </span>
              ))}
              {(prog.capabilities ?? []).map((c: string) => (
                <span key={c} className="inline-flex items-center gap-1 text-xs bg-teal-deep/10 text-teal-deep px-2.5 py-1 rounded-full font-mono" title="A capability your stage or a role grants you">
                  <ShieldCheck className="w-3 h-3" /> {c}
                </span>
              ))}
            </div>
          )}

          {(prog.history ?? []).length === 0 ? (
            <p className="text-sm text-gray-500">
              Your stage turns will be recorded here. Each one names what it unlocked.
            </p>
          ) : (
            <ol className="space-y-3">
              {prog.history.map((h: any, i: number) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <span className="mt-1.5 w-2 h-2 rounded-full bg-teal-deep shrink-0" />
                  <div>
                    <span className="font-medium text-gray-900">
                      {prettySource(h.fromStage)} → {prettySource(h.toStage)}
                    </span>
                    {h.reason && <span className="text-gray-500">: {h.reason}</span>}
                    {h.unlocked && (
                      <span className="block text-xs text-teal-deep mt-0.5">Unlocked: {h.unlocked}</span>
                    )}
                    <span className="block text-xs text-gray-400 mt-0.5">
                      {new Date(h.at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </motion.div>
      )}

      {/* Recognition flows: breadth over volume, and per-cycle settlements */}
      {flows && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-white rounded-2xl shadow-lg p-8"
        >
          <div className="flex items-center gap-2 mb-4">
            <Heart className="w-5 h-5 text-coral" />
            <h2 className="text-2xl font-display font-bold text-teal-deep">Recognition Flows</h2>
          </div>
          <div className="grid grid-cols-3 gap-4 mb-5">
            <div className="text-center bg-teal-deep/5 rounded-xl py-4">
              <p className="text-2xl font-display font-bold text-teal-deep">{flows.totals?.received ?? 0}</p>
              <p className="text-xs text-gray-500 mt-1">received</p>
            </div>
            <div className="text-center bg-teal-deep/5 rounded-xl py-4">
              <p className="text-2xl font-display font-bold text-teal-deep">{flows.totals?.sent ?? 0}</p>
              <p className="text-xs text-gray-500 mt-1">sent</p>
            </div>
            <div className="text-center bg-amber-50 rounded-xl py-4" title="How many different people have thanked you. Breadth is the real signal of community health">
              <p className="text-2xl font-display font-bold text-amber-700">{flows.totals?.distinctAcknowledgers ?? 0}</p>
              <p className="text-xs text-gray-600 mt-1">people thanked you</p>
            </div>
          </div>
          {(flows.byCycle ?? []).length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">By lunar cycle</p>
              <div className="space-y-1.5">
                {flows.byCycle.slice(0, 6).map((c: any) => (
                  <div key={c.cycleId} className="flex items-center justify-between text-sm border border-gray-100 rounded-lg px-3 py-2">
                    <span className="text-gray-500 font-mono text-xs">{c.cycleId}</span>
                    <span className="text-gray-700">
                      {c.received} received · {c.distinctSenders} sender{c.distinctSenders === 1 ? "" : "s"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* Ledger: where every point of value came from */}
      {ledger && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-2xl shadow-lg p-8"
        >
          <div className="flex items-center gap-2 mb-1">
            <ScrollText className="w-5 h-5 text-teal-deep" />
            <h2 className="text-2xl font-display font-bold text-teal-deep">Where It Came From</h2>
          </div>
          <p className="text-sm text-gray-500 mb-5">
            Every movement of {ledger.currency ?? "recognition"} on your account, from the ledger itself.
          </p>
          {(ledger.entries ?? []).length === 0 ? (
            <p className="text-sm text-gray-500">
              Nothing yet. Consented quests and received gratitude will appear here.
            </p>
          ) : (
            <div className="space-y-1.5">
              {ledger.entries.slice(0, 12).map((e: any, i: number) => (
                <div key={i} className="flex items-center justify-between gap-3 text-sm border border-gray-100 rounded-lg px-3 py-2">
                  <div className="min-w-0">
                    <span className="text-gray-800">{prettySource(e.source)}</span>
                    {e.description && (
                      <span className="block text-xs text-gray-400 truncate">{e.description}</span>
                    )}
                  </div>
                  <span className={`shrink-0 font-semibold ${e.amount < 0 ? "text-red-500" : "text-teal-deep"}`}>
                    {e.amount > 0 ? "+" : ""}{e.amount}
                  </span>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
