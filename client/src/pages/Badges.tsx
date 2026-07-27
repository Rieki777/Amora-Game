/**
 * Badges & Skills (S39): what the village recognizes about you. Self badges
 * you declare, earned badges the engine grants from settled contribution,
 * granted honors, and warnings (which suspend specific capabilities until
 * resolved — shown honestly, not hidden).
 */
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import { useEffect, useState } from "react";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { useAuth } from "@/contexts/AuthContext";
import { authToken } from "@/lib/gameApi";
import { Award, Hammer, Medal, Plus, ShieldAlert, Sparkles, X } from "lucide-react";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

const KIND_META: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  self: { label: "self-declared", icon: Sparkles, cls: "bg-sky-50 text-sky-700 border-sky-200" },
  earned: { label: "earned", icon: Medal, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  granted: { label: "granted", icon: Award, cls: "bg-amber-50 text-amber-700 border-amber-200" },
  warning: { label: "warning", icon: ShieldAlert, cls: "bg-red-50 text-red-700 border-red-200" },
  hypha: { label: "hypha", icon: Award, cls: "bg-purple-50 text-purple-700 border-purple-200" },
};

export default function Badges() {
  const modules = useModules();
  const badgesModule = useModule("badges");
  const { user } = useAuth();
  const [data, setData] = useState<any>(null);
  const [skill, setSkill] = useState("");
  const [error, setError] = useState("");

  const load = () => {
    fetch("/api/badges", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
  };
  useEffect(() => { if (badgesModule) load(); }, [badgesModule?.id]);

  if (modules.loaded && !badgesModule) return <NotFound />;

  const call = (path: string, method: string, body?: any) => {
    setError("");
    fetch(path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Request failed");
        load();
      })
      .catch((e) => setError(e.message));
  };

  const myAwardByBadge = new Map<string, any>((data?.mine?.awards ?? []).map((a: any) => [a.badgeId, a]));

  return (
    <Layout>
      <section className="py-12 bg-gradient-to-b from-teal-deep/5 to-background">
        <div className="container text-center">
          <h1 className="font-display text-4xl font-bold text-foreground mb-3">Badges & Skills</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            What the village recognizes: skills you declare, badges earned from
            real contribution, honors granted by stewards.
          </p>
        </div>
      </section>

      <section className="py-8 bg-background">
        <div className="container max-w-2xl space-y-6">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">{error}</p>}

          {user && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3">
                <Hammer className="w-4 h-4 text-teal-deep" />
                <p className="font-semibold text-foreground text-sm">Your skills</p>
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {(data?.mine?.skills ?? []).map((s: string) => (
                  <span key={s} className="inline-flex items-center gap-1 text-xs bg-teal-deep/10 text-teal-deep px-2 py-1 rounded-full">
                    {s}
                    <button onClick={() => call(`/api/badges/skills/${s}`, "DELETE")} title="Remove">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                {(data?.mine?.skills ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground">Declare what you can do — it helps the village find you.</p>
                )}
              </div>
              <div className="flex gap-2">
                <input value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="e.g. carpentry"
                  className="flex-1 text-sm border border-border rounded-lg px-3 py-2" />
                <button
                  onClick={() => { if (skill.trim()) { call("/api/badges/skills", "POST", { tag: skill }); setSkill(""); } }}
                  className="inline-flex items-center gap-1.5 text-sm bg-[#2D5A5A] text-white rounded-lg px-3 py-2 font-medium">
                  <Plus className="w-3.5 h-3.5" /> Add
                </button>
              </div>
            </div>
          )}

          <div className="space-y-3">
            {(data?.badges ?? []).map((b: any) => {
              const meta = KIND_META[b.kind] ?? KIND_META.granted;
              const Icon = meta.icon;
              const mine = myAwardByBadge.get(b.id);
              return (
                <div key={b.id} className={`bg-card border rounded-xl p-4 ${mine && b.kind === "warning" ? "border-red-300" : "border-border"}`}>
                  <div className="flex items-start gap-3">
                    <Icon className={`w-5 h-5 mt-0.5 ${b.kind === "warning" ? "text-red-500" : "text-teal-deep"}`} />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-foreground text-sm">{b.name}</p>
                        <span className={`text-[10px] border px-1.5 py-0.5 rounded-full ${meta.cls}`}>{meta.label}</span>
                        {mine && (
                          <span className="text-[10px] bg-teal-deep text-white px-1.5 py-0.5 rounded-full">
                            yours{mine.count > 1 ? ` ×${mine.count}` : ""}
                          </span>
                        )}
                      </div>
                      {b.description && <p className="text-sm text-muted-foreground mt-1">{b.description}</p>}
                      {b.kind === "earned" && b.rule && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Earned at {b.rule.threshold} {String(b.rule.metric).replace(/_/g, " ")}
                          {b.rule.stackable ? `, stacks to ×${b.rule.maxStack}` : ""}.
                        </p>
                      )}
                      {(b.capabilities ?? []).length > 0 && (
                        <p className="text-xs text-emerald-700 mt-1">Grants: {b.capabilities.join(", ")}</p>
                      )}
                      {(b.denies ?? []).length > 0 && (
                        <p className="text-xs text-red-600 mt-1">Suspends: {b.denies.join(", ")}</p>
                      )}
                      {mine?.note && <p className="text-xs text-muted-foreground italic mt-1">“{mine.note}”</p>}
                    </div>
                    {user && b.kind === "self" && (
                      mine ? (
                        <button onClick={() => call(`/api/badges/${b.id}/claim`, "DELETE")}
                          className="text-xs text-muted-foreground hover:text-red-600">Remove</button>
                      ) : (
                        <button onClick={() => call(`/api/badges/${b.id}/claim`, "POST")}
                          className="text-xs text-[#2D5A5A] font-medium hover:underline">That's me</button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
            {data && data.badges.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-12">No badges defined yet.</p>
            )}
          </div>
        </div>
      </section>
    </Layout>
  );
}
