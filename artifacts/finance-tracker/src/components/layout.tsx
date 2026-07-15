import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  CalendarClock,
  TrendingUp,
  HandCoins,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiBar } from "./kpi-bar";

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
  { href: "/settings", label: "Settings", short: "SET", icon: SettingsIcon },
];

const now = new Date();
const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  const active = navItems.find(
    (n) => n.href === location || (n.href !== "/" && location.startsWith(n.href))
  ) ?? navItems[0];

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground dark overflow-hidden">
      {/* ── Top bar (desktop: full ribbon; mobile: compact) ── */}
      <div
        className="flex-shrink-0 flex items-center border-b"
        style={{ background: "#161B22", borderColor: "#21262D" }}
      >
        {/* Logo */}
        <div
          className="flex items-center gap-2.5 px-3 sm:px-4 border-r"
          style={{ borderColor: "#21262D", height: 44 }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" className="flex-shrink-0">
            <rect width="22" height="22" rx="4" fill="#0D1117" />
            <rect x="3" y="14" width="3" height="5" rx="0.5" fill="#1F6FEB" opacity="0.7" />
            <rect x="8" y="10" width="3" height="9" rx="0.5" fill="#1F6FEB" opacity="0.85" />
            <rect x="13" y="6" width="3" height="13" rx="0.5" fill="#1F6FEB" />
            <polyline points="4.5,13 9.5,9 14.5,5 18,3" stroke="#3FB950" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="18" cy="3" r="1.2" fill="#3FB950" />
          </svg>
          <span className="font-bold text-sm tracking-tight" style={{ color: "#E6EDF3" }}>
            Fintrack
          </span>
          <span className="text-xs ml-0.5 hidden sm:inline" style={{ color: "#30363D" }}>v2</span>
        </div>

        {/* Desktop nav tabs — hidden on mobile */}
        <nav className="hidden sm:flex h-full">
          {navItems.map((item) => {
            const isActive =
              location === item.href ||
              (item.href !== "/" && location.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={cn(
                    "flex items-center gap-2 px-3 h-11 text-xs font-medium cursor-pointer transition-colors border-b-2",
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

        {/* Mobile: current page label */}
        <div className="flex sm:hidden items-center gap-1.5 px-3 flex-1">
          <active.icon className="w-3.5 h-3.5" style={{ color: "#58A6FF" }} />
          <span className="text-xs font-semibold" style={{ color: "#58A6FF" }}>{active.label}</span>
        </div>

        <div className="flex-1 hidden sm:block" />

        {/* Status bar */}
        <div className="flex items-center gap-3 px-3 sm:px-4 text-xs" style={{ color: "#484F58" }}>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950]" />
            <span style={{ color: "#3FB950" }}>Live</span>
          </span>
          <span className="hidden sm:inline">GBP Base</span>
          <span className="hidden sm:inline">{dateStr}</span>
        </div>
      </div>

      {/* ── Formula bar — desktop only ── */}
      <div
        className="hidden sm:flex flex-shrink-0 items-center gap-2 border-b px-3"
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

      {/* ── KPI strip — persistent on all pages ── */}
      <KpiBar />

      {/* ── Content area ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Row gutter — desktop only */}
        <div
          className="hidden sm:flex flex-shrink-0 flex-col border-r select-none"
          style={{ background: "#161B22", borderColor: "#21262D", width: 36 }}
        >
          {Array.from({ length: 50 }, (_, i) => {
            const row = i + 1;
            const isMajor = row % 5 === 0;
            return (
              <div
                key={i}
                className="flex items-center justify-center border-b"
                style={{ height: 24, borderColor: "rgba(33,38,45,0.5)", flexShrink: 0 }}
              >
                {isMajor ? (
                  <span className="text-xs font-mono" style={{ color: "#484F58" }}>{row}</span>
                ) : (
                  <span style={{ display: "block", width: 6, height: 1, background: "#21262D", borderRadius: 1 }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto" style={{ background: "#0D1117" }}>
          <div className="p-3 sm:p-6 pb-20 sm:pb-6">{children}</div>
        </main>
      </div>

      {/* ── Bottom tab bar — mobile only ── */}
      <div
        className="flex sm:hidden flex-shrink-0 border-t"
        style={{ background: "#161B22", borderColor: "#21262D" }}
      >
        {navItems.map((item) => {
          const isActive =
            location === item.href ||
            (item.href !== "/" && location.startsWith(item.href));
          return (
            <Link key={item.href} href={item.href} className="flex-1">
              <div
                className="flex flex-col items-center justify-center gap-0.5 py-2 transition-colors"
                style={{
                  color: isActive ? "#58A6FF" : "#6E7681",
                  borderTop: isActive ? "2px solid #1F6FEB" : "2px solid transparent",
                  background: isActive ? "rgba(31,111,235,0.06)" : "transparent",
                }}
              >
                <item.icon className="w-4 h-4" />
                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.04em" }}>
                  {item.short}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
