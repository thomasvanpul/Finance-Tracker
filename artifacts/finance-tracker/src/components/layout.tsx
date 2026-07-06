import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  CalendarClock,
  TrendingUp,
  HandCoins,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LayoutProps {
  children: React.ReactNode;
}

const navItems = [
  { href: "/", label: "Overview", short: "OVW", icon: LayoutDashboard },
  { href: "/accounts", label: "Accounts", short: "ACC", icon: Wallet },
  { href: "/transactions", label: "Transactions", short: "TXN", icon: ArrowLeftRight },
  { href: "/upcoming", label: "Upcoming", short: "UPC", icon: CalendarClock },
  { href: "/investments", label: "Investments", short: "INV", icon: TrendingUp },
  { href: "/owing", label: "Owing", short: "OWE", icon: HandCoins },
];

const now = new Date();
const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const active = navItems.find(
    (n) => n.href === location || (n.href !== "/" && location.startsWith(n.href))
  ) ?? navItems[0];

  return (
    <div className="flex flex-col h-screen bg-background text-foreground dark overflow-hidden">
      {/* ── Ribbon top bar ── */}
      <div
        className="flex-shrink-0 flex items-center border-b"
        style={{ background: "#161B22", borderColor: "#21262D" }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2 px-4 border-r"
          style={{ borderColor: "#21262D", minWidth: 180, height: 40 }}
        >
          <div
            className="flex items-center justify-center text-white font-bold text-sm"
            style={{ width: 26, height: 26, background: "linear-gradient(135deg,#1F6FEB,#0D419D)", borderRadius: 3 }}
          >
            F
          </div>
          <span className="font-bold text-sm tracking-tight" style={{ color: "#E6EDF3" }}>
            Fintrack
          </span>
          <span className="text-xs ml-1" style={{ color: "#484F58" }}>
            v2
          </span>
        </div>

        {/* Nav tabs */}
        <nav className="flex h-full">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-2 px-4 h-10 text-xs font-medium cursor-pointer transition-colors border-b-2",
                    isActive
                      ? "border-b-[#1F6FEB] text-[#58A6FF] bg-[rgba(31,111,235,0.06)]"
                      : "border-b-transparent hover:text-[#C9D1D9] hover:bg-[rgba(255,255,255,0.03)]"
                  )}
                  style={{ color: isActive ? "#58A6FF" : "#6E7681" }}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="flex-1" />

        {/* Status bar */}
        <div className="flex items-center gap-4 px-4 text-xs" style={{ color: "#484F58" }}>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950]" />
            <span style={{ color: "#3FB950" }}>Live</span>
          </span>
          <span>GBP Base</span>
          <span>{dateStr}</span>
        </div>
      </div>

      {/* ── Formula bar ── */}
      <div
        className="flex-shrink-0 flex items-center gap-2 border-b px-3"
        style={{ background: "#161B22", borderColor: "#21262D", height: 28 }}
      >
        <span
          className="text-xs font-mono px-2 py-0.5 border"
          style={{ color: "#58A6FF", borderColor: "#30363D", background: "#0D1117", minWidth: 48, textAlign: "center" }}
        >
          {active.short}
        </span>
        <span className="text-xs" style={{ color: "#484F58" }}>fx</span>
        <span className="text-xs font-mono flex-1 truncate" style={{ color: "#6E7681" }}>
          =FINTRACK.{active.label.toUpperCase()}()
        </span>
      </div>

      {/* ── Content area ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Row-number gutter */}
        <div
          className="flex-shrink-0 flex flex-col border-r select-none"
          style={{ background: "#161B22", borderColor: "#21262D", width: 36 }}
        >
          {Array.from({ length: 40 }, (_, i) => (
            <div
              key={i}
              className="flex items-center justify-center border-b text-xs"
              style={{ height: 24, color: "#484F58", borderColor: "rgba(33,38,45,0.5)", flexShrink: 0 }}
            >
              {i + 1}
            </div>
          ))}
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto" style={{ background: "#0D1117" }}>
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
