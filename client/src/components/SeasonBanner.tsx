import { useEffect, useState } from "react";
import { Sun } from "lucide-react";

interface Season {
  name: string;
  theme: string;
  focus: string;
  startsOn: string;
  endsOn: string;
}

export default function SeasonBanner() {
  const [season, setSeason] = useState<Season | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/season")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setSeason(d); })
      .catch(() => { /* silent */ });
    return () => { alive = false; };
  }, []);

  if (!season?.name) return null;

  const end = new Date(season.endsOn);
  const daysLeft = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));

  return (
    <section className="bg-teal-deep/95 text-white py-4">
      <div className="container flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-center">
        <span className="inline-flex items-center gap-2 text-amber font-semibold text-sm tracking-widest uppercase">
          <Sun className="w-4 h-4" /> {season.name}
        </span>
        <span className="text-white/85 text-sm">{season.focus}</span>
        {daysLeft > 0 && (
          <span className="text-white/60 text-xs">{daysLeft} days until the season turns</span>
        )}
      </div>
    </section>
  );
}
