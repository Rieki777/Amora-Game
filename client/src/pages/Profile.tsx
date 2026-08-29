import Layout from "@/components/Layout";
import GameDashboard from "@/components/GameDashboard";
import ProfileJourney from "@/components/ProfileJourney";
import NotifyPrefsPanel from "@/components/NotifyPrefsPanel";
import YourAgentPanel from "@/components/YourAgentPanel";
import ProfileSheet from "@/components/ProfileSheet";
import ProfileHero from "@/components/ProfileHero";
import OnchainCard from "@/components/OnchainCard";
import WalletCard from "@/components/WalletCard";
import SendTokensCard from "@/components/SendTokensCard";
import { useAuth } from "@/contexts/AuthContext";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart,
  DollarSign,
  Users,
  Sprout,
  Home,
  TrendingUp,
  Calendar,
  Award,
  Edit2,
  LogOut,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { useState } from "react";
import { Link, useLocation } from "wouter";

const PATH_INFO: Record<
  string,
  { label: string; icon: React.ReactNode; color: string; bgColor: string }
> = {
  investor: {
    label: "Investor",
    icon: <DollarSign className="w-5 h-5" />,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
  },
  steward: {
    label: "Village Steward",
    icon: <Users className="w-5 h-5" />,
    color: "text-green-600",
    bgColor: "bg-green-50",
  },
  resident: {
    label: "Resident",
    icon: <Home className="w-5 h-5" />,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
  },
  "prosperity-creator": {
    label: "Prosperity Creator",
    icon: <Sprout className="w-5 h-5" />,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
  },
};

