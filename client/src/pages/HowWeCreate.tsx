import Layout from "@/components/Layout";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { 
  Sparkles, 
  ArrowRight, 
  Heart, 
  Users, 
  Calendar,
  CircleDot,
  Vote,
  Repeat,
  Settings,
  TreePine,
  Palette,
  Scale,
  Handshake
} from "lucide-react";

const principles = [
  {
    title: "Sociocracy & Teal",
    description: "We blend sociocratic governance with Teal organization principles. Self-management, wholeness, and evolutionary purpose guide our structure.",
    icon: CircleDot,
  },
  {
    title: "Adaptive Governance",
    description: "Using Hypha tools, each circle designs its own governance strategy—from consent to consensus—tailored to its unique culture, values, and mission.",
    icon: Settings,
  },
  {
    title: "Hearts Economy",
    description: "Our contribution tracking system acknowledges every dollar of value we create together. 1 Heart = $1 USD in value contributed — a record of what we're building collectively.",
    icon: Heart,
  },
  {
    title: "Seasonal Rhythm",
    description: "Every 3 months, the community decides together what kind of season comes next — not a fixed cycle, but a living response to what Amora needs most right now.",
    icon: Repeat,
  },
];

const heartsInfo = [
  {
    title: "Earn Hearts",
    description: "Complete quests, fulfill roles, or receive revenue shares from community and private businesses. Every contribution gets acknowledged.",
    icon: "🤝",
  },
  {
    title: "Track Value",
    description: "1 Heart = $1 USD in value contributed. Hearts are our honest record of the work, time, and resources everyone is pooling to make Amora real.",
    icon: "📊",
  },
  {
    title: "Future Conversion",
    description: "As Amora matures, Hearts will convert to cash or equity. For now, they're how we honor contributions we can't yet pay in cash.",
    icon: "🌱",
  },
];

