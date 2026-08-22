import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { lazy, Suspense, useEffect, useState } from "react";
import { loadFxOverrides } from "@/lib/currency-store";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createOfflineQueryClient, persistOptions } from "@/lib/offline-cache";
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
import { isOnboardingComplete, LS_ONBOARDING_FOLLOWUP_KEY } from "@/lib/persona";
import { hydratePersonaFromServer } from "@/lib/persona-sync";
import NotFound from "@/pages/not-found";
import { useIsMobile, MOBILE_BREAKPOINT } from "@/hooks/use-mobile";
import { MobileApp, MOBILE_ROUTES } from "@/components/mobile/MobileApp";
import { PageTransitionOverlay } from "@/components/page-transition";

// Dashboard is eager — it is the landing route; a lazy round-trip here buys nothing.
import Dashboard from "@/pages/dashboard";

// All other pages are split into their own chunks and fetched on first navigation.
const Accounts       = lazy(() => import("@/pages/accounts"));
const Transactions   = lazy(() => import("@/pages/transactions"));
const Upcoming       = lazy(() => import("@/pages/upcoming"));
const Investments    = lazy(() => import("@/pages/investments"));
const Portfolio      = lazy(() => import("@/pages/portfolio"));
const Owing          = lazy(() => import("@/pages/owing"));
const Settings       = lazy(() => import("@/pages/settings"));
const Profile        = lazy(() => import("@/pages/profile"));
const Reports        = lazy(() => import("@/pages/reports"));
const Goals          = lazy(() => import("@/pages/goals"));
const Analytics      = lazy(() => import("@/pages/analytics"));
const Budget         = lazy(() => import("@/pages/budget"));
const HealthScore    = lazy(() => import("@/pages/health-score"));
const NetWorthHistory = lazy(() => import("@/pages/net-worth-history"));
const WhatIf         = lazy(() => import("@/pages/whatif"));
const Subscriptions  = lazy(() => import("@/pages/subscriptions"));
const Tax            = lazy(() => import("@/pages/tax"));
const Mortgage       = lazy(() => import("@/pages/mortgage"));
const Calendar       = lazy(() => import("@/pages/calendar"));
const Split          = lazy(() => import("@/pages/split"));
const SharedExpenses = lazy(() => import("@/pages/shared-expenses"));
const CashFlow       = lazy(() => import("@/pages/cashflow"));
const YearReview     = lazy(() => import("@/pages/year-review"));
const Import         = lazy(() => import("@/pages/import"));
const Recurring      = lazy(() => import("@/pages/recurring"));
const Learn          = lazy(() => import("@/pages/learn"));
const AiCoach        = lazy(() => import("@/pages/ai-coach"));
const Decisions      = lazy(() => import("@/pages/decisions"));
const Fire           = lazy(() => import("@/pages/fire"));
const Pension        = lazy(() => import("@/pages/pension"));
const Calculators    = lazy(() => import("@/pages/calculators"));
const Wardrobe       = lazy(() => import("@/pages/wardrobe"));
const Projection     = lazy(() => import("@/pages/projection"));
const Briefing       = lazy(() => import("@/pages/briefing"));
const Business       = lazy(() => import("@/pages/business"));
const FamilyFinance  = lazy(() => import("@/pages/family-finance"));
const TradingJournal = lazy(() => import("@/pages/trading-journal"));

// Matches the blank shell in auth-gate.tsx: still, no animation, no layout shift.
const PageFallback = <div style={{ minHeight: "100vh", background: "var(--ft-base)" }} />;
// QueryClient configured for offline use — see lib/offline-cache.ts for
// staleTime / gcTime and the query blacklist. Wrapped by
// PersistQueryClientProvider below so a cold reload without network
// renders the last successfully-fetched data rather than an empty state.
const queryClient = createOfflineQueryClient();

