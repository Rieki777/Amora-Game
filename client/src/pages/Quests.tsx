import Layout from "@/components/Layout";
import { Link } from "wouter";
import { motion } from "framer-motion";
import {
  Compass,
  Heart,
  Clock,
  Star,
  Calendar,
  Sprout,
  Users,
  Home,
  Brush,
  Laptop,
  ShieldCheck,
  BookOpen,
  TreePine,
  ChefHat,
  Camera,
  Hammer,
  Music,
  Baby,
  Leaf,
  Filter,
} from "lucide-react";
import { useState } from "react";

type QuestStatus = "Open" | "In Progress" | "Seasonal";
type Difficulty = "Beginner" | "Intermediate" | "Advanced";
type QuestCircle =
  | "All"
  | "Community Development"
  | "Regenerative Agriculture"
  | "Land Stewardship"
  | "Governance"
  | "Tourism & Retreat"
  | "Arts & Culture"
  | "Education"
  | "Technology"
  | "Wellness";

interface Quest {
  title: string;
  description: string;
  impact: string;
  hearts: string;
  duration: string;
  difficulty: Difficulty;
  circle: QuestCircle;
  status: QuestStatus;
  roleRequired?: string;
  icon: React.ElementType;
  tags: string[];
}

const quests: Quest[] = [
  {
    title: "Welcome Ambassador",
    description:
      "Be the first warm face new visitors and guests encounter. Orient newcomers at community events, answer questions, and help them feel at home in the village.",
    impact: "Every visitor who feels welcomed is a potential Amoracita for life.",
    hearts: "50–100",
    duration: "Per event (3–6 hrs)",
    difficulty: "Beginner",
    circle: "Community Development",
    status: "Open",
    icon: Users,
    tags: ["social", "events", "newcomers"],
  },
  {
    title: "Food Forest Tender",
    description:
      "Assist with planting, pruning, weeding, and harvesting in our food forests and community gardens. Learn regenerative growing practices hands-on.",
    impact:
      "Directly grows the food that feeds the village and builds our ARI score.",
    hearts: "40–80",
    duration: "4–6 hours",
    difficulty: "Beginner",
    circle: "Regenerative Agriculture",
    status: "Open",
    icon: Sprout,
    tags: ["land", "food", "regenerative"],
  },
  {
    title: "Potluck & Celebration Organizer",
    description:
      "Plan, coordinate, and host monthly community potlucks and seasonal celebrations. Handle logistics, theme-setting, and the little touches that make gatherings memorable.",
    impact: "Community bonds form strongest over shared meals and joy.",
    hearts: "100–200",
    duration: "Per event",
    difficulty: "Intermediate",
    circle: "Community Development",
    status: "Open",
    icon: ChefHat,
    tags: ["events", "community", "social"],
  },
  {
    title: "Trail Builder & Maintainer",
    description:
      "Help create, mark, and maintain the walking trails connecting all areas of the 67-acre property. Includes clearing, signage, and stewardship.",
    impact: "Connects the land and makes it accessible for all beings.",
    hearts: "60–120",
    duration: "Full day",
    difficulty: "Intermediate",
    circle: "Land Stewardship",
    status: "Seasonal",
    icon: TreePine,
    tags: ["land", "physical", "outdoors"],
  },
  {
    title: "Circle Scribe",
    description:
      "Document circle meetings, proposals, decisions, and community knowledge. Maintain the living record of how Amora governs and creates together.",
    impact: "Institutional memory is what makes governance last across generations.",
    hearts: "40–80",
    duration: "Per meeting (2–3 hrs)",
    difficulty: "Beginner",
    circle: "Governance",
    status: "Open",
    icon: BookOpen,
    tags: ["writing", "governance", "knowledge"],
  },
  {
    title: "Retreat Center Host",
    description:
      "Welcome and support guests at the Amora retreat center. Coordinate check-ins, facilitate space, and create a seamless guest experience that embodies Amora's values.",
    impact: "Every retreat guest is a potential community member—or ambassador.",
    hearts: "80–150",
    duration: "Per retreat",
    difficulty: "Intermediate",
    circle: "Tourism & Retreat",
    status: "Open",
    icon: Home,
    tags: ["hospitality", "guests", "tourism"],
  },
  {
    title: "Village Photographer & Storyteller",
    description:
      "Document life at Amora through photos, short videos, and written stories. Capture the real, daily magic of regenerative village life for the community archive and outreach.",
    impact: "Authentic stories are how Amora attracts aligned souls worldwide.",
    hearts: "60–120",
    duration: "Flexible / ongoing",
    difficulty: "Intermediate",
    circle: "Arts & Culture",
    status: "Open",
    icon: Camera,
    tags: ["creative", "media", "storytelling"],
  },
  {
    title: "Children's Play Day Facilitator",
    description:
      "Co-design and run monthly Children's Play Days—wild games, nature crafts, story circles, and the kind of unstructured magic kids rarely get. A core ritual of village life.",
    impact: "Children who grow up here will tend this land for generations.",
    hearts: "70–130",
    duration: "Half day (monthly)",
    difficulty: "Beginner",
    circle: "Education",
    status: "Open",
    icon: Baby,
    tags: ["children", "education", "play"],
  },
  {
    title: "Tech & Platform Steward",
    description:
      "Help maintain and improve the Amora digital ecosystem—website, game platform, forms, community tools. Bug reports, UX improvements, documentation, and light development.",
    impact: "Scales the village's reach to people who haven't found us yet.",
    hearts: "80–200",
    duration: "Flexible / project-based",
    difficulty: "Advanced",
    circle: "Technology",
    status: "Open",
    icon: Laptop,
    tags: ["tech", "digital", "building"],
  },
  {
    title: "Healing Arts Practitioner",
    description:
      "Offer wellness sessions to community members—yoga, meditation, somatic practices, plant medicine ceremonies, massage, or other healing modalities you're trained in.",
    impact: "Wellbeing is regenerative. When people are well, the village thrives.",
    hearts: "50–150",
    duration: "Per session",
    difficulty: "Intermediate",
    circle: "Wellness",
    status: "Open",
    roleRequired: "Trained practitioner",
    icon: Leaf,
    tags: ["wellness", "healing", "body"],
  },
  {
    title: "Infrastructure Builder",
    description:
      "Support construction, repair, and improvement of shared village infrastructure: composting systems, water catchment, communal kitchen, raised beds, fencing, and more.",
    impact: "Built systems are the skeleton the village lives inside.",
    hearts: "80–160",
    duration: "Full day",
    difficulty: "Advanced",
    circle: "Land Stewardship",
    status: "Open",
    icon: Hammer,
    tags: ["building", "physical", "land"],
  },
  {
    title: "Arts & Mural Maker",
    description:
      "Create art that lives in the village—murals, sculptures, fiber works, installations. Bring beauty to shared spaces and express Amora's soul through your medium.",
    impact: "Beauty communicates what words can't. This is how the village speaks.",
    hearts: "100–300",
    duration: "Project-based",
    difficulty: "Intermediate",
    circle: "Arts & Culture",
    status: "Open",
    icon: Brush,
    tags: ["art", "creative", "place-making"],
  },
  {
    title: "Community Music Circle Host",
    description:
      "Lead or organize regular music circles, drum jams, singing circles, or informal concerts. Music is how the village celebrates, grieves, and stays alive.",
    impact: "Rhythm holds community together in ways nothing else can.",
    hearts: "50–100",
    duration: "Per session",
    difficulty: "Beginner",
    circle: "Arts & Culture",
    status: "Open",
    icon: Music,
    tags: ["music", "ritual", "community"],
  },
  {
    title: "Security & Night Watch",
    description:
      "Participate in the village safety rotation—nighttime presence, gate awareness, and care for the boundary between Amora and the wider world.",
    impact: "Collective safety is how all other contributions stay protected.",
    hearts: "60–100",
    duration: "Night shift (6–8 hrs)",
    difficulty: "Intermediate",
    circle: "Governance",
    status: "Open",
    roleRequired: "Resident or Immersant",
    icon: ShieldCheck,
    tags: ["safety", "land", "responsibility"],
  },
];