const governanceOptions = [
  {
    name: "Consent",
    description: "No objections means the proposal passes. Fast and efficient for most decisions.",
    icon: Vote,
    best: "Operational decisions, role assignments",
  },
  {
    name: "Consensus",
    description: "Everyone actively agrees. Builds deep alignment but takes more time.",
    icon: Handshake,
    best: "Major community decisions, values alignment",
  },
  {
    name: "Advice Process",
    description: "Anyone can make a decision after seeking advice from affected parties.",
    icon: Users,
    best: "Individual initiatives, quick actions",
  },
  {
    name: "Custom Blend",
    description: "Mix and match methods based on decision type and urgency.",
    icon: Palette,
    best: "Circles with diverse needs",
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export default function HowWeCreate() {
  return (
    <Layout>
      <section className="py-24 bg-background">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <motion.div 
              className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Sparkles className="w-8 h-8 text-primary" />
            </motion.div>
            <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
              How We Create Together
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Our governance, economic, and organizational systems are designed to 
              ensure all beings belong and thrive.
            </p>
          </motion.div>

          {/* Core Principles */}
          <motion.div 
            className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-20"
            variants={containerVariants}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
          >
            {principles.map((principle) => (
              <motion.div
                key={principle.title}
                variants={itemVariants}
                whileHover={{ scale: 1.02, y: -4 }}
                className="bg-card p-8 rounded-2xl shadow-sm border border-border/50 hover:shadow-lg transition-shadow"
              >
                <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <principle.icon className="w-7 h-7 text-primary" />
                </div>
                <h2 className="font-display text-2xl font-semibold text-foreground mb-3">
                  {principle.title}
                </h2>
                <p className="text-muted-foreground leading-relaxed">
                  {principle.description}
                </p>
              </motion.div>
            ))}
          </motion.div>

          {/* Hearts Economy Section */}
          <motion.div 
            className="bg-gradient-to-br from-primary/5 to-primary/10 rounded-3xl p-8 md:p-12 mb-20"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <div className="text-center mb-12">
              <motion.div
                animate={{ 
                  scale: [1, 1.2, 1],
                  rotate: [0, 5, -5, 0]
                }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Heart className="w-12 h-12 text-primary mx-auto mb-4" />
              </motion.div>
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
                The Hearts Economy
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto mb-2">
                Hearts are how we track contributions. Right now, <strong>1 Heart = $1 USD</strong> in value contributed — work, time, resources, and expertise that we can't yet pay in cash.
              </p>
              <p className="text-sm text-muted-foreground">
                Every Heart is a promise: as Amora grows, contributions convert to cash or equity.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
              {heartsInfo.map((item, index) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.15 }}
                  whileHover={{ y: -8, scale: 1.02 }}
                  className="bg-card p-6 rounded-xl text-center shadow-sm hover:shadow-md transition-all"
                >
                  <motion.div 
                    className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4"
                    whileHover={{ rotate: 360 }}
                    transition={{ duration: 0.5 }}
                  >
                    <span className="text-2xl">{item.icon}</span>
                  </motion.div>
                  <h3 className="font-display text-lg font-semibold text-foreground mb-2">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {item.description}
                  </p>
                </motion.div>
              ))}
            </div>

            <motion.div
              className="text-center mt-8 p-4 bg-white/50 rounded-xl max-w-2xl mx-auto"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
            >
              <p className="text-muted-foreground">
                Hearts aren't a currency yet — they're a <strong>record of shared investment</strong>.
                We're tracking the full value of what everyone is contributing so no one's effort
                goes unacknowledged when Amora becomes financially whole.
              </p>
            </motion.div>
          </motion.div>

          {/* Governance Structure */}
          <motion.div 
            className="bg-sage/5 rounded-3xl p-8 md:p-12 mb-20 border border-sage/20"
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <div className="text-center mb-12">
              <Users className="w-12 h-12 text-sage mx-auto mb-4" />
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
                Our Governance Structure
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Multi-tiered governance balancing development expertise with community wisdom.
              </p>
            </div>

            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="bg-card p-6 rounded-xl border border-border"
              >
                <h3 className="font-display text-lg font-semibold text-foreground mb-3">Development Phase</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2"><span className="text-sage">→</span> Development Board provides expert oversight</li>
                  <li className="flex gap-2"><span className="text-sage">→</span> Community Advisory Council shapes culture</li>
                  <li className="flex gap-2"><span className="text-sage">→</span> Core Team manages execution</li>
                </ul>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                className="bg-card p-6 rounded-xl border border-border"
              >
                <h3 className="font-display text-lg font-semibold text-foreground mb-3">Operations Phase</h3>
                <ul className="space-y-2 text-sm text-muted-foreground">
                  <li className="flex gap-2"><span className="text-sage">→</span> 8 Sociocratic Circles take active role</li>
                  <li className="flex gap-2"><span className="text-sage">→</span> Leadership Council coordinates</li>
                  <li className="flex gap-2"><span className="text-sage">→</span> Community self-governance emerges</li>
                </ul>
              </motion.div>
            </div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center"
            >
              <Link href="/roles">
                <a className="inline-flex items-center gap-2 px-6 py-3 bg-sage text-white rounded-lg hover:bg-sage/90 transition-colors font-medium">
                  Explore Governance Roles
                  <ArrowRight className="w-4 h-4" />
                </a>
              </Link>
            </motion.div>
          </motion.div>

          {/* Flexible Governance with Hypha */}
          <div className="max-w-4xl mx-auto mb-20">
            <motion.div 
              className="text-center mb-12"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Scale className="w-12 h-12 text-sage mx-auto mb-4" />
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
                Flexible Governance with Hypha
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Inspired by Teal and sociocracy, we use <strong>Hypha.earth</strong> tools to let 
                each circle design its own governance strategy. No one-size-fits-all—each space 
                can tailor decision-making to its unique culture, values, and mission.
              </p>
            </motion.div>

            <motion.div 
              className="grid sm:grid-cols-2 gap-6"
              variants={containerVariants}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              {governanceOptions.map((option) => (
                <motion.div
                  key={option.name}
                  variants={itemVariants}
                  whileHover={{ scale: 1.02 }}
                  className="bg-card p-6 rounded-xl shadow-sm border border-border/50"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-sage/10 flex items-center justify-center flex-shrink-0">
                      <option.icon className="w-6 h-6 text-sage" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-semibold text-foreground mb-2">
                        {option.name}
                      </h3>
                      <p className="text-muted-foreground text-sm mb-3">
                        {option.description}
                      </p>
                      <p className="text-xs text-sage font-medium">
                        Best for: {option.best}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </motion.div>

            <motion.div 
              className="mt-8 p-6 bg-sage/5 rounded-xl border border-sage/20"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
            >
              <h3 className="font-display text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
                <Settings className="w-5 h-5 text-sage" />
                How Hypha Enables This
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Hypha provides tools to formalize agreements, track roles, and manage proposals. 
                Each circle can configure voting thresholds, quorum requirements, and decision 
                timeframes. This creates transparency while honoring each group's autonomy. 
                All agreements and role assignments are recorded on-chain for accountability.
              </p>
            </motion.div>
          </div>

          {/* Seasonal Rhythm */}
          <div className="max-w-3xl mx-auto mb-20">
            <motion.div 
              className="text-center mb-8"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
              >
                <Repeat className="w-12 h-12 text-teal-light mx-auto mb-4" />
              </motion.div>
              <h2 className="font-display text-3xl md:text-4xl font-semibold text-foreground mb-4">
                Seasonal Rhythm
              </h2>
              <p className="text-muted-foreground max-w-xl mx-auto">
                Every 3 months, the community votes on what kind of season comes next — not a fixed cycle, but a collective response to what Amora needs most. Each season is its own chapter.
              </p>
            </motion.div>
            <div className="grid sm:grid-cols-2 gap-6">
              {[
                {
                  season: "Spring",
                  emoji: "🌱",
                  color: "bg-green-100 text-green-700",
                  desc: "Breaking ground. Starting new buildings, projects, and initiatives. The season for bold beginnings and planting what we want to grow.",
                },
                {
                  season: "Summer",
                  emoji: "☀️",
                  color: "bg-yellow-100 text-yellow-700",
                  desc: "Full momentum. Festivals, events, gatherings, and high community activity. The season to show up, celebrate, and build together at full energy.",
                },
                {
                  season: "Fall",
                  emoji: "🍂",
                  color: "bg-orange-100 text-orange-700",
                  desc: "Harvest time. Reflection, lessons learned, and appreciating the abundance we've created. The season to gather what we've grown and give thanks.",
                },
                {
                  season: "Winter",
                  emoji: "❄️",
                  color: "bg-blue-100 text-blue-700",
                  desc: "Deep design. Systems redesign, governance evolution, economic modelling, financial preparation, and investor relations. The season to think long.",
                },
              ].map((item, index) => (
                <motion.div
                  key={item.season}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  whileHover={{ scale: 1.03 }}
                  className="bg-card p-6 rounded-xl shadow-sm border border-border/50"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-2xl">{item.emoji}</span>
                    <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${item.color}`}>
                      {item.season}
                    </span>
                  </div>
                  <h3 className="font-display text-xl font-semibold text-foreground mb-2">
                    {item.season} Season
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {item.desc}
                  </p>
                </motion.div>
              ))}
            </div>
            <motion.div
              className="mt-8 p-5 bg-white/60 rounded-xl text-center border border-border/40"
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.4 }}
            >
              <p className="text-sm text-muted-foreground">
                <strong>No fixed cycle.</strong> At the end of each season, the community comes together to vote on what's needed next.
                A village that just built all summer might choose Winter to design what comes next.
                A village deep in planning might choose Spring to break ground.
                The seasons follow Amora's needs — not a calendar.
              </p>
            </motion.div>
          </div>

          {/* CTA */}
          <motion.div 
            className="max-w-3xl mx-auto text-center bg-cream-dark p-8 rounded-2xl"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-2xl md:text-3xl font-semibold text-foreground mb-4">
              Learn More
            </h2>
            <p className="text-muted-foreground mb-6">
              Dive deeper into our governance and economic systems in the Co-Creators Guide, 
              or join a community call to ask questions.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link
                href="/co-creators-guide"
                className="px-6 py-3 bg-primary text-primary-foreground rounded-full font-medium uppercase tracking-wider text-sm hover:opacity-90 transition-all hover:scale-105 flex items-center gap-2"
              >
                Read the Co-Creators Guide
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="https://amora.cr/event/discover-amora-webinar-qa/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-muted text-foreground rounded-full font-medium uppercase tracking-wider text-sm hover:bg-muted/80 transition-all hover:scale-105 flex items-center gap-2"
              >
                <Calendar className="w-5 h-5" />
                Join Community Call
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
