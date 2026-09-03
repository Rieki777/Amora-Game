import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { TrendingUp, Heart, ScrollText, ShieldCheck, Users } from "lucide-react";
import { authToken } from "@/lib/gameApi";
import Celebration from "@/components/natural/Celebration";
import BreathingLoader from "@/components/natural/BreathingLoader";
import { useMomentWindow } from "@/components/natural/moments";
import { capabilityLabel } from "@shared/capabilities";
import { villageMoonLabel } from "@shared/villageMoon";
import { claimMoment } from "@/lib/celebrated";
import { playMoment } from "@/lib/sound";

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

/**
 * A BLOSSOM FOR BEING THANKED, and the restraint that keeps it worth seeing.
 *
 * Two things arrive as `gratitude` and only one of them is rare. A written
 * acknowledgment has to carry a message, so receiving one is somebody sitting
 * down and saying why. (This comment used to add "capped at ONE per sender per
 * recipient per lunar cycle". R73 retired that cap: a count cap bounded how
 * OFTEN one member acknowledged another and never how MUCH, so it is a share
 * of the giver's allowance now and the same person can be thanked twice. The
 * bloom's rarity was never resting on it: the two guards below are what hold
 * it.) A heart is a tap on a forum post, five per sender per cycle,
 * and `feed.hearts_on_wall` already defaults false on the reasoning that a
 * tap is a gesture. Celebrating the tap would spend the bloom on the cheaper
 * thing within a week, so `kind === "heart"` is filtered out here and gets
 * nothing.
 *
 * ONE PER VISIT, AT MOST. Only the newest unseen acknowledgment is offered,
 * so a member returning after ten thank-yous sees one bloom rather than ten.
 * `claimMoment` then holds it to once ever for that entry.
 */
function useGratitudeBloom(): { name: string; message: string } | null {
  const [bloom, setBloom] = useState<{ name: string; message: string } | null>(null);

  useEffect(() => {
    let live = true;
    authedGet("/api/game/gratitude/me").then((data) => {
      if (!live || !data) return;
      const newest = (data.received ?? []).find((g: any) => g?.kind !== "heart");
      if (!newest?.id || !claimMoment(`gratitude:${newest.id}`)) return;
      setBloom({ name: String(newest.fromName ?? "Someone"), message: String(newest.message ?? "") });
      playMoment("gratitude", "tap");
    });
    return () => {
      live = false;
    };
  }, []);

  return bloom;
}

/**
 * THE FIRST TIME, THREE TIMES, FOR ONE PERSON.
 *
 * Stage crossings are recorded and shown. These three are the moments the
 * engine has always been able to answer and nobody ever asked it for: the
 * first vote somebody cast, the first objection they named, the first seat
 * they held. All derived on the read, none stored, and exact rather than
 * approximate (`cast_at` does not move when a vote is changed).
 *
 * R55, and this surface is where it would be easiest to break. There is no
 * count of anything, no total, no streak, no "you have voted in 3 of 11", and
 * no comparison with another member. It says WHEN, and only for the reader.
 * A member who has done none of these gets no section at all rather than
 * three empty rows, and a member who has done one gets that one: an absence
 * here is a person early in their own story and never a person behind.
 *
 * Deliberately not a badge. Badges are public artefacts and these are private
 * milestones; putting one through the other is how a first vote turns into
 * something members can rank each other by.
 */
