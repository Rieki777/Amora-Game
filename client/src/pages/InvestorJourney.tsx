import Layout from "@/components/Layout";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  TrendingUp, 
  ArrowRight, 
  CheckCircle2,
  Circle,
  FileText,
  Calendar,
  DollarSign,
  Heart,
  Building,
  Users,
  Sparkles,
  ChevronDown,
  ExternalLink,
  X,
  Send,
  MapPin,
  Zap,
  BarChart3,
  MessageSquare
} from "lucide-react";

// New investor-focused image showing sustainable luxury development
const INVESTOR_IMAGE = "https://amora.cr/wp-content/uploads/2025/11/Shared-Governance-1024x683.jpg";

const journeySteps = [
  {
    id: "discover",
    stage: "Curious",
    title: "Discover Amora",
    description: "Learn about our vision, values, and regenerative approach to community development.",
    icon: Sparkles,
    action: "Join Community Call",
    link: "https://amora.cr/event/discover-amora-webinar-qa/",
    external: true,
    details: [
      "Understand our mission and values",
      "Learn about the land and location",
      "Meet the founding team",
      "Ask questions in a live Q&A"
    ]
  },
  {
    id: "request",
    stage: "Interested",
    title: "Request Investor Pack",
    description: "Receive comprehensive investor materials including feasibility study, proformas, and development timeline.",
    icon: FileText,
    action: "Request Pack",
    formType: "investor-pack",
    details: [
      "15-year financial proformas",
      "Feasibility study with market analysis",
      "Development timeline and phases",
      "Legal structure overview"
    ]
  },
  {
    id: "call",
    stage: "Exploring",
    title: "Schedule Investment Call",
    description: "Connect one-on-one with our team to discuss your investment goals and how they align with Amora.",
    icon: Calendar,
    action: "Schedule Call",
    formType: "investor-call",
    details: [
      "Discuss investment options",
      "Review financial projections",
      "Understand debt vs equity structures",
      "Explore your path to residency"
    ]
  },
  {
    id: "commit",
    stage: "Committed",
    title: "Make Your Commitment",
    description: "Choose your investment vehicle and formalize your contribution to the Amora vision.",
    icon: Heart,
    action: "Contact Team",
    link: "mailto:invest@amora.cr?subject=Investment%20Commitment",
    external: true,
    details: [
      "Select investment structure",
      "Review and sign agreements",
      "Transfer funds securely",
      "Receive investor updates"
    ]
  },
];

const investmentHighlights = [
  {
    title: "Debt Over Equity",
    description: "We prioritize debt financing to ensure the community maintains ownership. Investors who want to live at Amora are given priority.",
    icon: Heart,
    color: "bg-teal-deep/10 text-teal-deep",
  },
  {
    title: "$16M+ Appraisal",
    description: "Recent January 2026 appraisal values the property at over $16 million, with additional commons land appraisal pending.",
    icon: DollarSign,
    color: "bg-gold/10 text-gold",
  },
  {
    title: "1% Regenerative Loan",
    description: "We're exploring a low-interest regenerative development loan that would accelerate multiple development phases simultaneously.",
    icon: TrendingUp,
    color: "bg-sage/10 text-sage",
  },
  {
    title: "Community Ownership",
    description: "Our goal is for all Amora homes, structures, and businesses to be owned by residents and co-creators.",
    icon: Users,
    color: "bg-teal-light/10 text-teal-light",
  },
];

const developmentPhases = [
  { phase: "Resort & Retreat Center", units: "120-150 keys", status: "Planning", progress: 15 },
  { phase: "Health Center", units: "1 facility", status: "Planning", progress: 10 },
  { phase: "Community Center & Café", units: "1 facility", status: "Planning", progress: 20 },
  { phase: "Show Homes", units: "10 homes", status: "Planning", progress: 25 },
  { phase: "Residential Lots", units: "150+ lots", status: "Future", progress: 5 },
];

