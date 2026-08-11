import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { lazy, Suspense, useEffect, useState } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ModuleProvider } from "./modules/ModuleProvider";
import { chooseLanding, getPreference, recordVisit, wasMapAvailable } from "./lib/landing";

/**
 * After two visits, "/" means the map (client/src/lib/landing.ts has the
 * rules; an explicit member choice always wins). The redirect happens here,
 * synchronously, before Home renders — deciding after the module catalogue
 * loads would flash the welcome page and then yank it away. The price of
 * deciding early is that map availability is one visit stale (cached by the
 * map page itself); the safe direction is built in, because a stale "not
 * available" just means the welcome page.
 *
 * `useState` initialiser, not `useEffect`: the visit must be counted exactly
 * once per page load, before first paint, and effects run twice in dev
 * StrictMode.
 */
function useLanding(): "home" | "map" {
  const [landing] = useState(() => {
    const visits = recordVisit();
    return chooseLanding({ visits, preference: getPreference(), mapAvailable: wasMapAvailable() });
  });
  return landing;
}

function LandingRoute() {
  const landing = useLanding();
  const [, navigate] = useLocation();
  useEffect(() => {
    if (landing === "map") navigate("/map", { replace: true });
  }, [landing, navigate]);
  return landing === "home" ? <Home /> : null;
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    // If the URL carries an anchor (e.g. /#choose-path from another page),
    // scroll to it once the new page has rendered instead of forcing the top.
    const hash = window.location.hash;
    if (hash) {
      const t = setTimeout(() => {
        const el = document.querySelector(hash);
        if (el) el.scrollIntoView({ behavior: "smooth" });
        else window.scrollTo({ top: 0, behavior: "instant" });
      }, 100);
      return () => clearTimeout(t);
    }
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [location]);
  return null;
}

/**
 * The page's name, in the browser and to a screen reader.
 *
 * Every one of the twenty-six routes served the single <title> baked into
 * index.html, so this whole application announced itself as one page. Three
 * separate costs: a screen reader reads the title on navigation, so every
 * move sounded identical and gave no confirmation anything had happened; a
 * member with several tabs open could not tell them apart; and the title was
 * a hardcoded village name in a platform that is supposed to be forkable.
 *
 * The village's own name comes from the live config, so a fork's title is
 * the fork's name with no code change. The page part is a plain map — a
 * route that gains a page adds a line, and one that does not falls back to
 * the village name alone rather than to a lie.
 */
const PAGE_TITLES: Record<string, string> = {
  "/": "", // the home page is the village itself; no prefix
  "/journey-to-launch": "Journey to launch",
  "/project-history": "What we have built",
  "/feedback": "Feedback",
  "/network": "Village network",
  "/contribute": "Contribute",
  "/seasonal-festivals": "Seasonal festivals",
  "/investor": "Investor journey",
  "/steward": "Steward journey",
  "/resident": "Resident journey",
  "/prosperity": "Prosperity journey",
  "/love-letter": "Love letter",
  "/circles": "Circles",
  "/quests": "Quests",
  "/propose-quest": "Propose a quest",
  "/roles": "Roles",
  "/forum": "Forum",
  "/feed": "Village feed",
  "/map": "Village map",
  "/map/circles": "Circles and seats",
  "/events": "What is on",
  "/first-walk": "Meet your village",
  "/stay": "Stays",
  "/library": "Material library",
  "/badges": "Badges & skills",
  // Keys here are matched by longest PREFIX against the live location, so a
  // key with no route behind it can never match and is dead weight that
  // reads like a promise. /health, /exchange and /profiles were all three:
  // the health dashboard is /village-health, the exchange lives inside the
  // wallet, and the member directory is /profile.
  "/village-health": "Village health",
  // Both spellings resolve to the same page. /tokens is what the nav links to
  // and what a member sees; /wallet stays mounted because Stripe return URLs
  // and order notifications already carry it (server/index.ts), and a member's
  // own balances now also live in a Wallet section on their profile.
  "/tokens": "Tokens",
  "/wallet": "Tokens",
  "/profile": "My profile",
  "/login": "Sign in",
  "/set-password": "Choose a password",
  "/forgot-password": "Set a new password",
  "/game-mechanics": "Game Mechanics",
  "/exit-policy": "Leaving well",
  "/tools": "Tools",
  "/admin": "Village settings",
};

