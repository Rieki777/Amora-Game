/**
 * Village Health (S49-S51): per-lunation snapshots, the land's regeneration
 * ledger, governance reads, and the season's goals — honest above all.
 * Trends render only once enough lunations exist ("N of 3 collected");
 * before that the page shows points and says why. Absolute counts, never
 * leaderboards, never percentiles — and an objection rate falling toward
 * zero would be shown as a WARNING, not a win.
 */
import Layout from "@/components/Layout";
import NotFound from "@/pages/NotFound";
import { useEffect, useState } from "react";
import { useModule, useModules } from "@/modules/ModuleProvider";
import { authToken } from "@/lib/gameApi";
import { SNAPSHOT_METRICS } from "@shared/healthMetrics";
import { Activity, CheckCircle2, Circle, Leaf, Moon, Sprout, Users } from "lucide-react";
import { ExamplesBanner } from "@/components/ExamplesBanner";

const headers = (): Record<string, string> => {
  const t = authToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
};

/**
 * H3: the tiles come from the SHARED registry, not a local copy. The old
 * hardcoded map meant every new metric had to be added in two places, and
 * the one that got forgotten was always the display — a metric collected
 * for months and shown to nobody. Cards still render only where a value
 * exists, so a village without the library module sees no library tile.
 */
const SNAPSHOT_LABELS: Record<string, string> = Object.fromEntries(
  SNAPSHOT_METRICS.map((m) => [m.key, m.label]),
);

export default function VillageHealth() {
  const modules = useModules();
  const healthModule = useModule("health");
  const [data, setData] = useState<any>(null);
  const [season, setSeason] = useState<any>(null);

  useEffect(() => {
    if (!healthModule) return;
    fetch("/api/health/summary", { headers: headers() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setData)
      .catch(() => {});
    fetch("/api/season")
      .then((r) => (r.ok ? r.json() : null))
      .then(setSeason)
      .catch(() => {});
  }, [healthModule?.id]);

  if (modules.loaded && !healthModule) return <NotFound />;

  const latestOf = (key: string) => {
    const points = data?.series?.[key] ?? [];
    return points.length ? points[points.length - 1] : null;
  };
  const goals: any[] = season?.current?.goals ?? [];

  return (
    <Layout>
      <section className="py-12 bg-gradient-to-b from-teal-deep/5 to-background">
        <div className="container text-center">
          <h1 className="font-display text-4xl font-bold text-foreground mb-3">Village Health</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            The village's vital signs, frozen each lunar cycle, and the land's
            own ledger of regeneration.
          </p>
          <ExamplesBanner moduleId="health" noun="measurement" />
        </div>
      </section>

      <section className="py-8 bg-background">
        <div className="container max-w-3xl space-y-6">
          {/* Season goals overlay */}
          {season?.current && (
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
                <p className="font-semibold text-foreground text-sm">
                  {season.current.name}
                  {season.current.theme ? <span className="text-muted-foreground font-normal">: {season.current.theme}</span> : null}
                </p>
                <span className="text-xs text-muted-foreground">{season.daysLeft} day(s) left</span>
              </div>
              {goals.length > 0 ? (
                <div className="space-y-1.5">
                  {goals.map((g: any, i: number) => (
                    <p key={i} className="text-sm flex items-center gap-2">
                      {g.done ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Circle className="w-4 h-4 text-muted-foreground/40" />}
                      <span className={g.done ? "text-muted-foreground line-through" : "text-foreground"}>{g.text ?? String(g)}</span>
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">This season has no posted goals yet.</p>
              )}
            </div>
          )}

          {/* Regen impact tiles — the land's ledger */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Leaf className="w-4 h-4 text-teal-deep" />
              <p className="font-semibold text-foreground text-sm">Regeneration ledger</p>
            </div>
            {Object.keys(data?.regen?.totals ?? {}).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                <Sprout className="w-4 h-4 inline mr-1 text-teal-deep/60" />
                Nothing recorded yet. The stewards log plantings, water and
                restoration as they happen.
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {(data.regen.metrics ?? []).filter((m: any) => data.regen.totals[m.key]).map((m: any) => (
                  <div key={m.key} className="border border-border rounded-lg px-3 py-2.5">
                    <p className="text-xl font-bold text-teal-deep">
                      {Number(data.regen.totals[m.key].total).toLocaleString()}
                      <span className="text-xs font-normal text-muted-foreground ml-1">{data.regen.totals[m.key].unit}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                  </div>
                ))}
              </div>
            )}
            {(data?.regen?.latest ?? []).length > 0 && (
              <details className="mt-3">
                <summary className="text-xs text-muted-foreground cursor-pointer">Recent entries</summary>
                <div className="mt-2 space-y-1">
                  {data.regen.latest.map((e: any) => (
                    <p key={e.id} className="text-xs text-muted-foreground">
                      {new Date(e.recordedAt).toLocaleDateString()}: {e.value} {e.unit}{e.note ? ` · ${e.note}` : ""}
                    </p>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Snapshot vitals */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Moon className="w-4 h-4 text-teal-deep" />
              <p className="font-semibold text-foreground text-sm">Lunation snapshots</p>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Frozen at each cycle close, never recomputed.{" "}
              {data && !data.trendsUnlocked && (
                <span className="text-amber-600">
                  {data.lunationsCollected} of {data.trendMinLunations} lunations collected, trends unlock at {data.trendMinLunations}.
                </span>
              )}
            </p>
            {data && data.lunationsCollected === 0 ? (
              <p className="text-sm text-muted-foreground">The first snapshot lands when the current lunar cycle closes.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Object.entries(SNAPSHOT_LABELS).map(([key, label]) => {
                  const latest = latestOf(key);
                  if (!latest) return null;
                  const points = data.series[key];
                  return (
                    <div key={key} className="border border-border rounded-lg px-3 py-2.5">
                      <p className="text-xl font-bold text-foreground">{latest.value}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      {data.trendsUnlocked && points.length >= 2 && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {points.slice(-data.trendMinLunations).map((p: any) => p.value).join(" → ")} over recent cycles
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Governance reads, framed honestly */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-1">
              <Users className="w-4 h-4 text-teal-deep" />
              <p className="font-semibold text-foreground text-sm">Governance health</p>
            </div>
            <p className="text-sm text-foreground">
              {data?.governance?.decisionsAllTime ?? 0} decision(s) opened by{" "}
              {data?.governance?.distinctAuthors ?? 0} member(s)
              {data?.governance?.authorshipConcentration != null && (
                <>, and the most frequent author opened {Math.round(data.governance.authorshipConcentration * 100)}%</>
              )}
              .
            </p>
            <p className="text-xs text-muted-foreground mt-1">{data?.governance?.note}</p>
          </div>

          <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Absolute counts only. No leaderboards, no ranks. The village is not a scoreboard.
          </p>
        </div>
      </section>
    </Layout>
  );
}
