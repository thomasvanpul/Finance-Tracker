import { ChevronRight } from "lucide-react";
import type { AppScreen } from "./MobileApp";
import { MobileScreenHeader } from "./mobile-ui";

// The mobile directory. Grouped list of every reachable route. Wired as the
// FIND destination from the unified nav footer, so its job is to let a
// stranger reach any of the ~30 routes in two taps.
//
// Earlier version was a widget dashboard (Financial Pulse, Financial Tempo,
// Compound Growth, F.I.R.E. progress, Purchasing power erosion, Market
// ticker, Tax Snapshot, Financial Fitness Score). Every one of those
// depended on fabricated per-account data (BALANCE_HISTORY,
// MOCK_MONTHLY_PERF, MOCK_OWING_TOTAL, MOCK_UPCOMING_COUNT, MOCK_GOALS).
// All removed. Once the API can supply the underlying series honestly,
// individual widgets can come back — but they belong on the pages they
// summarise, not stacked on the directory.

interface MoreItem {
  key: string;
  label: string;
  href?: string;
  inApp?: AppScreen;
}

interface MoreSection {
  label: string;
  items: MoreItem[];
}

interface MobileMoreProps {
  onPersonalize: () => void;
  onNavigate: (screen: AppScreen) => void;
}

const SECTIONS: MoreSection[] = [
  {
    label: "MONEY",
    items: [
      { key: "accounts",      inApp: "accounts",     label: "Accounts" },
      { key: "transactions",  href: "/transactions",  label: "Transactions" },
      { key: "budget",        inApp: "budget",        label: "Budget" },
      { key: "subscriptions", inApp: "subscriptions", label: "Subscriptions" },
      { key: "recurring",     href: "/recurring",     label: "Recurring" },
      { key: "upcoming",      inApp: "upcoming",      label: "Upcoming" },
      { key: "cashflow",      href: "/cashflow",      label: "Cash flow" },
      { key: "import",        href: "/import",        label: "Import" },
    ],
  },
  {
    label: "WEALTH",
    items: [
      { key: "networth",   inApp: "net-worth",    label: "Net worth" },
      { key: "goals",      inApp: "goals",         label: "Goals" },
      { key: "investments",inApp: "investments",   label: "Investments" },
      { key: "portfolio",  href: "/portfolio",     label: "Portfolio" },
      { key: "fire",       href: "/fire",          label: "FIRE" },
      { key: "pension",    href: "/pension",       label: "Pension" },
      { key: "projection", href: "/projection",    label: "Projection" },
      { key: "whatif",     href: "/whatif",        label: "What if" },
    ],
  },
  {
    label: "PEOPLE",
    items: [
      { key: "owing",  inApp: "owing", label: "Owing" },
      { key: "split",  href: "/split", label: "Split" },
      { key: "family", href: "/family", label: "Family" },
    ],
  },
  {
    label: "REPORT",
    items: [
      { key: "analytics",  inApp: "analytics",   label: "Analytics" },
      { key: "reports",    inApp: "reports",     label: "Reports" },
      { key: "year-review",href: "/year-review", label: "Year review" },
      { key: "briefing",   href: "/briefing",    label: "Briefing" },
      { key: "health",     href: "/health-score",label: "Health score" },
      { key: "decisions",  href: "/decisions",   label: "Decisions" },
      { key: "ai-coach",   href: "/ai-coach",    label: "AI Coach" },
    ],
  },
  {
    label: "TOOLS",
    items: [
      { key: "calculators", href: "/calculators", label: "Calculators" },
      { key: "mortgage",    href: "/mortgage",    label: "Mortgage" },
      { key: "tax",         href: "/tax",         label: "Tax" },
      { key: "calendar",    href: "/calendar",    label: "Calendar" },
      { key: "wardrobe",    href: "/wardrobe",    label: "Wardrobe" },
      { key: "business",    href: "/business",    label: "Business" },
      { key: "trading",     href: "/trading",     label: "Trading" },
      { key: "learn",       href: "/learn",       label: "Learn" },
    ],
  },
  {
    label: "YOU",
    items: [
      { key: "settings", inApp: "settings",     label: "Settings" },
      { key: "profile",  href: "/profile",       label: "Profile" },
    ],
  },
];

export function MobileMore({ onPersonalize, onNavigate }: MobileMoreProps) {
  function go(item: MoreItem) {
    if (item.inApp) onNavigate(item.inApp);
    else if (item.href) window.location.href = item.href;
  }

  return (
    <div
      className="mobile-scroll"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        paddingBottom: "calc(74px + env(safe-area-inset-bottom, 0px) + 16px)",
      }}
    >
      <MobileScreenHeader title="Find" />

      <div style={{ padding: "0 16px" }}>
        {SECTIONS.map((s) => (
          <div key={s.label} style={{ marginBottom: 18 }}>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                letterSpacing: "0.16em",
                color: "var(--ft-dim)",
                marginBottom: 6,
              }}
            >
              {s.label}
            </div>
            {s.items.map((it, i) => (
              <div
                key={it.key}
                onClick={() => go(it)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  minHeight: 44,
                  borderTopWidth: 1, borderTopStyle: "solid", borderTopColor: "var(--ft-border)",
                  ...(i === s.items.length - 1
                    ? { borderBottomWidth: 1, borderBottomStyle: "solid", borderBottomColor: "var(--ft-border)" }
                    : {}),
                  fontSize: 14,
                  cursor: "pointer",
                  userSelect: "none",
                }}
              >
                <span>{it.label}</span>
                <ChevronRight size={16} style={{ color: "var(--ft-dim)" }} />
              </div>
            ))}
          </div>
        ))}

        <div
          onClick={onPersonalize}
          style={{
            marginTop: 8,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            color: "var(--ft-dim)",
            cursor: "pointer",
            padding: "12px 0",
          }}
        >
          PERSONALISE ›
        </div>
      </div>
    </div>
  );
}
