import { Sun, Sunrise } from "lucide-react";
import { useSeason } from "@/lib/gameApi";

/** The season strap. The server decides which season is current from today's
 *  date, so this can show an upcoming season or nothing at all — but it will
 *  never keep advertising a season that has already turned. */
export default function SeasonBanner() {
  const season = useSeason();
  if (!season) return null;

  const active = season.current;
  const next = season.upcoming;

  // Between seasons: name what's coming rather than lying about what's here.
  if (!active) {
    if (!next?.name) return null;
    return (
      <section className="bg-teal-deep text-white py-4">
        <div className="container flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-center">
          <span className="inline-flex items-center gap-2 text-amber font-semibold text-sm tracking-widest uppercase">
            <Sunrise className="w-4 h-4" /> {next.name}
          </span>
          {next.focus && <span className="text-white text-sm">{next.focus}</span>}
          <span className="text-white text-xs">
            {season.daysUntilStart > 0
              ? `begins in ${season.daysUntilStart} day${season.daysUntilStart === 1 ? "" : "s"}`
              : "begins today"}
          </span>
        </div>
      </section>
    );
  }

  if (!active.name) return null;
  const goals = (active.goals ?? []).filter((g) => g.text.trim());
  const met = goals.filter((g) => g.done).length;

  return (
    <section className="bg-teal-deep text-white py-4">
      <div className="container flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-center">
        <span className="inline-flex items-center gap-2 text-amber font-semibold text-sm tracking-widest uppercase">
          <Sun className="w-4 h-4" /> {active.name}
        </span>
        {active.focus && <span className="text-white text-sm">{active.focus}</span>}
        {goals.length > 0 && (
          <span className="text-white text-xs">
            {met} of {goals.length} season goal{goals.length === 1 ? "" : "s"} met
          </span>
        )}
        {season.daysLeft > 0 && (
          <span className="text-white text-xs">
            {season.daysLeft} day{season.daysLeft === 1 ? "" : "s"} until the season turns
          </span>
        )}
      </div>
    </section>
  );
}
