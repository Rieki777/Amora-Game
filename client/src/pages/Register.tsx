import Layout from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";
import { Heart, ArrowRight, Mail, Lock, User, CheckCircle2, Circle } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const PATHS = [
  {
    id: "investor",
    label: "Investor",
    description: "Support Amora's vision through financial investment",
    color: "bg-blue-50 border-blue-200",
  },
  {
    id: "steward",
    label: "Village Steward",
    description: "Help govern and guide our community's evolution",
    color: "bg-green-50 border-green-200",
  },
  {
    id: "resident",
    label: "Resident",
    description: "Make Amora your home and live the village vision",
    color: "bg-amber-50 border-amber-200",
  },
  {
    id: "prosperity-creator",
    label: "Prosperity Creator",
    description: "Build businesses and enterprises that thrive",
    color: "bg-purple-50 border-purple-200",
  },
];

export default function Register() {
  const [, navigate] = useLocation();
  const { register } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [selectedPaths, setSelectedPaths] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function togglePath(pathId: string) {
    setSelectedPaths((prev) =>
      prev.includes(pathId) ? prev.filter((p) => p !== pathId) : [...prev, pathId]
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (selectedPaths.length === 0) {
      setError("Please select at least one path");
      return;
    }

    setLoading(true);
    try {
      await register(name, email, password, selectedPaths);
      navigate("/profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-teal-deep/5 to-amber/5 py-16">
        <div className="container max-w-2xl">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <div className="text-center mb-12">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 rounded-full bg-teal-deep/10 flex items-center justify-center">
                  <Heart className="w-8 h-8 text-teal-deep" />
                </div>
              </div>
              <h1 className="text-4xl font-display font-bold text-teal-deep mb-2">
                Join Amora
              </h1>
              <p className="text-gray-600">Begin your village journey and choose your path</p>
            </div>

            <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-lg p-8 space-y-8">
              {error && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm"
                >
                  {error}
                </motion.div>
              )}

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Name</label>
                  <div className="relative">
                    <User className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-deep"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-deep"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-deep"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-4 top-3.5 w-5 h-5 text-gray-400" />
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-deep"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-4">
                  Choose Your Path(s)
                </label>
                <div className="grid gap-3">
                  {PATHS.map((path) => (
                    <motion.button
                      key={path.id}
                      type="button"
                      whileHover={{ scale: 1.02 }}
                      onClick={() => togglePath(path.id)}
                      className={`p-4 border-2 rounded-lg text-left transition-all ${
                        selectedPaths.includes(path.id)
                          ? `${path.color} border-current`
                          : "bg-gray-50 border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {selectedPaths.includes(path.id) ? (
                          <CheckCircle2 className="w-5 h-5 mt-0.5 flex-shrink-0 text-teal-deep" />
                        ) : (
                          <Circle className="w-5 h-5 mt-0.5 flex-shrink-0 text-gray-400" />
                        )}
                        <div>
                          <p className="font-semibold text-gray-900">{path.label}</p>
                          <p className="text-sm text-gray-600">{path.description}</p>
                        </div>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                disabled={loading}
                type="submit"
                className="w-full bg-gradient-to-r from-teal-deep to-teal-deep/80 text-white font-semibold py-3 rounded-lg hover:shadow-lg transition-shadow disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? "Creating Account..." : "Create Account"}
                {!loading && <ArrowRight className="w-5 h-5" />}
              </motion.button>
            </form>

            <div className="mt-8 text-center">
              <p className="text-gray-600 mb-4">Already have an account?</p>
              <motion.a
                whileHover={{ scale: 1.05 }}
                href="/login"
                className="inline-flex items-center gap-2 px-6 py-3 border-2 border-amber text-amber font-semibold rounded-lg hover:bg-amber/5 transition-colors"
              >
                Sign In
                <ArrowRight className="w-5 h-5" />
              </motion.a>
            </div>
          </motion.div>
        </div>
      </div>
    </Layout>
  );
}