const financialMetrics = [
  {
    title: "Land Value",
    value: "+113%",
    subtext: "in 16 months",
    detail: "266 acres in Dominicalito, Costa Rica",
    icon: TrendingUp,
    color: "bg-teal-deep/10 text-teal-deep"
  },
  {
    title: "Appraisal",
    value: "$16M+",
    subtext: "January 2026",
    detail: "Current property valuation",
    icon: Building,
    color: "bg-gold/10 text-gold"
  },
  {
    title: "Projected IRR",
    value: "19.6%",
    subtext: "15-year model",
    detail: "Based on phased development",
    icon: BarChart3,
    color: "bg-coral/10 text-coral"
  },
  {
    title: "Target Raise",
    value: "$5M",
    subtext: "Phase 1",
    detail: "Infrastructure & retreat center",
    icon: Zap,
    color: "bg-sage/10 text-sage"
  }
];

const buyerPersonas = [
  {
    title: "Digital Nomad Couple",
    subtitle: "Invest from anywhere, build your future haven",
    icon: MapPin,
    color: "from-teal-deep to-teal-light"
  },
  {
    title: "Worldschooling Family",
    subtitle: "Create a home base while the world is your classroom",
    icon: Users,
    color: "from-gold to-coral"
  },
  {
    title: "Retiree/Snowbird",
    subtitle: "Your Costa Rica sanctuary with community and returns",
    icon: Heart,
    color: "from-sage to-teal-light"
  },
  {
    title: "Longevity Seeker",
    subtitle: "Where your years are extended by regenerative living",
    icon: Sparkles,
    color: "from-coral to-gold"
  },
  {
    title: "Remote Exec/Founder",
    subtitle: "Build wealth while building a better world",
    icon: TrendingUp,
    color: "from-teal-light to-sage"
  },
  {
    title: "Costa Rican/LatAm Professional",
    subtitle: "Invest in your homeland's regenerative future",
    icon: Building,
    color: "from-gold to-teal-deep"
  }
];

const faqItems = [
  {
    question: "What is the legal structure?",
    answer: "Amora uses a Horizontal Condominium under Costa Rican law, combined with a 508(c)(1)(a) community organization. Individual lot ownership with shared commons management."
  },
  {
    question: "What are my exit options?",
    answer: "Investors can exit through lot sale at appreciated value, business equity stake, or structured buy-back options. We prioritize liquidity for investors who need it."
  },
  {
    question: "How does debt vs equity work?",
    answer: "We prefer debt financing to keep community ownership intact. Investors lend to the project and receive interest plus priority on lot purchases."
  },
  {
    question: "Can I build on my investment?",
    answer: "Yes. Investors who become residents can build a home on their lot while contributing to the village vision."
  },
  {
    question: "What fees are involved?",
    answer: "Annual village contribution fee covers shared services, infrastructure maintenance, and circle operations. Exact amounts will be detailed in your investor pack."
  },
  {
    question: "How does governance work?",
    answer: "Resident investors gain voice in village decisions through our consent-based circle system. The more you contribute over time, the more governance weight you earn."
  },
  {
    question: "What is the minimum investment?",
    answer: "Minimum investment amounts vary by investment vehicle. Contact the team to discuss current options that match your capacity."
  },
  {
    question: "When is ROI expected?",
    answer: "The 15-year financial model projects significant returns from resort, retail, and residential components. Year-by-year projections are in the Investor Pack."
  }
];

