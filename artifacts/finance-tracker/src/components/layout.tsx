import { Link, useLocation } from "wouter";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Wallet,
  ArrowLeftRight,
  CalendarClock,
  TrendingUp,
  HandCoins,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { KpiBar } from "./kpi-bar";
import { useGetSettingsCurrency } from "@workspace/api-client-react";

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

const settingsItem = { href: "/settings", label: "Settings", short: "SET", icon: SettingsIcon };

const now = new Date();
const dateStr = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const SIDEBAR_STORAGE_KEY = "sidebar-collapsed";

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { data: currencySettings } = useGetSettingsCurrency();
  const baseCurrency = currencySettings?.baseCurrency ?? "GBP";

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, String(collapsed));
    } catch {
      // ignore
    }
  }, [collapsed]);

  const allNavItems = [...navItems, settingsItem];

  const active =
    allNavItems.find(
      (n) => n.href === location || (n.href !== "/" && location.startsWith(n.href))
    ) ?? navItems[0];

  const sidebarWidth = collapsed ? 52 : 200;

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground dark overflow-hidden">
      {/* ── Top bar ── */}
      <div
        className="flex-shrink-0 flex items-center border-b"
        style={{ background: "#161B22", borderColor: "#21262D", height: 44 }}
      >
        {/* Logo — always visible */}
        <div
          className="flex items-center gap-2 px-3 border-r flex-shrink-0"
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
          {!collapsed && (
            <span className="font-bold text-sm tracking-tight hidden sm:inline" style={{ color: "#E6EDF3" }}>
              Fintrack
            </span>
          )}
          {!collapsed && (
            <span className="text-xs ml-0.5 hidden sm:inline" style={{ color: "#484F58" }}>
              v2
            </span>
          )}
        </div>

        {/* Collapse toggle — desktop only */}
        <button
          className="hidden sm:flex items-center justify-center flex-shrink-0 transition-colors"
          style={{ width: 40, height: 44, color: "#6E7681" }}
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>

        {/* Mobile: current page label */}
        <div className="flex sm:hidden items-center gap-1.5 px-3 flex-1">
          <active.icon className="w-3.5 h-3.5" style={{ color: "#58A6FF" }} />
          <span className="text-xs font-semibold" style={{ color: "#58A6FF" }}>{active.label}</span>
        </div>

        <div className="flex-1" />

        {/* Status bar */}
        <div className="flex items-center gap-3 px-3 sm:px-4 text-xs" style={{ color: "#484F58" }}>
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#3FB950]" />
            <span style={{ color: "#3FB950" }}>Live</span>
          </span>
          <span className="hidden sm:inline">{baseCurrency} Base</span>
          <span className="hidden sm:inline">{dateStr}</span>
        </div>
      </div>

      {/* ── KPI strip — persistent on all pages ── */}
      <KpiBar />

      {/* ── Main area: sidebar + content ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — desktop only */}
        <nav
          className="hidden sm:flex flex-shrink-0 flex-col border-r overflow-hidden transition-all duration-200"
          style={{
            background: "#161B22",
            borderColor: "#21262D",
            width: sidebarWidth,
          }}
        >
          {/* Main nav items */}
          <div className="flex flex-col flex-1 py-2">
            {navItems.map((item) => {
              const isActive =
                location === item.href ||
                (item.href !== "/" && location.startsWith(item.href));
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 cursor-pointer transition-colors",
                      collapsed ? "justify-center px-0" : "px-3",
                      isActive
                        ? "bg-[rgba(31,111,235,0.1)]"
                        : "hover:bg-[rgba(255,255,255,0.03)]"
                    )}
                    style={{
                      height: 36,
                      color: isActive ? "#58A6FF" : "#6E7681",
                      borderLeft: isActive ? "3px solid #1F6FEB" : "3px solid transparent",
                    }}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && (
                      <span className="text-xs font-medium truncate">{item.label}</span>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Settings at the bottom, separated */}
          <div
            className="flex-shrink-0 border-t"
            style={{ borderColor: "#21262D" }}
          >
            {(() => {
              const item = settingsItem;
              const isActive =
                location === item.href || location.startsWith(item.href);
              return (
                <Link href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 cursor-pointer transition-colors",
                      collapsed ? "justify-center px-0" : "px-3",
                      isActive
                        ? "bg-[rgba(31,111,235,0.1)]"
                        : "hover:bg-[rgba(255,255,255,0.03)]"
                    )}
                    style={{
                      height: 36,
                      color: isActive ? "#58A6FF" : "#6E7681",
                      borderLeft: isActive ? "3px solid #1F6FEB" : "3px solid transparent",
                    }}
                    title={collapsed ? item.label : undefined}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {!collapsed && (
                      <span className="text-xs font-medium truncate">{item.label}</span>
                    )}
                  </div>
                </Link>
              );
            })()}
          </div>
        </nav>

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
        {allNavItems.map((item) => {
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
