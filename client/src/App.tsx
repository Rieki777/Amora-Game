import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AuthProvider } from "./contexts/AuthContext";
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

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
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
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <AuthProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
