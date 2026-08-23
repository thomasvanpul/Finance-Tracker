import { Link, useLocation } from "wouter";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { usePullToRefresh } from "@/hooks/use-pull-to-refresh";
import { useNetworkStatus } from "@/hooks/use-network-status";
import { useAppResume } from "@/hooks/use-app-resume";
import { MobileFab } from "@/components/mobile-fab";
import { CountryMark, COUNTRY_FOR_CITY } from "@/components/currency-mark";
import { createPortal } from "react-dom";
import { useFintrackTheme } from "@/contexts/theme-context";
import { authClient } from "@/lib/auth-client";
import { useQueryClient } from "@tanstack/react-query";
import { useGetMarketQuotes, useGetDashboard, useGetSettingsCurrency } from "@workspace/api-client-react";
import { useTickers } from "@/contexts/tickers-context";
import { usePrivacy, PrivNum } from "@/contexts/privacy-context";
import { CommandPalette, useCommandPalette } from "@/components/command-palette";
import { QuickAddTransaction, useQuickAdd } from "@/components/quick-add-transaction";
import { GlobalSearch, useGlobalSearch } from "@/components/global-search";
import { KeyboardShortcuts, useKeyboardShortcuts } from "@/components/keyboard-shortcuts";
import { Search, Pencil, Check, Pin, ChevronUp, ChevronDown, ChevronLeft, Settings2, ChevronsLeft, ChevronsRight, Eye, EyeOff, ChevronRight, Bell, Home, CreditCard, ArrowLeftRight, BarChart2, PieChart, LineChart, TrendingUp, FileText, Briefcase, Activity, Target, Calendar, RefreshCw, Users, BookOpen, Grid3X3, X } from "lucide-react";
import { Logo, LogoMark } from "@/components/logo";
import { formatGbp } from "@/lib/utils";
import { setBaseCurrency } from "@/lib/currency-store";
import { ThemeEffects } from "@/components/theme-effects";
import { useEasterEggs, EasterEggRenderer } from "@/components/easter-eggs";
import { AiAgent } from "@/components/ai-agent";
import { PWAInstallButton } from "@/components/pwa-install";
import { NotificationsPanel, useAlerts, loadDismissed } from "@/components/notifications-panel";
import { loadSidebarConfig, saveSidebarConfig } from "@/lib/sidebar-config";
import type { SidebarConfig, SidebarItemConfig } from "@/lib/sidebar-config";
import { loadPersonaIds, PERSONAS, PERSONA_COLORS, PERSONA_GLYPHS } from "@/lib/persona";
import { useActivePersona } from "@/lib/persona-hook";
import { haptic } from "@/lib/haptics";
import { useKeyboard } from "@/hooks/use-keyboard";
import { usePageSwipe } from "@/hooks/use-page-swipe";
import { useIsMobile } from "@/hooks/use-mobile";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

interface LayoutProps {
  children: React.ReactNode;
}

// Unified nav — primary items shown always, secondary items shown behind "More" toggle.
// All items for a section live together so section headers never duplicate when More is open.
const NAV_SECTIONS = [
  {
    label: "CORE",
    items: [
      { href: "/",              label: "Dashboard",    code: "G·D" },
      { href: "/accounts",      label: "Accounts",     code: "G·A" },
      { href: "/transactions",  label: "Transactions", code: "G·T" },
    ],
  },
  {
    label: "INVEST",
    items: [
      { href: "/portfolio",     label: "Portfolio",    code: "G·F" },
      { href: "/investments",   label: "Markets",      code: "G·I" },
      { href: "/net-worth",     label: "Net Worth",    code: "G·W" },
      // secondary — visible when More is open
      { href: "/tax",           label: "Tax",          code: "G·Y" },
    ],
  },
  {
    label: "PLAN",
    items: [
      { href: "/budget",        label: "Budget",       code: "G·B" },
      { href: "/goals",         label: "Goals",        code: "G·L" },
      // secondary
      { href: "/owing",         label: "Debts",        code: "G·O" },
      { href: "/split",         label: "Bill Split",   code: "G·X" },
      { href: "/subscriptions", label: "Subscriptions",code: "G·C" },
      { href: "/calendar",      label: "Calendar",     code: "G·K" },
    ],
  },
  {
    label: "INSIGHTS",
    items: [
      { href: "/decisions",     label: "Decisions",    code: "G·8" },
      { href: "/analytics",     label: "Analytics",    code: "G·N" },
      { href: "/ai-coach",      label: "AI Coach",     code: "G·G" },
      { href: "/briefing",      label: "Briefing",     code: "G·B" },
      // secondary
      { href: "/health-score",  label: "Health Score", code: "G·H" },
      { href: "/cashflow",      label: "Cash Flow",    code: "G·V" },
      // Year Review excluded from permanent nav — surfaces contextually in Dec/Jan only
      { href: "/reports",       label: "Reports",      code: "G·R" },
      { href: "/projection",    label: "Projection",   code: "G·5" },
    ],
  },
  {
    label: "TOOLS",
    items: [
      // all secondary
      { href: "/recurring",     label: "Recurring",    code: "G·U" },
      { href: "/calculators",   label: "Calculators",  code: "G·F" },
      { href: "/import",        label: "Import",       code: "G·J" },
      { href: "/learn",         label: "Learn",        code: "G·Q" },
    ],
  },
  {
    label: "ADVANCED",
    items: [
      // all secondary
      { href: "/business",      label: "Business",     code: "G·W" },
      { href: "/family",        label: "Family",       code: "G·Y" },
      { href: "/trading",       label: "Trading",      code: "G·T" },
    ],
  },
];

const BOTTOM_ITEMS = [
  { href: "/settings", label: "Settings", code: "G·S" },
];

// Flat list of all configurable nav items (sections only, not bottom items)
const ALL_NAV_ITEMS: { href: string; label: string; code: string; section: string }[] = [
  ...NAV_SECTIONS.flatMap((s) => s.items.map((item) => ({ ...item, section: s.label }))),
];

// Which hrefs are secondary (shown behind "More" toggle)
const SECONDARY_HREFS = new Set([
  "/tax",
  "/owing", "/split", "/subscriptions", "/calendar",
  "/health-score", "/cashflow", "/reports", "/projection", "/briefing",
  "/recurring", "/calculators", "/import", "/learn",
  "/business", "/family", "/trading",
]);

const G_KEY_MAP: Record<string, string> = {
  d: "/", a: "/accounts", t: "/transactions", r: "/reports",
  u: "/recurring", o: "/owing", i: "/investments",
  l: "/goals", n: "/analytics", b: "/budget",
  x: "/split", c: "/subscriptions", w: "/net-worth",
  y: "/tax", h: "/health-score",
  f: "/calculators", k: "/calendar",
  s: "/settings", q: "/learn",
  v: "/cashflow", e: "/year-review", j: "/import",
  g: "/ai-coach", z: "/wardrobe", "8": "/decisions", "9": "/briefing",
  // Power-user shortcuts not shown in sidebar
  m: "/mortgage", p: "/pension", "0": "/fire",
  "5": "/projection",
  // Advanced pages
  "1": "/business", "2": "/family", "3": "/trading",
};

// Icon mapping for sidebar nav items — shown in the chip instead of the shortcut code
const HREF_ICON_MAP: Record<string, React.ElementType> = {
  "/":              Home,
  "/accounts":      CreditCard,
  "/transactions":  ArrowLeftRight,
  "/portfolio":     Briefcase,
  "/investments":   Activity,
  "/net-worth":     TrendingUp,
  "/tax":           FileText,
  "/budget":        PieChart,
  "/goals":         Target,
  "/owing":         Users,
  "/split":         Users,
  "/subscriptions": RefreshCw,
  "/calendar":      Calendar,
  "/decisions":     BarChart2,
  "/analytics":     LineChart,
  "/ai-coach":      Activity,
  "/briefing":      FileText,
  "/health-score":  Activity,
  "/cashflow":      BarChart2,
  "/reports":       FileText,
  "/projection":    TrendingUp,
  "/recurring":     RefreshCw,
  "/calculators":   Grid3X3,
  "/import":        ArrowLeftRight,
  "/learn":         BookOpen,
  "/business":      Briefcase,
  "/family":        Users,
  "/trading":       TrendingUp,
  "/settings":      Settings2,
};

// Section that each page belongs to (for breadcrumb context on mobile)
const HREF_SECTION_MAP: Record<string, string> = {
  "/":              "CORE",
  "/accounts":      "CORE",
  "/transactions":  "CORE",
  "/portfolio":     "INVEST",
  "/investments":   "INVEST",
  "/net-worth":     "INVEST",
  "/tax":           "INVEST",
  "/budget":        "PLAN",
  "/goals":         "PLAN",
  "/owing":         "PLAN",
  "/split":         "PLAN",
  "/subscriptions": "PLAN",
  "/calendar":      "PLAN",
  "/decisions":     "INSIGHTS",
  "/analytics":     "INSIGHTS",
  "/ai-coach":      "INSIGHTS",
  "/briefing":      "INSIGHTS",
  "/health-score":  "INSIGHTS",
  "/cashflow":      "INSIGHTS",
  "/reports":       "INSIGHTS",
  "/projection":    "INSIGHTS",
  "/recurring":     "TOOLS",
  "/calculators":   "TOOLS",
  "/import":        "TOOLS",
  "/learn":         "TOOLS",
  "/business":      "ADVANCED",
  "/family":        "ADVANCED",
  "/trading":       "ADVANCED",
  "/settings":      "SETTINGS",
};


// ── World clock ─────────────────────────────────────────────────────────────

interface WorldCity {
  label: string;
  // ISO 3166-1 alpha-2 country code. Was an emoji flag; migrated
  // to a themeable inline-SVG mark (see components/currency-mark.tsx).
  // Legacy `flag` entries in localStorage are migrated on read.
  country: string;
  tz: string;
  exchange: string;
  marketOpen: string;   // "HH:MM" local time (24h)
  marketClose: string;
}

const DEFAULT_WORLD_CITIES: WorldCity[] = [
  { label: "London",    country: "GB", tz: "Europe/London",      exchange: "LSE",   marketOpen: "08:00", marketClose: "16:30" },
  { label: "New York",  country: "US", tz: "America/New_York",   exchange: "NYSE",  marketOpen: "09:30", marketClose: "16:00" },
  { label: "Tokyo",     country: "JP", tz: "Asia/Tokyo",         exchange: "TSE",   marketOpen: "09:00", marketClose: "15:30" },
  { label: "Hong Kong", country: "HK", tz: "Asia/Hong_Kong",     exchange: "HKEX",  marketOpen: "09:30", marketClose: "16:00" },
  { label: "Sydney",    country: "AU", tz: "Australia/Sydney",   exchange: "ASX",   marketOpen: "10:00", marketClose: "16:00" },
  { label: "Frankfurt", country: "DE", tz: "Europe/Berlin",      exchange: "XETRA", marketOpen: "09:00", marketClose: "17:30" },
];

