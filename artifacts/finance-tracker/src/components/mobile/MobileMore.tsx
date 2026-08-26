import { ChevronRight } from "lucide-react";
import type { AppScreen } from "./MobileApp";
import { MobileScreenHeader } from "./mobile-ui";
import { HStack, MonoLabel, Text } from "@/components/primitives";

// The mobile directory — grouped list of every reachable route. Wired as
// the FIND destination from the unified nav footer; its job is to let a
// stranger reach any of the ~30 routes in two taps.
//
// Devices from the financial-screen vocabulary that DON'T apply here and
// are deliberately left out:
//   - Number rule / native currency / dotted-means-not-yet-real — this
//     screen shows no figures.
//   - BlockField / ticker glyph / initial glyph — no positions, people,
//     or values on a directory.
//   - Two-level column headers — a directory is a single-column list.
//   - Premium 34px headline — nothing to headline; the whole point is the
//     rows.
//
// What DOES carry over:
//   - Type ladder (mono uppercase group labels, sans row labels).
//   - Hairline row structure.
//   - Primitives instead of raw flex divs.
//   - Route count in the top strip, in the same mono vocabulary as the
//     "N ACCOUNTS" / "N PENDING" counts on the financial screens.

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
      { key: "business",    href: "/business",    label: "Business" },
      { key: "trading",     href: "/trading",     label: "Trading" },
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

export function MobileMore({ onNavigate }: MobileMoreProps) {
  function go(item: MoreItem) {
    if (item.inApp) onNavigate(item.inApp);
    else if (item.href) window.location.href = item.href;
  }
  const totalRoutes = SECTIONS.reduce((s, sec) => s + sec.items.length, 0);

  return (
    <div
      className="mobile-scroll"
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        paddingBottom: "calc(74px + env(safe-area-inset-bottom, 0px) + 16px)",
        background: "var(--ft-base)",
        color: "var(--ft-text)",
      }}
    >
      <MobileScreenHeader title="Find" />

      <HStack paddingX={18} height={32} justify="end" align="center">
        <MonoLabel size={11} letterSpacing="0.16em">
          {totalRoutes} ROUTES
        </MonoLabel>
      </HStack>

      {SECTIONS.map((s) => (
        <div key={s.label} style={{ marginTop: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "0 18px 6px",
              borderBottom: "1px solid var(--ft-border2)",
            }}
          >
            <MonoLabel as="span" size={9}>{s.label}</MonoLabel>
          </div>
          {s.items.map((it) => (
            <div
              key={it.key}
              onClick={() => go(it)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                minHeight: 44,
                padding: "0 18px",
                borderBottom: "1px solid var(--ft-border)",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <Text as="span" size={14}>{it.label}</Text>
              <ChevronRight size={16} style={{ color: "var(--ft-dim)" }} />
            </div>
          ))}
        </div>
      ))}

    </div>
  );
}
