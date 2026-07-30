import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { useEffect, useState } from "react";
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
import { CategoryProvider } from "@/contexts/category-context";
import { Onboarding } from "@/components/onboarding";
import { isOnboardingComplete } from "@/lib/persona";
import NotFound from "@/pages/not-found";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileApp } from "@/components/mobile/MobileApp";

import Dashboard from "@/pages/dashboard";
import Accounts from "@/pages/accounts";
import Transactions from "@/pages/transactions";
import Upcoming from "@/pages/upcoming";
import Investments from "@/pages/investments";
import Portfolio from "@/pages/portfolio";
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
import Decisions from "@/pages/decisions";
import Fire from "@/pages/fire";
import Pension from "@/pages/pension";
import Calculators from "@/pages/calculators";
import Wardrobe from "@/pages/wardrobe";
import Projection from "@/pages/projection";
import Briefing from "@/pages/briefing";
import Business from "@/pages/business";
import FamilyFinance from "@/pages/family-finance";
import TradingJournal from "@/pages/trading-journal";
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

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard · Numeris",
  "/accounts": "Accounts · Numeris",
  "/transactions": "Transactions · Numeris",
  "/upcoming": "Upcoming · Numeris",
  "/investments": "Investments · Numeris",
  "/portfolio": "Portfolio · Numeris",
  "/owing": "Owing · Numeris",
  "/reports": "Reports · Numeris",
  "/goals": "Goals · Numeris",
  "/analytics": "Analytics · Numeris",
  "/budget": "Budget · Numeris",
  "/health-score": "Health Score · Numeris",
  "/net-worth": "Net Worth · Numeris",
  "/whatif": "What If · Numeris",
  "/fire": "FIRE · Numeris",
  "/pension": "Pension · Numeris",
  "/calculators": "Calculators · Numeris",
  "/wardrobe": "Wardrobe · Numeris",
  "/projection": "Projection · Numeris",
  "/subscriptions": "Subscriptions · Numeris",
  "/tax": "Tax · Numeris",
  "/mortgage": "Mortgage · Numeris",
  "/calendar": "Calendar · Numeris",
  "/split": "Split · Numeris",
  "/recurring": "Recurring · Numeris",
  "/learn": "Learn · Numeris",
  "/cashflow": "Cash Flow · Numeris",
  "/year-review": "Year Review · Numeris",
  "/import": "Import · Numeris",
  "/settings": "Settings · Numeris",
  "/profile": "Profile · Numeris",
  "/decisions": "Decisions · Numeris",
  "/ai-coach": "AI Coach · Numeris",
  "/briefing": "Briefing · Numeris",
  "/business": "Business · Numeris",
  "/family": "Family Finance · Numeris",
  "/trading": "Trading Journal · Numeris",
};

function Router() {
  const isMobile = useIsMobile();
  const [location] = useLocation();

  useEffect(() => {
    document.title = PAGE_TITLES[location] ?? "Numeris";
  }, [location]);

  // Mobile shell only at root — all other paths fall through to desktop layout
  // so that More links to /fire, /reports etc. actually render something
  if (isMobile && (location === "/" || location === "")) return <MobileApp />;

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/accounts" component={Accounts} />
        <Route path="/transactions" component={Transactions} />
        <Route path="/upcoming" component={Upcoming} />
        <Route path="/investments">{() => <Investments defaultTab="markets" />}</Route>
        <Route path="/portfolio">{() => <Portfolio />}</Route>
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
        <Route path="/projection" component={Projection} />
        <Route path="/subscriptions" component={Subscriptions} />
        <Route path="/tax" component={Tax} />
        <Route path="/mortgage" component={Mortgage} />
        <Route path="/calendar" component={Calendar} />
        <Route path="/split" component={Split} />
        <Route path="/recurring" component={Recurring} />
        <Route path="/learn" component={Learn} />
        <Route path="/cashflow" component={CashFlow} />
        <Route path="/year-review" component={YearReview} />
        <Route path="/import" component={Import} />
        <Route path="/settings" component={Settings} />
        <Route path="/profile" component={Profile} />
        <Route path="/decisions" component={Decisions} />
        <Route path="/ai-coach" component={AiCoach} />
        <Route path="/briefing" component={Briefing} />
        <Route path="/business" component={Business} />
        <Route path="/family" component={FamilyFinance} />
        <Route path="/trading" component={TradingJournal} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState(() => isOnboardingComplete());
  if (!done) {
    return <Onboarding onComplete={() => setDone(true)} />;
  }
  return <>{children}</>;
}

function App() {
  return (
    <ThemeProvider>
      <BootEffects />
      <PrivacyProvider>
      <CategoryProvider>
      <TickersProvider>
      <WidgetsProvider>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <AuthGate>
              <OnboardingGate>
                <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
                  <DefaultPageRedirector />
                  <PageTransitionOverlay />
                  <Router />
                </WouterRouter>
                <Toaster />
              </OnboardingGate>
            </AuthGate>
          </TooltipProvider>
        </QueryClientProvider>
      </WidgetsProvider>
      </TickersProvider>
      </CategoryProvider>
      </PrivacyProvider>
    </ThemeProvider>
  );
}

export default App;
