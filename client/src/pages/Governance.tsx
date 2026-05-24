import Layout from "@/components/Layout";
import { Link } from "wouter";
import {
  Vote,
  Users,
  Eye,
  Lightbulb,
  MessageSquare,
  CheckCircle2,
  RefreshCw,
  Network,
  ArrowRight,
  Scale,
} from "lucide-react";

const PRINCIPLES = [
  {
    icon: CheckCircle2,
    title: "Consent over consensus",
    body:
      "We don't need everyone to love a decision. We need no one to have a serious objection. This keeps us moving without demanding perfection.",
  },
  {
    icon: Users,
    title: "Circles, not hierarchy",
    body:
      "Decisions are made in the circle closest to the work. The Land Circle governs land decisions. The Community Circle governs social matters. No top-down override.",
  },
  {
    icon: Eye,
    title: "Transparency by default",
    body:
      "Meeting notes, decisions, and proposals are recorded and accessible to all members. Nothing happens in secret.",
  },
];

const DECISION_STEPS = [
  { Icon: Lightbulb, text: "Someone senses a tension or opportunity." },
  { Icon: MessageSquare, text: "They bring a proposal to their circle." },
  { Icon: Users, text: "The circle discusses, amends, and tests for consent." },
  { Icon: CheckCircle2, text: "If no one has a paramount objection, the proposal passes." },
  { Icon: Eye, text: "The decision is logged and published." },
];

