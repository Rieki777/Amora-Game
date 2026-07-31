import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect, useState } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
import { ModuleProvider } from "./modules/ModuleProvider";

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
  "/stay": "Stays",
  "/library": "Material library",
  "/badges": "Badges & skills",
  "/health": "Village health",
  "/exchange": "Exchange",
  "/wallet": "Wallet",
  "/profile": "My profile",
  "/profiles": "Members",
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
import Home from "./pages/Home";
import InvestorJourney from "./pages/InvestorJourney";
import StewardJourney from "./pages/StewardJourney";
import ResidentJourney from "./pages/ResidentJourney";
import ProsperityJourney from "./pages/ProsperityJourney";
import LoveLetter from "./pages/LoveLetter";
import Circles from "./pages/Circles";
import Quests from "./pages/Quests";
import ProposeQuest from "./pages/ProposeQuest";
import Roles from "./pages/Roles";
import HowWeCreate from "./pages/HowWeCreate";
import CoCreatorsGuide from "./pages/CoCreatorsGuide";
import Housing from "./pages/Housing";
import Opportunities from "./pages/Opportunities";
import MasterPlan from "./pages/MasterPlan";
import Team from "./pages/Team";
import Admin from "./pages/Admin";
import Profile from "./pages/Profile";
import Login from "./pages/Login";
import Register from "./pages/Register";
import SetPassword from "./pages/SetPassword";
import ForgotPassword from "./pages/ForgotPassword";
import GameMechanics from "./pages/GameMechanics";
import GoodNeighbor from "./pages/GoodNeighbor";
import JourneyToLaunch from "./pages/JourneyToLaunch";
import ProjectHistory from "./pages/ProjectHistory";
import Feedback from "./pages/Feedback";
import Network from "./pages/Network";
import Contribute from "./pages/Contribute";
import SeasonalFestivals from "./pages/SeasonalFestivals";
import StewardRights from "./pages/StewardRights";
import ResidentRights from "./pages/ResidentRights";
import Training from "./pages/Training";
import Governance from "./pages/Governance";
import Visit from "./pages/Visit";
import GratitudeWall from "./pages/GratitudeWall";
import WorkWithUs from "./pages/WorkWithUs";
import ToolsHub from "./pages/ToolsHub";
import VillageMap from "./pages/VillageMap";
import Forum from "./pages/Forum";
import Feed from "./pages/Feed";
import Stay from "./pages/Stay";
import Wallet from "./pages/Wallet";
import Badges from "./pages/Badges";
import Library from "./pages/Library";
import VillageHealth from "./pages/VillageHealth";
import ExitPolicy from "./pages/ExitPolicy";

function Router() {
  const [location] = useLocation();
  return (
    <>
    <ScrollToTop />
      <PageTitle />
    <ErrorBoundary key={location}>
    <Switch>
      <Route path="/" component={Home} />
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
      <Route path="/map" component={VillageMap} />
      <Route path="/feed" component={Feed} />
      <Route path="/stay" component={Stay} />
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
