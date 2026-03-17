import Layout from "@/components/Layout";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Users, 
  ArrowRight, 
  Heart, 
  Home, 
  Sparkles, 
  TreePine, 
  Building, 
  Leaf, 
  Calendar,
  Zap,
  ChevronDown,
  Stethoscope,
  BookOpen,
  Palette,
  DollarSign,
  Users2,
  Lightbulb
} from "lucide-react";
import { useState } from "react";

const circles = [
  {
    name: "Permaculture Council",
    subtitle: "Land Stewardship & Food Systems",
    description: "Cares for the land through regenerative agriculture, landscaping, and ecological restoration.",
    icon: Leaf,
    color: "bg-sage",
    textDark: false,
    domain: "Food systems, regenerative agriculture, landscaping, land stewardship",
    members: "Residents involved in farming, gardening, and land management",
    focus: ["Regenerative Agriculture", "Water & Energy Systems", "Wildlife & Ecosystem Care"]
  },
  {
    name: "Education Council",
    subtitle: "Learning & Development",
    description: "Supports children's education, adult learning, and knowledge sharing across the community.",
    icon: BookOpen,
    color: "bg-teal",
    textDark: false,
    domain: "Children's education, adult learning, knowledge sharing",
    members: "Parents, teachers, educational facilitators",
    focus: ["Children's School", "Adult Learning Programs", "Knowledge Sharing"]
  },
  {
    name: "Culture & Arts Council",
    subtitle: "Creative Expression",
    description: "Cultivates artistic expression, musical events, and cultural programming for the community.",
    icon: Palette,
    color: "bg-amber",
    textDark: true,
    domain: "Musical events, artistic expression, cultural programming",
    members: "Artists, musicians, event organizers, cultural enthusiasts",
    focus: ["Cultural Events", "Artistic Programs", "Music & Performance"]
  },
  {
    name: "Health & Healing Council",
    subtitle: "Wellness & Care",
    description: "Coordinates wellness services, healing modalities, and community health initiatives.",
    icon: Stethoscope,
    color: "bg-teal-light",
    textDark: false,
    domain: "Wellness services, healing modalities, community health",
    members: "Health practitioners, wellness facilitators, fitness leaders",
    focus: ["Wellness Services", "Healing Modalities", "Community Health"]
  },
  {
    name: "Building & Village Council",
    subtitle: "Infrastructure & Maintenance",
    description: "Oversees construction, maintenance, infrastructure development, and architectural decisions.",
    icon: Building,
    color: "bg-teal-deep",
    textDark: false,
    domain: "Construction oversight, maintenance, infrastructure, architecture",
    members: "Construction-savvy residents, architects, designers, maintenance coordinators",
    focus: ["Construction Oversight", "Infrastructure", "Maintenance & Repairs"]
  },
  {
    name: "Business & Finance Council",
    subtitle: "Economic Sustainability",
    description: "Governs community financial decisions, business enterprises, and economic sustainability.",
    icon: DollarSign,
    color: "bg-gold",
    textDark: true,
    domain: "Community financial governance, enterprises, financial sustainability, local economy",
    members: "Entrepreneurs, business operators, financial managers, residents with financial expertise",
    focus: ["Financial Governance", "Business Development", "Hearts Economy"]
  },
  {
    name: "Community Life Council",
    subtitle: "Social Connection",
    description: "Coordinates social events, conflict resolution, and community celebrations.",
    icon: Users2,
    color: "bg-sage-light",
    textDark: true,
    domain: "Social coordination, conflict resolution, celebrations",
    members: "Social coordinators, facilitators, community builders, local representation",
    focus: ["Social Coordination", "Conflict Resolution", "Celebrations & Events"]
  },
  {
    name: "Intergenerational Wisdom Council",
    subtitle: "Wisdom & Rights of Nature",
    description: "Bridges generations through elder care, children's advocacy, indigenous practices, and rights of nature.",
    icon: Lightbulb,
    color: "bg-teal-light",
    textDark: false,
    domain: "Elder care, children's advocacy, indigenous practices, rights of nature, rites of passage",
    members: "Elders, parents, indigenous wisdom keepers, earth-centered practitioners",
    focus: ["Elder Care", "Children's Advocacy", "Indigenous Wisdom", "Rights of Nature"]
  },
];

