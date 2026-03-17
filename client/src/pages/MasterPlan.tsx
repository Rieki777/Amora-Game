import Layout from "@/components/Layout";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { 
  Map, 
  ArrowRight, 
  Calendar,
  Home,
  Tent,
  TreePine,
  Droplets,
  Mountain,
  Users,
  Building
} from "lucide-react";

const HERO_IMAGE = "https://amora.cr/wp-content/uploads/2025/11/Our-Intentional-Community-Amora-Background.jpg";

const stats = [
  { label: "Total Acres", value: "300+", icon: Mountain },
  { label: "Planned Homes", value: "150+", icon: Home },
  { label: "Retreat Keys", value: "120-150", icon: Tent },
  { label: "Appraised Value", value: "$16M+", icon: Building },
];

const zones = [
  {
    title: "Village Center",
    description: "The heart of Amora featuring the community center, café, market, and gathering spaces.",
    icon: Users,
    features: ["Community Center", "Café & Restaurant", "Artisan Market", "Event Spaces"],
  },
  {
    title: "Residential Neighborhoods",
    description: "Clustered housing areas designed for community connection while maintaining privacy.",
    icon: Home,
    features: ["150+ home sites", "Various lot sizes", "Walking paths", "Community gardens"],
  },
  {
    title: "Retreat & Wellness",
    description: "The retreat center and health facilities serving guests and residents.",
    icon: Tent,
    features: ["120-150 key retreat", "Health Center", "Spa facilities", "Workshop spaces"],
  },
  {
    title: "Agricultural Land",
    description: "Regenerative farms and food forests providing sustenance for the community.",
    icon: TreePine,
    features: ["Organic gardens", "Food forest", "Medicinal herbs", "Livestock areas"],
  },
  {
    title: "Commons & Conservation",
    description: "Protected natural areas, trails, and shared spaces for all to enjoy.",
    icon: Droplets,
    features: ["Nature preserves", "Hiking trails", "Water features", "Wildlife corridors"],
  },
];

export default function MasterPlan() {
  return (
    <Layout>
      {/* Hero */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={HERO_IMAGE}
            alt="Amora Master Plan"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/60 to-black/40" />
        </div>

        <div className="container relative z-10">
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Map className="w-16 h-16 text-white mb-6 opacity-80" />
              <h1 className="font-display text-4xl md:text-6xl font-bold text-white mb-6">
                The Amora Master Plan
              </h1>
              <p className="text-xl text-white/80 leading-relaxed">
                Our vision for a regenerative village that harmonizes human habitation 
                with the natural beauty of Costa Rica's mountains.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section className="py-12 bg-teal-deep text-white">
        <div className="container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="text-center"
              >
                <stat.icon className="w-8 h-8 mx-auto mb-2 opacity-80" />
                <div className="font-display text-3xl md:text-4xl font-bold mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-white/70">{stat.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Vision */}
      <section className="py-20 bg-background">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center mb-16">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Our Vision
            </h2>
            <p className="text-muted-foreground text-lg leading-relaxed">
              Amora is designed as a complete village ecosystem—a place where people live, 
              work, learn, and thrive together. Our master plan balances development with 
              conservation, ensuring that the land regenerates even as we build upon it.
            </p>
          </div>

          {/* Zones */}
          <div className="space-y-8 max-w-4xl mx-auto">
            {zones.map((zone, index) => (
              <motion.div
                key={zone.title}
                initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="bg-card p-8 rounded-2xl shadow-sm"
              >
                <div className="flex items-start gap-6">
                  <div className="w-14 h-14 rounded-xl bg-teal-deep/10 flex items-center justify-center flex-shrink-0">
                    <zone.icon className="w-7 h-7 text-teal-deep" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-display text-2xl font-bold text-foreground mb-2">
                      {zone.title}
                    </h3>
                    <p className="text-muted-foreground mb-4">
                      {zone.description}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {zone.features.map((feature) => (
                        <span
                          key={feature}
                          className="px-3 py-1 bg-muted text-muted-foreground text-sm rounded-full"
                        >
                          {feature}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Appraisal Info */}
      <section className="py-20 bg-aqua-light">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <Building className="w-12 h-12 text-teal-deep mx-auto mb-6" />
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Land Valuation
            </h2>
            <p className="text-muted-foreground mb-6">
              A January 2026 appraisal valued the property at over <strong>$16 million</strong>. 
              We are currently awaiting an additional appraisal for the section of land 
              that will be held in commons for conservation and community use.
            </p>
            <p className="text-muted-foreground">
              This valuation supports our financing strategy and demonstrates the 
              significant asset base underlying the Amora project.
            </p>
            <a
              href="https://amora.cr/wp-content/uploads/2025/11/Our-Intentional-Community-Amora-Background.jpg"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-6 px-6 py-3 bg-teal-deep text-white rounded-lg font-semibold hover:opacity-90 transition-opacity"
            >
              <Map className="w-5 h-5" />
              View Full Master Plan PDF
            </a>
          </div>
        </div>
      </section>

      {/* Development Timeline */}
      <section className="py-20 bg-background">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Development Phases
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              With a potential 1% regenerative development loan, multiple phases can 
              proceed simultaneously, accelerating our timeline significantly.
            </p>
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="space-y-4">
              {[
                { phase: "Infrastructure", items: "Roads, utilities, water systems", status: "In Progress" },
                { phase: "Community Center", items: "Café, gathering spaces, offices", status: "Planning" },
                { phase: "Show Homes", items: "10 homes of various styles", status: "Planning" },
                { phase: "Retreat Center", items: "120-150 key wellness facility", status: "Planning" },
                { phase: "Health Center", items: "Integrative health services", status: "Planning" },
                { phase: "Residential Phase 1", items: "First 50 home sites", status: "Future" },
              ].map((item, index) => (
                <motion.div
                  key={item.phase}
                  initial={{ opacity: 0, y: 10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  className="flex items-center justify-between p-4 bg-card rounded-lg"
                >
                  <div>
                    <div className="font-semibold text-foreground">{item.phase}</div>
                    <div className="text-sm text-muted-foreground">{item.items}</div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    item.status === "In Progress" ? "bg-sage/10 text-sage" :
                    item.status === "Planning" ? "bg-teal-light/10 text-teal-light" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {item.status}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-teal-deep text-white">
        <div className="container">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
              Be Part of the Vision
            </h2>
            <p className="text-white/80 mb-8">
              Whether you want to invest, live, work, or create at Amora, 
              there's a place for you in our master plan.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="https://amora.cr/event/discover-amora-webinar-qa/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 bg-white text-teal-deep rounded-lg font-semibold hover:bg-white/90 transition-colors flex items-center gap-2"
              >
                <Calendar className="w-5 h-5" />
                Join Community Call
              </a>
              <Link
                href="/"
                className="px-8 py-4 bg-white/20 text-white rounded-lg font-semibold hover:bg-white/30 transition-colors"
              >
                Choose Your Path
              </Link>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
