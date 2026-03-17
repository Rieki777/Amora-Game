import Layout from "@/components/Layout";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Sparkles, 
  ArrowRight, 
  CheckCircle2,
  Circle,
  Calendar,
  Heart,
  FileText,
  DollarSign,
  Building,
  PartyPopper,
  Vote,
  Store,
  Download,
  TrendingUp,
  Zap,
  ChevronDown,
  ExternalLink,
  Users
} from "lucide-react";

const PROSPERITY_IMAGE = "https://amora.cr/wp-content/uploads/2026/02/Holistic-Wellbeing-1024x1024.jpg";

const journeySteps = [
  {
    id: "community-call",
    stage: "Researcher",
    title: "Attend Community Call",
    description: "Learn about business opportunities at Amora and ask questions about our economic model.",
    icon: Calendar,
    link: "https://amora.cr/event/discover-amora-webinar-qa/",
    linkText: "Join Community Call",
    external: true,
    details: ["Understand our economic vision", "Learn how Hearts track contributions", "Meet other entrepreneurs", "Ask questions live"]
  },
  {
    id: "prosperity-packet",
    stage: "Dreamer",
    title: "Explore the Prosperity Packet",
    description: "Download and review the comprehensive guide to launching a business at Amora.",
    icon: Download,
    link: "#prosperity-packet",
    linkText: "Download Packet",
    external: false,
    action: "download-packet",
    details: ["Business model overview", "Revenue share structure", "Integration requirements", "Success stories"]
  },
  {
    id: "business-proposal",
    stage: "Applicant",
    title: "Submit Business Proposal",
    description: "Present your vision and how it aligns with village needs and our regenerative mission.",
    icon: FileText,
    link: "mailto:business@amora.cr?subject=Business%20Proposal",
    linkText: "Submit Proposal",
    external: true,
    details: ["Describe your business vision", "Show village alignment", "Project community impact", "Include your timeline"]
  },
  {
    id: "membership",
    stage: "Member",
    title: "Sign Love Letter / 508 Membership",
    description: "Become an official member of Amora's 508(c)(1)(a) organization.",
    icon: Heart,
    link: "/love-letter",
    linkText: "Read the Love Letter",
    external: false,
    details: ["Understand our founding principles", "Commit to regenerative values", "Sign membership agreement", "Join the community"]
  },
  {
    id: "approval",
    stage: "Partner",
    title: "Community Approval",
    description: "Present your business to the Business & Finance Council for community consent.",
    icon: Vote,
    link: "/circles",
    linkText: "Learn About Circles",
    external: false,
    details: ["Present to Business & Finance Council", "Answer community questions", "Address impact concerns", "Receive consent decision"]
  },
  {
    id: "launch",
    stage: "Builder",
    title: "Launch Your Business",
    description: "Integrate with the Hearts contribution system and begin serving the Amora community.",
    icon: PartyPopper,
    link: "#",
    linkText: "Launch Checklist",
    external: false,
    details: ["Integrate Hearts tracking", "Set up community dashboard", "Train your team", "Celebrate your launch"]
  },
  {
    id: "impact",
    stage: "Prospering Creator",
    title: "Grow Your Impact",
    description: "Advance through ARI tiers and scale your regenerative business.",
    icon: TrendingUp,
    link: "#",
    linkText: "View ARI Tiers",
    external: false,
    details: ["Track impact metrics", "Grow community contribution", "Mentor other creators", "Advance to next tier"]
  },
];

const ariTiers = [
  {
    tier: "Seed",
    color: "bg-amber/10 text-amber border-amber/20",
    description: "Early stage, establishing presence",
    focus: "Primary village impact",
    metrics: ["Families served", "Hearts generated per week", "Community meals contributed"]
  },
  {
    tier: "Sprout",
    color: "bg-teal-light/10 text-teal-light border-teal-light/20",
    description: "Growing, measurable contribution",
    focus: "Regional visibility",
    metrics: ["Local employment created", "Ecosystem health contribution", "Skill-sharing events"]
  },
  {
    tier: "Grove",
    color: "bg-sage/10 text-sage border-sage/20",
    description: "Established, regional impact",
    focus: "Significant contribution",
    metrics: ["Apprentices trained", "Land area regenerated", "Cultural events hosted"]
  },
  {
    tier: "Forest",
    color: "bg-coral/10 text-coral border-coral/20",
    description: "Thriving, transformative impact",
    focus: "Global reach and legacy",
    metrics: ["Regenerative practices replicated", "Knowledge shared globally", "Legacy created"]
  },
];

