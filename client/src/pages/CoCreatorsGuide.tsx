import Layout from "@/components/Layout";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  BookOpen,
  ArrowRight,
  Heart,
  Users,
  Calendar,
  Zap,
  Target,
  Star,
  Compass,
  Crown,
  Home,
  Sparkles,
  TreePine,
  Circle,
  CheckCircle2,
  MessageCircle,
  MapPin,
  Leaf,
  DollarSign,
  TrendingUp,
  Lightbulb,
  HandshakeIcon,
  AlertCircle,
  GitBranch,
} from "lucide-react";

interface ScrollNavPill {
  id: string;
  label: string;
}

const navPills: ScrollNavPill[] = [
  { id: "r-ikigai", label: "R-Ikigai" },
  { id: "hearts", label: "Hearts Economy" },
  { id: "voice", label: "Voice & Governance" },
  { id: "spaces", label: "The Four Spaces" },
  { id: "progression", label: "Path of Growth" },
  { id: "good-neighbor", label: "Good Neighbor" },
];

const heartsItems = {
  earn: [
    { label: "Quests", range: "40-300 Hearts" },
    { label: "Circle Roles", range: "200-500/month" },
    { label: "Land Stewardship Shifts", range: "60-120" },
    { label: "Business Revenue Share", range: "Variable" },
  ],
  hold: [
    "Visible balance on your profile",
    "Reflects your contribution history",
    "Unlocks role eligibility",
    "Represents community trust",
  ],
  spend: [
    "Village dues & utilities",
    "Cafe & shop services",
    "Community offerings",
    "Convert to cash (5% fee)",
  ],
};

const spaces = [
  {
    id: "village-steward",
    title: "Village Steward Space",
    color: "bg-teal-light",
    textColor: "text-teal-deep",
    icon: Users,
    description: "Coordinates overall village success, open to all path members",
  },
  {
    id: "resident",
    title: "Resident Space",
    color: "bg-sage-light",
    textColor: "text-sage",
    icon: Home,
    description: "Governs residential life and neighbor relations",
  },
  {
    id: "prosperity",
    title: "Prosperity Space",
    color: "bg-amber-light",
    textColor: "text-amber",
    icon: TrendingUp,
    description: "Manages business interests and Hearts economy",
  },
  {
    id: "land",
    title: "Land Stewardship Space",
    color: "bg-green-light",
    textColor: "text-green-600",
    icon: TreePine,
    description: "Cares for land and ecosystem health",
  },
];

const progressionStages = [
  { label: "Visitor", phase: "early" },
  { label: "Guest", phase: "early" },
  { label: "Immersant", phase: "early" },
  { label: "Participant", phase: "early" },
  { label: "Member", phase: "member", subLabel: "(Amoracita)" },
  { label: "Contributor", phase: "member" },
  { label: "Quest Seeker", phase: "member" },
  { label: "Initiate", phase: "cocreator" },
  { label: "Co-Creator", phase: "cocreator" },
  { label: "Role Holder", phase: "cocreator" },
  { label: "Guide", phase: "guide", subLabel: "(7+ years)" },
  { label: "Sage", phase: "sage", subLabel: "(21+ years)" },
];

const goodNeighborPillars = [
  {
    icon: Heart,
    title: "Love Letter Values",
    description: "Commitment to community values",
  },
  {
    icon: MessageCircle,
    title: "Authentic Communication",
    description: "Resolve conflicts with integrity",
  },
  {
    icon: DollarSign,
    title: "Financial Stability",
    description: "Meet community dues",
  },
  {
    icon: Users,
    title: "Governance Participation",
    description: "Active in decision-making",
  },
];

const ctaCards = [
  {
    title: "The Love Letter",
    description: "Read our community covenant and founding values",
    icon: Heart,
    href: "/love-letter",
    external: false,
    color: "text-primary",
  },
  {
    title: "Find Your Quest",
    description: "Discover opportunities that match your gifts",
    icon: Compass,
    href: "/quests",
    external: false,
    color: "text-teal-deep",
  },
  {
    title: "Join Community Call",
    description: "Meet us live and ask your questions",
    icon: Calendar,
    href: "https://amora.cr/event/discover-amora-webinar-qa/",
    external: true,
    color: "text-sage",
  },
];

