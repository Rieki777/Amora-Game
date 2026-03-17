import Layout from "@/components/Layout";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  TrendingUp,
  Users,
  Home as HomeIcon,
  Sparkles,
  ArrowRight,
  Heart,
  Calendar,
  MapPin,
  TreePine,
  CheckCircle2,
  FileText,
  Laptop,
  GraduationCap,
  Sunset,
  Zap,
  Briefcase,
  Globe
} from "lucide-react";

const HERO_IMAGE = "https://amora.cr/wp-content/uploads/2025/11/Our-Intentional-Community-Amora-Background.jpg";


const journeyCards = [
  {
    id: "investor",
    title: "Investor",
    subtitle: "Capital Contributor",
    description: "Support regenerative development through financial resources, credit lines, or material contributions. Join a community that prioritizes debt over equity.",
    icon: TrendingUp,
    href: "/investor",
    color: "bg-amber",
    image: "https://amora.cr/wp-content/uploads/2025/11/Shared-Governance-1024x683.jpg",
  },
  {
    id: "steward",
    title: "Village Steward",
    subtitle: "Co-Creator",
    description: "Coordinate and execute for the success of the whole village. Join circles, take on roles, and help shape our regenerative community.",
    icon: Users,
    href: "/steward",
    color: "bg-sage",
    image: "https://amora.cr/wp-content/uploads/2025/11/Planting-Trees.jpg",
  },
  {
    id: "resident",
    title: "Resident",
    subtitle: "Co-Creator",
    description: "Make Amora your home. Explore housing options, join the waitlist, and become part of a loving village where all beings belong.",
    icon: HomeIcon,
    href: "/resident",
    color: "bg-teal",
    image: "https://amora.cr/wp-content/uploads/2026/02/Land-Tour-3-1024x724.jpg",
  },
  {
    id: "prosperity",
    title: "Prosperity Creator",
    subtitle: "Business Builder",
    description: "Launch or grow your business within our thriving village economy. Align your enterprise with community values and share in collective prosperity.",
    icon: Sparkles,
    href: "/prosperity",
    color: "bg-teal-light",
    image: "https://amora.cr/wp-content/uploads/2026/02/Holistic-Wellbeing-1024x1024.jpg",
  },
];

const journeyStages = [
  { stage: "Align", description: "Discover our values", icon: Heart },
  { stage: "Experience", description: "Visit & participate", icon: Calendar },
  { stage: "Co-Create", description: "Join our circles", icon: Users },
  { stage: "Integrate", description: "Become a member", icon: CheckCircle2 },
  { stage: "Home", description: "Make it home", icon: HomeIcon },
];

