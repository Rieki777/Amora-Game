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
  Lightbulb,
  ArrowRight,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { fetchGameMe, QuestClaim, useGameConfig } from "@/lib/gameApi";
import QuestActions from "@/components/QuestActions";
import { rewardCeiling } from "@shared/questRewards";
import { ExamplesBanner } from "@/components/ExamplesBanner";

type QuestStatus = "Open" | "In Progress" | "Seasonal";
type Difficulty = "Beginner" | "Intermediate" | "Advanced";
/**
 * A circle name as a quest carries it. This was a nine-member union of one
 * village's circle names, hardcoded in platform code: a fork with different
 * circles got filter chips for circles it did not have, and no chip for the
 * ones it did. The chips are derived from the board itself now, so the list
 * is whatever the village is actually running.
 */
type QuestCircle = string;

interface Quest {
  id: string;
  title: string;
  description: string;
  impact: string;
  gratitude: string;
  duration: string;
  difficulty: string;
  circle: string;
  status: string;
  roleRequired?: string | null;
  /** Icon SLUG from the server; iconFor() maps it to a component. */
  icon: string;
  tags: string[];
}

/**
 * S10: quests render from GET /api/quests — the server list with REAL ids.
 * The old hardcoded array joined to server state by slugified titles, so a
 * rename silently orphaned claims (hazard table, questIdFromTitle). Server
 * ids are the only join key now, and admin quest edits appear without a
 * client release.
 */
const QUEST_ICONS: Record<string, React.ElementType> = {
  Users, Sprout, ChefHat, TreePine, BookOpen, Home, Camera, Baby, Laptop,
  Leaf, Hammer, Brush, Music, ShieldCheck, Star, Calendar, Compass,
};
const iconFor = (name: string | null | undefined): React.ElementType =>
  QUEST_ICONS[String(name ?? "")] ?? Star;

const difficultyColors: Record<string, string> = {
  Beginner: "bg-sage/10 text-sage",
  Intermediate: "bg-teal/10 text-teal-700",
  Advanced: "bg-primary/10 text-primary",
};

const statusColors: Record<string, string> = {
  Open: "bg-green-100 text-green-700",
  "In Progress": "bg-amber/20 text-amber-700",
  Seasonal: "bg-blue-100 text-blue-700",
};

