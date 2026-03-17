import Layout from "@/components/Layout";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Users, 
  ArrowRight, 
  Heart, 
  Briefcase,
  Shield,
  Lightbulb,
  ChevronDown,
  Users2,
  Target,
  Zap,
  Leaf
} from "lucide-react";
import { useState } from "react";

const governanceStructure = [
  {
    id: "board",
    name: "Development Board of Directors",
    icon: Shield,
    color: "bg-teal-deep",
    purpose: "Strategic oversight and fiduciary responsibility for business, legal, and financial aspects of creating Amora",
    size: "5-7 expert members",
    members: [
      "Angel Investor (permanent seat)",
      "CEO and Founder (Jess or designated representative)",
      "Legal/Regulatory Expert (Costa Rican law specialist)",
      "Real Estate Development Expert",
      "Financial/Investment Expert",
      "Community Development Specialist",
      "Sustainability/Regenerative Systems Expert",
      "Community Advocate (Leadership Council representative)"
    ],
    responsibilities: [
      "Approve major financial decisions and budget allocations",
      "Oversee legal entity structure and compliance",
      "Review and approve development timeline milestones",
      "Ensure investor protection and return strategies",
      "Approve lot sales pricing and terms",
      "Monitor progress against business plan objectives",
      "Provide guidance on regulatory and permitting challenges"
    ],
    timeCommitment: [
      "Monthly Board Meetings (1-2 hours via video conference)",
      "Quarterly Strategic Sessions (2-3 hours)",
      "Emergency Decision Capacity (as needed)",
      "Annual Strategic Planning Retreat (2-3 days)"
    ],
    terms: "3-year terms, renewable",
    compensation: "Equity participation in development profits and/or first right of refusal on premium lots"
  },
  {
    id: "advisory",
    name: "Community Advisory Council",
    icon: Lightbulb,
    color: "bg-gold",
    purpose: "Strategic input on community culture, programming, partnerships, and local integration",
    size: "10-14 influential practitioners and thought leaders",
    members: [
      "Regenerative Agriculture/Permaculture Leaders",
      "Wellness & Healing Arts Practitioners",
      "Education & Child Development Experts",
      "Arts & Culture Leaders",
      "Spiritual/Personal Development Teachers",
      "Sustainable Technology Innovators",
      "Community Building & Governance Experts",
      "Retreat & Hospitality Industry Leaders",
      "Local Community Representatives (2-3 from Dominicalito)",
      "Costa Rican Cultural Liaisons"
    ],
    responsibilities: [
      "Advise on community programming and cultural development",
      "Provide introductions to potential residents and partners",
      "Offer expertise in their respective domains",
      "Participate in key community visioning sessions",
      "Help design signature programs and offerings",
      "Serve as ambassadors for the Amora vision",
      "Ensure positive integration with local Costa Rican communities",
      "Advise on cultural sensitivity and local customs",
      "Facilitate partnerships with local businesses and organizations"
    ],
    timeCommitment: [
      "Bi-Monthly Virtual Advisory Sessions (1.5-2 hours, 6 per year)",
      "Annual Visioning Retreat (2-3 days, all expenses covered)",
      "Ongoing Consultation (available for specific projects)",
      "Community Events (invited to participate in significant gatherings)"
    ],
    terms: "Flexible, ongoing",
    compensation: "First Right of Refusal on lot purchases, 50% Retreat Discounts, Token Allocation, Recognition as Founding Advisor, Paid Facilitation Opportunities"
  },
  {
    id: "leadership",
    name: "Leadership Council",
    icon: Users2,
    color: "bg-sage",
    purpose: "Coordinate between Circles and represent community interests to Core Team and Board",
    size: "8 representatives (one from each Circle)",
    members: [
      "One Representative from each active Circle",
      "Facilitator (elected from among Representatives, 1-year term)",
      "Secretary (rotating responsibility)",
      "Core Team Liaison (non-voting participant)"
    ],
    responsibilities: [
      "Coordinate between Circles on overlapping issues",
      "Represent community interests to Core Team and Board",
      "Approve community-wide policies and guidelines",
      "Oversee conflict resolution between Circles",
      "Plan community-wide events and initiatives",
      "Review and approve community budget allocations",
      "Facilitate communication between governance levels"
    ],
    timeCommitment: [
      "Weekly Leadership Meetings (1 hour, virtual)",
      "Monthly Strategic Sessions (2-3 hours)",
      "Quarterly Joint Sessions with Core Team (half-day)",
      "Annual Planning Retreat with Board and Advisory Council (2 days)"
    ],
    terms: "6-month terms for Representatives, 1-year for Facilitator",
    compensation: "Community recognition and leadership development opportunities"
  },
  {
    id: "core",
    name: "Core Team",
    icon: Zap,
    color: "bg-teal",
    purpose: "Manages day-to-day project execution, development coordination, and serves as bridge between all governance levels",
    size: "5-7 members",
    members: [
      "CEO and Founder (Jess)",
      "Development Manager (Darren)",
      "Finance Manager (Ky)",
      "Strategic Systems Manager (Alex)",
      "Community Director (future role - skilled in sociocratic facilitation)",
      "Additional specialists as needed for development phases"
    ],
    responsibilities: [
      "Day-to-day project execution and development coordination",
      "Bridge between all governance levels",
      "Implement Board decisions and Circle initiatives",
      "Manage development timeline and milestones",
      "Coordinate with external partners and contractors",
      "Participate in monthly community forums for feelings and conflict resolution"
    ],
    timeCommitment: [
      "Full-time commitment during development phases",
      "Weekly Core Team meetings",
      "Regular Board and Leadership Council participation",
      "Monthly community forums (1-2 hours)"
    ],
    terms: "Ongoing during development, evolving role as community matures",
    compensation: "Salary, equity participation, and community benefits"
  },
  {
    id: "architect",
    name: "Architect",
    icon: Briefcase,
    color: "bg-teal-deep",
    purpose: "Design residential and community buildings aligned with Amora's aesthetic and sustainability standards",
    size: "1-2 architects",
    members: [
      "Lead Architect with regenerative design experience",
      "Sustainability-focused design specialist"
    ],
    responsibilities: [
      "Design all residential and community buildings",
      "Ensure architectural alignment with Amora's design philosophy",
      "Coordinate with permaculture team on site integration",
      "Work with engineers on building systems integration",
      "Ensure compliance with Costa Rican building codes",
      "Oversee construction quality and design fidelity",
      "Facilitate community input on design decisions"
    ],
    timeCommitment: [
      "Full-time during design and construction phases",
      "Part-time during operational phases",
      "Weekly coordination meetings with Building Council",
      "Monthly design review sessions with community"
    ],
    terms: "Project-based, renewable annually",
    compensation: "Professional fees, equity participation, and housing benefits"
  },
  {
    id: "engineer",
    name: "Civil & Sustainability Engineer",
    icon: Zap,
    color: "bg-teal",
    purpose: "Design and oversee infrastructure systems including water, waste, energy, roads, and environmental compliance",
    size: "1-2 engineers",
    members: [
      "Civil Engineer with Costa Rican experience",
      "Renewable Energy & Sustainability Specialist"
    ],
    responsibilities: [
      "Design water management and treatment systems",
      "Plan renewable energy infrastructure (solar, micro-hydro)",
      "Design waste-to-energy and composting systems",
      "Oversee road, drainage, and utility infrastructure",
      "Ensure compliance with Costa Rican environmental standards",
      "Monitor and optimize environmental performance",
      "Coordinate with permaculture team on water systems"
    ],
    timeCommitment: [
      "Full-time during infrastructure development",
      "Part-time for ongoing system optimization",
      "Weekly coordination with Building Council",
      "Monthly environmental performance reviews"
    ],
    terms: "Project-based, renewable annually",
    compensation: "Professional fees, equity participation, and housing benefits"
  },
  {
    id: "permaculture",
    name: "Permaculture Designer & Land Steward",
    icon: Leaf,
    color: "bg-sage",
    purpose: "Design and implement regenerative land systems including food forests, water management, and ecological restoration",
    size: "1-2 permaculture specialists",
    members: [
      "Certified Permaculture Designer with tropical experience",
      "Ecological Restoration Specialist"
    ],
    responsibilities: [
      "Design integrated permaculture systems for the entire property",
      "Plan food forests, gardens, and agricultural zones",
      "Design water harvesting and management systems",
      "Oversee ecological restoration and native planting",
      "Coordinate with architects and engineers on site integration",
      "Train community members in regenerative practices",
      "Monitor soil health and ecosystem indicators"
    ],
    timeCommitment: [
      "Full-time during design and implementation phases",
      "Part-time for ongoing land stewardship",
      "Weekly coordination with Permaculture Council",
      "Monthly community workshops and training"
    ],
    terms: "Project-based, renewable annually",
    compensation: "Professional fees, equity participation, and housing benefits"
  },
  {
    id: "community-organizer",
    name: "Community Organizer",
    icon: Users2,
    color: "bg-sage-light",
    purpose: "Coordinate social connection, organize community events, and facilitate participation across all demographics",
    size: "1-2 community organizers",
    members: [
      "Experienced community organizer with facilitation skills",
      "Event coordinator with cultural sensitivity"
    ],
    responsibilities: [
      "Organize and facilitate weekly potlucks",
      "Coordinate community calls and gatherings",
      "Plan and execute community celebrations and milestones",
      "Maintain community calendar and communications",
      "Facilitate inclusive participation across all demographics",
      "Support conflict resolution and community healing",
      "Build relationships and strengthen community bonds",
      "Coordinate with Community Life Council on programming"
    ],
    timeCommitment: [
      "Part-time during early phases (10-15 hours/week)",
      "Full-time as community grows",
      "Weekly community coordination meetings",
      "Flexible availability for community events"
    ],
    terms: "Ongoing, renewable annually",
    compensation: "Salary/stipend, Hearts currency allocation, and community benefits"
  }
];

