import { Switch, Route, useLocation } from "wouter";
import { lazy, Suspense } from "react";
import { MobileHome } from "@/components/mobile/MobileHome";
import { PhoneTabBar } from "./PhoneTabBar";
import { DirectoryScreen } from "./DirectoryScreen";
import { PhoneScreenSkeleton } from "./PhoneScreenSkeleton";
import { DesktopOnlyScreen } from "./DesktopOnlyScreen";
import { SpendingScreen } from "./SpendingScreen";
import { WorthScreen } from "./WorthScreen";
import { UpcomingScreen } from "./UpcomingScreen";

// Directory-wrapped desktop pages. Lazy-loaded so the phone bundle doesn't
// pay for pages a phone user may never visit. Only pages that phone users
// can reach (see WRAPPED_ROUTES below); desktop-only pages are NOT lazy-
// imported here because the phone shell never renders them.
const Owing          = lazy(() => import("@/pages/owing"));
const Settings       = lazy(() => import("@/pages/settings"));
const Profile        = lazy(() => import("@/pages/profile"));
const Reports        = lazy(() => import("@/pages/reports"));
const Goals          = lazy(() => import("@/pages/goals"));
const WhatIf         = lazy(() => import("@/pages/whatif"));
const Tax            = lazy(() => import("@/pages/tax"));
const Mortgage       = lazy(() => import("@/pages/mortgage"));
const Split          = lazy(() => import("@/pages/split"));
const Import         = lazy(() => import("@/pages/import"));
const Decisions      = lazy(() => import("@/pages/decisions"));
const Fire           = lazy(() => import("@/pages/fire"));
const Pension        = lazy(() => import("@/pages/pension"));
const Calculators    = lazy(() => import("@/pages/calculators"));
const Projection     = lazy(() => import("@/pages/projection"));
const Briefing       = lazy(() => import("@/pages/briefing"));

// WRAPPED_ROUTES — the ratchet baseline for the D5 lock. Every string here
// MUST be wrapped by wrappedRoute() below; every wrappedRoute() call MUST
// have its path in this list. The lock asserts equality (not subset), so
// adding a wrapper without listing it fails the build, and removing a
// listed entry while a wrapper still uses it also fails. See
// artifacts/finance-tracker/src/components/phone/wrapped-routes.lock.test.ts
// (added in a later commit).
export const WRAPPED_ROUTES: readonly string[] = [
  // Calculators (7)
  "/whatif", "/pension", "/fire", "/projection", "/mortgage", "/tax", "/calculators",
  // Reports (3)
  "/reports", "/decisions", "/briefing",
  // People (2)
  "/owing", "/split",
  // Goals (1)
  "/goals",
  // Data (1)
  "/import",
  // Settings (2)
  "/profile", "/settings",
];

// DESKTOP_ONLY_ROUTES — the phone shell knows these URLs but does NOT
// render their content. A phone user following a deep link to any of
// them lands on DesktopOnlyScreen, which explains the state and offers
// a route back to /directory. Amendment lines followed (:78, :82).
//
// Cross-checked at build time by Lock #18 alongside WRAPPED_ROUTES:
//   - every string here MUST be handled by a desktopOnlyRoute() call
//   - every desktopOnlyRoute() call MUST have its path in this list
//   - WRAPPED_ROUTES ∩ DESKTOP_ONLY_ROUTES MUST be empty
//   - both sets stay disjoint from the tab-URL set
export const DESKTOP_ONLY_ROUTES: readonly string[] = [
  "/business", "/family", "/trading",
  "/health-score", "/year-review",
  "/shared", "/ai-coach",
];

// Shape-matching skeleton for lazy-loaded directory items. Sizes to
// DirectoryItemScreen's content slot via flex:1; minHeight:0 — the old
// minHeight:100dvh pattern printed a full-viewport cream rectangle that
// also shoved the tab bar (:59 in the pre-fix source).
const PageFallback = <PhoneScreenSkeleton shape="header-list" />;

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

