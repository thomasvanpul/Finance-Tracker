import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Plus, X, Minus, Target as TargetIcon, CreditCard as CardIcon } from "lucide-react";
import { MobileNav, type MobileTab } from "./MobileNav";
import { MobileHome } from "./MobileHome";
import { MobileTransactions } from "./MobileTransactions";
import { MobileBudget } from "./MobileBudget";
import { MobileMore } from "./MobileMore";
import { MobileAccounts } from "./MobileAccounts";
import { MobileGoals } from "./MobileGoals";
import { MobileInvestments } from "./MobileInvestments";
import { MobilePersonalize } from "./MobilePersonalize";
import { MobileAnalytics } from "./MobileAnalytics";
import { MobileSubscriptions } from "./MobileSubscriptions";
import { MobileOwing } from "./MobileOwing";
import { MobileReports } from "./MobileReports";
import { MobileNetWorth } from "./MobileNetWorth";
import { MobileSettings } from "./MobileSettings";
import { MobileUpcomingFull } from "./MobileUpcomingFull";
import { MobileConfigProvider, useMobileConfig, type QuickAction } from "@/contexts/mobile-config-context";
import { QuickAddTransaction } from "@/components/quick-add-transaction";

export type AppScreen =
  | MobileTab
  | "personalize"
  | "analytics"
  | "subscriptions"
  | "owing"
  | "reports"
  | "net-worth"
  | "settings"
  | "upcoming";

// Every AppScreen except "txns" maps to a real URL. "txns" is a temporary
// exception: /transactions is intentionally left OUT of MOBILE_ROUTES so
// deep links to it hit the desktop page (which has swipe-to-delete via
// useSwipeDelete). Tapping the txns tab in MobileNav sets a local
// override to render MobileTransactions inside the mobile shell without
// changing the URL. Remove the override once swipe-delete is ported to
// MobileTransactions.
export const SCREEN_TO_PATH: Record<Exclude<AppScreen, "txns">, string> = {
  home: "/",
  accounts: "/accounts",
  budget: "/budget",
  goals: "/goals",
  investments: "/investments",
  more: "/more",
  personalize: "/personalize",
  analytics: "/analytics",
  subscriptions: "/subscriptions",
  owing: "/owing",
  reports: "/reports",
  "net-worth": "/net-worth",
  settings: "/settings",
  upcoming: "/upcoming",
};

export const MOBILE_ROUTES = new Set<string>(Object.values(SCREEN_TO_PATH));

const PATH_TO_SCREEN: Record<string, Exclude<AppScreen, "txns">> = Object.fromEntries(
  Object.entries(SCREEN_TO_PATH).map(([s, p]) => [p, s as Exclude<AppScreen, "txns">]),
);

const ACTION_DEFS: Record<QuickAction, { label: string; Icon: React.ComponentType<{ size: number; style?: React.CSSProperties }>; color: string }> = {
  "log-expense":   { label: "Log Expense",   Icon: Minus,      color: "var(--ft-red)" },
  "log-income":    { label: "Log Income",    Icon: Plus,       color: "var(--ft-green)" },
  "add-goal":      { label: "Goals",         Icon: TargetIcon, color: "var(--ft-accent)" },
  "view-accounts": { label: "Accounts",      Icon: CardIcon,   color: "var(--ft-accent)" },
};

function SpeedDial({ onTabChange }: { onTabChange: (screen: AppScreen) => void }) {
  const { config } = useMobileConfig();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  function handleAction(action: QuickAction) {
    setOpen(false);
    if (action === "log-expense" || action === "log-income") {
      setAddOpen(true);
    } else if (action === "add-goal") {
      onTabChange("goals");
    } else if (action === "view-accounts") {
      onTabChange("accounts");
    }
  }

  const actions = config.quickActions;
  const fabBottom = "calc(60px + env(safe-area-inset-bottom, 0px) + 16px)";

  return (
    <>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200 }}
        />
      )}

      {actions.map((action, i) => {
        const { label, Icon, color } = ACTION_DEFS[action];
        const offsetY = `calc(${fabBottom} + ${(actions.length - i) * 58}px)`;
        return (
          <div
            key={action}
            onClick={() => handleAction(action)}
            style={{
              position: "fixed", right: 20, bottom: offsetY,
              display: "flex", alignItems: "center", gap: 10,
              zIndex: 201,
              opacity: open ? 1 : 0,
              transform: open ? "translateY(0)" : "translateY(20px)",
              transition: `opacity 0.18s ${i * 40}ms, transform 0.18s ${i * 40}ms`,
              pointerEvents: open ? "auto" : "none",
              cursor: "pointer",
            }}
          >
            <div style={{ background: "var(--ft-surface)", border: "1px solid var(--ft-border)", borderRadius: 2, padding: "4px 10px", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", whiteSpace: "nowrap" }}>
              {label}
            </div>
            <div style={{ width: 44, height: 44, borderRadius: 22, background: color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 2px 10px rgba(0,0,0,0.4)" }}>
              <Icon size={18} style={{ color: "var(--ft-base)" }} />
            </div>
          </div>
        );
      })}

      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: "fixed", right: 20, bottom: fabBottom,
          width: 52, height: 52, borderRadius: 26,
          background: "var(--ft-accent)", color: "var(--ft-base)",
          border: "none", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 16px color-mix(in srgb, var(--ft-accent) 40%, transparent)",
          zIndex: 202,
          transition: "transform 0.12s",
          transform: open ? "rotate(45deg)" : "rotate(0deg)",
        }}
      >
        {open ? <X size={22} strokeWidth={2.5} /> : <Plus size={22} strokeWidth={2.5} />}
      </button>

      <QuickAddTransaction open={addOpen} onClose={() => setAddOpen(false)} />
    </>
  );
}