function PageTitle() {
  const [location] = useLocation();
  const [village, setVillage] = useState<string>("");

  useEffect(() => {
    let alive = true;
    fetch("/api/game/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return;
        setVillage(d?.project?.name ?? "");
        // The tab ICON is identity too. index.html ships a neutral platform
        // favicon (a static file cannot know which village it serves); this
        // swaps in the village's own the moment config arrives, same
        // pattern as the title below.
        const favicon = String(d?.images?.favicon ?? "").trim();
        if (favicon) {
          for (const rel of ["icon", "apple-touch-icon"]) {
            let link = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
            if (!link) {
              link = document.createElement("link");
              link.rel = rel;
              document.head.appendChild(link);
            }
            link.href = favicon;
          }
        }
      })
      .catch(() => { /* keep whatever index.html shipped */ });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (!village) return;
    // Longest matching prefix, so /forum/123 still reads as the forum.
    const match = Object.keys(PAGE_TITLES)
      .filter((p) => p === "/" ? location === "/" : location.startsWith(p))
      .sort((a, b) => b.length - a.length)[0];
    const page = match ? PAGE_TITLES[match] : "";
    document.title = page ? `${page} · ${village}` : village;
  }, [location, village]);

  return null;
}
/**
 * ROUTE SPLITTING — the rule for anyone adding a page.
 *
 * The main bundle sat at 1382 KB against CI's 1400 KB ceiling: 18 KB of
 * headroom for a platform about to add a design system, an identity intake
 * and an art review queue. The CI gate says the right thing already — "split
 * a route rather than raising the budget" — so every page below the eager set
 * is `lazy()`.
 *
 * EAGER = what an arriving human sees before they choose anything: the home
 * page, the sign-in page a deep link bounces them to, and the 404. Everything
 * else is a chunk fetched on navigation and cached from then on.
 *
 * That trade is strictly good on the ~50 KB/s links this platform is built
 * for: today a visitor downloads all 26,000 lines of every page — including
 * Admin's 6,980 and Project History's 2,870, which most members never open —
 * before anything renders. After this they download the shell plus the one
 * page they asked for.
 *
 * New page? Add it to the lazy list. Only add to the eager set if it renders
 * on first paint for a signed-out visitor.
 */
import Home from "./pages/Home";
import Login from "./pages/Login";

const lazyPage = (loader: () => Promise<{ default: React.ComponentType<any> }>) => lazy(loader);

const InvestorJourney = lazyPage(() => import("./pages/InvestorJourney"));
const StewardJourney = lazyPage(() => import("./pages/StewardJourney"));
const ResidentJourney = lazyPage(() => import("./pages/ResidentJourney"));
const ProsperityJourney = lazyPage(() => import("./pages/ProsperityJourney"));
const LoveLetter = lazyPage(() => import("./pages/LoveLetter"));
const Circles = lazyPage(() => import("./pages/Circles"));
const Quests = lazyPage(() => import("./pages/Quests"));
const ProposeQuest = lazyPage(() => import("./pages/ProposeQuest"));
const Roles = lazyPage(() => import("./pages/Roles"));
const HowWeCreate = lazyPage(() => import("./pages/HowWeCreate"));
const CoCreatorsGuide = lazyPage(() => import("./pages/CoCreatorsGuide"));
const Housing = lazyPage(() => import("./pages/Housing"));
const Opportunities = lazyPage(() => import("./pages/Opportunities"));
const MasterPlan = lazyPage(() => import("./pages/MasterPlan"));
const Team = lazyPage(() => import("./pages/Team"));
const Admin = lazyPage(() => import("./pages/Admin"));
const Profile = lazyPage(() => import("./pages/Profile"));
const Characters = lazyPage(() => import("./pages/Characters"));
const PublicProfile = lazyPage(() => import("./pages/PublicProfile"));
const Register = lazyPage(() => import("./pages/Register"));
const SetPassword = lazyPage(() => import("./pages/SetPassword"));
const ForgotPassword = lazyPage(() => import("./pages/ForgotPassword"));
const GameMechanics = lazyPage(() => import("./pages/GameMechanics"));
const GoodNeighbor = lazyPage(() => import("./pages/GoodNeighbor"));
const JourneyToLaunch = lazyPage(() => import("./pages/JourneyToLaunch"));
const ProjectHistory = lazyPage(() => import("./pages/ProjectHistory"));
const Feedback = lazyPage(() => import("./pages/Feedback"));
const Network = lazyPage(() => import("./pages/Network"));
const Contribute = lazyPage(() => import("./pages/Contribute"));
const SeasonalFestivals = lazyPage(() => import("./pages/SeasonalFestivals"));
const StewardRights = lazyPage(() => import("./pages/StewardRights"));
const ResidentRights = lazyPage(() => import("./pages/ResidentRights"));
const Training = lazyPage(() => import("./pages/Training"));
const Governance = lazyPage(() => import("./pages/Governance"));
const Visit = lazyPage(() => import("./pages/Visit"));
const GratitudeWall = lazyPage(() => import("./pages/GratitudeWall"));
const WorkWithUs = lazyPage(() => import("./pages/WorkWithUs"));
const ToolsHub = lazyPage(() => import("./pages/ToolsHub"));
const VillageMap = lazyPage(() => import("./pages/VillageMap"));
const LivingMap = lazyPage(() => import("./pages/LivingMap"));
const Events = lazyPage(() => import("./pages/Events"));
const FirstWalk = lazyPage(() => import("./pages/FirstWalk"));
const Forum = lazyPage(() => import("./pages/Forum"));
const Feed = lazyPage(() => import("./pages/Feed"));
const Stay = lazyPage(() => import("./pages/Stay"));
const Wallet = lazyPage(() => import("./pages/Wallet"));
const Badges = lazyPage(() => import("./pages/Badges"));
const Library = lazyPage(() => import("./pages/Library"));
const VillageHealth = lazyPage(() => import("./pages/VillageHealth"));
const ExitPolicy = lazyPage(() => import("./pages/ExitPolicy"));

