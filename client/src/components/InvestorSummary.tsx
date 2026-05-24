import { useEffect, useState } from "react";
import {
  DollarSign,
  Shield,
  TrendingUp,
  Percent,
  Calendar,
  ArrowRight,
  Users,
  Info,
} from "lucide-react";

interface SummaryDetail {
  id: string;
  label: string;
  value: string;
  note: string;
  icon: string;
}

interface InvestorSummaryData {
  headline: string;
  intro: string;
  details: SummaryDetail[];
  disclaimer: string;
  cta_label: string;
  cta_url: string;
}

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dollar: DollarSign,
  shield: Shield,
  "trending-up": TrendingUp,
  percent: Percent,
  calendar: Calendar,
  "arrow-right": ArrowRight,
  users: Users,
};

export default function InvestorSummary() {
  const [data, setData] = useState<InvestorSummaryData | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/investor-summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setData(d); })
      .catch(() => { /* ignore */ });
    return () => { alive = false; };
  }, []);

  if (!data) return null;

  return (
    <section className="bg-teal-deep text-white py-20">
      <div className="container max-w-5xl mx-auto px-4">
        <div className="text-center mb-12">
          <span className="inline-block text-xs tracking-widest uppercase text-amber font-semibold mb-3">
            Investment Summary
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-3">
            {data.headline}
          </h2>
          <p className="text-white/75 max-w-2xl mx-auto">{data.intro}</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
          {data.details.map((d) => {
            const Icon = ICONS[d.icon] ?? Info;
            const placeholder = d.value === "To be confirmed";
            return (
              <div
                key={d.id}
                className="bg-white/5 border border-white/10 rounded-2xl p-5 backdrop-blur"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-amber/15 text-amber flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <span className="text-xs uppercase tracking-widest text-white/60 font-semibold">
                    {d.label}
                  </span>
                </div>
                <div className={`text-xl font-display font-bold mb-2 ${placeholder ? "italic text-white/50" : "text-white"}`}>
                  {d.value}
                </div>
                <p className="text-sm text-white/65 leading-relaxed">{d.note}</p>
              </div>
            );
          })}
        </div>

        {data.cta_url && data.cta_label && (
          <div className="text-center mb-8">
            <a
              href={data.cta_url}
              className="inline-flex items-center gap-2 bg-amber text-teal-deep font-semibold px-6 py-3 rounded-xl hover:bg-amber/90 transition-colors"
            >
              {data.cta_label}
              <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        )}

        {data.disclaimer && (
          <p className="text-xs text-white/45 max-w-3xl mx-auto text-center leading-relaxed">
            {data.disclaimer}
          </p>
        )}
      </div>
    </section>
  );
}
