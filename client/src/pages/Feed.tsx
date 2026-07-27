/**
 * The Village Feed (S27-S29): a LENS over one forum category plus the
 * village's own milestones — not a second content store. The heart button is
 * a REAL send from the tapper's cycle budget, through the same payment path
 * as every written acknowledgment.
 */
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { useAuth } from "@/contexts/AuthContext";
import { authToken } from "@/lib/gameApi";
import { Calendar, Heart, Megaphone, MessageCircle, Sparkles, Send } from "lucide-react";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

const SYSTEM_ICON: Record<string, React.ElementType> = {
  quest: Sparkles, stage: Sparkles, season: Calendar, cycle: Calendar, join: Sparkles,
};

export default function Feed() {
  const modules = useModules();
  const feedModule = useModule("feed");
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    fetch("/api/feed", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  };
  useEffect(() => { if (feedModule) load(); }, [feedModule?.id]);

  if (modules.loaded && !feedModule) return <NotFound />;

  const post = () => {
    setError("");
    fetch("/api/forum/threads", {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ category: data?.categorySlug, kind: "post", body: draft }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not post");
        setDraft("");
        load();
      })
      .catch((e) => setError(e.message));
  };

  const heart = (item: any) => {
    fetch(`/api/feed/threads/${item.id}/heart`, { method: "POST", headers: headers(), body: "{}" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not send");
        load();
      })
      .catch((e) => setError(e.message));
  };

  return (
    <Layout>
      <section className="py-12 bg-gradient-to-b from-teal-deep/5 to-background">
        <div className="container text-center">
          <h1 className="font-display text-4xl font-bold text-foreground mb-3">Village Feed</h1>
          <p className="text-muted-foreground">
            Everyday life, woven with the village's milestones. A heart is a real
            gift from your cycle budget.
          </p>
        </div>
      </section>
      <section className="py-8 bg-background">
        <div className="container max-w-xl space-y-4">
          {user && data && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-2">
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2}
                placeholder="Share a moment… mention people with @handle."
                className="w-full text-sm border border-border rounded-lg px-3 py-2" />
              <div className="flex items-center justify-between">
                {error ? <p className="text-xs text-red-600">{error}</p> : <span />}
                <button onClick={post} disabled={!draft.trim()}
                  className="inline-flex items-center gap-1.5 text-sm bg-[#2D5A5A] text-white rounded-lg px-4 py-2 font-medium disabled:opacity-40">
                  <Send className="w-3.5 h-3.5" /> Post
                </button>
              </div>
            </div>
          )}

          {(data?.items ?? []).map((item: any) => {
            if (item.itemType === "system") {
              const Icon = SYSTEM_ICON[item.kind] ?? Sparkles;
              return (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2.5 text-sm text-muted-foreground">
                  <Icon className="w-4 h-4 text-teal-deep/60 shrink-0" />
                  <span>{item.body}</span>
                </div>
              );
            }
            return (
              <div key={item.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <span className="font-medium text-foreground">{item.author.name}</span>
                  {item.author.handle && <span>@{item.author.handle}</span>}
                  {item.kind === "announcement" && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-amber/20 text-amber-700 px-1.5 py-0.5 rounded-full">
                      <Megaphone className="w-3 h-3" /> announcement
                    </span>
                  )}
                  {item.kind === "event" && item.meta?.startsAt && (
                    <span className="text-[10px] bg-sky-50 text-sky-700 border border-sky-200 px-1.5 py-0.5 rounded-full">
                      {new Date(item.meta.startsAt).toLocaleDateString()}
                    </span>
                  )}
                  <span className="ml-auto">{new Date(item.at).toLocaleString()}</span>
                </div>
                {item.title && <p className="font-semibold text-foreground text-sm mb-1">{item.title}</p>}
                <p className="text-sm text-foreground whitespace-pre-wrap">{item.body}</p>
                {item.imageUrl && <img src={item.imageUrl} alt="" className="rounded-lg mt-2 max-h-72 object-cover" />}
                {/* Tap targets clear WCAG 2.5.8's 24px floor: a heart sends a
                    REAL gift from the sender's budget, so a thumb that misses
                    by 4px is not a cosmetic problem. Negative margin keeps the
                    row's visual rhythm while the hit area grows. */}
                <div className="flex items-center gap-2 mt-2">
                  <button
                    onClick={() => !item.heartedByMe && user && heart(item)}
                    disabled={item.heartedByMe || !user}
                    title={item.heartedByMe ? "Already sent" : `Sends ${data?.heartAmount ?? 1} recognition from your budget`}
                    aria-label={`${item.heartCount} recognition — ${item.heartedByMe ? "already sent" : "send one"}`}
                    className={`inline-flex items-center gap-1.5 text-sm min-h-[44px] px-2 -mx-2 ${item.heartedByMe ? "text-rose-500" : "text-muted-foreground hover:text-rose-500"} disabled:cursor-default`}
                  >
                    <Heart className={`w-4 h-4 ${item.heartedByMe ? "fill-rose-500" : ""}`} />
                    {item.heartCount}
                  </button>
                  <Link
                    href={`/forum/${item.id}`}
                    aria-label={`${item.replyCount} replies — open the thread`}
                    className="inline-flex items-center gap-1.5 text-sm min-h-[44px] px-2 text-muted-foreground hover:text-foreground"
                  >
                    <MessageCircle className="w-4 h-4" /> {item.replyCount}
                  </Link>
                </div>
              </div>
            );
          })}
          {data && data.items.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-12">Quiet so far — share the first moment.</p>
          )}
        </div>
      </section>
    </Layout>
  );
}