/**
 * Shown while a page chunk arrives. Deliberately quiet: on a slow link this
 * appears for a second or two, and a spinner that shouts is worse than one
 * that waits. `min-h` holds the viewport so the footer does not jump up and
 * back down as the chunk lands.
 */
function PageLoading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status" aria-live="polite">
      <span className="sr-only">Loading page</span>
      <div
        aria-hidden="true"
        className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-foreground/60"
      />
    </div>
  );
}

function Router() {
  const [location] = useLocation();
  return (
    <>
    <ScrollToTop />
      <PageTitle />
    <ErrorBoundary key={location}>
    <Suspense fallback={<PageLoading />}>
    <Switch>
      <Route path="/" component={LandingRoute} />
      <Route path="/journey-to-launch" component={JourneyToLaunch} />
      <Route path="/project-history" component={ProjectHistory} />
      <Route path="/feedback" component={Feedback} />
      <Route path="/network" component={Network} />
      <Route path="/contribute" component={Contribute} />
      <Route path="/seasonal-festivals" component={SeasonalFestivals} />
      <Route path="/investor" component={InvestorJourney} />
      <Route path="/steward" component={StewardJourney} />
      <Route path="/resident" component={ResidentJourney} />
      <Route path="/prosperity" component={ProsperityJourney} />
      <Route path="/love-letter" component={LoveLetter} />
      <Route path="/circles" component={Circles} />
      <Route path="/quests" component={Quests} />
      <Route path="/tools" component={ToolsHub} />
      {/* The geographic map is what /map means now. The nested-circles org
          view keeps its own address: it holds the concierge, the contact
          relay and raise-your-hand, which read live data behind the
          capability gate and have no equivalent in the artifact. */}
      <Route path="/map" component={LivingMap} />
      <Route path="/map/circles" component={VillageMap} />
      <Route path="/events" component={Events} />
      <Route path="/first-walk" component={FirstWalk} />
      <Route path="/feed" component={Feed} />
      <Route path="/stay" component={Stay} />
      <Route path="/tokens" component={Wallet} />
      <Route path="/wallet" component={Wallet} />
      <Route path="/badges" component={Badges} />
      <Route path="/library" component={Library} />
      {/* /village-health, not /health: the server owns /health as the ops probe */}
      <Route path="/village-health" component={VillageHealth} />
      <Route path="/exit-policy" component={ExitPolicy} />
      <Route path="/forum" component={Forum} />
      <Route path="/forum/:id" component={Forum} />
      <Route path="/propose-quest" component={ProposeQuest} />
      <Route path="/roles" component={Roles} />
      <Route path="/how-we-create" component={HowWeCreate} />
      <Route path="/co-creators-guide" component={CoCreatorsGuide} />
      <Route path="/housing" component={Housing} />
      <Route path="/opportunities" component={Opportunities} />
      <Route path="/master-plan" component={MasterPlan} />
      <Route path="/team" component={Team} />
      <Route path="/admin" component={Admin} />
      <Route path="/profile" component={Profile} />
      {/* The class select. Under /profile because a party is part of who you
          are here, not a separate account setting. */}
      <Route path="/profile/characters" component={Characters} />
      {/* AFTER /profile/characters, and that order is the whole point: wouter
          takes the first match, so a :handle route above it would turn the
          class select into a lookup for a member called "characters". */}
      <Route path="/profile/:handle" component={PublicProfile} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/set-password" component={SetPassword} />
      <Route path="/forgot-password" component={ForgotPassword} />
      <Route path="/game-mechanics" component={GameMechanics} />
      <Route path="/good-neighbor" component={GoodNeighbor} />
      <Route path="/steward-rights" component={StewardRights} />
      <Route path="/resident-rights" component={ResidentRights} />
      <Route path="/training" component={Training} />
      <Route path="/governance" component={Governance} />
      <Route path="/visit" component={Visit} />
      <Route path="/gratitude" component={GratitudeWall} />
      <Route path="/work-with-us" component={WorkWithUs} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
    </Suspense>
    </ErrorBoundary>
    </>
  );
}

function App() {
  return (
    <ThemeProvider defaultTheme="light">
        <AuthProvider>
        <ModuleProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
 
        </ModuleProvider>
        </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
