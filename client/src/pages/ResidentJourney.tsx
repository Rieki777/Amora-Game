import Layout from "@/components/Layout";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Home, 
  ArrowRight, 
  CheckCircle2,
  Circle,
  Calendar,
  Heart,
  Users,
  FileCheck,
  Clock,
  Baby,
  Award,
  Key,
  Building,
  Shield,
  Crown,
  ChevronDown,
  ExternalLink,
  Sparkles,
  BookOpen
} from "lucide-react";

const RESIDENT_IMAGE = "https://amora.cr/wp-content/uploads/2026/02/Land-Tour-3-1024x724.jpg";

const journeySteps = [
  {
    id: "community-call",
    stage: "Visitor",
    title: "Attend Community Call",
    description: "Learn about the basics and ask any immediate questions about living at Amora.",
    icon: Calendar,
    link: "https://amora.cr/event/discover-amora-webinar-qa/",
    linkText: "Join Community Call",
    external: true,
    details: ["Meet the founding team", "Learn about our vision", "Ask questions live", "Connect with other visitors"]
  },
  {
    id: "events",
    stage: "Guest",
    title: "Attend Community Events",
    description: "Join potlucks, land tours, and community gatherings to experience Amora's living culture.",
    icon: Users,
    link: "https://amora.cr/events/",
    linkText: "View Events",
    external: true,
    details: ["Weekly potluck dinners", "Land tours with the founding team", "Community celebrations", "Children's events and family gatherings"]
  },
  {
    id: "training",
    stage: "Participant",
    title: "Community Training",
    description: "Complete training in NVC (Nonviolent Communication), authentic relating, and other community practices.",
    icon: BookOpen,
    link: "/how-we-create",
    linkText: "Learn About Training",
    external: false,
    details: ["Nonviolent Communication basics", "Authentic relating practices", "Consent-based decision making", "Circle facilitation"]
  },
  {
    id: "love-letter",
    stage: "Member",
    title: "Sign the Love Letter / 508 Membership",
    description: "Become an official member of Amora's 508(c)(1)(a) organization by signing the membership agreement.",
    icon: Heart,
    link: "/love-letter",
    linkText: "Read the Love Letter",
    external: false,
    details: ["Read the founding principles", "Attend a membership orientation", "Sign the membership agreement", "Receive your member welcome package"]
  },
  {
    id: "housing",
    stage: "Explorer",
    title: "Explore Housing Options",
    description: "Browse available lots and housing options to find your perfect spot in the village.",
    icon: Home,
    link: "/housing",
    linkText: "View Housing Options",
    external: false,
    details: ["Browse available lots", "Review home design options", "Understand pricing tiers", "Explore financing options"]
  },
  {
    id: "background",
    stage: "Applicant",
    title: "Background Check",
    description: "Complete a background check as part of our community safety commitment. Tax deductible.",
    icon: FileCheck,
    link: "#",
    linkText: "Coming Soon",
    external: false,
    details: ["Standard background verification", "Community safety commitment", "Tax deductible process", "Confidential handling"]
  },
  {
    id: "waitlist",
    stage: "Waitlist",
    title: "Join the Waitlist",
    description: "Get first right of refusal on land opportunities. Priority is first-come, first-served.",
    icon: Clock,
    link: "#",
    linkText: "Join Waitlist",
    external: false,
    details: ["Secure your priority position", "First right of refusal", "Land opportunity notifications", "No obligation to purchase"]
  },
  {
    id: "family",
    stage: "Family Day",
    title: "Children's Play Day",
    description: "If you have children, attend our family day to see how kids thrive in our community.",
    icon: Baby,
    link: "https://amora.cr/events/",
    linkText: "View Family Events",
    external: true,
    details: ["Meet other families", "Experience child-friendly spaces", "Learn about our school plans", "Connect with parents"]
  },
  {
    id: "passage",
    stage: "Initiate",
    title: "Resident Right of Passage",
    description: "Complete the passage with a vote from current residents. Review the Good Neighbor criteria.",
    icon: Award,
    link: "/co-creators-guide",
    linkText: "Good Neighbor Criteria",
    external: false,
    details: ["Demonstrate commitment", "Present to residents", "Receive community consent", "Celebrate your passage"]
  },
  {
    id: "land",
    stage: "Landowner",
    title: "Purchase Land Share Agreement",
    description: "Secure your land with a Land Share Agreement and required Land Credits.",
    icon: Key,
    link: "#",
    linkText: "Learn About Land Shares",
    external: false,
    details: ["Review agreement terms", "Secure financing if needed", "Complete land credits", "Sign your agreement"]
  },
  {
    id: "build",
    stage: "Builder",
    title: "Build Your Home",
    description: "Work with our approved builders or bring your own plans. Observe Resident Governance.",
    icon: Building,
    link: "/housing",
    linkText: "Building Guidelines",
    external: false,
    details: ["Choose your home design", "Select your builder", "Follow building guidelines", "Create your dream home"]
  },
  {
    id: "move-in",
    stage: "Resident",
    title: "Move In Celebration!",
    description: "Welcome home! Celebrate with the Amoracitas and begin your life in the village.",
    icon: Heart,
    link: "#",
    linkText: "Welcome Home",
    external: false,
    details: ["Community welcome ceremony", "Meet your neighbors", "Begin village life", "Celebrate your new home"]
  },
];