// desktopOnlyRoute — the phone shell knows this URL but renders
// DesktopOnlyScreen (an explainer that offers a route back). Same
// identifier discipline as wrappedRoute so Lock #18 can parse both by
// AST. Body copy is route-specific so the user learns where the feature
// actually lives — for /ai-coach that means naming the floating
// assistant on phone.
function desktopOnlyRoute(path: string, title: string, body: string) {
  return (
    <Route key={path} path={path}>
      {() => <DesktopOnlyScreen title={title} body={body} />}
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
// UpcomingStub removed — UpcomingScreen is the live implementation.
function PhoneNotFound()  { return <div style={{ ...placeholderStyle, fontSize: 14 }}>Route not wired</div>; }

// The tab screens absorb legacy URLs while the merge tabs are being built.
// /accounts, /net-worth, /portfolio, /investments resolve to WORTH.
// /transactions, /budget, /analytics, /cashflow resolve to SPENDING.
// /recurring, /subscriptions, /calendar resolve to UPCOMING.
// (Also referenced by the DIRECTORY tab's active-tab logic in PhoneTabBar
// so those legacy URLs don't leave the tab bar without an active item.)

// WRAPPED_ROUTES defines which URLs the shell wraps around a desktop page
// via DirectoryItemScreen. Those URLs get the "push" animation (slide from
// right) — they read as drilling deeper. Everything else (the five tab
// URLs and their aliases) gets the "tab" animation — subtle 8px slide +
// fade. See index.css @keyframes ft-phone-tab-in / ft-phone-push-in.
const WRAPPED_ROUTES_SET: ReadonlySet<string> = new Set(WRAPPED_ROUTES);

function AnimatedRoute({ location, children }: { location: string; children: React.ReactNode }) {
  const isPush = WRAPPED_ROUTES_SET.has(location);
  // key={location} triggers an unmount/remount on URL change, which
  // fires the animation on the newly-mounted element. Reduced-motion
  // collapses both --ft-motion-* variables to 0ms via the @media block
  // in index.css:189–194, so this becomes an instant swap.
  return (
    <div
      key={location}
      style={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        animation: isPush
          ? "ft-phone-push-in var(--ft-motion-screen) var(--ft-ease) both"
          : "ft-phone-tab-in var(--ft-motion-base) var(--ft-ease) both",
      }}
    >
      {children}
    </div>
  );
}

export function PhoneShell() {
  const [location] = useLocation();
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
       <AnimatedRoute location={location}>
        <Switch>
          <Route path="/">
            {() => <MobileHome />}
          </Route>

          <Route path="/worth" component={WorthScreen} />
          <Route path="/spending" component={SpendingScreen} />
          <Route path="/upcoming" component={UpcomingScreen} />
          <Route path="/directory" component={DirectoryScreen} />

          <Route path="/accounts" component={WorthScreen} />
          <Route path="/net-worth" component={WorthScreen} />
          <Route path="/portfolio" component={WorthScreen} />
          <Route path="/investments" component={WorthScreen} />

          <Route path="/transactions" component={SpendingScreen} />
          <Route path="/budget" component={SpendingScreen} />
          <Route path="/analytics" component={SpendingScreen} />
          <Route path="/cashflow" component={SpendingScreen} />

          <Route path="/recurring" component={UpcomingScreen} />
          <Route path="/subscriptions" component={UpcomingScreen} />
          <Route path="/calendar" component={UpcomingScreen} />

          {/* Wrapped desktop pages — the D5 ratchet keeps this list
              equal to WRAPPED_ROUTES. Only routes phones can usefully
              open at 390px land here. */}
          {wrappedRoute("/whatif", WhatIf, "What If")}
          {wrappedRoute("/pension", Pension, "Pension")}
          {wrappedRoute("/fire", Fire, "FIRE")}
          {wrappedRoute("/projection", Projection, "Projection")}
          {wrappedRoute("/mortgage", Mortgage, "Mortgage")}
          {wrappedRoute("/tax", Tax, "Tax")}
          {wrappedRoute("/calculators", Calculators, "Calculators")}
          {wrappedRoute("/reports", Reports, "Reports")}
          {wrappedRoute("/decisions", Decisions, "Decisions")}
          {wrappedRoute("/briefing", Briefing, "Briefing")}
          {wrappedRoute("/owing", Owing, "Owing")}
          {wrappedRoute("/split", Split, "Split")}
          {wrappedRoute("/goals", Goals, "Goals")}
          {wrappedRoute("/import", Import, "Import")}
          {wrappedRoute("/profile", Profile, "Profile")}
          {wrappedRoute("/settings", Settings, "Settings")}

          {/* Desktop-only URLs — phone shell renders DesktopOnlyScreen.
              Each explainer names the alternative on phone if one exists
              (e.g. the floating assistant for /ai-coach). */}
          {desktopOnlyRoute("/business", "Business", "Business finance uses a separate context that's easier to work with on a larger screen. Open Numeris on your Mac or iPad to use it.")}
          {desktopOnlyRoute("/family", "Family", "Household finance uses a separate context that's easier to work with on a larger screen. Open Numeris on your Mac or iPad to use it.")}
          {desktopOnlyRoute("/trading", "Trading", "The trading journal captures per-trade notes and P&L on a wider grid. Open Numeris on your Mac or iPad to use it.")}
          {desktopOnlyRoute("/health-score", "Health Score", "The health-score breakdown is denser than a phone can render honestly. Open Numeris on your Mac or iPad to see it.")}
          {desktopOnlyRoute("/year-review", "Year Review", "The annual retrospective is a dense read that's easier on a larger screen. Open Numeris on your Mac or iPad.")}
          {desktopOnlyRoute("/shared", "Shared expenses", "Joint-account sharing lives on desktop right now. Open Numeris on your Mac or iPad to use it.")}
          {desktopOnlyRoute("/ai-coach", "AI Coach", "On phone the AI Coach lives in the floating assistant — tap the AI button at the bottom-right of any screen to chat.")}

          <Route component={PhoneNotFound} />
        </Switch>
       </AnimatedRoute>
      </div>
      <PhoneTabBar />
    </div>
  );
}

