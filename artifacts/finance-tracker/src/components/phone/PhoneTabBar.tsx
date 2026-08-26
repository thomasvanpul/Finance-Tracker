import { Link, useLocation } from "wouter";

// Five fixed tabs. Same for every user, every persona. Persona machinery
// still lives in `lib/persona.ts` and drives content (widget order, empty
// states, default lens on UPCOMING, whether WORTH leads with cash or
// holdings, accent colour) — it no longer drives structure. See
// docs/BACKLOG.md § D4 and Atlas/Projects/Finance-Tracker.md §§ 22–24
// for the reasoning behind fixed structure.
type Tab = {
  key: string;
  href: string;
  label: string;
  aliases: readonly string[];
};

const TABS: readonly Tab[] = [
  { key: "home",      href: "/",          label: "HOME",      aliases: [] },
  { key: "worth",     href: "/worth",     label: "WORTH",     aliases: ["/accounts", "/net-worth", "/portfolio", "/investments"] },
  { key: "spending",  href: "/spending",  label: "SPENDING",  aliases: ["/transactions", "/budget", "/analytics", "/cashflow"] },
  { key: "upcoming",  href: "/upcoming",  label: "UPCOMING",  aliases: ["/recurring", "/subscriptions", "/calendar"] },
  { key: "directory", href: "/directory", label: "DIRECTORY", aliases: [] },
];

// URLs owned by the DIRECTORY tab (the tab shows as active for any of these).
// Kept in sync manually with PhoneShell's directory routes.
const DIRECTORY_MEMBERS: ReadonlySet<string> = new Set([
  "/goals", "/health-score",
  "/whatif", "/pension", "/fire", "/projection", "/mortgage", "/tax", "/calculators",
  "/owing", "/split", "/shared",
  "/ai-coach", "/briefing",
  "/reports", "/year-review", "/decisions",
  "/business", "/family", "/trading",
  "/import",
  "/profile", "/settings",
]);

function isActive(tab: Tab, loc: string): boolean {
  if (tab.key === "home") return loc === "/" || loc === "";
  if (tab.href === loc) return true;
  if (tab.aliases.includes(loc)) return true;
  if (tab.key === "directory" && DIRECTORY_MEMBERS.has(loc)) return true;
  return false;
}

export function PhoneTabBar() {
  const [loc] = useLocation();
  return (
    <nav
      aria-label="Primary"
      style={{
        flexShrink: 0,
        display: "grid",
        gridTemplateColumns: "repeat(5, 1fr)",
        background: "var(--ft-surface)",
        borderTop: "1px solid var(--ft-border)",
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {TABS.map((tab) => {
        const active = isActive(tab, loc);
        return (
          <Link
            key={tab.key}
            href={tab.href}
            style={{
              minHeight: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              letterSpacing: "0.08em",
              color: active ? "var(--ft-accent)" : "var(--ft-dim)",
              textDecoration: "none",
              borderTop: active ? "2px solid var(--ft-accent)" : "2px solid transparent",
              marginTop: -1,
              cursor: "pointer",
              padding: "10px 4px",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