function FirstTimes({ firsts }: { firsts?: { vote?: string | null; objection?: string | null; seat?: string | null } | null }) {
  const rows = [
    { key: "vote", label: "The first time you voted", at: firsts?.vote },
    { key: "objection", label: "The first objection you named", at: firsts?.objection },
    { key: "seat", label: "The first seat you held", at: firsts?.seat },
  ].filter((r) => !!r.at);
  if (rows.length === 0) return null;
  return (
    <div className="mb-5 border-b border-gray-100 pb-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">The first time</p>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-start gap-3 text-sm">
            <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-400 shrink-0" />
            <span>
              <span className="text-gray-900">{r.label}</span>
              <span className="block text-xs text-gray-400 mt-0.5">
                {new Date(String(r.at)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function ProfileJourney() {
  const [prog, setProg] = useState<any | null>(null);
  const [flows, setFlows] = useState<any | null>(null);
  const [ledger, setLedger] = useState<any | null>(null);
  const bloom = useGratitudeBloom();
  const blooming = useMomentWindow(bloom !== null);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    Promise.all([
      authedGet("/api/game/progression").then(setProg),
      authedGet("/api/game/gratitude/flows").then(setFlows),
      authedGet("/api/game/ledger").then(setLedger),
    ]).finally(() => setSettled(true));
  }, []);

  // Waiting, said as a breath. The page showed nothing at all until all three
  // reads landed, which on a slow connection is a profile that looks empty
  // and then fills. `settled` is what keeps this from becoming a permanent
  // loader for a signed-out reader, whose three reads resolve to null.
  if (!settled) {
    return (
      <div className="flex justify-center py-12">
        <BreathingLoader label="Reading your journey" size={44} showLabel />
      </div>
    );
  }

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
              {/* WHAT A MEMBER CAN DO, IN WORDS. These rendered the raw keys,
                  in monospace, under a heading promising to say what somebody
                  had unlocked: eleven chips reading `map.viewPeople` and
                  `forum.post` at a person who has never seen a capability key
                  and never should. `capabilityLabel` is the same function the
                  stage-crossing line two blocks down already uses for exactly
                  this, so the page held the answer and used it in one place
                  out of two. The key stays as the title, for the one reader
                  who wants it. */}
              {(prog.capabilities ?? []).map((c: string) => (
                <span key={c} className="inline-flex items-center gap-1 text-xs bg-teal-deep/10 text-teal-deep px-2.5 py-1 rounded-full" title={c}>
                  <ShieldCheck className="w-3 h-3" /> {capabilityLabel(c)}
                </span>
              ))}
            </div>
          )}

          <FirstTimes firsts={prog.firsts} />

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
                    {/* An array interpolated straight into JSX rendered as
                        `forum.post,message.send`. The same labels the stage
                        celebration reads turn it back into language. */}
                    {Array.isArray(h.unlocked) && h.unlocked.length > 0 && (
                      <span className="block text-xs text-teal-deep mt-0.5">
                        Unlocked: {h.unlocked.map(capabilityLabel).join(", ")}
                      </span>
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
            {blooming && bloom && (
              <span className="ml-auto shrink-0">
                <Celebration
                  kind="blossom"
                  intensity="moment"
                  size={64}
                  message={`${bloom.name} thanked you.`}
                />
              </span>
            )}
          </div>
          {bloom && (
            <div className="mb-5 rounded-xl border border-coral/30 bg-coral/5 px-4 py-3">
              <p className="text-sm font-semibold text-gray-900">{bloom.name} thanked you</p>
              {bloom.message && <p className="text-sm text-gray-600 mt-0.5">{bloom.message}</p>}
            </div>
          )}
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
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">By moon</p>
              <div className="space-y-1.5">
                {/*
                  The row is keyed by the stored cycle id and LABELLED by the
                  village's own moon. A key is machinery and a label is a
                  sentence to a member; this row used to print the key.
                */}
                {flows.byCycle.slice(0, 6).map((c: any) => (
                  <div key={c.cycleId} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-sm border border-gray-100 rounded-lg px-3 py-2">
                    {/*
                      A row whose stored id this build cannot place gets no
                      moon, and the honest thing to print there is that it has
                      none. The old id in its place would be a leak, and a
                      blank span would read as a rendering fault.
                    */}
                    <span className="text-gray-500 text-xs">{villageMoonLabel(c.moon) || "Moon not known"}</span>
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
                    <span className="text-gray-800">
                      {prettySource(e.source)}
                      {/* 0092: a send names the other person. Without it the
                          line reads as a bare number with a caption and no
                          counterpart, on the one surface whose job is to make
                          a balance explainable. */}
                      {e.withName && (
                        <span className="text-gray-500">{e.amount < 0 ? ` to ${e.withName}` : ` from ${e.withName}`}</span>
                      )}
                    </span>
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
