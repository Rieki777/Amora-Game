import Layout from "@/components/Layout";
import { motion } from "framer-motion";
import { Users, ArrowRight, ExternalLink } from "lucide-react";
import { Link } from "wouter";

const coreTeam = [
  {
    name: "Jessica Filkins",
    role: "CEO & Founder",
    circle: "Core Team",
    bio: "Visionary founder creating regenerative community infrastructure and leading Amora's evolution toward a multigenerational, family-centered village.",
    photo: "https://amora.cr/wp-content/uploads/2025/12/Jessica-Filkins-1024x1024.png",
  },
  {
    name: "Kyleen Keenan",
    role: "Finance Manager",
    circle: "Core Team",
    bio: "Manages financial systems, investor relations, and economic sustainability for the village development.",
    photo: "https://amora.cr/wp-content/uploads/2025/12/Kyleen-Keenan-1-1024x1024.png",
  },
  {
    name: "Nikita Timmermans",
    role: "Community & Culture",
    circle: "Core Team",
    bio: "Cultivates the social fabric of Amora, supporting community culture, events, and the heart of village life.",
    photo: "https://amora.cr/wp-content/uploads/2025/12/Nikita-Timmermans-1024x1024.png",
  },
  {
    name: "Victoria Leyden",
    role: "Village Development",
    circle: "Core Team",
    bio: "Guides physical and social village development, bridging infrastructure with the lived experience of community.",
    photo: "https://amora.cr/wp-content/uploads/2025/12/Victoria-Leyden-1024x1024.png",
  },
  {
    name: "Maria Kusk",
    role: "Regenerative Design",
    circle: "Core Team",
    bio: "Brings regenerative design principles to the land, ensuring Amora heals and thrives alongside its human community.",
    photo: "https://amora.cr/wp-content/uploads/2025/12/Maria-Kusk-1024x1024.png",
  },
  {
    name: "Adriana",
    role: "Operations & Systems",
    circle: "Core Team",
    bio: "Keeps the day-to-day flow of Amora running — from logistics to community support systems.",
    photo: "https://amora.cr/wp-content/uploads/2025/12/Adriana-1024x1024.png",
  },
];

const advisoryHighlights = [
  "Regenerative Agriculture & Permaculture Leaders",
  "Wellness & Healing Arts Practitioners",
  "Education & Child Development Experts",
  "Arts & Culture Leaders",
  "Local Community Representatives",
  "Costa Rican Cultural Liaisons"
];

export default function Team() {
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
              The Amora Team
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Women-led and heart-centered — the founding team bringing the Amora vision to life.
            </p>
          </motion.div>

          {/* Core Team */}
          <div className="mb-20">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <h2 className="font-display text-3xl font-bold text-foreground mb-4">
                Core Team
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                This land called for women to lead the creation of a multigenerational, family-centered village.
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
              {coreTeam.map((member, index) => (
                <motion.div
                  key={member.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ y: -6 }}
                  className="bg-card rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-border"
                >
                  <div className="h-64 overflow-hidden">
                    <img
                      src={member.photo}
                      alt={member.name}
                      className="w-full h-full object-cover object-top"
                    />
                  </div>
                  <div className="p-6">
                    <h3 className="font-display text-xl font-bold text-foreground mb-1">
                      {member.name}
                    </h3>
                    <p className="text-sage font-semibold text-sm mb-2">
                      {member.role}
                    </p>
                    <p className="text-xs text-muted-foreground mb-3 pb-3 border-b border-border">
                      {member.circle}
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {member.bio}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Advisory Council */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="bg-amber/5 rounded-3xl p-8 md:p-12 border border-amber/20 mb-20"
          >
            <div className="text-center mb-10">
              <h2 className="font-display text-3xl font-bold text-foreground mb-4">
                Community Advisory Council
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                10–14 influential practitioners and thought leaders shaping Amora's culture, partnerships, and community integration.
              </p>
            </div>
            <div className="grid md:grid-cols-2 gap-4 max-w-4xl mx-auto mb-8">
              {advisoryHighlights.map((highlight, index) => (
                <motion.div
                  key={highlight}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                  className="flex gap-3 items-start"
                >
                  <span className="text-amber font-bold text-lg flex-shrink-0">✦</span>
                  <p className="text-muted-foreground">{highlight}</p>
                </motion.div>
              ))}
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Advisors receive First Right of Refusal on lot purchases, retreat discounts, and recognition as Founding Advisors.
            </p>
          </motion.div>

          {/* Development Board */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            className="bg-teal-deep/5 rounded-3xl p-8 md:p-12 border border-teal-deep/20 mb-20"
          >
            <div className="text-center">
              <h2 className="font-display text-3xl font-bold text-foreground mb-4">
                Development Board of Directors
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto mb-8">
                5–7 expert members providing strategic oversight, fiduciary responsibility, and guidance on business, legal, and financial aspects.
              </p>
              <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
                <div className="text-left">
                  <h3 className="font-semibold text-foreground mb-2">Expertise Areas</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>Legal &amp; Regulatory</li>
                    <li>Real Estate Development</li>
                    <li>Financial &amp; Investment</li>
                  </ul>
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-foreground mb-2">Responsibilities</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>Financial Oversight</li>
                    <li>Development Milestones</li>
                    <li>Investor Relations</li>
                  </ul>
                </div>
                <div className="text-left">
                  <h3 className="font-semibold text-foreground mb-2">Meeting Schedule</h3>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>Monthly Meetings</li>
                    <li>Quarterly Sessions</li>
                    <li>Annual Retreat</li>
                  </ul>
                </div>
              </div>
            </div>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mt-16 bg-sage/5 p-8 rounded-2xl border border-sage/20"
          >
            <h2 className="font-display text-2xl font-bold text-foreground mb-4">
              Join Our Community
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto mb-6">
              Whether you're an investor, resident, steward, or prosperity creator, there's a place for you at Amora.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link href="/#choose-path">
                <span className="inline-flex items-center gap-2 px-6 py-3 bg-sage text-white rounded-lg hover:bg-sage/90 transition-colors font-medium cursor-pointer">
                  Find Your Path
                  <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
              <a
                href="https://amora.cr/event/discover-amora-webinar-qa/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-muted text-foreground rounded-lg hover:bg-muted/80 transition-colors font-medium"
              >
                Join Community Call
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