// Curated timezone presets for the "Add city" dropdown
const TZ_PRESETS: WorldCity[] = [
  { label: "London",       country: "GB", tz: "Europe/London",       exchange: "LSE",      marketOpen: "08:00", marketClose: "16:30" },
  { label: "New York",     country: "US", tz: "America/New_York",    exchange: "NYSE",     marketOpen: "09:30", marketClose: "16:00" },
  { label: "Chicago",      country: "US", tz: "America/Chicago",     exchange: "CME",      marketOpen: "08:30", marketClose: "15:15" },
  { label: "Los Angeles",  country: "US", tz: "America/Los_Angeles", exchange: "—",        marketOpen: "09:30", marketClose: "16:00" },
  { label: "Toronto",      country: "CA", tz: "America/Toronto",     exchange: "TSX",      marketOpen: "09:30", marketClose: "16:00" },
  { label: "São Paulo",    country: "BR", tz: "America/Sao_Paulo",   exchange: "B3",       marketOpen: "10:00", marketClose: "17:55" },
  { label: "Frankfurt",    country: "DE", tz: "Europe/Berlin",       exchange: "XETRA",    marketOpen: "09:00", marketClose: "17:30" },
  { label: "Paris",        country: "FR", tz: "Europe/Paris",        exchange: "Euronext", marketOpen: "09:00", marketClose: "17:30" },
  { label: "Amsterdam",    country: "NL", tz: "Europe/Amsterdam",    exchange: "Euronext", marketOpen: "09:00", marketClose: "17:30" },
  { label: "Zurich",       country: "CH", tz: "Europe/Zurich",       exchange: "SIX",      marketOpen: "09:00", marketClose: "17:30" },
  { label: "Dubai",        country: "AE", tz: "Asia/Dubai",          exchange: "DFM",      marketOpen: "10:00", marketClose: "14:00" },
  { label: "Mumbai",       country: "IN", tz: "Asia/Kolkata",        exchange: "NSE",      marketOpen: "09:15", marketClose: "15:30" },
  { label: "Singapore",    country: "SG", tz: "Asia/Singapore",      exchange: "SGX",      marketOpen: "09:00", marketClose: "17:00" },
  { label: "Hong Kong",    country: "HK", tz: "Asia/Hong_Kong",      exchange: "HKEX",     marketOpen: "09:30", marketClose: "16:00" },
  { label: "Shanghai",     country: "CN", tz: "Asia/Shanghai",       exchange: "SSE",      marketOpen: "09:30", marketClose: "15:00" },
  { label: "Tokyo",        country: "JP", tz: "Asia/Tokyo",          exchange: "TSE",      marketOpen: "09:00", marketClose: "15:30" },
  { label: "Seoul",        country: "KR", tz: "Asia/Seoul",          exchange: "KRX",      marketOpen: "09:00", marketClose: "15:30" },
  { label: "Sydney",       country: "AU", tz: "Australia/Sydney",    exchange: "ASX",      marketOpen: "10:00", marketClose: "16:00" },
];

const LS_WORLD_CLOCK_KEY = "ft-world-clock-cities";

function readWorldCities(): WorldCity[] {
  try {
    const r = localStorage.getItem(LS_WORLD_CLOCK_KEY);
    if (!r) return DEFAULT_WORLD_CITIES;
    const raw = JSON.parse(r) as Array<Partial<WorldCity> & { flag?: string }>;
    // Migrate legacy entries: `flag` (emoji) → `country` (ISO code)
    // via COUNTRY_FOR_CITY. Anything unrecognised falls back to a
    // two-letter guess from the label, defaulting to "??".
    return raw.map((c) => ({
      label: c.label ?? "",
      country: c.country ?? COUNTRY_FOR_CITY[c.label ?? ""] ?? "??",
      tz: c.tz ?? "UTC",
      exchange: c.exchange ?? "—",
      marketOpen: c.marketOpen ?? "09:00",
      marketClose: c.marketClose ?? "17:00",
    }));
  } catch { return DEFAULT_WORLD_CITIES; }
}

function writeWorldCities(cities: WorldCity[]): void {
  try { localStorage.setItem(LS_WORLD_CLOCK_KEY, JSON.stringify(cities)); } catch { /* noop */ }
}

function tzTime(tz: string, now: Date): string {
  return now.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

type MarketStatus = "OPEN" | "PRE" | "CLOSED";

function getMarketStatus(city: WorldCity, now: Date): MarketStatus {
  // Use formatToParts — avoids brittle regex on locale string output
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: city.tz, weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
    }).formatToParts(now).map(p => [p.type, p.value])
  );
  if (["Sat", "Sun"].includes(parts.weekday ?? "")) return "CLOSED";
  const h = parseInt(parts.hour ?? "0") % 24; // some impls emit "24" for midnight
  const m = parseInt(parts.minute ?? "0");
  const t = h * 60 + m;
  const [oh, om] = city.marketOpen.split(":").map(Number);
  const [ch, cm] = city.marketClose.split(":").map(Number);
  const openMin = oh * 60 + om;
  const closeMin = ch * 60 + cm;
  if (t >= openMin && t < closeMin) return "OPEN";
  if (t >= openMin - 60 && t < openMin) return "PRE"; // up to 1h pre-market
  return "CLOSED";
}

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return {
    local: now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    now,
  };
}

// ── World Clock hover component ──────────────────────────────────────────────

function ClockDisplay({ clock }: { clock: string; }) {
  const [hover, setHover] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0, vw: 0 });
  const [editing, setEditing] = useState(false);
  const [cities, setCities] = useState<WorldCity[]>(() => readWorldCities());
  const [addPreset, setAddPreset] = useState(TZ_PRESETS[0].tz);
  const now = new Date();

  const removeCity = (tz: string) => {
    const updated = cities.filter((c) => c.tz !== tz);
    setCities(updated);
    writeWorldCities(updated);
  };

  const addCity = () => {
    const preset = TZ_PRESETS.find((p) => p.tz === addPreset);
    if (!preset || cities.find((c) => c.tz === preset.tz)) return;
    const updated = [...cities, preset];
    setCities(updated);
    writeWorldCities(updated);
  };

  const resetToDefault = () => {
    setCities(DEFAULT_WORLD_CITIES);
    writeWorldCities(DEFAULT_WORLD_CITIES);
  };

  return (
    <>
      <span
        style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-muted)", letterSpacing: "0.08em", paddingRight: 16, borderRight: "1px solid var(--ft-border)", marginRight: 16, cursor: "default", userSelect: "none" }}
        onMouseEnter={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setPos({ x: rect.right, y: rect.bottom, vw: window.innerWidth });
          setHover(true);
        }}
        onMouseLeave={() => { if (!editing) setHover(false); }}
      >
        {clock}
      </span>

      {hover && createPortal(
        <div
          style={{ position: "fixed", right: pos.vw - pos.x, top: pos.y + 6, zIndex: 9999, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", minWidth: 300 }}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => { setHover(false); setEditing(false); }}
        >
          {/* Header */}
          <div style={{ padding: "7px 12px", borderBottom: "1px solid var(--ft-border)", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.12em", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span>WORLD CLOCK — MAJOR EXCHANGES</span>
            <button
              onClick={() => setEditing((e) => !e)}
              style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 8, color: editing ? "var(--ft-amber)" : "var(--ft-dim)", padding: "0 2px", letterSpacing: "0.06em" }}
            >{editing ? "DONE" : "EDIT"}</button>
          </div>

          {/* City rows */}
          {cities.map((city) => {
            const status = getMarketStatus(city, now);
            const t = tzTime(city.tz, now);
            const badgeColor = status === "OPEN" ? "var(--ft-green)" : status === "PRE" ? "var(--ft-amber)" : "var(--ft-dim)";
            const badgeBg   = status === "OPEN" ? "rgba(63,185,80,0.15)" : status === "PRE" ? "rgba(244,162,30,0.12)" : "rgba(255,255,255,0.05)";
            const badgeBdr  = status === "OPEN" ? "rgba(63,185,80,0.3)"  : status === "PRE" ? "rgba(244,162,30,0.3)"  : "var(--ft-border)";
            return (
              <div key={city.tz} style={{ display: "flex", alignItems: "center", padding: "6px 12px", borderBottom: "1px solid var(--ft-border)", gap: 8 }}>
                {editing && (
                  <button onClick={() => removeCity(city.tz)} title="Remove" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-red)", fontSize: 10, padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
                )}
                <span style={{ color: "var(--ft-dim)", flexShrink: 0 }}>
                  <CountryMark code={city.country} size={11} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--ft-text)" }}>{city.label}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)" }}>{city.exchange}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ft-text)", letterSpacing: "0.04em" }}>{t}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, padding: "1px 6px", background: badgeBg, color: badgeColor, border: `1px solid ${badgeBdr}` }}>
                    {status}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Edit controls */}
          {editing && (
            <div style={{ padding: "8px 12px", borderTop: "1px solid var(--ft-border)", display: "flex", gap: 6, flexWrap: "wrap" }}>
              <select
                value={addPreset}
                onChange={(e) => setAddPreset(e.target.value)}
                style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 9, background: "var(--ft-base)", border: "1px solid var(--ft-border)", color: "var(--ft-text)", padding: "4px 6px", outline: "none", minWidth: 120 }}
              >
                {TZ_PRESETS.filter((p) => !cities.find((c) => c.tz === p.tz)).map((p) => (
                  // Native <option> cannot carry SVG; strip the mark
                  // and prefix the country code textually so the
                  // dropdown still identifies the city without emoji.
                  <option key={p.tz} value={p.tz}>{p.country}  {p.label}</option>
                ))}
              </select>
              <button onClick={addCity} style={{ fontFamily: "var(--font-mono)", fontSize: 9, background: "var(--ft-accent)", border: "none", color: "var(--ft-base)", padding: "4px 10px", cursor: "pointer", fontWeight: 700 }}>+ ADD</button>
              <button onClick={resetToDefault} style={{ fontFamily: "var(--font-mono)", fontSize: 9, background: "none", border: "1px solid var(--ft-border)", color: "var(--ft-dim)", padding: "4px 10px", cursor: "pointer" }}>RESET</button>
            </div>
          )}

          {!editing && <div style={{ padding: "5px 12px", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.06em" }}>Market hours exclude public holidays · Hover EDIT to customise</div>}
        </div>,
        document.body,
      )}
    </>
  );
}

