import { useState } from "react";
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
  const [screen, setScreen] = useState<AppScreen>("home");

  const navTab = (NAV_SCREENS.has(screen) ? screen : screen === "personalize" ? "more" : "more") as MobileTab;

  function handleNavChange(tab: MobileTab) {
    setScreen(tab);
  }

  const goBack = () => setScreen("more");

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
        {/* Bloomberg-style persistent financial status strip */}
        <div style={{ height: 22, borderBottom: "1px solid var(--ft-border)", background: "var(--ft-surface)", display: "flex", alignItems: "center", paddingLeft: 14, paddingRight: 14, overflow: "hidden", flexShrink: 0, gap: 0 }}>
          {([ ["NW", "£18.2k +23%", "var(--ft-green)"], ["SAVE", "£1,860/mo", "var(--ft-accent)"], ["HLTH", "72/100", "var(--ft-accent)"], ["NEXT", "Rent 5d", "var(--ft-text)"] ] as [string,string,string][]).map(([k, v, c], i) => (
            <span key={k} style={{ fontFamily: "var(--font-mono)", fontSize: 7.5, color: "var(--ft-dim)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
              {i > 0 && <span style={{ margin: "0 8px", color: "var(--ft-border)" }}>·</span>}{k}&nbsp;<span style={{ color: c, fontWeight: 700 }}>{v}</span>
            </span>
          ))}
        </div>
        {screen === "home"          && <MobileHome onNavigate={s => setScreen(s)} />}
        {screen === "accounts"      && <MobileAccounts />}
        {screen === "txns"          && <MobileTransactions />}
        {screen === "budget"        && <MobileBudget />}
        {screen === "goals"         && <MobileGoals />}
        {screen === "investments"   && <MobileInvestments />}
        {screen === "more"          && <MobileMore onPersonalize={() => setScreen("personalize")} onNavigate={s => setScreen(s)} />}
        {screen === "personalize"   && <MobilePersonalize />}
        {screen === "analytics"     && <MobileAnalytics onBack={goBack} />}
        {screen === "subscriptions" && <MobileSubscriptions onBack={goBack} />}
        {screen === "owing"         && <MobileOwing onBack={goBack} />}
        {screen === "reports"       && <MobileReports onBack={goBack} />}
        {screen === "net-worth"     && <MobileNetWorth onBack={goBack} />}
        {screen === "settings"      && <MobileSettings onBack={goBack} />}
        {screen === "upcoming"      && <MobileUpcomingFull onBack={goBack} />}
      </div>
      <MobileNav active={navTab} onChange={handleNavChange} />
      {screen !== "personalize" && screen !== "settings" && screen !== "home" && <SpeedDial onTabChange={s => setScreen(s)} />}
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
