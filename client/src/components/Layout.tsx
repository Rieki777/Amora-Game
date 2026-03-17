import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, TreePine, Menu, X, User, LogOut } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, logout } = useAuth();

  return (
    <div className="flex flex-col min-h-screen">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-teal-deep text-white shadow-lg">
        <div className="container py-4 flex items-center justify-between">
          <Link href="/">
            <a className="flex items-center gap-2 font-display text-2xl font-bold tracking-widest hover:opacity-80 transition-opacity">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <Heart className="w-4 h-4" />
              </div>
              AM♡RA
            </a>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/" className="text-white/70 hover:text-white transition-colors text-sm">
              Home
            </Link>
            <Link href="/circles" className="text-white/70 hover:text-white transition-colors text-sm">
              Circles
            </Link>
            <Link href="/roles" className="text-white/70 hover:text-white transition-colors text-sm">
              Roles
            </Link>
            <Link href="/how-we-create" className="text-white/70 hover:text-white transition-colors text-sm">
              How We Create
            </Link>

            {user ? (
              <div className="flex items-center gap-3">
                <Link href="/profile">
                  <a className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">
                    <User className="w-4 h-4" />
                    <span>{user.name.split(" ")[0]}</span>
                  </a>
                </Link>
                <button
                  onClick={logout}
                  className="text-white/50 hover:text-white transition-colors"
                  title="Sign out"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link href="/login">
                <a className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">
                  <User className="w-4 h-4" />
                  Sign In
                </a>
              </Link>
            )}

            <a
              href="https://amora.cr"
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 bg-amber text-teal-deep rounded-lg font-medium hover:bg-amber/90 transition-colors text-sm"
            >
              Main Site
            </a>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-white"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden bg-teal-deep/95 border-t border-white/10 overflow-hidden"
            >
              <div className="container py-4 space-y-3">
                <Link href="/" className="block text-white/70 hover:text-white transition-colors text-sm py-2">
                  Home
                </Link>
                <Link href="/circles" className="block text-white/70 hover:text-white transition-colors text-sm py-2">
                  Circles
                </Link>
                <Link href="/roles" className="block text-white/70 hover:text-white transition-colors text-sm py-2">
                  Roles
                </Link>
                <Link href="/how-we-create" className="block text-white/70 hover:text-white transition-colors text-sm py-2">
                  How We Create
                </Link>
                {user ? (
                  <>
                    <Link href="/profile" className="block text-white/70 hover:text-white transition-colors text-sm py-2">
                      My Profile ({user.name.split(" ")[0]})
                    </Link>
                    <button
                      onClick={logout}
                      className="block text-white/50 hover:text-white transition-colors text-sm py-2 text-left"
                    >
                      Sign Out
                    </button>
                  </>
                ) : (
                  <Link href="/login" className="block text-white/70 hover:text-white transition-colors text-sm py-2">
                    Sign In / Register
                  </Link>
                )}
                <a
                  href="https://amora.cr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block px-4 py-2 bg-amber text-teal-deep rounded-lg font-medium hover:bg-amber/90 transition-colors text-center"
                >
                  Main Site
                </a>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-teal-deep text-white py-16">
        <div className="container">
          <div className="grid md:grid-cols-5 gap-12 mb-12">
            {/* Brand */}
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                  <Heart className="w-5 h-5 text-white" />
                </div>
                <span className="font-display text-2xl font-bold tracking-widest">AM♡RA</span>
              </div>
              <p className="text-white/70 text-sm leading-relaxed">
                A regenerative village in Costa Rica where all beings belong and thrive.
              </p>
            </div>

            {/* Your Journey */}
            <div>
              <h4 className="font-display text-lg font-semibold mb-4">Your Journey</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/investor" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Investor
                  </Link>
                </li>
                <li>
                  <Link href="/steward" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Village Steward
                  </Link>
                </li>
                <li>
                  <Link href="/resident" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Resident
                  </Link>
                </li>
                <li>
                  <Link href="/prosperity" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Prosperity Creator
                  </Link>
                </li>
                <li>
                  <Link href="/love-letter" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Sign the Love Letter
                  </Link>
                </li>
              </ul>
            </div>

            {/* Governance & Structure */}
            <div>
              <h4 className="font-display text-lg font-semibold mb-4">Governance</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/circles" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Circles
                  </Link>
                </li>
                <li>
                  <Link href="/roles" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Roles & Leadership
                  </Link>
                </li>
                <li>
                  <Link href="/how-we-create" className="text-white/70 hover:text-amber transition-colors text-sm">
                    How We Create
                  </Link>
                </li>
                <li>
                  <Link href="/good-neighbor" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Good Neighbor Criteria
                  </Link>
                </li>
                <li>
                  <Link href="/team" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Our Team
                  </Link>
                </li>
              </ul>
            </div>

            {/* Resources */}
            <div>
              <h4 className="font-display text-lg font-semibold mb-4">Resources</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/co-creators-guide" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Co-Creators Guide
                  </Link>
                </li>
                <li>
                  <Link href="/quests" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Community Quests
                  </Link>
                </li>
                <li>
                  <Link href="/housing" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Housing
                  </Link>
                </li>
                <li>
                  <Link href="/opportunities" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Business Opportunities
                  </Link>
                </li>
                <li>
                  <Link href="/master-plan" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Master Plan
                  </Link>
                </li>
              </ul>
            </div>

            {/* Connect */}
            <div>
              <h4 className="font-display text-lg font-semibold mb-4">Connect</h4>
              <ul className="space-y-2">
                <li>
                  <a
                    href="https://amora.cr"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/70 hover:text-amber transition-colors text-sm"
                  >
                    Main Website
                  </a>
                </li>
                <li>
                  <a
                    href="https://amora.cr/events/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/70 hover:text-amber transition-colors text-sm"
                  >
                    Events
                  </a>
                </li>
                <li>
                  <a
                    href="https://amora.cr/event/discover-amora-webinar-qa/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-white/70 hover:text-amber transition-colors text-sm"
                  >
                    Community Calls
                  </a>
                </li>
                <li>
                  <Link href="/profile" className="text-white/70 hover:text-amber transition-colors text-sm">
                    My Village Profile
                  </Link>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-white/20 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
            <p className="text-white/50 text-sm">
              © {new Date().getFullYear()} Amora. All rights reserved.
            </p>
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <TreePine className="w-4 h-4" />
              <span>Built with Pura Vida in Costa Rica</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
