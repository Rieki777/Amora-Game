import Layout from "@/components/Layout";
import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  ArrowRight,
  Briefcase,
  Shield,
  Lightbulb,
  ChevronDown,
  Users2,
  Zap,
  Leaf,
  Star,
  Home,
  Building2,
  CircleDot,
} from "lucide-react";
import { useState } from "react";

type RoleStatus = "filled" | "open" | "forming";

interface RoleEntry {
  id: string;
  name: string;
  category: string;
  status: RoleStatus;
  aim: string;
  domain: string;
  accountabilities: string[];
  evolutionaryPurpose: string;
  icon: React.ElementType;
  color: string;
}

// ─── LEADERSHIP CIRCLE ──────────────────────────────────────────────────────

const leadershipRoles: RoleEntry[] = [
  {
    id: "visionary-lead",
    name: "Visionary Lead",
    category: "Leadership Circle",
    status: "filled",
    aim: "Build the team that builds Amora. Hold the frequency of what Amora is becoming. Bring the right people into the project.",
    domain: "Strategy and direction. Vision alignment across documents, entities, website, and team. Relationship building with investors, advisors, and aligned leaders. Culture and team coherence. Final word on questions that affect the whole org and cannot be decided inside a single circle.",
    accountabilities: [
      "Stewards the Purpose Statement, the Amora vision, and how that vision shows up in every document, agreement, and entity",
      "Represents Amora in high-leverage relationships: investors, collaborators, potential residents, future neighbors",
      "Hosts experiences on the land: tours, potlucks, connection gatherings",
      "Participates in the Leadership Circle as a circle member",
      "Curates the Wisdom Council, the Advisory Board, and specialist advisor relationships",
      "Holds final alignment authority on Amora's seven priorities",
    ],
    evolutionaryPurpose:
      "When Amora's documents, entities, and governance are strong enough that the vision lives in the system and not just in one person, this role shifts fully into community building and relationship weaving. The health of this role is a measure of the health of the whole system.",
    icon: Star,
    color: "bg-teal-deep",
  },
  {
    id: "development-lead",
    name: "Development Lead",
    category: "Leadership Circle",
    status: "open",
    aim: "Hold the full physical realization of Amora from master plan through built-out village. Lead the team and partners that turn drawings into homes, community buildings, water systems, roads, and regenerative landscapes.",
    domain: "Master planning. Architecture and building design. Permitting and regulatory compliance. Construction oversight. Infrastructure (water, power, roads, waste, internet). Regenerative agriculture and permaculture system design. Landscape and land stewardship. Contractor management. Materials sourcing at scale.",
    accountabilities: [
      "Represents the physical development domain in the Leadership Circle",
      "Holds the master plan and drives it to decisions and completion",
      "Leads and grows the Architecture Circle, the Regenerative Agriculture and Permaculture Circle, and the Rancho Renovation Manager",
      "Manages the primary development partnerships and any secondary bids",
      "Owns permitting, construction timelines, and the phased build-out budget in coordination with the Finance Lead",
      "Integrates architecture, permaculture, and land stewardship into one coherent physical plan",
      "Reports to the Leadership Circle on development status, blockers, and decisions that need cross-circle consent",
    ],
    evolutionaryPurpose:
      "Amora lives or dies on whether the physical place gets built well. Without this role, the vision stays a vision. With it, the team has a partner at the top of the house who can answer 'when will this be built and by whom' with confidence.",
    icon: Building2,
    color: "bg-amber",
  },
  {
    id: "finance-lead",
    name: "Finance Lead",
    category: "Leadership Circle",
    status: "filled",
    aim: "Steward the financial health of Amora across all entities. Build the business development work that funds the vision. Hold the CFO function for Amora as it grows.",
    domain: "Financial operations across entities. Cash flow, budgeting, investor reporting. Investor relations and capital strategy. Revenue model development. Legal and governance structuring in coordination with counsel. Standard operating procedures for the team.",
    accountabilities: [
      "Holds the financial model and all its projections",
      "Manages investor relationships and communications",
      "Structures and negotiates financing terms",
      "Coordinates tax and compliance across jurisdictions",
      "Builds the infrastructure of how the team works: documents, SOPs, workflows",
      "Represents Amora to external financial and legal stakeholders",
      "Operations leader of the Finance Circle",
    ],
    evolutionaryPurpose:
      "This role is the bridge between the vision and the capital that realizes it. It translates heart language into the language investors and regulators understand, and holds the structures that let the money flow in ways that honor what Amora is trying to be.",
    icon: Shield,
    color: "bg-sage",
  },
  {
    id: "community-lead",
    name: "Community Lead",
    category: "Leadership Circle",
    status: "open",
    aim: "Hold the human side of Amora. Coordinate across all the circles so the team functions as a team, not as five people working in parallel. Make sure community onboarding, events, culture, membership, and sales actually happen.",
    domain: "Cross-circle coordination (COO function). Community Circle leadership. Marketing Circle coordination. Sales and real estate sales. Membership and onboarding. Event curation and hosting. Rites of passage and culture practices. Conflict resolution. Team health and rhythms. Governance implementation.",
    accountabilities: [
      "Represents the community and coordination domain in the Leadership Circle",
      "Leads the Community Circle and holds cross-circle coordination across all circles",
      "Makes sure each functional circle meets, produces outcomes, and surfaces tensions",
      "Runs or oversees community onboarding, member journeys, events, and culture work",
      "Holds the sales and real estate sales function until it grows into its own circle",
      "Oversees the Marketing Steward and integrates marketing with community and sales",
      "Implements and maintains the sociocratic structure in practice",
    ],
    evolutionaryPurpose:
      "A village is a living human system. Without someone whose whole job is tending the people and the coordination between them, a community-in-formation either burns out its founders or fractures as it grows. This role is what lets Amora scale from five people to fifty without losing its soul.",
    icon: Users2,
    color: "bg-gold",
  },
];