const NAV_SCREENS = new Set<AppScreen>(["home", "accounts", "txns", "budget", "goals", "investments", "more"]);

function MobileAppInner() {
  const [location, navigate] = useLocation();
  // Local override for the "txns" tab only; see SCREEN_TO_PATH comment.
  const [showTxnsOverride, setShowTxnsOverride] = useState(false);

  // Any URL change (browser back, forward, in-app nav, direct entry) clears
  // the txns override so screen tracks the URL again.
  useEffect(() => {
    setShowTxnsOverride(false);
  }, [location]);

  const urlScreen = PATH_TO_SCREEN[location] ?? "home";
  const screen: AppScreen = showTxnsOverride ? "txns" : urlScreen;

  const navTab = (NAV_SCREENS.has(screen) ? screen : "more") as MobileTab;

  function navigateToScreen(s: AppScreen) {
    if (s === "txns") {
      setShowTxnsOverride(true);
      return;
    }
    setShowTxnsOverride(false);
    navigate(SCREEN_TO_PATH[s]);
  }

  function handleNavChange(tab: MobileTab) {
    navigateToScreen(tab);
  }

  // Sub-screen back chevron means "up to parent (More)", not "browser back".
  // The browser back button handles history walking on its own now that we
  // push real URLs.
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
            Hidden on Home — the v7 design carries its own top bar and footer. */}
        {screen !== "home" && (
          <div style={{ height: 22, borderBottom: "1px solid var(--ft-border)", background: "var(--ft-surface)", display: "flex", alignItems: "center", paddingLeft: 14, paddingRight: 14, overflow: "hidden", flexShrink: 0, gap: 0 }}>
            {([ ["NW", "£18.2k +23%", "var(--ft-green)"], ["SAVE", "£1,860/mo", "var(--ft-accent)"], ["HLTH", "72/100", "var(--ft-accent)"], ["NEXT", "Rent 5d", "var(--ft-text)"] ] as [string,string,string][]).map(([k, v, c], i) => (
              <span key={k} style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
                {i > 0 && <span style={{ margin: "0 8px", color: "var(--ft-border)" }}>·</span>}{k}&nbsp;<span style={{ color: c, fontWeight: 700 }}>{v}</span>
              </span>
            ))}
          </div>
        )}
        {screen === "home"          && <MobileHome onNavigate={navigateToScreen} />}
        {screen === "accounts"      && <MobileAccounts />}
        {screen === "txns"          && <MobileTransactions />}
        {screen === "budget"        && <MobileBudget />}
        {screen === "goals"         && <MobileGoals />}
        {screen === "investments"   && <MobileInvestments />}
        {screen === "more"          && <MobileMore onPersonalize={() => navigateToScreen("personalize")} onNavigate={navigateToScreen} />}
        {screen === "personalize"   && <MobilePersonalize />}
        {screen === "analytics"     && <MobileAnalytics onBack={goBack} />}
        {screen === "subscriptions" && <MobileSubscriptions onBack={goBack} />}
        {screen === "owing"         && <MobileOwing onBack={goBack} />}
        {screen === "reports"       && <MobileReports onBack={goBack} />}
        {screen === "net-worth"     && <MobileNetWorth onBack={goBack} />}
        {screen === "settings"      && <MobileSettings onBack={goBack} />}
        {screen === "upcoming"      && <MobileUpcomingFull onBack={goBack} />}
      </div>
      {/* MobileNav hidden on Home — the v7 design owns the footer there. */}
      {screen !== "home" && <MobileNav active={navTab} onChange={handleNavChange} />}
      {screen !== "personalize" && screen !== "settings" && screen !== "home" && <SpeedDial onTabChange={navigateToScreen} />}
    </div>
  );
}

export function MobileApp() {
  return (
    <MobileConfigProvider>
      <MobileAppInner />
    </MobileConfigProvider>
  );
}
