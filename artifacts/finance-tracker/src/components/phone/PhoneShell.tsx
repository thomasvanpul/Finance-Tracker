import { Switch, Route, useLocation } from "wouter";
import { lazy, Suspense } from "react";
import { MobileHome } from "@/components/mobile/MobileHome";
import { PhoneTabBar } from "./PhoneTabBar";

// Directory-wrapped desktop pages. Lazy-loaded so the phone bundle doesn't
// pay for pages a phone user may never visit.
const Owing          = lazy(() => import("@/pages/owing"));
const Settings       = lazy(() => import("@/pages/settings"));
const Profile        = lazy(() => import("@/pages/profile"));
const Reports        = lazy(() => import("@/pages/reports"));
const Goals          = lazy(() => import("@/pages/goals"));
const HealthScore    = lazy(() => import("@/pages/health-score"));
const WhatIf         = lazy(() => import("@/pages/whatif"));
const Tax            = lazy(() => import("@/pages/tax"));
const Mortgage       = lazy(() => import("@/pages/mortgage"));
const Split          = lazy(() => import("@/pages/split"));
const SharedExpenses = lazy(() => import("@/pages/shared-expenses"));
const YearReview     = lazy(() => import("@/pages/year-review"));
const Import         = lazy(() => import("@/pages/import"));
const AiCoach        = lazy(() => import("@/pages/ai-coach"));
const Decisions      = lazy(() => import("@/pages/decisions"));
const Fire           = lazy(() => import("@/pages/fire"));
const Pension        = lazy(() => import("@/pages/pension"));
const Calculators    = lazy(() => import("@/pages/calculators"));
const Projection     = lazy(() => import("@/pages/projection"));
const Briefing       = lazy(() => import("@/pages/briefing"));
const Business       = lazy(() => import("@/pages/business"));
const FamilyFinance  = lazy(() => import("@/pages/family-finance"));
const TradingJournal = lazy(() => import("@/pages/trading-journal"));

// WRAPPED_ROUTES — the ratchet baseline for the D5 lock. Every string here
// MUST be wrapped by wrappedRoute() below; every wrappedRoute() call MUST
// have its path in this list. The lock asserts equality (not subset), so
// adding a wrapper without listing it fails the build, and removing a
// listed entry while a wrapper still uses it also fails. See
// artifacts/finance-tracker/src/components/phone/wrapped-routes.lock.test.ts
// (added in a later commit).
export const WRAPPED_ROUTES: readonly string[] = [
  // Plan
  "/goals", "/health-score",
  // Calculators
  "/whatif", "/pension", "/fire", "/projection", "/mortgage", "/tax", "/calculators",
  // People & money
  "/owing", "/split", "/shared",
  // Assistant
  "/ai-coach", "/briefing",
  // Reports
  "/reports", "/year-review", "/decisions",
  // Separate contexts (localStorage-only storage — see docs/BACKLOG.md § D6)
  "/business", "/family", "/trading",
  // Data
  "/import",
  // Settings
  "/profile", "/settings",
];

const PageFallback = <div style={{ minHeight: "100dvh", background: "var(--ft-base)" }} />;

// A wrapped route is a desktop page rendered inside DirectoryItemScreen
// on phone. It is a stopgap. Every wrapping is a live iPad-audit defect
// (see the report on the 26 Aug session — hover-only affordances, sub-44
// tap targets, keyboard-only palettes) — the wrapper is the shell's honest
// admission that the destination has not yet been designed for touch.
// The D5 ratchet lock keeps WRAPPED_ROUTES equal to the actual wrapped set
// so the count is visible in every CI run and can only shrink.
function wrappedRoute(
  path: string,
  Component: React.LazyExoticComponent<React.ComponentType<unknown>>,
  title: string,
) {
  return (
    <Route key={path} path={path}>
      {() => (
        <DirectoryItemScreen title={title}>
          <Suspense fallback={PageFallback}>
            <Component />
          </Suspense>
        </DirectoryItemScreen>
      )}
    </Route>
  );
}

function DirectoryItemScreen({ title, children }: { title: string; children: React.ReactNode }) {
  const [, navigate] = useLocation();
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "0 4px",
          minHeight: 44,
          background: "var(--ft-surface)",
          borderBottom: "1px solid var(--ft-border)",
          flexShrink: 0,
        }}
      >
        <button
          onClick={() => navigate("/directory")}
          aria-label="Back to directory"
          type="button"
          style={{
            background: "none",
            border: "none",
            color: "var(--ft-muted)",
            fontSize: 13,
            padding: 0,
            cursor: "pointer",
            minHeight: 44,
            minWidth: 44,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.06em",
          }}
        >
          ‹
        </button>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 12,
            color: "var(--ft-dim)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {title}
        </span>
      </header>
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
        {children}
      </div>
    </div>
  );
}

