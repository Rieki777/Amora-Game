import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import { useEffect } from "react";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";

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
import Home from "./pages/Home";
import InvestorJourney from "./pages/InvestorJourney";
import StewardJourney from "./pages/StewardJourney";
import ResidentJourney from "./pages/ResidentJourney";
import ProsperityJourney from "./pages/ProsperityJourney";
import LoveLetter from "./pages/LoveLetter";
import Circles from "./pages/Circles";
import Quests from "./pages/Quests";
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
import GoodNeighbor from "./pages/GoodNeighbor";
import JourneyToLaunch from "./pages/JourneyToLaunch";
import StewardRights from "./pages/StewardRights";
import ResidentRights from "./pages/ResidentRights";
import Training from "./pages/Training";
import Governance from "./pages/Governance";
import Visit from "./pages/Visit";
import GratitudeWall from "./pages/GratitudeWall";

function Router() {
  const [location] = useLocation();
  return (
    <>
    <ScrollToTop />
    <ErrorBoundary key={location}>
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/journey-to-launch" component={JourneyToLaunch} />
      <Route path="/investor" component={InvestorJourney} />
      <Route path="/steward" component={StewardJourney} />
      <Route path="/resident" component={ResidentJourney} />
      <Route path="/prosperity" component={ProsperityJourney} />
      <Route path="/love-letter" component={LoveLetter} />
      <Route path="/circles" component={Circles} />
      <Route path="/quests" component={Quests} />
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
      <Route path="/good-neighbor" component={GoodNeighbor} />
      <Route path="/steward-rights" component={StewardRights} />
      <Route path="/resident-rights" component={ResidentRights} />
      <Route path="/training" component={Training} />
      <Route path="/governance" component={Governance} />
      <Route path="/visit" component={Visit} />
      <Route path="/gratitude" component={GratitudeWall} />
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
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
 
        </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