export default function ProsperityJourney() {
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [expandedStep, setExpandedStep] = useState<string | null>("community-call");

  useEffect(() => {
    const saved = localStorage.getItem("amora-prosperity-progress");
    if (saved) {
      setCompletedSteps(JSON.parse(saved));
    }
  }, []);

  const toggleStep = (stepId: string) => {
    const newCompleted = completedSteps.includes(stepId)
      ? completedSteps.filter(id => id !== stepId)
      : [...completedSteps, stepId];
    setCompletedSteps(newCompleted);
    localStorage.setItem("amora-prosperity-progress", JSON.stringify(newCompleted));
  };

  const handleDownloadPacket = () => {
    const formData = { type: "prosperity-packet" };
    fetch("/api/forms/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(formData),
    }).catch(err => console.error("Form submission error:", err));
  };

  const progress = (completedSteps.length / journeySteps.length) * 100;

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <motion.img
            src={PROSPERITY_IMAGE}
            alt="Business prosperity"
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
                <Sparkles className="w-6 h-6 text-white" />
              </motion.div>
              <span className="text-gold font-medium tracking-wide uppercase text-sm">Prosperity Creator Journey</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="font-display text-5xl md:text-6xl font-semibold text-foreground mb-6"
            >
              Create{" "}
              <span className="text-gold italic">Regenerative Prosperity</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-xl text-muted-foreground leading-relaxed mb-8"
            >
              Launch a business that serves the community and regenerates our ecosystem. 
              Every contribution is tracked in Hearts — our way of acknowledging value before
              we can pay in cash. Advance your impact through our ARI tiers.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-wrap gap-4"
            >
              <button
                onClick={handleDownloadPacket}
                className="btn-amora flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download Prosperity Packet
              </button>
              <a
                href="https://amora.cr/event/discover-amora-webinar-qa/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-white/90 text-foreground rounded-full font-medium uppercase tracking-wider text-sm hover:bg-white transition-all"
              >
                Join Community Call
              </a>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Hearts & Co-Ownership Info */}
      <section className="py-16 bg-gold/5">
        <div className="container">
          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Heart className="w-12 h-12 text-gold mx-auto mb-4" />
              </motion.div>
              <h3 className="font-display text-xl font-semibold text-foreground mb-3">
                Hearts Economy
              </h3>
              <p className="text-muted-foreground text-sm">
                All businesses integrate with our contribution tracking system. Revenue shares are paid in Hearts — 1 Heart = $1 USD in value. As Amora matures, Hearts convert to cash or equity.
              </p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-center"
            >
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 2, repeat: Infinity, delay: 0.2 }}
              >
                <Users className="w-12 h-12 text-gold mx-auto mb-4" />
              </motion.div>
              <h3 className="font-display text-xl font-semibold text-foreground mb-3">
                Co-Ownership Model
              </h3>
              <p className="text-muted-foreground text-sm">
                All Amora businesses are co-owned by the village community. You operate and manage your 
                enterprise while the community shares in success through revenue participation.
              </p>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Interactive Journey Steps */}
      <section className="py-20 bg-background">
        <div className="container">
          <motion.div 
            className="text-center mb-8"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
              Your Path to Prosperity
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
              Follow these seven steps to launch your regenerative business at Amora.
            </p>
            
            {/* Progress Bar */}
            <div className="max-w-md mx-auto">
              <div className="relative h-3 bg-muted rounded-full overflow-hidden mb-2">
                <motion.div 
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-gold to-coral rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <p className="text-sm text-muted-foreground">
                {completedSteps.length} of {journeySteps.length} steps completed
              </p>
            </div>
          </motion.div>

          <div className="max-w-3xl mx-auto">
            <div className="space-y-3">
              {journeySteps.map((step, index) => {
                const isCompleted = completedSteps.includes(step.id);
                const isExpanded = expandedStep === step.id;
                
                return (
                  <motion.div
                    key={step.id}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05 }}
                    className={`bg-card rounded-xl shadow-sm overflow-hidden transition-all ${
                      isCompleted ? "border-l-4 border-gold" : "border-l-4 border-transparent hover:border-gold/50"
                    }`}
                  >
                    <div 
                      className="p-5 cursor-pointer"
                      onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                    >
                      <div className="flex items-start gap-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStep(step.id);
                          }}
                          className="flex-shrink-0 mt-0.5"
                        >
                          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                            {isCompleted ? (
                              <CheckCircle2 className="w-6 h-6 text-gold" />
                            ) : (
                              <Circle className="w-6 h-6 text-muted-foreground hover:text-gold transition-colors" />
                            )}
                          </motion.div>
                        </button>

                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isCompleted ? "bg-gold/10" : "bg-gold/5"
                        }`}>
                          <step.icon className={`w-5 h-5 ${isCompleted ? "text-gold" : "text-gold/60"}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                isCompleted ? "bg-gold/10 text-gold" : "bg-muted text-muted-foreground"
                              }`}>
                                {step.stage}
                              </span>
                              <h3 className={`font-display text-lg font-semibold ${
                                isCompleted ? "text-muted-foreground" : "text-foreground"
                              }`}>
                                {step.title}
                              </h3>
                            </div>
                            <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                              <ChevronDown className="w-5 h-5 text-muted-foreground" />
                            </motion.div>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    </div>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.3 }}
                          className="overflow-hidden"
                        >
                          <div className="px-5 pb-5 pt-0 ml-14">
                            <div className="bg-muted/50 rounded-lg p-4 mb-4">
                              <ul className="grid grid-cols-2 gap-2">
                                {step.details.map((detail, i) => (
                                  <motion.li 
                                    key={i}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="flex items-center gap-2 text-sm text-muted-foreground"
                                  >
                                    <div className="w-1.5 h-1.5 rounded-full bg-gold" />
                                    {detail}
                                  </motion.li>
                                ))}
                              </ul>
                            </div>
                            {step.action === "download-packet" ? (
                              <button
                                onClick={handleDownloadPacket}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-gold text-white rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
                              >
                                {step.linkText}
                                <Download className="w-4 h-4" />
                              </button>
                            ) : step.external ? (
                              <a
                                href={step.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-4 py-2 bg-gold text-white rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
                              >
                                {step.linkText}
                                <ExternalLink className="w-4 h-4" />
                              </a>
                            ) : (
                              <Link
                                href={step.link}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-gold text-white rounded-full text-sm font-medium hover:opacity-90 transition-opacity"
                              >
                                {step.linkText}
                                <ArrowRight className="w-4 h-4" />
                              </Link>
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

      {/* ARI Tiers */}
      <section className="py-20 bg-cream">
        <div className="container">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
              ARI Tiers: Amora Regenerative Impact
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Measure and grow your impact through our Amora Regenerative Impact framework. 
              Advance through tiers based on community contribution and regenerative outcomes.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {ariTiers.map((tier, index) => (
              <motion.div
                key={tier.tier}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -8, scale: 1.02 }}
                className={`bg-card p-6 rounded-xl shadow-sm border-2 ${tier.color} transition-all`}
              >
                <h3 className="font-display text-2xl font-semibold mb-2">
                  {tier.tier}
                </h3>
                <p className="text-sm font-medium text-muted-foreground mb-3">
                  {tier.description}
                </p>
                <p className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-4">
                  {tier.focus}
                </p>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Impact Metrics:</p>
                  <ul className="space-y-1">
                    {tier.metrics.map((metric, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="w-1 h-1 rounded-full bg-current" />
                        {metric}
                      </li>
                    ))}
                  </ul>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Download Packet CTA */}
      <section className="py-20 bg-gold/5">
        <div className="container">
          <motion.div 
            className="max-w-2xl mx-auto text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
              Ready to Explore Opportunities?
            </h2>
            <p className="text-muted-foreground mb-8">
              Download the Prosperity Packet to learn everything about launching a business at Amora.
            </p>
            <button
              onClick={handleDownloadPacket}
              className="btn-amora inline-flex items-center gap-2"
            >
              <Download className="w-5 h-5" />
              Download Prosperity Packet
            </button>
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-20 bg-background">
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
              <Zap className="w-12 h-12 text-gold mx-auto mb-6" />
            </motion.div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
              Launch Your Regenerative Business
            </h2>
            <p className="text-muted-foreground mb-8">
              Start with a community call to ask questions about the economic model, 
              then download the Prosperity Packet and begin your journey.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="https://amora.cr/event/discover-amora-webinar-qa/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-amora flex items-center gap-2"
              >
                <Calendar className="w-5 h-5" />
                Join Community Call
              </a>
              <button
                onClick={handleDownloadPacket}
                className="px-6 py-3 bg-white text-foreground rounded-full font-medium uppercase tracking-wider text-sm hover:bg-white/90 transition-all border border-border inline-flex items-center gap-2"
              >
                <Download className="w-5 h-5" />
                Download Packet
              </button>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}