function DefaultPageRedirector() {
  const [, navigate] = useLocation();
  useEffect(() => {
    if (sessionStorage.getItem("ft-initial-redirect-done")) return;
    sessionStorage.setItem("ft-initial-redirect-done", "1");
    // Item 12: one-shot onboarding follow-up destination. If onboarding
    // just wrote a follow-up key (e.g. /accounts for a budget-persona
    // user who needs to add a bank), route there once and clear the
    // key. On the second app open the user lands on the persona's real
    // default page.
    const followUp = localStorage.getItem(LS_ONBOARDING_FOLLOWUP_KEY);
    if (followUp) {
      localStorage.removeItem(LS_ONBOARDING_FOLLOWUP_KEY);
      if (window.location.pathname === (import.meta.env.BASE_URL.replace(/\/$/, "") || "/")) {
        const isMobileFu = window.innerWidth < MOBILE_BREAKPOINT;
        if (!isMobileFu || MOBILE_ROUTES.has(followUp)) {
          sessionStorage.setItem("ft-active-default-page", followUp);
          navigate(followUp);
          return;
        }
      }
    }
    const page = localStorage.getItem("nr-default-page");
    if (!page || page === "/") return;
    if (window.location.pathname !== (import.meta.env.BASE_URL.replace(/\/$/, "") || "/")) return;
    // useIsMobile() is undefined on first render (its own effect hasn't run
    // yet), so we read the viewport directly. Prevents a mobile user's
    // stored default (e.g. /fire) from dumping them onto a bare desktop
    // page with no mobile shell on cold open.
    const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
    if (isMobile && !MOBILE_ROUTES.has(page)) return;
    // Remember the current default so an in-session persona flip
    // (below) can tell "user is on their old default" from "user
    // navigated somewhere on purpose".
    sessionStorage.setItem("ft-active-default-page", page);
    navigate(page);
  }, [navigate]);

  // React to persona changes mid-session. If the user is on the
  // BASE URL or on the previous default page, navigate them to the
  // new default. If they're anywhere else (mid-flow), leave them
  // alone — a persona flip should not yank someone out of what
  // they were doing.
  useEffect(() => {
    const handler = () => {
      const newDefault = localStorage.getItem("nr-default-page");
      if (!newDefault) return;
      const base = import.meta.env.BASE_URL.replace(/\/$/, "") || "/";
      const here = window.location.pathname;
      const oldDefault = sessionStorage.getItem("ft-active-default-page");
      const onRoot = here === base;
      const onOldDefault = oldDefault != null && here === oldDefault;
      if (!onRoot && !onOldDefault) return;
      if (here === newDefault) return; // already there
      const isMobile = window.innerWidth < MOBILE_BREAKPOINT;
      if (isMobile && !MOBILE_ROUTES.has(newDefault)) return;
      sessionStorage.setItem("ft-active-default-page", newDefault);
      navigate(newDefault);
    };
    window.addEventListener("nr-persona-update", handler);
    return () => window.removeEventListener("nr-persona-update", handler);
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

  // Mobile shell owns the routes in MOBILE_ROUTES (derived from
  // SCREEN_TO_PATH in MobileApp.tsx). Anything else — MobileMore hrefs
  // to /fire, /tax etc., or /transactions (excluded so deep links keep
  // desktop swipe-delete) — falls through to the desktop Layout below.
  if (isMobile && MOBILE_ROUTES.has(location)) return <MobileApp />;

  return (
    <Layout>
      <Suspense fallback={PageFallback}>
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
        <Route path="/shared" component={SharedExpenses} />
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
      </Suspense>
    </Layout>
  );
}

function OnboardingGate({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState(() => isOnboardingComplete());
  // Hydrate persona from server once per mount. If the user finished
  // onboarding on another device, this mirrors that choice locally so
  // every synchronous loadPersonaIds() reader sees the truth.
  useEffect(() => {
    if (done) void hydratePersonaFromServer();
  }, [done]);
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
        <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
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
        </PersistQueryClientProvider>
      </WidgetsProvider>
      </TickersProvider>
      </CategoryProvider>
      </PrivacyProvider>
    </ThemeProvider>
  );
}

export default App;