function NavRow({
  href, label, code, collapsed, active, Icon,
}: { href: string; label: string; code: string; collapsed: boolean; active: boolean; Icon?: React.ElementType }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Link href={href}>
      <button
        aria-label={label}
        aria-current={active ? "page" : undefined}
        title={collapsed ? label : code}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          width: "100%",
          padding: collapsed ? "3px 8px" : "3px 10px 3px 12px",
          justifyContent: collapsed ? "center" : "flex-start",
          border: "none",
          borderRadius: 0,
          background: hovered && !active ? "rgba(255,255,255,0.04)" : "transparent",
          cursor: "pointer",
          transition: "background 0.1s",
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        {/* Icon chip — shows icon if available, falls back to keyboard code */}
        <span style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 28,
          height: 26,
          borderRadius: 5,
          flexShrink: 0,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: "0.05em",
          background: active
            ? "rgba(244,162,30,0.15)"
            : "rgba(255,255,255,0.04)",
          color: active ? "var(--ft-accent)" : "var(--ft-dim)",
          border: active
            ? "1px solid rgba(244,162,30,0.3)"
            : "1px solid rgba(255,255,255,0.06)",
          boxShadow: "none",
          transition: "all 0.12s",
        }}>
          {Icon ? <Icon size={13} strokeWidth={active ? 2.5 : 1.75} /> : code}
        </span>

        {/* Label */}
        {!collapsed && (
          <span style={{
            fontSize: 12,
            fontWeight: active ? 600 : 400,
            color: active ? "var(--ft-text)" : "var(--ft-muted)",
            letterSpacing: "0.01em",
            transition: "color 0.1s",
          }}>
            {label}
          </span>
        )}

        {/* Active indicator dot */}
        {active && collapsed && (
          <span style={{
            position: "absolute",
            right: 6,
            width: 4,
            height: 4,
            borderRadius: "50%",
            background: "var(--ft-accent)",
          }} />
        )}
      </button>
    </Link>
  );
}

function SectionDivider({
  label, collapsed, onClick, isCollapsed,
}: {
  label: string; collapsed: boolean;
  onClick?: () => void; isCollapsed?: boolean;
}) {
  if (collapsed) {
    return (
      <div style={{
        margin: "10px 12px 4px",
        height: 1,
        background: "var(--ft-border)",
      }} />
    );
  }
  return (
    <div
      onClick={onClick}
      title={onClick ? (isCollapsed ? `Expand ${label}` : `Collapse ${label}`) : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 12px 3px 14px",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <span style={{
        fontSize: 9,
        fontFamily: "var(--font-mono)",
        letterSpacing: "0.14em",
        color: isCollapsed ? "var(--ft-muted)" : "var(--ft-dim)",
        fontWeight: 600,
        userSelect: "none",
        flexShrink: 0,
        transition: "color 0.12s",
      }}>
        {label}
      </span>
      <div style={{ flex: 1, height: "1px", background: "var(--ft-border)" }} />
      {onClick && (
        <ChevronRight size={8} style={{
          flexShrink: 0,
          color: isCollapsed ? "var(--ft-muted)" : "var(--ft-dim)",
          transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)",
          transition: "transform 0.15s, color 0.12s",
          opacity: 0.7,
        }} />
      )}
    </div>
  );
}

function formatTickerPrice(ticker: string, price: number): string {
  if (ticker.endsWith("=X")) return price.toFixed(4);
  if (ticker.startsWith("BTC") || ticker.startsWith("ETH")) {
    return new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(price);
  }
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(price);
}

function fmtLargeNum(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  return n.toLocaleString();
}

function LiveTickerBar() {
  const { tickers, update, add, remove, reset } = useTickers();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<{ ticker: string; label: string }[]>([]);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [tipTicker, setTipTicker] = useState<{ ticker: string; label: string; x: number; y: number } | null>(null);
  const tipTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tickerStr = tickers.map(t => t.ticker).filter(Boolean).join(",");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: quotes } = useGetMarketQuotes(
    { tickers: tickerStr || "^GSPC" },
    { query: { enabled: tickerStr.length > 0, refetchInterval: 60000 } } as any
  );

  const quoteMap = Object.fromEntries((quotes ?? []).map(q => [q.ticker, q]));

  function openEdit() {
    setDraft(tickers.map(t => ({ ...t })));
    setEditing(true);
  }

  function commitEdit() {
    draft.forEach((d, i) => {
      if (d.ticker.trim()) update(i, { ticker: d.ticker.trim().toUpperCase(), label: d.label.trim() || d.ticker.trim().toUpperCase() });
    });
    setEditing(false);
  }

  function showTip(slot: { ticker: string; label: string }, rect: DOMRect) {
    if (tipTimeout.current) clearTimeout(tipTimeout.current);
    setTipTicker({ ticker: slot.ticker, label: slot.label || slot.ticker, x: rect.left + rect.width / 2, y: rect.bottom });
  }

  function hideTip() {
    tipTimeout.current = setTimeout(() => setTipTicker(null), 120);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tipQ: any = tipTicker ? quoteMap[tipTicker.ticker] : null;
  const tipChg = tipQ?.changePercent as number | undefined;

  return (
    <>
    {/* Ticker hover card portal */}
    {tipTicker && tipQ && createPortal(
      <div
        style={{ position: "fixed", left: tipTicker.x, top: tipTicker.y + 6, transform: "translateX(-50%)", zIndex: 9999, background: "var(--ft-surface)", border: "1px solid var(--ft-border2)", boxShadow: "0 8px 28px rgba(0,0,0,0.6)", minWidth: 220 }}
        onMouseEnter={() => { if (tipTimeout.current) clearTimeout(tipTimeout.current); setTipTicker(tipTicker); }}
        onMouseLeave={() => setTipTicker(null)}
      >
        {/* Header */}
        <div style={{ padding: "7px 12px", borderBottom: "1px solid var(--ft-border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, color: "var(--ft-blue)", letterSpacing: "0.04em" }}>{tipTicker.ticker}</div>
            {tipQ.displayName && <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", marginTop: 1 }}>{tipQ.displayName}</div>}
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "var(--ft-text)" }}>{formatTickerPrice(tipTicker.ticker, tipQ.price)}</div>
            {tipChg != null && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: tipChg >= 0 ? "var(--ft-green)" : "var(--ft-red)", fontWeight: 600 }}>
                {tipChg >= 0 ? "▲" : "▼"} {Math.abs(tipChg).toFixed(2)}%
              </div>
            )}
          </div>
        </div>
        {/* Detail rows */}
        <div style={{ padding: "6px 0" }}>
          {[
            ["PREV CLOSE", tipQ.previousClose != null ? formatTickerPrice(tipTicker.ticker, tipQ.previousClose) : null],
            ["DAY RANGE", tipQ.dayLow != null && tipQ.dayHigh != null ? `${formatTickerPrice(tipTicker.ticker, tipQ.dayLow)} – ${formatTickerPrice(tipTicker.ticker, tipQ.dayHigh)}` : null],
            ["52W RANGE", tipQ.low52w != null && tipQ.high52w != null ? `${formatTickerPrice(tipTicker.ticker, tipQ.low52w)} – ${formatTickerPrice(tipTicker.ticker, tipQ.high52w)}` : null],
            ["VOLUME", tipQ.volume != null ? fmtLargeNum(tipQ.volume) : null],
            ["MKT CAP", tipQ.marketCap != null ? fmtLargeNum(tipQ.marketCap) : null],
            ["P/E", tipQ.pe != null ? `${tipQ.pe.toFixed(1)}×` : null],
          ].map(([label, val]) => val == null ? null : (
            <div key={label as string} style={{ display: "flex", justifyContent: "space-between", padding: "3px 12px", gap: 16 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.08em" }}>{label}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-muted)", fontWeight: 600 }}>{val}</span>
            </div>
          ))}
        </div>
      </div>,
      document.body,
    )}

    <div className="hidden lg:flex items-center" style={{ gap: 0, borderRight: "1px solid var(--ft-border)", paddingRight: 12, marginRight: 12, position: "relative" }}>
      {!editing ? (
        <>
          {tickers.map((slot, i) => {
            const q = quoteMap[slot.ticker];
            return (
              <div
                key={slot.ticker + i}
                onMouseEnter={(e) => showTip(slot, e.currentTarget.getBoundingClientRect())}
                onMouseLeave={hideTip}
                style={{
                  display: "flex", alignItems: "center", gap: 4,
                  padding: "4px 10px",
                  borderRight: i < tickers.length - 1 ? "1px solid var(--ft-border)" : "none",
                  fontFamily: "var(--font-mono)", fontSize: 10,
                  cursor: "default",
                }}>
                <span style={{ color: "var(--ft-dim)", letterSpacing: "0.04em" }}>{slot.label || slot.ticker}</span>
                {q ? (
                  <>
                    <span style={{ color: "var(--ft-text)", fontWeight: 600 }}>
                      {formatTickerPrice(slot.ticker, q.price)}
                    </span>
                    {(q as any).changePercent != null && (
                      <span style={{
                        color: (q as any).changePercent >= 0 ? "var(--ft-green)" : "var(--ft-red)",
                        fontSize: 9,
                      }}>
                        {(q as any).changePercent >= 0 ? "+" : ""}{((q as any).changePercent as number).toFixed(2)}%
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: "var(--ft-border2)" }}>—</span>
                )}
              </div>
            );
          })}
          {/* Edit button */}
          <button
            onClick={openEdit}
            title="Edit tickers"
            style={{
              background: "none", border: "none", cursor: "pointer",
              color: "var(--ft-dim)", padding: "4px 6px",
              fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1,
              transition: "color 0.1s",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-accent)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-dim)"; }}
          >
            <Pencil size={10} />
          </button>
        </>
      ) : (
        /* Edit mode */
        <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "0 4px" }}>
          {draft.map((d, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 2 }}>
              <input
                ref={el => { inputRefs.current[i * 2] = el; }}
                value={d.label}
                onChange={e => setDraft(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                placeholder="Label"
                style={{
                  width: 36, fontFamily: "var(--font-mono)", fontSize: 9,
                  background: "var(--ft-raised)", border: "1px solid var(--ft-accent)",
                  color: "var(--ft-text)", padding: "2px 4px", outline: "none",
                }}
              />
              <input
                ref={el => { inputRefs.current[i * 2 + 1] = el; }}
                value={d.ticker}
                onChange={e => setDraft(prev => prev.map((x, j) => j === i ? { ...x, ticker: e.target.value } : x))}
                placeholder="TICK"
                style={{
                  width: 52, fontFamily: "var(--font-mono)", fontSize: 9,
                  background: "var(--ft-raised)", border: "1px solid var(--ft-border2)",
                  color: "var(--ft-accent)", padding: "2px 4px", outline: "none",
                }}
                onKeyDown={e => e.key === "Enter" && commitEdit()}
              />
              <button
                onClick={() => { setDraft(prev => prev.filter((_, j) => j !== i)); remove(i); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-red)", fontFamily: "var(--font-mono)", fontSize: 10, padding: "0 2px", lineHeight: 1 }}
              >×</button>
            </div>
          ))}
          {draft.length < 8 && (
            <button
              onClick={() => { setDraft(prev => [...prev, { ticker: "", label: "" }]); add(); }}
              style={{ background: "none", border: "1px dashed var(--ft-border2)", cursor: "pointer", color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 6px" }}
            >
              +
            </button>
          )}
          <button
            onClick={commitEdit}
            style={{
              background: "var(--ft-accent)", border: "none", cursor: "pointer",
              color: "var(--ft-base)", fontFamily: "var(--font-mono)", fontSize: 9,
              padding: "3px 8px", marginLeft: 4,
            }}
          >
            OK
          </button>
          <button
            onClick={() => { reset(); setEditing(false); }}
            style={{
              background: "none", border: "1px solid var(--ft-border)", cursor: "pointer",
              color: "var(--ft-dim)", fontFamily: "var(--font-mono)", fontSize: 9, padding: "2px 6px",
            }}
          >
            Reset
          </button>
        </div>
      )}
    </div>
  </>
  );
}

