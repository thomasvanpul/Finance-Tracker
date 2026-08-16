import { useLocation } from "wouter";
import { MobileNav } from "./MobileNav";
import { MobileHome } from "./MobileHome";
import { MobileBudget } from "./MobileBudget";
import { MobileMore } from "./MobileMore";
import { MobileAccounts } from "./MobileAccounts";
import { MobileGoals } from "./MobileGoals";
import { MobileInvestments } from "./MobileInvestments";
import { MobileAnalytics } from "./MobileAnalytics";
import { MobileSubscriptions } from "./MobileSubscriptions";
import { MobileOwing } from "./MobileOwing";
import { MobileReports } from "./MobileReports";
import { MobileNetWorth } from "./MobileNetWorth";
import { MobileSettings } from "./MobileSettings";
import { MobileUpcomingFull } from "./MobileUpcomingFull";

// AppScreen is the enum of mobile screen renderings. It is DECOUPLED from
// MobileTab (which now names the four footer slots only). Old code that
// pattern-matched AppScreen ⊇ MobileTab is gone with the SpeedDial rewrite.
export type AppScreen =
  | "home"
  | "accounts"
  | "budget"
  | "goals"
  | "investments"
  | "more"
  | "analytics"
  | "subscriptions"
  | "owing"
  | "reports"
  | "net-worth"
  | "settings"
  | "upcoming";

export const SCREEN_TO_PATH: Record<AppScreen, string> = {
  home: "/",
  accounts: "/accounts",
  budget: "/budget",
  goals: "/goals",
  investments: "/investments",
  more: "/more",
  analytics: "/analytics",
  subscriptions: "/subscriptions",
  owing: "/owing",
  reports: "/reports",
  "net-worth": "/net-worth",
  settings: "/settings",
  upcoming: "/upcoming",
};

export const MOBILE_ROUTES = new Set<string>(Object.values(SCREEN_TO_PATH));

const PATH_TO_SCREEN: Record<string, AppScreen> = Object.fromEntries(
  Object.entries(SCREEN_TO_PATH).map(([s, p]) => [p, s as AppScreen]),
);

function MobileAppInner() {
  const [location, navigate] = useLocation();
  const screen: AppScreen = PATH_TO_SCREEN[location] ?? "home";

  function navigateToScreen(s: AppScreen) {
    navigate(SCREEN_TO_PATH[s]);
  }
  const goBack = () => navigateToScreen("more");

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "var(--ft-base)",
      display: "flex",
      flexDirection: "column",
      overflow: "hidden",
    }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflowY: "hidden", paddingTop: "env(safe-area-inset-top, 0px)" }}>
        {/* Bloomberg-style persistent financial status strip.
            Hidden on Home — the v7 design carries its own top bar. */}
        {screen !== "home" && (
          <div style={{ height: 22, borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)", background: "var(--ft-surface)", display: "flex", alignItems: "center", paddingLeft: 14, paddingRight: 14, overflow: "hidden", flexShrink: 0, gap: 0 }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)", letterSpacing: "0.1em" }}>NUMERIS</span>
          </div>
        )}
        {screen === "home"          && <MobileHome onNavigate={navigateToScreen} />}
        {screen === "accounts"      && <MobileAccounts />}
        {screen === "budget"        && <MobileBudget />}
        {screen === "goals"         && <MobileGoals />}
        {screen === "investments"   && <MobileInvestments />}
        {screen === "more"          && <MobileMore onNavigate={navigateToScreen} />}
        {screen === "analytics"     && <MobileAnalytics onBack={goBack} />}
        {screen === "subscriptions" && <MobileSubscriptions onBack={goBack} />}
        {screen === "owing"         && <MobileOwing onBack={goBack} />}
        {screen === "reports"       && <MobileReports onBack={goBack} />}
        {screen === "net-worth"     && <MobileNetWorth onBack={goBack} />}
        {screen === "settings"      && <MobileSettings onBack={goBack} />}
        {screen === "upcoming"      && <MobileUpcomingFull onBack={goBack} />}
      </div>
      <MobileNav />
    </div>
  );
}

export function MobileApp() {
  return <MobileAppInner />;
}
