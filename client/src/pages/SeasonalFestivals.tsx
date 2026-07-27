/**
 * Seasonal Festivals (MF11, Wave 1): the page two live surfaces already
 * linked to — the Journey tracker and the Tools hub — that never existed.
 * A dead link from your own onboarding content is a small broken promise;
 * this keeps it: the village's season calendar, live from /api/season,
 * with the rhythm each season carries.
 */
import Layout from "@/components/Layout";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import { CalendarDays, Sparkles } from "lucide-react";

export default function SeasonalFestivals() {
  const [season, setSeason] = useState<any>(null);

  useEffect(() => {
    fetch("/api/season").then((r) => (r.ok ? r.json() : null)).then(setSeason).catch(() => {});
  }, []);

  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });

  return (
    <Layout>
      <section className="py-12 bg-gradient-to-b from-teal-deep/5 to-background">
        <div className="container text-center">
          <h1 className="font-display text-4xl font-bold text-foreground mb-3">Seasonal Festivals</h1>
          <p className="text-muted-foreground max-w-xl mx-auto">
            The village moves in seasons — each with its own energy, and each
            turned with a gathering. Festivals are how a season is opened,
            honored, and handed to the next.
          </p>
        </div>
      </section>

      <section className="py-8 bg-background">
        <div className="container max-w-2xl space-y-4">
          {season?.current && (
            <div className="bg-card border border-teal-deep/30 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4 text-teal-deep" />
                <p className="text-xs font-semibold uppercase tracking-widest text-teal-deep">Now</p>
              </div>
              <p className="font-display text-xl font-bold text-foreground">{season.current.name}</p>
              {season.current.goal && <p className="text-sm text-muted-foreground mt-1">{season.current.goal}</p>}
              <p className="text-xs text-muted-foreground mt-2">
                {fmt(season.current.startsOn)} — {fmt(season.current.endsOn)}
              </p>
            </div>
          )}

          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="w-4 h-4 text-teal-deep" />
              <p className="font-semibold text-foreground text-sm">The year's turning</p>
            </div>
            {(season?.seasons ?? []).filter((s: any) => s.startsOn && s.endsOn).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                The season calendar hasn't been set yet — it lives with the stewards.
              </p>
            ) : (
              <ul className="space-y-3">
                {(season?.seasons ?? [])
                  .filter((s: any) => s.startsOn && s.endsOn)
                  .sort((a: any, b: any) => a.startsOn.localeCompare(b.startsOn))
                  .map((s: any) => (
                    <li key={s.id ?? s.name} className="border border-border rounded-lg px-4 py-3">
                      <p className="text-sm font-medium text-foreground">{s.name}</p>
                      {s.goal && <p className="text-xs text-muted-foreground mt-0.5">{s.goal}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{fmt(s.startsOn)} — {fmt(s.endsOn)}</p>
                    </li>
                  ))}
              </ul>
            )}
            <p className="text-xs text-muted-foreground mt-4">
              Festival dates ride the season turnings above. To take part in
              shaping one, start at{" "}
              <Link href="/quests" className="text-teal-deep font-medium hover:underline">Quests</Link>{" "}
              or say hello through{" "}
              <Link href="/work-with-us" className="text-teal-deep font-medium hover:underline">Work With Us</Link>.
            </p>
          </div>
        </div>
      </section>
    </Layout>
  );
}
