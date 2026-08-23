/**
 * Journey to Launch (S64): the live answer to "what stands between this
 * village and opening its doors?"
 *
 * This page renders shared/launchRequirements.ts resolved by the server —
 * it INVENTS nothing. Every item is either observed live (a key exists, an
 * admin has a login) or confirmed by a named human (DNS pointed, backup
 * drilled). Each one says why it matters and links to the exact surface
 * that fixes it. When every blocking item reads done, a founder — and only
 * a founder — marks the village launched, once.
 *
 * The page this replaced was Amora's six-week build tracker; it lives on,
 * whole, at /project-history. The split is the point: a village's launch
 * readiness is generic and alive, a project's delivery history is specific
 * and finished, and merging them is how the old page drifted into being
 * neither.
 */
import Layout from "@/components/Layout";
import MicButton from "@/components/MicButton";
import { EconomicsView } from "@/pages/ProjectHistory";
import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { authToken } from "@/lib/gameApi";
import {
  Check,
  ChevronRight,
  CircleDashed,
  ExternalLink,
  History,
  Loader2,
  Lock,
  MessageCircle,
  Rocket,
  Send,
  TreePine,
  TriangleAlert,
} from "lucide-react";
import type { LaunchGroup } from "@shared/launchRequirements";

/**
 * S65: the launch guide. Same brain as the Work With Us guide, different
 * hat: she reads the SAME live checklist this page renders and walks an
 * admin through what remains, item by item. Paths she mentions become
 * links. Absent an Anthropic key she simply isn't here — the checklist
 * carries the whole story on its own.
 */
function LaunchGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Two hats, one panel. "launch" reads the live readiness checklist;
  // "organize" (S70) reads the village's own second brain first, then the
  // shipped practitioner corpus — and shows which shelves she consulted.
  const [mode, setMode] = useState<"launch" | "organize">("launch");
  const GREETINGS: Record<string, string> = {
    launch: "I can see exactly where your launch stands. Want to start with what's blocking, or shall I walk the whole journey with you?",
    organize: "Ask me about organizing: governance, conflict, membership, legal shells, internal economics. Your village's own calls outrank the books when they speak to it.",
  };
  const [threads, setThreads] = useState<Record<string, Array<{ role: "user" | "assistant"; content: string; consulted?: any }>>>({
    launch: [{ role: "assistant", content: GREETINGS.launch }],
    organize: [{ role: "assistant", content: GREETINGS.organize }],
  });
  const msgs = threads[mode];
  const setMsgs = (fn: (m: typeof msgs) => typeof msgs) =>
    setThreads((t) => ({ ...t, [mode]: fn(t[mode]) }));
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);

  const send = () => {
    const content = draft.trim();
    if (!content || busy) return;
    const next = [...msgs, { role: "user" as const, content }];
    setMsgs(() => next);
    setDraft("");
    setBusy(true);
    fetch(mode === "launch" ? "/api/admin/assistant/launch" : "/api/admin/assistant/organize", {
      method: "POST", headers: headers(), body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (r.status === 503) { setGone(true); return; }
        if (!r.ok) throw new Error(d.message ?? d.error ?? "failed");
        setMsgs((m) => [...m, { role: "assistant", content: d.reply, consulted: d.consulted }]);
      })
      .catch(() => setMsgs((m) => [...m, { role: "assistant", content: "Something hiccuped. Ask me that again?" }]))
      .finally(() => setBusy(false));
  };

  // Turn any /admin?tab=… or /route path she mentions into a real link.
  const linkify = (text: string) =>
    text.split(/(\/(?:admin\?tab=[a-z-]+|[a-z-]+(?:\/[a-z-]+)*))(?=[\s.,)]|$)/g).map((part, i) =>
      part.startsWith("/") ? (
        <Link key={i} href={part} className="text-[#2D5A5A] font-medium underline">{part}</Link>
      ) : (
        <span key={i}>{part}</span>
      ),
    );

  if (!open) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(24rem,calc(100vw-2rem))] bg-white border border-stone-200 rounded-2xl shadow-2xl flex flex-col max-h-[70vh]">
      <header className="px-4 py-3 border-b border-stone-100 flex items-center justify-between gap-2">
        <div className="flex gap-1">
          <button onClick={() => setMode("launch")}
            className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 ${mode === "launch" ? "bg-[#2D5A5A] text-white" : "text-stone-500 hover:bg-stone-100"}`}>
            Launch
          </button>
          <button onClick={() => setMode("organize")}
            className={`text-xs font-semibold rounded-lg px-2.5 py-1.5 ${mode === "organize" ? "bg-[#2D5A5A] text-white" : "text-stone-500 hover:bg-stone-100"}`}>
            Organizing
          </button>
        </div>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-sm">Close</button>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {gone ? (
          <p className="text-xs text-stone-500">
            The guide needs an Anthropic key. Set one in{" "}
            <Link href="/admin?tab=integrations" className="text-[#2D5A5A] underline">Integrations</Link>.
            The checklist above works fine without her.
          </p>
        ) : (
          msgs.map((m, i) => (
            <div key={i} className={`text-sm rounded-xl px-3 py-2 max-w-[85%] ${
              m.role === "user" ? "ml-auto bg-[#2D5A5A] text-white" : "bg-stone-100 text-stone-800"
            }`}>
              {m.role === "assistant" ? linkify(m.content) : m.content}
              {m.consulted
                && (m.consulted.ownRecord?.length > 0
                  || m.consulted.references?.length > 0
                  || m.consulted.readers?.length > 0) && (
                <p className="text-[10px] text-stone-400 mt-1.5 border-t border-stone-200 pt-1">
                  {m.consulted.ownRecord?.length > 0 && <>Your calls: {m.consulted.ownRecord.join("; ")}. </>}
                  {/* Optional-chained on purpose: a reply cached before the
                      readers shipped carries no `readers` key at all. */}
                  {m.consulted.readers?.length > 0 && <>Read from the village record: {m.consulted.readers.join("; ")}. </>}
                  {m.consulted.references?.length > 0 && <>References: {m.consulted.references.join("; ")}.</>}
                </p>
              )}
            </div>
          ))
        )}
        {busy && <Loader2 className="w-4 h-4 animate-spin text-stone-400" />}
      </div>
      {!gone && (
        <div className="p-3 border-t border-stone-100 flex gap-2">
          <MicButton onText={(t) => setDraft((v) => (v ? v.replace(/\s*$/, " ") : "") + t)} disabled={busy} className="!rounded-lg" />
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder="Ask about any step…"
            className="flex-1 text-sm border border-stone-200 rounded-lg px-3 py-2"
          />
          <button onClick={send} disabled={busy || !draft.trim()}
            className="bg-[#2D5A5A] text-white rounded-lg px-3 py-2 disabled:opacity-40">
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * THE SECTION EACH REQUIREMENT SITS IN.
 *
 * The authority is `LaunchGroup` in `shared/launchRequirements.ts`, which is
 * the same file this page renders and is in this one TypeScript program.
 * Typing both of these against that union rather than `string` is the fix
 * with no runtime cost: a sixth group added there turns GROUP_META red at
 * `pnpm check`, and GROUP_ORDER can no longer name a group that does not
 * exist.
 *
 * The compiler still cannot force GROUP_ORDER to be COMPLETE, and a group
 * missing from it took its whole section off the page silently, with no
 * blocking requirement in it visible anywhere and nothing on screen saying so.
 * This is the launch checklist, so a requirement that is invisible is a
 * village that thinks it is ready. `leftoverGroups` below renders whatever the
 * server sent that this list does not name.
 */
const GROUP_META: Record<LaunchGroup, { title: string; blurb: string }> = {
  identity: { title: "Who runs this village", blurb: "Named admins, attributable acts: the platform's oldest requirement." },
  brand: { title: "Make it yours", blurb: "The name, the words, the images. A fork stops being a template here." },
  integrations: { title: "Connections", blurb: "Third-party keys, each honest about what stops without it." },
  modules: { title: "What your village runs", blurb: "Everything ships off; opening each part is a decision." },
  reach: { title: "Being reachable", blurb: "Domain, deliverability, and the drills only a human can do." },
};
const GROUP_ORDER: LaunchGroup[] = ["identity", "brand", "integrations", "modules", "reach"];

/** A section for a group this build has not been taught, named as itself. */
const groupMeta = (g: string): { title: string; blurb: string } =>
  GROUP_META[g as LaunchGroup] ?? {
    title: String(g || "Other"),
    blurb: "These came from a newer server than this page. They still count towards launch.",
  };

/**
 * Every group the server actually sent that GROUP_ORDER does not name, in the
 * order they arrived. Empty on every build whose list is current, which is why
 * nothing about the page changes until the day it would otherwise have gone
 * quiet.
 */
const leftoverGroups = (items: Array<{ group?: string }>): string[] => {
  const known = new Set<string>(GROUP_ORDER);
  const extra: string[] = [];
  for (const i of items) {
    const g = String(i.group ?? "");
    if (g && !known.has(g)) {
      known.add(g);
      extra.push(g);
    }
  }
  return extra;
};

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

function StatePill({ state, severity }: { state: string; severity: string }) {
  if (state === "ok") {
    return (
      <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center">
        <Check className="w-3.5 h-3.5 text-emerald-700" />
      </span>
    );
  }
  if (severity === "blocking") {
    return (
      <span className="shrink-0 w-6 h-6 rounded-full bg-red-50 border border-red-300 flex items-center justify-center">
        <TriangleAlert className="w-3.5 h-3.5 text-red-600" />
      </span>
    );
  }
  return (
    <span className="shrink-0 w-6 h-6 rounded-full bg-stone-100 border border-stone-300 flex items-center justify-center">
      <CircleDashed className="w-3.5 h-3.5 text-stone-500" />
    </span>
  );
}

export default function JourneyToLaunch() {
  const { user, loading } = useAuth();
  const isAdmin = !!user && (user.role === "admin" || user.role === "founder");
  const [status, setStatus] = useState<any>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState("");
  const [view, setView] = useState<"launch" | "economics">("launch");
  const [guideOpen, setGuideOpen] = useState(false);

  const load = useCallback(() => {
    fetch("/api/admin/launch", { headers: headers() })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { setStatus(d); setFailed(false); })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const confirm = (id: string, done: boolean) => {
    setBusy(id);
    fetch("/api/admin/launch/confirm", {
      method: "POST", headers: headers(), body: JSON.stringify({ id, done }),
    })
      .then((r) => r.json())
      .then((d) => { if (d.status) setStatus(d.status); else load(); })
      .finally(() => setBusy(""));
  };

  const launch = () => {
    if (!window.confirm("Mark this village launched? This is one-way: the launch banner retires and this page becomes a checklist you have completed.")) return;
    setBusy("launch");
    fetch("/api/admin/launch/launched", { method: "POST", headers: headers() })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.message ?? d.error ?? "Refused");
        load();
      })
      .catch((e) => window.alert(e.message))
      .finally(() => setBusy(""));
  };

  // ── Gate: same posture as the old page — admins walk in, others are told. ──
  if (loading) return <Layout><div className="py-24 text-center text-muted-foreground">Checking your access…</div></Layout>;
  if (!isAdmin) {
    return (
      <Layout>
        <div className="py-24 flex justify-center px-4">
          <div className="bg-card border border-border rounded-2xl p-8 max-w-sm w-full text-center">
            <div className="w-12 h-12 bg-teal-deep/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <Lock className="w-6 h-6 text-teal-deep" />
            </div>
            <h1 className="font-display text-xl font-bold text-foreground mb-1">Journey to Launch</h1>
            <p className="text-sm text-muted-foreground mb-5">
              {user ? `Signed in as ${user.name}, but this area is for the team running the village.` : "This area is for the team running the village."}
            </p>
            <a href="/admin" className="block w-full bg-[#2D5A5A] text-white py-3 rounded-xl font-semibold text-sm">
              Sign in with an admin account
            </a>
          </div>
        </div>
      </Layout>
    );
  }

  const items: any[] = status?.items ?? [];
  const done = items.filter((i) => i.state === "ok").length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const launched = !!status?.launchedAt;

  return (
    <Layout>
      {/* ── Header ── */}
      <div className="bg-teal-band text-white py-8">
        <div className="container">
          <div className="flex items-center gap-3 mb-2">
            <TreePine className="w-6 h-6 text-amber-on-band" />
            <span className="text-amber-on-band font-medium text-sm tracking-widest uppercase">
              {launched ? "Launched" : "Journey to Launch"}
            </span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold mb-2">
            {launched ? "This village is live" : "Everything between here and open doors"}
          </h1>
          <p className="text-white text-sm max-w-2xl mb-6">
            {launched
              ? `Marked launched ${new Date(status.launchedAt).toLocaleDateString()}. This checklist stays as the record of what that took.`
              : "Live status, not a to-do list someone forgot to update: every item below is either observed by the server right now, or confirmed by a named admin."}
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-white text-xs">Readiness</span>
            <div className="flex-1 max-w-xs bg-white/20 rounded-full h-2 min-w-24">
              <div className="bg-amber h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-amber-on-band text-sm font-semibold">{pct}%</span>
            {status && !launched && (
              <span className="text-white text-xs">
                {status.blockingOpen} blocking · {status.recommendedOpen} recommended remaining
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mt-5">
            <button
              onClick={() => setView("launch")}
              className={`text-sm rounded-lg px-3 py-1.5 font-medium ${view === "launch" ? "bg-amber text-foreground" : "bg-white/10 text-white"}`}
            >
              Launch readiness
            </button>
            <button
              onClick={() => setView("economics")}
              className={`text-sm rounded-lg px-3 py-1.5 font-medium ${view === "economics" ? "bg-amber text-foreground" : "bg-white/10 text-white"}`}
            >
              Village economics
            </button>
            <Link
              href="/project-history"
              className="inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 font-medium bg-white/10 text-white hover:bg-white/20"
            >
              <History className="w-3.5 h-3.5" /> Project history
            </Link>
            {!launched && (
              <button
                onClick={() => setGuideOpen(true)}
                className="inline-flex items-center gap-1.5 text-sm rounded-lg px-3 py-1.5 font-medium bg-white/10 text-white hover:bg-white/20"
              >
                <MessageCircle className="w-3.5 h-3.5" /> Ask the guide
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-stone-50 min-h-screen py-8">
        <div className="container max-w-3xl space-y-6">
          {view === "economics" ? (
            <EconomicsView headers={(extra) => ({ ...headers(), ...(extra ?? {}) })} />
          ) : failed ? (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-3">
              Could not load launch status. Sign in again, or check the server.
            </p>
          ) : !status ? (
            <p className="text-sm text-muted-foreground py-12 text-center">Reading the village's pulse…</p>
          ) : (
            <>
              {[...GROUP_ORDER, ...leftoverGroups(items)].map((g) => {
                const group = items.filter((i) => i.group === g);
                if (group.length === 0) return null;
                const meta = groupMeta(g);
                return (
                  <section key={g} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <header className="px-5 pt-4 pb-3 border-b border-stone-100">
                      <h2 className="font-semibold text-stone-900">{meta.title}</h2>
                      <p className="text-xs text-stone-500">{meta.blurb}</p>
                    </header>
                    <ul className="divide-y divide-stone-100">
                      {group.map((i) => (
                        <li key={i.id} className="px-5 py-4 flex gap-3">
                          <StatePill state={i.state} severity={i.severity} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-stone-900">{i.title}</p>
                              {i.severity === "blocking" && i.state !== "ok" && (
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-red-700 bg-red-50 border border-red-200 rounded-full px-2 py-0.5">
                                  blocks launch
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-stone-500 mt-0.5">{i.why}</p>
                            <p className={`text-xs mt-1.5 ${i.state === "ok" ? "text-emerald-700" : "text-stone-600"}`}>
                              {i.detail}
                              {i.confirmedAt && ` · ${new Date(i.confirmedAt).toLocaleDateString()}`}
                            </p>
                            <div className="flex items-center gap-3 mt-2">
                              {i.fixAt.startsWith("http") ? (
                                <a href={i.fixAt} target="_blank" rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-medium text-[#2D5A5A] hover:underline">
                                  {i.fixLabel} <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <Link href={i.fixAt}
                                  className="inline-flex items-center gap-1 text-xs font-medium text-[#2D5A5A] hover:underline">
                                  {i.fixLabel} <ChevronRight className="w-3 h-3" />
                                </Link>
                              )}
                              {i.checkKey.startsWith("manual:") && (
                                <button
                                  onClick={() => confirm(i.id, i.state !== "ok")}
                                  disabled={busy === i.id}
                                  className={`text-xs font-medium rounded-lg px-2.5 py-1 border ${
                                    i.state === "ok"
                                      ? "text-stone-500 border-stone-200 hover:bg-stone-50"
                                      : "text-white bg-[#2D5A5A] border-[#2D5A5A]"
                                  }`}
                                >
                                  {i.state === "ok" ? "Un-confirm" : "Mark done"}
                                </button>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}

              {/* ── The act itself ── */}
              {!launched && (
                <section className={`rounded-xl border p-5 ${status.readyToLaunch ? "bg-[#2D5A5A]/5 border-[#2D5A5A]/30" : "bg-white border-stone-200"}`}>
                  <div className="flex items-center gap-3 flex-wrap justify-between">
                    <div>
                      <p className="font-semibold text-stone-900 flex items-center gap-2">
                        <Rocket className="w-4 h-4 text-[#2D5A5A]" /> Mark the village launched
                      </p>
                      <p className="text-xs text-stone-500 mt-1 max-w-md">
                        {status.readyToLaunch
                          ? "Every blocking item reads done. This is a founder's act, recorded and one-way. The admin banner retires with it."
                          : `${status.blockingOpen} blocking item(s) still open. The button unlocks when they read done.`}
                      </p>
                    </div>
                    <button
                      onClick={launch}
                      disabled={!status.readyToLaunch || user?.role !== "founder" || busy === "launch"}
                      title={user?.role !== "founder" ? "Only a founder can mark the village launched" : undefined}
                      className="text-sm bg-[#2D5A5A] text-white rounded-lg px-5 py-2.5 font-semibold disabled:opacity-40"
                    >
                      Launch
                    </button>
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
      <LaunchGuide open={guideOpen} onClose={() => setGuideOpen(false)} />
    </Layout>
  );
}