export default function Governance() {
  return (
    <Layout>
      {/* Hero */}
      <section className="bg-teal-deep text-white py-20">
        <div className="container max-w-4xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-3">
            <Vote className="w-6 h-6 text-amber" />
            <span className="text-amber font-medium text-sm tracking-widest uppercase">
              How We Govern
            </span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
            Power Belongs to the Circle, Not the Person
          </h1>
          <p className="text-white/80 text-lg max-w-3xl leading-relaxed">
            Amora uses sociocracy, a consent-based governance system where every voice can influence decisions and no single person holds veto power.
          </p>
        </div>
      </section>

      {/* Core Principles */}
      <section className="bg-stone-50 py-20">
        <div className="container max-w-5xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-teal-deep">
              The Core Principles
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {PRINCIPLES.map((p) => {
              const Icon = p.icon;
              return (
                <div
                  key={p.title}
                  className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6"
                >
                  <div className="w-12 h-12 rounded-xl bg-teal-deep/10 text-teal-deep flex items-center justify-center mb-4">
                    <Icon className="w-6 h-6" />
                  </div>
                  <h3 className="font-display text-lg font-semibold text-teal-deep mb-2">
                    {p.title}
                  </h3>
                  <p className="text-sm text-stone-600 leading-relaxed">{p.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* How a decision gets made */}
      <section className="bg-white py-20">
        <div className="container max-w-3xl mx-auto px-4">
          <div className="text-center mb-12">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-teal-deep mb-3">
              How a Decision Gets Made
            </h2>
            <p className="text-muted-foreground">
              Every decision follows the same simple path.
            </p>
          </div>
          <ol className="space-y-4">
            {DECISION_STEPS.map((s, i) => {
              const Icon = s.Icon;
              return (
                <li
                  key={i}
                  className="flex gap-4 items-start bg-stone-50 rounded-2xl border border-stone-200 px-5 py-4"
                >
                  <div className="shrink-0 w-10 h-10 rounded-full bg-teal-deep text-white flex items-center justify-center font-display font-bold">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-3">
                    <Icon className="w-5 h-5 text-teal-deep shrink-0" />
                    <p className="text-stone-700 leading-relaxed">{s.text}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      {/* Circles and their domains */}
      <section className="bg-sage/15 py-20">
        <div className="container max-w-4xl mx-auto px-4">
          <div className="text-center mb-10">
            <h2 className="font-display text-3xl md:text-4xl font-bold text-teal-deep mb-3">
              Circles and Their Domains
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Authority lives close to the work. Each circle governs its domain and reports up only when something crosses boundaries.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4 mb-8">
            {[
              { name: "Village Steward Circle", body: "Coordinates the overall village. Cross-circle alignment, season planning, and shared infrastructure decisions." },
              { name: "Resident Circle", body: "Governs residential life: neighbour relations, shared spaces, household-level agreements, and onboarding new residents." },
              { name: "Land Circle", body: "Stewardship of the 266 acres: water, soil, ecology, regeneration projects, and physical infrastructure." },
              { name: "Prosperity Circle", body: "Business interests, the Gratitude economy, revenue sharing, and shared services that fund village life." },
              { name: "Co-Creator Circle", body: "Holds the cultural rhythm: rites of passage, training, contribution recognition, and Gratitude flows." },
            ].map((c) => (
              <div key={c.name} className="bg-white rounded-2xl border border-stone-200 shadow-sm p-5">
                <h3 className="font-display text-lg font-semibold text-teal-deep mb-1.5">{c.name}</h3>
                <p className="text-sm text-stone-600 leading-relaxed">{c.body}</p>
              </div>
            ))}
          </div>
          <div className="text-center">
            <Link
              href="/circles"
              className="inline-flex items-center gap-2 text-teal-deep font-semibold hover:text-teal transition-colors"
            >
              See all circles in detail <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* Conflict resolution */}
      <section className="bg-white py-20">
        <div className="container max-w-3xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <Scale className="w-6 h-6 text-teal-deep" />
            <h2 className="font-display text-3xl md:text-4xl font-bold text-teal-deep">
              Conflict Resolution
            </h2>
          </div>
          <div className="space-y-4 text-stone-700 leading-relaxed">
            <p>
              When tension shows up, it goes through three stages. First, the people involved have a direct conversation, supported by our shared practice of nonviolent communication. Most things resolve here.
            </p>
            <p>
              If that doesn't land, a facilitated conversation is requested. A trained member from a different circle helps both sides be heard and find a path forward.
            </p>
            <p>
              If the tension still won't resolve, the relevant circle holds a mediation. No one is removed from the community without a circle consent vote. We err on the side of repair and reintegration whenever possible.
            </p>
          </div>
        </div>
      </section>

      {/* How rules evolve */}
      <section className="bg-stone-50 py-20">
        <div className="container max-w-3xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <RefreshCw className="w-6 h-6 text-teal-deep" />
            <h2 className="font-display text-3xl md:text-4xl font-bold text-teal-deep">
              How Rules Evolve
            </h2>
          </div>
          <p className="text-stone-700 leading-relaxed">
            The agreements we launch with are not permanent. Any member can propose a change through their circle. Rules that no longer serve the community get amended or removed. Governance is alive; it grows with us.
          </p>
        </div>
      </section>

      {/* Hypha */}
      <section className="bg-white py-20">
        <div className="container max-w-3xl mx-auto px-4">
          <div className="flex items-center gap-3 mb-4">
            <Network className="w-6 h-6 text-teal-deep" />
            <h2 className="font-display text-3xl md:text-4xl font-bold text-teal-deep">
              The Hypha Platform
            </h2>
          </div>
          <p className="text-stone-700 leading-relaxed mb-4">
            Governance is logged on Hypha, an open-source platform owned by its contributors. Every proposal, vote, and contribution is transparent and traceable. Value in, value out.
          </p>
          <Link
            href="/co-creators-guide"
            className="inline-flex items-center gap-2 text-teal-deep font-semibold hover:text-teal transition-colors"
          >
            Learn more in the Game Guide <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-teal-deep text-white py-20">
        <div className="container max-w-3xl mx-auto px-4 text-center">
          <h2 className="font-display text-3xl md:text-4xl font-bold mb-4">
            Ready to help govern?
          </h2>
          <p className="text-white/80 mb-8">
            Join the circle closest to your gifts and start shaping the village from the inside.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/steward"
              className="inline-flex items-center gap-2 bg-amber text-teal-deep font-semibold px-6 py-3 rounded-xl hover:bg-amber/90 transition-colors"
            >
              Become a Steward <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/love-letter"
              className="inline-flex items-center gap-2 bg-white/10 text-white font-semibold px-6 py-3 rounded-xl hover:bg-white/20 transition-colors border border-white/20"
            >
              Sign the Love Letter
            </Link>
          </div>
        </div>
      </section>
    </Layout>
  );
}