// ─── CURRENT FUNCTIONAL ROLES ────────────────────────────────────────────────

const currentRoles: RoleEntry[] = [
  {
    id: "marketing-steward",
    name: "Marketing Steward",
    category: "Village Steward Space",
    status: "filled",
    aim: "Open the Amora flower so the right bees find it. Attract aligned future neighbors, investors, and collaborators through clear, honest, on-brand communications.",
    domain: "All outward-facing marketing and communications. Website copy, CRM, email flows, social media, newsletter, webinars. Messaging strategy. Lot sales funnel. Marketing team coordination.",
    accountabilities: [
      "Writes and maintains the messaging Amora puts into the world",
      "Builds and runs the email nurture sequences in the CRM",
      "Manages the marketing team and the budget that supports it",
      "Promotes events: village weaving, land tours, potlucks, family days, webinars",
      "Creates and runs the funnel that takes someone from 'heard of Amora' to 'applying to be a neighbor'",
      "Reports monthly on marketing KPIs",
      "Operations leader of the Marketing Circle",
    ],
    evolutionaryPurpose:
      "Marketing done wrong pulls in the wrong people. This role is the filter that ensures the people arriving at the door are already resonant, so the cultural fit is there before they even show up. It also writes Amora into the broader story of what a new kind of village can be.",
    icon: Lightbulb,
    color: "bg-teal",
  },
  {
    id: "community-engagement",
    name: "Community Engagement Steward",
    category: "Village Steward Space",
    status: "forming",
    aim: "Make the in-person experience of Amora one people want to tell their friends about. Welcome guests. Run the events that are the entry point for most people.",
    domain: "Weekly potluck and seasonal retreats. Event management, communication, preparation, setup, breakdown, transportation. Hospitality and guest coordination on the land. Team communications about who is visiting, when, and where they stay.",
    accountabilities: [
      "Runs the weekly potluck end to end",
      "Coordinates who is on the land at any given time and what they need",
      "Represents Amora to guests face to face",
      "Manages the communications Amora sends and receives day to day",
      "Coordinates with whoever is hosting and cleaning spaces for incoming guests",
    ],
    evolutionaryPurpose:
      "Most people's first taste of Amora is a potluck, a land tour, or a visit. This role is the one that decides whether their first taste is 'these people are the real thing.' It is frontline culture work and it matters more than the org chart makes it look.",
    icon: Users,
    color: "bg-sage-light",
  },
  {
    id: "land-liaison",
    name: "Land Liaison",
    category: "Village Steward Space",
    status: "filled",
    aim: "Care for the land of Amora. Hold the relationships with the people who live on it, work on it, and visit it.",
    domain: "Land management in coordination with caretakers and permaculture people. Building, planting, maintenance, guest coordination from the land side. Mapping and documentation of what is planted and where. Land tours.",
    accountabilities: [
      "Primary point of contact for caretakers and contractors working on the land",
      "Oversees plantings, tree health, permaculture systems",
      "Keeps the map of what is where up to date: trees, plantings, structures",
      "Maintains common spaces and infrastructure",
      "Gives relaxed, connected land tours to visitors",
      "Coordinates with whoever is staying on the land",
    ],
    evolutionaryPurpose:
      "The land is the first resident. Every decision the team makes either deepens the relationship with the land or takes from it. This role is the one that keeps the team honest about that, and gets to spend the most time in the thing Amora is actually about.",
    icon: Leaf,
    color: "bg-sage",
  },
  {
    id: "land-steward",
    name: "Land Steward",
    category: "Village Steward Space",
    status: "open",
    aim: "Hold the day-to-day life of the land. Keep the waterfalls clean, the gardens growing, the spaces beautiful, and the food and medicine abundant.",
    domain: "On-land execution that supports the Land Liaison. Garden implementation. Greenhouse construction. Native species identification for food and medicine. Propagation of edible and medicinal plants. General handiwork, material handling, driving, and the thousand small things the land asks for.",
    accountabilities: [
      "Lives on or near the land and is physically present with it daily",
      "Implements gardens and food-growing structures",
      "Documents the existing plantings across the property",
      "Identifies native food and medicine species on the land",
      "Keeps the potluck and event spaces ready",
      "Handles transportation, setup, and material runs as needed",
    ],
    evolutionaryPurpose:
      "Amora cannot be a functional regenerative village without someone whose hands are in the soil every day. This role is what turns Amora from 'a project' into 'a living place.' It is also the foundation for the apothecary, the food systems, and the ecological restoration the vision calls for.",
    icon: Leaf,
    color: "bg-sage-light",
  },
];

