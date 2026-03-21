import Layout from "@/components/Layout";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, CheckCircle2, ArrowRight, Users, Home, TrendingUp, Sparkles, Send } from "lucide-react";
import { useState } from "react";

const commitments = [
  "Treat all beings with respect, compassion, and authentic communication",
  "Participate in community governance through our sociocratic circles",
  "Contribute to the regeneration of the land and ecosystem",
  "Support fellow community members in their growth and wellbeing",
  "Honor the values and agreements of the Amora community",
  "Practice Nonviolent Communication and authentic relating",
  "Meet financial obligations as agreed with the community",
  "Show up for community life — circles, celebrations, and shared care",
];

const pathOptions = [
  { id: "investor", label: "Investor / Capital Contributor", icon: TrendingUp, color: "border-amber text-amber" },
  { id: "steward", label: "Village Steward / Co-Creator", icon: Users, color: "border-sage text-sage" },
  { id: "resident", label: "Resident / Future Villager", icon: Home, color: "border-teal text-teal" },
  { id: "prosperity", label: "Prosperity Creator / Business Builder", icon: Sparkles, color: "border-teal-light text-teal-light" },
];

export default function LoveLetter() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    paths: [] as string[],
    why: "",
    contribution: "",
    goodNeighbor: false,
    commitmentAck: false,
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  const togglePath = (pathId: string) => {
    setForm(prev => ({
      ...prev,
      paths: prev.paths.includes(pathId)
        ? prev.paths.filter(p => p !== pathId)
        : [...prev.paths, pathId],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.goodNeighbor || !form.commitmentAck) {
      setError("Please acknowledge both commitments to proceed.");
      return;
    }
    if (form.paths.length === 0) {
      setError("Please select at least one path.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch("/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "membership-508",
          data: {
            name: form.name,
            email: form.email,
            phone: form.phone,
            paths: form.paths,
            why: form.why,
            monthlyContribution: form.contribution,
            acknowledgedGoodNeighbor: form.goodNeighbor,
            acknowledgedCommitments: form.commitmentAck,
            signedAt: new Date().toISOString(),
          },
        }),
      });
      if (res.ok) {
        setSubmitted(true);
      } else {
        setError("Something went wrong. Please try again or email us directly at hello@amora.cr");
      }
    } catch {
      setError("Could not connect. Please try again or email hello@amora.cr");
    }
    setSubmitting(false);
  };

  if (submitted) {
    return (
      <Layout>
        <section className="py-24 bg-background">
          <div className="container max-w-2xl mx-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center"
            >
              <motion.div
                className="w-24 h-24 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-8"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Heart className="w-12 h-12 text-primary" fill="currentColor" />
              </motion.div>
              <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-6">
                Welcome, Amoracita
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed mb-8">
                Your membership form has been received. You are now part of the Amora 508(c)(1)(a) community.
              </p>
              <div className="bg-card border border-primary/20 rounded-2xl p-8 mb-8 text-left">
                <h2 className="font-display text-2xl font-bold text-foreground mb-4">What happens next</h2>
                <div className="space-y-4 text-muted-foreground">
                  <div className="flex gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <p>You'll receive a welcome email from the Amora team within 48 hours with your membership details.</p>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <p>We'll schedule a personal welcome call to learn more about your vision and which path calls to you most.</p>
                  </div>
                  <div className="flex gap-3">
                    <CheckCircle2 className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                    <p>You'll be invited to your first Community Circle and introduced to the founding community.</p>
                  </div>
                </div>
              </div>
              <p className="text-lg font-accent text-primary italic mb-8">
                "You are not just joining a place. You are becoming part of something alive."
              </p>
              <a
                href="/"
                className="inline-flex items-center gap-2 px-8 py-4 bg-primary text-primary-foreground rounded-full font-semibold hover:opacity-90 transition-opacity"
              >
                Return Home
                <ArrowRight className="w-5 h-5" />
              </a>
            </motion.div>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="py-16 bg-background">
        <div className="container max-w-3xl mx-auto">

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <Heart className="w-8 h-8 text-primary" />
            </div>
            <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
              The Amora Love Letter
            </h1>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Our founding covenant — and your official membership in Amora 508(c)(1)(a).
              Read. Reflect. Sign.
            </p>
          </motion.div>

          {/* The Letter */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-card p-8 md:p-12 rounded-2xl shadow-lg font-accent text-lg leading-relaxed mb-10 border border-border"
          >
            <p className="mb-6 text-foreground">Dear Future Amoracita,</p>

            <p className="mb-6 text-muted-foreground">
              Something in you called you here. Maybe it was the land — 266 acres of sacred Costa Rican
              jungle, ocean-kissed and alive with possibility. Maybe it was the vision of a village where
              all beings belong and thrive. Maybe it was simply the feeling that the world you want to
              live in needs to be built.
            </p>

            <p className="mb-6 text-muted-foreground">
              By signing this Love Letter, you are not just joining a community. You are becoming a
              co-creator of the most beautiful village we can imagine together. You are saying yes to
              regeneration — of the land, of community, of yourself.
            </p>

            <p className="mb-4 text-foreground font-semibold">As a member of Amora 508(c)(1)(a), you commit to:</p>

            <ul className="space-y-3 mb-8">
              {commitments.map((commitment, i) => (
                <li key={i} className="flex items-start gap-3">
                  <Heart className="w-5 h-5 text-primary mt-1 flex-shrink-0" />
                  <span className="text-muted-foreground">{commitment}</span>
                </li>
              ))}
            </ul>

            <p className="mb-6 text-muted-foreground">
              In return, you become a full member of Amora's 508(c)(1)(a) organization — gaining access
              to community spaces, governance participation, Gratitude economy, and the opportunity to
              deepen your involvement through roles, residency, or business creation.
            </p>

            <p className="mb-6 text-muted-foreground">
              Your monthly membership contribution supports our shared mission and is
              tax-deductible as a contribution to our 508(c)(1)(a) nonprofit.
            </p>

            <p className="text-foreground font-semibold italic">
              With love and anticipation,<br />
              <span className="font-display text-xl not-italic">The Amora Community</span>
            </p>
          </motion.div>

          {/* Membership Form */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="bg-primary/5 border border-primary/20 rounded-2xl p-8 md:p-12"
          >
            <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-2">
              Sign Your Membership
            </h2>
            <p className="text-muted-foreground mb-8">
              Fill in your details below to officially become an Amoracita and member of Amora 508(c)(1)(a).
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">

              {/* Name + Email */}
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Full Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="Your full name"
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Email Address <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                    placeholder="your@email.com"
                    className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Phone / WhatsApp (optional)
                </label>
                <input
                  type="tel"
                  value={form.phone}
                  onChange={e => setForm(p => ({ ...p, phone: e.target.value }))}
                  placeholder="+1 555 000 0000"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Which paths */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">
                  Which path(s) are you on? <span className="text-destructive">*</span>
                </label>
                <p className="text-sm text-muted-foreground mb-4">Select all that apply — you can walk multiple paths.</p>
                <div className="grid md:grid-cols-2 gap-3">
                  {pathOptions.map(path => (
                    <button
                      key={path.id}
                      type="button"
                      onClick={() => togglePath(path.id)}
                      className={`flex items-center gap-3 p-4 rounded-xl border-2 text-left transition-all ${
                        form.paths.includes(path.id)
                          ? `${path.color} bg-primary/5`
                          : "border-border text-muted-foreground hover:border-primary/30"
                      }`}
                    >
                      <path.icon className="w-5 h-5 flex-shrink-0" />
                      <span className="text-sm font-medium">{path.label}</span>
                      {form.paths.includes(path.id) && (
                        <CheckCircle2 className="w-4 h-4 ml-auto flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Monthly contribution */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Monthly Membership Contribution
                </label>
                <p className="text-sm text-muted-foreground mb-3">
                  Tax-deductible contribution to Amora 508(c)(1)(a). Suggested: $33–$108/month.
                </p>
                <select
                  value={form.contribution}
                  onChange={e => setForm(p => ({ ...p, contribution: e.target.value }))}
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                >
                  <option value="">Select contribution level</option>
                  <option value="33">$33/month — Seed level</option>
                  <option value="55">$55/month — Sprout level</option>
                  <option value="88">$88/month — Grove level</option>
                  <option value="108">$108/month — Forest level</option>
                  <option value="custom">I'd like to discuss a custom amount</option>
                </select>
              </div>

              {/* Why */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  What called you to Amora? <span className="text-destructive">*</span>
                </label>
                <textarea
                  required
                  value={form.why}
                  onChange={e => setForm(p => ({ ...p, why: e.target.value }))}
                  rows={4}
                  placeholder="Share what resonates for you, what you're hoping to co-create, and what gifts you'd bring to the village..."
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                />
              </div>

              {/* Acknowledgements */}
              <div className="space-y-4 pt-2">
                <label className="flex items-start gap-3 cursor-pointer">
                  <div
                    onClick={() => setForm(p => ({ ...p, goodNeighbor: !p.goodNeighbor }))}
                    className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors cursor-pointer ${
                      form.goodNeighbor ? "bg-primary border-primary" : "border-border"
                    }`}
                  >
                    {form.goodNeighbor && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    I have read and agree to the{" "}
                    <a href="/good-neighbor" className="text-primary underline" target="_blank">
                      Good Neighbor Criteria
                    </a>{" "}
                    and understand the community standards expected of all members. <span className="text-destructive">*</span>
                  </span>
                </label>

                <label className="flex items-start gap-3 cursor-pointer">
                  <div
                    onClick={() => setForm(p => ({ ...p, commitmentAck: !p.commitmentAck }))}
                    className={`w-5 h-5 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-colors cursor-pointer ${
                      form.commitmentAck ? "bg-primary border-primary" : "border-border"
                    }`}
                  >
                    {form.commitmentAck && <CheckCircle2 className="w-3.5 h-3.5 text-primary-foreground" />}
                  </div>
                  <span className="text-sm text-muted-foreground">
                    I have read the Love Letter above and commit to the values and agreements of the Amora community as a member of Amora 508(c)(1)(a). <span className="text-destructive">*</span>
                  </span>
                </label>
              </div>

              {/* Error */}
              <AnimatePresence>
                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-sm text-destructive bg-destructive/10 px-4 py-3 rounded-xl"
                  >
                    {error}
                  </motion.p>
                )}
              </AnimatePresence>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-4 bg-primary text-primary-foreground rounded-xl font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-3"
              >
                {submitting ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full"
                    />
                    Signing your membership...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Sign the Love Letter &amp; Become an Amoracita
                  </>
                )}
              </button>

              <p className="text-xs text-center text-muted-foreground">
                Your membership is in Amora 508(c)(1)(a), a nonprofit mutual benefit organization.
                Monthly contributions are tax-deductible to the extent permitted by law.
              </p>
            </form>
          </motion.div>
        </div>
      </section>
    </Layout>
  );
}