export default function CoCreatorsGuide() {
  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <Layout>
      {/* HERO SECTION */}
      <section className="py-24 bg-teal-deep text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-10 w-64 h-64 bg-white rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-20 w-80 h-80 bg-white rounded-full blur-3xl" />
        </div>
        <div className="container relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <BookOpen className="w-16 h-16 mx-auto mb-6 opacity-90" />
              <h1 className="font-display text-5xl md:text-6xl font-bold mb-6 leading-tight">
                The Co-Creators Guide
              </h1>
              <p className="text-lg md:text-xl text-white/90 leading-relaxed max-w-2xl mx-auto">
                Step into the infinite journey of co-creation. This guide illuminates the
                pathways, structures, and principles that make Amora a regenerative village
                where all beings belong.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* QUICK NAV BAR */}
      <section className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-muted">
        <div className="container py-4">
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 min-w-min">
              {navPills.map((pill) => (
                <motion.button
                  key={pill.id}
                  onClick={() => scrollToSection(pill.id)}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap
                    bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  {pill.label}
                </motion.button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* R-IKIGAI SECTION */}
      <section id="r-ikigai" className="py-20 bg-background">
        <div className="container">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-5xl mx-auto"
          >
            <div className="mb-12">
              <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-3">
                Your R-Ikigai
              </h2>
              <p className="text-muted-foreground text-lg">
                The intersection of what you love, what you're good at, what Amora needs,
                and what earns you Hearts.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-12 items-center">
              {/* VENN DIAGRAM */}
              <div className="relative w-full h-80 flex items-center justify-center">
                <svg viewBox="0 0 400 400" className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                  {/* Top: Passion */}
                  <circle
                    cx="200"
                    cy="130"
                    r="90"
                    fill="rgba(244, 63, 94, 0.2)"
                    stroke="rgba(244, 63, 94, 0.5)"
                    strokeWidth="2"
                  />
                  {/* Right: Skills */}
                  <circle
                    cx="280"
                    cy="240"
                    r="90"
                    fill="rgba(130, 201, 185, 0.2)"
                    stroke="rgba(130, 201, 185, 0.5)"
                    strokeWidth="2"
                  />
                  {/* Bottom: Regeneration */}
                  <circle
                    cx="120"
                    cy="240"
                    r="90"
                    fill="rgba(142, 168, 156, 0.2)"
                    stroke="rgba(142, 168, 156, 0.5)"
                    strokeWidth="2"
                  />
                  {/* Left: Hearts */}
                  <circle
                    cx="200"
                    cy="200"
                    r="60"
                    fill="rgba(251, 191, 36, 0.3)"
                    stroke="rgba(251, 191, 36, 0.6)"
                    strokeWidth="2"
                  />

                  {/* Labels */}
                  <text x="200" y="80" textAnchor="middle" className="text-sm font-bold fill-primary">
                    What You LOVE
                  </text>
                  <text x="320" y="260" textAnchor="middle" className="text-sm font-bold fill-sage">
                    What You&apos;re GOOD AT
                  </text>
                  <text x="80" y="320" textAnchor="middle" className="text-sm font-bold fill-sage">
                    What AMORA NEEDS
                  </text>
                  <text x="280" y="150" textAnchor="middle" className="text-sm font-bold fill-amber">
                    What Earns HEARTS
                  </text>

                  {/* Center */}
                  <text
                    x="200"
                    y="210"
                    textAnchor="middle"
                    className="text-lg font-bold fill-teal-deep"
                  >
                    Your
                  </text>
                  <text
                    x="200"
                    y="232"
                    textAnchor="middle"
                    className="text-lg font-bold fill-teal-deep"
                  >
                    R-Ikigai
                  </text>
                </svg>
              </div>

              {/* DESCRIPTIONS */}
              <div className="space-y-6">
                <div className="p-4 rounded-lg bg-primary/5 border-l-4 border-primary">
                  <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                    <Heart className="w-5 h-5 text-primary" />
                    What You LOVE (Passion)
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Your authentic desires and what brings you alive. What would you do
                    even if no one paid you?
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-sage/5 border-l-4 border-sage">
                  <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                    <Star className="w-5 h-5 text-sage" />
                    What You&apos;re GOOD AT (Skills)
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Your natural abilities, experience, and expertise. What do others
                    come to you for?
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-emerald-100/50 border-l-4 border-emerald-600">
                  <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                    <Leaf className="w-5 h-5 text-emerald-600" />
                    What AMORA NEEDS (Regeneration)
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    The gaps we need filled to create a thriving, regenerative community.
                    Where can you fill a real need?
                  </p>
                </div>

                <div className="p-4 rounded-lg bg-amber/5 border-l-4 border-amber">
                  <h4 className="font-bold text-foreground mb-2 flex items-center gap-2">
                    <DollarSign className="w-5 h-5 text-amber" />
                    What Earns HEARTS (Compensation)
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Roles, quests, and contributions that our community values and rewards.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* HEARTS ECONOMY SECTION */}
      <section id="hearts" className="py-20 bg-primary/5">
        <div className="container">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-12 text-center">
              <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-3">
                The Hearts Economy
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Hearts are our community currency, representing trust, contribution, and
                participation. They flow through the village, rewarding generosity and
                enabling members to thrive together.
              </p>
            </div>

            {/* THREE COLUMN CARDS */}
            <div className="grid md:grid-cols-3 gap-8 mb-12">
              {/* EARN */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0 }}
                className="bg-card rounded-xl p-8 border border-muted hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-lg bg-green-100 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  </div>
                  <h3 className="font-bold text-xl text-foreground">Earn Hearts</h3>
                </div>
                <div className="space-y-3">
                  {heartsItems.earn.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 pb-3 border-b border-muted last:border-0">
                      <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.range}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* HOLD */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="bg-card rounded-xl p-8 border border-muted hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-lg bg-teal-100 flex items-center justify-center">
                    <Heart className="w-6 h-6 text-teal-deep" />
                  </div>
                  <h3 className="font-bold text-xl text-foreground">Hold Hearts</h3>
                </div>
                <div className="space-y-3">
                  {heartsItems.hold.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 pb-3 border-b border-muted last:border-0">
                      <Star className="w-5 h-5 text-teal-deep mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-foreground">{item}</p>
                    </div>
                  ))}
                </div>
              </motion.div>

              {/* SPEND */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
                className="bg-card rounded-xl p-8 border border-muted hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-lg bg-amber-100 flex items-center justify-center">
                    <Zap className="w-6 h-6 text-amber" />
                  </div>
                  <h3 className="font-bold text-xl text-foreground">Spend Hearts</h3>
                </div>
                <div className="space-y-3">
                  {heartsItems.spend.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-3 pb-3 border-b border-muted last:border-0">
                      <ArrowRight className="w-5 h-5 text-amber mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-foreground">{item}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* HEARTS FLOW DIAGRAM */}
            <div className="bg-card rounded-xl p-8 border border-muted">
              <h3 className="font-bold text-lg text-foreground mb-6 text-center">
                How Hearts Flow Through Amora
              </h3>
              <div className="flex flex-col md:flex-row items-center justify-center gap-4 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="px-4 py-2 bg-green-100 rounded-lg text-sm font-medium text-green-900">
                    Contribution
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-4 py-2 bg-primary/10 rounded-lg text-sm font-medium text-primary">
                    Hearts Earned
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="flex items-center gap-3">
                  <div className="px-4 py-2 bg-teal-100 rounded-lg text-sm font-medium text-teal-deep">
                    Community Spending
                  </div>
                  <ArrowRight className="w-5 h-5 text-muted-foreground" />
                </div>
                <div className="px-4 py-2 bg-sage-light rounded-lg text-sm font-medium text-sage">
                  Regenerative Loop
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>


      {/* VOICE & GOVERNANCE SECTION */}
      <section id="voice" className="py-20 bg-background">
        <div className="container">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-12 text-center">
              <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-3">
                Voice & Governance
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Amora practices consent-based decision making where everyone's voice matters,
                circles hold authority within their domains, and all concerns are heard.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-12">
              {/* HOW PROPOSALS WORK */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0 }}
              >
                <h3 className="font-bold text-2xl text-foreground mb-6">How Proposals Work</h3>
                <div className="space-y-4">
                  {[
                    {
                      step: "1",
                      title: "Proposal",
                      description:
                        "Anyone can raise a proposal for action or change. Proposals are presented clearly with context and goals.",
                    },
                    {
                      step: "2",
                      title: "Clarification",
                      description:
                        "The circle asks clarifying questions. This isn't debate, just understanding. Proposals may be refined.",
                    },
                    {
                      step: "3",
                      title: "Consent",
                      description:
                        "We look for consent, not unanimous agreement. No reasoned objections means we move forward.",
                    },
                  ].map((item, idx) => (
                    <div key={idx} className="flex gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="font-bold text-primary">{item.step}</span>
                      </div>
                      <div>
                        <h4 className="font-semibold text-foreground mb-1">{item.title}</h4>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 p-4 rounded-lg bg-sage/5 border border-sage/20">
                  <p className="text-sm text-foreground">
                    <span className="font-semibold">Monthly All-Village Calls:</span> Major cross-circle
                    decisions happen here, with full transparency and participation.
                  </p>
                </div>
              </motion.div>

              {/* KEY PRINCIPLES */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="space-y-4"
              >
                <h3 className="font-bold text-2xl text-foreground mb-6">Key Principles</h3>

                <div className="p-4 rounded-lg border-2 border-primary bg-primary/5">
                  <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Circle className="w-5 h-5 text-primary" />
                    Circles Hold Authority
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    Each circle has decision-making power within its domain. No single person
                    overrides the circle.
                  </p>
                </div>

                <div className="p-4 rounded-lg border-2 border-teal-light bg-teal-light/5">
                  <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <MessageCircle className="w-5 h-5 text-teal-deep" />
                    Objections vs. Disagreements
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    A reasoned objection blocks progress. A disagreement is noted but doesn't
                    stop the work. Know the difference.
                  </p>
                </div>

                <div className="p-4 rounded-lg border-2 border-sage bg-sage/5">
                  <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <Users className="w-5 h-5 text-sage" />
                    Consent Culture
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    We're not seeking unanimous agreement. We're looking for no reasoned
                    objections. That's enough to move forward.
                  </p>
                </div>

                <div className="p-4 rounded-lg border-2 border-amber bg-amber/5">
                  <h4 className="font-semibold text-foreground mb-2 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5 text-amber" />
                    Anyone Can Raise Concerns
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    If you see a problem, speak up. Concerns shape better decisions. Silence
                    isn't consent.
                  </p>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* THE FOUR SPACES SECTION */}
      <section id="spaces" className="py-20 bg-primary/5">
        <div className="container">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-12 text-center">
              <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-3">
                The Four Spaces
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Amora is organized into four interconnected circles, each stewarding
                a different dimension of our community.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {spaces.map((space, idx) => (
                <motion.div
                  key={space.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  id={space.id}
                  className={`${space.color} rounded-xl p-8 border border-muted/20 hover:shadow-lg transition-shadow`}
                >
                  <div className="flex items-start gap-4 mb-4">
                    <div className="w-12 h-12 rounded-lg bg-white/20 flex items-center justify-center flex-shrink-0">
                      <space.icon className={`w-6 h-6 ${space.textColor}`} />
                    </div>
                    <h3 className={`font-bold text-xl ${space.textColor}`}>
                      {space.title}
                    </h3>
                  </div>
                  <p className="text-foreground text-sm leading-relaxed">
                    {space.description}
                  </p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* PATH OF GROWTH SECTION */}
      <section id="progression" className="py-20 bg-background">
        <div className="container">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-12 text-center">
              <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-3">
                Path of Growth
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Your journey through Amora, from first contact to deepest participation.
                Each stage has its own gifts and responsibilities.
              </p>
            </div>

            {/* PROGRESSION TIMELINE */}
            <div className="max-w-5xl mx-auto mb-16">
              <div className="relative">
                {/* RESPONSIVE GRID */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  {progressionStages.map((stage, idx) => {
                    let bgColor = "bg-muted";
                    let textColor = "text-muted-foreground";

                    if (stage.phase === "member") {
                      bgColor = "bg-primary/10";
                      textColor = "text-primary";
                    } else if (stage.phase === "cocreator") {
                      bgColor = "bg-teal-light/10";
                      textColor = "text-teal-deep";
                    } else if (stage.phase === "guide") {
                      bgColor = "bg-blue-100";
                      textColor = "text-blue-900";
                    } else if (stage.phase === "sage") {
                      bgColor = "bg-amber-100";
                      textColor = "text-amber-900";
                    }

                    return (
                      <motion.div
                        key={stage.label}
                        initial={{ opacity: 0, scale: 0.9 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: idx * 0.05 }}
                        className="text-center"
                      >
                        <div className={`${bgColor} rounded-lg p-3 mb-2`}>
                          <p className={`text-xs md:text-sm font-semibold ${textColor}`}>
                            {stage.label}
                          </p>
                          {stage.subLabel && (
                            <p className={`text-xs ${textColor} opacity-70`}>
                              {stage.subLabel}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* GUIDE & SAGE DETAILS */}
            <div className="grid md:grid-cols-2 gap-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0 }}
                className="bg-blue-50 rounded-xl p-8 border border-blue-200"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Compass className="w-8 h-8 text-blue-900" />
                  <h3 className="font-bold text-2xl text-blue-900">Guide</h3>
                </div>
                <p className="text-blue-800 mb-4">
                  After 7+ years of deep participation, you become a Guide. Guides mentor
                  others, hold institutional memory, and help newer members navigate their
                  journey.
                </p>
                <p className="text-sm text-blue-700">
                  <span className="font-semibold">Responsibilities:</span> Mentorship, wisdom
                  sharing, ceremony holding, and intergenerational connection.
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
                className="bg-amber-50 rounded-xl p-8 border border-amber-200"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Crown className="w-8 h-8 text-amber-900" />
                  <h3 className="font-bold text-2xl text-amber-900">Sage</h3>
                </div>
                <p className="text-amber-800 mb-4">
                  After 21+ years, a Guide may become a Sage. Sages are the living embodiment
                  of Amora's values and vision, holding space for the village's evolution.
                </p>
                <p className="text-sm text-amber-700">
                  <span className="font-semibold">Responsibilities:</span> Long-term vision,
                  values stewardship, conflict resolution, and community healing.
                </p>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* GOOD NEIGHBOR SECTION */}
      <section id="good-neighbor" className="py-20 bg-primary/5">
        <div className="container">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-12 text-center">
              <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-3">
                Good Neighbor Criteria
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                To become a resident of Amora, you commit to embodying these four pillars.
              </p>
            </div>

            {/* FOUR PILLAR CARDS */}
            <div className="grid md:grid-cols-4 gap-6 mb-12">
              {goodNeighborPillars.map((pillar, idx) => (
                <motion.div
                  key={pillar.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="text-center"
                >
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <pillar.icon className="w-8 h-8 text-primary" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-2">{pillar.title}</h3>
                  <p className="text-sm text-muted-foreground">{pillar.description}</p>
                </motion.div>
              ))}
            </div>

            {/* LINK TO FULL DOCUMENT */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="bg-card rounded-xl p-8 border border-muted text-center max-w-2xl mx-auto"
            >
              <p className="text-muted-foreground mb-6">
                The Good Neighbor Criteria are essential for anyone seeking to become a
                Resident. They reflect our commitment to authentic community and mutual
                respect.
              </p>
              <Link href="/good-neighbor">
                <a className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-opacity">
                  Read the Full Good Neighbor Document
                  <ArrowRight className="w-4 h-4" />
                </a>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>


      {/* CTA SECTION */}
      <section className="py-20 bg-background">
        <div className="container">
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="text-center mb-12">
              <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-3">
                Ready to Begin?
              </h2>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                The infinite journey starts with a single step. Choose your path below.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {ctaCards.map((card, idx) => (
                <motion.div
                  key={card.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: idx * 0.1 }}
                  className="group"
                >
                  {card.external ? (
                    <a
                      href={card.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="h-full block bg-card rounded-xl p-8 border border-muted
                        hover:border-primary hover:shadow-lg hover:translate-y-1 transition-all duration-300 cursor-pointer"
                    >
                      <div className="mb-6">
                        <card.icon className={`w-12 h-12 ${card.color}`} />
                      </div>
                      <h3 className="font-bold text-xl text-foreground mb-2">
                        {card.title}
                      </h3>
                      <p className="text-muted-foreground text-sm mb-6">
                        {card.description}
                      </p>
                      <div className="flex items-center gap-2 text-primary font-semibold">
                        Learn More
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </div>
                    </a>
                  ) : (
                    <Link href={card.href}>
                      <a className="h-full block bg-card rounded-xl p-8 border border-muted
                        hover:border-primary hover:shadow-lg hover:translate-y-1 transition-all duration-300 cursor-pointer">
                        <div className="mb-6">
                          <card.icon className={`w-12 h-12 ${card.color}`} />
                        </div>
                        <h3 className="font-bold text-xl text-foreground mb-2">
                          {card.title}
                        </h3>
                        <p className="text-muted-foreground text-sm mb-6">
                          {card.description}
                        </p>
                        <div className="flex items-center gap-2 text-primary font-semibold">
                          Learn More
                          <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </a>
                    </Link>
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* FOOTER WISDOM */}
      <section className="py-16 bg-teal-deep text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full blur-3xl" />
        </div>
        <div className="container relative z-10">
          <div className="max-w-2xl mx-auto text-center">
            <p className="text-lg italic text-white/90 leading-relaxed">
              "Amora is an infinite journey, one undertaken not to win, but to keep creating
              together. We co-become the most beautiful village, where all beings belong and
              thrive. Success is measured not by competition, but by the flourishing of our
              community, land, and relationships."
            </p>
            <div className="mt-8 flex items-center justify-center gap-4 text-white/70">
              <Heart className="w-5 h-5" />
              <span className="text-sm">Welcome to Amora</span>
              <Heart className="w-5 h-5" />
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
