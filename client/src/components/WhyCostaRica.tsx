import {
  ShieldCheck,
  Plane,
  Scale,
  Landmark,
  MapPin,
  TrendingUp,
} from "lucide-react";

const POINTS = [
  {
    icon: ShieldCheck,
    title: "Foreign Resident Rights",
    body:
      "Costa Rica explicitly protects foreign property ownership. Land Share Agreements are registered under Costa Rican Horizontal Condominium law, the same legal structure used by resorts and gated communities throughout the country.",
  },
  {
    icon: Plane,
    title: "Residency Pathways",
    body:
      "Costa Rica offers multiple legal residency programs including Pensionado ($1,000/month income), Rentista ($2,500/month), and Inversionista (investment-based). Amora actively helps residents navigate whichever pathway fits them.",
  },
  {
    icon: Scale,
    title: "Tax Environment",
    body:
      "No capital gains tax on real estate appreciation. No inheritance tax. Foreign income is not taxed in Costa Rica. Land appreciation has averaged double digits over the past decade in the Southern Zone.",
  },
  {
    icon: Landmark,
    title: "Political Stability",
    body:
      "Costa Rica has had no military since 1948. Ranked among the most stable democracies in Latin America. Strong rule of law and independent judiciary. Tourism and foreign investment are core to national identity.",
  },
  {
    icon: MapPin,
    title: "Southern Zone Location",
    body:
      "Dominicalito sits between Dominical and Uvita, 3.5 hours from San Jose, 20 min from Uvita airport (charter), 45 min from Quepos. Surf, national parks, and international infrastructure within reach.",
  },
  {
    icon: TrendingUp,
    title: "Why Now",
    body:
      "Property values in the Southern Zone have appreciated 113% in 16 months. Phase 1 infrastructure investment is underway. Founding member pricing won't last, each development phase resets the entry point.",
  },
];

export default function WhyCostaRica() {
  return (
    <section className="bg-sage/15 py-20">
      <div className="container max-w-5xl mx-auto px-4">
        <div className="text-center mb-12">
          <span className="inline-block text-xs tracking-widest uppercase text-teal-deep font-semibold mb-3">
            Location & Context
          </span>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-teal-deep mb-3">
            Why Costa Rica, Why Now
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            The legal, financial, and practical reasons this place and this moment make sense.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {POINTS.map((p) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 flex gap-4"
              >
                <div className="shrink-0 w-12 h-12 rounded-xl bg-teal-deep/10 text-teal-deep flex items-center justify-center">
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-lg font-semibold text-teal-deep mb-1.5">
                    {p.title}
                  </h3>
                  <p className="text-sm text-stone-600 leading-relaxed">{p.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