export default function Home() {
  return (
    <Layout>
      {/* Hero Section */}
      <section className="relative min-h-[90vh] flex items-center overflow-hidden">
        {/* Background Image */}
        <div className="absolute inset-0 z-0">
          <img
            src={HERO_IMAGE}
            alt="Amora Village aerial view"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent" />
        </div>

        {/* Content */}
        <div className="container relative z-10 py-20">
          <div className="max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <span className="inline-block px-4 py-1.5 bg-white/20 backdrop-blur-sm rounded-full text-white text-sm font-medium mb-6">
                Come co-create paradise
              </span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="font-display text-5xl md:text-7xl font-bold text-white leading-tight mb-6"
            >
              Co-Become the Most{" "}
              <span className="text-primary">Beautiful</span> Village
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-xl text-white/80 leading-relaxed mb-8"
            >
              A regenerative village in Costa Rica where all beings{" "}
              <span className="font-semibold text-white">belong</span> and{" "}
              <span className="font-semibold text-white">thrive</span>. Find your path to participation.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap gap-4"
            >
              <a
                href="#choose-path"
                className="px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold text-lg hover:opacity-90 transition-all duration-200 flex items-center gap-2"
              >
                Find Your Path
                <ArrowRight className="w-5 h-5" />
              </a>
              <Link
                href="/co-creators-guide"
                className="px-8 py-4 bg-white/20 backdrop-blur-sm text-white rounded-lg font-semibold text-lg hover:bg-white/30 transition-all duration-200"
              >
                Read the Co-Creators Guide
              </Link>
            </motion.div>
          </div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10"
        >
          <div className="w-6 h-10 border-2 border-white/50 rounded-full flex justify-center">
            <motion.div
              animate={{ y: [0, 12, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="w-1.5 h-1.5 bg-white rounded-full mt-2"
            />
          </div>
        </motion.div>
      </section>

      {/* Journey Stages */}
      <section className="py-16 bg-aqua-light">
        <div className="container">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-4">
              Our Journey Together
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Each stage is designed to filter for cultural fit while providing opportunities for mutual assessment.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-4 md:gap-0">
            {journeyStages.map((item, index) => (
              <div key={item.stage} className="flex items-center">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="flex flex-col items-center px-6 py-4"
                >
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <item.icon className="w-6 h-6 text-primary" />
                  </div>
                  <span className="font-display text-lg font-semibold text-foreground">
                    {item.stage}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {item.description}
                  </span>
                </motion.div>
                {index < journeyStages.length - 1 && (
                  <ArrowRight className="w-5 h-5 text-muted-foreground hidden md:block" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Choose Your Path */}
      <section id="choose-path" className="py-24 bg-background">
        <div className="container">
          <div className="text-center mb-16">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="inline-block px-4 py-1.5 bg-primary/10 rounded-full text-primary text-sm font-medium mb-4"
            >
              What brought you here?
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4"
            >
              Choose Your Path
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-muted-foreground max-w-2xl mx-auto"
            >
              Four unique journeys to participate in the Amora community. Each path leads to belonging.
            </motion.p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {journeyCards.map((card, index) => (
              <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <Link href={card.href}>
                  <div className="group relative overflow-hidden rounded-2xl bg-card shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer">
                    {/* Image */}
                    <div className="relative h-56 overflow-hidden">
                      <img
                        src={card.image}
                        alt={card.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                      <div className={`absolute top-4 left-4 w-12 h-12 ${card.color} rounded-xl flex items-center justify-center`}>
                        <card.icon className="w-6 h-6 text-white" />
                      </div>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-display text-2xl font-bold text-foreground">
                          {card.title}
                        </h3>
                        <span className="text-sm text-muted-foreground">
                          {card.subtitle}
                        </span>
                      </div>
                      <p className="text-muted-foreground mb-4 leading-relaxed">
                        {card.description}
                      </p>
                      <div className="flex items-center text-primary font-medium group-hover:gap-3 gap-2 transition-all duration-200">
                        <span>Begin your journey</span>
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </div>
      </section>


      {/* Who Comes to Amora */}
      <section className="py-24 bg-background">
        <div className="container">
          <div className="text-center mb-16">
            <motion.span
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="inline-block px-4 py-1.5 bg-sage/20 rounded-full text-sage text-sm font-medium mb-4"
            >
              People like you
            </motion.span>
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4"
            >
              Who Comes to Amora?
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-muted-foreground max-w-2xl mx-auto"
            >
              Amora attracts people who are done half-living. Here are some of
              the souls who find their way here.
            </motion.p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              {
                icon: Laptop,
                label: "Digital Nomad Couple",
                tagline: "We want roots without walls.",
                body: "Location-independent professionals ready to stop bouncing between Airbnbs and plant themselves somewhere with depth, community, and a reason to stay.",
                color: "bg-teal/10",
                iconColor: "text-teal-700",
              },
              {
                icon: GraduationCap,
                label: "Worldschooling Family",
                tagline: "Our kids deserve a village.",
                body: "Families who want their children raised by a community, surrounded by nature, multi-generational wisdom, and real-world learning instead of a system.",
                color: "bg-sage/20",
                iconColor: "text-sage",
              },
              {
                icon: Sunset,
                label: "Retiree & Snowbird",
                tagline: "Finally, a second chapter worth living.",
                body: "Post-career dreamers who want warmth, beauty, belonging, and a role that still matters—not a golf course. Costa Rica's Pura Vida calls them home.",
                color: "bg-amber/20",
                iconColor: "text-amber-700",
              },
              {
                icon: Zap,
                label: "Longevity Seeker",
                tagline: "I want to live well, not just long.",
                body: "Health-conscious individuals chasing clean air, organic food, movement, community, and purpose as medicine—building a life designed to thrive.",
                color: "bg-primary/10",
                iconColor: "text-primary",
              },
              {
                icon: Briefcase,
                label: "Remote Exec & Founder",
                tagline: "I built the life. Now I want meaning.",
                body: "High-achievers who want their next chapter to matter—contributing capital, skills, or leadership to something regenerative and lasting.",
                color: "bg-teal-light/20",
                iconColor: "text-teal-600",
              },
              {
                icon: Globe,
                label: "Costa Rican & LatAm Professional",
                tagline: "I want to build something here.",
                body: "Local and regional changemakers who see Amora as the proving ground for the regenerative future of Central America—and want to help shape it.",
                color: "bg-sage-light/40",
                iconColor: "text-sage",
              },
            ].map((persona, index) => (
              <motion.div
                key={persona.label}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.07 }}
                className="bg-card rounded-xl p-6 shadow-sm border border-border"
              >
                <div
                  className={`w-12 h-12 rounded-xl ${persona.color} flex items-center justify-center mb-4`}
                >
                  <persona.icon className={`w-6 h-6 ${persona.iconColor}`} />
                </div>
                <h3 className="font-display text-lg font-bold text-foreground mb-1">
                  {persona.label}
                </h3>
                <p className="text-primary text-sm font-medium italic mb-3">
                  "{persona.tagline}"
                </p>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {persona.body}
                </p>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-12">
            <p className="text-muted-foreground mb-4">
              See yourself here? There's a path with your name on it.
            </p>
            <a
              href="#choose-path"
              className="inline-flex items-center gap-2 text-primary font-semibold hover:opacity-80 transition-opacity"
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById("choose-path")
                  ?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Find your path <ArrowRight className="w-4 h-4" />
            </a>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-primary/5">
        <div className="container">
          <div className="max-w-3xl mx-auto text-center">
            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="font-display text-4xl md:text-5xl font-bold text-foreground mb-6"
            >
              Ready to Begin Your Journey?
            </motion.h2>
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="text-xl text-muted-foreground mb-8"
            >
              Join our next community call to learn about the basics and ask any questions. 
              It's the perfect first step on any path.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="flex flex-wrap justify-center gap-4"
            >
              <a
                href="https://amora.cr/event/discover-amora-webinar-qa/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 bg-primary text-primary-foreground rounded-lg font-semibold text-lg hover:opacity-90 transition-all duration-200 flex items-center gap-2"
              >
                <Calendar className="w-5 h-5" />
                Join Community Call
              </a>
              <a
                href="https://amora.cr/events/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-4 bg-secondary text-secondary-foreground rounded-lg font-semibold text-lg hover:opacity-90 transition-all duration-200"
              >
                View All Events
              </a>
            </motion.div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