export default function Quests() {
  // The value token's live name (Admin → Tokens) — a fork's rename reaches
  // the explainer below without a code change.
  const cfg = useGameConfig();
  const valueName = cfg?.currency?.value?.name ?? "village tokens";
  // Same rule for the village's own name and its events page: this page is
  // platform code, so it asks the config rather than naming anybody.
  const villageName = cfg?.project?.name ?? "the village";
  const eventsUrl = cfg?.project?.eventsUrl ?? "";
  const [activeCircle, setActiveCircle] = useState<QuestCircle>("All");
  const [activeDifficulty, setActiveDifficulty] = useState<Difficulty | "All">(
    "All"
  );
  const { user } = useAuth();
  const [claims, setClaims] = useState<Record<string, QuestClaim>>({});
  const [quests, setQuests] = useState<Quest[]>([]);
  const [boardFailed, setBoardFailed] = useState(false);

  useEffect(() => {
    fetch("/api/quests")
      .then((r) => {
        if (!r.ok) throw new Error(`quests ${r.status}`);
        return r.json();
      })
      .then((d) => { if (Array.isArray(d)) setQuests(d); })
      // A swallowed failure used to render as "no quests match those
      // filters" — an outage presented as a fact about the village.
      .catch(() => setBoardFailed(true));
  }, []);

  const refreshClaims = () => {
    fetchGameMe().then((me) => {
      if (!me) return;
      const map: Record<string, QuestClaim> = {};
      for (const c of me.quests) {
        // keep the most relevant claim per quest (active beats declined)
        if (!map[c.questId] || map[c.questId].status === "declined") map[c.questId] = c;
      }
      setClaims(map);
    });
  };

  useEffect(refreshClaims, []);

  // The chips are the circles this board actually uses, in the order the
  // village sorted them, so a fork never advertises a circle it does not run.
  const circles = useMemo<QuestCircle[]>(
    () => ["All", ...Array.from(new Set(quests.map((q) => q.circle).filter(Boolean))).sort()],
    [quests],
  );

  // A chip can vanish when the board changes underneath a chosen filter.
  // Without this the page would render "no quests match" about a circle that
  // no longer exists, which reads as a fact about the village.
  useEffect(() => {
    if (!circles.includes(activeCircle)) setActiveCircle("All");
  }, [circles, activeCircle]);

  const filtered = quests.filter((q) => {
    const circleMatch = activeCircle === "All" || q.circle === activeCircle;
    const diffMatch =
      activeDifficulty === "All" || q.difficulty === activeDifficulty;
    return circleMatch && diffMatch;
  });

  // Was `parseInt(q.gratitude.split("–")[1])`, which split on an en dash
  // specifically and produced NaN for a plain hyphen or a single number.
  const totalGratitude = filtered.reduce((sum, q) => sum + rewardCeiling(q.gratitude), 0);

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
              Quests are how you contribute to the village and earn Gratitude, our
              way of acknowledging every contribution. Every quest builds
              relationships, regenerates the land, and grows the community's
              collective score.
            </p>
            <ExamplesBanner moduleId="quests" noun="quest" />
            <p className="text-sm text-muted-foreground mb-8">
              {quests.length} active quests &nbsp;·&nbsp; up to{" "}
              {quests
                .reduce((s, q) => s + rewardCeiling(q.gratitude), 0)
                .toLocaleString()}{" "}
              Gratitude available
            </p>

            {/* Propose-your-own CTA — right alongside the hero */}
            <div className="max-w-2xl mx-auto bg-card border border-teal/20 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row items-center gap-4 text-left">
              <div className="w-12 h-12 rounded-xl bg-amber/15 flex items-center justify-center shrink-0">
                <Lightbulb className="w-6 h-6 text-amber-600" />
              </div>
              <div className="flex-1">
                <h2 className="font-display text-lg font-bold text-foreground">
                  Don't see your gift here?
                </h2>
                <p className="text-sm text-muted-foreground">
                  Anyone with an idea to add value can propose their own unique quest.
                  Tell us what you want to bring and what you'd need to make it real.
                </p>
              </div>
              <Link href="/propose-quest">
                <a className="shrink-0 inline-flex items-center gap-2 px-5 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-opacity">
                  Propose a Quest
                  <ArrowRight className="w-4 h-4" />
                </a>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Filters */}
      {/* The nav is 96px tall (a 64px logo inside container py-4), not 64 —
          so the filter bar used to park 32px BEHIND an opaque, higher-z
          header, hiding two thirds of the first filter row. top-24 = 6rem. */}
      <section className="sticky top-24 z-30 bg-background/95 backdrop-blur border-b border-border py-4 shadow-sm">
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
                key={quest.id}
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
                      {(() => { const QuestIcon = iconFor(quest.icon); return <QuestIcon className="w-5 h-5 text-teal-700" />; })()}
                    </div>
                    <div className="flex gap-2">
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${(statusColors[quest.status] ?? "bg-muted text-muted-foreground")}`}
                      >
                        {quest.status}
                      </span>
                      <span
                        className={`px-2 py-0.5 text-xs font-medium rounded-full ${(difficultyColors[quest.difficulty] ?? "bg-muted text-muted-foreground")}`}
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
                    <span>{quest.gratitude} Gratitude</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground text-xs">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{quest.duration}</span>
                  </div>
                </div>

                <QuestActions
                  questId={quest.id}
                  signedIn={!!user}
                  claim={claims[quest.id]}
                  onChanged={refreshClaims}
                />
              </motion.div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground">
              <Compass className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>
                {boardFailed
                  ? "The quest board couldn't be loaded just now. Reload to try again."
                  : quests.length === 0
                    ? "There are no quests on the board yet."
                    : "No quests match those filters. Try a different combination."}
              </p>
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
              {/* A fork with no events page shows no button rather than a dead
                  link, the same rule the footer follows. */}
              {eventsUrl && (
                <a
                  href={eventsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-opacity flex items-center gap-2"
                >
                  <Calendar className="w-5 h-5" />
                  Join a Community Call
                </a>
              )}
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
              Gratitude is how {villageName} acknowledges contributions, a recognition signal with
              no financial value of its own. The value rides beside it: each cycle the
              community sets aside a real pool of {valueName} and shares it across
              everyone's Gratitude, so appreciation decides where the value flows.
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
                  title: "Share",
                  body: `Each cycle, everyone's Gratitude shares in a real pool of ${valueName}. As ${villageName} grows, ${valueName} can convert to cash, equity, or community currency. This is how we honor contributions made before we could pay in cash.`,
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