// ─── ROLES BEING BUILT ───────────────────────────────────────────────────────

const buildingRoles: RoleEntry[] = [
  {
    id: "operations-steward",
    name: "Operations Steward",
    category: "General Circle",
    status: "open",
    aim: "Make the team's work together run without friction. Hold the rhythms, the rituals, the follow-through, and the structure that lets everyone else do their work.",
    domain: "Weekly and monthly meeting rhythms (Monday and Friday syncs, agenda, notes, follow-ups). Team coordination across all circles. Document organization. Project tracking. Internal SOPs. Scheduling.",
    accountabilities: [
      "Owns the meeting rhythm: agenda prep, notes, to-do list updates, follow-through",
      "Maintains the shared team folder so documents are findable",
      "Tracks cross-circle projects so nothing falls through",
      "Supports document creation: memos, proposals, slide decks",
      "Keeps the governance work moving between meetings",
      "Reports on team health and flow back into the General Circle",
    ],
    evolutionaryPurpose:
      "This is the role that turns talented people with overlapping work into one coherent team. Without it, everyone does their best but the team itself does not cohere. With it, each person gets to spend their time on the work that only they can do.",
    icon: Zap,
    color: "bg-teal",
  },
  {
    id: "campground-steward",
    name: "Campground and Events Steward",
    category: "Village Steward Space",
    status: "open",
    aim: "Turn the Amora land into a place people can stay and experience, before they become neighbors. Create abundance from the land by welcoming aligned guests.",
    domain: "Campground design, infrastructure (tents, places to stay), and online booking. Event hosting on the land open to visitors: village weaving immersions, retreats, world-schooling families. Online presence for the stay experience.",
    accountabilities: [
      "Designs the Amora stay experience from first contact to departure",
      "Orders and maintains the infrastructure: tents, common areas, stay amenities",
      "Writes the copy and imagery that attracts the right visitors",
      "Runs the booking system",
      "Co-creates village weaving events and other immersions",
      "Connects with the education work so world-schooling families have a pathway in",
    ],
    evolutionaryPurpose:
      "Staying on the land is one of the rites of passage. Without a campground steward, that rite has no container. This role is what makes the onboarding journey real.",
    icon: Home,
    color: "bg-amber",
  },
  {
    id: "architecture-lead",
    name: "Architecture Circle Lead",
    category: "Village Steward Space",
    status: "open",
    aim: "Lead the design and architectural development of Amora in a regenerative, place-responsive way. Activate the Architecture Circle and get to decisions on building style and master plan.",
    domain: "Architectural design. Building style decisions. Master planning in coordination with Architecture Circle members and infrastructure advisors. Coordination with regenerative architects and the broader regenerative architecture network. Permitting and regulatory compliance on structures.",
    accountabilities: [
      "Activates and runs the Architecture Circle with clear agreements",
      "Holds the master plan process with circle members and specialist advisors",
      "Coordinates architectural decisions across the team",
      "Manages relationships with external architects",
      "Brings proposals to the General Circle when decisions cross circles",
    ],
    evolutionaryPurpose:
      "The physical form of Amora will either reinforce the values or contradict them. Hexagonal community structures, regenerative building materials, and landscape-responsive placement are not aesthetic choices, they shape how people live together. This role ensures the bones of the place match the soul.",
    icon: Building2,
    color: "bg-teal-deep",
  },
  {
    id: "regen-ag-lead",
    name: "Regenerative Agriculture and Permaculture Circle Lead",
    category: "Village Steward Space",
    status: "open",
    aim: "Design and implement the food, medicine, and ecosystem systems that make Amora regenerative. Activate the circle with permaculture practitioners and land stewards.",
    domain: "Regenerative agriculture system design. Permaculture planning and implementation. Food and medicine systems: gardens, orchards, medicinal plantings, apothecary. Integration with the Land Steward's on-land work. Coordination with the Architecture Circle on siting and water.",
    accountabilities: [
      "Activates and runs the Regenerative Ag and Permaculture Circle",
      "Designs the regenerative systems map for Amora: food, water, soil, biodiversity",
      "Coordinates with the Land Steward on day-to-day implementation",
      "Holds the relationships with permaculture consultants and practitioners",
      "Integrates food and medicine systems with the campground, school, and retreat offerings",
      "Brings the regenerative systems plan to the General Circle for consent",
    ],
    evolutionaryPurpose:
      "Amora calls itself regenerative. Until the land is producing food, medicine, and ecosystem health, that word is aspirational. This circle is what makes the word real.",
    icon: Leaf,
    color: "bg-sage",
  },
  {
    id: "rancho-manager",
    name: "Rancho Renovation Manager",
    category: "Village Steward Space",
    status: "open",
    aim: "Own the Rancho renovation end to end. Coordinate contractors, source materials, manage the phased budget, and bring the renovation to completion.",
    domain: "The Rancho renovation project and caretakers house improvements. Contractor management. Budget tracking against approved phases. Materials sourcing including kitchen equipment. Kitchen design execution. Composting toilet installation. Bodega expansion. Water system coordination.",
    accountabilities: [
      "Holds the renovation timeline and phase plan",
      "Gets quotes from contractors by phase and brings them to the team for budget approval",
      "Coordinates with the Finance team on contract creation and legal review",
      "Sources materials: kitchen equipment, solar generators, signage, and more",
      "Works with interior design specialist advisors if engaged",
      "Reports on progress weekly",
    ],
    evolutionaryPurpose:
      "The Rancho is the physical container for the core team, volunteers, guests, and eventually the school. Until it is done, most other priorities are slowed. This role is the one that unblocks the ground game of Amora.",
    icon: Home,
    color: "bg-gold",
  },
  {
    id: "entity-steward",
    name: "Entity and Land Trust Steward",
    category: "Finance Circle",
    status: "forming",
    aim: "Build and steward the legal container that allows Amora to hold the land, the funding, and the governance in alignment with its values.",
    domain: "Entity structure work: Church, SRL, SA, and DAO considerations. The land trust pathway. Legal agreements with investors and members. Coordination with legal and governance specialist advisors. Memos to counsel on funding pathways. Membership agreements.",
    accountabilities: [
      "Holds the entity structure design and its current state",
      "Prepares memos to external counsel on behalf of the team",
      "Coordinates with specialist advisors on legal structuring, governance design, and DAO implementation",
      "Manages membership agreements with specialist advisor input",
      "Works with the Community Circle on how the legal container serves the onboarding journey",
      "Reports to the General Circle on entity status and any blockers",
    ],
    evolutionaryPurpose:
      "The Church, the SRL, the land trust, the DAO all shape what kinds of decisions can be made and by whom. This domain is where the vision becomes legally real. Getting it wrong constrains every future choice. Getting it right unlocks the funding, the residency process, and the governance model.",
    icon: Shield,
    color: "bg-teal-deep",
  },
  {
    id: "business-dev-steward",
    name: "Business Development Steward",
    category: "Finance Circle",
    status: "forming",
    aim: "Develop the revenue-generating projects that fund Amora's long-term vision. Build the retreat center, the longevity center, and the village business ecosystem.",
    domain: "Strategic partnerships for business development. Retreat center design and launch. Longevity center design and launch. Amora Business Incubation Program for village businesses birthed from the community.",
    accountabilities: [
      "Scopes and develops the retreat and longevity centers",
      "Builds the strategic partnerships that bring aligned operators to the village",
      "Designs the business incubation program that supports village businesses",
      "Co-develops and refines business plans with the Prosperity Circle as it forms",
      "Supports the Prosperity Space as it populates",
    ],
    evolutionaryPurpose:
      "Without this role, Amora risks becoming just a place people live instead of a place where regenerative livelihoods take root. The Prosperity Space says the village wants to be economically generative, this role is what makes that real.",
    icon: Briefcase,
    color: "bg-amber",
  },
  {
    id: "membership-steward",
    name: "Membership and Onboarding Steward",
    category: "Community Circle",
    status: "open",
    aim: "Hold the journey a person walks from curious visitor to committed Amoracita. Make sure every step is coherent, welcoming, and honest.",
    domain: "The Love Letter (membership agreement). The waitlist for residents. The rites of passage: Co-Creator, Resident. Background checks. Application flows. The handoff between marketing (first contact) and community (deep relationship).",
    accountabilities: [
      "Maintains the Love Letter and the membership process",
      "Runs the waitlist and the right-of-refusal process for lots",
      "Coordinates the rites of passage across Village Steward, Resident, and Prosperity journeys",
      "Manages background checks and the vetting process",
      "Acts as the point of contact for someone in the middle of their journey",
    ],
    evolutionaryPurpose:
      "Amora's central innovation is the filtering journey itself. Most intentional communities fail because they let the wrong people in too fast. This role is the guardian of cultural coherence at the point of entry.",
    icon: Users,
    color: "bg-sage",
  },
];