export default function Roles() {
  const [expandedRole, setExpandedRole] = useState<string | null>("board");

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
              <Briefcase className="w-8 h-8 text-sage" />
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
              Governance Roles & Structures
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Multi-tiered governance balancing development expertise with community wisdom, evolving from development-focused leadership to community-driven self-governance.
            </p>
          </motion.div>

          <div className="max-w-4xl mx-auto">
            <div className="space-y-4">
              {governanceStructure.map((role, index) => (
                <motion.div
                  key={role.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.05 }}
                >
                  <button
                    onClick={() => setExpandedRole(expandedRole === role.id ? null : role.id)}
                    className="w-full text-left bg-card hover:bg-card/80 transition-colors p-6 rounded-xl border border-border"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4 flex-1">
                        <div className={`w-12 h-12 ${role.color} rounded-lg flex items-center justify-center flex-shrink-0 mt-1`}>
                          <role.icon className="w-6 h-6 text-white" />
                        </div>
                        <div>
                          <h3 className="font-display text-xl font-bold text-foreground">
                            {role.name}
                          </h3>
                          <p className="text-sm text-muted-foreground mt-1">
                            {role.size}
                          </p>
                        </div>
                      </div>
                      <ChevronDown 
                        className={`w-5 h-5 text-muted-foreground transition-transform flex-shrink-0 ${
                          expandedRole === role.id ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </button>

                  <AnimatePresence>
                    {expandedRole === role.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="bg-muted/30 p-6 rounded-b-xl border border-t-0 border-border space-y-6">
                          <div>
                            <h4 className="font-semibold text-foreground mb-2">Purpose</h4>
                            <p className="text-muted-foreground">
                              {role.purpose}
                            </p>
                          </div>

                          <div>
                            <h4 className="font-semibold text-foreground mb-3">Members & Composition</h4>
                            <ul className="space-y-2">
                              {role.members.map((member) => (
                                <li key={member} className="text-sm text-muted-foreground flex gap-2">
                                  <span className="text-sage">•</span>
                                  {member}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div>
                            <h4 className="font-semibold text-foreground mb-3">Key Responsibilities</h4>
                            <ul className="space-y-2">
                              {role.responsibilities.map((resp) => (
                                <li key={resp} className="text-sm text-muted-foreground flex gap-2">
                                  <span className="text-sage">✓</span>
                                  {resp}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div>
                            <h4 className="font-semibold text-foreground mb-3">Time Commitment</h4>
                            <ul className="space-y-2">
                              {role.timeCommitment.map((time) => (
                                <li key={time} className="text-sm text-muted-foreground flex gap-2">
                                  <span className="text-sage">→</span>
                                  {time}
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div className="grid md:grid-cols-2 gap-4 pt-4 border-t border-border">
                            <div>
                              <p className="text-xs font-medium text-foreground mb-1">Terms</p>
                              <p className="text-sm text-muted-foreground">
                                {role.terms}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-foreground mb-1">Compensation & Benefits</p>
                              <p className="text-sm text-muted-foreground">
                                {role.compensation}
                              </p>
                            </div>
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
              How These Structures Work Together
            </h2>
            <div className="space-y-4 text-muted-foreground">
              <p>
                The <strong>Development Board</strong> provides expert oversight during the complex development phase, ensuring financial viability and regulatory compliance. The <strong>Community Advisory Council</strong> brings wisdom from practitioners and local community leaders to shape culture and partnerships.
              </p>
              <p>
                As residents arrive, the <strong>Sociocratic Circles</strong> (managed through the Leadership Council) gradually take on more governance responsibility. The <strong>Core Team</strong> serves as the bridge, implementing Board decisions and supporting Circle initiatives.
              </p>
              <p>
                This evolution allows professional project management during development while building authentic community ownership for long-term success.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12 text-center"
          >
            <Link href="/circles" className="inline-flex items-center gap-2 px-6 py-3 bg-sage text-white rounded-lg hover:bg-sage/90 transition-colors font-medium">
              Explore Our Circles
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
