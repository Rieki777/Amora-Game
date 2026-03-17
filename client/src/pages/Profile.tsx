import Layout from "@/components/Layout";
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
import { useLocation } from "wouter";

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
  const { user, logout, loading } = useAuth();
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState(user?.bio || "");

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

  const recentContributions = user.contributions.slice(-5).reverse();

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-teal-deep/5 to-amber/5 py-12">
        <div className="container">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            {/* Header Section */}
            <div className="mb-8 flex justify-between items-start">
              <div>
                <h1 className="text-5xl font-display font-bold text-teal-deep mb-2">
                  {user.name}
                </h1>
                <p className="text-gray-600">Member since {memberSince}</p>
              </div>
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
                      onClick={() => setEditingBio(!editingBio)}
                      className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-5 h-5 text-gray-600" />
                    </motion.button>
                  </div>
                  {editingBio ? (
                    <textarea
                      value={bioText}
                      onChange={(e) => setBioText(e.target.value)}
                      placeholder="Tell us about yourself..."
                      className="w-full p-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-deep"
                      rows={4}
                    />
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
                    {user.paths.map((pathId) => {
                      const pathInfo = PATH_INFO[pathId];
                      if (!pathInfo) return null;
                      return (
                        <motion.div
                          key={pathId}
                          whileHover={{ scale: 1.05 }}
                          className={`${pathInfo.bgColor} border-2 border-current p-4 rounded-lg ${pathInfo.color} font-semibold flex items-center gap-3`}
                        >
                          {pathInfo.icon}
                          {pathInfo.label}
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
                        <p className="text-2xl font-bold text-blue-600">Founding Member</p>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Total Contributed</p>
                        <p className="text-2xl font-bold text-blue-600">$50,000</p>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Expected ROI</p>
                        <p className="text-2xl font-bold text-blue-600">12%</p>
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
                        <p className="text-2xl font-bold text-green-600">Land Circle</p>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Current Role</p>
                        <p className="text-2xl font-bold text-green-600">Facilitator</p>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Seasons Completed</p>
                        <p className="text-2xl font-bold text-green-600">2</p>
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
                        <p className="text-2xl font-bold text-amber-600">2026</p>
                      </div>
                      <div className="bg-amber-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Housing Type</p>
                        <p className="text-2xl font-bold text-amber-600">Clustered Home</p>
                      </div>
                      <div className="bg-amber-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Years Planned</p>
                        <p className="text-2xl font-bold text-amber-600">10+</p>
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
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="bg-purple-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Business Name</p>
                        <p className="text-2xl font-bold text-purple-600">Coming Soon</p>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">ARI Tier</p>
                        <p className="text-2xl font-bold text-purple-600">Exploring</p>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-lg">
                        <p className="text-sm text-gray-600 mb-1">Hearts Generated</p>
                        <p className="text-2xl font-bold text-purple-600">0</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* Contributions Log */}
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
                    <p className="text-gray-600">No contributions yet. Start your village journey!</p>
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
                                +{contrib.heartsEarned}
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
                {/* Hearts Balance */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-gradient-to-br from-amber to-amber/80 text-white rounded-2xl shadow-lg p-8"
                >
                  <div className="flex items-center justify-between mb-4">
                    <Heart className="w-8 h-8" />
                    <span className="text-xs font-semibold uppercase tracking-widest opacity-75">
                      Hearts Balance
                    </span>
                  </div>
                  <div className="text-5xl font-display font-bold mb-2">{user.heartsBalance}</div>
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
                    <div className="space-y-4">
                      {user.paths.map((path) => (
                        <div key={path}>
                          <p className="text-sm font-semibold text-gray-900 mb-2">
                            {PATH_INFO[path]?.label || path}
                          </p>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <motion.div
                              initial={{ width: 0 }}
                              animate={{ width: "45%" }}
                              transition={{ duration: 1, delay: 0.3 }}
                              className="bg-teal-deep h-2 rounded-full"
                            />
                          </div>
                          <p className="text-xs text-gray-600 mt-1">45% Complete</p>
                        </div>
                      ))}
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