export default function Circles() {
  const [expandedCircle, setExpandedCircle] = useState<string | null>(null);

  return (
    <Layout>
      <section className="py-24 bg-background">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <div className="w-16 h-16 rounded-full bg-sage/10 flex items-center justify-center mx-auto mb-6">
              <Users className="w-8 h-8 text-sage" />
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
              Our Sociocratic Circles
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-6">
              Eight domain-specific circles provide self-governance while staying connected to the whole community through elected representatives and consent-based decision-making.
            </p>
            <Link href="/roles" className="inline-flex items-center gap-2 px-6 py-3 bg-sage text-white rounded-lg hover:bg-sage/90 transition-colors font-medium">
              View Roles & Leadership Structure
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>

          <div className="max-w-4xl mx-auto">
            <div className="space-y-4">
              {circles.map((circle, index) => (
                <motion.div
                  key={circle.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                >
                  <button
                    onClick={() => setExpandedCircle(expandedCircle === circle.name ? null : circle.name)}
                    className="w-full text-left bg-card hover:bg-card/80 transition-colors p-6 rounded-xl border border-border"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className={`w-12 h-12 ${circle.color} rounded-lg flex items-center justify-center flex-shrink-0 mt-1`}>
                          <circle.icon className={`w-6 h-6 ${circle.textDark ? "text-foreground" : "text-white"}`} />
                        </div>
                        <div>
                          <h3 className="font-display text-xl font-bold text-foreground">
                            {circle.name}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            {circle.subtitle}
                          </p>
                        </div>
                      </div>
                      <ChevronDown 
                        className={`w-5 h-5 text-muted-foreground transition-transform flex-shrink-0 ${
                          expandedCircle === circle.name ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  <AnimatePresence>
                    {expandedCircle === circle.name && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="bg-muted/30 p-6 rounded-b-xl border border-t-0 border-border space-y-4">
                          <p className="text-foreground">
                            {circle.description}
                          </p>

                          <div className="grid md:grid-cols-2 gap-6">
                            <div>
                              <h4 className="font-semibold text-foreground mb-2">Domain</h4>
                              <p className="text-sm text-muted-foreground">
                                {circle.domain}
                              </p>
                            </div>
                            <div>
                              <h4 className="font-semibold text-foreground mb-2">Who Participates</h4>
                              <p className="text-sm text-muted-foreground">
                                {circle.members}
                              </p>
                            </div>
                          </div>

                          <div>
                            <h4 className="font-semibold text-foreground mb-3">Key Focus Areas</h4>
                            <div className="flex flex-wrap gap-2">
                              {circle.focus.map((area) => (
                                <span key={area} className={`px-3 py-1 rounded-full text-xs font-medium ${circle.color} ${circle.textDark ? "text-foreground" : "text-white"} shadow-sm`}>
                                  {area}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div className="pt-4 border-t border-border">
                            <p className="text-xs text-muted-foreground">
                              <strong>How it works:</strong> Open to all interested community members. Each circle elects a Representative and Facilitator (6-month terms). Monthly meetings with consent-based decision-making within domain authority. Representatives bring circle input to the Leadership Council.
                            </p>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-16 bg-sage/5 p-8 rounded-2xl border border-sage/20"
          >
            <h2 className="font-display text-2xl font-bold text-foreground mb-4">
              How Circles Work Together
            </h2>
            <div className="space-y-4 text-muted-foreground">
              <p>
                Each circle has <strong>full authority</strong> over day-to-day operations within its domain. When decisions affect multiple circles, the <strong>Leadership Council</strong> coordinates. Major financial decisions or community-wide policies require Leadership Council and/or Board approval.
              </p>
              <p>
                Circles use <strong>consent-based decision-making</strong>, where decisions move forward unless someone has a principled objection. This creates space for wisdom and prevents tyranny of the majority.
              </p>
              <p>
                All circles participate in a <strong>monthly community forum</strong> for feelings, emotions, and conflict resolution (1-2 hours), ensuring the whole community stays connected and healthy.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12 text-center"
          >
            <Link href="/roles">
              <a className="inline-flex items-center gap-2 px-6 py-3 bg-sage text-white rounded-lg hover:bg-sage/90 transition-colors font-medium">
                Learn About Roles & Leadership
                <ArrowRight className="w-4 h-4" />
              </a>
            </Link>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