interface SidebarConfigPanelProps {
  config: SidebarConfig;
  allItems: { href: string; label: string; code: string; section: string }[];
  collapsed: boolean;
  onClose: () => void;
  onChange: (next: SidebarConfig) => void;
}

function SidebarConfigPanel({ config, allItems, collapsed, onClose, onChange }: SidebarConfigPanelProps) {
  const itemMap = new Map<string, SidebarItemConfig>(config.items.map((c) => [c.href, c]));

  function getItem(href: string): SidebarItemConfig {
    return itemMap.get(href) ?? { href, visible: true, pinned: false };
  }

  function updateItem(href: string, patch: Partial<SidebarItemConfig>) {
    const next: SidebarConfig = {
      ...config,
      items: config.items.map((item) =>
        item.href === href ? { ...item, ...patch } : item
      ),
    };
    onChange(next);
  }

  function moveItem(href: string, dir: -1 | 1) {
    const items = [...config.items];
    const idx = items.findIndex((i) => i.href === href);
    if (idx === -1) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= items.length) return;
    const next = [...items];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    onChange({ ...config, items: next });
  }

  function resetToDefault() {
    onChange({
      items: allItems.map((item) => ({ href: item.href, visible: true, pinned: false })),
      pinnedFirst: true,
    });
  }

  if (collapsed) {
    return (
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 8,
        gap: 2,
        overflowY: "auto",
        scrollbarWidth: "none",
      }}>
        <div style={{
          fontSize: 8,
          fontFamily: "var(--font-mono)",
          color: "var(--ft-accent)",
          letterSpacing: "0.1em",
          marginBottom: 6,
          writingMode: "vertical-rl",
          transform: "rotate(180deg)",
        }}>CFG</div>
        {allItems.map((item) => {
          const c = getItem(item.href);
          return (
            <button
              key={item.href}
              title={`${item.label} — click to toggle visibility`}
              onClick={() => updateItem(item.href, { visible: !c.visible })}
              style={{
                width: 28,
                height: 26,
                background: c.visible
                  ? c.pinned ? "rgba(244,162,30,0.12)" : "rgba(255,255,255,0.04)"
                  : "transparent",
                border: c.visible
                  ? c.pinned ? "1px solid rgba(244,162,30,0.25)" : "1px solid var(--ft-border)"
                  : "1px dashed rgba(255,255,255,0.1)",
                borderRadius: 4,
                cursor: "pointer",
                color: c.visible ? (c.pinned ? "var(--ft-accent)" : "var(--ft-muted)") : "var(--ft-dim)",
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                opacity: c.visible ? 1 : 0.4,
                transition: "all 0.1s",
                flexShrink: 0,
                padding: 0,
              }}
            >
              {item.code.split("·")[1]}
            </button>
          );
        })}
        <button
          onClick={onClose}
          title="Done"
          style={{
            marginTop: 8,
            width: 28,
            height: 22,
            background: "var(--ft-accent)",
            border: "none",
            borderRadius: 4,
            cursor: "pointer",
            color: "var(--ft-base)",
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            fontWeight: 700,
          }}
        >OK</button>
      </div>
    );
  }

  // Section groups for configure panel — use config.items order so move up/down is reflected
  const allItemLookup = new Map(allItems.map(i => [i.href, i]));
  const orderedForConfig = config.items
    .map(c => allItemLookup.get(c.href))
    .filter((i): i is (typeof allItems)[0] => i != null);
  const sectionGroups: { label: string; items: typeof allItems }[] = [];
  for (const item of orderedForConfig) {
    const last = sectionGroups[sectionGroups.length - 1];
    if (last && last.label === item.section) {
      last.items.push(item);
    } else {
      sectionGroups.push({ label: item.section, items: [item] });
    }
  }

  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      overflowY: "auto",
      overflowX: "hidden",
      scrollbarWidth: "none",
    }}>
      {/* Header */}
      <div style={{
        padding: "8px 14px 6px",
        borderBottom: "1px solid var(--ft-border)",
        flexShrink: 0,
      }}>
        <div style={{
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.14em",
          color: "var(--ft-accent)",
          fontWeight: 700,
        }}>CONFIGURE NAV</div>
        <div style={{
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          color: "var(--ft-dim)",
          marginTop: 2,
          letterSpacing: "0.04em",
        }}>toggle visibility · ★ star to pin to top</div>
      </div>

      {/* Pinned-first toggle */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "6px 14px",
        borderBottom: "1px solid var(--ft-border)",
        flexShrink: 0,
      }}>
        <span style={{
          fontSize: 9,
          fontFamily: "var(--font-mono)",
          color: "var(--ft-muted)",
          letterSpacing: "0.06em",
        }}>★ STARRED ITEMS FIRST</span>
        <button
          onClick={() => onChange({ ...config, pinnedFirst: !config.pinnedFirst })}
          style={{
            width: 28,
            height: 14,
            borderRadius: 7,
            border: "none",
            cursor: "pointer",
            background: config.pinnedFirst ? "var(--ft-accent)" : "var(--ft-border2)",
            position: "relative",
            transition: "background 0.15s",
            flexShrink: 0,
            padding: 0,
          }}
          aria-label="Toggle pinned items first"
        >
          <span style={{
            position: "absolute",
            top: 2,
            left: config.pinnedFirst ? 16 : 2,
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: "var(--ft-base)",
            transition: "left 0.15s",
          }} />
        </button>
      </div>

      {/* Nav items — the outer sidebar column at :929 owns the vertical
          scroll for this whole subtree. This wrapper stays flex:1 so
          the header sibling at :933 doesn't get squeezed, but does NOT
          add its own overflowY:auto — that was a nested scroll inside
          the parent scroller and produced the "scroll stops, then
          continues" double-scroll bug when the nav content overran. */}
      <div style={{ flex: 1 }}>
        {sectionGroups.map((group, gi) => (
          <div key={`${group.label}-${gi}`}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 14px 3px",
            }}>
              <span style={{
                fontSize: 8,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.14em",
                color: "var(--ft-dim)",
                fontWeight: 600,
              }}>{group.label}</span>
              <div style={{ flex: 1, height: 1, background: "var(--ft-border)" }} />
            </div>
            {group.items.map((item) => {
              const c = getItem(item.href);
              return (
                <div
                  key={item.href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "0 10px 0 12px",
                    height: 28,
                    opacity: c.visible ? 1 : 0.4,
                    transition: "opacity 0.12s",
                  }}
                >
                  {/* Visibility toggle */}
                  <button
                    onClick={() => updateItem(item.href, { visible: !c.visible })}
                    title={c.visible ? "Hide from nav" : "Show in nav"}
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: 3,
                      border: `1px solid ${c.visible ? "var(--ft-border2)" : "var(--ft-border)"}`,
                      background: c.visible ? "var(--ft-raised)" : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      padding: 0,
                      transition: "all 0.1s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--ft-accent)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.borderColor = c.visible ? "var(--ft-border2)" : "var(--ft-border)"; }}
                  >
                    {c.visible && (
                      <Check size={8} color="var(--ft-green)" />
                    )}
                  </button>

                  {/* Code chip */}
                  <span style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    color: c.pinned ? "var(--ft-accent)" : "var(--ft-dim)",
                    letterSpacing: "0.04em",
                    flexShrink: 0,
                    width: 26,
                    textAlign: "center",
                  }}>{item.code}</span>

                  {/* Label */}
                  <span style={{
                    fontSize: 11,
                    fontFamily: "var(--font-mono)",
                    color: c.visible ? "var(--ft-text)" : "var(--ft-dim)",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    letterSpacing: "0.02em",
                  }}>{item.label}</span>

                  {/* Star (pin) toggle */}
                  <button
                    onClick={() => updateItem(item.href, { pinned: !c.pinned, visible: c.pinned ? c.visible : true })}
                    title={c.pinned ? "Unstar (unpin)" : "Star — pin to top"}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: c.pinned ? "var(--ft-amber)" : "var(--ft-dim)",
                      fontSize: 13,
                      lineHeight: 1,
                      padding: "0 2px",
                      flexShrink: 0,
                      transition: "color 0.1s",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = "var(--ft-amber)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = c.pinned ? "var(--ft-amber)" : "var(--ft-dim)"; }}
                  >
                    {c.pinned ? "★" : "☆"}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Footer actions */}
      <div style={{
        borderTop: "1px solid var(--ft-border)",
        padding: "6px 12px",
        display: "flex",
        gap: 6,
        flexShrink: 0,
      }}>
        <button
          onClick={resetToDefault}
          style={{
            flex: 1,
            background: "none",
            border: "1px solid var(--ft-border)",
            color: "var(--ft-dim)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            padding: "4px 0",
            letterSpacing: "0.06em",
            transition: "all 0.1s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--ft-text)";
            e.currentTarget.style.borderColor = "var(--ft-border2)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--ft-dim)";
            e.currentTarget.style.borderColor = "var(--ft-border)";
          }}
        >RESET</button>
        <button
          onClick={onClose}
          style={{
            flex: 1,
            background: "var(--ft-accent)",
            border: "none",
            color: "var(--ft-base)",
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            fontWeight: 700,
            padding: "4px 0",
            letterSpacing: "0.06em",
            transition: "opacity 0.1s",
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.85"; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
        >DONE</button>
      </div>
    </div>
  );
}

export function Layout({ children }: LayoutProps) {
  const [location, navigate] = useLocation();
  const { theme } = useFintrackTheme();
  const { local: clock } = useClock();
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const { open: cmdOpen, closePalette } = useCommandPalette();
  const { open: qaOpen, openQuickAdd, close: qaClose } = useQuickAdd();
  const { open: searchOpen, openSearch, closeSearch } = useGlobalSearch();
  const { open: shortcutsOpen, openShortcuts, closeShortcuts } = useKeyboardShortcuts();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const current = localStorage.getItem("ft-sidebar");
      if (current !== null) return current === "collapsed";
      return localStorage.getItem("nr-sidebar-collapsed-default") === "true";
    } catch { return false; }
  });
  const [moreOpen, setMoreOpen] = useState(() => {
    try { return localStorage.getItem("nr-sidebar-more") === "1"; } catch { return false; }
  });
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
    try {
      const r = localStorage.getItem("nr-sidebar-collapsed-sections");
      return r ? new Set<string>(JSON.parse(r)) : new Set<string>();
    } catch { return new Set<string>(); }
  });
  const toggleSection = useCallback((label: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      try { localStorage.setItem("nr-sidebar-collapsed-sections", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);
  const [showNwStrip] = useState(() => {
    try { return localStorage.getItem("nr-show-nw-strip") !== "false"; } catch { return true; }
  });
  const [configuring, setConfiguring] = useState(false);
  const { privacy, togglePrivacy } = usePrivacy();
  const [sidebarConfig, setSidebarConfig] = useState<SidebarConfig>(() =>
    loadSidebarConfig(ALL_NAV_ITEMS)
  );
  useEffect(() => {
    const handler = () => setSidebarConfig(loadSidebarConfig(ALL_NAV_ITEMS));
    window.addEventListener("nr-sidebar-config-update", handler);
    return () => window.removeEventListener("nr-sidebar-config-update", handler);
  }, []);
  // Re-render on nr-persona-update as well as nr-sidebar-config-update
  // so a persona flip (from server hydration or another tab) rebuilds
  // the badges immediately. Prior code only listened for
  // nr-sidebar-config-update, which fires from the SAME applyPersonas
  // call — but not when persona changes via a non-applyPersonas path.
  const activePersonaId = useActivePersona();
  const activePersonas = useMemo(
    () => PERSONAS.filter((p) => loadPersonaIds().includes(p.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activePersonaId],
  );
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const s = localStorage.getItem("ft-sidebar-width");
      return s ? Math.max(160, Math.min(360, Number(s))) : 212;
    } catch { return 212; }
  });
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHovered, setResizeHovered] = useState(false);
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const { data: dashboardData } = useGetDashboard();
  const { data: currencyData } = useGetSettingsCurrency();
  useEffect(() => {
    if (currencyData?.baseCurrency) setBaseCurrency(currencyData.baseCurrency);
  }, [currencyData?.baseCurrency]);
  const pendingGRef = useRef(false);
  const { overlay: eggOverlay, clearOverlay, logoRef } = useEasterEggs();

  const [notifOpen, setNotifOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 768);
  const [bottomMoreOpen, setBottomMoreOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setCollapsed(true);
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const refreshAll = useCallback(async () => {
    await queryClient.invalidateQueries();
  }, [queryClient]);
  const { pullY, isRefreshing, touchHandlers: pullHandlers } = usePullToRefresh(refreshAll);
  const isOnline = useNetworkStatus();
  useAppResume(refreshAll);
  const { dismiss: dismissKeyboard } = useKeyboard();

  const allAlerts = useAlerts();
  const unreadCount = useMemo(() => {
    const dismissed = loadDismissed();
    return allAlerts.filter((a) => !dismissed.includes(a.id)).length;
  }, [allAlerts]);

  const toggleSidebar = useCallback(() => {
    setCollapsed(c => {
      const next = !c;
      try { localStorage.setItem("ft-sidebar", next ? "collapsed" : "expanded"); } catch {}
      return next;
    });
  }, []);

  const handleResizeStart = useCallback((e: React.PointerEvent) => {
    if (collapsed) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidthRef.current;
    setIsResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: PointerEvent) => {
      const next = Math.max(160, Math.min(360, startW + ev.clientX - startX));
      setSidebarWidth(next);
      sidebarWidthRef.current = next;
    };
    const onUp = () => {
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try { localStorage.setItem("ft-sidebar-width", String(sidebarWidthRef.current)); } catch {}
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditable = target.tagName === "INPUT" || target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" || target.isContentEditable;
      if (isEditable) return;

      if (e.key === "[" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); toggleSidebar(); return; }

      if (e.key === "?" && !e.metaKey && !e.ctrlKey && !pendingGRef.current) {
        e.preventDefault();
        openShortcuts();
        return;
      }

      if (e.key.toLowerCase() === "a" && !e.metaKey && !e.ctrlKey && !e.altKey && !pendingGRef.current) {
        e.preventDefault();
        setNotifOpen(v => !v);
        return;
      }

      if (e.key === "Escape") { closeShortcuts(); return; }

      // G+key navigation: press G, then D/A/T/U/O/I/S/P within 1.5s
      if (e.key.toLowerCase() === "g" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        pendingGRef.current = true;
        setTimeout(() => { pendingGRef.current = false; }, 1500);
        return;
      }

      if (pendingGRef.current) {
        const path = G_KEY_MAP[e.key.toLowerCase()];
        if (path !== undefined) {
          e.preventDefault();
          pendingGRef.current = false;
          navigate(path);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleSidebar, navigate, openShortcuts, closeShortcuts]);

  useEffect(() => {
    document.body.classList.toggle("dark", theme !== "arctic");
  }, [theme]);

  const userInitial = session?.user?.name?.[0]?.toUpperCase() ?? session?.user?.email?.[0]?.toUpperCase() ?? "U";
  const userName = session?.user?.name ?? "User";
  const userEmail = session?.user?.email ?? "";

  const handleSignOut = async () => {
    await authClient.signOut();
    queryClient.clear();
  };

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location.startsWith(href);

  const allItems = NAV_SECTIONS.flatMap(s => s.items).concat(BOTTOM_ITEMS);
  const UNLISTED_LABELS: Record<string, string> = {
    "/fire": "FIRE", "/mortgage": "Mortgage", "/pension": "Pension",
    "/wardrobe": "Wardrobe", "/year-review": "Year Review",
    "/whatif": "What If", "/portfolio": "Portfolio",
    "/upcoming": "Upcoming", "/net-worth-history": "Net Worth",
    "/trading-journal": "Trading", "/family-finance": "Family",
    "/subscriptions": "Subscriptions", "/recurring": "Recurring",
    "/briefing": "Briefing", "/cashflow": "Cash Flow",
    "/reports": "Reports", "/projection": "Projection",
    "/decisions": "Decisions", "/ai-coach": "AI Coach",
    "/net-worth": "Net Worth",
  };
  const activePage = allItems.find(i => isActive(i.href))?.label
    ?? Object.entries(UNLISTED_LABELS).find(([href]) => isActive(href))?.[1]
    ?? "Dashboard";

  const sidebarW = collapsed ? 54 : sidebarWidth;
  const effectiveCollapsed = collapsed;

  return (
    <>
    <CommandPalette open={cmdOpen} onClose={closePalette} onNewTransaction={openQuickAdd} onToggleAlerts={() => setNotifOpen(v => !v)} onToggleSidebar={toggleSidebar} />
    <QuickAddTransaction open={qaOpen} onClose={qaClose} />
    <GlobalSearch open={searchOpen} onClose={closeSearch} />
    <KeyboardShortcuts open={shortcutsOpen} onClose={closeShortcuts} />
    <div
      className="flex h-[100dvh] overflow-hidden"
      style={{ background: "var(--ft-base)", color: "var(--ft-text)", fontFamily: "var(--font-body, var(--font-sans))" }}
    >
      <ThemeEffects />

      {/* ══ Sidebar — desktop only; mobile uses bottom nav ══ */}
      {!isMobile && (
      <aside
        className="ft-sidebar"
        style={{
          width: sidebarW,
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          background: "var(--ft-surface)",
          borderRight: "1px solid var(--ft-border)",
          transition: isResizing ? "none" : "width 0.12s ease",
          overflow: "hidden",
          position: "relative",
          zIndex: 10,
        }}
      >
        {/* Left accent rail */}
        <div style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: 3,
          background: "var(--ft-accent)",
          opacity: 0.7,
        }} />

        {/* Resize handle — right edge drag zone */}
        {!collapsed && (
          <div
            onPointerDown={handleResizeStart}
            onMouseEnter={() => setResizeHovered(true)}
            onMouseLeave={() => setResizeHovered(false)}
            title="Drag to resize"
            style={{
              position: "absolute",
              right: 0,
              top: 0,
              bottom: 0,
              width: 6,
              cursor: "col-resize",
              zIndex: 20,
              background: isResizing
                ? "var(--ft-accent)"
                : resizeHovered
                ? "var(--ft-accent)"
                : "transparent",
              opacity: isResizing ? 0.5 : resizeHovered ? 0.35 : 0,
              transition: "opacity 0.12s",
            }}
          />
        )}

        {/* Brand */}
        <div
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            paddingLeft: effectiveCollapsed ? 0 : 16,
            paddingRight: 10,
            justifyContent: effectiveCollapsed ? "center" : "space-between",
            borderBottom: "1px solid var(--ft-border)",
            flexShrink: 0,
            cursor: "default",
          }}
        >
          {effectiveCollapsed ? (
            <LogoMark />
          ) : (
            <Logo />
          )}
        </div>

        {/* Persona indicator strip — shown only when sidebar is not collapsed and persona(s) are set */}
        {!collapsed && activePersonas.length > 0 && (() => {
          const primary = activePersonas[0];
          const color = PERSONA_COLORS[primary.id] ?? "var(--ft-accent)";
          const glyph = PERSONA_GLYPHS[primary.id] ?? "·";
          return (
            <Link href="/settings?panel=terminal-profile">
              <div
                style={{
                  padding: "5px 14px 5px",
                  borderBottom: "1px solid var(--ft-border)",
                  borderLeft: `2px solid ${color}`,
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  flexShrink: 0,
                  cursor: "pointer",
                  transition: "background 0.12s",
                  background: `${color}08`,
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = `${color}14`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = `${color}08`; }}
                title="Change terminal profile"
              >
                <span style={{ fontSize: 11, color, lineHeight: 1, flexShrink: 0 }}>{glyph}</span>
                <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.12em", color, fontWeight: 700, padding: "1px 4px", border: `1px solid ${color}55`, whiteSpace: "nowrap" }}>
                      {primary.code}
                    </span>
                    {activePersonas.length > 1 && activePersonas.slice(1).map(p => (
                      <span key={p.id} style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.1em", color: "var(--ft-dim)", padding: "1px 3px", border: "1px solid var(--ft-border)", whiteSpace: "nowrap" }}>
                        +{p.code.split("·")[0]}
                      </span>
                    ))}
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-dim)", letterSpacing: "0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>
                    {primary.label}
                  </span>
                </div>
              </div>
            </Link>
          );
        })()}

        {/* Nav or Configure Panel */}
        {configuring ? (
          <SidebarConfigPanel
            config={sidebarConfig}
            allItems={ALL_NAV_ITEMS}
            collapsed={effectiveCollapsed}
            onClose={() => setConfiguring(false)}
            onChange={(next) => {
              setSidebarConfig(next);
              saveSidebarConfig(next);
            }}
          />
        ) : (
          <nav style={{ flex: 1, overflowY: "auto", overflowX: "hidden", paddingTop: 8, paddingBottom: 4, scrollbarWidth: "none" }}>
            {(() => {
              const configMap = new Map<string, SidebarItemConfig>(
                sidebarConfig.items.map((c) => [c.href, c])
              );

              const pinnedItems = sidebarConfig.pinnedFirst
                ? ALL_NAV_ITEMS.filter((item) => configMap.get(item.href)?.pinned && configMap.get(item.href)?.visible !== false)
                : [];

              // Build sections from config.items order so reordering is reflected in nav
              const allNavLookup = new Map(ALL_NAV_ITEMS.map(i => [i.href, i]));
              const orderedNavItems = sidebarConfig.items
                .filter(c => {
                  if (c.visible === false) return false;
                  if (sidebarConfig.pinnedFirst && c.pinned) return false;
                  if (!moreOpen && SECONDARY_HREFS.has(c.href)) return false;
                  return true;
                })
                .map(c => allNavLookup.get(c.href))
                .filter((i): i is (typeof ALL_NAV_ITEMS)[0] => i != null);
              const filteredSections: { label: string; items: typeof ALL_NAV_ITEMS }[] = [];
              for (const item of orderedNavItems) {
                const last = filteredSections[filteredSections.length - 1];
                if (last && last.label === item.section) {
                  last.items.push(item);
                } else {
                  filteredSections.push({ label: item.section, items: [item] });
                }
              }

              return (
                <>
                  {/* Pinned section */}
                  {pinnedItems.length > 0 && (
                    <div>
                      {!effectiveCollapsed && (
                        <div style={{ padding: "0 12px 3px 14px" }}>
                          <span style={{ fontSize: 9, fontFamily: "var(--font-mono)", letterSpacing: "0.14em", color: "var(--ft-accent)", fontWeight: 700, opacity: 0.8 }}>
                            PINNED
                          </span>
                        </div>
                      )}
                      {effectiveCollapsed && <div style={{ height: 4 }} />}
                      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {pinnedItems.map((item) => (
                          <NavRow
                            key={item.href + "-pinned"}
                            href={item.href}
                            label={item.label}
                            code={item.code}
                            collapsed={effectiveCollapsed}
                            active={isActive(item.href)}
                            Icon={HREF_ICON_MAP[item.href]}
                          />
                        ))}
                      </div>
                      <div style={{ margin: "6px 12px 2px", height: 1, background: "rgba(244,162,30,0.2)" }} />
                    </div>
                  )}

                  {/* Regular sections */}
                  {filteredSections.map((section, i) => {
                    const hasActiveInSection = section.items.some(item => isActive(item.href));
                    const isSectionCollapsed = !effectiveCollapsed && collapsedSections.has(section.label) && !hasActiveInSection;
                    return (
                    <div key={`${section.label}-${i}`}>
                      <SectionDivider
                        label={section.label}
                        collapsed={effectiveCollapsed}
                        onClick={!effectiveCollapsed ? () => toggleSection(section.label) : undefined}
                        isCollapsed={isSectionCollapsed}
                      />
                      {!isSectionCollapsed && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          {section.items.map((item) => (
                            <NavRow
                              key={item.href}
                              href={item.href}
                              label={item.label}
                              code={item.code}
                              collapsed={effectiveCollapsed}
                              active={isActive(item.href)}
                              Icon={HREF_ICON_MAP[item.href]}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}

                  {/* More / Less toggle */}
                  <div style={{ margin: effectiveCollapsed ? "8px 10px 4px" : "6px 12px 4px" }}>
                    <button
                      onClick={() => {
                        const next = !moreOpen;
                        setMoreOpen(next);
                        try { localStorage.setItem("nr-sidebar-more", next ? "1" : "0"); } catch {}
                      }}
                      style={{
                        width: "100%",
                        background: "none",
                        border: `1px dashed ${moreOpen ? "var(--ft-border2)" : "var(--ft-border)"}`,
                        borderRadius: 4,
                        cursor: "pointer",
                        color: moreOpen ? "var(--ft-muted)" : "var(--ft-dim)",
                        fontFamily: "var(--font-mono)",
                        fontSize: effectiveCollapsed ? 8 : 9,
                        letterSpacing: "0.08em",
                        padding: effectiveCollapsed ? "4px 0" : "3px 8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: effectiveCollapsed ? "center" : "space-between",
                        gap: 4,
                        transition: "all 0.1s",
                      }}
                      title={moreOpen ? "Show less" : "Show more"}
                      onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-text)"; e.currentTarget.style.borderColor = "var(--ft-accent)"; }}
                      onMouseLeave={e => { e.currentTarget.style.color = moreOpen ? "var(--ft-muted)" : "var(--ft-dim)"; e.currentTarget.style.borderColor = moreOpen ? "var(--ft-border2)" : "var(--ft-border)"; }}
                    >
                      {effectiveCollapsed ? (
                        moreOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />
                      ) : (
                        <>
                          <span>{moreOpen ? "LESS" : "MORE"}</span>
                          {moreOpen ? <ChevronUp size={9} /> : <ChevronDown size={9} />}
                        </>
                      )}
                    </button>
                  </div>
                </>
              );
            })()}
          </nav>
        )}

        {/* Configure sidebar gear button */}
        <div style={{ borderTop: "1px solid var(--ft-border)", flexShrink: 0 }}>
          <button
            onClick={() => setConfiguring((c) => !c)}
            title="Configure sidebar"
            aria-label="Configure sidebar"
            style={{
              width: "100%",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: configuring ? "var(--ft-accent)" : "var(--ft-dim)",
              fontFamily: "var(--font-mono)",
              fontSize: effectiveCollapsed ? 13 : 9,
              letterSpacing: "0.06em",
              padding: "5px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: effectiveCollapsed ? "center" : "flex-start",
              gap: 6,
              paddingLeft: effectiveCollapsed ? 0 : 14,
              transition: "color 0.1s, background 0.1s",
            }}
            onMouseEnter={(e) => {
              if (!configuring) {
                e.currentTarget.style.color = "var(--ft-text)";
                e.currentTarget.style.background = "rgba(255,255,255,0.03)";
              }
            }}
            onMouseLeave={(e) => {
              if (!configuring) {
                e.currentTarget.style.color = "var(--ft-dim)";
                e.currentTarget.style.background = "none";
              }
            }}
          >
            <Settings2 size={11} />
            {!effectiveCollapsed && <span>CONFIGURE NAV</span>}
          </button>
        </div>

        {/* Year Review seasonal banner — Dec/Jan only */}
        {(() => {
          const m = new Date().getMonth(); // 0-indexed: 11=Dec, 0=Jan
          if (effectiveCollapsed || (m !== 11 && m !== 0)) return null;
          const year = m === 11 ? new Date().getFullYear() : new Date().getFullYear() - 1;
          return (
            <Link href="/year-review">
              <div style={{ margin: "0 8px 6px", padding: "8px 10px", background: "var(--ft-surface)", border: "1px solid rgba(163,113,247,0.3)", borderTop: "2px solid var(--ft-accent)", cursor: "pointer", transition: "border-color 0.15s" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(163,113,247,0.6)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = "rgba(163,113,247,0.3)"; }}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--ft-accent)", letterSpacing: "0.06em", marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M5 1v4M5 1L2.5 3.5M5 1L7.5 3.5M1 7.5h8" /><path d="M2 7.5c0 1.1.9 2 2 2h2a2 2 0 002-2" opacity=".5"/></svg>
                  {year} YEAR IN REVIEW
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--ft-muted)", lineHeight: 1.4 }}>Your annual financial recap is ready</div>
              </div>
            </Link>
          );
        })()}

        {/* Bottom: settings / profile */}
        <div style={{ borderTop: "1px solid var(--ft-border)", paddingTop: 6, flexShrink: 0 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {BOTTOM_ITEMS.map(item => (
              <NavRow
                key={item.href}
                href={item.href}
                label={item.label}
                code={item.code}
                collapsed={effectiveCollapsed}
                active={isActive(item.href)}
                Icon={HREF_ICON_MAP[item.href]}
              />
            ))}
          </div>

          {/* User card — click navigates to profile */}
          <div
            onClick={() => navigate("/profile")}
            title="View profile"
            style={{
              margin: "8px 8px 6px",
              padding: effectiveCollapsed ? "6px 4px" : "8px 10px",
              borderRadius: 7,
              background: "var(--ft-raised)",
              border: "1px solid var(--ft-border)",
              display: "flex",
              alignItems: "center",
              gap: 9,
              justifyContent: effectiveCollapsed ? "center" : "flex-start",
              cursor: "pointer",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--ft-border2)")}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--ft-border)")}
          >
            {/* Avatar with status ring */}
            <div style={{ position: "relative", flexShrink: 0 }}>
              {session?.user?.image ? (
                <img
                  src={session.user.image}
                  alt="Profile"
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    objectFit: "cover",
                    display: "block",
                    boxShadow: "0 0 0 2px var(--ft-raised), 0 0 0 3px var(--ft-border2)",
                  }}
                />
              ) : (
              <div style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                background: "var(--ft-accent)",
                color: "var(--ft-base)",
                fontSize: 11,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-head)",
                boxShadow: "0 0 0 2px var(--ft-raised), 0 0 0 3px var(--ft-border2)",
              }}>
                {userInitial}
              </div>
              )}
              {/* Online dot */}
              <span className="ft-live-dot" style={{
                position: "absolute",
                bottom: 0,
                right: 0,
                width: 7,
                height: 7,
                boxShadow: "0 0 0 1.5px var(--ft-raised)",
              }} />
            </div>

            {!effectiveCollapsed && (
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: "var(--ft-text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {userName}
                </div>
                <div style={{ fontSize: 9, color: "var(--ft-dim)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {userEmail}
                </div>
              </div>
            )}
          </div>

          {/* Net worth strip */}
          {dashboardData && showNwStrip && (
            <div style={{
              borderTop: "1px solid var(--ft-border)",
              padding: effectiveCollapsed ? "5px 0" : "5px 12px",
              display: "flex",
              alignItems: "center",
              justifyContent: effectiveCollapsed ? "center" : "space-between",
              gap: 4,
              fontFamily: "var(--font-mono)",
            }}>
              {effectiveCollapsed ? (
                <PrivNum style={{ fontSize: 9, color: "var(--ft-accent)", fontWeight: 700, letterSpacing: "0.02em" }}>
                  {formatGbp(dashboardData.netWorth)}
                </PrivNum>
              ) : (
                <>
                  <span style={{ fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.1em" }}>NET WORTH</span>
                  <PrivNum style={{ fontSize: 10, color: "var(--ft-text)", fontWeight: 700 }}>
                    {formatGbp(dashboardData.netWorth)}
                  </PrivNum>
                </>
              )}
            </div>
          )}

          {/* Collapse toggle — desktop only, hidden on mobile via CSS */}
          <button
            className="ft-sidebar-collapse-btn"
            onClick={toggleSidebar}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title="⌘["
            style={{
              width: "100%",
              background: "none",
              border: "none",
              borderTop: "1px solid var(--ft-border)",
              color: "var(--ft-dim)",
              cursor: "pointer",
              padding: "5px 0",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              letterSpacing: "0.06em",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-text)"; e.currentTarget.style.background = "rgba(255,255,255,0.03)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-dim)"; e.currentTarget.style.background = "none"; }}
          >
            {collapsed ? <ChevronsRight size={10} /> : <ChevronsLeft size={10} />}
            {!collapsed && <span style={{ fontSize: 9 }}>⌘[</span>}
          </button>
        </div>
      </aside>
      )}

      {/* ══ Right panel ══ */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>

        {/* Top bar */}
        <header className="ft-header" style={{
          height: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          background: "var(--ft-surface)",
          borderBottom: "1px solid var(--ft-border)",
          flexShrink: 0,
          gap: 16,
        }}>
          {/* Brand + breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {isMobile ? (
              /* Mobile: LogoMark + section breadcrumb */
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div ref={logoRef} data-logo style={{ display: "flex", alignItems: "center", marginRight: 2 }}>
                  <LogoMark />
                </div>
                {(() => {
                  const section = HREF_SECTION_MAP[location] ?? Object.entries(HREF_SECTION_MAP).find(([h]) => location.startsWith(h) && h !== "/")?.[1];
                  return section && section !== "CORE" ? (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", letterSpacing: "0.1em" }}>
                      {section} ›
                    </span>
                  ) : null;
                })()}
              </div>
            ) : (
              <>
                <span className="ft-header-brand" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--ft-dim)", letterSpacing: "0.1em" }}>
                  NUMERIS
                </span>
                <span className="ft-header-brand" style={{ color: "var(--ft-border2)", fontSize: 12 }}>›</span>
              </>
            )}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--ft-text)", letterSpacing: "0.06em" }}>
              {activePage.toUpperCase()}
            </span>
          </div>

          {/* Right side — ticker shrinks first, essential buttons never disappear */}
          <div style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 1, minWidth: 0 }}>

            {/* Ticker — isolated so it's the only thing that compresses; hidden on mobile via CSS */}
            <div className="ft-header-ticker-strip" style={{ flexShrink: 1, minWidth: 0, overflow: "hidden", borderRight: "1px solid var(--ft-border)", marginRight: 12 }}>
              <LiveTickerBar />
            </div>

            {/* Essential buttons — flex-shrink: 0 so they're always visible */}
            <div style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>

            {/* Clock with world timezone hover — hidden on mobile to reclaim header space */}
            {!isMobile && <ClockDisplay clock={clock} />}

            {/* PWA install prompt — hidden on mobile (home screen install prompt is native) */}
            {!isMobile && <PWAInstallButton />}

            {/* Notifications bell */}
            <div style={{ position: "relative", marginRight: 10 }}>
              <button
                type="button"
                onClick={() => setNotifOpen((o) => !o)}
                title="Alerts"
                style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  padding: "4px 9px",
                  background: notifOpen ? "rgba(244,162,30,0.08)" : "var(--ft-raised)",
                  border: `1px solid ${notifOpen ? "var(--ft-amber)" : "var(--ft-border)"}`,
                  color: notifOpen ? "var(--ft-amber)" : "var(--ft-muted)",
                  cursor: "pointer", borderRadius: 4,
                  transition: "all 0.1s",
                }}
                onMouseEnter={(e) => {
                  if (!notifOpen) {
                    e.currentTarget.style.color = "var(--ft-text)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!notifOpen) {
                    e.currentTarget.style.color = "var(--ft-muted)";
                    e.currentTarget.style.background = "var(--ft-raised)";
                  }
                }}
              >
                <Bell size={13} />
              </button>
              {unreadCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: 3,
                    right: 3,
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "var(--ft-amber)",
                    pointerEvents: "none",
                  }}
                />
              )}
            </div>

            {/* Global search button */}
            <button
              className="ft-header-search-btn"
              onClick={openSearch}
              title="Search (⌘K)"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border)",
                color: "var(--ft-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                padding: "4px 10px",
                borderRadius: 4,
                letterSpacing: "0.06em",
                marginRight: 10,
                transition: "all 0.1s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.color = "var(--ft-text)";
                e.currentTarget.style.borderColor = "var(--ft-border2)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = "var(--ft-muted)";
                e.currentTarget.style.borderColor = "var(--ft-border)";
              }}
            >
              <Search size={12} />
              <span>SEARCH</span>
              <span style={{ color: "var(--ft-dim)", fontSize: 9, borderLeft: "1px solid var(--ft-border)", paddingLeft: 6 }}>⌘K</span>
            </button>

            {/* Privacy toggle */}
            <button
              onClick={togglePrivacy}
              title={privacy ? "Show numbers" : "Hide numbers"}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: "4px 9px",
                background: privacy ? "rgba(244,162,30,0.12)" : "var(--ft-raised)",
                border: `1px solid ${privacy ? "var(--ft-accent)" : "var(--ft-border)"}`,
                color: privacy ? "var(--ft-accent)" : "var(--ft-muted)",
                cursor: "pointer", borderRadius: 4, marginRight: 8,
                transition: "all 0.1s",
              }}
            >
              {privacy ? <EyeOff size={13} /> : <Eye size={13} />}
            </button>

            {/* Sign out — hidden on mobile (accessible via sidebar profile) */}
            <button
              className="ft-header-sign-out"
              onClick={handleSignOut}
              style={{
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border)",
                color: "var(--ft-muted)",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                padding: "4px 10px",
                borderRadius: 4,
                letterSpacing: "0.08em",
                transition: "all 0.1s",
              }}
              onMouseEnter={e => { e.currentTarget.style.color = "var(--ft-red)"; e.currentTarget.style.borderColor = "var(--ft-red)"; }}
              onMouseLeave={e => { e.currentTarget.style.color = "var(--ft-muted)"; e.currentTarget.style.borderColor = "var(--ft-border)"; }}
            >
              SIGN OUT
            </button>

            </div>{/* end essential buttons */}
          </div>{/* end right side */}
        </header>

        {/* Offline banner — mobile only, shows when no network */}
        {isMobile && !isOnline && (
          <div
            style={{
              background: "var(--ft-red)",
              color: "#fff",
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              textAlign: "center",
              padding: "6px 12px",
              zIndex: 60,
            }}
          >
            ● NO CONNECTION — DATA MAY BE STALE
          </div>
        )}

        {/* Main */}
        <main
          className="ft-main"
          style={{ flex: 1, overflowY: "auto", overflowX: "hidden", background: "var(--ft-base)", position: "relative" }}
          {...(isMobile ? pullHandlers : {})}
          onScroll={isMobile ? dismissKeyboard : undefined}
        >
          {/* Pull-to-refresh indicator — mobile only */}
          {isMobile && (pullY > 0 || isRefreshing) && (
            <div
              style={{
                position: "sticky",
                top: 0,
                zIndex: 30,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: pullY > 0 ? pullY : isRefreshing ? 36 : 0,
                overflow: "hidden",
                background: "var(--ft-surface)",
                borderBottom: "1px solid var(--ft-border)",
                transition: isRefreshing ? "none" : "height 0.15s ease",
              }}
            >
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  color: pullY >= 60 || isRefreshing ? "var(--ft-accent)" : "var(--ft-dim)",
                  textTransform: "uppercase",
                }}
              >
                {isRefreshing ? "REFRESHING…" : pullY >= 60 ? "RELEASE TO REFRESH" : "PULL TO REFRESH"}
              </span>
            </div>
          )}
          <div
            className="ft-main-inner"
            style={{
              padding: "20px 24px 32px",
              transform: isMobile && pullY > 0 ? `translateY(${pullY * 0.3}px)` : undefined,
              transition: isMobile && pullY === 0 ? "transform 0.15s ease" : undefined,
            }}
          >
            {children}
          </div>
        </main>

        {/* Status strip */}
        <footer style={{
          height: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 20px",
          background: "var(--ft-raised)",
          borderTop: "1px solid var(--ft-border)",
          fontFamily: "var(--font-mono)",
          fontSize: 9,
          color: "var(--ft-dim)",
          flexShrink: 0,
          letterSpacing: "0.06em",
          gap: 12,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span className="ft-live-dot" />
              <span style={{ color: "var(--ft-green)" }}>CONNECTED</span>
            </span>
            <span style={{ color: "var(--ft-border2)" }}>│</span>
            <span>RAILWAY · TLS 1.3</span>
            <span style={{ color: "var(--ft-border2)" }}>│</span>
            <span>{userEmail}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span>⌘[ SIDEBAR</span>
            <span style={{ color: "var(--ft-border2)" }}>│</span>
            <span>/ COMMAND</span>
            <span style={{ color: "var(--ft-border2)" }}>│</span>
            <span>financetracker.work</span>
          </div>
        </footer>
      </div>
    </div>
    <NotificationsPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
    <EasterEggRenderer overlay={eggOverlay} clearOverlay={clearOverlay} />
    {!isMobile && <AiAgent sidebarW={sidebarW} />}
    {/* Mobile FAB — floating quick-add button */}
    <MobileFab />
    {/* Mobile bottom navigation — only shows on small screens via CSS */}
    <MobileBottomNav moreOpen={bottomMoreOpen} setMoreOpen={setBottomMoreOpen} onOpenMore={() => {}} />
    </>
  );
}

const MORE_SECTIONS = [
  {
    label: "ANALYZE",
    items: [
      { href: "/analytics",      label: "Analytics",     Icon: LineChart,   desc: "Spending insights" },
      { href: "/net-worth",      label: "Net Worth",     Icon: TrendingUp,  desc: "Total wealth view" },
      { href: "/tax",            label: "Tax",           Icon: FileText,    desc: "Tax estimates" },
    ],
  },
  {
    label: "INVEST",
    items: [
      { href: "/portfolio",      label: "Portfolio",     Icon: Briefcase,   desc: "Your holdings" },
      { href: "/investments",    label: "Markets",       Icon: Activity,    desc: "Live prices" },
    ],
  },
  {
    label: "PLAN",
    items: [
      { href: "/goals",          label: "Goals",         Icon: Target,      desc: "Savings targets" },
      { href: "/upcoming",       label: "Upcoming",      Icon: Calendar,    desc: "Bills & due dates" },
      { href: "/subscriptions",  label: "Recurring",     Icon: RefreshCw,   desc: "Subscriptions" },
    ],
  },
  {
    label: "LIFE",
    items: [
      { href: "/owing",          label: "Owing",         Icon: Users,       desc: "Shared expenses" },
      { href: "/learn",          label: "Learn",         Icon: BookOpen,    desc: "Finance guides" },
      { href: "/settings",       label: "Settings",      Icon: Settings2,   desc: "Preferences" },
    ],
  },
];

// ── Bottom-nav customisation ──────────────────────────────────────────────────
const NAV_CONFIG_KEY = "ft-bottom-nav-config";
const DEFAULT_NAV_HREFS = ["/", "/accounts", "/transactions", "/budget"];

const NAV_CUSTOMISE_OPTIONS = [
  { href: "/",               label: "Home",      Icon: Home },
  { href: "/accounts",       label: "Accts",     Icon: CreditCard },
  { href: "/transactions",   label: "Txns",      Icon: ArrowLeftRight },
  { href: "/budget",         label: "Budget",    Icon: PieChart },
  { href: "/analytics",      label: "Analytics", Icon: LineChart },
  { href: "/net-worth",      label: "Net Worth", Icon: TrendingUp },
  { href: "/tax",            label: "Tax",       Icon: FileText },
  { href: "/portfolio",      label: "Portfolio", Icon: Briefcase },
  { href: "/investments",    label: "Markets",   Icon: Activity },
  { href: "/goals",          label: "Goals",     Icon: Target },
  { href: "/upcoming",       label: "Upcoming",  Icon: Calendar },
  { href: "/subscriptions",  label: "Recurring", Icon: RefreshCw },
  { href: "/owing",          label: "Owing",     Icon: Users },
  { href: "/learn",          label: "Learn",     Icon: BookOpen },
  { href: "/settings",       label: "Settings",  Icon: Settings2 },
];

function loadNavConfig(): string[] {
  try {
    const raw = localStorage.getItem(NAV_CONFIG_KEY);
    if (!raw) return DEFAULT_NAV_HREFS;
    const parsed = JSON.parse(raw) as string[];
    if (Array.isArray(parsed) && parsed.length === 4 && parsed.every(h => NAV_CUSTOMISE_OPTIONS.some(i => i.href === h)))
      return parsed;
  } catch {}
  return DEFAULT_NAV_HREFS;
}

function saveNavConfig(hrefs: string[]) {
  localStorage.setItem(NAV_CONFIG_KEY, JSON.stringify(hrefs));
}

function MobileBottomNav({ moreOpen, setMoreOpen, onOpenMore }: { moreOpen: boolean; setMoreOpen: (v: boolean) => void; onOpenMore: () => void }) {
  const [loc, setLoc] = useLocation();
  const { navigatePrev, navigateNext, hasPrev, hasNext, currentIdx } = usePageSwipe();
  const isMobileNav = useIsMobile();
  const PAGE_TOTAL = 13;

  const [primaryHrefs, setPrimaryHrefs] = useState<string[]>(() => loadNavConfig());
  const primaryItems = primaryHrefs
    .map(h => NAV_CUSTOMISE_OPTIONS.find(i => i.href === h))
    .filter((i): i is typeof NAV_CUSTOMISE_OPTIONS[0] => !!i);

  const [customiseOpen, setCustomiseOpen] = useState(false);
  const [pendingHrefs, setPendingHrefs] = useState<string[]>([]);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMorePointerDown = () => {
    longPressTimer.current = setTimeout(() => {
      haptic.heavy();
      setPendingHrefs([...primaryHrefs]);
      setCustomiseOpen(true);
    }, 600);
  };

  const handleMorePointerUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const moreActive = MORE_SECTIONS.some(s => s.items.some(i => loc.startsWith(i.href)));

  const NavItem = ({ href, label, Icon: IconComp, active }: { href: string; label: string; Icon: React.ElementType; active: boolean }) => (
    <Link href={href}>
      <span
        onClick={() => haptic.selection()}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          letterSpacing: "0.08em",
          color: active ? "var(--ft-accent)" : "var(--ft-dim)",
          padding: "6px 4px",
          cursor: "pointer",
          transition: "color 0.1s",
          textTransform: "uppercase",
          position: "relative",
          minWidth: 44,
          textAlign: "center",
        }}
      >
        {active && (
          <span style={{
            position: "absolute",
            top: 0,
            left: "50%",
            transform: "translateX(-50%)",
            width: 20,
            height: 2,
            background: "var(--ft-accent)",
            borderRadius: 1,
          }} />
        )}
        <IconComp size={16} strokeWidth={active ? 2.5 : 1.75} />
        {label}
      </span>
    </Link>
  );

  return (
    <>
      <nav className="ft-mobile-nav" aria-label="Mobile navigation">
        {primaryItems.map(item => {
          const active = item.href === "/" ? loc === "/" : loc.startsWith(item.href);
          return <NavItem key={item.href} {...item} active={active} />;
        })}
        {/* More button — tap opens More drawer, long-press opens Customise */}
        <button
          onPointerDown={handleMorePointerDown}
          onPointerUp={handleMorePointerUp}
          onPointerCancel={handleMorePointerUp}
          onClick={() => { haptic.light(); onOpenMore(); setMoreOpen(true); }}
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 4,
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            letterSpacing: "0.08em",
            color: moreActive ? "var(--ft-accent)" : "var(--ft-dim)",
            padding: "6px 4px",
            cursor: "pointer",
            transition: "color 0.1s",
            textTransform: "uppercase",
            position: "relative",
            minWidth: 44,
            background: "none",
            border: "none",
          }}
        >
          {moreActive && (
            <span style={{
              position: "absolute",
              top: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: 20,
              height: 2,
              background: "var(--ft-accent)",
              borderRadius: 1,
            }} />
          )}
          <Grid3X3 size={16} strokeWidth={moreActive ? 2.5 : 1.75} />
          More
        </button>
      </nav>

      {/* More pages sheet */}
      <Drawer open={moreOpen} onOpenChange={setMoreOpen}>
        <DrawerContent
          style={{
            background: "var(--ft-surface)",
            borderColor: "var(--ft-border)",
            borderTop: "1px solid var(--ft-border2)",
            maxHeight: "80dvh",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Handle */}
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, paddingBottom: 4 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--ft-border2)" }} />
          </div>
          <DrawerHeader style={{ padding: "6px 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <DrawerTitle
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ft-text)",
              }}
            >
              ALL PAGES
            </DrawerTitle>
            <button
              onClick={() => setMoreOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-dim)", padding: 4 }}
            >
              <X size={14} />
            </button>
          </DrawerHeader>
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 16px 24px", WebkitOverflowScrolling: "touch" as const }}>
            {MORE_SECTIONS.map(section => (
              <div key={section.label} style={{ marginBottom: 20 }}>
                <div style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: "var(--ft-dim)",
                  textTransform: "uppercase",
                  marginBottom: 8,
                  paddingBottom: 4,
                  borderBottom: "1px solid var(--ft-border)",
                }}>
                  {section.label}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {section.items.map(item => {
                    const active = loc.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => { haptic.selection(); setMoreOpen(false); }}
                      >
                        <div style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 4,
                          padding: "10px 6px",
                          borderRadius: 8,
                          background: active ? `var(--ft-accent)18` : "var(--ft-raised)",
                          border: `1px solid ${active ? "var(--ft-accent)44" : "var(--ft-border)"}`,
                          cursor: "pointer",
                          transition: "all 0.1s",
                        }}>
                          <item.Icon
                            size={20}
                            strokeWidth={active ? 2.5 : 1.75}
                            color={active ? "var(--ft-accent)" : "var(--ft-text)"}
                          />
                          <span style={{
                            fontFamily: "var(--font-mono)",
                            fontSize: 9,
                            fontWeight: 600,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            color: active ? "var(--ft-accent)" : "var(--ft-text)",
                            textAlign: "center",
                          }}>
                            {item.label}
                          </span>
                          {"desc" in item && item.desc && (
                            <span style={{
                              fontFamily: "var(--font-mono)",
                              fontSize: 7,
                              color: active ? "var(--ft-accent)" : "var(--ft-muted)",
                              textAlign: "center",
                              letterSpacing: "0.04em",
                              lineHeight: 1.3,
                            }}>
                              {item.desc}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            {/* Customise entry point */}
            <button
              onClick={() => { setPendingHrefs([...primaryHrefs]); setMoreOpen(false); setCustomiseOpen(true); }}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                padding: "10px 12px",
                borderRadius: 8,
                background: "var(--ft-raised)",
                border: "1px solid var(--ft-border)",
                color: "var(--ft-dim)",
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                cursor: "pointer",
                marginTop: 4,
              }}
            >
              <Settings2 size={13} strokeWidth={1.75} />
              Customise tabs
            </button>
          </div>
        </DrawerContent>
      </Drawer>

      {/* Nav customise sheet */}
      <Drawer open={customiseOpen} onOpenChange={setCustomiseOpen}>
        <DrawerContent style={{
          background: "var(--ft-surface)",
          borderColor: "var(--ft-border)",
          borderTop: "1px solid var(--ft-border2)",
          maxHeight: "88dvh",
          display: "flex",
          flexDirection: "column",
        }}>
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 8, paddingBottom: 4 }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: "var(--ft-border2)" }} />
          </div>
          <DrawerHeader style={{ padding: "6px 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <DrawerTitle style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "var(--ft-text)",
              }}>
                CUSTOMISE TABS
              </DrawerTitle>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--ft-dim)", marginTop: 2 }}>
                CHOOSE 4 — HOLD MORE TO REOPEN
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                fontWeight: 700,
                color: pendingHrefs.length === 4 ? "var(--ft-accent)" : "var(--ft-dim)",
              }}>
                {pendingHrefs.length}/4
              </span>
              <button
                onClick={() => setCustomiseOpen(false)}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ft-dim)", padding: 4 }}
              >
                <X size={14} />
              </button>
            </div>
          </DrawerHeader>
          <div style={{ overflowY: "auto", flex: 1, padding: "4px 16px 12px", WebkitOverflowScrolling: "touch" as const }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {NAV_CUSTOMISE_OPTIONS.map(item => {
                const selected = pendingHrefs.includes(item.href);
                const disabled = !selected && pendingHrefs.length >= 4;
                return (
                  <button
                    key={item.href}
                    onClick={() => {
                      haptic.selection();
                      if (selected) {
                        setPendingHrefs(prev => prev.filter(h => h !== item.href));
                      } else if (pendingHrefs.length < 4) {
                        setPendingHrefs(prev => [...prev, item.href]);
                      }
                    }}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: 6,
                      padding: "12px 8px",
                      borderRadius: 8,
                      background: selected ? `var(--ft-accent)18` : "var(--ft-raised)",
                      border: `1px solid ${selected ? "var(--ft-accent)" : "var(--ft-border)"}`,
                      cursor: disabled ? "default" : "pointer",
                      opacity: disabled ? 0.35 : 1,
                      transition: "all 0.1s",
                    }}
                  >
                    <item.Icon
                      size={20}
                      strokeWidth={selected ? 2.5 : 1.75}
                      color={selected ? "var(--ft-accent)" : "var(--ft-text)"}
                    />
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 600,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      color: selected ? "var(--ft-accent)" : "var(--ft-text)",
                      textAlign: "center",
                    }}>
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ padding: "12px 16px 24px", borderTop: "1px solid var(--ft-border)" }}>
            <button
              disabled={pendingHrefs.length !== 4}
              onClick={() => {
                saveNavConfig(pendingHrefs);
                setPrimaryHrefs(pendingHrefs);
                haptic.heavy();
                setCustomiseOpen(false);
              }}
              style={{
                width: "100%",
                padding: "11px 16px",
                borderRadius: 8,
                background: pendingHrefs.length === 4 ? "var(--ft-accent)" : "var(--ft-raised)",
                border: `1px solid ${pendingHrefs.length === 4 ? "var(--ft-accent)" : "var(--ft-border)"}`,
                color: pendingHrefs.length === 4 ? "#000" : "var(--ft-dim)",
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase" as const,
                cursor: pendingHrefs.length === 4 ? "pointer" : "not-allowed",
                transition: "all 0.15s",
              }}
            >
              SAVE TABS
            </button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}
