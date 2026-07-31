import { Link } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { TreePine, Menu, X, User, LogOut, ChevronDown, TrendingUp, Users, Home as HomeIcon, Sparkles } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useModule } from "@/modules/ModuleProvider";
import NotificationBell from "@/components/NotificationBell";
import { useGameConfig } from "@/lib/gameApi";
import MobileTabBar from "./mobile/MobileTabBar";
import MobileFab from "./mobile/MobileFab";

interface LayoutProps {
  children: React.ReactNode;
}

const paths = [
  { href: "/investor", label: "Investor", subtitle: "Capital Contributor", icon: TrendingUp },
  { href: "/steward", label: "Village Steward", subtitle: "Co-Creator", icon: Users },
  { href: "/resident", label: "Resident", subtitle: "Co-Creator", icon: HomeIcon },
  { href: "/prosperity", label: "Prosperity Creator", subtitle: "Business Builder", icon: Sparkles },
];

export default function Layout({ children }: LayoutProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pathsOpen, setPathsOpen] = useState(false);
  const [mobilePathsOpen, setMobilePathsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { user, logout } = useAuth();
  // The shell's identity — logo, name, outside links, footer copy — comes
  // from the live config, never from literals: this is what makes a fork's
  // shell the fork's without touching a component. While config is loading
  // the logo boxes reserve their height (64px header / 90px footer) so the
  // page never shifts on first paint, and outside links simply don't render.
  const cfg = useGameConfig();
  const siteUrl = String(cfg?.project?.siteUrl ?? "").trim();
  const eventsUrl = String(cfg?.project?.eventsUrl ?? "").trim();
  const villageName = String(cfg?.project?.name ?? "").trim();
  const toolsModule = useModule("tools");
  const mapModule = useModule("map");
  const forumModule = useModule("forum");
  const feedModule = useModule("feed");
  const staysModule = useModule("stays");
  const exchangeModule = useModule("exchange");
  const badgesModule = useModule("badges");
  const libraryModule = useModule("library");
  const healthModule = useModule("health");
  // Footer-only (see the note by the desktop nav: it is already ~1250px wide
  // and two more header links reopen the sideways-scroll bug below xl).
  const commerceModule = useModule("commerce");
  const networkModule = useModule("network");

  // The bottom tab bar's "More" slot opens this same drawer rather than being a
  // second, separately-maintained menu. No scrolling: the header is sticky, so
  // the drawer is already in view wherever the person is on the page. An earlier
  // version scrolled to the top first and the smooth scroll fought the drawer's
  // height animation, jumping the page a few hundred pixels down instead.
  useEffect(() => {
    const openMenu = () => setMobileMenuOpen(true);
    window.addEventListener("open-mobile-menu", openMenu);
    return () => window.removeEventListener("open-mobile-menu", openMenu);
  }, []);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-teal-deep text-white shadow-lg">
        <div className="container py-4 flex items-center justify-between">
          {/* One anchor, not two. wouter's Link renders the <a> itself, so a
              nested <a> is invalid markup: the browser closes the outer one
              early and leaves an EMPTY focusable link as the first stop in
              the tab order on every page — a keyboard or screen-reader user
              meets an unnamed link before anything else on the site.
              The logo itself comes from the brand config: the fixed 64px box
              holds the space while it loads, so nothing shifts. */}
          <Link
            href="/"
            aria-label={villageName ? `${villageName} — home` : "Home"}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity"
            style={{ minHeight: "64px" }}
          >
            {cfg?.images?.logo ? (
              <img
                src={cfg.images.logo}
                alt={villageName || "Village logo"}
                style={{ height: "64px", width: "auto" }}
                draggable={false}
              />
            ) : (
              <span style={{ height: "64px", display: "inline-block" }} aria-hidden="true" />
            )}
          </Link>

          {/* Desktop Menu.
              Shown from `xl`, not `md`. This nav is ~1250px wide, so between
              the md breakpoint (768px) and ~1310px it overflowed the viewport
              and every page on the site scrolled sideways — iPads, small
              laptops and split-screen windows all landed in that gap. The
              mobile menu below carries those widths instead; the two
              breakpoints are a matched pair and must always move together, or
              some viewport gets no navigation at all. */}
          <div className="hidden xl:flex items-center gap-3 2xl:gap-6">
            <Link href="/" className="text-white/70 hover:text-white transition-colors text-sm">
              Home
            </Link>

            {/* Your Path Dropdown */}
            {/* Hover was the ONLY way to open this: the button had no
                onClick, so Enter and Space fired a click with no listener and
                the four path links never entered the tab order at all. The
                keyboard-correct twin lives in the mobile block, which is
                display:none at this width — so no code path covered a
                keyboard user on a desktop screen. Escape closes, because a
                click-toggle that a mouse user cannot re-open (the pointer is
                still inside the wrapper, so no fresh mouseenter fires) needs
                a second way out. */}
            <div
              ref={dropdownRef}
              className="relative"
              onMouseEnter={() => setPathsOpen(true)}
              onMouseLeave={() => setPathsOpen(false)}
              onKeyDown={(e) => { if (e.key === "Escape") setPathsOpen(false); }}
            >
              <button
                type="button"
                onClick={() => setPathsOpen((v) => !v)}
                aria-expanded={pathsOpen}
                aria-haspopup="true"
                aria-controls="paths-menu"
                className="flex items-center gap-1 text-white/70 hover:text-white transition-colors text-sm"
              >
                Your Path
                <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${pathsOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence>
                {pathsOpen && (
                  <motion.div
                    id="paths-menu"
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-56 bg-white rounded-xl shadow-xl overflow-hidden z-50"
                  >
                    {paths.map((path) => (
                      <Link key={path.href} href={path.href}>
                        <a
                          className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group"
                          onClick={() => setPathsOpen(false)}
                        >
                          <div className="mt-0.5 w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                            <path.icon className="w-3.5 h-3.5 text-primary" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-gray-900">{path.label}</div>
                            <div className="text-xs text-gray-500">{path.subtitle}</div>
                          </div>
                        </a>
                      </Link>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <Link href="/circles" className="text-white/70 hover:text-white transition-colors text-sm">
              Circles
            </Link>
            <Link href="/roles" className="text-white/70 hover:text-white transition-colors text-sm">
              Roles
            </Link>
            <Link href="/quests" className="text-white/70 hover:text-white transition-colors text-sm">
              Quests
            </Link>
            {feedModule && (
              <Link href="/feed" className="text-white/70 hover:text-white transition-colors text-sm">
                Feed
                {feedModule.lifecycle === "preview" && (
                  <span className="ml-1 text-[9px] bg-amber/30 text-amber-200 px-1 py-0.5 rounded uppercase">preview</span>
                )}
              </Link>
            )}
            {staysModule && (
              <Link href="/stay" className="text-white/70 hover:text-white transition-colors text-sm">
                Stay
                {staysModule.lifecycle === "preview" && (
                  <span className="ml-1 text-[9px] bg-amber/30 text-amber-200 px-1 py-0.5 rounded uppercase">preview</span>
                )}
              </Link>
            )}
            {exchangeModule && (
              <Link href="/wallet" className="text-white/70 hover:text-white transition-colors text-sm">
                Wallet
                {exchangeModule.lifecycle === "preview" && (
                  <span className="ml-1 text-[9px] bg-amber/30 text-amber-200 px-1 py-0.5 rounded uppercase">preview</span>
                )}
              </Link>
            )}
            {badgesModule && (
              <Link href="/badges" className="text-white/70 hover:text-white transition-colors text-sm">
                Badges
                {badgesModule.lifecycle === "preview" && (
                  <span className="ml-1 text-[9px] bg-amber/30 text-amber-200 px-1 py-0.5 rounded uppercase">preview</span>
                )}
              </Link>
            )}
            {libraryModule && (
              <Link href="/library" className="text-white/70 hover:text-white transition-colors text-sm">
                Library
                {libraryModule.lifecycle === "preview" && (
                  <span className="ml-1 text-[9px] bg-amber/30 text-amber-200 px-1 py-0.5 rounded uppercase">preview</span>
                )}
              </Link>
            )}
            {healthModule && (
              <Link href="/village-health" className="text-white/70 hover:text-white transition-colors text-sm">
                Health
                {healthModule.lifecycle === "preview" && (
                  <span className="ml-1 text-[9px] bg-amber/30 text-amber-200 px-1 py-0.5 rounded uppercase">preview</span>
                )}
              </Link>
            )}
            {forumModule && (
              <Link href="/forum" className="text-white/70 hover:text-white transition-colors text-sm">
                Forum
                {forumModule.lifecycle === "preview" && (
                  <span className="ml-1 text-[9px] bg-amber/30 text-amber-200 px-1 py-0.5 rounded uppercase">preview</span>
                )}
              </Link>
            )}
            {mapModule && (
              <Link href="/map" className="text-white/70 hover:text-white transition-colors text-sm">
                Map
                {mapModule.lifecycle === "preview" && (
                  <span className="ml-1 text-[9px] bg-amber/30 text-amber-200 px-1 py-0.5 rounded uppercase">preview</span>
                )}
              </Link>
            )}
            {toolsModule && (
              <Link href="/tools" className="text-white/70 hover:text-white transition-colors text-sm">
                Tools
                {toolsModule.lifecycle === "preview" && (
                  <span className="ml-1 text-[9px] bg-amber/30 text-amber-200 px-1 py-0.5 rounded uppercase">preview</span>
                )}
              </Link>
            )}
            <Link href="/work-with-us" className="text-white/70 hover:text-white transition-colors text-sm">
              Work With Us
            </Link>
            <Link href="/how-we-create" className="text-white/70 hover:text-white transition-colors text-sm">
              How We Create
            </Link>
            {/* Team-only page, team-only link (audit 2026-07-27 flagged it
                showing to logged-out visitors). */}
            {user && (user.role === "admin" || user.role === "founder") && (
              <Link href="/journey-to-launch" className="text-amber/80 hover:text-amber transition-colors text-sm font-medium">
                🌳 Launch Plan
              </Link>
            )}

            {user ? (
              <div className="flex items-center gap-3">
                <NotificationBell />
                <Link href="/profile" className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">
                  <User className="w-4 h-4" />
                  <span>{user.name.split(" ")[0]}</span>
                </Link>
                <button
                  onClick={logout}
                  className="text-white/50 hover:text-white transition-colors pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:inline-flex pointer-coarse:items-center pointer-coarse:justify-center pointer-coarse:-m-2"
                  // title is a hover tooltip and a phone has no hover, so an
                  // icon-only control needs a real name as well. "Everywhere"
                  // is honest, not decorative: tokenVersion is the only
                  // revocation lever, so this ends the session on every device.
                  aria-label="Sign out everywhere"
                  title="Sign out everywhere"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <Link href="/login" className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">
                <User className="w-4 h-4" />
                Sign In
              </Link>
            )}

            {siteUrl && (
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-amber text-teal-deep rounded-lg font-medium hover:bg-amber/90 transition-colors text-sm"
              >
                Main Site
              </a>
            )}
          </div>

          {/* Mobile Menu Button (bell beside it when signed in) */}
          <div className="xl:hidden flex items-center gap-1 text-white">
            {user && <NotificationBell />}
            {/* Icon-only, so it needs a spoken name and a state a screen
                reader can hear — otherwise it announces as bare "button". */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-menu"
              className="text-white inline-flex items-center justify-center pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:-m-2"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              id="mobile-menu"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="xl:hidden bg-teal-deep/95 border-t border-white/10 overflow-hidden"
            >
              <div className="container py-4 space-y-3">
                <Link href="/" className="block text-white/70 hover:text-white transition-colors text-sm py-2" onClick={() => setMobileMenuOpen(false)}>
                  Home
                </Link>

                {/* Mobile Paths Accordion */}
                <div>
                  <button
                    onClick={() => setMobilePathsOpen(!mobilePathsOpen)}
                    className="flex items-center justify-between w-full text-white/70 hover:text-white transition-colors text-sm py-2"
                  >
                    <span>Your Path</span>
                    <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${mobilePathsOpen ? "rotate-180" : ""}`} />
                  </button>
                  <AnimatePresence>
                    {mobilePathsOpen && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden pl-3 border-l border-white/20 ml-1 space-y-1"
                      >
                        {paths.map((path) => (
                          <Link key={path.href} href={path.href} className="block text-white/60 hover:text-white transition-colors text-sm py-1.5" onClick={() => { setMobileMenuOpen(false); setMobilePathsOpen(false); }}>
                            {path.label}
                          </Link>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <Link href="/circles" className="block text-white/70 hover:text-white transition-colors text-sm py-2" onClick={() => setMobileMenuOpen(false)}>
                  Circles
                </Link>
                <Link href="/roles" className="block text-white/70 hover:text-white transition-colors text-sm py-2" onClick={() => setMobileMenuOpen(false)}>
                  Roles
                </Link>
                <Link href="/quests" className="block text-white/70 hover:text-white transition-colors text-sm py-2" onClick={() => setMobileMenuOpen(false)}>
                  Quests
                </Link>
                {feedModule && (
                  <Link href="/feed" className="block text-white/70 hover:text-white transition-colors text-sm py-2" onClick={() => setMobileMenuOpen(false)}>
                    Feed{feedModule.lifecycle === "preview" ? " (preview)" : ""}
                  </Link>
                )}
                {staysModule && (
                  <Link href="/stay" className="block text-white/70 hover:text-white transition-colors text-sm py-2" onClick={() => setMobileMenuOpen(false)}>
                    Stay{staysModule.lifecycle === "preview" ? " (preview)" : ""}
                  </Link>
                )}
                {exchangeModule && (
                  <Link href="/wallet" className="block text-white/70 hover:text-white transition-colors text-sm py-2" onClick={() => setMobileMenuOpen(false)}>
                    Wallet{exchangeModule.lifecycle === "preview" ? " (preview)" : ""}
                  </Link>
                )}
                {badgesModule && (
                  <Link href="/badges" className="block text-white/70 hover:text-white transition-colors text-sm py-2" onClick={() => setMobileMenuOpen(false)}>
                    Badges{badgesModule.lifecycle === "preview" ? " (preview)" : ""}
                  </Link>
                )}
                {libraryModule && (
                  <Link href="/library" className="block text-white/70 hover:text-white transition-colors text-sm py-2" onClick={() => setMobileMenuOpen(false)}>
                    Library{libraryModule.lifecycle === "preview" ? " (preview)" : ""}
                  </Link>
                )}
                {healthModule && (
                  <Link href="/village-health" className="block text-white/70 hover:text-white transition-colors text-sm py-2" onClick={() => setMobileMenuOpen(false)}>
                    Health{healthModule.lifecycle === "preview" ? " (preview)" : ""}
                  </Link>
                )}
                {forumModule && (
                  <Link href="/forum" className="block text-white/70 hover:text-white transition-colors text-sm py-2" onClick={() => setMobileMenuOpen(false)}>
                    Forum{forumModule.lifecycle === "preview" ? " (preview)" : ""}
                  </Link>
                )}
                {mapModule && (
                  <Link href="/map" className="block text-white/70 hover:text-white transition-colors text-sm py-2" onClick={() => setMobileMenuOpen(false)}>
                    Map{mapModule.lifecycle === "preview" ? " (preview)" : ""}
                  </Link>
                )}
                {toolsModule && (
                  <Link href="/tools" className="block text-white/70 hover:text-white transition-colors text-sm py-2" onClick={() => setMobileMenuOpen(false)}>
                    Tools{toolsModule.lifecycle === "preview" ? " (preview)" : ""}
                  </Link>
                )}
                <Link href="/work-with-us" className="block text-white/70 hover:text-white transition-colors text-sm py-2" onClick={() => setMobileMenuOpen(false)}>
                  Work With Us
                </Link>
                <Link href="/how-we-create" className="block text-white/70 hover:text-white transition-colors text-sm py-2" onClick={() => setMobileMenuOpen(false)}>
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
                      Sign Out Everywhere
                    </button>
                  </>
                ) : (
                  <Link href="/login" className="block text-white/70 hover:text-white transition-colors text-sm py-2">
                    Sign In / Register
                  </Link>
                )}
                {siteUrl && (
                  <a
                    href={siteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-4 py-2 bg-amber text-teal-deep rounded-lg font-medium hover:bg-amber/90 transition-colors text-center"
                  >
                    Main Site
                  </a>
                )}
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
              {/* 90px box reserved while config loads — same rule as the header. */}
              <div className="flex items-center gap-2 mb-4" style={{ minHeight: "90px" }}>
                {cfg?.images?.heartLogo && (
                  <img
                    src={cfg.images.heartLogo}
                    alt={villageName || "Village mark"}
                    style={{ height: "90px", width: "auto" }}
                    draggable={false}
                  />
                )}
              </div>
              {cfg?.project?.footerBlurb && (
                <p className="text-white/70 text-sm leading-relaxed">{cfg.project.footerBlurb}</p>
              )}
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
                <li>
                  <Link href="/visit" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Plan a Visit
                  </Link>
                </li>
                <li>
                  <Link href="/gratitude" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Gratitude Wall
                  </Link>
                </li>
                <li>
                  <Link href="/work-with-us" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Work With Us
                  </Link>
                </li>
              </ul>
            </div>

            {/* Governance & Structure */}
            <div>
              <h4 className="font-display text-lg font-semibold mb-4">Governance</h4>
              <ul className="space-y-2">
                <li>
                  <Link href="/governance" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Governance
                  </Link>
                </li>
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
                {/* Three pages the app mounted and then linked from nowhere.
                    The module-gated two must stay gated: both render NotFound
                    when their module is off, which is the default for every
                    optional module, so an ungated link would be a dead end on
                    a fresh fork. /exit-policy is core and always reachable. */}
                <li>
                  <Link href="/game-mechanics" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Game Mechanics
                  </Link>
                </li>
                <li>
                  <Link href="/exit-policy" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Leaving Well
                  </Link>
                </li>
                {networkModule && (
                  <li>
                    <Link href="/network" className="text-white/70 hover:text-amber transition-colors text-sm">
                      Village Network
                    </Link>
                  </li>
                )}
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
                  <Link href="/feedback" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Report a Bug / Share an Idea
                  </Link>
                </li>
                <li>
                  <Link href="/quests" className="text-white/70 hover:text-amber transition-colors text-sm">
                    Community Quests
                  </Link>
                </li>
                {commerceModule && (
                  <li>
                    <Link href="/contribute" className="text-white/70 hover:text-amber transition-colors text-sm">
                      Contribute
                    </Link>
                  </li>
                )}
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
                {siteUrl && (
                  <li>
                    <a
                      href={siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/70 hover:text-amber transition-colors text-sm"
                    >
                      Main Website
                    </a>
                  </li>
                )}
                {eventsUrl && (
                  <li>
                    <a
                      href={eventsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-white/70 hover:text-amber transition-colors text-sm"
                    >
                      Events
                    </a>
                  </li>
                )}
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
              © {new Date().getFullYear()}{villageName ? ` ${villageName}.` : ""} All rights reserved.
            </p>
            <div className="flex items-center gap-2 text-white/50 text-sm">
              <TreePine className="w-4 h-4" />
              <span>Built with Pura Vida by ReGenCivics.Earth</span>
            </div>
          </div>
        </div>
      </footer>

      {/* Clearance so the fixed tab bar never covers the end of the footer. */}
      <div
        aria-hidden="true"
        className="md:hidden"
        style={{ height: "calc(env(safe-area-inset-bottom, 0px) + 4rem)" }}
      />

      <MobileTabBar />
      <MobileFab />
    </div>
  );
}