export default function InvestorJourney() {
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [expandedStep, setExpandedStep] = useState<string | null>("discover");
  const [activeHighlight, setActiveHighlight] = useState(0);
  const [showPackForm, setShowPackForm] = useState(false);
  const [showCallForm, setShowCallForm] = useState(false);
  const [packFormData, setPackFormData] = useState({ name: "", email: "", investmentRange: "", message: "" });
  const [callFormData, setCallFormData] = useState({ name: "", email: "", preferredTime: "", message: "" });
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [expandedFaq, setExpandedFaq] = useState<string | null>(null);

  // Load progress from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("amora-investor-progress");
    if (saved) {
      setCompletedSteps(JSON.parse(saved));
    }
  }, []);

  // Save progress to localStorage
  const toggleStep = (stepId: string) => {
    const newCompleted = completedSteps.includes(stepId)
      ? completedSteps.filter(id => id !== stepId)
      : [...completedSteps, stepId];
    setCompletedSteps(newCompleted);
    localStorage.setItem("amora-investor-progress", JSON.stringify(newCompleted));
  };

  const progress = (completedSteps.length / journeySteps.length) * 100;

  const handlePackFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "investor-pack",
          data: packFormData
        })
      });
      if (response.ok) {
        setFormSuccess("Thank you! Jess will be in touch within 48 hours.");
        setShowPackForm(false);
        setPackFormData({ name: "", email: "", investmentRange: "", message: "" });
        setTimeout(() => setFormSuccess(null), 5000);
      }
    } catch (error) {
      console.error("Form submission error:", error);
    }
  };

  const handleCallFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "investor-call",
          data: callFormData
        })
      });
      if (response.ok) {
        setFormSuccess("Thank you! Jess will be in touch within 48 hours.");
        setShowCallForm(false);
        setCallFormData({ name: "", email: "", preferredTime: "", message: "" });
        setTimeout(() => setFormSuccess(null), 5000);
      }
    } catch (error) {
      console.error("Form submission error:", error);
    }
  };

  // Auto-rotate highlights
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveHighlight(prev => (prev + 1) % investmentHighlights.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <motion.img
            src={INVESTOR_IMAGE}
            alt="Sustainable luxury development"
            className="w-full h-full object-cover"
            initial={{ scale: 1.1 }}
            animate={{ scale: 1 }}
            transition={{ duration: 1.5 }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-background/60" />
        </div>

        <div className="container relative z-10">
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-3 mb-6"
            >
              <motion.div 
                className="w-12 h-12 rounded-xl bg-gold flex items-center justify-center"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <TrendingUp className="w-6 h-6 text-white" />
              </motion.div>
              <span className="text-gold font-medium tracking-wide uppercase text-sm">Capital Contributor Journey</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="font-display text-5xl md:text-6xl font-semibold text-foreground mb-6"
            >
              Invest in{" "}
              <span className="text-teal-deep italic">Regeneration</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-xl text-muted-foreground leading-relaxed mb-8"
            >
              Capital Contributors offer financial resources, credit lines, investments, 
              or other capital resources. We prioritize investors who want to live at Amora 
              and prefer debt over equity to ensure community ownership.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-wrap gap-4"
            >
              <a
                href="mailto:invest@amora.cr?subject=Investor%20Pack%20Request"
                className="btn-amora flex items-center gap-2"
              >
                <FileText className="w-5 h-5" />
                Request Investor Pack
              </a>
              <a
                href="https://amora.cr/event/discover-amora-webinar-qa/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-white/90 text-foreground rounded-full font-medium uppercase tracking-wider text-sm hover:bg-white transition-all flex items-center gap-2"
              >
                <Calendar className="w-5 h-5" />
                Join Community Call
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Financial Metrics Section */}
      <section className="py-20 bg-background border-t border-b border-muted">
        <div className="container">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
              Key Numbers
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
              Strong fundamentals backed by land appreciation and comprehensive financial projections.
            </p>
            <p className="text-xs text-muted-foreground italic max-w-2xl mx-auto">
              Past performance and projections are not guarantees of future results.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {financialMetrics.map((metric, index) => (
              <motion.div
                key={metric.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -8 }}
                className={`${metric.color} rounded-xl p-8 shadow-sm transition-all`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    {metric.title}
                  </h3>
                  <metric.icon className="w-6 h-6 opacity-60" />
                </div>
                <div className="mb-2">
                  <div className="font-display text-4xl font-semibold text-foreground">
                    {metric.value}
                  </div>
                  <div className="text-xs text-muted-foreground font-medium mt-1">
                    {metric.subtext}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {metric.detail}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Investment Highlights - Animated Carousel */}
      <section className="py-16 bg-cream">
        <div className="container">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
              Investment Philosophy
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Our approach ensures community ownership while creating sustainable returns.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {investmentHighlights.map((item, index) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -8, scale: 1.02 }}
                onHoverStart={() => setActiveHighlight(index)}
                className={`bg-card p-6 rounded-xl shadow-sm cursor-pointer transition-all ${
                  activeHighlight === index ? "ring-2 ring-coral shadow-lg" : ""
                }`}
              >
                <motion.div 
                  className={`w-12 h-12 rounded-lg ${item.color} flex items-center justify-center mb-4`}
                  animate={activeHighlight === index ? { scale: [1, 1.1, 1] } : {}}
                  transition={{ duration: 0.5 }}
                >
                  <item.icon className="w-6 h-6" />
                </motion.div>
                <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                  {item.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Who Invests in Amora Section */}
      <section className="py-20 bg-cream">
        <div className="container">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
              Who Invests in Amora?
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              People from all walks of life are building their future at Amora. See if your story is here.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {buyerPersonas.map((persona, index) => (
              <motion.div
                key={persona.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -8 }}
                className={`bg-gradient-to-br ${persona.color} rounded-xl p-8 shadow-sm text-white transition-all`}
              >
                <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center mb-4">
                  <persona.icon className="w-6 h-6" />
                </div>
                <h3 className="font-display text-xl font-semibold mb-2">
                  {persona.title}
                </h3>
                <p className="text-white/90 leading-relaxed">
                  {persona.subtitle}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Interactive Journey Steps */}
      <section className="py-20 bg-background">
        <div className="container">
          <div className="max-w-3xl mx-auto">
            <motion.div 
              className="text-center mb-8"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
                Your Investment Journey
              </h2>
              <p className="text-muted-foreground mb-6">
                Track your progress as you explore investment opportunities at Amora.
              </p>
              
              {/* Progress Bar */}
              <div className="relative h-3 bg-muted rounded-full overflow-hidden mb-2">
                <motion.div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-coral to-gold rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {completedSteps.length} of {journeySteps.length} steps completed
              </p>
            </motion.div>

            <div className="space-y-4">
              {journeySteps.map((step, index) => {
                const isCompleted = completedSteps.includes(step.id);
                const isExpanded = expandedStep === step.id;
                
                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                    className={`bg-card rounded-xl shadow-sm overflow-hidden transition-all ${
                      isCompleted ? "border-l-4 border-sage" : "border-l-4 border-transparent"
                    }`}
                  >
                    <div 
                      className="p-6 cursor-pointer"
                      onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                    >
                      <div className="flex items-start gap-4">
                        {/* Checkbox */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStep(step.id);
                          }}
                          className="flex-shrink-0 mt-1"
                        >
                          <motion.div
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.9 }}
                          >
                            {isCompleted ? (
                              <CheckCircle2 className="w-6 h-6 text-sage" />
                            ) : (
                              <Circle className="w-6 h-6 text-muted-foreground hover:text-teal-deep transition-colors" />
                            )}
                          </motion.div>
                        </button>

                        {/* Icon */}
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isCompleted ? "bg-sage/10" : "bg-teal-deep/10"
                        }`}>
                          <step.icon className={`w-6 h-6 ${isCompleted ? "text-sage" : "text-teal-deep"}`} />
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="inline-block px-2 py-1 bg-teal-deep/10 text-teal-deep text-xs font-semibold rounded-full">
                              Stage: {step.stage}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-4">
                            <h3 className={`font-display text-xl font-semibold ${
                              isCompleted ? "text-muted-foreground line-through" : "text-foreground"
                            }`}>
                              {step.title}
                            </h3>
                            <motion.div
                              animate={{ rotate: isExpanded ? 180 : 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <ChevronDown className="w-5 h-5 text-muted-foreground" />
                            </motion.div>
                          </div>
                          <p className="text-muted-foreground mt-1">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Details */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="px-6 pb-6 pt-2 ml-16">
                            <div className="bg-muted/50 rounded-lg p-4 mb-4">
                              <h4 className="font-medium text-foreground mb-3">What you'll accomplish:</h4>
                              <ul className="space-y-2">
                                {step.details.map((detail, i) => (
                                  <motion.li 
                                    key={i}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.1 }}
                                    className="flex items-center gap-2 text-sm text-muted-foreground"
                                  >
                                    <div className="w-1.5 h-1.5 rounded-full bg-teal-deep" />
                                    {detail}
                                  </motion.li>
                                ))}
                              </ul>
                            </div>
                            {step.formType === "investor-pack" ? (
                              <button
                                onClick={() => setShowPackForm(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-deep text-white rounded-full text-sm font-medium hover:bg-teal-deep-dark transition-colors"
                              >
                                {step.action}
                                <ArrowRight className="w-4 h-4" />
                              </button>
                            ) : step.formType === "investor-call" ? (
                              <button
                                onClick={() => setShowCallForm(true)}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-deep text-white rounded-full text-sm font-medium hover:bg-teal-deep-dark transition-colors"
                              >
                                {step.action}
                                <ArrowRight className="w-4 h-4" />
                              </button>
                            ) : (
                              <a
                                href={step.link}
                                target={step.external ? "_blank" : undefined}
                                rel={step.external ? "noopener noreferrer" : undefined}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-teal-deep text-white rounded-full text-sm font-medium hover:bg-teal-deep-dark transition-colors"
                              >
                                {step.action}
                                {step.external ? <ExternalLink className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                              </a>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Development Phases */}
      <section className="py-20 bg-teal-deep text-white">
        <div className="container">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-semibold mb-4">
              Development Phases
            </h2>
            <p className="text-white/70 max-w-2xl mx-auto">
              With the potential 1% regenerative development loan, multiple phases can proceed simultaneously.
            </p>
          </motion.div>

          <div className="max-w-3xl mx-auto">
            <div className="space-y-4">
              {developmentPhases.map((phase, index) => (
                <motion.div
                  key={phase.phase}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ x: 8 }}
                  className="bg-white/10 rounded-lg p-4 backdrop-blur-sm"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-4">
                      <Building className="w-5 h-5 text-gold" />
                      <div>
                        <div className="font-semibold">{phase.phase}</div>
                        <div className="text-sm text-white/60">{phase.units}</div>
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                      phase.status === "Planning" ? "bg-gold/20 text-gold" : "bg-white/20 text-white/70"
                    }`}>
                      {phase.status}
                    </span>
                  </div>
                  {/* Progress bar */}
                  <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-gradient-to-r from-gold to-coral rounded-full"
                      initial={{ width: 0 }}
                      whileInView={{ width: `${phase.progress}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 1, delay: index * 0.2 }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Investor FAQ */}
      <section className="py-20 bg-background">
        <div className="container">
          <motion.div 
            className="max-w-3xl mx-auto text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
              Investor FAQs
            </h2>
            <p className="text-muted-foreground">
              Answers to common questions about investing in Amora.
            </p>
          </motion.div>

          <div className="max-w-3xl mx-auto space-y-3">
            {faqItems.map((item, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.05 }}
                className="bg-card rounded-lg shadow-sm overflow-hidden"
              >
                <button
                  onClick={() => setExpandedFaq(expandedFaq === index.toString() ? null : index.toString())}
                  className="w-full p-6 text-left flex items-center justify-between hover:bg-muted/50 transition-colors"
                >
                  <h3 className="font-display text-lg font-semibold text-foreground pr-4">
                    {item.question}
                  </h3>
                  <motion.div
                    animate={{ rotate: expandedFaq === index.toString() ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                    className="flex-shrink-0"
                  >
                    <ChevronDown className="w-5 h-5 text-muted-foreground" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {expandedFaq === index.toString() && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-6 text-muted-foreground border-t border-muted pt-4">
                        {item.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gradient-to-br from-gold/10 to-coral/10">
        <div className="container">
          <motion.div 
            className="max-w-2xl mx-auto text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Sparkles className="w-12 h-12 text-teal-deep mx-auto mb-6" />
            </motion.div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
              Ready to Explore?
            </h2>
            <p className="text-muted-foreground mb-8">
              Connect with our team to discuss how Amora fits your investment goals.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <button
                onClick={() => setShowPackForm(true)}
                className="btn-amora flex items-center gap-2"
              >
                Request Investor Pack
                <ArrowRight className="w-5 h-5" />
              </button>
              <a
                href="#"
                className="px-6 py-3 bg-white/90 text-foreground rounded-full font-medium uppercase tracking-wider text-sm hover:bg-white transition-all flex items-center gap-2"
              >
                View Full Presentation
                <ExternalLink className="w-5 h-5" />
              </a>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Success Message */}
      <AnimatePresence>
        {formSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-4 right-4 bg-sage text-white px-6 py-3 rounded-full shadow-lg z-50"
          >
            {formSuccess}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Investor Pack Form Modal */}
      <AnimatePresence>
        {showPackForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowPackForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-2xl p-8 max-w-md w-full shadow-xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-display text-2xl font-semibold text-foreground">
                  Request Investor Pack
                </h3>
                <button
                  onClick={() => setShowPackForm(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handlePackFormSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Name</label>
                  <input
                    type="text"
                    value={packFormData.name}
                    onChange={(e) => setPackFormData({ ...packFormData, name: e.target.value })}
                    required
                    className="w-full px-4 py-2 bg-muted rounded-lg border border-muted text-foreground focus:outline-none focus:ring-2 focus:ring-teal-deep"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Email</label>
                  <input
                    type="email"
                    value={packFormData.email}
                    onChange={(e) => setPackFormData({ ...packFormData, email: e.target.value })}
                    required
                    className="w-full px-4 py-2 bg-muted rounded-lg border border-muted text-foreground focus:outline-none focus:ring-2 focus:ring-teal-deep"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Investment Range</label>
                  <input
                    type="text"
                    placeholder="e.g., $50K - $250K"
                    value={packFormData.investmentRange}
                    onChange={(e) => setPackFormData({ ...packFormData, investmentRange: e.target.value })}
                    className="w-full px-4 py-2 bg-muted rounded-lg border border-muted text-foreground focus:outline-none focus:ring-2 focus:ring-teal-deep"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Message (optional)</label>
                  <textarea
                    value={packFormData.message}
                    onChange={(e) => setPackFormData({ ...packFormData, message: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 bg-muted rounded-lg border border-muted text-foreground focus:outline-none focus:ring-2 focus:ring-teal-deep resize-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-teal-deep text-white py-2 rounded-lg font-medium hover:bg-teal-deep-dark transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Send Request
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Schedule Call Form Modal */}
      <AnimatePresence>
        {showCallForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowCallForm(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card rounded-2xl p-8 max-w-md w-full shadow-xl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-display text-2xl font-semibold text-foreground">
                  Schedule a Call
                </h3>
                <button
                  onClick={() => setShowCallForm(false)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              <form onSubmit={handleCallFormSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Name</label>
                  <input
                    type="text"
                    value={callFormData.name}
                    onChange={(e) => setCallFormData({ ...callFormData, name: e.target.value })}
                    required
                    className="w-full px-4 py-2 bg-muted rounded-lg border border-muted text-foreground focus:outline-none focus:ring-2 focus:ring-teal-deep"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Email</label>
                  <input
                    type="email"
                    value={callFormData.email}
                    onChange={(e) => setCallFormData({ ...callFormData, email: e.target.value })}
                    required
                    className="w-full px-4 py-2 bg-muted rounded-lg border border-muted text-foreground focus:outline-none focus:ring-2 focus:ring-teal-deep"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Preferred Time</label>
                  <input
                    type="text"
                    placeholder="e.g., Tuesday 2pm EST"
                    value={callFormData.preferredTime}
                    onChange={(e) => setCallFormData({ ...callFormData, preferredTime: e.target.value })}
                    className="w-full px-4 py-2 bg-muted rounded-lg border border-muted text-foreground focus:outline-none focus:ring-2 focus:ring-teal-deep"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">Message (optional)</label>
                  <textarea
                    value={callFormData.message}
                    onChange={(e) => setCallFormData({ ...callFormData, message: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-2 bg-muted rounded-lg border border-muted text-foreground focus:outline-none focus:ring-2 focus:ring-teal-deep resize-none"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full bg-teal-deep text-white py-2 rounded-lg font-medium hover:bg-teal-deep-dark transition-colors flex items-center justify-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  Request Call
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Layout>
  );
}