// ─── ADVISORY BODIES ─────────────────────────────────────────────────────────

const advisoryBodies: RoleEntry[] = [
  {
    id: "wisdom-council",
    name: "Wisdom Council",
    category: "Advisory",
    status: "forming",
    aim: "Provide wisdom on questions that touch culture, belonging, ceremony, and the long view.",
    domain: "Rites of passage. Guidance on culture, belonging, ceremony. Not decision-making authority over operations.",
    accountabilities: [
      "Meets monthly to advise the Leadership Circle and the Visionary Lead",
      "Holds wisdom on community and indigenous practices",
      "Advises on culture, belonging, and ceremony",
      "Helps Amora stay connected to what communities have learned over generations",
    ],
    evolutionaryPurpose:
      "Amora is being built inside a culture that has forgotten most of what it knows about community. Elders hold what the culture forgot. This council is how Amora stays connected to that memory instead of trying to invent community from scratch.",
    icon: CircleDot,
    color: "bg-gold",
  },
  {
    id: "advisory-board",
    name: "Advisory Board",
    category: "Advisory",
    status: "forming",
    aim: "Provide strategic counsel on development decisions and share patterns from other regenerative projects.",
    domain: "Strategic counsel on development. Pattern recognition from other regenerative projects. Connections and introductions. Not decision-making authority over operations.",
    accountabilities: [
      "Advises on major development and community design decisions",
      "Brings pattern recognition from comparable projects",
      "Provides introductions to aligned capital, talent, and partners",
      "Helps Amora avoid pitfalls that have challenged similar projects",
    ],
    evolutionaryPurpose:
      "Amora is not the first regenerative project and it will not be the last. The Advisory Board is how Amora stands on the shoulders of what has already been learned instead of reinventing it.",
    icon: Lightbulb,
    color: "bg-teal",
  },
  {
    id: "board-directors",
    name: "Board of Directors",
    category: "Advisory",
    status: "forming",
    aim: "Provide governance oversight on the legal entities.",
    domain: "Fiduciary oversight of the legal entities. Formal governance. Not day-to-day operational decision-making.",
    accountabilities: [
      "Holds fiduciary responsibility for the legal entities",
      "Provides formal governance oversight on key decisions",
      "Ensures investor and stakeholder interests are properly represented",
      "Works alongside the Wisdom Council and Advisory Board",
    ],
    evolutionaryPurpose:
      "This is the container that holds the legal and fiduciary responsibility so the circle structure can stay focused on creating rather than regulating.",
    icon: Shield,
    color: "bg-teal-deep",
  },
];

