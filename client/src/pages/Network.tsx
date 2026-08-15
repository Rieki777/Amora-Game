/**
 * Village Network (S67): what we share with the network, and what the
 * network shares with us.
 *
 * Federation, worn lightly: the page reads one payload — this village's own
 * published needs/offers plus the cached items of every peer village — and
 * renders them side by side. Admins additionally publish, close, and manage
 * the peer list right here, because a separate admin screen for four
 * actions would be ceremony.
 *
 * Nothing on this page is a person. Items are village-level; the optional
 * contact is an address the publishing admin chose to attach. The people
 * directory Rye wants later arrives as a new item type with per-member
 * consent rows — not by loosening this page.
 */
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import { useCallback, useEffect, useState } from "react";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { useAuth } from "@/contexts/AuthContext";
import { authToken } from "@/lib/gameApi";
import { Globe2, HandHeart, HelpingHand, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { ExampleChip, ExamplesBanner, forgetExamplesCache } from "@/components/ExamplesBanner";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

function TypeBadge({ type }: { type: string }) {
  const need = type === "need";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide rounded-full border px-2 py-0.5 ${
      need ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
    }`}>
      {need ? <HelpingHand className="w-3 h-3" /> : <HandHeart className="w-3 h-3" />}
      {need ? "Need" : "Offer"}
    </span>
  );
}

export default function Network() {
  const modules = useModules();
  const networkModule = useModule("network");
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [peers, setPeers] = useState<any[]>([]);
  const [form, setForm] = useState({ type: "need", title: "", detail: "", contact: "" });
  const [peerUrl, setPeerUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  // What the last sync actually did. The button reported nothing either way,
  // and on a network holding only the example village it reaches no one at
  // all (the sweep skips example rows on purpose), so pressing it looked
  // broken rather than finished.
  const [syncNote, setSyncNote] = useState("");

  const load = useCallback(() => {
    fetch("/api/network", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  }, []);
  const loadPeers = useCallback(() => {
    fetch("/api/admin/network/peers", { headers: headers() })
      .then((r) => (r.ok ? r.json() : { peers: [] }))
      .then((d) => setPeers(d.peers ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (networkModule) {
      load();
      if (user && (user.role === "admin" || user.role === "founder")) loadPeers();
    }
  }, [networkModule?.id, user?.id]);

  if (modules.loaded && !networkModule) return <NotFound />;

  const call = (route: string, opts: RequestInit, key: string) => {
    setBusy(key);
    setError("");
    return fetch(route, { headers: headers(), ...opts })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.message ?? d.error ?? "That did not go through");
        return d;
      })
      .catch((e) => { setError(e.message); return null; })
      .finally(() => setBusy(""));
  };

  const publish = async () => {
    const d = await call("/api/admin/network/share", { method: "POST", body: JSON.stringify(form) }, "publish");
    if (d) { setForm({ type: "need", title: "", detail: "", contact: "" }); forgetExamplesCache("network"); load(); }
  };
  const addPeerUrl = async () => {
    const d = await call("/api/admin/network/peers", { method: "POST", body: JSON.stringify({ baseUrl: peerUrl }) }, "peer");
    if (d) { setPeerUrl(""); loadPeers(); setTimeout(load, 2500); }
  };

  const canManage = !!data?.canManage;

  return (
    <Layout>
      <section className="py-12 bg-gradient-to-b from-teal-deep/5 to-background">
        <div className="container text-center">
          <h1 className="font-display text-4xl font-bold text-foreground mb-3">Village Network</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            Villages running this platform can hear each other: what one needs,
            another may have. Each village chooses whom it listens to.
          </p>
          <ExamplesBanner moduleId="network" noun="need or offer" />
        </div>
      </section>

      <section className="py-8 bg-background">
        <div className="container max-w-3xl space-y-6">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">{error}</p>}

          {/* ── What we share ── */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Globe2 className="w-4 h-4 text-teal-deep" />
              <p className="font-semibold text-foreground text-sm">
                What {data?.village ?? "this village"} shares with the network
              </p>
            </div>
            {(data?.mine ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing published yet.</p>
            )}
            <div className="space-y-2.5">
              {(data?.mine ?? []).map((m: any) => (
                <div key={m.id} className={`border border-border rounded-lg px-4 py-3 ${m.status === "closed" ? "opacity-50" : ""}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <TypeBadge type={m.type} />
                    <p className="text-sm font-medium text-foreground">{m.title}</p>
                    {/* Publishing a real share retires the module's examples,
                        so the two can only overlap for as long as retirement
                        takes. The row carries the flag anyway (SELECT s.*):
                        the banner above is dropped optimistically, and this is
                        what still tells the truth in that window. */}
                    {!!m.is_example && <ExampleChip />}
                    {m.status === "closed" && <span className="text-[10px] text-muted-foreground uppercase">closed</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{m.detail}</p>
                  <div className="flex items-center gap-3 mt-1.5 text-[11px] text-muted-foreground">
                    <span>{day(m.created_at)}</span>
                    {m.contact && <span>reach us: {m.contact}</span>}
                    {canManage && !m.is_example && (
                      <button
                        onClick={async () => {
                          const d = await call(`/api/admin/network/share/${m.id}`, { method: "PUT", body: JSON.stringify({ status: m.status === "open" ? "closed" : "open" }) }, m.id);
                          if (d) load();
                        }}
                        className="text-teal-deep font-medium hover:underline"
                      >
                        {m.status === "open" ? "Close" : "Reopen"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {canManage && (
              <div className="border-t border-border mt-4 pt-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Publish to the network (visible to every peer village)</p>
                <div className="flex gap-2">
                  {(data?.types ?? ["need", "offer"]).map((t: string) => (
                    <button key={t} onClick={() => setForm({ ...form, type: t })}
                      className={`text-xs rounded-lg border px-3 py-1.5 font-medium capitalize ${form.type === t ? "border-teal-deep bg-teal-deep/5 text-teal-deep" : "border-border text-muted-foreground"}`}>
                      {t}
                    </button>
                  ))}
                </div>
                <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder={form.type === "need" ? "We're looking for…" : "We can offer…"}
                  className="w-full text-sm border border-border rounded-lg px-3 py-2" />
                <textarea value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} rows={3}
                  placeholder="Enough detail for another village to act on."
                  className="w-full text-sm border border-border rounded-lg px-3 py-2" />
                <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })}
                  placeholder="How the network reaches your village about this (a shared inbox, not a personal one)"
                  className="w-full text-sm border border-border rounded-lg px-3 py-2" />
                <button onClick={publish} disabled={busy === "publish" || form.title.trim().length < 4 || form.detail.trim().length < 10}
                  className="inline-flex items-center gap-1.5 text-sm bg-[#2D5A5A] text-white rounded-lg px-4 py-2 font-medium disabled:opacity-40">
                  {busy === "publish" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Publish
                </button>
              </div>
            )}
          </div>

          {/* ── What peers share ── */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
              <p className="font-semibold text-foreground text-sm">From other villages</p>
              {canManage && (
                <button
                  onClick={async () => {
                    setSyncNote("");
                    const d = await call("/api/admin/network/sync", { method: "POST" }, "sync");
                    if (!d) return;
                    const heard = Number(d.synced ?? 0);
                    const quiet = Number(d.failed ?? 0);
                    setSyncNote(
                      heard === 0 && quiet === 0
                        ? "Nothing to reach. Every village listed here is an example, so there is no address to call."
                        : `Heard from ${heard} village(s)${quiet > 0 ? `, ${quiet} did not answer` : ""}.`,
                    );
                    load();
                  }}
                  disabled={busy === "sync"}
                  className="inline-flex items-center gap-1.5 text-xs text-teal-deep font-medium"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${busy === "sync" ? "animate-spin" : ""}`} /> Sync now
                </button>
              )}
            </div>
            {syncNote && (
              <p role="status" className="text-xs text-teal-deep bg-teal-deep/10 rounded-lg px-3 py-2 mb-3">{syncNote}</p>
            )}
            {(data?.peers ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Not listening to any villages yet{canManage ? ". Add one below." : "."}
              </p>
            )}
            <div className="space-y-4">
              {(data?.peers ?? []).map((p: any) => (
                <div key={p.peerId}>
                  <p className="text-xs font-semibold text-foreground mb-1.5">
                    {p.village}
                    {/* Adding a real peer is not a retirement trigger, so a
                        fictional village and a real one can sit in this list
                        together under one banner calling everything on the
                        page an example. The row says which is which. */}
                    {p.isExample && <ExampleChip className="ml-1.5 align-middle" />}
                    <span className="text-muted-foreground font-normal">
                      {p.version ? ` · ${p.version}` : ""}
                      {" "}· {p.lastSyncAt ? `heard ${day(p.lastSyncAt)}` : "not heard yet"}
                      {p.status === "paused" && " · paused"}
                    </span>
                  </p>
                  {p.lastError && canManage && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 rounded px-2 py-1 mb-1.5">{p.lastError}</p>
                  )}
                  {(p.items ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Nothing shared right now.</p>
                  ) : (
                    <div className="space-y-2">
                      {p.items.map((it: any) => (
                        <div key={it.id} className="border border-border rounded-lg px-4 py-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <TypeBadge type={it.type} />
                            <p className="text-sm font-medium text-foreground">{it.title}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{it.detail}</p>
                          <p className="text-[11px] text-muted-foreground mt-1.5">
                            {day(it.createdAt)}{it.contact && ` · reach them: ${it.contact}`}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {canManage && (
              <div className="border-t border-border mt-4 pt-4 space-y-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Listen to a village (its address, the handshake does the rest)
                </p>
                <div className="flex gap-2 flex-wrap">
                  <input value={peerUrl} onChange={(e) => setPeerUrl(e.target.value)}
                    placeholder="https://their-village.example"
                    className="flex-1 min-w-[220px] text-sm border border-border rounded-lg px-3 py-2" />
                  <button onClick={addPeerUrl} disabled={busy === "peer" || !peerUrl.trim()}
                    className="text-sm bg-[#2D5A5A] text-white rounded-lg px-4 py-2 font-medium disabled:opacity-40">
                    {busy === "peer" ? "Shaking hands…" : "Add"}
                  </button>
                </div>
                {peers.length > 0 && (
                  <div className="space-y-1 pt-1">
                    {peers.map((p: any) => (
                      <p key={p.id} className="text-[11px] text-muted-foreground flex items-center gap-2">
                        {p.name} · {p.base_url} · {p.status}
                        {p.status === "paused" && (
                          <button
                            onClick={async () => { const d = await call(`/api/admin/network/peers/${p.id}/resume`, { method: "POST" }, p.id); if (d) { loadPeers(); load(); } }}
                            className="text-teal-deep font-medium hover:underline"
                          >
                            accept & resume
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            if (!window.confirm(`Stop listening to ${p.name}? Their shared items disappear from this page.`)) return;
                            const d = await call(`/api/admin/network/peers/${p.id}`, { method: "DELETE" }, p.id);
                            if (d) { loadPeers(); load(); }
                          }}
                          className="text-red-500 hover:text-red-700"
                          aria-label={`Remove ${p.name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
}