const difficultyColors: Record<Difficulty, string> = {
  Beginner: "bg-sage/10 text-sage",
  Intermediate: "bg-teal/10 text-teal-700",
  Advanced: "bg-primary/10 text-primary",
};

const statusColors: Record<QuestStatus, string> = {
  Open: "bg-green-100 text-green-700",
  "In Progress": "bg-amber/20 text-amber-700",
  Seasonal: "bg-blue-100 text-blue-700",
};

const circles: QuestCircle[] = [
  "All",
  "Community Development",
  "Regenerative Agriculture",
  "Land Stewardship",
  "Governance",
  "Tourism & Retreat",
  "Arts & Culture",
  "Education",
  "Technology",
  "Wellness",
];

export default function Quests() {
  const [activeCircle, setActiveCircle] = useState<QuestCircle>("All");
  const [activeDifficulty, setActiveDifficulty] = useState<Difficulty | "All">(
    "All"
  );

  const filtered = quests.filter((q) => {
    const circleMatch = activeCircle === "All" || q.circle === activeCircle;
    const diffMatch =
      activeDifficulty === "All" || q.difficulty === activeDifficulty;
    return circleMatch && diffMatch;
  });

  const totalGratitude = filtered.reduce((sum, q) => {
    const max = parseInt(q.hearts.split("–")[1]);
    return sum + max;
  }, 0);

  return (
    <Layout>
      {/* Hero */}
      <section className="py-24 bg-gradient-to-b from-teal/10 to-background">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-6"
          >
            <div className="w-16 h-16 rounded-full bg-teal/10 flex items-center justify-center mx-auto mb-6">
              <Compass className="w-8 h-8 text-teal-700" />
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
              Community Quests
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-4">
              Quests are how you contribute to the village and earn Gratitude — our
              way of acknowledging every contribution. 1 Gratitude = $1 USD in value.
              Every quest builds relationships, regenerates the land, and grows the
              community's collective score.
            </p>
            <p className="text-sm text-muted-foreground">
              {quests.length} active quests &nbsp;·&nbsp; up to{" "}
              {quests
                .reduce((s, q) => s + parseInt(q.hearts.split("–")[1]), 0)
                .toLocaleString()}{" "}
              Gratitude available
            </p>
          </motion.div>
        </div>
      </section>

      {/* Filters */}
      <section className="sticky top-[64px] z-30 bg-background/95 backdrop-blur border-b border-border py-4 shadow-sm">
        <div className="container">
          <div className="flex flex-wrap gap-2 items-center mb-3">
            <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <span className="text-sm text-muted-foreground">Circle:</span>
            {circles.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCircle(c)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  activeCircle === c
                    ? "bg-teal-deep text-white"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-sm text-muted-foreground ml-5">Level:</span>
            {(["All", "Beginner", "Intermediate", "Advanced"] as const).map(
              (d) => (
                <button
                  key={d}
                  onClick={() => setActiveDifficulty(d)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                    activeDifficulty === d
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {d}
                </button>
              )
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              {filtered.length} quest{filtered.length !== 1 ? "s" : ""} shown
            </span>
          </div>
        </div>
      </section>

      {/* Quest Cards */}
      <section className="py-16 bg-background">
        <div className="container">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-7xl mx-auto mb-16">
            {filtered.map((quest, index) => (
              <motion.div
                key={quest.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.04 }}
                className="bg-card rounded-xl shadow-sm border border-border flex flex-col overflow-hidden"
              >
                {/* Card Header */}
                <div className="bg-gradient-to-br from-teal/5 to-sage/10 px-6 pt-6 pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center">
                      <quest.icon className="w-5 h-5 text-teal-700" />
                    </div>
                    <div className="flex gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${statusColors[quest.status]}`}
                      >
                        {quest.status}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${difficultyColors[quest.difficulty]}`}
                      >
                        {quest.difficulty}
                      </span>
                    </div>
                  </div>
                  <h3 className="font-display text-lg font-bold text-foreground mb-1">
                    {quest.title}
                  </h3>
                  <p className="text-xs text-primary font-medium">
                    {quest.circle}
                  </p>
                </div>

                {/* Card Body */}
                <div className="px-6 py-4 flex-1">
                  <p className="text-muted-foreground text-sm leading-relaxed mb-3">
                    {quest.description}
                  </p>
                  <p className="text-xs text-foreground/60 italic mb-4">
                    "{quest.impact}"
                  </p>

                  {quest.roleRequired && (
                    <div className="mb-3 px-3 py-1.5 bg-amber/10 rounded-lg text-xs text-amber-700 font-medium">
                      Requires: {quest.roleRequired}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1 mb-4">
                    {quest.tags.map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 bg-muted rounded text-xs text-muted-foreground"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Card Footer */}
                <div className="px-6 py-4 border-t border-border bg-muted/30 flex items-center justify-between">
                  <div className="flex items-center gap-1 text-primary font-semibold text-sm">
                    <Heart className="w-4 h-4" />
                    <span>{quest.hearts} Gratitude</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{quest.duration}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Compass className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No quests match those filters. Try a different combination.</p>
            </div>
          )}

          {/* CTA */}
          <div className="max-w-3xl mx-auto text-center bg-gradient-to-br from-teal/10 to-sage/10 p-8 rounded-2xl border border-teal/10">
            <Star className="w-12 h-12 text-primary mx-auto mb-4" />
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-4">
              Ready to Take on a Quest?
            </h2>
            <p className="text-muted-foreground mb-6">
              Quests are open to anyone who has signed the Love Letter membership
              covenant. Join a community call to meet the circles and find your
              first quest.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="https://amora.cr/event/discover-amora-webinar-qa/"
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center gap-2"
              >
                <Calendar className="w-5 h-5" />
                Join a Community Call
              </a>
              <Link href="/love-letter">
                <a className="px-6 py-3 bg-muted text-foreground rounded-lg font-semibold hover:bg-muted/80 transition-colors flex items-center gap-2">
                  <Heart className="w-5 h-5" />
                  Sign the Love Letter
                </a>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Gratitude Explainer */}
      <section className="py-16 bg-primary/5">
        <div className="container">
          <div className="max-w-3xl mx-auto">
            <h2 className="font-display text-3xl font-bold text-foreground mb-4 text-center">
              What Is Gratitude?
            </h2>
            <p className="text-muted-foreground text-center mb-10">
              Gratitude is how Amora tracks contributions. Right now, 1 Gratitude = $1 USD in value
              contributed. As Amora matures, Gratitude converts to cash or equity.
            </p>
            <div className="grid sm:grid-cols-3 gap-6">
              {[
                {
                  title: "Earn",
                  body: "Complete quests, contribute to circles, steward the land, teach, build, host, create. Every meaningful act earns Gratitude.",
                  icon: Heart,
                },
                {
                  title: "Hold",
                  body: "Gratitude accumulates in your Village Profile and reflect your full contribution history. They're a record of everything you've invested.",
                  icon: Star,
                },
                {
                  title: "Convert",
                  body: "As Amora grows financially, Gratitude converts to cash or equity. This is how we honor contributions made before we could pay in cash.",
                  icon: Sprout,
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="bg-card rounded-xl p-6 shadow-sm text-center"
                >
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <item.icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="font-display text-lg font-bold text-foreground mb-2">
                    {item.title}
                  </h3>
                  <p className="text-sm text-muted-foreground">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