const residentProgression = [
  { level: "Resident", description: "Your arrival — you've made the village your home", icon: Home },
  { level: "Guardian", description: "Deep roots, steward of community traditions", icon: Shield, years: "7 years" },
  { level: "Elder", description: "Village wisdom keeper, mentor to new residents", icon: Users, years: "21 years" },
  { level: "Sage", description: "Intergenerational bridge, Rights of Nature voice", icon: Crown, years: "49 years" },
];

export default function ResidentJourney() {
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [expandedStep, setExpandedStep] = useState<string | null>("community-call");

  useEffect(() => {
    const saved = localStorage.getItem("amora-resident-progress");
    if (saved) {
      setCompletedSteps(JSON.parse(saved));
    }
  }, []);

  const toggleStep = (stepId: string) => {
    const newCompleted = completedSteps.includes(stepId)
      ? completedSteps.filter(id => id !== stepId)
      : [...completedSteps, stepId];
    setCompletedSteps(newCompleted);
    localStorage.setItem("amora-resident-progress", JSON.stringify(newCompleted));
  };

  const progress = (completedSteps.length / journeySteps.length) * 100;

  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative py-24 overflow-hidden">
        <div className="absolute inset-0 z-0">
          <motion.img
            src={RESIDENT_IMAGE}
            alt="Amora home"
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
                className="w-12 h-12 rounded-xl bg-teal-deep flex items-center justify-center"
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Home className="w-6 h-6 text-white" />
              </motion.div>
              <span className="text-teal-deep font-medium tracking-wide uppercase text-sm">Resident Co-Creator Journey</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="font-display text-5xl md:text-6xl font-semibold text-foreground mb-6"
            >
              Make Amora{" "}
              <span className="text-teal-deep italic">Home</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-xl text-muted-foreground leading-relaxed mb-8"
            >
              The Resident Space is for those coordinating the success of the whole Village 
              from the perspective of Residents. Find your place in a loving community where 
              all beings belong and thrive.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="flex flex-wrap gap-4"
            >
              <a
                href="https://amora.cr/event/discover-amora-webinar-qa/"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-amora flex items-center gap-2"
              >
                <Calendar className="w-5 h-5" />
                Start with Community Call
              </a>
              <Link
                href="/housing"
                className="px-6 py-3 bg-white/90 text-foreground rounded-full font-medium uppercase tracking-wider text-sm hover:bg-white transition-all"
              >
                Explore Housing
              </Link>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Land Share Info */}
      <section className="py-16 bg-teal-deep/10">
        <div className="container">
          <motion.div 
            className="max-w-3xl mx-auto text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Key className="w-12 h-12 text-teal-deep mx-auto mb-4" />
            </motion.div>
            <h2 className="font-display text-2xl md:text-3xl font-semibold text-foreground mb-4">
              Land Share Agreements
            </h2>
            <p className="text-muted-foreground">
              Your Land Share Agreement gives you long-term access to your land with the ability 
              to renew and pass down to your children tax-free. This unique structure ensures 
              community ownership while providing security for your family.
            </p>
          </motion.div>
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
              Your Path to Residency
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
              Each step is designed for mutual assessment—ensuring you're the right fit 
              for Amora and Amora is the right fit for you.
            </p>
            
            {/* Progress Bar */}
            <div className="max-w-md mx-auto">
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
                    transition={{ delay: index * 0.03 }}
                    className={`bg-card rounded-xl shadow-sm overflow-hidden transition-all ${
                      isCompleted ? "border-l-4 border-coral" : "border-l-4 border-transparent hover:border-coral/50"
                    }`}
                  >
                    <div 
                      className="p-4 cursor-pointer"
                      onClick={() => setExpandedStep(isExpanded ? null : step.id)}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStep(step.id);
                          }}
                          className="flex-shrink-0 mt-0.5"
                        >
                          <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                            {isCompleted ? (
                              <CheckCircle2 className="w-5 h-5 text-teal-deep" />
                            ) : (
                              <Circle className="w-5 h-5 text-muted-foreground hover:text-teal-deep transition-colors" />
                            )}
                          </motion.div>
                        </button>

                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          isCompleted ? "bg-teal-deep/10" : "bg-muted"
                        }`}>
                          <step.icon className={`w-4 h-4 ${isCompleted ? "text-teal-deep" : "text-muted-foreground"}`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                isCompleted ? "bg-teal-deep/10 text-teal-deep" : "bg-muted text-muted-foreground"
                              }`}>
                                {step.stage}
                              </span>
                              <h3 className={`font-display text-base font-semibold ${
                                isCompleted ? "text-muted-foreground" : "text-foreground"
                              }`}>
                                {step.title}
                              </h3>
                            </div>
                            <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
                              <ChevronDown className="w-4 h-4 text-muted-foreground" />
                            </motion.div>
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">
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
                          <div className="px-4 pb-4 pt-0 ml-12">
                            <p className="text-sm text-muted-foreground mb-3">{step.description}</p>
                            <div className="bg-muted/50 rounded-lg p-3 mb-3">
                              <ul className="grid grid-cols-2 gap-1.5">
                                {step.details.map((detail, i) => (
                                  <motion.li 
                                    key={i}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.05 }}
                                    className="flex items-center gap-2 text-xs text-muted-foreground"
                                  >
                                    <div className="w-1 h-1 rounded-full bg-teal-deep" />
                                    {detail}
                                  </motion.li>
                                ))}
                              </ul>
                            </div>
                            {step.external ? (
                              <a
                                href={step.link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-deep text-white rounded-full text-xs font-medium hover:opacity-90 transition-opacity"
                              >
                                {step.linkText}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <Link
                                href={step.link}
                                className="inline-flex items-center gap-2 px-3 py-1.5 bg-teal-deep text-white rounded-full text-xs font-medium hover:opacity-90 transition-opacity"
                              >
                                {step.linkText}
                                <ArrowRight className="w-3 h-3" />
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

      {/* Resident Progression */}
      <section className="py-20 bg-teal-deep text-white">
        <div className="container">
          <motion.div 
            className="text-center mb-12"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-semibold mb-4">
              Growing Your Voice
            </h2>
            <p className="text-white/70 max-w-2xl mx-auto">
              Amora is governed most by those who participate. As you invest more years 
              in the community, your voice in governance grows.
            </p>
          </motion.div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
            {residentProgression.map((level, index) => (
              <motion.div
                key={level.level}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -8, scale: 1.02 }}
                className="bg-white/10 p-6 rounded-xl text-center backdrop-blur-sm"
              >
                <motion.div 
                  className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center mx-auto mb-4"
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.5 }}
                >
                  <level.icon className="w-7 h-7" />
                </motion.div>
                <h3 className="font-display text-xl font-semibold mb-2">
                  {level.level}
                </h3>
                {level.years && (
                  <p className="text-white/60 text-xs mb-3 uppercase tracking-wide">
                    {level.years}+
                  </p>
                )}
                <p className="text-white/90 text-sm">
                  {level.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Village Dues */}
      <section className="py-20 bg-cream">
        <div className="container">
          <motion.div 
            className="max-w-3xl mx-auto text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
              Village Dues
            </h2>
            <p className="text-muted-foreground mb-6">
              As a resident, you'll pay Village Dues that cover utilities, maintenance,
              and community services. These can be covered through <strong>Hearts</strong> — contributions
              that track real value (1 Heart = $1 USD). Together, we work to reduce costs and create
              surplus that benefits everyone.
            </p>
            <Link
              href="/how-we-create"
              className="inline-flex items-center gap-2 text-teal-deep font-medium hover:gap-3 transition-all"
            >
              Learn How Hearts Work
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Rights & Responsibilities */}
      <section className="py-16 bg-background">
        <div className="container">
          <motion.div
            className="max-w-3xl mx-auto text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-2xl md:text-3xl font-semibold text-foreground mb-3">
              Your Rights and Responsibilities
            </h2>
            <p className="text-muted-foreground mb-6">
              As a resident you are a co-owner of this village — not a tenant. Read the full covenant that protects you and defines what we're building together.
            </p>
            <Link
              href="/resident-rights"
              className="btn-amora inline-flex items-center gap-2"
            >
              Read Rights and Responsibilities
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Your Next Step CTA */}
      <section className="py-20 bg-teal-deep/5">
        <div className="container">
          <motion.div 
            className="max-w-2xl mx-auto text-center"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
              Your Next Step
            </h2>
            <p className="text-muted-foreground mb-8">
              Schedule a village visit to experience Amora firsthand and ask any questions 
              about becoming a resident.
            </p>
            <button
              onClick={() => {
                const formData = { type: "resident-visit" };
                fetch("/api/forms/submit", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(formData),
                }).catch(err => console.error("Form submission error:", err));
              }}
              className="btn-amora inline-flex items-center gap-2"
            >
              <Calendar className="w-5 h-5" />
              Schedule a Village Visit
            </button>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
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
              <Sparkles className="w-12 h-12 text-teal-deep mx-auto mb-6" />
            </motion.div>
            <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
              Ready to Find Your Home?
            </h2>
            <p className="text-muted-foreground mb-8">
              Start with a community call to learn about life at Amora, 
              then explore our housing options and available lots.
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
              <Link
                href="/housing"
                className="px-6 py-3 bg-white text-foreground rounded-full font-medium uppercase tracking-wider text-sm hover:bg-white/90 transition-all border border-border"
              >
                View Housing Options
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