export default function Profile() {
  const [, navigate] = useLocation();
  const { user, logout, loading, updateProfile } = useAuth();
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState(user?.bio || "");
  const [savingBio, setSavingBio] = useState(false);
  const [bioError, setBioError] = useState("");

  const saveBio = async () => {
    setSavingBio(true);
    setBioError("");
    try {
      await updateProfile({ bio: bioText });
      setEditingBio(false);
    } catch (e: any) {
      setBioError(e?.message || "Could not save, try again");
    } finally {
      setSavingBio(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="min-h-screen bg-gradient-to-br from-teal-deep/5 to-amber/5 flex items-center justify-center">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity }}>
            <Heart className="w-12 h-12 text-teal-deep" />
          </motion.div>
        </div>
      </Layout>
    );
  }

  if (!user) {
    navigate("/login");
    return null;
  }

  const memberSince = new Date(user.joinedAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const recentContributions = (user.contributions ?? []).slice(-5).reverse();

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-teal-deep/5 to-amber/5 py-12">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Header Section */}
            <div className="mb-8 flex justify-between items-start">
              {/* Who you are playing, first. See ProfileHero: a sheet that
                  opens with settings and mentions your characters two screens
                  down is a settings page wearing a character sheet's name. */}
              <ProfileHero name={user.name} handle={user.handle} />
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => logout()}
                className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </motion.button>
            </div>

            {/* Game state: path stage, next action, gratitude, quests */}
            <div className="mb-8">
              <GameDashboard />
            </div>

            {/* S4: the journey in numbers — progression history, flows, ledger */}
            <div className="mb-8">
              <ProfileJourney />
            </div>

            {/* The member's own token balances. Target of /profile#wallet from
                the account menu, and renders nothing when the exchange module
                is off. The village exchange itself stays on /tokens. */}
            <div className="mb-8">
              <WalletCard />
            </div>

            {/* 0092: sending credits to another member. Not module-gated: a
                village running only the core four still has credits arriving
                from the cycle pool, and this is where they can go. Renders
                nothing when the village has no sendable token. */}
            <div className="mb-8">
              <SendTokensCard />
            </div>

            {/* S47: on-chain holdings — renders nothing until the village
                turns the economics section on */}
            <div className="mb-8">
              <OnchainCard />
            </div>

            {/* S16/S18: notification cadence + data rights */}
            <div className="mb-8">
              <NotifyPrefsPanel onDeleted={logout} />
            </div>

            {/* Round 4: your agent, the harness in every profile */}
            <div className="mb-8" id="your-agent"><YourAgentPanel /></div>

            <div className="grid lg:grid-cols-3 gap-8">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-8">
                {/* Bio Section */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-white rounded-2xl shadow-lg p-8"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h2 className="text-2xl font-display font-bold text-teal-deep">About You</h2>
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      onClick={() => { setBioText(user.bio || ""); setEditingBio(!editingBio); }}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      aria-label={editingBio ? "Stop editing your bio" : "Edit your bio"}
                    >
                      <Edit2 className="w-5 h-5 text-gray-600" />
                    </motion.button>
                  </div>
                  {editingBio ? (
                    <>
                      <label htmlFor="profile-bio" className="sr-only">Your bio</label>
                      <textarea
                        id="profile-bio"
                        value={bioText}
                        onChange={(e) => setBioText(e.target.value)}
                        placeholder="Tell us about yourself..."
                        className="w-full p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-deep"
                        rows={4}
                      />
                      {bioError && <p className="text-sm text-red-600 mt-2">{bioError}</p>}
                      <div className="flex items-center gap-3 mt-3">
                        {/* This Save is the whole point: the editor used to
                            discard every word on close, silently. */}
                        <button
                          onClick={saveBio}
                          disabled={savingBio}
                          className="px-4 py-2 bg-teal-deep text-white rounded-lg text-sm font-medium disabled:opacity-50"
                        >
                          {savingBio ? "Saving…" : "Save"}
                        </button>
                        <button
                          onClick={() => { setBioText(user.bio || ""); setEditingBio(false); setBioError(""); }}
                          className="text-sm text-gray-500 hover:text-gray-900"
                        >
                          Cancel
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-gray-600 text-lg leading-relaxed">
                      {user.bio || "No bio yet. Add one to help other villagers know you."}
                    </p>
                  )}
                </motion.div>

                {/* Paths Section */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white rounded-2xl shadow-lg p-8"
                >
                  <h2 className="text-2xl font-display font-bold text-teal-deep mb-6">
                    Your Paths
                  </h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {/* A path this build has not been taught is READ, never
                        dropped. `if (!pathInfo) return null` took the whole
                        tile away, so a member who had walked a path a newer
                        server knows about saw their own paths list come up
                        short with nothing saying why. The block further down
                        this same page already renders the raw id
                        (`PATH_INFO[path]?.label || path`); these two now
                        agree. */}
                    {user.paths.map((pathId) => {
                      const pathInfo = PATH_INFO[pathId];
                      return (
                        <motion.div
                          key={pathId}
                          whileHover={{ scale: 1.05 }}
                          className={`${pathInfo?.bgColor ?? "bg-gray-100"} border-2 border-current p-4 rounded-lg ${pathInfo?.color ?? "text-gray-700"} font-semibold flex items-center gap-3`}
                        >
                          {pathInfo?.icon}
                          {pathInfo?.label ?? pathId}
                        </motion.div>
                      );
                    })}
                  </div>
                </motion.div>

                {/* Path-Specific Sections */}
                {user.paths.includes("investor") && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-white rounded-2xl shadow-lg p-8"
                  >
                    <h3 className="text-xl font-display font-bold text-blue-600 mb-6 flex items-center gap-2">
                      <DollarSign className="w-6 h-6" />
                      Investment Journey
                    </h3>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Investment Tier</p>
                        <p className="text-lg font-bold text-blue-400 italic">None yet</p>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Total Contributed</p>
                        <p className="text-lg font-bold text-blue-400 italic">None yet</p>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Expected ROI</p>
                        <p className="text-lg font-bold text-blue-400 italic">None yet</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {user.paths.includes("steward") && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-white rounded-2xl shadow-lg p-8"
                  >
                    <h3 className="text-xl font-display font-bold text-green-600 mb-6 flex items-center gap-2">
                      <Users className="w-6 h-6" />
                      Steward Role
                    </h3>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="bg-green-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Current Circle</p>
                        <p className="text-lg font-bold text-green-400 italic">None yet</p>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Current Role</p>
                        <p className="text-lg font-bold text-green-400 italic">None yet</p>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Seasons Completed</p>
                        <p className="text-lg font-bold text-green-400 italic">0</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {user.paths.includes("resident") && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-white rounded-2xl shadow-lg p-8"
                  >
                    <h3 className="text-xl font-display font-bold text-amber-600 mb-6 flex items-center gap-2">
                      <Home className="w-6 h-6" />
                      Residency Status
                    </h3>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="bg-amber-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Move-In Status</p>
                        <p className="text-lg font-bold text-amber-400 italic">None yet</p>
                      </div>
                      <div className="bg-amber-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Housing Type</p>
                        <p className="text-lg font-bold text-amber-400 italic">None yet</p>
                      </div>
                      <div className="bg-amber-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Years Planned</p>
                        <p className="text-lg font-bold text-amber-400 italic">None yet</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {user.paths.includes("prosperity-creator") && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="bg-white rounded-2xl shadow-lg p-8"
                  >
                    <h3 className="text-xl font-display font-bold text-purple-600 mb-6 flex items-center gap-2">
                      <Sprout className="w-6 h-6" />
                      Business Venture
                    </h3>
                    {/*
                      This block used to render three fixed strings — "Coming
                      Soon", "Exploring", "0" — styled exactly like the live
                      metrics elsewhere on the page. Nothing behind them
                      existed, so every prosperity creator saw the same numbers
                      and had no way to know they were decoration. Numbers that
                      cannot change are worse than no numbers: they teach
                      people not to trust the ones that can.

                      Recognition IS real and already loaded, so it stays. The
                      rest says plainly that the venture surface is not built.
                    */}
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="bg-purple-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Recognition received</p>
                        <p className="text-2xl font-bold text-purple-600">{user.recognitionBalance ?? 0}</p>
                      </div>
                      <div className="bg-gray-50 border border-dashed border-gray-200 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Your venture</p>
                        <p className="text-sm text-gray-500">
                          Not set up yet. Venture details and revenue-share tiers arrive with the
                          prosperity module. Until then, tell the stewards what you're building.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Monthly Contributions - shown when membership agreement is signed */}
                {(user as any).membershipAgreementSigned && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.35 }}
                    className="bg-white rounded-2xl shadow-lg p-8"
                  >
                    <h3 className="text-xl font-display font-bold text-teal-deep mb-6 flex items-center gap-2">
                      <Calendar className="w-6 h-6" />
                      Monthly Contributions
                    </h3>
                    {(user as any).monthlyContributions && (user as any).monthlyContributions.length > 0 ? (
                      <div className="space-y-3">
                        {(user as any).monthlyContributions.map((mc: { month: string; amount: number; status: string }, idx: number) => (
                          <div key={idx} className="flex items-center justify-between p-3 bg-teal-deep/5 rounded-lg">
                            <span className="text-sm font-medium text-gray-700">{mc.month}</span>
                            <div className="flex items-center gap-3">
                              <span className="font-semibold text-teal-deep">${mc.amount}</span>
                              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                                mc.status === "paid"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}>
                                {mc.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 italic">None yet</p>
                    )}
                  </motion.div>
                )}

                {/* Contributions Log */}
                <ProfileSheet />

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="bg-white rounded-2xl shadow-lg p-8"
                >
                  <h2 className="text-2xl font-display font-bold text-teal-deep mb-6">
                    Your Contributions
                  </h2>
                  {recentContributions.length === 0 ? (
                    /*
                      It used to read "No contributions yet. Start your village
                      journey!", which is an instruction with nowhere to go: the
                      reader is signed in, already on their journey, and the page
                      names no door. There is exactly one door, and the page
                      knows it. A row lands here from `POST /api/profile/contribution`,
                      which no client calls, or from an admin accepting a Work
                      With Us proposal. So the card says the second one and links
                      it, rather than telling somebody to start something they
                      have already started.
                    */
                    <p className="text-gray-600">
                      Nothing here yet. A contribution is recorded when the village
                      accepts an offer you made through{" "}
                      <Link href="/work-with-us" className="text-teal-deep font-medium hover:underline">
                        Work With Us
                      </Link>
                      .
                    </p>
                  ) : (
                    <div className="space-y-4">
                      <AnimatePresence>
                        {recentContributions.map((contrib, idx) => (
                          <motion.div
                            key={contrib.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.1 }}
                            className="flex items-start gap-4 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex-shrink-0 mt-1">
                              <CheckCircle2 className="w-5 h-5 text-green-600" />
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-gray-900">{contrib.description}</p>
                              <p className="text-sm text-gray-600">{contrib.type}</p>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <p className="font-semibold text-amber text-lg flex items-center gap-1">
                                <Heart className="w-4 h-4" />
                                +{contrib.recognitionEarned}
                              </p>
                              <p className="text-xs text-gray-600">
                                {new Date(contrib.date).toLocaleDateString()}
                              </p>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </motion.div>
              </div>

              {/* Sidebar */}
              <div className="space-y-8">
                {/* Gratitude Balance */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-gradient-to-br from-amber to-amber/80 text-white rounded-2xl shadow-lg p-8"
                >
                  <div className="flex items-center justify-between mb-4">
                    <Heart className="w-8 h-8" />
                    <span className="text-xs font-semibold uppercase tracking-widest opacity-75">
                      Gratitude Balance
                    </span>
                  </div>
                  <div className="text-5xl font-display font-bold mb-2">{user.recognitionBalance}</div>
                  <p className="text-amber-100 text-sm">Total earned across all contributions</p>
                </motion.div>

                {/* Journey Progress */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-white rounded-2xl shadow-lg p-8"
                >
                  <h3 className="text-lg font-display font-bold text-teal-deep mb-6 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Journey Progress
                  </h3>
                  {user.paths.length === 0 ? (
                    <p className="text-gray-600 text-sm">No paths selected yet</p>
                  ) : (
                    <div className="space-y-3">
                      {user.paths.map((path) => (
                        <div key={path} className="flex items-center gap-3">
                          <div className={`p-1.5 rounded-lg ${PATH_INFO[path]?.bgColor || "bg-gray-100"}`}>
                            {PATH_INFO[path]?.icon}
                          </div>
                          <p className={`text-sm font-semibold ${PATH_INFO[path]?.color || "text-gray-700"}`}>
                            {PATH_INFO[path]?.label || path}
                          </p>
                        </div>
                      ))}
                      <p className="text-xs text-gray-500 pt-1">Journey details tracked as you participate</p>
                    </div>
                  )}
                </motion.div>

                {/* Quick Links */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-white rounded-2xl shadow-lg p-8"
                >
                  <h3 className="text-lg font-display font-bold text-teal-deep mb-4">
                    Quick Links
                  </h3>
                  <div className="space-y-2">
                    <a
                      href="/quests"
                      className="flex items-center justify-between p-3 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-700">Quests</span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </a>
                    <a
                      href="/circles"
                      className="flex items-center justify-between p-3 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-700">Circles</span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </a>
                    <a
                      href="/housing"
                      className="flex items-center justify-between p-3 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-700">Housing</span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                    </a>
                  </div>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
}
