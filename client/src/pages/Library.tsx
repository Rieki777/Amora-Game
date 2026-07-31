/**
 * The Material Library (S41-S46): borrow the village's shared tools and
 * goods on library credits. Donate an item to earn credits; a deposit sits
 * in escrow while something is out and comes back at return, minus wear.
 */
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import { useEffect, useState } from "react";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { useAuth } from "@/contexts/AuthContext";
import { authToken } from "@/lib/gameApi";
import { Package, RotateCcw, Undo2, Wrench } from "lucide-react";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

const STATUS_LABEL: Record<string, string> = {
  available: "available",
  checked_out: "out on loan",
  written_off: "retired",
};

export default function Library() {
  const modules = useModules();
  const libraryModule = useModule("library");
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = () => {
    fetch("/api/library", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  };
  useEffect(() => { if (libraryModule) load(); }, [libraryModule?.id]);

  if (modules.loaded && !libraryModule) return <NotFound />;

  const call = (path: string, body?: any) => {
    setError(""); setNotice("");
    fetch(path, { method: "POST", headers: headers(), body: JSON.stringify(body ?? {}) })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Request failed");
        if (d.escrow != null) setNotice(`Reserved — ${d.escrow} credit(s) moved to escrow until settle.`);
        if (d.released != null) setNotice(`Cancelled — ${d.released} credit(s) released back to you.`);
        load();
      })
      .catch((e) => setError(e.message));
  };

  const visibleItems = (data?.items ?? []).filter((i: any) => i.status !== "written_off");
  const liveLoans = (data?.mine?.loans ?? []).filter((l: any) => !l.settledAt);
  const itemName = (id: string) => (data?.items ?? []).find((i: any) => i.id === id)?.name ?? id;

  return (
    <Layout>
      <section className="py-12 bg-gradient-to-b from-teal-deep/5 to-background">
        <div className="container text-center">
          <h1 className="font-display text-4xl font-bold text-foreground mb-3">Material Library</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Shared tools and goods, borrowed on library credits. Donate what you
            no longer need and earn the credits to borrow what you do.
          </p>
        </div>
      </section>

      <section className="py-8 bg-background">
        <div className="container max-w-3xl space-y-6">
          {notice && <p role="status" className="text-sm text-teal-deep bg-teal-deep/10 rounded-lg px-4 py-2.5">{notice}</p>}
          {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">{error}</p>}

          {user && data?.mine && (
            <div className="bg-card border border-border rounded-xl p-5">
              <p className="text-sm text-foreground">
                Your credits: <span className="font-bold">{data.mine.balance}</span>
                {data.mine.strikes > 0 && (
                  <span className="text-xs text-amber-700 ml-2">({data.mine.strikes} no-show{data.mine.strikes > 1 ? "s" : ""} on record)</span>
                )}
              </p>
              {liveLoans.length > 0 && (
                <div className="mt-3 space-y-2 border-t border-border pt-3">
                  {liveLoans.map((l: any) => (
                    <div key={l.id} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        <b className="text-foreground">{itemName(l.itemId)}</b> — {l.status.replace(/_/g, " ")}
                        {l.dueOn && <> · due {l.dueOn}</>} · {l.escrowCredits} in escrow
                      </span>
                      <span className="space-x-3">
                        {(l.status === "reserved" || l.status === "pickup_pending") && (
                          <button onClick={() => call(`/api/library/loans/${l.id}/cancel`)}
                            className="text-xs text-muted-foreground hover:text-red-600 inline-flex items-center gap-1">
                            <Undo2 className="w-3 h-3" /> Cancel
                          </button>
                        )}
                        {l.status === "active" && (
                          <button onClick={() => call(`/api/library/loans/${l.id}/return`)}
                            className="text-xs text-teal-deep font-medium hover:underline inline-flex items-center gap-1">
                            <RotateCcw className="w-3 h-3" /> I returned it
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {visibleItems.map((i: any) => {
              const eligible = data?.mine?.eligible?.[i.id] ?? true;
              return (
                <div key={i.id} className="bg-card border border-border rounded-xl p-4 flex flex-col">
                  {i.photoUrl && (
                    <img src={i.photoUrl} alt={i.name} loading="lazy"
                      className="rounded-lg mb-3 h-36 w-full object-cover" />
                  )}
                  <div className="flex items-center gap-2 mb-1">
                    <Wrench className="w-4 h-4 text-teal-deep" />
                    <p className="font-semibold text-foreground text-sm">{i.name}</p>
                    <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded-full ${i.status === "available" ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-500"}`}>
                      {STATUS_LABEL[i.status] ?? i.status}
                    </span>
                  </div>
                  {i.description && <p className="text-sm text-muted-foreground mb-2">{i.description}</p>}
                  <div className="mt-auto flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">
                      value {i.creditValue} · deposit {i.escrow}
                      {i.minStage && <> · from {i.minStage}</>}
                    </p>
                    {user && i.status === "available" && (
                      <button
                        onClick={() => call(`/api/library/items/${i.id}/reserve`)}
                        disabled={!eligible}
                        title={eligible ? `Locks ${i.escrow} credit(s) in escrow` : "Not open to you yet"}
                        className="text-sm bg-[#2D5A5A] text-white rounded-lg px-3 py-1.5 font-medium disabled:opacity-40"
                      >
                        Borrow
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Gated on what's actually SHOWN: a shelf holding only retired
              items used to render a blank grid with no explanation. */}
          {data && visibleItems.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-12">
              <Package className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
              The shelves are waiting for their first donation.
            </p>
          )}
          {!user && <p className="text-center text-xs text-muted-foreground">Sign in to borrow. Donations are recorded with a steward.</p>}
        </div>
      </section>
    </Layout>
  );
}