const statusBadge: Record<RoleStatus, { label: string; className: string }> = {
  filled: { label: "Filled", className: "bg-sage/15 text-sage border border-sage/30" },
  open: { label: "Open Seat", className: "bg-amber/15 text-amber-700 border border-amber/40" },
  forming: { label: "Forming", className: "bg-teal/15 text-teal-deep border border-teal/30" },
};

interface RoleCardProps {
  role: RoleEntry;
  expanded: boolean;
  onToggle: () => void;
  index: number;
}

function RoleCard({ role, expanded, onToggle, index }: RoleCardProps) {
  const Icon = role.icon;
  const badge = statusBadge[role.status];
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.04 }}
    >
      <button
        onClick={onToggle}
        className="w-full text-left bg-card hover:bg-card/80 transition-colors p-5 rounded-xl border border-border"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 ${role.color} rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-0.5">
                <h3 className="font-display text-lg font-bold text-foreground leading-tight">{role.name}</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.className}`}>
                  {badge.label}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{role.category}</p>
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 text-muted-foreground transition-transform flex-shrink-0 mt-2 ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-muted/30 p-6 rounded-b-xl border border-t-0 border-border space-y-5">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Aim</h4>
                <p className="text-sm text-foreground leading-relaxed">{role.aim}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Domain</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{role.domain}</p>
              </div>
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Key Accountabilities</h4>
                <ul className="space-y-1.5">
                  {role.accountabilities.map((a) => (
                    <li key={a} className="text-sm text-muted-foreground flex gap-2">
                      <span className="text-sage mt-0.5 flex-shrink-0">✓</span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="pt-4 border-t border-border">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Why This Role Matters</h4>
                <p className="text-sm text-muted-foreground italic leading-relaxed">{role.evolutionaryPurpose}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface SectionProps {
  title: string;
  subtitle: string;
  roles: RoleEntry[];
  expandedRole: string | null;
  onToggle: (id: string) => void;
}

function RoleSection({ title, subtitle, roles, expandedRole, onToggle }: SectionProps) {
  return (
    <div className="mb-14">
      <div className="mb-6">
        <h2 className="font-display text-2xl font-bold text-foreground mb-1">{title}</h2>
        <p className="text-muted-foreground text-sm">{subtitle}</p>
      </div>
      <div className="space-y-3">
        {roles.map((role, i) => (
          <RoleCard
            key={role.id}
            role={role}
            expanded={expandedRole === role.id}
            onToggle={() => onToggle(role.id)}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}

export default function Roles() {
  const [expandedRole, setExpandedRole] = useState<string | null>(null);

  const toggle = (id: string) =>
    setExpandedRole((prev) => (prev === id ? null : id));

  return (
    <Layout>
      <section className="py-24 bg-background">
        <div className="container">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <div className="w-16 h-16 rounded-full bg-sage/10 flex items-center justify-center mx-auto mb-6">
              <Briefcase className="w-8 h-8 text-sage" />
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
              Roles and Circles
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Amora organizes through sociocratic circles. Each role has an aim, a domain, and a set of accountabilities. Roles sit in the circle, not on the person.
            </p>
          </motion.div>

          <div className="max-w-4xl mx-auto">
            {/* How it works */}
            <motion.div
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              className="mb-14 grid sm:grid-cols-3 gap-4"
            >
              {[
                { label: "Spaces", description: "The biggest containers, Village Steward, Resident, Prosperity. Each has its own rhythms and decision-making authority." },
                { label: "Circles", description: "Working groups inside a space. Each circle has an aim (what it works toward) and a domain (what it has authority to decide on)." },
                { label: "Roles", description: "Specific responsibilities inside a circle. One person can hold many roles. If a person leaves, the role stays and gets reassigned." },
              ].map((item) => (
                <div key={item.label} className="rounded-xl bg-muted/30 border border-border p-5">
                  <div className="text-sm font-bold text-foreground mb-1">{item.label}</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{item.description}</p>
                </div>
              ))}
            </motion.div>

            <RoleSection
              title="The Leadership Circle"
              subtitle="Four seats hold the whole of Amora together. Each lead owns one of the four domains every decision eventually touches: vision, physical realization, capital, and community."
              roles={leadershipRoles}
              expandedRole={expandedRole}
              onToggle={toggle}
            />

            <RoleSection
              title="Active Roles"
              subtitle="These roles are currently held or transitioning. They form the functional backbone of the team right now."
              roles={currentRoles}
              expandedRole={expandedRole}
              onToggle={toggle}
            />

            <RoleSection
              title="Roles Being Built"
              subtitle="These roles are open or forming, the team is actively working to fill them. Each one unblocks a significant part of Amora's next phase."
              roles={buildingRoles}
              expandedRole={expandedRole}
              onToggle={toggle}
            />

            <RoleSection
              title="Advisory Bodies"
              subtitle="These sit outside the circle structure. They provide wisdom and oversight rather than operational decisions."
              roles={advisoryBodies}
              expandedRole={expandedRole}
              onToggle={toggle}
            />

            {/* How tensions work */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="mt-4 bg-sage/5 p-8 rounded-2xl border border-sage/20"
            >
              <h2 className="font-display text-2xl font-bold text-foreground mb-4">
                How Roles Evolve
              </h2>
              <p className="text-muted-foreground mb-4">
                A "tension" in sociocracy language is any felt gap between how things are and how they could be. Any team member who feels a tension brings it to their circle meeting. The circle holds space and decides together whether to adjust a role, create a new one, retire one, or send it up to the Leadership Circle.
              </p>
              <p className="text-muted-foreground">
                Decisions are made by consent, not unanimous agreement, but no reasoned objection based on anyone's ability to do their work. The circle tries the change for an agreed period, then evaluates. Roles in Amora are invitations to a specific way of serving the living purpose, not fixed job descriptions.
              </p>
            </motion.div>
          </div>

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
