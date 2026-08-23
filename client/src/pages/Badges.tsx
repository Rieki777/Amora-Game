/**
 * Badges & Skills (S39): what the village recognizes about you. Self badges
 * you declare, earned badges the engine grants from settled contribution,
 * granted honors, and warnings (which suspend specific capabilities until
 * resolved — shown honestly, not hidden).
 */
import Layout from "@/components/Layout";
import { Link } from "wouter";
import ModuleGate from "@/components/modules/ModuleGate";
import { useEffect, useState } from "react";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { useAuth } from "@/contexts/AuthContext";
import { authToken } from "@/lib/gameApi";
import { Award, CircleHelp, Hammer, Medal, Plus, ShieldAlert, Sparkles, X } from "lucide-react";
import { ExamplesBanner } from "@/components/ExamplesBanner";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}`, "Content-Type": "application/json" } : { "Content-Type": "application/json" };
};

/**
 * WHAT EACH BADGE KIND READS AS.
 *
 * The authority is the `badges`.`kind` column, declared
 * `enum('self','earned','granted','warning','hypha')` by
 * `drizzle/0023_badges.sql`, so the database is what the route selects and the
 * migration is what this map answers to. `badgeKinds.test.ts` reads the last
 * migration to declare the column and holds this map to it.
 *
 * A kind matters here beyond its colour. Kinds carry capability meaning in the
 * one gate (`shared/capabilities.ts`): `warning` is the kind that DENIES, and
 * a deny beats role and stage.
 */
const KIND_META: Record<string, { label: string; icon: React.ElementType; cls: string }> = {
  self: { label: "self-declared", icon: Sparkles, cls: "bg-sky-50 text-sky-700 border-sky-200" },
  earned: { label: "earned", icon: Medal, cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  granted: { label: "granted", icon: Award, cls: "bg-amber-50 text-amber-700 border-amber-200" },
  warning: { label: "warning", icon: ShieldAlert, cls: "bg-red-50 text-red-700 border-red-200" },
  hypha: { label: "hypha", icon: Award, cls: "bg-purple-50 text-purple-700 border-purple-200" },
};

/**
 * A kind this build has not been taught, read as itself.
 *
 * This used to fall back to `KIND_META.granted`, which is the most dangerous
 * wrong answer available: it painted an unknown kind as a friendly amber
 * award. Badge kinds are how this village says what a badge DOES, and the one
 * kind that takes capability away is `warning`. A sixth kind added to the
 * column with deny semantics would have read to every member as a gift. The
 * badge's own name and description still render above this chip, so showing
 * the raw kind loses nothing and claims nothing.
 */
const UNKNOWN_KIND = { icon: CircleHelp, cls: "bg-stone-100 text-stone-600 border-stone-200" };

export const BADGE_KIND_META = KIND_META;

/** The chip beside a badge name, never undefined and never guessed. */
function kindMeta(kind: string): { label: string; icon: React.ElementType; cls: string } {
  return KIND_META[kind] ?? { ...UNKNOWN_KIND, label: String(kind || "unknown") };
}

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

  if (modules.loaded && !badgesModule) return <ModuleGate moduleId="badges" name="Badges & Skills" />;

  const call = (path: string, method: string, body?: any) => {
    setError("");
    fetch(path, { method, headers: headers(), body: body ? JSON.stringify(body) : undefined })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.message ?? d.error ?? "Request failed");
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
          <ExamplesBanner moduleId="badges" noun="badge" />
          {/*
            0098. A badge is one of the ways a power reaches a person, so the
            page about what the village recognises is the page a member is on
            when they want to know who looks after what.
          */}
          <p className="text-sm text-muted-foreground mt-4">
            <Link href="/powers" className="underline">
              See what this village looks after
            </Link>
            , and who holds each of it.
          </p>
        </div>
      </section>

      <section className="py-8 bg-background">
        <div className="container max-w-2xl space-y-6">
          {error && <p role="alert" className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2.5">{error}</p>}

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
                  <p className="text-xs text-muted-foreground">Declare what you can do. It helps the village find you.</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
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
              const meta = kindMeta(String(b.kind ?? ""));
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
                      {/* Trust can be lent for a season. Until this shipped, a
                          member holding a badge that lapses next week saw
                          nothing to tell them so. */}
                      {mine?.expiresAt && (
                        <p className="text-xs text-amber-700 mt-1">
                          Yours until {new Date(mine.expiresAt).toLocaleDateString()}.
                        </p>
                      )}
                      {(b.holders ?? []).length > 0 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Held by{" "}
                          {b.holders.map((h: any, i: number) => (
                            <span key={h.userId}>
                              {i > 0 ? ", " : ""}
                              {h.name}
                              {h.expiresAt && (
                                <span className="text-amber-700">
                                  {" "}until {new Date(h.expiresAt).toLocaleDateString()}
                                </span>
                              )}
                            </span>
                          ))}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      {user && b.kind === "self" && (
                        mine ? (
                          <button onClick={() => call(`/api/badges/${b.id}/claim`, "DELETE")}
                            className="text-xs text-muted-foreground hover:text-red-600">Remove</button>
                        ) : (
                          <button onClick={() => call(`/api/badges/${b.id}/claim`, "POST")}
                            className="text-xs text-[#2D5A5A] font-medium hover:underline">That's me</button>
                        )
                      )}
                      {/* B10: pin up to badges.max_featured to your byline.
                          Self-presentation — nothing shows unless YOU pin it. */}
                      {user && mine && b.kind !== "warning" && !mine.expired && (
                        <button
                          onClick={() => {
                            const current = (data?.mine?.awards ?? [])
                              .filter((a: any) => a.featured && !a.expired)
                              .map((a: any) => a.badgeId);
                            const next = mine.featured
                              ? current.filter((id: string) => id !== b.id)
                              : [...current, b.id];
                            fetch("/api/badges/featured", {
                              method: "PUT", headers: headers(),
                              body: JSON.stringify({ badgeIds: next }),
                            }).then(async (r) => {
                              const d = await r.json();
                              if (!r.ok) throw new Error(d.message ?? d.error ?? "failed");
                              load();
                            }).catch((e) => setError(e.message));
                          }}
                          className={`text-xs font-medium ${mine.featured ? "text-amber-600" : "text-muted-foreground hover:text-teal-deep"}`}
                        >
                          {mine.featured ? "★ On your byline" : "☆ Pin to byline"}
                        </button>
                      )}
                    </div>
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
