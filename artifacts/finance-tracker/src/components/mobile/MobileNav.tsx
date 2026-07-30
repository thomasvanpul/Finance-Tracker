import type { LucideIcon } from "lucide-react";
import { Home, ArrowLeftRight, PieChart, Grid3X3, CreditCard, Target, TrendingUp } from "lucide-react";
import { useMobileConfig } from "@/contexts/mobile-config-context";

export type MobileTab = "home" | "accounts" | "txns" | "budget" | "goals" | "investments" | "more";

const TAB_DEFS: Record<MobileTab, { label: string; Icon: LucideIcon }> = {
  home:        { label: "Home",   Icon: Home },
  accounts:    { label: "Accts",  Icon: CreditCard },
  txns:        { label: "Txns",   Icon: ArrowLeftRight },
  budget:      { label: "Budget", Icon: PieChart },
  goals:       { label: "Goals",  Icon: Target },
  investments: { label: "Invest", Icon: TrendingUp },
  more:        { label: "More",   Icon: Grid3X3 },
};

interface MobileNavProps {
  active: MobileTab;
  onChange: (tab: MobileTab) => void;
}

export function MobileNav({ active, onChange }: MobileNavProps) {
  const { config } = useMobileConfig();
  const tabs: MobileTab[] = ["home", ...config.midTabs, "more"];

  return (
    <div style={{
      position: "fixed",
      bottom: 0,
      left: 0,
      right: 0,
      height: "calc(60px + env(safe-area-inset-bottom, 0px))",
      background: "var(--ft-surface)",
      borderTop: "1px solid var(--ft-border)",
      display: "flex",
      alignItems: "flex-start",
      paddingTop: 8,
      zIndex: 100,
    }}>
      {tabs.map(id => {
        const { label, Icon } = TAB_DEFS[id];
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => onChange(id)}
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 3,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: "2px 0 0",
              minHeight: 44,
              position: "relative",
            }}
          >
            {isActive && (
              <div style={{ position: "absolute", top: -8, left: "20%", right: "20%", height: 2, background: "var(--ft-accent)" }} />
            )}
            <Icon
              size={20}
              style={{ color: isActive ? "var(--ft-accent)" : "var(--ft-dim)" }}
              strokeWidth={isActive ? 2.2 : 1.6}
            />
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: isActive ? "var(--ft-accent)" : "var(--ft-dim)",
              fontWeight: isActive ? 700 : 400,
            }}>
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
