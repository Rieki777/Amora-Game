import Layout from "@/components/Layout";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { 
  Sparkles, 
  ArrowRight, 
  Calendar,
  Tent,
  Stethoscope,
  Coffee,
  Store,
  GraduationCap,
  Dumbbell,
  Palette,
  Leaf
} from "lucide-react";

const opportunities = [
  {
    title: "Retreat Center",
    description: "A 120-150 key wellness retreat facility offering transformational experiences, workshops, and healing programs.",
    icon: Tent,
    investment: "$5M - $10M",
    status: "Planning",
    details: [
      "120-150 guest rooms",
      "Multiple workshop spaces",
      "Spa and wellness facilities",
      "Farm-to-table restaurant",
    ],
  },
  {
    title: "Health & Wellness Center",
    description: "Integrative health services combining traditional and alternative medicine for residents and visitors.",
    icon: Stethoscope,
    investment: "$500K - $1.5M",
    status: "Planning",
    details: [
      "Primary care services",
      "Alternative therapies",
      "Mental health support",
      "Preventive wellness programs",
    ],
  },
  {
    title: "Café & Restaurant",
    description: "Farm-to-table dining experience showcasing local and organic produce from our regenerative farms.",
    icon: Coffee,
    investment: "$200K - $500K",
    status: "Planning",
    details: [
      "Organic menu",
      "Community gathering space",
      "Event hosting",
      "Coffee roasting",
    ],
  },
  {
    title: "Artisan Market",
    description: "A marketplace for local crafts, produce, and goods created by community members and regional artisans.",
    icon: Store,
    investment: "$100K - $300K",
    status: "Future",
    details: [
      "Local crafts and art",
      "Fresh produce",
      "Community goods",
      "Visitor souvenirs",
    ],
  },
  {
    title: "Learning Center",
    description: "Educational programs for children and adults, including a forest school and skill-sharing workshops.",
    icon: GraduationCap,
    investment: "$300K - $800K",
    status: "Future",
    details: [
      "Forest school",
      "Adult education",
      "Skill workshops",
      "Research programs",
    ],
  },
  {
    title: "Fitness & Recreation",
    description: "Fitness facilities and outdoor recreation programs for residents and retreat guests.",
    icon: Dumbbell,
    investment: "$150K - $400K",
    status: "Future",
    details: [
      "Yoga studio",
      "Fitness equipment",
      "Hiking programs",
      "Water activities",
    ],
  },
  {
    title: "Art & Culture Hub",
    description: "A creative space for artists, musicians, and cultural programs that enrich community life.",
    icon: Palette,
    investment: "$200K - $500K",
    status: "Future",
    details: [
      "Artist studios",
      "Performance space",
      "Gallery",
      "Music programs",
    ],
  },
  {
    title: "Regenerative Agriculture",
    description: "Farming operations that produce food for the community while regenerating the land.",
    icon: Leaf,
    investment: "$100K - $300K",
    status: "Active",
    details: [
      "Organic vegetables",
      "Fruit orchards",
      "Medicinal herbs",
      "Permaculture design",
    ],
  },
];

const statusColors: Record<string, string> = {
  "Planning": "bg-teal-light/10 text-teal-light",
  "Future": "bg-muted text-muted-foreground",
  "Active": "bg-sage/10 text-sage",
};

export default function Opportunities() {
  return (
    <Layout>
      {/* Hero */}
      <section className="py-24 bg-teal-light text-white">
        <div className="container">
          <div className="max-w-3xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <Sparkles className="w-16 h-16 mb-6 opacity-80" />
              <h1 className="font-display text-4xl md:text-6xl font-bold mb-6">
                Business Opportunities
              </h1>
              <p className="text-xl text-white/80 leading-relaxed">
                Join our thriving village economy. These opportunities align business 
                success with community prosperity through our Gratitude revenue sharing model.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Opportunities Grid */}
      <section className="py-20 bg-background">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {opportunities.map((opp, index) => (
              <motion.div
                key={opp.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="bg-card p-8 rounded-2xl shadow-sm"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-14 h-14 rounded-xl bg-teal-light/10 flex items-center justify-center">
                    <opp.icon className="w-7 h-7 text-teal-light" />
                  </div>
                  <span className={`px-3 py-1 text-xs font-medium rounded-lg ${statusColors[opp.status]}`}>
                    {opp.status}
                  </span>
                </div>
                <h3 className="font-display text-2xl font-bold text-foreground mb-2">
                  {opp.title}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {opp.description}
                </p>
                <div className="mb-4">
                  <span className="text-sm font-medium text-foreground">Investment Range: </span>
                  <span className="text-sm text-teal-light font-semibold">{opp.investment}</span>
                </div>
                <ul className="space-y-2">
                  {opp.details.map((detail) => (
                    <li key={detail} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal-light" />
                      {detail}
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Revenue Sharing */}
      <section className="py-20 bg-teal-light/10">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Gratitude Revenue Sharing
            </h2>
            <p className="text-muted-foreground mb-8">
              All businesses at Amora share a percentage of revenue with the community, 
              paid in Gratitude. This creates alignment between business success and community 
              prosperity. The exact percentage is negotiated based on the business type 
              and community investment.
            </p>
            <Link
              href="/how-we-create"
              className="inline-flex items-center gap-2 text-teal-light font-medium hover:gap-3 transition-all"
            >
              Learn About the Gratitude Economy
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-background">
        <div className="container">
          <div className="max-w-2xl mx-auto text-center">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Interested in an Opportunity?
            </h2>
            <p className="text-muted-foreground mb-8">
              Join a community call to learn more about specific opportunities, 
              the application process, and how the economics work.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="https://amora.cr/event/discover-amora-webinar-qa/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 bg-teal-light text-white rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                <Calendar className="w-5 h-5" />
                Join Community Call
              </a>
              <Link
                href="/prosperity"
                className="px-8 py-4 bg-muted text-foreground rounded-lg font-semibold hover:bg-muted/80 transition-colors"
              >
                Prosperity Journey
              </Link>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
