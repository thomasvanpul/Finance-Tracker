import { Switch, Route, Redirect, Router as WouterRouter, useLocation } from "wouter";
import { useEffect } from "react";
import { loadFxOverrides } from "@/lib/currency-store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import { AuthGate } from "@/components/auth-gate";
import { ThemeProvider } from "@/contexts/theme-context";
import { WidgetsProvider } from "@/contexts/widgets-context";
import { TickersProvider } from "@/contexts/tickers-context";
import { PrivacyProvider } from "@/contexts/privacy-context";
import NotFound from "@/pages/not-found";

import Dashboard from "@/pages/dashboard";
import Accounts from "@/pages/accounts";
import Transactions from "@/pages/transactions";
import Upcoming from "@/pages/upcoming";
import Investments from "@/pages/investments";
import Owing from "@/pages/owing";
import Settings from "@/pages/settings";
import Profile from "@/pages/profile";
import Reports from "@/pages/reports";
import Goals from "@/pages/goals";
import Analytics from "@/pages/analytics";
import Budget from "@/pages/budget";
import HealthScore from "@/pages/health-score";
import NetWorthHistory from "@/pages/net-worth-history";
import WhatIf from "@/pages/whatif";
import Subscriptions from "@/pages/subscriptions";
import Tax from "@/pages/tax";
import Mortgage from "@/pages/mortgage";
import Calendar from "@/pages/calendar";
import Split from "@/pages/split";
import CashFlow from "@/pages/cashflow";
import YearReview from "@/pages/year-review";
import Import from "@/pages/import";
import Recurring from "@/pages/recurring";
import Learn from "@/pages/learn";
import AiCoach from "@/pages/ai-coach";
import Fire from "@/pages/fire";
import Pension from "@/pages/pension";
import Calculators from "@/pages/calculators";
import Wardrobe from "@/pages/wardrobe";
import { PageTransitionOverlay } from "@/components/page-transition";
const queryClient = new QueryClient();

function DefaultPageRedirector() {
  const [, navigate] = useLocation();
  useEffect(() => {
    if (sessionStorage.getItem("ft-initial-redirect-done")) return;
    sessionStorage.setItem("ft-initial-redirect-done", "1");
    const page = localStorage.getItem("nr-default-page");
    if (page && page !== "/" && window.location.pathname === (import.meta.env.BASE_URL.replace(/\/$/, "") || "/")) {
      navigate(page);
    }
  }, [navigate]);
  return null;
}

function BootEffects() {
  useEffect(() => {
    const density = localStorage.getItem("ft-density") ?? "normal";
    document.body.classList.remove("density-compact", "density-normal", "density-comfortable");
    document.body.classList.add(`density-${density}`);
    const fontScale = parseInt(localStorage.getItem("nr-font-scale") ?? "100", 10);
    document.documentElement.style.setProperty("--nr-font-scale", fontScale + "%");
    loadFxOverrides();
  }, []);
  return null;
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/upcoming" component={Upcoming} />
        <Route path="/investments" component={Investments} />
        <Route path="/owing" component={Owing} />
        <Route path="/reports" component={Reports} />
        <Route path="/goals" component={Goals} />
        <Route path="/analytics" component={Analytics} />
        <Route path="/budget" component={Budget} />
        <Route path="/health-score" component={HealthScore} />
        <Route path="/net-worth" component={NetWorthHistory} />
        <Route path="/whatif" component={WhatIf} />
        <Route path="/fire" component={Fire} />
        <Route path="/pension" component={Pension} />
        <Route path="/calculators" component={Calculators} />
        <Route path="/wardrobe" component={Wardrobe} />
        <Route path="/subscriptions" component={Subscriptions} />
        <Route path="/tax" component={Tax} />
        <Route path="/mortgage" component={Mortgage} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/split" component={Split} />
        {/* Redirects for consolidated routes */}
        <Route path="/reports"><Redirect to="/analytics" /></Route>
        <Route path="/upcoming"><Redirect to="/calendar" /></Route>
        <Route path="/split"><Redirect to="/owing" /></Route>
        <Route path="/recurring"><Redirect to="/subscriptions" /></Route>
        <Route path="/mortgage"><Redirect to="/whatif" /></Route>
        <Route path="/learn" component={Learn} />
        <Route path="/cashflow" component={CashFlow} />
        <Route path="/year-review" component={YearReview} />
        <Route path="/import" component={Import} />
        <Route path="/recurring" component={Recurring} />
        <Route path="/settings" component={Settings} />
        <Route path="/profile" component={Profile} />
        <Route path="/ai-coach" component={AiCoach} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ThemeProvider>
      <BootEffects />
      <PrivacyProvider>
      <TickersProvider>
      <WidgetsProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthGate>
              <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                <DefaultPageRedirector />
                <PageTransitionOverlay />
                <Router />
              </WouterRouter>
              <Toaster />
            </AuthGate>
          </TooltipProvider>
        </QueryClientProvider>
      </WidgetsProvider>
      </TickersProvider>
      </PrivacyProvider>
    </ThemeProvider>
  );
}

export default App;