// Tab-screen stubs. HOME is intentionally not a stub — it reuses the
// existing MobileHome so the phone stays usable between shell landing and
// per-tab design. Every other tab is a placeholder until Thomas and the
// operator design each screen together. See § 24(e) of the vault note.
const placeholderStyle: React.CSSProperties = {
  minHeight: "100%",
  height: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "var(--font-mono)",
  fontSize: 28,
  letterSpacing: "0.15em",
  color: "var(--ft-dim)",
};
function WorthStub()      { return <div style={placeholderStyle}>WORTH</div>; }
function SpendingStub()   { return <div style={placeholderStyle}>SPENDING</div>; }
function UpcomingStub()   { return <div style={placeholderStyle}>UPCOMING</div>; }
function DirectoryStub()  { return <div style={placeholderStyle}>DIRECTORY</div>; }
function PhoneNotFound()  { return <div style={{ ...placeholderStyle, fontSize: 14 }}>Route not wired</div>; }

// The tab screens absorb legacy URLs while the merge tabs are being built.
// /accounts, /net-worth, /portfolio, /investments resolve to WORTH.
// /transactions, /budget, /analytics, /cashflow resolve to SPENDING.
// /recurring, /subscriptions, /calendar resolve to UPCOMING.
// (Also referenced by the DIRECTORY tab's active-tab logic in PhoneTabBar
// so those legacy URLs don't leave the tab bar without an active item.)

export function PhoneShell() {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        background: "var(--ft-base)",
        color: "var(--ft-text)",
      }}
    >
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          paddingTop: "env(safe-area-inset-top, 0px)",
        }}
      >
        <Switch>
          <Route path="/">
            {() => <MobileHome onNavigate={() => {}} />}
          </Route>

          <Route path="/worth" component={WorthStub} />
          <Route path="/spending" component={SpendingStub} />
          <Route path="/upcoming" component={UpcomingStub} />
          <Route path="/directory" component={DirectoryStub} />

          <Route path="/accounts" component={WorthStub} />
          <Route path="/net-worth" component={WorthStub} />
          <Route path="/portfolio" component={WorthStub} />
          <Route path="/investments" component={WorthStub} />

          <Route path="/transactions" component={SpendingStub} />
          <Route path="/budget" component={SpendingStub} />
          <Route path="/analytics" component={SpendingStub} />
          <Route path="/cashflow" component={SpendingStub} />

          <Route path="/recurring" component={UpcomingStub} />
          <Route path="/subscriptions" component={UpcomingStub} />
          <Route path="/calendar" component={UpcomingStub} />

          {wrappedRoute("/goals", Goals, "Goals")}
          {wrappedRoute("/health-score", HealthScore, "Health Score")}
          {wrappedRoute("/whatif", WhatIf, "What If")}
          {wrappedRoute("/pension", Pension, "Pension")}
          {wrappedRoute("/fire", Fire, "FIRE")}
          {wrappedRoute("/projection", Projection, "Projection")}
          {wrappedRoute("/mortgage", Mortgage, "Mortgage")}
          {wrappedRoute("/tax", Tax, "Tax")}
          {wrappedRoute("/calculators", Calculators, "Calculators")}
          {wrappedRoute("/owing", Owing, "Owing")}
          {wrappedRoute("/split", Split, "Split")}
          {wrappedRoute("/shared", SharedExpenses, "Shared")}
          {wrappedRoute("/ai-coach", AiCoach, "AI Coach")}
          {wrappedRoute("/briefing", Briefing, "Briefing")}
          {wrappedRoute("/reports", Reports, "Reports")}
          {wrappedRoute("/year-review", YearReview, "Year Review")}
          {wrappedRoute("/decisions", Decisions, "Decisions")}
          {wrappedRoute("/business", Business, "Business")}
          {wrappedRoute("/family", FamilyFinance, "Family")}
          {wrappedRoute("/trading", TradingJournal, "Trading")}
          {wrappedRoute("/import", Import, "Import")}
          {wrappedRoute("/profile", Profile, "Profile")}
          {wrappedRoute("/settings", Settings, "Settings")}

          <Route component={PhoneNotFound} />
        </Switch>
      </div>
      <PhoneTabBar />
    </div>
  );
}

